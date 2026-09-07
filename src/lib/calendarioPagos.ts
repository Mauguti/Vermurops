/**
 * calendarioPagos.ts (1.4)
 *
 * Cuándo se paga: crédito en días NATURALES, pago en días HÁBILES.
 *
 * ── La regla y por qué se ve rara ──────────────────────────────────────────
 * El crédito corre en días naturales —el proveedor cuenta 30 días de
 * calendario, no 30 días de oficina— pero el pago solo se ejecuta en día
 * hábil, porque el banco no mueve dinero en fin de semana ni en festivo.
 *
 * Cuando el vencimiento cae en fin de semana, se recorre al LUNES (§4.7).
 * Hacia adelante, no hacia atrás: adelantar el pago al viernes regala días
 * de crédito que Vermur necesita, y la regla del cliente dice lunes.
 *
 * ── Excepciones por proveedor ──────────────────────────────────────────────
 * Algunos no cobran cualquier día:
 *   · Oñate — solo viernes
 *   · Aseguranza Peninsular — consolidado mensual
 * No son casos de borde: son acuerdos comerciales, y programar un pago fuera
 * de su día hace que rebote y que alguien lo persiga por teléfono.
 *
 * Sin React, sin Firestore, sin red.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Días festivos
//
// Configurable, no hardcodeada: los festivos cambian cada año y por decreto.
// Esta lista es el default de arranque (días de descanso obligatorio del
// artículo 74 de la LFT para 2026) y Administración debería poder editarla.
//
// ⚠️ DECISIÓN MARCADA (7-sep-2026): la lista vive en código hasta que exista
// la pantalla para editarla. Los bancos también cierran en algunos días que
// no son de descanso obligatorio; falta confirmar con Vermur cuáles observan.
// ─────────────────────────────────────────────────────────────────────────────

export const FESTIVOS_2026 = [
  '2026-01-01', // Año nuevo
  '2026-02-02', // Constitución (primer lunes de febrero)
  '2026-03-16', // Natalicio de Juárez (tercer lunes de marzo)
  '2026-05-01', // Día del trabajo
  '2026-09-16', // Independencia
  '2026-11-16', // Revolución (tercer lunes de noviembre)
  '2026-12-25', // Navidad
];

/** Fechas ISO (YYYY-MM-DD) que no son hábiles además de sábados y domingos. */
export type Festivos = readonly string[];

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Aritmética de fechas, sin zona horaria
//
// Se opera sobre 'YYYY-MM-DD' con Date en UTC a propósito: `new Date('2026-09-15')`
// en un navegador de México crea el día anterior a las 18:00, y sumar días
// sobre eso corre el vencimiento un día. Los pagos no admiten ese error.
// ─────────────────────────────────────────────────────────────────────────────

const aUTC = (iso: string): Date => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};

const aISO = (fecha: Date): string => fecha.toISOString().slice(0, 10);

/** Día de la semana en UTC: 0 domingo … 6 sábado. */
const diaSemana = (iso: string): number => aUTC(iso).getUTCDay();

export function esFinDeSemana(iso: string): boolean {
  const d = diaSemana(iso);
  return d === 0 || d === 6;
}

export function esHabil(iso: string, festivos: Festivos = FESTIVOS_2026): boolean {
  return !esFinDeSemana(iso) && !festivos.includes(iso);
}

export function sumarDiasNaturales(iso: string, dias: number): string {
  const f = aUTC(iso);
  f.setUTCDate(f.getUTCDate() + dias);
  return aISO(f);
}

/**
 * El siguiente día hábil, contando el mismo día si ya lo es.
 *
 * Siempre hacia ADELANTE: adelantar el pago regala días de crédito, y la
 * regla del cliente para el fin de semana es el lunes.
 */
