/**
 * operacionServicio.ts
 *
 * Los datos de la OPERACIÓN de un servicio de la cotización —tráfico,
 * ubicación, ruta, aduanas, incoterm, la carga tipada, las mercancías y las
 * notas operativas— editados desde la pestaña Información (Fase A,
 * 24-sep-2026), sin modal.
 *
 * ── De dónde sale ──────────────────────────────────────────────────────────
 * El formulario de solicitud escribe `servicio.carga` (tipada). El modal
 * «Datos del embarque» editaba los campos legacy E4 (`tipo_embarque`,
 * `fcl_*`, `lcl_*`, `ter_*`) y no leía `carga` ni una vez: lo que Ventas
 * capturó no se podía corregir en ninguna parte. Aquí el borrador del
 * formulario y el servicio guardado se traducen en los dos sentidos, con
 * `cargaDesdeLegacy` como fallback para las cotizaciones viejas.
 *
 * Lógica pura: sin React ni Firestore.
 */

import type {
  KanbanQuote, ServicioSolicitado, QuoteActivity,
} from '../components/quotes/QuotesData';
import type { UserRole } from '../auth/users';
import type { DraftServicio } from '../components/quotes/FormCargaServicio';
import { cargaInicial } from '../components/quotes/FormCargaServicio';
import {
  cargaDesdeLegacy, espejoLegacy, type ModalidadSolicitud,
} from './cargaSolicitud';
import type { PipelineStageId } from '../components/quotes/QuotesData';
import { idUnico } from './idUnico';

// ─── Modalidad ↔ tipo ─────────────────────────────────────────────────────────

/**
 * El `tipo` del servicio guarda a veces 'maritimo' y a veces 'aduanal' o
 * 'despacho_aduanal' según de dónde se creó (§6, serviciosStore). Para
 * arrancar una carga tipada hace falta UNA modalidad.
 */
