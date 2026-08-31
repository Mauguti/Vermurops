/**
 * matrizComparativa.test.ts
 *
 * MC-1. La pantalla donde se decide el margen.
 *
 * El test que da nombre a todo esto es el del total: el sistema de referencia
 * suma TODAS las filas, incluidas «Validez» —una fecha, que en PHP vale 2026—
 * y «Días de tránsito». Aquí solo suman las filas de importe.
 */

import { describe, it, expect } from 'vitest';
import {
  construirMatriz, claveAgente, totalDeAgente, calcularTotales,
  agenteConMenorTotal, conceptosCotizados, agentesIncompletos, filaVigencia,
  escribirCelda, quitarAgenteDeCotizacion,
  lineasDesdeAgente, elegirAgente, conceptosSinCotizar,
  CONCEPTOS_POR_PLANTILLA, matricesPorServicio,
  AgenteColumna, FilaMatriz,
} from './matrizComparativa';
import { aplanarCotizacion } from './lineasCotizacion';
import {
  KanbanQuote, ServicioSolicitado, ConceptoCotizacion, CotizacionProveedor,
} from '../components/quotes/QuotesData';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function cp(p: Partial<CotizacionProveedor> & { id: string; monto: number; proveedor: string }): CotizacionProveedor {
  return { contacto: '', moneda: 'USD', seleccionada: false, ...p } as CotizacionProveedor;
}
function concepto(p: Partial<ConceptoCotizacion> & { id: string; nombre: string }): ConceptoCotizacion {
  return { costo: 0, profit: 0, venta: 0, margen: 0, subconceptos: [], tarifas: [], proveedoresOficialIds: [], ...p } as ConceptoCotizacion;
}
function quote(conceptos: ConceptoCotizacion[]): KanbanQuote {
  return {
    id: 'COT-1', etapa: 'cotizaciones_recibidas',
    prospecto: { empresa: 'Alfa', contacto: 'A', telefono: '', email: '', origen: 'web' },
    vendedorId: 'v', pricingId: 'p',
    servicios: [{
      id: 'srv-1', tipo: 'maritimo', ruta: { origen: 'Shanghai', destino: 'Manzanillo' },
      incoterm: 'FOB', mercancia: 'General', peso: 0, volumen: 0, estado: 'cotizado',
      cotizacionesProveedor: [], profit: 0, recargosPct: 0, conceptos,
    } as ServicioSolicitado],
    valorTotalConsolidado: 0, moneda: 'USD', estadoFinal: null, motivoPerdida: null,
    createdAt: '', updatedAt: '', historialEtapas: [], actividades: [], chat: [],
  } as KanbanQuote;
}

/** El escenario de Gabi: tres agentes, mismos conceptos. */
const COMPARATIVA = quote([
  concepto({
    id: 'c1', nombre: 'Flete internacional', conceptoId: 'CON-1',
    tarifas: [
      cp({ id: 't1', monto: 1500, proveedor: 'Sunway', proveedorId: 'PRV-S' }),
      cp({ id: 't2', monto: 1600, proveedor: 'BrandNew', proveedorId: 'PRV-B' }),
      cp({ id: 't3', monto: 1450, proveedor: 'BoardCargo', proveedorId: 'PRV-C' }),
    ],
  }),
  concepto({
    id: 'c2', nombre: 'Maniobras origen', conceptoId: 'CON-2',
    tarifas: [
      cp({ id: 't4', monto: 200, proveedor: 'Sunway', proveedorId: 'PRV-S' }),
      cp({ id: 't5', monto: 180, proveedor: 'BrandNew', proveedorId: 'PRV-B' }),
      cp({ id: 't6', monto: 220, proveedor: 'BoardCargo', proveedorId: 'PRV-C' }),
    ],
  }),
  concepto({
    id: 'c3', nombre: 'Documentación', conceptoId: 'CON-3',
    tarifas: [
      cp({ id: 't7', monto: 100, proveedor: 'Sunway', proveedorId: 'PRV-S' }),
      cp({ id: 't8', monto: 120, proveedor: 'BrandNew', proveedorId: 'PRV-B' }),
      cp({ id: 't9', monto: 90, proveedor: 'BoardCargo', proveedorId: 'PRV-C' }),
    ],
  }),
]);

