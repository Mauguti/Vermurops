/**
 * useTerminosPago.ts
 *
 * Hook que sincroniza términos de pago con Firestore.
 *
 * Comportamiento (mismo patrón que useConceptos / usePuertos):
 *  1. Abre un listener onSnapshot sobre la colección 'terminosPago'.
 *  2. Si la colección está vacía (primera vez), escribe el seed de
 *     initialTerminosPago usando setDoc → preserva el id como document ID.
 *  3. Expone { terminosPago, loading, error, createTerminoPago, updateTerminoPago }.
 */

import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, getDocsFromServer } from 'firebase/firestore';
import { evaluarSeed } from '../lib/seedGuard';
import { TerminoPagoVermur, initialTerminosPago } from '../components/terminosPago/TerminosPagoData';
import { useAuth } from '../auth/AuthContext';
import { conAviso } from '../lib/erroresEscritura';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';

export function useTerminosPago() {
  const { user } = useAuth();

  const [terminosPago, setTerminosPago] = useState<TerminoPagoVermur[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Evita que el seed corra más de una vez por sesión de usuario.
  const seedAttempted = useRef(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'terminosPago'),
      async (snapshot) => {
        // ── ¿Se puede sembrar? ────────────────────────────────────────────
        // evaluarSeed descarta los snapshots de caché: uno vacío NO prueba que
        // la colección esté vacía en el servidor, solo que este cliente aún no
        // la bajó. Ver src/lib/seedGuard.ts.
        if (evaluarSeed(snapshot, seedAttempted.current).sembrar) {
          seedAttempted.current = true;
          try {
            // Segunda barrera, ya con el servidor de por medio: confirma que
            // 'terminosPago' sigue vacía justo antes de escribir. Cubre la carrera
            // con otra pestaña sembrando al mismo tiempo, y falla si no hay red
            // en vez de sembrar a ciegas.
            const enServidor = await getDocsFromServer(collection(db, 'terminosPago'));
            if (!enServidor.empty) {
              console.warn('[seed] terminosPago: el servidor ya tiene ' + enServidor.size + ' documentos. No se siembra.');
              return;
            }

            await conAviso('los términos de pago iniciales', () => Promise.all(
              initialTerminosPago.map(tp =>
                setDoc(doc(db, 'terminosPago', tp.id), sanitizarParaFirestore(tp))
              )
            ));
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error al sembrar términos de pago iniciales';
            setError(msg);
            setLoading(false);
          }
          return;
        }

        // Snapshot que no autoriza sembrar: se pinta tal cual. Si venía de
        // caché, el snapshot del servidor llegará después y volverá a evaluar.

        // ── Snapshot con datos (normal o post-seed) ───────────────────────
        const data: TerminoPagoVermur[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() } as TerminoPagoVermur);
        });

        // Ordenar por diasParaPagar ascendente (contado primero).
        data.sort((a, b) => a.diasParaPagar - b.diasParaPagar);

        setTerminosPago(data);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // ── Writes ───────────────────────────────────────────────────────────────

  const createTerminoPago = async (tp: TerminoPagoVermur): Promise<void> => {
    await conAviso('el término de pago', () => setDoc(doc(db, 'terminosPago', tp.id), sanitizarParaFirestore(tp)));
  };

  const updateTerminoPago = async (id: string, data: Partial<TerminoPagoVermur>): Promise<void> => {
    await conAviso('el término de pago', () => updateDoc(doc(db, 'terminosPago', id), sanitizarParaFirestore(data) as Record<string, unknown>));
  };

  return { terminosPago, loading, error, createTerminoPago, updateTerminoPago };
}
