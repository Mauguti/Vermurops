/**
 * cotizacionAEmbarque.ts
 *
 * E-3. Traduce una cotización a los cargos del embarque: qué se le cobra al
 * cliente y qué se le paga a cada proveedor.
 *
 * ── Por qué esto es delicado ───────────────────────────────────────────────
 * El cliente decidió que el embarque se cree AUTOMÁTICAMENTE al marcar la
 * cotización como ganada: «una cotización ganada se crea un embarque de a
 * huevo, no hay paso intermedio».
 *
 * Eso significa que quien dispara este mapeo es Ventas o Pricing al cerrar una
 * venta, y NO ve el resultado. Si el mapeo pierde un costo, el embarque nace
 * mal y nadie se entera hasta que llega el momento de pagar al proveedor o de
 * facturar. Por eso esta función:
 *
 *   - se alimenta de la salida PLANA del adaptador, la misma que Pricing ve en
 *     pantalla, y no del árbol anidado. Si el embarque hereda algo distinto a
 *     lo cotizado, es porque el adaptador falla, y eso ya lo cubren sus tests;
 *   - devuelve ADVERTENCIAS junto a los cargos, para lo que es sospechoso pero
 *     no impide continuar. Nadie las va a ver en el momento, así que se guardan
 *     en el embarque y se muestran en la bandeja «por capturar».
 *
 * Lógica pura: sin React ni Firestore.
 */

import { KanbanQuote } from '../components/quotes/QuotesData';
import { CargoDetalle, MonedaCargo } from '../components/shipments/EmbarquesData';
import { aplanarCotizacion, LineaPlana } from './lineasCotizacion';

// ─── Advertencias ─────────────────────────────────────────────────────────────

export type TipoAdvertencia =
  /** El costo de la línea mezcla monedas: sumarlo produce un número sin sentido (§4.3). */
  | 'monedas_mezcladas'
  /** Hay costo pero no se sabe a quién pagarle. */
  | 'gasto_sin_proveedor'
  /** La línea no genera ingreso: no habrá qué facturar. */
  | 'sin_venta'
  /** Se cobra sin costo asociado: puede ser correcto, o faltar la tarifa. */
  | 'venta_sin_costo'
  /** La venta quedó por debajo del costo. */
  | 'margen_negativo';

export interface Advertencia {
  tipo: TipoAdvertencia;
  lineaId: string;
  concepto: string;
  detalle: string;
}

