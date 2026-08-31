/**
 * useImportacionesTarifas.ts
 *
 * Borradores de importación de tarifarios (TA-2).
 *
 * Solo escucha los borradores ABIERTOS —extrayendo o en revisión—, que son
 * los que la UI necesita mostrar. Los cerrados se consultan bajo demanda: un
 * año de importaciones guardadas no tiene por qué viajar al navegador cada vez
 * que alguien abre el módulo de Tarifas.
 */

import { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  collection, onSnapshot, doc, setDoc, updateDoc, query, where, orderBy,
} from 'firebase/firestore';
import { ImportacionTarifario, EstadoImportacion } from '../components/tarifas/ImportacionData';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';

const COL = 'importacionesTarifas';
const ESTADOS_ABIERTOS: EstadoImportacion[] = ['extrayendo', 'en_revision'];

export function useImportacionesTarifas() {
  const { user } = useAuth();
  const [abiertas, setAbiertas] = useState<ImportacionTarifario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const q = query(
      collection(db, COL),
      where('estado', 'in', ESTADOS_ABIERTOS),
      orderBy('updatedAt', 'desc'),
    );

    const unsub = onSnapshot(q, (snap) => {
      const data: ImportacionTarifario[] = [];
      snap.forEach(d => data.push({ id: d.id, ...d.data() } as ImportacionTarifario));
      setAbiertas(data);
      setLoading(false);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  /**
   * Crea el borrador. Exige `tarifario.cargar`: es la misma capacidad que
   * gobierna la carga masiva, y el cliente la asignó a Pricing.
   */
  const crearImportacion = async (imp: ImportacionTarifario): Promise<void> => {
    exigir(user?.rol as UserRole | undefined, 'tarifario.cargar');
    await setDoc(doc(db, COL, imp.id), sanitizarParaFirestore(imp));
  };

  /** Guarda el avance de la revisión. Se llama seguido: uno por edición. */
  const actualizarImportacion = async (
    id: string,
    cambios: Partial<ImportacionTarifario>,
  ): Promise<void> => {
    exigir(user?.rol as UserRole | undefined, 'tarifario.cargar');
    await updateDoc(doc(db, COL, id), sanitizarParaFirestore({
      ...cambios,
      updatedAt: new Date().toISOString(),
    }) as Record<string, unknown>);
  };

  /**
   * Cierra el borrador.
   *
   * No hay borrado: una importación descartada se marca, no desaparece. Si
   * mañana aparece una tarifa rara en el catálogo, el rastro de qué se subió y
   * qué se decidió es lo que permite reconstruir qué pasó.
   */
  const cerrarImportacion = async (
    id: string,
    estado: 'guardada' | 'descartada' | 'error',
    extra: Partial<ImportacionTarifario> = {},
  ): Promise<void> => {
    exigir(user?.rol as UserRole | undefined, 'tarifario.cargar');
    await updateDoc(doc(db, COL, id), sanitizarParaFirestore({
      ...extra,
      estado,
      updatedAt: new Date().toISOString(),
    }) as Record<string, unknown>);
  };

  return { abiertas, loading, error, crearImportacion, actualizarImportacion, cerrarImportacion };
}