export function modalidadDeTipo(tipo: string | undefined | null): ModalidadSolicitud {
  const t = (tipo ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (t.includes('aere')) return 'aereo';
  if (t.includes('terrestre') || t.includes('camion')) return 'terrestre';
  if (t.includes('aduan') || t.includes('despacho')) return 'despacho_aduanal';
  return 'maritimo';
}

// ─── Servicio ⇄ borrador ─────────────────────────────────────────────────────

const VACIO = new Set(['', 'por definir', '—', '-']);
const limpio = (t: string | undefined | null) => (VACIO.has((t ?? '').trim().toLowerCase()) ? '' : (t ?? ''));

/**
 * El borrador que el formulario sabe pintar, a partir del servicio guardado.
 * Sin `carga` ni campos legacy interpretables, arranca la carga inicial de
 * la modalidad con el peso y volumen planos que sí existen. NO se guarda
 * nada hasta que alguien edita.
 */
export function borradorDeServicio(servicio: ServicioSolicitado): DraftServicio {
  let carga = cargaDesdeLegacy(servicio);
  if (!carga) {
    carga = cargaInicial(modalidadDeTipo(servicio.tipo));
    if ('pesoBrutoKg' in carga) carga = { ...carga, pesoBrutoKg: servicio.peso ?? 0 };
    if (carga.tipo === 'lcl') carga = { ...carga, volumenM3: servicio.volumen ?? 0 };
  }
  return {
    id: servicio.id,
    carga,
    origen: limpio(servicio.ruta?.origen),
    destino: limpio(servicio.ruta?.destino),
    origenPuertoId: servicio.ruta?.origenPuertoId ?? null,
    destinoPuertoId: servicio.ruta?.destinoPuertoId ?? null,
    incoterm: servicio.incoterm || 'FOB',
    mercancia: limpio(servicio.mercancia),
    conceptosRequeridos: (servicio.conceptosRequeridos ?? []).map(r => ({
      ...r, filaId: r.filaId ?? idUnico('req'),
    })),
  };
}

/**
 * El servicio guardado con lo que trae el borrador. Conserva todo lo que el
 * borrador no toca (id, tipo, conceptos, tarifas, aduanas, campos legacy) y
 * mantiene el espejo legacy de peso y volumen para los lectores viejos.
 */
export function servicioDesdeBorrador(servicio: ServicioSolicitado, d: DraftServicio): ServicioSolicitado {
  const espejo = espejoLegacy(d.carga);
  const trafico = d.carga.tipo === 'despacho' ? d.carga.operacion : servicio.trafico;
  return {
    ...servicio,
    carga: d.carga,
    ruta: {
      ...servicio.ruta,
      origen: d.origen || 'Por definir',
      destino: d.destino || 'Por definir',
      origenPuertoId: d.origenPuertoId,
      destinoPuertoId: d.destinoPuertoId,
    },
    incoterm: d.incoterm,
    mercancia: d.mercancia || 'Por definir',
    conceptosRequeridos: d.conceptosRequeridos
      .filter(r => r.conceptoId)
      .map(({ conceptoId, nombre }) => ({ conceptoId, nombre })),
    peso: espejo.peso,
    volumen: espejo.volumen,
    ...(trafico ? { trafico } : {}),
  };
}

// ─── Lo legacy que la carga tipada no representa ─────────────────────────────

/**
 * Campos E4 que `cargaDesdeLegacy` no traduce a la carga tipada. Pierden
 * editor (Fase A) pero NO se esconden: se enseñan como «del registro
 * anterior» para que una cotización vieja no pierda nada visible. Si Gaby
 * los usa para filtrar, se promueven a campos estructurados en otro bloque.
 */
export function legacySinMapear(servicio: ServicioSolicitado): { etiqueta: string; valor: string }[] {
  const s = servicio;
  const out: { etiqueta: string; valor: string }[] = [];
  const si = (v: boolean | undefined) => (v ? 'Sí' : null);
  const campos: [string, string | null | undefined][] = [
    ['Requerimientos especiales', s.fcl_reqs?.trim() || null],
    ['Food grade', si(s.food_grade)],
    ['Reforzado', si(s.reforzado)],
    ['Sobredimensión', si(s.sobredimension)],
    ['Enlonado', si(s.enlonado)],
    ['Atmósfera controlada', si(s.atmos_controlada)],
    ['FTL / LTL', s.ter_tipo ?? null],
    ['Medidas', s.ter_medidas?.trim() || null],
    ['Estibable (terrestre)', s.ter_estibable === undefined ? null : (s.ter_estibable ? 'Sí' : 'No')],
    ['Volumen terrestre (m³)', s.ter_volumen ? String(s.ter_volumen) : null],
  ];
  campos.forEach(([etiqueta, valor]) => { if (valor) out.push({ etiqueta, valor }); });
  return out;
}

// ─── Quién edita ─────────────────────────────────────────────────────────────

/**
 * Ventas edita la operación mientras la solicitud es suya; Pricing y Admin
 * hasta que la cotización se congela (decisión de Mau, 24-sep-2026).
 */
export function puedeEditarOperacion(
  rol: UserRole | undefined | null,
  etapa: PipelineStageId,
  bloqueada: boolean,
): boolean {
  if (bloqueada) return false;
  if (rol === 'ventas') return etapa === 'solicitud_cliente';
  return rol === 'pricing' || rol === 'admin';
}

// ─── Qué cambió, para el Historial ───────────────────────────────────────────

const ETIQUETA_CAMPO: Record<string, string> = {
  carga: 'la carga',
  mercancias: 'el detalle de mercancía',
  ruta: 'la ruta',
  aduanas: 'las aduanas',
  incoterm: 'el incoterm',
  mercancia: 'la descripción de la mercancía',
  trafico: 'el tráfico',
  ubicacion: 'la ubicación',
  generaEmbarquePropio: 'el embarque propio',
  notasOperativas: 'las notas operativas',
};

/** Etiquetas legibles de lo que cambió entre dos versiones del servicio. */
export function camposOperacionCambiados(antes: ServicioSolicitado, despues: ServicioSolicitado): string[] {
  const j = (v: unknown) => JSON.stringify(v ?? null);
  const { mercancias: mA, ...cargaA } = (antes.carga ?? {}) as Record<string, unknown>;
  const { mercancias: mD, ...cargaD } = (despues.carga ?? {}) as Record<string, unknown>;
  const cambios: string[] = [];
  const mira = (clave: string, a: unknown, d: unknown) => { if (j(a) !== j(d)) cambios.push(ETIQUETA_CAMPO[clave]); };
  mira('carga', cargaA, cargaD);
  mira('mercancias', mA, mD);
  mira('ruta', [antes.ruta?.origen, antes.ruta?.destino, antes.ruta?.origenPuertoId, antes.ruta?.destinoPuertoId],
    [despues.ruta?.origen, despues.ruta?.destino, despues.ruta?.origenPuertoId, despues.ruta?.destinoPuertoId]);
  mira('aduanas', [antes.ruta?.aduanaSalida, antes.ruta?.aduanaRecepcion], [despues.ruta?.aduanaSalida, despues.ruta?.aduanaRecepcion]);
  mira('incoterm', antes.incoterm, despues.incoterm);
  mira('mercancia', antes.mercancia, despues.mercancia);
  mira('trafico', antes.trafico, despues.trafico);
  mira('ubicacion', antes.ubicacion, despues.ubicacion);
  mira('generaEmbarquePropio', !!antes.generaEmbarquePropio, !!despues.generaEmbarquePropio);
  mira('notasOperativas', antes.notasOperativas ?? '', despues.notasOperativas ?? '');
  return cambios;
}

export const TITULO_CAMBIO_OPERACION = 'Datos de la operación modificados';
/** Dos ediciones del mismo autor dentro de esta ventana son UNA entrada. */
const VENTANA_MIN = 10;

/** «carga y ruta» a partir de los campos acumulados. */
function fraseDe(campos: string[]): string {
  const unicos = [...new Set(campos)];
  if (unicos.length === 1) return unicos[0];
  return `${unicos.slice(0, -1).join(', ')} y ${unicos[unicos.length - 1]}`;
}

/**
 * Deja constancia en Historial / Notas de que la operación cambió después de
 * salir de Ventas: «para que Pricing vea si le cambiaron la mercancía a media
 * cotización». Cada tecla dispara un guardado, así que las ediciones del
 * mismo autor en diez minutos se acumulan en UNA entrada en vez de llenar el
 * historial de renglones.
 */
export function anotarCambioOperacion(
  quote: KanbanQuote,
  campos: string[],
  autorId: string,
  ahoraIso: string,
): KanbanQuote {
  if (campos.length === 0) return quote;
  const fecha = ahoraIso.slice(0, 16).replace('T', ' ');
  // createdAt se guarda como «YYYY-MM-DD HH:mm» sin zona: se compara con la
  // misma lectura para no mezclar local con UTC.
  const ahora = new Date(fecha.replace(' ', 'T')).getTime();
  const actividades = quote.actividades ?? [];
  const reciente = [...actividades].reverse().find(a =>
    a.tipo === 'nota'
    && a.titulo === TITULO_CAMBIO_OPERACION
    && a.responsableId === autorId
    && ahora - new Date(a.createdAt.replace(' ', 'T')).getTime() < VENTANA_MIN * 60_000,
  );
  if (reciente) {
    const previos = reciente.descripcion.replace(/^Se cambió /, '').replace(/\.$/, '').split(/, | y /);
    const descripcion = `Se cambió ${fraseDe([...previos, ...campos])}.`;
    return {
      ...quote,
      actividades: actividades.map(a => (a.id === reciente.id ? { ...a, descripcion } : a)),
    };
  }
  const nota: QuoteActivity = {
    id: idUnico('act-op'),
    titulo: TITULO_CAMBIO_OPERACION,
    descripcion: `Se cambió ${fraseDe(campos)}.`,
    responsableId: autorId,
    fechaLimite: fecha.split(' ')[0],
    estado: 'hecha',
    tipo: 'nota',
    createdAt: fecha,
  };
  return { ...quote, actividades: [...actividades, nota] };
}
