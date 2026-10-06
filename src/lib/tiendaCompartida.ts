/**
 * tiendaCompartida.ts — tarea 82
 *
 * Una suscripción a Firestore compartida por todos los que la piden. `usePagos`
 * se montaba desde `useFacturas`, `useDepositosCliente` y `Finance`, y cada uno
 * abría su propio `onSnapshot` sobre `pagos/`: tres lecturas completas de la
 * colección para pintar la misma lista. Aquí se abre UNA mientras haya al
 * menos un suscriptor y se cierra cuando se va el último.
 *
 * Lógica pura (recibe cómo suscribirse), para poder contar listeners en un test.
 */

export interface EstadoTienda<T> {
  datos: T[];
  loading: boolean;
}

export function crearTiendaCompartida<T>(
  abrir: (alDato: (datos: T[]) => void, alError: () => void) => () => void,
) {
  let estado: EstadoTienda<T> = { datos: [], loading: true };
  const oyentes = new Set<(e: EstadoTienda<T>) => void>();
  let cerrar: (() => void) | null = null;
  let abiertas = 0;

  const emitir = (e: EstadoTienda<T>) => {
    estado = e;
    oyentes.forEach(o => o(estado));
  };

  return {
    /** Cuántos `onSnapshot` se han abierto en total (para medir). */
    get abiertas() { return abiertas; },
    /** Cuántos hay vivos ahora. */
    get vivas() { return cerrar ? 1 : 0; },
    suscribir(oyente: (e: EstadoTienda<T>) => void): () => void {
      oyentes.add(oyente);
      if (!cerrar) {
        abiertas += 1;
        cerrar = abrir(
          datos => emitir({ datos, loading: false }),
          () => emitir({ datos: estado.datos, loading: false }),
        );
      } else {
        oyente(estado);
      }
      return () => {
        oyentes.delete(oyente);
        if (oyentes.size === 0 && cerrar) {
          cerrar();
          cerrar = null;
          estado = { datos: [], loading: true };
        }
      };
    },
  };
}
