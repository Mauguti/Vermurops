/**
 * stateMachine.test.ts
 *
 * Tests de la máquina de estados pura del pipeline de cotizaciones.
 * Cubre: transiciones permitidas, bloqueos por rol, bloqueos por validación
 * de negocio, estados terminales y transicionesDisponibles().
 *
 * Ejecutar: npx vitest run
 */

import { describe, it, expect } from 'vitest';
import { puedeTransicionarA, transicionesDisponibles } from './stateMachine';
import { KanbanQuote, ServicioSolicitado, CotizacionProveedor } from '../components/quotes/QuotesData';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeProveedor(seleccionada: boolean): CotizacionProveedor {
  return {
    id: 'prov-1',
    proveedor: 'Naviera Test',
    contacto: 'Contacto',
    monto: 1000,
    moneda: 'USD',
    seleccionada,
  };
}

function makeServicio(opts: { conProveedorSeleccionado?: boolean } = {}): ServicioSolicitado {
  return {
    id: 'srv-1',
    tipo: 'maritimo',
    ruta: { origen: 'Shanghai', destino: 'Manzanillo' },
    incoterm: 'FOB',
    mercancia: 'Componentes',
    peso: 1000,
    volumen: 5,
    estado: 'cotizado',
    cotizacionesProveedor: opts.conProveedorSeleccionado ? [makeProveedor(true)] : [],
    profit: 0,
    recargosPct: 0,
    conceptos: [],
  };
}

/** Construye una KanbanQuote mínima para tests. */
function makeQuote(opts: {
  etapa?: KanbanQuote['etapa'];
  servicios?: ServicioSolicitado[];
} = {}): KanbanQuote {
  return {
    id: 'COT-TEST-0001',
    etapa: opts.etapa ?? 'solicitud_cliente',
    prospecto: { empresa: 'Test S.A.', contacto: 'Test', telefono: '', email: '', origen: 'otro' },
    vendedorId: 'ventas',
    pricingId: null,
    servicios: opts.servicios ?? [makeServicio()],
    valorTotalConsolidado: 0,
    moneda: 'USD',
    estadoFinal: null,
    motivoPerdida: null,
    createdAt: '2026-01-01 00:00',
    updatedAt: '2026-01-01 00:00',
    historialEtapas: [],
    actividades: [],
    chat: [],
  };
}

// ─── A. Transiciones permitidas (happy path) ───────────────────────────────────

describe('A. Transiciones permitidas', () => {
  it('ventas puede enviar a Pricing cuando hay servicios', () => {
    const q = makeQuote({ servicios: [makeServicio()] });
    expect(puedeTransicionarA('solicitud_cliente', 'solicitado_pricing', 'ventas', q).ok).toBe(true);
  });

  it('admin puede enviar a Pricing cuando hay servicios', () => {
    const q = makeQuote({ servicios: [makeServicio()] });
    expect(puedeTransicionarA('solicitud_cliente', 'solicitado_pricing', 'admin', q).ok).toBe(true);
  });

  it('pricing puede avanzar a pricing_solicitando', () => {
    const q = makeQuote({ etapa: 'solicitado_pricing' });
    expect(puedeTransicionarA('solicitado_pricing', 'pricing_solicitando', 'pricing', q).ok).toBe(true);
  });

  it('pricing puede registrar cotizaciones recibidas', () => {
    const q = makeQuote({ etapa: 'pricing_solicitando' });
    expect(puedeTransicionarA('pricing_solicitando', 'cotizaciones_recibidas', 'pricing', q).ok).toBe(true);
  });

  it('pricing puede consolidar si hay proveedor seleccionado en cada servicio', () => {
    const q = makeQuote({
      etapa: 'cotizaciones_recibidas',
      servicios: [makeServicio({ conProveedorSeleccionado: true })],
    });
    expect(puedeTransicionarA('cotizaciones_recibidas', 'consolidada', 'pricing', q).ok).toBe(true);
  });

  it('ventas puede enviar al cliente desde consolidada', () => {
    const q = makeQuote({ etapa: 'consolidada' });
    expect(puedeTransicionarA('consolidada', 'enviada_cliente', 'ventas', q).ok).toBe(true);
  });

  it('ventas puede pasar a negociacion desde enviada', () => {
    const q = makeQuote({ etapa: 'enviada_cliente' });
    expect(puedeTransicionarA('enviada_cliente', 'negociacion', 'ventas', q).ok).toBe(true);
  });

  it('ventas puede marcar ganada desde negociacion', () => {
    const q = makeQuote({ etapa: 'negociacion' });
    expect(puedeTransicionarA('negociacion', 'ganada', 'ventas', q).ok).toBe(true);
  });

  it('ventas puede marcar perdida desde negociacion', () => {
    const q = makeQuote({ etapa: 'negociacion' });
    expect(puedeTransicionarA('negociacion', 'perdida', 'ventas', q).ok).toBe(true);
  });
});

