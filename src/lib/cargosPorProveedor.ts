/**
 * cargosPorProveedor.ts (3.1)
 *
 * Los cargos agrupados POR PROVEEDOR, para la cotización y para el embarque.
 *
 * ── Por qué ────────────────────────────────────────────────────────────────
 * Reunión con el cliente (10-sep-2026): un proveedor emite UNA factura por
 * todo lo que prestó. Si Hapag-Lloyd cobra flete, THC y documentación, eso
 * es una sola factura y un solo pago — no tres cargos sueltos. «¿A quién le
 * debo cuánto?» se responde por proveedor; «¿cuánto me costó el flete?» se
 * responde por concepto. Las dos preguntas son legítimas.
 *
 * ── Es una VISTA, no un modelo ─────────────────────────────────────────────
 * Los cargos siguen siendo por concepto: la comparativa compara concepto
 * contra concepto y eso no cambia. Aquí se gira la misma tabla, igual que la
 * matriz de la comparativa (§4.9). No se guarda nada; no hay una tercera
 * fuente de verdad (§6, la dualidad).
 *
 * ── Dos entradas, una salida ───────────────────────────────────────────────
 * La cotización trae LineaPlana con `costos[]` (un componente por
 * proveedor); el embarque trae CargoDetalle (un ingreso por concepto y un
 * gasto por proveedor, ligados por origenCotizacion.conceptoId). Los dos se
 * normalizan a `ConceptoConCostos` y de ahí sale el mismo consolidado.
 *
 * ── Carga dividida ─────────────────────────────────────────────────────────
 * Un concepto con dos proveedores (dos terminales) tiene UNA venta. Se
 * reparte proporcional al costo y el renglón se marca «compartido».
 * Asignarla al primero inflaría su margen y pondría al otro en pérdida: la
 * tabla mentiría sobre qué proveedor conviene.
 *
 * Sin React, sin Firestore.
 */

import type { LineaPlana } from './lineasCotizacion';
import type { CargoDetalle } from '../components/shipments/EmbarquesData';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import { MONEDAS, type Moneda, type TotalPorMoneda } from './sumarPorMoneda';

// ─── Entrada normalizada ──────────────────────────────────────────────────────

export interface ComponenteCosto {
  /** Id del cargo (embarque) o del componente (cotización). */
  refId: string;
  proveedorId: string | null;
  proveedorNombre: string;
  costo: number;
  moneda: Moneda;
}

