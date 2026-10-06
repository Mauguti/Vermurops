/**
 * pagos.ts — el movimiento de dinero como entidad, y la lectura unificada
 * de lo que ya existe (PLAN-PAGOS §1.1, §1.4, §2.1 · paso P1).
 *
 * ── El principio ───────────────────────────────────────────────────────────
 * Es el de `anticipos.ts`, subido un nivel: **el dinero que se movió es un
 * hecho; a qué se aplicó es una decisión reversible.** Por eso el pago y sus
 * aplicaciones viven en un documento, y lo aplicado se DERIVA — nunca se
 * guarda como un saldo que alguien tenga que recordar actualizar.
 *
 * ── Qué resuelve que hoy no se puede ──────────────────────────────────────
 * Hoy el lado del cliente tiene dos formas incompatibles: `CobroCliente`
 * apunta a UNA factura y `DepositoCliente` a NINGUNA, y las dos exigen
 * `embarqueId`. «Un cliente paga doce facturas con una transferencia» son
 * doce documentos con la misma referencia copiada a mano, y ninguno sabe de
 * los otros. Un pago con N aplicaciones es un documento.
 *
 * ── Qué hace este archivo (P1 y P2) ──────────────────────────────────────
 * **P1 unificó la LECTURA**: los cobros y los depósitos que ya están en
 * Firestore se leen como pagos —`pagoDesdeCobro`, `pagoDesdeDeposito`— y los
 * diez call sites del §2.2 consumen una sola lista. El número en pantalla es
 * el mismo antes y después; `pagos.equivalencia.test.ts` lo fija.
 *
 * **P2 cambió la ESCRITURA**: `registrarCobro` y `registrarDeposito` crean un
 * documento en `pagos/` con `construirPagoDeCobro` y
 * `construirPagoDeDeposito`. `cobros/` y `depositosCliente/` quedan de solo
 * lectura: dejan de escribirse, no se migran y no se borran.
 *
 * ⚠️ `pagos/` necesita su regla publicada en `firestore.rules`. Sin ella la
 * escritura falla con «permission denied» — a gritos, no en silencio. Es la
 * lección de §3 del CLAUDE.md: la regla escrita no basta, hay que publicarla.
 *
 * **No hay riesgo de doble conteo, y es por construcción:** un movimiento de
 * dinero vive en `pagos` **o** en `cobros`/`depositosCliente`, nunca en los
 * dos. Lo nuevo solo se escribirá en `pagos`; lo viejo solo se lee. Esa es
 * toda la regla, y es la razón para no migrar: una migración sí introduciría
 * el riesgo que no existe.
 *
 * Sin React, sin Firestore, sin red.
 */

