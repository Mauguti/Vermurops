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
import { puedeTransicionarA, transicionesDisponibles, salidasPara } from './stateMachine';
import { RAZON_SIN_CLIENTE } from './frenoCliente';
import { KanbanQuote, ServicioSolicitado, CotizacionProveedor } from '../components/quotes/QuotesData';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeProveedor(seleccionada: boolean, conceptoId?: string): CotizacionProveedor {
  return {
    id: 'prov-1',
    proveedor: 'Naviera Test',
    contacto: 'Contacto',
    monto: 1000,
    moneda: 'USD',
    seleccionada,
    ...(conceptoId ? { conceptoId } : {}),
  };
}

function makeServicio(opts: {
  conProveedorSeleccionado?: boolean;
  /** conceptoId de la cotización de proveedor. Sin él, la línea B es legacy. */
  conceptoId?: string;
} = {}): ServicioSolicitado {
  return {
    id: 'srv-1',
    tipo: 'maritimo',
    ruta: { origen: 'Shanghai', destino: 'Manzanillo' },
    incoterm: 'FOB',
    mercancia: 'Componentes',
    peso: 1000,
    volumen: 5,
    estado: 'cotizado',
    cotizacionesProveedor: opts.conProveedorSeleccionado ? [makeProveedor(true, opts.conceptoId)] : [],
    profit: 0,
    recargosPct: 0,
    conceptos: [],
  };
}

