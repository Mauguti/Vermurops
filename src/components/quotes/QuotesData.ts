// ============================================================
// QuotesData.ts — Modelo de datos del módulo de Cotizaciones
// Proceso comercial real: Ventas → Pricing → Proveedores → Consolidación
// ============================================================
import { calcLinea } from '../../lib/cotizacionCalculator';
import type { TipoCambioCotizacion } from '../../lib/monedaComparativa';

// ------------------------------------------------------------
// Tipos base
// ------------------------------------------------------------

export interface QuoteActivity {
  id: string;
  titulo: string;
  descripcion: string;
  responsableId: string;
  fechaLimite: string;
  estado: 'pendiente' | 'hecha';
  tipo: 'tarea' | 'llamada' | 'correo' | 'nota' | 'cambio_etapa';
  createdAt: string;
  parentId?: string | null; // Para hilos de respuestas en notas
}

export interface QuoteMessage {
  id: string;
  autorId: string;
  autorNombre: string;
  rol: string;
  texto: string;
  timestamp: string;
}

export interface StageHistory {
  etapa: string;
  fecha: string;
  nota?: string;
}

// ------------------------------------------------------------
// Cotización de proveedor (cargada por Pricing)
// ------------------------------------------------------------

export type EstadoRespuesta = 'pendiente' | 'recibida' | 'sin_respuesta' | 'declinada';

export interface CotizacionProveedor {
  id: string;
  proveedor: string;       // Nombre de la naviera/aerolínea/transportista/agente aduanal
  contacto: string;        // Nombre del contacto en el proveedor
  monto: number;
  moneda: 'MXN' | 'USD';
  tiempoTransito?: string;  // Ej: "18-22 días"
  vigencia?: string;        // ISO date string
  condiciones?: string;     // Notas / condiciones especiales
  adjuntoUrl?: string | null;
  archivoNombre?: string | null;
  seleccionada: boolean;   // Pricing marca la que se usará para consolidar

  // ── CP-1: campos para comparativa de pricing ─────────────────────────────
  /** Preseleccionada como candidata (apoyo visual, NO afecta cálculos). */
  candidata?: boolean;
  /** Estado de la solicitud al proveedor. */
  estadoRespuesta?: EstadoRespuesta;
  /** Días libres — solo FCL marítimo. */
  freeTimeDias?: number | null;
  /** FK al catálogo de proveedores (ProveedorVermur.id). */
  proveedorId?: string | null;
  /** FK al catálogo de conceptos (ConceptoVermur.id). */
  conceptoId?: string | null;
  /** FK a TarifaVermur.id — trazabilidad: de qué tarifa del catálogo provino. */
  tarifaOrigenId?: string | null;
}

// ------------------------------------------------------------
// Servicio solicitado dentro de una cotización maestra
// ------------------------------------------------------------

export type TipoServicio = string;

export interface Subconcepto {
  id: string;
  nombre: string;
  costo: number;
  moneda: 'MXN' | 'USD';
}

export interface ConceptoCotizacion {
  /**
   * ¿Alguien capturó el costo, aunque haya sido cero?
   *
   * Un campo vacío no es lo mismo que un cero declarado. Gabi lo describió en
   * la sesión: «a veces hay que poner el segundo concepto con pérdida, y el
   * profit ponérselo al flete internacional». También hay cortesías y cargos
   * absorbidos: un concepto en cero puede ser una decisión, no un olvido.
   *
   * Ausente en los conceptos anteriores a esto. El fallback es `costo > 0`:
   * un concepto recién creado nace en cero sin la marca y sigue bloqueando,
   * que es lo correcto.
   */
  costoCapturado?: boolean;

  id: string;
  nombre: string;
  /** FK al catálogo conceptos/. null/undefined = concepto legacy (texto libre). */
  conceptoId?: string;
  // ── Campos del modelo lineas_cotizacion (Luis) ──────────────────────────
  costo: number;   // Costo base del concepto (de proveedor oficial + subconceptos)
  profit: number;  // Profit absoluto — INPUT manual de Pricing (no %)
  venta: number;   // costo + profit  (calculado con calcLinea)
  margen: number;  // profit / venta  (0–1; calculado con calcLinea)
  // ── Detalle de tarifas / subconceptos ───────────────────────────────────
  subconceptos: Subconcepto[];
  tarifas: CotizacionProveedor[];
  /** @deprecated Usar proveedoresOficialIds. Se mantiene para backward compat. */
  proveedorOficialId?: string | null;
  /** IDs de tarifas seleccionadas en firme (suman al costo). */
  proveedoresOficialIds?: string[];
  orden?: number;
}

/**
 * Sentido de la operación. Pricing lo define de entrada: es de lo primero
 * que se sabe de un requerimiento.
 *
 * Cierra la deuda prioritaria de §6. Hace falta dos veces:
 *   - fiscal: `calcularIVA` no podía aplicarse sin él (§4.2);
 *   - operativa: el folio del embarque codifica el tráfico (VLIM impo marítimo
 *     vs VLEM expo marítimo).
 */
