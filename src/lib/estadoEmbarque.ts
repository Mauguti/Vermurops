/**
 * estadoEmbarque.ts
 *
 * Estado operativo del embarque, para el Kanban y para distinguir lo recién
 * llegado de lo ya trabajado.
 *
 * ── De dónde sale ──────────────────────────────────────────────────────────
 * Sesión 30-ago-2026. Gabi: «cómo distingue Operaciones que es un embarque que
 * les acaba de enviar Ventas, y no un embarque que ellos ya abrieron».
 *
 * El estado NO se guarda como campo aparte: se deriva de los cierres y de
 * requiereCaptura, que ya existen. Un estado duplicado es un estado que se
 * desincroniza.
 */

import { EmbarqueCompleto } from '../components/shipments/EmbarquesData';

export type EstadoEmbarque = 'nuevo' | 'en_proceso' | 'finalizado';

export const ETAPAS_EMBARQUE: { id: EstadoEmbarque; label: string; descripcion: string }[] = [
  { id: 'nuevo',      label: 'Nuevo',      descripcion: 'Llegó de una cotización ganada y le falta captura operativa.' },
  { id: 'en_proceso', label: 'En proceso', descripcion: 'Operaciones ya lo trabajó; falta cerrarlo.' },
  { id: 'finalizado', label: 'Finalizado', descripcion: 'Con los tres cierres completos.' },
];

/**
 * Estado de un embarque.
 *
 *  - finalizado: los tres cierres hechos (§4.7: operativo → pago → administrativo)
 *  - nuevo:      nació automáticamente y nadie ha capturado nada todavía
 *  - en_proceso: todo lo demás
 */
export function estadoDe(e: EmbarqueCompleto): EstadoEmbarque {
  const c = e.cierres;
  if (c?.operativo && c?.pago && c?.administrativo) return 'finalizado';
  if (e.requiereCaptura) return 'nuevo';
  return 'en_proceso';
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

/** Agrupa para el Kanban, respetando el orden de las etapas. */
export function agruparPorEstado(
  embarques: EmbarqueCompleto[],
): { estado: EstadoEmbarque; label: string; embarques: EmbarqueCompleto[] }[] {
  return ETAPAS_EMBARQUE.map(et => ({
    estado: et.id,
    label: et.label,
    embarques: embarques.filter(e => estadoDe(e) === et.id),
  }));
}
