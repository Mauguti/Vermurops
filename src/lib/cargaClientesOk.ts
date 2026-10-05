/**
 * cargaClientesOk.ts — lógica de la carga de la base de clientes desde la
 * lista «Clientes OK» de Luis (tarea 65, 5-oct-2026).
 *
 * Lógica PURA: parseo del archivo, mapeo de columnas, empate contra lo que ya
 * existe y decisión campo por campo. No toca Firestore ni React: eso vive en
 * `scripts/cargarClientesOk.ts`, que es quien lee la base y escribe.
 *
 * Tres reglas la gobiernan:
 *
 *   1. **Lo capturado a mano no se pisa.** Si VermurOps ya tiene un valor y la
 *      lista dice otro, es un CONFLICTO: se lista y se deja como está. Quien
 *      decide es Julio, no el script.
 *   2. **Lo que no viene en la lista no se toca.** «Reemplazar la base» no es
 *      borrar: un cliente ausente de la lista se reporta y se queda igual.
 *      Nada se borra ni se desactiva.
 *   3. **No se adivina el empate.** Si un renglón podría ser dos clientes, es
 *      ambiguo y no se escribe nada. Un empate equivocado escribe el RFC de
 *      una empresa en la ficha de otra, y eso llega a una factura.
 *
 * El mapeo de columnas vive en UN solo lugar (`ALIAS_COLUMNA`): la lista real
 * todavía no llegó, así que lo que cambia cuando llegue es esa constante.
 */

import { validarRFC } from './validadores';
import { MAPA_REGIMENES, esRFCExtranjero } from './datosFiscales';

// ═══════════════════════════════════════════════════════════════════════════
// 1. Mapeo de columnas — el único lugar que se edita cuando llegue la lista
// ═══════════════════════════════════════════════════════════════════════════

/** Campos que la lista puede alimentar. */
export type CampoLista =
  | 'numeroEntidad'
  | 'nombre'
  | 'rfc'
  | 'codigoPostal'
  | 'regimenFiscal'
  | 'responsableVentas'
  | 'diasGeneral'
  | 'diasMaritimo'
  | 'diasAereo'
  | 'diasTerrestre';

/**
 * Encabezados aceptados por campo, en el orden en que se prefieren.
 *
 * Se comparan NORMALIZADOS (`normalizarEncabezado`): sin acentos, sin signos,
 * sin espacios y en minúsculas. Así «Núm. de entidad», «NUMERO DE ENTIDAD» y
 * «numero_de_entidad` son el mismo encabezado y no hay que listar variantes
 * de puntuación.
 */
export const ALIAS_COLUMNA: Record<CampoLista, string[]> = {
  numeroEntidad: [
    'entitynumber', 'numerodeentidad', 'numeroentidad', 'noentidad',
    'numentidad', 'entidadmagaya', 'numeroentidadmagaya', 'idmagaya',
    'referenciamagaya', 'entity', 'entidad',
  ],
  nombre: [
    'nombre', 'razonsocial', 'nombrerazonsocial', 'name', 'cliente',
    'nombredelcliente', 'customername',
  ],
  rfc: ['rfc', 'taxid', 'registrofederaldecontribuyentes', 'rfccliente'],
  codigoPostal: ['codigopostal', 'cp', 'zipcode', 'zip', 'cpfiscal'],
  regimenFiscal: [
    'regimenfiscal', 'regimen', 'clavederegimen', 'regimensat',
    'regimenfiscalsat',
  ],
  responsableVentas: [
    'responsabledeventas', 'responsableventas', 'vendedor', 'ejecutivo',
    'ejecutivodeventas', 'asesor', 'asesordeventas', 'salesrep',
    'responsable',
  ],
  diasGeneral: ['diasdecredito', 'diascredito', 'dias', 'credito', 'plazo'],
  diasMaritimo: [
    'diasmaritimo', 'diascreditomaritimo', 'diasdecreditomaritimo',
    'maritimo', 'creditomaritimo',
  ],
  diasAereo: [
    'diasaereo', 'diascreditoaereo', 'diasdecreditoaereo', 'aereo',
    'creditoaereo',
  ],
  diasTerrestre: [
    'diasterrestre', 'diascreditoterrestre', 'diasdecreditoterrestre',
    'terrestre', 'creditoterrestre',
  ],
};

/** Sin estas dos no hay cómo empatar ni qué reportar. */
export const COLUMNAS_MINIMAS: CampoLista[] = ['nombre'];

export function normalizarEncabezado(valor: string): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export interface MapeoColumnas {
  /** Campo → índice de columna en el archivo. */
  porCampo: Partial<Record<CampoLista, number>>;
  /** Encabezados del archivo que ningún alias reconoció. */
  ignorados: string[];
  /** Campos mínimos que no se encontraron. */
  faltantes: CampoLista[];
}

