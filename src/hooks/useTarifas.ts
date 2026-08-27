/**
 * useTarifas.ts (TA-1)
 *
 * Hook que sincroniza tarifas con Firestore usando un listener acotado.
 *
 * Listener acotado (no carga todo):
 *   - Query A: activo == true AND fechaFin == null  (indefinidas)
 *   - Query B: activo == true AND fechaFin >= hoy − 60d  (vigentes + recién vencidas)
 *
 * Ambas queries corren como onSnapshot en paralelo; los resultados se
 * deduplicean por ID y se exponen como un solo array.
 *
 * Requiere índice compuesto en Firestore:
 *   Collection: tarifas
 *   Fields: activo ASC, fechaFin ASC
 *
 * El catálogo completo (para UI de administración) se consulta bajo demanda
 * con queryAllTarifas(), no vía el listener.
 *
 * Expone: { tarifas, loading, error, createTarifa, updateTarifa,
 *           buscarVigentes, queryAllTarifas }
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../firebase';
import {
  collection, onSnapshot, doc, setDoc, updateDoc, query, where,
  getDocs, orderBy,
} from 'firebase/firestore';
import {
  TarifaVermur, buscarTarifasVigentes, FiltroTarifas, restarDias, hoyISO,
} from '../components/tarifas/TarifasData';
import { useAuth } from '../auth/AuthContext';

export function useTarifas() {
  const { user } = useAuth();

  const [tarifas, setTarifas] = useState<TarifaVermur[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs para merge de las dos queries.
  const mapA = useRef<Map<string, TarifaVermur>>(new Map());
  const mapB = useRef<Map<string, TarifaVermur>>(new Map());
  const readyA = useRef(false);
  const readyB = useRef(false);

  /** Merge de ambos mapas, deduplicado por ID. */
  const merge = useCallback(() => {
    const combined = new Map<string, TarifaVermur>();
    for (const [id, t] of mapA.current) combined.set(id, t);
    for (const [id, t] of mapB.current) combined.set(id, t);
    const arr = Array.from(combined.values());
    arr.sort((a, b) => a.precios.monto - b.precios.monto);
    setTarifas(arr);
    if (readyA.current && readyB.current) setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const col = collection(db, 'tarifas');
    const cutoff = restarDias(hoyISO(), 60);

    // ── Query A: activo + fechaFin == null (indefinidas) ─────────────────
    const qA = query(col, where('activo', '==', true), where('fechaFin', '==', null));

    // ── Query B: activo + fechaFin >= cutoff (vigentes + recién vencidas) ─
    const qB = query(col, where('activo', '==', true), where('fechaFin', '>=', cutoff));

    const unsubA = onSnapshot(qA, snap => {
      mapA.current.clear();
      snap.forEach(d => {
        mapA.current.set(d.id, { id: d.id, ...d.data() } as TarifaVermur);
      });
      readyA.current = true;
      merge();
    }, err => {
      setError(err.message);
      readyA.current = true;
      merge();
    });

    const unsubB = onSnapshot(qB, snap => {
      mapB.current.clear();
      snap.forEach(d => {
        mapB.current.set(d.id, { id: d.id, ...d.data() } as TarifaVermur);
      });
      readyB.current = true;
      merge();
    }, err => {
      setError(err.message);
      readyB.current = true;
      merge();
    });

    return () => {
      unsubA();
      unsubB();
    };
  }, [user, merge]);

  // ── Writes ─────────────────────────────────────────────────────────────────

  const createTarifa = async (tarifa: TarifaVermur): Promise<void> => {
    await setDoc(doc(db, 'tarifas', tarifa.id), tarifa);
  };

  const updateTarifa = async (id: string, data: Partial<TarifaVermur>): Promise<void> => {
    await updateDoc(doc(db, 'tarifas', id), data as Record<string, unknown>);
  };

  // ── Lookup helper (filtra el array en memoria) ─────────────────────────────

  const buscarVigentes = useCallback(
    (filtros: FiltroTarifas): TarifaVermur[] => buscarTarifasVigentes(tarifas, filtros),
    [tarifas],
  );

  // ── Consulta bajo demanda: catálogo completo (para UI de admin) ────────────

  const queryAllTarifas = useCallback(async (): Promise<TarifaVermur[]> => {
    const snap = await getDocs(
      query(collection(db, 'tarifas'), orderBy('fechaAlta', 'desc')),
    );
    const result: TarifaVermur[] = [];
    snap.forEach(d => result.push({ id: d.id, ...d.data() } as TarifaVermur));
    return result;
  }, []);

  return { tarifas, loading, error, createTarifa, updateTarifa, buscarVigentes, queryAllTarifas };
}
