/**
 * prontitudCotizacion.ts
 *
 * ¿Está la cotización lista para avanzar? Y si no, ¿qué le falta?
 *
 * ── Por qué existe (BC-1) ──────────────────────────────────────────────────
 * Sesión 30-ago-2026. La líder de operaciones se estresó con botones que no
 * correspondían al momento. Un botón visible que no aplica es peor que uno
 * ausente: obliga a preguntarse si uno lo está usando mal.
 *
 * Pero esconder el botón y dejar un hueco solo cambia el problema por otro
 * —«no sé por qué no puedo avanzar»—, así que este módulo no devuelve un
 * booleano: devuelve QUÉ FALTA, con nombre y apellido, para poder ponerlo en
 * el lugar donde estaba el botón.
 *
 * Lógica pura: sin React ni Firestore.
 */

import { KanbanQuote } from '../components/quotes/QuotesData';
import { aplanarCotizacion, LineaPlana } from './lineasCotizacion';

export type TipoFaltante = 'sin_concepto' | 'sin_proveedor' | 'sin_monto';

export interface Faltante {
  lineaId: string;
  /** Nombre visible de la línea. Vacío si ni concepto tiene. */
  concepto: string;
  tipo: TipoFaltante;
}

/** Lo que se dice, pero no detiene a nadie. */
export type TipoAviso = 'venta_sin_costo';

export interface Aviso {
  lineaId: string;
  concepto: string;
  tipo: TipoAviso;
}

export interface Prontitud {
  /** Hay al menos una línea registrada. Una solicitud vacía no se envía. */
  conConceptos: boolean;
  /** Todas las líneas tienen concepto del catálogo, proveedor y monto. */
  lista: boolean;
  /** Al menos una línea ya trae proveedor: hay respuestas que registrar. */
  algunProveedor: boolean;
  faltantes: Faltante[];
  /** Informativos: no cuentan para `lista` ni detienen ninguna etapa. */
  avisos: Aviso[];
  totalLineas: number;
  lineasCompletas: number;
}

export const TEXTO_AVISO: Record<TipoAviso, string> = {
  venta_sin_costo: 'se cobra sin costo detrás',
};

const TEXTO_FALTANTE: Record<TipoFaltante, string> = {
  sin_concepto:  'sin concepto del catálogo',
  sin_proveedor: 'sin proveedor',
  sin_monto:     'sin costo capturado',
};

const tieneProveedor = (l: LineaPlana): boolean => Boolean(l.proveedorNombre?.trim());
const tieneCosto = (l: LineaPlana): boolean => Number.isFinite(l.costo) && l.costo > 0;

/**
 * Qué le falta a una línea PARA AVANZAR. Puede faltarle más de una cosa.
 *
 * ── Por qué el proveedor y el costo se exigen en pareja ────────────────────
 * Antes se pedían los dos en TODA línea, y eso trababa una categoría entera
 * de conceptos que existe de verdad: los que Vermur cobra y no le paga a
 * nadie. Le pasó a Pricing en producción con «Documentation»: venta 50, sin
 * costo, y la cotización no se podía ni enviar.
 *
 * La regla nueva los amarra entre sí, porque cada uno solo significa algo si
 * el otro está:
 *
 *   hay costo   → hace falta proveedor, porque sin él no hay orden de compra
 *                 y nadie sabe a quién pagarle.
 *   hay proveedor → hace falta costo, porque un proveedor sin importe es un
 *                 costo que se quedó a medias. Este es el caso que `sin_monto`
 *                 protegía y que NO se relaja: un costo olvidado hace nacer el
 *                 embarque mal y nadie se entera hasta el pago.
 *   ni uno ni otro, pero sí venta → es una línea de pura venta. Pasa, y se
 *                 avisa de forma informativa.
 *   ni uno ni otro ni venta → la línea no dice nada: sigue bloqueando.
 *
 * Un cero declarado (`costoCapturado`) sigue siendo válido y distinto de un
 * campo vacío: «a veces hay que poner el segundo concepto con pérdida, y el
 * profit ponérselo al flete internacional».
 */
export function faltantesDeLinea(l: LineaPlana): TipoFaltante[] {
  const faltan: TipoFaltante[] = [];

  // Sin conceptoId la tarifa no hace match y la línea es un texto suelto.
  // Es el agujero de CC-1..CC-4, que reintrodujimos y volvimos a cerrar.
  if (!l.conceptoId) faltan.push('sin_concepto');

  const conProveedor = tieneProveedor(l);
  const conCosto = tieneCosto(l);
  const conVenta = Number.isFinite(l.venta) && l.venta > 0;

  if (conCosto && !conProveedor) faltan.push('sin_proveedor');

  if (conProveedor && !l.costoCapturado) faltan.push('sin_monto');
  // Un costo que dice estar capturado y no es un número es un dato roto, no
  // una decisión: bloquea aunque la línea no tenga proveedor.
  else if (l.costoCapturado && !Number.isFinite(l.costo)) faltan.push('sin_monto');
  else if (!conProveedor && !conCosto && !l.costoCapturado && !conVenta) {
    faltan.push('sin_monto');
  }

  return faltan;
}

