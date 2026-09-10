/**
 * Tests de versionesCotizacion.ts (V-1).
 *
 * El flujo que tiene que sostener: Ventas regresa la cotización, Pricing hace
 * la v2, y la v1 queda como registro — intacta, consultable, y sin arrastrar
 * la conversación que sigue corriendo.
 */

import { describe, it, expect } from 'vitest';
import {
  numeroVersionActual, puedeVersionar, planearNuevaVersion, planearRestauracion,
  fotoDeCotizacion, opcionesSelector, vistaDeVersion, totalPorMonedaDe,
  alDiaConVersion, guardadoAtrasado, sinCamposDeVersion,
  type DocumentoVersion, type OpcionesNuevaVersion,
} from './versionesCotizacion';
import type {
  KanbanQuote, ServicioSolicitado, ConceptoCotizacion,
} from '../components/quotes/QuotesData';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function concepto(p: Partial<ConceptoCotizacion> & { id: string; nombre: string }): ConceptoCotizacion {
  return {
    costo: 0, profit: 0, venta: 0, margen: 0,
    subconceptos: [], tarifas: [], proveedoresOficialIds: [],
    ...p,
  } as ConceptoCotizacion;
}

function servicio(p: Partial<ServicioSolicitado> & { id: string }): ServicioSolicitado {
  return {
    tipo: 'maritimo',
    ruta: { origen: 'Shanghai', destino: 'Manzanillo' },
    incoterm: 'FOB', mercancia: 'General', peso: 1000, volumen: 10,
    estado: 'cotizado',
    cotizacionesProveedor: [], profit: 0, recargosPct: 0, conceptos: [],
    ...p,
  } as ServicioSolicitado;
}

// La moneda de la línea sale de la tarifa elegida: por eso el flete va en USD
// y las maniobras en MXN a través de sus tarifas, no de un campo del concepto.
const tarifa = (id: string, monto: number, moneda: 'USD' | 'MXN') => ({
  id, proveedor: 'Agente X', proveedorId: 'PRV-1', contacto: '', monto, moneda, seleccionada: true,
});

const SRV = servicio({
  id: 'srv-1',
  conceptos: [
    concepto({ id: 'c1', nombre: 'Flete', profit: 200, tarifas: [tarifa('t1', 1500, 'USD')] as never, proveedoresOficialIds: ['t1'] }),
    concepto({ id: 'c2', nombre: 'Maniobras', profit: 1000, tarifas: [tarifa('t2', 8000, 'MXN')] as never, proveedoresOficialIds: ['t2'] }),
  ],
});

function quote(over: Partial<KanbanQuote> = {}): KanbanQuote {
  return {
    id: 'COT-2026-0010', etapa: 'consolidada',
    prospecto: { empresa: 'Alfa', contacto: 'A', telefono: '', email: '', origen: 'web' },
    vendedorId: 'v1', pricingId: 'p1',
    servicios: [SRV],
    valorTotalConsolidado: 0, moneda: 'USD',
    estadoFinal: null, motivoPerdida: null,
    createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '',
    historialEtapas: [{ etapa: 'consolidada', fecha: '2026-09-02 10:00' }],
    actividades: [],
    chat: [{ id: 'm1', autorId: 'v1', texto: 'El cliente pide otra naviera' } as never],
    ...over,
  } as KanbanQuote;
}

const PRICING = { uid: 'uid-p', nombre: 'Gabi' };

const opts = (over: Partial<OpcionesNuevaVersion> = {}): OpcionesNuevaVersion => ({
  motivo: 'El cliente pidió cotizar con otra naviera',
  autor: PRICING,
  rol: 'pricing',
  ahora: '2026-09-10T15:30:00.000Z',
  ...over,
});

/** Aplica el plan como lo haría la transacción, para encadenar versiones. */
function aplicar(q: KanbanQuote, o: OpcionesNuevaVersion = opts()) {
  const plan = planearNuevaVersion(q, o);
  if ('razon' in plan) throw new Error(plan.razon);
  return { quote: { ...q, ...plan.patch } as KanbanQuote, documento: plan.documento };
}

