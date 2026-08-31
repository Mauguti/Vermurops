/**
 * importacionTarifas.ts
 *
 * Lógica pura de la carga de tarifarios con IA (TA-1).
 *
 * ── El problema ────────────────────────────────────────────────────────────
 * Gabi: «un almacén me cobra el IN, el OUT, el PICK... si son 10 conceptos,
 * tendría que subir 10 veces la tarifa. Y eso multiplicarlo por el número de
 * almacenes con los que yo cotice». Y: «voy a cargar unos tarifarios que tengo
 * de agosto. Pero realmente no los pude cargar porque no encontré dónde».
 *
 * ── El principio que gobierna este módulo ──────────────────────────────────
 * n8n EXTRAE Y PROPONE; la app DECIDE Y ESCRIBE. Nada de lo que llega del
 * agente se toma por bueno: se valida en la frontera, se resuelve contra los
 * catálogos, y se le pide confirmación a Pricing antes de tocar Firestore.
 *
 * La IA se equivoca, y una tarifa mal cargada no falla — se propaga a
 * cotizaciones reales y de ahí a facturas.
 *
 * Sin React, sin Firestore, sin red.
 */

import { TarifaVermur, UnidadTarifa } from '../components/tarifas/TarifasData';
import { matchConceptByName, type ConceptoMatch } from '../components/tarifas/tarifaMatching';

// ─────────────────────────────────────────────────────────────────────────────
// 1 · La frontera con n8n
//
// El contrato es externo y puede cambiar sin avisar. Si un campo llega con
// otro nombre, leerlo como `undefined` crearía tarifas en cero. Aquí se
// rechaza lo malformado en vez de confiar.
// ─────────────────────────────────────────────────────────────────────────────

export type NivelConfianza = 'alta' | 'media' | 'baja';

/** Lo que el agente dice devolver. Todo es `unknown` hasta validarlo. */
export interface RespuestaN8N {
  ok: boolean;
  error?: string;
  proveedor?: string;
  vigenciaTexto?: string;
  fechaInicio?: string;
  fechaFin?: string;
  confianza?: NivelConfianza;
  observaciones?: string;
  totalLineas?: number;
  lineasConAviso?: number;
  tarifas?: LineaExtraida[];
}

export interface LineaExtraida {
  lineaId: string;
  concepto: string;
  puertoOrigen?: string;
  puertoDestino?: string;
  unidad?: string;
  monto: number;
  montoPor40?: number;
  montoPor40HC?: number;
  montoMinimo?: number;
  moneda?: string;
  tiempoTransito?: number;
  freeTime?: number;
  condiciones?: string;
  avisos?: string[];
  requiereRevision?: boolean;
}

export interface ResultadoValidacion {
  valida: boolean;
  /** Motivo por el que se rechaza. Se muestra tal cual al usuario. */
  motivo?: string;
  /** Problemas que no invalidan la respuesta pero hay que señalar. */
  reparos: string[];
  datos?: RespuestaN8N;
}

const MONEDAS_VALIDAS = ['USD', 'MXN'];
const ISO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Valida la respuesta del agente antes de dejarla entrar a la app.
 *
 * Es deliberadamente estricta con lo que puede producir dinero equivocado
 * (monto, moneda) y tolerante con lo accesorio (condiciones, tránsito).
 */
