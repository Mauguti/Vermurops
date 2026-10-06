/**
 * prefactura.test.ts (tarea 74 · P7)
 *
 * Lo que protegen: la fila «sin marcar, pagada, sin factura» NO es una
 * prefactura. Sin la marca explícita el contador contaría toda orden pagada a
 * la que todavía no le subieron el PDF, y a los dos días nadie lo lee.
 */
import { describe, it, expect } from 'vitest';
import {
  esPrefactura, tieneFactura, pendienteDeFactura, diasSinFactura, estadoPrefactura,
  resumenPrefacturas, textoFacturaPendiente, textoContadorPrefacturas, motivoPrefacturaParaGuardar,
} from './prefactura';
import { puedeMarcarPrefactura } from '../auth/permisos';
import { aplicarFiltrosPorPagar, FILTROS_POR_PAGAR_VACIOS, filtrosPorPagarDesdeVista, filtrosPorPagarParaVista, filtrosPorPagarActivos } from './filtrosFinanzas';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';

const HOY = new Date('2026-10-13T12:00:00.000Z');

function oc(p: Partial<OrdenCompra> & { id: string }): OrdenCompra {
  return {
    folio: `OC-2026-${p.id}`, origen: 'embarque',
    proveedorId: 'PRV-NAV', proveedorNombre: 'Naviera',
    conceptoId: 'CON-001', conceptoNombre: 'Flete', descripcion: '',
    monto: 1000, moneda: 'USD', estado: 'autorizada', activo: true,
    ...p,
  } as OrdenCompra;
}
const pagadaHace = (dias: number) => ({
  uid: 'u', nombre: 'Admin',
  fecha: new Date(HOY.getTime() - dias * 86400000).toISOString(),
});

describe('A · la marca manda', () => {
  it('ausente = no es prefactura', () => {
    expect(esPrefactura(oc({ id: '1' }))).toBe(false);
    expect(esPrefactura(oc({ id: '1', esPrefactura: false }))).toBe(false);
    expect(esPrefactura(oc({ id: '1', esPrefactura: true }))).toBe(true);
  });

  it('pagada y sin factura, SIN marcar, no es pendiente', () => {
    const o = oc({ id: '1', estado: 'pagada', pagadaPor: pagadaHace(20) });
    expect(pendienteDeFactura(o)).toBe(false);
    expect(estadoPrefactura(o)).toBe('no_aplica');
    expect(resumenPrefacturas([o], HOY).pendientes).toBe(0);
  });
});

describe('B · las cuatro situaciones', () => {
  it('marcada y sin pagar → por_pagar, no pendiente', () => {
    const o = oc({ id: '1', esPrefactura: true, estado: 'autorizada' });
    expect(estadoPrefactura(o)).toBe('por_pagar');
    expect(pendienteDeFactura(o)).toBe(false);
  });
  it('marcada, pagada, sin factura → pendiente con días', () => {
    const o = oc({ id: '1', esPrefactura: true, estado: 'pagada', pagadaPor: pagadaHace(12) });
    expect(estadoPrefactura(o)).toBe('factura_pendiente');
    expect(pendienteDeFactura(o)).toBe(true);
    expect(diasSinFactura(o, HOY)).toBe(12);
    expect(textoFacturaPendiente(o, HOY)).toBe('Factura pendiente · 12 días');
  });
  it('marcada, pagada, con factura (por cualquiera de las tres vías) → recibida', () => {
    for (const extra of [
      { facturaAsociada: 'F-1' },
      { facturaUUID: 'ABC-123' },
      { facturaDatos: { numero: 'F-2' } as OrdenCompra['facturaDatos'] },
    ]) {
      const o = oc({ id: '1', esPrefactura: true, estado: 'pagada', pagadaPor: pagadaHace(3), ...extra });
      expect(tieneFactura(o)).toBe(true);
      expect(estadoPrefactura(o)).toBe('factura_recibida');
      expect(pendienteDeFactura(o)).toBe(false);
      expect(diasSinFactura(o, HOY)).toBeNull();
    }
  });
  it('llega la factura → deja de ser pendiente sin tocar la marca', () => {
    const antes = oc({ id: '1', esPrefactura: true, estado: 'pagada', pagadaPor: pagadaHace(5) });
    const despues = { ...antes, facturaAsociada: 'F-9' };
    expect(pendienteDeFactura(antes)).toBe(true);
    expect(pendienteDeFactura(despues)).toBe(false);
    expect(despues.esPrefactura).toBe(true);
  });
});