export type TraficoServicio = 'importacion' | 'exportacion';

/** Dónde ocurre el servicio. Segunda mitad de la regla espejo del IVA. */
export type UbicacionServicio = 'origen' | 'destino';

export interface ServicioSolicitado {
  id: string;
  tipo: TipoServicio;

  /**
   * Sentido de la operación. Opcional por compatibilidad: las cotizaciones
   * anteriores a esto no lo tienen. Para ellas se intenta derivar de la ruta
   * y, si no se puede, se marca con advertencia en vez de inventar el dato.
   */
  trafico?: TraficoServicio;
  /** Dónde ocurre. Junto con `trafico` habilita la regla espejo del IVA. */
  ubicacion?: UbicacionServicio;

  /**
   * ¿Este servicio se opera como embarque aparte?
   *
   * Por defecto false: todos los servicios de la cotización van al MISMO
   * embarque, cuya modalidad es la del servicio de mayor venta. Es el caso
   * normal — un acarreo dentro de una operación marítima es parte de ella.
   *
   * Pricing lo marca cuando el tramo se opera por separado y necesita su
   * propio folio. La decisión se toma aquí, al armar la cotización, y no al
   * ganarla: el cliente pidió que la generación del embarque sea automática y
   * «sin paso intermedio», así que no puede haber una pregunta en ese momento.
   */
  generaEmbarquePropio?: boolean;
  ruta: {
    origen: string;
    destino: string;
    /**
     * FK → puertos/ cuando el extremo se eligió del catálogo (4-sep-2026).
     * `null`/ausente = texto libre (ruta terrestre, destino sin puerto). Del
     * puerto sale el país, y del país el tráfico — que decide folio e IVA.
     * Aditivos: las rutas viejas siguen siendo solo texto.
     */
    origenPuertoId?: string | null;
    destinoPuertoId?: string | null;
    aduanaSalida?: string;
    aduanaRecepcion?: string;
  };
  incoterm: string;
  mercancia: string;
  peso: number;           // kg
  volumen: number;        // m³ / CBM
  estado: 'pendiente' | 'solicitado_proveedores' | 'cotizado';
  // ── Vista plana — BandejaPricing ────────────────────────────────────────
  cotizacionesProveedor: CotizacionProveedor[];
  profit: number;
  recargosPct: number;
  // ── Vista detallada — FichaCotizacion (modelo Luis lineas_cotizacion) ───
  conceptos: ConceptoCotizacion[];

  // ── Campos condicionales de embarque (E4 — modelo Luis solicitudes) ─────
  // Marítimo: tipo de embarque
  tipo_embarque?: 'FCL' | 'LCL' | 'ninguno';
  // FCL (Full Container Load)
  fcl_contenedor?: string;          // ej. "20'GP", "40'HC", "40'RH", "20'Reef"
  fcl_peso?: number;
  fcl_peso_unidad?: 'kg' | 'tons';
  fcl_reqs?: string;                // Requerimientos especiales texto libre
  food_grade?: boolean;
  reforzado?: boolean;
  sobredimension?: boolean;
  enlonado?: boolean;
  atmos_controlada?: boolean;
  // LCL (Less than Container Load)
  lcl_num_pallets?: number;
  lcl_estibable?: boolean;
  lcl_cubicaje_total?: number;      // CBM total
  // Terrestre
  ter_tipo?: 'FTL' | 'LTL';        // Full Truck Load | Less Than Truck
  ter_unidad?: string;              // ej. "Torton", "Rabón", "Caja seca 53'"
  ter_num_pallets?: number;
  ter_peso?: number;
  ter_peso_unidad?: 'kg' | 'tons';
  ter_medidas?: string;             // dimensiones texto libre
  ter_volumen?: number;
  ter_estibable?: boolean;
}

// ------------------------------------------------------------
// Cotización maestra (raíz del pipeline)
// ------------------------------------------------------------

export interface KanbanQuote {
  id: string; // Folio ej. "COT-2026-0142"

  // Etapa del pipeline (handoff Ventas ↔ Pricing)
  etapa: PipelineStageId;

  // Prospecto / cliente
  prospecto: {
    empresa: string;
    contacto: string;
    telefono: string;
    email: string;
    origen: 'formulario' | 'web' | 'referido' | 'llamada' | 'feria' | 'otro' | 'interno_ventas' | 'interno_pricing';
  };
  /**
   * Referencia a la entidad Cliente en la colección clientes/ (E6).
   * null = cotización legacy con solo prospecto embebido.
   * string = ID del documento en clientes/.
   */
  clienteId?: string | null;

  // Responsables
  vendedorId: string;       // Ventas: quien recibió la solicitud y da seguimiento
  pricingId: string | null; // Pricing: quien cotiza con proveedores y consolida

  // Servicios solicitados (1..n): Aéreo, Terrestre, Marítimo, Aduanal
  servicios: ServicioSolicitado[];

  // Total calculado (suma de montos de proveedores seleccionados + margen por servicio)
  valorTotalConsolidado: number;
  moneda: 'MXN' | 'USD';

