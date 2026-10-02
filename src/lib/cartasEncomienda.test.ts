/**
 * Tests para cartas de encomienda y garantía por naviera (tarea 52).
 */

import { describe, it, expect } from 'vitest';
import {
  buscarNavieraPlantilla,
  validarParaEncomienda,
  contenedoresDelEmbarque,
  etiquetaCartaNaviera,
  NAVIERAS_PLANTILLA,
} from './cartasEncomienda';
import type { EmbarqueCompleto } from '../components/shipments/EmbarquesData';

// ── Helper ──────────────────────────────────────────────────────────────────

function embarqueBase(overrides: Partial<EmbarqueCompleto> = {}): EmbarqueCompleto {
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
      agenteAduanal: 'Agencia Aduanal Torres S.C.',
      agenteCarga: 'Freight Co',
      agenteDestino: '',
      importador: 'Importadora Y',
      clienteCobrar: 'Cliente Nacional S.A.',
    },
    ruta: {
      origen: {
        puertoCarga: 'Shanghai',
        transportista: 'MAERSK LINE',
        buque: 'Maersk Skarstind',
        bandera: 'Denmark',
        viaje: 'V-042W',
      },
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
    productos: [
      {
        id: 'P-1',
        descripcion: 'Partes metálicas',
        tipoEmbalaje: 'Contenedor',
        piezas: 1,
        peso: 18000,
        datosContenedor: {
          numeroContenedor: 'MSKU1234567',
          tipoContenedor: '40HC',
          numeroSello: 'SEL001',
          folioSello: '',
        },
      },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
    ...overrides,
  };
}

// ── buscarNavieraPlantilla ───────────────────────────────────────────────────

