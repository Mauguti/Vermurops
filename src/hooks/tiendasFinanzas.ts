/**
 * tiendasFinanzas.ts — tarea 89
 *
 * Una suscripción por colección para `facturas/`, `cobros/` y
 * `depositosCliente/`, como la 82 hizo con `pagos/`. Antes cada montaje de
 * `useFacturas` / `useDepositosCliente` abría las suyas; ahora comparten una y
 * cada hook filtra por embarque sobre la misma lista.
 */
import { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { crearTiendaCompartida } from '../lib/tiendaCompartida';
import type { EstadoTienda } from '../lib/tiendaCompartida';
import type { FacturaCliente, CobroCliente } from '../components/facturas/FacturasData';
import type { DepositoCliente } from '../components/ordenesCompra/OrdenesCompraData';

function tiendaDe<T extends { id: string }>(coleccion: string, campoOrden: string) {
  return crearTiendaCompartida<T>((alDato, alError) =>
    onSnapshot(
      query(collection(db, coleccion), orderBy(campoOrden, 'desc')),
      snap => {
        const data: T[] = [];
        snap.forEach(d => data.push({ id: d.id, ...d.data() } as T));
        alDato(data);
      },
      alError,
    ));
}

export const tiendaFacturas = tiendaDe<FacturaCliente>('facturas', 'fechaEmision');
export const tiendaCobros = tiendaDe<CobroCliente>('cobros', 'fechaCobro');
export const tiendaDepositos = tiendaDe<DepositoCliente>('depositosCliente', 'fechaDeposito');

/**
 * Lo que cada hook ve de la lista compartida.
 *
 * Vive aparte del hook y es pura a propósito: es la mitad de CORRECCIÓN de
 * la tarea 89, y los tests de arriba solo cubren la de rendimiento —que haya
 * un listener por colección—. Sin esto, romper el filtro no tumbaba nada y
 * la pestaña Facturas de un embarque mostraría las facturas de TODOS.
 *
 * `undefined` = sin filtro (Finanzas ve todo). Una cadena vacía NO es «sin
 * filtro»: es un embarqueId que nadie tiene, y devolver todo ahí sería el
 * mismo error con otra cara.
 */
export function filtrarPorEmbarque<T extends { embarqueId?: string }>(
  todos: readonly T[],
  embarqueId?: string,
): T[] {
  if (embarqueId === undefined) return [...todos];
  return todos.filter(x => x.embarqueId === embarqueId);
}

/** Lista compartida de una tienda, filtrada por embarque si se pide. */
export function useTienda<T extends { embarqueId?: string }>(
  tienda: { suscribir(o: (e: EstadoTienda<T>) => void): () => void },
  activo: boolean,
  embarqueId?: string,
) {
  const [todos, setTodos] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!activo) { setLoading(false); return; }
    return tienda.suscribir(e => { setTodos(e.datos); setLoading(e.loading); });
  }, [tienda, activo]);
  const datos = useMemo(() => filtrarPorEmbarque(todos, embarqueId), [todos, embarqueId]);
  return { datos, loading };
}
