/**
 * formatoFolioSerie.ts — tarea 66.
 *
 * El formato del folio de embarque, configurable sin tocar código.
 *
 * ── Por qué configurable ───────────────────────────────────────────────────
 * Julio desbloqueó el consecutivo en la sesión del 2-oct y lo que quedó
 * anotado fue «BLIM + año + tres dígitos… para enero va el 27, así que
 * arrancamos en 2701». La plataforma usa `VLIM-26-001`. No es la misma cadena,
 * y la diferencia no se puede adivinar: «BLIM» y «VLIM» suenan igual, y «2701»
 * se lee como año 27 + consecutivo 01 o como un bloque de cuatro.
 *
 * Un folio mal formado no truena: se imprime. Va en el BL, en la carta de
 * encomienda y en el pedimento, así que un VLIM-26-001 donde Vermur esperaba
 * BLIM27001 queda en papel del cliente. Por eso el formato se configura y se
 * ve antes de encender nada, en vez de quedar escrito en una constante.
 *
 * ── Qué NO decide este archivo ─────────────────────────────────────────────
 * Si el consecutivo REINICIA en enero. El contador de cada serie es un entero
 * que nunca se reinicia (`contadores/embarques_VLIM.ultimo`), así que al
 * cambiar el año el folio cambia de año y el número sigue: 2026 cierra en
 * VLIM-26-014 y enero de 2027 abre en VLIM-27-015. La frase de Julio se puede
 * leer como que debería abrir en VLIM-27-001. Es decisión de negocio, está en
 * el reporte 66 como pregunta, y reiniciar exige un contador por año y serie
 * — no un campo más en el formato. Ver `anioDeFolio`.
 *
 * Puro a propósito: el folio se arma dentro de una transacción de Firestore y
 * es lo único que no se puede corregir después.
 */

/** Las piezas del folio que Vermur puede configurar por serie. */
export interface FormatoFolioSerie {
  /**
   * Lo que se IMPRIME al frente. Por omisión es la clave de la serie (VLIM),
   * pero se separa de ella a propósito: si el prefijo de Vermur resulta ser
   * BLIM, cambia el texto del folio sin mover la identidad del contador
   * (`contadores/embarques_VLIM`), que ya tiene su regla publicada y sus
   * folios reservados.
   */
  prefijo: string;
  /** Entre segmentos. '-' hoy; '' pega todo (BLIM27001); '/' también se usa. */
  separador: string;
  /** Dígitos del año: 2 → «26», 4 → «2026», 0 → el folio no lleva año. */
  digitosAnio: 0 | 2 | 4;
  /** Dígitos del consecutivo, con ceros a la izquierda. 3 → «001». */
  digitos: number;
}

/**
 * El formato que la plataforma usa hoy: `VLIM-26-001`.
 *
 * Es el predeterminado porque es el que está en los embarques reales de Magaya
 * que viven en los datos (VLIT-24-107, VLIA-24-020) y el que ya se imprimió.
 * Mientras nadie configure otro, nada cambia.
 */
export const FORMATO_FOLIO_PREDETERMINADO: Omit<FormatoFolioSerie, 'prefijo'> = {
  separador: '-',
  digitosAnio: 2,
  digitos: 3,
};

/** Tope del padding. Más allá de esto el folio deja de ser legible. */
export const MAX_DIGITOS = 8;

export const SEPARADORES: { valor: string; etiqueta: string }[] = [
  { valor: '-', etiqueta: 'Guion  ( VLIM-26-001 )' },
  { valor: '', etiqueta: 'Sin separador  ( VLIM26001 )' },
  { valor: '/', etiqueta: 'Diagonal  ( VLIM/26/001 )' },
  { valor: '.', etiqueta: 'Punto  ( VLIM.26.001 )' },
];

/** Formato completo de una serie: lo guardado, con el predeterminado debajo. */
export function formatoDeSerie(
  serie: string,
  guardado?: Partial<FormatoFolioSerie> | null,
): FormatoFolioSerie {
  return {
    prefijo: textoLimpio(guardado?.prefijo) ?? serie,
    separador: separadorValido(guardado?.separador),
    digitosAnio: anioValido(guardado?.digitosAnio),
    digitos: digitosValidos(guardado?.digitos),
  };
}

/**
 * Arma el folio.
 *
 * El año entra como número completo (2026) y el formato decide cuánto se ve:
 * quien llama no tiene que saber si la serie va a dos o a cuatro dígitos.
 */
export function armarFolioSerie(
  serie: string,
  n: number,
  anio: number,
  guardado?: Partial<FormatoFolioSerie> | null,
): string {
  const f = formatoDeSerie(serie, guardado);
  const num = String(Math.max(0, Math.trunc(n))).padStart(f.digitos, '0');

  const segmentos = [f.prefijo];
  if (f.digitosAnio > 0) segmentos.push(String(anio).slice(-f.digitosAnio));
  segmentos.push(num);

  return segmentos.join(f.separador);
}

