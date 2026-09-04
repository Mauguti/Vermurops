/**
 * Tests de cargaSolicitud.ts (S-1).
 *
 * Fijan las reglas del rediseño: la modalidad se DERIVA de la carga, un «sí»
 * a medias no valida (peligrosa sin IMO, frío sin temperatura), el espejo
 * legacy mantiene vivos a los lectores viejos, y la precarga entrega líneas
 * de Pricing en cero que siguen bloqueando.
 */

import { describe, it, expect } from 'vitest';
import {
  modalidadDeCarga, validarCarga, resumenCarga, espejoLegacy,
  cargaDesdeLegacy, precargarConceptos, mercanciasAEmbarque,
} from './cargaSolicitud';
import type {
  CargaFCL, CargaLCL, CargaAerea, CargaTerrestre, CargaDespacho,
  ServicioSolicitado,
} from '../components/quotes/QuotesData';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const fcl: CargaFCL = {
  tipo: 'fcl',
  contenedores: [
    { tipoContenedor: '40', cantidad: 2 },
    { tipoContenedor: '20', cantidad: 1 },
  ],
  pesoBrutoKg: 18500,
  peligrosa: { esPeligrosa: false },
  refrigeracion: { requiere: false },
};

const lcl: CargaLCL = {
  tipo: 'lcl',
  pesoBrutoKg: 2400,
  volumenM3: 8.5,
  piezas: 12,
  bultos: [{ largoCm: 120, anchoCm: 100, altoCm: 90 }],
  estibable: false,
  peligrosa: { esPeligrosa: false },
};

const aereo: CargaAerea = {
  tipo: 'aereo',
  pesoBrutoKg: 350,
  pesoVolumetricoKg: 480,
  piezas: 4,
  bultos: [],
  peligrosa: { esPeligrosa: false },
};

const terrestre: CargaTerrestre = {
  tipo: 'terrestre',
  tipoUnidad: 'caja_seca_53',
  pesoBrutoKg: 21000,
  piezas: 26,
  requiereManiobras: true,
};

const despacho: CargaDespacho = {
  tipo: 'despacho',
  aduana: 'Manzanillo',
  operacion: 'importacion',
  fraccionesArancelarias: ['8471.30.01'],
  valorMercancia: { monto: 45000, moneda: 'USD' },
  requierePrevio: true,
  requiereNOM: false,
};

const servicioBase: ServicioSolicitado = {
  id: 'srv-1', tipo: 'maritimo',
  ruta: { origen: 'Shanghai', destino: 'Manzanillo' },
  incoterm: 'FOB', mercancia: 'Electrónica', peso: 1000, volumen: 5,
  estado: 'pendiente', cotizacionesProveedor: [], profit: 0, recargosPct: 0, conceptos: [],
};

// ─── A · Modalidad derivada ──────────────────────────────────────────────────

describe('modalidadDeCarga — derivada, nunca guardada aparte', () => {
  it('fcl y lcl son marítimo; el resto, su propio tipo', () => {
    expect(modalidadDeCarga(fcl)).toBe('maritimo');
    expect(modalidadDeCarga(lcl)).toBe('maritimo');
    expect(modalidadDeCarga(aereo)).toBe('aereo');
    expect(modalidadDeCarga(terrestre)).toBe('terrestre');
    expect(modalidadDeCarga(despacho)).toBe('despacho_aduanal');
  });
});

// ─── B · Validación ──────────────────────────────────────────────────────────

describe('validarCarga — un sí a medias no pasa', () => {
  it('las cinco cargas de fixture están completas', () => {
    for (const c of [fcl, lcl, aereo, terrestre, despacho]) {
      expect(validarCarga(c)).toEqual([]);
    }
  });

  it('FCL sin contenedores con cantidad no pasa', () => {
    const sin = { ...fcl, contenedores: [{ tipoContenedor: '40' as const, cantidad: 0 }] };
    expect(validarCarga(sin).join(' ')).toContain('contenedor');
  });

  it('peligrosa declarada exige clase IMO y UN number', () => {
    const p = { ...lcl, peligrosa: { esPeligrosa: true } };
    const faltantes = validarCarga(p);
    expect(faltantes.some(f => f.includes('IMO'))).toBe(true);
    expect(faltantes.some(f => f.includes('UN'))).toBe(true);
    const completa = { ...lcl, peligrosa: { esPeligrosa: true, claseIMO: '3', numeroUN: 'UN1263' } };
    expect(validarCarga(completa)).toEqual([]);
  });

  it('refrigeración declarada exige temperatura — y 0°C es temperatura válida', () => {
    const sinTemp = { ...fcl, refrigeracion: { requiere: true } };
    expect(validarCarga(sinTemp).join(' ')).toContain('temperatura');
    const cero = { ...fcl, refrigeracion: { requiere: true, temperaturaC: 0 } };
    expect(validarCarga(cero)).toEqual([]);
  });

  it('despacho exige aduana, al menos una fracción y valor', () => {
    const vacio: CargaDespacho = {
      ...despacho, aduana: ' ', fraccionesArancelarias: ['  '],
      valorMercancia: { monto: 0, moneda: 'USD' },
    };
    expect(validarCarga(vacio)).toHaveLength(3);
  });
});

// ─── C · Resumen ─────────────────────────────────────────────────────────────

