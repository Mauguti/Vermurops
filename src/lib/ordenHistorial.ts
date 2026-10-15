/**
 * Orden del Historial / Notas de la cotización: lo más reciente primero.
 * Una entrada sin fecha (actividad vieja o escrita por otro camino) no tira la
 * ficha: se lee como '' y cae al final, y la pantalla la pinta sin fecha.
 */
export interface EntradaConFecha { date?: string | null }

export function ordenarPorFechaDesc<T extends EntradaConFecha>(entradas: T[]): T[] {
  return [...entradas].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}
