/**
 * cotizacionAEmbarque.test.ts
 *
 * E-3. Lo que estos tests protegen: el embarque se crea AUTOMÁTICAMENTE al
 * marcar la cotización ganada, así que quien dispara el mapeo no ve el
 * resultado. Un costo perdido aquí no se descubre hasta pagarle al proveedor.
 *
 * Los tres casos de la dualidad §6 se cubren explícitamente, igual que en FC-1:
 * cotización armada desde FichaCotizacion, desde BandejaPricing, y mixta.
 */

import { describe, it, expect } from 'vitest';
import {
  mapearCotizacionAEmbarque,
  ingresoPorMoneda,
  gastoPorProveedor,
} from './cotizacionAEmbarque';
import { aplanarCotizacion, totalVenta } from './lineasCotizacion';
import {
  KanbanQuote, ServicioSolicitado, ConceptoCotizacion, CotizacionProveedor,
} from '../components/quotes/QuotesData';
import { ClienteVermur } from '../components/clientes/ClientesData';

// ─── Fixtures (mismos que FC-1, para que los casos sean comparables) ─────────

function tarifa(p: Partial<CotizacionProveedor> & { id: string; monto: number }): CotizacionProveedor {
  return { proveedor: 'Naviera X', contacto: 'C', moneda: 'USD', seleccionada: false, ...p } as CotizacionProveedor;
}
function concepto(p: Partial<ConceptoCotizacion> & { id: string; nombre: string }): ConceptoCotizacion {
  return { costo: 0, profit: 0, venta: 0, margen: 0, subconceptos: [], tarifas: [], proveedoresOficialIds: [], ...p } as ConceptoCotizacion;
}
function servicio(p: Partial<ServicioSolicitado> & { id: string }): ServicioSolicitado {
  return {
    tipo: 'maritimo', ruta: { origen: 'Shanghai', destino: 'Manzanillo' },
    incoterm: 'FOB', mercancia: 'General', peso: 1000, volumen: 10, estado: 'cotizado',
    cotizacionesProveedor: [], profit: 0, recargosPct: 0, conceptos: [], ...p,
  } as ServicioSolicitado;
}
function quote(servicios: ServicioSolicitado[]): KanbanQuote {
  return {
    id: 'COT-2026-0042', etapa: 'ganada',
    prospecto: { empresa: 'Alfa', contacto: 'A', telefono: '', email: '', origen: 'web' },
    // Una cotización sana está ligada a un cliente dado de alta: sin eso, el
    // mapeo avisa —con razón— de que se cerró la venta contra un prospecto.
    clienteId: 'CLI-001',
    vendedorId: 'v1', pricingId: 'p1', servicios,
    valorTotalConsolidado: 0, moneda: 'USD', estadoFinal: 'ganada', motivoPerdida: null,
    createdAt: '', updatedAt: '', historialEtapas: [], actividades: [], chat: [],
  } as KanbanQuote;
}

// Caso 1 — FichaCotizacion: conceptos con tarifas y proveedorId
const SRV_FICHA = servicio({
  id: 'srv-1', tipo: 'maritimo',
  conceptos: [
    concepto({
      id: 'c1', nombre: 'Flete marítimo', profit: 500, orden: 0,
      tarifas: [tarifa({ id: 't1', monto: 2000, proveedor: 'Maersk', proveedorId: 'PRV-001' })],
      proveedoresOficialIds: ['t1'],
    }),
    concepto({
      id: 'c2', nombre: 'Despacho aduanal', profit: 300, orden: 1,
      tarifas: [tarifa({ id: 't2', monto: 800, proveedor: 'Agencia Z', proveedorId: 'PRV-002' })],
      proveedoresOficialIds: ['t2'],
    }),
  ],
});

// Caso 2 — BandejaPricing: sin conceptos, sin proveedorId
const SRV_BANDEJA = servicio({
  id: 'srv-2', tipo: 'aereo', profit: 400,
  cotizacionesProveedor: [
    tarifa({ id: 'cp1', monto: 1500, proveedor: 'Lufthansa Cargo', seleccionada: true }),
    tarifa({ id: 'cp2', monto: 1700, proveedor: 'AeroMéxico', seleccionada: false }),
  ],
});