export function validarRespuestaN8N(bruto: unknown): ResultadoValidacion {
  const reparos: string[] = [];

  if (!esObjeto(bruto)) {
    return { valida: false, motivo: 'La respuesta del extractor no es un objeto JSON.', reparos };
  }

  if (bruto.ok === false) {
    return {
      valida: false,
      motivo: typeof bruto.error === 'string' && bruto.error
        ? `El extractor no pudo procesar el archivo: ${bruto.error}`
        : 'El extractor no pudo procesar el archivo.',
      reparos,
    };
  }

  if (bruto.ok !== true) {
    return { valida: false, motivo: 'La respuesta no indica si el proceso fue exitoso (falta «ok»).', reparos };
  }

  if (!Array.isArray(bruto.tarifas)) {
    return { valida: false, motivo: 'La respuesta no trae la lista de tarifas.', reparos };
  }

  if (bruto.tarifas.length === 0) {
    return { valida: false, motivo: 'No se encontró ninguna tarifa en el documento.', reparos };
  }

  // ── Líneas ────────────────────────────────────────────────────────────────
  const lineas: LineaExtraida[] = [];
  bruto.tarifas.forEach((cruda, i) => {
    if (!esObjeto(cruda)) {
      reparos.push(`La línea ${i + 1} no es un objeto y se descarta.`);
      return;
    }

    const concepto = typeof cruda.concepto === 'string' ? cruda.concepto.trim() : '';
    const monto = typeof cruda.monto === 'number' ? cruda.monto : NaN;

    if (!concepto) {
      reparos.push(`La línea ${i + 1} no trae concepto y se descarta.`);
      return;
    }
    if (!Number.isFinite(monto)) {
      reparos.push(`«${concepto}» no trae un monto numérico y se descarta.`);
      return;
    }
    if (monto < 0) {
      reparos.push(`«${concepto}» trae un monto negativo (${monto}) y se descarta.`);
      return;
    }

    const moneda = typeof cruda.moneda === 'string' ? cruda.moneda.toUpperCase() : '';
    if (moneda && !MONEDAS_VALIDAS.includes(moneda)) {
      reparos.push(`«${concepto}» trae la moneda «${moneda}», que no es USD ni MXN. Habrá que confirmarla.`);
    }

    lineas.push({
      lineaId: typeof cruda.lineaId === 'string' ? cruda.lineaId : `tmp-${i + 1}`,
      concepto,
      puertoOrigen: typeof cruda.puertoOrigen === 'string' ? cruda.puertoOrigen : undefined,
      puertoDestino: typeof cruda.puertoDestino === 'string' ? cruda.puertoDestino : undefined,
      unidad: typeof cruda.unidad === 'string' ? cruda.unidad : undefined,
      monto,
      montoPor40: typeof cruda.montoPor40 === 'number' ? cruda.montoPor40 : undefined,
      montoPor40HC: typeof cruda.montoPor40HC === 'number' ? cruda.montoPor40HC : undefined,
      montoMinimo: typeof cruda.montoMinimo === 'number' ? cruda.montoMinimo : undefined,
      moneda: MONEDAS_VALIDAS.includes(moneda) ? moneda : undefined,
      tiempoTransito: typeof cruda.tiempoTransito === 'number' ? cruda.tiempoTransito : undefined,
      freeTime: typeof cruda.freeTime === 'number' ? cruda.freeTime : undefined,
      condiciones: typeof cruda.condiciones === 'string' ? cruda.condiciones : undefined,
      avisos: Array.isArray(cruda.avisos) ? cruda.avisos.filter(a => typeof a === 'string') as string[] : [],
      requiereRevision: cruda.requiereRevision === true,
    });
  });

  if (lineas.length === 0) {
    return { valida: false, motivo: 'Ninguna de las líneas extraídas es utilizable.', reparos };
  }

  // ── Vigencia ──────────────────────────────────────────────────────────────
  const fechaInicio = typeof bruto.fechaInicio === 'string' && ISO_FECHA.test(bruto.fechaInicio)
    ? bruto.fechaInicio : undefined;
  const fechaFin = typeof bruto.fechaFin === 'string' && ISO_FECHA.test(bruto.fechaFin)
    ? bruto.fechaFin : undefined;

  if (bruto.fechaInicio && !fechaInicio) reparos.push('La fecha de inicio no vino en formato AAAA-MM-DD.');
  if (bruto.fechaFin && !fechaFin) reparos.push('La fecha de fin no vino en formato AAAA-MM-DD.');
  if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
    reparos.push('La vigencia termina antes de empezar. Hay que corregir las fechas.');
  }

  const confianza = ['alta', 'media', 'baja'].includes(String(bruto.confianza))
    ? bruto.confianza as NivelConfianza
    : 'baja';
  if (confianza === 'baja') {
    reparos.push('El extractor reporta confianza baja: conviene revisar línea por línea.');
  }

  return {
    valida: true,
    reparos,
    datos: {
      ok: true,
      proveedor: typeof bruto.proveedor === 'string' ? bruto.proveedor.trim() : undefined,
      vigenciaTexto: typeof bruto.vigenciaTexto === 'string' ? bruto.vigenciaTexto.trim() : undefined,
      fechaInicio, fechaFin, confianza,
      observaciones: typeof bruto.observaciones === 'string' ? bruto.observaciones : undefined,
      totalLineas: lineas.length,
      lineasConAviso: lineas.filter(l => l.requiereRevision || (l.avisos?.length ?? 0) > 0).length,
      tarifas: lineas,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Avisos en lenguaje claro
// ─────────────────────────────────────────────────────────────────────────────

const TEXTO_AVISO: Record<string, string> = {
  falta_precio_40:        'Falta el precio de 40 pies',
  falta_precio_40hc:      'Falta el precio de 40 HC',
  falta_moneda:           'No se pudo determinar la moneda',
  falta_unidad:           'No se pudo determinar la unidad',
  falta_puerto_origen:    'No se identificó el puerto de origen',
  falta_puerto_destino:   'No se identificó el puerto de destino',
  falta_vigencia:         'El documento no indica vigencia',
  monto_ambiguo:          'El monto aparece de más de una forma en el documento',
  concepto_ambiguo:       'El concepto no está claro en el documento',
  moneda_inferida:        'La moneda se dedujo, no venía escrita',
  fuera_de_tabla:         'Se leyó fuera de la tabla principal',
};

/** Traduce el código del agente. Si es desconocido, lo muestra tal cual. */
export function textoDeAviso(codigo: string): string {
  return TEXTO_AVISO[codigo] ?? codigo.replace(/_/g, ' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Resolución de referencias
// ─────────────────────────────────────────────────────────────────────────────

export type NivelMatch = 'exacto' | 'sugerido' | 'sin_match';

export interface ReferenciaResuelta<T> {
  nivel: NivelMatch;
  /** El candidato. En 'sugerido' hay que confirmarlo antes de guardar. */
  match: T | null;
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/**
 * Resuelve el concepto contra el catálogo de 105.
 *
 * Distingue exacto de parecido a propósito: un parecido aceptado a ciegas es
 * cómo «Almacenaje IN» termina apuntando a «Almacenaje OUT».
 */
export function resolverConcepto(
  nombre: string,
  conceptos: ConceptoMatch[],
): ReferenciaResuelta<ConceptoMatch> {
  const q = norm(nombre);
  if (!q) return { nivel: 'sin_match', match: null };

  const exacto = conceptos.find(c => norm(c.nombre) === q);
  if (exacto) return { nivel: 'exacto', match: exacto };

  const parecido = matchConceptByName(nombre, conceptos);
  if (parecido) return { nivel: 'sugerido', match: parecido };

  return { nivel: 'sin_match', match: null };
}

export interface PuertoMatch {
  id: string;
  nombre: string;
  codigo?: string;
}

/** Resuelve un puerto por nombre o por código (MZO, SHA). */
export function resolverPuerto(
  texto: string | undefined,
  puertos: PuertoMatch[],
): ReferenciaResuelta<PuertoMatch> {
  if (!texto?.trim()) return { nivel: 'sin_match', match: null };
  const q = norm(texto);

  const porCodigo = puertos.find(p => p.codigo && norm(p.codigo) === q);
  if (porCodigo) return { nivel: 'exacto', match: porCodigo };

  const porNombre = puertos.find(p => norm(p.nombre) === q);
  if (porNombre) return { nivel: 'exacto', match: porNombre };

  const parcial = puertos.find(p => norm(p.nombre).includes(q) || q.includes(norm(p.nombre)));
  if (parcial) return { nivel: 'sugerido', match: parcial };

  return { nivel: 'sin_match', match: null };
}

export interface ProveedorMatch {
  id: string;
  nombre: string;
}

/** Resuelve el proveedor del tarifario. Se hace una vez, no por línea. */
export function resolverProveedor(
  nombre: string | undefined,
  proveedores: ProveedorMatch[],
): ReferenciaResuelta<ProveedorMatch> {
  if (!nombre?.trim()) return { nivel: 'sin_match', match: null };
  const q = norm(nombre);

  const exacto = proveedores.find(p => norm(p.nombre) === q);
  if (exacto) return { nivel: 'exacto', match: exacto };

  const parcial = proveedores.find(p => norm(p.nombre).includes(q) || q.includes(norm(p.nombre)));
  if (parcial) return { nivel: 'sugerido', match: parcial };

  return { nivel: 'sin_match', match: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Estado de una línea en revisión
// ─────────────────────────────────────────────────────────────────────────────

export interface LineaEnRevision {
  lineaId: string;
  extraida: LineaExtraida;

  /** Resuelto o confirmado por el usuario. Sin esto NO se guarda. */
  conceptoId: string | null;
  conceptoNombre: string;
  nivelConcepto: NivelMatch;

  puertoOrigenId: string | null;
  puertoDestinoId: string | null;
  /** Ruta en texto cuando los puertos no se resolvieron. El modelo lo admite. */
  rutaTexto: string | null;

  monto: number;
  montoPor40?: number;
  montoPor40HC?: number;
  montoMinimo?: number;
  moneda: 'USD' | 'MXN' | null;
  unidad: UnidadTarifa | null;

  /**
   * Moneda y unidad confirmadas a mano.
   *
   * No basta con que sean editables: un 1,200 que era MXN cargado como USD se
   * ve perfectamente bien en la pantalla de revisión y nadie lo atrapa hasta
   * que llega la factura. Por eso son confirmación explícita.
   */
  monedaConfirmada: boolean;
  unidadConfirmada: boolean;

  descartada: boolean;
}

export type MotivoNoGuardable =
  | 'sin_concepto'
  | 'concepto_sin_confirmar'
  | 'sin_moneda'
  | 'moneda_sin_confirmar'
  | 'sin_unidad'
  | 'unidad_sin_confirmar'
  | 'monto_invalido';

export const TEXTO_MOTIVO: Record<MotivoNoGuardable, string> = {
  sin_concepto:          'Falta elegir el concepto del catálogo',
  concepto_sin_confirmar:'El concepto es una sugerencia: hay que confirmarlo',
  sin_moneda:            'Falta la moneda',
  moneda_sin_confirmar:  'Confirma la moneda',
  sin_unidad:            'Falta la unidad',
  unidad_sin_confirmar:  'Confirma la unidad',
  monto_invalido:        'El monto debe ser mayor a cero',
};

/**
 * ¿Esta línea se puede guardar?
 *
 * La regla dura: sin `conceptoId` NO se guarda. Una tarifa sin concepto existe
 * en la base y es invisible para el panel de tarifas, así que se cargaría
 * «bien» y no aparecería nunca. Es el mismo agujero que cerró CC-1..CC-4.
 */
export function motivosNoGuardable(l: LineaEnRevision): MotivoNoGuardable[] {
  const motivos: MotivoNoGuardable[] = [];

  if (!l.conceptoId) motivos.push('sin_concepto');
  else if (l.nivelConcepto === 'sugerido') motivos.push('concepto_sin_confirmar');

  if (!l.moneda) motivos.push('sin_moneda');
  else if (!l.monedaConfirmada) motivos.push('moneda_sin_confirmar');

  if (!l.unidad) motivos.push('sin_unidad');
  else if (!l.unidadConfirmada) motivos.push('unidad_sin_confirmar');

  if (!Number.isFinite(l.monto) || l.monto <= 0) motivos.push('monto_invalido');

  return motivos;
}

export function esGuardable(l: LineaEnRevision): boolean {
  return !l.descartada && motivosNoGuardable(l).length === 0;
}

/** Resumen para el encabezado: «12 líneas · 2 requieren revisión». */
export function resumenRevision(lineas: LineaEnRevision[]) {
  const activas = lineas.filter(l => !l.descartada);
  const guardables = activas.filter(esGuardable);
  return {
    total: lineas.length,
    descartadas: lineas.length - activas.length,
    guardables: guardables.length,
    requierenRevision: activas.length - guardables.length,
  };
}

/**
 * Ordena para la pantalla: primero lo que necesita atención.
 *
 * Con cuarenta líneas, las dos que fallan se pierden al final de la tabla si
 * se respeta el orden del documento.
 */
export function ordenarParaRevision(lineas: LineaEnRevision[]): LineaEnRevision[] {
  return [...lineas].sort((a, b) => {
    if (a.descartada !== b.descartada) return a.descartada ? 1 : -1;
    const fa = motivosNoGuardable(a).length > 0 ? 0 : 1;
    const fb = motivosNoGuardable(b).length > 0 ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return 0;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 · Duplicados contra el catálogo vivo
// ─────────────────────────────────────────────────────────────────────────────

export type AccionDuplicado = 'omitir' | 'reemplazar' | 'crear_igual';

export interface Colision {
  lineaId: string;
  /** La tarifa activa que ya cubre lo mismo. */
  tarifaExistente: TarifaVermur;
  detalle: string;
}

/** ¿Se traslapan dos vigencias? Sin fecha de fin = abierta hacia adelante. */
export function vigenciasSeTraslapan(
  aInicio: string, aFin: string | null,
  bInicio: string, bFin: string | null,
): boolean {
  const finA = aFin ?? '9999-12-31';
  const finB = bFin ?? '9999-12-31';
  return aInicio <= finB && bInicio <= finA;
}

/**
 * Busca tarifas activas que ya cubran lo mismo.
 *
 * Llave natural: proveedor + concepto + ruta + traslape de vigencia. Sin esta
 * detección, subir el tarifario de septiembre encima del de agosto duplica
 * todo y el panel empieza a ofrecer dos precios para el mismo servicio.
 */
export function detectarColisiones(
  lineas: LineaEnRevision[],
  proveedorId: string,
  vigencia: { fechaInicio: string; fechaFin: string | null },
  tarifasActivas: TarifaVermur[],
): Colision[] {
  const colisiones: Colision[] = [];

  lineas.filter(l => !l.descartada && l.conceptoId).forEach(l => {
    const existente = tarifasActivas.find(t =>
      t.activo &&
      t.proveedorId === proveedorId &&
      t.conceptoId === l.conceptoId &&
      t.puertoOrigenId === l.puertoOrigenId &&
      t.puertoDestinoId === l.puertoDestinoId &&
      vigenciasSeTraslapan(vigencia.fechaInicio, vigencia.fechaFin, t.fechaInicio, t.fechaFin)
    );

    if (existente) {
      colisiones.push({
        lineaId: l.lineaId,
        tarifaExistente: existente,
        detalle: `Ya existe una tarifa activa de este proveedor para «${l.conceptoNombre}» en la misma ruta, vigente ${existente.fechaInicio} → ${existente.fechaFin ?? 'sin fin'}.`,
      });
    }
  });

  return colisiones;
}