// ─── A · Quién y cuándo ──────────────────────────────────────────────────────

describe('puedeVersionar — quién cotiza, versiona', () => {
  it('Pricing y Admin sí', () => {
    expect(puedeVersionar(quote(), 'pricing').ok).toBe(true);
    expect(puedeVersionar(quote(), 'admin').ok).toBe(true);
  });

  it('Ventas no: la regresa, no la reescribe (§4.1)', () => {
    const v = puedeVersionar(quote(), 'ventas');
    expect(v.ok).toBe(false);
    expect('razon' in v ? v.razon : '').toContain('Pricing');
  });

  it('Operaciones y sin sesión, tampoco', () => {
    expect(puedeVersionar(quote(), 'operaciones').ok).toBe(false);
    expect(puedeVersionar(quote(), null).ok).toBe(false);
  });

  it('una cotización congelada no se versiona (§4.8)', () => {
    const v = puedeVersionar(quote({ embarqueIds: ['SHP-2026-0001'] }), 'pricing');
    expect(v.ok).toBe(false);
    expect('razon' in v ? v.razon : '').toContain('embarque');
  });

  it('una perdida sí: se reabre', () => {
    expect(puedeVersionar(quote({ etapa: 'perdida', estadoFinal: 'perdida' }), 'pricing').ok).toBe(true);
  });

  it('sin motivo no se crea: el historial necesita decir por qué', () => {
    const plan = planearNuevaVersion(quote(), opts({ motivo: '   ' }));
    expect(plan.ok).toBe(false);
  });
});

// ─── B · La foto ─────────────────────────────────────────────────────────────

describe('la foto conserva el contenido, no la conversación', () => {
  it('lleva servicios y tipo de cambio', () => {
    const q = quote({ tipoCambio: { valor: 18.5 } as never });
    const foto = fotoDeCotizacion(q);
    expect(foto.servicios).toEqual(q.servicios);
    expect(foto.tipoCambio).toEqual({ valor: 18.5 });
  });

  it('NO lleva chat, actividades, historial ni la contabilidad de versiones', () => {
    const q = quote({ versionActual: 2, versiones: [], origenVersion: {} as never });
    const foto = fotoDeCotizacion(q) as unknown as Record<string, unknown>;
    for (const campo of ['chat', 'actividades', 'historialEtapas', 'versionActual', 'versiones', 'origenVersion', 'embarqueIds']) {
      expect(foto).not.toHaveProperty(campo);
    }
  });

  it('es una copia: editar la viva después no altera la foto', () => {
    const q = quote();
    const foto = fotoDeCotizacion(q);
    q.servicios[0].conceptos![0].profit = 99999;
    expect(foto.servicios[0].conceptos![0].profit).toBe(200);
    q.servicios[0].conceptos![0].profit = 200; // la fixture es compartida
  });
});

// ─── C · Nueva versión ───────────────────────────────────────────────────────

