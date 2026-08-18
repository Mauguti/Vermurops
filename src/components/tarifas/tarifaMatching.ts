/**
 * tarifaMatching.ts — Funciones puras de matching y resolución de tarifas (FC-2)
 *
 * Extraídas de TarifaSuggestions para reutilizar en TarifaPanel
 * y mantener cobertura de tests existentes (re-exportadas desde TarifaSuggestions).
 */

import type { TarifaVermur, UnidadTarifa } from './TarifasData';

// ─── Normalización de texto ───────────────────────────────────────────────────

export const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// ─── Formato de precios ──────────────────────────────────────────────────────

const UNIDAD_SHORT: Record<UnidadTarifa, string> = {
  CONTENEDOR: 'cntr', CBM: 'm³', TON: 'ton', WM: 'W/M',
  PEDIMENTO: 'ped.', VIAJE: 'viaje', BL: 'B/L', FIJO: 'fijo', DIA: 'día',
};

export function fmtPrecio(t: TarifaVermur): string {
  const { monto, unidad, montoPor40, montoPor40HC } = t.precios;
  const sym = t.moneda;
  const f = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  if (unidad === 'CONTENEDOR') {
    let s = `$${f(monto)}/20'`;
    if (montoPor40) s += ` · $${f(montoPor40)}/40'`;
    if (montoPor40HC) s += ` · $${f(montoPor40HC)}/40'HC`;
    return `${s} ${sym}`;
  }
  return `$${f(monto)}/${UNIDAD_SHORT[unidad]} ${sym}`;
}

// ─── Resolución de monto por tipo de contenedor ──────────────────────────────

/**
 * Resuelve el monto correcto según el tipo de contenedor del servicio.
 *
 *  - 40' HC / 45' HC → montoPor40HC (fallback: montoPor40, monto)
 *  - 40' GP / 40' Reef → montoPor40 (fallback: monto)
 *  - 20' GP / 20' Reef / sin especificar → monto (precio base 20')
 *  - Unidades que no son CONTENEDOR → monto directo
 */
export function resolverMonto(tarifa: TarifaVermur, contenedorTipo?: string): number {
  if (tarifa.precios.unidad !== 'CONTENEDOR') return tarifa.precios.monto;
  if (!contenedorTipo) return tarifa.precios.monto;
  const t = contenedorTipo.toLowerCase();
  if (t.includes('40') && (t.includes('hc') || t.includes('h c'))) {
    return tarifa.precios.montoPor40HC ?? tarifa.precios.montoPor40 ?? tarifa.precios.monto;
  }
  if (t.includes('45') && t.includes('hc')) {
    return tarifa.precios.montoPor40HC ?? tarifa.precios.montoPor40 ?? tarifa.precios.monto;
  }
  if (t.includes('40')) {
    return tarifa.precios.montoPor40 ?? tarifa.precios.monto;
  }
  return tarifa.precios.monto;
}

/** Etiqueta corta del tamaño usado. */
export function etiquetaContenedor(contenedorTipo?: string): string {
  if (!contenedorTipo) return "20'";
  const t = contenedorTipo.toLowerCase();
  if (t.includes('45')) return "45'HC";
  if (t.includes('40') && (t.includes('hc') || t.includes('h c'))) return "40'HC";
  if (t.includes('40')) return "40'";
  return "20'";
}

// ─── Matching de concepto por nombre ─────────────────────────────────────────

export interface ConceptoMatch {
  id: string;
  nombre: string;
  categoria?: string;
}

/**
 * Busca el concepto que mejor coincida con el nombre dado.
 * Match exacto primero, luego parcial (includes bidireccional).
 */
export function matchConceptByName(
  conceptoNombre: string,
  conceptos: ConceptoMatch[],
): ConceptoMatch | null {
  const q = normalize(conceptoNombre);
  if (!q) return null;
  const exact = conceptos.find(c => normalize(c.nombre) === q);
  if (exact) return exact;
  return conceptos.find(c =>
    normalize(c.nombre).includes(q) || q.includes(normalize(c.nombre))
  ) ?? null;
}

// ─── Ruta de tarifa ──────────────────────────────────────────────────────────

export function buildTarifaRuta(
  t: TarifaVermur,
  puertoMap: Map<string, string>,
): string | null {
  if (t.puertoOrigenId || t.puertoDestinoId) {
    const o = t.puertoOrigenId ? puertoMap.get(t.puertoOrigenId) ?? '?' : '—';
    const d = t.puertoDestinoId ? puertoMap.get(t.puertoDestinoId) ?? '?' : '—';
    return `${o} → ${d}`;
  }
  return t.rutaTexto || null;
}

// ─── Maniobras: agrupación por terminal ──────────────────────────────────────

export interface TerminalGroupInfo {
  byTerminal: Map<string, TarifaVermur[]>;
  maxTerminalId: string;
}

/**
 * Agrupa tarifas por terminal y encuentra la terminal más cara.
 * Devuelve null si solo hay 0-1 terminales (no aplica la regla).
 */
export function groupManobrasByTerminal(vigentes: TarifaVermur[]): TerminalGroupInfo | null {
  if (vigentes.length === 0) return null;
  const byTerminal = new Map<string, TarifaVermur[]>();
  vigentes.forEach(t => {
    const key = t.terminalId || '_sin_terminal';
    const arr = byTerminal.get(key) || [];
    arr.push(t);
    byTerminal.set(key, arr);
  });
  if (byTerminal.size <= 1) return null;
  let maxMonto = 0;
  let maxTerminalId = '';
  byTerminal.forEach((tarifs, termId) => {
    const topMonto = Math.max(...tarifs.map(t => t.precios.monto));
    if (topMonto > maxMonto) { maxMonto = topMonto; maxTerminalId = termId; }
  });
  return { byTerminal, maxTerminalId };
}
