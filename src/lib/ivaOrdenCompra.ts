/**
 * ivaOrdenCompra.ts — Tarea 36
 *
 * IVA esperado de una orden de compra vs. lo que declara la factura del
 * proveedor. El dolor diario de Julio: revisa a mano que coincidan, y
 * cuando se escapa lo detecta Contabilidad después.
 *
 * ── Qué hace ─────────────────────────────────────────────────────────────
 * 1. Calcula el IVA ESPERADO a partir de la regla del concepto del catálogo.
 *    Reusa `calcularIVA` y `montoIVA`/`montoRetencion` de ivaCotizacion, sin
 *    duplicar la lógica.
 * 2. Compara contra lo que la factura declara (`facturaDatos.iva`).
 * 3. Devuelve un estado y un mensaje para la ficha y la bandeja de OC.
 *
 * ── Lo que NO puede saber ────────────────────────────────────────────────
 * La regla «espejo» necesita tráfico y ubicación, que viven en el embarque
 * y no en la OC. Para esos 17 conceptos, sin el cargo a la vista, el IVA
 * queda como «sin determinar» — no se inventa.
 *
 * Lógica pura: sin React ni Firestore.
 */

import type { ReglaIVA } from '../components/conceptos/ConceptosData';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import { calcularIVA, type ResultadoIVA } from './calcularIVA';
import { montoIVA, montoRetencion } from './ivaCotizacion';

// ─── IVA esperado ────────────────────────────────────────────────────────────

export interface IVAEsperado {
  /** Monto de IVA que debería cobrar el proveedor. */
  iva: number;
  /** Retención que debería aplicarse (flete terrestre: 4% del subtotal). */
  retencion: number;
  /** La tasa, para mostrar. null en aereo_split (no hay una sola tasa). */
  tasa: number | null;
  /** Caso especial: aereo_split o terrestre_retencion. */
  especial?: 'aereo_split' | 'terrestre_retencion';
}

/**
 * IVA esperado para una OC dado su monto (subtotal, antes de impuestos) y
 * la regla IVA de su concepto del catálogo.
 *
 * Devuelve `null` cuando no se puede determinar:
 *   - regla «espejo»: necesita tráfico + ubicación (viven en el embarque)
 *   - regla «revisar»: captura manual, no hay tasa derivable
 *   - sin regla: concepto sin vincular al catálogo
 */
export function ivaEsperadoDeOC(
  monto: number,
  reglaIVA: ReglaIVA | null | undefined,
): IVAEsperado | null {
  if (!reglaIVA) return null;
  if (reglaIVA === 'espejo') return null;
  if (reglaIVA === 'revisar') return null;

  // Las cinco reglas restantes no necesitan contexto (§ ivaCotizacion.ts).
  const contextoNoLeido = { trafico: 'impo' as const, ubicacion: 'destino' as const };
  const resultado: ResultadoIVA | null = calcularIVA(reglaIVA, contextoNoLeido);
  if (!resultado) return null;

  const iva = montoIVA(monto, resultado);
  const ret = montoRetencion(monto, resultado);
  const especial = resultado.split ? 'aereo_split' as const
    : resultado.retencion ? 'terrestre_retencion' as const
    : undefined;

  return {
    iva,
    retencion: ret,
    tasa: resultado.split ? null : resultado.tasa,
    especial,
  };
}

// ─── Comparación ─────────────────────────────────────────────────────────────

export type EstadoIVAOC =
  /** IVA declarado y esperado cuadran. */
  | 'cuadra'
  /** IVA declarado difiere del esperado más allá de la tolerancia. */
  | 'no_cuadra'
  /** La factura no trae IVA declarado; no se puede comparar. */
  | 'sin_capturar'
  /** No se pudo calcular el IVA esperado (espejo, revisar, sin concepto). */
  | 'sin_tasa'
  /** La OC no tiene facturaDatos. */
  | 'sin_factura';

export interface ResultadoComparacionIVA {
  estado: EstadoIVAOC;
  ivaEsperado: number | null;
  ivaDeclarado: number | null;
  retencionEsperada: number | null;
  retencionDeclarada: number | null;
  /** Texto para mostrar en la ficha y en el tooltip de la bandeja. */
  mensaje: string;
}

const fmt = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Compara el IVA declarado en la factura del proveedor contra el esperado.
 *
 * Tolerancia: 1 peso o 0.5% del esperado, lo que sea MAYOR. Redondeos de
 * centavos no deben disparar la alerta.
 */
export function compararIVAFactura(
  oc: Pick<OrdenCompra, 'monto' | 'facturaDatos'>,
  reglaIVA: ReglaIVA | null | undefined,
): ResultadoComparacionIVA {
  const fd = oc.facturaDatos;

  if (!fd) {
    return {
      estado: 'sin_factura',
      ivaEsperado: null, ivaDeclarado: null,
      retencionEsperada: null, retencionDeclarada: null,
      mensaje: '',
    };
  }

  const esperado = ivaEsperadoDeOC(oc.monto, reglaIVA);

  if (!esperado) {
    return {
      estado: 'sin_tasa',
      ivaEsperado: null,
      ivaDeclarado: fd.iva ?? null,
      retencionEsperada: null,
      retencionDeclarada: fd.retencion ?? null,
      mensaje: reglaIVA === 'espejo'
        ? 'IVA sin determinar: depende de la ubicación del servicio (regla espejo).'
        : reglaIVA === 'revisar'
          ? 'IVA sin determinar: este concepto requiere captura manual.'
          : 'IVA sin determinar: el concepto no tiene regla asignada.',
    };
  }

  const declarado = fd.iva;
  if (declarado === null || declarado === undefined) {
    return {
      estado: 'sin_capturar',
      ivaEsperado: esperado.iva,
      ivaDeclarado: null,
      retencionEsperada: esperado.retencion,
      retencionDeclarada: fd.retencion ?? null,
      mensaje: `IVA sin capturar. Esperado: $${fmt(esperado.iva)}.`,
    };
  }

  // Tolerancia: max(1, 0.5% del esperado)
  const tolerancia = Math.max(1, Math.abs(esperado.iva) * 0.005);
  const cuadra = Math.abs(declarado - esperado.iva) <= tolerancia;

  if (cuadra) {
    return {
      estado: 'cuadra',
      ivaEsperado: esperado.iva,
      ivaDeclarado: declarado,
      retencionEsperada: esperado.retencion,
      retencionDeclarada: fd.retencion ?? null,
      mensaje: '',
    };
  }

  return {
    estado: 'no_cuadra',
    ivaEsperado: esperado.iva,
    ivaDeclarado: declarado,
    retencionEsperada: esperado.retencion,
    retencionDeclarada: fd.retencion ?? null,
    mensaje: `IVA no cuadra: esperado $${fmt(esperado.iva)}, factura $${fmt(declarado)}.`,
  };
}

// ─── Etiqueta para la bandeja ────────────────────────────────────────────────

export type EtiquetaIVA = 'ok' | 'alerta' | 'pendiente' | null;

/** Etiqueta de filtro para la bandeja de OC. null = sin factura, no filtrable. */
export function etiquetaIVA(estado: EstadoIVAOC): EtiquetaIVA {
  switch (estado) {
    case 'cuadra': return 'ok';
    case 'no_cuadra': return 'alerta';
    case 'sin_capturar': return 'pendiente';
    case 'sin_tasa': return 'pendiente';
    case 'sin_factura': return null;
  }
}
