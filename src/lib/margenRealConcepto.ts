/**
 * margenRealConcepto.ts
 *
 * El margen REAL de cada concepto del embarque: no lo que Pricing cotizó,
 * sino lo que terminó costando después de facturar y pagar.
 *
 * ── Por qué el costo tiene ESTADO y no solo número ─────────────────────────
 * Un costo estimado y uno pagado se ven idénticos en una tabla, y no valen lo
 * mismo: sobre el primero todavía se puede negociar y sobre el segundo ya
 * salió el dinero. Por eso cada concepto dice de dónde viene su costo
 * —estimado, facturado, pagado— en vez de enseñar un número pelón que invita
 * a tratarlos igual.
 *
 * El orden es de menos a más firme, y un grupo se reporta con el estado MENOS
 * firme de sus gastos: si de tres conceptos dos están pagados y uno sigue
 * estimado, el margen del grupo todavía se puede mover.
 *
 * ── Por qué a veces NO se compara ──────────────────────────────────────────
 * El excedente solo significa algo si los dos números miden lo mismo. Hay tres
 * formas de que no lo hagan, y en las tres se prefiere no comparar antes que
 * comparar mal: un excedente falso manda a Operaciones a pelearse con un
 * proveedor que no cobró de más.
 *
 *   factura_con_iva      El total de la factura trae impuestos y lo cotizado
 *                        no. Comparar 1,160 contra 1,000 inventa un excedente
 *                        del 16% que no existe. Se compara sobre el subtotal
 *                        o no se compara.
 *   factura_compartida   Una factura que cubre varias órdenes trae el total de
 *                        TODAS. Cargárselo a un concepto lo pone en pérdida y
 *                        deja a los otros gratis.
 *   sin_tipo_cambio      §4.3: 2,000 USD y 40,000 MXN no se restan. Sin tipo
 *                        de cambio declarado no se inventa uno.
 *
 * ── Qué NO hace ────────────────────────────────────────────────────────────
 * No reparte pagos entre conceptos. Con una orden de compra por cargo (1:1,
 * `ocDesdeCargo`) el caso no se da hoy; cuando lleguen las facturas
 * consolidadas, repartir es una decisión de negocio, no un default.
 *
 * Nada de esto se guarda: se calcula al pintar. Guardarlo sería una tercera
 * fuente de verdad para los costos, después de la dualidad de §6.
 *
 * Lógica pura: sin React ni Firestore.
 */

import type { CargoDetalle, MonedaCargo } from '../components/shipments/EmbarquesData';
import { montoOriginal, type GrupoCargos } from './cargosEditables';

const redondear = (n: number) => Math.round(n * 100) / 100;

/** De menos a más firme. El orden importa: `estadoMenosFirme` lo usa. */
export const ORDEN_ESTADO = ['estimado', 'facturado', 'pagado'] as const;
export type EstadoCosto = (typeof ORDEN_ESTADO)[number];

export type MotivoSinComparar =
  | 'factura_con_iva'
  | 'factura_compartida'
  | 'sin_tipo_cambio';

export const TEXTO_SIN_COMPARAR: Record<MotivoSinComparar, string> = {
  factura_con_iva: 'Facturado, sin comparar: el total de la factura incluye IVA y lo cotizado no.',
  factura_compartida: 'Facturado, sin comparar: la factura cubre varias órdenes, su total no es de este concepto.',
  sin_tipo_cambio: 'Sin tipo de cambio: la factura viene en otra moneda y no hay con qué convertirla.',
};

/** Lo mínimo que el cálculo necesita de una orden de compra. */
export interface OCParaMargen {
  id: string;
  estado: string;
  monto: number;
  moneda: string;
  facturaDatos?: {
    total: number | null;
    /**
     * Antes de impuestos. Es lo único comparable contra lo cotizado, que
     * también va antes de IVA («Montos antes de IVA» en la ficha de Pricing).
     *
     * Hoy NADIE lo escribe: el clasificador devuelve solo el total. Mientras
     * siga así, toda factura cae en `factura_con_iva`. El día que el flujo de
     * n8n lo entregue, esta rama se enciende sola.
     */
    subtotal?: number | null;
    moneda: string;
  } | null;
}

export interface ContextoMargen {
  /** Por id de orden de compra. */
  ordenes: Map<string, OCParaMargen>;
  /** Todos los cargos del embarque: hacen falta para detectar factura compartida. */
  cargos: CargoDetalle[];
  /** MXN por USD. Ausente = no se convierte y no se compara entre monedas. */
  tipoCambio?: number | null;
}

export interface DesfaseOC {
  cargoId: string;
  /** Lo que dice la orden de compra. */
  oc: number;
  /** Lo que dice el cargo hoy. */
  cargo: number;
}

export interface CostoDeCargo {
  cargoId: string;
  moneda: MonedaCargo;
  estado: EstadoCosto;
  /** Lo que Pricing cotizó. Base del excedente. */
  cotizado: number;
  /** El costo que manda, siempre en la moneda del cargo. */
  costo: number;
  /** costo − cotizado. Cero cuando no se pudo comparar. */
  excedente: number;
  sinComparar: MotivoSinComparar | null;
  desfaseOC: DesfaseOC | null;
}

