/**
 * seleccionMatriz.test.ts
 *
 * M-1 · La selección por celda: el caso B (un proveedor por concepto) sin
 * perder el caso A (columna completa).
 *
 * Lo que protegen: la elección escribe en concepto.tarifas — el mismo dato
 * del que se derivan el total, la prontitud y los cargos del embarque. Una
 * celda mal elegida es un proveedor mal pagado.
 */

import { describe, it, expect } from 'vitest';
import {
  elegirCelda, derivarSeleccion, agenteDominante, menorPorFila, resumenSeleccion,
} from './seleccionMatriz';
import { construirMatriz, elegirAgente } from './matrizComparativa';
import { costoDeConcepto } from '../components/quotes/QuotesData';
import type {
  KanbanQuote, ServicioSolicitado, ConceptoCotizacion, CotizacionProveedor,
} from '../components/quotes/QuotesData';

// ─── Fixtures: 3 conceptos × 2 agentes, el caso de Gabi en chico ─────────────

function tarifa(p: Partial<CotizacionProveedor> & { id: string; monto: number; proveedorId: string }): CotizacionProveedor {
  return { proveedor: p.proveedorId, contacto: '', moneda: 'USD', seleccionada: false, ...p } as CotizacionProveedor;
}

function concepto(id: string, nombre: string, tarifas: CotizacionProveedor[]): ConceptoCotizacion {
  return {
    id, nombre, costo: 0, profit: 100, venta: 0, margen: 0,
    subconceptos: [], tarifas, proveedoresOficialIds: [],
  } as unknown as ConceptoCotizacion;
}

const SUNWAY = 'PRV-SUN';
const TERMINAL = 'PRV-TER';

function armarQuote(): KanbanQuote {
  const servicio: ServicioSolicitado = {
    id: 'srv-1', tipo: 'maritimo',
    ruta: { origen: 'Shanghai', destino: 'Manzanillo' },
    incoterm: 'FOB', mercancia: 'x', peso: 1, volumen: 1, estado: 'cotizado',
    cotizacionesProveedor: [], profit: 0, recargosPct: 0,
    conceptos: [
      concepto('c-flete', 'Flete internacional', [
        tarifa({ id: 't-f-sun', monto: 1500, proveedorId: SUNWAY }),
        tarifa({ id: 't-f-ter', monto: 1450, proveedorId: TERMINAL }),
      ]),
      concepto('c-maniobras', 'Maniobras', [
        tarifa({ id: 't-m-sun', monto: 200, proveedorId: SUNWAY }),
        tarifa({ id: 't-m-ter', monto: 180, proveedorId: TERMINAL }),
      ]),
      concepto('c-despacho', 'Despacho', [
        tarifa({ id: 't-d-sun', monto: 300, proveedorId: SUNWAY }),
        // La terminal NO cotiza el despacho: celda vacía.
      ]),
    ],
  } as unknown as ServicioSolicitado;

  return {
    id: 'COT-1', etapa: 'cotizaciones_recibidas', servicios: [servicio],
    prospecto: { empresa: 'A' }, moneda: 'USD',
    historialEtapas: [], actividades: [], chat: [],
  } as unknown as KanbanQuote;
}

const matrizDe = (q: KanbanQuote) => construirMatriz(q, [], 'srv-1');

// ─── A · Elegir y des-elegir ─────────────────────────────────────────────────