  // Final
  estadoFinal: 'ganada' | 'perdida' | null;
  motivoPerdida: string | null;

  /**
   * Tipo de cambio con el que se cotiza (MO-3).
   *
   * Se guarda CON la cotización y no se relee: si se tomara el vigente en cada
   * apertura, reabrir el documento el mes que viene podría reordenar a los
   * agentes de la comparativa y contradecir una decisión ya tomada.
   *
   * Normalmente es el «pricing rate»: no la tasa de mercado, sino la que
   * Pricing usa con su colchón. «Ahorita el dólar está en 20, ellos cotizan en
   * 20.50.»
   */
  tipoCambio?: TipoCambioCotizacion;

  /**
   * Embarques generados desde esta cotización (E-4).
   * Con al menos uno, la cotización queda CONGELADA: sus conceptos ya no se
   * editan. Decisión del cliente: «una vez que pasa a embarques ya así se
   * queda». Sin divergencia posible entre lo cotizado y lo que se va a cobrar.
   */
  embarqueIds?: string[];

  /**
   * Prospecto del que nació esta cotización (U-8).
   *
   * Se llena al convertir y no se toca después. Es la única forma de enlazar
   * las dos fichas: adivinarlo por nombre de empresa haría que dos prospectos
   * de la misma empresa apuntaran a la misma cotización.
   *
   * Opcional a propósito. Las cotizaciones anteriores a este campo se quedan
   * sin él y el enlace simplemente no aparece para ellas — que es lo correcto:
   * de esas no se sabe de dónde salieron, y fingir que sí sería peor.
   */
  prospectoId?: string;

  // Timestamps y auditoría
  createdAt: string;
  updatedAt: string;
  historialEtapas: StageHistory[];
  actividades: QuoteActivity[];
  chat: QuoteMessage[];
}

// ============================================================
// Pipeline de etapas — proceso Ventas ↔ Pricing
// ============================================================

export type PipelineStageId =
  | 'solicitud_cliente'
  | 'solicitado_pricing'
  | 'pricing_solicitando'
  | 'cotizaciones_recibidas'
  | 'consolidada'
  | 'enviada_cliente'
  | 'negociacion'
  | 'ganada'
  | 'perdida';

export interface PipelineStage {
  id: PipelineStageId;
  label: string;
  color: string;
  rol: 'ventas' | 'pricing' | 'ambos';
}

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    id: 'solicitud_cliente',
    label: 'Solicitud del cliente',
    color: 'border-t-gray-400 bg-gray-50 text-gray-700',
    rol: 'ventas',
  },
  {
    id: 'solicitado_pricing',
    label: 'Solicitado a Pricing',
    color: 'border-t-amber-500 bg-amber-50/50 text-amber-800',
    rol: 'ventas',
  },
  {
    id: 'pricing_solicitando',
    label: 'Pricing — Solicitando proveedores',
    color: 'border-t-[#E11D48] bg-[#E11D48]/5 text-[#9F1239]',
    rol: 'pricing',
  },
  {
    id: 'cotizaciones_recibidas',
    label: 'Cotizaciones de proveedor recibidas',
    color: 'border-t-violet-500 bg-violet-50/50 text-violet-800',
    rol: 'pricing',
  },
  {
    id: 'consolidada',
    label: 'Cotización consolidada',
    color: 'border-t-cyan-500 bg-cyan-50/50 text-cyan-800',
    rol: 'pricing',
  },
  {
    id: 'enviada_cliente',
    label: 'Enviada al cliente',
    color: 'border-t-blue-500 bg-blue-50/50 text-blue-800',
    rol: 'ventas',
  },
  {
    id: 'negociacion',
    label: 'En negociación',
    color: 'border-t-rose-500 bg-rose-50/50 text-rose-800',
    rol: 'ambos',
  },
  {
    id: 'ganada',
    label: 'Ganada',
    color: 'border-t-green-500 bg-green-50/50 text-green-800',
    rol: 'ambos',
  },
  {
    id: 'perdida',
    label: 'Perdida',
    color: 'border-t-red-500 bg-red-50/50 text-red-800',
    rol: 'ambos',
  },
] as const;

// ============================================================
// Catálogos de ayuda
// ============================================================

export const ORIGENES_PROSPECTO = {
  formulario: 'Formulario de captación',
  web: 'Sitio web',
  referido: 'Referido',
  llamada: 'Llamada entrante',
  feria: 'Feria/evento',
  otro: 'Otro',
  interno_ventas: 'Interno (Ventas)',
  interno_pricing: 'Interno (Pricing)',
};

