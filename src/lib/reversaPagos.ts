/**
 * reversaPagos.ts — tarea 72 · P5, §1.5 y §7.3 del plan de pagos
 *
 * La ficha del pago: qué se le puede hacer a un movimiento de dinero que ya
 * existe. Tres cosas, y ninguna borra nada:
 *
 *  1. **Aplicar el saldo a favor** a otra factura del mismo cliente y moneda.
 *  2. **Quitar una aplicación**: el dinero vuelve a estar «sin aplicar».
 *  3. **Anular el pago completo.**
 *
 * Las tres piden MOTIVO (una corrección sin motivo es una corrección que
 * nadie puede revisar), y lo que no cabe en el modelo del pago se anota en la
 * bitácora del embarque — ver «Dónde queda el motivo».
 *
 * ── Dónde queda el motivo ─────────────────────────────────────────────────
 * `Pago` no tiene campos de anulación y la tarea 72 dice «Modelo: no», así
 * que el motivo, el autor y la fecha viajan a la bitácora de cada embarque que
 * el pago tocó (`anotarBitacora`) y la ficha los lee de ahí. La aplicación que
 * se quita sí sale de `aplicaciones[]`: su rastro es la entrada de bitácora.
 * Si se aprueban campos propios (`anulacion`, `aplicacionesQuitadas`) la
 * ficha deja de depender de la bitácora; ver el reporte.
 *
 * ── Lo que NO hace ────────────────────────────────────────────────────────
 * Un pago leído de lo viejo (`cobros/`, `depositosCliente/`) NO se reaplica ni
 * se le quita una aplicación: esas colecciones son de solo lectura desde P2 y
 * escribir ahí un campo que su modelo no tiene es el cambio de modelo que el
 * contrato prohíbe. Sí se anula (`coleccionDelPago` decide dónde).
 *
 * Sin React, sin Firestore.
 */

import type { AplicacionPago, LadoPago, Pago } from './pagos';
import { aplicado, sinAplicar } from './pagos';
import type { EntradaBitacora } from '../components/shipments/EmbarquesData';
import { contiene } from './texto';
import { sumarPorMoneda, type TotalPorMoneda } from './sumarPorMoneda';

const redondear = (n: number) => Math.round(n * 100) / 100;
/** La tolerancia de `saldoDeFactura`: un peso de redondeo no es una deuda. */
const TOLERANCIA = 1;
const money = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// 1 · El motivo
// ─────────────────────────────────────────────────────────────────────────────

export const MOTIVO_MINIMO = 4;

