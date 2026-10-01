/**
 * diasCreditoServicio.ts
 *
 * Función compartida para resolver los días de crédito por modalidad de
 * servicio (§4.6), usada por la cotización y el embarque.
 *
 * «No es un número por cliente: varían por tipo de operación. Un mismo
 * cliente puede tener 45 días en marítimo, 20 en aéreo y 15 en terrestre.»
 *
 * Cadena de respaldo por servicio:
 *   diasCreditoPorTipo[modalidad] → diasCreditoPorTipo.general → dias → 0
 *
 * Despacho aduanal y cargos locales usan `general`.
 *
 * Sin React, sin Firestore, sin red.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

/**
 * Lo mínimo que hace falta del cliente para resolver sus días de crédito.
 * Compatible con ClienteVermur sin importarlo.
 */
export interface DatosCreditoCliente {
  diasCreditoPorTipo?: {
    maritimo?: number;
    terrestre?: number;
    aereo?: number;
    general?: number;
  } | null;
  dias?: number;
}

/** Desglose de financiamiento para un servicio. */
export interface DesgloseFinanciamiento {
  modalidad: string;
  dias: number;
  venta: number;
  monto: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Factor de financiamiento por día de crédito: 0.05 % / día = 1/2000 */
const FACTOR_FINANCIAMIENTO = 1 / 2000;

const ETIQUETAS: Record<string, string> = {
  maritimo: 'Marítimo',
  aereo: 'Aéreo',
  terrestre: 'Terrestre',
  despacho_aduanal: 'Despacho aduanal',
  cargos_locales: 'Cargos locales',
};

// ─── diasCreditoDeModalidad ───────────────────────────────────────────────────

/**
 * Días de crédito para una modalidad de servicio.
 *
 * Cadena de respaldo:
 *   1. diasCreditoPorTipo[modalidad]  (marítimo, aéreo, terrestre)
 *   2. diasCreditoPorTipo.general
 *   3. dias  (el campo plano legacy)
 *   4. 0  (contado)
 *
 * Despacho aduanal y cualquier otra modalidad saltan al paso 2.
 */
export function diasCreditoDeModalidad(
  cliente: DatosCreditoCliente | null | undefined,
  tipoServicio: string,
): number {
  if (!cliente) return 0;

  const dct = cliente.diasCreditoPorTipo;
  if (dct) {
    const porModalidad =
      tipoServicio === 'maritimo' ? dct.maritimo
      : tipoServicio === 'terrestre' ? dct.terrestre
      : tipoServicio === 'aereo' ? dct.aereo
      : undefined;

    if (porModalidad !== undefined) return porModalidad;
    if (dct.general !== undefined) return dct.general;
  }

  return cliente.dias ?? 0;
}

// ─── Financiamiento por servicio ──────────────────────────────────────────────

/**
 * Calcula el financiamiento POR SERVICIO para una cotización multimodal.
 *
 * Decisión de Mau: en una cotización multimodal, el financiamiento se calcula
 * por servicio con los días de la modalidad de ese servicio, y se suma.
 *
 * En una cotización unimodal, equivale al cálculo plano de siempre.
 */
export function calcFinanciamientoPorServicio(
  lineas: { servicioTipo: string; venta: number }[],
  cliente: DatosCreditoCliente | null | undefined,
): { monto: number; desglose: DesgloseFinanciamiento[] } {
  // Agrupar ventas por tipo de servicio
  const porTipo = new Map<string, number>();
  for (const l of lineas) {
    porTipo.set(l.servicioTipo, (porTipo.get(l.servicioTipo) ?? 0) + l.venta);
  }

  let montoTotal = 0;
  const desglose: DesgloseFinanciamiento[] = [];

  for (const [tipo, venta] of porTipo) {
    const dias = diasCreditoDeModalidad(cliente, tipo);
    const monto = venta * dias * FACTOR_FINANCIAMIENTO;
    montoTotal += monto;
    desglose.push({ modalidad: tipo, dias, venta, monto });
  }

  return { monto: montoTotal, desglose };
}

// ─── Etiqueta legible ─────────────────────────────────────────────────────────

/**
 * Texto legible para el resumen: «Marítimo 45 días · Terrestre 15 días».
 *
 * Si todos los servicios tienen los mismos días, simplifica:
 * «30 días de crédito».
 */
export function etiquetaDiasCredito(
  desglose: DesgloseFinanciamiento[],
): string {
  if (desglose.length === 0) return 'Contado';

  const todosIguales = desglose.every(d => d.dias === desglose[0].dias);
  if (todosIguales) {
    const dias = desglose[0].dias;
    return dias === 0 ? 'Contado' : `${dias} días de crédito`;
  }

  return desglose
    .map(d => `${ETIQUETAS[d.modalidad] ?? d.modalidad} ${d.dias} días`)
    .join(' · ');
}