export interface ResultadoMapeo {
  cargos: CargoDetalle[];
  advertencias: Advertencia[];
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

const MONEDAS_VALIDAS: MonedaCargo[] = ['USD', 'MXN'];

function monedaValida(m: string): MonedaCargo {
  return (MONEDAS_VALIDAS as string[]).includes(m) ? (m as MonedaCargo) : 'USD';
}

/**
 * Grupo de facturación por defecto: el servicio.
 *
 * El cliente pidió poder facturar «general o separada, por concepto o por
 * grupo de conceptos». Agrupar por servicio es el corte natural de una
 * cotización multimodal: el marítimo en una factura y el terrestre en otra.
 * En cotizaciones de un solo servicio todo cae en un grupo y la separada
 * equivale a la general. El usuario puede reagrupar después.
 */
function grupoDe(linea: LineaPlana): string {
  return linea.servicioId;
}

// ─── Mapeo ────────────────────────────────────────────────────────────────────

function revisarLinea(linea: LineaPlana): Advertencia[] {
  const avisos: Advertencia[] = [];
  const base = { lineaId: linea.id, concepto: linea.concepto };

  const monedas = new Set(linea.costos.map(c => c.moneda));
  if (monedas.size > 1) {
    avisos.push({
      ...base,
      tipo: 'monedas_mezcladas',
      detalle: `El costo mezcla ${[...monedas].join(' y ')}. Los montos se separan por moneda, pero el costo de la cotización los sumó como si fueran la misma.`,
    });
  }

  const sinProveedor = linea.costos.filter(c => !c.proveedorId && c.monto > 0);
  if (sinProveedor.length > 0) {
    avisos.push({
      ...base,
      tipo: 'gasto_sin_proveedor',
      detalle: `${sinProveedor.length} componente(s) de costo sin proveedor identificado: no se sabe a quién pagarle.`,
    });
  }

  if (linea.venta <= 0) {
    avisos.push({ ...base, tipo: 'sin_venta', detalle: 'La línea no genera ingreso: no habrá qué facturar.' });
  } else if (linea.costo === 0) {
    avisos.push({ ...base, tipo: 'venta_sin_costo', detalle: 'Se cobra sin costo asociado. Puede ser correcto, o faltar la tarifa del proveedor.' });
  }

  if (linea.venta < linea.costo) {
    avisos.push({
      ...base,
      tipo: 'margen_negativo',
      detalle: `Venta ${linea.venta} por debajo del costo ${linea.costo}.`,
    });
  }

  return avisos;
}

function cargosDeLinea(linea: LineaPlana, cotizacionId: string): CargoDetalle[] {
  const cargos: CargoDetalle[] = [];
  const grupo = grupoDe(linea);

  const origenCotizacion = {
    cotizacionId,
    servicioId: linea.servicioId,
    conceptoId: linea.conceptoLocalId ?? linea.servicioId,
  };

  // ── Lo que se le cobra al cliente ───────────────────────────────────────
  if (linea.venta !== 0) {
    cargos.push({
      id: `ing-${linea.id}`,
      concepto: linea.concepto,
      tipo: 'ingreso',
      monto: linea.venta,
      moneda: monedaValida(linea.moneda),
      conceptoId: linea.conceptoId ?? undefined,
      origenCotizacion,
      origen: 'heredado',
      grupoFacturacion: grupo,
      facturaId: null,
    });
  }

  // ── Lo que se le paga a cada proveedor ──────────────────────────────────
  // Una línea de gasto por COMPONENTE, no una agregada: el embarque tiene que
  // poder pagarle a cada proveedor por separado.
  linea.costos.forEach(c => {
    if (c.monto === 0) return;
    cargos.push({
      id: `gas-${linea.id}-${c.id}`,
      concepto: c.descripcion || linea.concepto,
      tipo: 'gasto',
      monto: c.monto,
      moneda: monedaValida(c.moneda),
      conceptoId: linea.conceptoId ?? undefined,
      proveedorId: c.proveedorId ?? undefined,
      tarifaId: c.tarifaOrigenId ?? undefined,
      origenCotizacion,
      origen: 'heredado',
      grupoFacturacion: grupo,
      facturaId: null,
    });
  });

  return cargos;
}

/**
 * Convierte la cotización en los cargos del embarque.
 *
 * Un ingreso por línea (la venta) y un gasto por cada componente de costo
 * (a cada proveedor lo suyo).
 */
export function mapearCotizacionAEmbarque(quote: KanbanQuote): ResultadoMapeo {
  const lineas = aplanarCotizacion(quote);

  const cargos: CargoDetalle[] = [];
  const advertencias: Advertencia[] = [];

  lineas.forEach(linea => {
    cargos.push(...cargosDeLinea(linea, quote.id));
    advertencias.push(...revisarLinea(linea));
  });

  if (lineas.length === 0) {
    advertencias.push({
      tipo: 'sin_venta',
      lineaId: '',
      concepto: '',
      detalle: 'La cotización no tiene líneas: el embarque nacería sin cargos.',
    });
  }

  return { cargos, advertencias };
}

/** Total de ingresos por moneda, para contrastar contra la cotización. */
export function ingresoPorMoneda(cargos: CargoDetalle[]): Record<string, number> {
  const t: Record<string, number> = {};
  cargos.filter(c => c.tipo === 'ingreso').forEach(c => {
    t[c.moneda] = Math.round(((t[c.moneda] ?? 0) + c.monto) * 100) / 100;
  });
  return t;
}

/** Cuánto se le debe a cada proveedor. Base de las órdenes de compra. */
export function gastoPorProveedor(
  cargos: CargoDetalle[],
): { proveedorId: string | null; moneda: string; monto: number }[] {
  const mapa = new Map<string, { proveedorId: string | null; moneda: string; monto: number }>();

  cargos.filter(c => c.tipo === 'gasto').forEach(c => {
    const pid = c.proveedorId ?? null;
    const clave = `${pid ?? '—'}::${c.moneda}`;
    const actual = mapa.get(clave) ?? { proveedorId: pid, moneda: c.moneda, monto: 0 };
    actual.monto = Math.round((actual.monto + c.monto) * 100) / 100;
    mapa.set(clave, actual);
  });

  return [...mapa.values()];
}
