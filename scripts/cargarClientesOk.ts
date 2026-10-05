/**
 * cargarClientesOk.ts — carga la lista «Clientes OK» de Luis sobre la base de
 * clientes de VermurOps (tarea 65, 5-oct-2026).
 *
 * EN SECO POR DEFECTO. Sin `--aplicar` no escribe ni un campo.
 *
 * Uso:
 *   # 1. Inventario de columnas, sin tocar la base ni pedir credenciales
 *   npx tsx scripts/cargarClientesOk.ts --archivo lista.csv --columnas
 *
 *   # 2. En seco contra producción: qué haría, renglón por renglón
 *   SERVICE_ACCOUNT=ruta/a/llave.json npx tsx scripts/cargarClientesOk.ts --archivo lista.csv
 *
 *   # 3. Aplicar (genera respaldo y el comando de reversa)
 *   SERVICE_ACCOUNT=ruta/a/llave.json npx tsx scripts/cargarClientesOk.ts --archivo lista.csv --aplicar
 *
 *   # Contra emuladores, para probarlo sin tocar producción
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/cargarClientesOk.ts --archivo lista.csv
 *
 * Banderas:
 *   --archivo <ruta>   CSV / TSV de la lista. Obligatoria.
 *   --columnas         Solo inventaría las columnas del archivo y sale.
 *   --aplicar          Escribe. Sin ella, nada se escribe.
 *   --detalle          Imprime los renglones «igual» y «sin dato» también.
 *   --limite <n>       Procesa solo los primeros n renglones (para probar).
 *   --salida <ruta>    Guarda el informe completo en CSV.
 *
 * Qué escribe, y nada más: rfc, codigoPostal, regimenFiscal,
 * diasCreditoPorTipo.{maritimo,aereo,terrestre,general}, dias,
 * responsableVentas y la marca origenDatos: 'magaya'.
 *
 * Qué NO hace: no crea clientes, no borra, no desactiva, no pisa un valor ya
 * capturado y no escribe `numeroEntidadMagaya` (ese campo decide el freno de
 * expediente de §4.18).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, extname, dirname } from 'path';
import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  parsearCSV,
  resolverMapeo,
  leerRenglones,
  indexarBase,
  indexarUsuarios,
  empatar,
  planearRenglon,
  resumir,
  clientesConVariosRenglones,
  updateDePlan,
  completarDiasCredito,
  normalizarEncabezado,
  ALIAS_COLUMNA,
  ETIQUETA_LLAVE,
  type ClienteBase,
  type PlanRenglon,
  type CampoLista,
} from '../src/lib/cargaClientesOk';

// ─── Argumentos ──────────────────────────────────────────────────────────────

function bandera(nombre: string): boolean {
  return process.argv.includes(`--${nombre}`);
}
function valor(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const ARCHIVO = valor('archivo');
const SOLO_COLUMNAS = bandera('columnas');
const APLICAR = bandera('aplicar');
const DETALLE = bandera('detalle');
const LIMITE = valor('limite') ? parseInt(valor('limite')!, 10) : undefined;
const SALIDA = valor('salida');

/**
 * Correos del equipo, espejo del mapa de `AuthContext.tsx`.
 *
 * El script no puede importar ese módulo (arrastra el SDK de Firebase del
 * navegador), y los usuarios reales viven en `usuarios/{uid}`, que es de donde
 * se leen primero. Esta lista es el respaldo para cuando la colección todavía
 * no tiene a todo el equipo: sin ella, un «Itzel Laurean» en la lista de Luis
 * se reportaría como responsable sin empate.
 */
const EQUIPO_RESPALDO = [
  { email: 'itzel.laurean@vermur.com', nombre: 'Itzel Laurean' },
  { email: 'nohema.sosa@vermur.com', nombre: 'Nohema Sosa' },
  { email: 'julio.gutierrez@vermur.com', nombre: 'Julio Gutierrez' },
  { email: 'angel.luna@vermur.com', nombre: 'Angel Luna' },
  { email: 'gabriela.huerta@vermur.com', nombre: 'Gabriela Huerta' },
  { email: 'luis.renteria@vermur.com', nombre: 'Luis Renteria' },
];

// ─── Respaldo ────────────────────────────────────────────────────────────────

/**
 * Un campo del respaldo. `presente: false` significa que el documento no
 * tenía el campo, y la reversa lo BORRA en vez de dejarlo en null: un `rfc:
 * null` escrito donde no había nada se ve igual en pantalla pero cambia lo
 * que `vacio()` y `estadoFiscal` leen después.
 */
