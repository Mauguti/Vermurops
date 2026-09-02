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
import { collection, onSnapshot, doc, setDoc, updateDoc, getDocsFromServer } from 'firebase/firestore';
import { evaluarSeed } from '../lib/seedGuard';
import { ProveedorVermur, initialProveedores } from '../components/proveedores/ProveedoresData';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { conAviso } from '../lib/erroresEscritura';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';

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
        // ── ¿Se puede sembrar? ────────────────────────────────────────────
        // evaluarSeed descarta los snapshots de caché: uno vacío NO prueba que
        // la colección esté vacía en el servidor, solo que este cliente aún no
        // la bajó. Ver src/lib/seedGuard.ts.
        if (evaluarSeed(snapshot, seedAttempted.current).sembrar) {
          seedAttempted.current = true;
          try {
            // Segunda barrera, ya con el servidor de por medio: confirma que
            // 'proveedores' sigue vacía justo antes de escribir. Cubre la carrera
            // con otra pestaña sembrando al mismo tiempo, y falla si no hay red
            // en vez de sembrar a ciegas.
            const enServidor = await getDocsFromServer(collection(db, 'proveedores'));
            if (!enServidor.empty) {
              console.warn('[seed] proveedores: el servidor ya tiene ' + enServidor.size + ' documentos. No se siembra.');
              return;
            }

            await conAviso('los proveedores iniciales', () => Promise.all(
              initialProveedores.map(p =>
                setDoc(doc(db, 'proveedores', p.id), sanitizarParaFirestore(p))
              )
            ));
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error al sembrar proveedores iniciales';
            setError(msg);
            setLoading(false);
          }
          return;
        }

        // Snapshot que no autoriza sembrar: se pinta tal cual. Si venía de
        // caché, el snapshot del servidor llegará después y volverá a evaluar.

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
    await conAviso('el proveedor', () => setDoc(doc(db, 'proveedores', proveedor.id), sanitizarParaFirestore(proveedor)));
  };

  const updateProveedor = async (id: string, data: Partial<ProveedorVermur>): Promise<void> => {
    // Mismo criterio que updateCliente: editar el expediente es del alta.
    // El «probable proveedor» de Pricing entra por createProveedor con modo
    // rapida; una vez creado, quien lo completa y valida es Administración.
    exigir(user?.rol as UserRole | undefined, 'proveedor.alta');
    await conAviso('el proveedor', () => updateDoc(doc(db, 'proveedores', id), sanitizarParaFirestore(data) as Record<string, unknown>));
  };

  return { proveedores, loading, error, createProveedor, updateProveedor };
}
