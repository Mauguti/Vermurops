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

import { db } from '../firebase';
import { doc, setDoc, runTransaction, deleteField } from 'firebase/firestore';
import { useTiendaCatalogo, tiendaEmbarques } from './tiendasCatalogos';
import { EmbarqueCompleto } from '../components/shipments/EmbarquesData';
import { useAuth } from '../auth/AuthContext';
import { PermisoDenegadoError, capacidadParaGuardarEmbarque, puedeGuardarEmbarque } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { conAviso } from '../lib/erroresEscritura';
import { enCola } from '../lib/enCola';
import { planEscrituraEmbarque } from '../lib/diffEmbarque';

export function useEmbarques() {
  const { user } = useAuth();

  const { datos: embarques, loading, error } = useTiendaCatalogo(tiendaEmbarques, !!user);

  /**
   * Upsert de un embarque — misma semántica que el viejo handleUpdateEmbarque.
   *
   * `esNuevo` decide si esto es un alta (y entonces exige la capacidad) o una
   * edición. La edición NO lleva guarda de capacidad todavía: Administración
   * no tiene 'embarque.generar' pero sí debe poder registrar los cierres de
   * pago y administrativo (§4.7). Afinar permisos por campo es trabajo aparte.
   */
  const guardarEmbarque = async (embarque: EmbarqueCompleto, anterior?: EmbarqueCompleto): Promise<void> => {
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

    /*
     * Con `anterior` (tarea 123) la escritura va en una transacción que lee el
     * servidor y escribe SOLO lo que esta edición tocó, con eventos, bitácora y
     * documentos fusionados por id. Sin `anterior` —alta, HBL hijo— rige el
     * upsert del documento entero de siempre. En fila por embarque: dos
     * transacciones seguidas pueden confirmarse al revés.
     */
    if (anterior && anterior.id === embarque.id && !esNuevo) {
      const nuevo = limpio as unknown as Record<string, unknown>;
      await enCola(`embarques/${embarque.id}`, () => conAviso('el embarque', () => runTransaction(db, async tx => {
        const ref = doc(db, 'embarques', embarque.id);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error(`${embarque.id} ya no existe. No se guardó nada.`);
        const { cambios, borrar } = planEscrituraEmbarque(
          snap.data() as Record<string, unknown>,
          sanitizarParaFirestore(anterior) as unknown as Record<string, unknown>,
          nuevo,
        );
        if (Object.keys(cambios).length === 0 && borrar.length === 0) return;
        const datos: Record<string, unknown> = { ...(sanitizarParaFirestore(cambios) as Record<string, unknown>) };
        for (const k of borrar) datos[k] = deleteField();
        tx.update(ref, datos);
      })));
      return;
    }

    await conAviso('el embarque', () => setDoc(doc(db, 'embarques', embarque.id), limpio));
  };

  return { embarques, loading, error, guardarEmbarque };
}
