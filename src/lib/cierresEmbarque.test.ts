/**
 * Tests de cierresEmbarque.ts (2.4).
 *
 * El caso que motiva todo: un interruptor manual dice lo que alguien recordó
 * marcar, no lo que pasó. Un embarque podía aparecer «cerrado de pago» con la
 * factura sin cobrar. Aquí se fija que los datos lo contradigan.
 */

import { describe, it, expect } from 'vitest';
import { evaluarCierres, avisoDeOrden, alternarCierre, crearColaEmbarque } from './cierresEmbarque';
import type { EmbarqueCompleto, CargoDetalle } from '../components/shipments/EmbarquesData';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import type { FacturaCliente, CobroCliente } from '../components/facturas/FacturasData';
import { pagoDesdeCobro, type Pago } from './pagos';

const cargo = (over: Partial<CargoDetalle> = {}): CargoDetalle => ({
  id: 'c1', concepto: 'Ocean Freight', tipo: 'ingreso', monto: 1000, moneda: 'MXN',
  facturaId: null, ...over,
});

const embarque = (over: Partial<EmbarqueCompleto> = {}): EmbarqueCompleto => ({
  id: 'EMB-1', folio: 'VLIM-0001', modalidad: 'maritimo',
  numeroGuia: 'MSKU123', numeroReservacion: '',
  requiereCaptura: false, advertenciasHeredadas: [],
  cierres: { operativo: false, pago: false, administrativo: false },
  cargos: { detalles: [], ingresos: 0, gastos: 0, ganancia: 0, moneda: 'MXN' },
  ...over,
} as unknown as EmbarqueCompleto);

const factura = (over: Partial<FacturaCliente> = {}): FacturaCliente => ({
  id: 'FAC-1', numero: 'A-100', fechaEmision: '2026-09-01',
  embarqueId: 'EMB-1', embarqueFolio: 'VLIM-0001',
  clienteId: 'CLI-1', clienteNombre: 'Cliente', grupoFacturacion: null,
  lineas: [], moneda: 'MXN', subtotal: 1000, iva: 160, retencion: 0, total: 1160,
  fechaVencimiento: '2026-10-01', diasCredito: 30, estado: 'emitida',
  registradaPor: { uid: 'u', nombre: 'Julio' },
  activo: true, createdAt: '', updatedAt: '',
  ...over,
});

/**
 * Tarea 67 · El cobro se construye igual y se LEE como pago: el cuerpo de los
 * tests no cambió ni una cifra, y ahí está la prueba de que la lectura
 * unificada da lo mismo que la lista de cobros.
 */
const cobro = (monto: number, over: Partial<CobroCliente> = {}): Pago => pagoDesdeCobro({
  id: 'COB-1', facturaId: 'FAC-1', facturaNumero: 'A-100',
  embarqueId: 'EMB-1', embarqueFolio: 'VLIM-0001',
  clienteId: 'CLI-1', clienteNombre: 'Cliente',
  monto, moneda: 'MXN', fechaCobro: '2026-09-20', banco: 'Santander', referencia: 'R1',
  registradoPor: { uid: 'u', nombre: 'Julio' },
  activo: true, createdAt: '', updatedAt: '',
  ...over,
});

const orden = (over: Partial<OrdenCompra> = {}): OrdenCompra => ({
  id: 'oc-1', folio: 'OC-2026-0001', estado: 'autorizada', activo: true,
  embarqueId: 'EMB-1', monto: 500, moneda: 'MXN',
  ...over,
} as OrdenCompra);

const ctx = (over: Partial<Parameters<typeof evaluarCierres>[0]> = {}) => ({
  embarque: embarque(), ordenes: [], facturas: [], pagos: [], ...over,
});

// ─── A · Operativo ───────────────────────────────────────────────────────────

