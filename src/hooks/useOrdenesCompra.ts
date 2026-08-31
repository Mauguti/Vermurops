/**
 * useOrdenesCompra.ts
 *
 * Hook que sincroniza Órdenes de Compra con Firestore.
 *
 * Comportamiento (mismo patrón que useProveedores):
 *  1. Abre un listener onSnapshot sobre la colección 'ordenesCompra'.
 *  2. No hay seed — las OCs se crean desde la UI.
 *  3. Expone CRUD + transiciones de estado + folio atómico + agregados para KPIs.
 */

import { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import type {
  OrdenCompra,
  EstadoOC,
  RegistroEstadoOC,
  FondeoContext,
} from '../components/ordenesCompra/OrdenesCompraData';
import { puedeTransicionarOC, type RolOC } from '../lib/stateMachineOC';
import { generateFolioOC } from '../lib/folioServiceOC';
import { conAviso } from '../lib/erroresEscritura';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { totalesPorPagar, TotalesPorPagar } from '../lib/cuentasPorPagar';

// ─── Colección ──────────────────────────────────────────────────────────────

const COLLECTION = 'ordenesCompra';

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useOrdenesCompra() {
  const { user } = useAuth();

  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Listener en tiempo real (solo documentos activos, ordenados por fecha) ──
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, COLLECTION),
      where('activo', '==', true),
      orderBy('createdAt', 'desc'),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data: OrdenCompra[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() } as OrdenCompra);
        });
        setOrdenes(data);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  // ── Crear OC (genera folio atómico) ───────────────────────────────────────

  const createOrden = useCallback(async (
    datos: Omit<OrdenCompra, 'id' | 'folio' | 'createdAt' | 'updatedAt'>,
  ): Promise<OrdenCompra> => {
    // Una OC es una instrucción de pago: quién puede emitirla no es cosmético.
    exigir(user?.rol as UserRole | undefined, 'ordenCompra.solicitar');

    const id = doc(collection(db, COLLECTION)).id;
    const folio = await generateFolioOC();
    const now = new Date().toISOString();

    const oc: OrdenCompra = {
      ...datos,
      id,
      folio,
      createdAt: now,
      updatedAt: now,
    };

    await conAviso('la orden de compra', () => setDoc(doc(db, COLLECTION, id), sanitizarParaFirestore(oc)));
    return oc;
  }, [user]);

  // ── Actualizar OC (parcial) ───────────────────────────────────────────────

  const updateOrden = useCallback(async (
    id: string,
    data: Partial<OrdenCompra>,
  ): Promise<void> => {
    await conAviso('la orden de compra', () => updateDoc(doc(db, COLLECTION, id), sanitizarParaFirestore({
      ...data,
      updatedAt: new Date().toISOString(),
    }) as Record<string, unknown>));
  }, []);

  // ── Transicionar estado (valida con la máquina de estados) ────────────────

  const transicionarEstado = useCallback(async (
    oc: OrdenCompra,
    nuevoEstado: EstadoOC,
    rol: RolOC,
    usuario: { uid: string; nombre: string },
    fondeoCtx?: FondeoContext,
  ): Promise<{ ok: boolean; razon?: string }> => {
    // Validar con la máquina de estados pura
    const resultado = puedeTransicionarOC(oc.estado, nuevoEstado, rol, oc, fondeoCtx);
    if (!resultado.ok) return resultado;

    // Construir registro de historial
    const registro: RegistroEstadoOC = {
      estado: nuevoEstado,
      fecha: new Date().toISOString(),
      usuarioId: usuario.uid,
      usuarioNombre: usuario.nombre,
      ...(nuevoEstado === 'rechazada' && oc.motivoRechazo
        ? { motivo: oc.motivoRechazo }
        : {}),
    };

    // Construir el actor correspondiente al estado
    const actor = { uid: usuario.uid, nombre: usuario.nombre, fecha: new Date().toISOString() };
    const actorField: Partial<OrdenCompra> = {};
    if (nuevoEstado === 'en_gestion') actorField.gestionadaPor = actor;
    if (nuevoEstado === 'autorizada') actorField.autorizadaPor = actor;
    if (nuevoEstado === 'pagada') actorField.pagadaPor = actor;

    await conAviso('la orden de compra', () => updateDoc(doc(db, COLLECTION, oc.id), sanitizarParaFirestore({
      estado: nuevoEstado,
      historialEstados: [...oc.historialEstados, registro],
      ...actorField,
      updatedAt: new Date().toISOString(),
    }) as Record<string, unknown>));
    return { ok: true };
  }, []);

  // ── Soft delete ───────────────────────────────────────────────────────────

  const deleteOrden = useCallback(async (id: string): Promise<void> => {
    await conAviso('la orden de compra', () => updateDoc(doc(db, COLLECTION, id), sanitizarParaFirestore({
      activo: false,
      updatedAt: new Date().toISOString(),
    }) as Record<string, unknown>));
  }, []);

  // ── Agregados para KPIs ───────────────────────────────────────────────────

  /**
   * Lo que Vermur debe, por moneda.
   *
   * Antes esto era un `reduce` que sumaba `oc.monto` sin mirar `oc.moneda` y
   * la tarjeta lo rotulaba «USD». Una OC de 2,000 USD y otra de 40,000 MXN
   * daban «$42,000 USD»: §4.3 exacto, un total revuelto que se ve creíble.
   */
  const porPagar: TotalesPorPagar = totalesPorPagar(ordenes);

  /** Conteo por estado para badges/filtros. */
  const conteosPorEstado: Record<EstadoOC, number> = {
    solicitada: 0,
    en_gestion: 0,
    autorizada: 0,
    pagada: 0,
    rechazada: 0,
  };
  ordenes.forEach(oc => {
    conteosPorEstado[oc.estado]++;
  });

  return {
    ordenes,
    loading,
    error,
    createOrden,
    updateOrden,
    transicionarEstado,
    deleteOrden,
    // KPIs
    porPagar,
    conteosPorEstado,
  };
}