/** Lo que vale la pena decir de una línea, sin detenerla. */
export function avisosDeLinea(l: LineaPlana): TipoAviso[] {
  const avisos: TipoAviso[] = [];
  const conVenta = Number.isFinite(l.venta) && l.venta > 0;
  if (conVenta && !tieneCosto(l) && !l.costoCapturado) avisos.push('venta_sin_costo');
  return avisos;
}

/**
 * Evalúa la cotización completa.
 *
 * «Lista» es la definición que dio el cliente para habilitar el PDF: todos los
 * conceptos con proveedor y monto. La misma condición gobierna consolidar,
 * enviar al cliente y marcar ganada — esta última porque de ahí nace el
 * embarque heredando los cargos: si falta un costo, el embarque nace mal y
 * nadie se entera hasta pagarle al proveedor.
 */
export function evaluarProntitud(quote: KanbanQuote): Prontitud {
  const lineas = aplanarCotizacion(quote);

  const faltantes: Faltante[] = [];
  const avisos: Aviso[] = [];
  let completas = 0;

  lineas.forEach(l => {
    const concepto = l.concepto || '(sin nombre)';

    avisosDeLinea(l).forEach(tipo => avisos.push({ lineaId: l.id, concepto, tipo }));

    const faltan = faltantesDeLinea(l);
    if (faltan.length === 0) {
      completas++;
      return;
    }
    faltan.forEach(tipo => faltantes.push({ lineaId: l.id, concepto, tipo }));
  });

  return {
    conConceptos: lineas.length > 0,
    lista: lineas.length > 0 && faltantes.length === 0,
    algunProveedor: lineas.some(l => Boolean(l.proveedorNombre?.trim())),
    faltantes,
    avisos,
    totalLineas: lineas.length,
    lineasCompletas: completas,
  };
}

/** Una línea de texto por faltante: «Maniobras de descarga — sin proveedor». */
export function textoFaltante(f: Faltante): string {
  return `${f.concepto} — ${TEXTO_FALTANTE[f.tipo]}`;
}

/**
 * Encabezado del bloque que sustituye al botón.
 *
 * Cuenta CONCEPTOS, no faltantes: a un mismo concepto pueden faltarle dos
 * cosas y decir «faltan 4» cuando son 2 conceptos confunde más de lo que
 * informa.
 */
export function resumenFaltantes(p: Prontitud): string {
  if (p.totalLineas === 0) {
    return 'Esta cotización todavía no tiene conceptos.';
  }
  const conceptos = new Set(p.faltantes.map(f => f.lineaId)).size;
  if (conceptos === 0) return '';
  return conceptos === 1
    ? 'Falta 1 concepto por completar'
    : `Faltan ${conceptos} conceptos por completar`;
}

/** Agrupa los faltantes por línea, para no repetir el nombre del concepto. */
export function faltantesPorLinea(
  p: Prontitud,
): { lineaId: string; concepto: string; tipos: TipoFaltante[] }[] {
  const mapa = new Map<string, { lineaId: string; concepto: string; tipos: TipoFaltante[] }>();

  p.faltantes.forEach(f => {
    const actual = mapa.get(f.lineaId) ?? { lineaId: f.lineaId, concepto: f.concepto, tipos: [] };
    actual.tipos.push(f.tipo);
    mapa.set(f.lineaId, actual);
  });

  return [...mapa.values()];
}

/** Frase para una línea con varios faltantes: «sin proveedor y sin monto». */
export function textoFaltantesLinea(tipos: TipoFaltante[]): string {
  const textos = tipos.map(t => TEXTO_FALTANTE[t]);
  if (textos.length === 1) return textos[0];
  return `${textos.slice(0, -1).join(', ')} y ${textos[textos.length - 1]}`;
}

/**
 * Servicios elegidos que no tienen NINGUNA línea.
 *
 * La vista plana solo enseña lo que existe: un servicio de la ruta B sin
 * cotización seleccionada no aporta línea, y uno recién agregado tampoco. Para
 * `evaluarProntitud` son invisibles — y consolidar una multimodal con el
 * terrestre aún sin cotizar se vería «lista» sin estarlo. El guard viejo sí
 * atrapaba ese caso; este helper lo conserva en el mundo de tarjetas.
 */
export function serviciosSinLineas(quote: KanbanQuote): { id: string; tipo: string }[] {
  const lineas = aplanarCotizacion(quote);
  const conLinea = new Set(lineas.map(l => l.servicioId));
  return (quote.servicios ?? [])
    .filter(s => !conLinea.has(s.id))
    .map(s => ({ id: s.id, tipo: s.tipo }));
}

