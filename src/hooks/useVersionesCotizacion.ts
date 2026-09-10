/**
 * useVersionesCotizacion.ts (V-2)
 *
 * Las fotos de una cotización, y las dos escrituras que las producen.
 *
 * Escucha `cotizaciones/{id}/versiones` SOLO mientras la ficha está abierta:
 * el Kanban nunca las baja, que es la razón de que vivan en subcolección.
 *
 * ── Por qué una transacción ────────────────────────────────────────────────
 * Congelar son dos escrituras —la foto en la subcolección y el resumen en la
 * raíz— y tienen que caer juntas: una foto sin resumen es invisible, y un
 * resumen sin foto es un enlace roto. Además el plan se calcula sobre lo que
 * está en el SERVIDOR, no sobre el estado de React: si otra persona acaba de
 * versionar, el número que se congela es el correcto y no un duplicado.
 */

import { useEffect, useState } from 'react';
import {
  collection, doc, onSnapshot, runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthContext';
import type { KanbanQuote } from '../components/quotes/QuotesData';
import type { UserRole } from '../auth/users';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { conAviso } from '../lib/erroresEscritura';
import {
  planearNuevaVersion, planearRestauracion,
  type DocumentoVersion, type PlanVersion,
} from '../lib/versionesCotizacion';

export function useVersionesCotizacion(cotizacionId: string | null) {
  const { user } = useAuth();
  const [versiones, setVersiones] = useState<DocumentoVersion[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !cotizacionId) {
      setVersiones([]);
      return;
    }
    setError(null);
    const unsub = onSnapshot(
      collection(db, 'cotizaciones', cotizacionId, 'versiones'),
      snap => {
        const lista = snap.docs.map(d => d.data() as DocumentoVersion);
        lista.sort((a, b) => a.numero - b.numero);
        setVersiones(lista);
      },
      err => {
        // Sin la regla publicada, Firestore responde permission-denied y
        // nada más: se dice qué falta en vez de mostrar un selector vacío.
        setError(err.code === 'permission-denied'
          ? 'No se pudieron leer las versiones: falta publicar la regla de cotizaciones/{id}/versiones.'
          : err.message);
      },
    );
    return () => unsub();
  }, [user, cotizacionId]);

  /** Calcula el plan sobre el documento del servidor y lo escribe atómico. */
  async function escribir(
    etiqueta: string,
    planear: (servidor: KanbanQuote) => PlanVersion,
  ): Promise<number> {
    if (!cotizacionId) throw new Error('No hay cotización abierta.');
    const raiz = doc(db, 'cotizaciones', cotizacionId);

    return conAviso(etiqueta, () => runTransaction(db, async tx => {
      const snap = await tx.get(raiz);
      if (!snap.exists()) throw new Error(`${cotizacionId} no existe.`);
      const servidor = { id: snap.id, ...snap.data() } as KanbanQuote;

      const plan = planear(servidor);
      if ('razon' in plan) throw new Error(plan.razon);

      const destino = doc(db, 'cotizaciones', cotizacionId, 'versiones', String(plan.documento.numero));
      // Todas las lecturas antes de las escrituras: lo exige la transacción.
      const yaExiste = await tx.get(destino);
      if (yaExiste.exists()) {
        throw new Error(`La v${plan.documento.numero} ya estaba congelada. Alguien versionó al mismo tiempo: recarga la ficha.`);
      }

      tx.set(destino, sanitizarParaFirestore(plan.documento) as unknown as Record<string, unknown>);
      tx.update(raiz, sanitizarParaFirestore(plan.patch) as Record<string, unknown>);
      return plan.documento.numero + 1;
    }));
  }

  function opcionesBase(motivo: string) {
    return {
      motivo,
      autor: { uid: user?.uid ?? null, nombre: user?.nombre ?? 'Sin nombre' },
      rol: user?.rol as UserRole | undefined,
      ahora: new Date().toISOString(),
    };
  }

  /** Congela la versión viva y abre la siguiente. Devuelve el número nuevo. */
  const crearVersion = (motivo: string) =>
    escribir('la nueva versión', servidor => planearNuevaVersion(servidor, opcionesBase(motivo)));

  /** Abre una versión nueva con el contenido de la `numero`. */
  const restaurarVersion = (numero: number, motivo: string) => {
    const version = versiones.find(v => v.numero === numero);
    if (!version) return Promise.reject(new Error(`No se encontró la v${numero}.`));
    return escribir('la restauración', servidor => planearRestauracion(servidor, version, opcionesBase(motivo)));
  };

  return { versiones, error, crearVersion, restaurarVersion };
}