/**
 * Cómo se vería el siguiente folio. Para la pantalla de configuración: el
 * formato se aprueba viéndolo, no leyendo cuatro campos.
 */
export function ejemploFolio(
  serie: string,
  ultimo: number,
  anio: number,
  guardado?: Partial<FormatoFolioSerie> | null,
): string {
  return armarFolioSerie(serie, ultimo + 1, anio, guardado);
}

/** ¿El formato guardado difiere del predeterminado de la plataforma? */
export function formatoPersonalizado(
  serie: string,
  guardado?: Partial<FormatoFolioSerie> | null,
): boolean {
  const f = formatoDeSerie(serie, guardado);
  return f.prefijo !== serie
    || f.separador !== FORMATO_FOLIO_PREDETERMINADO.separador
    || f.digitosAnio !== FORMATO_FOLIO_PREDETERMINADO.digitosAnio
    || f.digitos !== FORMATO_FOLIO_PREDETERMINADO.digitos;
}

/**
 * Lo que se guarda en el contador de la serie.
 *
 * Solo lo que de verdad cambia respecto del predeterminado, y el prefijo solo
 * cuando no es la clave de la serie: un documento con cuatro campos que dicen
 * lo mismo que el default hace creer que alguien configuró algo.
 *
 * Devuelve `null` cuando el formato ES el predeterminado, para que quien
 * escriba pueda borrar el campo en vez de guardar ruido.
 */
export function formatoParaGuardar(
  serie: string,
  f: FormatoFolioSerie,
): FormatoFolioSerie | null {
  if (!formatoPersonalizado(serie, f)) return null;
  return formatoDeSerie(serie, f);
}

/** Por qué un formato no se puede guardar, o null si se puede. */
export function razonFormatoInvalido(f: Partial<FormatoFolioSerie>): string | null {
  const prefijo = textoLimpio(f.prefijo);
  if (!prefijo) return 'El prefijo no puede quedar vacío.';
  if (!/^[A-Za-z0-9]+$/.test(prefijo)) {
    return 'El prefijo solo acepta letras y números: el folio va impreso en el BL y en el pedimento.';
  }
  const d = f.digitos;
  if (d == null || !Number.isInteger(d) || d < 1 || d > MAX_DIGITOS) {
    return `Los dígitos del consecutivo van de 1 a ${MAX_DIGITOS}.`;
  }
  if (f.digitosAnio !== 0 && f.digitosAnio !== 2 && f.digitosAnio !== 4) {
    return 'El año va a 2 dígitos, a 4, o no va.';
  }
  if (f.separador != null && !SEPARADORES.some(s => s.valor === f.separador)) {
    return 'Separador no reconocido.';
  }
  return null;
}

/**
 * El año que lleva un folio ya emitido, cuando se puede leer.
 *
 * Sirve para el día que se decida reiniciar el consecutivo en enero: hay que
 * saber de qué año es el último folio antes de poder decidir si el siguiente
 * arranca en 1. Hoy nadie la llama para decidir nada —el contador no
 * reinicia— y por eso devuelve `null` en vez de adivinar: un folio sin año
 * (digitosAnio 0) o uno de Magaya (`BOL 9016543`) no lo dice.
 */
export function anioDeFolio(
  folio: string,
  serie: string,
  guardado?: Partial<FormatoFolioSerie> | null,
): number | null {
  const f = formatoDeSerie(serie, guardado);
  if (f.digitosAnio === 0) return null;

  const sinPrefijo = folio.startsWith(f.prefijo) ? folio.slice(f.prefijo.length) : null;
  if (sinPrefijo == null) return null;

  const cuerpo = f.separador && sinPrefijo.startsWith(f.separador)
    ? sinPrefijo.slice(f.separador.length)
    : sinPrefijo;

  const crudo = cuerpo.slice(0, f.digitosAnio);
  if (!/^\d+$/.test(crudo) || crudo.length !== f.digitosAnio) return null;

  const n = Number(crudo);
  return f.digitosAnio === 2 ? 2000 + n : n;
}

// ─── Saneado ──────────────────────────────────────────────────────────────────
//
// Todo lo guardado se lee con respaldo: un `digitos: "tres"` escrito desde la
// consola de Firebase —que las reglas de hoy permiten (§6)— no puede dejar la
// pantalla de folios en blanco ni producir un folio sin número.

function textoLimpio(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function separadorValido(v: unknown): string {
  if (typeof v !== 'string') return FORMATO_FOLIO_PREDETERMINADO.separador;
  return SEPARADORES.some(s => s.valor === v) ? v : FORMATO_FOLIO_PREDETERMINADO.separador;
}

function anioValido(v: unknown): 0 | 2 | 4 {
  return v === 0 || v === 2 || v === 4 ? v : FORMATO_FOLIO_PREDETERMINADO.digitosAnio;
}

function digitosValidos(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) return FORMATO_FOLIO_PREDETERMINADO.digitos;
  if (v < 1 || v > MAX_DIGITOS) return FORMATO_FOLIO_PREDETERMINADO.digitos;
  return v;
}
