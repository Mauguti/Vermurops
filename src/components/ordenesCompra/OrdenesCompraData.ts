// ============================================================
// OrdenesCompraData.ts — Modelo de datos del módulo de Órdenes de Compra
//
// OC-0: Interfaces, tipos, catálogo ESTADOS_OC con labels/colores, helpers.
//
// Flujo: OPERACIONES solicita y gestiona → ADMINISTRACIÓN autoriza y paga.
// Dos orígenes: desde un embarque (hereda contexto) o suelta (gastos oficina).
// ============================================================

// ─── Sub-objetos ──────────────────────────────────────────────────────────────

/** Archivo subido (PDF o XML de la factura del proveedor). */
export interface ArchivoFacturaOC {
  storagePath: string;
  url: string;
  nombre: string;
  subidoPor: string;
  fecha: string;  // ISO timestamp
}

/**
 * Tarea 63 · Documento de la orden de compra, clasificado por el agente.
 *
 * Es una LISTA y no un mapa por tipo —como el expediente del cliente—
 * porque de un mismo tipo puede haber varios: un pago en dos
 * transferencias son dos comprobantes, y un complemento por cada uno.
 * Indexar por tipo haría que el segundo pisara al primero.
 *
 * El complemento de pago es el que no tenía dónde cargarse: el proveedor lo
 * emite DESPUÉS de cobrar y hoy se quedaba en el correo de Administración.
 */
export interface DocumentoOC {
  /** Id local del renglón, para poder quitar uno sin ambigüedad. */
  id: string;
  /** Tipo confirmado: ver `TipoDocOC` en lib/loteDocumentos.ts. */
  tipo: string;
  nombre: string;
  storagePath: string;
  url: string;
  /** Lo que dijo el agente, literal. Vacío = no contestó. */
  tipoCrudo?: string;
  confianza?: 'alta' | 'media' | 'baja';
  avisos?: string[];
  /**
   * Observaciones del agente y, si alguien corrigió el tipo a mano, el
   * registro de quién y cuándo (`textoCorreccionTipo`).
   */
  observaciones?: string;
  subidoPor: string;
  fecha: string;  // ISO timestamp
}

/** Registro en el historial de cambios de estado de una OC. */
export interface RegistroEstadoOC {
  estado: EstadoOC;
  fecha: string;       // ISO timestamp
  usuarioId: string;
  usuarioNombre: string;
  motivo?: string;     // solo para rechazos
}

/** Referencia a un anticipo cruzado contra esta OC (parcial o total). */
export interface AnticipoRef {
  ocId: string;
  folio: string;
  /** Monto APLICADO a esta OC (puede ser menor al monto total del anticipo). */
  montoAplicado: number;
  moneda: 'USD' | 'MXN';
  fechaPago: string;   // ISO timestamp del pago
}

/** Datos del usuario que ejecutó una acción. */
export interface ActorOC {
  uid: string;
  nombre: string;
  fecha: string;       // ISO timestamp
}

// ─── Estados ──────────────────────────────────────────────────────────────────

export type EstadoOC = 'solicitada' | 'en_gestion' | 'autorizada' | 'pagada' | 'rechazada';

export interface EstadoOCConfig {
  id: EstadoOC;
  label: string;
  color: string;        // Tailwind classes para badge
  icon: string;         // nombre de ícono Lucide
}

export const ESTADOS_OC: EstadoOCConfig[] = [
  {
    id: 'solicitada',
    label: 'Solicitada',
    color: 'bg-amber-100 text-amber-700 border-amber-300',
    icon: 'clock',
  },
  {
    id: 'en_gestion',
    label: 'En gestión',
    color: 'bg-blue-100 text-blue-700 border-blue-300',
    icon: 'settings',
  },
  {
    id: 'autorizada',
    label: 'Autorizada',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    icon: 'check-circle',
  },
  {
    id: 'pagada',
    label: 'Pagada',
    color: 'bg-green-100 text-green-800 border-green-300',
    icon: 'check-circle-2',
  },
  {
    id: 'rechazada',
    label: 'Rechazada',
    color: 'bg-red-100 text-red-700 border-red-300',
    icon: 'x-circle',
  },
] as const;

/** Mapa rápido: estado → config. */
export const ESTADOS_OC_MAP: Record<EstadoOC, EstadoOCConfig> =
  Object.fromEntries(ESTADOS_OC.map(e => [e.id, e])) as Record<EstadoOC, EstadoOCConfig>;

// ─── Origen ───────────────────────────────────────────────────────────────────

export type OrigenOC = 'embarque' | 'oficina';

// ─── Urgencia ─────────────────────────────────────────────────────────────────

export type UrgenciaOC = 'normal' | 'urgente';

// ─── Entidad principal ────────────────────────────────────────────────────────

export interface OrdenCompra {
  /** ID del documento en Firestore. */
  id: string;