/**
 * Resuelve qué columna del archivo alimenta cada campo.
 *
 * Una columna solo se usa UNA vez: si el archivo trae «Días de crédito» y
 * «Días crédito marítimo», el alias más específico se queda con la suya
 * porque los campos se recorren en el orden de `ALIAS_COLUMNA` y el general
 * va al final.
 */
export function resolverMapeo(encabezados: string[]): MapeoColumnas {
  const normalizados = encabezados.map(normalizarEncabezado);
  const usados = new Set<number>();
  const porCampo: Partial<Record<CampoLista, number>> = {};

  // Las modalidades antes que el general: «maritimo» es más específico que
  // «credito» y las dos podrían caer en la misma columna.
  const orden: CampoLista[] = [
    'numeroEntidad', 'nombre', 'rfc', 'codigoPostal', 'regimenFiscal',
    'responsableVentas', 'diasMaritimo', 'diasAereo', 'diasTerrestre',
    'diasGeneral',
  ];

  for (const campo of orden) {
    for (const alias of ALIAS_COLUMNA[campo]) {
      const i = normalizados.findIndex((h, idx) => h === alias && !usados.has(idx));
      if (i >= 0) {
        porCampo[campo] = i;
        usados.add(i);
        break;
      }
    }
  }

  const ignorados = encabezados.filter((_, i) => !usados.has(i) && normalizados[i] !== '');
  const faltantes = COLUMNAS_MINIMAS.filter(c => porCampo[c] === undefined);

  return { porCampo, ignorados, faltantes };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Parseo del archivo (CSV / TSV, con comillas y delimitador autodetectado)
// ═══════════════════════════════════════════════════════════════════════════

const DELIMITADORES = [',', ';', '\t', '|'] as const;

/**
 * Delimitador del archivo, contado sobre el PRIMER renglón y fuera de
 * comillas. Excel en es-MX exporta con `;` y una razón social con coma
 * («MULLER, S.A. DE C.V.») haría ganar a la coma si se contara dentro.
 */
export function detectarDelimitador(primerRenglon: string): string {
  let mejor = ',';
  let max = -1;
  for (const d of DELIMITADORES) {
    let cuenta = 0;
    let enComillas = false;
    for (let i = 0; i < primerRenglon.length; i++) {
      const c = primerRenglon[i];
      if (c === '"') enComillas = !enComillas;
      else if (c === d && !enComillas) cuenta++;
    }
    if (cuenta > max) { max = cuenta; mejor = d; }
  }
  return mejor;
}

/**
 * Parsea un CSV/TSV completo a matriz de celdas.
 *
 * Soporta: BOM, CRLF, comillas dobles, comillas escapadas (`""`), saltos de
 * línea dentro de comillas y renglones en blanco (que se descartan).
 */
export function parsearCSV(texto: string, delimitador?: string): string[][] {
  const limpio = texto.replace(/^﻿/, '');
  const primerSalto = limpio.search(/\r?\n/);
  const cabecera = primerSalto >= 0 ? limpio.slice(0, primerSalto) : limpio;
  const d = delimitador ?? detectarDelimitador(cabecera);

  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let enComillas = false;

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];

    if (enComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') { celda += '"'; i++; }
        else enComillas = false;
      } else celda += c;
      continue;
    }

    if (c === '"') { enComillas = true; continue; }
    if (c === d) { fila.push(celda); celda = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') {
      fila.push(celda);
      celda = '';
      if (fila.some(v => v.trim() !== '')) filas.push(fila);
      fila = [];
      continue;
    }
    celda += c;
  }

  fila.push(celda);
  if (fila.some(v => v.trim() !== '')) filas.push(fila);

  return filas.map(f => f.map(v => v.trim()));
}

/** Un renglón de la lista, ya mapeado a campos. */
export interface RenglonLista {
  /** Número de renglón en el archivo, contando el encabezado como 1. */
  linea: number;
  numeroEntidad: string;
  nombre: string;
  rfc: string;
  codigoPostal: string;
  regimenFiscal: string;
  responsableVentas: string;
  diasGeneral: string;
  diasMaritimo: string;
  diasAereo: string;
  diasTerrestre: string;
}

const RENGLON_VACIO: Omit<RenglonLista, 'linea'> = {
  numeroEntidad: '', nombre: '', rfc: '', codigoPostal: '', regimenFiscal: '',
  responsableVentas: '', diasGeneral: '', diasMaritimo: '', diasAereo: '',
  diasTerrestre: '',
};

