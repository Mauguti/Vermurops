/**
 * sumarPorMoneda.ts
 *
 * Sumar dinero sin mezclar monedas. §4.3 del CLAUDE.md, en una sola función.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * El mismo bug apareció TRES veces en lugares distintos —el resumen del
 * embarque, la comparativa de agentes y el KPI de cuentas por pagar— y una
 * cuarta al revisar la bandeja de órdenes. Siempre igual:
 *
 *     items.reduce((acc, x) => acc + x.monto, 0)
 *
 * Un `reduce` que no mira `moneda` compila, pasa los tests, y produce un
 * número que se ve perfectamente bien. 2,000 USD y 40,000 MXN dan «42,000», y
 * nadie lo atrapa hasta que ese total llega a una factura o a un pago.
 *
 * La regla no es «convertir con cuidado»: es que **los totales no se mezclan**.
 * Se calculan por moneda y se muestran separados. Convertir solo se hace para
 * COMPARAR, con un tipo de cambio declarado y visible (ver monedaComparativa).
 *
 * Lógica pura: sin React ni Firestore.
 */

export type Moneda = 'MXN' | 'USD';

export const MONEDAS: Moneda[] = ['USD', 'MXN'];

/** Un importe por moneda. Nunca un solo número. */
export type TotalPorMoneda = Record<Moneda, number>;

const redondear = (n: number) => Math.round(n * 100) / 100;

export function totalVacio(): TotalPorMoneda {
  return { USD: 0, MXN: 0 };
}

function esMoneda(m: unknown): m is Moneda {
  return m === 'USD' || m === 'MXN';
}

/**
 * Suma los importes de una lista, separados por moneda.
 *
 * Los elementos con moneda desconocida se IGNORAN en vez de caer en USD. Meter
 * un importe en la moneda equivocada es peor que dejarlo fuera: el total
 * seguiría viéndose correcto y nadie lo revisaría. Si necesitas saber cuántos
 * se quedaron fuera, usa `sumarPorMonedaConDescartes`.
 */
export function sumarPorMoneda<T>(
  items: readonly T[],
  monto: (item: T) => number | null | undefined,
  moneda: (item: T) => string | null | undefined,
): TotalPorMoneda {
  return sumarPorMonedaConDescartes(items, monto, moneda).total;
}

export interface SumaConDescartes {
  total: TotalPorMoneda;
  /** Elementos cuya moneda no se reconoció y quedaron fuera del total. */
  descartados: number;
}

export function sumarPorMonedaConDescartes<T>(
  items: readonly T[],
  monto: (item: T) => number | null | undefined,
  moneda: (item: T) => string | null | undefined,
): SumaConDescartes {
  const total = totalVacio();
  let descartados = 0;

  items.forEach(item => {
    const m = moneda(item);
    if (!esMoneda(m)) { descartados++; return; }
    total[m] = redondear(total[m] + (monto(item) ?? 0));
  });

  return { total, descartados };
}

/** Las monedas con algún importe distinto de cero, en orden estable. */
export function monedasConMonto(total: TotalPorMoneda): Moneda[] {
  return MONEDAS.filter(m => total[m] !== 0);
}

/** ¿La lista mezcla más de una moneda? */
export function mezclaMonedas<T>(
  items: readonly T[],
  moneda: (item: T) => string | null | undefined,
): boolean {
  const vistas = new Set<string>();
  items.forEach(i => {
    const m = moneda(i);
    if (esMoneda(m)) vistas.add(m);
  });
  return vistas.size > 1;
}

/**
 * El total como UN número, solo cuando es legítimo.
 *
 * Devuelve `null` si la lista mezcla monedas, en vez de sumar de todos modos.
 * Úsalo donde el código de verdad necesita un escalar —un campo que solo
 * acepta uno, una comparación— para que el caso mixto tenga que resolverse
 * explícitamente y no se cuele.
 */
export function totalDeUnaMoneda<T>(
  items: readonly T[],
  monto: (item: T) => number | null | undefined,
  moneda: (item: T) => string | null | undefined,
): { total: number; moneda: Moneda } | null {
  if (mezclaMonedas(items, moneda)) return null;

  const total = sumarPorMoneda(items, monto, moneda);
  const activas = monedasConMonto(total);
  if (activas.length === 0) return null;

  return { total: total[activas[0]], moneda: activas[0] };
}

/**
 * Los totales en texto, separados: «USD 1,500.00 + MXN 8,000.00».
 *
 * Nunca produce un solo número cuando hay dos monedas. Es el formato que el
 * cliente ya lee en la comparativa.
 */
export function formatearPorMoneda(
  total: TotalPorMoneda,
  opciones: { vacio?: string } = {},
): string {
  const activas = monedasConMonto(total);
  if (activas.length === 0) return opciones.vacio ?? '—';
  return activas
    .map(m => `${m} ${total[m].toLocaleString('es-MX', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    })}`)
    .join(' + ');
}
