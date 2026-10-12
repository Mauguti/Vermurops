/**
 * pesoCobrable.ts (tarea 100, 9-oct-2026)
 *
 * Tarifas por kilo cobrable (chargeable weight): se cobra el MAYOR entre el
 * peso bruto y el volumétrico. Es dinero: la función no inventa. Si falta el
 * peso, el volumen o el factor, devuelve el motivo en vez de un total.
 *
 *   volumétrico = volumen m³ × factor (kg/m³)      aéreo: 167 por default (IATA 1:6000)
 *   cobrable    = max(bruto, volumétrico)          aéreo: hacia arriba al medio kilo
 *   precio/kg   = el de la escala con mayor `desdeKg` que no pase el cobrable;
 *                 sin escala que aplique, el `monto` de la tarifa
 *   total       = max(mínimo, cobrable × precio/kg)
 *
 * Terrestre NO tiene factor por default: lo captura Pricing en cada tarifa.
 *
 * Sin React, sin Firestore, sin red.
 */

import type { CargaSolicitada } from '../components/quotes/QuotesData';

/** Kg por m³ del estándar IATA (1 m³ = 167 kg, 1:6000). */
export const FACTOR_VOLUMETRICO_AEREO = 167;

export interface EscalaPeso {
  desdeKg: number;
  /** Precio por kg cobrable a partir de `desdeKg`. */
  monto: number;
}

/** Lo que la tarifa aporta. Un subconjunto de `PreciosTarifa`. */
export interface PreciosCobrable {
  monto: number;
  factorVolumetricoKgM3?: number;
  minimo?: number;
  /** Campo anterior al de la tarea 100; se lee como respaldo de `minimo`. */
  montoMinimo?: number;
  escalas?: EscalaPeso[];
}

/** Lo que la carga aporta. `null` = no se sabe (no es cero). */
export interface EntradaPeso {
  brutoKg: number | null;
  /** m³, si la carga lo trae. */
  volumenM3: number | null;
  /** Peso volumétrico ya capturado (aéreo). Si viene, se respeta. */
  pesoVolumetricoKg: number | null;
  aereo: boolean;
}

export type QuienGana = 'bruto' | 'volumetrico' | 'igual';

export interface CalculoCobrable {
  ok: true;
  brutoKg: number;
  volumetricoKg: number;
  /** De dónde salió el volumétrico: lo capturó Ventas o se calculó. */
  origenVolumetrico: 'capturado' | 'calculado';
  factor: number | null;
  /** El mayor de los dos, antes de redondear. */
  mayorKg: number;
  cobrableKg: number;
  gana: QuienGana;
  redondeado: boolean;
  precioKg: number;
  /** `desdeKg` de la escala aplicada; null = el monto base. */
  escalaDesdeKg: number | null;
  subtotal: number;
  minimo: number | null;
  minimoAplicado: boolean;
  total: number;
  /** La cuenta a la vista, en una línea. */
  formula: string;
}

export type ResultadoCobrable = CalculoCobrable | { ok: false; motivo: string };

const positivo = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Al medio kilo hacia arriba: 101.2 → 101.5, 101 → 101. El epsilon evita que 100.0000000001 suba. */
export function redondearMedioKilo(kg: number): number {
  return Math.ceil(kg * 2 - 1e-9) / 2;
}

const dos = (n: number) => Math.round(n * 100) / 100;

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Escala aplicable: la de mayor `desdeKg` que no pasa el cobrable. */
export function escalaAplicable(escalas: readonly EscalaPeso[] | undefined, cobrableKg: number): EscalaPeso | null {
  let elegida: EscalaPeso | null = null;
  for (const e of escalas ?? []) {
    if (!positivo(e.desdeKg) && e.desdeKg !== 0) continue;
    if (e.desdeKg <= cobrableKg && (!elegida || e.desdeKg > elegida.desdeKg)) elegida = e;
  }
  return elegida;
}