export function siguienteHabil(iso: string, festivos: Festivos = FESTIVOS_2026): string {
  let f = iso;
  // 10 iteraciones cubren cualquier puente imaginable sin poder colgarse.
  for (let i = 0; i < 10 && !esHabil(f, festivos); i++) {
    f = sumarDiasNaturales(f, 1);
  }
  return f;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Excepciones por proveedor
// ─────────────────────────────────────────────────────────────────────────────

export type RegimenPago =
  | { tipo: 'normal' }
  /** Solo cobra cierto día de la semana. 1 = lunes … 5 = viernes. */
  | { tipo: 'dia_fijo'; diaSemana: number }
  /** Se consolida y se paga una vez al mes. */
  | { tipo: 'mensual'; diaDelMes: number };

/**
 * ⚠️ DECISIÓN MARCADA: las excepciones se identifican por NOMBRE del
 * proveedor porque el catálogo no tiene un campo de régimen de pago. Es
 * frágil —un cambio de razón social la rompe— pero agregar el campo exige
 * capturarlo en 544 proveedores. Cuando Vermur lo pida, esto pasa a
 * `proveedor.regimenPago` y la lista desaparece.
 *
 * Del día del mes para el consolidado no hay dato: se propone el último día
 * hábil del mes, que es lo habitual en pólizas de seguro.
 */
const EXCEPCIONES_POR_NOMBRE: { patron: RegExp; regimen: RegimenPago; etiqueta: string }[] = [
  { patron: /o[ñn]ate/i, regimen: { tipo: 'dia_fijo', diaSemana: 5 }, etiqueta: 'Oñate cobra solo los viernes.' },
  { patron: /aseguranza\s+peninsular/i, regimen: { tipo: 'mensual', diaDelMes: 31 }, etiqueta: 'Aseguranza Peninsular se paga consolidado una vez al mes.' },
];

export function regimenDe(proveedorNombre: string): { regimen: RegimenPago; etiqueta?: string } {
  const hit = EXCEPCIONES_POR_NOMBRE.find(e => e.patron.test(proveedorNombre));
  return hit ? { regimen: hit.regimen, etiqueta: hit.etiqueta } : { regimen: { tipo: 'normal' } };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 · La fecha de pago
// ─────────────────────────────────────────────────────────────────────────────

export interface ProgramacionPago {
  /** Cuándo vence el crédito, en días naturales. */
  fechaVencimiento: string;
  /** Cuándo se ejecuta el pago: hábil y respetando el régimen del proveedor. */
  fechaPago: string;
  /** Qué se aplicó, para que la fecha no parezca arbitraria. */
  explicacion: string;
}

/**
 * Programa el pago de una factura.
 *
 * @param fechaBase   desde cuándo corre el crédito (factura o requerimiento)
 * @param diasCredito días NATURALES de crédito del proveedor
 */
export function programarPago(
  fechaBase: string,
  diasCredito: number,
  proveedorNombre = '',
  festivos: Festivos = FESTIVOS_2026,
): ProgramacionPago {
  const fechaVencimiento = sumarDiasNaturales(fechaBase, Math.max(0, diasCredito));
  const { regimen, etiqueta } = regimenDe(proveedorNombre);

  const partes: string[] = [];
  if (diasCredito > 0) partes.push(`${diasCredito} días naturales de crédito`);

  let fechaPago = siguienteHabil(fechaVencimiento, festivos);
  if (fechaPago !== fechaVencimiento) {
    partes.push(esFinDeSemana(fechaVencimiento)
      ? 'el vencimiento cayó en fin de semana y se recorrió al siguiente hábil'
      : 'el vencimiento cayó en día festivo y se recorrió al siguiente hábil');
  }

  if (regimen.tipo === 'dia_fijo') {
    fechaPago = siguienteDiaDeLaSemana(fechaPago, regimen.diaSemana, festivos);
    if (etiqueta) partes.push(etiqueta.toLowerCase().replace(/\.$/, ''));
  } else if (regimen.tipo === 'mensual') {
    fechaPago = ultimoHabilDelMes(fechaPago, festivos);
    if (etiqueta) partes.push(etiqueta.toLowerCase().replace(/\.$/, ''));
  }

  return {
    fechaVencimiento,
    fechaPago,
    explicacion: partes.length > 0
      ? `Se aplicó: ${partes.join('; ')}.`
      : 'Pago de contado, en el siguiente día hábil.',
  };
}

/** El siguiente día de la semana pedido, sin retroceder nunca. */
export function siguienteDiaDeLaSemana(
  iso: string,
  dia: number,
  festivos: Festivos = FESTIVOS_2026,
): string {
  let f = iso;
  for (let i = 0; i < 14; i++) {
    if (diaSemana(f) === dia && esHabil(f, festivos)) return f;
    f = sumarDiasNaturales(f, 1);
  }
  return siguienteHabil(iso, festivos);
}

/** El último día hábil del mes de `iso`. */
export function ultimoHabilDelMes(iso: string, festivos: Festivos = FESTIVOS_2026): string {
  const f = aUTC(iso);
  const ultimo = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0));
  let candidato = aISO(ultimo);
  for (let i = 0; i < 10 && !esHabil(candidato, festivos); i++) {
    candidato = sumarDiasNaturales(candidato, -1);
  }
  return candidato;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 · Agrupación por proveedor
//
// «Agrupar facturas del mismo proveedor con comprobante detallando folios»:
// una transferencia por proveedor y día, no una por factura. El comprobante
// tiene que decir qué folios cubre o el proveedor no sabe qué le pagaron.
// ─────────────────────────────────────────────────────────────────────────────

export interface GrupoDePago<T> {
  proveedorId: string;
  proveedorNombre: string;
  fechaPago: string;
  moneda: string;
  /** Las órdenes que se pagan juntas. */
  items: T[];
  total: number;
  /** Los folios, para el comprobante. */
  folios: string[];
}

/**
 * Agrupa por proveedor + fecha + MONEDA.
 *
 * La moneda es parte de la llave, no un detalle: dos facturas del mismo
 * proveedor en monedas distintas son dos transferencias, y sumarlas daría un
 * total que no existe (§4.3).
 */
export function agruparParaPago<T extends {
  proveedorId: string; proveedorNombre: string; folio: string; monto: number; moneda: string;
}>(
  items: T[],
  fechaPagoDe: (item: T) => string,
): GrupoDePago<T>[] {
  const mapa = new Map<string, GrupoDePago<T>>();

  for (const item of items) {
    const fechaPago = fechaPagoDe(item);
    const clave = `${item.proveedorId}::${fechaPago}::${item.moneda}`;
    const grupo = mapa.get(clave) ?? {
      proveedorId: item.proveedorId,
      proveedorNombre: item.proveedorNombre,
      fechaPago, moneda: item.moneda,
      items: [], total: 0, folios: [],
    };
    grupo.items.push(item);
    grupo.total = Math.round((grupo.total + item.monto) * 100) / 100;
    grupo.folios.push(item.folio);
    mapa.set(clave, grupo);
  }

  return [...mapa.values()].sort(
    (a, b) => a.fechaPago.localeCompare(b.fechaPago)
      || a.proveedorNombre.localeCompare(b.proveedorNombre, 'es'),
  );
}
