/**
 * useClientes.ts
 *
 * Hook que sincroniza clientes con Firestore.
 *
 * Comportamiento:
 *  1. Abre un listener onSnapshot sobre la colección 'clientes'.
 *  2. Si la colección está vacía (primera vez), escribe el seed de
 *     initialClientes usando setDoc → preserva el id como document ID.
 *  3. Expone { clientes, loading, error, createCliente, updateCliente, importarClientesDesdeJSON }.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { ClienteVermur, initialClientes } from '../components/clientes/ClientesData';
import type { DiasCredito } from '../components/proveedores/ProveedoresData';
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

  /**
   * Importa clientes desde el JSON de Magaya.
   * - setDoc con id preservado → idempotente (re-ejecutar no duplica).
   * - Mapea diasCredito.general → dias, guarda objeto completo como diasCreditoPorTipo.
   * - Mapea activo (boolean) → statusOperativo ('ACTIVO' | 'INACTIVO').
   * - Retorna cantidad importada.
   */
  const importarClientesDesdeJSON = useCallback(async (): Promise<number> => {
    const { default: rawClientes } = await import('../data/seeds/clientes.json');

    const BATCH_SIZE = 50;
    let count = 0;

    for (let i = 0; i < rawClientes.length; i += BATCH_SIZE) {
      const batch = rawClientes.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(raw => {
        const dc = raw.diasCredito as DiasCredito | undefined;
        const cliente: ClienteVermur = {
          id: raw.id,
          nombre: raw.nombre,
          fechaAlta: raw.fechaAlta ?? new Date().toISOString().slice(0, 10),
          dias: dc?.general ?? 0,
          statusOperativo: raw.activo ? 'ACTIVO' : 'INACTIVO',
          // Magaya identifiers
          idSemantico: raw.idSemantico ?? undefined,
          referenciaMagaya: raw.referenciaMagaya ?? undefined,
          numeroEntidadMagaya: raw.numeroEntidadMagaya ?? undefined,
          // Credit
          diasCreditoPorTipo: dc ?? undefined,
          limiteCreditoMXN: raw.limiteCreditoMXN ?? undefined,
          // Contacts
          contactos: raw.contactos ?? [],
          // Data quality
          estado: raw.estado ?? undefined,
          codigoPostal: raw.codigoPostal ?? undefined,
          validadoFiscalmente: raw.validadoFiscalmente ?? false,
          tuvoTransacciones: raw.tuvoTransacciones ?? false,
          duplicadoEnMagaya: raw.duplicadoEnMagaya ?? false,
          origenDatos: (raw.origenDatos as 'manual' | 'magaya') ?? 'magaya',
          fechaAltaMagaya: raw.fechaAltaMagaya ?? undefined,
          updatedAt: raw.updatedAt ?? undefined,
          // Preferences
          proveedoresPreferidos: raw.proveedoresPreferidos ?? [],
          proveedoresVetados: raw.proveedoresVetados ?? [],
        };
        return setDoc(doc(db, 'clientes', cliente.id), cliente);
      }));
      count += batch.length;
    }

    return count;
  }, []);

  return { clientes, loading, error, createCliente, updateCliente, importarClientesDesdeJSON };
}
