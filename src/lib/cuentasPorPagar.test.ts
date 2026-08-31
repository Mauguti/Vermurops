/**
 * cuentasPorPagar.test.ts
 *
 * C-1. Qué debe Vermur, y cuándo empieza a deberlo.
 *
 * Lo que protegen: el KPI de «por pagar» es lo que dirección mira para decidir
 * si hay con qué pagar la semana. Contar una solicitud que aún puede
 * rechazarse infla la deuda; sumar pesos con dólares la inventa.
 */

import { describe, it, expect } from 'vitest';
import {
  totalesPorPagar, porPagarPorProveedor, esCuentaPorPagar, esSolicitudEnCurso,
} from './cuentasPorPagar';
import type { OrdenCompra, EstadoOC } from '../components/ordenesCompra/OrdenesCompraData';

function oc(p: Partial<OrdenCompra> & { id: string }): OrdenCompra {
  return {
    folio: `OC-2026-${p.id}`, origen: 'embarque',
    proveedorId: 'PRV-001', proveedorNombre: 'Maersk',
    monto: 1000, moneda: 'USD', estado: 'autorizada', activo: true,
    ...p,
  } as OrdenCompra;
}

// ─── A · Qué cuenta como deuda ───────────────────────────────────────────────

describe('A · el estado decide si ya se debe', () => {
  it('solo la autorizada es cuenta por pagar en firme', () => {
    const estados: EstadoOC[] = ['solicitada', 'en_gestion', 'autorizada', 'pagada', 'rechazada'];
    expect(estados.filter(esCuentaPorPagar)).toEqual(['autorizada']);
  });

  it('solicitada y en gestión son solicitud en curso, no deuda', () => {
    expect(esSolicitudEnCurso('solicitada')).toBe(true);
    expect(esSolicitudEnCurso('en_gestion')).toBe(true);
    expect(esSolicitudEnCurso('autorizada')).toBe(false);
  });

  it('una solicitud sin autorizar NO infla el total en firme', () => {
    const t = totalesPorPagar([
      oc({ id: '1', estado: 'solicitada', monto: 5000 }),
      oc({ id: '2', estado: 'en_gestion', monto: 3000 }),
      oc({ id: '3', estado: 'autorizada', monto: 1000 }),
    ]);
    expect(t.enFirme.USD).toBe(1000);
    expect(t.enCurso.USD).toBe(8000);
  });

  it('la rechazada no cuenta en ningún lado: no existió', () => {
    const t = totalesPorPagar([oc({ id: '1', estado: 'rechazada', monto: 9999 })]);
    expect(t.enFirme.USD).toBe(0);
    expect(t.enCurso.USD).toBe(0);
    expect(t.pagado.USD).toBe(0);
  });

  it('la pagada va al histórico, no a lo que se debe', () => {
    const t = totalesPorPagar([oc({ id: '1', estado: 'pagada', monto: 700 })]);
    expect(t.enFirme.USD).toBe(0);
    expect(t.pagado.USD).toBe(700);
  });

  it('una OC dada de baja no cuenta', () => {
    const t = totalesPorPagar([oc({ id: '1', monto: 4000, activo: false })]);
    expect(t.enFirme.USD).toBe(0);
  });
});

// ─── B · Monedas (§4.3) ──────────────────────────────────────────────────────

describe('B · los totales no se mezclan', () => {
  it('pesos y dólares se cuentan por separado', () => {
    const t = totalesPorPagar([
      oc({ id: '1', monto: 2000, moneda: 'USD' }),
      oc({ id: '2', monto: 40000, moneda: 'MXN' }),
    ]);
    expect(t.enFirme).toEqual({ USD: 2000, MXN: 40000 });
  });

  it('monedasActivas solo trae las que tienen movimiento', () => {
    const t = totalesPorPagar([oc({ id: '1', monto: 500, moneda: 'MXN' })]);
    expect(t.monedasActivas).toEqual(['MXN']);
  });

  it('sin órdenes no hay monedas activas, y los totales son cero', () => {
    const t = totalesPorPagar([]);
    expect(t.monedasActivas).toEqual([]);
    expect(t.enFirme).toEqual({ USD: 0, MXN: 0 });
  });

  it('una moneda desconocida se deja fuera, no cae en USD', () => {
    const t = totalesPorPagar([
      oc({ id: '1', monto: 100, moneda: 'EUR' as never }),
      oc({ id: '2', monto: 50, moneda: 'USD' }),
    ]);
    expect(t.enFirme.USD).toBe(50);
  });
});

// ─── C · Agrupado por proveedor ──────────────────────────────────────────────

describe('C · qué se le debe a cada proveedor', () => {
  it('agrupa por proveedor y moneda, con sus folios', () => {
    const r = porPagarPorProveedor([
      oc({ id: '1', folio: 'OC-2026-0001', monto: 1000 }),
      oc({ id: '2', folio: 'OC-2026-0002', monto: 500 }),
      oc({ id: '3', folio: 'OC-2026-0003', monto: 300, proveedorId: 'PRV-002', proveedorNombre: 'Hapag' }),
    ]);
    const maersk = r.find(x => x.proveedorId === 'PRV-001')!;
    expect(maersk.monto).toBe(1500);
    expect(maersk.folios).toEqual(['OC-2026-0001', 'OC-2026-0002']);
    expect(r).toHaveLength(2);
  });

  it('el mismo proveedor en dos monedas son dos renglones', () => {
    const r = porPagarPorProveedor([
      oc({ id: '1', monto: 1000, moneda: 'USD' }),
      oc({ id: '2', monto: 20000, moneda: 'MXN' }),
    ]);
    expect(r).toHaveLength(2);
    expect(r.map(x => x.moneda).sort()).toEqual(['MXN', 'USD']);
  });

  it('solo cuenta lo autorizado', () => {
    const r = porPagarPorProveedor([
      oc({ id: '1', estado: 'solicitada', monto: 9000 }),
      oc({ id: '2', estado: 'autorizada', monto: 100 }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].monto).toBe(100);
  });
});
