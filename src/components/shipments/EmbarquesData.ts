// ============================================================
// EmbarquesData.ts — Modelo de datos del módulo de Embarques
// Unificado con Aduanas e integrado con relación Master / Hijo
// ============================================================

export type ModalidadEmbarque = 'maritimo' | 'terrestre' | 'aereo';
export type TipoEmbarque = 'master' | 'hijo';

export interface EmbarqueEntidades {
  expedidor: string;
  consignatario: string;
  notificar: string;
  agenteAduanal: string;
  agenteCarga: string;
  agenteDestino: string;
  importador: string;
  clienteCobrar: string;
}

export interface EmbarqueRuta {
  origen: {
    puertoCarga: string;
    transportista: string;
    buque: string;               // Marítimo: nombre buque | Terrestre: descripción de unidad
    bandera: string;             // Marítimo: país bandera | Terrestre: país del carrier
    viaje: string;               // Marítimo: voyage ID | Terrestre: trip/ruta ID
    // ── Campos Terrestres / INLAND (Magaya) ──────────────────
    tipoServicio?: string;       // "Puerto a Puerto"
    modoTransportacion?: string; // "Road, Other"
    numeroVehiculo?: string;     // Número económico del vehículo ej. "283901"
    nombreChofer?: string;       // Nombre del operador ej. "JOSE"
  };
  destino: {
    puertoDescarga: string;
    transportistaEntrega: string;
    lugarEntrega: string;
  };
  aduana: {
    aes: boolean;
    pedimento: string;
  };
}

export interface EmbarqueFechas {
  salida: string;               // Fecha de salida estimada/real
  arribo: string;               // Fecha de arribo estimada/real (ETA)
  ordenGeneral: string;         // Fecha límite de orden general
  limiteDocumentacion: string;  // Fecha límite para subir documentos
  libreDemoras: string;         // Fecha límite libre de demoras
  libreAlmacenaje: string;      // Fecha límite libre de almacenajes
}

export interface EmbarqueCierres {
  operativo: boolean;
  pago: boolean;
  administrativo: boolean;
}

export interface CargoDetalle {
  id: string;
  concepto: string;
  tipo: 'ingreso' | 'gasto';
  monto: number;
  moneda: 'USD' | 'MXN';
}

export interface EmbarqueCargos {
  ingresos: number;
  gastos: number;
  ganancia: number;
  moneda: string;
  detalles: CargoDetalle[];
}

export interface EmbarqueDocumento {
  id: string;
  tipo: 'cotizacion' | 'pedimento' | 'bl' | 'mbl' | 'hbl' | 'factura' | 'packing_list' | 'otro';
  nombre: string;
  url: string;
  fechaCarga: string;
  cargadoPor: string;
}

export interface EmbarqueEvento {
  id: string;
  titulo: string;
  descripcion: string;
  fecha: string;
  tipo: 'info' | 'alerta' | 'exito' | 'aduana';
}

// ------------------------------------------------------------
// Producto / mercancía dentro de un embarque (aplica a hijo/BOL)
// ------------------------------------------------------------

export interface DatosContenedor {
  numeroContenedor: string;
  tipoContenedor: string;
  numeroSello: string;
  folioSello: string;
}

export interface Pallet {
  id: string;
  numeroPallet: string;
  clienteNombre: string;
  cotizacionRef?: string;
  descripcionMercancia: string;
  piezas: number;
  pesoKg: number;
  volumenM3?: number;
  observaciones?: string;
}

export interface EmbarqueProducto {
  id: string;
  descripcion: string;
  tipoEmbalaje: string;  // Pallet | Caja | Tambor | Bulto | Contenedor | Otro
  piezas: number;
  peso: number;          // kg
  volumen?: number;      // m³ (opcional)
  datosContenedor?: DatosContenedor;
  tipoConsolidacion?: 'FCL' | 'LCL';
  pallets?: Pallet[];
}

export const TIPOS_CONTENEDOR = [
  "20' Dry Standard",
  "40' Dry Standard",
  "40' High Cube (HC)",
  "20' Reefer",
  "40' Reefer",
  "20' Open Top",
  "40' Open Top",
  "20' Flat Rack",
  "40' Flat Rack",
  "Tank Container"
];

export interface EmbarqueCompleto {
  id: string; // ID interno o folio autogenerado
  folio: string;
  cotizacionId: string;
  modalidad: ModalidadEmbarque;
  tipo: TipoEmbarque;
  masterId: string | null; // ID del embarque master si este es hijo (HBL)
  numeroGuia: string; // BL / MBL / AWB / Carta Porte
  numeroReservacion: string; // Booking number
  referenciaCliente: string; // PO / Referencia
  entidades: EmbarqueEntidades;
  ruta: EmbarqueRuta;
  fechas: EmbarqueFechas;
  descripcionCarga: string;
  valorDeclarado: number;
  cierres: EmbarqueCierres;
  cargos: EmbarqueCargos;
  documentos: EmbarqueDocumento[];
  eventos: EmbarqueEvento[];
  createdAt: string;
  updatedAt: string;

  // ── Campos Magaya / INLAND (opcionales para compatibilidad con mocks existentes) ──
  nombreEmbarque?: string;        // "BOL 9016543" / "VLIT-24-107" — nombre operativo en Magaya
  lugarRealizacion?: string;      // "Querétaro"
  realizadoPor?: string;          // "KARLA DEL VALLE"
  enTransito?: boolean;           // Estado "En Tránsito" (Acciones → Poner En Tránsito)
  fechaEnTransito?: string;       // Timestamp del paso a En Tránsito
  productos?: EmbarqueProducto[]; // Detalle de mercancías/productos (hijo/BOL)
  tipoEntrega?: string;           // "Entrega Exprés" / "Entrega Estándar" — modo de entrega en Magaya
}

// ────────────────────────────────────────────────────────────
// Catálogos
// ────────────────────────────────────────────────────────────