export const TIPOS_SERVICIO: Record<string, { label: string; color: string; icon: string }> = {
  'Flete Internacional': { label: 'Flete Internacional', color: 'bg-blue-100 text-blue-700', icon: 'ship' },
  'Transporte Terrestre': { label: 'Transporte Terrestre', color: 'bg-emerald-100 text-emerald-700', icon: 'truck' },
  'Transporte Aéreo': { label: 'Transporte Aéreo', color: 'bg-sky-100 text-sky-700', icon: 'plane' },
  'Maniobras': { label: 'Maniobras', color: 'bg-orange-100 text-orange-700', icon: 'package' },
  'Almacenaje Nacional': { label: 'Almacenaje Nacional', color: 'bg-[#E11D48]/10 text-[#BE123C]', icon: 'warehouse' },
  'Almacenaje Internacional': { label: 'Almacenaje Internacional', color: 'bg-fuchsia-100 text-fuchsia-700', icon: 'warehouse' },
  'Seguro de Mercancía': { label: 'Seguro de Mercancía', color: 'bg-pink-100 text-pink-700', icon: 'shield' },
  'Recolección': { label: 'Recolección', color: 'bg-rose-100 text-rose-700', icon: 'map-pin' },
  'Asesoría Aduanal': { label: 'Asesoría Aduanal', color: 'bg-teal-100 text-teal-700', icon: 'file-check' },
  'Otros Servicios': { label: 'Otros Servicios', color: 'bg-gray-100 text-gray-700', icon: 'more-horizontal' },
  
  // Legacy keys from dummy data
  'maritimo': { label: 'Marítimo', color: 'bg-blue-100 text-blue-700', icon: 'ship' },
  'aereo': { label: 'Aéreo', color: 'bg-sky-100 text-sky-700', icon: 'plane' },
  'terrestre': { label: 'Terrestre', color: 'bg-emerald-100 text-emerald-700', icon: 'truck' },
  'aduanal': { label: 'Aduanal', color: 'bg-teal-100 text-teal-700', icon: 'shield-check' }
};

export const INCOTERMS = ['EXW', 'FOB', 'FCA', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];

export const VENDEDORES = [
  { id: 'ventas', nombre: 'ventas' },
  { id: 'maria.lopez', nombre: 'María López' },
  { id: 'carlos.gomez', nombre: 'Carlos Gómez' },
];

export const EQUIPO_PRICING = [
  { id: 'ana.reyes', nombre: 'Ana Reyes' },
  { id: 'roberto.diaz', nombre: 'Roberto Díaz' },
  { id: 'lucia.mendez', nombre: 'Lucía Méndez' },
];

// ============================================================
// Helper: calcular total consolidado de una cotización
// ============================================================

// ============================================================
// Helper: resolver IDs oficiales con backward compat
// ============================================================

/**
 * Devuelve los IDs de tarifas oficiales de un concepto.
 * Prefiere proveedoresOficialIds (nuevo); fallback a proveedorOficialId (legacy).
 */
export function getOficialIds(concepto: ConceptoCotizacion): string[] {
  if (concepto.proveedoresOficialIds?.length) return concepto.proveedoresOficialIds;
  if (concepto.proveedorOficialId) return [concepto.proveedorOficialId];
  return [];
}

/**
 * Devuelve las tarifas oficiales (seleccionadas en firme) de un concepto.
 */
export function getTarifasOficiales(concepto: ConceptoCotizacion): CotizacionProveedor[] {
  const ids = getOficialIds(concepto);
  if (ids.length === 0) return [];
  return (concepto.tarifas ?? []).filter(t => ids.includes(t.id));
}

/**
 * Suma el monto de las tarifas oficiales de un concepto.
 * Con multi-selección, los costos se suman (carga dividida entre proveedores).
 */
export function getCostoOficial(concepto: ConceptoCotizacion): number {
  const ids = getOficialIds(concepto);
  if (ids.length === 0) return 0;
  return (concepto.tarifas ?? [])
    .filter(t => ids.includes(t.id))
    .reduce((acc, t) => acc + t.monto, 0);
}

/**
 * Costo total de un concepto: tarifas oficiales + subconceptos.
 *
 * Si el concepto no tiene ninguna de las dos cosas, cae al campo `costo`
 * capturado a mano. Ese fallback corrige un hueco real: un concepto tecleado
 * sin tarifas aportaba su profit al total de la cotización pero NO su costo,
 * así que el total salía de menos y el margen inflado.
 *
 * Punto único de verdad: lo usan `calcularTotalConsolidado` y el adaptador de
 * la tabla plana (lib/lineasCotizacion.ts). Si cada uno calculara por su lado,
 * la tabla y el Kanban mostrarían totales distintos.
 */
export function costoDeConcepto(concepto: ConceptoCotizacion): number {
  const oficial = getCostoOficial(concepto);
  const subs = concepto.subconceptos?.reduce((acc, s) => acc + s.costo, 0) ?? 0;
  if (oficial > 0 || subs > 0) return oficial + subs;
  return concepto.costo ?? 0;
}

// ============================================================
// Helper: calcular total consolidado de una cotización
// ============================================================

/**
 * Suma las ventas de todos los servicios usando calcLinea (E1).
 *
 * Prioridad por servicio:
 *  1. Vista plana (BandejaPricing): si hay un proveedor seleccionado en
 *     cotizacionesProveedor, usa calcLinea(provMonto, srv.profit).
 *  2. Vista detallada (FichaCotizacion): suma calcLinea(costo, profit) por
 *     cada ConceptoCotizacion, donde costo = tarifa oficial + subconceptos.
 */
