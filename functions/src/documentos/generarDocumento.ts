/**
 * generarDocumento.ts — Cloud Function para generar documentos operativos.
 *
 * NO es un proxy: lee datos de Firestore, llena una plantilla HTML, llama al
 * flujo `generar-documento` de n8n (que solo convierte HTML→PDF con Gotenberg),
 * guarda el PDF en Storage y lo registra en el embarque con `arrayUnion`.
 *
 * Un documento generado no se borra; corregir es generar la versión siguiente.
 *
 * Capacidad: `embarque.generar` (Operaciones y Admin).
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as logger from 'firebase-functions/logger';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verificarUsuario, exigirCapacidad, ErrorAuth } from '../comun/auth.js';
import { nombreDelAgente, mensajeDeError, esRechazoDeToken } from '../comun/mensajesN8n.js';
import { renderizar, formatearFecha, formatearFechaCorta, formatearMonto, escaparHtml } from './motorPlantillas.js';

// ── Parámetros ───────────────────────────────────────────────────────────────

const VERMUR_N8N_TOKEN = defineSecret('VERMUR_N8N_TOKEN');

const N8N_WEBHOOK_URL_GENERAR_DOC = defineString('N8N_WEBHOOK_URL_GENERAR_DOC', {
  default: 'https://n8n.vermur.mx/webhook/generar-documento',
  description: 'Webhook de n8n que convierte HTML a PDF (Gotenberg).',
});

// ── Tipos ────────────────────────────────────────────────────────────────────

type TipoDocEmbarque =
  | 'booking'
  | 'notificacion_arribo'
  | 'carta_encomienda'
  | 'carta_porte'
  | 'formato_318'
  | 'hbl'
  | 'prueba';

const TIPOS_VALIDOS: TipoDocEmbarque[] = [
  'booking', 'notificacion_arribo', 'carta_encomienda',
  'carta_porte', 'formato_318', 'hbl', 'prueba',
];

interface DocumentoGenerado {
  tipo: TipoDocEmbarque;
  version: number;
  storagePath: string;
  url: string;
  generadoPor: string;
  generadoPorNombre: string;
  fechaGeneracion: string;
  parametros?: Record<string, unknown>;
}

interface ConfiguracionEmpresa {
  razonSocial: string;
  rfc: string;
  direccion: string;
  telefono: string;
  email: string;
  logoUrl: string;
  apoderadoLegal: string;
  firmaUrl?: string | null;
}

const EMPRESA_DEFAULT: ConfiguracionEmpresa = {
  razonSocial: 'Importaciones y Logística Vermur, S. de R.L. de C.V.',
  rfc: 'ILV190723FN1',
  direccion: 'Paseo de la República Km 13020 Int. 609, Juriquilla, Querétaro, C.P. 76230',
  telefono: '',
  email: '',
  logoUrl: '',
  apoderadoLegal: 'Gabriela Huerta Rodríguez',
};

interface PayloadRequest {
  tipo: TipoDocEmbarque;
  embarqueId: string;
  parametros?: Record<string, unknown>;
}

// ── Plantillas ───────────────────────────────────────────────────────────────

const __filename_fn = fileURLToPath(import.meta.url);
const __dirname_fn = dirname(__filename_fn);

/**
 * Resuelve la plantilla desde `functions/plantillas/{tipo}.html`.
 * En producción, el directorio compilado es `functions/lib/documentos/`,
 * así que subimos tres niveles para llegar a `functions/plantillas/`.
 */
function leerPlantilla(tipo: string): string {
  const ruta = join(__dirname_fn, '..', '..', 'plantillas', `${tipo}.html`);
  return readFileSync(ruta, 'utf-8');
}

// ── Timeout y logs ───────────────────────────────────────────────────────────

const TIMEOUT_MS = 60_000;
const MAX_LOG = 4000;

// ── Lógica principal ─────────────────────────────────────────────────────────

async function leerEmpresa(): Promise<ConfiguracionEmpresa> {
  const snap = await getFirestore().doc('configuracion/empresa').get();
  if (!snap.exists) return { ...EMPRESA_DEFAULT };
  return { ...EMPRESA_DEFAULT, ...(snap.data() as Partial<ConfiguracionEmpresa>) };
}

