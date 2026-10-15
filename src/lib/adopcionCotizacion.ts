/**
 * La ficha adopta lo ajeno y avisa del conflicto (tarea 122, P4 del plan
 * docs/sprint-post-junta/PLAN-FICHA-COTIZACION.md).
 *
 * Sustituye a `alDiaConVersion`, que solo adoptaba lo del listener cuando
 * cambiaba el número de versión. Aquí se guarda un `base` —lo último que se
 * vio del servidor— y cada snapshot se fusiona POR CAMPO contra la copia local:
 *
 *   - el servidor no cambió el campo            → se queda el local
 *   - el servidor lo cambió y el local no lo tocó → se adopta el del servidor
 *   - los dos lo cambiaron, igual                → nada que decidir
 *   - los dos lo cambiaron, listas con id        → se fusionan por id (sin conflicto)
 *   - los dos lo cambiaron, distinto             → CONFLICTO: se conserva el local
 *     (gana el último en guardar, decisión de Mau del 15-oct) y se avisa
 *
 * Puro y sin React: el hook `useCotizacionAbierta` solo guarda el estado.
 * Lo que la persona está tecleando no se toca: un campo que el local ya
 * modificó nunca se sobreescribe con el del servidor.
 */

import type { KanbanQuote } from '../components/quotes/QuotesData';
import { fusionarListaPorId, iguales, LISTAS_POR_ID, tocados } from './diffCotizacion';
import { CAMPOS_DE_VERSION, numeroVersionActual } from './versionesCotizacion';

type Objeto = Record<string, unknown>;

/** Claves que nunca se comparan: la identidad y la marca de tiempo local. */
const IGNORADAS = new Set(['id', 'updatedAt']);

/** Cuántos valores propios recientes se recuerdan por campo (ecos de escrituras propias). */
const MAX_PROPIOS = 20;

export interface EstadoAdopcion {
  id: string;
  /** Lo que pinta la ficha: la copia local con lo ajeno ya adoptado. */
  abierta: KanbanQuote;
  /** Lo último del servidor que ya se fusionó. */
  base: KanbanQuote;
  /** Valores (JSON) que ESTA sesión escribió, por campo: su eco no es un cambio ajeno. */
  propios: Record<string, string[]>;
  /** Campos que las dos copias cambiaron de forma distinta y siguen sin coincidir. */
  conflictos: string[];
  hostVisto: KanbanQuote;
  servidorVisto: KanbanQuote | undefined;
}

const comoObjeto = (q: KanbanQuote) => q as unknown as Objeto;

export function abrir(host: KanbanQuote, servidor: KanbanQuote | undefined): EstadoAdopcion {
  const inicial: EstadoAdopcion = {
    id: host.id,
    abierta: host,
    base: host,
    propios: {},
    conflictos: [],
    hostVisto: host,
    servidorVisto: undefined,
  };
  return servidor ? avanzar(inicial, host, servidor) : inicial;
}

function recordarPropios(
  propios: Record<string, string[]>,
  anterior: KanbanQuote,
  nuevo: KanbanQuote,
): Record<string, string[]> {
  const claves = tocados(comoObjeto(anterior), comoObjeto(nuevo)).filter(k => !IGNORADAS.has(k));
  if (claves.length === 0) return propios;
  const salida = { ...propios };
  for (const k of claves) {
    const lista = [...(salida[k] ?? []), JSON.stringify(comoObjeto(nuevo)[k] ?? null)];
    salida[k] = lista.slice(-MAX_PROPIOS);
  }
  return salida;
}

/**
 * Integra lo que cambió desde la última vez: la copia del host (la persona
 * guardó algo) y/o la del servidor (llegó un snapshot). Devuelve el MISMO
 * estado si nada cambió, para no provocar renders.
 */
