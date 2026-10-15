/**
 * cargaClientesLuis.ts — reglas de la carga del Excel unificado de Luis.
 *
 * 342 clientes, hoja «Maestro de clientes». Aparte de la 65 y no adaptándola:
 * esa lista venía de Magaya con número de entidad y régimen fiscal, y su
 * `planearRenglon` tiene 58 tests que fijan ESE contrato. Esta trae otros
 * campos (dirección, teléfono, límite de crédito, ejecutivo) y otras reglas.
 * Lo que sí se reusa son las primitivas: `normalizarNombre` —que ya quita
 * «S.A. DE C.V.» y compañía—, `normalizarRFC`, `leerCodigoPostal` y
 * `validarRFC`.
 *
 * ── Las tres cosas que esta lista tiene y la 65 no ────────────────────────
 *
 * 1. **El «nombre correcto» a veces es MENOS completo que el de la
 *    plataforma.** En 169 de los 322 que empatan, el Excel dice
 *    «A KAYSER AUTOMOTIVE SYSTEMS» donde la plataforma tiene
 *    «A KAYSER AUTOMOTIVE SYSTEMS GMBH». Pisar eso borra la forma societaria,
 *    que es lo que se imprime en la factura y en el BL. Por omisión NO se
 *    pisa un nombre que ya contenga al del Excel; se reporta.
 *
 * 2. **El cero es «no capturado», no «cero».** 277 de 342 traen días de
 *    crédito en 0 y 309 traen límite en 0. Escribirlos pondría «pago de
 *    contado» y «sin línea de crédito» en casi toda la cartera. Es la misma
 *    lección del cero de Magaya (§4.30).
 *
 * 3. **Un C.P. de 5 dígitos puede no ser mexicano.** 171 direcciones son del
 *    extranjero y traen cosas como «C.P. 37574, Germany». El 37574 es un
 *    código postal alemán perfectamente válido, y meterlo en `codigoPostal`
 *    lo vuelve un CP mexicano a los ojos de todo lo demás. Solo se extrae de
 *    direcciones que terminan en México; el resto se reporta.
 */

import { normalizarNombre, normalizarRFC, leerCodigoPostal, type CambioCampo } from './cargaClientesOk';
import { validarRFC } from './validadores';

// ═══════════════════════════════════════════════════════════════════════════
// 1. El renglón del Excel
// ═══════════════════════════════════════════════════════════════════════════

export interface RenglonLuis {
  /** Fila en la hoja (1 = encabezado), para poder volver al Excel. */
  fila: number;
  numero: string;
  nombre: string;
  /** Columna «Comercial»: es el EJECUTIVO de ventas, no la marca del cliente. */
  comercial: string;
  rfc: string;
  antiguedad: string;
  correo: string;
  telefono: string;
  direccion: string;
  dias: string;
  credito: string;
}

/**
 * Las columnas se buscan por ENCABEZADO, no por letra.
 *
 * La hoja trae además dos columnas sueltas (O y P con un 0) que no son de
 * nadie; por letra, cualquier inserción futura correría todo.
 */
const ALIAS: Record<keyof Omit<RenglonLuis, 'fila'>, string[]> = {
  numero: ['#', 'no', 'num'],
  nombre: ['cliente (nombre correcto)', 'cliente', 'nombre'],
  comercial: ['comercial', 'ejecutivo', 'responsable'],
  rfc: ['rfc'],
  antiguedad: ['antiguedad'],
  correo: ['correo', 'email', 'e-mail'],
  telefono: ['telefono', 'tel'],
  direccion: ['direccion', 'domicilio'],
  dias: ['dias de credito', 'dias credito', 'dias'],
  credito: ['credito (mxn)', 'credito mxn', 'limite de credito', 'credito'],
};

