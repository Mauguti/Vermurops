// ============================================================
// FacturasData.ts — Modelo de la factura al cliente (2.1)
//
// ⚠️ Vermur NO tiene PAC: el timbrado fiscal ocurre FUERA de la plataforma.
// Aquí se REGISTRA una factura que ya se emitió, para que la operación sepa
// qué se cobró, a quién y cuándo vence. Nada de lo que vive aquí es un CFDI
// ni pretende serlo — y el modelo lo dice para que nadie lo confunda después.
//
// Dos formas, las que pidió el cliente (§4.8): general —todo el embarque— o
// separada por grupo de conceptos. Ambas salen de `lineasFacturables`.
// ============================================================

import type { Moneda } from '../../lib/sumarPorMoneda';

/** Una línea de la factura, congelada al registrarla. */
export interface LineaFactura {
  /** FK → CargoDetalle.id del embarque. */
  cargoId: string;
  concepto: string;
  /** FK → conceptos/. Necesaria para las claves SAT cuando haya timbrado. */
  conceptoId?: string;
  /** Base gravable de esta línea. */
  subtotal: number;
  moneda: Moneda;
  /** Tasa aplicada, DERIVADA con calcularIVA. Nunca se captura a mano. */
  tasaIVA: number;
  montoIVA: number;
  /** Retención (flete terrestre nacional: 4%). 0 cuando no aplica. */
  montoRetencion: number;
  /**
   * Por qué esta línea no tiene IVA derivado, si es el caso. La factura se
   * puede registrar igual —ya se emitió por fuera— pero queda dicho.
   */
  avisoIVA?: string;
}

export type EstadoFactura = 'emitida' | 'cobrada_parcial' | 'cobrada' | 'cancelada';

export interface FacturaCliente {
  id: string;

  // ── Identificación ─────────────────────────────────────────────────────────
  /** Folio de la factura tal como salió del sistema fiscal externo. */
  numero: string;
  /** YYYY-MM-DD. La fecha de emisión real, no la de captura. */
  fechaEmision: string;

  // ── A quién y de qué ───────────────────────────────────────────────────────
  /** FK → embarques/ */
  embarqueId: string;
  embarqueFolio: string;
  /** FK → clientes/ */
  clienteId: string | null;
  clienteNombre: string;

  /**
   * Grupo de conceptos que cubre. `null` = factura GENERAL del embarque.
   * Ver `grupoFacturacion` en CargoDetalle.
   */
  grupoFacturacion: string | null;

  // ── Importes ───────────────────────────────────────────────────────────────
  lineas: LineaFactura[];
  /**
   * §4.3: los totales son POR MONEDA. Una factura cubre UNA moneda; si el
   * embarque tiene ingresos en dos, son dos facturas — que es como salen del
   * sistema fiscal de todos modos.
   */
  moneda: Moneda;
  subtotal: number;
  iva: number;
  retencion: number;
  total: number;

  // ── Cobro ──────────────────────────────────────────────────────────────────
  /**
   * Vencimiento según los días de crédito del cliente PARA LA MODALIDAD del
   * embarque (§4.6): el mismo cliente puede tener 45 días en marítimo y 15 en
   * terrestre. YYYY-MM-DD.
   */
  fechaVencimiento: string;
  /** Días de crédito con los que se calculó, para que la fecha se explique. */
  diasCredito: number;
  estado: EstadoFactura;
  /** Por qué se canceló. Una factura cancelada no se borra. */
  motivoCancelacion?: string | null;

  // ── Auditoría ──────────────────────────────────────────────────────────────
  registradaPor: { uid: string; nombre: string };
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Un cobro recibido contra una factura. Puede ser parcial. */
export interface CobroCliente {
  id: string;
  /** FK → facturas/ */
  facturaId: string;
  facturaNumero: string;
  /** FK → embarques/ — el cobro fondea las OCs de ESTE embarque (1.1). */
  embarqueId: string;
  embarqueFolio: string;
  clienteId: string | null;
  clienteNombre: string;

  monto: number;
  moneda: Moneda;
  /** YYYY-MM-DD */
  fechaCobro: string;
  /** Banco de Vermur donde entró. */
  banco: string;
  referencia: string;

  registradoPor: { uid: string; nombre: string };
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}
