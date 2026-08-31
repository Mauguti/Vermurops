/**
 * matrizComparativa.ts
 *
 * La comparativa de agentes como MATRIZ: conceptos en filas, agentes en
 * columnas, y el total del paquete al pie.
 *
 * ── El hallazgo que motivó el rediseño ─────────────────────────────────────
 * Nuestra comparativa comparaba TARIFAS INDIVIDUALES por concepto. La del
 * cliente compara PAQUETES COMPLETOS por agente. Son cosas distintas, y por
 * eso dijeron «no le entiendo nada».
 *
 * Gabi: «son cuatro agentes diferentes... el más barato es el de Sunway con
 * Hapag-Lloyd por 2200, en total. Que eso incluye cuatro conceptos.»
 *
 * ── La matriz se DERIVA, no se guarda ──────────────────────────────────────
 * `concepto.tarifas[]` ya guarda pares (proveedor, monto) por concepto: eso ya
 * es la matriz, girada. Guardarla aparte sería una TERCERA fuente de verdad
 * para los costos, después de la dualidad de §6 que tanto costó. Derivada, la
 * matriz y la tabla de líneas no pueden desincronizarse: son la misma
 * información vista de dos maneras.
 *
 * ── Por qué las filas tienen tipo ──────────────────────────────────────────
 * El sistema de referencia suma TODAS las filas para sacar el total, incluidas
 * «Validez» —una fecha, que en PHP vale 2026— y «Días de tránsito». Eso mete
 * ~2054 de más por columna, y peor: un agente que declaró su validez aparece
 * 2026 más caro que uno que la dejó vacía. Aquí solo suman las filas de tipo
 * 'importe'.
 *
 * Lógica pura: sin React ni Firestore.
 */

import {
  KanbanQuote, ConceptoCotizacion, CotizacionProveedor,
} from '../components/quotes/QuotesData';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Qué representa una fila.
 *  - 'importe': dinero. SUMA al total.
 *  - 'fecha':   una fecha (validez). No suma.
 *  - 'dato':    un número que no es dinero (días de tránsito). No suma.
 */
export type TipoFila = 'importe' | 'fecha' | 'dato';

export interface AgenteColumna {
  /**
   * Clave estable de la columna. NO es la posición.
   *
   * El sistema de referencia indexa por número y reindexa con array_splice al
   * borrar una columna; en React eso hace que las celdas salten de agente.
   */
  id: string;
  proveedorId: string | null;
  nombre: string;
  /**
   * Vigencia de la oferta de ESTE agente.
   *
   * Es propiedad de la columna, no un concepto. El sistema de referencia la
   * mete como fila-concepto falsa llamada «Validez», que es de donde sale el
   * bug del total. Se pinta como fila igual, pero no suma.
   */
  vigencia: string | null;
  orden: number;
}

export interface FilaMatriz {
  /** conceptoLocalId del árbol, o clave sintética para filas especiales. */
  id: string;
  etiqueta: string;
  tipo: TipoFila;
  /** FK al catálogo. null = fila libre, todavía sin resolver. */
  conceptoId: string | null;
  servicioId: string;
  /** agenteId → valor. Ausente o null = ese agente no cotizó ese concepto. */
  celdas: Record<string, number | null>;
}