  // ── Folio ──────────────────────────────────────────────────────────────────
  /** Folio único atómico: "OC-2026-0001". */
  folio: string;

  // ── Origen ─────────────────────────────────────────────────────────────────
  origen: OrigenOC;
  /** FK → embarques/ (null si origen=oficina). */
  embarqueId: string | null;
  /** Desnormalizado para display rápido. */
  embarqueFolio: string | null;

  // ── Cliente (heredado del embarque) ────────────────────────────────────────
  /** FK → clientes/ (null si origen=oficina o embarque sin cliente). */
  clienteId: string | null;
  clienteNombre: string | null;

  // ── Proveedor ──────────────────────────────────────────────────────────────
  /** FK → proveedores/ */
  proveedorId: string;
  proveedorNombre: string;

  // ── Concepto ───────────────────────────────────────────────────────────────
  /** FK → conceptos/ */
  conceptoId: string;
  conceptoNombre: string;

  // ── Detalle ────────────────────────────────────────────────────────────────
  descripcion: string;
  monto: number;
  moneda: 'USD' | 'MXN';

  // ── Fechas ─────────────────────────────────────────────────────────────────
  /** Fecha en que se necesita el pago. YYYY-MM-DD. */
  fechaRequerida: string;
  /** Calculada: fechaRequerida + diasCredito en días hábiles. YYYY-MM-DD. */
  fechaSugeridaPago: string | null;

  // ── Urgencia y estado ──────────────────────────────────────────────────────
  urgencia: UrgenciaOC;
  estado: EstadoOC;
  motivoRechazo: string | null;
  historialEstados: RegistroEstadoOC[];

  // ── Actores ────────────────────────────────────────────────────────────────
  solicitadaPor: ActorOC | null;
  gestionadaPor: ActorOC | null;
  autorizadaPor: ActorOC | null;
  pagadaPor: ActorOC | null;

  // ── Pago ───────────────────────────────────────────────────────────────────
  /** FK → proveedor.cuentasBancarias[i].id */
  cuentaBancariaId: string | null;
  /** Banco de Vermur desde donde sale el pago. */
  bancoSalida: string | null;
  /** Cuenta de Vermur. */
  cuentaSalida: string | null;
  /** Referencia o URL de la factura — puede llegar después. */
  facturaAsociada: string | null;
  /**
   * D-3 · Lo que el clasificador leyó de la factura del proveedor, ya
   * confirmado por Operaciones. `facturaAsociada` es la referencia legible;
   * esto es el desglose para cuadrar montos sin abrir el PDF.
   */
  facturaDatos?: {
    numero: string;
    fecha: string;
    emisor: string;
    total: number | null;
    /**
     * Bloque 11a · Antes de impuestos, tal como lo leyó el clasificador.
     * `null` = el documento no lo declaró. Es lo único comparable contra lo
     * cotizado, que también va antes de IVA: `lib/margenRealConcepto` lo lee
     * para decidir si puede calcular el excedente.
     */
    subtotal?: number | null;
    /** Lo que el documento declara de impuesto. Informativo. */
    iva?: number | null;
    /**
     * Tarea 36 · Tasa de IVA declarada o corregida en la conciliación.
     * 16, 0, 4 (split aéreo), null = no se capturó. Es la TASA, no el monto.
     */
    tasaIVA?: number | null;
    /**
     * Tarea 36 · Retención declarada o corregida (monto, no tasa).
     * El flete terrestre nacional retiene el 4% del subtotal.
     */
    retencion?: number | null;
    moneda: string;
    /** El documento del embarque del que salió. */
    documentoId: string;
    /** Resultado del cotejo contra el monto de la OC al asociarla. */
    cotejo: 'coincide' | 'difiere' | 'sin_total';
  } | null;
  /**
   * Tarea 55 · Archivos de la factura del proveedor subidos directamente a la OC.
   * En OCs de oficina es la única vía; en las de embarque complementa el flujo
   * del clasificador. Solo PDF y XML, sin borrar (se sube otra versión).
   */
  facturaArchivos?: {
    pdf?: ArchivoFacturaOC | null;
    xml?: ArchivoFacturaOC | null;
  };
  /**
   * Tarea 55 · UUID del CFDI extraído del XML, para detectar duplicados.
   * Se guarda aparte de facturaDatos para indexar sin bajar el objeto entero.
   */
  facturaUUID?: string | null;
  /** Tarea 55 · RFC del emisor extraído del XML. */
  facturaRfcEmisor?: string | null;
  /** Referencia o URL del comprobante de pago. */
  comprobantePago: string | null;
  /**
   * Tarea 63 · Documentos de la orden, con su tipo. Opcional y aditivo: las
   * órdenes que ya existen no lo traen y se leen igual. `facturaArchivos`
   * (55) se queda donde está: es la vía del PDF y el XML con parseo de CFDI,
   * y lo que llega por aquí no lo reemplaza.
   */
  documentos?: DocumentoOC[];

