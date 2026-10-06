import { describe, it, expect } from 'vitest';
import {
  hoyLocal, problemaFechaPago, problemaComprobante, totalElegido, bancoInicial,
  problemasDelFormulario, diaAutorizacion, problemasFechaContraAutorizacion,
} from './formularioPagoProveedor';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';

const oc = (id: string, monto: number, extra: Partial<OrdenCompra> = {}) =>
  ({ id, folio: id, monto, moneda: 'MXN', bancoSalida: 'santander_gastos', ...extra }) as OrdenCompra;

describe('hoyLocal', () => {
  it('usa la fecha local, con ceros', () => {
    expect(hoyLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('problemaFechaPago', () => {
  it('acepta hoy y ayer', () => {
    expect(problemaFechaPago('2026-10-06', '2026-10-06')).toBeNull();
    expect(problemaFechaPago('2026-10-05', '2026-10-06')).toBeNull();
  });
  it('rechaza mañana', () => {
    expect(problemaFechaPago('2026-10-07', '2026-10-06')).toMatch(/futura/);
  });
  it('rechaza vacía, mal formada o inexistente', () => {
    expect(problemaFechaPago('', '2026-10-06')).toMatch(/Falta/);
    expect(problemaFechaPago('06/10/2026', '2026-10-06')).toMatch(/Falta/);
    expect(problemaFechaPago('2026-02-31', '2026-10-06')).toMatch(/no existe/);
  });
});

describe('problemaComprobante', () => {
  it('acepta PDF y fotos, sin importar mayúsculas', () => {
    for (const n of ['a.pdf', 'b.JPG', 'c.jpeg', 'd.png', 'e.HEIC']) {
      expect(problemaComprobante(n, 1000)).toBeNull();
    }
  });
  it('rechaza otros tipos y los de 20 MB o más', () => {
    expect(problemaComprobante('a.docx', 1000)).toMatch(/PDF o imagen/);
    expect(problemaComprobante('a.pdf', 20 * 1024 * 1024)).toMatch(/20 MB/);
  });
});

describe('totalElegido y bancoInicial', () => {
  const ordenes = [oc('A', 100), oc('B', 50), oc('C', 25)];
  it('suma solo las elegidas', () => {
    expect(totalElegido(ordenes, new Set(['A', 'C']))).toBe(125);
    expect(totalElegido(ordenes, new Set())).toBe(0);
  });
  it('banco inicial: el común, o vacío si difieren', () => {
    expect(bancoInicial(ordenes)).toBe('santander_gastos');
    expect(bancoInicial([oc('A', 1), oc('B', 1, { bancoSalida: 'bbva' })])).toBe('');
  });
});

describe('problemasDelFormulario', () => {
  const base = { elegidas: 2, referencia: 'TR-1', fecha: '2026-10-05', hoy: '2026-10-06' };
  it('un formulario completo no tiene problemas', () => {
    expect(problemasDelFormulario(base)).toEqual([]);
    expect(problemasDelFormulario({ ...base, archivo: { nombre: 'c.jpg', tamano: 5 } })).toEqual([]);
  });
  it('sin órdenes, sin referencia, fecha futura o archivo malo: cada uno se dice', () => {
    expect(problemasDelFormulario({ ...base, elegidas: 0 })).toEqual(['Marca al menos una orden.']);
    expect(problemasDelFormulario({ ...base, referencia: '  ' })[0]).toMatch(/referencia/);
    expect(problemasDelFormulario({ ...base, fecha: '2026-10-09' })[0]).toMatch(/futura/);
    expect(problemasDelFormulario({ ...base, archivo: { nombre: 'x.exe', tamano: 5 } })[0]).toMatch(/PDF o imagen/);
  });
});

describe('fecha del pago contra la autorización (tarea 86)', () => {
  const aut = (id: string, iso: string) => oc(id, 1, { autorizadaPor: { uid: 'u', nombre: 'A', fecha: iso } });

  it('lee el día de autorización, con respaldo en el historial', () => {
    expect(diaAutorizacion(aut('A', '2026-10-05T15:00:00'))).toBe('2026-10-05');
    const h = oc('B', 1, { autorizadaPor: null, historialEstados: [{ estado: 'autorizada', fecha: '2026-10-04T12:00:00' }] as never });
    expect(diaAutorizacion(h)).toBe('2026-10-04');
    expect(diaAutorizacion(oc('C', 1, { autorizadaPor: null }))).toBeNull();
  });
  it('rechaza una fecha anterior y dice qué orden y qué fecha', () => {
    const p = problemasFechaContraAutorizacion('2026-10-03', [aut('OC-1', '2026-10-05T12:00:00'), aut('OC-2', '2026-10-01T12:00:00')]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/OC-1.*2026-10-05.*2026-10-03/);
  });
  it('el mismo día de la autorización sirve', () => {
    expect(problemasFechaContraAutorizacion('2026-10-05', [aut('OC-1', '2026-10-05T23:00:00')])).toEqual([]);
  });
  it('entra al formulario solo con fecha válida', () => {
    const o = [aut('OC-1', '2026-10-05T12:00:00')];
    expect(problemasDelFormulario({ elegidas: 1, referencia: 'x', fecha: '2026-10-04', hoy: '2026-10-06', ordenes: o })[0]).toMatch(/OC-1/);
    expect(problemasDelFormulario({ elegidas: 1, referencia: 'x', fecha: '2026-10-07', hoy: '2026-10-06', ordenes: o })).toHaveLength(1);
  });
});
