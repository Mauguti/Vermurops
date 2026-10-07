/**
 * tiendasCatalogos.ts — tarea 93
 *
 * Una suscripción por colección para `clientes/`, `proveedores/`,
 * `embarques/` y `cotizaciones/`, como la 82 y la 89 hicieron con las de
 * Finanzas. Antes cada montaje de `useClientes` / `useProveedores` /
 * `useEmbarques` / `useCotizaciones` abría su propio `onSnapshot` (la ficha
 * de cotización sola montaba clientes y proveedores; Embarques, los cuatro).
 *
 * El seed de clientes, proveedores y cotizaciones vive AQUÍ, dentro de la
 * apertura de la tienda: con un solo listener hay un solo sembrador, y el
 * candado de módulo (`seedIntentado`) sigue siendo la segunda barrera.
 *
 * Lo que cada hook ve de la lista (orden) es puro y exportado, para probar la
 * mitad de CORRECCIÓN aparte de la de rendimiento (lección de la 89).
 */
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import {
  collection, onSnapshot, doc, setDoc, getDocsFromServer,
  type DocumentData, type QuerySnapshot,
} from 'firebase/firestore';
import { crearTiendaCompartida } from '../lib/tiendaCompartida';
import type { EstadoTienda } from '../lib/tiendaCompartida';
import { evaluarSeed } from '../lib/seedGuard';
import { compararTexto } from '../lib/texto';
import { conAviso } from '../lib/erroresEscritura';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { initContadorDesdeFolios } from '../lib/folioService';
import { ClienteVermur, initialClientes } from '../components/clientes/ClientesData';
import { ProveedorVermur, initialProveedores } from '../components/proveedores/ProveedoresData';
import { KanbanQuote, initialKanbanQuotes } from '../components/quotes/QuotesData';
import type { EmbarqueCompleto } from '../components/shipments/EmbarquesData';

// ─── Orden (puro) ─────────────────────────────────────────────────────────────
// Un documento sin `nombre` / `createdAt` tiraba la app entera al cargar (Bloque 4).

/** Alfabético por razón social. */
export function ordenarPorNombre<T extends { nombre?: string }>(lista: readonly T[]): T[] {
  return [...lista].sort((a, b) => compararTexto(a.nombre, b.nombre));
}

/** Más recientes primero; sin `createdAt` van al final. */
export function ordenarPorCreacion<T extends { createdAt?: string }>(lista: readonly T[]): T[] {
  return [...lista].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

function aLista<T>(snapshot: QuerySnapshot<DocumentData>): T[] {
  const data: T[] = [];
  snapshot.forEach(d => data.push({ id: d.id, ...d.data() } as T));
  return data;
}

// ─── Tiendas ──────────────────────────────────────────────────────────────────

/** Candados de seed por MÓDULO: ver el razonamiento de la 1d en cada hook. */
const sembrado = { clientes: false, proveedores: false, cotizaciones: false };

function tiendaConSeed<T extends { id: string }>(
  coleccion: keyof typeof sembrado,
  etiqueta: string,
  iniciales: readonly T[],
  ordenar: (l: T[]) => T[],
  despuesDelSeed?: () => Promise<void>,
) {
  return crearTiendaCompartida<T>((alDato, alError) =>
    onSnapshot(
      collection(db, coleccion),
      async snapshot => {
        // evaluarSeed descarta los snapshots de caché: uno vacío NO prueba que
        // la colección esté vacía en el servidor. Ver src/lib/seedGuard.ts.
        if (evaluarSeed(snapshot, sembrado[coleccion]).sembrar) {
          sembrado[coleccion] = true;
          try {
            // Segunda barrera, ya con el servidor de por medio.
            const enServidor = await getDocsFromServer(collection(db, coleccion));
            if (!enServidor.empty) {
              console.warn(`[seed] ${coleccion}: el servidor ya tiene ${enServidor.size} documentos. No se siembra.`);
              return;
            }
            await conAviso(etiqueta, () => Promise.all(
              iniciales.map(x => setDoc(doc(db, coleccion, x.id), sanitizarParaFirestore(x))),
            ));
            if (despuesDelSeed) await despuesDelSeed();
          } catch (err) {
            alError(err instanceof Error ? err.message : `Error al sembrar ${coleccion} iniciales`);
          }
          return;
        }
        alDato(ordenar(aLista<T>(snapshot)));
      },
      err => alError(err.message),
    ));
}

export const tiendaClientes = tiendaConSeed<ClienteVermur>(
  'clientes', 'los clientes iniciales', initialClientes, ordenarPorNombre);

export const tiendaProveedores = tiendaConSeed<ProveedorVermur>(
  'proveedores', 'los proveedores iniciales', initialProveedores, ordenarPorNombre);

export const tiendaCotizaciones = tiendaConSeed<KanbanQuote>(
  'cotizaciones', 'las cotizaciones iniciales', initialKanbanQuotes, ordenarPorCreacion,
  // El siguiente generateFolio() debe continuar desde el máximo del seed.
  () => initContadorDesdeFolios(initialKanbanQuotes.map(q => q.id)),
);

// Sin seed, a propósito (§3: nada de embarques de demostración en producción).
export const tiendaEmbarques = crearTiendaCompartida<EmbarqueCompleto>((alDato, alError) =>
  onSnapshot(
    collection(db, 'embarques'),
    snapshot => alDato(ordenarPorCreacion(aLista<EmbarqueCompleto>(snapshot))),
    err => alError(err.message),
  ));

/** Suscribe un componente a una tienda mientras `activo` (hay usuario). */
export function useTiendaCatalogo<T>(
  tienda: { suscribir(o: (e: EstadoTienda<T>) => void): () => void },
  activo: boolean,
) {
  const [estado, setEstado] = useState<EstadoTienda<T>>({ datos: [], loading: true });
  useEffect(() => {
    if (!activo) { setEstado(e => ({ ...e, loading: false })); return; }
    return tienda.suscribir(setEstado);
  }, [tienda, activo]);
  return { datos: estado.datos, loading: estado.loading, error: estado.error ?? null };
}
