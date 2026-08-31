/**
 * useContadoresSerie.ts
 *
 * Lee y siembra los consecutivos de folio de cada serie de embarque.
 *
 * ── Por qué hace falta sembrarlos ──────────────────────────────────────────
 * Vermur trae folios históricos de Magaya: los ejemplos reales muestran
 * VLIT-24-107 y VLIA-24-020, o sea que cada serie ya iba por un número. Un
 * contador que arranca en 0 generaría VLIT-26-001 y duplicaría un folio que ya
 * existe en papel.
 *
 * Sembrar es fijar el último consecutivo usado en Magaya. A partir de ahí el
 * sistema continúa la serie.
 */

import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc, collection } from 'firebase/firestore';
import { SERIES_EMBARQUE, EstadoContadorSerie } from '../lib/folioService';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { conAviso } from '../lib/erroresEscritura';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';

export function useContadoresSerie() {
  const { user } = useAuth();
  const [contadores, setContadores] = useState<EstadoContadorSerie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const unsub = onSnapshot(collection(db, 'contadores'), (snap) => {
      const porSerie = new Map<string, EstadoContadorSerie>();
      snap.forEach(d => {
        if (!d.id.startsWith('embarques_')) return;
        const serie = d.id.replace('embarques_', '');
        const data = d.data();
        porSerie.set(serie, {
          serie,
          ultimo: (data.ultimo as number) ?? 0,
          sembrado: (data.sembrado as boolean) ?? false,
          fechaSiembra: data.fechaSiembra as string | undefined,
          sembradoPor: data.sembradoPor as string | undefined,
        });
      });

      // Las series que aún no tienen documento se muestran en cero, para que
      // se vea qué falta sembrar en vez de que simplemente no aparezcan.
      setContadores(SERIES_EMBARQUE.map(serie =>
        porSerie.get(serie) ?? { serie, ultimo: 0, sembrado: false },
      ));
      setLoading(false);
    }, () => setLoading(false));

    return () => unsub();
  }, [user]);

  /**
   * Fija el consecutivo de una serie.
   *
   * Solo Admin: es mantenimiento, no una función del negocio, igual que la
   * importación masiva de catálogos.
   */
  const sembrarContador = async (serie: string, ultimo: number): Promise<void> => {
    exigir(user?.rol as UserRole | undefined, 'catalogo.importarMasivo');
    if (!Number.isInteger(ultimo) || ultimo < 0) {
      throw new Error('El consecutivo debe ser un entero mayor o igual a cero.');
    }
    await conAviso('el consecutivo de folio', () => setDoc(doc(db, 'contadores', `embarques_${serie}`), sanitizarParaFirestore({
      ultimo,
      sembrado: true,
      fechaSiembra: new Date().toISOString(),
      sembradoPor: user?.email ?? '',
    }), { merge: true }));
  };

  return { contadores, loading, sembrarContador };
}
