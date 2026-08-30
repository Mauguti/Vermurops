/**
 * generacionEmbarque.test.ts
 *
 * E-4a/E-4b. La parte pura: congelado de la cotización y forma del embarque
 * que nace al marcarla ganada.
 *
 * Lo que protegen: quien dispara la generación no ve el resultado. Si el
 * embarque nace con la modalidad equivocada o sin los cargos, nadie se entera
 * hasta que Operaciones lo abre.
 */

import { describe, it, expect } from 'vitest';
import {
  construirEmbarqueDesdeCotizacion, modalidadDominante,
  agruparParaEmbarques, prefijoFolio, PREFIJO_FOLIO,
} from './generacionEmbarque';
import { aplanarCotizacion, totalVenta } from './lineasCotizacion';
import {
  estaCongelada, camposBloqueados, CAMPOS_EDITABLES_CONGELADA,
} from './lineasCotizacion';
import { mapearCotizacionAEmbarque } from './cotizacionAEmbarque';
import {
  KanbanQuote, ServicioSolicitado, ConceptoCotizacion, CotizacionProveedor,
} from '../components/quotes/QuotesData';
import { totalesDe } from '../components/shipments/EmbarquesData';
import { ClienteVermur } from '../components/clientes/ClientesData';

/**
 * Cliente con expediente completo.
 *
 * Que esté aquí no es decorativo: si la transacción de E-4 no lee el documento
 * del cliente, el mapeo no puede verificarlo y TODOS los embarques automáticos
 * nacerían con una advertencia falsa de «no se pudo leer su expediente».
 * Leer clientes/{clienteId} es requisito de E-4c.
 */
const CLIENTE_OK: ClienteVermur = {
  id: 'CLI-001', nombre: 'Industrias Alfa', rfc: 'IAL890315AB2',
  statusOperativo: 'ACTIVO', validadoFiscalmente: true,
} as ClienteVermur;

const AHORA = '2026-08-30T10:15:00.000Z';

function tarifa(p: Partial<CotizacionProveedor> & { id: string; monto: number }): CotizacionProveedor {
  return { proveedor: 'Naviera X', contacto: 'C', moneda: 'USD', seleccionada: false, ...p } as CotizacionProveedor;
}
function concepto(p: Partial<ConceptoCotizacion> & { id: string; nombre: string }): ConceptoCotizacion {
  return { costo: 0, profit: 0, venta: 0, margen: 0, subconceptos: [], tarifas: [], proveedoresOficialIds: [], ...p } as ConceptoCotizacion;
}
function servicio(p: Partial<ServicioSolicitado> & { id: string }): ServicioSolicitado {
  return {
    tipo: 'maritimo', ruta: { origen: 'Shanghai', destino: 'Manzanillo' },
    incoterm: 'FOB', mercancia: 'Componentes electrónicos', peso: 1000, volumen: 10,
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
  id: 'srv-1', tipo: 'maritimo',
  conceptos: [concepto({
    id: 'c1', nombre: 'Flete marítimo', profit: 500,
    tarifas: [tarifa({ id: 't1', monto: 2000, proveedor: 'Maersk', proveedorId: 'PRV-001' })],
    proveedoresOficialIds: ['t1'],
  })],
});

const SRV_TER = servicio({
  id: 'srv-2', tipo: 'terrestre',
  ruta: { origen: 'Manzanillo', destino: 'Querétaro' },
  conceptos: [concepto({
    id: 'c2', nombre: 'Acarreo', profit: 100,
    tarifas: [tarifa({ id: 't2', monto: 400, proveedor: 'Transportes Y', proveedorId: 'PRV-002' })],
    proveedoresOficialIds: ['t2'],
  })],
});

function generar(
  q: KanbanQuote,
  origen: 'automatico' | 'manual' = 'automatico',
  cliente: ClienteVermur | null = CLIENTE_OK,
) {
  const { cargos, advertencias } = mapearCotizacionAEmbarque(q, {
    fechaReferencia: '2026-08-30', cliente,
  });
  return construirEmbarqueDesdeCotizacion({
    quote: q, folio: 'SHP-2026-0007', cargos, advertencias,
    origen, generadoPor: 'Ana Ramírez', ahora: AHORA,
  });
}