// ── Mapa de navieras → plantilla (carta de encomienda / garantía) ────────────

interface NavieraInfo {
  clave: string;
  razonSocial: string;
  atencion: string;
  variantes: string[];
}

/**
 * Cada naviera tiene su propia plantilla HTML. Las variantes se comparan
 * contra `ruta.origen.transportista` en mayúsculas y sin acentos.
 */
const NAVIERAS: NavieraInfo[] = [
  { clave: 'carta_encomienda_cosco', razonSocial: 'COSCO SHIPPING LINES CO., LTD', atencion: 'DEPARTAMENTO DE IMPORTACIÓN', variantes: ['COSCO'] },
  { clave: 'carta_encomienda_hamburg_sud', razonSocial: 'HAMBURG SÜD', atencion: 'DEPARTAMENTO DE IMPORTACIÓN', variantes: ['HAMBURG', 'HAMBURG SUD', 'HAMBURG SÜD'] },
  { clave: 'carta_encomienda_cma_cgm', razonSocial: 'CMA CGM', atencion: 'DEPARTAMENTO DE IMPORTACIÓN', variantes: ['CMA CGM', 'CMA'] },
  { clave: 'carta_encomienda_evergreen', razonSocial: 'EVERGREEN LINE', atencion: 'DEPARTAMENTO DE IMPORTACIÓN', variantes: ['EVERGREEN'] },
  { clave: 'carta_encomienda_sealand', razonSocial: 'SEALAND', atencion: 'DEPARTAMENTO DE IMPORTACIÓN', variantes: ['SEALAND', 'SEA LAND'] },
  { clave: 'carta_encomienda_agunsa', razonSocial: 'AGUNSA', atencion: 'DEPARTAMENTO DE IMPORTACIÓN', variantes: ['AGUNSA'] },
  { clave: 'carta_encomienda_one', razonSocial: 'OCEAN NETWORK EXPRESS', atencion: 'DEPARTAMENTO DE IMPORTACIÓN', variantes: ['OCEAN NETWORK', 'ONE'] },
  { clave: 'carta_encomienda_pil', razonSocial: 'Representaciones Marítimas S.A. DE C.V. as agent of Pacific International Lines Pte LTD', atencion: 'DEPARTAMENTO DE IMPORTACIÓN', variantes: ['PIL', 'PACIFIC INTERNATIONAL'] },
  { clave: 'carta_encomienda_maersk', razonSocial: 'MAERSK A/S', atencion: 'DEPARTAMENTO DE IMPORTACIÓN', variantes: ['MAERSK'] },
  { clave: 'carta_garantia_hmm', razonSocial: 'HMM COMPANY LIMITED Y/O NORTON LILLY SHIPPING MEXICO, S.A. DE C.V.', atencion: '', variantes: ['HMM', 'HYUNDAI', 'NORTON LILLY'] },
  { clave: 'carta_encomienda_msc', razonSocial: 'MEDITERRANEAN SHIPPING COMPANY MEXICO S.A DE C.V.', atencion: 'DEPARTAMENTO DE IMPORTACIÓN', variantes: ['MSC', 'MEDITERRANEAN'] },
];

