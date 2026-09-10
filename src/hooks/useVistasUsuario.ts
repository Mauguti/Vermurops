/**
 * useVistasUsuario.ts (TV-4)
 *
 * Hook que sincroniza vistas guardadas con Firestore.
 *
 * Query: where('modulo', '==', modulo)
 *        AND (where('usuarioId', '==', uid) OR where('compartida', '==', true))
 *
 * Firestore no permite OR en un solo query, así que usamos dos listeners
 * (mis vistas + compartidas) y mergeamos por ID, igual que useTarifas.
 *
 * Requiere índice compuesto:
 *   Collection: vistasUsuario
 *   Fields: usuarioId ASC, modulo ASC
 *
 * Expone: { vistas, loading, error, crearVista, actualizarVista,
 *           eliminarVista, vistaDefault }
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../firebase';
import {
  collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc,
  query, where, addDoc,
} from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import type { VistaUsuario, ModuloVista } from '../components/table/VistasData';
import { crearVistaVacia } from '../components/table/VistasData';
import type { ColumnaVista } from '../components/table/SpreadsheetTable';
import { conAviso } from '../lib/erroresEscritura';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';

const COL = 'vistasUsuario';

export function useVistasUsuario(modulo: ModuloVista) {
  const { user } = useAuth();

  const [vistas, setVistas] = useState<VistaUsuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs para merge de las dos queries
  const mapMias = useRef<Map<string, VistaUsuario>>(new Map());
  const mapCompartidas = useRef<Map<string, VistaUsuario>>(new Map());
  const readyMias = useRef(false);
  const readyCompartidas = useRef(false);

  const merge = useCallback(() => {
    const combined = new Map<string, VistaUsuario>();
    for (const [id, v] of mapMias.current) combined.set(id, v);
    for (const [id, v] of mapCompartidas.current) combined.set(id, v);
    const arr = Array.from(combined.values());
    arr.sort((a, b) => a.nombre.localeCompare(b.nombre));
    setVistas(arr);
    if (readyMias.current && readyCompartidas.current) setLoading(false);
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const col = collection(db, COL);

    // Query A: mis vistas para este módulo
    const qMias = query(col,
      where('usuarioId', '==', user.uid),
      where('modulo', '==', modulo),
    );

    // Query B: vistas compartidas para este módulo
    const qCompartidas = query(col,
      where('compartida', '==', true),
      where('modulo', '==', modulo),
    );

    const unsubMias = onSnapshot(qMias, snap => {
      mapMias.current.clear();
      snap.forEach(d => {
        mapMias.current.set(d.id, { id: d.id, ...d.data() } as VistaUsuario);
      });
      readyMias.current = true;
      merge();
    }, err => {
      setError(err.message);
      setLoading(false);
    });

    const unsubCompartidas = onSnapshot(qCompartidas, snap => {
      mapCompartidas.current.clear();
      snap.forEach(d => {
        mapCompartidas.current.set(d.id, { id: d.id, ...d.data() } as VistaUsuario);
      });
      readyCompartidas.current = true;
      merge();
    }, err => {
      setError(err.message);
      setLoading(false);
    });

    return () => {
      unsubMias();
      unsubCompartidas();
      mapMias.current.clear();
      mapCompartidas.current.clear();
      readyMias.current = false;
      readyCompartidas.current = false;
    };
  }, [user?.uid, modulo, merge]);

  // ── Writes ────────────────────────────────────────────────────────────

  const crearVista = useCallback(async (
    nombre: string,
    columnas: ColumnaVista[],
    opts?: { compartida?: boolean; esDefault?: boolean; filtros?: Record<string, string | null> },
  ): Promise<string> => {
    if (!user?.uid) throw new Error('No autenticado');

    const data = crearVistaVacia(modulo, user.uid, user.nombre, nombre, columnas);
    if (opts?.filtros) data.filtros = opts.filtros;
    if (opts?.compartida) data.compartida = true;
    if (opts?.esDefault) data.esDefault = true;

    // Si se marca como default, desmarcar las otras del mismo usuario+módulo
    if (data.esDefault) {
      await desmarcarDefaults();
    }

    const ref = await conAviso('la vista', () => addDoc(collection(db, COL), sanitizarParaFirestore(data)));
    return ref.id;
  }, [user, modulo]);

  const actualizarVista = useCallback(async (
    id: string,
    cambios: Partial<Pick<VistaUsuario, 'nombre' | 'columnas' | 'ordenamiento' | 'compartida' | 'esDefault' | 'filtros'>>,
  ) => {
    if (!user?.uid) throw new Error('No autenticado');

    // Verificar que el usuario es el creador
    const vista = vistas.find(v => v.id === id);
    if (vista && vista.usuarioId !== user.uid) {
      throw new Error('Solo el creador puede editar esta vista');
    }

    // Si se marca como default, desmarcar las otras
    if (cambios.esDefault) {
      await desmarcarDefaults();
    }

    await conAviso('la vista', () => updateDoc(doc(db, COL, id), sanitizarParaFirestore({
      ...cambios,
      updatedAt: new Date().toISOString(),
    }) as Record<string, unknown>));
  }, [user, vistas]);

  const eliminarVista = useCallback(async (id: string) => {
    if (!user?.uid) throw new Error('No autenticado');

    // Verificar que el usuario es el creador
    const vista = vistas.find(v => v.id === id);
    if (vista && vista.usuarioId !== user.uid) {
      throw new Error('Solo el creador puede eliminar esta vista');
    }

    await conAviso('la vista', () => deleteDoc(doc(db, COL, id)));
  }, [user, vistas]);

  // ── Helpers internos ──────────────────────────────────────────────────

  /** Desmarca esDefault de todas las vistas del mismo usuario+módulo. */
  const desmarcarDefaults = useCallback(async () => {
    const defaults = vistas.filter(
      v => v.esDefault && v.usuarioId === user?.uid,
    );
    await Promise.all(
      defaults.map(v => conAviso('la vista por defecto', () => updateDoc(doc(db, COL, v.id), sanitizarParaFirestore({ esDefault: false }) as Record<string, unknown>))),
    );
  }, [vistas, user]);

  // ── Vista default del usuario ─────────────────────────────────────────

  const vistaDefault = vistas.find(
    v => v.esDefault && v.usuarioId === user?.uid,
  ) ?? null;

  return {
    vistas,
    loading,
    error,
    crearVista,
    actualizarVista,
    eliminarVista,
    vistaDefault,
  };
}
