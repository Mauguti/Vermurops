/**
 * cuentasPago.ts (1.2)
 *
 * De qué banco de Vermur sale el pago y a qué cuenta del proveedor entra.
 *
 * ── Por qué hay que sugerirlo ──────────────────────────────────────────────
 * Los dos lados tienen varias opciones y la elección no es libre:
 *
 *   · El PROVEEDOR puede tener una cuenta por servicio —flete a una, demoras
 *     a otra, garantías a una tercera— y depositar en la equivocada manda el
 *     dinero a una cuenta real de la empresa correcta, así que el error no
 *     rebota: se descubre cuando el proveedor reclama que no le pagaron.
 *
 *   · Los bancos de VERMUR están segmentados por lo que se paga. Elegir mal
 *     no pierde el dinero pero descuadra la conciliación del mes.
 *
 * Todo lo de aquí SUGIERE. Quien autoriza decide: la lista de abajo es lo
 * que Vermur hace hoy, no una ley, y el día que abran otra cuenta la
 * sugerencia estará desactualizada antes que la realidad.
 *
 * Sin React, sin Firestore, sin red.
 */

import type { CuentaBancariaProveedor, ProveedorVermur } from '../components/proveedores/ProveedoresData';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import { esPagoDeImpuestos } from './fondeoCliente';

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Los bancos de Vermur
// ─────────────────────────────────────────────────────────────────────────────

export type BancoVermur =
  | 'santander_gastos'
  | 'santander_impuestos'
  | 'bbva'
  | 'banorte'
  | 'monex_mxn'
  | 'monex_usd'
  | 'partnerpay';

export interface CuentaVermur {
  id: BancoVermur;
  nombre: string;
  /** Monedas que opera. */
  monedas: ('MXN' | 'USD')[];
  /** Para qué se usa, en las palabras de Vermur. */
  usoHabitual: string;
  /** Monto mínimo por transferencia, si lo hay. */
  montoMinimo?: number;
}

/*
 * Las SIETE cuentas (sesión de Administración con Julio y Gaby, 2-oct-2026).
 * Antes había cuatro: «Santander» cubría gastos e impuestos en un solo
 * renglón, «Monex» solo aparecía en dólares y BBVA no existía. Son cuentas
 * reales distintas y la conciliación del mes se arma por cuenta, así que
 * juntarlas obliga a Julio a separarlas a mano.
 */
export const BANCOS_VERMUR: CuentaVermur[] = [
  {
    id: 'santander_gastos',
    nombre: 'Santander gastos',
    monedas: ['MXN'],
    usoHabitual: 'Pagos a proveedores y gastos de operación.',
  },
  {
    id: 'santander_impuestos',
    nombre: 'Santander impuestos',
    monedas: ['MXN'],
    usoHabitual: 'Impuestos y derechos de la operación aduanal.',
  },
  {
    id: 'bbva',
    nombre: 'BBVA',
    monedas: ['MXN'],
    usoHabitual: 'Recibir pagos de clientes y cargos domiciliados.',
  },
  {
    id: 'banorte',
    nombre: 'Banorte',
    monedas: ['MXN'],
    usoHabitual: 'Garantías y gastos aduanales.',
  },
  {
    id: 'monex_mxn',
    nombre: 'Monex pesos',
    monedas: ['MXN'],
    usoHabitual: 'Operaciones en pesos por Monex.',
  },
  {
    id: 'monex_usd',
    nombre: 'Monex dólares',
    monedas: ['USD'],
    usoHabitual: 'Pagos en dólares.',
  },
  {
    id: 'partnerpay',
    nombre: 'PartnerPay',
    monedas: ['USD'],
    usoHabitual: 'Dólares a agentes de carga. Mínimo USD 80.',
    // Debajo de este monto la comisión se come el pago: va por Monex.
    montoMinimo: 80,
  },
];

export const BANCOS_VERMUR_MAP: Record<BancoVermur, CuentaVermur> =
  Object.fromEntries(BANCOS_VERMUR.map(b => [b.id, b])) as Record<BancoVermur, CuentaVermur>;

/**
 * La cuenta donde ENTRA el dinero del cliente. Es el uso que Vermur le dio a
 * BBVA («recibir pagos y domiciliados»), así que un cobro arranca ahí en vez
 * de en la primera de la lista, que es una cuenta de salida.
 */
export const BANCO_COBRO_DEFAULT: CuentaVermur = BANCOS_VERMUR_MAP.bbva;

/*
 * Los ids que se guardaron antes del 5-oct-2026. No se migran: se LEEN.
 * «santander» se reparte entre gastos e impuestos y no se puede adivinar
 * cuál era, así que apunta a la de gastos —el caso común— y la orden sigue
 * mostrando algo cierto en vez de un hueco.
 */
