/**
 * auditarLimpiezaModeloViejo.ts — SOLO LECTURA
 *
 * ¿Qué cotizaciones y embarques son del modelo VIEJO, y qué se perdería si
 * se borran o archivan?
 *
 * ── Por qué (10-sep-2026) ──────────────────────────────────────────────────
 * Los registros anteriores al rediseño de la solicitud (S-1..S-3, sep-2026)
 * siguen con la categorización por servicio del selector viejo
 * (`srv-def-*`, «Flete Internacional», «Maniobras»…), sin carga tipada y con
 * conceptos sin `conceptoId`. Ensucian las vistas. Antes de tocarlos hay que
 * saber cuántos son y qué cuelga de ellos.
 *
 * ── Qué mide ───────────────────────────────────────────────────────────────
 * Por cada cotización y embarque: modelo (viejo / nuevo / semilla de demo),
 * datos que se perderían (chat, actividades, historial, versiones, facturas,
 * cobros, OC, depósitos, documentos en Storage) y enlaces a otras entidades.
 * Con eso los clasifica:
 *
 *   SEGURA       modelo viejo (o semilla), sin datos asociados, sin enlaces
 *   DEPENDENCIAS modelo viejo pero con algo colgando: caso por caso
 *   NUEVA        modelo nuevo: no se toca
 *
 * ── Lo que NO hace ─────────────────────────────────────────────────────────
 * No escribe en Firestore. Deja la clasificación en un JSON local para que
 * el paso 2 (borrado/archivado, con --dry-run) trabaje sobre ESTA lista y no
 * sobre una lectura nueva: lo que se decide con la auditoría es lo que se
 * ejecuta.
 *
 * Uso (producción, SOLO LECTURA):
 *   SERVICE_ACCOUNT=/ruta/serviceAccountKey.json \
 *     npx tsx scripts/auditarLimpiezaModeloViejo.ts
 *
 * Contra emuladores, sin credenciales:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/auditarLimpiezaModeloViejo.ts
 *
 * Salida: auditoria-limpieza-<fecha>.json en el directorio actual.
 */