const CLIENTE_OK: ClienteVermur = {
  id: 'CLI-001', nombre: 'Industrias Alfa', rfc: 'IAL890315AB2',
  statusOperativo: 'ACTIVO', validadoFiscalmente: true,
} as ClienteVermur;

const CTX_SANO = { cliente: CLIENTE_OK, fechaReferencia: '2026-08-30' };

describe('INVARIANTE: no se pierde dinero en el camino', () => {
  const casos: Array<[string, ServicioSolicitado[]]> = [
    ['FichaCotizacion', [SRV_FICHA]],
    ['BandejaPricing', [SRV_BANDEJA]],
    ['mixta', [SRV_FICHA, SRV_BANDEJA]],
  ];

  casos.forEach(([nombre, servicios]) => {
    it(`caso ${nombre} — el ingreso heredado es igual a la venta cotizada`, () => {
      const q = quote(servicios);
      const { cargos } = mapearCotizacionAEmbarque(q);
      const ingresos = Object.values(ingresoPorMoneda(cargos)).reduce((a, b) => a + b, 0);
      expect(ingresos).toBeCloseTo(totalVenta(aplanarCotizacion(q)), 2);
    });

    it(`caso ${nombre} — el gasto heredado es igual al costo cotizado`, () => {
      const q = quote(servicios);
      const { cargos } = mapearCotizacionAEmbarque(q);
      const gastos = cargos.filter(c => c.tipo === 'gasto').reduce((a, c) => a + c.monto, 0);
      const costoCotizado = aplanarCotizacion(q).reduce((a, l) => a + l.costo, 0);
      expect(gastos).toBeCloseTo(costoCotizado, 2);
    });
  });

  it('el caso BandejaPricing conserva el costo aunque no traiga proveedorId', () => {
    // Es el escenario que más riesgo tenía: si el mapeo solo mirara
    // concepto.tarifas, este servicio heredaría cero costo y el embarque
    // nacería creyendo que el flete aéreo fue gratis.
    const { cargos } = mapearCotizacionAEmbarque(quote([SRV_BANDEJA]));
    const gastos = cargos.filter(c => c.tipo === 'gasto');
    expect(gastos).toHaveLength(1);
    expect(gastos[0].monto).toBe(1500);
    expect(gastos[0].proveedorId).toBeUndefined();
  });
});

describe('forma de los cargos heredados', () => {
  it('un ingreso por línea y un gasto por componente de costo', () => {
    const { cargos } = mapearCotizacionAEmbarque(quote([SRV_FICHA]));
    expect(cargos.filter(c => c.tipo === 'ingreso')).toHaveLength(2);
    expect(cargos.filter(c => c.tipo === 'gasto')).toHaveLength(2);
  });

  it('todo cargo heredado queda marcado como tal y sin facturar', () => {
    const { cargos } = mapearCotizacionAEmbarque(quote([SRV_FICHA, SRV_BANDEJA]));
    cargos.forEach(c => {
      expect(c.origen).toBe('heredado');
      expect(c.facturaId).toBeNull();
    });
  });

  it('cada cargo apunta a la línea de la cotización que lo originó', () => {
    const { cargos } = mapearCotizacionAEmbarque(quote([SRV_FICHA]));
    cargos.forEach(c => {
      expect(c.origenCotizacion?.cotizacionId).toBe('COT-2026-0042');
      expect(c.origenCotizacion?.servicioId).toBe('srv-1');
    });
  });

  it('el gasto conserva el proveedor al que hay que pagarle', () => {
    const { cargos } = mapearCotizacionAEmbarque(quote([SRV_FICHA]));
    const gastos = cargos.filter(c => c.tipo === 'gasto');
    expect(gastos.map(g => g.proveedorId)).toEqual(['PRV-001', 'PRV-002']);
  });

  it('los ids de cargo son únicos', () => {
    const { cargos } = mapearCotizacionAEmbarque(quote([SRV_FICHA, SRV_BANDEJA]));
    expect(new Set(cargos.map(c => c.id)).size).toBe(cargos.length);
  });

  it('multi-proveedor genera un gasto por cada uno, no uno agregado', () => {
    const srv = servicio({
      id: 'srv-m',
      conceptos: [concepto({
        id: 'cm', nombre: 'Maniobras', profit: 100,
        tarifas: [
          tarifa({ id: 'ta', monto: 600, proveedor: 'Terminal A', proveedorId: 'PRV-A' }),
          tarifa({ id: 'tb', monto: 400, proveedor: 'Terminal B', proveedorId: 'PRV-B' }),
        ],
        proveedoresOficialIds: ['ta', 'tb'],
      })],
    });
    const { cargos } = mapearCotizacionAEmbarque(quote([srv]));
    const gastos = cargos.filter(c => c.tipo === 'gasto');
    expect(gastos).toHaveLength(2);
    expect(gastoPorProveedor(cargos).map(g => g.proveedorId).sort()).toEqual(['PRV-A', 'PRV-B']);
  });

  it('agrupa por servicio para poder facturar separado', () => {
    const { cargos } = mapearCotizacionAEmbarque(quote([SRV_FICHA, SRV_BANDEJA]));
    const grupos = new Set(cargos.map(c => c.grupoFacturacion));
    expect(grupos).toEqual(new Set(['srv-1', 'srv-2']));
  });

  it('no muta la cotización', () => {
    const q = quote([SRV_FICHA]);
    const copia = JSON.parse(JSON.stringify(q));
    mapearCotizacionAEmbarque(q);
    expect(q).toEqual(copia);
  });
});