describe('congelado de la cotización', () => {
  it('sin embarques no está congelada', () => {
    expect(estaCongelada(quote([SRV_MAR]))).toBe(false);
    expect(estaCongelada({ embarqueIds: [] })).toBe(false);
    expect(estaCongelada({})).toBe(false);
  });

  it('con al menos un embarque queda congelada', () => {
    expect(estaCongelada({ embarqueIds: ['SHP-2026-0007'] })).toBe(true);
  });

  it('bloquea la edición de servicios, que es donde viven los conceptos', () => {
    expect(camposBloqueados({ servicios: [] })).toEqual(['servicios']);
  });

  it('deja viva la conversación con el cliente después de ganada', () => {
    expect(camposBloqueados({ chat: [], actividades: [] })).toEqual([]);
  });

  it('permite registrar el embarque generado y el historial', () => {
    expect(camposBloqueados({ embarqueIds: ['x'], historialEtapas: [], updatedAt: '' })).toEqual([]);
  });

  it('nombra TODOS los campos bloqueados, no solo el primero', () => {
    expect(camposBloqueados({ servicios: [], moneda: 'MXN', prospecto: {} }).sort())
      .toEqual(['moneda', 'prospecto', 'servicios']);
  });

  it('un patch vacío no bloquea nada', () => {
    expect(camposBloqueados({})).toEqual([]);
  });

  it('la lista blanca es la fuente de verdad y no está vacía', () => {
    expect(CAMPOS_EDITABLES_CONGELADA.length).toBeGreaterThan(0);
  });
});

describe('modalidad del embarque', () => {
  it('un solo servicio: esa es la modalidad', () => {
    const m = modalidadDominante(quote([SRV_MAR]));
    expect(m.modalidad).toBe('maritimo');
    expect(m.esMultimodal).toBe(false);
  });

  it('multimodal: gana el servicio de mayor venta, no el primero', () => {
    // Terrestre va primero en el array pero marítimo vende más.
    const m = modalidadDominante(quote([SRV_TER, SRV_MAR]));
    expect(m.modalidad).toBe('maritimo');
    expect(m.esMultimodal).toBe(true);
    expect(m.tipos.sort()).toEqual(['maritimo', 'terrestre']);
  });

  it('una cotización sin líneas no revienta', () => {
    expect(modalidadDominante(quote([])).modalidad).toBe('maritimo');
  });
});

describe('el embarque que nace de una cotización ganada', () => {
  it('queda ligado a la cotización que lo originó', () => {
    expect(generar(quote([SRV_MAR])).cotizacionId).toBe('COT-2026-0042');
  });

  it('hereda los cargos: un ingreso y un gasto por línea', () => {
    const e = generar(quote([SRV_MAR]));
    const d = e.cargos.detalles;
    expect(d.filter(c => c.tipo === 'ingreso')).toHaveLength(1);
    expect(d.filter(c => c.tipo === 'gasto')).toHaveLength(1);
  });

  it('los totales del embarque cuadran con lo cotizado', () => {
    const e = generar(quote([SRV_MAR]));
    const t = totalesDe(e.cargos);
    expect(t.USD.ingresos).toBe(2500);
    expect(t.USD.gastos).toBe(2000);
    expect(t.USD.ganancia).toBe(500);
  });

  it('hereda cliente, ruta y mercancía de la cotización', () => {
    const e = generar(quote([SRV_MAR]));
    expect(e.entidades.clienteCobrar).toBe('Industrias Alfa');
    expect(e.ruta.origen.puertoCarga).toBe('Shanghai');
    expect(e.ruta.destino.puertoDescarga).toBe('Manzanillo');
    expect(e.descripcionCarga).toBe('Componentes electrónicos');
  });

  it('deja en blanco lo que solo Operaciones sabe', () => {
    const e = generar(quote([SRV_MAR]));
    expect(e.numeroGuia).toBe('');
    expect(e.numeroReservacion).toBe('');
    expect(e.fechas.salida).toBe('');
    expect(e.ruta.origen.buque).toBe('');
  });

  it('el automático se marca como pendiente de captura', () => {
    const e = generar(quote([SRV_MAR]), 'automatico');
    expect(e.origen).toBe('automatico');
    expect(e.requiereCaptura).toBe(true);
    expect(e.generadoPor).toBe('Ana Ramírez');
  });

  it('el manual NO se marca pendiente de captura: lo llenó quien lo creó', () => {
    expect(generar(quote([SRV_MAR]), 'manual').requiereCaptura).toBe(false);
  });

  it('nace con los tres cierres abiertos', () => {
    expect(generar(quote([SRV_MAR])).cierres).toEqual({
      operativo: false, pago: false, administrativo: false,
    });
  });

  it('el evento inicial dice de dónde vino y cuántos cargos heredó', () => {
    const e = generar(quote([SRV_MAR]));
    expect(e.eventos[0].descripcion).toContain('COT-2026-0042');
    expect(e.eventos[0].descripcion).toContain('Ana Ramírez');
    expect(e.eventos[0].tipo).toBe('info');
  });

  it('con advertencias, el evento inicial se marca como alerta', () => {
    // Cotización cerrada contra un prospecto sin alta.
    const sinCliente = quote([SRV_MAR], { clienteId: null });
    const e = generar(sinCliente, 'automatico', null);
    expect(e.eventos[0].tipo).toBe('alerta');
    expect((e.advertenciasHeredadas ?? []).length).toBeGreaterThan(0);
  });

  it('las advertencias viajan con el embarque: quien disparó no las vio', () => {
    const sinCliente = quote([SRV_MAR], { clienteId: null });
    const tipos = (generar(sinCliente, 'automatico', null)
      .advertenciasHeredadas as { tipo: string }[]).map(a => a.tipo);
    expect(tipos).toContain('cliente_sin_expediente');
  });

  it('una cotización sana no arrastra advertencias', () => {
    expect(generar(quote([SRV_MAR])).advertenciasHeredadas).toEqual([]);
  });

  it('el multimodal hereda los cargos de TODOS los servicios', () => {
    const e = generar(quote([SRV_MAR, SRV_TER]));
    expect(e.cargos.detalles.filter(c => c.tipo === 'ingreso')).toHaveLength(2);
    expect(totalesDe(e.cargos).USD.ingresos).toBe(3000); // 2500 + 500
  });

  it('usa el folio que le pasan, no uno inventado', () => {
    const e = generar(quote([SRV_MAR]));
    expect(e.id).toBe('SHP-2026-0007');
    expect(e.folio).toBe('SHP-2026-0007');
  });

  it('no muta la cotización', () => {
    const q = quote([SRV_MAR]);
    const copia = JSON.parse(JSON.stringify(q));
    generar(q);
    expect(q).toEqual(copia);
  });

  it('no deja undefined que tumbe la escritura en Firestore', () => {
    const e = generar(quote([SRV_MAR]));
    expect(JSON.stringify(e)).not.toContain('undefined');
  });
});

