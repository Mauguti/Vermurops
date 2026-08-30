/**
 * traficoServicio.ts
 *
 * Resuelve el tráfico (importación / exportación) y la modalidad de un
 * servicio, incluidas las cotizaciones anteriores a que esos campos existieran.
 *
 * ── Por qué hace falta ─────────────────────────────────────────────────────
 * El folio del embarque codifica ambos: VLIM es impo marítimo, VLET es expo
 * terrestre. Sin tráfico no hay prefijo posible.
 *
 * Regla que gobierna todo este módulo: ante la duda NO se inventa el dato.
 * Un folio mal formado queda impreso en documentos que salen al cliente; uno
 * marcado como incompleto se corrige antes de imprimirse.
 *
 * Lógica pura: sin React ni Firestore.
 */

import { ServicioSolicitado, TraficoServicio } from '../components/quotes/QuotesData';
import { Servicio, ModalidadServicio } from '../config/serviciosStore';

// ─── Modalidad ────────────────────────────────────────────────────────────────

/**
 * Modalidad de un servicio, resuelta contra el catálogo.
 *
 * Se busca por id y por nombre porque el campo `tipo` no es homogéneo: el
 * formulario de nueva cotización guarda el id del catálogo (`srv-def-2`)
 * mientras que los datos más viejos usan el nombre canónico (`terrestre`).
 *
 * Devuelve null cuando el servicio no define modalidad por sí solo —despacho
 * aduanal, seguro— o cuando no se encuentra. En ambos casos la línea se pega
 * al embarque de mayor venta, que es el comportamiento ya probado.
 */
export function modalidadDeServicio(
  tipo: string,
  catalogo: Servicio[],
): ModalidadServicio | null {
  const porId = catalogo.find(s => s.id === tipo);
  if (porId) return porId.modalidad ?? null;

  const t = tipo.trim().toLowerCase();

  // Nombres canónicos de los datos anteriores al catálogo.
  const CANONICOS: Record<string, ModalidadServicio> = {
    maritimo: 'maritimo',
    marítimo: 'maritimo',
    terrestre: 'terrestre',
    aereo: 'aereo',
    aéreo: 'aereo',
  };
  if (CANONICOS[t]) return CANONICOS[t];

  const porNombre = catalogo.find(s => s.nombre.trim().toLowerCase() === t);
  return porNombre?.modalidad ?? null;
}

// ─── Tráfico ──────────────────────────────────────────────────────────────────

/** Cómo se supo el tráfico. Importa para saber cuánto confiar en el folio. */
export type FuenteTrafico = 'declarado' | 'derivado' | 'desconocido';

export interface ResolucionTrafico {
  trafico: TraficoServicio | null;
  fuente: FuenteTrafico;
  /** Explicación para la advertencia, cuando no se pudo determinar. */
  motivo?: string;
}

/**
 * Pistas de que un extremo de la ruta está en México.
 *
 * Deliberadamente cortas y específicas: es mejor no derivar que derivar mal.
 *
 * Ojo con los nombres compartidos entre países. «Laredo» a secas es Texas; el
 * mexicano es «Nuevo Laredo». Poner `laredo` marcaba «Laredo, USA» como México
 * y convertía una exportación en tráfico indeterminado — o peor, al revés.
 * Por eso el cotejo es por TOKEN y no por subcadena.
 */
const PISTAS_MEXICO_TOKEN = new Set([
  'méxico', 'mexico', 'mex', 'mx', 'mexicana', 'mexicano',
  'manzanillo', 'veracruz', 'altamira', 'ensenada', 'progreso',
  'tampico', 'mazatlán', 'mazatlan', 'guaymas', 'coatzacoalcos',
  'cdmx', 'monterrey', 'guadalajara', 'querétaro', 'queretaro',
  'tijuana', 'juárez', 'juarez', 'aicm', 'toluca', 'puebla', 'saltillo',
]);

/** Nombres de más de una palabra, que se buscan completos. */
const PISTAS_MEXICO_FRASE = [
  'lázaro cárdenas', 'lazaro cardenas',
  'nuevo laredo',
  'ciudad de méxico', 'ciudad de mexico',
  'puerto vallarta',
];

const SIN_DATO = new Set(['', 'por definir', 'pendiente', 'n/a', '-', '—']);

function normalizar(texto: string): string {
  return texto.trim().toLowerCase();
}

function pareceMexico(lugar: string | undefined): boolean {
  if (!lugar) return false;
  const l = normalizar(lugar);
  if (SIN_DATO.has(l)) return false;

  if (PISTAS_MEXICO_FRASE.some(f => l.includes(f))) return true;

  // Cotejo por token: «Laredo, USA» se parte en ['laredo','usa'] y ninguno
  // está en la lista, mientras que «Nuevo Laredo» sí entra por frase.
  const tokens = l.split(/[^a-záéíóúñ]+/i).filter(Boolean);
  return tokens.some(t => PISTAS_MEXICO_TOKEN.has(t));
}

/**
 * Determina el tráfico de un servicio.
 *
 * 1. Si viene declarado, se usa. Es el caso de todo lo capturado desde que el
 *    campo existe.
 * 2. Si no, se intenta derivar de la ruta: destino en México es importación,
 *    origen en México es exportación.
 * 3. Si ambos extremos parecen México, o ninguno, se devuelve null. La ruta es
 *    texto libre y equivocarse aquí produce un folio incorrecto.
 */
export function resolverTrafico(srv: ServicioSolicitado): ResolucionTrafico {
  if (srv.trafico) return { trafico: srv.trafico, fuente: 'declarado' };

  const origenMx = pareceMexico(srv.ruta?.origen);
  const destinoMx = pareceMexico(srv.ruta?.destino);

  if (destinoMx && !origenMx) {
    return { trafico: 'importacion', fuente: 'derivado' };
  }
  if (origenMx && !destinoMx) {
    return { trafico: 'exportacion', fuente: 'derivado' };
  }

  const motivo = origenMx && destinoMx
    ? `La ruta «${srv.ruta?.origen} → ${srv.ruta?.destino}» tiene los dos extremos en México: no se puede deducir si es importación o exportación.`
    : `La ruta «${srv.ruta?.origen ?? '—'} → ${srv.ruta?.destino ?? '—'}» no permite deducir el tráfico.`;

  return { trafico: null, fuente: 'desconocido', motivo };
}

// ─── Puente hacia calcularIVA ─────────────────────────────────────────────────

/**
 * calcularIVA usa el vocabulario corto ('impo' | 'expo') y el modelo de la
 * cotización el largo ('importacion' | 'exportacion'). La conversión vive
 * SOLO aquí para que no haya dos vocabularios circulando por el código.
 */
export function traficoParaIVA(t: TraficoServicio): 'impo' | 'expo' {
  return t === 'importacion' ? 'impo' : 'expo';
}
