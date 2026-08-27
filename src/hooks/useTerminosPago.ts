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
import { collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { TerminoPagoVermur, initialTerminosPago } from '../components/terminosPago/TerminosPagoData';
import { useAuth } from '../auth/AuthContext';

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
        // ── Colección vacía: seed inicial ─────────────────────────────────
        if (snapshot.empty && !seedAttempted.current) {
          seedAttempted.current = true;
          try {
            await Promise.all(
              initialTerminosPago.map(tp =>
                setDoc(doc(db, 'terminosPago', tp.id), tp)
              )
            );
            // onSnapshot disparará de nuevo con los 25 documentos escritos.
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error al sembrar términos de pago iniciales';
            setError(msg);
            setLoading(false);
          }
          return;
        }

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
    await setDoc(doc(db, 'terminosPago', tp.id), tp);
  };

  const updateTerminoPago = async (id: string, data: Partial<TerminoPagoVermur>): Promise<void> => {
    await updateDoc(doc(db, 'terminosPago', id), data as Record<string, unknown>);
  };

  return { terminosPago, loading, error, createTerminoPago, updateTerminoPago };
}