describe('A · elegirCelda', () => {
  it('marca la tarifa de ese agente como la elegida del concepto', () => {
    const q = elegirCelda(armarQuote(), 'srv-1', 'c-maniobras', TERMINAL);
    const c = q.servicios[0].conceptos!.find(x => x.id === 'c-maniobras')!;
    expect(c.proveedoresOficialIds).toEqual(['t-m-ter']);
    expect(c.tarifas!.find(t => t.id === 't-m-ter')!.seleccionada).toBe(true);
    expect(c.tarifas!.find(t => t.id === 't-m-sun')!.seleccionada).toBe(false);
  });

  it('el costo del concepto pasa a ser el de la celda: la cadena hereda sola', () => {
    const q = elegirCelda(armarQuote(), 'srv-1', 'c-maniobras', TERMINAL);
    expect(costoDeConcepto(q.servicios[0].conceptos!.find(x => x.id === 'c-maniobras')!)).toBe(180);
  });

  it('clic repetido DES-elige: volver a sin proveedor es una decisión', () => {
    let q = elegirCelda(armarQuote(), 'srv-1', 'c-maniobras', TERMINAL);
    q = elegirCelda(q, 'srv-1', 'c-maniobras', TERMINAL);
    const c = q.servicios[0].conceptos!.find(x => x.id === 'c-maniobras')!;
    expect(c.proveedoresOficialIds).toEqual([]);
    expect(c.tarifas!.every(t => !t.seleccionada)).toBe(true);
  });

  it('un agente que no cotizó esa fila no es elegible', () => {
    const q = elegirCelda(armarQuote(), 'srv-1', 'c-despacho', TERMINAL);
    expect(q.servicios[0].conceptos!.find(x => x.id === 'c-despacho')!.proveedoresOficialIds).toEqual([]);
  });

  it('cambiar de agente en la misma fila reemplaza, no acumula', () => {
    let q = elegirCelda(armarQuote(), 'srv-1', 'c-flete', SUNWAY);
    q = elegirCelda(q, 'srv-1', 'c-flete', TERMINAL);
    const c = q.servicios[0].conceptos!.find(x => x.id === 'c-flete')!;
    expect(c.proveedoresOficialIds).toEqual(['t-f-ter']);
  });
});

// ─── B · Los dos casos y el combinado ────────────────────────────────────────

describe('B · caso A, caso B y la mezcla', () => {
  it('CASO A: elegir columna marca todas las filas de ese agente', () => {
    const q = elegirAgente(armarQuote(), SUNWAY);
    const sel = derivarSeleccion(matrizDe(q), q);
    expect(sel.porFila).toEqual({
      'srv-1::c-flete': SUNWAY, 'srv-1::c-maniobras': SUNWAY, 'srv-1::c-despacho': SUNWAY,
    });
  });

  it('CASO B: cada fila con un proveedor distinto', () => {
    let q = elegirCelda(armarQuote(), 'srv-1', 'c-flete', SUNWAY);
    q = elegirCelda(q, 'srv-1', 'c-maniobras', TERMINAL);
    const sel = derivarSeleccion(matrizDe(q), q);
    expect(sel.porFila['srv-1::c-flete']).toBe(SUNWAY);
    expect(sel.porFila['srv-1::c-maniobras']).toBe(TERMINAL);
    expect(sel.porFila['srv-1::c-despacho']).toBeNull();
  });

  it('COMBINADO: columna de Sunway y después la fila de maniobras a la terminal', () => {
    let q = elegirAgente(armarQuote(), SUNWAY);
    q = elegirCelda(q, 'srv-1', 'c-maniobras', TERMINAL);
    const sel = derivarSeleccion(matrizDe(q), q);
    expect(sel.porFila['srv-1::c-flete']).toBe(SUNWAY);
    expect(sel.porFila['srv-1::c-maniobras']).toBe(TERMINAL);
    // Y la excepción se distingue: Sunway domina, maniobras se salió del paquete.
    expect(agenteDominante(sel)).toBe(SUNWAY);
  });

  it('elección pareja: sin mayoría no hay dominante ni excepciones', () => {
    let q = elegirCelda(armarQuote(), 'srv-1', 'c-flete', SUNWAY);
    q = elegirCelda(q, 'srv-1', 'c-maniobras', TERMINAL);
    expect(agenteDominante(derivarSeleccion(matrizDe(q), q))).toBeNull();
  });

  it('la selección se deriva de los datos: sobrevive a reconstruir la matriz', () => {
    const q = elegirCelda(armarQuote(), 'srv-1', 'c-flete', TERMINAL);
    // Matriz nueva desde cero (como tras recargar): la selección sigue ahí.
    expect(derivarSeleccion(construirMatriz(q, [], 'srv-1'), q).porFila['srv-1::c-flete']).toBe(TERMINAL);
  });
});

