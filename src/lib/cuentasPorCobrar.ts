/**
 * cuentasPorCobrar.ts
 *
 * La cartera: qué se debe, quién lo debe y desde cuándo. La contraparte de
 * Cuentas por pagar.
 *
 * Todo se DERIVA de facturas y cobros (Bloque 2): el saldo de una factura
 * sale de `saldoDeFactura`, el estado de la fecha de vencimiento contra hoy,
 * y los totales se llevan POR MONEDA (§4.3) — una cartera que suma USD con
 * MXN se ve creíble y es basura.
 *
 * Sin React, sin Firestore.
 */

import type { FacturaCliente, CobroCliente } from '../components/facturas/FacturasData';
import { saldoDeFactura } from './facturacionEmbarque';
import {
  sumarPorMoneda, totalVacio, type TotalPorMoneda, type Moneda,
} from './sumarPorMoneda';

// ─── Estado de cobro ──────────────────────────────────────────────────────────

/**
 *   cobrado     → saldo en cero (o cancelada: no se debe nada)
 *   vencido     → con saldo y ya pasó el vencimiento
 *   por_vencer  → con saldo y vence dentro de la ventana (7 días)
 *   por_cobrar  → con saldo y todavía hay plazo
 */
export type EstadoCobro = 'por_cobrar' | 'por_vencer' | 'vencido' | 'cobrado';

export const ETIQUETA_ESTADO_COBRO: Record<EstadoCobro, string> = {
  por_cobrar: 'Por cobrar',
  por_vencer: 'Por vencer',
  vencido: 'Vencido',
  cobrado: 'Cobrado',
};

/** Con cuántos días de anticipación una factura pasa a «por vencer». */
export const DIAS_POR_VENCER = 7;

/** Diferencia en días naturales entre dos YYYY-MM-DD (b − a), en UTC. */
export function diasEntre(a: string, b: string): number {
  const ms = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))
    - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  return Math.round(ms / 86_400_000);
}

export interface FacturaEnCartera {
  factura: FacturaCliente;
  cobrado: number;
  saldo: number;
  estado: EstadoCobro;
  /** Positivo = días de atraso; negativo = días que faltan. */
  diasVencido: number;
  avisoMoneda?: string;
}

export function evaluarFactura(
  factura: FacturaCliente,
  cobros: readonly CobroCliente[],
  hoy: string,
): FacturaEnCartera {
  const s = saldoDeFactura(factura, cobros.filter(c => c.facturaId === factura.id));
  const diasVencido = factura.fechaVencimiento ? diasEntre(factura.fechaVencimiento, hoy) : 0;

  let estado: EstadoCobro;
  if (factura.estado === 'cancelada' || s.estado === 'cobrada') estado = 'cobrado';
  else if (diasVencido > 0) estado = 'vencido';
  else if (diasVencido >= -DIAS_POR_VENCER) estado = 'por_vencer';
  else estado = 'por_cobrar';

  return {
    factura,
    cobrado: s.cobrado,
    saldo: factura.estado === 'cancelada' ? 0 : s.saldo,
    estado,
    diasVencido,
    ...(s.avisoMoneda ? { avisoMoneda: s.avisoMoneda } : {}),
  };
}