/** Qué impide guardar el motivo. null = sirve. */
export function problemaMotivo(motivo: string): string | null {
  const t = (motivo ?? '').trim();
  if (t.length === 0) return 'Escribe el motivo: sin él, nadie sabrá después por qué se corrigió.';
  if (t.length < MOTIVO_MINIMO) return 'El motivo es muy corto para explicar qué pasó.';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Estado y lista
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoPago = 'aplicado' | 'parcial' | 'sin_aplicar' | 'anulado';

export const ETIQUETA_ESTADO_PAGO: Record<EstadoPago, string> = {
  aplicado: 'Aplicado',
  parcial: 'Parcial',
  sin_aplicar: 'Sin aplicar',
  anulado: 'Anulado',
};

/**
 * El estado, derivado: nada se guarda.
 *
 *  - anulado     → `activo === false`
 *  - sin_aplicar → vivo y no se le ha aplicado ni un peso (un anticipo)
 *  - parcial     → algo aplicado y todavía sobra
 *  - aplicado    → lo que sobra no pasa de la tolerancia
 */
export function estadoDePago(p: Pick<Pago, 'activo' | 'monto' | 'moneda' | 'aplicaciones'>): EstadoPago {
  if (p.activo === false) return 'anulado';
  const ap = aplicado(p);
  if (ap <= 0) return 'sin_aplicar';
  return sinAplicar(p) > TOLERANCIA ? 'parcial' : 'aplicado';
}

/** El «a favor del cliente»: lo que del pago no cubre nada. Un anulado no tiene. */
export function aFavorDe(p: Pick<Pago, 'activo' | 'monto' | 'moneda' | 'aplicaciones'>): number {
  if (p.activo === false) return 0;
  const s = sinAplicar(p);
  return s > TOLERANCIA ? s : 0;
}

/** Un pago que vive en `pagos/` (lo registrado desde P2). Lo viejo es de solo lectura. */
export const esPagoEditable = (p: Pick<Pago, 'origen'>) => !p.origen || p.origen === 'app';

export type FiltroEstadoPago = 'vigentes' | 'todos' | EstadoPago;

export interface FiltrosPagos {
  /** 'vigentes' = todo menos lo anulado (default). */
  estado: FiltroEstadoPago;
  /** Id del cliente. '' = todos. */
  clienteId: string;
  moneda: 'USD' | 'MXN' | '';
  /** Mes del movimiento, YYYY-MM. '' = todos. */
  mes: string;
  /** Folio, cliente, referencia o folio de factura aplicada. */
  busqueda: string;
  /** Tarea 80 · Quién movió el dinero: el cliente (entra) o Vermur al proveedor (sale). '' = los dos. */
  lado: LadoPago | '';
}

export const FILTROS_PAGOS_VACIOS: FiltrosPagos = {
  estado: 'vigentes', clienteId: '', moneda: '', mes: '', busqueda: '', lado: '',
};

const ESTADOS_VALIDOS: EstadoPago[] = ['aplicado', 'parcial', 'sin_aplicar', 'anulado'];

export function aplicarFiltrosPagos(pagos: readonly Pago[], f: FiltrosPagos): Pago[] {
  const q = f.busqueda.trim();
  return pagos.filter(p => {
    const e = estadoDePago(p);
    if (f.estado === 'vigentes') { if (e === 'anulado') return false; }
    else if (f.estado !== 'todos' && e !== f.estado) return false;
    if (f.lado && p.lado !== f.lado) return false;
    if (f.clienteId && p.terceroId !== f.clienteId) return false;
    if (f.moneda && p.moneda !== f.moneda) return false;
    if (f.mes && (p.fecha ?? '').slice(0, 7) !== f.mes) return false;
    if (q) {
      const texto = [
        p.folio, p.terceroNombre, p.referencia, p.banco,
        ...(p.aplicaciones ?? []).map(a => a.destinoNumero),
      ].filter(Boolean).join(' ');
      if (!contiene(texto, q)) return false;
    }
    return true;
  });
}

export function mesesDePagos(pagos: readonly Pago[]): string[] {
  const meses = new Set<string>();
  pagos.forEach(p => {
    const m = (p.fecha ?? '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(m)) meses.add(m);
  });
  return [...meses].sort().reverse();
}

/** Lo vigente, por moneda (§4.3): nunca un total mezclado. */
export function totalesDePagos(pagos: readonly Pago[]): {
  entrado: TotalPorMoneda; aplicado: TotalPorMoneda; aFavor: TotalPorMoneda;
} {
  const vivos = pagos.filter(p => p.activo !== false);
  return {
    entrado: sumarPorMoneda(vivos, p => p.monto, p => p.moneda),
    aplicado: sumarPorMoneda(vivos, p => aplicado(p), p => p.moneda),
    aFavor: sumarPorMoneda(vivos, p => aFavorDe(p), p => p.moneda),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Ida y vuelta con la vista guardada (mismo formato que filtrosFinanzas)
// ─────────────────────────────────────────────────────────────────────────────

export function filtrosPagosActivos(f: FiltrosPagos): number {
  return (Object.keys(FILTROS_PAGOS_VACIOS) as (keyof FiltrosPagos)[])
    .filter(k => String(f[k] ?? '').trim() !== '' && f[k] !== FILTROS_PAGOS_VACIOS[k]).length;
}

export function filtrosPagosParaVista(f: FiltrosPagos): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const k of Object.keys(FILTROS_PAGOS_VACIOS) as (keyof FiltrosPagos)[]) {
    if (f[k] && f[k] !== FILTROS_PAGOS_VACIOS[k]) out[k] = f[k];
  }
  return out;
}

/** De la vista a filtros válidos. Lo desconocido se descarta. */
export function filtrosPagosDesdeVista(
  guardados: Record<string, string | null> | undefined,
): FiltrosPagos {
  const f: FiltrosPagos = { ...FILTROS_PAGOS_VACIOS };
  if (!guardados) return f;
  for (const k of Object.keys(FILTROS_PAGOS_VACIOS) as (keyof FiltrosPagos)[]) {
    const v = guardados[k];
    if (typeof v === 'string') (f as unknown as Record<string, string>)[k] = v;
  }
  if (f.estado !== 'vigentes' && f.estado !== 'todos' && !ESTADOS_VALIDOS.includes(f.estado as EstadoPago)) {
    f.estado = 'vigentes';
  }
  if (f.moneda !== 'USD' && f.moneda !== 'MXN') f.moneda = '';
  if (f.lado !== 'cliente' && f.lado !== 'proveedor') f.lado = '';
  if (!/^\d{4}-\d{2}$/.test(f.mes)) f.mes = '';
  return f;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Qué se le puede hacer a un pago
// ─────────────────────────────────────────────────────────────────────────────

/** Por qué NO se puede reaplicar o quitar una aplicación. null = se puede. */
export function motivoNoEditable(p: Pago): string | null {
  if (p.activo === false) return 'Este pago está anulado: no se le puede aplicar ni quitar nada.';
  if (p.lado === 'proveedor') {
    return 'Un pago a proveedor no se reaplica ni se le quita una orden: se anula completo, '
      + 'y cada orden que cubría regresa a «autorizada».';
  }
  if (!esPagoEditable(p)) {
    return 'Es un registro anterior (de Cobros o Depósitos): se lee y se puede anular, '
      + 'pero no se reaplica porque esas colecciones ya no se escriben.';
  }
  return null;
}

/**
 * Quitar UNA aplicación: el pago sin ella, listo para guardar.
 *
 * Lanza si el pago no se puede editar o si esa factura no está entre sus
 * aplicaciones: quitar «nada» se vería como un éxito.
 *
 * **`embarqueIds` se recalcula con cuidado, y falla cerrado.** Es lo que hace
 * fondear a un embarque (`entradasDeFondeo`):
 *  - si quedan aplicaciones, es el de las que quedan (resuelto con
 *    `embarqueDeDestino`; las que no resuelven conservan lo que había);
 *  - si no queda ninguna y el pago tocaba UN embarque, ese embarque sigue
 *    siendo el destino del dinero que volvió a quedar sin aplicar;
 *  - si no queda ninguna y tocaba VARIOS, queda en `[]`: el dinero queda a
 *    favor del cliente sin embarque. Dejarlo en los dos contaría el monto
 *    completo en cada uno, e inflar el fondeo autoriza un pago descubierto.
 */
export function pagoSinAplicacion(
  pago: Pago,
  destinoId: string,
  embarqueDeDestino?: (destinoId: string) => string | null | undefined,
): { aplicaciones: AplicacionPago[]; destinoIds: string[]; embarqueIds: string[]; quitadas: AplicacionPago[] } {
  const razon = motivoNoEditable(pago);
  if (razon) throw new Error(razon);

  const quitadas = (pago.aplicaciones ?? []).filter(a => a.destinoId === destinoId);
  if (quitadas.length === 0) {
    throw new Error(`El pago ${pago.folio} no tiene ninguna aplicación a ${destinoId}.`);
  }
  const aplicaciones = (pago.aplicaciones ?? []).filter(a => a.destinoId !== destinoId);
  const destinoIds = [...new Set(aplicaciones.map(a => a.destinoId))];

  let embarqueIds: string[];
  if (aplicaciones.length === 0) {
    embarqueIds = (pago.embarqueIds ?? []).length === 1 ? [...pago.embarqueIds] : [];
  } else if (embarqueDeDestino) {
    const resueltos = aplicaciones.map(a => embarqueDeDestino(a.destinoId));
    embarqueIds = resueltos.some(e => !e)
      ? [...(pago.embarqueIds ?? [])]
      : [...new Set(resueltos as string[])];
  } else {
    embarqueIds = [...(pago.embarqueIds ?? [])];
  }

  return { aplicaciones, destinoIds, embarqueIds, quitadas };
}

/**
 * Aplicar el saldo a favor: el pago CON las aplicaciones nuevas.
 *
 * Lo valida otra vez aquí además de la pantalla —el botón se puede esquivar,
 * y un pago que liquida 130,000 con 120,000 se ve perfectamente bien— con las
 * mismas reglas de `construirPagoAplicado`: misma moneda, monto mayor que
 * cero, y lo aplicado no pasa de lo que el pago movió.
 */
export function pagoConAplicaciones(
  pago: Pago,
  nuevas: readonly AplicacionPago[],
  embarqueIdsNuevos: readonly string[],
): { aplicaciones: AplicacionPago[]; destinoIds: string[]; embarqueIds: string[] } {
  const razon = motivoNoEditable(pago);
  if (razon) throw new Error(razon);
  if (nuevas.length === 0) throw new Error('No hay nada que aplicar: elige al menos una factura.');

  for (const a of nuevas) {
    if (!a.destinoId) throw new Error('Hay una aplicación sin factura.');
    if (!Number.isFinite(a.monto) || a.monto <= 0) {
      throw new Error(`La aplicación a ${a.destinoNumero || a.destinoId} no tiene monto.`);
    }
    if (a.moneda !== pago.moneda) {
      throw new Error(
        `La aplicación a ${a.destinoNumero || a.destinoId} está en ${a.moneda} y el pago en `
        + `${pago.moneda}. Un pago no se aplica a destinos de otra moneda (§4.3).`,
      );
    }
  }

  const aplicaciones = [...(pago.aplicaciones ?? []), ...nuevas];
  const total = redondear(aplicaciones.reduce((acc, a) => acc + a.monto, 0));
  if (total > pago.monto + TOLERANCIA) {
    throw new Error(
      `Se está aplicando ${money(total)} de un pago de ${money(pago.monto)}: `
      + `sobran ${money(total - pago.monto)} que no entraron al banco.`,
    );
  }

  return {
    aplicaciones,
    destinoIds: [...new Set(aplicaciones.map(a => a.destinoId))],
    embarqueIds: [...new Set([...(pago.embarqueIds ?? []), ...embarqueIdsNuevos.filter(Boolean)])],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 · El rastro en la bitácora del embarque
// ─────────────────────────────────────────────────────────────────────────────

export function textoAnulacion(p: Pick<Pago, 'folio' | 'terceroNombre'>, quien: string, motivo: string) {
  return {
    titulo: `${quien} anuló el pago ${p.folio} de ${p.terceroNombre}`,
    detalle: `Motivo: ${motivo.trim()}`,
  };
}

export function textoAplicacionQuitada(
  p: Pick<Pago, 'folio' | 'moneda'>, a: Pick<AplicacionPago, 'destinoNumero' | 'monto'>,
  quien: string, motivo: string,
) {
  return {
    titulo: `${quien} quitó la aplicación de ${p.folio} a ${a.destinoNumero}`,
    detalle: `${p.moneda} ${money(a.monto)} vuelven a quedar sin aplicar · Motivo: ${motivo.trim()}`,
  };
}

export function textoAplicacionNueva(
  p: Pick<Pago, 'folio' | 'moneda'>, nuevas: readonly Pick<AplicacionPago, 'destinoNumero' | 'monto'>[],
  quien: string,
) {
  const total = redondear(nuevas.reduce((acc, a) => acc + a.monto, 0));
  return {
    titulo: `${quien} aplicó saldo a favor de ${p.folio} a ${nuevas.map(a => a.destinoNumero).join(', ')}`,
    detalle: `${p.moneda} ${money(total)}`,
  };
}

/**
 * Las entradas de bitácora que hablan de este pago, la más reciente primero.
 *
 * Se reconocen por el folio dentro del título: es lo único que une la
 * bitácora con el pago sin agregarle un campo al modelo. Un pago leído de lo
 * viejo tiene el id del cobro por folio, y también lo encuentra.
 */
export function bitacoraDelPago(
  folio: string,
  bitacoras: readonly (readonly EntradaBitacora[] | undefined)[],
): EntradaBitacora[] {
  if (!folio) return [];
  const vistas = new Set<string>();
  const out: EntradaBitacora[] = [];
  for (const b of bitacoras) {
    for (const e of b ?? []) {
      if (e.evento !== 'cobro' || vistas.has(e.id)) continue;
      const texto = `${e.titulo} ${e.detalle ?? ''}`;
      if (!texto.includes(folio)) continue;
      if (!/anul|quit|aplic/i.test(e.titulo)) continue;
      vistas.add(e.id);
      out.push(e);
    }
  }
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// ─────────────────────────────────────────────────────────────────────────────
// 6 · Las correcciones de un pago: el Pago primero, la bitácora para lo viejo
// ─────────────────────────────────────────────────────────────────────────────

export interface CorreccionDePago {
  id: string;
  titulo: string;
  /** ISO 8601. */
  fecha: string;
  detalle?: string;
  /** De dónde se leyó: el pago mismo o la bitácora de un embarque (anterior a la tarea 79). */
  fuente: 'pago' | 'bitacora';
}

/**
 * Tarea 79 · Lo que se le hizo a un pago, la más reciente primero.
 *
 * `Pago.anulacion` y `Pago.aplicacionesQuitadas` mandan. La bitácora solo
 * aporta lo que el pago no dice: una anulación o una aplicación quitada
 * ANTES de esta tarea (no traen campo) y las aplicaciones nuevas de saldo.
 * Una entrada de bitácora que el pago ya cubre no se repite: se reconoce por
 * la factura y el motivo, que es lo único que ambos lados comparten.
 */
export function correccionesDelPago(
  pago: Pick<Pago, 'folio' | 'terceroNombre' | 'moneda' | 'anulacion' | 'aplicacionesQuitadas'>,
  bitacoras: readonly (readonly EntradaBitacora[] | undefined)[],
): CorreccionDePago[] {
  const out: CorreccionDePago[] = [];
  const quitadas = pago.aplicacionesQuitadas ?? [];

  if (pago.anulacion) {
    const t = textoAnulacion(pago, pago.anulacion.por, pago.anulacion.motivo);
    out.push({ id: `anulacion-${pago.folio}`, titulo: t.titulo, fecha: pago.anulacion.en, detalle: t.detalle, fuente: 'pago' });
  }
  quitadas.forEach((q, i) => {
    const t = textoAplicacionQuitada(pago, q, q.por, q.motivo);
    out.push({ id: `quitada-${pago.folio}-${i}`, titulo: t.titulo, fecha: q.en, detalle: t.detalle, fuente: 'pago' });
  });

  for (const e of bitacoraDelPago(pago.folio, bitacoras)) {
    const esAnulacion = /anul/i.test(e.titulo);
    const esQuitada = /quit/i.test(e.titulo);
    if (esAnulacion && pago.anulacion) continue;
    if (esQuitada && quitadas.some(q =>
      e.titulo.includes(q.destinoNumero) && (e.detalle ?? '').includes(`Motivo: ${q.motivo.trim()}`))) continue;
    out.push({ id: e.id, titulo: e.titulo, fecha: e.fecha, detalle: e.detalle, fuente: 'bitacora' });
  }
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
}
