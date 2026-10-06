/**
 * folioServicePago.ts
 *
 * Generador atómico de folios para PAGOS (PLAN-PAGOS §1.1: «PAG-2026-0001.
 * Folio atómico con folioService, como la OC»).
 *
 * Mismo patrón que `folioServiceOC.ts`, con prefijo «PAG» y su propio
 * documento contador: `contadores/pagos`.
 *
 * ── Por qué atómico y no `idUnico` ─────────────────────────────────────────
 * El id del documento sí sale de `idUnico` —no necesita ser legible—, pero el
 * FOLIO es lo que se le dice al proveedor y lo que Julio busca al conciliar.
 * Dos personas registrando un pago al mismo tiempo con un contador leído y
 * escrito aparte producirían dos «PAG-2026-0007», y a partir de ahí
 * «el pago 7» deja de identificar un pago.
 *
 * ── El contador NO reinicia en enero ──────────────────────────────────────
 * Es la misma decisión que los folios de embarque (§4.31): un entero que no
 * se toca al cambiar de año. 2026 cierra en PAG-2026-0120 y enero de 2027
 * abre en PAG-2027-0121. Si Vermur quiere reiniciar, se fija a cero a mano.
 */

import { db } from '../firebase';
import { doc, runTransaction } from 'firebase/firestore';

export const FOLIO_CONFIG_PAGO = {
  prefijo: 'PAG',
  separador: '-',
  padding: 4,
  inicial: 1,
} as const;

const COUNTER_DOC_PAGO = doc(db, 'contadores', 'pagos');

/** Formatea un entero como folio de pago. El año es el de la captura. */
export function formatFolioPago(n: number, anio = new Date().getFullYear()): string {
  const num = String(n).padStart(FOLIO_CONFIG_PAGO.padding, '0');
  const s = FOLIO_CONFIG_PAGO.separador;
  return `${FOLIO_CONFIG_PAGO.prefijo}${s}${anio}${s}${num}`;
}

/** Generador atómico. Una transacción: lee el contador y lo incrementa. */
export async function generateFolioPago(): Promise<string> {
  const siguiente = await runTransaction(db, async (tx) => {
    const snap = await tx.get(COUNTER_DOC_PAGO);
    const next = (snap.exists() ? (snap.data().ultimo as number) : FOLIO_CONFIG_PAGO.inicial - 1) + 1;
    tx.set(COUNTER_DOC_PAGO, { ultimo: next }, { merge: true });
    return next;
  });
  return formatFolioPago(siguiente);
}
