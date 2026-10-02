/**
 * parsearCFDI.ts — Lectura de XML CFDI 4.0 en el navegador.
 *
 * Tarea 55: al cargar la factura del proveedor en la orden de compra, si
 * viene el XML del CFDI se lee aquí — sin n8n, sin servidor. DOMParser
 * está en todos los navegadores; no necesita dependencias.
 *
 * Solo extrae lo que la ficha necesita: UUID, RFC/nombre del emisor,
 * fecha, moneda, subtotal, IVA trasladado, retenciones y total. No
 * valida el sello ni la cadena: eso es responsabilidad del PAC.
 */

// ─── Resultado ───────────────────────────────────────────────────────────────

export interface DatosCFDI {
  uuid: string;
  rfcEmisor: string;
  nombreEmisor: string;
  fecha: string;          // ISO de <Comprobante Fecha="...">
  moneda: string;         // "MXN", "USD"
  subtotal: number;
  total: number;
  /** Suma de traslados (IVA). null si no hay nodo de impuestos. */
  ivaTrasladado: number | null;
  /** Tasa IVA predominante (16, 0, etc.). null si ambigua o ausente. */
  tasaIVA: number | null;
  /** Suma de retenciones. null si no hay. */
  retenciones: number | null;
}

export interface ResultadoCFDI {
  ok: true;
  datos: DatosCFDI;
}

