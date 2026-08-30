/**
 * lineasCotizacion.ts
 *
 * Adaptador entre el modelo anidado de la cotización y la vista de TABLA PLANA
 * que pidió el cliente (la que Luis desarrolló en el sistema anterior).
 *
 * ── Por qué existe (FC-1) ──────────────────────────────────────────────────
 * El cliente probó la ficha y dijo que «no se entiende»: el árbol
 * servicios → conceptos → cotizacionesProveedor tiene tres niveles y ellos
 * razonan en renglones. Prefieren la tabla plana de `lineas_cotizacion`.
 *
 * En vez de migrar los datos, se presenta plano lo que por debajo sigue
 * anidado. La migración se decidirá cuando el cliente valide la vista; si no
 * convence, se tira esta capa y no se perdió nada en producción.
 *
 * ── La dualidad de §6, que aquí es el corazón del problema ─────────────────
 * Una cotización puede tener sus costos en DOS lugares distintos según por
 * dónde se armó:
 *
 *   Ruta A — FichaCotizacion: servicio.conceptos[].tarifas[]  (con proveedorId)
 *   Ruta B — BandejaPricing:  servicio.cotizacionesProveedor[] (sin proveedorId)
 *
 * `calcularTotalConsolidado` ya resuelve esto, y es importante cómo: si el
 * servicio trae una cotización de proveedor seleccionada (ruta B), la usa y
 * SALTA los conceptos, para no contar dos veces. Este adaptador reproduce esa
 * misma precedencia. Si divergiera, la tabla mostraría totales distintos a los
 * que el Kanban y la Bandeja llevan mostrando, y nadie sabría cuál creer.
 *
 * Lógica pura: sin React ni Firestore.
 */

import {
  KanbanQuote,
  ServicioSolicitado,
  ConceptoCotizacion,
  getCostoOficial,
  getTarifasOficiales,
  costoDeConcepto,
} from '../components/quotes/QuotesData';
import { calcLinea } from './cotizacionCalculator';

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** De qué rama del modelo anidado salió la línea. */
export type OrigenLinea = 'concepto' | 'servicio';

/**
 * Un componente del costo de la línea: a quién se le paga y cuánto.
 *
 * El costo de una línea puede repartirse entre varios proveedores (carga
 * dividida entre terminales, por ejemplo) y sumar subconceptos que no tienen
 * proveedor. Para PAGAR hace falta el desglose, no el agregado.
 *
 * Invariante: la suma de los montos es igual a `LineaPlana.costo`.
 */
export interface CostoLinea {
  id: string;
  /** 'tarifa' = de una tarifa elegida · 'subconcepto' · 'manual' = tecleado. */
  tipo: 'tarifa' | 'subconcepto' | 'manual';
  descripcion: string;
  proveedorId?: string | null;
  proveedorNombre: string;
  monto: number;
  moneda: 'MXN' | 'USD';
  tarifaOrigenId?: string | null;
  /**
   * Vigencia de la tarifa (ISO). La vigencia vencida es fuente de reclamos
   * según el levantamiento, así que viaja hasta el embarque para poder avisar.
   */
  vigencia?: string | null;
}

/**
 * Un renglón de la tabla plana. Equivale a `lineas_cotizacion` del modelo de
 * Luis, más lo que necesitamos para escribir de regreso en el árbol.
 */
export interface LineaPlana {
  /** Estable entre renders y único dentro de la cotización. */
  id: string;

  // ── A dónde pertenece (para el write-back y la columna «Servicio») ───────
  servicioId: string;
  servicioTipo: string;
  origen: OrigenLinea;
  /** id del ConceptoCotizacion. Ausente en líneas de ruta B. */
  conceptoLocalId?: string;

  // ── Columnas visibles ───────────────────────────────────────────────────
  concepto: string;
  /** FK al catálogo conceptos/, para claves SAT. */
  conceptoId?: string | null;
  proveedorId?: string | null;
  proveedorNombre: string;
  costo: number;
  profit: number;
  venta: number;   // derivado: costo + profit
  margen: number;  // derivado: profit / venta (0–1)
  /** Precio objetivo del cliente. Contra qué compite Pricing. */
  target?: number | null;
  orden: number;
  moneda: 'MXN' | 'USD';

  /**
   * true cuando el costo sale de tarifas seleccionadas y/o subconceptos.
   * La UI debe mostrarlo en solo lectura: escribir otro número ahí sería
   * contradecir las tarifas que Pricing eligió. Para cambiarlo se cambian
   * las tarifas.
   */
  costoDerivado: boolean;
  /** Cuántas tarifas oficiales alimentan el costo (0 = capturado a mano). */
  tarifasCount: number;
  /** Trazabilidad a la tarifa del catálogo, cuando hay una sola. */
  tarifaOrigenId?: string | null;