describe('cierre operativo', () => {
  it('con guía y sin advertencias, está listo', () => {
    expect(evaluarCierres(ctx()).operativo.listo).toBe(true);
  });

  it('sin guía ni reservación, no', () => {
    const r = evaluarCierres(ctx({ embarque: embarque({ numeroGuia: '', numeroReservacion: '' }) }));
    expect(r.operativo.listo).toBe(false);
    expect(r.operativo.faltantes[0]).toContain('guía');
  });

  it('las advertencias heredadas sin resolver lo frenan', () => {
    const r = evaluarCierres(ctx({
      embarque: embarque({ advertenciasHeredadas: [{ tipo: 'sin_venta' }] as never }),
    }));
    expect(r.operativo.listo).toBe(false);
    expect(r.operativo.faltantes.join(' ')).toContain('advertencia');
  });
});

// ─── B · De pago: el caso que motivó el bloque ───────────────────────────────

describe('cierre de pago — facturar no es cobrar', () => {
  it('con la factura emitida pero SIN cobrar, no está listo', () => {
    const r = evaluarCierres(ctx({ facturas: [factura()], pagos: [] }));
    expect(r.pago.listo).toBe(false);
    expect(r.pago.faltantes[0]).toContain('A-100');
    expect(r.pago.faltantes[0]).toContain('1,160.00');
  });

  it('con la factura cobrada completa, sí', () => {
    const r = evaluarCierres(ctx({ facturas: [factura()], pagos: [cobro(1160)] }));
    expect(r.pago.listo).toBe(true);
  });

  it('un cobro parcial no cierra', () => {
    const r = evaluarCierres(ctx({ facturas: [factura()], pagos: [cobro(600)] }));
    expect(r.pago.listo).toBe(false);
  });

  it('líneas de ingreso sin facturar lo frenan', () => {
    const r = evaluarCierres(ctx({
      embarque: embarque({ cargos: { detalles: [cargo()], ingresos: 0, gastos: 0, ganancia: 0, moneda: 'MXN' } } as never),
      facturas: [factura()], pagos: [cobro(1160)],
    }));
    expect(r.pago.listo).toBe(false);
    expect(r.pago.faltantes[0]).toContain('sin facturar');
  });

  it('sin ninguna factura registrada no se da por cobrado', () => {
    expect(evaluarCierres(ctx()).pago.listo).toBe(false);
  });

  it('una factura cancelada no exige cobro', () => {
    const r = evaluarCierres(ctx({
      facturas: [factura({ estado: 'cancelada' }), factura({ id: 'F2', numero: 'A-101', total: 500 })],
      pagos: [cobro(500, { facturaId: 'F2' })],
    }));
    expect(r.pago.listo).toBe(true);
  });
});

// ─── C · Administrativo ──────────────────────────────────────────────────────

describe('cierre administrativo — todos los proveedores pagados', () => {
  it('con órdenes vivas, no está listo y las nombra', () => {
    const r = evaluarCierres(ctx({ ordenes: [orden({ folio: 'OC-2026-0007' })] }));
    expect(r.administrativo.listo).toBe(false);
    expect(r.administrativo.faltantes[0]).toContain('OC-2026-0007');
  });

  it('con todas pagadas, sí', () => {
    const r = evaluarCierres(ctx({ ordenes: [orden({ estado: 'pagada' })] }));
    expect(r.administrativo.listo).toBe(true);
  });

  it('una orden RECHAZADA no impide cerrar: ese gasto no se va a pagar', () => {
    const r = evaluarCierres(ctx({ ordenes: [orden({ estado: 'rechazada' })] }));
    expect(r.administrativo.listo).toBe(true);
  });

  it('un gasto sin orden es un proveedor al que nadie le pidió el pago', () => {
    const r = evaluarCierres(ctx({
      embarque: embarque({ cargos: { detalles: [cargo({ tipo: 'gasto', ordenCompraId: null })], ingresos: 0, gastos: 0, ganancia: 0, moneda: 'MXN' } } as never),
    }));
    expect(r.administrativo.listo).toBe(false);
    expect(r.administrativo.faltantes.join(' ')).toContain('sin orden de compra');
  });
});

// ─── D · Discrepancias y orden ───────────────────────────────────────────────