// ─── B. Transiciones "devolver" (incluidas en el mapa) ────────────────────────

describe('B. Transiciones devolver/recotizar', () => {
  it('ventas puede devolver de solicitado_pricing a solicitud_cliente', () => {
    const q = makeQuote({ etapa: 'solicitado_pricing' });
    expect(puedeTransicionarA('solicitado_pricing', 'solicitud_cliente', 'ventas', q).ok).toBe(true);
  });

  it('pricing puede devolver de pricing_solicitando a solicitado_pricing', () => {
    const q = makeQuote({ etapa: 'pricing_solicitando' });
    expect(puedeTransicionarA('pricing_solicitando', 'solicitado_pricing', 'pricing', q).ok).toBe(true);
  });

  it('pricing puede recotizar de cotizaciones_recibidas a pricing_solicitando', () => {
    const q = makeQuote({ etapa: 'cotizaciones_recibidas' });
    expect(puedeTransicionarA('cotizaciones_recibidas', 'pricing_solicitando', 'pricing', q).ok).toBe(true);
  });

  it('pricing puede recotizar de consolidada a cotizaciones_recibidas', () => {
    const q = makeQuote({ etapa: 'consolidada' });
    expect(puedeTransicionarA('consolidada', 'cotizaciones_recibidas', 'pricing', q).ok).toBe(true);
  });

  it('ventas puede devolver de enviada_cliente a consolidada', () => {
    const q = makeQuote({ etapa: 'enviada_cliente' });
    expect(puedeTransicionarA('enviada_cliente', 'consolidada', 'ventas', q).ok).toBe(true);
  });

  it('ventas puede devolver de negociacion a enviada_cliente', () => {
    const q = makeQuote({ etapa: 'negociacion' });
    expect(puedeTransicionarA('negociacion', 'enviada_cliente', 'ventas', q).ok).toBe(true);
  });
});

// ─── C. Bloqueos por arco inexistente ─────────────────────────────────────────

describe('C. Transiciones no permitidas (arco inexistente)', () => {
  it('no se puede saltar de solicitud_cliente a cotizaciones_recibidas', () => {
    const q = makeQuote({ servicios: [makeServicio()] });
    const r = puedeTransicionarA('solicitud_cliente', 'cotizaciones_recibidas', 'admin', q);
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/no está permitida/i);
  });

  it('no se puede saltar de solicitud_cliente a ganada', () => {
    const q = makeQuote({ servicios: [makeServicio()] });
    expect(puedeTransicionarA('solicitud_cliente', 'ganada', 'admin', q).ok).toBe(false);
  });

  it('estado terminal ganada no tiene salidas — ni para admin', () => {
    const q = makeQuote({ etapa: 'ganada' });
    expect(puedeTransicionarA('ganada', 'solicitud_cliente', 'admin', q).ok).toBe(false);
    expect(puedeTransicionarA('ganada', 'negociacion', 'admin', q).ok).toBe(false);
  });

  it('estado terminal perdida no tiene salidas — ni para admin', () => {
    const q = makeQuote({ etapa: 'perdida' });
    expect(puedeTransicionarA('perdida', 'solicitud_cliente', 'admin', q).ok).toBe(false);
    expect(puedeTransicionarA('perdida', 'negociacion', 'admin', q).ok).toBe(false);
  });
});

// ─── D. Bloqueos por rol ──────────────────────────────────────────────────────

describe('D. Bloqueos por rol incorrecto', () => {
  it('pricing NO puede enviar a Pricing (solicitado_pricing) — solo ventas/admin', () => {
    const q = makeQuote({ servicios: [makeServicio()] });
    const r = puedeTransicionarA('solicitud_cliente', 'solicitado_pricing', 'pricing', q);
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/rol/i);
  });

  it('ventas NO puede avanzar de solicitado_pricing a pricing_solicitando', () => {
    const q = makeQuote({ etapa: 'solicitado_pricing' });
    expect(puedeTransicionarA('solicitado_pricing', 'pricing_solicitando', 'ventas', q).ok).toBe(false);
  });

  it('ventas NO puede consolidar (cotizaciones_recibidas → consolidada)', () => {
    const q = makeQuote({
      etapa: 'cotizaciones_recibidas',
      servicios: [makeServicio({ conProveedorSeleccionado: true })],
    });
    expect(puedeTransicionarA('cotizaciones_recibidas', 'consolidada', 'ventas', q).ok).toBe(false);
  });

  it('pricing NO puede enviar al cliente (consolidada → enviada_cliente)', () => {
    const q = makeQuote({ etapa: 'consolidada' });
    expect(puedeTransicionarA('consolidada', 'enviada_cliente', 'pricing', q).ok).toBe(false);
  });

  it('pricing NO puede marcar ganada desde negociacion', () => {
    const q = makeQuote({ etapa: 'negociacion' });
    expect(puedeTransicionarA('negociacion', 'ganada', 'pricing', q).ok).toBe(false);
  });
});