// ─────────────────────────────────────────────────────────────────────────────
describe('el pivote', () => {
  it('conceptos en filas, agentes en columnas', () => {
    const m = construirMatriz(COMPARATIVA);
    expect(m.filas.map(f => f.etiqueta))
      .toEqual(['Flete internacional', 'Maniobras origen', 'Documentación']);
    expect(m.agentes.map(a => a.nombre)).toEqual(['Sunway', 'BrandNew', 'BoardCargo']);
  });

  it('cada celda trae el precio de ese concepto con ese agente', () => {
    const m = construirMatriz(COMPARATIVA);
    expect(m.filas[0].celdas['PRV-S']).toBe(1500);
    expect(m.filas[0].celdas['PRV-C']).toBe(1450);
    expect(m.filas[1].celdas['PRV-B']).toBe(180);
  });

  it('un agente sin id de catálogo cae en la misma columna por nombre', () => {
    // Es el caso de los «probables proveedores»: sin id, pero el mismo nombre
    // en dos conceptos tiene que ser una sola columna.
    const q = quote([
      concepto({ id: 'a', nombre: 'Flete', tarifas: [cp({ id: 'x', monto: 100, proveedor: 'Naviera Nueva' })] }),
      concepto({ id: 'b', nombre: 'Maniobras', tarifas: [cp({ id: 'y', monto: 50, proveedor: 'naviera nueva' })] }),
    ]);
    const m = construirMatriz(q);
    expect(m.agentes).toHaveLength(1);
    expect(totalDeAgente(m.filas, m.agentes[0].id)).toBe(150);
  });

  it('una celda vacía es «no cotizó», no «cotizó cero»', () => {
    const q = quote([
      concepto({ id: 'a', nombre: 'Flete', tarifas: [
        cp({ id: 'x', monto: 100, proveedor: 'A', proveedorId: 'P-A' }),
        cp({ id: 'y', monto: 120, proveedor: 'B', proveedorId: 'P-B' }),
      ]}),
      concepto({ id: 'b', nombre: 'Extra', tarifas: [
        cp({ id: 'z', monto: 30, proveedor: 'A', proveedorId: 'P-A' }),
      ]}),
    ]);
    const m = construirMatriz(q);
    expect(m.filas[1].celdas['P-B']).toBeUndefined();
  });

  it('los agentes agregados sin precio se conservan como columna', () => {
    const guardado: AgenteColumna = {
      id: 'PRV-Z', proveedorId: 'PRV-Z', nombre: 'Zeta', vigencia: null, orden: 0,
    };
    const m = construirMatriz(COMPARATIVA, [guardado]);
    expect(m.agentes.map(a => a.nombre)).toContain('Zeta');
    expect(m.totales['PRV-Z']).toBe(0);
  });

  it('no muta la cotización', () => {
    const copia = JSON.parse(JSON.stringify(COMPARATIVA));
    construirMatriz(COMPARATIVA);
    expect(COMPARATIVA).toEqual(copia);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('el total: solo suma dinero', () => {
  it('suma las filas de importe del agente', () => {
    const m = construirMatriz(COMPARATIVA);
    expect(m.totales['PRV-S']).toBe(1800);   // 1500 + 200 + 100
    expect(m.totales['PRV-B']).toBe(1900);
    expect(m.totales['PRV-C']).toBe(1760);
  });

  it('una fila de FECHA no suma', () => {
    // Es el bug del sistema de referencia: floatval("2026-09-15") = 2026.
    const filas: FilaMatriz[] = [
      { id: 'f1', etiqueta: 'Flete', tipo: 'importe', conceptoId: null, servicioId: 's', celdas: { a: 1500 } },
      { id: 'f2', etiqueta: 'Validez', tipo: 'fecha', conceptoId: null, servicioId: 's', celdas: { a: 2026 } },
    ];
    expect(totalDeAgente(filas, 'a')).toBe(1500);
  });

  it('una fila de DATO tampoco: los días de tránsito no son dinero', () => {
    const filas: FilaMatriz[] = [
      { id: 'f1', etiqueta: 'Flete', tipo: 'importe', conceptoId: null, servicioId: 's', celdas: { a: 1500 } },
      { id: 'f2', etiqueta: 'Días de tránsito', tipo: 'dato', conceptoId: null, servicioId: 's', celdas: { a: 28 } },
    ];
    expect(totalDeAgente(filas, 'a')).toBe(1500);
  });

  it('el que DECLARA su validez no sale más caro que el que la deja vacía', () => {
    // La inversión de ganador del sistema de referencia: quien fue diligente
    // cargaba 2026 fantasma y perdía la comparación.
    const filas: FilaMatriz[] = [
      { id: 'f1', etiqueta: 'Flete', tipo: 'importe', conceptoId: null, servicioId: 's', celdas: { diligente: 1500, omiso: 1600 } },
      { id: 'f2', etiqueta: 'Validez', tipo: 'fecha', conceptoId: null, servicioId: 's', celdas: { diligente: 2026, omiso: null } },
    ];
    const totales = calcularTotales(filas, [
      { id: 'diligente', proveedorId: null, nombre: 'D', vigencia: null, orden: 0 },
      { id: 'omiso', proveedorId: null, nombre: 'O', vigencia: null, orden: 1 },
    ]);
    expect(agenteConMenorTotal(totales)).toBe('diligente');
  });

  it('redondea a dos decimales sin arrastrar punto flotante', () => {
    const filas: FilaMatriz[] = [
      { id: 'a', etiqueta: 'A', tipo: 'importe', conceptoId: null, servicioId: 's', celdas: { x: 0.1 } },
      { id: 'b', etiqueta: 'B', tipo: 'importe', conceptoId: null, servicioId: 's', celdas: { x: 0.2 } },
    ];
    expect(totalDeAgente(filas, 'x')).toBe(0.3);
  });
});

describe('el menor', () => {
  it('marca el total más bajo', () => {
    expect(construirMatriz(COMPARATIVA).agenteMenorId).toBe('PRV-C');
  });

  it('IGNORA a los agentes en cero: no cotizar no es ser barato', () => {
    const conVacio = construirMatriz(COMPARATIVA, [
      { id: 'PRV-Z', proveedorId: 'PRV-Z', nombre: 'Zeta', vigencia: null, orden: 9 },
    ]);
    expect(conVacio.agenteMenorId).toBe('PRV-C');
  });

  it('sin ningún precio no hay menor', () => {
    expect(agenteConMenorTotal({ a: 0, b: 0 })).toBeNull();
    expect(agenteConMenorTotal({})).toBeNull();
  });

  it('en empate gana el primero, que se agregó antes', () => {
    expect(agenteConMenorTotal({ a: 100, b: 100 })).toBe('a');
  });
});

describe('paquetes incompletos: la trampa de comparar totales', () => {
  it('detecta al agente que no cotizó todos los conceptos', () => {
    // Comparar un paquete de 3 contra uno de 1 no es comparar: el segundo sale
    // «más barato» por no haber cotizado todo.
    const q = quote([
      concepto({ id: 'a', nombre: 'Flete', tarifas: [
        cp({ id: 'x', monto: 1500, proveedor: 'Completo', proveedorId: 'P-1' }),
        cp({ id: 'y', monto: 900, proveedor: 'Parcial', proveedorId: 'P-2' }),
      ]}),
      concepto({ id: 'b', nombre: 'Maniobras', tarifas: [
        cp({ id: 'z', monto: 200, proveedor: 'Completo', proveedorId: 'P-1' }),
      ]}),
    ]);
    const m = construirMatriz(q);
    expect(m.agenteMenorId).toBe('P-2');  // sale más barato…

    const incompletos = agentesIncompletos(m);
    expect(incompletos.map(i => i.nombre)).toEqual(['Parcial']);  // …pero se avisa
    expect(incompletos[0].cotizados).toBe(1);
  });

  it('un agente completo no se reporta', () => {
    expect(agentesIncompletos(construirMatriz(COMPARATIVA))).toEqual([]);
  });

  it('conceptosCotizados cuenta solo los de importe con precio', () => {
    expect(conceptosCotizados(construirMatriz(COMPARATIVA).filas, 'PRV-S')).toBe(3);
  });
});

describe('la fila de vigencia', () => {
  it('es de tipo fecha, así que nunca suma', () => {
    expect(filaVigencia([]).tipo).toBe('fecha');
  });

  it('se llama «Validez», como en el sistema que conocen', () => {
    expect(filaVigencia([]).etiqueta).toBe('Validez');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('escribir en una celda', () => {
  const sunway: AgenteColumna = {
    id: 'PRV-S', proveedorId: 'PRV-S', nombre: 'Sunway', vigencia: null, orden: 0,
  };

  it('actualiza la tarifa existente', () => {
    const q = escribirCelda(COMPARATIVA, 'srv-1::c1', sunway, 1400);
    expect(construirMatriz(q).filas[0].celdas['PRV-S']).toBe(1400);
  });

  it('crea la tarifa si el agente no había cotizado ese concepto', () => {
    const nuevo: AgenteColumna = {
      id: 'PRV-Z', proveedorId: 'PRV-Z', nombre: 'Zeta', vigencia: null, orden: 3,
    };
    const q = escribirCelda(COMPARATIVA, 'srv-1::c2', nuevo, 175);
    const m = construirMatriz(q);
    expect(m.filas[1].celdas['PRV-Z']).toBe(175);
    expect(m.agentes.map(a => a.nombre)).toContain('Zeta');
  });

  it('null borra la tarifa: vaciar la celda no es cotizar cero', () => {
    const q = escribirCelda(COMPARATIVA, 'srv-1::c1', sunway, null);
    expect(construirMatriz(q).filas[0].celdas['PRV-S']).toBeUndefined();
    expect(construirMatriz(q).totales['PRV-S']).toBe(300);  // 200 + 100
  });

  it('borrar la tarifa oficial la quita de proveedoresOficialIds', () => {
    const elegida = elegirAgente(COMPARATIVA, 'PRV-S');
    const q = escribirCelda(elegida, 'srv-1::c1', sunway, null);
    const c1 = q.servicios[0].conceptos[0];
    expect(c1.proveedoresOficialIds).toEqual([]);
  });

  it('no muta la cotización original', () => {
    const copia = JSON.parse(JSON.stringify(COMPARATIVA));
    escribirCelda(COMPARATIVA, 'srv-1::c1', sunway, 9999);
    expect(COMPARATIVA).toEqual(copia);
  });

  it('una fila inexistente no altera nada', () => {
    const q = escribirCelda(COMPARATIVA, 'srv-1::no-existe', sunway, 500);
    expect(construirMatriz(q).totales).toEqual(construirMatriz(COMPARATIVA).totales);
  });
});

describe('quitar una columna', () => {
  it('elimina las tarifas de ese agente en todos los conceptos', () => {
    const q = quitarAgenteDeCotizacion(COMPARATIVA, 'PRV-B');
    const m = construirMatriz(q);
    expect(m.agentes.map(a => a.nombre)).toEqual(['Sunway', 'BoardCargo']);
    expect(m.totales['PRV-B']).toBeUndefined();
  });

  it('los demás agentes conservan sus precios intactos', () => {
    const antes = construirMatriz(COMPARATIVA).totales;
    const m = construirMatriz(quitarAgenteDeCotizacion(COMPARATIVA, 'PRV-B'));
    expect(m.totales['PRV-S']).toBe(antes['PRV-S']);
    expect(m.totales['PRV-C']).toBe(antes['PRV-C']);
  });

  it('quitar un agente inexistente no cambia nada', () => {
    const q = quitarAgenteDeCotizacion(COMPARATIVA, 'no-existe');
    expect(construirMatriz(q).totales).toEqual(construirMatriz(COMPARATIVA).totales);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('de la comparativa a las líneas', () => {
  it('propone una línea por concepto cotizado', () => {
    const m = construirMatriz(COMPARATIVA);
    const props = lineasDesdeAgente(m, 'PRV-S');
    expect(props.map(p => p.etiqueta))
      .toEqual(['Flete internacional', 'Maniobras origen', 'Documentación']);
    expect(props.map(p => p.costo)).toEqual([1500, 200, 100]);
  });

  it('INVARIANTE: la suma de las líneas propuestas es el total de la columna', () => {
    const m = construirMatriz(COMPARATIVA);
    m.agentes.forEach(a => {
      const suma = lineasDesdeAgente(m, a.id).reduce((n, l) => n + l.costo, 0);
      expect(suma).toBeCloseTo(m.totales[a.id], 2);
    });
  });

  it('omite los conceptos que ese agente no cotizó', () => {
    const q = quote([
      concepto({ id: 'a', nombre: 'Flete', tarifas: [cp({ id: 'x', monto: 100, proveedor: 'A', proveedorId: 'P-A' })] }),
      concepto({ id: 'b', nombre: 'Extra', tarifas: [] }),
    ]);
    expect(lineasDesdeAgente(construirMatriz(q), 'P-A')).toHaveLength(1);
  });

  it('avisa qué conceptos quedarían sin costo', () => {
    const q = quote([
      concepto({ id: 'a', nombre: 'Flete', tarifas: [cp({ id: 'x', monto: 100, proveedor: 'A', proveedorId: 'P-A' })] }),
      concepto({ id: 'b', nombre: 'Seguro', tarifas: [] }),
    ]);
    expect(conceptosSinCotizar(construirMatriz(q), 'P-A')).toEqual(['Seguro']);
  });

  it('NO elige el agente por su cuenta: se le pasa cuál', () => {
    // «Aunque sea la más barata no siempre la tomamos, por los detalles:
    // tiempo de tránsito, free time, o el cliente que no quiere cierto
    // proveedor.» Si cargara siempre el menor, comparar sería decorativo.
    const m = construirMatriz(COMPARATIVA);
    expect(m.agenteMenorId).toBe('PRV-C');
    const props = lineasDesdeAgente(m, 'PRV-S');
    expect(props[0].costo).toBe(1500);
  });
});

describe('elegir agente', () => {
  it('sus tarifas pasan a ser las oficiales de cada concepto', () => {
    const q = elegirAgente(COMPARATIVA, 'PRV-C');
    q.servicios[0].conceptos.forEach(c => {
      const oficial = c.tarifas.find(t => t.id === c.proveedoresOficialIds?.[0]);
      expect(oficial?.proveedor).toBe('BoardCargo');
    });
  });

  it('INVARIANTE: elegir hace que el costo de las líneas sea el total de la columna', () => {
    // Es lo que sostiene que la matriz y la tabla no puedan desincronizarse.
    const m = construirMatriz(COMPARATIVA);
    m.agentes.forEach(a => {
      const q = elegirAgente(COMPARATIVA, a.id);
      const costoLineas = aplanarCotizacion(q).reduce((n, l) => n + l.costo, 0);
      expect(costoLineas).toBeCloseTo(m.totales[a.id], 2);
    });
  });

  it('deja marcada como seleccionada solo la del agente elegido', () => {
    const q = elegirAgente(COMPARATIVA, 'PRV-B');
    const c1 = q.servicios[0].conceptos[0];
    expect(c1.tarifas.filter(t => t.seleccionada).map(t => t.proveedor)).toEqual(['BrandNew']);
  });

  it('cambiar de agente reemplaza la elección anterior', () => {
    const q = elegirAgente(elegirAgente(COMPARATIVA, 'PRV-S'), 'PRV-C');
    const c1 = q.servicios[0].conceptos[0];
    expect(c1.proveedoresOficialIds).toHaveLength(1);
    expect(c1.tarifas.find(t => t.id === c1.proveedoresOficialIds![0])?.proveedor).toBe('BoardCargo');
  });

  it('no muta la cotización original', () => {
    const copia = JSON.parse(JSON.stringify(COMPARATIVA));
    elegirAgente(COMPARATIVA, 'PRV-C');
    expect(COMPARATIVA).toEqual(copia);
  });
});

describe('conceptos por plantilla', () => {
  it('FCL, terrestre y default traen sus propios conceptos', () => {
    expect(CONCEPTOS_POR_PLANTILLA.FCL.map(c => c.etiqueta)).toContain('BL Fee');
    expect(CONCEPTOS_POR_PLANTILLA.terrestre.map(c => c.etiqueta)).toContain('Maniobra origen');
    expect(CONCEPTOS_POR_PLANTILLA.default.map(c => c.etiqueta)).toContain('Gastos de origen');
  });

  it('«Días de tránsito» es DATO, no importe', () => {
    const dt = CONCEPTOS_POR_PLANTILLA.default.find(c => c.clave === 'dias_transito');
    expect(dt?.tipo).toBe('dato');
  });

  it('«Validez» ya NO es un concepto: es propiedad de la columna', () => {
    Object.values(CONCEPTOS_POR_PLANTILLA).forEach(lista => {
      expect(lista.map(c => c.clave)).not.toContain('validez');
    });
  });

  it('todo lo demás es importe', () => {
    const noImporte = Object.values(CONCEPTOS_POR_PLANTILLA)
      .flat().filter(c => c.tipo !== 'importe');
    expect(noImporte.map(c => c.clave)).toEqual(['dias_transito']);
  });
});

describe('claveAgente', () => {
  it('prefiere el id del catálogo', () => {
    expect(claveAgente({ proveedorId: 'PRV-1', proveedor: 'Sunway' })).toBe('PRV-1');
  });

  it('sin id cae al nombre normalizado', () => {
    expect(claveAgente({ proveedorId: null, proveedor: 'Sunway Logistics' }))
      .toBe(claveAgente({ proveedorId: null, proveedor: '  SUNWAY LOGISTICS  ' }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Una matriz POR SERVICIO.
//
// Pricing pide la misma ruta a varios proveedores. Un agente marítimo no
// compite contra un transportista terrestre: mezclarlos produce una matriz
// llena de huecos y un total que compara peras con manzanas.
// ─────────────────────────────────────────────────────────────────────────────
describe('matriz por servicio', () => {
  const multimodal: KanbanQuote = {
    ...quote([]),
    servicios: [
      {
        id: 'srv-mar', tipo: 'maritimo', ruta: { origen: 'Shanghai', destino: 'Manzanillo' },
        incoterm: 'FOB', mercancia: 'G', peso: 0, volumen: 0, estado: 'cotizado',
        cotizacionesProveedor: [], profit: 0, recargosPct: 0,
        conceptos: [concepto({
          id: 'cm', nombre: 'Flete marítimo', tarifas: [
            cp({ id: 'm1', monto: 1500, proveedor: 'Maersk', proveedorId: 'PRV-M' }),
            cp({ id: 'm2', monto: 1400, proveedor: 'Hapag', proveedorId: 'PRV-H' }),
          ],
        })],
      } as ServicioSolicitado,
      {
        id: 'srv-ter', tipo: 'terrestre', ruta: { origen: 'Manzanillo', destino: 'Querétaro' },
        incoterm: 'DAP', mercancia: 'G', peso: 0, volumen: 0, estado: 'cotizado',
        cotizacionesProveedor: [], profit: 0, recargosPct: 0,
        conceptos: [concepto({
          id: 'ct', nombre: 'Acarreo', tarifas: [
            cp({ id: 't1', monto: 400, proveedor: 'Transportes Y', proveedorId: 'PRV-T' }),
          ],
        })],
      } as ServicioSolicitado,
    ],
  };

  it('cada servicio tiene su propia matriz con sus propios agentes', () => {
    const ms = matricesPorServicio(multimodal);
    expect(ms).toHaveLength(2);
    expect(ms[0].matriz.agentes.map(a => a.nombre)).toEqual(['Maersk', 'Hapag']);
    expect(ms[1].matriz.agentes.map(a => a.nombre)).toEqual(['Transportes Y']);
  });

  it('los agentes de un servicio NO aparecen en el otro', () => {
    const ms = matricesPorServicio(multimodal);
    expect(ms[0].matriz.agentes.map(a => a.id)).not.toContain('PRV-T');
    expect(ms[1].matriz.agentes.map(a => a.id)).not.toContain('PRV-M');
  });

  it('cada matriz totaliza y elige su propio menor', () => {
    const ms = matricesPorServicio(multimodal);
    expect(ms[0].matriz.agenteMenorId).toBe('PRV-H');  // 1400 < 1500
    expect(ms[1].matriz.agenteMenorId).toBe('PRV-T');
  });

  it('sin servicioId toma todo: solo tiene sentido con un único servicio', () => {
    const todo = construirMatriz(multimodal);
    expect(todo.agentes).toHaveLength(3);
    expect(todo.filas).toHaveLength(2);
  });

  it('filtrar por servicio deja solo sus filas', () => {
    const m = construirMatriz(multimodal, [], 'srv-ter');
    expect(m.filas.map(f => f.etiqueta)).toEqual(['Acarreo']);
  });

  it('un servicio sin conceptos da una matriz vacía, no revienta', () => {
    const vacio = { ...multimodal, servicios: [{ ...multimodal.servicios[0], conceptos: [] }] };
    const m = construirMatriz(vacio as KanbanQuote, [], 'srv-mar');
    expect(m.filas).toEqual([]);
    expect(m.agenteMenorId).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Nada de lo que se escribe puede llevar `undefined`.
//
// Firestore lo rechaza con «Unsupported field value» y tumba la escritura
// ENTERA de la cotización. El fallo era invisible: la promesa se rechazaba,
// nadie la atrapaba, el estado de React ya se había actualizado —así que en
// pantalla parecía guardado— y al recargar el trabajo no estaba.
// ─────────────────────────────────────────────────────────────────────────────
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

  const agente: AgenteColumna = {
    id: 'PRV-N', proveedorId: 'PRV-N', nombre: 'Nuevo', vigencia: null, orden: 5,
  };

  it('crear una tarifa desde una celda no deja undefined', () => {
    const q = escribirCelda(COMPARATIVA, 'srv-1::c1', agente, 1000);
    expect(sinUndefined(q)).toEqual([]);
  });

  it('tampoco con vigencia puesta', () => {
    const q = escribirCelda(COMPARATIVA, 'srv-1::c1', { ...agente, vigencia: '2026-09-15' }, 1000);
    expect(sinUndefined(q)).toEqual([]);
  });

  it('borrar una celda no deja undefined', () => {
    const q = escribirCelda(COMPARATIVA, 'srv-1::c1',
      { id: 'PRV-S', proveedorId: 'PRV-S', nombre: 'Sunway', vigencia: null, orden: 0 }, null);
    expect(sinUndefined(q)).toEqual([]);
  });

  it('elegir agente no deja undefined', () => {
    expect(sinUndefined(elegirAgente(COMPARATIVA, 'PRV-C'))).toEqual([]);
  });

  it('quitar una columna no deja undefined', () => {
    expect(sinUndefined(quitarAgenteDeCotizacion(COMPARATIVA, 'PRV-B'))).toEqual([]);
  });
});
