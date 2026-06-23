/**
 * useCotizaciones.ts
 *
 * Hook que sincroniza cotizaciones con Firestore.
 *
 * Comportamiento:
 *  1. Abre un listener onSnapshot sobre la colección 'cotizaciones'.
 *  2. Si la colección está vacía (primera vez en el proyecto), escribe el
 *     seed de initialKanbanQuotes usando setDoc → preserva el folio como
 *     document ID, sin regenerarlo.
 *  3. Tras el seed, inicializa el contador (contadores/cotizaciones.ultimo)
 *     al número más alto encontrado en los folios del seed, para que el
 *     próximo generateFolio() continúe desde ahí.
 *  4. Expone { quotes, loading, error }.
 *
 * En E3.3 se conectará a Quotes.tsx reemplazando el useState local.
 * En E3.4 se añadirán createCotizacion y updateCotizacion.
 */

import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { KanbanQuote, initialKanbanQuotes } from '../components/quotes/QuotesData';
import { initContadorDesdeFolios } from '../lib/folioService';
import { useAuth } from '../auth/AuthContext';

export function useCotizaciones() {
  const { user } = useAuth();

  const [quotes, setQuotes]   = useState<KanbanQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Evita que el seed corra más de una vez por sesión de usuario,
  // aunque onSnapshot dispare varias veces mientras las escrituras terminan.
  const seedAttempted = useRef(false);

  useEffect(() => {
    // Guarda de autenticación: no abrir el listener hasta tener usuario.
    // AuthProvider ya resolvió onAuthStateChanged antes de renderizar hijos,
    // pero el token interno de Firestore puede propagarse con un tick de retraso.
    // Dependiendo de `user` del contexto garantizamos que el token está listo.
    if (!user) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'cotizaciones'),
      async (snapshot) => {
        // ── Colección vacía: seed inicial ─────────────────────────────────
        if (snapshot.empty && !seedAttempted.current) {
          seedAttempted.current = true;
          try {
            // setDoc preserva el folio como document ID (no usa addDoc).
            // Dos sesiones simultáneas producirían writes idénticos → sin daño.
            await Promise.all(
              initialKanbanQuotes.map(q =>
                setDoc(doc(db, 'cotizaciones', q.id), q)
              )
            );
            // Inicializar el contador al máximo folio del seed (→ 8).
            // El siguiente generateFolio() devolverá COT-2026-0009.
            await initContadorDesdeFolios(initialKanbanQuotes.map(q => q.id));
            // onSnapshot disparará de nuevo con los 8 documentos escritos.
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error al sembrar cotizaciones iniciales';
            setError(msg);
            setLoading(false);
          }
          return; // Esperar el siguiente disparo de onSnapshot con datos
        }

        // ── Snapshot con datos (normal o post-seed) ───────────────────────
        const data: KanbanQuote[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() } as KanbanQuote);
        });

        // Más reciente primero (alineado con la convención de Quotes.tsx
        // que hace [newQuote, ...rest] al crear).
        data.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        setQuotes(data);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]); // Re-corre cuando cambia el usuario (login / logout)

  return { quotes, loading, error };
}