const ALIAS_LEGACY: Record<string, BancoVermur> = {
  santander: 'santander_gastos',
  monex: 'monex_usd',
};

/**
 * La cuenta que corresponde a un id guardado, sea nuevo o viejo.
 * Devuelve null cuando el id no es de ninguna cuenta conocida: ahí el valor
 * crudo se muestra tal cual, porque borrarlo de la pantalla haría parecer
 * que la orden nunca tuvo banco asignado.
 */
export function resolverBancoVermur(id: string | null | undefined): CuentaVermur | null {
  if (!id) return null;
  const directo = BANCOS_VERMUR_MAP[id as BancoVermur];
  if (directo) return directo;
  const alias = ALIAS_LEGACY[id];
  return alias ? BANCOS_VERMUR_MAP[alias] : null;
}

export interface OpcionBanco {
  valor: string;
  nombre: string;
  usoHabitual: string;
  monedas: ('MXN' | 'USD')[];
  /** El id guardado no está en la lista de hoy: se conserva para no perderlo. */
  fueraDeLista?: boolean;
}

/**
 * Las opciones del selector: las siete de hoy, más el valor guardado cuando
 * ya no está entre ellas. Un `<select>` cuyo value no existe entre sus
 * opciones se pinta en la primera y parece que alguien eligió esa.
 */
