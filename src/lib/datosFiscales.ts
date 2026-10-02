/**
 * datosFiscales.ts — Datos fiscales del cliente para timbrado CFDI
 *
 * El SAT exige RFC, razón social, código postal y régimen fiscal
 * idénticos a la Constancia de Situación Fiscal para poder timbrar.
 * Este módulo contiene el catálogo c_RegimenFiscal del SAT y los
 * helpers para evaluar completitud.
 *
 * Fuente del catálogo: Anexo 20 del CFDI 4.0 (catálogo c_RegimenFiscal,
 * vigente al 1-oct-2026). Lista estática; cambia solo con reformas fiscales.
 */

import type { ClienteVermur } from '../components/clientes/ClientesData';

// ── Catálogo c_RegimenFiscal del SAT ────────────────────────────────────────

export interface RegimenFiscalSAT {
  clave: string;
  descripcion: string;
  /** true si aplica a persona moral. */
  moral: boolean;
  /** true si aplica a persona física. */
  fisica: boolean;
}

/**
 * Catálogo completo de regímenes fiscales del SAT (CFDI 4.0).
 * Las claves de tres dígitos son las que aparecen en la Constancia de
 * Situación Fiscal y en el CFDI.
 */
export const REGIMENES_FISCALES: RegimenFiscalSAT[] = [
  { clave: '601', descripcion: 'General de Ley Personas Morales', moral: true, fisica: false },
  { clave: '603', descripcion: 'Personas Morales con Fines no Lucrativos', moral: true, fisica: false },
  { clave: '605', descripcion: 'Sueldos y Salarios e Ingresos Asimilados a Salarios', moral: false, fisica: true },
  { clave: '606', descripcion: 'Arrendamiento', moral: false, fisica: true },
  { clave: '607', descripcion: 'Régimen de Enajenación o Adquisición de Bienes', moral: false, fisica: true },
  { clave: '608', descripcion: 'Demás ingresos', moral: false, fisica: true },
  { clave: '610', descripcion: 'Residentes en el Extranjero sin Establecimiento Permanente en México', moral: true, fisica: true },
  { clave: '611', descripcion: 'Ingresos por Dividendos (socios y accionistas)', moral: false, fisica: true },
  { clave: '612', descripcion: 'Personas Físicas con Actividades Empresariales y Profesionales', moral: false, fisica: true },
  { clave: '614', descripcion: 'Ingresos por intereses', moral: false, fisica: true },
  { clave: '615', descripcion: 'Régimen de los ingresos por obtención de premios', moral: false, fisica: true },
  { clave: '616', descripcion: 'Sin obligaciones fiscales', moral: true, fisica: true },
  { clave: '620', descripcion: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos', moral: true, fisica: false },
  { clave: '621', descripcion: 'Incorporación Fiscal', moral: false, fisica: true },
  { clave: '622', descripcion: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras', moral: true, fisica: true },
  { clave: '623', descripcion: 'Opcional para Grupos de Sociedades', moral: true, fisica: false },
  { clave: '624', descripcion: 'Coordinados', moral: true, fisica: false },
  { clave: '625', descripcion: 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', moral: false, fisica: true },
  { clave: '626', descripcion: 'Régimen Simplificado de Confianza', moral: true, fisica: true },
];

/** Mapa rápido clave → descripción para UI. */
export const MAPA_REGIMENES: Record<string, string> = Object.fromEntries(
  REGIMENES_FISCALES.map(r => [r.clave, r.descripcion]),
);

// ── RFC genérico de extranjero ──────────────────────────────────────────────

const RFC_EXTRANJERO = 'XEXX010101000';

/** true si el RFC corresponde al genérico de extranjero del SAT. */
export function esRFCExtranjero(rfc: string | undefined | null): boolean {
  return (rfc ?? '').trim().toUpperCase() === RFC_EXTRANJERO;
}

// ── Validación suave de código postal ───────────────────────────────────────

const CP_REGEX = /^\d{5}$/;

/** Valida que el CP tenga 5 dígitos. Avisa, no bloquea. */
export function validarCodigoPostal(cp: string): string {
  const limpio = (cp ?? '').trim();
  if (limpio === '') return '';
  if (!CP_REGEX.test(limpio)) return 'El código postal debe ser de 5 dígitos.';
  return '';
}

// ── Completitud de datos fiscales ───────────────────────────────────────────

export type EstadoFiscal = 'completo' | 'incompleto';

/**
 * ¿Los datos fiscales del cliente están completos para timbrar?
 *
 * Completo = RFC + razón social + código postal + régimen fiscal.
 * Excepción: un extranjero con XEXX010101000 cuenta como completo
 * sin régimen fiscal (no tiene obligaciones fiscales mexicanas).
 */
export function estadoFiscal(
  cliente: Pick<ClienteVermur, 'nombre' | 'rfc' | 'codigoPostal' | 'regimenFiscal'>,
): EstadoFiscal {
  const rfc = (cliente.rfc ?? '').trim();
  const nombre = (cliente.nombre ?? '').trim();
  const cp = (cliente.codigoPostal ?? '').trim();
  const regimen = (cliente.regimenFiscal ?? '').trim();

  if (!rfc || !nombre) return 'incompleto';

  // Extranjero con RFC genérico: no necesita CP ni régimen
  if (esRFCExtranjero(rfc)) return 'completo';

  if (!cp || !regimen) return 'incompleto';

  return 'completo';
}

/**
 * Mensaje legible de qué falta para completar los datos fiscales.
 * Útil para la ficha y para tooltips.
 */
export function faltantesFiscales(
  cliente: Pick<ClienteVermur, 'nombre' | 'rfc' | 'codigoPostal' | 'regimenFiscal'>,
): string[] {
  const rfc = (cliente.rfc ?? '').trim();
  const nombre = (cliente.nombre ?? '').trim();
  const cp = (cliente.codigoPostal ?? '').trim();
  const regimen = (cliente.regimenFiscal ?? '').trim();
  const faltantes: string[] = [];
  if (!nombre) faltantes.push('Razón social');
  if (!rfc) faltantes.push('RFC');
  if (esRFCExtranjero(rfc)) return faltantes;
  if (!cp) faltantes.push('Código postal');
  if (!regimen) faltantes.push('Régimen fiscal');
  return faltantes;
}
