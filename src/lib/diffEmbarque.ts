/**
 * Escritura del embarque por campos (tarea 123).
 *
 * Lo mismo que la 111 hizo con la cotización: `guardarEmbarque` escribía el
 * documento ENTERO con `setDoc`, así que dos pestañas sobre el mismo embarque
 * se pisaban —la última borraba la nota, el documento o el cierre de la otra—.
 * Aquí se calcula, contra el documento del SERVIDOR, solo lo que esta edición
 * tocó. Reusa `diffCotizacion` (diff por clave y fusión por id); no lo copia.
 *
 * Puro: la transacción y la cola viven en `hooks/useEmbarques.ts`.
 */

import { parcheFusionado, tocados, iguales } from './diffCotizacion';

type Objeto = Record<string, unknown>;

/** Listas del embarque con `id` por elemento: se fusionan, no se reemplazan. */
export const LISTAS_EMBARQUE_POR_ID = ['eventos', 'bitacora', 'documentos', 'documentosGenerados'] as const;

/**
 * Objetos pequeños cuyas subclaves las edita gente distinta (Operaciones cierra
 * lo operativo, Administración el pago): se escriben por ruta con punto
 * (`cierres.pago`) y no como un bloque, para que dos cierres a la vez
 * sobrevivan. El resto de los objetos se escribe entero, como una clave atómica.
 */
export const OBJETOS_POR_SUBCLAVE = ['cierres'] as const;

export interface PlanEscrituraEmbarque {
  /** Claves (o rutas con punto) a escribir con su valor. */
  cambios: Objeto;
  /** Claves (o rutas) que esta edición quitó: van con `deleteField`. */
  borrar: string[];
}

function esObjeto(x: unknown): x is Objeto {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * Qué escribir para que el servidor refleje la edición `anterior → nuevo`
 * sin perder lo que otra persona ya escribió.
 */
export function planEscrituraEmbarque(servidor: Objeto, anterior: Objeto, nuevo: Objeto): PlanEscrituraEmbarque {
  const cambios: Objeto = {};
  const borrar: string[] = [];
  const claves = tocados(anterior, nuevo);
  const parche = parcheFusionado(servidor, anterior, nuevo, LISTAS_EMBARQUE_POR_ID);

  for (const k of claves) {
    if (k === 'updatedAt') continue;
    const valor = nuevo[k];
    if (valor === undefined) {
      // Un opcional que la edición vació: con setDoc desaparecía; con update hay que pedirlo.
      if (anterior[k] !== undefined) borrar.push(k);
      continue;
    }
    if ((OBJETOS_POR_SUBCLAVE as readonly string[]).includes(k) && esObjeto(valor) && esObjeto(anterior[k])) {
      const previo = anterior[k] as Objeto;
      for (const sub of new Set([...Object.keys(previo), ...Object.keys(valor)])) {
        if (iguales(previo[sub], valor[sub])) continue;
        if (valor[sub] === undefined) borrar.push(`${k}.${sub}`);
        else cambios[`${k}.${sub}`] = valor[sub];
      }
      continue;
    }
    cambios[k] = parche[k];
  }
  if (Object.keys(cambios).length > 0 || borrar.length > 0) {
    if (nuevo.updatedAt !== undefined) cambios.updatedAt = nuevo.updatedAt;
  }
  return { cambios, borrar };
}
