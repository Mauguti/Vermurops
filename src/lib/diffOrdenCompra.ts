/**
 * Escritura de la orden de compra por campos (tarea 124).
 *
 * Lo de la 111 (cotización) y la 123 (embarque) aplicado a la OC. `updateOrden`
 * ya mandaba un parche, pero las LISTAS viajaban enteras: subir un documento
 * escribía `[...documentos, ...nuevos]` calculado sobre la copia que la ficha
 * tenía, y quitar o aplicar un anticipo escribía `anticiposCruzados` completo.
 * Si otra persona agregó un documento o un anticipo mientras tanto, se perdía.
 * Aquí se calcula, contra el documento del SERVIDOR, solo lo que esta edición
 * tocó, con las listas fusionadas por id.
 *
 * Puro: la transacción y la cola viven en `hooks/useOrdenesCompra.ts`.
 */

import { fusionarListaPorId, iguales } from './diffCotizacion';
import { calcularSaldoPendiente } from '../components/ordenesCompra/OrdenesCompraData';

type Objeto = Record<string, unknown>;
type ConId = { id?: string };

/** Listas con identidad propia: se fusionan, no se reemplazan. */
export const LISTAS_OC_POR_ID = ['documentos'] as const;

/** `anticiposCruzados` se identifica por `ocId`, no por `id`. */
const CLAVE_ANTICIPOS = 'anticiposCruzados';

function conId(lista: unknown): ConId[] | undefined {
  if (!Array.isArray(lista)) return undefined;
  return lista.map(a => ({ ...(a as Objeto), id: (a as Objeto).ocId as string }));
}

function sinId(lista: ConId[]): Objeto[] {
  return lista.map(a => {
    const { id: _id, ...resto } = a as Objeto;
    return resto;
  });
}

/**
 * Qué escribir para que el servidor refleje `patch` (calculado sobre
 * `anterior`) sin perder lo que otra persona ya escribió.
 *  - Una clave del parche igual a la que ya traía `anterior` no se escribe:
 *    reescribirla pisaría con un valor viejo lo que el servidor ya cambió.
 *  - `documentos` y `anticiposCruzados` se fusionan por id.
 *  - `saldoPendiente` se recalcula sobre los anticipos YA fusionados.
 */
export function planEscrituraOC(servidor: Objeto, anterior: Objeto, patch: Objeto): Objeto {
  const cambios: Objeto = {};
  for (const [k, valor] of Object.entries(patch)) {
    if (k === 'updatedAt' || k === 'saldoPendiente') continue;
    if (valor === undefined) continue;
    if (iguales(anterior[k], valor)) continue;
    if ((LISTAS_OC_POR_ID as readonly string[]).includes(k)) {
      cambios[k] = fusionarListaPorId(
        servidor[k] as ConId[] | undefined, anterior[k] as ConId[] | undefined, valor as ConId[]);
    } else if (k === CLAVE_ANTICIPOS && Array.isArray(valor)) {
      const fusion = fusionarListaPorId(conId(servidor[k]), conId(anterior[k]), conId(valor));
      cambios[k] = sinId(fusion);
    } else {
      cambios[k] = valor;
    }
  }
  if (CLAVE_ANTICIPOS in cambios) {
    const lista = cambios[CLAVE_ANTICIPOS] as Parameters<typeof calcularSaldoPendiente>[1];
    const monto = (servidor.monto ?? anterior.monto) as number;
    cambios.saldoPendiente = lista.length > 0 ? calcularSaldoPendiente(monto, lista) : null;
  } else if ('saldoPendiente' in patch && !iguales(anterior.saldoPendiente, patch.saldoPendiente)) {
    cambios.saldoPendiente = patch.saldoPendiente;
  }
  if (Object.keys(cambios).length > 0 && patch.updatedAt !== undefined) cambios.updatedAt = patch.updatedAt;
  return cambios;
}
