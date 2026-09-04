/**
 * lineasCotizacion.test.ts
 *
 * FC-1. Estos tests son la red de seguridad de todo el rediseño de la ficha.
 *
 * El invariante que más importa:
 *
 *     totalVenta(aplanarCotizacion(q)) === calcularTotalConsolidado(q.servicios)
 *
 * Si la tabla plana suma distinto al Kanban y a la Bandeja, nadie sabría cuál
 * de los dos números creer. Se verifica en los tres casos de la dualidad §6:
 * cotización armada desde FichaCotizacion, desde BandejaPricing, y mixta.
 */

import { describe, it, expect } from 'vitest';
import {
  aplanarCotizacion,
  totalVenta,
  aplicarEdicionLinea,
  reordenarLinea,
  aplicarOrden,
  agregarLinea,
  quitarLinea,
  moverLineaDeServicio,
  compararConTarget,
  tieneVariosServicios,
  LineaPlana,
} from './lineasCotizacion';
import {
  KanbanQuote, ServicioSolicitado, ConceptoCotizacion, CotizacionProveedor,
  calcularTotalConsolidado,
} from '../components/quotes/QuotesData';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function tarifa(p: Partial<CotizacionProveedor> & { id: string; monto: number }): CotizacionProveedor {
  return {
    proveedor: p.proveedor ?? 'Naviera X',
    contacto: 'Contacto',
    moneda: 'USD',
    seleccionada: false,
    ...p,
  } as CotizacionProveedor;
}

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

function quote(servicios: ServicioSolicitado[]): KanbanQuote {
  return {
    id: 'COT-2026-0001', etapa: 'consolidada',
    prospecto: { empresa: 'Alfa', contacto: 'A', telefono: '', email: '', origen: 'web' },
    vendedorId: 'v1', pricingId: 'p1',
    servicios,
    valorTotalConsolidado: 0, moneda: 'USD',
    estadoFinal: null, motivoPerdida: null,
    createdAt: '', updatedAt: '', historialEtapas: [], actividades: [], chat: [],
  } as KanbanQuote;
}