describe('resumenCarga', () => {
  it('FCL lista los contenedores como los dicta la operación', () => {
    expect(resumenCarga(fcl)).toBe("FCL 2×40' + 1×20' · 18,500 kg");
  });

  it('LCL no estibable lo dice — es lo que cambia la estiba', () => {
    expect(resumenCarga(lcl)).toContain('no estibable');
  });

  it('la peligrosa aparece con su clase', () => {
    const p = { ...aereo, peligrosa: { esPeligrosa: true, claseIMO: '3', numeroUN: 'UN1263' } };
    expect(resumenCarga(p)).toContain('IMO 3');
  });

  it('despacho resume operación, aduana y regulaciones', () => {
    expect(resumenCarga(despacho)).toBe('Despacho impo · Manzanillo · previo');
  });
});

// ─── D · Espejo legacy ───────────────────────────────────────────────────────

describe('espejoLegacy — los lectores viejos siguen viendo peso y volumen', () => {
  it('cada carga espeja su peso; solo LCL tiene volumen', () => {
    expect(espejoLegacy(fcl)).toEqual({ peso: 18500, volumen: 0 });
    expect(espejoLegacy(lcl)).toEqual({ peso: 2400, volumen: 8.5 });
    expect(espejoLegacy(despacho)).toEqual({ peso: 0, volumen: 0 });
  });
});

// ─── E · Fallback legacy ─────────────────────────────────────────────────────

describe('cargaDesdeLegacy — patrón getOficialIds', () => {
  it('con carga nueva, la devuelve tal cual', () => {
    expect(cargaDesdeLegacy({ ...servicioBase, carga: lcl })).toBe(lcl);
  });

  it('sin nada legible devuelve null: no se inventa una carga vacía', () => {
    expect(cargaDesdeLegacy(servicioBase)).toBeNull();
  });

  it('lee un FCL E4: interpreta el contenedor y convierte toneladas', () => {
    const viejo = {
      ...servicioBase, tipo_embarque: 'FCL' as const,
      fcl_contenedor: "40'HC", fcl_peso: 18, fcl_peso_unidad: 'tons' as const,
    };
    const c = cargaDesdeLegacy(viejo);
    expect(c?.tipo).toBe('fcl');
    if (c?.tipo === 'fcl') {
      expect(c.contenedores).toEqual([{ tipoContenedor: '40hc', cantidad: 1 }]);
      expect(c.pesoBrutoKg).toBe(18000);
    }
  });

  it('lee un LCL E4 con estibable y cubicaje', () => {
    const viejo = {
      ...servicioBase, tipo_embarque: 'LCL' as const,
      lcl_num_pallets: 6, lcl_estibable: false, lcl_cubicaje_total: 12,
    };
    const c = cargaDesdeLegacy(viejo);
    if (c?.tipo === 'lcl') {
      expect(c.estibable).toBe(false);
      expect(c.volumenM3).toBe(12);
      expect(c.piezas).toBe(6);
    } else {
      throw new Error('debió leer LCL');
    }
  });

  it('un contenedor legacy ilegible se pierde con honestidad: lista vacía', () => {
    const viejo = { ...servicioBase, tipo_embarque: 'FCL' as const, fcl_contenedor: 'especial' };
    const c = cargaDesdeLegacy(viejo);
    if (c?.tipo === 'fcl') expect(c.contenedores).toEqual([]);
    else throw new Error('debió leer FCL');
  });
});

// ─── F · Precarga de conceptos ───────────────────────────────────────────────

describe('precargarConceptos — Ventas señala, Pricing decide', () => {
  const requeridos = [
    { conceptoId: 'CON-001', nombre: 'Flete internacional' },
    { conceptoId: 'CON-014', nombre: 'Maniobras destino' },
  ];

  it('cada requerimiento nace como línea en cero, con su conceptoId', () => {
    const lineas = precargarConceptos('srv-1', requeridos);
    expect(lineas).toHaveLength(2);
    expect(lineas[0].conceptoId).toBe('CON-001');
    expect(lineas[0].costo).toBe(0);
    expect(lineas[0].tarifas).toEqual([]);
    expect(lineas[0].proveedoresOficialIds).toEqual([]);
  });

  it('el cero precargado NO es costo capturado: sigue bloqueando', () => {
    const lineas = precargarConceptos('srv-1', requeridos);
    expect(lineas[0].costoCapturado).toBeUndefined();
  });

  it('los ids no colisionan aunque nazcan en el mismo milisegundo', () => {
    const lineas = precargarConceptos('srv-1', requeridos);
    expect(new Set(lineas.map(l => l.id)).size).toBe(2);
  });
});

// ─── G · Herencia de mercancías ──────────────────────────────────────────────

describe('mercanciasAEmbarque — se hereda, no se recaptura', () => {
  it('mapea descripción, piezas y peso a MercanciaLine', () => {
    const lineas = mercanciasAEmbarque([
      { id: 'm1', descripcion: 'Rollos de tela sintética', piezas: 40, pesoKg: 800 },
      { id: 'm2', descripcion: '  ', piezas: 1 },
      { id: 'm3', descripcion: 'Botones', valorUnitario: 2, moneda: 'USD' },
    ]);
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toMatchObject({ descripcion: 'Rollos de tela sintética', cantidad: 40, pesoKg: 800 });
    expect(lineas[1]).toMatchObject({ descripcion: 'Botones', cantidad: 0, pesoKg: 0 });
  });

  it('sin detalle devuelve vacío, no líneas fantasma', () => {
    expect(mercanciasAEmbarque(undefined)).toEqual([]);
  });
});
