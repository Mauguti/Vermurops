/**
 * folioService.ts
 *
 * Generador atómico de folios para cotizaciones VermurOps.
 * Usa un documento contador en Firestore (contadores/cotizaciones)
 * y runTransaction para garantizar unicidad incluso con escrituras concurrentes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  PLACEHOLDER — formato y número inicial SIN VERIFICAR contra Magaya real
 *     de Vermur. Ajustar FOLIO_CONFIG antes de producción.
 *     Ver: docs/integracion-luis/PENDIENTES.md  §  "Formato de folio Magaya"
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from '../firebase';
import { doc, runTransaction } from 'firebase/firestore';

// ─── Configuración del folio ──────────────────────────────────────────────────
//
// Cada campo es independiente: cambiar prefijo, padding, separador o inicial
// NO requiere tocar ninguna otra lógica.
//
export const FOLIO_CONFIG = {
  // ⚠️ PLACEHOLDER — verificar contra Magaya real de Vermur
  prefijo: 'COT',

  // ⚠️ PLACEHOLDER — confirmar si Magaya incluye año en el folio
  // true  → "COT-2026-0001"   (año dinámico = new Date().getFullYear())
  // false → "COT-0001"
  incluirAnio: true,

  // Separador entre segmentos del folio (ej. '-', '/', '')
  separador: '-',

  // Cantidad de dígitos del número (padding con ceros a la izquierda)
  // ⚠️ PLACEHOLDER — verificar contra Magaya real de Vermur
  padding: 4,

  // Número desde el cual parte el contador si el doc contador no existe todavía.
  // ⚠️ REEMPLAZAR con (último folio Magaya de Vermur) + 1 antes de producción.
  inicial: 1,
} as const;

// ─── Ruta del documento contador en Firestore ────────────────────────────────
const COUNTER_DOC = doc(db, 'contadores', 'cotizaciones');

// ─── Formatea un número entero como folio string ─────────────────────────────
export function formatFolio(n: number): string {
  const num = String(n).padStart(FOLIO_CONFIG.padding, '0');
  if (FOLIO_CONFIG.incluirAnio) {
    const anio = new Date().getFullYear();
    return `${FOLIO_CONFIG.prefijo}${FOLIO_CONFIG.separador}${anio}${FOLIO_CONFIG.separador}${num}`;
  }
  return `${FOLIO_CONFIG.prefijo}${FOLIO_CONFIG.separador}${num}`;
}

// ─── Extrae el número entero de un folio string ──────────────────────────────
// Tolerante al prefijo y al año: toma el último segmento numérico del string.
// Ej: "COT-2026-0007" → 7,  "VRM-042" → 42,  "COT-0042" → 42
export function parseFolioNumero(folio: string): number {
  const segmentos = folio.split(/[-_/]/);
  // El número es el último segmento que sea un entero puro
  for (let i = segmentos.length - 1; i >= 0; i--) {
    const n = parseInt(segmentos[i], 10);
    if (!isNaN(n) && String(parseInt(segmentos[i], 10)) === String(n)) {
      return n;
    }
  }
  return 0;
}

// ─── Generador atómico ───────────────────────────────────────────────────────
// Usa runTransaction: lee ultimo, incrementa, escribe — todo en una transacción.
// Garantiza unicidad incluso con N usuarios creando cotizaciones simultáneamente.
export async function generateFolio(): Promise<string> {
  const siguiente = await runTransaction(db, async (tx) => {
    const snap = await tx.get(COUNTER_DOC);
    const next = (snap.exists() ? (snap.data().ultimo as number) : FOLIO_CONFIG.inicial - 1) + 1;
    tx.set(COUNTER_DOC, { ultimo: next }, { merge: true });
    return next;
  });
  return formatFolio(siguiente);
}

// ─── Inicializa el contador desde un array de folios existentes ──────────────
// Llamado durante el seed inicial: recibe los folios del mock, encuentra el
// mayor, y escribe ese valor en contadores/cotizaciones para que generateFolio()
// continúe desde ahí sin colisionar con el seed.
// Si el doc contador ya existe y tiene un valor mayor, NO lo sobreescribe.
export async function initContadorDesdeFolios(folios: string[]): Promise<void> {
  const maxExistente = folios.reduce((max, f) => {
    const n = parseFolioNumero(f);
    return n > max ? n : max;
  }, 0);
  if (maxExistente === 0) return;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(COUNTER_DOC);
    const actual = snap.exists() ? (snap.data().ultimo as number) : 0;
    if (maxExistente > actual) {
      tx.set(COUNTER_DOC, { ultimo: maxExistente }, { merge: true });
    }
  });
}