export function opcionesBanco(valorGuardado?: string | null): OpcionBanco[] {
  const base: OpcionBanco[] = BANCOS_VERMUR.map(b => ({
    valor: b.id,
    nombre: b.nombre,
    usoHabitual: b.usoHabitual,
    monedas: b.monedas,
  }));
  if (!valorGuardado || base.some(o => o.valor === valorGuardado)) return base;

  const legacy = resolverBancoVermur(valorGuardado);
  return [
    ...base,
    {
      valor: valorGuardado,
      nombre: legacy ? `${legacy.nombre} (registro anterior)` : valorGuardado,
      usoHabitual: legacy
        ? 'Se guardó con el nombre viejo de la cuenta.'
        : 'Esta cuenta ya no está en la lista. Se conserva como quedó registrada.',
      monedas: legacy?.monedas ?? ['MXN', 'USD'],
      fueraDeLista: true,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Qué banco de Vermur usar
//
// ⚠️ DECISIÓN MARCADA (7-sep-2026): dos casos que Vermur no precisó.
//
//   a) USD a un agente de carga por MENOS de 80 → se sugiere Monex.
//      PartnerPay tiene mínimo 80, así que por debajo no es una opción; la
//      alternativa en dólares es Monex.
//   b) «Garantías» no es una categoría del catálogo. Se detecta por el
//      nombre del concepto (garantía / guarantee / depósito en garantía).
//      Si Vermur marca esos conceptos, esto se sustituye por la marca.
//
// ⚠️ DECISIÓN MARCADA (5-oct-2026, tarea 57): al pasar de cuatro cuentas a
//    siete, «Santander» se partió en gastos e impuestos. Un impuesto ya
//    salía por Santander, así que ahora sale por la de impuestos; todo lo
//    demás en pesos, por la de gastos. Nadie dijo qué se paga por Monex
//    pesos, y BBVA es de entrada, no de salida: ninguna de las dos se
//    sugiere.
// ─────────────────────────────────────────────────────────────────────────────

const esAduanal = (conceptoNombre: string, categoria?: string): boolean =>
  categoria === 'despacho'
  || /aduan|customs|pedimento/i.test(conceptoNombre);

const esGarantia = (conceptoNombre: string): boolean =>
  /garant|guarantee|dep[oó]sito en garant/i.test(conceptoNombre);

export interface ContextoSugerencia {
  /** Categoría del concepto, cuando se conoce (del catálogo). */
  categoriaConcepto?: string;
  /** Tipos del proveedor: si es agente de carga cambia el banco en USD. */
  tiposProveedor?: string[];
}

export interface SugerenciaBanco {
  banco: BancoVermur;
  /** Por qué este y no otro. Se muestra junto a la sugerencia. */
  razon: string;
  /** Aviso cuando algo no encaja del todo y conviene revisarlo. */
  aviso?: string;
}

export function sugerirBancoVermur(
  oc: Pick<OrdenCompra, 'moneda' | 'monto' | 'conceptoId' | 'conceptoNombre'> & { esPagoImpuestos?: boolean },
  ctx: ContextoSugerencia = {},
): SugerenciaBanco {
  if (oc.moneda === 'USD') {
    const esAgente = (ctx.tiposProveedor ?? []).includes('agente_carga');
    const minimo = BANCOS_VERMUR_MAP.partnerpay.montoMinimo ?? 0;

    if (esAgente && oc.monto >= minimo) {
      return { banco: 'partnerpay', razon: 'Dólares a un agente de carga.' };
    }
    if (esAgente) {
      return {
        banco: 'monex_usd',
        razon: 'Dólares a un agente de carga, pero por debajo del mínimo de PartnerPay.',
        aviso: `PartnerPay pide mínimo USD ${minimo}; esta orden es por ${oc.monto}.`,
      };
    }
    return { banco: 'monex_usd', razon: 'Pago en dólares.' };
  }

  /*
   * Pesos: impuestos a su propia cuenta de Santander, proveedores y gastos a
   * la de gastos, garantías y aduanal por Banorte. El orden importa — un
   * impuesto aduanal es impuesto.
   *
   * BBVA y Monex pesos NUNCA se sugieren: BBVA es para RECIBIR (pagos de
   * clientes y domiciliados) y de Monex pesos nadie dijo qué sale por ahí.
   * Las dos se pueden elegir a mano; inventarles un criterio pondría a la
   * mitad de los pagos en la cuenta equivocada con cara de sugerencia.
   */
  if (esPagoDeImpuestos(oc)) {
    return { banco: 'santander_impuestos', razon: 'Pago de impuestos.' };
  }
  if (esGarantia(oc.conceptoNombre)) {
    return { banco: 'banorte', razon: 'Garantía.' };
  }
  if (esAduanal(oc.conceptoNombre, ctx.categoriaConcepto)) {
    return { banco: 'banorte', razon: 'Gasto aduanal.' };
  }
  return { banco: 'santander_gastos', razon: 'Pago a proveedor en pesos.' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · A qué cuenta del proveedor
// ─────────────────────────────────────────────────────────────────────────────

export interface SugerenciaCuenta {
  cuenta: CuentaBancariaProveedor | null;
  razon: string;
  /** Otras cuentas activas del proveedor, para poder cambiar. */
  alternativas: CuentaBancariaProveedor[];
  aviso?: string;
}

/**
 * La cuenta del proveedor que corresponde a este concepto.
 *
 * Prioridad: la que declara ESTE concepto, luego la única de la moneda, y si
 * hay varias sin declarar concepto NO se elige por azar — se pide elegir. Un
 * default silencioso entre dos cuentas buenas manda el dinero a la
 * equivocada la mitad de las veces, y nadie revisa lo que ya venía llenado.
 */
export function sugerirCuentaProveedor(
  proveedor: Pick<ProveedorVermur, 'cuentasBancarias'> | null | undefined,
  oc: Pick<OrdenCompra, 'conceptoId' | 'moneda'>,
): SugerenciaCuenta {
  const activas = (proveedor?.cuentasBancarias ?? []).filter(c => c.activo !== false);

  if (activas.length === 0) {
    return {
      cuenta: null,
      alternativas: [],
      razon: 'El proveedor no tiene cuentas bancarias registradas.',
      aviso: 'Pídele los datos bancarios y agrégalos en su ficha antes de pagar.',
    };
  }

  const deLaMoneda = activas.filter(c => c.moneda === oc.moneda);
  if (deLaMoneda.length === 0) {
    return {
      cuenta: null,
      alternativas: activas,
      razon: `El proveedor no tiene cuenta en ${oc.moneda}.`,
      aviso: `Sus cuentas están en ${[...new Set(activas.map(c => c.moneda))].join(' y ')}. Confirma con él antes de transferir.`,
    };
  }

  const porConcepto = deLaMoneda.find(c => c.conceptoAsociadoId === oc.conceptoId);
  if (porConcepto) {
    return {
      cuenta: porConcepto,
      alternativas: deLaMoneda.filter(c => c.id !== porConcepto.id),
      razon: 'Es la cuenta que el proveedor declaró para este concepto.',
    };
  }

  // Una sola cuenta en la moneda: no hay ambigüedad que resolver.
  if (deLaMoneda.length === 1) {
    return {
      cuenta: deLaMoneda[0],
      alternativas: [],
      razon: `Es su única cuenta en ${oc.moneda}.`,
    };
  }

  // Varias, ninguna declarada para este concepto: que elija una persona.
  const generales = deLaMoneda.filter(c => !c.conceptoAsociadoId);
  return {
    cuenta: null,
    alternativas: deLaMoneda,
    razon: `Tiene ${deLaMoneda.length} cuentas en ${oc.moneda} y ninguna declarada para este concepto.`,
    aviso: generales.length > 0
      ? 'Elige a cuál va este pago: las otras están apartadas para conceptos específicos.'
      : 'Elige a cuál va este pago.',
  };
}
