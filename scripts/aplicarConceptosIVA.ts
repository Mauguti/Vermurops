/**
 * Script para aplicar las reglas de IVA de los 15 conceptos que Vermur definió
 * el 30-sep-2026.
 *
 * Uso:
 *   SERVICE_ACCOUNT=ruta/a/llave.json npx tsx scripts/aplicarConceptosIVA.ts
 *     → modo seco: imprime los cambios sin escribir nada.
 *
 *   SERVICE_ACCOUNT=ruta/a/llave.json npx tsx scripts/aplicarConceptosIVA.ts --aplicar
 *     → escribe los cambios en Firestore y genera el respaldo.
 *
 * Contra emuladores (prueba local):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/aplicarConceptosIVA.ts
 *
 * Sin SERVICE_ACCOUNT ni emulador, falla limpio.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ConceptoEntrada {
  id: string;
  nombreNuevo: string;
  nombreMagaya: string;
  impoOrigen: string;
  impoDestino: string;
  expoOrigen: string;
  expoDestino: string;
  reglaIVA: string;
  nota: string | null;
}

interface ArchivoEntrada {
  fuente: string;
  conceptos: ConceptoEntrada[];
}

interface ConceptoFirestore {
  id: string;
  nombre: string;
  nombreOriginal: string;
  reglaIVA: string;
  notaIVA: string;
  [key: string]: unknown;
}

interface CambioConcepto {
  id: string;
  campo: string;
  antes: string;
  despues: string;
}

interface Respaldo {
  fecha: string;
  script: string;
  conceptos: Record<string, { nombre: string; reglaIVA: string; notaIVA: string }>;
  comandoRevertir: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const REGLAS_VALIDAS = ['espejo', 'aereo_split', 'terrestre_retencion', 'exento', 'fijo16', 'fijo0', 'revisar'];

const NOTA_POR_REGLA: Record<string, string> = {
  espejo: 'IVA derivado: 16% donde el servicio ocurre en Mexico (Impo+Destino / Expo+Origen), 0% en el extranjero',
  fijo16: 'Siempre 16% (servicio nacional)',
  fijo0: 'Siempre 0% / no objeto (servicio internacional)',
  exento: 'Siempre 0% / no objeto',
  aereo_split: 'Tasa efectiva 4%: se divide 25% al 16% + 75% al 0% (el SAT no admite 4% directo)',
  terrestre_retencion: '16% de IVA mas retencion del 4% (flete terrestre nacional)',
  revisar: 'Por confirmar con Administracion',
};

/** Los tres conceptos con confirmaciones pendientes con Julio. */
const PENDIENTES_JULIO = new Set(['CON-019', 'CON-022', 'CON-081']);

// ─── Inicialización ───────────────────────────────────────────────────────────

function inicializarFirestore() {
  const emulador = process.env.FIRESTORE_EMULATOR_HOST;
  const saPath = process.env.SERVICE_ACCOUNT;

  if (emulador) {
    console.log(`🔌 Conectando al emulador: ${emulador}`);
    initializeApp({ projectId: 'vermur-logistics-app' });
  } else if (saPath) {
    if (!existsSync(saPath)) {
      console.error(`❌ No se encontró la llave de servicio: ${saPath}`);
      process.exit(1);
    }
    const sa = JSON.parse(readFileSync(saPath, 'utf-8')) as ServiceAccount;
    console.log(`🔑 Conectando con llave de servicio`);
    initializeApp({ credential: cert(sa) });
  } else {
    console.error('❌ Se necesita SERVICE_ACCOUNT=ruta/a/llave.json o FIRESTORE_EMULATOR_HOST=host:puerto');
    console.error('   Sin credenciales no se puede conectar a Firestore.');
    process.exit(1);
  }

  return getFirestore();
}

// ─── Lógica principal ─────────────────────────────────────────────────────────

function cambioDeNombre(actual: string, nuevo: string): boolean {
  return actual.toLowerCase().trim() !== nuevo.toLowerCase().trim();
}

/**
 * Evalúa si un cambio de nombre es seguro para el matching.
 * El matching usa `nombreOriginal` (Magaya) como fallback, así que cambiar
 * solo `nombre` es seguro siempre que `nombreOriginal` se conserve.
 */
