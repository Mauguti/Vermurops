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
import { PuertoVermur, initialPuertos, initialAeropuertos } from '../components/puertos/PuertosData';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { conAviso } from '../lib/erroresEscritura';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';

export function usePuertos() {
  const { user } = useAuth();

  const [puertos, setPuertos] = useState<PuertoVermur[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Evita que el seed corra más de una vez por sesión de usuario.
  const seedAttempted = useRef(false);
  /** Idem para la siembra aditiva de aeropuertos. */
  const aeroSeedAttempted = useRef(false);

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

            await conAviso('los puertos iniciales', () => Promise.all(
              [...initialPuertos, ...initialAeropuertos].map(p =>
                setDoc(doc(db, 'puertos', p.id), sanitizarParaFirestore(p))
              )
            ));
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error al sembrar puertos iniciales';
            setError(msg);
            setLoading(false);
          }
          return;
        }

        // Snapshot que no autoriza sembrar: se pinta tal cual. Si venía de
        // caché, el snapshot del servidor llegará después y volverá a evaluar.

        /*
         * ── Siembra ADITIVA de aeropuertos (sep-2026) ─────────────────────
         * La colección ya existía con los 21 puertos marítimos cuando el
         * catálogo se volvió de «puntos», así que el seed de arriba (solo
         * corre en colección VACÍA) nunca agregaría los aeropuertos en
         * producción. Aquí se completan los que falten, una vez por sesión:
         * ids fijos PTO-Ann → setDoc idempotente, y solo sobre un snapshot
         * del servidor — uno de caché no prueba ausencia.
         */
        if (!snapshot.metadata.fromCache && !aeroSeedAttempted.current) {
          const existentes = new Set(snapshot.docs.map(d => d.id));
          const faltantes = initialAeropuertos.filter(a => !existentes.has(a.id));
          if (faltantes.length > 0 && !snapshot.empty) {
            aeroSeedAttempted.current = true;
            conAviso('los aeropuertos iniciales', () => Promise.all(
              faltantes.map(a =>
                setDoc(doc(db, 'puertos', a.id), sanitizarParaFirestore(a))
              )
            )).catch(() => { /* conAviso ya reportó; el catálogo sigue usable */ });
          }
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

  /** Alta de puerto. Solo Administración (matriz §4.1). */
  const createPuerto = async (puerto: PuertoVermur): Promise<void> => {
    exigir(user?.rol as UserRole | undefined, 'puerto.alta');
    await conAviso('el puerto', () => setDoc(doc(db, 'puertos', puerto.id), sanitizarParaFirestore(puerto)));
  };

  const updatePuerto = async (id: string, data: Partial<PuertoVermur>): Promise<void> => {
    await conAviso('el puerto', () => updateDoc(doc(db, 'puertos', id), sanitizarParaFirestore(data) as Record<string, unknown>));
  };

  return { puertos, loading, error, createPuerto, updatePuerto };
}
