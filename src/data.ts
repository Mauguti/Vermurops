export type QuoteStatus = 'Enviada' | 'Aceptada' | 'Rechazada' | 'Vencida';
export type ShipmentStatus = 'Reservado' | 'Recolectado' | 'En tránsito' | 'En aduana' | 'Entregado';
export type TransportType = 'Aéreo' | 'Marítimo' | 'Terrestre';
export type Incoterm = 'EXW' | 'FOB' | 'CIF' | 'DDP' | 'DAP';

export interface Client {
  id: string;
  name: string;
  rfc: string;
  contact: string;
  email: string;
  phone: string;
  shipmentsCount: number;
  quotesCount: number;
  balance: number;
  balanceStatus: 'ok' | 'vencido';
  type: 'Cliente' | 'Prospecto';
  responsableId?: string;
}

export interface Quote {
  id: string;
  clientId: string;
  type: TransportType;
  origin: string;
  destination: string;
  weight: number;
  volume: number;
  incoterm: Incoterm;
  date: string;
  status: QuoteStatus;
  provider: string;
  baseRate: number;
  transitTime: string;
  margin: number;
  total: number;
}

export interface ShipmentDocument {
  name: string;
  status: 'ok' | 'pending';
}

export interface Shipment {
  id: string;
  clientId: string;
  origin: string;
  destination: string;
  status: ShipmentStatus;
  type: TransportType;
  eta: string;
  incoterm: Incoterm;
  carrier: string;
  timelineStep: number;
  documents: ShipmentDocument[];
  notes: string;
}

export const initialClients: Client[] = [
  { id: 'C-001', name: "Grupo Textil Monterrey", rfc: "GTM890123M1", contact: "Juan Pérez", email: "juan@textil.com", phone: "81 1234 5678", shipmentsCount: 12, quotesCount: 5, balance: 0, balanceStatus: 'ok', type: 'Cliente', responsableId: 'ventas@vermur.com' },
  { id: 'C-002', name: "Industrias Querétaro SA", rfc: "IQU760412Q1", contact: "María López", email: "maria@industriasqro.com", phone: "442 987 6543", shipmentsCount: 8, quotesCount: 3, balance: 1800, balanceStatus: 'ok', type: 'Cliente', responsableId: 'ventas@vermur.com' },
  { id: 'C-003', name: "Comercial del Norte", rfc: "CNO880505XX1", contact: "Carlos Gómez", email: "cgomez@comercialnorte.mx", phone: "662 345 6789", shipmentsCount: 24, quotesCount: 12, balance: 4500, balanceStatus: 'vencido', type: 'Cliente', responsableId: 'otro@vermur.com' },
  { id: 'C-004', name: "Tech Solutions MX", rfc: "TSM990812AB1", contact: "Ana Silva", email: "ana.silva@techsolutions.mx", phone: "55 9876 5432", shipmentsCount: 0, quotesCount: 2, balance: 0, balanceStatus: 'ok', type: 'Prospecto', responsableId: 'ventas@vermur.com' }
];

export const initialQuotes: Quote[] = [
  { id: 'QT-1001', clientId: 'C-002', type: 'Aéreo', origin: 'Shenzhen', destination: 'Qro', weight: 500, volume: 2, incoterm: 'DAP', date: '2023-10-24', status: 'Enviada', provider: 'DHL Express', baseRate: 1500, transitTime: '5 días', margin: 20, total: 1800 },
  { id: 'QT-1002', clientId: 'C-001', type: 'Marítimo', origin: 'Qingdao', destination: 'Manzanillo', weight: 15000, volume: 30, incoterm: 'FOB', date: '2023-10-20', status: 'Aceptada', provider: 'Hapag-Lloyd', baseRate: 3500, transitTime: '25 días', margin: 15, total: 4025 },
  { id: 'QT-1003', clientId: 'C-003', type: 'Terrestre', origin: 'Houston', destination: 'Chihuahua', weight: 2000, volume: 15, incoterm: 'EXW', date: '2023-09-15', status: 'Vencida', provider: 'Swift', baseRate: 800, transitTime: '3 días', margin: 25, total: 1000 },
];