  /**
   * Desglose de a quién se le paga. Suma exactamente `costo`.
   * Es lo que el embarque necesita para generar sus líneas de gasto (E-3).
   */
  costos: CostoLinea[];
}

// ─── Aplanado ─────────────────────────────────────────────────────────────────

function nombreProveedorDeConcepto(concepto: ConceptoCotizacion): {
  proveedorId: string | null;
  proveedorNombre: string;
  tarifaOrigenId: string | null;
} {
  const oficiales = getTarifasOficiales(concepto);
  if (oficiales.length === 0) {
    return { proveedorId: null, proveedorNombre: '', tarifaOrigenId: null };
  }
  if (oficiales.length === 1) {
    const t = oficiales[0];
    return {
      proveedorId: t.proveedorId ?? null,
      proveedorNombre: t.proveedor,
      tarifaOrigenId: t.tarifaOrigenId ?? null,
    };
  }
  // Multi-proveedor: la carga se reparte. Se nombran todos, sin inventar uno.
  return {
    proveedorId: null,
    proveedorNombre: oficiales.map(t => t.proveedor).join(' + '),
    tarifaOrigenId: null,
  };
}

function lineaDesdeConcepto(
  srv: ServicioSolicitado,
  concepto: ConceptoCotizacion,
  indice: number,
): LineaPlana {
  // Mismo helper que usa calcularTotalConsolidado: si divergieran, la tabla y
  // el Kanban mostrarían totales distintos y nadie sabría cuál creer.
  const costo = costoDeConcepto(concepto);
  const costoSubs = concepto.subconceptos?.reduce((acc, s) => acc + s.costo, 0) ?? 0;
  const oficiales = getTarifasOficiales(concepto);
  const { proveedorId, proveedorNombre, tarifaOrigenId } = nombreProveedorDeConcepto(concepto);
  const { venta, margen } = calcLinea(costo, concepto.profit);

  // Desglose: una entrada por tarifa oficial, una por subconcepto, o una sola
  // entrada 'manual' cuando el costo se tecleó sin respaldo de tarifas.
  const costos: CostoLinea[] = [
    ...oficiales.map(t => ({
      id: t.id,
      tipo: 'tarifa' as const,
      descripcion: concepto.nombre,
      proveedorId: t.proveedorId ?? null,
      proveedorNombre: t.proveedor,
      monto: t.monto,
      moneda: t.moneda,
      tarifaOrigenId: t.tarifaOrigenId ?? null,
      vigencia: t.vigencia ?? null,
    })),
    ...(concepto.subconceptos ?? []).map(sc => ({
      id: sc.id,
      tipo: 'subconcepto' as const,
      descripcion: sc.nombre,
      proveedorId: null,
      proveedorNombre: '',
      monto: sc.costo,
      moneda: sc.moneda,
    })),
  ];

  if (costos.length === 0 && costo > 0) {
    costos.push({
      id: `${concepto.id}-manual`,
      tipo: 'manual',
      descripcion: concepto.nombre,
      proveedorId: null,
      proveedorNombre: '',
      monto: costo,
      moneda: 'USD',
    });
  }

  return {
    id: `${srv.id}::${concepto.id}`,
    servicioId: srv.id,
    servicioTipo: srv.tipo,
    origen: 'concepto',
    conceptoLocalId: concepto.id,
    concepto: concepto.nombre,
    conceptoId: concepto.conceptoId ?? null,
    proveedorId,
    proveedorNombre,
    costo,
    profit: concepto.profit,
    venta,
    margen,
    target: null,
    orden: concepto.orden ?? indice,
    moneda: oficiales[0]?.moneda ?? 'USD',
    costoDerivado: oficiales.length > 0 || costoSubs > 0,
    tarifasCount: oficiales.length,
    tarifaOrigenId,
    costos,
  };
}

function lineaDesdeServicio(srv: ServicioSolicitado, indice: number): LineaPlana | null {
  const seleccionada = (srv.cotizacionesProveedor ?? []).find(cp => cp.seleccionada);
  if (!seleccionada) return null;

  const { venta, margen } = calcLinea(seleccionada.monto, srv.profit);

  return {
    id: `${srv.id}::flat`,
    servicioId: srv.id,
    servicioTipo: srv.tipo,
    origen: 'servicio',
    concepto: srv.tipo,
    conceptoId: seleccionada.conceptoId ?? null,
    proveedorId: seleccionada.proveedorId ?? null,
    proveedorNombre: seleccionada.proveedor,
    costo: seleccionada.monto,
    profit: srv.profit,
    venta,
    margen,
    target: null,
    orden: indice,
    moneda: seleccionada.moneda,
    costoDerivado: true,
    tarifasCount: 1,
    tarifaOrigenId: seleccionada.tarifaOrigenId ?? null,
    costos: [{
      id: seleccionada.id,
      tipo: 'tarifa',
      descripcion: srv.tipo,
      proveedorId: seleccionada.proveedorId ?? null,
      proveedorNombre: seleccionada.proveedor,
      monto: seleccionada.monto,
      moneda: seleccionada.moneda,
      tarifaOrigenId: seleccionada.tarifaOrigenId ?? null,
      vigencia: seleccionada.vigencia ?? null,
    }],
  };
}

