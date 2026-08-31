/**
 * cargosEditables.ts
 *
 * A-3. Los cargos del embarque: agruparlos para leerlos y corregirlos sin
 * perder de vista de dónde salieron.
 *
 * ── La regla que gobierna todo esto ────────────────────────────────────────
 * Textual del cliente: «el costo lo puede modificar operaciones en algún
 * momento si es que la tarifa no fue la correcta o hubo cargos extras».
 *
 * Y la contraparte: al corregir un costo en el embarque, la cotización NO
 * cambia. Son documentos distintos —la cotización es lo que se pactó, el
 * embarque es lo que costó— y la diferencia entre los dos ES el dato que
 * dirección revisa. Por eso `montoHeredado` se fija en la primera edición y
 * ya no se vuelve a tocar: si se sobrescribiera, la corrección borraría
 * justo el número que la hace interesante.
 *
 * Lógica pura: sin React ni Firestore.
 */

import { CargoDetalle, MonedaCargo } from '../components/shipments/EmbarquesData';

const MONEDAS: MonedaCargo[] = ['USD', 'MXN'];
const redondear = (n: number) => Math.round(n * 100) / 100;

/** Clave del grupo donde caen los cargos capturados dentro del embarque. */
export const GRUPO_EXTRA = '__extra__';

export interface TotalesGrupo {
  ingresos: number;
  gastos: number;
  ganancia: number;
}

export interface GrupoCargos {
  /** conceptoId de la cotización, o GRUPO_EXTRA para lo capturado aquí. */
  clave: string;
  titulo: string;
  /** false = son cargos que Operaciones agregó, no heredados. */
  heredado: boolean;
  cargos: CargoDetalle[];
  /** Un bloque por moneda. §4.3: nunca se suman entre sí. */
  porMoneda: Record<MonedaCargo, TotalesGrupo>;
  /** Monedas con algún movimiento, en orden estable. */
  monedasActivas: MonedaCargo[];
  /**
   * true cuando el ingreso y el gasto del mismo concepto están en monedas
   * distintas. No es un error —se cobra en pesos lo que se paga en dólares—
   * pero el margen del grupo no se puede leer como un solo número.
   */
  mezclaMonedas: boolean;
  /** Cuánto se desvió de lo heredado, por moneda. Positivo = costó más. */
  desviacionGasto: Record<MonedaCargo, number>;
  /** ¿Alguien corrigió algún importe de este grupo? */
  editado: boolean;
}

// ─── Lectura ──────────────────────────────────────────────────────────────────

/** El importe con el que la línea nació. */
export function montoOriginal(c: CargoDetalle): number {
  return c.montoHeredado ?? c.monto;
}

/** ¿Se corrigió el importe, y por cuánto? */
export function desviacionDe(c: CargoDetalle): number {
  return redondear(c.monto - montoOriginal(c));
}

function vacio(): Record<MonedaCargo, TotalesGrupo> {
  return {
    USD: { ingresos: 0, gastos: 0, ganancia: 0 },
    MXN: { ingresos: 0, gastos: 0, ganancia: 0 },
  };
}

function claveDe(c: CargoDetalle): string {
  if (c.origen === 'heredado' && c.origenCotizacion?.conceptoId) {
    return c.origenCotizacion.conceptoId;
  }
  return GRUPO_EXTRA;
}

/**
 * Agrupa los cargos por el concepto de la cotización del que nacieron.
 *
 * Un grupo reúne lo que se le cobra al cliente por ese concepto y lo que se le
 * paga a cada proveedor por él, que es la unidad en la que Operaciones razona:
 * «el flete lo cotizamos a 2,500 y Maersk terminó cobrando 2,700».
 *
 * Lo capturado dentro del embarque cae en un grupo aparte a propósito. Ver de
 * un vistazo qué se agregó después es la mitad del dato del profit real.
 */
