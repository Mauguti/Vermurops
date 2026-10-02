/**
 * useConfiguracionEmpresa.ts — lee y guarda `configuracion/empresa` de Firestore.
 *
 * Si el documento no existe, devuelve los defaults de las plantillas de Vermur
 * sin crear el documento (no tocar producción solo por abrir la pantalla).
 * El primer guardado lo crea.
 */

import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { EMPRESA_DEFAULT, type ConfiguracionEmpresa } from '../lib/documentosOperativos';

interface Estado {
  datos: ConfiguracionEmpresa;
  cargando: boolean;
  error: string | null;
  guardando: boolean;
  existeEnFirestore: boolean;
}

export function useConfiguracionEmpresa() {
  const [estado, setEstado] = useState<Estado>({
    datos: { ...EMPRESA_DEFAULT },
    cargando: true,
    error: null,
    guardando: false,
    existeEnFirestore: false,
  });

  useEffect(() => {
    let cancelado = false;
    const ref = doc(db, 'configuracion', 'empresa');
    getDoc(ref)
      .then(snap => {
        if (cancelado) return;
        if (snap.exists()) {
          const data = snap.data() as Partial<ConfiguracionEmpresa>;
          setEstado(prev => ({
            ...prev,
            datos: { ...EMPRESA_DEFAULT, ...data },
            cargando: false,
            existeEnFirestore: true,
          }));
        } else {
          setEstado(prev => ({
            ...prev,
            datos: { ...EMPRESA_DEFAULT },
            cargando: false,
            existeEnFirestore: false,
          }));
        }
      })
      .catch(err => {
        if (cancelado) return;
        setEstado(prev => ({
          ...prev,
          cargando: false,
          error: `No se pudo leer la configuración: ${(err as Error).message}`,
        }));
      });
    return () => { cancelado = true; };
  }, []);

  const guardar = useCallback(async (datos: ConfiguracionEmpresa, uid: string) => {
    setEstado(prev => ({ ...prev, guardando: true, error: null }));
    try {
      const ref = doc(db, 'configuracion', 'empresa');
      const payload: ConfiguracionEmpresa = {
        ...datos,
        updatedAt: new Date().toISOString(),
        updatedBy: uid,
      };
      await setDoc(ref, payload, { merge: true });
      setEstado(prev => ({
        ...prev,
        datos: payload,
        guardando: false,
        existeEnFirestore: true,
      }));
      return { ok: true as const };
    } catch (err) {
      const mensaje = `Error al guardar: ${(err as Error).message}`;
      setEstado(prev => ({ ...prev, guardando: false, error: mensaje }));
      return { ok: false as const, error: mensaje };
    }
  }, []);

  return { ...estado, guardar };
}
