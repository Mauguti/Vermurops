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
import { idUnico } from './idUnico';

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
  /**
   * Dónde ocurre el servicio (origen/destino). Se arrastra para que el cargo
   * del embarque pueda derivar su IVA sin volver a la cotización (§4.2).
   */
  ubicacion?: 'origen' | 'destino';
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

  /**
   * ¿El costo fue capturado, aunque valga cero?
   *
   * Distingue «nadie lo ha puesto» de «alguien decidió que es cero». Un
   * concepto absorbido o con pérdida deliberada es válido; uno sin capturar,
   * no. Ver ConceptoCotizacion.costoCapturado.
   */
  costoCapturado: boolean;
  /**
   * Bloque 3 · Lo que el usuario eligió en la columna de impuesto.
   * `undefined` = no lo tocó y manda la regla del catálogo.
   */
  impuesto?: 'iva16' | 'iva0' | 'exento';
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

  // Capturado si viene de tarifas/subconceptos (son datos reales), si alguien
  // lo marcó explícitamente, o —fallback para lo anterior a la marca— si es
  // mayor que cero.
  const costoCapturado = costos.length > 0
    || concepto.costoCapturado === true
    || (concepto.costo ?? 0) > 0;

  return {
    id: `${srv.id}::${concepto.id}`,
    servicioId: srv.id,
    servicioTipo: srv.tipo,
    ubicacion: srv.ubicacion,
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
    costoCapturado,
    ...(concepto.impuesto !== undefined ? { impuesto: concepto.impuesto } : {}),
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
    ubicacion: srv.ubicacion,
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
    costoCapturado: true,
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
  /**
   * FK al catálogo de conceptos. Va SIEMPRE junto al nombre: el nombre es
   * para leer y el id es lo que hace match con las tarifas. Sin él, el panel
   * de tarifas no encuentra nada y dos renglones escritos distinto —
   * «almacenaje» y «Almajenaje»— son conceptos diferentes para el sistema.
   */
  conceptoId?: string | null;
  proveedorId?: string | null;
  proveedorNombre?: string;
  costo?: number;
  profit?: number;
  target?: number | null;
  orden?: number;
  /** Bloque 3 · `null` limpia la elección y devuelve el renglón a lo derivado. */
  impuesto?: 'iva16' | 'iva0' | 'exento' | null;
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
        // Teclear un cero es una decisión y queda registrada como tal.
        // Si nunca se capturó, la clave se OMITE: en undefined, Firestore
        // rechaza la escritura completa de la cotización.
        const costoCapturado = edicion.costo !== undefined ? true : c.costoCapturado;
        const { venta, margen } = calcLinea(costo, profit);

        /*
         * Bloque 3 · `null` QUITA la elección y devuelve el renglón a lo
         * derivado del catálogo. Hay que sacar la clave del objeto base,
         * porque `...c` la volvería a meter; y se omite en vez de ponerla en
         * undefined, que hace a Firestore rechazar el documento entero.
         */
        const { impuesto: _impuestoPrevio, ...cSinImpuesto } = c;
        const impuesto = edicion.impuesto === null
          ? undefined
          : (edicion.impuesto ?? c.impuesto);

        return {
          ...cSinImpuesto,
          ...(impuesto !== undefined ? { impuesto } : {}),
          ...(costoCapturado !== undefined ? { costoCapturado } : {}),
          nombre: edicion.concepto ?? c.nombre,
          // Se omite la clave en vez de ponerla en undefined (Firestore la
          // rechaza). `null` sí es válido y significa «sin concepto».
          ...(edicion.conceptoId !== undefined
            ? { conceptoId: edicion.conceptoId ?? null }
            : {}),
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
    // idUnico y no Date.now() a secas: dos líneas del mismo ms nacían con el
    // mismo id y toda edición —profit, costo, concepto— pegaba en las dos.
    id: idUnico(`con-${nueva.servicioId}`),
    nombre: nueva.concepto,
    ...(nueva.conceptoId ? { conceptoId: nueva.conceptoId } : {}),
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
 * Separa los conceptos gemelos de una cotización ya dañada.
 *
 * Antes de idUnico, dos líneas creadas en el mismo milisegundo nacían con el
 * mismo id. Esas cotizaciones ya están GUARDADAS así, y mientras las gemelas
 * compartan id, editar una edita todas. Esta función re-acuña el id de las
 * repetidas (la primera conserva el suyo: es la referencia más probable de
 * proveedoresOficialIds y demás).
 *
 * Devuelve cuántas reparó para poder DECIRLO: renombrar ids en silencio y que
 * el usuario vea «cambiar» su tabla sin explicación es cómo se pierde la
 * confianza en el sistema.
 */
export function repararConceptosDuplicados(
  quote: KanbanQuote,
): { quote: KanbanQuote; reparados: number } {
  let reparados = 0;

  const servicios = (quote.servicios ?? []).map(srv => {
    const vistos = new Set<string>();
    let cambio = false;

    const conceptos = (srv.conceptos ?? []).map(c => {
      if (!vistos.has(c.id)) { vistos.add(c.id); return c; }
      reparados += 1;
      cambio = true;
      return { ...c, id: idUnico(`con-${srv.id}`) };
    });

    return cambio ? { ...srv, conceptos } : srv;
  });

  return reparados === 0
    ? { quote, reparados: 0 }
    : { quote: { ...quote, servicios }, reparados };
}

/**
 * Mueve una línea RECIÉN CREADA a otro servicio.
 *
 * ── Para qué existe (C.4) ──────────────────────────────────────────────────
 * En la tabla única, la columna «Servicio» es un selector MIENTRAS la línea
 * está fresca —sin concepto del catálogo todavía— y queda fija después. De la
 * pertenencia al servicio dependen la matriz comparativa (una por servicio) y
 * la generación de embarques (servicio.tipo → modalidad → folio), así que
 * mover una línea ya trabajada reagruparía dinero por debajo del usuario.
 *
 * Por eso la función se NIEGA a mover:
 *   - líneas con conceptoId: ya están fijas, es la promesa del selector;
 *   - líneas con tarifas o costo capturado: llevan dinero colgando;
 *   - líneas de ruta B: representan al servicio entero, no viven en otro.
 * En todos esos casos devuelve la cotización sin cambios, igual que
 * quitarLinea con ruta B: negarse en silencio es seguro porque la UI no
 * ofrece el selector en esos estados — esto es la red por si acaso.
 */
export function moverLineaDeServicio(
  quote: KanbanQuote,
  lineaId: string,
  nuevoServicioId: string,
): KanbanQuote {
  const linea = aplanarCotizacion(quote).find(l => l.id === lineaId);
  if (!linea || linea.origen !== 'concepto' || !linea.conceptoLocalId) return quote;
  if (linea.conceptoId) return quote;                       // ya quedó fija
  if (linea.tarifasCount > 0 || linea.costoCapturado) return quote;
  if (linea.servicioId === nuevoServicioId) return quote;
  if (!(quote.servicios ?? []).some(s => s.id === nuevoServicioId)) return quote;

  let movido: ConceptoCotizacion | null = null;

  const sinElla = (quote.servicios ?? []).map(srv => {
    if (srv.id !== linea.servicioId) return srv;
    const conceptos = (srv.conceptos ?? []).filter(c => {
      if (c.id === linea.conceptoLocalId) { movido = c; return false; }
      return true;
    });
    return { ...srv, conceptos };
  });

  if (!movido) return quote;

  return {
    ...quote,
    servicios: sinElla.map(srv =>
      srv.id === nuevoServicioId
        ? { ...srv, conceptos: [...(srv.conceptos ?? []), movido!] }
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

// ─── Congelado ────────────────────────────────────────────────────────────────

/**
 * ¿La cotización ya generó embarque y por tanto está congelada?
 *
 * Decisión del cliente (28-ago-2026): «no, una vez que pasa a embarques ya así
 * se queda». Los conceptos dejan de editarse, así que no puede haber
 * divergencia entre lo cotizado y lo que el embarque va a cobrar y pagar.
 */
export function estaCongelada(quote: { embarqueIds?: string[] | null }): boolean {
  return (quote.embarqueIds?.length ?? 0) > 0;
}

/**
 * Campos que SÍ se pueden seguir tocando en una cotización congelada.
 *
 * Se usa lista blanca y no un diff profundo porque los componentes mandan la
 * cotización entera en cada guardado: `servicios` siempre viene, cambie o no,
 * así que «bloquear solo si cambió servicios» no se puede distinguir. La lista
 * blanca es predecible y deja viva la conversación con el cliente después de
 * ganada, que es lo que uno querría.
 */
export const CAMPOS_EDITABLES_CONGELADA = [
  'chat',
  'actividades',
  'historialEtapas',
  'embarqueIds',
  'updatedAt',
  // El PDF de una ganada se genera después de congelarla: es evidencia, no edición.
  'pdfs',
] as const;

/**
 * Campos del patch que la cotización congelada NO acepta, mirando solo las
 * CLAVES.
 *
 * ⚠️ No sirve para guardar contra Firestore: los componentes mandan la
 * cotización entera, así que `servicios` viene siempre y esto marcaría hasta
 * un mensaje de chat. Para eso está `cambiosBloqueados`, que compara.
 */
export function camposBloqueados(patch: Record<string, unknown>): string[] {
  const permitidos = new Set<string>(CAMPOS_EDITABLES_CONGELADA);
  return Object.keys(patch).filter(k => !permitidos.has(k));
}

/** Igualdad estructural para JSON puro, estable ante el orden de las claves. */
function igualProfundo(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => igualProfundo(x, b[i]));
  }

  const ca = a as Record<string, unknown>;
  const cb = b as Record<string, unknown>;
  // Las claves ausentes y las que valen undefined son lo mismo aquí: Firestore
  // no guarda undefined, así que un campo que se fue y uno que nunca estuvo
  // llegan igual al leerse de vuelta.
  const claves = new Set([...Object.keys(ca), ...Object.keys(cb)]);
  for (const k of claves) {
    if (!igualProfundo(ca[k], cb[k])) return false;
  }
  return true;
}

/**
 * Campos que este guardado CAMBIARÍA y que la cotización congelada no acepta.
 *
 * ── Por qué compara en vez de mirar las claves ─────────────────────────────
 * La versión de arriba nunca se pudo cablear: los componentes mandan la
 * cotización completa en cada guardado, así que `servicios` está siempre
 * presente y la lista blanca marcaba todo — incluido escribir un mensaje de
 * chat, que sí está permitido.
 *
 * Comparando contra lo que ya está guardado, un `servicios` idéntico no es un
 * cambio y pasa; uno distinto se detiene. Eso es lo que la regla del cliente
 * quería decir: «una vez que pasa a embarques ya así se queda» (§4.8).
 *
 * Vacío = el guardado no toca nada bloqueado.
 */
export function cambiosBloqueados(
  actual: Record<string, unknown>,
  patch: Record<string, unknown>,
): string[] {
  const permitidos = new Set<string>(CAMPOS_EDITABLES_CONGELADA);
  return Object.keys(patch).filter(
    k => !permitidos.has(k) && !igualProfundo(actual[k], patch[k]),
  );
}