interface CampoRespaldo {
  presente: boolean;
  valor: unknown;
}

interface DocRespaldo {
  coleccion: 'clientes';
  id: string;
  nombre: string;
  antes: Record<string, CampoRespaldo>;
}

export interface ArchivoRespaldo {
  fecha: string;
  script: string;
  archivoFuente: string;
  comandoRevertir: string;
  documentos: DocRespaldo[];
}

/** Lee una ruta con punto del documento. */
function leerRuta(doc: Record<string, unknown>, ruta: string): CampoRespaldo {
  const partes = ruta.split('.');
  let actual: unknown = doc;
  for (const p of partes) {
    if (actual === null || typeof actual !== 'object' || !(p in (actual as object))) {
      return { presente: false, valor: null };
    }
    actual = (actual as Record<string, unknown>)[p];
  }
  return { presente: true, valor: actual ?? null };
}

// ─── Firestore ───────────────────────────────────────────────────────────────

function inicializarFirestore() {
  const emulador = process.env.FIRESTORE_EMULATOR_HOST;
  const saPath = process.env.SERVICE_ACCOUNT;

  if (emulador) {
    console.log(`🔌 Emulador: ${emulador}`);
    initializeApp({ projectId: 'vermur-logistics-app' });
  } else if (saPath) {
    if (!existsSync(saPath)) {
      console.error(`❌ No se encontró la llave de servicio: ${saPath}`);
      process.exit(1);
    }
    const sa = JSON.parse(readFileSync(saPath, 'utf-8')) as ServiceAccount;
    console.log('🔑 Llave de servicio (PRODUCCIÓN)');
    initializeApp({ credential: cert(sa) });
  } else {
    console.error('❌ Se necesita SERVICE_ACCOUNT=ruta/a/llave.json o FIRESTORE_EMULATOR_HOST=host:puerto.');
    console.error('   Sin credenciales no se puede leer la base. El script no inventa datos.');
    process.exit(1);
  }
  return getFirestore();
}

// ─── Lectura del archivo ─────────────────────────────────────────────────────

function leerArchivo(ruta: string): string[][] {
  const ext = extname(ruta).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    console.error(`❌ «${ruta}» es un Excel y este script lee texto delimitado.`);
    console.error('   Ábrelo y guárdalo como «CSV UTF-8 (delimitado por comas)», o');
    console.error('   exporta la hoja a CSV; el script detecta solo si quedó con comas,');
    console.error('   punto y coma o tabuladores.');
    process.exit(1);
  }
  if (!existsSync(ruta)) {
    console.error(`❌ No se encontró el archivo: ${ruta}`);
    process.exit(1);
  }
  const celdas = parsearCSV(readFileSync(ruta, 'utf-8'));
  if (celdas.length === 0) {
    console.error('❌ El archivo está vacío.');
    process.exit(1);
  }
  return celdas;
}

const ETIQUETA_CAMPO: Record<CampoLista, string> = {
  numeroEntidad: 'Número de entidad de Magaya',
  nombre: 'Nombre / razón social',
  rfc: 'RFC',
  codigoPostal: 'Código postal',
  regimenFiscal: 'Régimen fiscal',
  responsableVentas: 'Responsable de ventas',
  diasGeneral: 'Días de crédito (general)',
  diasMaritimo: 'Días de crédito marítimo',
  diasAereo: 'Días de crédito aéreo',
  diasTerrestre: 'Días de crédito terrestre',
};

function imprimirColumnas(encabezados: string[]) {
  const mapeo = resolverMapeo(encabezados);
  console.log('── Columnas del archivo ──');
  encabezados.forEach((h, i) => {
    const campo = (Object.entries(mapeo.porCampo) as [CampoLista, number][])
      .find(([, idx]) => idx === i)?.[0];
    const destino = campo ? `→ ${ETIQUETA_CAMPO[campo]}` : '  (ignorada)';
    console.log(`  ${String(i).padStart(2)}  «${h}»  ${destino}`);
  });
  console.log();

  const sinColumna = (Object.keys(ALIAS_COLUMNA) as CampoLista[])
    .filter(c => mapeo.porCampo[c] === undefined);
  if (sinColumna.length > 0) {
    console.log('── Campos que la lista no trae ──');
    sinColumna.forEach(c => console.log(`  ${ETIQUETA_CAMPO[c]}`));
    console.log();
  }
  if (mapeo.faltantes.length > 0) {
    console.log('⛔ Faltan columnas indispensables: ' + mapeo.faltantes.map(c => ETIQUETA_CAMPO[c]).join(', '));
    console.log('   Si la lista las trae con otro encabezado, agrégalo a ALIAS_COLUMNA');
    console.log('   en src/lib/cargaClientesOk.ts — es el único lugar que hay que editar.');
    console.log(`   Encabezados normalizados del archivo: ${encabezados.map(normalizarEncabezado).join(', ')}`);
  }
  return mapeo;
}

