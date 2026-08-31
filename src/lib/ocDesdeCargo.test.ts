/**
 * ocDesdeCargo.test.ts
 *
 * C-3. Un gasto del embarque se vuelve orden de compra.
 *
 * Lo que protegen: la OC es una instrucción de pago. Si hereda mal el monto,
 * la moneda o el proveedor, se le paga de más, de menos, o a quien no era. Y
 * si un mismo gasto puede generar dos órdenes, se paga dos veces.
 */

import { describe, it, expect } from 'vitest';
import {
  puedeConvertirse, construirOCDesdeCargo, marcarCargoConOrden,
} from './ocDesdeCargo';
import type { CargoDetalle, EmbarqueCompleto } from '../components/shipments/EmbarquesData';

const AHORA = '2026-08-31T10:15:00.000Z';

const EMBARQUE = {
  id: 'VLIM-26-001',
  folio: 'VLIM-26-001',
  entidades: { clienteCobrar: 'Industrias Alfa' },
} as EmbarqueCompleto;

const CTX = {
  embarque: EMBARQUE,
  proveedorNombre: 'Maersk',
  solicitante: { uid: 'u1', nombre: 'Gabi' },
  ahora: AHORA,
};

function gasto(p: Partial<CargoDetalle> = {}): CargoDetalle {
  return {
    id: 'gas-1', concepto: 'Flete marítimo', tipo: 'gasto',
    monto: 2000, moneda: 'USD', proveedorId: 'PRV-001', conceptoId: 'CON-010',
    ...p,
  } as CargoDetalle;
}

// ─── A · Qué se puede convertir ──────────────────────────────────────────────

describe('A · convertibilidad', () => {
  it('un gasto con proveedor y monto sí se convierte', () => {
    expect(puedeConvertirse(gasto()).puede).toBe(true);
  });

  it('un ingreso NO: se le cobra al cliente, no se le paga a nadie', () => {
    const r = puedeConvertirse(gasto({ tipo: 'ingreso' }));
    expect(r.puede).toBe(false);
    expect(r.motivo).toBe('no_es_gasto');
  });

  it('sin proveedor NO: no se sabe a quién pagarle', () => {
    const r = puedeConvertirse(gasto({ proveedorId: undefined }));
    expect(r.puede).toBe(false);
    expect(r.motivo).toBe('sin_proveedor');
  });

  it('en cero NO: no genera un pago', () => {
    expect(puedeConvertirse(gasto({ monto: 0 })).motivo).toBe('monto_cero');
  });

  it('un gasto que ya generó orden NO genera otra', () => {
    const r = puedeConvertirse(gasto({ ordenCompraId: 'oc-1' }));
    expect(r.puede).toBe(false);
    expect(r.motivo).toBe('ya_tiene_orden');
  });

  it('cada negativa explica qué falta, no solo que no se puede', () => {
    const casos = [
      gasto({ tipo: 'ingreso' }),
      gasto({ proveedorId: undefined }),
      gasto({ monto: 0 }),
      gasto({ ordenCompraId: 'oc-1' }),
    ];
    casos.forEach(c => expect(puedeConvertirse(c).detalle).toBeTruthy());
  });
});

// ─── B · Lo que hereda ───────────────────────────────────────────────────────

describe('B · la orden hereda el contexto del embarque', () => {
  const oc = construirOCDesdeCargo(gasto(), CTX);

  it('monto, moneda y proveedor salen del cargo sin tocarse', () => {
    expect(oc.monto).toBe(2000);
    expect(oc.moneda).toBe('USD');
    expect(oc.proveedorId).toBe('PRV-001');
    expect(oc.proveedorNombre).toBe('Maersk');
  });

  it('el concepto viaja con su id del catálogo, no solo el nombre', () => {
    expect(oc.conceptoId).toBe('CON-010');
    expect(oc.conceptoNombre).toBe('Flete marítimo');
  });

  it('queda ligada al embarque y a su cliente', () => {
    expect(oc.origen).toBe('embarque');
    expect(oc.embarqueId).toBe('VLIM-26-001');
    expect(oc.embarqueFolio).toBe('VLIM-26-001');
    expect(oc.clienteNombre).toBe('Industrias Alfa');
  });

  it('nace solicitada, con su primer registro de historial', () => {
    expect(oc.estado).toBe('solicitada');
    expect(oc.historialEstados).toHaveLength(1);
    expect(oc.historialEstados[0].usuarioNombre).toBe('Gabi');
    expect(oc.solicitadaPor?.nombre).toBe('Gabi');
  });

  it('en pesos hereda pesos: la moneda no se normaliza a USD', () => {
    const oc = construirOCDesdeCargo(gasto({ monto: 8000, moneda: 'MXN' }), CTX);
    expect(oc.moneda).toBe('MXN');
    expect(oc.monto).toBe(8000);
  });

  it('no inventa un plazo de pago: fechaSugeridaPago queda sin calcular', () => {
    expect(oc.fechaSugeridaPago).toBeNull();
  });

  it('nace sin comprobante ni factura: llegan después', () => {
    expect(oc.comprobantePago).toBeNull();
    expect(oc.facturaAsociada).toBeNull();
  });

  it('un embarque sin cliente no inventa uno', () => {
    const sinCliente = { ...EMBARQUE, entidades: { clienteCobrar: '' } } as EmbarqueCompleto;
    const oc = construirOCDesdeCargo(gasto(), { ...CTX, embarque: sinCliente });
    expect(oc.clienteNombre).toBeNull();
  });
});

// ─── C · La marca que impide pagar dos veces ─────────────────────────────────

describe('C · marcarCargoConOrden', () => {
  const detalles = [gasto({ id: 'gas-1' }), gasto({ id: 'gas-2' })];

  it('marca solo el cargo que generó la orden', () => {
    const r = marcarCargoConOrden(detalles, 'gas-1', 'oc-99');
    expect(r.find(c => c.id === 'gas-1')!.ordenCompraId).toBe('oc-99');
    expect(r.find(c => c.id === 'gas-2')!.ordenCompraId).toBeUndefined();
  });

  it('no muta el arreglo que recibe', () => {
    marcarCargoConOrden(detalles, 'gas-1', 'oc-99');
    expect(detalles[0].ordenCompraId).toBeUndefined();
  });

  it('después de marcarlo, ya no se puede volver a convertir', () => {
    const r = marcarCargoConOrden(detalles, 'gas-1', 'oc-99');
    expect(puedeConvertirse(r[0]).puede).toBe(false);
  });
});
