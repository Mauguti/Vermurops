/**
 * folioServiceOC.ts
 *
 * Generador atómico de folios para Órdenes de Compra.
 * Mismo patrón que folioService.ts (cotizaciones) pero con prefijo "OC"
 * y documento contador independiente: contadores/ordenesCompra.
 */

import { db } from '../firebase';
import { doc, runTransaction } from 'firebase/firestore';

// ─── Configuración del folio OC ─────────────────────────────────────────────

export const FOLIO_CONFIG_OC = {
  prefijo: 'OC',
  incluirAnio: true,
  separador: '-',
  padding: 4,
  inicial: 1,
} as const;

// ─── Ruta del documento contador en Firestore ───────────────────────────────
const COUNTER_DOC_OC = doc(db, 'contadores', 'ordenesCompra');

// ─── Formatea un número entero como folio OC ────────────────────────────────
export function formatFolioOC(n: number): string {
  const num = String(n).padStart(FOLIO_CONFIG_OC.padding, '0');
  if (FOLIO_CONFIG_OC.incluirAnio) {
    const anio = new Date().getFullYear();
    return `${FOLIO_CONFIG_OC.prefijo}${FOLIO_CONFIG_OC.separador}${anio}${FOLIO_CONFIG_OC.separador}${num}`;
  }
  return `${FOLIO_CONFIG_OC.prefijo}${FOLIO_CONFIG_OC.separador}${num}`;
}

// ─── Extrae el número entero de un folio OC ─────────────────────────────────
export function parseFolioOCNumero(folio: string): number {
  const segmentos = folio.split(/[-_/]/);
  for (let i = segmentos.length - 1; i >= 0; i--) {
    const n = parseInt(segmentos[i], 10);
    if (!isNaN(n) && String(parseInt(segmentos[i], 10)) === String(n)) {
      return n;
    }
  }
  return 0;
}

// ─── Generador atómico ─────────────────────────────────────────────────────
export async function generateFolioOC(): Promise<string> {
  const siguiente = await runTransaction(db, async (tx) => {
    const snap = await tx.get(COUNTER_DOC_OC);
    const next = (snap.exists() ? (snap.data().ultimo as number) : FOLIO_CONFIG_OC.inicial - 1) + 1;
    tx.set(COUNTER_DOC_OC, { ultimo: next }, { merge: true });
    return next;
  });
  return formatFolioOC(siguiente);
}

// ─── Inicializa el contador desde folios existentes ─────────────────────────
export async function initContadorOCDesdeFolios(folios: string[]): Promise<void> {
  const maxExistente = folios.reduce((max, f) => {
    const n = parseFolioOCNumero(f);
    return n > max ? n : max;
  }, 0);
  if (maxExistente === 0) return;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(COUNTER_DOC_OC);
    const actual = snap.exists() ? (snap.data().ultimo as number) : 0;
    if (maxExistente > actual) {
      tx.set(COUNTER_DOC_OC, { ultimo: maxExistente }, { merge: true });
    }
  });
}
