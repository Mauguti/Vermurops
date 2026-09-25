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
import { ClienteVermur } from '../components/clientes/ClientesData';
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
  | 'margen_negativo'
  /**
   * Alguna tarifa que originó un costo ya venció.
   * La vigencia vencida es fuente de reclamos (§4.7): el proveedor puede
   * negarse a respetar el precio con el que se cotizó.
   */
  | 'tarifa_vencida'
  /**
   * El cliente no tiene expediente validado. Regla dura del negocio: no se
   * opera un embarque con cliente sin validar. Operaciones tiene que saberlo
   * al recibir un embarque que Ventas generó al cerrar la venta.
   */
  | 'cliente_sin_expediente'
  /** Una línea que no es de transporte se asignó al embarque dominante. */
  | 'linea_sin_modalidad'
  /** Un servicio marcado para operarse aparte no define modalidad. */
  | 'independiente_sin_modalidad'
  /**
   * El contador de la serie nunca se sembró con el consecutivo de Magaya, así
   * que el folio arranca en 001 y puede duplicar uno histórico.
   */
  | 'contador_sin_sembrar'
  /**
   * No se pudo determinar el tráfico, así que el folio salió de la serie
   * genérica VL. Operaciones debe reasignarlo a su serie al capturar.
   */
  | 'folio_provisional'
  /** Ninguna línea corresponde a una modalidad de transporte. */
  | 'sin_modalidad_transporte';

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

/**
 * Datos externos a la cotización que el mapeo necesita para revisar.
 *
 * Se pasan como contexto en vez de leerlos aquí para que la función siga
 * siendo pura y testeable sin Firestore.
 */
export interface ContextoMapeo {
  /**
   * El cliente de la cotización, si ya está dado de alta.
   * `null`/ausente significa que la venta se cerró contra un prospecto que
   * nunca pasó por el alta — que es justo el caso que hay que avisar.
   */
  cliente?: ClienteVermur | null;
  /** Fecha contra la que se evalúa la vigencia. ISO. Default: hoy. */
  fechaReferencia?: string;
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

/** ¿La vigencia quedó atrás de la fecha de referencia? */
function estaVencida(vigencia: string | null | undefined, fechaRef: string): boolean {
  if (!vigencia) return false;              // sin vigencia declarada, no se opina
  const v = Date.parse(vigencia);
  if (Number.isNaN(v)) return false;        // texto libre del proveedor, no es fecha
  return v < Date.parse(fechaRef);
}

function revisarLinea(linea: LineaPlana, fechaRef: string): Advertencia[] {
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

  const vencidas = linea.costos.filter(c => estaVencida(c.vigencia, fechaRef));
  if (vencidas.length > 0) {
    const detalle = vencidas
      .map(c => `${c.proveedorNombre || 'proveedor sin identificar'} (venció ${c.vigencia})`)
      .join(', ');
    avisos.push({
      ...base,
      tipo: 'tarifa_vencida',
      detalle: `Tarifa vencida al generar el embarque: ${detalle}. El proveedor puede no respetar el precio cotizado.`,
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
      // 2.1 · Se hereda para que la factura derive su IVA sin volver a la
      // cotización. Solo en el ingreso: el IVA que importa es el que se le
      // cobra al cliente.
      ubicacionIVA: linea.ubicacion,
      /*
       * Bloque 3 · La tasa elegida al cotizar viaja al embarque. Sin esto, el
       * embarque volvería a derivarla del catálogo y perdería justo lo que
       * Pricing decidió para ESTE cliente —el seguro con IVA, el agente al que
       * se le cotizó con IVA incluido—, que es el caso que motivó el bloque.
       *
       * Se omite la clave cuando no hubo elección: Firestore rechaza undefined
       * y tumbaría la escritura del embarque entero.
       */
      ...(linea.impuesto !== undefined ? { impuesto: linea.impuesto } : {}),
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
 * Revisa el expediente del cliente.
 *
 * Regla dura del negocio: no se opera un embarque con cliente sin validar.
 * El caso más común y más grave es que la cotización siga apuntando solo al
 * prospecto: Ventas cerró la venta con alguien que nunca pasó por el alta.
 */
export function revisarCliente(
  quote: KanbanQuote,
  cliente: ClienteVermur | null | undefined,
): Advertencia | null {
  const base = {
    lineaId: '',
    concepto: quote.prospecto?.empresa ?? '',
    tipo: 'cliente_sin_expediente' as const,
  };

  if (!quote.clienteId) {
    return {
      ...base,
      detalle: `«${quote.prospecto?.empresa ?? 'Sin nombre'}» sigue siendo prospecto: la cotización no está ligada a un cliente dado de alta. Administración tiene que abrir el expediente antes de operar.`,
    };
  }

  if (!cliente) {
    return {
      ...base,
      detalle: `La cotización apunta al cliente ${quote.clienteId}, pero no se pudo leer su expediente para verificarlo.`,
    };
  }

  const faltantes: string[] = [];
  if (cliente.statusOperativo === 'INACTIVO') faltantes.push('está marcado como INACTIVO');
  if (!cliente.rfc?.trim()) faltantes.push('no tiene RFC');
  if (cliente.validadoFiscalmente !== true) faltantes.push('no está validado fiscalmente');

  if (faltantes.length === 0) return null;

  return {
    ...base,
    concepto: cliente.nombre,
    detalle: `El expediente de «${cliente.nombre}» ${faltantes.join(', ')}.`,
  };
}

/**
 * Convierte la cotización en los cargos del embarque.
 *
 * Un ingreso por línea (la venta) y un gasto por cada componente de costo
 * (a cada proveedor lo suyo).
 */
export function mapearCotizacionAEmbarque(
  quote: KanbanQuote,
  contexto: ContextoMapeo = {},
): ResultadoMapeo {
  const { cargos, advertencias } = mapearLineasAEmbarque(
    aplanarCotizacion(quote), quote.id, contexto,
  );

  const avisoCliente = revisarCliente(quote, contexto.cliente);
  if (avisoCliente) advertencias.push(avisoCliente);

  return { cargos, advertencias };
}

/**
 * El mismo mapeo, pero sobre un SUBCONJUNTO de líneas.
 *
 * Existe porque una cotización multimodal genera varios embarques (A-1) y cada
 * uno hereda solo las líneas que le tocan. Si cada embarque heredara todos los
 * cargos, se cobraría y se pagaría N veces lo mismo.
 *
 * No revisa el expediente del cliente: ese aviso es de la cotización entera y
 * duplicarlo por embarque sería ruido. Lo agrega `mapearCotizacionAEmbarque`
 * o, en la generación por grupos, el planificador.
 */
export function mapearLineasAEmbarque(
  lineas: LineaPlana[],
  cotizacionId: string,
  contexto: ContextoMapeo = {},
): ResultadoMapeo {
  const fechaRef = contexto.fechaReferencia ?? new Date().toISOString().slice(0, 10);

  const cargos: CargoDetalle[] = [];
  const advertencias: Advertencia[] = [];

  lineas.forEach(linea => {
    cargos.push(...cargosDeLinea(linea, cotizacionId));
    advertencias.push(...revisarLinea(linea, fechaRef));
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
