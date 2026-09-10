/**
 * usePreferenciasUsuario.ts
 *
 * Preferencias de pantalla POR USUARIO, en Firestore: `preferenciasUsuario/{uid}`.
 *
 * Igual que las vistas guardables: lo que uno elige se queda, en cualquier
 * navegador. La primera preferencia es cómo ver los cargos —por proveedor o
 * por concepto (3.3)—; las que vengan se agregan como llaves nuevas.
 *
 * Optimista: el cambio se ve al instante y se escribe atrás. Si Firestore
 * lo rechaza, se avisa (conAviso) y el listener lo regresa a lo guardado.
 */

import { useCallback, useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import { conAviso } from '../lib/erroresEscritura';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';

export interface PreferenciasUsuario {
  /** Cómo ver los cargos de la cotización y del embarque. */
  vistaCargos?: 'proveedor' | 'concepto';
}

const COL = 'preferenciasUsuario';

export function usePreferenciasUsuario() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<PreferenciasUsuario>({});
  const [cargadas, setCargadas] = useState(false);

  useEffect(() => {
    if (!user?.uid) { setPrefs({}); setCargadas(true); return; }
    const unsub = onSnapshot(
      doc(db, COL, user.uid),
      snap => { setPrefs((snap.data() as PreferenciasUsuario | undefined) ?? {}); setCargadas(true); },
      () => setCargadas(true), // sin la regla publicada se sigue con los defaults
    );
    return () => unsub();
  }, [user?.uid]);

  const guardar = useCallback(async <K extends keyof PreferenciasUsuario>(llave: K, valor: PreferenciasUsuario[K]) => {
    setPrefs(p => ({ ...p, [llave]: valor }));
    if (!user?.uid) return;
    await conAviso('la preferencia', () => setDoc(
      doc(db, COL, user.uid!),
      sanitizarParaFirestore({ [llave]: valor, usuarioId: user.uid, updatedAt: new Date().toISOString() }),
      { merge: true },
    ));
  }, [user?.uid]);

  return { prefs, cargadas, guardar };
}
