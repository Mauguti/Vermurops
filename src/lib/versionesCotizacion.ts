/**
 * versionesCotizacion.ts (V-1)
 *
 * «Ventas regresa la cotización, Pricing hace la v2, y la v1 queda como
 * registro.»
 *
 * ── El modelo ──────────────────────────────────────────────────────────────
 * El documento `cotizaciones/{id}` ES la versión viva. Se sigue editando como
 * siempre: el Kanban, la bandeja, el embarque y todo lo que ya lo lee no se
 * enteran de que existen versiones.
 *
 * «Nueva versión» toma una FOTO de la versión viva y la guarda inmutable en
 * `cotizaciones/{id}/versiones/{n}`. La raíz sigue siendo la misma, ahora
 * numerada n+1, y Pricing la edita desde donde estaba. En la raíz queda solo
 * el resumen de cada foto, para pintar el selector sin leerlas.
 *
 * Por qué subcolección y no embebido: el Kanban escucha la colección entera.
 * Una cotización trabajada pesa ~57 KB en Firestore; embebiendo sus versiones,
 * cada sesión bajaría todas las fotos de todas las cotizaciones.
 *
 * ── Reglas ─────────────────────────────────────────────────────────────────
 *   · Solo quien cotiza versiona: Pricing y Admin (`cotizacion.crear`).
 *     Ventas REGRESA la cotización; no la reescribe (§4.1).
 *   · No se versiona una cotización congelada: ya generó embarque, y una v2
 *     divergiría de lo que se va a cobrar y pagar (§4.8).
 *   · Sí se versiona una perdida: se reabre, y el historial lo dice —
 *     «v4 · creada tras rechazo».
 *   · La foto NO lleva chat, actividades ni historial de etapas: son la
 *     conversación de la cotización, no su contenido, y siguen corriendo.
 *   · Una versión nunca se edita ni se borra. Restaurar una vieja es crear
 *     una nueva con su contenido.
 *
 * Sin React, sin Firestore, sin red.
 */

import type {
  KanbanQuote, PipelineStageId, StageHistory, QuoteActivity,
} from '../components/quotes/QuotesData';
import type { UserRole } from '../auth/users';
import { puede } from '../auth/permisos';
import { aplanarCotizacion, estaCongelada } from './lineasCotizacion';
import { sumarPorMoneda, formatearPorMoneda, type TotalPorMoneda } from './sumarPorMoneda';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AutorVersion {
  uid: string | null;
  nombre: string;
}

/** Cómo nació una versión. La v1 no tiene: nació con la cotización. */
export interface OrigenVersion {
  numero: number;
  creadaEn: string;
  creadaPor: AutorVersion;
  /** Por qué se hizo. Obligatorio: una v3 sin motivo no le dice nada a nadie. */
  motivo: string;
  /** Se creó sobre una cotización perdida, reabriéndola. */
  trasRechazo: boolean;
  /** Si es una restauración, de qué versión salió su contenido. */
  restauradaDe: number | null;
}

/**
 * Lo que la raíz sabe de una versión congelada, sin leer su foto.
 *
 * Los campos de origen van en null para la v1: no hay motivo ni autor de una
 * versión que nadie «creó».
 */
export interface ResumenVersion {
  numero: number;
  motivo: string | null;
  creadaEn: string | null;
  creadaPor: AutorVersion | null;
  trasRechazo: boolean;
  restauradaDe: number | null;

  congeladaEn: string;
  congeladaPor: AutorVersion;
  etapaAlCongelar: PipelineStageId;
  estadoFinalAlCongelar: KanbanQuote['estadoFinal'];
  /** Venta total POR MONEDA (§4.3): nunca un escalar revuelto. */
  totalPorMoneda: TotalPorMoneda;
  /**
   * Con qué versión de la plantilla se generó su PDF.
   *
   * Reservado: el botón de PDF no existe hasta que exista el editor de
   * plantillas. Queda en null en vez de ausente para que el día que se llene
   * no haga falta migrar nada.
   */
  plantillaVersionId: string | null;
}

