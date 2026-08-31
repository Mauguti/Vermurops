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

// ─── Folios de prospectos (PRO-2026-XXXX) ────────────────────────────────────
//
// Contador propio para no compartir secuencia con las cotizaciones: un
// prospecto y una cotización son entidades distintas y el cliente los numera
// por separado. Mismo mecanismo transaccional.
//
const COUNTER_DOC_PROSPECTOS = doc(db, 'contadores', 'prospectos');

export function formatFolioProspecto(n: number): string {
  const num = String(n).padStart(FOLIO_CONFIG.padding, '0');
  const anio = new Date().getFullYear();
  return `PRO${FOLIO_CONFIG.separador}${anio}${FOLIO_CONFIG.separador}${num}`;
}

export async function generateFolioProspecto(): Promise<string> {
  const siguiente = await runTransaction(db, async (tx) => {
    const snap = await tx.get(COUNTER_DOC_PROSPECTOS);
    const next = (snap.exists() ? (snap.data().ultimo as number) : 0) + 1;
    tx.set(COUNTER_DOC_PROSPECTOS, { ultimo: next }, { merge: true });
    return next;
  });
  return formatFolioProspecto(siguiente);
}

// ─── Folios de embarques (SHP-2026-XXXX) ─────────────────────────────────────
//
// Antes los ids se derivaban de `embarques.length + 1`, tanto al crear un
// embarque como al crear un HBL hijo. Mientras la lista vivía en memoria eso
// solo duplicaba una fila; con los embarques en Firestore, un id repetido
// SOBRESCRIBE un documento real. De ahí el contador transaccional.
//
const COUNTER_DOC_EMBARQUES = doc(db, 'contadores', 'embarques');

export function formatFolioEmbarque(n: number): string {
  const num = String(n).padStart(FOLIO_CONFIG.padding, '0');
  const anio = new Date().getFullYear();
  return `SHP${FOLIO_CONFIG.separador}${anio}${FOLIO_CONFIG.separador}${num}`;
}

export async function generateFolioEmbarque(): Promise<string> {
  const siguiente = await runTransaction(db, async (tx) => {
    const snap = await tx.get(COUNTER_DOC_EMBARQUES);
    const next = (snap.exists() ? (snap.data().ultimo as number) : 0) + 1;
    tx.set(COUNTER_DOC_EMBARQUES, { ultimo: next }, { merge: true });
    return next;
  });
  return formatFolioEmbarque(siguiente);
}

// ─── Folios por serie de embarque ─────────────────────────────────────────────
//
// Cada serie lleva su propio consecutivo. Los embarques reales de Magaya lo
// confirman: VLIT-24-107 y VLIA-24-020 conviven con números muy distintos, o
// sea que terrestre y aéreo numeran aparte. Coincide con el levantamiento:
// «VL + tipo + año + consecutivo de tres dígitos», con las carpetas
// organizadas por año/modalidad/mes.
//
// Formato: PREFIJO-YY-NNN  →  VLIT-26-001
//
const PADDING_EMBARQUE = 3;

export function formatFolioSerie(prefijo: string, n: number, anio = new Date().getFullYear()): string {
  const yy = String(anio).slice(-2);
  return `${prefijo}-${yy}-${String(n).padStart(PADDING_EMBARQUE, '0')}`;
}

/** Documento contador de una serie. Uno por prefijo: contadores/embarques_VLIM. */
export function docContadorSerie(prefijo: string) {
  return doc(db, 'contadores', `embarques_${prefijo}`);
}

/** Series de embarque que el sistema conoce. */
export const SERIES_EMBARQUE = ['VLIM', 'VLEM', 'VLIT', 'VLET', 'VLIA', 'VLEA', 'VL'] as const;
export type SerieEmbarque = typeof SERIES_EMBARQUE[number];

export interface EstadoContadorSerie {
  serie: string;
  ultimo: number;
  /**
   * true si alguien fijó el consecutivo a mano desde Configuración.
   *
   * Importa porque Vermur trae folios históricos de Magaya: VLIT iba en 107.
   * Un contador sin sembrar arranca en 0 y su primer folio sería VLIT-26-001,
   * que puede colisionar con uno que ya existe en papel.
   */
  sembrado: boolean;
  fechaSiembra?: string;
  sembradoPor?: string;
}

export interface ResultadoReserva {
  folios: string[];
  /** false = el contador nunca se sembró; el folio puede colisionar. */
  sembrado: boolean;
}