export const TIPOS_DOCUMENTO = {
  cotizacion: 'Cotización',
  pedimento: 'Pedimento de Importación/Exportación',
  bl: 'Bill of Lading (BL)',
  mbl: 'Master Bill of Lading (MBL)',
  hbl: 'House Bill of Lading (HBL)',
  factura: 'Factura Comercial',
  packing_list: 'Packing List',
  otro: 'Otro Documento',
} as const;

export const EVENT_TYPES = {
  info: { label: 'Información', color: 'bg-blue-50 text-blue-700 border-blue-100' },
  alerta: { label: 'Alerta Operativa', color: 'bg-amber-50 text-amber-700 border-amber-100' },
  exito: { label: 'Éxito / Hito', color: 'bg-green-50 text-green-700 border-green-100' },
  aduana: { label: 'Aduanas', color: 'bg-purple-50 text-purple-700 border-purple-100' },
} as const;

// ────────────────────────────────────────────────────────────
// Helper para calcular ganancia
// ────────────────────────────────────────────────────────────

export function recalcularCargos(detalles: CargoDetalle[], tasaCambio: number = 18.0): EmbarqueCargos {
  let ingresosUSD = 0;
  let gastosUSD = 0;

  detalles.forEach(c => {
    const montoUSD = c.moneda === 'MXN' ? c.monto / tasaCambio : c.monto;
    if (c.tipo === 'ingreso') {
      ingresosUSD += montoUSD;
    } else {
      gastosUSD += montoUSD;
    }
  });

  return {
    ingresos: Math.round(ingresosUSD * 100) / 100,
    gastos: Math.round(gastosUSD * 100) / 100,
    ganancia: Math.round((ingresosUSD - gastosUSD) * 100) / 100,
    moneda: 'USD',
    detalles
  };
}

// ────────────────────────────────────────────────────────────
// Mock Data Inicial Rivo de Embarques (Magaya Flow)
// ────────────────────────────────────────────────────────────

