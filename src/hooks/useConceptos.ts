/**
 * useConceptos.ts
 *
 * Hook que sincroniza conceptos con Firestore.
 *
 * Comportamiento (mismo patrón que useProveedores / usePuertos):
 *  1. Abre un listener onSnapshot sobre la colección 'conceptos'.
 *  2. Si la colección está vacía (primera vez), escribe el seed de
 *     initialConceptos usando setDoc → preserva el id como document ID.
 *  3. Expone { conceptos, loading, error, createConcepto, updateConcepto }.
 */

import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { ConceptoVermur, initialConceptos } from '../components/conceptos/ConceptosData';
import { useAuth } from '../auth/AuthContext';

export function useConceptos() {
  const { user } = useAuth();

  const [conceptos, setConceptos] = useState<ConceptoVermur[]>([]);
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
      collection(db, 'conceptos'),
      async (snapshot) => {
        // ── Colección vacía: seed inicial ─────────────────────────────────
        if (snapshot.empty && !seedAttempted.current) {
          seedAttempted.current = true;
          try {
            await Promise.all(
              initialConceptos.map(c =>
                setDoc(doc(db, 'conceptos', c.id), c)
              )
            );
            // onSnapshot disparará de nuevo con los 105 documentos escritos.
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error al sembrar conceptos iniciales';
            setError(msg);
            setLoading(false);
          }
          return;
        }

        // ── Snapshot con datos (normal o post-seed) ───────────────────────
        const data: ConceptoVermur[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() } as ConceptoVermur);
        });

        // Alfabético por nombre.
        data.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

        setConceptos(data);
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

  const createConcepto = async (concepto: ConceptoVermur): Promise<void> => {
    await setDoc(doc(db, 'conceptos', concepto.id), concepto);
  };

  const updateConcepto = async (id: string, data: Partial<ConceptoVermur>): Promise<void> => {
    await updateDoc(doc(db, 'conceptos', id), data as Record<string, unknown>);
  };

  return { conceptos, loading, error, createConcepto, updateConcepto };
}
