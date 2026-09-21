/**
 * conciliacionFactura.ts (Bloque 2, sep-2026)
 *
 * La factura del PROVEEDOR contra los cargos del embarque.
 *
 * El clasificador ya extrae los conceptos de la factura; aquí se emparejan
 * con los cargos de gasto pendientes de ese proveedor —por nombre y por
 * monto— y el usuario confirma o corrige. Al confirmar, los cargos quedan
 * marcados con `facturaProveedorId`, el grupo del proveedor pasa a
 * «Facturado», y la OC se precarga con número, fecha y total.
 *
 * Es la versión mínima: cada cargo se aplica completo o no se aplica. La
 * conciliación parcial y las notas de crédito van después del jueves.
 *
 * Sin React, sin Firestore.
 */

import type { CargoDetalle } from '../components/shipments/EmbarquesData';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import { precargaFacturaProveedor, type PrecargaFactura } from './clasificacionDocumentos';
import { proponerParaOC, type PropuestaOC } from './documentosEmbarque';

// ─── Los conceptos de la factura ─────────────────────────────────────────────

export interface ConceptoFactura {
  id: string;
  descripcion: string;
  /** Null cuando la factura no desglosa montos (solo el total). */
  monto: number | null;
  moneda: string;
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const numero = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v
  : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(/[,$\s]/g, ''))) ? Number(v.replace(/[,$\s]/g, ''))
  : null;

/**
 * Lo que el clasificador devuelve en `conceptos[]` puede ser una lista de
 * strings (solo descripciones) o de objetos {descripcion, monto, moneda}.
 * Se aceptan las dos formas: el contrato es externo.
 */
export function conceptosDeFactura(datos: Record<string, unknown>): ConceptoFactura[] {
  const crudo = Array.isArray(datos.conceptos) ? datos.conceptos : [];
  const monedaFactura = texto(datos.moneda).toUpperCase();
  return crudo.map((c, i): ConceptoFactura | null => {
    if (typeof c === 'string') {
      return c.trim() ? { id: `cf-${i}`, descripcion: c.trim(), monto: null, moneda: monedaFactura } : null;
    }
    if (c && typeof c === 'object') {
      const o = c as Record<string, unknown>;
      const descripcion = texto(o.descripcion) || texto(o.concepto) || texto(o.nombre);
      if (!descripcion) return null;
      return {
        id: `cf-${i}`,
        descripcion,
        monto: numero(o.monto) ?? numero(o.importe) ?? numero(o.total) ?? numero(o.subtotal),
        moneda: (texto(o.moneda) || monedaFactura).toUpperCase(),
      };
    }
    return null;
  }).filter((x): x is ConceptoFactura => x !== null);
}

// ─── Emparejamiento propuesto ────────────────────────────────────────────────

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'a', 'por', 'para', 'con', 'the', 'of', 'and']);
const palabras = (s: string) => norm(s).split(' ').filter(p => p.length > 2 && !STOP.has(p));

/** 0–1: fracción de palabras significativas compartidas (Jaccard). */
export function similitudNombre(a: string, b: string): number {
  const pa = new Set(palabras(a)), pb = new Set(palabras(b));
  if (pa.size === 0 || pb.size === 0) return 0;
  let comunes = 0;
  pa.forEach(p => { if (pb.has(p)) comunes++; });
  return comunes / (pa.size + pb.size - comunes);
}

export interface Emparejamiento {
  conceptoId: string;
  cargoId: string | null;
  /** Por qué se propuso: 'monto_y_nombre' es seguro; 'nombre' y 'monto' se revisan. */
  motivo: 'monto_y_nombre' | 'nombre' | 'monto' | null;
}

/**
 * Propone qué cargo paga cada concepto de la factura. Un cargo no se
 * propone dos veces. Primero los pares que coinciden en monto Y nombre,
 * luego por nombre, luego por monto exacto; lo que no encaja queda sin
 * propuesta para que el usuario lo resuelva.
 */
export function proponerEmparejamiento(
  conceptos: readonly ConceptoFactura[],
  cargos: readonly CargoDetalle[],
): Emparejamiento[] {
  const usados = new Set<string>();
  const out = new Map<string, Emparejamiento>();
  conceptos.forEach(c => out.set(c.id, { conceptoId: c.id, cargoId: null, motivo: null }));

  const montoIgual = (c: ConceptoFactura, g: CargoDetalle) =>
    c.monto !== null && Math.abs(c.monto - g.monto) <= 1 && (!c.moneda || c.moneda === g.moneda);

  const pasadas: { motivo: Emparejamiento['motivo']; acepta: (c: ConceptoFactura, g: CargoDetalle) => number }[] = [
    { motivo: 'monto_y_nombre', acepta: (c, g) => montoIgual(c, g) && similitudNombre(c.descripcion, g.concepto) >= 0.34 ? 2 + similitudNombre(c.descripcion, g.concepto) : 0 },
    { motivo: 'nombre', acepta: (c, g) => { const s = similitudNombre(c.descripcion, g.concepto); return s >= 0.5 ? s : 0; } },
    { motivo: 'monto', acepta: (c, g) => montoIgual(c, g) ? 1 : 0 },
  ];

  for (const pasada of pasadas) {
    // Candidatos ordenados por puntaje para que el mejor par gane primero.
    const candidatos: { c: ConceptoFactura; g: CargoDetalle; p: number }[] = [];
    conceptos.forEach(c => {
      if (out.get(c.id)!.cargoId) return;
      cargos.forEach(g => {
        if (usados.has(g.id)) return;
        const p = pasada.acepta(c, g);
        if (p > 0) candidatos.push({ c, g, p });
      });
    });
    candidatos.sort((a, b) => b.p - a.p);
    for (const { c, g } of candidatos) {
      if (out.get(c.id)!.cargoId || usados.has(g.id)) continue;
      out.set(c.id, { conceptoId: c.id, cargoId: g.id, motivo: pasada.motivo });
      usados.add(g.id);
    }
  }
  return [...out.values()];
}