/**
 * Convierte la cotización anidada en la lista plana de renglones.
 *
 * Precedencia idéntica a `calcularTotalConsolidado`: si el servicio trae una
 * cotización de proveedor seleccionada, esa es LA línea del servicio y sus
 * conceptos no se recorren. Cambiar esto rompe la equivalencia de totales.
 */
export function aplanarCotizacion(quote: KanbanQuote): LineaPlana[] {
  const lineas: LineaPlana[] = [];

  (quote.servicios ?? []).forEach((srv, i) => {
    const desdeServicio = lineaDesdeServicio(srv, i);
    if (desdeServicio) {
      lineas.push(desdeServicio);
      return; // no bajar a conceptos: evita el doble conteo
    }
    (srv.conceptos ?? []).forEach((c, j) => {
      lineas.push(lineaDesdeConcepto(srv, c, j));
    });
  });

  return lineas.sort((a, b) => a.orden - b.orden);
}

/** Suma de ventas. Debe coincidir con `calcularTotalConsolidado`. */
export function totalVenta(lineas: LineaPlana[]): number {
  return Math.round(lineas.reduce((acc, l) => acc + l.venta, 0) * 100) / 100;
}

/** ¿La cotización tiene más de un servicio? Gobierna si se muestra la columna. */
export function tieneVariosServicios(quote: KanbanQuote): boolean {
  return (quote.servicios ?? []).length > 1;
}

// ─── Target ───────────────────────────────────────────────────────────────────

export type ComparacionTarget = 'sobre_target' | 'bajo_target' | 'en_target';

/**
 * Compara la venta calculada contra el precio objetivo del cliente.
 *
 * 'sobre_target' es la señal que importa: estamos cotizando por encima de lo
 * que el cliente dijo que quiere pagar, así que Pricing debería verlo.
 */
export function compararConTarget(linea: LineaPlana): ComparacionTarget | null {
  if (linea.target === null || linea.target === undefined) return null;
  if (linea.venta > linea.target) return 'sobre_target';
  if (linea.venta < linea.target) return 'bajo_target';
  return 'en_target';
}

// ─── Escritura de regreso al árbol ────────────────────────────────────────────

/**
 * Campos que la tabla permite editar. `costo` solo se aplica cuando la línea
 * NO es derivada: si el costo viene de tarifas seleccionadas, escribir otro
 * número sería contradecir lo que Pricing eligió, y la tabla mostraría un
 * costo que no corresponde a ninguna tarifa. Para cambiarlo se cambian las
 * tarifas, desde el panel o la comparativa.
 */
export interface EdicionLinea {
  concepto?: string;
  proveedorId?: string | null;
  proveedorNombre?: string;
  costo?: number;
  profit?: number;
  target?: number | null;
  orden?: number;
}

/**
 * Aplica la edición de UNA línea sobre la cotización anidada.
 *
 * Devuelve una cotización nueva; no muta la original. Si la línea no se
 * encuentra, devuelve la cotización sin cambios en vez de reventar: la tabla
 * puede quedar momentáneamente desfasada de los datos.
 */
export function aplicarEdicionLinea(
  quote: KanbanQuote,
  lineaId: string,
  edicion: EdicionLinea,
): KanbanQuote {
  const lineas = aplanarCotizacion(quote);
  const linea = lineas.find(l => l.id === lineaId);
  if (!linea) return quote;

  const servicios = (quote.servicios ?? []).map(srv => {
    if (srv.id !== linea.servicioId) return srv;

    // ── Ruta B: la línea representa al servicio completo ──────────────────
    if (linea.origen === 'servicio') {
      // Solo el profit vive en el servicio. El costo es el monto que cotizó el
      // proveedor: no se edita a mano desde aquí.
      return edicion.profit === undefined
        ? srv
        : { ...srv, profit: edicion.profit };
    }

    // ── Ruta A: la línea es un concepto ───────────────────────────────────
    return {
      ...srv,
      conceptos: (srv.conceptos ?? []).map(c => {
        if (c.id !== linea.conceptoLocalId) return c;

        const profit = edicion.profit ?? c.profit;
        // El costo solo se acepta en líneas capturadas a mano.
        const costo = linea.costoDerivado ? costoDeConcepto(c) : (edicion.costo ?? c.costo);
        const { venta, margen } = calcLinea(costo, profit);

        return {
          ...c,
          nombre: edicion.concepto ?? c.nombre,
          costo,
          profit,
          venta,
          margen,
          orden: edicion.orden ?? c.orden,
        };
      }),
    };
  });

  return { ...quote, servicios };
}