describe('lo marcado contra lo que dicen los datos', () => {
  it('marcar «pago» con la factura sin cobrar produce una discrepancia', () => {
    const r = evaluarCierres(ctx({
      embarque: embarque({ cierres: { operativo: true, pago: true, administrativo: false } }),
      facturas: [factura()], pagos: [],
    }));
    expect(r.discrepancias.map(d => d.cierre)).toContain('pago');
    expect(r.discrepancias[0].detalle).toContain('A-100');
  });

  it('sin nada marcado no hay discrepancias que reportar', () => {
    expect(evaluarCierres(ctx()).discrepancias).toEqual([]);
  });

  it('el cierre no se desmarca solo: se señala', () => {
    const e = embarque({ cierres: { operativo: false, pago: true, administrativo: false } });
    const r = evaluarCierres(ctx({ embarque: e, facturas: [factura()] }));
    expect(e.cierres.pago).toBe(true);
    expect(r.discrepancias.length).toBeGreaterThan(0);
  });

  it('avisa cuando se cierra fuera del orden §4.7', () => {
    expect(avisoDeOrden('pago', { operativo: false, pago: false, administrativo: false }))
      .toContain('operativo');
    expect(avisoDeOrden('administrativo', { operativo: true, pago: false, administrativo: false }))
      .toContain('sin que el cliente haya pagado');
    expect(avisoDeOrden('operativo', { operativo: false, pago: false, administrativo: false }))
      .toBeNull();
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// Dos clics seguidos no pierden ninguno
// ═══════════════════════════════════════════════════════════════════════════

/*
 * El bug: `handleToggleCierre` armaba el documento extendiendo el `embarque`
 * del render, y el guardado escribe el documento COMPLETO. Dos clics
 * —operativo y pago— partían los dos del mismo estado, así que el segundo
 * escribía el primero en false otra vez. Con el `confirmar()` de §4.7 de por
 * medio, la ventana son segundos.
 */
interface EmbSimple { cierres: { operativo: boolean; pago: boolean; administrativo: boolean } }

const SIN_CERRAR: EmbSimple = { cierres: { operativo: false, pago: false, administrativo: false } };

describe('alternarCierre', () => {
  it('invierte solo el tipo pedido', () => {
    expect(alternarCierre(SIN_CERRAR.cierres, 'pago'))
      .toEqual({ operativo: false, pago: true, administrativo: false });
  });

  it('no muta la entrada', () => {
    const antes = { ...SIN_CERRAR.cierres };
    alternarCierre(antes, 'operativo');
    expect(antes.operativo).toBe(false);
  });
});

describe('crearColaEmbarque · dos clics sin esperar', () => {
  /** Guardado lento, como una escritura real: sin él la carrera no aparece. */
  const guardadoLento = () => {
    const escritos: EmbSimple[] = [];
    return {
      escritos,
      guardar: async (e: EmbSimple) => {
        await new Promise(r => setTimeout(r, 5));
        escritos.push(structuredClone(e));
      },
    };
  };

  it('dos clics SIN esperar guardan los DOS cierres', async () => {
    const { escritos, guardar } = guardadoLento();
    const cola = crearColaEmbarque<EmbSimple>(SIN_CERRAR, guardar);

    // Nadie espera al primero: es el doble clic real.
    const a = cola.encolar(e => ({ ...e, cierres: alternarCierre(e.cierres, 'operativo') }));
    const b = cola.encolar(e => ({ ...e, cierres: alternarCierre(e.cierres, 'pago') }));
    await Promise.all([a, b]);

    expect(escritos).toHaveLength(2);
    // Lo ÚLTIMO que quedó escrito tiene los dos: es lo que ve Firestore.
    expect(escritos[1].cierres).toEqual({ operativo: true, pago: true, administrativo: false });
  });

  it('los tres cierres seguidos acaban los tres en true', async () => {
    const { escritos, guardar } = guardadoLento();
    const cola = crearColaEmbarque<EmbSimple>(SIN_CERRAR, guardar);
    const tipos = ['operativo', 'pago', 'administrativo'] as const;
    await Promise.all(tipos.map(t =>
      cola.encolar(e => ({ ...e, cierres: alternarCierre(e.cierres, t) }))));
    expect(escritos[2].cierres).toEqual({ operativo: true, pago: true, administrativo: true });
  });

  it('dos clics al MISMO cierre se cancelan, no se duplican', async () => {
    const { escritos, guardar } = guardadoLento();
    const cola = crearColaEmbarque<EmbSimple>(SIN_CERRAR, guardar);
    const uno = cola.encolar(e => ({ ...e, cierres: alternarCierre(e.cierres, 'pago') }));
    const dos = cola.encolar(e => ({ ...e, cierres: alternarCierre(e.cierres, 'pago') }));
    await Promise.all([uno, dos]);
    expect(escritos[1].cierres.pago).toBe(false);
  });

  /*
   * El snapshot viejo tiene que llegar MIENTRAS se guarda, no antes de que la
   * cola arranque: si llega antes, el cambio se calcula encima de él y el test
   * pasa sin ejercitar el guard de `pendientes`. Se sincroniza DENTRO del
   * guardado, que es el único momento en que hay algo en vuelo.
   */
  it('un dato del servidor NO pisa lo que la cola tiene en vuelo', async () => {
    let cola: ReturnType<typeof crearColaEmbarque<EmbSimple>>;
    const guardar = async () => {
      cola.sincronizar(SIN_CERRAR);        // snapshot viejo a media escritura
      await new Promise(r => setTimeout(r, 5));
    };
    cola = crearColaEmbarque<EmbSimple>(SIN_CERRAR, guardar);
    await cola.encolar(e => ({ ...e, cierres: alternarCierre(e.cierres, 'operativo') }));
    expect(cola.actual().cierres.operativo).toBe(true);
  });

  it('con la cola quieta, el dato del servidor sí entra', async () => {
    const { guardar } = guardadoLento();
    const cola = crearColaEmbarque<EmbSimple>(SIN_CERRAR, guardar);
    cola.sincronizar({ cierres: { operativo: true, pago: true, administrativo: false } });
    expect(cola.actual().cierres.pago).toBe(true);
  });

  /*
   * Lo que sostiene la CADENA, aparte de acumular: el ORDEN de las
   * escrituras. Si corrieran en paralelo, la primera —más lenta— podría
   * aterrizar al final y dejar en Firestore un documento con un cierre menos.
   * Acumular no basta: lo último que se escribe tiene que ser lo más completo.
   */
  it('la escritura lenta no aterriza DESPUÉS de la rápida', async () => {
    const escritos: EmbSimple[] = [];
    let primera = true;
    const cola = crearColaEmbarque<EmbSimple>(SIN_CERRAR, async e => {
      const espera = primera ? 30 : 1;     // la primera, mucho más lenta
      primera = false;
      await new Promise(r => setTimeout(r, espera));
      escritos.push(structuredClone(e));
    });
    const a = cola.encolar(x => ({ ...x, cierres: alternarCierre(x.cierres, 'operativo') }));
    const b = cola.encolar(x => ({ ...x, cierres: alternarCierre(x.cierres, 'pago') }));
    await Promise.all([a, b]);

    expect(escritos).toHaveLength(2);
    expect(escritos[0].cierres).toEqual({ operativo: true, pago: false, administrativo: false });
    expect(escritos[1].cierres).toEqual({ operativo: true, pago: true, administrativo: false });
  });

  it('si un guardado falla, el siguiente clic se sigue aplicando', async () => {
    const escritos: EmbSimple[] = [];
    let primera = true;
    const cola = crearColaEmbarque<EmbSimple>(SIN_CERRAR, async e => {
      if (primera) { primera = false; throw new Error('sin red'); }
      escritos.push(structuredClone(e));
    });
    const a = cola.encolar(e => ({ ...e, cierres: alternarCierre(e.cierres, 'operativo') }));
    const b = cola.encolar(e => ({ ...e, cierres: alternarCierre(e.cierres, 'pago') }));
    await Promise.all([a, b]);
    expect(escritos[0].cierres).toEqual({ operativo: true, pago: true, administrativo: false });
  });
});