// ── Caso 1: armada desde FichaCotizacion (conceptos con tarifas y proveedorId)
const SRV_FICHA = servicio({
  id: 'srv-1',
  tipo: 'maritimo',
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

// ── Caso 2: armada desde BandejaPricing (sin conceptos, sin proveedorId)
const SRV_BANDEJA = servicio({
  id: 'srv-2',
  tipo: 'aereo',
  profit: 400,
  cotizacionesProveedor: [
    tarifa({ id: 'cp1', monto: 1500, proveedor: 'Lufthansa Cargo', seleccionada: true }),
    tarifa({ id: 'cp2', monto: 1700, proveedor: 'AeroMéxico', seleccionada: false }),
  ],
});

describe('invariante: la tabla plana suma lo mismo que el Kanban', () => {
  it('caso FichaCotizacion — conceptos con tarifas', () => {
    const q = quote([SRV_FICHA]);
    expect(totalVenta(aplanarCotizacion(q))).toBe(calcularTotalConsolidado(q.servicios));
  });

  it('caso BandejaPricing — cotizacionesProveedor sin proveedorId', () => {
    const q = quote([SRV_BANDEJA]);
    expect(totalVenta(aplanarCotizacion(q))).toBe(calcularTotalConsolidado(q.servicios));
  });

  it('caso MIXTO — un servicio de cada ruta en la misma cotización', () => {
    const q = quote([SRV_FICHA, SRV_BANDEJA]);
    expect(totalVenta(aplanarCotizacion(q))).toBe(calcularTotalConsolidado(q.servicios));
  });

  it('cotización sin servicios', () => {
    const q = quote([]);
    expect(totalVenta(aplanarCotizacion(q))).toBe(calcularTotalConsolidado(q.servicios));
  });

  it('servicio con conceptos Y cotización seleccionada: NO se cuenta dos veces', () => {
    // La ruta B tiene precedencia y los conceptos no se recorren, igual que en
    // calcularTotalConsolidado. Sin ese `continue`, el total se duplicaría.
    const hibrido = servicio({
      id: 'srv-3',
      profit: 400,
      cotizacionesProveedor: [tarifa({ id: 'cp1', monto: 1500, seleccionada: true })],
      conceptos: [
        concepto({
          id: 'c9', nombre: 'No debe contarse', profit: 999,
          tarifas: [tarifa({ id: 't9', monto: 9999 })],
          proveedoresOficialIds: ['t9'],
        }),
      ],
    });
    const q = quote([hibrido]);
    const lineas = aplanarCotizacion(q);

    expect(lineas).toHaveLength(1);
    expect(lineas[0].origen).toBe('servicio');
    expect(totalVenta(lineas)).toBe(calcularTotalConsolidado(q.servicios));
    expect(totalVenta(lineas)).toBe(1900); // 1500 + 400, no 12398
  });
});

describe('aplanado: qué trae cada renglón', () => {
  it('la ruta A conserva proveedorId, que es lo que la ruta B no tiene', () => {
    const [l1, l2] = aplanarCotizacion(quote([SRV_FICHA]));
    expect(l1.proveedorNombre).toBe('Maersk');
    expect(l1.proveedorId).toBe('PRV-001');
    expect(l2.proveedorId).toBe('PRV-002');
  });

  it('la ruta B trae el nombre del proveedor aunque no traiga su id', () => {
    const [l] = aplanarCotizacion(quote([SRV_BANDEJA]));
    expect(l.proveedorNombre).toBe('Lufthansa Cargo');
    expect(l.proveedorId).toBeNull();
    expect(l.origen).toBe('servicio');
  });

  it('solo toma la cotización de proveedor SELECCIONADA', () => {
    const [l] = aplanarCotizacion(quote([SRV_BANDEJA]));
    expect(l.costo).toBe(1500); // no 1700
  });

  it('venta y margen se calculan con el mismo motor que usa Luis', () => {
    const [l] = aplanarCotizacion(quote([SRV_FICHA]));
    expect(l.costo).toBe(2000);
    expect(l.profit).toBe(500);
    expect(l.venta).toBe(2500);
    expect(l.margen).toBeCloseTo(0.2, 6);
  });

  it('multi-proveedor: suma los costos y nombra a todos, sin inventar un id', () => {
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
    const [l] = aplanarCotizacion(quote([srv]));
    expect(l.costo).toBe(1000);
    expect(l.proveedorNombre).toBe('Terminal A + Terminal B');
    expect(l.proveedorId).toBeNull();
  });

  it('los subconceptos suman al costo de la línea', () => {
    const srv = servicio({
      id: 'srv-s',
      conceptos: [concepto({
        id: 'cs', nombre: 'Flete', profit: 0,
        tarifas: [tarifa({ id: 't', monto: 1000 })],
        proveedoresOficialIds: ['t'],
        subconceptos: [{ id: 's1', nombre: 'Combustible', costo: 150, moneda: 'USD' }],
      })],
    });
    const [l] = aplanarCotizacion(quote([srv]));
    expect(l.costo).toBe(1150);
    expect(l.costoDerivado).toBe(true);
  });

  it('un concepto sin tarifas queda con costo capturable a mano', () => {
    const srv = servicio({
      id: 'srv-x',
      conceptos: [concepto({ id: 'cx', nombre: 'Manual', costo: 700, profit: 100 })],
    });
    const [l] = aplanarCotizacion(quote([srv]));
    expect(l.costoDerivado).toBe(false);
    expect(l.tarifasCount).toBe(0);
    expect(l.proveedorNombre).toBe('');
  });

  it('el aplanado no muta la cotización original', () => {
    const q = quote([SRV_FICHA]);
    const copia = JSON.parse(JSON.stringify(q));
    aplanarCotizacion(q);
    expect(q).toEqual(copia);
  });

  it('los ids de línea son únicos y estables entre llamadas', () => {
    const q = quote([SRV_FICHA, SRV_BANDEJA]);
    const a = aplanarCotizacion(q).map(l => l.id);
    const b = aplanarCotizacion(q).map(l => l.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it('la columna Servicio solo aplica con más de un servicio', () => {
    expect(tieneVariosServicios(quote([SRV_FICHA]))).toBe(false);
    expect(tieneVariosServicios(quote([SRV_FICHA, SRV_BANDEJA]))).toBe(true);
  });
});

describe('edición', () => {
  it('editar profit recalcula venta y margen', () => {
    const q = aplicarEdicionLinea(quote([SRV_FICHA]), 'srv-1::c1', { profit: 1000 });
    const l = aplanarCotizacion(q).find(x => x.id === 'srv-1::c1')!;
    expect(l.profit).toBe(1000);
    expect(l.venta).toBe(3000);
    expect(l.margen).toBeCloseTo(1 / 3, 6);
  });

  it('el costo derivado NO se puede sobrescribir a mano', () => {
    // Escribir 50 donde hay una tarifa de 2000 mostraría un costo que no
    // corresponde a ninguna tarifa elegida.
    const q = aplicarEdicionLinea(quote([SRV_FICHA]), 'srv-1::c1', { costo: 50 });
    const l = aplanarCotizacion(q).find(x => x.id === 'srv-1::c1')!;
    expect(l.costo).toBe(2000);
  });

  it('el costo capturado a mano sí se edita', () => {
    const srv = servicio({
      id: 'srv-x',
      conceptos: [concepto({ id: 'cx', nombre: 'Manual', costo: 700, profit: 100 })],
    });
    const q = aplicarEdicionLinea(quote([srv]), 'srv-x::cx', { costo: 900 });
    const l = aplanarCotizacion(q).find(x => x.id === 'srv-x::cx')!;
    expect(l.costo).toBe(900);
    expect(l.venta).toBe(1000);
  });

  it('en una línea de ruta B, el profit vive en el servicio', () => {
    const q = aplicarEdicionLinea(quote([SRV_BANDEJA]), 'srv-2::flat', { profit: 900 });
    expect(q.servicios[0].profit).toBe(900);
    const l = aplanarCotizacion(q)[0];
    expect(l.venta).toBe(2400);
  });

  it('editar una línea inexistente devuelve la cotización intacta', () => {
    const q = quote([SRV_FICHA]);
    expect(aplicarEdicionLinea(q, 'no-existe', { profit: 1 })).toBe(q);
  });

  it('la edición no muta la cotización original', () => {
    const q = quote([SRV_FICHA]);
    const copia = JSON.parse(JSON.stringify(q));
    aplicarEdicionLinea(q, 'srv-1::c1', { profit: 9999 });
    expect(q).toEqual(copia);
  });
});

describe('alta, baja y orden', () => {
  it('agregar línea crea un concepto en el servicio indicado', () => {
    const q = agregarLinea(quote([SRV_FICHA]), {
      servicioId: 'srv-1', concepto: 'Seguro', costo: 200, profit: 50,
    });
    const lineas = aplanarCotizacion(q);
    expect(lineas).toHaveLength(3);
    const nueva = lineas.find(l => l.concepto === 'Seguro')!;
    expect(nueva.venta).toBe(250);
    expect(nueva.costoDerivado).toBe(false);
  });

  it('agregar línea suma al total', () => {
    const antes = totalVenta(aplanarCotizacion(quote([SRV_FICHA])));
    const q = agregarLinea(quote([SRV_FICHA]), { servicioId: 'srv-1', concepto: 'Seguro', costo: 200, profit: 50 });
    expect(totalVenta(aplanarCotizacion(q))).toBe(antes + 250);
  });

  it('quitar línea la elimina y baja el total', () => {
    const q = quitarLinea(quote([SRV_FICHA]), 'srv-1::c2');
    const lineas = aplanarCotizacion(q);
    expect(lineas).toHaveLength(1);
    expect(totalVenta(lineas)).toBe(2500);
  });

  it('NO se puede quitar una línea de ruta B: sería borrar el servicio', () => {
    const q = quote([SRV_BANDEJA]);
    expect(quitarLinea(q, 'srv-2::flat')).toBe(q);
  });

  it('reordenar intercambia el orden con la línea vecina', () => {
    const lineas = aplanarCotizacion(quote([SRV_FICHA]));
    const movidas = reordenarLinea(lineas, 'srv-1::c2', 'arriba');
    expect(movidas.map(l => l.id)).toEqual(['srv-1::c2', 'srv-1::c1']);
  });

  it('reordenar en el extremo no hace nada', () => {
    const lineas = aplanarCotizacion(quote([SRV_FICHA]));
    expect(reordenarLinea(lineas, 'srv-1::c1', 'arriba')).toBe(lineas);
  });

  it('reordenar no cruza líneas de servicios distintos', () => {
    const lineas = aplanarCotizacion(quote([SRV_FICHA, SRV_BANDEJA]));
    const movidas = reordenarLinea(lineas, 'srv-2::flat', 'arriba');
    expect(movidas.find(l => l.id === 'srv-2::flat')!.servicioId).toBe('srv-2');
  });

  it('reordenar no cambia el total', () => {
    const q = quote([SRV_FICHA]);
    const lineas = aplanarCotizacion(q);
    const movidas = reordenarLinea(lineas, 'srv-1::c2', 'arriba');
    expect(totalVenta(movidas)).toBe(totalVenta(lineas));
  });

  it('aplicarOrden persiste el orden en los conceptos', () => {
    const q = quote([SRV_FICHA]);
    const movidas = reordenarLinea(aplanarCotizacion(q), 'srv-1::c2', 'arriba');
    const guardado = aplicarOrden(q, movidas);
    const c2 = guardado.servicios[0].conceptos.find(c => c.id === 'c2')!;
    expect(c2.orden).toBe(0);
    expect(aplanarCotizacion(guardado)[0].id).toBe('srv-1::c2');
  });
});

describe('target: contra qué compite Pricing', () => {
  const conTarget = (venta: number, target: number | null | undefined): LineaPlana =>
    ({ venta, target } as LineaPlana);

  it('marca cuando la venta queda POR ENCIMA del objetivo del cliente', () => {
    expect(compararConTarget(conTarget(2500, 2000))).toBe('sobre_target');
  });

  it('marca cuando queda por debajo o justo', () => {
    expect(compararConTarget(conTarget(1800, 2000))).toBe('bajo_target');
    expect(compararConTarget(conTarget(2000, 2000))).toBe('en_target');
  });

  it('sin target no compara nada', () => {
    expect(compararConTarget(conTarget(2500, null))).toBeNull();
    expect(compararConTarget(conTarget(2500, undefined))).toBeNull();
  });

  it('un target en cero es un dato válido, no ausencia', () => {
    expect(compararConTarget(conTarget(100, 0))).toBe('sobre_target');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El hueco que estos tests destaparon.
//
// calcularTotalConsolidado sumaba solo tarifas + subconceptos e ignoraba el
// campo `costo` capturado a mano. Un concepto tecleado sin tarifas aportaba su
// profit al total pero NO su costo: total de menos, margen inflado.
// Ahora ambos usan costoDeConcepto().
// ─────────────────────────────────────────────────────────────────────────────
describe('concepto capturado a mano, sin tarifas', () => {
  const manual = servicio({
    id: 'srv-man',
    conceptos: [concepto({ id: 'cman', nombre: 'Gestoría', costo: 700, profit: 300 })],
  });

  it('su costo cuenta en el total, no solo su profit', () => {
    const q = quote([manual]);
    // Antes daba 300 (solo el profit). Lo correcto es 700 + 300.
    expect(calcularTotalConsolidado(q.servicios)).toBe(1000);
  });

  it('la tabla plana y el Kanban siguen coincidiendo', () => {
    const q = quote([manual]);
    expect(totalVenta(aplanarCotizacion(q))).toBe(calcularTotalConsolidado(q.servicios));
  });

  it('las tarifas tienen precedencia sobre el costo tecleado', () => {
    // Si hay tarifa elegida, ese es el costo: el campo viejo no la contradice.
    const conAmbos = servicio({
      id: 'srv-amb',
      conceptos: [concepto({
        id: 'camb', nombre: 'Flete', costo: 99, profit: 100,
        tarifas: [tarifa({ id: 't', monto: 2000 })],
        proveedoresOficialIds: ['t'],
      })],
    });
    expect(aplanarCotizacion(quote([conAmbos]))[0].costo).toBe(2000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Desglose de costos: a quién se le paga.
// El agregado sirve para cotizar; para PAGAR hace falta el desglose.
// ─────────────────────────────────────────────────────────────────────────────
describe('desglose de costos por proveedor', () => {
  it('INVARIANTE: la suma del desglose es igual al costo de la línea', () => {
    const q = quote([SRV_FICHA, SRV_BANDEJA]);
    aplanarCotizacion(q).forEach(l => {
      const suma = l.costos.reduce((a, c) => a + c.monto, 0);
      expect(suma).toBeCloseTo(l.costo, 6);
    });
  });

  it('multi-proveedor: una entrada por cada uno, con su id', () => {
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
    const [l] = aplanarCotizacion(quote([srv]));
    expect(l.costos).toHaveLength(2);
    expect(l.costos.map(c => c.proveedorId)).toEqual(['PRV-A', 'PRV-B']);
    expect(l.costos.reduce((a, c) => a + c.monto, 0)).toBe(l.costo);
  });

  it('los subconceptos entran como componentes sin proveedor', () => {
    const srv = servicio({
      id: 'srv-s',
      conceptos: [concepto({
        id: 'cs', nombre: 'Flete', profit: 0,
        tarifas: [tarifa({ id: 't', monto: 1000, proveedor: 'Maersk', proveedorId: 'PRV-1' })],
        proveedoresOficialIds: ['t'],
        subconceptos: [{ id: 's1', nombre: 'Combustible', costo: 150, moneda: 'USD' }],
      })],
    });
    const [l] = aplanarCotizacion(quote([srv]));
    expect(l.costos.map(c => c.tipo)).toEqual(['tarifa', 'subconcepto']);
    expect(l.costos[1].proveedorId).toBeNull();
    expect(l.costos.reduce((a, c) => a + c.monto, 0)).toBe(1150);
  });

  it('un costo tecleado a mano queda como una sola entrada manual', () => {
    const srv = servicio({
      id: 'srv-x',
      conceptos: [concepto({ id: 'cx', nombre: 'Gestoría', costo: 700, profit: 100 })],
    });
    const [l] = aplanarCotizacion(quote([srv]));
    expect(l.costos).toHaveLength(1);
    expect(l.costos[0].tipo).toBe('manual');
    expect(l.costos[0].monto).toBe(700);
  });

  it('la ruta B trae su única entrada, con el proveedor nombrado', () => {
    const [l] = aplanarCotizacion(quote([SRV_BANDEJA]));
    expect(l.costos).toHaveLength(1);
    expect(l.costos[0].proveedorNombre).toBe('Lufthansa Cargo');
    expect(l.costos[0].monto).toBe(1500);
  });

  it('una línea sin costo no inventa componentes', () => {
    const srv = servicio({
      id: 'srv-0',
      conceptos: [concepto({ id: 'c0', nombre: 'Sin costo', costo: 0, profit: 200 })],
    });
    expect(aplanarCotizacion(quote([srv]))[0].costos).toEqual([]);
  });
});

describe('lo escrito tiene que ser guardable en Firestore', () => {
  const sinUndefined = (v: unknown, ruta = 'quote'): string[] => {
    if (v === undefined) return [ruta];
    if (Array.isArray(v)) return v.flatMap((x, i) => sinUndefined(x, `${ruta}[${i}]`));
    if (v && typeof v === 'object') {
      return Object.entries(v as Record<string, unknown>)
        .flatMap(([k, x]) => sinUndefined(x, `${ruta}.${k}`));
    }
    return [];
  };

  it('elegir un concepto del catálogo no deja undefined', () => {
    // Era el camino del bug: `conceptoId: ... ?? undefined` tumbaba la
    // escritura entera y el concepto se perdía al recargar.
    const q = aplicarEdicionLinea(quote([SRV_FICHA]), 'srv-1::c1',
      { conceptoId: 'CON-99', concepto: 'Flete' });
    expect(sinUndefined(q)).toEqual([]);
  });

  it('quitar el concepto lo deja en null, no en undefined', () => {
    const q = aplicarEdicionLinea(quote([SRV_FICHA]), 'srv-1::c1', { conceptoId: null });
    expect(sinUndefined(q)).toEqual([]);
    expect(q.servicios[0].conceptos[0].conceptoId).toBeNull();
  });

  it('agregar una línea no deja undefined', () => {
    const q = agregarLinea(quote([SRV_FICHA]), { servicioId: 'srv-1', concepto: 'Nuevo' });
    expect(sinUndefined(q)).toEqual([]);
  });

  it('editar costo y profit no deja undefined', () => {
    const q = aplicarEdicionLinea(quote([SRV_FICHA]), 'srv-1::c1', { profit: 800 });
    expect(sinUndefined(q)).toEqual([]);
  });
});

// ─── moverLineaDeServicio (C.4) ──────────────────────────────────────────────
//
// En la tabla única la columna «Servicio» es selector MIENTRAS la línea está
// fresca, y fija después. De la pertenencia dependen la matriz y los folios
// del embarque: mover una línea trabajada reagruparía dinero por debajo.

describe('moverLineaDeServicio', () => {
  const dosServicios = (): KanbanQuote => quote([
    servicio({ id: 'srv-1', tipo: 'maritimo' }),
    servicio({ id: 'srv-2', tipo: 'terrestre' }),
  ]);

  const conLineaFresca = () => agregarLinea(dosServicios(), { servicioId: 'srv-1', concepto: '' });

  const idDeLaFresca = (q: KanbanQuote) =>
    aplanarCotizacion(q).find(l => l.servicioId === 'srv-1')!.id;

  it('mueve una línea fresca al otro servicio', () => {
    const q = conLineaFresca();
    const movida = moverLineaDeServicio(q, idDeLaFresca(q), 'srv-2');
    expect(movida.servicios[0].conceptos).toHaveLength(0);
    expect(movida.servicios[1].conceptos).toHaveLength(1);
  });

  it('la línea movida genera el embarque del servicio NUEVO — la cadena lee datos', () => {
    const q = conLineaFresca();
    const movida = moverLineaDeServicio(q, idDeLaFresca(q), 'srv-2');
    const linea = aplanarCotizacion(movida)[0];
    expect(linea.servicioId).toBe('srv-2');
    expect(linea.servicioTipo).toBe('terrestre');
  });

  it('con conceptoId ya NO se mueve: el selector prometió quedar fijo', () => {
    let q = conLineaFresca();
    q = aplicarEdicionLinea(q, idDeLaFresca(q), { conceptoId: 'CON-001', concepto: 'Flete' });
    const intento = moverLineaDeServicio(q, idDeLaFresca(q), 'srv-2');
    expect(intento).toBe(q);
  });

  it('con costo capturado tampoco: lleva dinero colgando', () => {
    let q = conLineaFresca();
    q = aplicarEdicionLinea(q, idDeLaFresca(q), { costo: 500 });
    expect(moverLineaDeServicio(q, idDeLaFresca(q), 'srv-2')).toBe(q);
  });

  it('a un servicio inexistente no mueve nada', () => {
    const q = conLineaFresca();
    expect(moverLineaDeServicio(q, idDeLaFresca(q), 'srv-99')).toBe(q);
  });

  it('al mismo servicio es un no-op', () => {
    const q = conLineaFresca();
    expect(moverLineaDeServicio(q, idDeLaFresca(q), 'srv-1')).toBe(q);
  });
});

