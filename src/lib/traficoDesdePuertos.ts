/**
 * traficoDesdePuertos.ts
 *
 * El tráfico (impo/expo) derivado del CATÁLOGO de puertos, no de adivinar
 * sobre texto.
 *
 * ── Por qué esto vuelve confiable la derivación ────────────────────────────
 * `resolverTrafico` deriva de la ruta con una lista de PISTAS de nombres
 * («manzanillo», «cdmx»…) — deliberadamente corta porque adivinar mal es peor
 * que no adivinar («Laredo» a secas es Texas). Con el puerto elegido del
 * catálogo ya no se adivina: cada puerto sabe su país (`codigoPais`), y de
 * ahí el tráfico sale por definición de §4.2 — destino en México es
 * importación, origen en México es exportación.
 *
 * Del tráfico dependen el prefijo del folio del embarque (VLIM/VLEM…) y el
 * IVA, así que esta derivación se escribe como `trafico` DECLARADO en el
 * servicio al momento de elegir los puertos: toda la cadena posterior
 * (resolverTrafico, planEmbarques) ya prefiere lo declarado y no necesita
 * enterarse del catálogo.
 *
 * Lógica pura: sin React ni Firestore.
 */

import type { TraficoServicio } from '../components/quotes/QuotesData';

/** Lo mínimo que este módulo necesita saber de un puerto. */
export interface PuertoConPais {
  codigoPais: string;
}

const esMexico = (p: PuertoConPais | null | undefined) =>
  (p?.codigoPais ?? '').trim().toUpperCase() === 'MEX';

/**
 * Tráfico a partir de los puertos elegidos.
 *
 * Devuelve null cuando no se puede derivar SIN adivinar: falta un puerto, o
 * los dos extremos están en México (nacional), o ninguno (cross-trade). Esos
 * casos los decide una persona, igual que antes.
 */
export function traficoDesdePuertos(
  origen: PuertoConPais | null | undefined,
  destino: PuertoConPais | null | undefined,
): TraficoServicio | null {
  if (!origen || !destino) return null;
  const oMx = esMexico(origen);
  const dMx = esMexico(destino);
  if (dMx && !oMx) return 'importacion';
  if (oMx && !dMx) return 'exportacion';
  return null;
}