// ─── Informe ─────────────────────────────────────────────────────────────────

function imprimirPlanes(planes: PlanRenglon[]) {
  for (const p of planes) {
    const e = p.empate;
    if (e.resultado !== 'empatado') continue;
    const escribe = p.cambios.filter(c => c.accion === 'escribe');
    const conflicto = p.cambios.filter(c => c.accion === 'conflicto');
    const invalido = p.cambios.filter(c => c.accion === 'invalido');
    if (escribe.length === 0 && conflicto.length === 0 && invalido.length === 0 && !DETALLE) continue;

    console.log(`── línea ${p.renglon.linea} · ${e.cliente!.id} «${e.cliente!.nombre}» (empate por ${ETIQUETA_LLAVE[e.llave!]}) ──`);
    for (const c of escribe) console.log(`   ✅ ${c.etiqueta}: ${JSON.stringify(c.antes)} → ${JSON.stringify(c.despues)}`);
    for (const c of conflicto) console.log(`   ⚠️  ${c.etiqueta}: ${c.razon}`);
    for (const c of invalido) console.log(`   ⛔ ${c.etiqueta}: ${c.razon}`);
    if (DETALLE) {
      for (const c of p.cambios.filter(x => x.accion === 'igual')) console.log(`   ·  ${c.etiqueta}: igual`);
      for (const c of p.cambios.filter(x => x.accion === 'sin_dato')) console.log(`   ·  ${c.etiqueta}: la lista no lo trae`);
    }
    for (const a of p.avisos) console.log(`   ℹ️  ${a}`);
    console.log();
  }
}

function imprimirSinEmpate(planes: PlanRenglon[]) {
  const nuevos = planes.filter(p => p.empate.resultado === 'nuevo');
  const ambiguos = planes.filter(p => p.empate.resultado === 'ambiguo');
  const sinLlave = planes.filter(p => p.empate.resultado === 'sin_llave');

  if (nuevos.length > 0) {
    console.log(`── ${nuevos.length} renglones de la lista que NO existen en VermurOps ──`);
    console.log('   El script no crea clientes. Julio decide si se dan de alta.');
    nuevos.slice(0, 40).forEach(p => console.log(`   línea ${p.renglon.linea}: «${p.renglon.nombre}» (RFC ${p.renglon.rfc || '—'})`));
    if (nuevos.length > 40) console.log(`   … y ${nuevos.length - 40} más (ver --salida)`);
    console.log();
  }
  if (ambiguos.length > 0) {
    console.log(`── ${ambiguos.length} renglones AMBIGUOS (no se escribe nada) ──`);
    ambiguos.forEach(p => console.log(`   línea ${p.renglon.linea}: «${p.renglon.nombre}» · ${p.empate.razon} → ${p.empate.candidatos?.join(', ')}`));
    console.log();
  }
  if (sinLlave.length > 0) {
    console.log(`── ${sinLlave.length} renglones sin nombre, RFC ni número de entidad ──`);
    sinLlave.forEach(p => console.log(`   línea ${p.renglon.linea}`));
    console.log();
  }
}

function escribirCSV(ruta: string, planes: PlanRenglon[], ausentes: ClienteBase[]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = ['linea,resultado,llave,clienteId,clienteNombre,nombreEnLista,campo,accion,antes,despues,razon'];
  for (const p of planes) {
    const base = [p.renglon.linea, p.empate.resultado, p.empate.llave ?? '', p.empate.cliente?.id ?? '', p.empate.cliente?.nombre ?? '', p.renglon.nombre];
    if (p.cambios.length === 0) {
      lineas.push([...base, '', '', '', '', p.empate.razon ?? ''].map(esc).join(','));
      continue;
    }
    for (const c of p.cambios) {
      if (!DETALLE && (c.accion === 'igual' || c.accion === 'sin_dato')) continue;
      lineas.push([...base, c.campo, c.accion, c.antes, c.despues ?? '', c.razon ?? ''].map(esc).join(','));
    }
  }
  for (const c of ausentes) {
    lineas.push(['', 'ausente_de_la_lista', '', c.id, c.nombre, '', '', '', '', '', 'La lista no lo menciona. No se tocó.'].map(esc).join(','));
  }
  mkdirSync(dirname(resolve(ruta)), { recursive: true });
  writeFileSync(ruta, lineas.join('\n') + '\n', 'utf-8');
  console.log(`📄 Informe completo: ${ruta}`);
}