describe('planearNuevaVersion — la v1 queda como registro', () => {
  it('una cotización sin campos de versión es la v1', () => {
    expect(numeroVersionActual(quote())).toBe(1);
  });

  it('congela la v1 y abre la v2', () => {
    const plan = planearNuevaVersion(quote(), opts());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.documento.numero).toBe(1);
    expect(plan.documento.cotizacionId).toBe('COT-2026-0010');
    expect(plan.patch.versionActual).toBe(2);
    expect(plan.patch.origenVersion).toMatchObject({
      numero: 2, motivo: 'El cliente pidió cotizar con otra naviera',
      creadaPor: PRICING, trasRechazo: false, restauradaDe: null,
    });
    expect(plan.patch.versiones).toHaveLength(1);
  });

  it('el resumen de la v1 no inventa motivo ni autor: nadie la «creó»', () => {
    const plan = planearNuevaVersion(quote(), opts());
    if (!plan.ok) return;
    expect(plan.documento.resumen).toMatchObject({
      numero: 1, motivo: null, creadaPor: null,
      creadaEn: '2026-09-01T10:00:00.000Z',
      congeladaPor: PRICING, etapaAlCongelar: 'consolidada',
    });
  });

  it('§4.3: el total congelado va POR MONEDA, sin revolver', () => {
    const plan = planearNuevaVersion(quote(), opts());
    if (!plan.ok) return;
    const t = plan.documento.resumen.totalPorMoneda;
    expect(t.USD).toBe(totalPorMonedaDe(quote()).USD);
    expect(t.MXN).toBe(totalPorMonedaDe(quote()).MXN);
    expect(t.USD).toBeGreaterThan(0);
    expect(t.MXN).toBeGreaterThan(0);
  });

  it('el PDF queda reservado: plantillaVersionId en null, no ausente', () => {
    const plan = planearNuevaVersion(quote(), opts());
    if (!plan.ok) return;
    expect(plan.documento.resumen.plantillaVersionId).toBeNull();
  });

  it('la raíz conserva servicios, chat e historial: sigue siendo la misma cotización', () => {
    const plan = planearNuevaVersion(quote(), opts());
    if (!plan.ok) return;
    expect(plan.patch).not.toHaveProperty('servicios');
    expect(plan.patch).not.toHaveProperty('chat');
    expect(plan.patch).not.toHaveProperty('etapa');
  });

  it('deja rastro en la bitácora', () => {
    const plan = planearNuevaVersion(quote(), opts());
    if (!plan.ok) return;
    const ultima = plan.patch.actividades!.at(-1)!;
    expect(ultima.titulo).toBe('Nueva versión v2');
    expect(ultima.descripcion).toContain('v1 quedó como registro');
  });

  it('se encadena: la v2 al congelarse lleva el motivo con el que nació', () => {
    const v2 = aplicar(quote()).quote;
    const { quote: v3, documento } = aplicar(v2, opts({ motivo: 'Bajó el flete', ahora: '2026-09-11T09:00:00.000Z' }));
    expect(v3.versionActual).toBe(3);
    expect(v3.versiones!.map(r => r.numero)).toEqual([1, 2]);
    expect(documento.numero).toBe(2);
    expect(documento.resumen.motivo).toBe('El cliente pidió cotizar con otra naviera');
    expect(documento.resumen.creadaPor).toEqual(PRICING);
  });
});

// ─── D · Tras rechazo ────────────────────────────────────────────────────────

describe('versionar una perdida la reabre, y el historial lo dice', () => {
  const perdida = quote({ etapa: 'perdida', estadoFinal: 'perdida', motivoPerdida: 'Precio' });

  it('vuelve a la etapa de trabajo de Pricing y deja de estar perdida', () => {
    const plan = planearNuevaVersion(perdida, opts());
    if (!plan.ok) return;
    expect(plan.patch).toMatchObject({ etapa: 'cotizaciones_recibidas', estadoFinal: null, motivoPerdida: null });
    expect(plan.patch.historialEtapas!.at(-1)!.nota).toContain('tras rechazo');
  });

  it('la foto guarda que la v1 estaba perdida', () => {
    const plan = planearNuevaVersion(perdida, opts());
    if (!plan.ok) return;
    expect(plan.documento.resumen.estadoFinalAlCongelar).toBe('perdida');
    expect(plan.documento.foto.motivoPerdida).toBe('Precio');
  });

  it('«v2 · creada tras rechazo» en el selector', () => {
    const v2 = aplicar(perdida).quote;
    expect(opcionesSelector(v2)[0].etiqueta).toBe('v2 (actual) · creada tras rechazo');
  });

  it('una ganada sin embarque NO se reabre: su nueva versión es la que se opera', () => {
    const plan = planearNuevaVersion(quote({ etapa: 'ganada', estadoFinal: 'ganada' }), opts());
    if (!plan.ok) return;
    expect(plan.patch).not.toHaveProperty('etapa');
    expect(plan.patch.origenVersion!.trasRechazo).toBe(false);
  });
});

// ─── E · El selector ─────────────────────────────────────────────────────────

