/**
 * useEmbarques.ts
 *
 * Sincroniza los embarques con Firestore.
 *
 * ── Por qué existe (E-1) ───────────────────────────────────────────────────
 * Los embarques vivían en `useState(initialEmbarquesCompletos)` dentro de
 * Shipments.tsx: se perdían al recargar, igual que pasaba con los prospectos.
 * Persistirlos es prerrequisito de la conversión cotización → embarque: no
 * tiene sentido generar un embarque desde una cotización aprobada si el
 * resultado se evapora.
 *
 * ── Sin seed, a propósito ──────────────────────────────────────────────────
 * `initialEmbarquesCompletos` son cuatro embarques de demostración (SHP-2026-
 * 0001, «Grupo Textil Monterrey»). §3 del CLAUDE.md prohíbe sembrar datos
 * inventados en producción. La colección arranca vacía.
 *
 * ── El contrato con la UI no cambia ────────────────────────────────────────
 * FichaEmbarque llama `onUpdateEmbarque(embarqueCompleto)` en catorce sitios,
 * con semántica de upsert (también la usa para registrar un HBL hijo nuevo).
 * `guardarEmbarque` conserva exactamente esa semántica, así que ni
 * FichaEmbarque, ni EmbarquesList, ni ProductosEmbarque necesitan cambios.
 */

import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { EmbarqueCompleto } from '../components/shipments/EmbarquesData';
import { useAuth } from '../auth/AuthContext';
import { PermisoDenegadoError, capacidadParaGuardarEmbarque, puedeGuardarEmbarque } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { conAviso } from '../lib/erroresEscritura';

export function useEmbarques() {
  const { user } = useAuth();

  const [embarques, setEmbarques] = useState<EmbarqueCompleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'embarques'),
      (snapshot) => {
        const data: EmbarqueCompleto[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() } as EmbarqueCompleto);
        });

        // Más recientes primero.
        data.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

        setEmbarques(data);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  /**
   * Upsert de un embarque — misma semántica que el viejo handleUpdateEmbarque.
   *
   * `esNuevo` decide si esto es un alta (y entonces exige la capacidad) o una
   * edición. La edición NO lleva guarda de capacidad todavía: Administración
   * no tiene 'embarque.generar' pero sí debe poder registrar los cierres de
   * pago y administrativo (§4.7). Afinar permisos por campo es trabajo aparte.
   */
  const guardarEmbarque = async (embarque: EmbarqueCompleto): Promise<void> => {
    const rol = user?.rol as UserRole | undefined;
    const esNuevo = !embarques.some(e => e.id === embarque.id);

    if (!puedeGuardarEmbarque(rol, esNuevo)) {
      throw new PermisoDenegadoError(
        rol,
        capacidadParaGuardarEmbarque(esNuevo) ?? 'embarque.generar',
      );
    }

    // Sin esto, cualquier campo opcional en undefined tumba la escritura entera.
    const limpio = sanitizarParaFirestore({
      ...embarque,
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    });

    await conAviso('el embarque', () => setDoc(doc(db, 'embarques', embarque.id), limpio));
  };

  return { embarques, loading, error, guardarEmbarque };
}
