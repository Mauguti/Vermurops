/**
 * usePuertos.ts
 *
 * Hook que sincroniza puertos con Firestore.
 *
 * Comportamiento (mismo patrón que useProveedores):
 *  1. Abre un listener onSnapshot sobre la colección 'puertos'.
 *  2. Si la colección está vacía (primera vez), escribe el seed de
 *     initialPuertos usando setDoc → preserva el id como document ID.
 *  3. Expone { puertos, loading, error, createPuerto, updatePuerto }.
 */

import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { PuertoVermur, initialPuertos } from '../components/puertos/PuertosData';
import { useAuth } from '../auth/AuthContext';

export function usePuertos() {
  const { user } = useAuth();

  const [puertos, setPuertos] = useState<PuertoVermur[]>([]);
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
      collection(db, 'puertos'),
      async (snapshot) => {
        // ── Colección vacía: seed inicial ─────────────────────────────────
        if (snapshot.empty && !seedAttempted.current) {
          seedAttempted.current = true;
          try {
            await Promise.all(
              initialPuertos.map(p =>
                setDoc(doc(db, 'puertos', p.id), p)
              )
            );
            // onSnapshot disparará de nuevo con los documentos escritos.
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error al sembrar puertos iniciales';
            setError(msg);
            setLoading(false);
          }
          return;
        }

        // ── Snapshot con datos (normal o post-seed) ───────────────────────
        const data: PuertoVermur[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() } as PuertoVermur);
        });

        // Alfabético por nombre del puerto.
        data.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

        setPuertos(data);
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

  const createPuerto = async (puerto: PuertoVermur): Promise<void> => {
    await setDoc(doc(db, 'puertos', puerto.id), puerto);
  };

  const updatePuerto = async (id: string, data: Partial<PuertoVermur>): Promise<void> => {
    await updateDoc(doc(db, 'puertos', id), data as Record<string, unknown>);
  };

  return { puertos, loading, error, createPuerto, updatePuerto };
}