// ─── E. Bloqueos por validación de negocio ────────────────────────────────────

describe('E. Bloqueos por validación de negocio', () => {
  it('no se puede enviar a Pricing si la cotización no tiene servicios', () => {
    const q = makeQuote({ servicios: [] });
    const r = puedeTransicionarA('solicitud_cliente', 'solicitado_pricing', 'ventas', q);
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/servicio/i);
  });

  it('no se puede consolidar si ningún servicio tiene proveedor seleccionado', () => {
    const q = makeQuote({
      etapa: 'cotizaciones_recibidas',
      servicios: [makeServicio({ conProveedorSeleccionado: false })],
    });
    const r = puedeTransicionarA('cotizaciones_recibidas', 'consolidada', 'pricing', q);
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/proveedor/i);
  });

  it('no se puede consolidar si hay 2 servicios y solo uno tiene proveedor seleccionado', () => {
    const q = makeQuote({
      etapa: 'cotizaciones_recibidas',
      servicios: [
        makeServicio({ conProveedorSeleccionado: true }),
        { ...makeServicio({ conProveedorSeleccionado: false }), id: 'srv-2' },
      ],
    });
    const r = puedeTransicionarA('cotizaciones_recibidas', 'consolidada', 'pricing', q);
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/proveedor/i);
  });

  it('sí se puede consolidar si TODOS los servicios tienen proveedor seleccionado', () => {
    const q = makeQuote({
      etapa: 'cotizaciones_recibidas',
      servicios: [
        makeServicio({ conProveedorSeleccionado: true }),
        { ...makeServicio({ conProveedorSeleccionado: true }), id: 'srv-2' },
      ],
    });
    expect(puedeTransicionarA('cotizaciones_recibidas', 'consolidada', 'pricing', q).ok).toBe(true);
  });
});

// ─── F. transicionesDisponibles ───────────────────────────────────────────────

describe('F. transicionesDisponibles()', () => {
  it('ventas con servicios ve [solicitado_pricing, perdida] desde solicitud_cliente', () => {
    const q = makeQuote({ servicios: [makeServicio()] });
    const disp = transicionesDisponibles('solicitud_cliente', 'ventas', q);
    expect(disp).toEqual(['solicitado_pricing', 'perdida']);
  });

  it('ventas SIN servicios solo ve [perdida] desde solicitud_cliente (valida negocio)', () => {
    const q = makeQuote({ servicios: [] });
    const disp = transicionesDisponibles('solicitud_cliente', 'ventas', q);
    expect(disp).toEqual(['perdida']);
  });

  it('pricing no ve nada desde solicitud_cliente', () => {
    const q = makeQuote({ servicios: [makeServicio()] });
    const disp = transicionesDisponibles('solicitud_cliente', 'pricing', q);
    expect(disp).toHaveLength(0);
  });

  it('admin ve todo desde solicitud_cliente (con servicios)', () => {
    const q = makeQuote({ servicios: [makeServicio()] });
    const disp = transicionesDisponibles('solicitud_cliente', 'admin', q);
    expect(disp).toContain('solicitado_pricing');
    expect(disp).toContain('perdida');
  });

  it('estados terminales no tienen transiciones disponibles para ningún rol', () => {
    const q = makeQuote({ etapa: 'ganada' });
    expect(transicionesDisponibles('ganada', 'admin', q)).toHaveLength(0);
    expect(transicionesDisponibles('perdida', 'admin', q)).toHaveLength(0);
  });

  it('ventas desde negociacion ve [ganada, perdida, enviada_cliente]', () => {
    const q = makeQuote({ etapa: 'negociacion' });
    const disp = transicionesDisponibles('negociacion', 'ventas', q);
    expect(disp).toContain('ganada');
    expect(disp).toContain('perdida');
    expect(disp).toContain('enviada_cliente');
    expect(disp).not.toContain('solicitud_cliente');
  });
});
