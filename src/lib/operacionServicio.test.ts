/**
 * operacionServicio.test.ts — Fase A (24-sep-2026).
 *
 * La pestaña Información edita la carga tipada en línea. Estos tests fijan
 * que una cotización vieja se lee sin perder nada, que el guardado conserva
 * lo que el formulario no toca, y que las ediciones tras «A Pricing» dejan
 * UNA constancia en el historial, no una por tecla.
 */

import { describe, it, expect } from 'vitest';
import {
  modalidadDeTipo, borradorDeServicio, servicioDesdeBorrador, legacySinMapear,
  puedeEditarOperacion, camposOperacionCambiados, anotarCambioOperacion,
  TITULO_CAMBIO_OPERACION,
} from './operacionServicio';
import type { KanbanQuote, ServicioSolicitado } from '../components/quotes/QuotesData';

const base = (extra: Partial<ServicioSolicitado> = {}): ServicioSolicitado => ({
  id: 'srv-1', tipo: 'maritimo',
  ruta: { origen: 'Shanghai', destino: 'Manzanillo', origenPuertoId: 'PTO-1', destinoPuertoId: 'PTO-2', aduanaSalida: 'SHA' },
  incoterm: 'FOB', mercancia: 'Rollos de tela', peso: 18500, volumen: 0,
  estado: 'pendiente', cotizacionesProveedor: [], profit: 0, recargosPct: 0,
  conceptos: [{ id: 'c1', nombre: 'Ocean Freight', conceptoId: 'CON-1', costo: 1, profit: 0, venta: 1, margen: 0, subconceptos: [], tarifas: [], proveedoresOficialIds: [], orden: 0 }] as never,
  ...extra,
});

describe('modalidadDeTipo', () => {
  it('traduce las variantes con que se guardó el tipo', () => {
    expect(modalidadDeTipo('maritimo')).toBe('maritimo');
    expect(modalidadDeTipo('Flete Aéreo')).toBe('aereo');
    expect(modalidadDeTipo('aduanal')).toBe('despacho_aduanal');
    expect(modalidadDeTipo('despacho_aduanal')).toBe('despacho_aduanal');
    expect(modalidadDeTipo('terrestre')).toBe('terrestre');
    expect(modalidadDeTipo(undefined)).toBe('maritimo');
  });
});

describe('borradorDeServicio', () => {
  it('legacy FCL: lee contenedor, peso y ruta sin inventar nada', () => {
    const d = borradorDeServicio(base({ tipo_embarque: 'FCL', fcl_contenedor: "40'HC", fcl_peso: 18, fcl_peso_unidad: 'tons' }));
    expect(d.carga.tipo).toBe('fcl');
    if (d.carga.tipo === 'fcl') {
      expect(d.carga.contenedores).toEqual([{ tipoContenedor: '40hc', cantidad: 1 }]);
      expect(d.carga.pesoBrutoKg).toBe(18000);
    }
    expect(d.origen).toBe('Shanghai');
    expect(d.origenPuertoId).toBe('PTO-1');
    expect(d.incoterm).toBe('FOB');
  });

  it('sin carga ni legacy: arranca la carga de la modalidad con el peso plano', () => {
    const d = borradorDeServicio(base({ mercancia: 'Por definir' }));
    expect(d.carga.tipo).toBe('fcl');
    if ('pesoBrutoKg' in d.carga) expect(d.carga.pesoBrutoKg).toBe(18500);
    expect(d.mercancia).toBe('');
  });

  it('con carga tipada, la carga manda', () => {
    const carga = { tipo: 'aereo' as const, pesoBrutoKg: 350, pesoVolumetricoKg: 480, piezas: 4, bultos: [], peligrosa: { esPeligrosa: false } };
    expect(borradorDeServicio(base({ tipo: 'aereo', carga })).carga).toBe(carga);
  });
});

describe('servicioDesdeBorrador', () => {
  it('conserva lo que el formulario no toca y espeja peso y volumen', () => {
    const s = base({ trafico: 'importacion', ubicacion: 'destino', notasOperativas: 'ojo' });
    const d = borradorDeServicio(s);
    const nuevo = servicioDesdeBorrador(s, {
      ...d, origen: 'Ningbo', origenPuertoId: 'PTO-9',
      carga: { ...d.carga, pesoBrutoKg: 20000 } as never,
    });
    expect(nuevo.conceptos).toBe(s.conceptos);
    expect(nuevo.ruta.aduanaSalida).toBe('SHA');
    expect(nuevo.ruta.origen).toBe('Ningbo');
    expect(nuevo.ruta.destino).toBe('Manzanillo');
    expect(nuevo.peso).toBe(20000);
    expect(nuevo.trafico).toBe('importacion');
    expect(nuevo.notasOperativas).toBe('ojo');
  });

  it('el despacho declara su propio tráfico', () => {
    const s = base({ tipo: 'aduanal' });
    const d = borradorDeServicio(s);
    const nuevo = servicioDesdeBorrador(s, {
      ...d,
      carga: { tipo: 'despacho', aduana: 'Manzanillo', operacion: 'exportacion', fraccionesArancelarias: ['1'], valorMercancia: { monto: 1, moneda: 'USD' }, requierePrevio: false, requiereNOM: false },
    });
    expect(nuevo.trafico).toBe('exportacion');
  });

  it('descarta requeridos sin concepto y no guarda filaId', () => {
    const s = base();
    const d = borradorDeServicio(s);
    const nuevo = servicioDesdeBorrador(s, {
      ...d, conceptosRequeridos: [{ filaId: 'f1', conceptoId: 'CON-2', nombre: 'THC' }, { filaId: 'f2', conceptoId: '', nombre: '' }],
    });
    expect(nuevo.conceptosRequeridos).toEqual([{ conceptoId: 'CON-2', nombre: 'THC' }]);
  });
});

