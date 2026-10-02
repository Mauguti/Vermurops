/**
 * Revierte los cambios de aplicarConceptosIVA.ts usando el archivo de respaldo.
 *
 * Uso:
 *   SERVICE_ACCOUNT=ruta/a/llave.json npx tsx scripts/revertirConceptosIVA.ts docs/datos/respaldo-conceptos-iva-FECHA.json
 */

import { readFileSync, existsSync } from 'fs';
import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

interface Respaldo {
  fecha: string;
  script: string;
  conceptos: Record<string, { nombre: string; reglaIVA: string; notaIVA: string }>;
}

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
    initializeApp({ credential: cert(sa) });
  } else {
    console.error('❌ Se necesita SERVICE_ACCOUNT o FIRESTORE_EMULATOR_HOST');
    process.exit(1);
  }

  return getFirestore();
}

async function main() {
  const archivoRespaldo = process.argv[2];
  if (!archivoRespaldo) {
    console.error('Uso: npx tsx scripts/revertirConceptosIVA.ts <archivo-respaldo.json>');
    process.exit(1);
  }

  if (!existsSync(archivoRespaldo)) {
    console.error(`❌ No se encontró: ${archivoRespaldo}`);
    process.exit(1);
  }

  const respaldo: Respaldo = JSON.parse(readFileSync(archivoRespaldo, 'utf-8'));
  const ids = Object.keys(respaldo.conceptos);
  console.log(`📄 Respaldo del ${respaldo.fecha}`);
  console.log(`📋 Conceptos a revertir: ${ids.length}\n`);

  const db = inicializarFirestore();
  const colConceptos = db.collection('conceptos');

  let revertidos = 0;
  let errores = 0;

  for (const id of ids) {
    const valores = respaldo.conceptos[id];
    try {
      await colConceptos.doc(id).update({
        nombre: valores.nombre,
        reglaIVA: valores.reglaIVA,
        notaIVA: valores.notaIVA,
        updatedAt: new Date().toISOString(),
      });
      console.log(`  ✅ ${id} revertido a: ${valores.reglaIVA} / "${valores.nombre}"`);
      revertidos++;
    } catch (err) {
      console.error(`  ❌ ${id}: ${err instanceof Error ? err.message : err}`);
      errores++;
    }
  }

  console.log(`\n✅ Revertidos: ${revertidos} | ❌ Errores: ${errores}`);
  if (errores > 0) process.exit(1);
}

main().catch(err => {
  console.error('Error fatal:', err.message ?? err);
  process.exit(1);
});
