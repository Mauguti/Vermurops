/**
 * Diff y fusión por id de la cotización (tarea 110, P1 de
 * docs/sprint-post-junta/PLAN-FICHA-COTIZACION.md).
 *
 * Puro y SIN llamadores todavía: P2 lo usará dentro de la transacción de
 * `updateCotizacion` para escribir solo lo que una edición tocó y no pisar lo
 * que otra persona agregó a `actividades`, `chat` o `pdfs` mientras tanto.
 */

type Objeto = Record<string, unknown>;

/** Claves cuyo valor es una lista de elementos con `id`, fusionables por id. */
export const LISTAS_POR_ID = ['actividades', 'chat', 'pdfs'] as const;

/** `updatedAt` cambia en cada guardado: no cuenta como «tocado» por sí solo. */
const CLAVE_MARCA_TIEMPO = 'updatedAt';

/** Igualdad estructural de JSON (objetos, listas y escalares). */
export function iguales(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => iguales(x, b[i]));
  }
  const oa = a as Objeto;
  const ob = b as Objeto;
  const ka = Object.keys(oa).filter(k => oa[k] !== undefined);
  const kb = Object.keys(ob).filter(k => ob[k] !== undefined);
  return ka.length === kb.length && ka.every(k => k in ob && iguales(oa[k], ob[k]));
}

/**
 * Claves de primer nivel cuyo valor difiere entre `anterior` y `nuevo`
 * (incluye las que desaparecen). Si lo único distinto es `updatedAt`, no hay
 * nada tocado; si hay algo más, `updatedAt` viaja con ello.
 */
export function tocados(anterior: Objeto, nuevo: Objeto): string[] {
  const claves = new Set([...Object.keys(anterior), ...Object.keys(nuevo)]);
  const distintas: string[] = [];
  for (const k of claves) {
    if (k === CLAVE_MARCA_TIEMPO) continue;
    if (!iguales(anterior[k], nuevo[k])) distintas.push(k);
  }
  if (distintas.length > 0 && !iguales(anterior[CLAVE_MARCA_TIEMPO], nuevo[CLAVE_MARCA_TIEMPO])) {
    distintas.push(CLAVE_MARCA_TIEMPO);
  }
  return distintas;
}

type ConId = { id?: string };

function clave(x: ConId): string {
  // Sin id no hay forma de reconocerlo entre copias: se identifica por contenido.
  return typeof x?.id === 'string' && x.id !== '' ? `id:${x.id}` : `sin-id:${JSON.stringify(x)}`;
}

/**
 * Aplica sobre la lista del SERVIDOR lo que esta edición hizo entre `anterior`
 * y `nuevo`, sin perder lo que el servidor ya tenga de más:
 *  - agregado (en `nuevo`, no en `anterior`): se agrega si el servidor no lo tiene;
 *  - quitado (en `anterior`, no en `nuevo`): se quita del servidor;
 *  - editado (en las dos, distinto): reemplaza al del servidor, salvo que otra
 *    persona ya lo haya borrado (no se resucita);
 *  - lo que solo el servidor tiene se conserva, en su orden.
 * No muta ninguna de las tres listas.
 */
export function fusionarListaPorId<T extends ConId>(
  servidor: readonly T[] | null | undefined,
  anterior: readonly T[] | null | undefined,
  nuevo: readonly T[] | null | undefined,
): T[] {
  const srv = servidor ?? [];
  const ant = new Map((anterior ?? []).map(x => [clave(x), x]));
  const nue = new Map((nuevo ?? []).map(x => [clave(x), x]));
  const enServidor = new Set(srv.map(clave));

  const resultado: T[] = [];
  for (const x of srv) {
    const k = clave(x);
    if (ant.has(k) && !nue.has(k)) continue; // la edición lo quitó
    const previo = ant.get(k);
    const actual = nue.get(k);
    if (previo !== undefined && actual !== undefined && !iguales(previo, actual)) {
      resultado.push(actual); // la edición lo modificó
    } else {
      resultado.push(x);
    }
  }
  for (const [k, x] of nue) {
    if (!ant.has(k) && !enServidor.has(k)) resultado.push(x);
  }
  return resultado;
}

/**
 * Parche listo para escribir: solo las claves tocadas, con las listas por id
 * fusionadas contra el documento del servidor. Claves que desaparecen quedan
 * fuera (no se pueden borrar con un parche sin `deleteField`; eso es de P2).
 */
export function parcheFusionado(
  servidor: Objeto,
  anterior: Objeto,
  nuevo: Objeto,
): Objeto {
  const parche: Objeto = {};
  for (const k of tocados(anterior, nuevo)) {
    if (nuevo[k] === undefined) continue;
    if ((LISTAS_POR_ID as readonly string[]).includes(k)) {
      parche[k] = fusionarListaPorId(
        servidor[k] as ConId[] | undefined,
        anterior[k] as ConId[] | undefined,
        nuevo[k] as ConId[] | undefined,
      );
    } else {
      parche[k] = nuevo[k];
    }
  }
  return parche;
}