import { readFileSync, writeFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

// ─── Señales del modelo ───────────────────────────────────────────────────────

/** Folios sembrados por la app como demostración (initialKanbanQuotes / initialEmbarquesCompletos). */
const SEMILLAS_COT = new Set(Array.from({ length: 8 }, (_, i) => `COT-2026-000${i + 1}`));
const SEMILLAS_EMB = new Set(Array.from({ length: 9 }, (_, i) => `SHP-2026-000${i + 1}`));

/** Los tipos del selector viejo (serviciosStore) y sus nombres. */
const TIPOS_VIEJOS = new Set([
  'srv-def-1', 'srv-def-2', 'srv-def-3', 'srv-def-4', 'srv-def-5', 'srv-def-6', 'srv-def-7',
  'Flete Internacional', 'Transporte Terrestre', 'Transporte Aéreo', 'Maniobras',
  'Almacenaje Nacional', 'Almacenaje Internacional', 'Seguro de Mercancía', 'Recolección',
]);

type Modelo = 'viejo' | 'nuevo' | 'semilla';
type Clasificacion = 'SEGURA' | 'DEPENDENCIAS' | 'NUEVA';

interface Registro {
  coleccion: 'cotizaciones' | 'embarques';
  id: string;
  folio: string;
  cliente: string;
  etapa: string;
  creado: string;
  modelo: Modelo;
  /** Por qué se clasificó así. */
  senales: string[];
  /** Lo que se perdería. Solo lo que no está en cero. */
  datos: Record<string, number>;
  /** Enlaces a otras entidades. */
  enlaces: Record<string, string[]>;
  /** Archivos en Storage que quedarían huérfanos si se borra el documento. */
  storage: string[];
  clasificacion: Clasificacion;
}

const n = (v: unknown): number => (Array.isArray(v) ? v.length : 0);
const texto = (v: unknown): string => (typeof v === 'string' ? v : '');

// ─── Cotizaciones ─────────────────────────────────────────────────────────────

function modeloCotizacion(c: Record<string, unknown>): { modelo: Modelo; senales: string[] } {
  const senales: string[] = [];
  const servicios = (Array.isArray(c.servicios) ? c.servicios : []) as Record<string, unknown>[];

  let cargaTipada = 0, conceptosConCatalogo = 0, conceptosSinCatalogo = 0, tiposViejos = 0, subTramites = 0;
  servicios.forEach(s => {
    if (s.carga && typeof s.carga === 'object') cargaTipada++;
    if (TIPOS_VIEJOS.has(texto(s.tipo))) tiposViejos++;
    if (Array.isArray(s.subTramites) && s.subTramites.length > 0) subTramites++;
    (Array.isArray(s.conceptos) ? s.conceptos : []).forEach((k: Record<string, unknown>) => {
      if (k.conceptoId) conceptosConCatalogo++; else conceptosSinCatalogo++;
    });
  });

  if (cargaTipada > 0) senales.push(`${cargaTipada} servicio(s) con carga tipada`);
  if (conceptosConCatalogo > 0) senales.push(`${conceptosConCatalogo} concepto(s) del catálogo`);
  if (tiposViejos > 0) senales.push(`${tiposViejos} servicio(s) con tipo del selector viejo`);
  if (subTramites > 0) senales.push(`${subTramites} servicio(s) con subTramites`);
  if (conceptosSinCatalogo > 0) senales.push(`${conceptosSinCatalogo} concepto(s) sin conceptoId`);
  if (servicios.length === 0) senales.push('sin servicios');

  if (SEMILLAS_COT.has(texto(c.id))) return { modelo: 'semilla', senales: ['folio de la siembra de demostración', ...senales] };
  if (cargaTipada > 0 || conceptosConCatalogo > 0) return { modelo: 'nuevo', senales };
  return { modelo: 'viejo', senales };
}

// ─── Embarques ────────────────────────────────────────────────────────────────

function modeloEmbarque(e: Record<string, unknown>): { modelo: Modelo; senales: string[] } {
  const senales: string[] = [];
  const cargos = ((e.cargos as Record<string, unknown> | undefined)?.detalles ?? []) as Record<string, unknown>[];
  const conOrigen = cargos.filter(c => c.origenCotizacion || c.conceptoId).length;
  const docs = (Array.isArray(e.documentos) ? e.documentos : []) as Record<string, unknown>[];
  const docsEnStorage = docs.filter(d => d.storagePath).length;

  if (conOrigen > 0) senales.push(`${conOrigen} cargo(s) con origen en cotización`);
  if (e.entidadesRef) senales.push('entidades enlazadas al catálogo');
  if (e.etapaOperativa) senales.push('etapa operativa fijada');
  if (e.origen === 'automatico') senales.push('nació de una cotización ganada');
  if (docsEnStorage > 0) senales.push(`${docsEnStorage} documento(s) en Storage`);
  if (cargos.length > 0 && conOrigen === 0) senales.push(`${cargos.length} cargo(s) sin origen ni conceptoId`);
  if (docs.length > docsEnStorage) senales.push(`${docs.length - docsEnStorage} documento(s) sin archivo (URL de objeto muerta)`);

  if (SEMILLAS_EMB.has(texto(e.id))) return { modelo: 'semilla', senales: ['folio de la siembra de demostración', ...senales] };
  if (conOrigen > 0 || e.entidadesRef || e.etapaOperativa || e.origen === 'automatico' || docsEnStorage > 0) {
    return { modelo: 'nuevo', senales };
  }
  return { modelo: 'viejo', senales };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function leer(db: Firestore, col: string): Promise<Record<string, unknown>[]> {
  const snap = await db.collection(col).get();
  const out: Record<string, unknown>[] = [];
  snap.forEach(d => out.push({ id: d.id, ...d.data() }));
  return out;
}

async function main() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(`\n⚠️  Leyendo del EMULADOR (${process.env.FIRESTORE_EMULATOR_HOST}), no de producción.`);
    initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'vermur-logistics-app' });
  } else {
    const ruta = process.env.SERVICE_ACCOUNT ?? new URL('../serviceAccountKey.json', import.meta.url);
    let cred;
    try {
      cred = JSON.parse(readFileSync(ruta as string, 'utf8'));
    } catch {
      console.error(`\nNo se encontró la clave de servicio en: ${ruta}\n`);
      console.error('Uso: SERVICE_ACCOUNT=/ruta/serviceAccountKey.json npx tsx scripts/auditarLimpiezaModeloViejo.ts\n');
      process.exit(1);
    }
    initializeApp({ credential: cert(cred) });
  }
  const db = getFirestore();

  const [cotizaciones, embarques, facturas, cobros, ordenes, depositos, docsTarifario, notificaciones] =
    await Promise.all([
      leer(db, 'cotizaciones'), leer(db, 'embarques'), leer(db, 'facturas'), leer(db, 'cobros'),
      leer(db, 'ordenesCompra'), leer(db, 'depositosCliente'), leer(db, 'documentosTarifario'),
      leer(db, 'notificaciones'),
    ]);

  const idsEmb = new Set(embarques.map(e => texto(e.id)));
  const idsCot = new Set(cotizaciones.map(c => texto(c.id)));
  const embPorCot = new Map<string, string[]>();
  embarques.forEach(e => {
    const cid = texto(e.cotizacionId);
    if (cid) embPorCot.set(cid, [...(embPorCot.get(cid) ?? []), texto(e.id)]);
  });

  const registros: Registro[] = [];

  // ── Cotizaciones ────────────────────────────────────────────────────────
  for (const c of cotizaciones) {
    const id = texto(c.id);
    const { modelo, senales } = modeloCotizacion(c);
    const versiones = await db.collection('cotizaciones').doc(id).collection('versiones').get();

    const datos: Record<string, number> = {};
    const chat = n(c.chat); if (chat) datos.chat = chat;
    const actividades = ((c.actividades as unknown[]) ?? []).filter(a => (a as Record<string, unknown>).tipo !== 'cambio_etapa').length;
    if (actividades) datos.actividades = actividades;
    const historial = n(c.historialEtapas); if (historial > 1) datos.historialEtapas = historial;
    if (versiones.size) datos.versiones = versiones.size;
    const evidencias = docsTarifario.filter(d => texto(d.cotizacionId) === id).length;
    if (evidencias) datos.evidenciasTarifario = evidencias;
    const notifs = notificaciones.filter(x => texto(x.cotizacionId) === id).length;
    if (notifs) datos.notificaciones = notifs;

    const enlaces: Record<string, string[]> = {};
    const embDeclarados = (Array.isArray(c.embarqueIds) ? c.embarqueIds : []) as string[];
    const embReales = embPorCot.get(id) ?? [];
    const todosEmb = [...new Set([...embDeclarados, ...embReales])];
    if (todosEmb.length) enlaces.embarques = todosEmb.map(x => idsEmb.has(x) ? x : `${x} (no existe)`);
    if (c.prospectoId) enlaces.prospecto = [texto(c.prospectoId)];
    if (c.clienteId) enlaces.cliente = [texto(c.clienteId)];

    const storage = docsTarifario.filter(d => texto(d.cotizacionId) === id).map(d => texto(d.storagePath)).filter(Boolean);

    const conDatos = Object.keys(datos).length > 0 || todosEmb.length > 0 || storage.length > 0;
    const clasificacion: Clasificacion = modelo === 'nuevo' ? 'NUEVA' : conDatos ? 'DEPENDENCIAS' : 'SEGURA';

    registros.push({
      coleccion: 'cotizaciones', id, folio: id,
      cliente: texto((c.prospecto as Record<string, unknown> | undefined)?.empresa) || '(sin empresa)',
      etapa: `${texto(c.etapa) || '—'}${c.estadoFinal ? ` · ${c.estadoFinal}` : ''}`,
      creado: texto(c.createdAt).slice(0, 10) || '—',
      modelo, senales, datos, enlaces, storage, clasificacion,
    });
  }

  // ── Embarques ───────────────────────────────────────────────────────────
  for (const e of embarques) {
    const id = texto(e.id);
    const { modelo, senales } = modeloEmbarque(e);

    const datos: Record<string, number> = {};
    const f = facturas.filter(x => texto(x.embarqueId) === id).length; if (f) datos.facturas = f;
    const co = cobros.filter(x => texto(x.embarqueId) === id).length; if (co) datos.cobros = co;
    const oc = ordenes.filter(x => texto(x.embarqueId) === id && x.activo !== false).length; if (oc) datos.ordenesCompra = oc;
    const dep = depositos.filter(x => texto(x.embarqueId) === id && x.activo !== false).length; if (dep) datos.depositos = dep;
    const docs = (Array.isArray(e.documentos) ? e.documentos : []) as Record<string, unknown>[];
    const docsConArchivo = docs.filter(d => d.storagePath);
    if (docsConArchivo.length) datos.documentosEnStorage = docsConArchivo.length;
    const eventos = n(e.eventos); if (eventos) datos.eventos = eventos;
    const productos = n(e.productos); if (productos) datos.productos = productos;
    const cargos = n((e.cargos as Record<string, unknown> | undefined)?.detalles); if (cargos) datos.cargos = cargos;

    const enlaces: Record<string, string[]> = {};
    const cid = texto(e.cotizacionId);
    if (cid) enlaces.cotizacion = [idsCot.has(cid) ? cid : `${cid} (no existe)`];
    const ocIds = ordenes.filter(x => texto(x.embarqueId) === id).map(x => texto(x.folio) || texto(x.id));
    if (ocIds.length) enlaces.ordenesCompra = ocIds;
    const facIds = facturas.filter(x => texto(x.embarqueId) === id).map(x => texto(x.numero) || texto(x.id));
    if (facIds.length) enlaces.facturas = facIds;
    if (e.masterId) enlaces.master = [texto(e.masterId)];

    const storage = docsConArchivo.map(d => texto(d.storagePath));

    // Un embarque «viejo» con solo cargos y eventos de la siembra sigue siendo
    // seguro: eso es lo que se quiere limpiar. Lo que lo vuelve dependencia es
    // dinero real (facturas, cobros, OC, depósitos), archivos en Storage o una
    // cotización real que lo apunta.
    const dineroReal = f + co + oc + dep > 0;
    const conDatos = dineroReal || storage.length > 0 || (cid !== '' && idsCot.has(cid) && !SEMILLAS_COT.has(cid));
    const clasificacion: Clasificacion = modelo === 'nuevo' ? 'NUEVA' : conDatos ? 'DEPENDENCIAS' : 'SEGURA';

    registros.push({
      coleccion: 'embarques', id, folio: texto(e.folio) || id,
      cliente: texto((e.entidades as Record<string, unknown> | undefined)?.clienteCobrar) || '(sin cliente)',
      etapa: [e.enTransito ? 'en tránsito' : '', (e.cierres as Record<string, boolean> | undefined)?.operativo ? 'cierre operativo' : ''].filter(Boolean).join(' · ') || 'abierto',
      creado: texto(e.createdAt).slice(0, 10) || '—',
      modelo, senales, datos, enlaces, storage, clasificacion,
    });
  }

  // ── Reporte ───────────────────────────────────────────────────────────────
  const conteo = (col: Registro['coleccion'], cl: Clasificacion) =>
    registros.filter(r => r.coleccion === col && r.clasificacion === cl).length;

  console.log('\n§ Limpieza del modelo viejo — auditoría (solo lectura)\n');
  console.log(`  Cotizaciones: ${cotizaciones.length}   Embarques: ${embarques.length}`);
  console.log(`  Facturas: ${facturas.length} · Cobros: ${cobros.length} · OC: ${ordenes.length} · Depósitos: ${depositos.length}\n`);

  for (const col of ['cotizaciones', 'embarques'] as const) {
    console.log(`  ── ${col.toUpperCase()} ──`);
    console.log(`  ✅ SEGURAS de borrar/archivar: ${conteo(col, 'SEGURA')}`);
    console.log(`  ⚠️  TIENEN DEPENDENCIAS:        ${conteo(col, 'DEPENDENCIAS')}`);
    console.log(`     NUEVAS (no tocar):          ${conteo(col, 'NUEVA')}`);
    const semillas = registros.filter(r => r.coleccion === col && r.modelo === 'semilla').length;
    if (semillas) console.log(`     (de las cuales ${semillas} son la siembra de demostración)`);
    console.log('');
  }

  const detalle = registros.filter(r => r.clasificacion !== 'NUEVA')
    .sort((a, b) => a.coleccion.localeCompare(b.coleccion) || a.clasificacion.localeCompare(b.clasificacion) || a.id.localeCompare(b.id));

  if (detalle.length > 0) {
    console.log(`  ── Detalle de las ${detalle.length} que NO son nuevas ──\n`);
    detalle.forEach(r => {
      console.log(`  ${r.folio}  ${r.clasificacion}  [${r.modelo}]`);
      console.log(`     ${r.cliente} · ${r.etapa} · creado ${r.creado}`);
      if (r.senales.length) console.log(`     señales: ${r.senales.join('; ')}`);
      const d = Object.entries(r.datos).map(([k, v]) => `${k} ${v}`).join(', ');
      if (d) console.log(`     se perdería: ${d}`);
      const en = Object.entries(r.enlaces).map(([k, v]) => `${k} → ${v.join(', ')}`).join(' | ');
      if (en) console.log(`     enlaces: ${en}`);
      if (r.storage.length) console.log(`     ⚠️  Storage (quedarían huérfanos): ${r.storage.join(', ')}`);
      console.log('');
    });
  }

  const totalStorage = registros.filter(r => r.clasificacion !== 'NUEVA').reduce((a, r) => a + r.storage.length, 0);
  console.log('  ── Para decidir ──');
  console.log(`  · ${conteo('cotizaciones', 'SEGURA') + conteo('embarques', 'SEGURA')} registros seguros: modelo viejo o siembra, sin dinero, sin archivos, sin enlaces reales.`);
  console.log(`  · ${conteo('cotizaciones', 'DEPENDENCIAS') + conteo('embarques', 'DEPENDENCIAS')} con dependencias: caso por caso.`);
  if (totalStorage > 0) console.log(`  · ${totalStorage} archivo(s) en Storage colgando de registros viejos: borrar el documento NO los borra.`);

  const salida = `auditoria-limpieza-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(salida, JSON.stringify({ generadoEn: new Date().toISOString(), registros }, null, 2));
  console.log(`\n  Clasificación guardada en ${salida} — el paso 2 trabaja sobre este archivo.\n`);
}

main().catch(err => {
  console.error('\nFalló la auditoría:', err);
  process.exit(1);
});