function normalizarTexto(texto: string): string {
  return texto.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function buscarNaviera(transportista: string): NavieraInfo | null {
  if (!transportista?.trim()) return null;
  const norm = normalizarTexto(transportista);
  const ordenadas = [...NAVIERAS].sort((a, b) => {
    const maxA = Math.max(...a.variantes.map(v => v.length));
    const maxB = Math.max(...b.variantes.map(v => v.length));
    return maxB - maxA;
  });
  for (const nav of ordenadas) {
    for (const variante of nav.variantes) {
      if (norm.includes(normalizarTexto(variante))) return nav;
    }
  }
  return null;
}

/**
 * Extrae la lista de contenedores del embarque como texto HTML.
 */
function generarTextoContenedores(productos: ProductoRaw[]): string {
  const nums: string[] = [];
  for (const p of productos) {
    const num = p.datosContenedor?.numeroContenedor?.trim();
    if (num) nums.push(escaparHtml(num));
  }
  return nums.length > 0 ? nums.join(', ') : '(sin contenedores registrados)';
}

// ── Helpers para armar HTML de la notificación de arribo ─────────────────────

interface CargoRaw {
  concepto?: string;
  tipo?: string;
  monto?: number;
  moneda?: string;
}

interface ProductoRaw {
  descripcion?: string;
  tipoEmbalaje?: string;
  piezas?: number;
  peso?: number;
  volumen?: number;
  datosContenedor?: {
    numeroContenedor?: string;
    numeroSello?: string;
  };
}

const KG_A_LB = 2.20462;

/**
 * Genera las filas HTML de la tabla de contenedores/productos para la plantilla.
 *
 * Cada producto del embarque genera una fila: contenedor y sello (si existe),
 * bultos, descripción, peso en kg y lb, y volumen.
 */
function generarTablaContenedores(productos: ProductoRaw[]): string {
  if (!productos.length) {
    return '<tr><td colspan="6" style="text-align:center;color:#999;padding:10px;">Sin productos registrados</td></tr>';
  }
  return productos.map(p => {
    const cont = p.datosContenedor;
    const contSello = cont?.numeroContenedor
      ? `${escaparHtml(cont.numeroContenedor)}${cont.numeroSello ? ` / ${escaparHtml(cont.numeroSello)}` : ''}`
      : '';
    const pesoKg = p.peso ?? 0;
    const pesoLb = Math.round(pesoKg * KG_A_LB * 100) / 100;
    return `<tr>
      <td>${contSello}</td>
      <td>${p.piezas ?? ''} ${escaparHtml(p.tipoEmbalaje ?? '')}</td>
      <td>${escaparHtml(p.descripcion ?? '')}</td>
      <td class="right">${formatearMonto(pesoKg)}</td>
      <td class="right">${formatearMonto(pesoLb)}</td>
      <td class="right">${p.volumen ? formatearMonto(p.volumen) : ''}</td>
    </tr>`;
  }).join('\n');
}

/**
 * Genera las filas HTML de la tabla de cargos de venta y los totales por moneda.
 *
 * §4.3: los totales nunca se mezclan. Un total por cada moneda presente.
 *
 * NOTA: por defecto se incluyen TODOS los cargos de venta (tipo === 'ingreso').
 * Vermur está por confirmar cuáles van (pregunta G18). La función
 * `cargosParaArribo` en el frontend filtra de la misma forma; si hay que
 * cambiar el filtro, se cambia en un solo lugar.
 */
function generarTablaCargos(
  cargos: CargoRaw[],
): { tablaCargos: string; totalPorMoneda: string } {
  // Solo cargos de venta
  const ingresos = cargos.filter(c => c.tipo === 'ingreso' && (c.monto ?? 0) > 0);

  if (!ingresos.length) {
    return {
      tablaCargos: '<tr><td colspan="2" style="text-align:center;color:#999;padding:8px;">Sin cargos de venta</td></tr>',
      totalPorMoneda: '',
    };
  }

  // Agrupar totales por moneda
  const totales: Record<string, number> = {};
  const filas = ingresos.map(c => {
    const moneda = c.moneda ?? 'USD';
    totales[moneda] = (totales[moneda] ?? 0) + (c.monto ?? 0);
    return `<tr>
      <td>${escaparHtml(c.concepto ?? '')}</td>
      <td class="right">${moneda} ${formatearMonto(c.monto ?? 0)}</td>
    </tr>`;
  });

  // Fila de total por moneda
  const monedas = Object.keys(totales).sort();
  for (const mon of monedas) {
    filas.push(`<tr class="total-row">
      <td>TOTAL ${mon}</td>
      <td class="right">${mon} ${formatearMonto(totales[mon])}</td>
    </tr>`);
  }

  // Bloque de "PLEASE PAY THIS AMOUNT"
  const bloqueTotal = monedas.map(mon =>
    `<div class="pay-total">
      <span class="pay-label">Please Pay This Amount (${mon})</span>
      <span class="pay-amount">${mon} ${formatearMonto(totales[mon])}</span>
    </div>`,
  ).join('\n');

  return { tablaCargos: filas.join('\n'), totalPorMoneda: bloqueTotal };
}

/**
 * Arma el payload de datos para la plantilla a partir del embarque.
 * Cada tipo de documento usará campos distintos; la plantilla decide cuáles.
 */
function armarDatos(
  tipo: TipoDocEmbarque,
  embarque: Record<string, unknown>,
  empresa: ConfiguracionEmpresa,
  fechaGen: string,
  nombreUsuario: string,
): Record<string, unknown> {
  const entidades = (embarque.entidades ?? {}) as Record<string, string>;
  const ruta = (embarque.ruta ?? {}) as Record<string, Record<string, string>>;
  const fechas = (embarque.fechas ?? {}) as Record<string, string>;
  const productos = (embarque.productos ?? []) as ProductoRaw[];

  // Inferir tipo de consolidación del primer producto
  const primerProducto = productos[0] as (ProductoRaw & { tipoConsolidacion?: string }) | undefined;
  const tipoConsolidacion = primerProducto?.tipoConsolidacion ?? '';

  const datos: Record<string, unknown> = {
    empresa,
    embarque: {
      id: embarque.id,
      folio: embarque.folio ?? '',
      modalidad: embarque.modalidad ?? '',
      tipo: embarque.tipo ?? '',
      numeroGuia: embarque.numeroGuia ?? '',
      numeroReservacion: embarque.numeroReservacion ?? '',
      referenciaCliente: embarque.referenciaCliente ?? '',
      descripcionCarga: embarque.descripcionCarga ?? '',
      consignatario: entidades.consignatario ?? '',
      expedidor: entidades.expedidor ?? '',
      notificar: entidades.notificar ?? '',
      agenteAduanal: entidades.agenteAduanal ?? '',
      importador: entidades.importador ?? '',
      clienteCobrar: entidades.clienteCobrar ?? '',
      puertoCarga: ruta.origen?.puertoCarga ?? '',
      puertoDescarga: ruta.destino?.puertoDescarga ?? '',
      transportista: ruta.origen?.transportista ?? '',
      buque: ruta.origen?.buque ?? '',
      viaje: ruta.origen?.viaje ?? '',
      lugarEntrega: ruta.destino?.lugarEntrega ?? '',
      tipoConsolidacion,
      etd: formatearFecha(fechas.salida),
      eta: formatearFecha(fechas.arribo),
      etdCorta: formatearFechaCorta(fechas.salida),
      etaCorta: formatearFechaCorta(fechas.arribo),
    },
    fechaGeneracion: formatearFechaCorta(fechaGen),
    generadoPorNombre: nombreUsuario,
  };

  // Datos específicos de la notificación de arribo
  if (tipo === 'notificacion_arribo') {
    const cargosRaw = ((embarque.cargos as Record<string, unknown>)?.detalles ?? []) as CargoRaw[];
    datos.tablaContenedores = generarTablaContenedores(productos);
    const { tablaCargos, totalPorMoneda } = generarTablaCargos(cargosRaw);
    datos.tablaCargos = tablaCargos;
    datos.totalPorMoneda = totalPorMoneda;
  }

  // Datos específicos de la carta de encomienda / garantía
  if (tipo === 'carta_encomienda') {
    const transportista = ruta.origen?.transportista ?? '';
    const naviera = buscarNaviera(transportista);
    if (naviera) {
      datos.naviera = {
        razonSocial: naviera.razonSocial,
        atencion: naviera.atencion,
      };
    }
    datos.contenedores = generarTextoContenedores(productos);
    // Días libres de demora (para HMM y MSC)
    (datos.embarque as Record<string, unknown>).diasLibresDemora =
      embarque.diasLibresDemora ?? '';
  }

  return datos;
}

/**
 * Cuenta las versiones existentes de un tipo de documento en el embarque para
 * determinar el número de la siguiente.
 */
function siguienteVersion(
  documentosGenerados: DocumentoGenerado[] | undefined,
  tipo: TipoDocEmbarque,
): number {
  if (!documentosGenerados?.length) return 1;
  const delTipo = documentosGenerados.filter(d => d.tipo === tipo);
  if (!delTipo.length) return 1;
  return Math.max(...delTipo.map(d => d.version)) + 1;
}

// ── La Function ──────────────────────────────────────────────────────────────

export const generarDocumento = onRequest(
  {
    region: 'us-central1',
    secrets: [VERMUR_N8N_TOKEN],
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
    maxInstances: 10,
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Solo se acepta POST.' });
      return;
    }

    // ── Auth ─────────────────────────────────────────────────────────────
    let usuario;
    try {
      usuario = await verificarUsuario(req);
      exigirCapacidad(usuario, 'embarque.generar');
    } catch (err) {
      const e = err as ErrorAuth;
      res.status(e.status ?? 401).json({ ok: false, error: e.message });
      return;
    }

    // ── Validar payload ──────────────────────────────────────────────────
    const { tipo, embarqueId, parametros } = (req.body ?? {}) as Partial<PayloadRequest>;

    if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
      res.status(400).json({
        ok: false,
        error: `Tipo de documento inválido: «${tipo ?? '(vacío)'}». Válidos: ${TIPOS_VALIDOS.join(', ')}.`,
      });
      return;
    }
    if (!embarqueId || typeof embarqueId !== 'string') {
      res.status(400).json({ ok: false, error: 'Falta el embarqueId.' });
      return;
    }

    const secreto = VERMUR_N8N_TOKEN.value();
    if (!secreto) {
      logger.error('VERMUR_N8N_TOKEN no está configurado');
      res.status(500).json({ ok: false, error: 'El servidor no tiene configurado el acceso al generador.' });
      return;
    }

    // ── Leer datos ───────────────────────────────────────────────────────
    const db = getFirestore();
    let embarqueData: Record<string, unknown>;
    let documentosExistentes: DocumentoGenerado[] | undefined;

    try {
      const snap = await db.doc(`embarques/${embarqueId}`).get();
      if (!snap.exists) {
        res.status(404).json({ ok: false, error: `Embarque ${embarqueId} no encontrado.` });
        return;
      }
      embarqueData = { id: snap.id, ...(snap.data() as Record<string, unknown>) };
      documentosExistentes = embarqueData.documentosGenerados as DocumentoGenerado[] | undefined;
    } catch (err) {
      logger.error('Error leyendo embarque', { embarqueId, err: String(err) });
      res.status(500).json({ ok: false, error: 'Error al leer el embarque.' });
      return;
    }

    let empresa: ConfiguracionEmpresa;
    try {
      empresa = await leerEmpresa();
    } catch (err) {
      logger.error('Error leyendo configuración empresa', { err: String(err) });
      res.status(500).json({ ok: false, error: 'Error al leer la configuración de la empresa.' });
      return;
    }

    // ── Renderizar plantilla ─────────────────────────────────────────────
    const fechaGen = new Date().toISOString();
    const nombreUsuario = usuario.email;
    const version = siguienteVersion(documentosExistentes, tipo);

    // ── Resolver plantilla ────────────────────────────────────────────
    // Para carta_encomienda, la plantilla depende de la naviera del embarque.
    let nombrePlantilla = tipo as string;
    if (tipo === 'carta_encomienda') {
      const ruta = (embarqueData.ruta ?? {}) as Record<string, Record<string, string>>;
      const transportista = ruta.origen?.transportista ?? '';
      const naviera = buscarNaviera(transportista);
      if (!naviera) {
        res.status(400).json({
          ok: false,
          error: `La naviera «${transportista || '(vacía)'}» no tiene plantilla de carta encomienda disponible.`,
        });
        return;
      }
      nombrePlantilla = naviera.clave;
    }

    let html: string;
    try {
      const plantilla = leerPlantilla(nombrePlantilla);
      const datos = armarDatos(tipo, embarqueData, empresa, fechaGen, nombreUsuario);
      // Los parámetros de la carta de encomienda (aduana, patente) se mezclan
      if (parametros) Object.assign(datos, { parametros });
      html = renderizar(plantilla, datos);
    } catch (err) {
      logger.error('Error renderizando plantilla', { tipo, nombrePlantilla, err: String(err) });
      res.status(500).json({
        ok: false,
        error: `No se pudo renderizar la plantilla «${nombrePlantilla}». Verifica que exista en el repo.`,
      });
      return;
    }

    // ── Llamar a n8n ─────────────────────────────────────────────────────
    const folio = (embarqueData.folio as string) ?? embarqueId;
    const nombreArchivo = `${folio}-${tipo}-v${version}`;

    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), TIMEOUT_MS);
    let pdfBuffer: Buffer;

    try {
      logger.info('Generando documento', { tipo, embarqueId, version, uid: usuario.uid });

      const respuesta = await fetch(N8N_WEBHOOK_URL_GENERAR_DOC.value(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vermur-Token': secreto,
        },
        body: JSON.stringify({
          html,
          nombreArchivo,
          tipo,
          pagina: 'letter',
        }),
        signal: control.signal,
      });

      if (!respuesta.ok) {
        const texto = await respuesta.text();
        logger.error('n8n respondió con error', {
          flujo: 'generar-documento', status: respuesta.status,
          rechazoDeToken: esRechazoDeToken(respuesta.status),
          texto: texto.slice(0, MAX_LOG),
        });
        res.status(502).json({ ok: false, error: mensajeDeError(respuesta.status, 'documento-general') });
        return;
      }

      pdfBuffer = Buffer.from(await respuesta.arrayBuffer());

      const contentType = respuesta.headers.get('content-type') ?? '';
      logger.info('n8n devolvió un archivo', {
        flujo: 'generar-documento', status: respuesta.status,
        contentType, bytes: pdfBuffer.length,
        primerosBytes: pdfBuffer.subarray(0, 8).toString('latin1'),
      });

      if (pdfBuffer.length === 0 || contentType.includes('application/json')) {
        logger.error('n8n devolvió vacío o JSON donde se esperaba PDF');
        res.status(502).json({
          ok: false,
          error: `${nombreDelAgente('documento-general')} respondió sin el archivo. Avisa a sistemas.`,
        });
        return;
      }

      if (!pdfBuffer.subarray(0, 5).toString('latin1').startsWith('%PDF-')) {
        logger.error('n8n devolvió algo que no es PDF', {
          primerosBytes: pdfBuffer.subarray(0, 20).toString('hex'),
        });
        res.status(502).json({
          ok: false,
          error: 'El generador devolvió un archivo que no es un PDF. Avisa a sistemas.',
        });
        return;
      }
    } catch (err) {
      const abortado = (err as Error)?.name === 'AbortError';
      logger.error('Fallo al llamar a n8n', {
        flujo: 'generar-documento', err: String(err), abortado,
      });
      res.status(abortado ? 504 : 502).json({
        ok: false,
        error: abortado
          ? 'El generador de documentos tardó demasiado. Vuelve a intentarlo.'
          : 'No se pudo contactar al generador de documentos. Avisa a sistemas.',
      });
      return;
    } finally {
      clearTimeout(reloj);
    }

    // ── Guardar en Storage ───────────────────────────────────────────────
    const timestamp = Date.now();
    const storagePath = `embarques/${embarqueId}/docs/${tipo}-v${version}-${timestamp}.pdf`;

    let url: string;
    try {
      const bucket = getStorage().bucket();
      const file = bucket.file(storagePath);
      await file.save(pdfBuffer, {
        contentType: 'application/pdf',
        metadata: { metadata: { tipo, version: String(version), embarqueId, generadoPor: usuario.uid } },
      });
      // URL firmada válida por 7 días: lo suficiente para validar y descargar
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      url = signedUrl;
    } catch (err) {
      logger.error('Error guardando en Storage', { storagePath, err: String(err) });
      res.status(500).json({ ok: false, error: 'El PDF se generó pero no se pudo guardar. Vuelve a intentarlo.' });
      return;
    }

    // ── Registrar en el embarque ─────────────────────────────────────────
    const registro: DocumentoGenerado = {
      tipo,
      version,
      storagePath,
      url,
      generadoPor: usuario.uid,
      generadoPorNombre: nombreUsuario,
      fechaGeneracion: fechaGen,
      ...(parametros ? { parametros } : {}),
    };

    try {
      await db.doc(`embarques/${embarqueId}`).update({
        documentosGenerados: FieldValue.arrayUnion(registro),
        updatedAt: fechaGen,
      });
    } catch (err) {
      logger.error('Error actualizando embarque', { embarqueId, err: String(err) });
      // El PDF ya está en Storage; no se pierde
      res.status(500).json({
        ok: false,
        error: 'El PDF se generó y guardó, pero no se pudo registrar en el embarque. El archivo está en Storage.',
        storagePath,
      });
      return;
    }

    logger.info('Documento generado', { tipo, embarqueId, version, storagePath });

    res.status(200).json({
      ok: true,
      documento: registro,
    });
  },
);