export function normalizarEncabezadoLuis(v: string): string {
  return (v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

export function resolverColumnas(encabezado: Record<string, string>): {
  mapeo: Partial<Record<keyof Omit<RenglonLuis, 'fila'>, string>>;
  faltan: string[];
} {
  const porTexto = new Map<string, string>();
  for (const [letra, texto] of Object.entries(encabezado)) {
    porTexto.set(normalizarEncabezadoLuis(texto), letra);
  }
  const mapeo: Partial<Record<keyof Omit<RenglonLuis, 'fila'>, string>> = {};
  for (const [campo, alias] of Object.entries(ALIAS) as Array<[keyof typeof ALIAS, string[]]>) {
    for (const a of alias) {
      const letra = porTexto.get(a);
      if (letra) { mapeo[campo] = letra; break; }
    }
  }
  // Sin nombre no hay nada que empatar; el resto puede faltar.
  const faltan = mapeo.nombre ? [] : ['Cliente (nombre correcto)'];
  return { mapeo, faltan };
}

export function leerRenglonesLuis(filas: Array<Record<string, string>>): {
  renglones: RenglonLuis[];
  faltan: string[];
} {
  if (filas.length === 0) return { renglones: [], faltan: ['la hoja está vacía'] };
  const { mapeo, faltan } = resolverColumnas(filas[0]);
  if (faltan.length) return { renglones: [], faltan };

  const g = (f: Record<string, string>, campo: keyof typeof ALIAS) =>
    (mapeo[campo] ? (f[mapeo[campo]!] ?? '') : '').trim();

  const renglones: RenglonLuis[] = [];
  filas.slice(1).forEach((f, i) => {
    const nombre = g(f, 'nombre');
    if (!nombre) return;           // una fila sin nombre no es un cliente
    renglones.push({
      fila: i + 2,
      numero: g(f, 'numero'), nombre, comercial: g(f, 'comercial'), rfc: g(f, 'rfc'),
      antiguedad: g(f, 'antiguedad'), correo: g(f, 'correo'), telefono: g(f, 'telefono'),
      direccion: g(f, 'direccion'), dias: g(f, 'dias'), credito: g(f, 'credito'),
    });
  });
  return { renglones, faltan: [] };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Los valores, uno por uno
// ═══════════════════════════════════════════════════════════════════════════

/** El mapeo que confirmó Mau. Lo que no está aquí va a revisión. */
export const MAPA_COMERCIAL: Record<string, string | null> = {
  'NOEMI': 'noemi.casas@vermur.com',
  'ITZEL': 'itzel.laurean@vermur.com',
  'NOHEMA': 'nohema.sosa@vermur.com',
  'JOSE MARIA': 'jose.tejeda@vermur.com',
  'CLIENTES OFICINA': null,          // cuenta de la casa: sin ejecutivo
};

/** Pendientes de que Luis conteste: no se asignan ni se adivinan. */
export const COMERCIAL_PENDIENTE = ['GABRIELA', 'KAREN'];

export type Comercial =
  | { tipo: 'usuario'; correo: string }
  | { tipo: 'sin_ejecutivo' }
  | { tipo: 'vacio' }
  | { tipo: 'revision'; razon: string };

export function resolverComercial(valor: string): Comercial {
  const s = (valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
  if (s === '') return { tipo: 'vacio' };
  if (COMERCIAL_PENDIENTE.includes(s)) {
    return { tipo: 'revision', razon: `«${valor}» no tiene cuenta asignada todavía: lo confirma Luis.` };
  }
  if (!(s in MAPA_COMERCIAL)) {
    return { tipo: 'revision', razon: `«${valor}» no está en el mapeo de ejecutivos.` };
  }
  const correo = MAPA_COMERCIAL[s];
  return correo === null ? { tipo: 'sin_ejecutivo' } : { tipo: 'usuario', correo };
}

/**
 * Días de crédito. **El 0 se lee como «no capturado»**, no como contado.
 *
 * 277 de los 342 renglones traen 0 porque la columna no se llenó. Escribirlos
 * pondría toda la cartera en contado. Acepta «Net 90».
 */
export function leerDiasLuis(valor: string): number | null {
  const s = (valor ?? '').trim();
  if (s === '') return null;
  const m = s.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0 || n > 365) return null;
  return n;
}

/** Límite de crédito en MXN. Igual que arriba: 0 es «no capturado». */
export function leerCreditoLuis(valor: string): number | null {
  const s = (valor ?? '').trim();
  if (s === '') return null;
  const n = Number(s.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** ¿La dirección termina en México? Solo de esas se saca el C.P. */
export function esDireccionMexicana(direccion: string): boolean {
  const s = (direccion ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
  return /\bMEXICO\s*\.?$/.test(s);
}

export type CP = { cp: string } | { cp: null; razon: string };

/**
 * C.P. de la dirección, SOLO si la dirección es mexicana.
 *
 * «Hulleser Landstraße 43, …, C.P. 37574, Germany» trae cinco dígitos y es un
 * código postal alemán. Guardarlo en `codigoPostal` lo convierte en un CP
 * mexicano para el resto de la plataforma — y los CP deciden cosas fiscales.
 */
export function cpDeDireccion(direccion: string): CP {
  const s = (direccion ?? '').trim();
  if (s === '') return { cp: null, razon: 'sin dirección' };
  const m = s.match(/C\.?\s*P\.?\s*:?\s*(\d{5})(?!\d)/i);
  if (!m) return { cp: null, razon: 'la dirección no trae «C.P. 12345»' };
  if (!esDireccionMexicana(s)) {
    return { cp: null, razon: `la dirección es del extranjero: «${m[1]}» no es un C.P. mexicano` };
  }
  const cp = leerCodigoPostal(m[1]);
  return cp ? { cp } : { cp: null, razon: `«${m[1]}» no es un C.P. de cinco dígitos` };
}

/** RFC utilizable: ni vacío, ni genérico, ni con forma inválida. */
export const RFC_GENERICOS = ['XAXX010101000', 'XEXX010101000'];

export type RfcLeido = { rfc: string } | { rfc: null; razon: string };

export function leerRfcLuis(valor: string): RfcLeido {
  const s = normalizarRFC(valor);
  if (s === '') return { rfc: null, razon: 'sin RFC' };
  if (RFC_GENERICOS.includes(s)) {
    return { rfc: null, razon: `RFC genérico (${s}): no identifica a nadie` };
  }
  const v = validarRFC(s);
  if (!v.valido) {
    return { rfc: null, razon: `no tiene forma de RFC mexicano: ${v.error || 'inválido'}` };
  }
  return { rfc: s };
}

/**
 * ¿El nombre de la plataforma ya CONTIENE al del Excel?
 *
 * Es el caso de los 169: «A KAYSER AUTOMOTIVE SYSTEMS GMBH» contra
 * «A KAYSER AUTOMOTIVE SYSTEMS». Se compara sin acentos, sin signos y sin
 * espacios, y se exige que el de la plataforma sea estrictamente más largo:
 * así «ARYES SA DE CV» gana a «ARYES», y dos nombres de verdad distintos no
 * se confunden con esto.
 */
export function plataformaTieneNombreMasCompleto(enPlataforma: string, enExcel: string): boolean {
  const limpia = (v: string) => (v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');
  const a = limpia(enPlataforma);
  const b = limpia(enExcel);
  return b !== '' && a.length > b.length && a.startsWith(b);
}

export { type CambioCampo, normalizarNombre, normalizarRFC };

// ═══════════════════════════════════════════════════════════════════════════
// 3. El empate: la hoja de Luis primero, el nombre normalizado después
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sufijos societarios que se ignoran al comparar nombres.
 *
 * ── Por qué una lista propia y no la de la 65 ─────────────────────────────
 * La de `cargaClientesOk` trae las formas PEGADAS («SAS», «SRL», «SA»), y
 * `normalizarNombre` convierte los puntos en espacios: «TRANSMARES LOGISTICA
 * S.A.S» queda «TRANSMARES LOGISTICA S A S», que no termina en « SAS» y el
 * sufijo no se quita. Resultado: no empataba con «TRANSMARES LOGISTICA» del
 * Excel y el cargador lo iba a CREAR, duplicando a CLI-0147.
 *
 * No se tocó la lista de la 65: su `planearRenglon` tiene 58 tests que fijan
 * ese empate y cambiarlo movería la otra carga.
 */
const SUFIJOS_LUIS = [
  'SA DE CV', 'S A DE C V', 'SAPI DE CV', 'S DE RL DE CV', 'SA DE CV SOFOM ENR',
  'S EN C', 'SA PROMOTORA DE INVERSION DE CV', 'SOFOM ENR', 'SPR DE RL',
  'SA', 'SAPI', 'SAS', 'SRL', 'S DE RL', 'SC', 'AC',
  'INC', 'LLC', 'LTD', 'LIMITED', 'CO', 'CORP', 'COMPANY', 'GMBH', 'AG', 'KG',
  'BV', 'NV', 'SL', 'SPA', 'SPRL', 'LDA', 'PUBLIC', 'PTE LTD', 'CO LTD',
  'PVT LTD', 'SDN BHD', 'AS', 'OY', 'AB', 'PLC', 'SARL', 'EURL',
];

/**
 * Junta las corridas de DOS O MÁS letras sueltas: «S A S» → «SAS».
 *
 * Dos o más a propósito: con una sola, «A KAYSER» se volvería «AKAYSER» y
 * «GRUPO A» perdería su letra. Esto es lo que hace que «S.A.S», «S.R.L.» y
 * «S. de R.L.» lleguen a la lista de sufijos en la forma en que está escrita.
 */
export function juntarSiglas(s: string): string {
  return s.replace(/\b(?:[A-Z] ){1,}[A-Z]\b/g, m => m.replace(/ /g, ''));
}

/** Nombre comparable para ESTA lista. Ver `SUFIJOS_LUIS`. */
export function normalizarNombreLuis(valor: string): string {
  let s = juntarSiglas(
    (valor ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/&/g, ' AND ')
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim(),
  );

  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const suf of SUFIJOS_LUIS) {
      if (s === suf) continue;
      if (s.endsWith(' ' + suf)) {
        s = s.slice(0, -(suf.length + 1)).trim();
        cambio = true;
      }
    }
  }
  return s.replace(/ /g, '');
}

/** Una fila de la hoja «Verificación»: el cruce que hizo Luis a mano. */
export interface FilaVerificacion {
  numero: string;
  /** Nombre EXACTO del cliente en la plataforma, o '' si no lo encontró. */
  nombreEnBD: string;
  estado: string;
}

/**
 * Lee la hoja «Verificación».
 *
 * Es la llave MÁS fuerte que hay, y es humana: Luis abrió la plataforma y
 * anotó el nombre exacto. Gana sobre cualquier normalización, porque hay
 * casos que ninguna normalización alcanza — «NEW TRAFIC LOGISTICA S.A.S» en
 * la plataforma contra «NEW TRAFFIC» en el Excel: distinta ortografía y una
 * palabra de más.
 */
export function leerVerificacion(filas: Array<Record<string, string>>): Map<string, FilaVerificacion> {
  const porNumero = new Map<string, FilaVerificacion>();
  if (filas.length === 0) return porNumero;

  const porTexto = new Map<string, string>();
  for (const [letra, texto] of Object.entries(filas[0])) {
    porTexto.set(normalizarEncabezadoLuis(texto), letra);
  }
  const col = (...alias: string[]) => {
    for (const a of alias) { const l = porTexto.get(a); if (l) return l; }
    return undefined;
  };
  const cNum = col('#', 'no');
  const cBD = col('cliente encontrado en bd', 'cliente en bd', 'encontrado en bd');
  const cEstado = col('estado');
  if (!cNum || !cBD) return porNumero;

  for (const f of filas.slice(1)) {
    const numero = (f[cNum] ?? '').trim();
    if (!numero) continue;
    porNumero.set(numero, {
      numero,
      nombreEnBD: (f[cBD] ?? '').trim(),
      estado: cEstado ? (f[cEstado] ?? '').trim() : '',
    });
  }
  return porNumero;
}

/** ¿Luis dijo que este renglón NO está en la plataforma? */
export function luisDiceQueNoEsta(v: FilaVerificacion | undefined): boolean {
  if (!v) return false;
  return v.nombreEnBD === '' && /no est[áa] en bd/i.test(v.estado);
}

/**
 * El cliente de la plataforma más parecido, para poder revisar a mano antes
 * de crear un duplicado. Compara por prefijo común sobre el nombre
 * normalizado; devuelve null cuando no comparten ni cuatro caracteres.
 */
export function masParecido(
  nombre: string,
  base: Array<{ id: string; nombre: string }>,
): { id: string; nombre: string; comun: number } | null {
  const a = normalizarNombreLuis(nombre);
  let mejor: { id: string; nombre: string; comun: number } | null = null;
  for (const c of base) {
    const b = normalizarNombreLuis(c.nombre ?? '');
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    if (!mejor || i > mejor.comun) mejor = { id: c.id, nombre: c.nombre, comun: i };
  }
  return mejor && mejor.comun >= 4 ? mejor : null;
}

/**
 * ¿El candidato más parecido es lo bastante parecido para NO crear?
 *
 * ── Por qué existe este freno ────────────────────────────────────────────
 * Ni la hoja de Luis ni la normalización alcanzan para todo. «NEW TRAFFIC»
 * del Excel existe en la plataforma como «NEW TRAFIC LOGISTICA S.A.S»
 * (CLI-0162): una F de diferencia y una palabra de más. Luis lo marcó «No
 * está en BD» —su cruce falló por lo mismo— y el nombre normalizado no
 * empata. Con las dos reglas en la mano, igual se habría creado el
 * duplicado.
 *
 * Así que ante una sospecha NO se crea: un cliente duplicado parte su
 * historia, sus cotizaciones y sus facturas en dos, y eso se descubre
 * semanas después en un estado de cuenta. Dejar uno sin crear se arregla en
 * un minuto desde la pantalla de Altas.
 *
 * El umbral: al menos 6 caracteres de prefijo común Y que sean el 60% del
 * nombre más corto. «NEWTRAFFIC» vs «NEWTRAFICLOGISTICA» comparten
 * «NEWTRAF» = 7 de 10 (70%).
 */
export function sospechaDeDuplicado(
  nombre: string,
  parecido: { nombre: string; comun: number } | null,
): boolean {
  if (!parecido) return false;
  const corto = Math.min(
    normalizarNombreLuis(nombre).length,
    normalizarNombreLuis(parecido.nombre).length,
  );
  if (corto === 0) return false;
  return parecido.comun >= 6 && parecido.comun / corto >= 0.6;
}