describe('buscarNavieraPlantilla', () => {
  it('encuentra MAERSK con nombre completo', () => {
    const nav = buscarNavieraPlantilla('MAERSK LINE');
    expect(nav).not.toBeNull();
    expect(nav!.clave).toBe('carta_encomienda_maersk');
  });

  it('encuentra MAERSK con nombre parcial', () => {
    expect(buscarNavieraPlantilla('Maersk')?.clave).toBe('carta_encomienda_maersk');
  });

  it('encuentra MSC', () => {
    const nav = buscarNavieraPlantilla('MSC Mediterranean');
    expect(nav).not.toBeNull();
    expect(nav!.clave).toBe('carta_encomienda_msc');
    expect(nav!.tipo).toBe('encomienda_y_garantia');
  });

  it('encuentra HMM', () => {
    const nav = buscarNavieraPlantilla('HMM Co. Ltd');
    expect(nav).not.toBeNull();
    expect(nav!.clave).toBe('carta_garantia_hmm');
    expect(nav!.tipo).toBe('garantia');
  });

  it('encuentra COSCO', () => {
    expect(buscarNavieraPlantilla('COSCO SHIPPING LINES')?.clave).toBe('carta_encomienda_cosco');
  });

  it('encuentra CMA CGM', () => {
    expect(buscarNavieraPlantilla('CMA CGM S.A.')?.clave).toBe('carta_encomienda_cma_cgm');
  });

  it('encuentra Hamburg Süd con y sin acento', () => {
    expect(buscarNavieraPlantilla('Hamburg Süd')?.clave).toBe('carta_encomienda_hamburg_sud');
    expect(buscarNavieraPlantilla('Hamburg Sud')?.clave).toBe('carta_encomienda_hamburg_sud');
  });

  it('encuentra Evergreen', () => {
    expect(buscarNavieraPlantilla('EVERGREEN LINE')?.clave).toBe('carta_encomienda_evergreen');
  });

  it('encuentra Sealand', () => {
    expect(buscarNavieraPlantilla('Sealand - A Maersk Company')?.clave).toBe('carta_encomienda_sealand');
  });

  it('encuentra Agunsa', () => {
    expect(buscarNavieraPlantilla('AGUNSA Mexico')?.clave).toBe('carta_encomienda_agunsa');
  });

  it('encuentra ONE', () => {
    expect(buscarNavieraPlantilla('Ocean Network Express')?.clave).toBe('carta_encomienda_one');
  });

  it('encuentra PIL', () => {
    expect(buscarNavieraPlantilla('Pacific International Lines')?.clave).toBe('carta_encomienda_pil');
  });

  it('devuelve null para naviera desconocida', () => {
    expect(buscarNavieraPlantilla('Yang Ming')).toBeNull();
  });

  it('devuelve null para cadena vacía', () => {
    expect(buscarNavieraPlantilla('')).toBeNull();
  });

  it('devuelve null para solo espacios', () => {
    expect(buscarNavieraPlantilla('   ')).toBeNull();
  });

  it('es insensible a mayúsculas', () => {
    expect(buscarNavieraPlantilla('maersk line')?.clave).toBe('carta_encomienda_maersk');
    expect(buscarNavieraPlantilla('COSCO shipping')?.clave).toBe('carta_encomienda_cosco');
  });

  it('las 11 navieras tienen clave única', () => {
    const claves = NAVIERAS_PLANTILLA.map(n => n.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });
});

// ── validarParaEncomienda ───────────────────────────────────────────────────

describe('validarParaEncomienda', () => {
  it('devuelve vacío si el embarque tiene todos los datos', () => {
    expect(validarParaEncomienda(embarqueBase())).toHaveLength(0);
  });

  it('detecta agente aduanal faltante', () => {
    const emb = embarqueBase();
    emb.entidades.agenteAduanal = '';
    const f = validarParaEncomienda(emb);
    expect(f.some(x => x.campo.includes('agenteAduanal'))).toBe(true);
  });

  it('detecta BL faltante', () => {
    const f = validarParaEncomienda(embarqueBase({ numeroGuia: '' }));
    expect(f.some(x => x.campo === 'numeroGuia')).toBe(true);
  });

  it('detecta buque faltante', () => {
    const emb = embarqueBase();
    emb.ruta.origen.buque = '';
    const f = validarParaEncomienda(emb);
    expect(f.some(x => x.campo.includes('buque'))).toBe(true);
  });

  it('detecta naviera faltante', () => {
    const emb = embarqueBase();
    emb.ruta.origen.transportista = '';
    const f = validarParaEncomienda(emb);
    expect(f.some(x => x.campo.includes('transportista'))).toBe(true);
  });

  it('detecta naviera sin plantilla', () => {
    const emb = embarqueBase();
    emb.ruta.origen.transportista = 'Yang Ming';
    const f = validarParaEncomienda(emb);
    expect(f.some(x => x.etiqueta.includes('sin plantilla'))).toBe(true);
  });

  it('reporta todos los faltantes', () => {
    const emb = embarqueBase({ numeroGuia: '' });
    emb.entidades.agenteAduanal = '';
    emb.ruta.origen.buque = '';
    emb.ruta.origen.transportista = '';
    const f = validarParaEncomienda(emb);
    expect(f.length).toBeGreaterThanOrEqual(4);
  });
});

// ── contenedoresDelEmbarque ─────────────────────────────────────────────────

describe('contenedoresDelEmbarque', () => {
  it('extrae contenedores de los productos', () => {
    const emb = embarqueBase();
    const nums = contenedoresDelEmbarque(emb);
    expect(nums).toEqual(['MSKU1234567']);
  });

  it('devuelve vacío si no hay productos', () => {
    const emb = embarqueBase({ productos: [] });
    expect(contenedoresDelEmbarque(emb)).toEqual([]);
  });

  it('ignora productos sin datos de contenedor', () => {
    const emb = embarqueBase({
      productos: [
        { id: 'P-1', descripcion: 'Carga', tipoEmbalaje: 'Bulto', piezas: 10, peso: 500 },
      ],
    });
    expect(contenedoresDelEmbarque(emb)).toEqual([]);
  });

  it('extrae múltiples contenedores', () => {
    const emb = embarqueBase({
      productos: [
        {
          id: 'P-1', descripcion: 'A', tipoEmbalaje: 'Contenedor', piezas: 1, peso: 18000,
          datosContenedor: { numeroContenedor: 'MSKU1111111', tipoContenedor: '40HC', numeroSello: '', folioSello: '' },
        },
        {
          id: 'P-2', descripcion: 'B', tipoEmbalaje: 'Contenedor', piezas: 1, peso: 20000,
          datosContenedor: { numeroContenedor: 'MSKU2222222', tipoContenedor: '20ST', numeroSello: '', folioSello: '' },
        },
      ],
    });
    expect(contenedoresDelEmbarque(emb)).toEqual(['MSKU1111111', 'MSKU2222222']);
  });
});

// ── etiquetaCartaNaviera ────────────────────────────────────────────────────

describe('etiquetaCartaNaviera', () => {
  it('dice "Carta encomienda" para tipo encomienda', () => {
    const nav = buscarNavieraPlantilla('MAERSK')!;
    expect(etiquetaCartaNaviera(nav)).toBe('Carta encomienda Maersk');
  });

  it('dice "Carta garantía" para HMM', () => {
    const nav = buscarNavieraPlantilla('HMM')!;
    expect(etiquetaCartaNaviera(nav)).toBe('Carta garantía HMM');
  });

  it('dice "Carta encomienda y garantía" para MSC', () => {
    const nav = buscarNavieraPlantilla('MSC')!;
    expect(etiquetaCartaNaviera(nav)).toBe('Carta encomienda y garantía MSC');
  });
});
