/**
 * validadores.ts
 *
 * Validadores de FORMATO/ESTRUCTURA (lógica pura) portados del concepto de
 * validaciones.py (repo kyc_vermur de Luis). E7.
 *
 * Alcance: SOLO validación matemática estándar (estructura + dígito verificador).
 *   - RFC  : estructura SAT (física 13 / moral 12) + dígito verificador.
 *   - CLABE: 18 dígitos + dígito de control ponderado + banco existente.
 *
 * NO valida existencia real ante SAT/banco. NO contiene reglas de negocio de
 * Vermur. AISLAMIENTO: no importa nada de React ni Firebase.
 *
 * Ejecutar tests: npx vitest run
 */

// ─── Resultado común ───────────────────────────────────────────────────────────

export interface ResultadoValidacion {
  /** true si el formato/estructura es válido. */
  valido: boolean;
  /** Mensaje de error legible para UI cuando valido === false. '' si es válido. */
  error: string;
}

const OK: ResultadoValidacion = { valido: true, error: '' };
const fail = (error: string): ResultadoValidacion => ({ valido: false, error });

// ════════════════════════════════════════════════════════════════════════════
// RFC — algoritmo SAT (estructura + dígito verificador)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Estructura RFC:
 *   - Persona MORAL  (12): 3 letras + 6 dígitos fecha (AAMMDD) + 3 homoclave
 *   - Persona FÍSICA (13): 4 letras + 6 dígitos fecha (AAMMDD) + 3 homoclave
 * La homoclave son 2 caracteres (alfanum) + 1 dígito verificador final.
 */
const RFC_MORAL = /^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{2}[0-9A]$/;
const RFC_FISICA = /^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{2}[0-9A]$/;

/**
 * Diccionario oficial SAT para el dígito verificador.
 * Posición = valor asignado a cada carácter.
 * Índice: 0-9 dígitos, A-Z letras, Ñ y espacio. '0' relleno inicial para morales.
 */
const RFC_DICCIONARIO = '0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ';

/**
 * RFCs genéricos oficiales del SAT. Son válidos ante el SAT aunque NO cumplen
 * el dígito verificador estándar, por lo que se aceptan vía whitelist.
 *   - XAXX010101000: genérico NACIONAL (operaciones con público en general /
 *                    clientes sin RFC mexicano).
 *   - XEXX010101000: genérico EXTRANJERO (residentes en el extranjero sin RFC).
 * Relevantes para Vermur por su operación de comercio internacional.
 */
const RFC_GENERICOS = new Set(['XAXX010101000', 'XEXX010101000']);

/**
 * Calcula el dígito verificador esperado para los primeros 11 (física) o
 * 10 (moral) caracteres del RFC, siguiendo el algoritmo oficial del SAT.
 *
 * Para morales (12 chars) se antepone un espacio para completar 12 posiciones,
 * de modo que el cálculo use siempre los 12 caracteres previos al verificador.
 */
function calcularDigitoVerificadorRFC(rfcSinDigito: string): string {
  // El cálculo usa las 12 posiciones previas al dígito verificador.
  // Morales tienen 11 chars antes del verificador → se antepone un espacio.
  const base = rfcSinDigito.length === 11 ? ' ' + rfcSinDigito : rfcSinDigito;

  let suma = 0;
  // Factores: 13, 12, 11, ... 2 para las 12 posiciones.
  for (let i = 0; i < base.length; i++) {
    const valor = RFC_DICCIONARIO.indexOf(base[i]);
    if (valor === -1) return ''; // carácter fuera del diccionario → inválido
    const factor = 13 - i;
    suma += valor * factor;
  }

  const residuo = suma % 11;
  if (residuo === 0) return '0';
  const dif = 11 - residuo;
  if (dif === 10) return 'A';
  return String(dif);
}

/**
 * Valida un RFC mexicano: estructura SAT + dígito verificador.
 *
 * @param rfcInput RFC capturado (se normaliza a mayúsculas y se recortan espacios).
 * @returns ResultadoValidacion con mensaje de error si aplica.
 */
export function validarRFC(rfcInput: string): ResultadoValidacion {
  const rfc = (rfcInput ?? '').trim().toUpperCase();

  if (rfc === '') return fail('El RFC es obligatorio.');

  // RFCs genéricos del SAT: válidos por whitelist (no pasan dígito verificador).
  if (RFC_GENERICOS.has(rfc)) return OK;

  if (rfc.length !== 12 && rfc.length !== 13) {
    return fail('El RFC debe tener 12 dígitos (moral) o 13 (física).');
  }

  const esModeral = rfc.length === 12;
  const estructuraOk = esModeral ? RFC_MORAL.test(rfc) : RFC_FISICA.test(rfc);
  if (!estructuraOk) {
    return fail('El formato del RFC no es válido.');
  }

  // Validar la fecha embebida (posiciones de los 6 dígitos AAMMDD).
  const offsetFecha = esModeral ? 3 : 4;
  const mes = parseInt(rfc.substring(offsetFecha + 2, offsetFecha + 4), 10);
  const dia = parseInt(rfc.substring(offsetFecha + 4, offsetFecha + 6), 10);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
    return fail('La fecha contenida en el RFC no es válida.');
  }

  // Dígito verificador.
  const sinDigito = rfc.substring(0, rfc.length - 1);
  const digitoReal = rfc[rfc.length - 1];
  const digitoEsperado = calcularDigitoVerificadorRFC(sinDigito);
  if (digitoEsperado === '' || digitoReal !== digitoEsperado) {
    return fail('El dígito verificador del RFC no coincide.');
  }

  return OK;
}

