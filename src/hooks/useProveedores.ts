/**
 * useProveedores.ts
 *
 * Hook que sincroniza proveedores con Firestore.
 *
 * Comportamiento (mismo patrón que useClientes):
 *  1. Abre un listener onSnapshot sobre la colección 'proveedores'.
 *  2. Si la colección está vacía (primera vez), escribe el seed de
 *     initialProveedores (544 registros de Magaya) usando setDoc →
 *     preserva el id como document ID.
 *  3. Expone { proveedores, loading, error, createProveedor, updateProveedor }.
 */

import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { ProveedorVermur, initialProveedores } from '../components/proveedores/ProveedoresData';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';

export function useProveedores() {
  const { user } = useAuth();

  const [proveedores, setProveedores] = useState<ProveedorVermur[]>([]);
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
      collection(db, 'proveedores'),
      async (snapshot) => {
        // ── Colección vacía: seed inicial ─────────────────────────────────
        if (snapshot.empty && !seedAttempted.current) {
          seedAttempted.current = true;
          try {
            await Promise.all(
              initialProveedores.map(p =>
                setDoc(doc(db, 'proveedores', p.id), p)
              )
            );
            // onSnapshot disparará de nuevo con los 544 documentos escritos.
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error al sembrar proveedores iniciales';
            setError(msg);
            setLoading(false);
          }
          return;
        }

        // ── Snapshot con datos (normal o post-seed) ───────────────────────
        const data: ProveedorVermur[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() } as ProveedorVermur);
        });

        // Alfabético por razón social.
        data.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

        setProveedores(data);
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

  /**
   * Alta de proveedor.
   *
   *  - modo 'definitiva' (default): alta formal del catálogo. Solo Admin.
   *  - modo 'rapida': «probable proveedor» que Pricing captura dentro de la
   *    cotización; queda pendiente de validación por Administración (§6).
   */
  const createProveedor = async (
    proveedor: ProveedorVermur,
    opts?: { modo?: 'definitiva' | 'rapida' },
  ): Promise<void> => {
    const rol = user?.rol as UserRole | undefined;
    exigir(rol, opts?.modo === 'rapida' ? 'proveedor.altaRapida' : 'proveedor.alta');
    await setDoc(doc(db, 'proveedores', proveedor.id), proveedor);
  };

  const updateProveedor = async (id: string, data: Partial<ProveedorVermur>): Promise<void> => {
    await updateDoc(doc(db, 'proveedores', id), data as Record<string, unknown>);
  };

  return { proveedores, loading, error, createProveedor, updateProveedor };
}