  // ── Fondeo del cliente (1.1) ───────────────────────────────────────────────
  /**
   * ¿Es un pago de impuestos? Los impuestos NO se financian: el cliente
   * deposita primero (§4.7). Se propone del concepto al crear la OC y se
   * guarda AQUÍ, para que corregir la lista de conceptos-impuesto no
   * reescriba la historia de las órdenes ya emitidas. Ausente = se deriva.
   */
  esPagoImpuestos?: boolean;
  /**
   * Flag «No pagar»: frena la autorización aunque las cuentas cuadren.
   * Existe porque Administración a veces sabe algo que el sistema no —un
   * depósito que viene en camino y no debe gastarse en otra cosa— y necesita
   * detener sin rechazar. Ver lib/fondeoCliente.ts.
   */
  noPagar?: boolean;
  /** Por qué se marcó «No pagar». Se muestra a quien intente autorizarla. */
  motivoNoPagar?: string | null;

  // ── Anticipos ──────────────────────────────────────────────────────────────
  esAnticipo: boolean;
  /** OCs de anticipo aplicadas contra esta OC. Solo en OCs no-anticipo. */
  anticiposCruzados: AnticipoRef[];
  /** monto − Σ anticiposCruzados[].montoAplicado (null si no hay anticipos). */
  saldoPendiente: number | null;
  /**
   * Solo para OCs con esAnticipo=true.
   * monto − Σ (lo aplicado en otras OCs que referenciaron este anticipo).
   * null si no es anticipo.
   */
  montoDisponible: number | null;

  // ── Estado y auditoría ─────────────────────────────────────────────────────
  activo: boolean;
  createdAt: string;   // ISO timestamp
  updatedAt: string;   // ISO timestamp
}

// ─── DepositoCliente ──────────────────────────────────────────────────────────

/** Depósito de un cliente para fondear OCs de un embarque. */
export interface DepositoCliente {
  id: string;
  /** FK → embarques/ */
  embarqueId: string;
  embarqueFolio: string;
  /** FK → clientes/ */
  clienteId: string;
  clienteNombre: string;
  monto: number;
  moneda: 'MXN' | 'USD';
  /** YYYY-MM-DD */
  fechaDeposito: string;
  /** Referencia bancaria. */
  referencia: string;
  /** URL del comprobante. */
  comprobante: string | null;
  registradoPor: { uid: string; nombre: string };
  activo: boolean;
  fechaAlta: string;    // ISO timestamp
  updatedAt: string;    // ISO timestamp
}

// ─── Contexto de fondeo (para validación de la máquina de estados) ───────────

/** Datos de fondeo necesarios para validar la transición en_gestion → autorizada. */
export interface FondeoContext {
  /** Suma de depósitos del embarque. */
  totalFondeo: number;
  /** Suma de montos de OCs del embarque en estados ≠ rechazada, ≠ pagada. */
  totalOCsPendientes: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Calcula el saldo pendiente de una OC dado sus anticipos cruzados. */
export function calcularSaldoPendiente(monto: number, anticipos: AnticipoRef[]): number {
  if (anticipos.length === 0) return monto;
  const totalAplicado = anticipos.reduce((acc, a) => acc + a.montoAplicado, 0);
  return Math.round((monto - totalAplicado) * 100) / 100;
}

/**
 * Calcula cuánto queda disponible de un anticipo pagado.
 * @param montoAnticipo  — monto total del anticipo (OC.monto)
 * @param aplicaciones   — montos ya aplicados a otras OCs
 */
export function calcularMontoDisponible(montoAnticipo: number, aplicaciones: number[]): number {
  const totalAplicado = aplicaciones.reduce((acc, m) => acc + m, 0);
  return Math.round((montoAnticipo - totalAplicado) * 100) / 100;
}

/**
 * Valida que se pueda aplicar `montoAAplicar` de un anticipo.
 * Retorna null si ok, o string con error.
 */
export function validarAplicacionAnticipo(
  montoDisponible: number,
  montoAAplicar: number,
): string | null {
  if (montoAAplicar <= 0) return 'El monto a aplicar debe ser mayor a cero.';
  if (montoAAplicar > montoDisponible) {
    return `Monto a aplicar ($${montoAAplicar.toLocaleString()}) excede lo disponible ($${montoDisponible.toLocaleString()}).`;
  }
  return null;
}

/** Devuelve la config de un estado por su id. */
export function getEstadoOC(estado: EstadoOC): EstadoOCConfig {
  return ESTADOS_OC_MAP[estado];
}

/** Devuelve true si la OC está en un estado terminal (pagada o rechazada). */
export function esEstadoTerminal(estado: EstadoOC): boolean {
  return estado === 'pagada' || estado === 'rechazada';
}