describe('moneda', () => {
  it('cada cargo conserva SU moneda: no se convierte nada (§4.3)', () => {
    const srv = servicio({
      id: 'srv-mx',
      conceptos: [concepto({
        id: 'cmx', nombre: 'Maniobras nacionales', profit: 4000,
        tarifas: [tarifa({ id: 'tmx', monto: 11000, moneda: 'MXN', proveedor: 'Terminal', proveedorId: 'PRV-MX' })],
        proveedoresOficialIds: ['tmx'],
      })],
    });
    const { cargos } = mapearCotizacionAEmbarque(quote([SRV_FICHA, srv]));
    expect(ingresoPorMoneda(cargos)).toEqual({ USD: 3600, MXN: 15000 });
  });

  it('gastoPorProveedor separa por proveedor Y por moneda', () => {
    const srv = servicio({
      id: 'srv-dos',
      conceptos: [
        concepto({ id: 'a', nombre: 'A', profit: 0,
          tarifas: [tarifa({ id: 'ta', monto: 100, moneda: 'USD', proveedorId: 'PRV-1', proveedor: 'P1' })],
          proveedoresOficialIds: ['ta'] }),
        concepto({ id: 'b', nombre: 'B', profit: 0,
          tarifas: [tarifa({ id: 'tb', monto: 2000, moneda: 'MXN', proveedorId: 'PRV-1', proveedor: 'P1' })],
          proveedoresOficialIds: ['tb'] }),
      ],
    });
    const { cargos } = mapearCotizacionAEmbarque(quote([srv]));
    const porProv = gastoPorProveedor(cargos);
    expect(porProv).toHaveLength(2); // mismo proveedor, dos monedas
    expect(porProv.every(g => g.proveedorId === 'PRV-1')).toBe(true);
  });
});

