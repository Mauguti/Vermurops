/**
 * Tests de validación y filtro de cargos para la notificación de arribo (tarea 41).
 */

import { describe, it, expect } from 'vitest';
import { validarParaArribo, cargosParaArribo } from './notificacionArribo';
import type { EmbarqueCompleto, CargoDetalle } from '../components/shipments/EmbarquesData';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Embarque mínimo con los datos obligatorios completos. */
function embarqueCompleto(overrides: Partial<EmbarqueCompleto> = {}): EmbarqueCompleto {
  return {
    id: 'SHP-2026-0001',
    folio: 'VLIM-2026-0001',
    cotizacionId: 'COT-2026-0001',
    modalidad: 'maritimo',
    tipo: 'master',
    masterId: null,
    numeroGuia: 'HLCUSEE260804123',
    numeroReservacion: 'BK-001',
    referenciaCliente: 'PO-001',
    entidades: {
      expedidor: 'ACME Corp',
      consignatario: 'Cliente Nacional S.A.',
      notificar: 'Contacto Destino',
      agenteAduanal: 'Agente X',
      agenteCarga: 'Freight Co',
      agenteDestino: '',
      importador: 'Importadora Y',
      clienteCobrar: 'Cliente Nacional S.A.',
    },
    ruta: {
      origen: { puertoCarga: 'Shanghai', transportista: 'Hapag-Lloyd', buque: 'Ever Given', bandera: 'Panama', viaje: 'V-001' },
      destino: { puertoDescarga: 'Manzanillo', transportistaEntrega: '', lugarEntrega: 'Querétaro' },
      aduana: { aes: false, pedimento: '' },
    },
    fechas: { salida: '2026-09-15', arribo: '2026-10-15', ordenGeneral: '', limiteDocumentacion: '', libreDemoras: '', libreAlmacenaje: '' },
    descripcionCarga: 'Metal parts',
    valorDeclarado: 50000,
    cierres: { operativo: false, pago: false, administrativo: false },
    cargos: { detalles: [], ingresos: 0, gastos: 0, ganancia: 0, moneda: 'USD' },
    documentos: [],
    eventos: [],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
    ...overrides,
  };
}

function cargo(overrides: Partial<CargoDetalle> = {}): CargoDetalle {
  return {
    id: 'C-001',
    concepto: 'Flete internacional',
    tipo: 'ingreso',
    monto: 1500,
    moneda: 'USD',
    ...overrides,
  };
}

// ── Tests de validación ─────────────────────────────────────────────────────

describe('validarParaArribo', () => {
  it('devuelve vacío si el embarque tiene todos los datos obligatorios', () => {
    const faltantes = validarParaArribo(embarqueCompleto());
    expect(faltantes).toHaveLength(0);
  });

  it('detecta BL faltante', () => {
    const faltantes = validarParaArribo(embarqueCompleto({ numeroGuia: '' }));
    expect(faltantes).toHaveLength(1);
    expect(faltantes[0].campo).toBe('numeroGuia');
    expect(faltantes[0].etiqueta).toContain('BL');
  });

  it('detecta ETA faltante', () => {
    const emb = embarqueCompleto();
    emb.fechas.arribo = '';
    const faltantes = validarParaArribo(emb);
    expect(faltantes).toHaveLength(1);
    expect(faltantes[0].campo).toContain('arribo');
  });

  it('detecta puerto de arribo faltante', () => {
    const emb = embarqueCompleto();
    emb.ruta.destino.puertoDescarga = '';
    const faltantes = validarParaArribo(emb);
    expect(faltantes).toHaveLength(1);
    expect(faltantes[0].campo).toContain('puertoDescarga');
  });

  it('detecta consignatario faltante', () => {
    const emb = embarqueCompleto();
    emb.entidades.consignatario = '';
    const faltantes = validarParaArribo(emb);
    expect(faltantes).toHaveLength(1);
    expect(faltantes[0].campo).toContain('consignatario');
  });

  it('reporta TODOS los campos faltantes, no solo el primero', () => {
    const emb = embarqueCompleto({
      numeroGuia: '',
      entidades: {
        expedidor: 'X', consignatario: '', notificar: '',
        agenteAduanal: '', agenteCarga: '', agenteDestino: '',
        importador: '', clienteCobrar: '',
      },
    });
    emb.fechas.arribo = '';
    emb.ruta.destino.puertoDescarga = '';
    const faltantes = validarParaArribo(emb);
    expect(faltantes).toHaveLength(4);
  });

  it('no cuenta espacios en blanco como dato', () => {
    const faltantes = validarParaArribo(embarqueCompleto({ numeroGuia: '   ' }));
    expect(faltantes).toHaveLength(1);
  });
});

// ── Tests del filtro de cargos ──────────────────────────────────────────────

describe('cargosParaArribo', () => {
  it('incluye solo los cargos de tipo ingreso con monto positivo', () => {
    const detalles: CargoDetalle[] = [
      cargo({ id: 'C-1', tipo: 'ingreso', monto: 1500 }),
      cargo({ id: 'C-2', tipo: 'gasto', monto: 800 }),
      cargo({ id: 'C-3', tipo: 'ingreso', monto: 200 }),
    ];
    const resultado = cargosParaArribo(detalles);
    expect(resultado).toHaveLength(2);
    expect(resultado.every(c => c.tipo === 'ingreso')).toBe(true);
  });

  it('excluye cargos de ingreso con monto cero', () => {
    const detalles: CargoDetalle[] = [
      cargo({ id: 'C-1', tipo: 'ingreso', monto: 0 }),
      cargo({ id: 'C-2', tipo: 'ingreso', monto: 500 }),
    ];
    expect(cargosParaArribo(detalles)).toHaveLength(1);
  });

  it('devuelve vacío si no hay ingresos', () => {
    const detalles: CargoDetalle[] = [
      cargo({ id: 'C-1', tipo: 'gasto', monto: 800 }),
    ];
    expect(cargosParaArribo(detalles)).toHaveLength(0);
  });

  it('conserva la moneda de cada cargo', () => {
    const detalles: CargoDetalle[] = [
      cargo({ id: 'C-1', tipo: 'ingreso', monto: 1500, moneda: 'USD' }),
      cargo({ id: 'C-2', tipo: 'ingreso', monto: 8000, moneda: 'MXN' }),
    ];
    const resultado = cargosParaArribo(detalles);
    expect(resultado).toHaveLength(2);
    expect(resultado[0].moneda).toBe('USD');
    expect(resultado[1].moneda).toBe('MXN');
  });
});