function evaluarRiesgoNombre(
  id: string,
  nombreActual: string,
  nombreNuevo: string,
  nombreOriginal: string,
): { seguro: boolean; razon: string } {
  // Si no cambia, no hay riesgo
  if (!cambioDeNombre(nombreActual, nombreNuevo)) {
    return { seguro: true, razon: 'sin cambio' };
  }

  // nombreOriginal se conserva → el matching por Magaya sigue funcionando
  // El viejo `nombre` ya no matchea en paso 1, pero matchea en paso 2 vía
  // `nombreOriginal`. Los nuevos documentos con el nombre nuevo matchean en paso 1.
  return {
    seguro: true,
    razon: `nombre cambia de "${nombreActual}" a "${nombreNuevo}"; ` +
           `nombreOriginal "${nombreOriginal}" se conserva para matching`,
  };
}

async function main() {
  const aplicar = process.argv.includes('--aplicar');

  // Leer entrada
  const archivoEntrada = resolve(__dirname, '../docs/datos/conceptos-iva-vermur-30sep.json');
  if (!existsSync(archivoEntrada)) {
    console.error(`❌ No se encontró: ${archivoEntrada}`);
    process.exit(1);
  }
  const entrada: ArchivoEntrada = JSON.parse(readFileSync(archivoEntrada, 'utf-8'));
  console.log(`📄 Fuente: ${entrada.fuente}`);
  console.log(`📋 Conceptos a procesar: ${entrada.conceptos.length}\n`);

  // Validar reglas
  for (const c of entrada.conceptos) {
    if (!REGLAS_VALIDAS.includes(c.reglaIVA)) {
      console.error(`❌ ${c.id}: reglaIVA "${c.reglaIVA}" no es válida. Válidas: ${REGLAS_VALIDAS.join(', ')}`);
      process.exit(1);
    }
  }

  // Conectar a Firestore
  const db = inicializarFirestore();
  const colConceptos = db.collection('conceptos');

  // Leer estado actual de los 15 conceptos
  const cambios: CambioConcepto[] = [];
  const respaldo: Respaldo = {
    fecha: new Date().toISOString(),
    script: 'scripts/aplicarConceptosIVA.ts',
    conceptos: {},
    comandoRevertir: 'SERVICE_ACCOUNT=ruta/a/llave.json npx tsx scripts/revertirConceptosIVA.ts respaldo-conceptos-iva-FECHA.json',
  };

  const conNombreCambiado: { id: string; antes: string; despues: string; seguro: boolean; razon: string }[] = [];
  const sinCambios: string[] = [];

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(aplicar ? '  MODO APLICAR — se escribirán los cambios' : '  MODO SECO — solo lectura, nada se modifica');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const ce of entrada.conceptos) {
    const docRef = colConceptos.doc(ce.id);
    const snap = await docRef.get();

    if (!snap.exists) {
      console.log(`⚠️  ${ce.id}: no existe en Firestore — se omite`);
      continue;
    }

    const actual = snap.data() as ConceptoFirestore;
    const notaNueva = NOTA_POR_REGLA[ce.reglaIVA] ?? 'Por confirmar con Administracion';
    const cambiosConcepto: CambioConcepto[] = [];

    // Guardar respaldo
    respaldo.conceptos[ce.id] = {
      nombre: actual.nombre,
      reglaIVA: actual.reglaIVA,
      notaIVA: actual.notaIVA,
    };

    // Evaluar cambio de reglaIVA
    if (actual.reglaIVA !== ce.reglaIVA) {
      cambiosConcepto.push({
        id: ce.id,
        campo: 'reglaIVA',
        antes: actual.reglaIVA,
        despues: ce.reglaIVA,
      });
    }

    // Evaluar cambio de notaIVA
    if (actual.notaIVA !== notaNueva) {
      cambiosConcepto.push({
        id: ce.id,
        campo: 'notaIVA',
        antes: actual.notaIVA,
        despues: notaNueva,
      });
    }

    // Evaluar cambio de nombre
    if (cambioDeNombre(actual.nombre, ce.nombreNuevo)) {
      const riesgo = evaluarRiesgoNombre(ce.id, actual.nombre, ce.nombreNuevo, actual.nombreOriginal);
      conNombreCambiado.push({
        id: ce.id,
        antes: actual.nombre,
        despues: ce.nombreNuevo,
        seguro: riesgo.seguro,
        razon: riesgo.razon,
      });

      cambiosConcepto.push({
        id: ce.id,
        campo: 'nombre',
        antes: actual.nombre,
        despues: ce.nombreNuevo,
      });
    }

    if (cambiosConcepto.length === 0) {
      sinCambios.push(ce.id);
      continue;
    }

    // Mostrar cambios
    console.log(`── ${ce.id} (${actual.nombre}) ──`);
    for (const c of cambiosConcepto) {
      console.log(`   ${c.campo}: "${c.antes}" → "${c.despues}"`);
    }
    if (ce.nota) {
      console.log(`   📝 ${ce.nota}`);
    }
    console.log();

    cambios.push(...cambiosConcepto);
  }

  // Resumen
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Resumen: ${cambios.length} cambios en ${entrada.conceptos.length - sinCambios.length} conceptos`);
  if (sinCambios.length > 0) {
    console.log(`  Sin cambios: ${sinCambios.join(', ')}`);
  }
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Cambios de nombre
  if (conNombreCambiado.length > 0) {
    console.log('── Cambios de nombre ──');
    for (const cn of conNombreCambiado) {
      const icono = cn.seguro ? '✅' : '⛔';
      console.log(`  ${icono} ${cn.id}: "${cn.antes}" → "${cn.despues}"`);
      console.log(`     ${cn.razon}`);
    }
    console.log();
  }

  // Confirmaciones pendientes con Julio
  const pendientes = entrada.conceptos.filter(c => PENDIENTES_JULIO.has(c.id));
  if (pendientes.length > 0) {
    console.log('── ⚠️  Confirmaciones pendientes con Julio ──');
    for (const p of pendientes) {
      console.log(`  ${p.id} (${p.nombreNuevo}): ${p.nota}`);
    }
    console.log('  → Se aplican tal como vinieron; confirmar con Julio y ajustar si difiere.');
    console.log();
  }

  // Aplicar o mostrar instrucciones
  if (!aplicar) {
    console.log('ℹ️  Modo seco. Para aplicar:');
    console.log('   SERVICE_ACCOUNT=ruta/a/llave.json npx tsx scripts/aplicarConceptosIVA.ts --aplicar\n');
    return;
  }

  // Verificar que no haya nombres inseguros
  const inseguros = conNombreCambiado.filter(cn => !cn.seguro);
  if (inseguros.length > 0) {
    console.log('⛔ Hay cambios de nombre que pueden romper el matching:');
    inseguros.forEach(cn => console.log(`   ${cn.id}: ${cn.razon}`));
    console.log('   No se aplica ningún cambio. Revisa y vuelve a correr.\n');
    process.exit(1);
  }

  // Escribir respaldo
  const fechaCorta = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archivoRespaldo = resolve(dirname(archivoEntrada), `respaldo-conceptos-iva-${fechaCorta}.json`);
  respaldo.comandoRevertir = `SERVICE_ACCOUNT=ruta/a/llave.json npx tsx scripts/revertirConceptosIVA.ts ${archivoRespaldo}`;
  writeFileSync(archivoRespaldo, JSON.stringify(respaldo, null, 2), 'utf-8');
  console.log(`💾 Respaldo guardado: ${archivoRespaldo}`);
  console.log(`   Para revertir: ${respaldo.comandoRevertir}\n`);

  // Aplicar cambios
  let aplicados = 0;
  let errores = 0;

  for (const ce of entrada.conceptos) {
    const docRef = colConceptos.doc(ce.id);
    const snap = await docRef.get();
    if (!snap.exists) continue;

    const actual = snap.data() as ConceptoFirestore;
    const notaNueva = NOTA_POR_REGLA[ce.reglaIVA] ?? 'Por confirmar con Administracion';

    const update: Record<string, string> = {};

    if (actual.reglaIVA !== ce.reglaIVA) {
      update.reglaIVA = ce.reglaIVA;
    }
    if (actual.notaIVA !== notaNueva) {
      update.notaIVA = notaNueva;
    }
    if (cambioDeNombre(actual.nombre, ce.nombreNuevo)) {
      update.nombre = ce.nombreNuevo;
    }

    if (Object.keys(update).length === 0) continue;

    update.updatedAt = new Date().toISOString();

    try {
      await docRef.update(update);
      console.log(`  ✅ ${ce.id} actualizado (${Object.keys(update).filter(k => k !== 'updatedAt').join(', ')})`);
      aplicados++;
    } catch (err) {
      console.error(`  ❌ ${ce.id}: ${err instanceof Error ? err.message : err}`);
      errores++;
    }
  }

  console.log(`\n✅ Aplicados: ${aplicados} | ❌ Errores: ${errores}`);
  if (errores > 0) process.exit(1);
}

main().catch(err => {
  console.error('Error fatal:', err.message ?? err);
  process.exit(1);
});