describe('advertencias: lo que Ventas no va a ver al cerrar la venta', () => {
  it('avisa cuando el costo mezcla monedas', () => {
    // getCostoOficial suma montos sin mirar la moneda: 1000 USD + 5000 MXN da
    // 6000 «de algo». El embarque separa las monedas, pero la cotización ya
    // había calculado su venta sobre esa suma sin sentido.
    const srv = servicio({
      id: 'srv-mix',
      conceptos: [concepto({
        id: 'cmix', nombre: 'Flete + maniobras', profit: 500,
        tarifas: [
          tarifa({ id: 'tu', monto: 1000, moneda: 'USD', proveedorId: 'P1', proveedor: 'A' }),
          tarifa({ id: 'tm', monto: 5000, moneda: 'MXN', proveedorId: 'P2', proveedor: 'B' }),
        ],
        proveedoresOficialIds: ['tu', 'tm'],
      })],
    });
    const { advertencias } = mapearCotizacionAEmbarque(quote([srv]));
    expect(advertencias.map(a => a.tipo)).toContain('monedas_mezcladas');
  });

  it('avisa cuando hay costo pero no se sabe a quién pagarle', () => {
    const { advertencias } = mapearCotizacionAEmbarque(quote([SRV_BANDEJA]));
    expect(advertencias.map(a => a.tipo)).toContain('gasto_sin_proveedor');
  });

  it('avisa cuando se cobra sin costo asociado', () => {
    const srv = servicio({
      id: 'srv-sc',
      conceptos: [concepto({ id: 'csc', nombre: 'Servicio', costo: 0, profit: 500 })],
    });
    expect(mapearCotizacionAEmbarque(quote([srv])).advertencias.map(a => a.tipo))
      .toContain('venta_sin_costo');
  });

  it('avisa de margen negativo', () => {
    const srv = servicio({
      id: 'srv-neg',
      conceptos: [concepto({
        id: 'cneg', nombre: 'Flete', profit: -500,
        tarifas: [tarifa({ id: 't', monto: 1000, proveedorId: 'P', proveedor: 'X' })],
        proveedoresOficialIds: ['t'],
      })],
    });
    expect(mapearCotizacionAEmbarque(quote([srv])).advertencias.map(a => a.tipo))
      .toContain('margen_negativo');
  });

  it('avisa si la cotización no tiene líneas', () => {
    const { cargos, advertencias } = mapearCotizacionAEmbarque(quote([]), CTX_SANO);
    expect(cargos).toEqual([]);
    expect(advertencias.map(a => a.tipo)).toEqual(['sin_venta']);
    expect(advertencias[0].detalle).toContain('sin cargos');
  });

  it('una cotización sana no genera advertencias', () => {
    expect(mapearCotizacionAEmbarque(quote([SRV_FICHA]), CTX_SANO).advertencias).toEqual([]);
  });

  it('las advertencias no bloquean: los cargos se generan igual', () => {
    // El embarque se crea de todos modos. Si esto abortara, una cotización
    // ganada se quedaría sin embarque y el cliente ya la aceptó.
    const { cargos } = mapearCotizacionAEmbarque(quote([SRV_BANDEJA]));
    expect(cargos.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Las dos advertencias que pidió Operaciones.
// ─────────────────────────────────────────────────────────────────────────────

const HOY = '2026-08-30';

function conVigencia(vigencia: string | undefined): KanbanQuote {
  return quote([servicio({
    id: 'srv-v',
    conceptos: [concepto({
      id: 'cv', nombre: 'Flete', profit: 500,
      tarifas: [tarifa({ id: 'tv', monto: 2000, proveedor: 'Maersk', proveedorId: 'PRV-1', vigencia })],
      proveedoresOficialIds: ['tv'],
    })],
  })]);
}

const tiposDe = (q: KanbanQuote, ctx = {}) =>
  mapearCotizacionAEmbarque(q, { fechaReferencia: HOY, cliente: CLIENTE_OK, ...ctx })
    .advertencias.map(a => a.tipo);

describe('advertencia: tarifa vencida', () => {
  it('avisa cuando la vigencia quedó atrás', () => {
    expect(tiposDe(conVigencia('2026-07-15'))).toContain('tarifa_vencida');
  });

  it('no avisa si la tarifa sigue vigente', () => {
    expect(tiposDe(conVigencia('2026-12-31'))).not.toContain('tarifa_vencida');
  });

  it('el mismo día de vencimiento todavía es válido', () => {
    expect(tiposDe(conVigencia(HOY))).not.toContain('tarifa_vencida');
  });

  it('sin vigencia declarada no opina', () => {
    expect(tiposDe(conVigencia(undefined))).not.toContain('tarifa_vencida');
  });

  it('una vigencia en texto libre no se interpreta como fecha', () => {
    // §4.7: la vigencia es campo abierto, «como lo dice el proveedor».
    // Marcar «sujeto a confirmación» como vencida sería un falso positivo.
    expect(tiposDe(conVigencia('sujeto a confirmación'))).not.toContain('tarifa_vencida');
  });

  it('el aviso nombra al proveedor y la fecha, para poder actuar', () => {
    const { advertencias } = mapearCotizacionAEmbarque(conVigencia('2026-07-15'), { fechaReferencia: HOY });
    const a = advertencias.find(x => x.tipo === 'tarifa_vencida')!;
    expect(a.detalle).toContain('Maersk');
    expect(a.detalle).toContain('2026-07-15');
  });

  it('avisa aunque solo una de varias tarifas esté vencida', () => {
    const q = quote([servicio({
      id: 'srv-mv',
      conceptos: [concepto({
        id: 'cmv', nombre: 'Maniobras', profit: 100,
        tarifas: [
          tarifa({ id: 'v1', monto: 600, proveedor: 'A', proveedorId: 'P1', vigencia: '2026-12-31' }),
          tarifa({ id: 'v2', monto: 400, proveedor: 'B', proveedorId: 'P2', vigencia: '2026-01-01' }),
        ],
        proveedoresOficialIds: ['v1', 'v2'],
      })],
    })]);
    const a = mapearCotizacionAEmbarque(q, { fechaReferencia: HOY })
      .advertencias.find(x => x.tipo === 'tarifa_vencida')!;
    expect(a.detalle).toContain('B');
    expect(a.detalle).not.toContain('A (');
  });
});

describe('advertencia: cliente sin expediente validado', () => {
  const clienteOk = CLIENTE_OK;

  const conCliente = (clienteId: string | null) => ({ ...quote([SRV_FICHA]), clienteId } as KanbanQuote);

  it('avisa cuando la venta se cerró contra un prospecto sin alta', () => {
    // El caso más común: la cotización nunca se ligó a un cliente.
    const tipos = tiposDe(conCliente(null));
    expect(tipos).toContain('cliente_sin_expediente');
  });

  it('el aviso nombra a la empresa, para que Administración sepa a quién dar de alta', () => {
    const { advertencias } = mapearCotizacionAEmbarque(conCliente(null), { fechaReferencia: HOY });
    expect(advertencias.find(a => a.tipo === 'cliente_sin_expediente')!.detalle).toContain('Alfa');
  });

  it('no avisa con un expediente completo', () => {
    expect(tiposDe(conCliente('CLI-001'), { cliente: clienteOk })).not.toContain('cliente_sin_expediente');
  });

  it('avisa si el cliente está INACTIVO', () => {
    const inactivo = { ...clienteOk, statusOperativo: 'INACTIVO' } as ClienteVermur;
    const { advertencias } = mapearCotizacionAEmbarque(conCliente('CLI-001'), { fechaReferencia: HOY, cliente: inactivo });
    expect(advertencias.find(a => a.tipo === 'cliente_sin_expediente')!.detalle).toContain('INACTIVO');
  });

  it('avisa si no tiene RFC — la ausencia de RFC es la señal de no validado', () => {
    const sinRfc = { ...clienteOk, rfc: '' } as ClienteVermur;
    const { advertencias } = mapearCotizacionAEmbarque(conCliente('CLI-001'), { fechaReferencia: HOY, cliente: sinRfc });
    expect(advertencias.find(a => a.tipo === 'cliente_sin_expediente')!.detalle).toContain('RFC');
  });

  it('avisa si no está validado fiscalmente', () => {
    const sinValidar = { ...clienteOk, validadoFiscalmente: false } as ClienteVermur;
    expect(tiposDe(conCliente('CLI-001'), { cliente: sinValidar })).toContain('cliente_sin_expediente');
  });

  it('acumula todo lo que falta en un solo aviso', () => {
    const malo = { ...clienteOk, rfc: '', validadoFiscalmente: false, statusOperativo: 'INACTIVO' } as ClienteVermur;
    const avisos = mapearCotizacionAEmbarque(conCliente('CLI-001'), { fechaReferencia: HOY, cliente: malo })
      .advertencias.filter(a => a.tipo === 'cliente_sin_expediente');
    expect(avisos).toHaveLength(1);
    expect(avisos[0].detalle).toContain('INACTIVO');
    expect(avisos[0].detalle).toContain('RFC');
  });

  it('avisa si la cotización apunta a un cliente que no se pudo leer', () => {
    expect(tiposDe(conCliente('CLI-999'), { cliente: null })).toContain('cliente_sin_expediente');
  });

  it('ninguna de las dos bloquea: los cargos se generan igual', () => {
    const { cargos } = mapearCotizacionAEmbarque(conVigencia('2020-01-01'), { fechaReferencia: HOY });
    expect(cargos.length).toBeGreaterThan(0);
  });
});
