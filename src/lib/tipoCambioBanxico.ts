/**
 * tipoCambioBanxico.ts
 *
 * Lógica pura del tipo de cambio automático desde Banxico.
 *
 * ── El dato ──────────────────────────────────────────────────────────────────
 * El FIX del DOF (serie SF43718 del SIE de Banxico) es el tipo de cambio que
 * el SAT exige para CFDI. Se guarda con DOS fechas:
 *   - fecha de determinación: cuándo Banxico lo fijó (día hábil)
 *   - fecha de liquidación: cuándo se liquida la operación (T+2)
 * porque la regla fiscal de cuál usar (la del día hábil anterior a la
 * operación) todavía no está confirmada por Julio.
 *
 * ── Qué se guarda en Firestore ───────────────────────────────────────────────
 *   tiposCambio/{YYYY-MM-DD}  → el registro por fecha de determinación
 *   configuracion/tipoCambio   → el último valor conocido (para la app)
 *
 * Lógica pura: sin React ni Firebase.
 */

// ─── Respuesta de n8n (el webhook /tipo-cambio) ─────────────────────────────

export interface SerieBanxico {
  serie: string;
  titulo: string;
  fecha: string | null;
  valor: number | null;
}

export interface RespuestaTipoCambio {
  ok: boolean;
  fuente: 'banxico';
  consultado: string;
  series: SerieBanxico[];
  error?: string;
  detalle?: string;
}

// ─── Lo que se persiste ─────────────────────────────────────────────────────

export interface RegistroTipoCambio {
  /** Valor del FIX (MXN por USD). */
  valor: number;
  /** Fecha de determinación ISO (YYYY-MM-DD). */
  fechaDeterminacion: string;
  /** Fecha de liquidación ISO (YYYY-MM-DD), de la serie SF60653. */
  fechaLiquidacion: string | null;
  /** ISO timestamp de la última consulta. */
  consultado: string;
  fuente: 'banxico';
  /** Serie del SIE de la que viene el valor. */
  serie: string;
}

export interface ConfigTipoCambio {
  /** Último valor conocido. */
  valor: number;
  fechaDeterminacion: string;
  fechaLiquidacion: string | null;
  consultado: string;
  fuente: 'banxico';
  /** ISO timestamp de la última consulta, haya cambiado o no. */
  ultimaConsulta: string;
}

// ─── Series ─────────────────────────────────────────────────────────────────

/** FIX del DOF por fecha de determinación. */
export const SERIE_FIX = 'SF43718';
/** FIX del DOF por fecha de liquidación. */
export const SERIE_FIX_LIQUIDACION = 'SF60653';

// ─── Días hábiles en México ─────────────────────────────────────────────────

/**
 * Días inhábiles oficiales de México (Ley Federal del Trabajo art. 74).
 * Devuelve [mes, día]. Algunos son fijos; otros se mueven al lunes más
 * cercano (1er lunes de febrero, 3er lunes de marzo, 3er lunes de noviembre).
 */
function diasInhabilesFijos(anio: number): Array<[number, number]> {
  const fijos: Array<[number, number]> = [
    [1, 1],   // Año nuevo
    [5, 1],   // Día del trabajo
    [9, 16],  // Independencia
    [12, 25], // Navidad
  ];
  // Transmisión del poder ejecutivo cada 6 años (2024, 2030...)
  if (anio % 6 === 0) fijos.push([10, 1]);
  // Movibles al lunes: 1er lunes de febrero, 3er lunes de marzo, 3er lunes de noviembre
  fijos.push(enesimoLunes(anio, 2, 1));  // Constitución
  fijos.push(enesimoLunes(anio, 3, 3));  // Benito Juárez
  fijos.push(enesimoLunes(anio, 11, 3)); // Revolución
  return fijos;
}

function enesimoLunes(anio: number, mes: number, n: number): [number, number] {
  const primero = new Date(anio, mes - 1, 1);
  const diaSemana = primero.getDay();
  // Primer lunes del mes
  let dia = diaSemana <= 1 ? 1 + (1 - diaSemana) : 1 + (8 - diaSemana);
  dia += (n - 1) * 7;
  return [mes, dia];
}

