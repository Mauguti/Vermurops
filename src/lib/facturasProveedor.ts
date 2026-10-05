/**
 * facturasProveedor.ts (tarea 58)
 *
 * Un renglón por FACTURA del proveedor en Cuentas por pagar.
 *
 * ── El duplicado de IDAMEX ─────────────────────────────────────────────────
 * Julio vio IDAMEX dos veces en la vista por proveedor. No era un error de
 * datos: las dos pantallas de Cuentas por pagar cuentan ÓRDENES, y una sola
 * factura del proveedor puede estar repartida en varias órdenes —maniobras y
 * almacenaje del mismo embarque, por ejemplo—. Reproducido en emulador: tres
 * órdenes de IDAMEX, dos de ellas con la misma factura F-IDA-1201, se ven
 * como tres renglones; el proveedor mandó DOS facturas.
 *
 * Y es la clase de error que cuesta dinero: quien ve tres renglones programa
 * tres pagos. El proveedor emite una factura por todo lo que prestó (§4.14),
 * así que la unidad de lo que se debe es la FACTURA, no la orden.
 *
 * ── Qué identifica a una factura ───────────────────────────────────────────
 * En orden de confianza:
 *   1. `facturaUUID` — el folio fiscal del CFDI. Único por definición.
 *   2. `facturaDatos.numero` — lo que el clasificador leyó del documento.
 *   3. `facturaAsociada` — la referencia que alguien tecleó.
 * Siempre dentro del MISMO proveedor: dos proveedores distintos pueden tener
 * su «A-001» y no son la misma factura.
 *
 * Una orden sin ninguna de las tres NO se agrupa con nadie: es su propio
 * renglón, marcado «sin factura». Juntar las sueltas de un proveedor en un
 * renglón diría que existe una factura que nadie ha visto.
 *
 * Lógica pura: sin React ni Firestore.
 */