/** Campos que NO viajan en la foto. */
export const CAMPOS_FUERA_DE_LA_FOTO = [
  'chat',
  'actividades',
  'historialEtapas',
  // La propia contabilidad de versiones: una foto que se contiene a sí misma
  // crecería con cada versión.
  'versionActual',
  'origenVersion',
  'versiones',
  // Siempre vacío al versionar (una congelada no se versiona), y una foto que
  // lo trajera podría «congelar» a quien la restaure.
  'embarqueIds',
] as const;

type CampoFuera = typeof CAMPOS_FUERA_DE_LA_FOTO[number];

/** El contenido de la cotización tal como estaba al congelarse. */
export type FotoCotizacion = Omit<KanbanQuote, CampoFuera>;

/** Lo que se escribe en `cotizaciones/{id}/versiones/{n}`. */
export interface DocumentoVersion {
  cotizacionId: string;
  numero: number;
  resumen: ResumenVersion;
  foto: FotoCotizacion;
}

/**
 * Lo que se restaura de una foto: el CONTENIDO cotizado.
 *
 * No la etapa, el cliente ni los responsables: esos son el estado actual de
 * la operación, y restaurar la v1 no debe devolver la cotización a la etapa
 * en la que estaba hace dos semanas.
 */
export const CAMPOS_RESTAURABLES = [
  'servicios',
  'tipoCambio',
  'valorTotalConsolidado',
  'moneda',
] as const;

// ─── Lectura ──────────────────────────────────────────────────────────────────

/** Número de la versión viva. Sin el campo, es la v1. */
export function numeroVersionActual(quote: Pick<KanbanQuote, 'versionActual'>): number {
  return quote.versionActual ?? 1;
}

/** Venta total por moneda, con las MISMAS líneas que pinta la ficha. */
export function totalPorMonedaDe(quote: KanbanQuote): TotalPorMoneda {
  return sumarPorMoneda(aplanarCotizacion(quote), l => l.venta, l => l.moneda);
}

/** Copia sin las partes que no viajan. Profunda: la foto no comparte nada. */
export function fotoDeCotizacion(quote: KanbanQuote): FotoCotizacion {
  const copia = JSON.parse(JSON.stringify(quote)) as Record<string, unknown>;
  for (const campo of CAMPOS_FUERA_DE_LA_FOTO) delete copia[campo];
  return copia as FotoCotizacion;
}

// ─── Reglas ───────────────────────────────────────────────────────────────────

export type Veredicto = { ok: true } | { ok: false; razon: string };

export function puedeVersionar(
  quote: KanbanQuote,
  rol: UserRole | null | undefined,
): Veredicto {
  if (!puede(rol, 'cotizacion.crear')) {
    return { ok: false, razon: 'Solo Pricing puede hacer una nueva versión. Ventas la regresa; Pricing la rehace.' };
  }
  if (estaCongelada(quote)) {
    return {
      ok: false,
      razon: 'Esta cotización ya generó embarque y quedó congelada. Una nueva versión divergiría de lo que se va a cobrar y pagar.',
    };
  }
  return { ok: true };
}

// ─── Nueva versión ────────────────────────────────────────────────────────────

export interface OpcionesNuevaVersion {
  motivo: string;
  autor: AutorVersion;
  rol: UserRole | null | undefined;
  /** ISO. Se inyecta para que la función sea pura. */
  ahora: string;
}

export type PlanVersion =
  | {
      ok: true;
      /** La foto de la versión que se congela. Va a la subcolección. */
      documento: DocumentoVersion;
      /** Lo que cambia en la raíz. */
      patch: Partial<KanbanQuote>;
    }
  | { ok: false; razon: string };

/**
 * Congela la versión viva y abre la siguiente.
 *
 * No escribe nada: devuelve la foto y el patch, para que el hook los escriba
 * JUNTOS en una transacción. Una foto sin su resumen en la raíz sería
 * invisible; un resumen sin su foto, un enlace roto.
 */
export function planearNuevaVersion(
  quote: KanbanQuote,
  opciones: OpcionesNuevaVersion,
): PlanVersion {
  return planear(quote, opciones, null);
}