export function calcularPesoCobrable(entrada: EntradaPeso, precios: PreciosCobrable): ResultadoCobrable {
  if (!positivo(entrada.brutoKg)) {
    return { ok: false, motivo: 'La carga no trae peso bruto.' };
  }
  if (!positivo(precios.monto)) {
    return { ok: false, motivo: 'La tarifa no tiene precio por kg.' };
  }

  const factor = positivo(precios.factorVolumetricoKgM3)
    ? precios.factorVolumetricoKgM3
    : entrada.aereo ? FACTOR_VOLUMETRICO_AEREO : null;

  let volumetricoKg: number;
  let origenVolumetrico: 'capturado' | 'calculado';
  if (entrada.aereo && positivo(entrada.pesoVolumetricoKg)) {
    volumetricoKg = entrada.pesoVolumetricoKg;
    origenVolumetrico = 'capturado';
  } else {
    if (!positivo(entrada.volumenM3)) {
      return { ok: false, motivo: 'La carga no trae volumen: sin él no se sabe cuál peso se cobra.' };
    }
    if (factor === null) {
      return { ok: false, motivo: 'La tarifa no trae factor volumétrico (kg por m³) y esta modalidad no tiene uno por default.' };
    }
    volumetricoKg = entrada.volumenM3 * factor;
    origenVolumetrico = 'calculado';
  }

  const mayorKg = Math.max(entrada.brutoKg, volumetricoKg);
  const gana: QuienGana = entrada.brutoKg > volumetricoKg ? 'bruto' : volumetricoKg > entrada.brutoKg ? 'volumetrico' : 'igual';
  const cobrableKg = entrada.aereo ? redondearMedioKilo(mayorKg) : mayorKg;
  const redondeado = cobrableKg !== mayorKg;

  const escala = escalaAplicable(precios.escalas, cobrableKg);
  const precioKg = escala ? escala.monto : precios.monto;
  const subtotal = dos(cobrableKg * precioKg);
  const minimoBase = precios.minimo ?? precios.montoMinimo;
  const minimo = positivo(minimoBase) ? minimoBase : null;
  const minimoAplicado = minimo !== null && minimo > subtotal;
  const total = dos(minimoAplicado ? (minimo as number) : subtotal);

  const pesoTxt = gana === 'volumetrico'
    ? `${fmt(volumetricoKg)} kg volumétrico`
    : `${fmt(entrada.brutoKg)} kg bruto`;
  const formula = `${fmt(cobrableKg)} kg cobrable (${pesoTxt}${redondeado ? ', al medio kilo' : ''}) × ${fmt(precioKg)}/kg = ${fmt(subtotal)}`
    + (minimoAplicado ? ` → mínimo ${fmt(minimo as number)}` : '');

  return {
    ok: true, brutoKg: entrada.brutoKg, volumetricoKg, origenVolumetrico, factor: origenVolumetrico === 'calculado' ? factor : null,
    mayorKg, cobrableKg, gana, redondeado, precioKg, escalaDesdeKg: escala ? escala.desdeKg : null,
    subtotal, minimo, minimoAplicado, total, formula,
  };
}

// ─── De la carga de la solicitud ─────────────────────────────────────────────

/**
 * Peso y volumen de la carga. Lo que no se puede saber queda en null:
 *  - LCL: volumen declarado.
 *  - Aéreo: el peso volumétrico capturado si viene; si no, el volumen de los
 *    bultos, pero solo cuando las dimensiones cubren TODAS las piezas (una
 *    lista corta de medidas no dice cuánto ocupa el resto).
 *  - Terrestre y FCL: no capturan volumen.
 */
export function entradaDesdeCarga(carga: CargaSolicitada | null | undefined): EntradaPeso {
  const vacio: EntradaPeso = { brutoKg: null, volumenM3: null, pesoVolumetricoKg: null, aereo: false };
  if (!carga) return vacio;
  switch (carga.tipo) {
    case 'lcl':
      return { ...vacio, brutoKg: carga.pesoBrutoKg, volumenM3: positivo(carga.volumenM3) ? carga.volumenM3 : null };
    case 'aereo': {
      const bultos = carga.bultos ?? [];
      const cubreTodo = bultos.length > 0 && !(carga.piezas > bultos.length);
      const m3 = cubreTodo
        ? bultos.reduce((acc, b) => acc + (b.largoCm * b.anchoCm * b.altoCm) / 1_000_000, 0)
        : 0;
      return {
        brutoKg: carga.pesoBrutoKg,
        volumenM3: m3 > 0 ? m3 : null,
        pesoVolumetricoKg: positivo(carga.pesoVolumetricoKg) ? carga.pesoVolumetricoKg : null,
        aereo: true,
      };
    }
    case 'terrestre':
    case 'fcl':
      return { ...vacio, brutoKg: carga.pesoBrutoKg };
    default:
      return vacio;
  }
}

// ─── Validación al guardar la tarifa ─────────────────────────────────────────

/**
 * Problemas de una tarifa por kg cobrable. `aereo` = la tarifa declara
 * servicio aéreo (tiene el factor 167 de respaldo); sin eso el factor es
 * obligatorio, porque terrestre no tiene default.
 */
export function problemasTarifaCobrable(precios: PreciosCobrable, opciones: { aereo: boolean }): string[] {
  const p: string[] = [];
  if (!positivo(precios.monto)) p.push('El precio por kg es obligatorio.');
  if (!positivo(precios.factorVolumetricoKgM3) && !opciones.aereo) {
    p.push('El factor volumétrico (kg por m³) es obligatorio: solo el aéreo tiene uno por default.');
  }
  if (precios.minimo !== undefined && !(precios.minimo >= 0)) p.push('El mínimo no puede ser negativo.');
  const vistos = new Set<number>();
  for (const e of precios.escalas ?? []) {
    if (!positivo(e.desdeKg)) { p.push('Cada escala necesita un «desde» mayor que cero.'); continue; }
    if (!positivo(e.monto)) p.push(`La escala desde ${e.desdeKg} kg necesita un precio.`);
    if (vistos.has(e.desdeKg)) p.push(`Hay dos escalas desde ${e.desdeKg} kg.`);
    vistos.add(e.desdeKg);
  }
  return p;
}
