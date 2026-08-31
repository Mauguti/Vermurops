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
import { collection, onSnapshot, doc, setDoc, updateDoc, getDocsFromServer } from 'firebase/firestore';
import { evaluarSeed } from '../lib/seedGuard';
import { ConceptoVermur, initialConceptos } from '../components/conceptos/ConceptosData';
import { useAuth } from '../auth/AuthContext';
import { conAviso } from '../lib/erroresEscritura';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';

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
        // ── ¿Se puede sembrar? ────────────────────────────────────────────
        // evaluarSeed descarta los snapshots de caché: uno vacío NO prueba que
        // la colección esté vacía en el servidor, solo que este cliente aún no
        // la bajó. Ver src/lib/seedGuard.ts.
        if (evaluarSeed(snapshot, seedAttempted.current).sembrar) {
          seedAttempted.current = true;
          try {
            // Segunda barrera, ya con el servidor de por medio: confirma que
            // 'conceptos' sigue vacía justo antes de escribir. Cubre la carrera
            // con otra pestaña sembrando al mismo tiempo, y falla si no hay red
            // en vez de sembrar a ciegas.
            const enServidor = await getDocsFromServer(collection(db, 'conceptos'));
            if (!enServidor.empty) {
              console.warn('[seed] conceptos: el servidor ya tiene ' + enServidor.size + ' documentos. No se siembra.');
              return;
            }

            await conAviso('los conceptos iniciales', () => Promise.all(
              initialConceptos.map(c =>
                setDoc(doc(db, 'conceptos', c.id), sanitizarParaFirestore(c))
              )
            ));
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error al sembrar conceptos iniciales';
            setError(msg);
            setLoading(false);
          }
          return;
        }

        // Snapshot que no autoriza sembrar: se pinta tal cual. Si venía de
        // caché, el snapshot del servidor llegará después y volverá a evaluar.

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
    await conAviso('el concepto', () => setDoc(doc(db, 'conceptos', concepto.id), sanitizarParaFirestore(concepto)));
  };

  const updateConcepto = async (id: string, data: Partial<ConceptoVermur>): Promise<void> => {
    await conAviso('el concepto', () => updateDoc(doc(db, 'conceptos', id), sanitizarParaFirestore(data) as Record<string, unknown>));
  };

  return { conceptos, loading, error, createConcepto, updateConcepto };
}