/**
 * Reordena una línea una posición arriba o abajo.
 *
 * Se decidió con Mau que el reordenamiento va por botones y no por arrastre:
 * el arrastre queda reservado para soltar tarifas sobre la tabla, y dos
 * contextos de arrastre en la misma pantalla se prestan a confusión.
 *
 * Solo tiene sentido entre líneas del MISMO servicio: mover un concepto
 * marítimo entre unos terrestres no significaría nada.
 */
export function reordenarLinea(
  lineas: LineaPlana[],
  lineaId: string,
  direccion: 'arriba' | 'abajo',
): LineaPlana[] {
  const linea = lineas.find(l => l.id === lineaId);
  if (!linea) return lineas;

  const hermanas = lineas
    .filter(l => l.servicioId === linea.servicioId)
    .sort((a, b) => a.orden - b.orden);

  const i = hermanas.findIndex(l => l.id === lineaId);
  const j = direccion === 'arriba' ? i - 1 : i + 1;
  if (j < 0 || j >= hermanas.length) return lineas; // ya está en el extremo

  const ordenA = hermanas[i].orden;
  const ordenB = hermanas[j].orden;

  return lineas.map(l => {
    if (l.id === hermanas[i].id) return { ...l, orden: ordenB };
    if (l.id === hermanas[j].id) return { ...l, orden: ordenA };
    return l;
  }).sort((a, b) => a.orden - b.orden);
}

/** Persiste el orden de las líneas en los conceptos del árbol. */
export function aplicarOrden(quote: KanbanQuote, lineas: LineaPlana[]): KanbanQuote {
  const ordenPorConcepto = new Map<string, number>();
  lineas.forEach(l => {
    if (l.origen === 'concepto' && l.conceptoLocalId) {
      ordenPorConcepto.set(`${l.servicioId}::${l.conceptoLocalId}`, l.orden);
    }
  });

  return {
    ...quote,
    servicios: (quote.servicios ?? []).map(srv => ({
      ...srv,
      conceptos: (srv.conceptos ?? []).map(c => {
        const nuevo = ordenPorConcepto.get(`${srv.id}::${c.id}`);
        return nuevo === undefined ? c : { ...c, orden: nuevo };
      }),
    })),
  };
}

// ─── Alta y baja de líneas ────────────────────────────────────────────────────

/** Datos mínimos para crear una línea. El resto se calcula. */
export interface NuevaLinea {
  servicioId: string;
  concepto: string;
  conceptoId?: string | null;
  proveedorId?: string | null;
  proveedorNombre?: string;
  costo?: number;
  profit?: number;
  target?: number | null;
}

/**
 * Agrega una línea como concepto nuevo del servicio indicado.
 *
 * Nace sin tarifas, así que su costo es capturado a mano y editable. Cuando
 * llegue por comparativa o por arrastre de tarifa, traerá la tarifa asociada
 * y el costo pasará a ser derivado.
 */
export function agregarLinea(quote: KanbanQuote, nueva: NuevaLinea): KanbanQuote {
  const costo = nueva.costo ?? 0;
  const profit = nueva.profit ?? 0;
  const { venta, margen } = calcLinea(costo, profit);

  const concepto: ConceptoCotizacion = {
    id: `con-${nueva.servicioId}-${Date.now()}`,
    nombre: nueva.concepto,
    conceptoId: nueva.conceptoId ?? undefined,
    costo,
    profit,
    venta,
    margen,
    subconceptos: [],
    tarifas: [],
    proveedoresOficialIds: [],
    orden: (quote.servicios ?? [])
      .find(s => s.id === nueva.servicioId)?.conceptos?.length ?? 0,
  };

  return {
    ...quote,
    servicios: (quote.servicios ?? []).map(srv =>
      srv.id === nueva.servicioId
        ? { ...srv, conceptos: [...(srv.conceptos ?? []), concepto] }
        : srv,
    ),
  };
}

/**
 * Quita una línea.
 *
 * Una línea de ruta B representa al servicio entero: quitarla equivaldría a
 * borrar el servicio, que no es lo que la tabla promete. Se deja intacta y se
 * devuelve la cotización sin cambios.
 */
export function quitarLinea(quote: KanbanQuote, lineaId: string): KanbanQuote {
  const linea = aplanarCotizacion(quote).find(l => l.id === lineaId);
  if (!linea || linea.origen !== 'concepto') return quote;

  return {
    ...quote,
    servicios: (quote.servicios ?? []).map(srv =>
      srv.id === linea.servicioId
        ? { ...srv, conceptos: (srv.conceptos ?? []).filter(c => c.id !== linea.conceptoLocalId) }
        : srv,
    ),
  };
}
