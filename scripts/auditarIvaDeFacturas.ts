/**
 * auditarIvaDeFacturas.ts — SOLO LECTURA.
 *
 * ¿Alguna factura ya emitida salió con el IVA equivocado?
 *
 * Hasta este arreglo, `lineaDeFactura` NO leía `cargo.impuesto`: la tasa que
 * Pricing eligió en la cotización y que el embarque hereda se ignoraba, y la
 * línea se facturaba con lo que derivara el catálogo — o en CERO con aviso si
 * el concepto estaba marcado «revisar».
 *
 * Este script busca el daño: facturas cuyos cargos traen una tasa elegida.
 * Son las únicas que pudieron salir mal, porque las demás se derivaron igual
 * antes y después.
 *
 * NO hace set, update, delete, add ni batch. Solo get().
 *
 * Uso:
 *   SERVICE_ACCOUNT=/ruta/serviceAccountKey.json \
 *     npx vite-node scripts/auditarIvaDeFacturas.ts
 */

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const TASA: Record<string, number> = { iva16: 16, iva0: 0, exento: 0 };

async function main() {
  const ruta = process.env.SERVICE_ACCOUNT ?? new URL('../serviceAccountKey.json', import.meta.url);
  let cred;
  try {
    cred = JSON.parse(readFileSync(ruta as string, 'utf8'));
  } catch {
    console.error(`\nNo se encontró la clave de servicio en: ${ruta}\n`);
    process.exit(1);
  }
  initializeApp({ credential: cert(cred) });
  const db = getFirestore();

  const facturas: Record<string, unknown>[] = (await db.collection('facturas').get()).docs
    .map(d => ({ id: d.id, ...d.data() }));
  const embarques = new Map(
    (await db.collection('embarques').get()).docs.map(d => [d.id, d.data() as Record<string, unknown>]),
  );

  console.log(`\nFacturas leídas: ${facturas.length}\n`);

  let conEleccion = 0;
  const sospechosas: string[] = [];

  for (const f of facturas) {
    const emb = embarques.get(String(f.embarqueId));
    if (!emb) {
      console.log(`  ⚠ ${f.numero ?? f.id}: su embarque ${f.embarqueId} no existe`);
      continue;
    }
    const cargos: Record<string, unknown>[] =
      ((emb.cargos as Record<string, unknown>)?.detalles as Record<string, unknown>[]) ?? [];

    // Los cargos que esta factura cubre, con una tasa ELEGIDA a mano.
    const suyos = cargos.filter(c => c.facturaId === f.id && c.impuesto);
    if (suyos.length === 0) continue;

    conEleccion++;
    suyos.forEach(c => {
      const elegida = TASA[String(c.impuesto)];
      sospechosas.push(
        `  ${f.numero ?? f.id} · ${f.embarqueFolio ?? f.embarqueId} · «${c.concepto}» ` +
        `· ${c.moneda} ${Number(c.monto ?? 0).toFixed(2)} ` +
        `· eligieron ${c.impuesto} (${elegida}%) · emitida ${f.fechaEmision ?? '—'}`,
      );
    });
  }

  console.log('── Facturas con alguna línea de tasa ELEGIDA a mano ──');
  console.log(`  ${conEleccion} factura(s), ${sospechosas.length} línea(s)\n`);
  if (sospechosas.length) {
    console.log(sospechosas.join('\n'));
    console.log(
      '\n  Revisa cada una contra el CFDI emitido: antes del arreglo, la tasa\n' +
      '  elegida se ignoraba y la línea salió con lo que derivó el catálogo,\n' +
      '  o en cero si el concepto estaba marcado «revisar».\n',
    );
  } else {
    console.log('  Ninguna. Nadie eligió tasa a mano en una línea ya facturada,\n' +
                '  así que ninguna factura emitida pudo verse afectada.\n');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
