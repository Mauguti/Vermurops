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

import { useCallback } from 'react';
import { db } from '../firebase';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { useTiendaCatalogo, tiendaClientes } from './tiendasCatalogos';
import { ClienteVermur } from '../components/clientes/ClientesData';
import type { DiasCredito } from '../components/proveedores/ProveedoresData';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { conAviso, reportarErrorEscritura } from '../lib/erroresEscritura';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { statusOperativoDesdeActivo } from '../lib/estatusCliente';

/* El seed y su candado viven en tiendasCatalogos.ts (tarea 93). */

export function useClientes() {
  const { user } = useAuth();

  const { datos: clientes, loading, error } = useTiendaCatalogo(tiendaClientes, !!user);

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
   * - Mapea activo (boolean) → statusOperativo; ausente no es INACTIVO (estatusCliente.ts).
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
          statusOperativo: statusOperativoDesdeActivo(raw.activo),
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