export const initialEmbarquesCompletos: EmbarqueCompleto[] = [
  // ── 1. EMBARQUE MASTER (Marítimo Consolidado) ──────────────────────
  {
    id: 'SHP-2026-0001',
    folio: 'SHP-26-0001',
    cotizacionId: 'COT-2026-0004',
    modalidad: 'maritimo',
    tipo: 'master',
    masterId: null,
    numeroGuia: 'MSKU928374829', // MBL
    numeroReservacion: 'BKG-SH-99238',
    referenciaCliente: 'PO-ALFA-9012',
    entidades: {
      expedidor: 'Shanghai Textiles Ltd.',
      consignatario: 'Vermur Logistics S.A. de C.V. (Consolidado)',
      notificar: 'Vermur Logistics México',
      agenteAduanal: 'Agencia Aduanal Torres S.C.',
      agenteCarga: 'Shanghai Global Freight Corp',
      agenteDestino: 'Vermur Logistics Lázaro Cárdenas',
      importador: 'Vermur Logistics (Consolidador)',
      clienteCobrar: 'Alfa Corporativo S.A. (y otros)'
    },
    ruta: {
      origen: {
        puertoCarga: 'Shanghai (CNSHA), CHN',
        transportista: 'Maersk Line',
        buque: 'Maersk Mc-Kinney Moller',
        bandera: 'Dinamarca',
        viaje: '2604E'
      },
      destino: {
        puertoDescarga: 'Lázaro Cárdenas (MXLZC), MEX',
        transportistaEntrega: 'Transportes Transmex S.A.',
        lugarEntrega: 'Almacén Central Vermur Tepotzotlán'
      },
      aduana: {
        aes: true,
        pedimento: '26-47-3849-6012489'
      }
    },
    fechas: {
      salida: '2026-06-01',
      arribo: '2026-06-25',
      ordenGeneral: '2026-07-02',
      limiteDocumentacion: '2026-05-28',
      libreDemoras: '2026-07-02',
      libreAlmacenaje: '2026-06-30'
    },
    descripcionCarga: 'Contenedor de 40\' HC consolidado con textiles y componentes varios.',
    valorDeclarado: 180000,
    cierres: {
      operativo: false,
      pago: false,
      administrativo: false
    },
    cargos: {
      ingresos: 8500,
      gastos: 6200,
      ganancia: 2300,
      moneda: 'USD',
      detalles: [
        { id: 'c-001-1', concepto: 'Flete Marítimo MBL (Shanghai-Manzanillo)', tipo: 'gasto', monto: 4500, moneda: 'USD' },
        { id: 'c-001-2', concepto: 'Gastos de origen y consolidación', tipo: 'gasto', monto: 1200, moneda: 'USD' },
        { id: 'c-001-3', concepto: 'Liberación de BL y revalidación', tipo: 'gasto', monto: 500, moneda: 'USD' },
        { id: 'c-001-4', concepto: 'Flete Internacional Consolidado', tipo: 'ingreso', monto: 6000, moneda: 'USD' },
        { id: 'c-001-5', concepto: 'Despacho Aduanal Consolidado', tipo: 'ingreso', monto: 2500, moneda: 'USD' }
      ]
    },
    documentos: [
      { id: 'd-001-1', tipo: 'mbl', nombre: 'MBL_Maersk_MSKU928374.pdf', url: '#', fechaCarga: '2026-06-02 09:15', cargadoPor: 'Ana Reyes (Pricing)' },
      { id: 'd-001-2', tipo: 'pedimento', nombre: 'Pedimento_Consolidado_Firmado.pdf', url: '#', fechaCarga: '2026-06-12 14:30', cargadoPor: 'Juan Pérez (Ventas)' },
      { id: 'd-001-3', tipo: 'factura', nombre: 'INV_SH-99238_Textiles.pdf', url: '#', fechaCarga: '2026-06-02 10:00', cargadoPor: 'Ana Reyes (Pricing)' }
    ],
    eventos: [
      { id: 'e-001-1', titulo: 'Zarpe confirmado en Shanghai', descripcion: 'El buque Maersk Mc-Kinney Moller zarpó a tiempo.', fecha: '2026-06-01 18:00', tipo: 'exito' },
      { id: 'e-001-2', titulo: 'Pre-alerta enviada a destino', descripcion: 'Se enviaron pre-alertas e instrucciones de desconsolidación a Lázaro Cárdenas.', fecha: '2026-06-03 11:20', tipo: 'info' },
      { id: 'e-001-3', titulo: 'Pedimento Pre-validado', descripcion: 'El pedimento consolidado pasó validación exitosa ante aduana.', fecha: '2026-06-12 14:00', tipo: 'aduana' }
    ],
    createdAt: '2026-05-25 10:00',
    updatedAt: '2026-06-12 14:30'
  },

  // ── 2. EMBARQUE HIJO A (Vía el Master anterior) ──────────────────
  {
    id: 'SHP-2026-0002',
    folio: 'SHP-26-0002',
    cotizacionId: 'COT-2026-0001',
    modalidad: 'maritimo',
    tipo: 'hijo',
    masterId: 'SHP-2026-0001', // Enlace al Master MBL
    numeroGuia: 'HBL-VERM-002A', // HBL
    numeroReservacion: 'BKG-SH-99238',
    referenciaCliente: 'PO-ALFA-8822',
    entidades: {
      expedidor: 'Shanghai Textiles Ltd.',
      consignatario: 'Alfa Corporativo S.A.',
      notificar: 'Roberto Jiménez (Alfa Corp)',
      agenteAduanal: 'Agencia Aduanal Torres S.C.',
      agenteCarga: 'Vermur Logistics S.A.',
      agenteDestino: 'Vermur Logistics Lázaro Cárdenas',
      importador: 'Alfa Corporativo S.A. de C.V.',
      clienteCobrar: 'Alfa Corporativo S.A.'
    },
    ruta: {
      origen: {
        puertoCarga: 'Shanghai (CNSHA), CHN',
        transportista: 'Maersk Line',
        buque: 'Maersk Mc-Kinney Moller',
        bandera: 'Dinamarca',
        viaje: '2604E'
      },
      destino: {
        puertoDescarga: 'Lázaro Cárdenas (MXLZC), MEX',
        transportistaEntrega: 'Transportes Transmex S.A.',
        lugarEntrega: 'Planta Alfa Corp Toluca'
      },
      aduana: {
        aes: false,
        pedimento: '26-47-3849-6012489-A'
      }
    },
    fechas: {
      salida: '2026-06-01',
      arribo: '2026-06-25',
      ordenGeneral: '2026-07-02',
      limiteDocumentacion: '2026-05-28',
      libreDemoras: '2026-07-02',
      libreAlmacenaje: '2026-06-30'
    },
    descripcionCarga: '12 Pallets de rollos de tela de poliéster para tapicería.',
    valorDeclarado: 45000,
    cierres: {
      operativo: false,
      pago: false,
      administrativo: false
    },
    cargos: {
      ingresos: 3800,
      gastos: 2900,
      ganancia: 900,
      moneda: 'USD',
      detalles: [
        { id: 'c-002-1', concepto: 'Flete Marítimo Alícuota HBL', tipo: 'gasto', monto: 2200, moneda: 'USD' },
        { id: 'c-002-2', concepto: 'Desconsolidación y maniobras', tipo: 'gasto', monto: 700, moneda: 'USD' },
        { id: 'c-002-3', concepto: 'Flete Marítimo HBL Cobrado', tipo: 'ingreso', monto: 3100, moneda: 'USD' },
        { id: 'c-002-4', concepto: 'Servicio de Liberación Local', tipo: 'ingreso', monto: 700, moneda: 'USD' }
      ]
    },
    documentos: [
      { id: 'd-002-1', tipo: 'hbl', nombre: 'HBL_VERM_002A_Firmado.pdf', url: '#', fechaCarga: '2026-06-03 10:00', cargadoPor: 'Juan Pérez (Ventas)' },
      { id: 'd-002-2', tipo: 'packing_list', nombre: 'PKL_Textiles_Toluca.pdf', url: '#', fechaCarga: '2026-06-03 10:05', cargadoPor: 'Juan Pérez (Ventas)' }
    ],
    eventos: [
      { id: 'e-002-1', titulo: 'HBL Creado y asociado a MBL', descripcion: 'HBL Vermur-002A ligado al embarque master SHP-26-0001.', fecha: '2026-05-26 12:00', tipo: 'info' }
    ],
    createdAt: '2026-05-26 12:00',
    updatedAt: '2026-06-03 10:05'
  },

  // ── 3. EMBARQUE HIJO B (Vía el Master anterior) ──────────────────
  {
    id: 'SHP-2026-0003',
    folio: 'SHP-26-0003',
    cotizacionId: 'COT-2026-0002',
    modalidad: 'maritimo',
    tipo: 'hijo',
    masterId: 'SHP-2026-0001', // Enlace al Master MBL
    numeroGuia: 'HBL-VERM-002B', // HBL
    numeroReservacion: 'BKG-SH-99238',
    referenciaCliente: 'PO-DIST-1122',
    entidades: {
      expedidor: 'Zhejiang Parts Corp.',
      consignatario: 'Distribuidora Nacional S.A.',
      notificar: 'Ana Gómez (Dist Nacional)',
      agenteAduanal: 'Agencia Aduanal Torres S.C.',
      agenteCarga: 'Vermur Logistics S.A.',
      agenteDestino: 'Vermur Logistics Lázaro Cárdenas',
      importador: 'Distribuidora Nacional S.A. de C.V.',
      clienteCobrar: 'Distribuidora Nacional'
    },
    ruta: {
      origen: {
        puertoCarga: 'Shanghai (CNSHA), CHN',
        transportista: 'Maersk Line',
        buque: 'Maersk Mc-Kinney Moller',
        bandera: 'Dinamarca',
        viaje: '2604E'
      },
      destino: {
        puertoDescarga: 'Lázaro Cárdenas (MXLZC), MEX',
        transportistaEntrega: 'Express Norteño S.A.',
        lugarEntrega: 'Querétaro Bodega Poniente'
      },
      aduana: {
        aes: false,
        pedimento: '26-47-3849-6012489-B'
      }
    },
    fechas: {
      salida: '2026-06-01',
      arribo: '2026-06-25',
      ordenGeneral: '2026-07-02',
      limiteDocumentacion: '2026-05-28',
      libreDemoras: '2026-07-02',
      libreAlmacenaje: '2026-06-30'
    },
    descripcionCarga: '6 Pallets con refacciones automotrices y empaques.',
    valorDeclarado: 32000,
    cierres: {
      operativo: false,
      pago: false,
      administrative: false
    } as any,
    cargos: {
      ingresos: 2200,
      gastos: 1550,
      ganancia: 650,
      moneda: 'USD',
      detalles: [
        { id: 'c-003-1', concepto: 'Flete Marítimo Alícuota HBL B', tipo: 'gasto', monto: 1100, moneda: 'USD' },
        { id: 'c-003-2', concepto: 'Desconsolidación y maniobras B', tipo: 'gasto', monto: 450, moneda: 'USD' },
        { id: 'c-003-3', concepto: 'Flete HBL B Cobrado', tipo: 'ingreso', monto: 1750, moneda: 'USD' },
        { id: 'c-003-4', concepto: 'Maniobras y Desconsolidación Cliente', tipo: 'ingreso', monto: 450, moneda: 'USD' }
      ]
    },
    documentos: [
      { id: 'd-003-1', tipo: 'hbl', nombre: 'HBL_VERM_002B_Firmado.pdf', url: '#', fechaCarga: '2026-06-03 11:10', cargadoPor: 'Juan Pérez (Ventas)' }
    ],
    eventos: [
      { id: 'e-003-1', titulo: 'HBL B ligado', descripcion: 'HBL Vermur-002B asociado exitosamente.', fecha: '2026-05-26 13:00', tipo: 'info' }
    ],
    createdAt: '2026-05-26 13:00',
    updatedAt: '2026-06-03 11:10'
  },

  // ── 4. EMBARQUE AÉREO (Frankfurt → CDMX) ────────────────────────
  {
    id: 'SHP-2026-0004',
    folio: 'SHP-26-0004',
    cotizacionId: 'COT-2026-0003',
    modalidad: 'aereo',
    tipo: 'hijo', // Aéreos directos suelen ser tipo "hijo" (HBL/HAWB) o master si es consolidación
    masterId: null,
    numeroGuia: '020-99834829', // AWB
    numeroReservacion: 'LH-AWB-2026-3',
    referenciaCliente: 'PO-METAL-551',
    entidades: {
      expedidor: 'Frankfurt Precision Sensors Gmbh',
      consignatario: 'Industrias Metalúrgicas S.A.',
      notificar: 'Carlos Varela (Ind Metal)',
      agenteAduanal: 'Agente Aduanal CDMX AWB',
      agenteCarga: 'Lufthansa Cargo AG',
      agenteDestino: 'Vermur Logistics AICM',
      importador: 'Industrias Metalúrgicas S.A. de C.V.',
      clienteCobrar: 'Industrias Metalúrgicas'
    },
    ruta: {
      origen: {
        puertoCarga: 'Frankfurt (FRA), GER',
        transportista: 'Lufthansa Cargo',
        buque: 'Boeing 777F (Vuelo LH8221)',
        bandera: 'Alemania',
        viaje: 'LH8221'
      },
      destino: {
        puertoDescarga: 'AICM (MEX), CDMX, MEX',
        transportistaEntrega: 'Paquetería local Express',
        lugarEntrega: 'Planta Monterrey, N.L. (Traspaso Terrestre)'
      },
      aduana: {
        aes: false,
        pedimento: '26-16-9482-1002492'
      }
    },
    fechas: {
      salida: '2026-06-10',
      arribo: '2026-06-13',
      ordenGeneral: '2026-06-18',
      limiteDocumentacion: '2026-06-08',
      libreDemoras: '2026-06-16',
      libreAlmacenaje: '2026-06-16'
    },
    descripcionCarga: 'Sensores de temperatura, instrumentación científica e indicadores.',
    valorDeclarado: 85000,
    cierres: {
      operativo: true,
      pago: false,
      administrativo: false
    },
    cargos: {
      ingresos: 3304,
      gastos: 2800,
      ganancia: 504,
      moneda: 'USD',
      detalles: [
        { id: 'c-004-1', concepto: 'Flete Aéreo FRA-MEX', tipo: 'gasto', monto: 2800, moneda: 'USD' },
        { id: 'c-004-2', concepto: 'Flete Aéreo Cobrado (con margen)', tipo: 'ingreso', monto: 3304, moneda: 'USD' }
      ]
    },
    documentos: [
      { id: 'd-004-1', tipo: 'bl', nombre: 'HAWB_020-99834829.pdf', url: '#', fechaCarga: '2026-06-09 16:00', cargadoPor: 'Ana Reyes (Pricing)' },
      { id: 'd-004-2', tipo: 'factura', nombre: 'Commercial_Invoice_FPS_12.pdf', url: '#', fechaCarga: '2026-06-09 16:10', cargadoPor: 'Carlos Gómez (Ventas)' }
    ],
    eventos: [
      { id: 'e-004-1', titulo: 'Arribo a terminal de carga AICM', descripcion: 'Vuelo LH8221 aterrizó y descargó exitosamente.', fecha: '2026-06-13 10:15', tipo: 'exito' },
      { id: 'e-004-2', titulo: 'Rojo Aduanero en AICM', descripcion: 'Despacho sujeto a reconocimiento aduanero físico. Esperando dictamen.', fecha: '2026-06-14 11:30', tipo: 'alerta' }
    ],
    createdAt: '2026-06-07 15:45',
    updatedAt: '2026-06-14 11:30'
  },

  // ── 5. EMBARQUE TERRESTRE (Laredo → Querétaro) ───────────────────
  {
    id: 'SHP-2026-0005',
    folio: 'SHP-26-0005',
    cotizacionId: 'COT-2026-0005',
    modalidad: 'terrestre',
    tipo: 'hijo',
    masterId: null,
    numeroGuia: 'TRK-SWFT-883920', // Carta Porte / Tracking
    numeroReservacion: 'RES-TRK-7729',
    referenciaCliente: 'PO-IMP-GOLFO-11',
    entidades: {
      expedidor: 'Medical Devices Corp (Miami)',
      consignatario: 'Importadora del Golfo S.A.',
      notificar: 'Elena Ruiz (Imp Golfo)',
      agenteAduanal: 'Agencia Aduanal Laredo Express',
      agenteCarga: 'Swift Transport USA',
      agenteDestino: 'Vermur Logistics Laredo',
      importador: 'Importadora del Golfo S.A. de C.V.',
      clienteCobrar: 'Importadora del Golfo'
    },
    ruta: {
      origen: {
        puertoCarga: 'Laredo (Border Crossing), USA',
        transportista: 'Swift Transport',
        buque: 'Caja Cerrada 53\' (Eco #5523)',
        bandera: 'Estados Unidos',
        viaje: '5523-A'
      },
      destino: {
        puertoDescarga: 'Nuevo Laredo (Aduana), MEX',
        transportistaEntrega: 'Transportes González S.A.',
        lugarEntrega: 'Veracruz, Ver. (Bodega Cliente)'
      },
      aduana: {
        aes: false,
        pedimento: '26-43-1928-0029318'
      }
    },
    fechas: {
      salida: '2026-06-12',
      arribo: '2026-06-14',
      ordenGeneral: '2026-06-25',
      limiteDocumentacion: '2026-06-10',
      libreDemoras: '2026-06-17',
      libreAlmacenaje: '2026-06-17'
    },
    descripcionCarga: 'Equipo médico de diagnóstico especializado en cajas de madera.',
    valorDeclarado: 120000,
    cierres: {
      operativo: true,
      pago: true,
      administrativo: true
    },
    cargos: {
      ingresos: 5600,
      gastos: 4400,
      ganancia: 1200,
      moneda: 'USD',
      detalles: [
        { id: 'c-005-1', concepto: 'Flete Laredo-Veracruz', tipo: 'gasto', monto: 3500, moneda: 'USD' },
        { id: 'c-005-2', concepto: 'Despacho Aduanal Frontera', tipo: 'gasto', monto: 900, moneda: 'USD' },
        { id: 'c-005-3', concepto: 'Flete Terrestre Cliente', tipo: 'ingreso', monto: 4500, moneda: 'USD' },
        { id: 'c-005-4', concepto: 'Servicio Aduanal Frontera Cliente', tipo: 'ingreso', monto: 1100, moneda: 'USD' }
      ]
    },
    documentos: [
      { id: 'd-005-1', tipo: 'factura', nombre: 'Commercial_Invoice_MD-9912.pdf', url: '#', fechaCarga: '2026-06-10 14:00', cargadoPor: 'María López (Ventas)' },
      { id: 'd-005-2', tipo: 'pedimento', nombre: 'Pedimento_Importacion_Pagado.pdf', url: '#', fechaCarga: '2026-06-12 11:00', cargadoPor: 'Lucía Méndez (Pricing)' }
    ],
    eventos: [
      { id: 'e-005-1', titulo: 'Cruze de frontera y despacho libre', descripcion: 'Despacho aduanal concluido en Nuevo Laredo. Semáforo verde.', fecha: '2026-06-13 14:20', tipo: 'aduana' },
      { id: 'e-005-2', titulo: 'Entrega en bodega final', descripcion: 'Unidad arribó a Veracruz. Mercancía entregada a entera conformidad.', fecha: '2026-06-14 16:30', tipo: 'exito' }
    ],
    createdAt: '2026-06-02 14:00',
    updatedAt: '2026-06-14 16:30'
  },

  // ── 6. EMBARQUE TERRESTRE PADRE (VLIT-24-107) — Flujo real Magaya INLAND ──────
  {
    id: 'SHP-2026-0006',
    folio: 'VLIT-24-107',
    nombreEmbarque: 'VLIT-24-107',
    cotizacionId: 'VL-10702024',
    modalidad: 'terrestre',
    tipo: 'master',
    masterId: null,
    numeroGuia: 'VL-10702024',
    numeroReservacion: 'VL-10702024',
    referenciaCliente: 'VL-10702024',
    lugarRealizacion: 'Querétaro',
    realizadoPor: 'KARLA DEL VALLE',
    enTransito: true,
    fechaEnTransito: '2024-07-12 09:00',
    entidades: {
      expedidor: 'BAMAL FASTENER CORPORATION',
      consignatario: 'IMPORTACIONES Y LOGISTICA VERMUR (ILV190723FN1)',
      notificar: 'IMPORTACIONES Y LOGISTICA VERMUR',
      agenteAduanal: '—',
      agenteCarga: 'PRIMARY FREIGHT SERVICES',
      agenteDestino: 'Vermur Logistics Querétaro',
      importador: 'IMPORTACIONES Y LOGISTICA VERMUR',
      clienteCobrar: 'IMPORTACIONES Y LOGISTICA VERMUR',
    },
    ruta: {
      origen: {
        puertoCarga: 'Sidney, USA',
        transportista: 'PRIMARY FREIGHT SERVICES',
        buque: 'Unidad Terrestre #283901',
        bandera: 'Estados Unidos',
        viaje: 'Weekly Truck Sidney-Laredo',
        tipoServicio: 'Puerto a Puerto',
        modoTransportacion: 'Road, Other',
        numeroVehiculo: '283901',
        nombreChofer: 'JOSE',
      },
      destino: {
        puertoDescarga: 'Laredo, MEX',
        transportistaEntrega: 'PRIMARY FREIGHT SERVICES',
        lugarEntrega: 'Querétaro — Av. Paseo de la República Km 13020, Int 609, Juriquilla, Qro. 76230',
      },
      aduana: { aes: true, pedimento: '' },
    },
    fechas: {
      salida: '2024-07-12',
      arribo: '2024-07-15',
      ordenGeneral: '2024-07-20',
      limiteDocumentacion: '2024-07-10',
      libreDemoras: '2024-07-15',
      libreAlmacenaje: '2024-07-22',
    },
    descripcionCarga: 'Embarque terrestre INLAND consolidado — Padre del hijo BOL 9016543.',
    valorDeclarado: 0,
    cierres: { operativo: false, pago: false, administrativo: false },
    cargos: {
      ingresos: 68232.09,
      gastos: 60777.50,
      ganancia: 7454.59,
      moneda: 'MXN',
      detalles: [
        { id: 'c-vlit-1', concepto: 'International inland freight', tipo: 'gasto', monto: 35000, moneda: 'MXN' },
        { id: 'c-vlit-2', concepto: 'Customs clearance at origin', tipo: 'gasto', monto: 8500, moneda: 'MXN' },
        { id: 'c-vlit-3', concepto: 'Customs clearance at destination', tipo: 'gasto', monto: 7500, moneda: 'MXN' },
        { id: 'c-vlit-4', concepto: 'Maneuvers at origin', tipo: 'gasto', monto: 5200, moneda: 'MXN' },
        { id: 'c-vlit-5', concepto: 'Other charges', tipo: 'gasto', monto: 4577.50, moneda: 'MXN' },
        { id: 'c-vlit-6', concepto: 'Flete terrestre internacional (cobrado a cliente)', tipo: 'ingreso', monto: 52000, moneda: 'MXN' },
        { id: 'c-vlit-7', concepto: 'Despacho aduanal y honorarios (cobrado a cliente)', tipo: 'ingreso', monto: 16232.09, moneda: 'MXN' },
      ],
    },
    documentos: [],
    eventos: [
      { id: 'e-vlit-1', titulo: 'Embarque creado desde cotización', descripcion: 'VLIT-24-107 generado desde cotización VL-10702024. Carpeta: Incoming Shipments → 2024 → INLAND → Julio.', fecha: '2024-07-10 08:30', tipo: 'info' },
      { id: 'e-vlit-2', titulo: 'Cargos generados (Generar → Aceptar → Yes)', descripcion: 'Archivos de contabilidad generados. Gastos MXN $60,777.50 / Ingresos MXN $68,232.09 / Ganancia MXN $7,454.59.', fecha: '2024-07-10 09:00', tipo: 'exito' },
      { id: 'e-vlit-3', titulo: 'Puesto En Tránsito', descripcion: 'Confirmado: "¿Está seguro que desea poner el embarque VLIT-24-107 en tránsito?" → Sí. Realizado por KARLA DEL VALLE.', fecha: '2024-07-12 09:00', tipo: 'exito' },
    ],
    productos: [],
    createdAt: '2024-07-10 08:30',
    updatedAt: '2024-07-12 09:00',
  },

  // ── 7. EMBARQUE TERRESTRE HIJO (BOL 9016543) — Caso real Magaya ──────────────
  {
    id: 'SHP-2026-0007',
    folio: 'BOL 9016543',
    nombreEmbarque: 'BOL 9016543',
    cotizacionId: 'VL-10702024',
    modalidad: 'terrestre',
    tipo: 'hijo',
    masterId: 'SHP-2026-0006',
    numeroGuia: '9016543',
    numeroReservacion: 'VL-10702024',
    referenciaCliente: 'Weekly Truck Sidney - Monterrey',
    lugarRealizacion: 'Querétaro',
    realizadoPor: 'KARLA DEL VALLE',
    enTransito: true,
    fechaEnTransito: '2024-07-12 09:00',
    entidades: {
      expedidor: 'BAMAL FASTENER CORPORATION (XEX010101000) — 13725 South Point Blvd., Charlotte NC 28273, USA',
      consignatario: 'PACIFIC COMPONENTS DE MEXICO (PCM0305205AA) — C. Juárez 1102 Piso 32 Of. 3204, Mty. N.L. 64000',
      notificar: 'PACIFIC COMPONENTS DE MEXICO',
      agenteAduanal: '—',
      agenteCarga: 'PRIMARY FREIGHT SERVICES',
      agenteDestino: 'Vermur Logistics Querétaro',
      importador: 'PACIFIC COMPONENTS DE MEXICO (PCM0305205AA)',
      clienteCobrar: 'BAMAL FASTENER CORPORATION',
    },
    ruta: {
      origen: {
        puertoCarga: 'Sidney, USA',
        transportista: 'PRIMARY FREIGHT SERVICES',
        buque: 'Unidad Terrestre #283901',
        bandera: 'Estados Unidos',
        viaje: 'Weekly Truck Sidney-Laredo',
        tipoServicio: 'Puerto a Puerto',
        modoTransportacion: 'Road, Other',
        numeroVehiculo: '283901',
        nombreChofer: 'JOSE',
      },
      destino: {
        puertoDescarga: 'Laredo, MEX',
        transportistaEntrega: 'PRIMARY FREIGHT SERVICES',
        lugarEntrega: 'Monterrey, Nuevo León — C. Juárez 1102, Piso 32 Of. 3204 (PACIFIC COMPONENTS DE MEXICO)',
      },
      aduana: { aes: true, pedimento: '' },
    },
    fechas: {
      salida: '2024-07-12',
      arribo: '2024-07-15',
      ordenGeneral: '2024-07-20',
      limiteDocumentacion: '2024-07-10',
      libreDemoras: '2024-07-15',
      libreAlmacenaje: '2024-07-22',
    },
    descripcionCarga: 'BOLTS OR NUTS — 17 pallets / 14,690 kg. Consignado a PACIFIC COMPONENTS DE MEXICO.',
    valorDeclarado: 0,
    cierres: { operativo: false, pago: false, administrativo: false },
    cargos: {
      ingresos: 0,
      gastos: 0,
      ganancia: 0,
      moneda: 'MXN',
      detalles: [],
    },
    documentos: [
      {
        id: 'd-bol-1',
        tipo: 'bl',
        nombre: 'BOL-9016543.pdf',
        url: '#',
        fechaCarga: '2024-07-10 10:05',
        cargadoPor: 'KARLA DEL VALLE',
      },
    ],
    eventos: [
      { id: 'e-bol-1', titulo: 'Embarque hijo BOL creado', descripcion: 'BOL 9016543 creado como hijo de VLIT-24-107. Folio interno VL22287 generado bajo el embarque padre.', fecha: '2024-07-10 09:30', tipo: 'info' },
      { id: 'e-bol-2', titulo: 'BOOKING CONFIRMATION eliminado', descripcion: 'Evento BOOKING CONFIRMATION eliminado del embarque hijo (Eventos → Seleccionar → Eliminar → Yes).', fecha: '2024-07-10 09:45', tipo: 'info' },
      { id: 'e-bol-3', titulo: 'Producto capturado: BOLTS OR NUTS', descripcion: '17 Pallets · 14,690 kg. Capturado en pestaña Productos (Adicionar → OK).', fecha: '2024-07-10 10:00', tipo: 'exito' },
      { id: 'e-bol-4', titulo: 'BOL adjunto cargado', descripcion: 'Archivo BOL-9016543.pdf (45.49 KB) adjuntado desde Dispositivo (Adjuntos → Adicionar → Todos los Archivos).', fecha: '2024-07-10 10:05', tipo: 'exito' },
      { id: 'e-bol-5', titulo: 'Puesto En Tránsito', descripcion: 'BOL 9016543 en tránsito. Salida Sidney 7/12/2024 → Arribo Laredo 7/15/2024. Fecha libre demoras: 7/15/2024.', fecha: '2024-07-12 09:00', tipo: 'exito' },
    ],
    productos: [
      {
        id: 'prod-bol-1',
        descripcion: 'BOLTS OR NUTS',
        tipoEmbalaje: 'Pallet',
        piezas: 17,
        peso: 14690,
      },
    ],
    createdAt: '2024-07-10 09:30',
    updatedAt: '2024-07-12 09:00',
  },

  // ── 8. EMBARQUE AÉREO MASTER (VLIA-24-020) — Flujo real Magaya AIR ───────────────
  {
    id: 'SHP-2026-0008',
    folio: 'VLIA-24-020',
    nombreEmbarque: 'VLIA-24-020',
    cotizacionId: 'COT-VLIA-2024-020',
    modalidad: 'aereo',
    tipo: 'master',
    masterId: null,
    numeroGuia: '205-22257550',
    numeroReservacion: '205-22257550',
    referenciaCliente: 'MYS20240120S01',
    lugarRealizacion: 'Querétaro',
    realizadoPor: 'Angel Luna',
    tipoEntrega: 'Entrega Exprés',
    enTransito: false,
    entidades: {
      expedidor: "Qingdao Min Youngs Int'l Trade / Qingdao RXT Yixiang Technology",
      consignatario: 'Equipos Hidromecánicos MC, S.A. de C.V.',
      notificar: 'Equipos Hidromecánicos MC, S.A. de C.V.',
      agenteAduanal: '—',
      agenteCarga: 'ASIA AIR FREIGHT CO LTD',
      agenteDestino: 'Vermur Logistics CDMX / AICM',
      importador: 'Equipos Hidromecánicos MC, S.A. de C.V.',
      clienteCobrar: 'Equipos Hidromecánicos MC, S.A. de C.V.',
    },
    ruta: {
      origen: {
        puertoCarga: 'Beijing (PEK), CHN',
        transportista: 'Shanghai Everok-Air International Airfreight',
        buque: 'Vuelo ASIA AIR FREIGHT CO LTD',
        bandera: 'China',
        viaje: 'ASIA AIR FREIGHT',
        tipoServicio: 'Puerto a Puerto',
        modoTransportacion: 'Air',
      },
      destino: {
        puertoDescarga: 'Ciudad de México (MEX), CDMX, MEX',
        transportistaEntrega: 'ASIA AIR FREIGHT CO LTD',
        lugarEntrega: 'Querétaro, Qro. — Entrega a Equipos Hidromecánicos MC',
      },
      aduana: { aes: false, pedimento: '' },
    },
    fechas: {
      salida: '2024-07-01',
      arribo: '2024-07-05',
      ordenGeneral: '2024-07-12',
      limiteDocumentacion: '2024-06-28',
      libreDemoras: '2024-07-10',
      libreAlmacenaje: '2024-07-10',
    },
    descripcionCarga: 'METAL PARTS — 1 pallet / 719.00 kg / 0.39 m³',
    valorDeclarado: 0,
    cierres: { operativo: false, pago: false, administrativo: false },
    cargos: { ingresos: 0, gastos: 0, ganancia: 0, moneda: 'USD', detalles: [] },
    documentos: [
      { id: 'd-vlia-1', tipo: 'mbl', nombre: 'MAWB_205-22257550.pdf', url: '#', fechaCarga: '2024-07-01 09:00', cargadoPor: 'Angel Luna' },
      { id: 'd-vlia-2', tipo: 'factura', nombre: 'Commercial_Invoice_MYS20240120S01.pdf', url: '#', fechaCarga: '2024-07-01 09:05', cargadoPor: 'Angel Luna' },
      { id: 'd-vlia-3', tipo: 'packing_list', nombre: 'Packing_List_MYS20240120S01.pdf', url: '#', fechaCarga: '2024-07-01 09:10', cargadoPor: 'Angel Luna' },
    ],
    eventos: [
      { id: 'e-vlia-1', titulo: 'Embarque creado desde cotización', descripcion: 'VLIA-24-020 generado desde cotización asignada. Carpeta: Incoming Shipments → 2024 → Air → Julio.', fecha: '2024-07-01 08:30', tipo: 'info' },
      { id: 'e-vlia-2', titulo: 'MAWB 205-22257550 capturado', descripcion: 'Guía Aérea y Reservación: 205-22257550. Invoice Ref: MYS20240120S01. Transportista: Shanghai Everok-Air International Airfreight. Tipo entrega: Entrega Exprés.', fecha: '2024-07-01 08:45', tipo: 'info' },
      { id: 'e-vlia-3', titulo: 'Entidades y ruta capturadas', descripcion: 'Expedidor: Qingdao RXT Yixiang Technology. Consignatario: Equipos Hidromecánicos MC. Ruta: Beijing (PEK) → CDMX (MEX).', fecha: '2024-07-01 09:00', tipo: 'info' },
      { id: 'e-vlia-4', titulo: 'Carga capturada: METAL PARTS', descripcion: 'Producto: METAL PARTS · Totales marcados · 1 Pallet · 719.00 kg · 0.39 m³.', fecha: '2024-07-01 09:15', tipo: 'exito' },
      { id: 'e-vlia-5', titulo: 'Documentos adjuntados', descripcion: 'MAWB + Commercial Invoice + Packing List adjuntados desde Descargas (Todos los Archivos → Yes).', fecha: '2024-07-01 09:20', tipo: 'exito' },
    ],
    productos: [
      { id: 'prod-vlia-1', descripcion: 'METAL PARTS', tipoEmbalaje: 'Pallet', piezas: 1, peso: 719.00, volumen: 0.39 },
    ],
    createdAt: '2024-07-01 08:30',
    updatedAt: '2024-07-01 09:20',
  },

  // ── 9. EMBARQUE AÉREO HIJO (HAWB EASHA2406487) — House Air Waybill ─────────────
  {
    id: 'SHP-2026-0009',
    folio: 'EASHA2406487',
    nombreEmbarque: 'EASHA2406487',
    cotizacionId: 'COT-VLIA-2024-020',
    modalidad: 'aereo',
    tipo: 'hijo',
    masterId: 'SHP-2026-0008',
    numeroGuia: 'EASHA2406487',
    numeroReservacion: '205-22257550',
    referenciaCliente: 'MYS20240120S01',
    lugarRealizacion: 'Querétaro',
    realizadoPor: 'Angel Luna',
    tipoEntrega: 'Entrega Exprés',
    enTransito: false,
    entidades: {
      expedidor: "Qingdao Min Youngs Int'l Trade / Qingdao RXT Yixiang Technology",
      consignatario: 'Equipos Hidromecánicos MC, S.A. de C.V.',
      notificar: 'Equipos Hidromecánicos MC, S.A. de C.V.',
      agenteAduanal: '—',
      agenteCarga: 'ASIA AIR FREIGHT CO LTD',
      agenteDestino: 'Vermur Logistics CDMX / AICM',
      importador: 'Equipos Hidromecánicos MC, S.A. de C.V.',
      clienteCobrar: 'Equipos Hidromecánicos MC, S.A. de C.V.',
    },
    ruta: {
      origen: {
        puertoCarga: 'Beijing (PEK), CHN',
        transportista: 'Shanghai Everok-Air International Airfreight',
        buque: 'Vuelo ASIA AIR FREIGHT CO LTD',
        bandera: 'China',
        viaje: 'ASIA AIR FREIGHT',
        tipoServicio: 'Puerto a Puerto',
        modoTransportacion: 'Air',
      },
      destino: {
        puertoDescarga: 'Ciudad de México (MEX), CDMX, MEX',
        transportistaEntrega: 'ASIA AIR FREIGHT CO LTD',
        lugarEntrega: 'Querétaro, Qro. — Equipos Hidromecánicos MC, S.A. de C.V.',
      },
      aduana: { aes: false, pedimento: '' },
    },
    fechas: {
      salida: '2024-07-01',
      arribo: '2024-07-05',
      ordenGeneral: '2024-07-12',
      limiteDocumentacion: '2024-06-28',
      libreDemoras: '2024-07-10',
      libreAlmacenaje: '2024-07-10',
    },
    descripcionCarga: 'METAL PARTS — HAWB Equipos Hidromecánicos MC, S.A. de C.V.',
    valorDeclarado: 0,
    cierres: { operativo: false, pago: false, administrativo: false },
    cargos: { ingresos: 0, gastos: 0, ganancia: 0, moneda: 'USD', detalles: [] },
    documentos: [
      { id: 'd-hawb-1', tipo: 'hbl', nombre: 'HAWB_EASHA2406487.pdf', url: '#', fechaCarga: '2024-07-01 09:00', cargadoPor: 'Angel Luna' },
      { id: 'd-hawb-2', tipo: 'factura', nombre: 'Commercial_Invoice_MYS20240120S01.pdf', url: '#', fechaCarga: '2024-07-01 09:05', cargadoPor: 'Angel Luna' },
      { id: 'd-hawb-3', tipo: 'packing_list', nombre: 'Packing_List_MYS20240120S01.pdf', url: '#', fechaCarga: '2024-07-01 09:10', cargadoPor: 'Angel Luna' },
    ],
    eventos: [
      { id: 'e-hawb-1', titulo: 'HAWB hijo creado desde master VLIA-24-020', descripcion: 'House Air Waybill EASHA2406487 creado como hijo de VLIA-24-020 (Hijos → Embarque Hijo).', fecha: '2024-07-01 09:00', tipo: 'info' },
      { id: 'e-hawb-2', titulo: 'Entidades del HAWB capturadas', descripcion: 'Expedidor: Qingdao Min Youngs / Qingdao RXT Yixiang. Último Consignatario: Equipos Hidromecánicos MC. Tipo entrega: Entrega Exprés. Agente: ASIA AIR FREIGHT CO LTD.', fecha: '2024-07-01 09:05', tipo: 'info' },
      { id: 'e-hawb-3', titulo: 'Documentos adjuntados al HAWB', descripcion: 'HAWB_EASHA2406487.pdf + Commercial Invoice + Packing List (Adjuntos → Adicionar → Todos los Archivos → Yes).', fecha: '2024-07-01 09:15', tipo: 'exito' },
    ],
    productos: [
      { id: 'prod-hawb-1', descripcion: 'METAL PARTS', tipoEmbalaje: 'Pallet', piezas: 1, peso: 719.00, volumen: 0.39 },
    ],
    createdAt: '2024-07-01 09:00',
    updatedAt: '2024-07-01 09:15',
  },
];