describe('requisito para E-4: la transacción tiene que leer el cliente', () => {
  it('sin el expediente a la mano, nace una advertencia que NO es real', () => {
    // La cotización sí apunta a un cliente válido; lo que falta es haberlo
    // leído. Si E-4c no incluye clientes/{clienteId} entre sus lecturas, todos
    // los embarques automáticos arrancarían con este aviso falso y Operaciones
    // dejaría de creerle a las advertencias.
    const tipos = (generar(quote([SRV_MAR]), 'automatico', null)
      .advertenciasHeredadas as { tipo: string }[]).map(a => a.tipo);
    expect(tipos).toContain('cliente_sin_expediente');
  });

  it('con el expediente leído, no hay aviso', () => {
    expect(generar(quote([SRV_MAR]), 'automatico', CLIENTE_OK).advertenciasHeredadas).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Un embarque POR MODALIDAD (decisión del cliente, 30-ago-2026).
// Marítimo y terrestre son embarques distintos, y el folio lo codifica.
// ─────────────────────────────────────────────────────────────────────────────

const SRV_ADUANAL = servicio({
  id: 'srv-3', tipo: 'aduanal',
  conceptos: [concepto({
    id: 'c3', nombre: 'Despacho aduanal', profit: 200,
    tarifas: [tarifa({ id: 't3', monto: 800, proveedor: 'Agencia Z', proveedorId: 'PRV-003' })],
    proveedoresOficialIds: ['t3'],
  })],
});

/** Agrupa sin ningún servicio marcado: el caso por defecto. */
const agrupar = (q: KanbanQuote, independientes: string[] = []) =>
  agruparParaEmbarques(aplanarCotizacion(q), new Set(independientes));

describe('prefijo de folio', () => {
  it('codifica modalidad y tráfico como en Magaya', () => {
    expect(prefijoFolio('maritimo', 'impo')).toBe('VLIM');
    expect(prefijoFolio('terrestre', 'impo')).toBe('VLIT');
    expect(prefijoFolio('terrestre', 'expo')).toBe('VLET');
    expect(prefijoFolio('aereo', 'impo')).toBe('VLIA');
  });

  it('las seis combinaciones tienen prefijo y ninguno se repite', () => {
    const todos = Object.values(PREFIJO_FOLIO).flatMap(m => Object.values(m));
    expect(todos).toHaveLength(6);
    expect(new Set(todos).size).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Agrupación (30-ago-2026).
//
// Cambió respecto al diseño anterior: ya NO se genera un embarque por modalidad
// automáticamente. Por defecto va todo a uno solo, y Pricing marca en la
// cotización los servicios que sí se operan aparte. Un acarreo dentro de una
// operación marítima es parte de ella, no un VLIT suelto.
// ─────────────────────────────────────────────────────────────────────────────
describe('agrupación por defecto: un solo embarque', () => {
  it('INVARIANTE: ninguna línea se pierde ni se duplica', () => {
    const q = quote([SRV_MAR, SRV_TER, SRV_ADUANAL]);
    const lineas = aplanarCotizacion(q);
    const repartidas = agrupar(q).grupos.flatMap(g => g.lineas.map(l => l.id));
    expect(repartidas.sort()).toEqual(lineas.map(l => l.id).sort());
    expect(new Set(repartidas).size).toBe(lineas.length);
  });

  it('INVARIANTE: la suma de los grupos es igual al total de la cotización', () => {
    const q = quote([SRV_MAR, SRV_TER, SRV_ADUANAL]);
    const suma = agrupar(q).grupos.reduce((a, g) => a + g.ventaTotal, 0);
    expect(suma).toBeCloseTo(totalVenta(aplanarCotizacion(q)), 2);
  });

  it('marítimo + terrestre sin marcar dan UN solo embarque', () => {
    const { grupos } = agrupar(quote([SRV_MAR, SRV_TER]));
    expect(grupos).toHaveLength(1);
    expect(grupos[0].esPrincipal).toBe(true);
  });

  it('la modalidad del principal es la del servicio de mayor venta', () => {
    // Terrestre va primero en el array pero marítimo vende más.
    expect(agrupar(quote([SRV_TER, SRV_MAR])).grupos[0].modalidad).toBe('maritimo');
  });

  it('el aduanal se integra sin avisar: no había decisión que tomar', () => {
    const { grupos, advertencias } = agrupar(quote([SRV_MAR, SRV_ADUANAL]));
    expect(grupos).toHaveLength(1);
    expect(grupos[0].lineas).toHaveLength(2);
    expect(advertencias).toEqual([]);
  });

  it('sin ninguna modalidad de transporte avisa y genera igual', () => {
    const { grupos, advertencias } = agrupar(quote([SRV_ADUANAL]));
    expect(grupos).toHaveLength(1);
    expect(advertencias.map(a => a.tipo)).toContain('sin_modalidad_transporte');
  });

  it('una cotización vacía no genera grupos', () => {
    expect(agrupar(quote([])).grupos).toEqual([]);
  });
});

describe('servicios marcados para operarse aparte', () => {
  it('el terrestre marcado genera su propio embarque', () => {
    const { grupos } = agrupar(quote([SRV_MAR, SRV_TER]), ['srv-2']);
    expect(grupos).toHaveLength(2);

    const principal = grupos.find(g => g.esPrincipal)!;
    const aparte = grupos.find(g => !g.esPrincipal)!;
    expect(principal.modalidad).toBe('maritimo');
    expect(aparte.modalidad).toBe('terrestre');
    expect(aparte.servicioIds).toEqual(['srv-2']);
  });

  it('el principal viene primero, para que sea el que encabeza', () => {
    expect(agrupar(quote([SRV_MAR, SRV_TER]), ['srv-2']).grupos[0].esPrincipal).toBe(true);
  });

  it('el invariante se mantiene con servicios separados', () => {
    const q = quote([SRV_MAR, SRV_TER, SRV_ADUANAL]);
    const { grupos } = agrupar(q, ['srv-2']);
    const repartidas = grupos.flatMap(g => g.lineas.map(l => l.id));
    expect(repartidas.sort()).toEqual(aplanarCotizacion(q).map(l => l.id).sort());
    expect(grupos.reduce((a, g) => a + g.ventaTotal, 0))
      .toBeCloseTo(totalVenta(aplanarCotizacion(q)), 2);
  });

  it('lo NO marcado se queda junto en el principal', () => {
    const { grupos } = agrupar(quote([SRV_MAR, SRV_TER, SRV_ADUANAL]), ['srv-2']);
    const principal = grupos.find(g => g.esPrincipal)!;
    expect(principal.servicioIds.sort()).toEqual(['srv-1', 'srv-3']);
  });

  it('marcar un servicio sin modalidad lo devuelve al principal, con aviso', () => {
    // Sin modalidad no hay prefijo de folio posible; inventar una serie sería
    // peor que integrarlo y explicarlo.
    const { grupos, advertencias } = agrupar(quote([SRV_MAR, SRV_ADUANAL]), ['srv-3']);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].esPrincipal).toBe(true);
    expect(advertencias.map(a => a.tipo)).toContain('independiente_sin_modalidad');
  });

  it('marcar TODOS los servicios deja solo embarques aparte, sin principal', () => {
    const { grupos } = agrupar(quote([SRV_MAR, SRV_TER]), ['srv-1', 'srv-2']);
    expect(grupos).toHaveLength(2);
    expect(grupos.every(g => !g.esPrincipal)).toBe(true);
  });

  it('marcar un servicio que no existe no altera nada', () => {
    const { grupos } = agrupar(quote([SRV_MAR]), ['srv-inexistente']);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].esPrincipal).toBe(true);
  });
});
