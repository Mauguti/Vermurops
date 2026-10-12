/**
 * Fechas deseadas por el cliente (tarea 101).
 *
 * Ventas captura cuándo quiere el cliente que se RECOJA y cuándo que se
 * ENTREGUE. Son opcionales y son del cliente: en el embarque se muestran como
 * «solicitadas» y NUNCA pisan ETD, ETA ni las fechas reales, que son de
 * Operaciones. El embarque no guarda copia: las lee de su cotización.
 */

import { hoyLocal } from './formularioPagoProveedor';

export interface FechasDeseadas {
  fechaRecoleccionDeseada?: string | null;
  fechaEntregaDeseada?: string | null;
}

export interface ProblemasFechasDeseadas {
  /** Bloquea el guardado. */
  error: string | null;
  /** Solo informan. */
  avisos: string[];
}

const FORMATO = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD válido o null. Vacío, basura y fechas imposibles (2026-02-31) son «sin fecha». */
export function leerFechaDeseada(v: unknown): string | null {
  if (typeof v !== 'string' || !FORMATO.test(v)) return null;
  const [a, m, d] = v.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? v : null;
}

export function fechasDeseadasDe(q: FechasDeseadas | null | undefined): { recoleccion: string | null; entrega: string | null } {
  return {
    recoleccion: leerFechaDeseada(q?.fechaRecoleccionDeseada),
    entrega: leerFechaDeseada(q?.fechaEntregaDeseada),
  };
}

/**
 * La entrega antes de la recolección es un error (bloquea). Una fecha pasada
 * solo avisa: hay cotizaciones que se capturan tarde.
 */
export function problemasFechasDeseadas(
  recoleccion: string | null | undefined,
  entrega: string | null | undefined,
  hoy: string = hoyLocal(),
): ProblemasFechasDeseadas {
  const r = leerFechaDeseada(recoleccion);
  const e = leerFechaDeseada(entrega);
  const avisos: string[] = [];
  if (r && r < hoy) avisos.push('La fecha de recolección ya pasó.');
  if (e && e < hoy) avisos.push('La fecha de entrega ya pasó.');
  const error = r && e && e < r ? 'La entrega no puede ser antes de la recolección.' : null;
  return { error, avisos };
}

/** «12 oct 2026» sin pasar por Date local (YYYY-MM-DD no es una hora). */
export function formatearFechaDeseada(f: string | null | undefined): string {
  const v = leerFechaDeseada(f);
  if (!v) return '—';
  const [a, m, d] = v.split('-').map(Number);
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d} ${meses[m - 1]} ${a}`;
}

/** Para el PDF: una línea, o '' si no hay ninguna. */
export function textoFechasDeseadas(q: FechasDeseadas | null | undefined, idioma: 'es' | 'en' = 'es'): string {
  const { recoleccion, entrega } = fechasDeseadasDe(q);
  const en = idioma === 'en';
  const fmt = (f: string) => (en ? f : formatearFechaDeseada(f));
  const partes = [
    recoleccion ? `${en ? 'Requested pickup' : 'Recolección deseada'}: ${fmt(recoleccion)}` : '',
    entrega ? `${en ? 'Requested delivery' : 'Entrega deseada'}: ${fmt(entrega)}` : '',
  ].filter(Boolean);
  return partes.join(' · ');
}