/**
 * Reserva N folios consecutivos de una serie en una sola transacción.
 *
 * Pensado para llamarse DENTRO de un runTransaction mayor —el que crea la
 * cotización ganada y sus N embarques—, por eso recibe la transacción en vez
 * de abrir la suya: todo tiene que caer junto o no caer.
 *
 * Devuelve también si el contador estaba sembrado. Un contador vacío NO
 * bloquea la generación —una cotización ganada no puede quedarse sin
 * embarque—, pero el embarque nace con la advertencia correspondiente.
 */
export async function reservarFoliosSerie(
  tx: { get: (ref: ReturnType<typeof docContadorSerie>) => Promise<{ exists: () => boolean; data: () => Record<string, unknown> | undefined }>;
        set: (ref: ReturnType<typeof docContadorSerie>, data: Record<string, unknown>, opts?: { merge: boolean }) => unknown },
  prefijo: string,
  cuantos: number,
  anio = new Date().getFullYear(),
): Promise<ResultadoReserva> {
  if (cuantos <= 0) return { folios: [], sembrado: true };

  const ref = docContadorSerie(prefijo);
  const snap = await tx.get(ref);
  const data = snap.exists() ? snap.data() : undefined;

  const ultimo = (data?.ultimo as number) ?? 0;
  const sembrado = (data?.sembrado as boolean) ?? false;

  const folios: string[] = [];
  for (let i = 1; i <= cuantos; i++) {
    folios.push(formatFolioSerie(prefijo, ultimo + i, anio));
  }

  // merge: true conserva `sembrado` y los datos de auditoría de la siembra.
  tx.set(ref, { ultimo: ultimo + cuantos }, { merge: true });
  return { folios, sembrado };
}

/**
 * Reserva folios de VARIAS series en una sola transacción.
 *
 * Firestore exige que TODAS las lecturas de una transacción ocurran antes de
 * la primera escritura. `reservarFoliosSerie` hace get y set juntos, así que
 * llamarla dos veces seguidas —una cotización marítima con un terrestre que se
 * opera aparte— revienta la transacción entera con «Firestore transactions
 * require all reads to be executed before all writes».
 *
 * Aquí se leen todos los contadores primero y se escriben después. El orden de
 * los folios devueltos respeta el orden de los pedidos.
 */
export async function reservarFoliosMultiSerie(
  tx: { get: (ref: ReturnType<typeof docContadorSerie>) => Promise<{ exists: () => boolean; data: () => Record<string, unknown> | undefined }>;
        set: (ref: ReturnType<typeof docContadorSerie>, data: Record<string, unknown>, opts?: { merge: boolean }) => unknown },
  pedidos: { prefijo: string; cuantos: number }[],
  anio = new Date().getFullYear(),
): Promise<Map<string, ResultadoReserva>> {
  const resultado = new Map<string, ResultadoReserva>();

  // Varios grupos pueden caer en la misma serie (dos terrestres de importación
  // que se operan aparte). Se consolidan para leer el contador una sola vez.
  const totalPorPrefijo = new Map<string, number>();
  pedidos.forEach(p => {
    if (p.cuantos <= 0) return;
    totalPorPrefijo.set(p.prefijo, (totalPorPrefijo.get(p.prefijo) ?? 0) + p.cuantos);
  });

  // ── Fase 1: todas las lecturas ────────────────────────────────────────────
  const estado = new Map<string, { ultimo: number; sembrado: boolean }>();
  for (const prefijo of totalPorPrefijo.keys()) {
    const snap = await tx.get(docContadorSerie(prefijo));
    const data = snap.exists() ? snap.data() : undefined;
    estado.set(prefijo, {
      ultimo: (data?.ultimo as number) ?? 0,
      sembrado: (data?.sembrado as boolean) ?? false,
    });
  }

  // ── Fase 2: asignación en memoria ─────────────────────────────────────────
  const cursor = new Map<string, number>();
  pedidos.forEach(({ prefijo, cuantos }) => {
    const est = estado.get(prefijo);
    if (!est || cuantos <= 0) {
      resultado.set(prefijo, { folios: [], sembrado: est?.sembrado ?? true });
      return;
    }
    const desde = cursor.get(prefijo) ?? est.ultimo;
    const folios: string[] = [];
    for (let i = 1; i <= cuantos; i++) folios.push(formatFolioSerie(prefijo, desde + i, anio));
    cursor.set(prefijo, desde + cuantos);

    const previo = resultado.get(prefijo);
    resultado.set(prefijo, {
      folios: [...(previo?.folios ?? []), ...folios],
      sembrado: est.sembrado,
    });
  });

  // ── Fase 3: todas las escrituras ──────────────────────────────────────────
  cursor.forEach((ultimo, prefijo) => {
    tx.set(docContadorSerie(prefijo), { ultimo }, { merge: true });
  });

  return resultado;
}
