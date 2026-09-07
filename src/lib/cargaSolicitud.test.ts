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

// ─── H · Herencia de productos al embarque ───────────────────────────────────

import { productosDesdeCarga, productosDesdeGrupo } from './cargaSolicitud';

describe('productosDesdeCarga — el embarque nace con lo que Ventas declaró', () => {
  const srv = (carga: Parameters<typeof modalidadDeCarga>[0], mercancia = 'Rollos de tela'):
    ServicioSolicitado => ({ ...servicioBase, mercancia, carga });

  it('FCL de varios contenedores: un producto por unidad, tipo prellenado, número vacío', () => {
    const productos = productosDesdeCarga(srv(fcl), 'Importadora del Golfo', 'COT-1');
    expect(productos).toHaveLength(3); // 2×40' + 1×20'
    expect(productos.map(p => p.datosContenedor?.tipoContenedor)).toEqual(["40'", "40'", "20'"]);
    expect(productos.every(p => p.datosContenedor?.numeroContenedor === '')).toBe(true);
    expect(productos.every(p => p.tipoConsolidacion === 'FCL')).toBe(true);
  });

  it('con VARIOS contenedores el peso no se reparte — repartirlo sería inventar', () => {
    const productos = productosDesdeCarga(srv(fcl), 'Cliente', 'COT-1');
    expect(productos.every(p => p.peso === 0)).toBe(true);
  });

  it('con UN contenedor el peso total sí viaja en él', () => {
    const uno = { ...fcl, contenedores: [{ tipoContenedor: '40hc' as const, cantidad: 1 }] };
    const [p] = productosDesdeCarga(srv(uno), 'Cliente', 'COT-1');
    expect(p.peso).toBe(18500);
  });

  it('LCL hereda piezas, peso y volumen como un bulto', () => {
    const [p] = productosDesdeCarga(srv(lcl), 'Cliente', 'COT-1');
    expect(p).toMatchObject({ tipoEmbalaje: 'Bulto', tipoConsolidacion: 'LCL', piezas: 12, peso: 2400, volumen: 8.5 });
  });

  it('las mercancías detalladas nacen como pallet inicial con sus líneas', () => {
    const conDetalle = { ...lcl, mercancias: [
      { id: 'm1', descripcion: 'Tela roja', piezas: 20, pesoKg: 1200 },
      { id: 'm2', descripcion: 'Tela azul', piezas: 18, pesoKg: 1200 },
    ] };
    const [p] = productosDesdeCarga(srv(conDetalle), 'Importadora del Golfo', 'COT-9');
    expect(p.pallets).toHaveLength(1);
    expect(p.pallets![0].clienteNombre).toBe('Importadora del Golfo');
    expect(p.pallets![0].cotizacionRef).toBe('COT-9');
    expect(p.pallets![0].mercancia!.map(m => m.descripcion)).toEqual(['Tela roja', 'Tela azul']);
  });

  it('el despacho no mueve carga propia: cero productos', () => {
    expect(productosDesdeCarga(srv(despacho), 'Cliente', 'COT-1')).toEqual([]);
  });

  it('sin carga legible el embarque nace como hoy: vacío, no inventado', () => {
    expect(productosDesdeCarga(servicioBase, 'Cliente', 'COT-1')).toEqual([]);
  });

  it('una solicitud VIEJA (campos E4) también hereda', () => {
    const viejo = {
      ...servicioBase, tipo_embarque: 'FCL' as const,
      fcl_contenedor: "40'HC", fcl_peso: 18, fcl_peso_unidad: 'tons' as const,
    };
    const [p] = productosDesdeCarga(viejo, 'Cliente', 'COT-1');
    expect(p.datosContenedor?.tipoContenedor).toBe("40'HC");
    expect(p.peso).toBe(18000);
  });

  it('un grupo junta los productos de sus servicios', () => {
    const productos = productosDesdeGrupo([srv(fcl), srv(despacho), srv(terrestre)], 'Cliente', 'COT-1');
    expect(productos).toHaveLength(4); // 3 contenedores + 1 bulto terrestre, despacho aporta 0
  });
});

