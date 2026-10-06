/**
 * Tarea 85 — registrar y anular un pago a proveedor son todo o nada.
 *
 * Firestore se simula con la semántica que importa: la transacción acumula
 * sus escrituras y solo las aplica si el callback termina sin lanzar. Una
 * falla inyectada en la ORDEN 2 debe dejar la orden 1, el pago y la bitácora
 * como estaban.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Doc = Record<string, any>;
const almacen = new Map<string, Doc>();
let fallaEn: string | null = null;

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, c: string, id: string) => ({ ruta: `${c}/${id}` }),
  arrayUnion: (...v: unknown[]) => ({ __union: v }),
  runTransaction: async (_db: unknown, fn: (tx: any) => Promise<void>) => {
    const pendientes: Array<() => void> = [];
    const tx = {
      get: async (r: { ruta: string }) => ({
        exists: () => almacen.has(r.ruta), data: () => almacen.get(r.ruta),
      }),
      set: (r: { ruta: string }, d: Doc) => pendientes.push(() => {
        if (r.ruta === fallaEn) throw new Error('falla inyectada');
        almacen.set(r.ruta, d);
      }),
      update: (r: { ruta: string }, d: Doc) => pendientes.push(() => {
        if (r.ruta === fallaEn) throw new Error('falla inyectada');
        const prev = almacen.get(r.ruta);
        if (!prev) throw new Error('no existe');
        const nuevo = { ...prev };
        for (const [k, v] of Object.entries(d)) {
          nuevo[k] = (v as any)?.__union ? [...(prev[k] ?? []), ...(v as any).__union] : v;
        }
        almacen.set(r.ruta, nuevo);
      }),
    };
    await fn(tx);
    // Commit atómico: valida todo sobre una copia y solo entonces publica.
    const respaldo = new Map(almacen);
    try { pendientes.forEach(p => p()); }
    catch (e) { almacen.clear(); respaldo.forEach((v, k) => almacen.set(k, v)); throw e; }
  },
}));

import { escribirAtomico } from './escribirAtomico';
import { planRegistroPagoProveedor, planAnulacionPagoProveedor } from '../lib/escrituraPagoProveedor';
import { construirPagoDeGrupo, type ContextoPago } from '../lib/pagos';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';

const orden = (id: string, over: Partial<OrdenCompra> = {}): OrdenCompra => ({
  id, folio: `OC-${id}`, estado: 'autorizada', proveedorId: 'PRV-1', proveedorNombre: 'IDAMEX',
  monto: 10000, moneda: 'MXN', embarqueId: 'EMB-1', conceptoNombre: 'Flete', activo: true,
  historialEstados: [], ...over,
} as unknown as OrdenCompra);

const ctx: ContextoPago = {
  id: 'PAG-X', folio: 'PAG-2026-0042', por: { uid: 'u1', nombre: 'Julio' }, ahora: '2026-10-06T10:00:00.000Z',
};
const usuario = { uid: 'u1', nombre: 'Julio' };
const AHORA = ctx.ahora;

function siembra(ordenes: OrdenCompra[]) {
  almacen.clear();
  ordenes.forEach(o => almacen.set(`ordenesCompra/${o.id}`, { ...o }));
  almacen.set('embarques/EMB-1', { bitacora: [] });
}

beforeEach(() => { fallaEn = null; });

describe('registrar un pago a proveedor', () => {
  const o1 = orden('1'); const o2 = orden('2');
  const plan = () => {
    const pago = construirPagoDeGrupo([o1, o2], { referencia: 'TR-1', fecha: '2026-10-06' }, ctx);
    return planRegistroPagoProveedor({ pago, grupo: [o1, o2], referencia: 'TR-1', archivo: null, rol: 'administracion', usuario, ahora: AHORA });
  };

  it('caso feliz: pago, dos órdenes pagadas y una entrada de bitácora por orden', async () => {
    siembra([o1, o2]);
    await escribirAtomico(plan(), 'el pago');
    expect(almacen.get('pagos/PAG-X')).toBeTruthy();
    expect(almacen.get('ordenesCompra/1')!.estado).toBe('pagada');
    expect(almacen.get('ordenesCompra/2')!.estado).toBe('pagada');
    expect(almacen.get('ordenesCompra/2')!.comprobantePago).toBe('TR-1');
    expect(almacen.get('embarques/EMB-1')!.bitacora).toHaveLength(2);
  });

  it('si falla la escritura de la orden 2 NO queda nada: ni pago, ni orden 1, ni bitácora', async () => {
    siembra([o1, o2]);
    fallaEn = 'ordenesCompra/2';
    await expect(escribirAtomico(plan(), 'el pago')).rejects.toThrow();
    expect(almacen.has('pagos/PAG-X')).toBe(false);
    expect(almacen.get('ordenesCompra/1')!.estado).toBe('autorizada');
    expect(almacen.get('ordenesCompra/2')!.estado).toBe('autorizada');
    expect(almacen.get('embarques/EMB-1')!.bitacora).toEqual([]);
  });

  it('una orden que otra sesión ya movió detiene todo antes de escribir', async () => {
    siembra([o1, { ...o2, estado: 'pagada' }]);
    await expect(escribirAtomico(plan(), 'el pago')).rejects.toThrow(/cambió mientras tanto/);
    expect(almacen.has('pagos/PAG-X')).toBe(false);
    expect(almacen.get('ordenesCompra/1')!.estado).toBe('autorizada');
  });

  it('un embarque que ya no existe no tumba el pago', async () => {
    siembra([o1, o2]); almacen.delete('embarques/EMB-1');
    await escribirAtomico(plan(), 'el pago');
    expect(almacen.get('ordenesCompra/1')!.estado).toBe('pagada');
  });

  it('el plan lanza si una orden no puede pasar a pagada (rol sin permiso)', () => {
    const pago = construirPagoDeGrupo([o1, o2], { referencia: 'TR-1', fecha: '2026-10-06' }, ctx);
    expect(() => planRegistroPagoProveedor({ pago, grupo: [o1, o2], referencia: 'TR-1', archivo: null, rol: 'ventas', usuario, ahora: AHORA })).toThrow(/OC-1/);
  });
});

describe('anular un pago a proveedor', () => {
  const p1 = orden('1', { estado: 'pagada', comprobantePago: 'TR-1' });
  const p2 = orden('2', { estado: 'pagada', comprobantePago: 'TR-1' });
  const pago = () => construirPagoDeGrupo(
    [{ ...p1, estado: 'autorizada' }, { ...p2, estado: 'autorizada' }] as OrdenCompra[],
    { referencia: 'TR-1', fecha: '2026-10-06' }, ctx);
  const plan = () => planAnulacionPagoProveedor({ pago: pago(), ordenes: [p1, p2], motivo: ' error de captura ', rol: 'administracion', usuario, ahora: AHORA });
  const siembraPagadas = () => { siembra([p1, p2]); almacen.set('pagos/PAG-X', { ...pago() }); };

  it('caso feliz: pago anulado con motivo y las dos órdenes de vuelta a autorizada', async () => {
    siembraPagadas();
    await escribirAtomico(plan(), 'la anulación');
    expect(almacen.get('pagos/PAG-X')!.activo).toBe(false);
    expect(almacen.get('pagos/PAG-X')!.anulacion.motivo).toBe('error de captura');
    for (const id of ['1', '2']) {
      const o = almacen.get(`ordenesCompra/${id}`)!;
      expect(o.estado).toBe('autorizada');
      expect(o.comprobantePago).toBeNull();
      expect(o.pagadaPor).toBeNull();
    }
    expect(almacen.get('embarques/EMB-1')!.bitacora).toHaveLength(2);
  });

  it('si falla la orden 2 el pago NO queda anulado y la orden 1 sigue pagada', async () => {
    siembraPagadas();
    fallaEn = 'ordenesCompra/2';
    await expect(escribirAtomico(plan(), 'la anulación')).rejects.toThrow();
    expect(almacen.get('pagos/PAG-X')!.activo).not.toBe(false);
    expect(almacen.get('pagos/PAG-X')!.anulacion).toBeUndefined();
    expect(almacen.get('ordenesCompra/1')!.estado).toBe('pagada');
    expect(almacen.get('ordenesCompra/1')!.comprobantePago).toBe('TR-1');
    expect(almacen.get('embarques/EMB-1')!.bitacora).toEqual([]);
  });

  it('si falla la escritura del PAGO tampoco se revierte ninguna orden', async () => {
    siembraPagadas();
    fallaEn = 'pagos/PAG-X';
    await expect(escribirAtomico(plan(), 'la anulación')).rejects.toThrow();
    expect(almacen.get('ordenesCompra/1')!.estado).toBe('pagada');
    expect(almacen.get('ordenesCompra/2')!.estado).toBe('pagada');
  });

  it('una orden que ya regresó por otro lado detiene todo', async () => {
    siembra([p1, { ...p2, estado: 'autorizada' }]); almacen.set('pagos/PAG-X', { ...pago() });
    await expect(escribirAtomico(plan(), 'la anulación')).rejects.toThrow(/cambió mientras tanto/);
    expect(almacen.get('pagos/PAG-X')!.activo).not.toBe(false);
  });

  it('el plan lanza si el rol no puede revertir', () => {
    expect(() => planAnulacionPagoProveedor({ pago: pago(), ordenes: [p1, p2], motivo: 'x', rol: 'operaciones', usuario, ahora: AHORA })).toThrow(/OC-1/);
  });
});