// ─── Un cargo ─────────────────────────────────────────────────────────────────

/** ¿La factura de este cargo cubre más de una orden de compra? */
function facturaCompartida(cargo: CargoDetalle, cargos: CargoDetalle[]): boolean {
  if (!cargo.facturaProveedorId) return false;
  const ocs = new Set(
    cargos
      .filter(c => c.facturaProveedorId === cargo.facturaProveedorId && c.ordenCompraId)
      .map(c => c.ordenCompraId),
  );
  return ocs.size > 1;
}

/**
 * Convierte a la moneda del cargo. `null` = no se puede sin inventar la tasa.
 *
 * Nunca cae a USD por defecto: meter un importe en la moneda equivocada es
 * peor que dejarlo fuera, porque el total seguiría viéndose correcto (§4.3).
 */
function aMonedaDelCargo(
  monto: number, desde: string, hacia: MonedaCargo, tipoCambio?: number | null,
): number | null {
  if (desde === hacia) return monto;
  if (!tipoCambio || tipoCambio <= 0) return null;
  if (desde === 'USD' && hacia === 'MXN') return redondear(monto * tipoCambio);
  if (desde === 'MXN' && hacia === 'USD') return redondear(monto / tipoCambio);
  return null;
}

/**
 * De dónde sale el costo de este cargo y qué tan firme es.
 *
 * Los ingresos no tienen costo: se devuelven como estimados en cero para que
 * quien llame no tenga que filtrarlos antes.
 */
export function costoDeCargo(cargo: CargoDetalle, ctx: ContextoMargen): CostoDeCargo {
  const cotizado = montoOriginal(cargo);
  const base: CostoDeCargo = {
    cargoId: cargo.id,
    moneda: cargo.moneda,
    estado: 'estimado',
    cotizado,
    costo: cotizado,
    excedente: 0,
    sinComparar: null,
    desfaseOC: null,
  };

  if (cargo.tipo !== 'gasto') return { ...base, cotizado: 0, costo: 0 };

  const oc = cargo.ordenCompraId ? ctx.ordenes.get(cargo.ordenCompraId) : undefined;

  /*
   * El desfase se reporta SIEMPRE que exista, sin importar de dónde acabe
   * saliendo el costo. La orden se emite copiando el cargo y nadie la vuelve a
   * tocar: si los dos números difieren es porque alguien corrigió el cargo
   * DESPUÉS de pedir el pago, y quien mira la tabla merece saberlo antes de
   * creer que uno de los dos está mal capturado.
   */
  const desfaseOC: DesfaseOC | null =
    oc && redondear(oc.monto) !== redondear(cargo.monto)
      ? { cargoId: cargo.id, oc: oc.monto, cargo: cargo.monto }
      : null;

  /** El cargo corregido a mano: la red de abajo de todas las ramas. */
  const corregido = (motivo: MotivoSinComparar | null): CostoDeCargo => {
    if (cargo.montoHeredado !== undefined) {
      return {
        ...base, desfaseOC, sinComparar: motivo,
        estado: 'facturado',
        costo: cargo.monto,
        excedente: motivo ? 0 : redondear(cargo.monto - cotizado),
      };
    }
    // Sin corrección y sin costo firme: sigue siendo la estimación.
    return {
      ...base, desfaseOC, sinComparar: motivo,
      estado: motivo ? 'facturado' : 'estimado',
    };
  };

  // ── Pagado: lo que efectivamente salió del banco ──────────────────────────
  if (oc && oc.estado === 'pagada') {
    const monto = aMonedaDelCargo(oc.monto, oc.moneda, cargo.moneda, ctx.tipoCambio);
    if (monto === null) return { ...corregido('sin_tipo_cambio'), estado: 'pagado' };
    return {
      ...base, desfaseOC,
      estado: 'pagado',
      costo: monto,
      excedente: redondear(monto - cotizado),
    };
  }

  // ── Facturado: lo que el proveedor cobró ──────────────────────────────────
  const f = oc?.facturaDatos;
  if (f) {
    // (a) Antes de IVA o no se compara.
    if (f.subtotal === undefined || f.subtotal === null) return corregido('factura_con_iva');
    // (b) Una factura de varias órdenes trae el total de todas.
    if (facturaCompartida(cargo, ctx.cargos)) return corregido('factura_compartida');
    // (c) Otra moneda sin tipo de cambio.
    const monto = aMonedaDelCargo(f.subtotal, f.moneda, cargo.moneda, ctx.tipoCambio);
    if (monto === null) return corregido('sin_tipo_cambio');
    return {
      ...base, desfaseOC,
      estado: 'facturado',
      costo: monto,
      excedente: redondear(monto - cotizado),
    };
  }

  return corregido(null);
}

// ─── Un concepto ──────────────────────────────────────────────────────────────