// ─── I · ¿Hay algo que perder al cambiar de modalidad? ───────────────────────

import { borradorTieneDatos } from './cargaSolicitud';

describe('borradorTieneDatos — solo se pregunta cuando hay algo que perder', () => {
  const vacio = {
    carga: {
      tipo: 'fcl' as const,
      contenedores: [{ tipoContenedor: '40' as const, cantidad: 1 }],
      pesoBrutoKg: 0,
      peligrosa: { esPeligrosa: false },
      refrigeracion: { requiere: false },
    },
    origen: '', destino: '', mercancia: '', conceptosRequeridos: [],
  };

  it('un formulario recién abierto no tiene datos: no se confirma nada', () => {
    expect(borradorTieneDatos(vacio)).toBe(false);
  });

  it('un renglón de concepto sin elegir tampoco cuenta', () => {
    expect(borradorTieneDatos({ ...vacio, conceptosRequeridos: [{ conceptoId: '' }] })).toBe(false);
  });

  it('la ruta, la descripción o un concepto elegido sí cuentan', () => {
    expect(borradorTieneDatos({ ...vacio, origen: 'Shanghai' })).toBe(true);
    expect(borradorTieneDatos({ ...vacio, mercancia: 'Tela' })).toBe(true);
    expect(borradorTieneDatos({ ...vacio, conceptosRequeridos: [{ conceptoId: 'CON-001' }] })).toBe(true);
  });

  it('el peso y la peligrosa cuentan en cualquier modalidad', () => {
    expect(borradorTieneDatos({ ...vacio, carga: { ...vacio.carga, pesoBrutoKg: 100 } })).toBe(true);
    expect(borradorTieneDatos({ ...vacio, carga: { ...vacio.carga, peligrosa: { esPeligrosa: true } } })).toBe(true);
  });

  it('FCL: el 1×40 de arranque no es dato; cambiarlo o agregar otro sí', () => {
    expect(borradorTieneDatos({ ...vacio, carga: { ...vacio.carga, contenedores: [{ tipoContenedor: '20', cantidad: 1 }] } })).toBe(true);
    expect(borradorTieneDatos({ ...vacio, carga: { ...vacio.carga, contenedores: [{ tipoContenedor: '40', cantidad: 3 }] } })).toBe(true);
    expect(borradorTieneDatos({ ...vacio, carga: { ...vacio.carga, refrigeracion: { requiere: true } } })).toBe(true);
  });

  it('LCL: el estibable en NO es una decisión capturada', () => {
    const lclVacio = { ...vacio, carga: { tipo: 'lcl' as const, pesoBrutoKg: 0, volumenM3: 0, piezas: 0, bultos: [], estibable: true, peligrosa: { esPeligrosa: false } } };
    expect(borradorTieneDatos(lclVacio)).toBe(false);
    expect(borradorTieneDatos({ ...lclVacio, carga: { ...lclVacio.carga, estibable: false } })).toBe(true);
  });

  it('despacho: aduana, fracción, valor o los toggles cuentan', () => {
    const despVacio = { ...vacio, carga: { tipo: 'despacho' as const, aduana: '', operacion: 'importacion' as const, fraccionesArancelarias: [''], valorMercancia: { monto: 0, moneda: 'USD' as const }, requierePrevio: false, requiereNOM: false } };
    expect(borradorTieneDatos(despVacio)).toBe(false);
    expect(borradorTieneDatos({ ...despVacio, carga: { ...despVacio.carga, aduana: 'Manzanillo' } })).toBe(true);
    expect(borradorTieneDatos({ ...despVacio, carga: { ...despVacio.carga, requiereNOM: true } })).toBe(true);
  });

  it('las mercancías detalladas cuentan, pero un renglón en blanco no', () => {
    expect(borradorTieneDatos({ ...vacio, carga: { ...vacio.carga, mercancias: [{ id: 'm1', descripcion: '  ' }] } })).toBe(false);
    expect(borradorTieneDatos({ ...vacio, carga: { ...vacio.carga, mercancias: [{ id: 'm1', descripcion: 'Tela' }] } })).toBe(true);
  });
});
