/**
 * revertirCargaClientes.ts — deshace lo que escribió `cargarClientesOk.ts`
 * usando su archivo de respaldo (tarea 65, 5-oct-2026).
 *
 * Uso:
 *   SERVICE_ACCOUNT=ruta/a/llave.json npx tsx scripts/revertirCargaClientes.ts scripts/respaldos/clientes-ok-FECHA.json
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/revertirCargaClientes.ts <respaldo.json>
 *
 * Un campo que el documento NO tenía se BORRA (`FieldValue.delete()`), no se
 * deja en null: `rfc: null` donde no había nada se ve igual en pantalla pero
 * no es el mismo documento, y `estadoFiscal` y los filtros de Altas leen la
 * ausencia, no el null.
 *
 * En seco por defecto, igual que la carga: sin `--aplicar` solo dice qué haría.
 */

import { readFileSync, existsSync } from 'fs';
import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

interface CampoRespaldo { presente: boolean; valor: unknown }
interface DocRespaldo {
  coleccion: string;
  id: string;
  nombre: string;
  antes: Record<string, CampoRespaldo>;
}
interface ArchivoRespaldo {
  fecha: string;
  script: string;
  archivoFuente?: string;
  documentos: DocRespaldo[];
}

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
    process.exit(1);
  }
  return getFirestore();
}

async function main() {
  const ruta = process.argv[2];
  const aplicar = process.argv.includes('--aplicar');

  if (!ruta || ruta.startsWith('--')) {
    console.error('Uso: npx tsx scripts/revertirCargaClientes.ts <respaldo.json> [--aplicar]');
    process.exit(1);
  }
  if (!existsSync(ruta)) {
    console.error(`❌ No se encontró: ${ruta}`);
    process.exit(1);
  }

  let respaldo: ArchivoRespaldo;
  try {
    respaldo = JSON.parse(readFileSync(ruta, 'utf-8')) as ArchivoRespaldo;
  } catch {
    console.error(`❌ «${ruta}» no es un JSON válido.`);
    console.error('   Se espera el respaldo que genera cargarClientesOk.ts --aplicar,');
    console.error('   en scripts/respaldos/clientes-ok-FECHA.json.');
    process.exit(1);
    return;
  }
  if (!Array.isArray(respaldo.documentos)) {
    console.error('❌ El archivo no tiene la forma de un respaldo de cargarClientesOk.ts.');
    process.exit(1);
  }

  console.log(`📄 Respaldo del ${respaldo.fecha} (fuente: ${respaldo.archivoFuente ?? '—'})`);
  console.log(`📋 Documentos a revertir: ${respaldo.documentos.length}\n`);

  const db = inicializarFirestore();

  let revertidos = 0;
  let errores = 0;

  for (const d of respaldo.documentos) {
    const update: Record<string, unknown> = {};
    const detalle: string[] = [];
    for (const [ruta2, campo] of Object.entries(d.antes)) {
      if (campo.presente) {
        update[ruta2] = campo.valor;
        detalle.push(`${ruta2} ← ${JSON.stringify(campo.valor)}`);
      } else {
        update[ruta2] = FieldValue.delete();
        detalle.push(`${ruta2} ← (se borra)`);
      }
    }

    if (!aplicar) {
      console.log(`  ${d.id} «${d.nombre}»: ${detalle.join(' · ')}`);
      continue;
    }

    try {
      await db.collection(d.coleccion).doc(d.id).update(update);
      console.log(`  ✅ ${d.id}: ${detalle.join(' · ')}`);
      revertidos++;
    } catch (err) {
      console.error(`  ❌ ${d.id}: ${err instanceof Error ? err.message : err}`);
      errores++;
    }
  }

  if (!aplicar) {
    console.log('\nℹ️  Modo seco: no se escribió nada. Para revertir de verdad, agrega --aplicar.\n');
    return;
  }

  console.log(`\n✅ Revertidos: ${revertidos} | ❌ Errores: ${errores}`);
  if (errores > 0) process.exit(1);
}

main().catch(err => {
  console.error('Error fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