export function leerRenglones(celdas: string[][], mapeo: MapeoColumnas): RenglonLista[] {
  const renglones: RenglonLista[] = [];
  for (let i = 1; i < celdas.length; i++) {
    const fila = celdas[i];
    const r: RenglonLista = { linea: i + 1, ...RENGLON_VACIO };
    for (const [campo, idx] of Object.entries(mapeo.porCampo) as [CampoLista, number][]) {
      r[campo] = fila[idx] ?? '';
    }
    if (r.nombre === '' && r.numeroEntidad === '' && r.rfc === '') continue;
    renglones.push(r);
  }
  return renglones;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Normalización de nombres para el empate
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sufijos societarios que se quitan antes de comparar.
 *
 * Es lo que hace que «FIBREMEX SA de CV» y «FIBREMEX» se vean iguales — el
 * caso que Luis dio como ejemplo de por qué la otra lista traía duplicados.
 */
const SUFIJOS = [
  'SA DE CV', 'S A DE C V', 'SAPI DE CV', 'S DE RL DE CV', 'SA DE CV SOFOM ENR',
  'S EN C', 'SA PROMOTORA DE INVERSION DE CV', 'SOFOM ENR',
  'SA', 'SAPI', 'SRL', 'S DE RL', 'SC', 'AC', 'SAS', 'SPR DE RL',
  'INC', 'LLC', 'LTD', 'CO', 'CORP', 'GMBH', 'BV', 'NV', 'SL', 'SPA', 'PTE LTD',
];

/**
 * Nombre comparable: sin acentos, sin signos, sin sufijo societario y sin
 * espacios. Se quitan los espacios al final a propósito: «UNO RETAIL» y
 * «UNORETAIL» son el mismo cliente en la base real de Vermur.
 */
export function normalizarNombre(valor: string): string {
  let s = (valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

  // El sufijo solo cuenta al FINAL del nombre: «CO» dentro de «COPARMEX» no
  // es una forma societaria.
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const suf of SUFIJOS) {
      if (s === suf) continue;
      if (s.endsWith(' ' + suf)) {
        s = s.slice(0, -(suf.length + 1)).trim();
        cambio = true;
      }
    }
  }

  return s.replace(/ /g, '');
}

/** Número de entidad comparable: sin ceros a la izquierda ni signos. */
export function normalizarClave(valor: string): string {
  const s = (valor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^\d+$/.test(s)) return String(parseInt(s, 10));
  return s;
}