/** Las facturas vivas evaluadas. Las canceladas y las inactivas no son cartera. */
export function cartera(
  facturas: readonly FacturaCliente[],
  cobros: readonly CobroCliente[],
  hoy: string,
): FacturaEnCartera[] {
  return facturas
    .filter(f => f.activo !== false && f.estado !== 'cancelada')
    .map(f => evaluarFactura(f, cobros, hoy))
    .sort((a, b) => a.factura.fechaVencimiento.localeCompare(b.factura.fechaVencimiento));
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

export interface ResumenCartera {
  /** Saldo de todo lo no cobrado, por moneda. */
  porCobrar: TotalPorMoneda;
  /** Saldo de lo que ya venció, por moneda. */
  vencido: TotalPorMoneda;
  /** Cobros recibidos en el mes de `hoy`, por moneda. */
  cobradoDelMes: TotalPorMoneda;
  facturasAbiertas: number;
  facturasVencidas: number;
}

export function resumenCartera(
  items: readonly FacturaEnCartera[],
  cobros: readonly CobroCliente[],
  hoy: string,
): ResumenCartera {
  const abiertas = items.filter(i => i.estado !== 'cobrado');
  const vencidas = abiertas.filter(i => i.estado === 'vencido');
  const mes = hoy.slice(0, 7);
  const delMes = cobros.filter(c => c.activo !== false && c.fechaCobro.slice(0, 7) === mes);
  return {
    porCobrar: sumarPorMoneda(abiertas, i => i.saldo, i => i.factura.moneda),
    vencido: sumarPorMoneda(vencidas, i => i.saldo, i => i.factura.moneda),
    cobradoDelMes: sumarPorMoneda(delMes, c => c.monto, c => c.moneda),
    facturasAbiertas: abiertas.length,
    facturasVencidas: vencidas.length,
  };
}

// ─── Por cliente ──────────────────────────────────────────────────────────────

export interface ClienteEnCartera {
  /** Id del cliente, o el nombre cuando la factura no lo trae (legacy). */
  clave: string;
  clienteId: string | null;
  clienteNombre: string;
  facturas: FacturaEnCartera[];
  porCobrar: TotalPorMoneda;
  vencido: TotalPorMoneda;
  /** El atraso más largo entre sus facturas. 0 si nada ha vencido. */
  maxDiasVencido: number;
}

/**
 * Agrupa la cartera por cliente, los más morosos primero: quien más días
 * lleva vencido va arriba, y entre iguales, quien más debe.
 */
export function agruparPorCliente(items: readonly FacturaEnCartera[]): ClienteEnCartera[] {
  const mapa = new Map<string, ClienteEnCartera>();
  items.forEach(i => {
    const clave = i.factura.clienteId ?? `nombre:${i.factura.clienteNombre.trim().toLowerCase()}`;
    let g = mapa.get(clave);
    if (!g) {
      g = {
        clave, clienteId: i.factura.clienteId ?? null, clienteNombre: i.factura.clienteNombre,
        facturas: [], porCobrar: totalVacio(), vencido: totalVacio(), maxDiasVencido: 0,
      };
      mapa.set(clave, g);
    }
    g.facturas.push(i);
  });

  const grupos = [...mapa.values()].map(g => {
    const abiertas = g.facturas.filter(f => f.estado !== 'cobrado');
    return {
      ...g,
      porCobrar: sumarPorMoneda(abiertas, f => f.saldo, f => f.factura.moneda),
      vencido: sumarPorMoneda(abiertas.filter(f => f.estado === 'vencido'), f => f.saldo, f => f.factura.moneda),
      maxDiasVencido: Math.max(0, ...abiertas.map(f => f.diasVencido)),
    };
  });

  const peso = (t: TotalPorMoneda) => (Object.values(t) as number[]).reduce((a, b) => a + b, 0);
  // `peso` mezcla monedas SOLO para ordenar, nunca se muestra (§4.3).
  return grupos.sort((a, b) =>
    b.maxDiasVencido - a.maxDiasVencido || peso(b.porCobrar) - peso(a.porCobrar));
}

/**
 * Lo que la ficha del cliente dice de su cartera: «tiene 45,000 por cobrar,
 * 12,000 vencidos». Null si no tiene facturas abiertas.
 */
export function resumenDeCliente(
  clienteId: string,
  facturas: readonly FacturaCliente[],
  cobros: readonly CobroCliente[],
  hoy: string,
): ClienteEnCartera | null {
  const suyas = cartera(facturas.filter(f => f.clienteId === clienteId), cobros, hoy);
  const abiertas = suyas.filter(f => f.estado !== 'cobrado');
  if (abiertas.length === 0) return null;
  return agruparPorCliente(abiertas)[0] ?? null;
}

/** Cuánto se puede cobrar contra esta factura sin pasarse del saldo. */
export function montoCobrable(item: FacturaEnCartera, monto: number, moneda: Moneda): string | null {
  if (!(monto > 0)) return 'El monto debe ser mayor que cero.';
  if (moneda !== item.factura.moneda) {
    return `La factura está en ${item.factura.moneda}; un cobro en ${moneda} no la liquida (§4.3).`;
  }
  if (monto > item.saldo + 1) {
    return `El cobro (${monto.toLocaleString('en-US', { minimumFractionDigits: 2 })}) supera el saldo (${item.saldo.toLocaleString('en-US', { minimumFractionDigits: 2 })}).`;
  }
  return null;
}