export interface ErrorCFDI {
  ok: false;
  error: string;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parsea un string XML de CFDI 4.0 (o 3.3) y extrae los datos fiscales.
 *
 * Usa getElementsByTagNameNS para no depender de los prefijos — el SAT
 * publica el esquema con `cfdi:` pero un PAC puede usar otro prefijo.
 */
export function parsearCFDI(xml: string): ResultadoCFDI | ErrorCFDI {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  // DOMParser no lanza: mete un <parsererror> si no puede parsear.
  const err = doc.querySelector('parsererror');
  if (err) return { ok: false, error: 'El archivo no es un XML válido.' };

  // ── Comprobante ──────────────────────────────────────────────────────────
  const NS_CFDI = 'http://www.sat.gob.mx/cfd/4';
  const NS_CFDI_33 = 'http://www.sat.gob.mx/cfd/3';
  const NS_TFD = 'http://www.sat.gob.mx/TimbreFiscalDigital';

  let comp = doc.getElementsByTagNameNS(NS_CFDI, 'Comprobante')[0];
  if (!comp) comp = doc.getElementsByTagNameNS(NS_CFDI_33, 'Comprobante')[0];
  if (!comp) return { ok: false, error: 'No se encontró el nodo Comprobante del CFDI.' };

  const fecha = comp.getAttribute('Fecha') ?? '';
  const moneda = comp.getAttribute('Moneda') ?? 'MXN';
  const subtotal = parseFloat(comp.getAttribute('SubTotal') ?? '');
  const total = parseFloat(comp.getAttribute('Total') ?? '');

  if (isNaN(subtotal) || isNaN(total)) {
    return { ok: false, error: 'No se pudo leer el subtotal o total del CFDI.' };
  }

  // ── Emisor ───────────────────────────────────────────────────────────────
  const ns = comp.namespaceURI ?? NS_CFDI;
  let emisor = doc.getElementsByTagNameNS(ns, 'Emisor')[0];
  if (!emisor) emisor = doc.getElementsByTagNameNS(NS_CFDI_33, 'Emisor')[0];

  const rfcEmisor = emisor?.getAttribute('Rfc') ?? '';
  const nombreEmisor = emisor?.getAttribute('Nombre') ?? '';

  if (!rfcEmisor) {
    return { ok: false, error: 'No se encontró el RFC del emisor en el CFDI.' };
  }

  // ── Impuestos ────────────────────────────────────────────────────────────
  let ivaTrasladado: number | null = null;
  let tasaIVA: number | null = null;
  let retenciones: number | null = null;

  // Traslados: buscamos todos los nodos Traslado y sumamos los de IVA (impuesto "002").
  const traslados = doc.getElementsByTagNameNS(ns, 'Traslado');
  if (traslados.length === 0 && ns !== NS_CFDI_33) {
    // Intentar con NS 3.3
    const t33 = doc.getElementsByTagNameNS(NS_CFDI_33, 'Traslado');
    if (t33.length > 0) {
      for (let i = 0; i < t33.length; i++) traslados[i] = t33[i];
    }
  }

  const tasasVistas = new Set<number>();
  let sumaIVA = 0;
  let hayTraslados = false;

  for (let i = 0; i < traslados.length; i++) {
    const t = traslados[i];
    // Solo IVA (clave 002 del SAT)
    const impuesto = t.getAttribute('Impuesto');
    if (impuesto !== '002') continue;

    const importe = parseFloat(t.getAttribute('Importe') ?? '');
    if (!isNaN(importe)) {
      sumaIVA += importe;
      hayTraslados = true;
    }

    const tasa = parseFloat(t.getAttribute('TasaOCuota') ?? '');
    if (!isNaN(tasa)) {
      // SAT almacena 0.160000 para 16%
      tasasVistas.add(Math.round(tasa * 100));
    }
  }

  if (hayTraslados) {
    ivaTrasladado = Math.round(sumaIVA * 100) / 100;
    // Si todas las líneas tienen la misma tasa, la reportamos.
    if (tasasVistas.size === 1) {
      tasaIVA = [...tasasVistas][0];
    }
  }

  // Retenciones
  const rets = doc.getElementsByTagNameNS(ns, 'Retencion');
  let sumaRet = 0;
  let hayRet = false;
  for (let i = 0; i < rets.length; i++) {
    const importe = parseFloat(rets[i].getAttribute('Importe') ?? '');
    if (!isNaN(importe)) { sumaRet += importe; hayRet = true; }
  }
  if (hayRet) retenciones = Math.round(sumaRet * 100) / 100;

  // ── Timbre Fiscal Digital → UUID ─────────────────────────────────────────
  let tfd = doc.getElementsByTagNameNS(NS_TFD, 'TimbreFiscalDigital')[0];
  const uuid = tfd?.getAttribute('UUID') ?? '';
  if (!uuid) {
    return { ok: false, error: 'No se encontró el UUID (TimbreFiscalDigital) en el CFDI.' };
  }

  return {
    ok: true,
    datos: {
      uuid: uuid.toUpperCase(),
      rfcEmisor,
      nombreEmisor,
      fecha,
      moneda,
      subtotal,
      total,
      ivaTrasladado,
      tasaIVA,
      retenciones,
    },
  };
}

// ─── Avisos de la tarea 55 ───────────────────────────────────────────────────

export interface AvisoCFDI {
  tipo: 'rfc_no_coincide' | 'total_difiere' | 'uuid_duplicado';
  mensaje: string;
}

/**
 * Genera los avisos (no frenos) al cargar una factura en una OC.
 *
 * 1. El RFC del emisor no coincide con el del proveedor de la orden.
 * 2. El total difiere del monto de la orden (mismo cotejo que ya existe).
 * 3. El UUID ya está en otra orden (factura duplicada).
 */
export function avisosCFDI(
  datos: DatosCFDI,
  oc: { proveedorNombre: string; monto: number; moneda: string },
  rfcProveedor: string | null | undefined,
  uuidsExistentes: string[],
): AvisoCFDI[] {
  const avisos: AvisoCFDI[] = [];

  // 1. RFC
  if (rfcProveedor && datos.rfcEmisor.toUpperCase() !== rfcProveedor.toUpperCase()) {
    avisos.push({
      tipo: 'rfc_no_coincide',
      mensaje: `El RFC del emisor (${datos.rfcEmisor}) no coincide con el del proveedor ${oc.proveedorNombre} (${rfcProveedor}).`,
    });
  }

  // 2. Total
  if (datos.moneda === oc.moneda) {
    const diff = Math.abs(datos.total - oc.monto);
    if (diff > 0.01) {
      avisos.push({
        tipo: 'total_difiere',
        mensaje: `El total de la factura (${datos.moneda} ${datos.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}) difiere del monto de la orden (${oc.moneda} ${oc.monto.toLocaleString('en-US', { minimumFractionDigits: 2 })}).`,
      });
    }
  }

  // 3. UUID duplicado
  if (uuidsExistentes.some(u => u.toUpperCase() === datos.uuid)) {
    avisos.push({
      tipo: 'uuid_duplicado',
      mensaje: `El UUID ${datos.uuid} ya está asociado a otra orden de compra. Podría ser una factura duplicada.`,
    });
  }

  return avisos;
}

/**
 * Cotejo del total de la factura contra el monto de la OC.
 * Mismo criterio que `cotejarTotalConOC` de conciliacionFactura.
 */
export function cotejarTotal(
  totalFactura: number | null,
  montoOC: number,
  monedaFactura: string,
  monedaOC: string,
): 'coincide' | 'difiere' | 'sin_total' {
  if (totalFactura == null) return 'sin_total';
  if (monedaFactura !== monedaOC) return 'difiere';
  return Math.abs(totalFactura - montoOC) <= 0.01 ? 'coincide' : 'difiere';
}