/** RFC comparable. */
export function normalizarRFC(valor: string): string {
  return (valor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Empate contra lo que ya existe
// ═══════════════════════════════════════════════════════════════════════════

/** Lo que el script necesita de un cliente de la base. Nada más. */
export interface ClienteBase {
  id: string;
  nombre: string;
  rfc?: string | null;
  codigoPostal?: string | null;
  regimenFiscal?: string | null;
  responsableVentas?: string | null;
  referenciaMagaya?: string | null;
  numeroEntidadMagaya?: string | null;
  origenDatos?: string | null;
  dias?: number | null;
  diasCreditoPorTipo?: { maritimo?: number; aereo?: number; terrestre?: number; general?: number } | null;
}

export type LlaveEmpate = 'numeroEntidad' | 'rfc' | 'nombre';
export type ResultadoEmpate = 'empatado' | 'nuevo' | 'ambiguo' | 'sin_llave';

export interface Empate {
  resultado: ResultadoEmpate;
  cliente?: ClienteBase;
  llave?: LlaveEmpate;
  /** Cuando es ambiguo: los ids que compitieron, para listarlos. */
  candidatos?: string[];
  razon?: string;
}

/**
 * RFC efectivo de un cliente de la base.
 *
 * El export de Magaya guardó el Tax ID en `numeroEntidadMagaya`, no en `rfc`
 * (PLAN-CARGA-FISCAL.md, tarea 42): 318 de 817 clientes lo traen ahí y 0 en
 * `rfc`. Así que para empatar por RFC hay que mirar los dos campos, o el
 * empate fallaría justo en los clientes que SÍ tienen RFC.
 */
export function rfcEfectivo(c: ClienteBase): string {
  const propio = normalizarRFC(c.rfc ?? '');
  if (propio && validarRFC(propio).valido) return propio;
  const magaya = normalizarRFC(c.numeroEntidadMagaya ?? '');
  if (magaya && validarRFC(magaya).valido) return magaya;
  return propio;
}

/** Índices de la base, armados una vez para no recorrer 817 por renglón. */
export interface IndiceBase {
  porClave: Map<string, ClienteBase[]>;
  porRFC: Map<string, ClienteBase[]>;
  porNombre: Map<string, ClienteBase[]>;
}

export function indexarBase(clientes: ClienteBase[]): IndiceBase {
  const porClave = new Map<string, ClienteBase[]>();
  const porRFC = new Map<string, ClienteBase[]>();
  const porNombre = new Map<string, ClienteBase[]>();

  const push = (m: Map<string, ClienteBase[]>, k: string, c: ClienteBase) => {
    if (!k) return;
    const lista = m.get(k);
    if (lista) { if (!lista.includes(c)) lista.push(c); } else m.set(k, [c]);
  };

  for (const c of clientes) {
    // El «número de entidad» de Magaya vive en `referenciaMagaya` (817 de 817).
    // `numeroEntidadMagaya` también se indexa porque ahí cayó el Tax ID y en
    // algunos documentos puede haber quedado el consecutivo.
    push(porClave, normalizarClave(c.referenciaMagaya ?? ''), c);
    push(porClave, normalizarClave(c.numeroEntidadMagaya ?? ''), c);
    push(porRFC, rfcEfectivo(c), c);
    push(porNombre, normalizarNombre(c.nombre ?? ''), c);
  }

  return { porClave, porRFC, porNombre };
}

/**
 * Empata un renglón: número de entidad → RFC → nombre normalizado.
 *
 * Dos candidatos con la misma llave es AMBIGUO y no se escribe nada. Dos
 * llaves que apuntan a clientes distintos (el RFC a uno, el nombre a otro)
 * también: es el síntoma de un duplicado en la base y adivinar lo empeora.
 */
export function empatar(r: RenglonLista, indice: IndiceBase): Empate {
  const clave = normalizarClave(r.numeroEntidad);
  const rfc = normalizarRFC(r.rfc);
  const nombre = normalizarNombre(r.nombre);

  if (!clave && !rfc && !nombre) {
    return { resultado: 'sin_llave', razon: 'El renglón no trae número de entidad, RFC ni nombre.' };
  }

  const intentos: { llave: LlaveEmpate; valor: string; mapa: Map<string, ClienteBase[]> }[] = [
    { llave: 'numeroEntidad', valor: clave, mapa: indice.porClave },
    { llave: 'rfc', valor: rfc, mapa: indice.porRFC },
    { llave: 'nombre', valor: nombre, mapa: indice.porNombre },
  ];

  for (const { llave, valor, mapa } of intentos) {
    if (!valor) continue;
    const candidatos = mapa.get(valor);
    if (!candidatos || candidatos.length === 0) continue;
    if (candidatos.length > 1) {
      return {
        resultado: 'ambiguo',
        llave,
        candidatos: candidatos.map(c => c.id),
        razon: `${candidatos.length} clientes comparten el mismo ${ETIQUETA_LLAVE[llave]} («${valor}»).`,
      };
    }
    return { resultado: 'empatado', cliente: candidatos[0], llave };
  }

  return { resultado: 'nuevo', razon: 'Ningún cliente de VermurOps empata por número de entidad, RFC ni nombre.' };
}

export const ETIQUETA_LLAVE: Record<LlaveEmpate, string> = {
  numeroEntidad: 'número de entidad de Magaya',
  rfc: 'RFC',
  nombre: 'nombre normalizado',
};

// ═══════════════════════════════════════════════════════════════════════════
// 5. Decisión campo por campo
// ═══════════════════════════════════════════════════════════════════════════

export type AccionCampo = 'escribe' | 'igual' | 'conflicto' | 'invalido' | 'sin_dato';

export interface CambioCampo {
  /** Ruta del campo en Firestore. Las modalidades van con punto. */
  campo: string;
  /** Etiqueta legible para la salida. */
  etiqueta: string;
  accion: AccionCampo;
  /** Valor actual en VermurOps, tal como está. */
  antes: unknown;
  /** Valor propuesto por la lista. Solo cuando la acción es `escribe`. */
  despues?: unknown;
  /** Por qué no se escribe, cuando no se escribe. */
  razon?: string;
}

function vacio(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

/** Días: acepta «45», «45 días», «45.0». Devuelve null si no es un entero ≥ 0. */
export function leerDias(valor: string): number | null {
  const s = (valor ?? '').trim();
  if (s === '') return null;
  const m = s.replace(/,/g, '.').match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  if (n > 365) return null;
  return n;
}

/** Régimen: acepta «601» y «601 - General de Ley Personas Morales». */
export function leerRegimen(valor: string): string | null {
  const s = (valor ?? '').trim();
  if (s === '') return null;
  const m = s.match(/\b(\d{3})\b/);
  if (!m) return null;
  return MAPA_REGIMENES[m[1]] ? m[1] : null;
}

/** CP: 5 dígitos. Un CP extranjero («M6H 1C2») no pasa, y es correcto. */
export function leerCodigoPostal(valor: string): string | null {
  const s = (valor ?? '').trim();
  if (s === '') return null;
  const soloDigitos = s.replace(/[^0-9]/g, '');
  if (!/^\d{5}$/.test(soloDigitos)) return null;
  return soloDigitos;
}

/**
 * Compara un campo de texto y decide.
 *
 * `normaliza` existe para que «ABC123456XY1» y «abc 123456 xy1» no se lean
 * como un conflicto cuando son el mismo valor escrito distinto.
 */
function decidirTexto(
  campo: string,
  etiqueta: string,
  actual: unknown,
  propuesto: string | null,
  razonInvalido: string,
  crudo: string,
  normaliza: (v: string) => string = v => v.trim().toUpperCase(),
): CambioCampo {
  if (crudo.trim() === '') {
    return { campo, etiqueta, accion: 'sin_dato', antes: actual };
  }
  if (propuesto === null) {
    return { campo, etiqueta, accion: 'invalido', antes: actual, razon: razonInvalido };
  }
  if (vacio(actual)) {
    return { campo, etiqueta, accion: 'escribe', antes: actual ?? null, despues: propuesto };
  }
  if (normaliza(String(actual)) === normaliza(propuesto)) {
    return { campo, etiqueta, accion: 'igual', antes: actual };
  }
  return {
    campo, etiqueta, accion: 'conflicto', antes: actual,
    razon: `VermurOps tiene «${String(actual)}» y la lista dice «${propuesto}». No se pisa.`,
  };
}

export interface ContextoUsuarios {
  /** Correos de los usuarios de la plataforma, en minúsculas. */
  correos: string[];
  /** Nombre normalizado → correo. Para empatar «Itzel Laurean». */
  porNombre: Map<string, string>;
}

/**
 * Arma el índice de usuarios con el que se empata el responsable de ventas.
 *
 * La lista de Luis trae nombres de personas, no correos. Si un nombre no
 * empata contra ningún usuario, se LISTA: inventar un correo pondría los
 * filtros de «Solo los míos» a apuntar a una cuenta que no existe.
 */
export function indexarUsuarios(
  usuarios: { email: string; nombre?: string | null }[],
): ContextoUsuarios {
  const porNombre = new Map<string, string>();
  const correos: string[] = [];
  for (const u of usuarios) {
    const email = (u.email ?? '').toLowerCase().trim();
    if (!email) continue;
    correos.push(email);
    const claves = new Set<string>();
    if (u.nombre) claves.add(normalizarNombre(u.nombre));
    // «itzel.laurean@vermur.com» → «ITZELLAUREAN», para empatar un nombre
    // escrito a mano cuando el usuario no trae `nombre`.
    claves.add(normalizarNombre(email.split('@')[0].replace(/[._-]+/g, ' ')));
    for (const k of claves) if (k && !porNombre.has(k)) porNombre.set(k, email);
  }
  return { correos, porNombre };
}

/** Correo del usuario que corresponde a lo que dice la lista, o null. */
export function resolverResponsable(valor: string, ctx: ContextoUsuarios): string | null {
  const s = (valor ?? '').trim();
  if (s === '') return null;
  if (s.includes('@')) {
    const email = s.toLowerCase();
    return ctx.correos.includes(email) ? email : null;
  }
  return ctx.porNombre.get(normalizarNombre(s)) ?? null;
}

/** Días de crédito que ya tiene el cliente para una modalidad. */
function diasActuales(c: ClienteBase, modalidad: 'maritimo' | 'aereo' | 'terrestre' | 'general'): number | null {
  const porTipo = c.diasCreditoPorTipo;
  const v = porTipo ? porTipo[modalidad] : undefined;
  if (typeof v === 'number') return v;
  if (modalidad === 'general' && typeof c.dias === 'number') return c.dias;
  return null;
}

/**
 * Decide los días de una modalidad.
 *
 * **0 cuenta como vacío.** 742 de los 817 clientes traen los cuatro plazos en
 * cero porque Magaya no los tenía; tratar el cero como «capturado» haría que
 * la lista entera saliera en conflicto y la carga no serviría de nada. Un
 * plazo mayor que cero sí es un dato y no se pisa.
 */
function decidirDias(
  campo: string,
  etiqueta: string,
  actual: number | null,
  crudo: string,
): CambioCampo {
  if (crudo.trim() === '') return { campo, etiqueta, accion: 'sin_dato', antes: actual };
  const n = leerDias(crudo);
  if (n === null) {
    return {
      campo, etiqueta, accion: 'invalido', antes: actual,
      razon: `«${crudo.trim()}» no es un número de días entre 0 y 365.`,
    };
  }
  if (actual === null || actual === 0) {
    if (n === 0) return { campo, etiqueta, accion: 'sin_dato', antes: actual };
    return { campo, etiqueta, accion: 'escribe', antes: actual, despues: n };
  }
  if (actual === n) return { campo, etiqueta, accion: 'igual', antes: actual };
  return {
    campo, etiqueta, accion: 'conflicto', antes: actual,
    razon: `VermurOps tiene ${actual} días y la lista dice ${n}. No se pisa.`,
  };
}

export interface PlanRenglon {
  renglon: RenglonLista;
  empate: Empate;
  /** Vacío cuando el renglón no empató. */
  cambios: CambioCampo[];
  /** Avisos que no son cambios: enlaces sugeridos, responsables sin empate. */
  avisos: string[];
}

/**
 * Qué haría la carga con un renglón ya empatado.
 *
 * Los campos son exactamente los que la tarea autoriza: RFC, código postal,
 * régimen, días de crédito por modalidad, responsable de ventas y la marca
 * «Heredado de Magaya». Ninguno más — en particular NO se escribe
 * `numeroEntidadMagaya`, porque ese campo decide `estadoValidacion` y
 * llenarlo levantaría el freno de expediente de §4.18 sin que nadie lo
 * autorice.
 */
export function planearRenglon(
  r: RenglonLista,
  empate: Empate,
  usuarios: ContextoUsuarios,
): PlanRenglon {
  if (empate.resultado !== 'empatado' || !empate.cliente) {
    return { renglon: r, empate, cambios: [], avisos: [] };
  }

  const c = empate.cliente;
  const cambios: CambioCampo[] = [];
  const avisos: string[] = [];

  /*
   * Empató por una llave fuerte y el nombre no se parece.
   *
   * El RFC y el número de entidad ganan al nombre a propósito —son el
   * identificador y el nombre se escribe de mil formas—, pero un RFC
   * tecleado en el renglón equivocado de la lista empataría con otro cliente
   * y le escribiría encima su régimen y su responsable. El empate se
   * respeta, y se dice.
   */
  if (
    empate.llave && empate.llave !== 'nombre'
    && r.nombre.trim() !== ''
    && normalizarNombre(r.nombre) !== normalizarNombre(c.nombre)
  ) {
    avisos.push(
      `Empató por ${ETIQUETA_LLAVE[empate.llave]} pero los nombres no se parecen: ` +
      `la lista dice «${r.nombre.trim()}» y VermurOps «${c.nombre}». Vale la pena mirarlo.`,
    );
  }

  // ── RFC ──
  const rfcPropuesto = normalizarRFC(r.rfc);
  const rfcValido = rfcPropuesto && validarRFC(rfcPropuesto).valido ? rfcPropuesto : null;
  const rfcActual = vacio(c.rfc) ? null : normalizarRFC(c.rfc ?? '');
  const rfcEnMagaya = rfcEfectivo(c);
  cambios.push(decidirTexto(
    'rfc', 'RFC', rfcActual, rfcValido,
    `«${r.rfc.trim()}» no pasa la validación de RFC del SAT (estructura y dígito verificador).`,
    r.rfc, normalizarRFC,
  ));
  if (
    rfcValido && rfcActual === null && rfcEnMagaya && rfcEnMagaya !== rfcValido
  ) {
    avisos.push(
      `El Tax ID que trajo Magaya («${rfcEnMagaya}», en numeroEntidadMagaya) no es el ` +
      `RFC de la lista («${rfcValido}»). Se escribe el de la lista y se conserva el de Magaya.`,
    );
  }
  if (rfcValido && esRFCExtranjero(rfcValido)) {
    avisos.push('El RFC de la lista es el genérico de extranjero (XEXX010101000).');
  }

  // ── Código postal ──
  cambios.push(decidirTexto(
    'codigoPostal', 'Código postal', c.codigoPostal, leerCodigoPostal(r.codigoPostal),
    `«${r.codigoPostal.trim()}» no es un código postal de 5 dígitos (los extranjeros no se cargan).`,
    r.codigoPostal,
  ));

  // ── Régimen fiscal ──
  cambios.push(decidirTexto(
    'regimenFiscal', 'Régimen fiscal', c.regimenFiscal, leerRegimen(r.regimenFiscal),
    `«${r.regimenFiscal.trim()}» no es una clave del catálogo c_RegimenFiscal del SAT.`,
    r.regimenFiscal,
  ));

  // ── Responsable de ventas ──
  const correo = resolverResponsable(r.responsableVentas, usuarios);
  if (r.responsableVentas.trim() === '') {
    cambios.push({ campo: 'responsableVentas', etiqueta: 'Responsable de ventas', accion: 'sin_dato', antes: c.responsableVentas });
  } else if (correo === null) {
    cambios.push({
      campo: 'responsableVentas', etiqueta: 'Responsable de ventas', accion: 'invalido',
      antes: c.responsableVentas,
      razon: `«${r.responsableVentas.trim()}» no empata con ningún usuario de la plataforma.`,
    });
    avisos.push(`Responsable sin empate: «${r.responsableVentas.trim()}». Hay que invitarlo o corregir el nombre.`);
  } else {
    cambios.push(decidirTexto(
      'responsableVentas', 'Responsable de ventas', c.responsableVentas, correo,
      '', r.responsableVentas, v => v.trim().toLowerCase(),
    ));
  }

  // ── Días de crédito por modalidad ──
  cambios.push(decidirDias('diasCreditoPorTipo.maritimo', 'Días crédito marítimo', diasActuales(c, 'maritimo'), r.diasMaritimo));
  cambios.push(decidirDias('diasCreditoPorTipo.aereo', 'Días crédito aéreo', diasActuales(c, 'aereo'), r.diasAereo));
  cambios.push(decidirDias('diasCreditoPorTipo.terrestre', 'Días crédito terrestre', diasActuales(c, 'terrestre'), r.diasTerrestre));
  cambios.push(decidirDias('diasCreditoPorTipo.general', 'Días crédito general', diasActuales(c, 'general'), r.diasGeneral));
  // `dias` (el escalar legacy) sigue a `general`: lo leen el financiamiento y
  // la ficha con respaldo (`diasCreditoPorTipo.general ?? dias`), así que
  // dejarlos divergir daría dos respuestas al mismo plazo.
  const general = cambios[cambios.length - 1];
  if (general.accion === 'escribe') {
    cambios.push(decidirDias('dias', 'Días de crédito (campo legacy)', typeof c.dias === 'number' ? c.dias : null, r.diasGeneral));
  }

  // ── Marca «Heredado de Magaya» ──
  cambios.push(decidirMarcaMagaya(c, r, empate, avisos));

  return { renglon: r, empate, cambios, avisos };
}

/**
 * La marca «Heredado de Magaya» (`origenDatos: 'magaya'`).
 *
 * Solo se completa cuando el cliente YA se lee como de Magaya —tiene
 * `referenciaMagaya` o `numeroEntidadMagaya`—, así que escribirla no cambia
 * nada de lo que decide `estadoValidacion`: solo deja explícito lo que ya era.
 *
 * Un cliente con `origenDatos: 'manual'` NO se marca. Marcarlo lo movería de
 * `sin_validar` a `heredado_magaya` y con eso levantaría el freno de
 * expediente (§4.18) de un cliente que Administración no validó. Que un
 * nombre aparezca en la lista de Magaya no es la validación del expediente.
 */
function decidirMarcaMagaya(
  c: ClienteBase,
  r: RenglonLista,
  empate: Empate,
  avisos: string[],
): CambioCampo {
  const base = { campo: 'origenDatos', etiqueta: 'Marca «Heredado de Magaya»' };
  const esDeMagaya = !!c.referenciaMagaya || !!c.numeroEntidadMagaya;

  if (c.origenDatos === 'magaya') {
    return { ...base, accion: 'igual', antes: c.origenDatos };
  }
  if (c.origenDatos === 'manual') {
    return {
      ...base, accion: 'conflicto', antes: c.origenDatos,
      razon: 'Fue creado en VermurOps. Marcarlo como heredado de Magaya levantaría el freno de expediente (§4.18).',
    };
  }
  if (!esDeMagaya) {
    if (r.numeroEntidad.trim() !== '') {
      avisos.push(
        `El renglón trae el número de entidad «${r.numeroEntidad.trim()}» y el cliente no tiene ` +
        'ninguno. El enlace con Magaya se sugiere, no se escribe: ese campo decide el freno de expediente.',
      );
    }
    return {
      ...base, accion: 'sin_dato', antes: c.origenDatos ?? null,
      razon: `Empató por ${ETIQUETA_LLAVE[empate.llave ?? 'nombre']} y no tiene identificadores de Magaya. No se marca.`,
    };
  }
  return { ...base, accion: 'escribe', antes: c.origenDatos ?? null, despues: 'magaya' };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Resumen de la corrida
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clientes que más de un renglón reclama.
 *
 * Es el duplicado DENTRO de la lista: «FIBREMEX, S.A. de C.V.» en un renglón
 * y «Fibremex» en otro, que es justo lo que Luis dijo que tenía la otra lista.
 * Si no se detecta, los dos renglones escriben sobre el mismo cliente y gana
 * el último del archivo — sin que nadie se enterara de que había dos.
 */
export function clientesConVariosRenglones(planes: PlanRenglon[]): {
  clienteId: string;
  nombre: string;
  lineas: number[];
}[] {
  const porCliente = new Map<string, PlanRenglon[]>();
  for (const p of planes) {
    if (p.empate.resultado !== 'empatado' || !p.empate.cliente) continue;
    const id = p.empate.cliente.id;
    const lista = porCliente.get(id);
    if (lista) lista.push(p); else porCliente.set(id, [p]);
  }
  return [...porCliente.entries()]
    .filter(([, ps]) => ps.length > 1)
    .map(([clienteId, ps]) => ({
      clienteId,
      nombre: ps[0].empate.cliente!.nombre,
      lineas: ps.map(p => p.renglon.linea),
    }));
}

export interface ResumenCarga {
  renglones: number;
  empatados: number;
  nuevos: number;
  sinEmpate: number;
  /** Clientes que se tocarían, y cuántos campos en total. */
  clientesConCambios: number;
  camposAEscribir: number;
  conflictos: number;
  invalidos: number;
  /** Ids de clientes de la base que la lista no menciona. */
  ausentesDeLaLista: string[];
  /** Por llave de empate, cuántos renglones. */
  porLlave: Record<LlaveEmpate, number>;
}

export function resumir(planes: PlanRenglon[], base: ClienteBase[]): ResumenCarga {
  const tocados = new Set<string>();
  const empatadosIds = new Set<string>();
  let camposAEscribir = 0;
  let conflictos = 0;
  let invalidos = 0;
  let empatados = 0;
  let nuevos = 0;
  let sinEmpate = 0;
  const porLlave: Record<LlaveEmpate, number> = { numeroEntidad: 0, rfc: 0, nombre: 0 };

  for (const p of planes) {
    if (p.empate.resultado === 'empatado') {
      empatados++;
      if (p.empate.llave) porLlave[p.empate.llave]++;
      if (p.empate.cliente) empatadosIds.add(p.empate.cliente.id);
    } else if (p.empate.resultado === 'nuevo') nuevos++;
    else sinEmpate++;

    const escribe = p.cambios.filter(c => c.accion === 'escribe').length;
    if (escribe > 0 && p.empate.cliente) {
      tocados.add(p.empate.cliente.id);
      camposAEscribir += escribe;
    }
    conflictos += p.cambios.filter(c => c.accion === 'conflicto').length;
    invalidos += p.cambios.filter(c => c.accion === 'invalido').length;
  }

  return {
    renglones: planes.length,
    empatados, nuevos, sinEmpate,
    clientesConCambios: tocados.size,
    camposAEscribir, conflictos, invalidos,
    ausentesDeLaLista: base.filter(c => !empatadosIds.has(c.id)).map(c => c.id),
    porLlave,
  };
}

/**
 * El `update` de Firestore para un plan, solo con los campos que se escriben.
 *
 * Devuelve rutas con punto (`diasCreditoPorTipo.maritimo`) para no pisar el
 * resto del mapa. Si `diasCreditoPorTipo` no existe en el documento, la ruta
 * con punto lo crea con esa sola llave, así que el llamador completa las
 * demás con lo que ya hubiera (ver `completarDiasCredito`).
 */
export function updateDePlan(p: PlanRenglon): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const c of p.cambios) {
    if (c.accion === 'escribe') update[c.campo] = c.despues;
  }
  return update;
}

/**
 * Completa el mapa de días cuando el cliente no tenía ninguno.
 *
 * `DiasCredito` declara las cuatro modalidades. Si el documento no trae el
 * mapa y solo se escribiera `diasCreditoPorTipo.maritimo`, quedaría un mapa
 * incompleto que el tipo no admite y que la ficha leería como undefined en
 * las otras tres.
 */
export function completarDiasCredito(
  update: Record<string, unknown>,
  c: ClienteBase,
): Record<string, unknown> {
  const rutas = ['maritimo', 'aereo', 'terrestre', 'general'] as const;
  const tocaDias = rutas.some(m => `diasCreditoPorTipo.${m}` in update);
  if (!tocaDias) return update;
  if (c.diasCreditoPorTipo && typeof c.diasCreditoPorTipo === 'object') return update;

  const mapa: Record<string, number> = {};
  for (const m of rutas) {
    const ruta = `diasCreditoPorTipo.${m}`;
    const v = update[ruta];
    mapa[m] = typeof v === 'number' ? v : (m === 'general' && typeof c.dias === 'number' ? c.dias : 0);
    delete update[ruta];
  }
  update.diasCreditoPorTipo = mapa;
  return update;
}