export function agruparCargos(detalles: CargoDetalle[]): GrupoCargos[] {
  const porClave = new Map<string, CargoDetalle[]>();
  const orden: string[] = [];

  detalles.forEach(c => {
    const k = claveDe(c);
    if (!porClave.has(k)) { porClave.set(k, []); orden.push(k); }
    porClave.get(k)!.push(c);
  });

  // El grupo de extras siempre al final: es el apéndice, no el cuerpo.
  const claves = [
    ...orden.filter(k => k !== GRUPO_EXTRA),
    ...orden.filter(k => k === GRUPO_EXTRA),
  ];

  return claves.map(clave => {
    const cargos = porClave.get(clave)!;
    const porMoneda = vacio();
    const desviacionGasto: Record<MonedaCargo, number> = { USD: 0, MXN: 0 };

    cargos.forEach(c => {
      const t = porMoneda[c.moneda];
      if (!t) return;
      if (c.tipo === 'ingreso') t.ingresos = redondear(t.ingresos + c.monto);
      else {
        t.gastos = redondear(t.gastos + c.monto);
        desviacionGasto[c.moneda] = redondear(desviacionGasto[c.moneda] + desviacionDe(c));
      }
    });
    MONEDAS.forEach(m => {
      porMoneda[m].ganancia = redondear(porMoneda[m].ingresos - porMoneda[m].gastos);
    });

    const monedasActivas = MONEDAS.filter(
      m => porMoneda[m].ingresos !== 0 || porMoneda[m].gastos !== 0,
    );

    const monedasIngreso = new Set(cargos.filter(c => c.tipo === 'ingreso').map(c => c.moneda));
    const monedasGasto = new Set(cargos.filter(c => c.tipo === 'gasto').map(c => c.moneda));
    const mezclaMonedas = monedasActivas.length > 1
      && monedasIngreso.size > 0 && monedasGasto.size > 0;

    const heredado = clave !== GRUPO_EXTRA;

    return {
      clave,
      titulo: heredado
        ? (cargos.find(c => c.tipo === 'ingreso')?.concepto ?? cargos[0].concepto)
        : 'Cargos capturados en el embarque',
      heredado,
      cargos,
      porMoneda,
      monedasActivas,
      mezclaMonedas,
      desviacionGasto,
      editado: cargos.some(c => c.montoHeredado !== undefined),
    };
  });
}

/**
 * Desviación total del embarque contra lo que heredó de la cotización.
 *
 * Es el insumo del profit real: cuánto más (o menos) costó de lo pactado, y
 * cuánto más (o menos) se acabó cobrando. Por moneda, nunca sumadas.
 */
export function desviacionDelEmbarque(
  detalles: CargoDetalle[],
): Record<MonedaCargo, { ingresos: number; gastos: number }> {
  const r: Record<MonedaCargo, { ingresos: number; gastos: number }> = {
    USD: { ingresos: 0, gastos: 0 },
    MXN: { ingresos: 0, gastos: 0 },
  };
  detalles.forEach(c => {
    const d = desviacionDe(c);
    if (d === 0) return;
    const destino = r[c.moneda];
    if (!destino) return;
    if (c.tipo === 'ingreso') destino.ingresos = redondear(destino.ingresos + d);
    else destino.gastos = redondear(destino.gastos + d);
  });
  return r;
}

// ─── Edición ──────────────────────────────────────────────────────────────────

export interface Editor {
  nombre: string;
  /** ISO. Inyectable para poder probar. */
  cuando: string;
}

/**
 * Corrige el importe de un cargo.
 *
 * Devuelve un arreglo nuevo; no muta el que recibe. Fija `montoHeredado` la
 * primera vez y NUNCA después: la segunda corrección sigue midiéndose contra
 * lo que se cotizó, no contra la corrección anterior.
 *
 * Volver al importe original NO borra la marca de editado. Que alguien lo haya
 * tocado y lo haya devuelto a su lugar es información, y `desviacionDe` ya
 * devuelve cero por su cuenta.
 */
export function editarMontoCargo(
  detalles: CargoDetalle[],
  cargoId: string,
  nuevoMonto: number,
  editor: Editor,
): CargoDetalle[] {
  return detalles.map(c => {
    if (c.id !== cargoId) return c;
    if (c.monto === nuevoMonto) return c;
    return {
      ...c,
      monto: nuevoMonto,
      montoHeredado: c.montoHeredado ?? c.monto,
      editadoPor: editor.nombre,
      editadoEn: editor.cuando,
    };
  });
}

/** Deshace la corrección: vuelve al importe heredado y borra la marca. */
export function restaurarMontoCargo(
  detalles: CargoDetalle[],
  cargoId: string,
): CargoDetalle[] {
  return detalles.map(c => {
    if (c.id !== cargoId || c.montoHeredado === undefined) return c;
    const { montoHeredado, editadoPor, editadoEn, ...resto } = c;
    return { ...resto, monto: montoHeredado };
  });
}