// ─── Lo que se aplica ────────────────────────────────────────────────────────

export type ModoAplicacion = 'por_concepto' | 'completa';

export interface ResultadoConciliacion {
  /** Cargos que quedan marcados con la factura. */
  cargoIds: string[];
  /** Conceptos de la factura que no se ligaron a ningún cargo. */
  conceptosSinCargo: ConceptoFactura[];
  /** Total de lo que se aplica vs. total de la factura, para el aviso. */
  aplicado: number;
  totalFactura: number | null;
  moneda: string;
  avisos: string[];
}

/**
 * Qué cargos se marcan. 'completa' aplica la factura a TODOS los cargos
 * pendientes del proveedor sin emparejar línea por línea — el atajo cuando
 * la factura es «todo lo que te presté». 'por_concepto' aplica solo los
 * emparejados y confirmados.
 */
export function resolverConciliacion(
  modo: ModoAplicacion,
  conceptos: readonly ConceptoFactura[],
  emparejamiento: readonly Emparejamiento[],
  cargosPendientes: readonly CargoDetalle[],
  precarga: Pick<PrecargaFactura, 'total' | 'moneda'>,
): ResultadoConciliacion {
  const avisos: string[] = [];
  const cargoIds = modo === 'completa'
    ? cargosPendientes.map(g => g.id)
    : emparejamiento.filter(e => e.cargoId).map(e => e.cargoId!);

  const cargos = cargosPendientes.filter(g => cargoIds.includes(g.id));
  const monedas = new Set(cargos.map(g => g.moneda));
  if (monedas.size > 1) avisos.push(`Los cargos mezclan ${[...monedas].join(' y ')}: revisa que la factura sea de una sola moneda.`);
  const moneda = precarga.moneda || cargos[0]?.moneda || '';
  const aplicado = Math.round(cargos.filter(g => !moneda || g.moneda === moneda).reduce((a, g) => a + g.monto, 0) * 100) / 100;

  if (precarga.total !== null && Math.abs(aplicado - precarga.total) > 1) {
    const f = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });
    avisos.push(`La factura suma ${moneda} ${f(precarga.total)} y los cargos aplicados ${moneda} ${f(aplicado)}. La diferencia se revisa a mano.`);
  }
  if (cargoIds.length === 0) avisos.push('No hay ningún cargo ligado: la factura se guarda, pero nada queda como facturado.');

  const ligados = new Set(emparejamiento.filter(e => e.cargoId).map(e => e.conceptoId));
  const conceptosSinCargo = modo === 'completa' ? [] : conceptos.filter(c => !ligados.has(c.id));

  return { cargoIds, conceptosSinCargo, aplicado, totalFactura: precarga.total, moneda, avisos };
}

/** Los cargos del embarque con la factura ya marcada. */
export function marcarCargosConFactura(
  detalles: readonly CargoDetalle[],
  cargoIds: readonly string[],
  facturaProveedorId: string,
): CargoDetalle[] {
  const set = new Set(cargoIds);
  return detalles.map(c => set.has(c.id) ? { ...c, facturaProveedorId } : c);
}

/** Cargos de gasto de ESE proveedor que todavía no tienen factura. */
export function cargosPendientesDe(detalles: readonly CargoDetalle[], proveedorId: string): CargoDetalle[] {
  return detalles.filter(c => c.tipo === 'gasto' && c.proveedorId === proveedorId && !c.facturaProveedorId && c.monto !== 0);
}

/**
 * La OC del proveedor que se precarga con la factura: la más reciente sin
 * factura asociada; si todas la tienen, ninguna (no se pisa una OC que ya
 * trae su factura).
 */
export function ocParaPrecargar(
  ordenes: readonly OrdenCompra[],
  embarqueId: string,
  proveedorId: string,
): OrdenCompra | null {
  const suyas = ordenes
    .filter(o => o.embarqueId === embarqueId && o.proveedorId === proveedorId && o.activo !== false && o.estado !== 'rechazada');
  return suyas.find(o => !o.facturaDatos) ?? null;
}

export { precargaFacturaProveedor, proponerParaOC };
export type { PrecargaFactura, PropuestaOC };
