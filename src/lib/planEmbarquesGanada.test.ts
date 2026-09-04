/**
 * planEmbarquesGanada.test.ts
 *
 * A-1. Qué embarques nacen al marcar la cotización como ganada.
 *
 * Lo que protegen: quien cierra la venta NO ve el resultado. Un cargo perdido,
 * un cargo duplicado o una serie de folio equivocada no se descubren hasta que
 * hay que pagarle a un proveedor o timbrar una factura.
 */

import { describe, it, expect } from 'vitest';
import { planearEmbarquesDeGanada, traficoDelGrupo } from './planEmbarquesGanada';
import { aplanarCotizacion, totalVenta } from './lineasCotizacion';
import {
  KanbanQuote, ServicioSolicitado, ConceptoCotizacion, CotizacionProveedor,
} from '../components/quotes/QuotesData';
import { ClienteVermur } from '../components/clientes/ClientesData';
import { Servicio } from '../config/serviciosStore';

const CLIENTE_OK: ClienteVermur = {
  id: 'CLI-001', nombre: 'Industrias Alfa', rfc: 'IAL890315AB2',
  statusOperativo: 'ACTIVO', validadoFiscalmente: true,
} as ClienteVermur;

/** Catálogo mínimo: el resolver canónico cubre 'maritimo'/'terrestre'/'aereo'. */
const CATALOGO: Servicio[] = [];

function tarifa(p: Partial<CotizacionProveedor> & { id: string; monto: number }): CotizacionProveedor {
  return { proveedor: 'Naviera X', contacto: 'C', moneda: 'USD', seleccionada: false, ...p } as CotizacionProveedor;
}
function concepto(p: Partial<ConceptoCotizacion> & { id: string; nombre: string }): ConceptoCotizacion {
  return { costo: 0, profit: 0, venta: 0, margen: 0, subconceptos: [], tarifas: [], proveedoresOficialIds: [], ...p } as ConceptoCotizacion;
}
function servicio(p: Partial<ServicioSolicitado> & { id: string }): ServicioSolicitado {
  return {
    tipo: 'maritimo', ruta: { origen: 'Shanghai', destino: 'Manzanillo' },
    incoterm: 'FOB', mercancia: 'Componentes', peso: 1000, volumen: 10,
    estado: 'cotizado', cotizacionesProveedor: [], profit: 0, recargosPct: 0, conceptos: [], ...p,
  } as ServicioSolicitado;
}
function quote(servicios: ServicioSolicitado[], extra: Partial<KanbanQuote> = {}): KanbanQuote {
  return {
    id: 'COT-2026-0042', etapa: 'ganada',
    prospecto: { empresa: 'Industrias Alfa', contacto: 'A', telefono: '', email: '', origen: 'web' },
    clienteId: 'CLI-001', vendedorId: 'v1', pricingId: 'p1', servicios,
    valorTotalConsolidado: 0, moneda: 'USD', estadoFinal: 'ganada', motivoPerdida: null,
    createdAt: '', updatedAt: '', historialEtapas: [], actividades: [], chat: [],
    ...extra,
  } as KanbanQuote;
}

const SRV_MAR = servicio({
  id: 'srv-1', tipo: 'maritimo', trafico: 'importacion',
  conceptos: [concepto({
    id: 'c1', nombre: 'Flete marítimo', profit: 500,
    tarifas: [tarifa({ id: 't1', monto: 2000, proveedor: 'Maersk', proveedorId: 'PRV-001' })],
    proveedoresOficialIds: ['t1'],
  })],
});

const SRV_TER = servicio({
  id: 'srv-2', tipo: 'terrestre', trafico: 'importacion',
  ruta: { origen: 'Manzanillo', destino: 'Querétaro' },
  conceptos: [concepto({
    id: 'c2', nombre: 'Acarreo', profit: 100,
    tarifas: [tarifa({ id: 't2', monto: 400, proveedor: 'Transportes Y', proveedorId: 'PRV-002' })],
    proveedoresOficialIds: ['t2'],
  })],
});

const plan = (q: KanbanQuote, cliente: ClienteVermur | null = CLIENTE_OK) =>
  planearEmbarquesDeGanada(q, CATALOGO, { cliente, fechaReferencia: '2026-08-31' });

// ─── A · Un solo embarque por defecto ────────────────────────────────────────

describe('A · por defecto todo cae en un embarque', () => {
  it('una cotización multimodal genera UN embarque, el de mayor venta', () => {
    const p = plan(quote([SRV_MAR, SRV_TER]));
    expect(p.grupos).toHaveLength(1);
    expect(p.grupos[0].modalidad).toBe('maritimo');
    expect(p.grupos[0].esPrincipal).toBe(true);
  });

  it('el acarreo terrestre viaja DENTRO del marítimo, no aparte', () => {
    const p = plan(quote([SRV_MAR, SRV_TER]));
    const conceptos = p.grupos[0].cargos.map(c => c.concepto);
    expect(conceptos).toContain('Flete marítimo');
    expect(conceptos).toContain('Acarreo');
  });
});