// ─── C · El menor por fila ───────────────────────────────────────────────────

describe('C · menorPorFila', () => {
  it('marca el más barato de cada fila', () => {
    const m = menorPorFila(matrizDe(armarQuote()));
    expect(m['srv-1::c-flete']).toBe(TERMINAL);      // 1450 < 1500
    expect(m['srv-1::c-maniobras']).toBe(TERMINAL);  // 180 < 200
  });

  it('sin rival no hay menor: una sola celda con precio no gana nada', () => {
    expect(menorPorFila(matrizDe(armarQuote()))['srv-1::c-despacho']).toBeNull();
  });

  it('monedas distintas en la fila: no se compara sin tipo de cambio', () => {
    const q = armarQuote();
    q.servicios[0].conceptos!.find(c => c.id === 'c-flete')!
      .tarifas!.find(t => t.id === 't-f-ter')!.moneda = 'MXN';
    expect(menorPorFila(matrizDe(q))['srv-1::c-flete']).toBeNull();
  });
});

// ─── D · El resumen del encabezado ───────────────────────────────────────────

describe('D · resumenSeleccion', () => {
  it('un solo agente: «Sunway · total»', () => {
    const q = elegirAgente(armarQuote(), SUNWAY);
    const r = resumenSeleccion(matrizDe(q), derivarSeleccion(matrizDe(q), q), 'USD', null);
    expect(r.etiqueta).toEqual({ tipo: 'unico', agenteId: SUNWAY });
    expect(r.total.porMoneda.USD).toBe(2000);   // 1500 + 200 + 300
    expect(r.sinElegir).toBe(0);
  });

  it('repartido: «2 proveedores» y cuenta las filas sin elegir', () => {
    let q = elegirCelda(armarQuote(), 'srv-1', 'c-flete', SUNWAY);
    q = elegirCelda(q, 'srv-1', 'c-maniobras', TERMINAL);
    const r = resumenSeleccion(matrizDe(q), derivarSeleccion(matrizDe(q), q), 'USD', null);
    expect(r.etiqueta).toEqual({ tipo: 'mixto', cuantos: 2 });
    expect(r.sinElegir).toBe(1);                // el despacho sigue sin elegir
    expect(r.total.porMoneda.USD).toBe(1680);   // 1500 + 180
  });

  it('celdas elegidas en monedas mixtas: total POR MONEDA, equivalente solo con tasa', () => {
    const q0 = armarQuote();
    q0.servicios[0].conceptos!.find(c => c.id === 'c-maniobras')!
      .tarifas!.find(t => t.id === 't-m-ter')!.moneda = 'MXN';
    let q = elegirCelda(q0, 'srv-1', 'c-flete', SUNWAY);
    q = elegirCelda(q, 'srv-1', 'c-maniobras', TERMINAL);

    const sinTasa = resumenSeleccion(matrizDe(q), derivarSeleccion(matrizDe(q), q), 'USD', null);
    expect(sinTasa.total.porMoneda).toEqual({ USD: 1500, MXN: 180 });
    expect(sinTasa.total.equivalente).toBeNull();  // sin tasa NO se inventa
  });

  it('nada elegido: etiqueta null y todo en sinElegir', () => {
    const q = armarQuote();
    const r = resumenSeleccion(matrizDe(q), derivarSeleccion(matrizDe(q), q), 'USD', null);
    expect(r.etiqueta).toBeNull();
    expect(r.sinElegir).toBe(3);
  });
});
