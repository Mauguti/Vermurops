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

import { db } from '../firebase';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { useTiendaCatalogo, tiendaProveedores } from './tiendasCatalogos';
import { ProveedorVermur } from '../components/proveedores/ProveedoresData';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { conAviso } from '../lib/erroresEscritura';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';

/* El seed y su candado viven en tiendasCatalogos.ts (tarea 93). */

export function useProveedores() {
  const { user } = useAuth();

  const { datos: proveedores, loading, error } = useTiendaCatalogo(tiendaProveedores, !!user);

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
