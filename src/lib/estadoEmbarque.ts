/**
 * estadoEmbarque.ts
 *
 * La etapa operativa del embarque: el Kanban, el badge de la lista y el
 * avance de la ficha.
 *
 * ── Las cinco etapas (reunión con el cliente, 10-sep-2026) ─────────────────
 *
 *     Nuevo · Cargado · En tránsito · En destino · Entregado
 *
 * Antes eran tres (nuevo, en proceso, finalizado), derivadas de los cierres
 * y de `requiereCaptura`. Las tres se mapean sin dejar nada en el limbo:
 *   - «nuevo» sigue siendo nuevo
 *   - «en proceso» se reparte según dónde esté la carga: en tránsito si
 *     Operaciones la puso en tránsito, en destino si además ya pasó la ETA,
 *     y cargado si todavía no sale
 *   - «finalizado» va a entregado
 *
 * ── Derivada, con override explícito ───────────────────────────────────────
 * La etapa se DERIVA de lo que ya existe (cierres, tránsito, ETA, captura) y
 * Operaciones puede fijarla a mano en `etapaOperativa` cuando la realidad va
 * adelante de los datos (la carga ya está en destino y nadie capturó la ETA).
 * Lo que no se puede es contradecir un cierre: con el cierre operativo hecho,
 * la carga se entregó y la etapa es entregado, diga lo que diga el override.
 */

import { EmbarqueCompleto } from '../components/shipments/EmbarquesData';

export type EstadoEmbarque = 'nuevo' | 'cargado' | 'en_transito' | 'en_destino' | 'entregado';

export const ETAPAS_EMBARQUE: {
  id: EstadoEmbarque; label: string; descripcion: string;
  /** Clases del badge, para que la etiqueta se vea igual en lista, kanban y ficha. */
  badge: string;
}[] = [
  { id: 'nuevo',       label: 'Nuevo',       descripcion: 'Llegó de una cotización ganada y le falta captura operativa.', badge: 'bg-gray-100 text-gray-700 border-gray-200' },
  { id: 'cargado',     label: 'Cargado',     descripcion: 'Con guía o reservación; la carga todavía no sale.',           badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  { id: 'en_transito', label: 'En tránsito', descripcion: 'La carga salió y va en camino.',                               badge: 'bg-primario/5 text-primario-hover border-primario/20' },
  { id: 'en_destino',  label: 'En destino',  descripcion: 'Llegó: en puerto, aeropuerto o aduana de destino.',           badge: 'bg-amber-50 text-amber-800 border-amber-300' },
  { id: 'entregado',   label: 'Entregado',   descripcion: 'La carga se entregó (cierre operativo).',                     badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
];

export const ETAPA_MAP: Record<EstadoEmbarque, typeof ETAPAS_EMBARQUE[number]> =
  Object.fromEntries(ETAPAS_EMBARQUE.map(e => [e.id, e])) as Record<EstadoEmbarque, typeof ETAPAS_EMBARQUE[number]>;

const ES_ETAPA = new Set<string>(ETAPAS_EMBARQUE.map(e => e.id));

export function esEtapa(v: unknown): v is EstadoEmbarque {
  return typeof v === 'string' && ES_ETAPA.has(v);
}

/**
 * Etapa de un embarque.
 *
 *  1. Cierre operativo hecho → entregado. Manda sobre todo lo demás.
 *  2. `etapaOperativa` fijada a mano → esa.
 *  3. Nació de una cotización y nadie capturó nada → nuevo.
 *  4. En tránsito con la ETA ya pasada → en destino; en tránsito → en tránsito.
 *  5. Lo demás → cargado.
 *
 * `hoy` se inyecta (YYYY-MM-DD) para poder probar el corte por ETA.
 */
export function estadoDe(e: EmbarqueCompleto, hoy: string = hoyISO()): EstadoEmbarque {
  if (e.cierres?.operativo) return 'entregado';
  if (esEtapa(e.etapaOperativa)) return e.etapaOperativa;
  if (e.requiereCaptura) return 'nuevo';
  if (e.enTransito) {
    const eta = (e.fechas?.arribo ?? '').slice(0, 10);
    return eta && eta <= hoy ? 'en_destino' : 'en_transito';
  }
  return 'cargado';
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * ¿Ya tiene la captura mínima para dejar de ser «nuevo»?
 *
 * Guía y reservación son lo primero que Operaciones consigue del transportista;
 * sin eso el embarque no se puede rastrear ni referir con el proveedor.
 */
export function tieneCapturaMinima(e: EmbarqueCompleto): boolean {
  return Boolean(e.numeroGuia?.trim()) || Boolean(e.numeroReservacion?.trim());
}

/**
 * Qué escribir para mover un embarque a una etapa a mano.
 *
 * Mover a entregado NO cierra el operativo: el cierre es una decisión con
 * consecuencias (§4.7) y se toma en su sección. Se fija el override y ya.
 * Mover a una etapa anterior a «nuevo» no existe: nuevo es nacer.
 */
export function patchParaEtapa(e: EmbarqueCompleto, etapa: EstadoEmbarque): Partial<EmbarqueCompleto> | { error: string } {
  if (e.cierres?.operativo && etapa !== 'entregado') {
    return { error: 'El cierre operativo ya está hecho: la carga se entregó. Para regresarla, reabre el cierre.' };
  }
  const patch: Partial<EmbarqueCompleto> = { etapaOperativa: etapa };
  // Poner en tránsito o más allá implica que salió; regresar a cargado, que no.
  if (etapa === 'en_transito' || etapa === 'en_destino') patch.enTransito = true;
  if (etapa === 'cargado' || etapa === 'nuevo') patch.enTransito = false;
  if (etapa !== 'nuevo') patch.requiereCaptura = false;
  return patch;
}

/** Agrupa para el Kanban, respetando el orden de las etapas. */
export function agruparPorEstado(
  embarques: EmbarqueCompleto[],
  hoy?: string,
): { estado: EstadoEmbarque; label: string; embarques: EmbarqueCompleto[] }[] {
  return ETAPAS_EMBARQUE.map(et => ({
    estado: et.id,
    label: et.label,
    embarques: embarques.filter(e => estadoDe(e, hoy) === et.id),
  }));
}
