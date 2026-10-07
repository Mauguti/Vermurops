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

import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import { collection, doc, onSnapshot, setDoc, updateDoc, query, orderBy, arrayUnion } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { conAviso } from '../lib/erroresEscritura';
import { idUnico } from '../lib/idUnico';
import { crearTiendaCompartida } from '../lib/tiendaCompartida';
import { generateFolioPago } from '../lib/folioServicePago';
import type { AplicacionPago, AplicacionQuitada, ContextoPago, MotivoCorreccion, Pago } from '../lib/pagos';

const COL = 'pagos';

/*
 * Tarea 82 · UNA suscripción a `pagos/` para toda la app. `useFacturas`,
 * `useDepositosCliente` y `Finance` montan este hook a la vez; cada uno abría
 * su propio `onSnapshot` (tres lecturas de la colección). Ahora comparten una,
 * y cada hook filtra por embarque sobre la misma lista.
 */
const tiendaPagos = crearTiendaCompartida<Pago>((alDato, alError) =>
  onSnapshot(
    query(collection(db, COL), orderBy('fecha', 'desc')),
    snap => {
      const data: Pago[] = [];
      snap.forEach(d => data.push({ id: d.id, ...d.data() } as Pago));
      alDato(data);
    },
    () => alError(),
  ));

export function usePagos(embarqueId?: string) {
  const { user } = useAuth();
  const [todos, setTodos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    return tiendaPagos.suscribir(e => { setTodos(e.datos); setLoading(e.loading); });
  }, [user]);

  /*
   * El embarque filtra por `embarqueIds`, no por un `embarqueId` suelto: un
   * pago puede tocar varios, y es justo el caso que `CobroCliente` no podía
   * representar (§1.4).
   */
  const pagos = useMemo(
    () => (embarqueId ? todos.filter(p => (p.embarqueIds ?? []).includes(embarqueId)) : todos),
    [todos, embarqueId],
  );

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
  const anularPago = useCallback(async (id: string, anulacion?: MotivoCorreccion): Promise<void> => {
    await conAviso('el pago', () =>
      updateDoc(doc(db, COL, id), sanitizarParaFirestore({
        activo: false, updatedAt: new Date().toISOString(),
        // Tarea 79: el motivo viaja DENTRO del pago, no solo en la bitácora.
        ...(anulacion ? { anulacion } : {}),
      }) as Record<string, unknown>));
  }, []);

  /**
   * Tarea 72 · P5 · Cambia las aplicaciones de un pago (aplicar el saldo a
   * favor, o quitar una).
   *
   * `aplicaciones`, `destinoIds` y `embarqueIds` se escriben en la MISMA
   * operación (§1.1): el índice con el que se consulta «pagos de esta
   * factura» no puede quedar apuntando a lo que ya no está. Quien arma el
   * patch es `lib/reversaPagos.ts`; aquí solo se guarda.
   */
  const actualizarAplicaciones = useCallback(async (
    id: string,
    patch: { aplicaciones: AplicacionPago[]; destinoIds: string[]; embarqueIds: string[] },
    quitadas: AplicacionQuitada[] = [],
  ): Promise<void> => {
    /* Tarea 79 · `arrayUnion`: dos correcciones a la vez no se pisan la lista
       de aplicaciones quitadas. */
    await conAviso('el pago', () =>
      updateDoc(doc(db, COL, id), {
        ...(sanitizarParaFirestore(patch) as Record<string, unknown>),
        ...(quitadas.length > 0
          ? { aplicacionesQuitadas: arrayUnion(...sanitizarParaFirestore(quitadas)) }
          : {}),
        updatedAt: new Date().toISOString(),
      }));
  }, []);

  return { pagos, loading, contextoNuevo, guardarPago, anularPago, actualizarAplicaciones };
}