/**
 * Restaura una versión vieja: crea una NUEVA con su contenido.
 *
 * La viva se congela primero, así que nada se pierde: restaurar la v1 estando
 * en la v3 deja v1, v2 y v3 intactas y abre una v4 igual a la v1.
 */
export function planearRestauracion(
  quote: KanbanQuote,
  version: DocumentoVersion,
  opciones: OpcionesNuevaVersion,
): PlanVersion {
  if (version.cotizacionId !== quote.id) {
    return { ok: false, razon: `La versión es de ${version.cotizacionId}, no de ${quote.id}.` };
  }
  return planear(quote, opciones, version);
}

function planear(
  quote: KanbanQuote,
  { motivo, autor, rol, ahora }: OpcionesNuevaVersion,
  restaurarDe: DocumentoVersion | null,
): PlanVersion {
  const veredicto = puedeVersionar(quote, rol);
  // `'razon' in`, no `!ok`: sin `strict` en tsconfig, el booleano no estrecha.
  if ('razon' in veredicto) return { ok: false, razon: veredicto.razon };

  const motivoLimpio = motivo.trim();
  if (!motivoLimpio) {
    return { ok: false, razon: 'Escribe el motivo: es lo que dirá el historial de por qué existe esta versión.' };
  }

  const n = numeroVersionActual(quote);
  const origen = quote.origenVersion;

  const resumen: ResumenVersion = {
    numero: n,
    // Lo que la versión que se congela sabía de sí misma. La v1 no lo tiene.
    motivo: origen?.motivo ?? null,
    creadaEn: origen?.creadaEn ?? (quote.createdAt || null),
    creadaPor: origen?.creadaPor ?? null,
    trasRechazo: origen?.trasRechazo ?? false,
    restauradaDe: origen?.restauradaDe ?? null,

    congeladaEn: ahora,
    congeladaPor: autor,
    etapaAlCongelar: quote.etapa,
    estadoFinalAlCongelar: quote.estadoFinal,
    totalPorMoneda: totalPorMonedaDe(quote),
    plantillaVersionId: null,
  };

  const documento: DocumentoVersion = {
    cotizacionId: quote.id,
    numero: n,
    resumen,
    foto: fotoDeCotizacion(quote),
  };

  const siguiente = n + 1;
  const trasRechazo = quote.etapa === 'perdida';
  const fecha = ahora.slice(0, 16).replace('T', ' ');

  const nuevoOrigen: OrigenVersion = {
    numero: siguiente,
    creadaEn: ahora,
    creadaPor: autor,
    motivo: motivoLimpio,
    trasRechazo,
    restauradaDe: restaurarDe?.numero ?? null,
  };

  const descripcion = restaurarDe
    ? `Restaurada desde v${restaurarDe.numero}. ${motivoLimpio}`
    : motivoLimpio;

  const actividad: QuoteActivity = {
    id: `act-ver-${siguiente}-${Date.parse(ahora) || 0}`,
    titulo: trasRechazo
      ? `Nueva versión v${siguiente} · creada tras rechazo`
      : `Nueva versión v${siguiente}`,
    descripcion: `${descripcion} (v${n} quedó como registro.)`,
    responsableId: autor.uid ?? autor.nombre,
    fechaLimite: fecha.split(' ')[0],
    estado: 'hecha',
    // «cambio_etapa» es lo que la bitácora de notas ya pinta como evento del
    // sistema; un tipo nuevo no se vería en ninguna parte.
    tipo: 'cambio_etapa',
    createdAt: fecha,
  };

  const patch: Partial<KanbanQuote> = {
    versionActual: siguiente,
    origenVersion: nuevoOrigen,
    versiones: [...(quote.versiones ?? []), resumen],
    updatedAt: fecha,
    actividades: [...(quote.actividades ?? []), actividad],
  };

  if (restaurarDe) {
    const foto = restaurarDe.foto as unknown as Record<string, unknown>;
    const contenido: Record<string, unknown> = {};
    for (const campo of CAMPOS_RESTAURABLES) {
      if (foto[campo] !== undefined) contenido[campo] = JSON.parse(JSON.stringify(foto[campo]));
    }
    Object.assign(patch, contenido);
  }

  /*
   * Una perdida es terminal: la máquina de estados no tiene salidas desde
   * ahí. Versionarla es REABRIRLA, así que vuelve a la etapa donde Pricing
   * rehace números. ⚠️ Decisión marcada (10-sep-2026): se eligió
   * `cotizaciones_recibidas` por ser la etapa de trabajo de Pricing; la ganada
   * sin embarque NO se toca, porque su nueva versión es la que se va a operar.
   */
  if (trasRechazo) {
    const reapertura: StageHistory = {
      etapa: 'cotizaciones_recibidas',
      fecha,
      nota: `Reabierta como v${siguiente} tras rechazo: ${motivoLimpio}`,
    };
    Object.assign(patch, {
      etapa: 'cotizaciones_recibidas' as PipelineStageId,
      estadoFinal: null,
      motivoPerdida: null,
      historialEtapas: [...(quote.historialEtapas ?? []), reapertura],
    });
  }

  return { ok: true, documento, patch };
}