import type { EstadoOC, OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import { sumarPorMoneda, monedasConMonto, type Moneda } from './sumarPorMoneda';

/** Qué tan avanzada está una orden. La rechazada no existió: va aparte. */
const AVANCE: Record<EstadoOC, number> = {
  solicitada: 0,
  en_gestion: 1,
  autorizada: 2,
  pagada: 3,
  rechazada: 4,
};

export interface FacturaProveedor {
  /** Llave estable: proveedor + factura. Sirve de `key` y de id de expansión. */
  clave: string;
  proveedorId: string;
  proveedorNombre: string;
  /** Lo que se le enseña a Julio: «F-IDA-1201». null si la orden no trae factura. */
  numero: string | null;
  /** De dónde salió el número, para no fingir precisión que no hay. */
  fuente: 'uuid' | 'clasificador' | 'capturada' | 'sin_factura';
  /** Folio fiscal, cuando la orden lo trae (tarea 55). */
  uuid: string | null;
  /** Las órdenes que cubre, de la más vieja a la más nueva. */
  ordenes: OrdenCompra[];
  /** Los folios de esas órdenes: el «COD» que enlaza a cada ficha. */
  folios: string[];
  /**
   * Lo que se debe, POR MONEDA (§4.3). Las rechazadas no suman: no existieron.
   */
  totales: Record<Moneda, number>;
  monedas: Moneda[];
  /** Verdadero si las órdenes de una misma factura no coinciden en moneda. */
  monedasMezcladas: boolean;
  /** El estado MENOS avanzado de sus órdenes: una factura no está pagada
   *  mientras le falte una orden por pagar (§4.14). */
  estado: EstadoOC;
  /** La fecha de pago que manda: la más próxima de sus órdenes. */
  fechaPago: string | null;
  /** Verdadero si sus órdenes traen fechas de pago distintas. */
  fechasDistintas: boolean;
  /** Alguna de sus órdenes está marcada «No pagar». */
  noPagar: boolean;
}

export interface ProveedorConFacturas {
  proveedorId: string;
  proveedorNombre: string;
  facturas: FacturaProveedor[];
  /** Lo que se le debe al proveedor, por moneda, sumando sus facturas. */
  totales: Record<Moneda, number>;
  monedas: Moneda[];
  /** Cuántas órdenes hay detrás, que no es lo mismo que cuántas facturas. */
  totalOrdenes: number;
}

const MONEDAS: Moneda[] = ['USD', 'MXN'];

/** Normaliza el número de factura: «f-ida 1201» y «F-IDA-1201» son la misma. */
export function normalizarNumeroFactura(valor: string): string {
  return valor.trim().toLowerCase().replace(/[\s_.-]+/g, '');
}

/** Qué factura es esta orden, y de dónde se supo. */
export function identificarFactura(oc: OrdenCompra): {
  numero: string | null;
  uuid: string | null;
  fuente: FacturaProveedor['fuente'];
  clave: string;
} {
  const uuid = oc.facturaUUID?.trim() || null;
  const delClasificador = oc.facturaDatos?.numero?.trim() || null;
  const capturada = oc.facturaAsociada?.trim() || null;

  // El número que se MUESTRA es el legible, aunque la llave sea el UUID: a
  // Julio el folio fiscal no le dice nada y el número de la factura sí.
  const numero = delClasificador || capturada || null;

  if (uuid) return { numero: numero ?? uuid, uuid, fuente: 'uuid', clave: `uuid:${uuid.toLowerCase()}` };
  if (delClasificador) {
    return { numero: delClasificador, uuid: null, fuente: 'clasificador', clave: `num:${normalizarNumeroFactura(delClasificador)}` };
  }
  if (capturada) {
    return { numero: capturada, uuid: null, fuente: 'capturada', clave: `num:${normalizarNumeroFactura(capturada)}` };
  }
  // Sin factura no se agrupa: la llave lleva el id de la orden.
  return { numero: null, uuid: null, fuente: 'sin_factura', clave: `oc:${oc.id}` };
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Las facturas del proveedor detrás de un conjunto de órdenes.
 *
 * Se devuelven agrupadas por proveedor para que un proveedor aparezca UNA
 * vez, con sus facturas dentro. Las órdenes inactivas (baja lógica) no entran.
 */
export function facturasPorProveedor(ordenes: OrdenCompra[]): ProveedorConFacturas[] {
  const porFactura = new Map<string, FacturaProveedor>();

  for (const oc of ordenes) {
    if (oc.activo === false) continue;
    const { numero, uuid, fuente, clave: claveFactura } = identificarFactura(oc);
    const clave = `${oc.proveedorId}::${claveFactura}`;

    const actual = porFactura.get(clave);
    if (!actual) {
      porFactura.set(clave, {
        clave,
        proveedorId: oc.proveedorId,
        proveedorNombre: oc.proveedorNombre,
        numero, fuente, uuid,
        ordenes: [oc],
        folios: [oc.folio],
        totales: { USD: 0, MXN: 0 },
        monedas: [],
        monedasMezcladas: false,
        estado: oc.estado,
        fechaPago: oc.fechaSugeridaPago ?? null,
        fechasDistintas: false,
        noPagar: oc.noPagar === true,
      });
      continue;
    }

    actual.ordenes.push(oc);
    actual.folios.push(oc.folio);
    actual.noPagar = actual.noPagar || oc.noPagar === true;
    // El UUID puede llegar en una de las órdenes y no en la otra.
    if (!actual.uuid && uuid) { actual.uuid = uuid; actual.fuente = 'uuid'; }
    if (!actual.numero && numero) actual.numero = numero;
  }

  // Segunda pasada: lo que se deriva del conjunto de órdenes de cada factura.
  for (const f of porFactura.values()) {
    f.ordenes.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
    f.folios = f.ordenes.map(o => o.folio);

    const cuentan = f.ordenes.filter(o => o.estado !== 'rechazada');
    f.totales = sumarPorMoneda(cuentan, o => o.monto ?? 0, o => o.moneda);
    f.monedas = MONEDAS.filter(m => monedasConMonto(f.totales).includes(m));
    f.monedasMezcladas = new Set(cuentan.map(o => o.moneda)).size > 1;

    // El estado MENOS avanzado de las que cuentan. Si todas se rechazaron, la
    // factura está rechazada: decir «solicitada» inventaría trabajo vivo.
    const base = cuentan.length > 0 ? cuentan : f.ordenes;
    f.estado = base.reduce<EstadoOC>(
      (menos, o) => (AVANCE[o.estado] < AVANCE[menos] ? o.estado : menos),
      base[0].estado,
    );

    const fechas = [...new Set(cuentan.map(o => o.fechaSugeridaPago).filter((x): x is string => !!x))].sort();
    f.fechaPago = fechas[0] ?? null;
    f.fechasDistintas = fechas.length > 1;
  }

  // Agrupadas por proveedor: una vez cada uno.
  const porProveedor = new Map<string, ProveedorConFacturas>();
  for (const f of porFactura.values()) {
    const p = porProveedor.get(f.proveedorId) ?? {
      proveedorId: f.proveedorId,
      proveedorNombre: f.proveedorNombre,
      facturas: [],
      totales: { USD: 0, MXN: 0 },
      monedas: [],
      totalOrdenes: 0,
    };
    p.facturas.push(f);
    p.totalOrdenes += f.ordenes.length;
    MONEDAS.forEach(m => { p.totales[m] = redondear(p.totales[m] + f.totales[m]); });
    porProveedor.set(f.proveedorId, p);
  }

  for (const p of porProveedor.values()) {
    p.monedas = MONEDAS.filter(m => monedasConMonto(p.totales).includes(m));
    // Lo más urgente arriba: primero lo que ya tiene fecha, de la más próxima
    // a la más lejana; las sin fecha al final.
    p.facturas.sort((a, b) =>
      (a.fechaPago ?? '9999').localeCompare(b.fechaPago ?? '9999')
      || (a.numero ?? '').localeCompare(b.numero ?? '', 'es'));
  }

  return [...porProveedor.values()].sort(
    (a, b) => a.proveedorNombre.localeCompare(b.proveedorNombre, 'es'),
  );
}

/**
 * Cuántos renglones AHORRA agrupar por factura, para decirlo en pantalla.
 *
 * Si es cero, la vista por factura y la de órdenes muestran lo mismo y no hay
 * por qué presumir nada.
 */
export function ordenesAgrupadas(proveedores: ProveedorConFacturas[]): number {
  return proveedores.reduce(
    (acc, p) => acc + p.facturas.reduce((a, f) => a + Math.max(0, f.ordenes.length - 1), 0),
    0,
  );
}