export const initialShipments: Shipment[] = [
  { id: 'SHP-2023-001', clientId: 'C-001', origin: 'Shanghai, CHN', destination: 'Manzanillo, MEX', status: 'En tránsito', type: 'Marítimo', eta: '2023-11-15', incoterm: 'FOB', carrier: 'MSC', timelineStep: 2, documents: [{name: 'BL', status: 'ok'}, {name: 'Factura', status: 'ok'}, {name: 'Packing List', status: 'ok'}, {name: 'Pedimento', status: 'pending'}], notes: 'Documentación en revisión aduanal.' },
  { id: 'SHP-2023-002', clientId: 'C-002', origin: 'Frankfurt, GER', destination: 'CDMX, MEX', status: 'Reservado', type: 'Aéreo', eta: '2023-10-30', incoterm: 'EXW', carrier: 'Lufthansa', timelineStep: 0, documents: [{name: 'AWB', status: 'pending'}, {name: 'Factura', status: 'ok'}, {name: 'Packing List', status: 'ok'}, {name: 'Pedimento', status: 'pending'}], notes: 'Esperando recolección en origen.' },
  { id: 'SHP-2023-003', clientId: 'C-003', origin: 'Laredo, USA', destination: 'Monterrey, MEX', status: 'En aduana', type: 'Terrestre', eta: '2023-10-25', incoterm: 'DAP', carrier: 'Swift', timelineStep: 3, documents: [{name: 'Carta Porte', status: 'ok'}, {name: 'Factura', status: 'ok'}, {name: 'Packing List', status: 'ok'}, {name: 'Pedimento', status: 'ok'}], notes: 'Liberación programada para mañana.' },
  { id: 'SHP-2023-004', clientId: 'C-001', origin: 'Ningbo, CHN', destination: 'Ensenada, MEX', status: 'Entregado', type: 'Marítimo', eta: '2023-10-20', incoterm: 'CIF', carrier: 'Hapag-Lloyd', timelineStep: 4, documents: [{name: 'BL', status: 'ok'}, {name: 'Factura', status: 'ok'}, {name: 'Packing List', status: 'ok'}, {name: 'Pedimento', status: 'ok'}], notes: 'Entrega completada sin incidencias.' },
];

export interface ProviderContact {
  name: string;
  role: string;
  email: string;
  phone: string;
}

export interface ProviderQuoteHistory {
  id: string;
  date: string;
  amount: number;
  modality: 'maritimo' | 'aereo' | 'terrestre' | 'aduanal';
}

export interface Provider {
  id: string;
  name: string;
  rfc: string;
  address: string;
  website: string;
  contact: ProviderContact;
  modalities: ('maritimo' | 'aereo' | 'terrestre' | 'aduanal')[];
  quotesHistory: ProviderQuoteHistory[];
  active: boolean;
  notes: string;
}

export const initialProviders: Provider[] = [
  {
    id: 'PRV-001',
    name: 'Hapag-Lloyd',
    rfc: 'HLL980101QW1',
    address: 'Av. Paseo de la Reforma 250, CDMX',
    website: 'www.hapag-lloyd.com',
    contact: { name: 'Roberto Díaz', role: 'Key Account Manager', email: 'roberto.diaz@hl.com', phone: '55 4321 8765' },
    modalities: ['maritimo'],
    quotesHistory: [
      { id: 'QT-1002-HL', date: '2023-10-18', amount: 3500, modality: 'maritimo' },
      { id: 'QT-1015-HL', date: '2023-11-05', amount: 3200, modality: 'maritimo' }
    ],
    active: true,
    notes: 'Buenas tarifas para rutas a Asia. Tiempos de respuesta lentos los viernes.'
  },
  {
    id: 'PRV-002',
    name: 'Lufthansa Cargo',
    rfc: 'LCA880222XZ2',
    address: 'Terminal de Carga AICM, CDMX',
    website: 'lufthansa-cargo.com',
    contact: { name: 'Sandra Meyer', role: 'Sales Rep', email: 'smeyer@lufthansa.com', phone: '55 1122 3344' },
    modalities: ['aereo'],
    quotesHistory: [
      { id: 'QT-1001-LH', date: '2023-10-22', amount: 1500, modality: 'aereo' }
    ],
    active: true,
    notes: 'Excelente para consolidados a Europa.'
  },
  {
    id: 'PRV-003',
    name: 'Swift Logistics SA de CV',
    rfc: 'SWL050505AA1',
    address: 'Carretera a Laredo Km 15, Monterrey',
    website: 'www.swiftlog.mx',
    contact: { name: 'Carlos Mendoza', role: 'Despachador', email: 'cmendoza@swiftlog.mx', phone: '81 5555 9999' },
    modalities: ['terrestre'],
    quotesHistory: [
      { id: 'QT-1003-SW', date: '2023-09-12', amount: 800, modality: 'terrestre' }
    ],
    active: true,
    notes: 'Rutas NAFTA exclusivamente.'
  },
  {
    id: 'PRV-004',
    name: 'Agencia Aduanal Torres',
    rfc: 'AAT901010BB2',
    address: 'Av. Oceanía 100, Manzanillo',
    website: 'www.aatorres.com.mx',
    contact: { name: 'Lucía Torres', role: 'Agente Aduanal', email: 'lucia@aatorres.com.mx', phone: '314 222 1111' },
    modalities: ['aduanal'],
    quotesHistory: [],
    active: true,
    notes: 'Especialistas en despacho de químicos y materiales peligrosos.'
  },
  {
    id: 'PRV-005',
    name: 'Grupo Logístico Universal',
    rfc: 'GLU120304CC3',
    address: 'Boulevard Puerto Aéreo 500, CDMX',
    website: 'www.gluniversal.mx',
    contact: { name: 'Javier Santos', role: 'Ejecutivo Comercial', email: 'jsantos@gluniversal.mx', phone: '55 9876 5432' },
    modalities: ['aereo', 'maritimo', 'terrestre'],
    quotesHistory: [],
    active: false,
    notes: 'Actualmente en revisión de crédito, no usar.'
  }
];
export interface Prospecto {
  id: string;
  folio: string;           // PRO-2026-XXXX
  empresa: string;
  contactoNombre: string;
  contactoEmail?: string;
  contactoTel?: string;
  origenLead: "referido" | "web" | "llamada" | "visita" | "linkedin" | "otro";
  servicioPotencial: string[];  // servicios del catálogo
  etapa: "nuevo_lead" | "contactado" | "calificado" | "convertido" | "perdido";
  /**
   * Por qué se perdió. Un prospecto que desaparece sin motivo es una venta
   * perdida sobre la que no se puede aprender nada. Mismo catálogo que las
   * cotizaciones perdidas (lib/motivosPerdida.ts).
   */
  motivoPerdida?: string | null;
  fechaPerdida?: string;
  responsable: string;
  fechaCreacion: string;
  proximaActividad?: string;
  fechaProximaActividad?: string;
  notas?: string;
  valorEstimado?: number;     // USD, opcional
  actividades: ProspectoActivity[];
}