describe('C · bordes de los días', () => {
  it('un día se redondea hacia abajo y 1 va en singular', () => {
    const o = oc({ id: '1', esPrefactura: true, estado: 'pagada', pagadaPor: pagadaHace(1) });
    expect(textoFacturaPendiente(o, HOY)).toBe('Factura pendiente · 1 día');
  });
  it('pagada hoy = 0 días; un reloj atrasado no da negativo', () => {
    const o = oc({ id: '1', esPrefactura: true, estado: 'pagada', pagadaPor: pagadaHace(0) });
    expect(diasSinFactura(o, HOY)).toBe(0);
    expect(diasSinFactura(o, new Date(HOY.getTime() - 3 * 86400000))).toBe(0);
  });
  it('sin fecha legible: sigue pendiente pero sin días', () => {
    const o = oc({ id: '1', esPrefactura: true, estado: 'pagada', pagadaPor: null });
    expect(pendienteDeFactura(o)).toBe(true);
    expect(diasSinFactura(o, HOY)).toBeNull();
    expect(textoFacturaPendiente(o, HOY)).toBe('Factura pendiente');
  });
  it('una orden inactiva o rechazada no cuenta', () => {
    expect(pendienteDeFactura(oc({ id: '1', esPrefactura: true, estado: 'pagada', activo: false }))).toBe(false);
    expect(pendienteDeFactura(oc({ id: '1', esPrefactura: true, estado: 'rechazada' }))).toBe(false);
  });
});

describe('D · el contador', () => {
  const lista = [
    oc({ id: '1', esPrefactura: true, estado: 'pagada', pagadaPor: pagadaHace(24) }),
    oc({ id: '2', esPrefactura: true, estado: 'pagada', pagadaPor: pagadaHace(3) }),
    oc({ id: '3', esPrefactura: true, estado: 'pagada', pagadaPor: pagadaHace(9), facturaAsociada: 'F-1' }),
    oc({ id: '4', esPrefactura: true, estado: 'autorizada' }),
    oc({ id: '5', estado: 'pagada', pagadaPor: pagadaHace(40) }),
  ];
  it('«3 prefacturas, la más vieja de 24 días» del plan, con los números reales', () => {
    const r = resumenPrefacturas(lista, HOY);
    expect(r).toEqual({ pendientes: 2, masVieja: 24 });
    expect(textoContadorPrefacturas(r)).toBe('2 prefacturas pagadas sin factura · la más vieja de 24 días');
  });
  it('singular, y nada que avisar con cero', () => {
    expect(textoContadorPrefacturas({ pendientes: 1, masVieja: 1 })).toBe('1 prefactura pagada sin factura · la más vieja de 1 día');
    expect(textoContadorPrefacturas({ pendientes: 0, masVieja: null })).toBeNull();
  });
  it('lista vacía', () => {
    expect(resumenPrefacturas([], HOY)).toEqual({ pendientes: 0, masVieja: null });
  });
});

describe('E · el filtro', () => {
  const lista = [
    oc({ id: '1', esPrefactura: true, estado: 'pagada' }),
    oc({ id: '2', esPrefactura: true, estado: 'autorizada' }),
    oc({ id: '3', esPrefactura: true, estado: 'pagada', facturaAsociada: 'F-1' }),
    oc({ id: '4', estado: 'pagada' }),
  ];
  const ids = (prefactura: '' | 'marcadas' | 'pendientes') =>
    aplicarFiltrosPorPagar(lista, { ...FILTROS_POR_PAGAR_VACIOS, prefactura }).map(o => o.id);
  it('vacío no filtra; marcadas y pendientes sí', () => {
    expect(ids('')).toEqual(['1', '2', '3', '4']);
    expect(ids('marcadas')).toEqual(['1', '2', '3']);
    expect(ids('pendientes')).toEqual(['1']);
  });
  it('se guarda con la vista y un valor basura se descarta', () => {
    const f = { ...FILTROS_POR_PAGAR_VACIOS, prefactura: 'pendientes' as const };
    expect(filtrosPorPagarParaVista(f)).toEqual({ prefactura: 'pendientes' });
    expect(filtrosPorPagarActivos(f)).toBe(1);
    expect(filtrosPorPagarDesdeVista({ prefactura: 'pendientes' }).prefactura).toBe('pendientes');
    expect(filtrosPorPagarDesdeVista({ prefactura: 'basura' }).prefactura).toBe('');
    expect(filtrosPorPagarDesdeVista({}).prefactura).toBe('');
  });
});

describe('F · permisos y motivo', () => {
  it('marca Operaciones (y admin); Administración, Ventas y Pricing no', () => {
    expect(puedeMarcarPrefactura('operaciones')).toBe(true);
    expect(puedeMarcarPrefactura('admin')).toBe(true);
    expect(puedeMarcarPrefactura('administracion')).toBe(false);
    expect(puedeMarcarPrefactura('ventas')).toBe(false);
    expect(puedeMarcarPrefactura('pricing')).toBe(false);
    expect(puedeMarcarPrefactura(undefined)).toBe(false);
  });
  it('el motivo vacío o de espacios se guarda null, nunca undefined', () => {
    expect(motivoPrefacturaParaGuardar('  ')).toBeNull();
    expect(motivoPrefacturaParaGuardar(undefined)).toBeNull();
    expect(motivoPrefacturaParaGuardar(' la naviera cobra antes ')).toBe('la naviera cobra antes');
  });
});