describe('opcionesSelector', () => {
  it('sin versiones no hay selector: una sola opción no controla nada', () => {
    expect(opcionesSelector(quote())).toEqual([]);
  });

  it('de la más nueva a la más vieja: «v3 (actual) · v2 · v1»', () => {
    const v3 = aplicar(aplicar(quote()).quote, opts({ motivo: 'Segunda ronda' })).quote;
    expect(opcionesSelector(v3).map(o => o.etiqueta)).toEqual(['v3 (actual)', 'v2', 'v1']);
  });

  it('el detalle dice por qué, cuándo, quién y cuánto', () => {
    const v2 = aplicar(quote()).quote;
    const [viva, v1] = opcionesSelector(v2);
    expect(viva.detalle).toContain('Gabi');
    expect(viva.detalle).toContain('otra naviera');
    expect(v1.detalle).toContain('Versión original');
    expect(v1.detalle).toContain('USD');
    expect(v1.detalle).toContain('MXN');
  });
});

// ─── F · Ver y restaurar ─────────────────────────────────────────────────────

describe('vistaDeVersion y restauración', () => {
  function congeladaV1(): { v2: KanbanQuote; v1: DocumentoVersion } {
    const { quote: v2, documento } = aplicar(quote());
    // Pricing rehace números en la v2
    v2.servicios = [servicio({ id: 'srv-1', conceptos: [concepto({ id: 'c1', nombre: 'Flete', costo: 1200 })] })];
    v2.chat = [...v2.chat, { id: 'm2', autorId: 'p1', texto: 'Listo' } as never];
    return { v2, v1: documento };
  }

  it('la vista muestra el contenido de la v1 con la conversación de hoy', () => {
    const { v2, v1 } = congeladaV1();
    const vista = vistaDeVersion(v2, v1);
    expect(vista.servicios[0].conceptos).toHaveLength(2);
    expect(vista.chat).toHaveLength(2);
    expect(vista.versiones).toHaveLength(1);
  });

  it('restaurar la v1 congela la v2 y abre una v3 con el contenido de la v1', () => {
    const { v2, v1 } = congeladaV1();
    const plan = planearRestauracion(v2, v1, opts({ motivo: 'El cliente prefirió la primera' }));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.documento.numero).toBe(2);
    expect(plan.documento.foto.servicios[0].conceptos).toHaveLength(1);
    expect(plan.patch.versionActual).toBe(3);
    expect(plan.patch.servicios![0].conceptos).toHaveLength(2);
    expect(plan.patch.origenVersion!.restauradaDe).toBe(1);
    // restaurar el contenido no devuelve la etapa de hace dos semanas
    expect(plan.patch).not.toHaveProperty('etapa');
  });

  it('una ficha abierta adopta la del listener SOLO al cambiar de versión', () => {
    const abierta = quote();
    const { quote: v2 } = aplicar(abierta);
    expect(alDiaConVersion(abierta, [v2])).toBe(v2);
    // misma versión: se queda con la suya, para no esperar a Firestore en cada tecla
    const editada = { ...abierta, motivoPerdida: 'x' };
    expect(alDiaConVersion(editada, [abierta])).toBe(editada);
    expect(alDiaConVersion(abierta, [])).toBe(abierta);
  });

  it('un guardado de una versión anterior se detecta; un patch parcial no', () => {
    const { quote: v2 } = aplicar(quote());
    expect(guardadoAtrasado(v2, quote())).toBe(true);
    expect(guardadoAtrasado(v2, v2)).toBe(false);
    expect(guardadoAtrasado(v2, { embarqueIds: ['SHP-1'] })).toBe(false);
  });

  it('los campos de versión nunca viajan en un guardado normal', () => {
    const { quote: v2 } = aplicar(quote());
    const limpio = sinCamposDeVersion(v2);
    expect(limpio).not.toHaveProperty('versionActual');
    expect(limpio).not.toHaveProperty('versiones');
    expect(limpio).not.toHaveProperty('origenVersion');
    expect(limpio.servicios).toBe(v2.servicios);
  });

  it('no restaura una versión de otra cotización', () => {
    const { v2, v1 } = congeladaV1();
    const plan = planearRestauracion(v2, { ...v1, cotizacionId: 'COT-OTRA' }, opts());
    expect(plan.ok).toBe(false);
  });
});