// ─── B · Servicios que se operan aparte ──────────────────────────────────────

describe('B · generaEmbarquePropio', () => {
  const conIndependiente = quote([SRV_MAR, { ...SRV_TER, generaEmbarquePropio: true }]);

  it('genera un embarque por cada servicio marcado', () => {
    const p = plan(conIndependiente);
    expect(p.grupos).toHaveLength(2);
    expect(p.grupos.map(g => g.modalidad).sort()).toEqual(['maritimo', 'terrestre']);
  });

  it('cada embarque sale de su propia serie', () => {
    const p = plan(conIndependiente);
    const porModalidad = Object.fromEntries(p.grupos.map(g => [g.modalidad, g.prefijo]));
    expect(porModalidad.maritimo).toBe('VLIM');
    expect(porModalidad.terrestre).toBe('VLIT');
  });

  it('pide un folio por embarque, con su prefijo', () => {
    const p = plan(conIndependiente);
    expect(p.pedidosDeFolio).toHaveLength(2);
    expect(p.pedidosDeFolio.every(x => x.cuantos === 1)).toBe(true);
  });
});

// ─── C · La invariante del dinero ────────────────────────────────────────────

describe('C · ninguna línea se pierde ni se duplica', () => {
  const casos: [string, KanbanQuote][] = [
    ['un solo servicio', quote([SRV_MAR])],
    ['multimodal en un embarque', quote([SRV_MAR, SRV_TER])],
    ['con uno independiente', quote([SRV_MAR, { ...SRV_TER, generaEmbarquePropio: true }])],
    ['los dos independientes', quote([
      { ...SRV_MAR, generaEmbarquePropio: true },
      { ...SRV_TER, generaEmbarquePropio: true },
    ])],
  ];

  it.each(casos)('%s: cada línea cae en exactamente un embarque', (_, q) => {
    const p = plan(q);
    const ids = p.grupos.flatMap(g => g.lineas.map(l => l.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(aplanarCotizacion(q).map(l => l.id).sort());
  });

  it.each(casos)('%s: la suma de los ingresos iguala la venta de la cotización', (_, q) => {
    const p = plan(q);
    const ingresos = p.grupos
      .flatMap(g => g.cargos)
      .filter(c => c.tipo === 'ingreso')
      .reduce((a, c) => a + c.monto, 0);
    expect(Math.round(ingresos * 100) / 100).toBe(totalVenta(aplanarCotizacion(q)));
  });

  it('ningún cargo aparece en dos embarques', () => {
    const p = plan(quote([SRV_MAR, { ...SRV_TER, generaEmbarquePropio: true }]));
    const ids = p.grupos.flatMap(g => g.cargos.map(c => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── D · Tráfico y serie del folio ───────────────────────────────────────────

describe('D · tráfico', () => {
  it('el declarado manda', () => {
    const p = plan(quote([SRV_MAR]));
    expect(p.grupos[0].trafico).toBe('impo');
    expect(p.grupos[0].prefijo).toBe('VLIM');
  });

  it('lo deriva de la ruta cuando no está declarado', () => {
    const sinDeclarar = servicio({
      ...SRV_MAR, id: 'srv-1', trafico: undefined,
      ruta: { origen: 'Manzanillo', destino: 'Shanghai' },
    });
    const p = plan(quote([sinDeclarar]));
    expect(p.grupos[0].trafico).toBe('expo');
    expect(p.grupos[0].prefijo).toBe('VLEM');
  });

  it('sin tráfico usa la serie provisional y lo avisa, en vez de inventar la serie', () => {
    const ambiguo = servicio({
      ...SRV_MAR, id: 'srv-1', trafico: undefined,
      ruta: { origen: 'Veracruz', destino: 'Manzanillo' },
    });
    const p = plan(quote([ambiguo]));
    expect(p.grupos[0].trafico).toBeNull();
    expect(p.grupos[0].prefijo).toBe('VL');
    expect(p.grupos[0].advertencias.some(a => a.tipo === 'folio_provisional')).toBe(true);
  });

  it('tráficos en conflicto: toma el de mayor venta y lo avisa', () => {
    const q = quote([SRV_MAR, { ...SRV_TER, trafico: 'exportacion' }]);
    const p = plan(q);
    expect(p.grupos[0].trafico).toBe('impo');   // el marítimo vende más
    expect(p.grupos[0].advertencias.some(a =>
      a.tipo === 'folio_provisional' && a.detalle.includes('distintos'))).toBe(true);
  });

  it('traficoDelGrupo sin servicios devuelve null con motivo', () => {
    const r = traficoDelGrupo(
      { clave: 'principal', esPrincipal: true, modalidad: 'maritimo', servicioIds: [], lineas: [], ventaTotal: 0 },
      [],
    );
    expect(r.trafico).toBeNull();
    expect(r.advertencias).toHaveLength(1);
  });
});

// ─── E · Advertencias ────────────────────────────────────────────────────────

describe('E · advertencias', () => {
  it('el expediente del cliente se revisa una vez, no por embarque', () => {
    const q = quote([SRV_MAR, { ...SRV_TER, generaEmbarquePropio: true }], { clienteId: undefined });
    const p = plan(q, null);
    expect(p.advertenciasGenerales.filter(a => a.tipo === 'cliente_sin_expediente')).toHaveLength(1);
    expect(p.grupos.flatMap(g => g.advertencias).some(a => a.tipo === 'cliente_sin_expediente')).toBe(false);
  });

  it('las de una línea van al embarque que se la llevó', () => {
    const sinProveedor = servicio({
      id: 'srv-3', tipo: 'terrestre', trafico: 'importacion', generaEmbarquePropio: true,
      ruta: { origen: 'Manzanillo', destino: 'León' },
      conceptos: [concepto({
        id: 'c3', nombre: 'Maniobra', profit: 50,
        tarifas: [tarifa({ id: 't3', monto: 300, proveedor: '', proveedorId: undefined })],
        proveedoresOficialIds: ['t3'],
      })],
    });
    const p = plan(quote([SRV_MAR, sinProveedor]));
    const terrestre = p.grupos.find(g => g.modalidad === 'terrestre')!;
    const maritimo = p.grupos.find(g => g.modalidad === 'maritimo')!;
    expect(terrestre.advertencias.some(a => a.tipo === 'gasto_sin_proveedor')).toBe(true);
    expect(maritimo.advertencias.some(a => a.tipo === 'gasto_sin_proveedor')).toBe(false);
  });
});

// ─── F · Una venta ganada siempre produce embarque ───────────────────────────

describe('F · el caso degenerado', () => {
  it('una cotización sin líneas genera un embarque vacío y lo avisa', () => {
    const p = plan(quote([]));
    expect(p.grupos).toHaveLength(1);
    expect(p.grupos[0].cargos).toHaveLength(0);
    expect(p.grupos[0].advertencias.some(a => a.tipo === 'sin_venta')).toBe(true);
    expect(p.pedidosDeFolio).toHaveLength(1);
  });
});

// ─── G · C.4: la generación lee DATOS, no la agrupación visual ───────────────
//
// La ficha pasó de cinco tarjetas por modalidad a una tabla única. Este bloque
// fija el contrato que hizo seguro ese cambio: los embarques salen de
// servicio.tipo y de las líneas, nunca de cómo se pinten. Si alguien algún día
// hace que la generación dependa de la capa visual, esto truena.

import { agregarLinea, moverLineaDeServicio, aplicarEdicionLinea } from './lineasCotizacion';

describe('G · la tabla única no cambia los embarques', () => {
  it('mover una línea fresca de servicio la manda al embarque del servicio nuevo', () => {
    // Cotización multimodal, ambos servicios independientes: dos embarques.
    const q = quote([
      { ...SRV_MAR, generaEmbarquePropio: true },
      { ...SRV_TER, generaEmbarquePropio: true },
    ]);

    // Línea fresca en el marítimo → se mueve al terrestre → se trabaja ahí.
    // La fresca se identifica por nombre vacío: los conceptos del fixture
    // tampoco traen conceptoId, y ese find se equivocaba de línea.
    let conLinea = agregarLinea(q, { servicioId: 'srv-1', concepto: '' });
    const fresca = aplanarCotizacion(conLinea).find(l => l.concepto === '')!;
    conLinea = moverLineaDeServicio(conLinea, fresca.id, 'srv-2');
    const movida = aplanarCotizacion(conLinea).find(l => l.concepto === '')!;
    conLinea = aplicarEdicionLinea(conLinea, movida.id, {
      conceptoId: 'CON-050', concepto: 'Maniobra en destino', costo: 300, profit: 50,
    });

    const p = plan(conLinea);
    const terrestre = p.grupos.find(g => g.modalidad === 'terrestre')!;
    const maritimo = p.grupos.find(g => g.modalidad === 'maritimo')!;

    // El cargo cae en el embarque TERRESTRE, con su folio VLIT — no en el
    // marítimo donde la línea nació.
    expect(terrestre.cargos.some(c => c.concepto === 'Maniobra en destino')).toBe(true);
    expect(maritimo.cargos.some(c => c.concepto === 'Maniobra en destino')).toBe(false);
    expect(terrestre.prefijo).toBe('VLIT');
  });

  it('el plan de una multimodal es el mismo que antes del cambio visual', () => {
    // Los valores fijados el 1-sep en el bloque B, repetidos aquí a propósito:
    // si el cambio de presentación hubiera tocado la generación, divergen.
    const p = plan(quote([SRV_MAR, { ...SRV_TER, generaEmbarquePropio: true }]));
    expect(p.grupos).toHaveLength(2);
    expect(Object.fromEntries(p.grupos.map(g => [g.modalidad, g.prefijo])))
      .toEqual({ maritimo: 'VLIM', terrestre: 'VLIT' });
  });
});