export interface MatrizComparativa {
  agentes: AgenteColumna[];
  filas: FilaMatriz[];
  /** agenteId → suma de sus filas de importe. */
  totales: Record<string, number>;
  /** Agente con el total más bajo mayor que cero. null si no hay ninguno. */
  agenteMenorId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conceptos por defecto según la plantilla
// ─────────────────────────────────────────────────────────────────────────────

export type TipoPlantilla = 'FCL' | 'terrestre' | 'default';

export interface ConceptoPlantilla {
  clave: string;
  etiqueta: string;
  tipo: TipoFila;
}

/**
 * Los conceptos con los que arranca una comparativa nueva.
 *
 * Se conservan los del sistema de referencia porque son el vocabulario que el
 * equipo ya usa, con dos correcciones: «Días de tránsito» se marca como 'dato'
 * para que no sume, y «Validez» sale de aquí — pasa a ser propiedad de la
 * columna.
 */
export const CONCEPTOS_POR_PLANTILLA: Record<TipoPlantilla, ConceptoPlantilla[]> = {
  FCL: [
    { clave: 'flete_internacional', etiqueta: 'Flete internacional', tipo: 'importe' },
    { clave: 't_pantaco',           etiqueta: 'T. Pantaco',          tipo: 'importe' },
    { clave: 'rail_pantaco',        etiqueta: 'Rail Pantaco',        tipo: 'importe' },
    { clave: 'ams',                 etiqueta: 'AMS',                 tipo: 'importe' },
    { clave: 'doc_fee',             etiqueta: 'Doc Fee',             tipo: 'importe' },
    { clave: 'isps',                etiqueta: 'ISPS',                tipo: 'importe' },
    { clave: 'bl_fee',              etiqueta: 'BL Fee',              tipo: 'importe' },
  ],
  terrestre: [
    { clave: 'flete',            etiqueta: 'Flete',            tipo: 'importe' },
    { clave: 'seguro',           etiqueta: 'Seguro',           tipo: 'importe' },
    { clave: 'maniobra_origen',  etiqueta: 'Maniobra origen',  tipo: 'importe' },
    { clave: 'maniobra_destino', etiqueta: 'Maniobra destino', tipo: 'importe' },
    { clave: 'despacho',         etiqueta: 'Despacho',         tipo: 'importe' },
  ],
  default: [
    { clave: 'gastos_origen',       etiqueta: 'Gastos de origen',   tipo: 'importe' },
    { clave: 'gastos_destino',      etiqueta: 'Gastos de destino',  tipo: 'importe' },
    { clave: 'flete_internacional', etiqueta: 'Flete internacional', tipo: 'importe' },
    { clave: 'seguro',              etiqueta: 'Seguro',             tipo: 'importe' },
    { clave: 'despacho',            etiqueta: 'Despacho',           tipo: 'importe' },
    { clave: 'maniobra',            etiqueta: 'Maniobra',           tipo: 'importe' },
    { clave: 'entrega',             etiqueta: 'Entrega',            tipo: 'importe' },
    // Número, no dinero: NO suma.
    { clave: 'dias_transito',       etiqueta: 'Días de tránsito',   tipo: 'dato' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Pivote
// ─────────────────────────────────────────────────────────────────────────────

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/**
 * Clave de columna de una cotización de proveedor.
 *
 * Se prefiere el id del catálogo; si no lo hay —el caso de los «probables
 * proveedores» y de la ruta B de §6— se cae al nombre normalizado, para que
 * «Sunway Logistics» en dos conceptos distintos caiga en la misma columna.
 */
export function claveAgente(cp: Pick<CotizacionProveedor, 'proveedorId' | 'proveedor'>): string {
  return cp.proveedorId?.trim() || `nom:${norm(cp.proveedor ?? '')}`;
}

/** Tipo de fila de un concepto. Por defecto importe, que es el caso normal. */
export function tipoDeFila(c: ConceptoCotizacion): TipoFila {
  return (c as { tipoFila?: TipoFila }).tipoFila ?? 'importe';
}

/**
 * Construye la matriz de UN servicio.
 *
 * Una matriz por servicio, no por cotización: Pricing pide la misma ruta a
 * varios proveedores —«entre 7 y 10» según el levantamiento— y un agente
 * marítimo no compite contra un transportista terrestre. Mezclarlos produce
 * una matriz donde la mayoría de las celdas están vacías y el total compara
 * peras con manzanas.
 *
 * Sin `servicioId` toma todos los conceptos de la cotización, que solo tiene
 * sentido cuando hay un único servicio.
 *
 * Las columnas salen de los proveedores presentes en las tarifas, más los
 * agentes agregados sin precio todavía (que llegan en `agentesGuardados`
 * porque no se pueden derivar de nada).
 */
export function construirMatriz(
  quote: KanbanQuote,
  agentesGuardados: AgenteColumna[] = [],
  servicioId?: string,
): MatrizComparativa {
  const porClave = new Map<string, AgenteColumna>();

  // Los guardados primero: conservan el orden y la vigencia capturada.
  agentesGuardados
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .forEach(a => porClave.set(a.id, { ...a }));

  const filas: FilaMatriz[] = [];

  (quote.servicios ?? [])
    .filter(srv => servicioId === undefined || srv.id === servicioId)
    .forEach(srv => {
    (srv.conceptos ?? []).forEach(c => {
      const celdas: Record<string, number | null> = {};

      (c.tarifas ?? []).forEach(t => {
        const clave = claveAgente(t);
        if (!porClave.has(clave)) {
          porClave.set(clave, {
            id: clave,
            proveedorId: t.proveedorId ?? null,
            nombre: t.proveedor ?? '',
            vigencia: t.vigencia ?? null,
            orden: porClave.size,
          });
        }
        // Si un agente cotizó dos veces el mismo concepto, gana la última:
        // es la corrección más reciente que mandó.
        celdas[clave] = t.monto;
      });

      filas.push({
        id: `${srv.id}::${c.id}`,
        etiqueta: c.nombre,
        tipo: tipoDeFila(c),
        conceptoId: c.conceptoId ?? null,
        servicioId: srv.id,
        celdas,
      });
    });
  });

  const agentes = [...porClave.values()].sort((a, b) => a.orden - b.orden);
  const totales = calcularTotales(filas, agentes);

  return { agentes, filas, totales, agenteMenorId: agenteConMenorTotal(totales) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Totales
// ─────────────────────────────────────────────────────────────────────────────

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Total del paquete de un agente.
 *
 * SOLO suman las filas de importe. Una fecha o un número de días no son
 * dinero, y sumarlos produce el total inflado del sistema de referencia.
 */
export function totalDeAgente(filas: FilaMatriz[], agenteId: string): number {
  const suma = filas
    .filter(f => f.tipo === 'importe')
    .reduce((acc, f) => acc + (f.celdas[agenteId] ?? 0), 0);
  return redondear(suma);
}

export function calcularTotales(
  filas: FilaMatriz[],
  agentes: AgenteColumna[],
): Record<string, number> {
  const t: Record<string, number> = {};
  agentes.forEach(a => { t[a.id] = totalDeAgente(filas, a.id); });
  return t;
}

/**
 * Agente con el total más bajo, ignorando los que están en cero.
 *
 * Un agente sin precios capturados totaliza cero y ganaría siempre; lo que se
 * busca es el más barato de los que sí cotizaron.
 *
 * En caso de empate gana el primero, que es el que se agregó antes.
 */
export function agenteConMenorTotal(totales: Record<string, number>): string | null {
  const conPrecio = Object.entries(totales).filter(([, v]) => v > 0);
  if (conPrecio.length === 0) return null;
  return conPrecio.reduce((mejor, actual) => (actual[1] < mejor[1] ? actual : mejor))[0];
}

/** ¿Cuántos conceptos de importe cotizó este agente? Para avisar de huecos. */
export function conceptosCotizados(filas: FilaMatriz[], agenteId: string): number {
  return filas.filter(f => f.tipo === 'importe' && (f.celdas[agenteId] ?? 0) > 0).length;
}

/**
 * Agentes con el paquete incompleto.
 *
 * Comparar un paquete de 4 conceptos contra uno de 2 no es comparar: el
 * segundo va a salir «más barato» por no haber cotizado todo. Es la trampa
 * principal de una comparativa por totales.
 */
export function agentesIncompletos(matriz: MatrizComparativa): {
  agenteId: string; nombre: string; cotizados: number; total: number;
}[] {
  const filasImporte = matriz.filas.filter(f => f.tipo === 'importe').length;
  if (filasImporte === 0) return [];

  return matriz.agentes
    .map(a => ({
      agenteId: a.id,
      nombre: a.nombre,
      cotizados: conceptosCotizados(matriz.filas, a.id),
      total: matriz.totales[a.id] ?? 0,
    }))
    .filter(x => x.total > 0 && x.cotizados < filasImporte);
}

/** Fila sintética de vigencia, para pintarla como una más sin que sume. */
export function filaVigencia(agentes: AgenteColumna[]): FilaMatriz {
  const celdas: Record<string, number | null> = {};
  agentes.forEach(a => { celdas[a.id] = null; });
  return {
    id: '__vigencia__',
    etiqueta: 'Validez',
    tipo: 'fecha',
    conceptoId: null,
    servicioId: '',
    celdas,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Escritura: de la celda al árbol
//
// El invariante que sostiene todo esto: escribir en una celda tiene que
// producir exactamente el mismo CotizacionProveedor que produciría el panel de
// tarifas. Si divergieran, la matriz y la tabla mostrarían costos distintos y
// nadie sabría cuál creer.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escribe el precio de un concepto para un agente.
 *
 * Si el agente ya tenía tarifa en ese concepto, se actualiza; si no, se crea.
 * Un valor null borra la tarifa: la celda vacía significa «este agente no
 * cotizó esto», no «cotizó cero».
 */
export function escribirCelda(
  quote: KanbanQuote,
  filaId: string,
  agente: AgenteColumna,
  valor: number | null,
): KanbanQuote {
  const [servicioId, conceptoLocalId] = filaId.split('::');

  return {
    ...quote,
    servicios: (quote.servicios ?? []).map(srv => {
      if (srv.id !== servicioId) return srv;
      return {
        ...srv,
        conceptos: (srv.conceptos ?? []).map(c => {
          if (c.id !== conceptoLocalId) return c;

          const tarifas = c.tarifas ?? [];
          const existente = tarifas.find(t => claveAgente(t) === agente.id);

          if (valor === null) {
            const quedan = tarifas.filter(t => claveAgente(t) !== agente.id);
            return {
              ...c,
              tarifas: quedan,
              // Si la tarifa borrada era la oficial, deja de serlo.
              proveedoresOficialIds: (c.proveedoresOficialIds ?? [])
                .filter(id => quedan.some(t => t.id === id)),
            };
          }

          if (existente) {
            return {
              ...c,
              tarifas: tarifas.map(t =>
                claveAgente(t) === agente.id ? { ...t, monto: valor } : t),
            };
          }

          const nueva: CotizacionProveedor = {
            id: `cp-${conceptoLocalId}-${agente.id}-${Date.now()}`,
            proveedor: agente.nombre,
            contacto: '',
            monto: valor,
            moneda: 'USD',
            seleccionada: false,
            proveedorId: agente.proveedorId ?? null,
            // Clave AUSENTE, no clave en undefined: Firestore rechaza undefined
            // y tumbaría la escritura completa de la cotización.
            ...(agente.vigencia ? { vigencia: agente.vigencia } : {}),
          };
          return { ...c, tarifas: [...tarifas, nueva] };
        }),
      };
    }),
  };
}

/** Quita todas las tarifas de un agente: borrar su columna. */
export function quitarAgenteDeCotizacion(quote: KanbanQuote, agenteId: string): KanbanQuote {
  return {
    ...quote,
    servicios: (quote.servicios ?? []).map(srv => ({
      ...srv,
      conceptos: (srv.conceptos ?? []).map(c => {
        const quedan = (c.tarifas ?? []).filter(t => claveAgente(t) !== agenteId);
        if (quedan.length === (c.tarifas ?? []).length) return c;
        return {
          ...c,
          tarifas: quedan,
          proveedoresOficialIds: (c.proveedoresOficialIds ?? [])
            .filter(id => quedan.some(t => t.id === id)),
        };
      }),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// De la comparativa a las líneas (MC-4)
// ─────────────────────────────────────────────────────────────────────────────

export interface LineaPropuesta {
  filaId: string;
  servicioId: string;
  conceptoLocalId: string;
  etiqueta: string;
  conceptoId: string | null;
  costo: number;
}

/**
 * Qué líneas produciría elegir a este agente.
 *
 * Solo filas de importe con precio: una fila en cero es un concepto que ese
 * agente no cotizó, y cargarla pondría un costo cero que después bloquea la
 * cotización por «sin costo capturado».
 *
 * NO elige el agente por su cuenta. Noema, en el levantamiento: «aunque sea la
 * más barata no siempre la tomamos, por los detalles: tiempo de tránsito, free
 * time, o el cliente que no quiere cierto proveedor». Si el sistema cargara
 * siempre el más barato, comparar sería decorativo.
 */
export function lineasDesdeAgente(
  matriz: MatrizComparativa,
  agenteId: string,
): LineaPropuesta[] {
  return matriz.filas
    .filter(f => f.tipo === 'importe')
    .map(f => ({
      filaId: f.id,
      servicioId: f.servicioId,
      conceptoLocalId: f.id.split('::')[1] ?? '',
      etiqueta: f.etiqueta,
      conceptoId: f.conceptoId,
      costo: f.celdas[agenteId] ?? 0,
    }))
    .filter(l => l.costo > 0);
}

/**
 * Marca las tarifas de ese agente como las oficiales de cada concepto.
 *
 * Es lo que convierte «comparé» en «elegí»: el costo de la línea pasa a salir
 * de esa tarifa, y la matriz y la tabla siguen siendo la misma información.
 */
export function elegirAgente(quote: KanbanQuote, agenteId: string): KanbanQuote {
  return {
    ...quote,
    servicios: (quote.servicios ?? []).map(srv => ({
      ...srv,
      conceptos: (srv.conceptos ?? []).map(c => {
        const suya = (c.tarifas ?? []).find(
          t => claveAgente(t) === agenteId && t.monto > 0,
        );
        if (!suya) return c;
        return {
          ...c,
          proveedoresOficialIds: [suya.id],
          tarifas: (c.tarifas ?? []).map(t => ({
            ...t,
            seleccionada: t.id === suya.id,
          })),
        };
      }),
    })),
  };
}

/** Conceptos que quedarían sin costo al elegir a este agente. */
export function conceptosSinCotizar(
  matriz: MatrizComparativa,
  agenteId: string,
): string[] {
  return matriz.filas
    .filter(f => f.tipo === 'importe' && !((f.celdas[agenteId] ?? 0) > 0))
    .map(f => f.etiqueta);
}

/**
 * Una matriz por cada servicio de la cotización.
 *
 * En una multimodal salen dos: la marítima con sus navieras y la terrestre con
 * sus transportistas, cada una con sus propios agentes y su propio total.
 */
export function matricesPorServicio(
  quote: KanbanQuote,
  agentesPorServicio: Record<string, AgenteColumna[]> = {},
): { servicioId: string; servicioTipo: string; matriz: MatrizComparativa }[] {
  return (quote.servicios ?? []).map(srv => ({
    servicioId: srv.id,
    servicioTipo: srv.tipo,
    matriz: construirMatriz(quote, agentesPorServicio[srv.id] ?? [], srv.id),
  }));
}