// ─── Presentación ─────────────────────────────────────────────────────────────

export interface OpcionVersion {
  numero: number;
  esActual: boolean;
  /** «v3 (actual)», «v2», «v4 · creada tras rechazo». */
  etiqueta: string;
  /** Una línea para el tooltip o el aviso: quién, cuándo, por qué. */
  detalle: string;
}

function etiqueta(numero: number, esActual: boolean, trasRechazo: boolean): string {
  let texto = `v${numero}`;
  if (esActual) texto += ' (actual)';
  if (trasRechazo) texto += ' · creada tras rechazo';
  return texto;
}

function fechaCorta(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

/**
 * Las opciones del selector del encabezado, de la más nueva a la más vieja.
 *
 * Vacío cuando la cotización nunca se versionó: un selector con una sola
 * opción es un control que no controla nada.
 */
export function opcionesSelector(quote: KanbanQuote): OpcionVersion[] {
  const pasadas = quote.versiones ?? [];
  if (pasadas.length === 0) return [];

  const actual = numeroVersionActual(quote);
  const origen = quote.origenVersion;

  const viva: OpcionVersion = {
    numero: actual,
    esActual: true,
    etiqueta: etiqueta(actual, true, origen?.trasRechazo ?? false),
    detalle: origen
      ? `${origen.creadaPor.nombre} · ${fechaCorta(origen.creadaEn)} · ${origen.motivo}`
      : '',
  };

  const viejas = [...pasadas]
    .sort((a, b) => b.numero - a.numero)
    .map<OpcionVersion>(r => ({
      numero: r.numero,
      esActual: false,
      etiqueta: etiqueta(r.numero, false, r.trasRechazo),
      detalle: [
        r.motivo ?? 'Versión original',
        `congelada ${fechaCorta(r.congeladaEn)} por ${r.congeladaPor.nombre}`,
        formatearPorMoneda(r.totalPorMoneda, { vacio: 'sin montos' }),
      ].join(' · '),
    }));

  return [viva, ...viejas];
}

/**
 * La cotización como se veía en esa versión, para pintarla en solo lectura.
 *
 * La foto no trae chat, actividades ni historial: se toman de la viva, porque
 * la conversación es una sola y no tiene sentido mostrar la de hace dos
 * semanas cortada a la mitad. La contabilidad de versiones también es la
 * viva, para que el selector siga ofreciendo todas.
 */
export function vistaDeVersion(quote: KanbanQuote, version: DocumentoVersion): KanbanQuote {
  return {
    ...(version.foto as KanbanQuote),
    id: quote.id,
    chat: quote.chat,
    actividades: quote.actividades,
    historialEtapas: quote.historialEtapas,
    versionActual: quote.versionActual,
    origenVersion: quote.origenVersion,
    versiones: quote.versiones,
    embarqueIds: quote.embarqueIds,
  };
}
