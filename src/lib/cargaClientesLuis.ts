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