export function calcularTotalConsolidado(servicios: ServicioSolicitado[]): number {
  let total = 0;
  for (const srv of servicios) {
    // ── Ruta 1: vista plana (BandejaPricing) ──────────────────────────────
    const flatSelected = (srv.cotizacionesProveedor ?? []).find(cp => cp.seleccionada);
    if (flatSelected) {
      total += calcLinea(flatSelected.monto, srv.profit).venta;
      continue; // evitar doble conteo con conceptos
    }

    // ── Ruta 2: vista detallada (FichaCotizacion / lineas_cotizacion) ─────
    for (const concepto of srv.conceptos) {
      total += calcLinea(costoDeConcepto(concepto), concepto.profit).venta;
    }
  }
  return Math.round(total * 100) / 100;
}

// ============================================================
// Datos mock enriquecidos para desarrollo
// ============================================================

export const initialKanbanQuotes: KanbanQuote[] = [
  // ─────────────────────────────────────────────────
  // COT-2026-0001 | Solicitud del cliente | multi-servicio
  // ─────────────────────────────────────────────────
  {
    id: 'COT-2026-0001',
    etapa: 'solicitud_cliente',
    prospecto: {
      empresa: 'Alfa Corporativo S.A.',
      contacto: 'Roberto Jiménez',
      telefono: '55 4321 0987',
      email: 'rjimenez@alfacorp.mx',
      origen: 'formulario',
    },
    vendedorId: 'ventas',
    pricingId: null,
    servicios: [
      {
        id: 'srv-001-m',
        tipo: 'maritimo',
        ruta: { origen: 'Shanghai, CHN', destino: 'Manzanillo, MEX' },
        incoterm: 'FOB',
        mercancia: 'Componentes electrónicos en pallets',
        peso: 4500,
        volumen: 12,
        estado: 'pendiente',
        cotizacionesProveedor: [], profit: 0, recargosPct: 0,
        conceptos: [],
      },
      {
        id: 'srv-001-a',
        tipo: 'aduanal',
        ruta: { origen: 'Manzanillo, MEX', destino: 'CDMX, MEX' },
        incoterm: 'DDP',
        mercancia: 'Componentes electrónicos — despacho aduanal',
        peso: 4500,
        volumen: 12,
        estado: 'pendiente',
        cotizacionesProveedor: [], profit: 0, recargosPct: 0,
        conceptos: [],
      },
    ],
    valorTotalConsolidado: 0,
    moneda: 'USD',
    estadoFinal: null,
    motivoPerdida: null,
    createdAt: '2026-06-05 10:20',
    updatedAt: '2026-06-05 10:20',
    historialEtapas: [{ etapa: 'solicitud_cliente', fecha: '2026-06-05 10:20' }],
    actividades: [
      {
        id: 'act-001-1',
        titulo: 'Llamar para verificar requerimientos',
        descripcion: 'Confirmar tipo de embalaje y fecha aproximada de carga.',
        responsableId: 'Juan Pérez',
        fechaLimite: '2026-06-12',
        estado: 'pendiente',
        tipo: 'llamada', createdAt: '2026-06-05 10:25',
      },
    ],
    chat: [],
  },

  // ─────────────────────────────────────────────────
  // COT-2026-0002 | Solicitado a Pricing | terrestre + aduanal
  // ─────────────────────────────────────────────────
  {
    id: 'COT-2026-0002',
    etapa: 'solicitado_pricing',
    prospecto: {
      empresa: 'Distribuidora Nacional',
      contacto: 'Ana Gómez',
      telefono: '33 8888 7777',
      email: 'agomez@distnacional.com',
      origen: 'web',
    },
    vendedorId: 'ventas',
    pricingId: null,
    servicios: [
      {
        id: 'srv-002-t',
        tipo: 'terrestre',
        ruta: { origen: 'Laredo, USA', destino: 'Querétaro, MEX' },
        incoterm: 'DDP',
        mercancia: 'Refacciones automotrices',
        peso: 1500,
        volumen: 6,
        estado: 'pendiente',
        cotizacionesProveedor: [], profit: 0, recargosPct: 0,
        conceptos: [],
      },
      {
        id: 'srv-002-a',
        tipo: 'aduanal',
        ruta: { origen: 'Laredo, USA', destino: 'Laredo, MEX' },
        incoterm: 'DDP',
        mercancia: 'Refacciones automotrices — despacho aduanal',
        peso: 1500,
        volumen: 6,
        estado: 'pendiente',
        cotizacionesProveedor: [], profit: 0, recargosPct: 0,
        conceptos: [],
      },
    ],
    valorTotalConsolidado: 0,
    moneda: 'MXN',
    estadoFinal: null,
    motivoPerdida: null,
    createdAt: '2026-06-06 09:15',
    updatedAt: '2026-06-06 14:00',
    historialEtapas: [
      { etapa: 'solicitud_cliente', fecha: '2026-06-06 09:15' },
      { etapa: 'solicitado_pricing', fecha: '2026-06-06 14:00' },
    ],
    actividades: [
      {
        id: 'act-002-1',
        titulo: 'Enviar correo solicitando pedimento anterior',
        descripcion: 'Verificar fracción arancelaria con el agente aduanal.',
        responsableId: 'María López',
        fechaLimite: '2026-06-07',
        estado: 'pendiente',
        tipo: 'correo', createdAt: '2026-06-06 14:05',
      },
    ],
    chat: [],
  },

  // ─────────────────────────────────────────────────
  // COT-2026-0003 | Pricing solicitando | aéreo
  // ─────────────────────────────────────────────────
  {
    id: 'COT-2026-0003',
    etapa: 'pricing_solicitando',
    prospecto: {
      empresa: 'Industrias Metalúrgicas',
      contacto: 'Carlos Varela',
      telefono: '81 9999 8888',
      email: 'cvarela@indmetal.com',
      origen: 'llamada',
    },
    vendedorId: 'Carlos Gómez',
    pricingId: 'Ana Reyes',
    servicios: [
      {
        id: 'srv-003-ae',
        tipo: 'aereo',
        ruta: { origen: 'Frankfurt, GER', destino: 'Monterrey, MEX' },
        incoterm: 'EXW',
        mercancia: 'Sensores de temperatura e instrumentación',
        peso: 120,
        volumen: 1.5,
        estado: 'solicitado_proveedores',
        cotizacionesProveedor: [], profit: 0, recargosPct: 0,
        conceptos: [],
      },
    ],
    valorTotalConsolidado: 0,
    moneda: 'USD',
    estadoFinal: null,
    motivoPerdida: null,
    createdAt: '2026-06-07 11:30',
    updatedAt: '2026-06-07 15:45',
    historialEtapas: [
      { etapa: 'solicitud_cliente', fecha: '2026-06-07 11:30' },
      { etapa: 'solicitado_pricing', fecha: '2026-06-07 13:00' },
      { etapa: 'pricing_solicitando', fecha: '2026-06-07 15:45' },
    ],
    actividades: [
      {
        id: 'act-003-1',
        titulo: 'Cotizar con DHL Express y KLM Cargo',
        descripcion: 'Obtener tarifa de flete aéreo y tiempo de tránsito adicional.',
        responsableId: 'Ana Reyes',
        fechaLimite: '2026-06-10',
        estado: 'pendiente',
        tipo: 'tarea', createdAt: '2026-06-07 15:50',
      },
    ],
    chat: [],
  },

  // ─────────────────────────────────────────────────
  // COT-2026-0004 | Cotizaciones recibidas | marítimo + aduanal
  // ─────────────────────────────────────────────────
  {
    id: 'COT-2026-0004',
    etapa: 'cotizaciones_recibidas',
    prospecto: {
      empresa: 'Grupo Textil Monterrey',
      contacto: 'Juan Pérez',
      telefono: '81 1234 5678',
      email: 'juan@textil.com',
      origen: 'referido',
    },
    vendedorId: 'ventas',
    pricingId: 'Roberto Díaz',
    servicios: [
      {
        id: 'srv-004-m',
        tipo: 'maritimo',
        ruta: { origen: 'Qingdao, CHN', destino: 'Manzanillo, MEX' },
        incoterm: 'FOB',
        mercancia: 'Rollos de tela sintética — 4 × 40\' HC',
        peso: 15000,
        volumen: 30,
        estado: 'cotizado',
        cotizacionesProveedor: [], profit: 0, recargosPct: 0,
        conceptos: [],
      },
      {
        id: 'srv-004-a',
        tipo: 'aduanal',
        ruta: { origen: 'Manzanillo, MEX', destino: 'Monterrey, MEX' },
        incoterm: 'DDP',
        mercancia: 'Despacho aduanal de tela sintética',
        peso: 15000,
        volumen: 30,
        estado: 'cotizado',
        cotizacionesProveedor: [], profit: 0, recargosPct: 0,
        conceptos: [],
      },
    ],
    valorTotalConsolidado: 0,
    moneda: 'USD',
    estadoFinal: null,
    motivoPerdida: null,
    createdAt: '2026-06-04 08:00',
    updatedAt: '2026-06-11 10:00',
    historialEtapas: [
      { etapa: 'solicitud_cliente', fecha: '2026-06-04 08:00' },
      { etapa: 'solicitado_pricing', fecha: '2026-06-04 10:00' },
      { etapa: 'pricing_solicitando', fecha: '2026-06-05 09:00' },
      { etapa: 'cotizaciones_recibidas', fecha: '2026-06-11 10:00' },
    ],
    actividades: [
      {
        id: 'act-004-1',
        titulo: 'Confirmar selección de Evergreen con Pricing',
        descripcion: 'Validar margen y armar cotización consolidada final.',
        responsableId: 'Roberto Díaz',
        fechaLimite: '2026-06-12',
        estado: 'pendiente',
        tipo: 'tarea', createdAt: '2026-06-11 10:05',
      },
    ],
    chat: [],
  },

  // ─────────────────────────────────────────────────
  // COT-2026-0005 | Consolidada | aéreo + terrestre + aduanal
  // ─────────────────────────────────────────────────
  {
    id: 'COT-2026-0005',
    etapa: 'consolidada',
    prospecto: {
      empresa: 'Importadora del Golfo',
      contacto: 'Elena Ruiz',
      telefono: '22 9111 2222',
      email: 'eruiz@impgolfo.com',
      origen: 'feria',
    },
    vendedorId: 'ventas',
    pricingId: 'Lucía Méndez',
    servicios: [
      {
        id: 'srv-005-ae',
        tipo: 'aereo',
        ruta: { origen: 'Miami, USA', destino: 'CDMX, MEX' },
        incoterm: 'CIP',
        mercancia: 'Equipo médico de diagnóstico especializado',
        peso: 450,
        volumen: 2.8,
        estado: 'cotizado',
        cotizacionesProveedor: [], profit: 0, recargosPct: 0,
        conceptos: [],
      },
      {
        id: 'srv-005-t',
        tipo: 'terrestre',
        ruta: { origen: 'AICM, MEX', destino: 'Veracruz, MEX' },
        incoterm: 'DAP',
        mercancia: 'Equipo médico — distribución terrestre',
        peso: 450,
        volumen: 2.8,
        estado: 'cotizado',
        cotizacionesProveedor: [], profit: 0, recargosPct: 0,
        conceptos: [],
      },
      {
        id: 'srv-005-ad',
        tipo: 'aduanal',
        ruta: { origen: 'AICM, MEX', destino: 'AICM, MEX' },
        incoterm: 'CIP',
        mercancia: 'Despacho aduanal de equipo médico (permiso COFEPRIS)',
        peso: 450,
        volumen: 2.8,
        estado: 'cotizado',
        cotizacionesProveedor: [], profit: 0, recargosPct: 0,
        conceptos: [],
      },
    ],
    valorTotalConsolidado: 0,
    moneda: 'USD',
    estadoFinal: null,
    motivoPerdida: null,
    createdAt: '2026-06-02 14:00',
    updatedAt: '2026-06-11 16:00',
    historialEtapas: [
      { etapa: 'solicitud_cliente', fecha: '2026-06-02 14:00' },
      { etapa: 'solicitado_pricing', fecha: '2026-06-03 09:00' },
      { etapa: 'pricing_solicitando', fecha: '2026-06-03 14:00' },
      { etapa: 'cotizaciones_recibidas', fecha: '2026-06-05 10:00' },
      { etapa: 'consolidada', fecha: '2026-06-11 16:00' },
    ],
    actividades: [
      {
        id: 'act-005-1',
        titulo: 'Enviar cotización consolidada a Ventas',
        descripcion: 'Pricing finalizó consolidación. Ventas debe revisar y enviar al cliente.',
        responsableId: 'Lucía Méndez',
        fechaLimite: '2026-06-12',
        estado: 'pendiente',
        tipo: 'tarea', createdAt: '2026-06-11 16:05',
      },
    ],
    chat: [],
  },

  // ─────────────────────────────────────────────────
  // COT-2026-0006 | Enviada al cliente | marítimo
  // ─────────────────────────────────────────────────
  {
    id: 'COT-2026-0006',
    etapa: 'enviada_cliente',
    prospecto: {
      empresa: 'Comercial del Norte',
      contacto: 'Carlos Gómez',
      telefono: '614 555 1234',
      email: 'carlos@comercialnorte.com',
      origen: 'web',
    },
    vendedorId: 'Carlos Gómez',
    pricingId: 'Ana Reyes',
    servicios: [
      {
        id: 'srv-006-m',
        tipo: 'maritimo',
        ruta: { origen: 'Houston, USA', destino: 'Chihuahua, MEX' },
        incoterm: 'DAP',
        mercancia: 'Maquinaria industrial ligera — 1 × 20\' GP',
        peso: 2200,
        volumen: 8,
        estado: 'cotizado',
        cotizacionesProveedor: [], profit: 0, recargosPct: 0,
        conceptos: [],
      },
    ],
    valorTotalConsolidado: 1254,
    moneda: 'USD',
    estadoFinal: null,
    motivoPerdida: null,
    createdAt: '2026-05-15 09:00',
    updatedAt: '2026-05-22 11:30',
    historialEtapas: [
      { etapa: 'solicitud_cliente', fecha: '2026-05-15 09:00' },
      { etapa: 'solicitado_pricing', fecha: '2026-05-16 10:00' },
      { etapa: 'pricing_solicitando', fecha: '2026-05-17 09:00' },
      { etapa: 'cotizaciones_recibidas', fecha: '2026-05-19 14:00' },
      { etapa: 'consolidada', fecha: '2026-05-21 10:00' },
      { etapa: 'enviada_cliente', fecha: '2026-05-22 11:30' },
    ],
    actividades: [
      {
        id: 'act-006-1',
        titulo: 'Llamar para confirmar recepción del PDF',
        descripcion: 'Confirmar si recibieron la cotización y agendar llamada de revisión.',
        responsableId: 'Carlos Gómez',
        fechaLimite: '2026-05-24',
        estado: 'hecha',
        tipo: 'llamada', createdAt: '2026-05-23 09:00',
      },
    ],
    chat: [],
  },

  // ─────────────────────────────────────────────────
  // COT-2026-0007 | En negociación | aéreo
  // ─────────────────────────────────────────────────
  {
    id: 'COT-2026-0007',
    etapa: 'negociacion',
    prospecto: {
      empresa: 'Electrodomésticos Premium',
      contacto: 'Sandra Torres',
      telefono: '55 7890 1234',
      email: 'storres@electrodom.mx',
      origen: 'referido',
    },
    vendedorId: 'ventas',
    pricingId: 'Roberto Díaz',
    servicios: [
      {
        id: 'srv-007-ae',
        tipo: 'aereo',
        ruta: { origen: 'Seúl, KOR', destino: 'CDMX, MEX' },
        incoterm: 'FOB',
        mercancia: 'Línea blanca de lujo — muestras',
        peso: 280,
        volumen: 3.2,
        estado: 'cotizado',
        cotizacionesProveedor: [], profit: 0, recargosPct: 0,
        conceptos: [],
      },
    ],
    valorTotalConsolidado: 3720,
    moneda: 'USD',
    estadoFinal: null,
    motivoPerdida: null,
    createdAt: '2026-05-28 11:00',
    updatedAt: '2026-06-10 15:00',
    historialEtapas: [
      { etapa: 'solicitud_cliente', fecha: '2026-05-28 11:00' },
      { etapa: 'solicitado_pricing', fecha: '2026-05-29 09:00' },
      { etapa: 'pricing_solicitando', fecha: '2026-05-30 10:00' },
      { etapa: 'cotizaciones_recibidas', fecha: '2026-06-03 14:00' },
      { etapa: 'consolidada', fecha: '2026-06-05 10:00' },
      { etapa: 'enviada_cliente', fecha: '2026-06-06 09:00' },
      { etapa: 'negociacion', fecha: '2026-06-10 15:00' },
    ],
    actividades: [
      {
        id: 'act-007-1',
        titulo: 'Presentar descuento del 5% si cierran esta semana',
        descripcion: 'Autorizado por gerencia para mantener margen mínimo de 15%.',
        responsableId: 'Juan Pérez',
        fechaLimite: '2026-06-13',
        estado: 'pendiente',
        tipo: 'llamada', createdAt: '2026-06-11 09:00',
      },
    ],
    chat: [],
  },

  // ─────────────────────────────────────────────────
  // COT-2026-0008 | Ganada
  // ─────────────────────────────────────────────────
  {
    id: 'COT-2026-0008',
    etapa: 'ganada',
    prospecto: {
      empresa: 'Plásticos Ramírez S.A.',
      contacto: 'Arturo Ramírez',
      telefono: '33 5555 4444',
      email: 'arturo@plasticosramirez.com',
      origen: 'llamada',
    },
    vendedorId: 'ventas',
    pricingId: 'Ana Reyes',
    servicios: [
      {
        id: 'srv-008-m',
        tipo: 'maritimo',
        ruta: { origen: 'Rotterdam, NLD', destino: 'Veracruz, MEX' },
        incoterm: 'CIF',
        mercancia: 'Resinas petroquímicas — 2 × 20\' ISO Tank',
        peso: 42000,
        volumen: 45,
        estado: 'cotizado',
        cotizacionesProveedor: [], profit: 0, recargosPct: 0,
        conceptos: [],
      },
    ],
    valorTotalConsolidado: 5280,
    moneda: 'USD',
    estadoFinal: 'ganada',
    motivoPerdida: null,
    createdAt: '2026-05-01 09:00',
    updatedAt: '2026-05-20 11:30',
    historialEtapas: [
      { etapa: 'solicitud_cliente', fecha: '2026-05-01 09:00' },
      { etapa: 'solicitado_pricing', fecha: '2026-05-02 10:00' },
      { etapa: 'pricing_solicitando', fecha: '2026-05-03 09:00' },
      { etapa: 'cotizaciones_recibidas', fecha: '2026-05-06 14:00' },
      { etapa: 'consolidada', fecha: '2026-05-08 10:00' },
      { etapa: 'enviada_cliente', fecha: '2026-05-09 09:00' },
      { etapa: 'negociacion', fecha: '2026-05-14 10:00' },
      { etapa: 'ganada', fecha: '2026-05-20 11:30' },
    ],
    actividades: [
      {
        id: 'act-008-1',
        titulo: 'Traspasar a operaciones',
        descripcion: 'Crear el booking en VermurOps.',
        responsableId: 'María López',
        fechaLimite: '2026-05-21',
        estado: 'hecha',
        tipo: 'tarea', createdAt: '2026-05-20 11:35',
      },
    ],
    chat: [],
  },
];
