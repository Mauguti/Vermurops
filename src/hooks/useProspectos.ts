/**
 * useProspectos.ts
 *
 * Sincroniza los prospectos (leads) con Firestore.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * Los prospectos vivían solo en useState dentro de Quotes.tsx, sembrados desde
 * el mock de src/data.ts. Nunca se escribían en ninguna parte. Eso explica los
 * dos bugs que reportó el cliente:
 *
 *   «Al crear un prospecto no aparece confirmación de que se registró»
 *   «El prospecto recién creado no aparece al solicitar cotización»
 *
 * No había nada que confirmar ni nada que listar: el prospecto se perdía al
 * recargar la página.
 *
 * ── Sin seed, a propósito ──────────────────────────────────────────────────
 * A diferencia de los catálogos, esta colección NO se siembra. Los prospectos
 * de src/data.ts son datos de demo inventados (TechCorp México, etc.) y §3 del
 * CLAUDE.md es explícito: nunca inventar datos de catálogo en producción.
 * Colección vacía = lista vacía, hasta que Ventas dé de alta el primero.
 */

import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { Prospecto } from '../data';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';

export function useProspectos() {
  const { user } = useAuth();

  const [prospectos, setProspectos] = useState<Prospecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'prospectos'),
      (snapshot) => {
        const data: Prospecto[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() } as Prospecto);
        });

        // Más recientes primero: es el orden en que Ventas los trabaja.
        data.sort((a, b) => (b.fechaCreacion ?? '').localeCompare(a.fechaCreacion ?? ''));

        setProspectos(data);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  /** Alta de lead. Matriz §4.1: Ventas (y Admin). */
  const createProspecto = async (prospecto: Prospecto): Promise<void> => {
    exigir(user?.rol as UserRole | undefined, 'lead.crear');
    await setDoc(doc(db, 'prospectos', prospecto.id), prospecto);
  };

  const updateProspecto = async (id: string, data: Partial<Prospecto>): Promise<void> => {
    await updateDoc(doc(db, 'prospectos', id), data as Record<string, unknown>);
  };

  return { prospectos, loading, error, createProspecto, updateProspecto };
}