export interface ProspectoActivity {
  id: string;
  tipo: 'llamada' | 'correo' | 'reunion' | 'nota' | 'whatsapp' | 'cambio_etapa';
  descripcion: string;
  fecha: string;
  responsable: string;
}

export const initialProspectos: Prospecto[] = [
  {
    id: "prosp-1",
    folio: "PRO-2026-0001",
    empresa: "TechCorp México",
    contactoNombre: "Laura Medina",
    contactoEmail: "laura@techcorp.mx",
    origenLead: "web",
    servicioPotencial: ["Flete Internacional", "Asesoría Aduanal"],
    etapa: "nuevo_lead",
    responsable: "Juan Pérez",
    fechaCreacion: "2026-06-14",
    notas: "Buscan importar electrónicos desde Shenzhen.",
    actividades: []
  },
  {
    id: "prosp-2",
    folio: "PRO-2026-0002",
    empresa: "AgroExportadora del Bajío",
    contactoNombre: "Carlos Ruiz",
    contactoTel: "442 123 4567",
    origenLead: "llamada",
    servicioPotencial: ["Transporte Terrestre", "Seguro de Mercancía"],
    etapa: "contactado",
    responsable: "Ana Ramírez",
    fechaCreacion: "2026-06-10",
    proximaActividad: "Llamada de seguimiento",
    fechaProximaActividad: "2026-06-18",
    valorEstimado: 4500,
    actividades: [
      { id: 'act-1', tipo: 'llamada', descripcion: 'Llamada inicial de descubrimiento.', fecha: '2026-06-12T10:00', responsable: 'Ana Ramírez' }
    ]
  },
  {
    id: "prosp-3",
    folio: "PRO-2026-0003",
    empresa: "Muebles de Diseño SA",
    contactoNombre: "Elena Rojas",
    contactoEmail: "elena@mueblesdiseno.com",
    origenLead: "referido",
    servicioPotencial: ["Flete Internacional"],
    etapa: "calificado",
    responsable: "Juan Pérez",
    fechaCreacion: "2026-06-05",
    proximaActividad: "Preparar cotización",
    fechaProximaActividad: "2026-06-17",
    valorEstimado: 12000,
    notas: "Requieren 3 contenedores mensuales.",
    actividades: [
      { id: 'act-2', tipo: 'reunion', descripcion: 'Reunión presencial en sus oficinas para evaluar volumetría.', fecha: '2026-06-10T16:30', responsable: 'Juan Pérez' }
    ]
  },
  {
    id: "prosp-4",
    folio: "PRO-2026-0004",
    empresa: "Industrias Metálicas",
    contactoNombre: "Roberto Gómez",
    origenLead: "linkedin",
    servicioPotencial: ["Maniobras", "Transporte Terrestre"],
    etapa: "convertido",
    responsable: "Ana Ramírez",
    fechaCreacion: "2026-05-20",
    valorEstimado: 3200,
    actividades: []
  }
];