describe('legacySinMapear', () => {
  it('enseña lo que la carga tipada no representa, y solo si tiene valor', () => {
    expect(legacySinMapear(base())).toEqual([]);
    const l = legacySinMapear(base({ fcl_reqs: 'humedad < 60%', food_grade: true, reforzado: false, ter_tipo: 'FTL' }));
    expect(l).toEqual([
      { etiqueta: 'Requerimientos especiales', valor: 'humedad < 60%' },
      { etiqueta: 'Food grade', valor: 'Sí' },
      { etiqueta: 'FTL / LTL', valor: 'FTL' },
    ]);
  });
});

describe('puedeEditarOperacion', () => {
  it('Ventas solo en solicitud_cliente', () => {
    expect(puedeEditarOperacion('ventas', 'solicitud_cliente', false)).toBe(true);
    expect(puedeEditarOperacion('ventas', 'solicitado_pricing', false)).toBe(false);
  });
  it('Pricing y Admin hasta que se congele', () => {
    expect(puedeEditarOperacion('pricing', 'consolidada', false)).toBe(true);
    expect(puedeEditarOperacion('admin', 'negociacion', false)).toBe(true);
    expect(puedeEditarOperacion('pricing', 'consolidada', true)).toBe(false);
  });
  it('Operaciones y Administración leen', () => {
    expect(puedeEditarOperacion('operaciones', 'consolidada', false)).toBe(false);
    expect(puedeEditarOperacion('administracion', 'consolidada', false)).toBe(false);
  });
});

describe('camposOperacionCambiados', () => {
  it('nombra lo que cambió y separa carga de mercancías', () => {
    const a = base({ carga: { tipo: 'fcl', contenedores: [], pesoBrutoKg: 1, peligrosa: { esPeligrosa: false }, refrigeracion: { requiere: false }, mercancias: [] } });
    const b = { ...a, carga: { ...a.carga!, pesoBrutoKg: 2, mercancias: [{ id: 'm', descripcion: 'x' }] }, incoterm: 'CIF' } as ServicioSolicitado;
    expect(camposOperacionCambiados(a, b)).toEqual(['la carga', 'el detalle de mercancía', 'el incoterm']);
    expect(camposOperacionCambiados(a, a)).toEqual([]);
  });
});

describe('anotarCambioOperacion', () => {
  const quote = (actividades: KanbanQuote['actividades'] = []) =>
    ({ id: 'COT-1', actividades } as unknown as KanbanQuote);

  it('crea una nota con el resumen', () => {
    const q = anotarCambioOperacion(quote(), ['la carga', 'la ruta'], 'u1', '2026-09-24T10:00:00.000Z');
    expect(q.actividades).toHaveLength(1);
    expect(q.actividades[0]).toMatchObject({ tipo: 'nota', titulo: TITULO_CAMBIO_OPERACION, descripcion: 'Se cambió la carga y la ruta.', responsableId: 'u1' });
  });

  it('acumula en la misma nota dentro de diez minutos, sin repetir campos', () => {
    let q = anotarCambioOperacion(quote(), ['la carga'], 'u1', '2026-09-24T10:00:00.000Z');
    q = anotarCambioOperacion(q, ['la carga', 'el incoterm'], 'u1', '2026-09-24T10:04:00.000Z');
    expect(q.actividades).toHaveLength(1);
    expect(q.actividades[0].descripcion).toBe('Se cambió la carga y el incoterm.');
  });

  it('otro autor o más de diez minutos: nota nueva', () => {
    let q = anotarCambioOperacion(quote(), ['la carga'], 'u1', '2026-09-24T10:00:00.000Z');
    q = anotarCambioOperacion(q, ['la ruta'], 'u2', '2026-09-24T10:01:00.000Z');
    q = anotarCambioOperacion(q, ['la ruta'], 'u1', '2026-09-24T10:30:00.000Z');
    expect(q.actividades).toHaveLength(3);
  });

  it('sin cambios no escribe nada', () => {
    const q = quote();
    expect(anotarCambioOperacion(q, [], 'u1', '2026-09-24T10:00:00.000Z')).toBe(q);
  });
});