export interface MargenMoneda {
  moneda: MonedaCargo;
  venta: number;
  cotizado: number;
  costo: number;
  profit: number;
  /** profit / venta, 0–1. `null` cuando no hay venta: dividir entre cero. */
  margen: number | null;
  /** Cuánto se pasó del costo cotizado. Solo > 0 se pinta en rojo. */
  excedente: number;
  /** El MENOS firme de los gastos de esta moneda. */
  estado: EstadoCosto;
  avisos: MotivoSinComparar[];
  desfases: DesfaseOC[];
}

/** El menos firme de una lista. Sin gastos, no hay costo firme: estimado. */
export function estadoMenosFirme(estados: EstadoCosto[]): EstadoCosto {
  if (estados.length === 0) return 'estimado';
  return estados.reduce((peor, e) =>
    ORDEN_ESTADO.indexOf(e) < ORDEN_ESTADO.indexOf(peor) ? e : peor);
}

/**
 * Las columnas de Pricing sobre el concepto del embarque, una fila por moneda.
 *
 * §4.3: nunca se suman entre sí. Un concepto que se cobra en pesos y se paga
 * en dólares produce dos filas, no un total revuelto.
 */
export function margenDelConcepto(
  grupo: GrupoCargos, ctx: ContextoMargen,
): MargenMoneda[] {
  const costos = grupo.cargos.map(c => costoDeCargo(c, ctx));
  const porId = new Map(costos.map(c => [c.cargoId, c]));

  return grupo.monedasActivas.map(moneda => {
    const deLaMoneda = grupo.cargos.filter(c => c.moneda === moneda);
    const gastos = deLaMoneda.filter(c => c.tipo === 'gasto');

    const venta = redondear(
      deLaMoneda.filter(c => c.tipo === 'ingreso').reduce((a, c) => a + c.monto, 0),
    );

    let cotizado = 0, costo = 0, excedente = 0;
    const avisos: MotivoSinComparar[] = [];
    const desfases: DesfaseOC[] = [];
    const estados: EstadoCosto[] = [];

    gastos.forEach(c => {
      const r = porId.get(c.id)!;
      cotizado = redondear(cotizado + r.cotizado);
      costo = redondear(costo + r.costo);
      excedente = redondear(excedente + r.excedente);
      estados.push(r.estado);
      if (r.sinComparar && !avisos.includes(r.sinComparar)) avisos.push(r.sinComparar);
      if (r.desfaseOC) desfases.push(r.desfaseOC);
    });

    const profit = redondear(venta - costo);

    return {
      moneda,
      venta,
      cotizado,
      costo,
      profit,
      /*
       * Sin redondear, igual que `calcLinea` en la cotización: es una
       * fracción, no dinero. Redondeada a centavos, 16.67% se convierte en
       * 17% y el margen del embarque dejaría de cuadrar con el de Pricing.
       */
      margen: venta === 0 ? null : profit / venta,
      excedente,
      estado: estadoMenosFirme(estados),
      avisos,
      desfases,
    };
  });
}

// ─── El embarque entero ───────────────────────────────────────────────────────

/**
 * El mismo cálculo sobre todos los cargos del embarque.
 *
 * Existe para que el Resumen Financiero y la suma de los conceptos den el
 * MISMO número. Si el resumen siguiera sumando `cargo.monto` mientras cada
 * concepto muestra su costo real, la ficha tendría dos utilidades distintas
 * para el mismo embarque y ninguna forma de saber cuál creer.
 */
export function margenDelEmbarque(
  detalles: CargoDetalle[], ctx: ContextoMargen,
): MargenMoneda[] {
  const monedas: MonedaCargo[] = ['USD', 'MXN'];
  const costos = new Map(detalles.map(c => [c.id, costoDeCargo(c, ctx)]));

  return monedas
    .filter(m => detalles.some(c => c.moneda === m))
    .map(moneda => {
      const deLaMoneda = detalles.filter(c => c.moneda === moneda);
      const venta = redondear(
        deLaMoneda.filter(c => c.tipo === 'ingreso').reduce((a, c) => a + c.monto, 0),
      );

      let cotizado = 0, costo = 0, excedente = 0;
      const avisos: MotivoSinComparar[] = [];
      const desfases: DesfaseOC[] = [];
      const estados: EstadoCosto[] = [];

      deLaMoneda.filter(c => c.tipo === 'gasto').forEach(c => {
        const r = costos.get(c.id)!;
        cotizado = redondear(cotizado + r.cotizado);
        costo = redondear(costo + r.costo);
        excedente = redondear(excedente + r.excedente);
        estados.push(r.estado);
        if (r.sinComparar && !avisos.includes(r.sinComparar)) avisos.push(r.sinComparar);
        if (r.desfaseOC) desfases.push(r.desfaseOC);
      });

      const profit = redondear(venta - costo);

      return {
        moneda, venta, cotizado, costo, profit,
        margen: venta === 0 ? null : profit / venta,
        excedente,
        estado: estadoMenosFirme(estados),
        avisos,
        desfases,
      };
    });
}
