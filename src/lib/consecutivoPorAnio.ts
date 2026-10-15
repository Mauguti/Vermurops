/**
 * consecutivoPorAnio.ts — tarea 121.
 *
 * El consecutivo de cada serie de embarque reinicia en 001 cada enero.
 *
 * ── El modelo ──────────────────────────────────────────────────────────────
 * `contadores/embarques_VLIM` guardaba `ultimo`, un entero que no mira el año:
 * en enero de 2027 el folio salía VLIM-27-321. Ahora el documento puede traer
 * `ultimoPorAnio: { "26": 320, "27": 4 }` (opcional y aditivo) y el siguiente
 * folio sigue del año de la fecha de EMISIÓN.
 *
 * ── Lectura dual, sin migrar ───────────────────────────────────────────────
 *   1. si existe `ultimoPorAnio[aa]`, sigue de ahí;
 *   2. si no, y `aa` es el año del contador heredado (`ultimo`, que sin mapa
 *      es 2026), sigue de `ultimo`;
 *   3. si es un año nuevo, empieza en 001.
 *
 * En el año heredado la escritura mantiene `ultimo` AL DÍA junto al mapa: lo
 * leen la pantalla de Configuración, `sembrarFolios.ts` y cualquier sesión que
 * todavía corra el código viejo — que de otro modo emitiría un folio repetido
 * al encontrar `ultimo` congelado.
 *
 * Puro a propósito (sin SDK): el folio se arma dentro de una transacción y es
 * lo único que no se puede corregir después.
 */

/** Año al que pertenece `ultimo` cuando el documento no trae `ultimoPorAnio`. */
export const ANIO_CONTADOR_HEREDADO = 2026;

const ZONA = 'America/Mexico_City';

/**
 * El año calendario de una fecha en la Ciudad de México.
 *
 * No `getFullYear()`: usa la zona del navegador, y un folio emitido a las 11 pm
 * del 31 de diciembre en México es de ESE año aunque en UTC ya sea enero.
 */
export function anioMexico(fecha: Date = new Date()): number {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, year: 'numeric' })
    .formatToParts(fecha);
  return Number(partes.find(p => p.type === 'year')?.value);
}

/** La llave del mapa: los dos últimos dígitos del año («26»). */
export function claveAnio(anio: number): string {
  return String(anio).slice(-2).padStart(2, '0');
}

function entero(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}

function mapaDe(data: Record<string, unknown> | undefined | null): Record<string, number> {
  const crudo = data?.ultimoPorAnio;
  if (!crudo || typeof crudo !== 'object') return {};
  const limpio: Record<string, number> = {};
  for (const [k, v] of Object.entries(crudo as Record<string, unknown>)) {
    const n = entero(v);
    if (n !== null) limpio[k] = n;
  }
  return limpio;
}

/** El último consecutivo emitido en ese año, según las tres reglas. */
export function ultimoDelAnio(
  data: Record<string, unknown> | undefined | null,
  anio: number,
): number {
  const delMapa = mapaDe(data)[claveAnio(anio)];
  if (delMapa !== undefined) return delMapa;
  if (anio === ANIO_CONTADOR_HEREDADO) return entero(data?.ultimo) ?? 0;
  return 0;
}

/**
 * Lo que hay que escribir en el contador al dejar el año en `ultimo`.
 *
 * Devuelve el mapa COMPLETO (lo que había más el año nuevo) y no solo la
 * llave: así la escritura es la misma con o sin fusión profunda, y dos años
 * distintos no se pisan. En el año heredado también va `ultimo`.
 */
export function escrituraDelAnio(
  data: Record<string, unknown> | undefined | null,
  anio: number,
  ultimo: number,
): { ultimoPorAnio: Record<string, number>; ultimo?: number } {
  const ultimoPorAnio = { ...mapaDe(data), [claveAnio(anio)]: ultimo };
  return anio === ANIO_CONTADOR_HEREDADO
    ? { ultimoPorAnio, ultimo }
    : { ultimoPorAnio };
}
