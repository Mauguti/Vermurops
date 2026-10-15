/**
 * Escrituras por transacción en fila, una cola por documento (tareas 111 y 123).
 *
 * Dos transacciones lanzadas seguidas pueden confirmarse al revés, y una
 * edición vieja de una clave atómica pisaría a la nueva. `clave` incluye la
 * colección para que un embarque y una cotización con el mismo id no se esperen.
 */
const colas = new Map<string, Promise<unknown>>();

export function enCola<T>(clave: string, tarea: () => Promise<T>): Promise<T> {
  const previa = colas.get(clave) ?? Promise.resolve();
  const esta = previa.then(tarea, tarea);
  colas.set(clave, esta.catch(() => undefined));
  return esta;
}
