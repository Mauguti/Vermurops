/**
 * useTipoCambio.ts — lee `configuracion/tipoCambio` en tiempo real.
 *
 * Usa onSnapshot para que el módulo de Tipo de cambio y CapturaTipoCambio
 * reflejen el valor tan pronto como la Function lo actualice.
 *
 * El historial (`tiposCambio/{YYYY-MM-DD}`) se lee aparte, bajo demanda,
 * porque no necesita ser reactivo.
 */

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, collection, getDocs, orderBy, limit, query } from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { ConfigTipoCambio, RegistroTipoCambio } from '../lib/tipoCambioBanxico';

interface Estado {
  config: ConfigTipoCambio | null;
  cargando: boolean;
  error: string | null;
}

export function useTipoCambioActual() {
  const [estado, setEstado] = useState<Estado>({
    config: null,
    cargando: true,
    error: null,
  });

  useEffect(() => {
    const ref = doc(db, 'configuracion', 'tipoCambio');
    const unsub = onSnapshot(
      ref,
      snap => {
        if (snap.exists()) {
          setEstado({
            config: snap.data() as ConfigTipoCambio,
            cargando: false,
            error: null,
          });
        } else {
          setEstado({ config: null, cargando: false, error: null });
        }
      },
      err => {
        setEstado(prev => ({
          ...prev,
          cargando: false,
          error: `No se pudo leer el tipo de cambio: ${err.message}`,
        }));
      },
    );
    return unsub;
  }, []);

  return estado;
}

// ── Historial ───────────────────────────────────────────────────────────────

export function useHistorialTipoCambio(cantidad = 30) {
  const [registros, setRegistros] = useState<RegistroTipoCambio[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'tiposCambio'),
      orderBy('fechaDeterminacion', 'desc'),
      limit(cantidad),
    );
    getDocs(q)
      .then(snap => {
        setRegistros(snap.docs.map(d => d.data() as RegistroTipoCambio));
        setCargando(false);
      })
      .catch(() => setCargando(false));
  }, [cantidad]);

  return { registros, cargando };
}

// ── Actualizar ahora ────────────────────────────────────────────────────────

export function useActualizarTipoCambio() {
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actualizar = useCallback(async () => {
    setActualizando(true);
    setError(null);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Sin sesión.');

      const token = await user.getIdToken();
      const baseUrl = import.meta.env.VITE_USAR_EMULADORES === '1'
        ? 'http://127.0.0.1:5001/vermur-logistics-app/us-central1'
        : 'https://us-central1-vermur-logistics-app.cloudfunctions.net';

      const resp = await fetch(`${baseUrl}/actualizarTipoCambio`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const datos = await resp.json();
      if (!datos.ok) {
        setError(datos.mensaje ?? datos.error ?? 'Error al actualizar.');
      }
    } catch (err) {
      setError(`No se pudo contactar al servidor: ${(err as Error).message}`);
    } finally {
      setActualizando(false);
    }
  }, []);

  return { actualizar, actualizando, error };
}