export function avanzar(
  e: EstadoAdopcion,
  host: KanbanQuote,
  servidor: KanbanQuote | undefined,
): EstadoAdopcion {
  const hostCambio = host !== e.hostVisto;
  const servidorCambio = servidor !== e.servidorVisto;
  if (!hostCambio && !servidorCambio) return e;

  let propios = e.propios;
  let local = e.abierta;
  if (hostCambio) {
    propios = recordarPropios(propios, e.abierta, host);
    local = host;
  }

  if (!servidor) return { ...e, abierta: local, propios, hostVisto: host, servidorVisto: servidor };

  // Otra versión: la raíz es otra cotización viva; se adopta entera, como antes.
  if (numeroVersionActual(servidor) !== numeroVersionActual(local)) {
    return {
      ...e, abierta: servidor, base: servidor, propios: {}, conflictos: [],
      hostVisto: host, servidorVisto: servidor,
    };
  }

  const srv = comoObjeto(servidor);
  const loc = comoObjeto(local);
  const bas = comoObjeto(e.base);
  const claves = new Set([...Object.keys(srv), ...Object.keys(loc), ...Object.keys(bas)]);
  const salida: Objeto = {};
  const nuevosConflictos = new Set(e.conflictos);

  for (const k of claves) {
    if (IGNORADAS.has(k)) { salida[k] = loc[k]; continue; }
    let valor: unknown;
    if ((CAMPOS_DE_VERSION as readonly string[]).includes(k)) {
      valor = srv[k];
    } else if (iguales(srv[k], bas[k])) {
      valor = loc[k]; // el servidor no lo movió
    } else if (iguales(loc[k], bas[k])) {
      valor = srv[k]; // otra persona lo cambió y aquí nadie lo tocó
    } else if (iguales(loc[k], srv[k])) {
      valor = loc[k]; // los dos llegaron al mismo valor
    } else if ((LISTAS_POR_ID as readonly string[]).includes(k)) {
      valor = fusionarListaPorId(
        srv[k] as { id?: string }[] | undefined,
        bas[k] as { id?: string }[] | undefined,
        loc[k] as { id?: string }[] | undefined,
      );
    } else if (propios[k]?.includes(JSON.stringify(srv[k] ?? null))) {
      valor = loc[k]; // el eco de una escritura propia que ya fue superada
    } else {
      valor = loc[k]; // gana el último en guardar, con aviso
      nuevosConflictos.add(k);
    }
    if (valor !== undefined) salida[k] = valor;
  }

  // Un conflicto se acaba cuando las dos copias vuelven a coincidir.
  const conflictos = [...nuevosConflictos].filter(k => !iguales(salida[k], srv[k])).sort();
  const abierta = iguales(salida, loc) ? local : (salida as unknown as KanbanQuote);

  return {
    id: e.id, abierta, base: servidor, propios, conflictos,
    hostVisto: host, servidorVisto: servidor,
  };
}

/** «Recargar»: la copia del servidor reemplaza a la local. */
export function recargar(e: EstadoAdopcion, servidor: KanbanQuote | undefined): EstadoAdopcion {
  if (!servidor) return e;
  return { ...e, abierta: servidor, base: servidor, propios: {}, conflictos: [], servidorVisto: servidor };
}

const ETIQUETAS: Record<string, string> = {
  servicios: 'Servicios (tarifas, líneas, tipo de cambio)',
  etapa: 'Etapa',
  clienteId: 'Cliente vinculado',
  valorTotalConsolidado: 'Total consolidado',
  notasOperativas: 'Notas operativas',
  fechaRecoleccionDeseada: 'Fecha de recolección deseada',
  fechaEntregaDeseada: 'Fecha de entrega deseada',
  contrato: 'Contrato',
  embarqueIds: 'Embarques',
  vendedorId: 'Responsable de ventas',
  prospecto: 'Prospecto',
};

export function etiquetaDeCampo(clave: string): string {
  return ETIQUETAS[clave] ?? clave;
}
