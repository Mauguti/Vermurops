/**
 * auditarTarifasIncompletas.ts — SOLO LECTURA.
 *
 * Cuántas tarifas y tarifarios quedarían «incompletos» con la llave de
 * búsqueda del plan: modalidad + presentación + ruta + vigencia.
 *
 * Es el dato que decide si el paso 3 del plan se puede publicar sin dejar a
 * Pricing sin tarifas. Si casi todas están incompletas, primero hay que
 * completarlas; si son pocas, se completan al usarse.
 *
 * Para cada tarifa sin modalidad dice qué se INFERIRÍA y por qué, que es lo
 * que el panel enseñaría como sugerencia. La inferencia aquí tampoco decide
 * nada: solo se cuenta.
 *
 * NO hace set, update, delete, add ni batch. Solo get().
 *
 * Uso:
 *   SERVICE_ACCOUNT=/ruta/serviceAccountKey.json \
 *     npx vite-node scripts/auditarTarifasIncompletas.ts
 */

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

type Fila = Record<string, unknown>;

/** Lo que el panel sugeriría. Nunca filtra: solo se enseña. */
function inferirModalidad(t: Fila): { valor: string; porque: string } | null {
  if (t.puertoOrigenId || t.puertoDestinoId) {
    return { valor: 'maritimo', porque: 'tiene puertos' };
  }
  const u = String((t.precios as Fila)?.unidad ?? t.unidad ?? '');
  if (u === 'VIAJE') return { valor: 'terrestre', porque: 'se cobra por viaje' };
  if (u === 'PEDIMENTO') return { valor: 'despacho', porque: 'se cobra por pedimento' };
  if (u === 'CBM' || u === 'WM') return { valor: 'maritimo', porque: 'se cobra por volumen o W/M' };
  return null;
}

function inferirPresentacion(t: Fila): { valor: string; porque: string } | null {
  const u = String((t.precios as Fila)?.unidad ?? t.unidad ?? '');
  if (u === 'BL' || u === 'PEDIMENTO' || u === 'FIJO') {
    return { valor: 'cualquiera', porque: `se cobra por ${u.toLowerCase()}` };
  }
  const p = (t.precios as Fila) ?? {};
  if (u === 'CONTENEDOR') {
    const tiene40 = p.montoPor40 != null || p.montoPor40HC != null;
    return tiene40
      ? { valor: 'cualquiera (dentro de FCL)', porque: 'trae precio por 20, 40 y 40HC' }
      : { valor: '20 (probable)', porque: 'se cobra por contenedor, con un solo precio' };
  }
  return null;
}

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

  const tarifas: Fila[] = (await db.collection('tarifas').get()).docs
    .map(d => ({ id: d.id, ...d.data() }));
  const tarifarios: Fila[] = (await db.collection('documentosTarifario').get()).docs
    .map(d => ({ id: d.id, ...d.data() }));

  console.log(`\nTarifas: ${tarifas.length} · Tarifarios: ${tarifarios.length}\n`);

  let sinModalidad = 0, sinPresentacion = 0, sinRutaCatalogable = 0, activas = 0;
  let inferibleModalidad = 0, inferiblePresentacion = 0;
  const muestra: string[] = [];

  tarifas.forEach(t => {
    if (t.activo === true) activas++;
    const faltaM = !t.modalidad;
    const faltaP = !t.presentacion;
    const sinRuta = !t.puertoOrigenId && !t.puertoDestinoId && !!t.rutaTexto;

    if (faltaM) sinModalidad++;
    if (faltaP) sinPresentacion++;
    if (sinRuta) sinRutaCatalogable++;

    const im = faltaM ? inferirModalidad(t) : null;
    const ip = faltaP ? inferirPresentacion(t) : null;
    if (im) inferibleModalidad++;
    if (ip) inferiblePresentacion++;

    if ((faltaM || faltaP) && muestra.length < 15) {
      muestra.push(
        `  ${t.id} · concepto ${t.conceptoId ?? '—'} · prov ${t.proveedorId ?? '—'}` +
        (faltaM ? ` · sin modalidad${im ? ` → ${im.valor} (${im.porque})` : ' → no inferible'}` : '') +
        (faltaP ? ` · sin presentación${ip ? ` → ${ip.valor} (${ip.porque})` : ' → no inferible'}` : '') +
        (sinRuta ? ` · ruta solo en texto: «${t.rutaTexto}»` : ''),
      );
    }
  });

  const pct = (n: number) => tarifas.length ? ` (${Math.round(n / tarifas.length * 100)}%)` : '';

  console.log('── Qué falta para la llave de búsqueda ──');
  console.log(`  activas:                 ${activas}`);
  console.log(`  sin modalidad:           ${sinModalidad}${pct(sinModalidad)}  · inferibles: ${inferibleModalidad}`);
  console.log(`  sin presentación:        ${sinPresentacion}${pct(sinPresentacion)}  · inferibles: ${inferiblePresentacion}`);
  console.log(`  ruta solo en rutaTexto:  ${sinRutaCatalogable}${pct(sinRutaCatalogable)}  ← no empatan hasta que existan los puntos terrestres`);

  const tarifariosSinModalidad = tarifarios.filter(d => !d.modalidad).length;
  console.log(`\n  tarifarios sin modalidad: ${tarifariosSinModalidad} de ${tarifarios.length}`);

  if (muestra.length) {
    console.log('\n── Muestra (máx. 15) ──');
    console.log(muestra.join('\n'));
  }

  console.log(
    '\n  Ninguna se tocó. Lo inferido es lo que el panel SUGERIRÍA; con el plan\n' +
    '  aprobado, Pricing lo confirma con un clic antes de que la tarifa se use.\n',
  );
}

main().catch(e => { console.error(e); process.exit(1); });