export interface ConceptoConCostos {
  clave: string;
  concepto: string;
  venta: number;
  monedaVenta: Moneda;
  /** Id del cargo de ingreso (embarque). Null en la cotización. */
  ingresoRefId: string | null;
  componentes: ComponenteCosto[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const esMoneda = (m: unknown): m is Moneda => m === 'USD' || m === 'MXN';

/** La cotización: cada línea plana es un concepto con sus componentes. */
export function desdeLineas(lineas: readonly LineaPlana[]): ConceptoConCostos[] {
  return [...lineas]
    .sort((a, b) => a.orden - b.orden)
    .map(l => ({
      clave: l.id,
      concepto: l.concepto,
      venta: l.venta,
      monedaVenta: esMoneda(l.moneda) ? l.moneda : 'USD',
      ingresoRefId: null,
      componentes: (l.costos ?? [])
        .filter(c => c.monto !== 0)
        .map(c => ({
          refId: c.id,
          proveedorId: c.proveedorId ?? null,
          proveedorNombre: c.proveedorNombre ?? '',
          costo: c.monto,
          moneda: esMoneda(c.moneda) ? c.moneda : 'USD',
        })),
    }));
}

/**
 * El embarque: el ingreso y los gastos del mismo concepto se juntan por
 * `origenCotizacion.conceptoId`. Un cargo capturado a mano no tiene origen:
 * es su propio concepto.
 */
export function desdeCargos(detalles: readonly CargoDetalle[]): ConceptoConCostos[] {
  const mapa = new Map<string, ConceptoConCostos>();
  const orden: string[] = [];

  detalles.forEach(c => {
    const clave = c.origenCotizacion?.conceptoId
      ? `cot:${c.origenCotizacion.conceptoId}`
      : `cargo:${c.id}`;
    let g = mapa.get(clave);
    if (!g) {
      g = { clave, concepto: c.concepto, venta: 0, monedaVenta: c.moneda, ingresoRefId: null, componentes: [] };
      mapa.set(clave, g);
      orden.push(clave);
    }
    if (c.tipo === 'ingreso') {
      g.venta = r2(g.venta + c.monto);
      g.monedaVenta = c.moneda;
      g.ingresoRefId = c.id;
      // El nombre del concepto es el del ingreso: el gasto puede traer el
      // nombre del componente («Terminal B»).
      g.concepto = c.concepto;
    } else if (c.monto !== 0) {
      g.componentes.push({
        refId: c.id, proveedorId: c.proveedorId ?? null, proveedorNombre: '',
        costo: c.monto, moneda: c.moneda,
      });
    }
  });

  return orden.map(k => mapa.get(k)!);
}

// ─── Salida ───────────────────────────────────────────────────────────────────

export interface RenglonProveedor {
  clave: string;
  concepto: string;
  /** Id del componente/cargo de gasto de ESTE proveedor. Null si no hay costo. */
  refId: string | null;
  ingresoRefId: string | null;
  costo: number;
  monedaCosto: Moneda;
  /** La parte de la venta que le toca a este proveedor. */
  venta: number;
  monedaVenta: Moneda;
  /** Null cuando venta y costo están en monedas distintas: no se restan. */
  profit: number | null;
  margen: number | null;
  /** El concepto se reparte entre varios proveedores. */
  compartido: boolean;
  /** Fracción del costo del concepto que es de este proveedor (0–1). */
  participacion: number;
  /** El cálculo del reparto, para el tooltip. */
  detalleReparto: string | null;
}

export interface TotalesProveedor {
  costo: number;
  venta: number;
  /** Solo suma los renglones con profit calculable (misma moneda). */
  profit: number;
  margen: number | null;
}

export type EstadoProveedor = 'sin_factura' | 'facturado' | 'en_oc' | 'pagado';

export const ETIQUETA_ESTADO_PROVEEDOR: Record<EstadoProveedor, string> = {
  sin_factura: 'Sin factura',
  facturado: 'Facturado',
  en_oc: 'En orden de compra',
  pagado: 'Pagado',
};

export interface GrupoProveedor {
  proveedorId: string | null;
  /** Lo que traía la línea; el caller lo resuelve contra el catálogo si puede. */
  proveedorNombre: string;
  renglones: RenglonProveedor[];
  totales: Record<Moneda, TotalesProveedor>;
  monedasActivas: Moneda[];
  /** Algún renglón tiene venta y costo en monedas distintas: el margen del grupo no se lee como un número. */
  mezclaMonedas: boolean;
}

export interface ConsolidadoProveedores {
  grupos: GrupoProveedor[];
  totalGeneral: Record<Moneda, TotalesProveedor>;
  monedasActivas: Moneda[];
}

/** Clave del grupo de lo que no tiene proveedor. */
export const SIN_PROVEEDOR = null;

function totalesVacios(): Record<Moneda, TotalesProveedor> {
  return { USD: { costo: 0, venta: 0, profit: 0, margen: null }, MXN: { costo: 0, venta: 0, profit: 0, margen: null } };
}

function cerrarTotales(t: Record<Moneda, TotalesProveedor>): Moneda[] {
  MONEDAS.forEach(m => {
    t[m].margen = t[m].venta === 0 ? null : r2(t[m].profit / t[m].venta * 1000) / 1000;
  });
  return MONEDAS.filter(m => t[m].costo !== 0 || t[m].venta !== 0);
}

/**
 * Reparte la venta de un concepto entre sus componentes, proporcional al
 * costo. El último se lleva el residuo del redondeo para que la suma de las
 * partes sea exactamente la venta.
 */
function repartir(concepto: ConceptoConCostos): RenglonProveedor[] {
  const comps = concepto.componentes;

  // Sin costo: la venta entera va al grupo sin proveedor (cortesía, cargo
  // absorbido, o un ingreso que Vermur cobra sin proveedor detrás).
  if (comps.length === 0) {
    return [{
      clave: concepto.clave, concepto: concepto.concepto, refId: null, ingresoRefId: concepto.ingresoRefId,
      costo: 0, monedaCosto: concepto.monedaVenta, venta: concepto.venta, monedaVenta: concepto.monedaVenta,
      profit: concepto.venta, margen: concepto.venta === 0 ? null : 1,
      compartido: false, participacion: 0, detalleReparto: null,
    }];
  }

  // El reparto se pesa en una sola moneda: si los componentes mezclan
  // monedas, se pesa por importe nominal (no hay tipo de cambio aquí) y el
  // renglón lo dice. Es el caso raro; §4.3 prohíbe el total revuelto, no
  // la proporción.
  const totalCosto = comps.reduce((a, c) => a + c.costo, 0);
  const compartido = comps.length > 1;
  let asignado = 0;

  return comps.map((c, i) => {
    const participacion = totalCosto === 0 ? 1 / comps.length : c.costo / totalCosto;
    const esUltimo = i === comps.length - 1;
    const venta = esUltimo ? r2(concepto.venta - asignado) : r2(concepto.venta * participacion);
    asignado = r2(asignado + venta);

    const mismaMoneda = c.moneda === concepto.monedaVenta;
    const profit = mismaMoneda ? r2(venta - c.costo) : null;
    const margen = mismaMoneda && venta !== 0 ? r2(profit! / venta * 1000) / 1000 : null;

    const detalleReparto = compartido
      ? `Venta ${concepto.monedaVenta} ${fmt(concepto.venta)} × ${(participacion * 100).toFixed(1)}% (costo ${c.moneda} ${fmt(c.costo)} de ${fmt(totalCosto)}) = ${fmt(venta)}`
      : null;

    return {
      clave: `${concepto.clave}::${c.refId}`, concepto: concepto.concepto,
      refId: c.refId, ingresoRefId: concepto.ingresoRefId,
      costo: c.costo, monedaCosto: c.moneda, venta, monedaVenta: concepto.monedaVenta,
      profit, margen, compartido, participacion: Math.round(participacion * 10000) / 10000, detalleReparto,
    };
  });
}

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function consolidarPorProveedor(conceptos: readonly ConceptoConCostos[]): ConsolidadoProveedores {
  const grupos = new Map<string, GrupoProveedor>();
  const orden: string[] = [];
  /*
   * Un proveedor que viene solo con nombre (la ruta B de §6, sin proveedorId)
   * sigue siendo un proveedor: agrupa por nombre. «Sin proveedor» es solo lo
   * que no trae ni id ni nombre.
   */
  const claveDe = (id: string | null, nombre = '') =>
    id ?? (nombre.trim() ? `nombre:${nombre.trim().toLowerCase()}` : '__sin_proveedor__');

  conceptos.forEach(concepto => {
    const renglones = repartir(concepto);
    concepto.componentes.forEach((c, i) => {
      const k = claveDe(c.proveedorId, c.proveedorNombre);
      let g = grupos.get(k);
      if (!g) {
        g = { proveedorId: c.proveedorId, proveedorNombre: c.proveedorNombre, renglones: [], totales: totalesVacios(), monedasActivas: [], mezclaMonedas: false };
        grupos.set(k, g); orden.push(k);
      }
      if (!g.proveedorNombre && c.proveedorNombre) g.proveedorNombre = c.proveedorNombre;
      g.renglones.push(renglones[i]);
    });
    if (concepto.componentes.length === 0) {
      const k = claveDe(null);
      let g = grupos.get(k);
      if (!g) {
        g = { proveedorId: null, proveedorNombre: '', renglones: [], totales: totalesVacios(), monedasActivas: [], mezclaMonedas: false };
        grupos.set(k, g); orden.push(k);
      }
      g.renglones.push(renglones[0]);
    }
  });

  const totalGeneral = totalesVacios();
  const lista = orden.map(k => grupos.get(k)!);

  lista.forEach(g => {
    g.renglones.forEach(r => {
      g.totales[r.monedaCosto].costo = r2(g.totales[r.monedaCosto].costo + r.costo);
      g.totales[r.monedaVenta].venta = r2(g.totales[r.monedaVenta].venta + r.venta);
      totalGeneral[r.monedaCosto].costo = r2(totalGeneral[r.monedaCosto].costo + r.costo);
      totalGeneral[r.monedaVenta].venta = r2(totalGeneral[r.monedaVenta].venta + r.venta);
      if (r.profit !== null) {
        g.totales[r.monedaVenta].profit = r2(g.totales[r.monedaVenta].profit + r.profit);
        totalGeneral[r.monedaVenta].profit = r2(totalGeneral[r.monedaVenta].profit + r.profit);
      } else {
        g.mezclaMonedas = true;
      }
    });
    g.monedasActivas = cerrarTotales(g.totales);
  });

  // El grupo sin proveedor va al final: es el apéndice, no el cuerpo.
  const sinProv = lista.filter(g => g.proveedorId === null && !g.proveedorNombre);
  const conProv = lista.filter(g => g.proveedorId !== null || g.proveedorNombre);

  return {
    grupos: [...conProv, ...sinProv],
    totalGeneral,
    monedasActivas: cerrarTotales(totalGeneral),
  };
}

/** Totales como TotalPorMoneda, para formatearPorMoneda. */
export function totalComoPorMoneda(
  t: Record<Moneda, TotalesProveedor>,
  campo: 'costo' | 'venta' | 'profit',
): TotalPorMoneda {
  return { USD: t.USD[campo], MXN: t.MXN[campo] };
}

// ─── Estado del proveedor en el embarque (3.4) ───────────────────────────────

/**
 * Qué tan avanzado va el pago a este proveedor, derivado de sus cargos de
 * gasto y de las OC que los cubren. El orden es el del flujo: sin factura →
 * facturado → en orden de compra → pagado. El estado del grupo es el MENOS
 * avanzado de sus cargos: si un cargo no tiene ni factura, al proveedor
 * todavía le falta algo.
 *
 *  - pagado:      todos sus cargos tienen OC pagada
 *  - en_oc:       todos tienen OC (alguna sin pagar)
 *  - facturado:   todos tienen factura del proveedor conciliada (5)
 *  - sin_factura: lo demás
 */
export function estadoDelProveedor(
  grupo: Pick<GrupoProveedor, 'renglones'>,
  cargos: readonly CargoDetalle[],
  ordenes: readonly Pick<OrdenCompra, 'id' | 'estado'>[],
): EstadoProveedor {
  const ids = grupo.renglones.map(r => r.refId).filter((x): x is string => !!x);
  const suyos = cargos.filter(c => ids.includes(c.id));
  if (suyos.length === 0) return 'sin_factura';

  const nivel = (c: CargoDetalle): number => {
    const oc = c.ordenCompraId ? ordenes.find(o => o.id === c.ordenCompraId) : null;
    if (oc?.estado === 'pagada') return 3;
    if (oc && oc.estado !== 'rechazada') return 2;
    if (c.facturaProveedorId) return 1;
    return 0;
  };
  const min = Math.min(...suyos.map(nivel));
  return (['sin_factura', 'facturado', 'en_oc', 'pagado'] as EstadoProveedor[])[min];
}
