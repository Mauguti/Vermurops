/**
 * usePagos.ts (PLAN-PAGOS §1.1 · paso P2)
 *
 * La colección `pagos/`: un documento por movimiento real de dinero, con sus
 * aplicaciones dentro. Este hook es la única puerta de escritura.
 *
 * ── Qué NO hace ───────────────────────────────────────────────────────────
 * No lee ni escribe `cobros/` ni `depositosCliente/`. Lo viejo lo siguen
 * leyendo `useFacturas` y `useDepositosCliente`, y los adaptadores de
 * `lib/pagos.ts` lo convierten a esta misma forma. Un movimiento vive en
 * `pagos` **o** en lo viejo, nunca en los dos: esa es toda la defensa contra
 * el doble conteo, y es la razón para no migrar nada.
 *
 * ── La regla de Firestore ─────────────────────────────────────────────────
 * ⚠️ `pagos/` necesita su bloque publicado en `firestore.rules`. Mientras no
 * esté, el listener falla con «permission denied» —la lista queda vacía, que
 * es lo correcto: no hay pagos— y la escritura falla con un aviso visible.
 * No hay respaldo a la colección vieja a propósito: un cobro que se guarda
 * «en otro lado» cuando el nuevo falla es exactamente el guardado a medias
 * que el §6 del CLAUDE.md pone peor que no guardar.
 */

import { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { collection, doc, onSnapshot, setDoc, updateDoc, query, orderBy } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { conAviso } from '../lib/erroresEscritura';
import { idUnico } from '../lib/idUnico';
import { generateFolioPago } from '../lib/folioServicePago';
import type { ContextoPago, Pago } from '../lib/pagos';

const COL = 'pagos';

export function usePagos(embarqueId?: string) {
  const { user } = useAuth();
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const unsub = onSnapshot(
      query(collection(db, COL), orderBy('fecha', 'desc')),
      snap => {
        const data: Pago[] = [];
        snap.forEach(d => data.push({ id: d.id, ...d.data() } as Pago));
        /*
         * El embarque filtra por `embarqueIds`, no por un `embarqueId`
         * suelto: un pago puede tocar varios, y es justo el caso que
         * `CobroCliente` no podía representar (§1.4).
         */
        setPagos(embarqueId ? data.filter(p => (p.embarqueIds ?? []).includes(embarqueId)) : data);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [user, embarqueId]);

  /**
   * El contexto de un pago nuevo: id, folio reservado, quién y cuándo.
   *
   * El folio se reserva ANTES de armar el documento porque es una
   * transacción aparte: si falla, no se escribe un pago sin folio.
   */
  const contextoNuevo = useCallback(async (): Promise<ContextoPago> => ({
    id: idUnico('PAG'),
    folio: await conAviso('el folio del pago', () => generateFolioPago()),
    por: { uid: user?.uid ?? '', nombre: user?.nombre ?? user?.email ?? '' },
    ahora: new Date().toISOString(),
  }), [user]);

  /**
   * Escribe el pago. Quien lo arma es `lib/pagos.ts`; aquí solo se guarda.
   *
   * Un `permission-denied` se traduce: el mensaje genérico es «No tienes
   * permiso para guardar este cambio», y quien lo lea va a pensar que es su
   * rol. No lo es —`pagos/` nace con `esDelEquipo()`, igual que `cobros/`—,
   * es que la regla puede no estar publicada todavía. Es la lección del
   * SMTP AUTH de §4.29: un fallo genérico manda a arreglar lo que está bien.
   */
  const guardarPago = useCallback(async (pago: Pago): Promise<Pago> => {
    // La traducción va DENTRO de conAviso: si se envolviera por fuera, el
    // aviso que ve el usuario sería el genérico y solo el throw sería claro.
    await conAviso('el pago', async () => {
      try {
        return await setDoc(doc(db, COL, pago.id), sanitizarParaFirestore(pago));
      } catch (err) {
        if ((err as { code?: string })?.code === 'permission-denied') {
          throw new Error(
            'Firestore rechazó la escritura en «pagos». Si es la primera vez que ' +
            'pasa, esa colección todavía no tiene su regla publicada: avisa a ' +
            'quien administra la plataforma. No es tu rol.',
          );
        }
        throw err;
      }
    });
    return pago;
  }, []);

  /**
   * Anula un pago. No se borra: un movimiento de dinero existió, y lo
   * aplicado desaparece solo porque se DERIVA de las aplicaciones vivas
   * (§1.5), igual que ya hace `disponibleDeAnticipo`.
   */
  const anularPago = useCallback(async (id: string): Promise<void> => {
    await conAviso('el pago', () =>
      updateDoc(doc(db, COL, id), sanitizarParaFirestore({
        activo: false, updatedAt: new Date().toISOString(),
      }) as Record<string, unknown>));
  }, []);

  return { pagos, loading, contextoNuevo, guardarPago, anularPago };
}
