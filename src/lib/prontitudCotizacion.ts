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

export interface Prontitud {
  /** Hay al menos una línea registrada. Una solicitud vacía no se envía. */
  conConceptos: boolean;
  /** Todas las líneas tienen concepto del catálogo, proveedor y monto. */
  lista: boolean;
  /** Al menos una línea ya trae proveedor: hay respuestas que registrar. */
  algunProveedor: boolean;
  faltantes: Faltante[];
  totalLineas: number;
  lineasCompletas: number;
}

const TEXTO_FALTANTE: Record<TipoFaltante, string> = {
  sin_concepto:  'sin concepto del catálogo',
  sin_proveedor: 'sin proveedor',
  sin_monto:     'sin costo capturado',
};

/** Qué le falta a una línea. Puede faltarle más de una cosa. */
export function faltantesDeLinea(l: LineaPlana): TipoFaltante[] {
  const faltan: TipoFaltante[] = [];

  // Sin conceptoId la tarifa no hace match y la línea es un texto suelto.
  // Es el agujero de CC-1..CC-4, que reintrodujimos y volvimos a cerrar.
  if (!l.conceptoId) faltan.push('sin_concepto');

  if (!l.proveedorNombre?.trim()) faltan.push('sin_proveedor');

  // Lo que bloquea es que NADIE haya capturado el costo, no que valga cero.
  // Un concepto absorbido o puesto con pérdida a propósito es válido: «a veces
  // hay que poner el segundo concepto con pérdida, y el profit ponérselo al
  // flete internacional». Un campo vacío no es lo mismo que un cero declarado.
  if (!l.costoCapturado || !Number.isFinite(l.costo)) faltan.push('sin_monto');

  return faltan;
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
  let completas = 0;

  lineas.forEach(l => {
    const faltan = faltantesDeLinea(l);
    if (faltan.length === 0) {
      completas++;
      return;
    }
    faltan.forEach(tipo => {
      faltantes.push({
        lineaId: l.id,
        concepto: l.concepto || '(sin nombre)',
        tipo,
      });
    });
  });

  return {
    conConceptos: lineas.length > 0,
    lista: lineas.length > 0 && faltantes.length === 0,
    algunProveedor: lineas.some(l => Boolean(l.proveedorNombre?.trim())),
    faltantes,
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