import type { CobroCliente } from '../components/facturas/FacturasData';
import type { DepositoCliente, OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import type { Moneda } from './sumarPorMoneda';
import { montoATransferir } from './anticipos';

// ─────────────────────────────────────────────────────────────────────────────
// 1 · El modelo (§1.1)
// ─────────────────────────────────────────────────────────────────────────────

export type LadoPago = 'cliente' | 'proveedor';

/** El comprobante del pago en Storage: `pagos/{id}/`. */
export interface ArchivoPago {
  url: string;
  nombre: string;
  /** ISO. */
  subidoEn: string;
}

/** A qué se aplicó una parte de un pago. */
export interface AplicacionPago {
  /** Qué se está liquidando. */
  destinoTipo: 'factura' | 'orden';
  /** FK → facturas/{id} (cliente) u ordenesCompra/{id} (proveedor). */
  destinoId: string;
  /** Folio legible, congelado: «F-2026-0145», «OC-2026-0088». */
  destinoNumero: string;
  /** Lo que se aplica a ESTE destino. Puede ser parcial. */
  monto: number;
  /** Igual a `pago.moneda`. Se repite para que la línea se lea sola. */
  moneda: Moneda;
  /** Quién y cuándo la aplicó. Una aplicación se quita, no se edita. */
  aplicadaPor: { uid: string; nombre: string; fecha: string };
}

export interface Pago {
  id: string;
  /** «PAG-2026-0001». Folio atómico con folioService, como la OC. */
  folio: string;

  lado: LadoPago;

  // ── El tercero. Uno solo por pago: un pago no cubre a dos proveedores ─────
  terceroTipo: 'cliente' | 'proveedor';
  /** FK → clientes/ o proveedores/. */
  terceroId: string | null;
  terceroNombre: string;

  // ── El movimiento ─────────────────────────────────────────────────────────
  monto: number;
  moneda: Moneda;
  /** YYYY-MM-DD. La fecha en que el dinero se movió, no la de captura. */
  fecha: string;
  /** Cuenta de Vermur: el id o el nombre guardado; se resuelve con `resolverBancoVermur`. */
  banco: string | null;
  /** Puede llegar DESPUÉS del pago (bloque 1). Nunca obligatoria. */
  referencia: string | null;
  /** Comprobante en Storage: `pagos/{id}/`. */
  comprobante: ArchivoPago | null;

  // ── Las aplicaciones ──────────────────────────────────────────────────────
  aplicaciones: AplicacionPago[];
  /**
   * Índice denormalizado = aplicaciones.map(a => a.destinoId).
   * Existe solo para poder consultar «pagos que tocan esta factura» sin bajar
   * la colección: Firestore no sabe buscar dentro de un array de objetos.
   * Se escribe en la MISMA transacción que `aplicaciones`.
   */
  destinoIds: string[];

  // ── Contexto heredado, informativo ────────────────────────────────────────
  /**
   * Embarques que tocan sus aplicaciones. DERIVADO al guardar.
   *
   * Es lo que `CobroCliente.embarqueId` —un solo string obligatorio— no podía
   * representar: una transferencia que cubre facturas de dos embarques fondea
   * los dos, cada uno por lo que le toca (ver `entradasDeFondeo`).
   */
  embarqueIds: string[];

  // ── De dónde vino, para leer lo viejo sin migrarlo (§2) ───────────────────
  origen?: 'app' | 'legacy_cobro' | 'legacy_deposito' | 'legacy_comprobante_oc';

  registradoPor: { uid: string; nombre: string };
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Las derivaciones: aplicado, restante, estado
//
// Ninguna se guarda. §1.1: «lo aplicado se DERIVA, nunca se guarda como saldo
// que alguien tenga que recordar actualizar».
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lo aplicado de un pago.
 *
 * §4.3: solo suma las aplicaciones de LA MONEDA del pago. Por construcción
 * son todas —`aplicacion.moneda` es igual a `pago.moneda`— pero el filtro
 * está escrito porque un documento de Firestore puede traer cualquier cosa,
 * y un total que mezcle monedas se ve perfectamente bien.
 */
export function aplicado(pago: Pick<Pago, 'moneda' | 'aplicaciones'>): number {
  const deLaMoneda = (pago.aplicaciones ?? []).filter(
    a => (a.moneda ?? pago.moneda) === pago.moneda,
  );
  return redondear(deLaMoneda.reduce((acc, a) => acc + (a.monto ?? 0), 0));
}

/** Lo que del pago todavía no se aplicó a nada: el «a cuenta». */
export function sinAplicar(pago: Pick<Pago, 'monto' | 'moneda' | 'aplicaciones'>): number {
  return redondear(pago.monto - aplicado(pago));
}

/** Un pago vivo. Un pago anulado no mueve ningún saldo. */
const vivo = (p: Pick<Pago, 'activo'>) => p.activo !== false;

/**
 * Las aplicaciones VIVAS a un destino, con el pago que las originó.
 *
 * `incluirAnulados` existe para las pantallas que hoy listan los cobros
 * anulados —la pestaña Facturas del embarque lo hace— y que no deben cambiar
 * en este paso.
 */
export function aplicacionesConPago(
  destinoId: string,
  pagos: readonly Pago[],
  opciones: { incluirAnulados?: boolean } = {},
): { pago: Pago; aplicacion: AplicacionPago }[] {
  const out: { pago: Pago; aplicacion: AplicacionPago }[] = [];
  for (const p of pagos) {
    if (!opciones.incluirAnulados && !vivo(p)) continue;
    for (const a of p.aplicaciones ?? []) {
      if (a.destinoId === destinoId) out.push({ pago: p, aplicacion: a });
    }
  }
  return out;
}

/**
 * Las aplicaciones vivas a un destino.
 *
 * Es lo que `saldoDeFactura` espera —`{ monto, moneda }`— así que la factura
 * sigue calculando su saldo con la misma función de siempre, sin cambios:
 * lo único que cambia es quién le pasa la lista.
 */
export function aplicacionesA(destinoId: string, pagos: readonly Pago[]): AplicacionPago[] {
  return aplicacionesConPago(destinoId, pagos).map(x => x.aplicacion);
}

export interface AvanceDestino {
  /** Σ de las aplicaciones vivas en la moneda del destino. */
  aplicado: number;
  /** total − aplicado. Negativo = sobrepagado. */
  restante: number;
  estado: 'sin_pago' | 'parcial' | 'liquidado';
  /** Hay aplicaciones en otra moneda que no cuentan para este saldo (§4.3). */
  avisoMoneda?: string;
}

/**
 * Cuánto se ha pagado de un destino y cuánto falta.
 *
 * La misma forma que `saldoDeFactura`, que se conserva intacta para las
 * facturas (§1.3). Esta sirve al lado proveedor, donde la orden de compra no
 * tiene nada equivalente: hoy solo salta a `pagada`, entera, y «se le
 * abonaron 20,000 de 50,000» no existe.
 *
 * **No agrega el estado `pagada_parcial` a la máquina de la OC** (§1.5): lo
 * parcial se lee como un AVANCE. La máquina tiene 54 tests y `pagada` es
 * terminal; el estado entra después, si Julio lo pide para filtrar.
 *
 * Tolerancia de un peso, como `saldoDeFactura`: los redondeos de IVA dejan
 * centavos que no son una deuda y nadie va a perseguir.
 */
export function avanceDeDestino(
  destino: { id: string; monto: number; moneda: Moneda },
  pagos: readonly Pago[],
): AvanceDestino {
  const todas = aplicacionesA(destino.id, pagos);
  const deLaMoneda = todas.filter(a => (a.moneda ?? destino.moneda) === destino.moneda);
  const enOtraMoneda = todas.length - deLaMoneda.length;

  // Una sola moneda por construcción: el filtro de arriba lo garantiza.
  const ap = redondear(deLaMoneda.reduce((acc, a) => acc + (a.monto ?? 0), 0));
  const restante = redondear(destino.monto - ap);

  return {
    aplicado: ap,
    restante,
    estado: restante <= 1 ? 'liquidado' : ap > 0 ? 'parcial' : 'sin_pago',
    ...(enOtraMoneda > 0
      ? { avisoMoneda: `${enOtraMoneda} aplicación(es) en otra moneda no cuentan para el saldo en ${destino.moneda}.` }
      : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Los adaptadores de lo viejo (§2.1)
//
// Rellenan lo que al dato viejo le falta, sin tocarlo. Nada se migra.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un cobro viejo leído como pago: **un pago con una sola aplicación**.
 *
 * El folio es su propio id (`COB-…`): no hay folio de pago que inventarle, y
 * un folio inventado se vería igual que uno real.
 */
export function pagoDesdeCobro(c: CobroCliente): Pago {
  const quien = c.registradoPor ?? { uid: '', nombre: '' };
  return {
    id: c.id,
    folio: c.id,
    lado: 'cliente',
    terceroTipo: 'cliente',
    terceroId: c.clienteId ?? null,
    terceroNombre: c.clienteNombre ?? '',
    monto: c.monto,
    moneda: c.moneda,
    fecha: c.fechaCobro,
    banco: c.banco ?? null,
    referencia: c.referencia ?? null,
    comprobante: null,
    aplicaciones: [{
      destinoTipo: 'factura',
      destinoId: c.facturaId,
      destinoNumero: c.facturaNumero ?? '',
      monto: c.monto,
      moneda: c.moneda,
      aplicadaPor: { uid: quien.uid, nombre: quien.nombre, fecha: c.fechaCobro },
    }],
    destinoIds: [c.facturaId],
    embarqueIds: c.embarqueId ? [c.embarqueId] : [],
    origen: 'legacy_cobro',
    registradoPor: quien,
    activo: c.activo !== false,
    createdAt: c.createdAt ?? '',
    updatedAt: c.updatedAt ?? '',
  };
}

/**
 * Un depósito viejo leído como pago: **un pago con CERO aplicaciones**.
 *
 * `DepositoCliente` no tiene banco (§10.2 del plan): un depósito viejo no se
 * puede conciliar contra una cuenta, así que queda en `null` y en el flujo de
 * efectivo entrará a «sin cuenta identificada» en vez de repartirse por azar.
 * Un depósito en la cuenta equivocada descuadra la conciliación de Julio, que
 * es justo lo que la pantalla viene a arreglar.
 */
export function pagoDesdeDeposito(d: DepositoCliente): Pago {
  const quien = d.registradoPor ?? { uid: '', nombre: '' };
  return {
    id: d.id,
    folio: d.id,
    lado: 'cliente',
    terceroTipo: 'cliente',
    terceroId: d.clienteId ?? null,
    terceroNombre: d.clienteNombre ?? '',
    monto: d.monto,
    moneda: d.moneda,
    fecha: d.fechaDeposito,
    banco: null,
    referencia: d.referencia ?? null,
    comprobante: d.comprobante
      ? { url: d.comprobante, nombre: 'Comprobante', subidoEn: d.fechaAlta ?? '' }
      : null,
    aplicaciones: [],
    destinoIds: [],
    embarqueIds: d.embarqueId ? [d.embarqueId] : [],
    origen: 'legacy_deposito',
    registradoPor: quien,
    activo: d.activo !== false,
    createdAt: d.fechaAlta ?? '',
    updatedAt: d.updatedAt ?? '',
  };
}

/**
 * Todos los pagos del lado cliente, nuevos y viejos, en una lista.
 *
 * `pagos` llega vacío en P1: la colección todavía no se escribe ni se lee
 * —no tiene regla publicada— y un listener contra ella solo produciría
 * «permission denied» en la consola. El parámetro está para que P2 sea una
 * línea en el hook, no un recorrido por diez call sites otra vez.
 */
export function pagosDeCliente(
  pagos: readonly Pago[],
  cobros: readonly CobroCliente[],
  depositos: readonly DepositoCliente[],
): Pago[] {
  return [
    ...pagos.filter(p => p.lado === 'cliente'),
    ...cobros.map(pagoDesdeCobro),
    ...depositos.map(pagoDesdeDeposito),
  ];
}

/**
 * Las órdenes pagadas leídas como pagos, agrupando por `comprobantePago`.
 *
 * Hoy un pago a proveedor son **N escrituras independientes con la misma
 * cadena copiada** (`Finance.tsx:137`). Ese string repetido es el único
 * rastro de que fue UN pago, y agrupar por él es lo que lo recupera: cada
 * grupo es un pago consolidado real que nunca existió como entidad.
 *
 * Se agrupa **dentro del mismo proveedor**: el «TR-001» de dos proveedores
 * son dos transferencias, igual que el «A-001» de dos proveedores son dos
 * facturas (§4.24). La referencia se compara sin guiones, espacios ni
 * mayúsculas, con el mismo criterio que `facturasProveedor.ts`.
 *
 * Una orden pagada **sin** comprobante es su propio pago: juntarla con las
 * demás afirmaría que las cubrió una transferencia que nadie ha visto. Una
 * orden en otra moneda tampoco se junta: un pago tiene UNA moneda (§4.3).
 *
 * Su call site es `pagosDeProveedor` (tarea 73 · P6), que le quita las órdenes
 * que un pago nuevo ya cubre para no contarlas dos veces.
 */
export function pagosDesdeOrdenes(ordenes: readonly OrdenCompra[]): Pago[] {
  const normalizar = (s: string) => s.replace(/[\s-_.\/]/g, '').toUpperCase();

  const grupos = new Map<string, OrdenCompra[]>();
  const sueltas: OrdenCompra[] = [];

  for (const o of ordenes) {
    if (o.activo === false || o.estado !== 'pagada') continue;
    const ref = (o.comprobantePago ?? '').trim();
    if (!ref) { sueltas.push(o); continue; }
    const clave = `${o.proveedorId ?? o.proveedorNombre ?? ''}|${o.moneda}|${normalizar(ref)}`;
    const g = grupos.get(clave);
    if (g) g.push(o); else grupos.set(clave, [o]);
  }

  const dePrimera = (gs: OrdenCompra[]) => gs[0];
  const armar = (gs: OrdenCompra[], id: string): Pago => {
    const o = dePrimera(gs);
    const quien = o.pagadaPor ?? { uid: '', nombre: '' };
    const fecha = (o.pagadaPor?.fecha ?? o.updatedAt ?? '').slice(0, 10);
    // Una sola moneda por construcción: la clave del grupo la incluye (§4.3).
    const monto = redondear(gs.reduce((acc, x) => acc + (x.monto ?? 0), 0));
    return {
      id,
      folio: (o.comprobantePago ?? '').trim() || o.folio,
      lado: 'proveedor',
      terceroTipo: 'proveedor',
      terceroId: o.proveedorId ?? null,
      terceroNombre: o.proveedorNombre ?? '',
      monto,
      moneda: o.moneda,
      fecha,
      banco: o.bancoSalida ?? null,
      referencia: (o.comprobantePago ?? '').trim() || null,
      comprobante: null,
      aplicaciones: gs.map(x => ({
        destinoTipo: 'orden' as const,
        destinoId: x.id,
        destinoNumero: x.folio,
        monto: x.monto,
        moneda: x.moneda,
        aplicadaPor: {
          uid: x.pagadaPor?.uid ?? '',
          nombre: x.pagadaPor?.nombre ?? '',
          fecha: (x.pagadaPor?.fecha ?? x.updatedAt ?? '').slice(0, 10),
        },
      })),
      destinoIds: gs.map(x => x.id),
      embarqueIds: [...new Set(gs.map(x => x.embarqueId).filter((e): e is string => !!e))],
      origen: 'legacy_comprobante_oc',
      registradoPor: { uid: quien.uid ?? '', nombre: quien.nombre ?? '' },
      activo: true,
      createdAt: fecha,
      updatedAt: o.updatedAt ?? '',
    };
  };

  return [
    ...[...grupos.entries()].map(([clave, gs]) => armar(gs, `legacy:${clave}`)),
    ...sueltas.map(o => armar([o], `legacy:sin-comprobante:${o.id}`)),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Escribir un pago (§1.3 · paso P2)
//
// `registrarCobro` y `registrarDeposito` dejan de escribir en `cobros/` y
// `depositosCliente/` y pasan a escribir UN documento en `pagos/`. La firma
// pública de los dos hooks no cambia: lo que entra es exactamente lo que
// entraba, y estas dos funciones lo convierten. Por eso viven aquí y no en el
// hook — son la parte que se puede probar sin Firestore.
//
// **Lo viejo no se migra ni se toca.** Deja de escribirse y se sigue leyendo
// por los adaptadores del §3: un movimiento vive en `pagos` **o** en lo
// viejo, nunca en los dos, que es lo que hace imposible el doble conteo.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que se captura de un cobro contra una factura. La firma de hoy. */
export type DatosCobro = Omit<
  CobroCliente, 'id' | 'registradoPor' | 'activo' | 'createdAt' | 'updatedAt'
>;

/** Lo que se captura de un depósito del cliente. La firma de hoy. */
export type DatosDeposito = Omit<
  DepositoCliente, 'id' | 'registradoPor' | 'activo' | 'fechaAlta' | 'updatedAt'
>;

export interface ContextoPago {
  /** Id del documento en `pagos/`. */
  id: string;
  /** «PAG-2026-0001», reservado con `generateFolioPago`. */
  folio: string;
  por: { uid: string; nombre: string };
  /** ISO. `createdAt` y `updatedAt`. */
  ahora: string;
}

/**
 * Un monto que de verdad mueve dinero.
 *
 * Se valida ANTES de escribir, y lanzando: Firestore acepta un cero y un
 * NaN se guarda como tal, y un pago de cero se ve igual que uno de verdad en
 * la lista. §6: un guardado que falla en silencio es peor que uno que no
 * guarda — este falla a gritos y no escribe nada.
 */
function exigirMonto(monto: number, que: string): number {
  if (!Number.isFinite(monto) || monto <= 0) {
    throw new Error(`${que}: el monto tiene que ser mayor que cero (llegó ${monto}).`);
  }
  return redondear(monto);
}

/**
 * Un cobro contra una factura, escrito como pago: **una sola aplicación, por
 * el monto completo.**
 *
 * Es el mismo documento que `pagoDesdeCobro` produce al leer un cobro viejo,
 * así que las pantallas no distinguen uno de otro — y por eso el número en
 * pantalla no se mueve al cambiar la escritura.
 */
export function construirPagoDeCobro(datos: DatosCobro, ctx: ContextoPago): Pago {
  if (!datos.facturaId) {
    throw new Error('el cobro: falta la factura a la que se aplica.');
  }
  const monto = exigirMonto(datos.monto, 'el cobro');
  return construirPagoAplicado({
    terceroId: datos.clienteId ?? null,
    terceroNombre: datos.clienteNombre ?? '',
    monto,
    moneda: datos.moneda,
    fecha: datos.fechaCobro,
    banco: datos.banco || null,
    referencia: datos.referencia ?? null,
    aplicaciones: [{
      destinoTipo: 'factura',
      destinoId: datos.facturaId,
      destinoNumero: datos.facturaNumero ?? '',
      monto,
      moneda: datos.moneda,
      aplicadaPor: { uid: ctx.por.uid, nombre: ctx.por.nombre, fecha: datos.fechaCobro },
    }],
    embarqueIds: datos.embarqueId ? [datos.embarqueId] : [],
  }, ctx, 'el cobro');
}

/** Lo que se captura de un pago repartido entre varias facturas (tarea 70 · P4). */
export interface DatosPagoAplicado {
  terceroId: string | null;
  terceroNombre: string;
  monto: number;
  moneda: Moneda;
  /** YYYY-MM-DD: el día en que el dinero se movió, no el de captura. */
  fecha: string;
  banco: string | null;
  referencia: string | null;
  /** Puede estar vacío: eso es el «a cuenta». Lo arma `aplicacionesDelReparto`. */
  aplicaciones: AplicacionPago[];
  /** Derivado de las facturas aplicadas: `embarquesDelReparto`. */
  embarqueIds: string[];
}

/**
 * Un pago con N aplicaciones (§7.1 · paso P4).
 *
 * Es la forma general, y `construirPagoDeCobro` es su caso de UNA aplicación:
 * un cobro contra una factura siempre fue esto con N = 1. Un solo constructor
 * para que los dos caminos escriban exactamente el mismo documento — si se
 * escribieran aparte, el pago de doce facturas podría nacer con un campo de
 * menos y nadie lo vería hasta leerlo.
 *
 * **Lo que NO deja escribir:**
 *
 *  - Un pago que aplica más de lo que movió. Es la regla del punto 1 de la
 *    tarea, y se valida aquí además de en la pantalla: el botón se puede
 *    esquivar —otra pestaña, un reparto que quedó viejo— y un pago que
 *    liquida 130,000 con 120,000 se ve perfectamente bien en la lista. Lo
 *    que sobra sí se permite: es el «a cuenta» de `sinAplicar`.
 *  - Una aplicación en otra moneda. §4: un pago tiene UNA moneda, y una
 *    aplicación con otra no contaría para el saldo de su factura
 *    (`saldoDeFactura` la descarta) pero sí se vería como aplicada.
 *  - Una aplicación sin destino, o con monto que no sea mayor que cero.
 */
export function construirPagoAplicado(
  datos: DatosPagoAplicado,
  ctx: ContextoPago,
  que = 'el pago',
): Pago {
  const monto = exigirMonto(datos.monto, que);
  const aplicaciones = datos.aplicaciones ?? [];

  for (const a of aplicaciones) {
    if (!a.destinoId) throw new Error(`${que}: hay una aplicación sin factura.`);
    if (!Number.isFinite(a.monto) || a.monto <= 0) {
      throw new Error(`${que}: la aplicación a ${a.destinoNumero || a.destinoId} no tiene monto.`);
    }
    if (a.moneda !== datos.moneda) {
      throw new Error(
        `${que}: la aplicación a ${a.destinoNumero || a.destinoId} está en ${a.moneda} `
        + `y el pago en ${datos.moneda}. Un pago no se aplica a destinos de otra moneda (§4.3).`,
      );
    }
  }

  // Una sola moneda por construcción: el bucle de arriba lo garantiza (§4.3).
  const aplicado = redondear(aplicaciones.reduce((acc, a) => acc + a.monto, 0));
  // Un peso de tolerancia, el mismo de `saldoDeFactura`: los redondeos de IVA
  // dejan centavos que no son una deuda.
  if (aplicado > monto + 1) {
    throw new Error(
      `${que}: se está aplicando ${aplicado.toLocaleString('en-US', { minimumFractionDigits: 2 })} `
      + `de un pago de ${monto.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`,
    );
  }

  const referencia = (datos.referencia ?? '').trim();
  return {
    id: ctx.id,
    folio: ctx.folio,
    lado: 'cliente',
    terceroTipo: 'cliente',
    terceroId: datos.terceroId || null,
    terceroNombre: datos.terceroNombre ?? '',
    monto,
    moneda: datos.moneda,
    fecha: datos.fecha,
    banco: datos.banco || null,
    // Puede llegar DESPUÉS del pago (§0.3). Vacía se guarda como null, no como ''.
    referencia: referencia || null,
    comprobante: null,
    aplicaciones,
    /* `destinoIds` se deriva de `aplicaciones` y se escribe en la MISMA
       operación (§1.1): es el índice con el que se consulta «pagos de esta
       factura», y un índice que se escribe aparte se desincroniza. */
    destinoIds: [...new Set(aplicaciones.map(a => a.destinoId))],
    embarqueIds: [...new Set((datos.embarqueIds ?? []).filter(Boolean))],
    origen: 'app',
    registradoPor: ctx.por,
    activo: true,
    createdAt: ctx.ahora,
    updatedAt: ctx.ahora,
  };
}

/**
 * Un depósito del cliente, escrito como pago: **CERO aplicaciones.**
 *
 * El dinero entró y todavía no cobra ninguna factura; eso es el «a cuenta»
 * de `sinAplicar`. Fondea las órdenes de su embarque igual que siempre
 * (`entradasDeFondeo`, caso 1).
 *
 * A diferencia del depósito viejo, este **sí trae banco** (§10.2 del plan:
 * `DepositoCliente` no tenía dónde, y un depósito sin cuenta no se puede
 * conciliar). `DatosDeposito` tampoco lo tiene todavía —la pantalla que lo
 * captura es P3—, así que llega por el contexto y mientras queda en null.
 */
export function construirPagoDeDeposito(
  datos: DatosDeposito,
  ctx: ContextoPago & { banco?: string | null },
): Pago {
  const monto = exigirMonto(datos.monto, 'el depósito');
  const referencia = (datos.referencia ?? '').trim();
  return {
    id: ctx.id,
    folio: ctx.folio,
    lado: 'cliente',
    terceroTipo: 'cliente',
    terceroId: datos.clienteId || null,
    terceroNombre: datos.clienteNombre ?? '',
    monto,
    moneda: datos.moneda,
    fecha: datos.fechaDeposito,
    banco: ctx.banco ?? null,
    referencia: referencia || null,
    comprobante: datos.comprobante
      ? { url: datos.comprobante, nombre: 'Comprobante', subidoEn: ctx.ahora }
      : null,
    aplicaciones: [],
    destinoIds: [],
    embarqueIds: datos.embarqueId ? [datos.embarqueId] : [],
    origen: 'app',
    registradoPor: ctx.por,
    activo: true,
    createdAt: ctx.ahora,
    updatedAt: ctx.ahora,
  };
}

/** Lo que se captura al pagar un grupo de órdenes de UN proveedor (tarea 73 · P6). */
export interface DatosPagoDeGrupo {
  /** Lo que identifica la transferencia: obligatoria aquí, la máquina de la OC la exige. */
  referencia: string;
  /** YYYY-MM-DD. El día en que el dinero salió. */
  fecha: string;
}

/**
 * Las razones por las que un grupo de órdenes NO puede ser un solo pago.
 * Vacío = se puede. Se evalúa ANTES de escribir nada: la tarea 73 existe
 * porque el loop de N escrituras dejaba unas órdenes pagadas y otras no.
 */
export function problemasDelGrupo(ordenes: readonly OrdenCompra[]): string[] {
  const out: string[] = [];
  if (ordenes.length === 0) return ['no hay órdenes que pagar.'];
  const proveedores = new Set(ordenes.map(o => o.proveedorId ?? o.proveedorNombre ?? ''));
  if (proveedores.size > 1) out.push('las órdenes son de proveedores distintos: un pago cubre a un solo proveedor.');
  const monedas = new Set(ordenes.map(o => o.moneda));
  if (monedas.size > 1) out.push('las órdenes están en monedas distintas: un pago tiene una sola moneda (§4.3).');
  for (const o of ordenes) {
    if (!Number.isFinite(o.monto) || o.monto <= 0 || montoATransferir(o) <= 0) out.push(`${o.folio}: no tiene monto por transferir.`);
  }
  return out;
}

/**
 * Una transferencia a un proveedor, escrita como UN pago con una aplicación
 * por orden (§7.2 · paso P6). Es el espejo de `construirPagoAplicado`.
 *
 * El monto es la suma de las órdenes, en su moneda única. Una orden SIN
 * factura del proveedor entra igual: se paga lo que está autorizado, y la
 * factura puede llegar después.
 *
 * Lanza antes de escribir si el grupo mezcla proveedores o monedas.
 */
export function construirPagoDeGrupo(
  ordenes: readonly OrdenCompra[],
  datos: DatosPagoDeGrupo,
  ctx: ContextoPago,
): Pago {
  const problemas = problemasDelGrupo(ordenes);
  if (problemas.length > 0) throw new Error(`el pago del grupo: ${problemas.join(' ')}`);
  const referencia = (datos.referencia ?? '').trim();
  if (!referencia) throw new Error('el pago del grupo: falta la referencia de la transferencia.');

  const primera = ordenes[0];
  // Lo que SALE del banco: el monto menos los anticipos ya cruzados, que es
  // el total que Programación de pagos muestra en la tarjeta del grupo. Una
  // sola moneda por construcción: `problemasDelGrupo` rechaza la mezcla (§4.3).
  const aTransferir = (o: OrdenCompra) => montoATransferir(o);
  const monto = exigirMonto(ordenes.reduce((acc, o) => acc + aTransferir(o), 0), 'el pago del grupo');
  const bancos = new Set(ordenes.map(o => o.bancoSalida ?? ''));
  const banco = bancos.size === 1 ? ([...bancos][0] || null) : null;

  const aplicaciones: AplicacionPago[] = ordenes.map(o => ({
    destinoTipo: 'orden',
    destinoId: o.id,
    destinoNumero: o.folio,
    monto: redondear(aTransferir(o)),
    moneda: o.moneda,
    aplicadaPor: { uid: ctx.por.uid, nombre: ctx.por.nombre, fecha: datos.fecha },
  }));

  return {
    id: ctx.id,
    folio: ctx.folio,
    lado: 'proveedor',
    terceroTipo: 'proveedor',
    terceroId: primera.proveedorId ?? null,
    terceroNombre: primera.proveedorNombre ?? '',
    monto,
    moneda: primera.moneda,
    fecha: datos.fecha,
    banco,
    referencia,
    comprobante: null,
    aplicaciones,
    destinoIds: [...new Set(aplicaciones.map(a => a.destinoId))],
    embarqueIds: [...new Set(ordenes.map(o => o.embarqueId).filter((e): e is string => !!e))],
    origen: 'app',
    registradoPor: ctx.por,
    activo: true,
    createdAt: ctx.ahora,
    updatedAt: ctx.ahora,
  };
}

/**
 * Todos los pagos del lado proveedor: los de `pagos/` y los que solo existen
 * como órdenes pagadas con el mismo `comprobantePago`.
 *
 * Una orden pagada desde P6 vive en las DOS partes —el pago y su propio
 * estado `pagada`—, así que `pagosDesdeOrdenes` la leería otra vez como un
 * pago legacy. Se descartan de la lectura legacy las órdenes que un pago
 * vivo ya cubre: un movimiento vive en `pagos` **o** en lo viejo.
 */
export function pagosDeProveedor(
  pagos: readonly Pago[],
  ordenes: readonly OrdenCompra[],
): Pago[] {
  const nuevos = pagos.filter(p => p.lado === 'proveedor');
  const cubiertas = new Set(nuevos.filter(vivo).flatMap(p => p.destinoIds ?? []));
  return [
    ...nuevos,
    ...pagosDesdeOrdenes(ordenes.filter(o => !cubiertas.has(o.id))),
  ];
}

/** El pago vivo que cubrió una orden, o null (pagada antes de P6, o sin pagar). */
export function pagoQueCubrio(ordenId: string, pagos: readonly Pago[]): Pago | null {
  return pagos.find(p => p.lado === 'proveedor' && vivo(p) && (p.destinoIds ?? []).includes(ordenId)) ?? null;
}

/**
 * En qué colección vive el movimiento que lleva ese id.
 *
 * Las pantallas anulan con un id suelto —«¿anular este cobro?»— y después de
 * P2 ese id puede ser de `pagos/` o de un cobro viejo de `cobros/`. Lo
 * decide el `origen` que puso el adaptador, nunca la forma del id: un
 * `COB-…` es legacy porque se leyó de `cobros`, no porque empiece así.
 *
 * Devuelve null cuando el id no está en la lista. Quien anula **tiene que
 * detenerse ahí**: escribir en la colección equivocada crearía un documento
 * nuevo con `activo: false` y el movimiento seguiría vivo en la otra.
 */
export function coleccionDelPago(
  id: string,
  pagos: readonly Pago[],
): 'pagos' | 'cobros' | 'depositosCliente' | null {
  const p = pagos.find(x => x.id === id);
  if (!p) return null;
  if (p.origen === 'legacy_cobro') return 'cobros';
  if (p.origen === 'legacy_deposito') return 'depositosCliente';
  // Un pago derivado de `comprobantePago` NO tiene documento propio: su id es
  // sintético y lo que lo sostiene son N órdenes. Se anula en las órdenes (P6).
  if (p.origen === 'legacy_comprobante_oc') return null;
  return 'pagos';
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 · El fondeo del embarque, leído de los pagos
// ─────────────────────────────────────────────────────────────────────────────

/** Una entrada de dinero, en la forma que `calcularFondeo` consume. */
export interface EntradaFondeo {
  monto: number;
  moneda: Moneda;
  activo?: boolean;
}

/**
 * Lo que los pagos del cliente aportan al fondeo de UN embarque.
 *
 * Reemplaza los dos argumentos que `calcularFondeo` recibía —depósitos y
 * cobros— por una sola lista: eran «el mismo dinero entrando por dos
 * puertas», y leerlos de dos sitios es la dualidad que el CLAUDE.md §6
 * señala en `CotizacionProveedor`.
 *
 * El reparto, en el orden en que decide:
 *
 *  1. Un pago **sin aplicaciones** —un depósito a cuenta— aporta su monto
 *     completo al embarque al que apunta. Es el depósito de siempre.
 *  2. Un pago cuyas aplicaciones caen TODAS en este embarque aporta su monto
 *     aplicado. Un cobro viejo tiene una sola aplicación, así que aporta
 *     exactamente lo que aportaba antes.
 *  3. Un pago repartido entre VARIOS embarques aporta solo lo que le toca a
 *     este, resuelto con `embarqueDeDestino`. Es el caso que `CobroCliente`
 *     no podía representar; sin el resolvedor, el pago **no se cuenta** en
 *     vez de contarse entero en los dos: inflar el fondeo autoriza un pago
 *     que no está cubierto, que es justo lo que la regla viene a impedir.
 */
export function entradasDeFondeo(
  pagos: readonly Pago[],
  embarqueId: string,
  embarqueDeDestino?: (destinoId: string) => string | null | undefined,
): EntradaFondeo[] {
  const out: EntradaFondeo[] = [];

  for (const p of pagos) {
    if (!vivo(p)) continue;
    if (p.lado !== 'cliente') continue;

    const apl = p.aplicaciones ?? [];
    if (apl.length === 0) {
      if ((p.embarqueIds ?? []).includes(embarqueId)) {
        out.push({ monto: p.monto, moneda: p.moneda });
      }
      continue;
    }

    const embarques = new Set(p.embarqueIds ?? []);
    if (embarques.size <= 1) {
      if (embarques.has(embarqueId)) out.push({ monto: aplicado(p), moneda: p.moneda });
      continue;
    }

    if (!embarqueDeDestino) continue;
    const suyas = apl.filter(a => embarqueDeDestino(a.destinoId) === embarqueId);
    if (suyas.length === 0) continue;
    // Una sola moneda: las aplicaciones comparten la del pago (§4.3).
    const monto = redondear(suyas.reduce((acc, a) => acc + (a.monto ?? 0), 0));
    if (monto !== 0) out.push({ monto, moneda: p.moneda });
  }

  return out;
}