// ════════════════════════════════════════════════════════════════════════════
// CLABE — 18 dígitos + dígito de control ponderado + banco existente
// ════════════════════════════════════════════════════════════════════════════

/**
 * Catálogo estándar de bancos por código CLABE (3 primeros dígitos).
 * Fuente: catálogo público Banxico / ABM. Estable.
 * Si Luis tiene bancos personalizados/adicionales, se integran después.
 */
export const BANCOS_CLABE: Record<string, string> = {
  '002': 'BANAMEX',
  '006': 'BANCOMEXT',
  '009': 'BANOBRAS',
  '012': 'BBVA MÉXICO',
  '014': 'SANTANDER',
  '019': 'BANJÉRCITO',
  '021': 'HSBC',
  '030': 'BAJÍO',
  '036': 'INBURSA',
  '042': 'MIFEL',
  '044': 'SCOTIABANK',
  '058': 'BANREGIO',
  '059': 'INVEX',
  '060': 'BANSI',
  '062': 'AFIRME',
  '072': 'BANORTE',
  '106': 'BANK OF AMERICA',
  '108': 'MUFG',
  '110': 'JP MORGAN',
  '112': 'BMONEX',
  '113': 'VE POR MÁS',
  '127': 'AZTECA',
  '128': 'AUTOFIN',
  '129': 'BARCLAYS',
  '130': 'COMPARTAMOS',
  '132': 'MULTIVA BANCO',
  '133': 'ACTINVER',
  '136': 'INTERCAM BANCO',
  '137': 'BANCOPPEL',
  '138': 'ABC CAPITAL',
  '140': 'CONSUBANCO',
  '141': 'VOLKSWAGEN BANK',
  '143': 'CIBANCO',
  '145': 'BBASE',
  '147': 'BANKAOOL',
  '148': 'PAGATODO',
  '150': 'INMOBILIARIO',
  '151': 'DONDE',
  '152': 'BANCREA',
  '154': 'BANCO COVALTO',
  '155': 'ICBC',
  '156': 'SABADELL',
  '157': 'SHINHAN',
  '158': 'MIZUHO BANK',
  '159': 'BANK OF CHINA',
  '160': 'BANCO S3',
  '166': 'BANCO DEL BIENESTAR',
  '168': 'HIPOTECARIA FEDERAL',
  '600': 'MONEXCB',
  '601': 'GBM',
  '602': 'MASARI',
  '605': 'VALUE',
  '608': 'VECTOR',
  '616': 'FINAMEX',
  '617': 'VALMEX',
  '620': 'PROFUTURO',
  '630': 'CB INTERCAM',
  '631': 'CI BOLSA',
  '634': 'FINCOMUN',
  '638': 'NU MÉXICO',
  '646': 'STP',
  '652': 'CREDICAPITAL',
  '653': 'KUSPIT',
  '656': 'UNAGRA',
  '659': 'ASP INTEGRA OPC',
  '661': 'ALTERNATIVOS',
  '670': 'LIBERTAD',
  '677': 'CAJA POP MEXICA',
  '683': 'CAJA TELEFONIST',
  '684': 'TRANSFER',
  '689': 'FOMPED',
};

/**
 * Pesos del algoritmo de dígito de control CLABE, aplicados módulo 10 a las
 * primeras 17 posiciones. El dígito de control = (10 - (suma % 10)) % 10.
 */
const PESOS_CLABE = [3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7];

/**
 * Calcula el dígito de control esperado para una CLABE de 18 dígitos
 * (usa las primeras 17 posiciones).
 */
function calcularDigitoControlCLABE(clabe: string): number {
  let suma = 0;
  for (let i = 0; i < 17; i++) {
    const producto = (parseInt(clabe[i], 10) * PESOS_CLABE[i]) % 10;
    suma += producto;
  }
  return (10 - (suma % 10)) % 10;
}

/**
 * Valida una CLABE interbancaria: 18 dígitos + dígito de control + banco existente.
 *
 * @param clabeInput CLABE capturada (se recortan espacios).
 * @returns ResultadoValidacion con mensaje de error si aplica.
 */
export function validarCLABE(clabeInput: string): ResultadoValidacion {
  const clabe = (clabeInput ?? '').trim();

  if (clabe === '') return fail('La CLABE es obligatoria.');

  if (!/^[0-9]{18}$/.test(clabe)) {
    return fail('La CLABE debe tener exactamente 18 dígitos.');
  }

  const codigoBanco = clabe.substring(0, 3);
  if (!(codigoBanco in BANCOS_CLABE)) {
    return fail(`El código de banco "${codigoBanco}" no existe en el catálogo.`);
  }

  const digitoEsperado = calcularDigitoControlCLABE(clabe);
  const digitoReal = parseInt(clabe[17], 10);
  if (digitoReal !== digitoEsperado) {
    return fail('El dígito de control de la CLABE no coincide.');
  }

  return OK;
}

/**
 * Helper: devuelve el nombre del banco a partir de una CLABE válida, o '' si
 * el código no existe. No valida el dígito de control (usar validarCLABE para eso).
 */
export function bancoDeCLABE(clabeInput: string): string {
  const clabe = (clabeInput ?? '').trim();
  if (!/^[0-9]{3}/.test(clabe)) return '';
  return BANCOS_CLABE[clabe.substring(0, 3)] ?? '';
}