/** Construye una KanbanQuote mínima para tests. */
function makeQuote(opts: {
  etapa?: KanbanQuote['etapa'];
  servicios?: ServicioSolicitado[];
  /** null = sin cliente vinculado (Bloque 2a). Default: con cliente. */
  clienteId?: string | null;
} = {}): KanbanQuote {
  return {
    id: 'COT-TEST-0001',
    clienteId: opts.clienteId === undefined ? 'CLI-TEST' : opts.clienteId,
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

  it('pricing puede consolidar si cada línea tiene proveedor y concepto del catálogo', () => {
    const q = makeQuote({
      etapa: 'cotizaciones_recibidas',
      servicios: [makeServicio({ conProveedorSeleccionado: true, conceptoId: 'CON-001' })],
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

  // NOTA: hasta el 28-ago-2026 aquí se afirmaba lo contrario —que Pricing NO
  // podía marcar ganada—. El cliente lo corrigió: si Pricing abre cotizaciones
  // directas sin pasar por Ventas, no puede depender de Ventas para cerrarlas.
  // El caso positivo vive ahora en el bloque G.
  it('pricing SÍ puede marcar ganada desde negociacion (corregido 28-ago-2026)', () => {
    const q = makeQuote({ etapa: 'negociacion' });
    expect(puedeTransicionarA('negociacion', 'ganada', 'pricing', q).ok).toBe(true);
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

  it('sí se puede consolidar si TODAS las líneas están completas', () => {
    const q = makeQuote({
      etapa: 'cotizaciones_recibidas',
      servicios: [
        makeServicio({ conProveedorSeleccionado: true, conceptoId: 'CON-001' }),
        { ...makeServicio({ conProveedorSeleccionado: true, conceptoId: 'CON-002' }), id: 'srv-2' },
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

// ─────────────────────────────────────────────────────────────────────────────
// G. Pricing puede cerrar sus propias cotizaciones
//
// Corrección del 28-ago-2026. §4.1 dice que Pricing abre cotizaciones directas
// de clientes y agentes de carga sin pasar por Ventas; dependía de Ventas para
// cerrarlas, lo cual era incoherente.
// ─────────────────────────────────────────────────────────────────────────────
describe('G. Cierre de cotizaciones por Pricing', () => {
  it('pricing puede marcar GANADA desde enviada_cliente', () => {
    const q = makeQuote({ etapa: 'enviada_cliente' });
    expect(puedeTransicionarA('enviada_cliente', 'ganada', 'pricing', q).ok).toBe(true);
  });

  it('pricing puede marcar GANADA desde negociacion', () => {
    const q = makeQuote({ etapa: 'negociacion' });
    expect(puedeTransicionarA('negociacion', 'ganada', 'pricing', q).ok).toBe(true);
  });

  it('pricing puede marcar PERDIDA desde toda etapa en la que ya participa', () => {
    // Si puede cerrar ganada, debe poder cerrar perdida.
    const etapas = [
      'solicitado_pricing', 'pricing_solicitando', 'cotizaciones_recibidas',
      'consolidada', 'enviada_cliente', 'negociacion',
    ] as const;
    etapas.forEach(etapa => {
      const q = makeQuote({ etapa });
      expect(puedeTransicionarA(etapa, 'perdida', 'pricing', q).ok).toBe(true);
    });
  });

  it('pricing NO descarta un lead que todavía no ha visto', () => {
    // solicitud_cliente es etapa pura de Ventas: la cotización aún no le llega.
    const q = makeQuote({ etapa: 'solicitud_cliente' });
    expect(puedeTransicionarA('solicitud_cliente', 'perdida', 'pricing', q).ok).toBe(false);
  });

  it('ventas conserva el cierre: la corrección suma, no reemplaza', () => {
    const q = makeQuote({ etapa: 'negociacion' });
    expect(puedeTransicionarA('negociacion', 'ganada', 'ventas', q).ok).toBe(true);
    expect(puedeTransicionarA('negociacion', 'perdida', 'ventas', q).ok).toBe(true);
  });

  it('operaciones y administracion siguen sin cerrar cotizaciones', () => {
    const q = makeQuote({ etapa: 'negociacion' });
    expect(puedeTransicionarA('negociacion', 'ganada', 'operaciones', q).ok).toBe(false);
    expect(puedeTransicionarA('negociacion', 'ganada', 'administracion', q).ok).toBe(false);
  });

  it('pricing ve ganada y perdida entre sus transiciones disponibles', () => {
    const q = makeQuote({ etapa: 'negociacion' });
    const disp = transicionesDisponibles('negociacion', 'pricing', q);
    expect(disp).toContain('ganada');
    expect(disp).toContain('perdida');
  });
});

// ─── H · El guard lee la misma verdad que los botones ────────────────────────
//
// El bug que motivó esto (1-sep-2026): Pricing asignó proveedores en las
// tarjetas por modalidad (ruta A, concepto.tarifas), los botones decían
// «listo», y la máquina pedía «selecciona un proveedor por cada servicio»
// porque su guard solo leía servicio.cotizacionesProveedor (ruta B) — la única
// estructura que existía cuando se escribió. Dos lectores, dos verdades.
//
// Ahora el guard pasa por evaluarProntitud/aplanarCotizacion, que resuelven
// ambas rutas. Estos tests fijan las tres formas de armar una cotización.

function servicioRutaA(id: string, conceptoId = 'CON-001'): ServicioSolicitado {
  return {
    ...makeServicio(),
    id,
    cotizacionesProveedor: [],           // la ruta B vacía, como deja la ficha
    conceptos: [{
      id: `c-${id}`,
      nombre: 'Flete marítimo',
      conceptoId,
      costo: 0, profit: 200, venta: 0, margen: 0,
      subconceptos: [],
      tarifas: [{
        id: `t-${id}`, proveedor: 'Maersk', proveedorId: 'PRV-001',
        contacto: 'C', monto: 1500, moneda: 'USD', seleccionada: true,
      } as CotizacionProveedor],
      proveedoresOficialIds: [`t-${id}`],
    } as never],
  };
}

describe('H. consolidar lee ambas rutas de la dualidad (§6)', () => {
  it('ruta A pura: capturada en las tarjetas, consolida — el bug reportado', () => {
    const q = makeQuote({
      etapa: 'cotizaciones_recibidas',
      servicios: [servicioRutaA('srv-1')],
    });
    expect(puedeTransicionarA('cotizaciones_recibidas', 'consolidada', 'pricing', q).ok).toBe(true);
  });

  it('mixta: un servicio por ruta A y otro por ruta B, consolida', () => {
    const q = makeQuote({
      etapa: 'cotizaciones_recibidas',
      servicios: [
        servicioRutaA('srv-1'),
        { ...makeServicio({ conProveedorSeleccionado: true, conceptoId: 'CON-002' }), id: 'srv-2' },
      ],
    });
    expect(puedeTransicionarA('cotizaciones_recibidas', 'consolidada', 'pricing', q).ok).toBe(true);
  });

  it('ruta A sin conceptoId del catálogo NO consolida: el embarque nacería sin claves SAT', () => {
    const srv = servicioRutaA('srv-1');
    (srv.conceptos![0] as { conceptoId?: string }).conceptoId = undefined;
    const q = makeQuote({ etapa: 'cotizaciones_recibidas', servicios: [srv] });
    const r = puedeTransicionarA('cotizaciones_recibidas', 'consolidada', 'pricing', q);
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/completa/i);
  });

  it('ruta B legacy sin conceptoId queda bloqueada con mensaje, no en silencio', () => {
    // Endurecimiento deliberado: el guard viejo la dejaba pasar, pero los
    // botones ya no — y de una línea sin concepto del catálogo nace un cargo
    // sin claves SAT. La condición es la que el cliente definió.
    const q = makeQuote({
      etapa: 'cotizaciones_recibidas',
      servicios: [makeServicio({ conProveedorSeleccionado: true })],
    });
    const r = puedeTransicionarA('cotizaciones_recibidas', 'consolidada', 'pricing', q);
    expect(r.ok).toBe(false);
    expect(r.razon).toBeTruthy();
  });

  it('multimodal con un servicio aún sin cotizar NO consolida: el hueco que el guard viejo sí cubría', () => {
    const q = makeQuote({
      etapa: 'cotizaciones_recibidas',
      servicios: [
        servicioRutaA('srv-1'),
        { ...makeServicio({ conProveedorSeleccionado: false }), id: 'srv-2', tipo: 'terrestre' },
      ],
    });
    const r = puedeTransicionarA('cotizaciones_recibidas', 'consolidada', 'pricing', q);
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/terrestre/);
  });
});


// ─── Bloque 2a · el freno «sin cliente vinculado» ────────────────────────────
describe('Bloque 2a · sin cliente vinculado no se gana', () => {
  it('desde enviada_cliente y negociacion, ningún rol puede marcar ganada sin clienteId', () => {
    for (const etapa of ['enviada_cliente', 'negociacion'] as const) {
      for (const rol of ['ventas', 'pricing', 'admin'] as const) {
        const r = puedeTransicionarA(etapa, 'ganada', rol, makeQuote({ etapa, clienteId: null }));
        expect(r.ok, `${etapa} · ${rol}`).toBe(false);
        expect(r.razon).toBe(RAZON_SIN_CLIENTE);
      }
    }
  });
  it('con clienteId, ganada sigue disponible', () => {
    expect(puedeTransicionarA('negociacion', 'ganada', 'ventas', makeQuote({ etapa: 'negociacion' })).ok).toBe(true);
  });
  it('perdida no se frena por el cliente', () => {
    expect(puedeTransicionarA('negociacion', 'perdida', 'ventas', makeQuote({ etapa: 'negociacion', clienteId: null })).ok).toBe(true);
  });
  it('salidasPara enseña la transición vetada con su razón, en vez de esconderla', () => {
    const salidas = salidasPara('negociacion', 'ventas', makeQuote({ etapa: 'negociacion', clienteId: null }));
    const ganada = salidas.find(s => s.hacia === 'ganada');
    expect(ganada).toEqual({ hacia: 'ganada', ok: false, razon: RAZON_SIN_CLIENTE });
    expect(salidas.find(s => s.hacia === 'perdida')?.ok).toBe(true);
    // Operaciones no tiene salidas: no aparecen
    expect(salidasPara('negociacion', 'operaciones', makeQuote({ etapa: 'negociacion' }))).toEqual([]);
  });
});

// ─── Bloque 2b · el expediente entra por el contexto ─────────────────────────
describe('Bloque 2b · expediente del cliente en la transición a ganada', () => {
  const nuevo = { id: 'CLI-TEST', nombre: 'Nuevo' } as never;
  const magaya = { id: 'CLI-TEST', nombre: 'Viejo', origenDatos: 'magaya' } as never;
  it('sin contexto, la máquina solo revisa el clienteId (los que escriben exigen aparte)', () => {
    expect(puedeTransicionarA('negociacion', 'ganada', 'ventas', makeQuote({ etapa: 'negociacion' })).ok).toBe(true);
  });
  it('con cliente heredado de Magaya, pasa', () => {
    expect(puedeTransicionarA('negociacion', 'ganada', 'ventas', makeQuote({ etapa: 'negociacion' }), { cliente: magaya }).ok).toBe(true);
  });
  it('con cliente sin validar, ventas no; admin solo con justificación', () => {
    const q = makeQuote({ etapa: 'negociacion' });
    expect(puedeTransicionarA('negociacion', 'ganada', 'ventas', q, { cliente: nuevo }).ok).toBe(false);
    expect(puedeTransicionarA('negociacion', 'ganada', 'admin', q, { cliente: nuevo }).ok).toBe(false);
    expect(puedeTransicionarA('negociacion', 'ganada', 'admin', q, { cliente: nuevo, justificacion: 'urge' }).ok).toBe(true);
  });
  it('salidasPara enseña la razón del expediente', () => {
    const s = salidasPara('negociacion', 'ventas', makeQuote({ etapa: 'negociacion' }), { cliente: nuevo });
    expect(s.find(x => x.hacia === 'ganada')?.razon).toMatch(/expediente/);
  });
});
