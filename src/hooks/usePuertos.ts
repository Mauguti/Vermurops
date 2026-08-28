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
import { collection, onSnapshot, doc, setDoc, updateDoc, getDocsFromServer } from 'firebase/firestore';
import { evaluarSeed } from '../lib/seedGuard';
import { PuertoVermur, initialPuertos } from '../components/puertos/PuertosData';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';

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
        // ── ¿Se puede sembrar? ────────────────────────────────────────────
        // evaluarSeed descarta los snapshots de caché: uno vacío NO prueba que
        // la colección esté vacía en el servidor, solo que este cliente aún no
        // la bajó. Ver src/lib/seedGuard.ts.
        if (evaluarSeed(snapshot, seedAttempted.current).sembrar) {
          seedAttempted.current = true;
          try {
            // Segunda barrera, ya con el servidor de por medio: confirma que
            // 'puertos' sigue vacía justo antes de escribir. Cubre la carrera
            // con otra pestaña sembrando al mismo tiempo, y falla si no hay red
            // en vez de sembrar a ciegas.
            const enServidor = await getDocsFromServer(collection(db, 'puertos'));
            if (!enServidor.empty) {
              console.warn('[seed] puertos: el servidor ya tiene ' + enServidor.size + ' documentos. No se siembra.');
              return;
            }

            await Promise.all(
              initialPuertos.map(p =>
                setDoc(doc(db, 'puertos', p.id), p)
              )
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error al sembrar puertos iniciales';
            setError(msg);
            setLoading(false);
          }
          return;
        }

        // Snapshot que no autoriza sembrar: se pinta tal cual. Si venía de
        // caché, el snapshot del servidor llegará después y volverá a evaluar.

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

  /** Alta de puerto. Solo Administración (matriz §4.1). */
  const createPuerto = async (puerto: PuertoVermur): Promise<void> => {
    exigir(user?.rol as UserRole | undefined, 'puerto.alta');
    await setDoc(doc(db, 'puertos', puerto.id), puerto);
  };

  const updatePuerto = async (id: string, data: Partial<PuertoVermur>): Promise<void> => {
    await updateDoc(doc(db, 'puertos', id), data as Record<string, unknown>);
  };

  return { puertos, loading, error, createPuerto, updatePuerto };
}