// ─── Principal ───────────────────────────────────────────────────────────────

async function main() {
  if (!ARCHIVO) {
    console.error('Uso: npx tsx scripts/cargarClientesOk.ts --archivo <lista.csv> [--columnas] [--aplicar]');
    process.exit(1);
  }

  const celdas = leerArchivo(ARCHIVO);
  console.log(`📄 ${ARCHIVO} — ${celdas.length - 1} renglones de datos\n`);
  const mapeo = imprimirColumnas(celdas[0]);
  if (mapeo.faltantes.length > 0) process.exit(1);
  if (SOLO_COLUMNAS) return;

  let renglones = leerRenglones(celdas, mapeo);
  if (LIMITE !== undefined) renglones = renglones.slice(0, LIMITE);

  const db = inicializarFirestore();

  // ── Base de clientes ──
  const snap = await db.collection('clientes').get();
  const base: ClienteBase[] = snap.docs.map(d => {
    const x = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      nombre: String(x.nombre ?? ''),
      rfc: (x.rfc as string) ?? null,
      codigoPostal: (x.codigoPostal as string) ?? null,
      regimenFiscal: (x.regimenFiscal as string) ?? null,
      responsableVentas: (x.responsableVentas as string) ?? null,
      referenciaMagaya: (x.referenciaMagaya as string) ?? null,
      numeroEntidadMagaya: (x.numeroEntidadMagaya as string) ?? null,
      origenDatos: (x.origenDatos as string) ?? null,
      dias: typeof x.dias === 'number' ? x.dias : null,
      diasCreditoPorTipo: (x.diasCreditoPorTipo as ClienteBase['diasCreditoPorTipo']) ?? null,
    };
  });
  console.log(`👥 ${base.length} clientes en la base\n`);

  // ── Usuarios de la plataforma ──
  let usuariosLeidos: { email: string; nombre?: string | null }[] = [];
  try {
    const us = await db.collection('usuarios').get();
    usuariosLeidos = us.docs.map(d => {
      const u = d.data() as Record<string, unknown>;
      return { email: String(u.email ?? ''), nombre: (u.nombre as string) ?? null };
    }).filter(u => u.email);
  } catch {
    // La colección puede no existir todavía: se usa el respaldo.
  }
  const correosLeidos = new Set(usuariosLeidos.map(u => u.email.toLowerCase()));
  const usuarios = indexarUsuarios([
    ...usuariosLeidos,
    ...EQUIPO_RESPALDO.filter(u => !correosLeidos.has(u.email)),
  ]);
  console.log(`🧑‍💼 ${usuariosLeidos.length} usuarios en «usuarios/», ${usuarios.correos.length} correos para empatar responsables\n`);

  // ── Plan ──
  const indice = indexarBase(base);
  const planes = renglones.map(r => planearRenglon(r, empatar(r, indice), usuarios));
  const res = resumir(planes, base);

  imprimirPlanes(planes);
  imprimirSinEmpate(planes);

  /*
   * Dos renglones sobre el mismo cliente no se escriben.
   *
   * Cuál de los dos vale es la decisión que Luis ya tomó al mandar «Clientes
   * OK» en vez de la otra lista; si aun así quedaron dos, resolverlo es de
   * Julio. Escribir los dos dejaría el valor del último renglón del archivo
   * y nadie sabría que hubo otro.
   */
  const duplicados = clientesConVariosRenglones(planes);
  const idsDuplicados = new Set(duplicados.map(d => d.clienteId));
  if (duplicados.length > 0) {
    console.log(`── ${duplicados.length} clientes que la lista menciona más de una vez (NO se escriben) ──`);
    duplicados.forEach(d => console.log(`   ${d.clienteId} «${d.nombre}»: líneas ${d.lineas.join(', ')}`));
    console.log();
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Renglones de la lista:        ${res.renglones}`);
  console.log(`  Empatados:                    ${res.empatados}  (por número de entidad ${res.porLlave.numeroEntidad} · por RFC ${res.porLlave.rfc} · por nombre ${res.porLlave.nombre})`);
  console.log(`  Nuevos (no están en la base): ${res.nuevos}`);
  console.log(`  Sin empate (ambiguos o sin llave): ${res.sinEmpate}`);
  const aEscribir = planes.filter(p =>
    p.empate.cliente
    && !idsDuplicados.has(p.empate.cliente.id)
    && Object.keys(updateDePlan(p)).length > 0,
  );
  const camposAEscribir = aEscribir.reduce((n, p) => n + Object.keys(updateDePlan(p)).length, 0);
  console.log(`  Clientes con algo que escribir: ${res.clientesConCambios}  (${duplicados.length} excluidos por repetirse)`);
  console.log(`  Clientes que se escribirían:  ${new Set(aEscribir.map(p => p.empate.cliente!.id)).size}`);
  console.log(`  Campos que se escribirían:    ${camposAEscribir}  (de ${res.camposAEscribir} propuestos)`);
  console.log(`  Conflictos (no se pisan):     ${res.conflictos}`);
  console.log(`  Valores inválidos:            ${res.invalidos}`);
  console.log(`  Clientes ausentes de la lista: ${res.ausentesDeLaLista.length}  (no se tocan; se listan para Julio)`);
  console.log(`  Clientes repetidos en la lista: ${duplicados.length}  (no se escriben)`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (SALIDA) {
    const ausentes = base.filter(c => res.ausentesDeLaLista.includes(c.id));
    escribirCSV(SALIDA, planes, ausentes);
  }

  if (!APLICAR) {
    console.log('ℹ️  Modo seco: no se escribió nada. Para aplicar, agrega --aplicar.\n');
    return;
  }

  // ── Aplicar ──
  const conCambios = planes.filter(p =>
    p.empate.cliente
    && !idsDuplicados.has(p.empate.cliente.id)
    && Object.keys(updateDePlan(p)).length > 0,
  );
  if (conCambios.length === 0) {
    console.log('Nada que escribir.\n');
    return;
  }

  const fecha = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rutaRespaldo = resolve(`scripts/respaldos/clientes-ok-${fecha}.json`);
  const respaldo: ArchivoRespaldo = {
    fecha: new Date().toISOString(),
    script: 'scripts/cargarClientesOk.ts',
    archivoFuente: ARCHIVO,
    comandoRevertir: `SERVICE_ACCOUNT=ruta/a/llave.json npx tsx scripts/revertirCargaClientes.ts ${rutaRespaldo}`,
    documentos: [],
  };

  // El respaldo se arma con el documento TAL COMO ESTÁ en el servidor, no con
  // lo que se leyó al principio: entre la lectura y la escritura alguien pudo
  // haber editado la ficha.
  const updates: { id: string; update: Record<string, unknown> }[] = [];
  for (const p of conCambios) {
    const c = p.empate.cliente!;
    const ref = db.collection('clientes').doc(c.id);
    const snapAhora = await ref.get();
    if (!snapAhora.exists) {
      console.log(`  ⚠️  ${c.id} ya no existe. Se omite.`);
      continue;
    }
    const doc = snapAhora.data() as Record<string, unknown>;
    const update = completarDiasCredito(updateDePlan(p), c);
    const antes: Record<string, CampoRespaldo> = {};
    // `updatedAt` entra al respaldo porque la escritura lo mueve: si la
    // reversa no lo regresara, el documento diría que se tocó hoy aunque se
    // haya deshecho todo.
    for (const ruta of [...Object.keys(update), 'updatedAt']) antes[ruta] = leerRuta(doc, ruta);
    respaldo.documentos.push({ coleccion: 'clientes', id: c.id, nombre: c.nombre, antes });
    updates.push({ id: c.id, update });
  }

  mkdirSync(dirname(rutaRespaldo), { recursive: true });
  writeFileSync(rutaRespaldo, JSON.stringify(respaldo, null, 2), 'utf-8');
  console.log(`💾 Respaldo de ${respaldo.documentos.length} documentos: ${rutaRespaldo}`);
  console.log(`   Para revertir: ${respaldo.comandoRevertir}\n`);

  let escritos = 0;
  let errores = 0;
  for (const { id, update } of updates) {
    try {
      await db.collection('clientes').doc(id).update({ ...update, updatedAt: new Date().toISOString() });
      console.log(`  ✅ ${id}: ${Object.keys(update).join(', ')}`);
      escritos++;
    } catch (err) {
      console.error(`  ❌ ${id}: ${err instanceof Error ? err.message : err}`);
      errores++;
    }
  }

  console.log(`\n✅ Clientes actualizados: ${escritos} | ❌ Errores: ${errores}`);
  if (errores > 0) process.exit(1);
}

main().catch(err => {
  console.error('Error fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
