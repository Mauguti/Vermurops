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

  // ── Tarifarios que no dejaron ninguna tarifa ────────────────────────────
  //
  // El wizard no dejaba confirmar ninguna línea (bug 1a): el documento se
  // guardaba como evidencia y el guardado terminaba en cero. Un tarifario
  // procesado con IA y con `tarifasExtraidas` en cero es el rastro de eso, y
  // es el que hay que volver a subir con el wizard arreglado.
  //
  // «Solo respaldo» NO cuenta: ésos se subieron a propósito sin pasar por el
  // extractor, y cero tarifas es su estado correcto.
  const soloRespaldo = tarifarios.filter(d => d.procesadoConIA !== true);
  const procesados = tarifarios.filter(d => d.procesadoConIA === true);
  const enCero = procesados.filter(d => !Number(d.tarifasExtraidas));
  const conTarifas = procesados.filter(d => Number(d.tarifasExtraidas) > 0);

  console.log('\n── Tarifarios: cuáles dejaron tarifas ──');
  console.log(`  solo respaldo (sin extractor):    ${soloRespaldo.length}`);
  console.log(`  procesados con IA:                ${procesados.length}`);
  console.log(`    · con tarifas guardadas:        ${conTarifas.length}`);
  console.log(`    · EN CERO  ← volver a subir:    ${enCero.length}`);

  if (enCero.length) {
    console.log('\n  Los que hay que volver a subir:');
    enCero.slice(0, 40).forEach(d => console.log(
      `    ${String(d.fechaSubida ?? '').slice(0, 10)}  ${d.nombreArchivo ?? d.id}` +
      `  · subió ${d.subidoPorNombre ?? d.subidoPor ?? '—'}` +
      (d.importacionId ? `  · importación ${d.importacionId}` : '  · nunca llegó a revisión'),
    ));
    if (enCero.length > 40) console.log(`    … y ${enCero.length - 40} más`);
  }

  // ── Borradores del wizard que se quedaron a medias ──────────────────────
  //
  // Un borrador en «en_revision» es exactamente la pantalla donde el equipo
  // se quedaba atorado: la extracción funcionó y el guardado no.
  const importaciones: Fila[] = (await db.collection('importacionesTarifas').get()).docs
    .map(d => ({ id: d.id, ...d.data() }));

  const porEstado = new Map<string, number>();
  importaciones.forEach(i => {
    const e = String(i.estado ?? 'sin estado');
    porEstado.set(e, (porEstado.get(e) ?? 0) + 1);
  });

  console.log(`\n── Borradores de importación (${importaciones.length}) ──`);
  [...porEstado].sort((a, b) => b[1] - a[1])
    .forEach(([e, n]) => console.log(`  ${e.padEnd(22)} ${n}`));

  const atoradas = importaciones.filter(i => i.estado === 'en_revision');
  if (atoradas.length) {
    console.log('\n  Atoradas en la pantalla de revisión (el bug del wizard):');
    atoradas.slice(0, 40).forEach(i => console.log(
      `    ${String(i.updatedAt ?? i.createdAt ?? '').slice(0, 10)}  ${i.nombreArchivo ?? i.id}` +
      `  · ${Array.isArray(i.tarifas) ? i.tarifas.length : '?'} líneas extraídas`,
    ));
  }

  // ── Cuántas tarifas nacieron del wizard ────────────────────────────────
  const delWizard = tarifas.filter(t => (t.documentoOrigen as Fila)?.importacionId).length;
  console.log(
    `\n  tarifas que traen documento de origen: ${delWizard} de ${tarifas.length}` +
    `  ← lo que el wizard alcanzó a guardar`,
  );

  if (muestra.length) {
    console.log('\n── Muestra (máx. 15) ──');
    console.log(muestra.join('\n'));
  }

  // ── ¿Las ocho primeras cotizaciones son las de demostración? ───────────
  //
  // useCotizaciones sembraba con `snapshot.empty` a secas, y un snapshot de
  // caché llega vacío: podía escribir las ocho de ejemplo ENCIMA de las
  // reales, con setDoc sin merge. Ya está cerrado, pero hay que saber si
  // alcanzó a pasar. Se compara contra el seed por empresa, etapa y total.
  const SEMILLA: Record<string, { empresa: string; etapa: string }> = {
    'COT-2026-0001': { empresa: 'Alfa Corporativo S.A.',        etapa: 'solicitud_cliente' },
    'COT-2026-0002': { empresa: 'Distribuidora Nacional',       etapa: 'solicitado_pricing' },
    'COT-2026-0003': { empresa: 'Industrias Metalúrgicas',      etapa: 'pricing_solicitando' },
    'COT-2026-0004': { empresa: 'Grupo Textil Monterrey',       etapa: 'cotizaciones_recibidas' },
    'COT-2026-0005': { empresa: 'Importadora del Golfo',        etapa: 'consolidada' },
    'COT-2026-0006': { empresa: 'Comercial del Norte',          etapa: 'enviada_cliente' },
    'COT-2026-0007': { empresa: 'Electrodomésticos Premium',    etapa: 'negociacion' },
    'COT-2026-0008': { empresa: 'Plásticos Ramírez S.A.',       etapa: 'ganada' },
  };

  console.log('\n── COT-2026-0001 … 0008: ¿demostración o reales? ──');
  for (const folio of Object.keys(SEMILLA)) {
    const snap = await db.collection('cotizaciones').doc(folio).get();
    if (!snap.exists) { console.log(`  ${folio}  no existe`); continue; }
    const d = snap.data() as Fila;
    const empresa = String((d.prospecto as Fila)?.empresa ?? d.cliente ?? '—');
    const etapa = String(d.etapa ?? '—');
    const esperado = SEMILLA[folio];
    const igual = empresa.trim() === esperado.empresa && etapa === esperado.etapa;
    console.log(
      `  ${folio}  ${igual ? 'DEMOSTRACIÓN' : 'real        '}` +
      `  ${empresa.slice(0, 32).padEnd(32)} · ${etapa.padEnd(22)}` +
      `  total ${String(d.valorTotalConsolidado ?? '—').padStart(10)}` +
      `  creada ${String(d.createdAt ?? '—').slice(0, 19)}` +
      `  modificada ${String(d.updatedAt ?? '—').slice(0, 19)}`,
    );
    if (!igual) {
      console.log(`      el seed decía: ${esperado.empresa} · ${esperado.etapa}`);
    }
  }
  console.log(
    '\n  «DEMOSTRACIÓN» = empresa y etapa coinciden con el seed. Si la fecha de\n' +
    '  modificación es muy posterior a la de creación, alguien la reescribió.\n',
  );

  console.log(
    '\n  Ninguna se tocó. Lo inferido es lo que el panel SUGERIRÍA; con el plan\n' +
    '  aprobado, Pricing lo confirma con un clic antes de que la tarifa se use.\n',
  );
}

main().catch(e => { console.error(e); process.exit(1); });