export function esDiaHabil(fecha: Date): boolean {
  const diaSemana = fecha.getDay();
  if (diaSemana === 0 || diaSemana === 6) return false;
  const mes = fecha.getMonth() + 1;
  const dia = fecha.getDate();
  const anio = fecha.getFullYear();
  return !diasInhabilesFijos(anio).some(([m, d]) => m === mes && d === dia);
}

/**
 * Retrocede al día hábil anterior.
 * Si la fecha dada ya es hábil, devuelve el hábil anterior a ella.
 */
export function diaHabilAnterior(fecha: Date): Date {
  const d = new Date(fecha);
  d.setDate(d.getDate() - 1);
  while (!esDiaHabil(d)) d.setDate(d.getDate() - 1);
  return d;
}

/**
 * Avanza al siguiente día hábil (el mismo si ya es hábil).
 */
export function siguienteDiaHabil(fecha: Date): Date {
  const d = new Date(fecha);
  while (!esDiaHabil(d)) d.setDate(d.getDate() + 1);
  return d;
}

// ─── Procesamiento de la respuesta ──────────────────────────────────────────

export interface ResultadoConsulta {
  ok: true;
  registro: RegistroTipoCambio;
}

export interface ErrorConsulta {
  ok: false;
  error: string;
}

/**
 * Extrae el registro del tipo de cambio de la respuesta de n8n.
 *
 * Busca la serie SF43718 (FIX por fecha de determinación) como valor
 * principal, y SF60653 (FIX por fecha de liquidación) para guardar la
 * segunda fecha.
 */
export function procesarRespuesta(resp: RespuestaTipoCambio): ResultadoConsulta | ErrorConsulta {
  if (!resp.ok || !Array.isArray(resp.series)) {
    return { ok: false, error: resp.error ?? 'Respuesta no válida de Banxico.' };
  }

  const fix = resp.series.find(s => s.serie === SERIE_FIX);
  if (!fix || fix.valor == null || !fix.fecha) {
    return { ok: false, error: `Banxico no reportó dato para la serie ${SERIE_FIX} (FIX del DOF). Puede ser N/E (día inhábil).` };
  }

  const fixLiq = resp.series.find(s => s.serie === SERIE_FIX_LIQUIDACION);

  return {
    ok: true,
    registro: {
      valor: fix.valor,
      fechaDeterminacion: fix.fecha,
      fechaLiquidacion: fixLiq?.fecha ?? null,
      consultado: resp.consultado,
      fuente: 'banxico',
      serie: SERIE_FIX,
    },
  };
}

// ─── ¿Está desactualizado? ──────────────────────────────────────────────────

/**
 * ¿El tipo de cambio está desactualizado?
 *
 * Desactualizado = la fecha de determinación tiene más de un día hábil de
 * antigüedad respecto a `ahora`. Ejemplo: si hoy es miércoles y el último
 * dato es del lunes, hay un dato del martes que no llegó.
 */
export function estaDesactualizado(
  fechaDeterminacion: string | undefined | null,
  ahora: Date = new Date(),
): boolean {
  if (!fechaDeterminacion) return true;
  const ultima = new Date(fechaDeterminacion + 'T12:00:00');
  if (isNaN(ultima.getTime())) return true;

  // El día hábil anterior a hoy es el dato más reciente que debería existir.
  // Si la fecha del dato es anterior a ese día, está desactualizado.
  const esperado = diaHabilAnterior(ahora);
  // Comparamos solo la parte de fecha
  const strEsperado = esperado.toISOString().slice(0, 10);
  return fechaDeterminacion < strEsperado;
}

/**
 * Texto corto para mostrar en la UI.
 */
export function etiquetaFechaTC(fechaDeterminacion: string): string {
  const partes = fechaDeterminacion.split('-');
  if (partes.length !== 3) return fechaDeterminacion;
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mes = meses[Number(partes[1]) - 1] ?? partes[1];
  return `${Number(partes[2])} ${mes} ${partes[0]}`;
}
