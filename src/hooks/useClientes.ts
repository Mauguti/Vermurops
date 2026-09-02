/**
 * useClientes.ts
 *
 * Hook que sincroniza clientes con Firestore.
 *
 * Comportamiento:
 *  1. Abre un listener onSnapshot sobre la colección 'clientes'.
 *  2. Si la colección está vacía (primera vez), escribe el seed de
 *     initialClientes usando setDoc → preserva el id como document ID.
 *  3. Expone { clientes, loading, error, createCliente, updateCliente,
 *     analizarImportacionClientes, importarClientesDesdeJSON }.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, getDocsFromServer } from 'firebase/firestore';
import { evaluarSeed } from '../lib/seedGuard';
import { ClienteVermur, initialClientes } from '../components/clientes/ClientesData';
import type { DiasCredito } from '../components/proveedores/ProveedoresData';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { conAviso, reportarErrorEscritura } from '../lib/erroresEscritura';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';

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
        // ── ¿Se puede sembrar? ────────────────────────────────────────────
        // evaluarSeed descarta los snapshots de caché: uno vacío NO prueba que
        // la colección esté vacía en el servidor, solo que este cliente aún no
        // la bajó. Ver src/lib/seedGuard.ts.
        if (evaluarSeed(snapshot, seedAttempted.current).sembrar) {
          seedAttempted.current = true;
          try {
            // Segunda barrera, ya con el servidor de por medio: confirma que
            // 'clientes' sigue vacía justo antes de escribir. Cubre la carrera
            // con otra pestaña sembrando al mismo tiempo, y falla si no hay red
            // en vez de sembrar a ciegas.
            const enServidor = await getDocsFromServer(collection(db, 'clientes'));
            if (!enServidor.empty) {
              console.warn('[seed] clientes: el servidor ya tiene ' + enServidor.size + ' documentos. No se siembra.');
              return;
            }

            await conAviso('los clientes iniciales', () => Promise.all(
              initialClientes.map(c =>
                setDoc(doc(db, 'clientes', c.id), sanitizarParaFirestore(c))
              )
            ));
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error al sembrar clientes iniciales';
            setError(msg);
            setLoading(false);
          }
          return;
        }

        // Snapshot que no autoriza sembrar: se pinta tal cual. Si venía de
        // caché, el snapshot del servidor llegará después y volverá a evaluar.

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

  /**
   * Alta de cliente. Solo Administración (matriz §4.1).
   * La guarda vive aquí y no en el botón: cualquier call site queda cubierto.
   */
  const createCliente = async (cliente: ClienteVermur): Promise<void> => {
    exigir(user?.rol as UserRole | undefined, 'cliente.alta');
    await conAviso('el cliente', () => setDoc(doc(db, 'clientes', cliente.id), sanitizarParaFirestore(cliente)));
  };

  const updateCliente = async (id: string, data: Partial<ClienteVermur>): Promise<void> => {
    // Editar el expediente ES parte del alta (§4.1): días de crédito, RFC y
    // validación fiscal son decisiones de Administración. Sin esta guarda,
    // cualquier rol con el módulo abierto podía reescribirlos.
    exigir(user?.rol as UserRole | undefined, 'cliente.alta');
    await conAviso('el cliente', () => updateDoc(doc(db, 'clientes', id), sanitizarParaFirestore(data) as Record<string, unknown>));
  };

  /**
   * Cuenta qué haría la importación ANTES de ejecutarla, para poder confirmar
   * con números reales en vez de un aproximado.
   *
   * 'aSobrescribir' es el dato que importa: son documentos vivos con los que
   * el equipo está trabajando y que la importación pisa.
   */
  const analizarImportacionClientes = useCallback(async (): Promise<{
    total: number;
    aSobrescribir: number;
    nuevos: number;
  }> => {
    exigir(user?.rol as UserRole | undefined, 'catalogo.importarMasivo');

    const { default: rawClientes } = await import('../data/seeds/clientes.json');
    const existentes = new Set(clientes.map(c => c.id));
    const aSobrescribir = rawClientes.filter(r => existentes.has(r.id)).length;

    return {
      total: rawClientes.length,
      aSobrescribir,
      nuevos: rawClientes.length - aSobrescribir,
    };
  }, [user?.rol, clientes]);

  /**
   * Importa clientes desde el JSON de Magaya.
   * - setDoc con id preservado → idempotente (re-ejecutar no duplica).
   * - Mapea diasCredito.general → dias, guarda objeto completo como diasCreditoPorTipo.
   * - Mapea activo (boolean) → statusOperativo ('ACTIVO' | 'INACTIVO').
   * - Retorna cantidad importada.
   */
  const importarClientesDesdeJSON = useCallback(async (): Promise<number> => {
    // Sobrescribe el catálogo completo contra la base en uso. No es un alta
    // de negocio sino mantenimiento: exclusiva de 'admin', no de Administración.
    exigir(user?.rol as UserRole | undefined, 'catalogo.importarMasivo');

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
        return setDoc(doc(db, 'clientes', cliente.id), sanitizarParaFirestore(cliente));
      })).catch(err => { reportarErrorEscritura('el lote de clientes importados', err); throw err; });
      count += batch.length;
    }

    return count;
  }, [user?.rol]);

  return {
    clientes, loading, error,
    createCliente, updateCliente,
    analizarImportacionClientes, importarClientesDesdeJSON,
  };
}
