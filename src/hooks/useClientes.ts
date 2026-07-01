/**
 * useClientes.ts
 *
 * Hook que sincroniza clientes con Firestore.
 *
 * Comportamiento:
 *  1. Abre un listener onSnapshot sobre la colección 'clientes'.
 *  2. Si la colección está vacía (primera vez), escribe el seed de
 *     initialClientes usando setDoc → preserva el id como document ID.
 *  3. Expone { clientes, loading, error, createCliente, updateCliente }.
 */

import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { ClienteVermur, initialClientes } from '../components/clientes/ClientesData';
import { useAuth } from '../auth/AuthContext';

export function useClientes() {
  const { user } = useAuth();

  const [clientes, setClientes] = useState<ClienteVermur[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Evita que el seed corra más de una vez por sesión de usuario.
  const seedAttempted = useRef(false);

  useEffect(() => {
    // Guarda de autenticación: no abrir el listener hasta tener usuario.
    if (!user) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'clientes'),
      async (snapshot) => {
        // ── Colección vacía: seed inicial ─────────────────────────────────
        if (snapshot.empty && !seedAttempted.current) {
          seedAttempted.current = true;
          try {
            await Promise.all(
              initialClientes.map(c =>
                setDoc(doc(db, 'clientes', c.id), c)
              )
            );
            // onSnapshot disparará de nuevo con los 3 documentos escritos.
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error al sembrar clientes iniciales';
            setError(msg);
            setLoading(false);
          }
          return;
        }

        // ── Snapshot con datos (normal o post-seed) ───────────────────────
        const data: ClienteVermur[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() } as ClienteVermur);
        });

        // Alfabético por razón social.
        data.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

        setClientes(data);
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

  const createCliente = async (cliente: ClienteVermur): Promise<void> => {
    await setDoc(doc(db, 'clientes', cliente.id), cliente);
  };

  const updateCliente = async (id: string, data: Partial<ClienteVermur>): Promise<void> => {
    await updateDoc(doc(db, 'clientes', id), data as Record<string, unknown>);
  };

  return { clientes, loading, error, createCliente, updateCliente };
}
