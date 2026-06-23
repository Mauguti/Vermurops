export type RFQStatus = 'Pendiente' | 'En proceso' | 'Completado';
export type Modality = string;

export interface ProviderQuote {
  id: string;
  providerName: string;
  description: string;
  cost: number;
  currency: 'USD' | 'MXN';
  dateReceived: string;
  selected: boolean;
  attachment?: { name: string; url: string };
}

export interface RFQService {
  id: string;
  modality: Modality;
  description: string;
  providerQuotes: ProviderQuote[];
}

export interface RFQ {
  id: string;
  quoteRef: string;
  client: string;
  services: RFQService[];
  responsible: string;
  deadline: string;
  status: RFQStatus;
  surchargesPercent: number;
  marginPercent: number;
}

export const initialRFQs: RFQ[] = [
  {
    id: 'RFQ-001',
    quoteRef: 'QT-1004',
    client: 'Grupo Textil Monterrey',
    services: [
      {
        id: 'srv-1',
        modality: 'maritimo',
        description: 'FCL 40HQ Ningbo -> Manzanillo',
        providerQuotes: [
          {
            id: 'pq-1',
            providerName: 'Hapag-Lloyd',
            description: 'Flete Base + BAF',
            cost: 3200,
            currency: 'USD',
            dateReceived: '2023-11-05',
            selected: true
          },
          {
            id: 'pq-2',
            providerName: 'MSC Mediterranean',
            description: 'Flete Total',
            cost: 3450,
            currency: 'USD',
            dateReceived: '2023-11-06',
            selected: false
          }
        ]
      },
      {
        id: 'srv-2',
        modality: 'aduanal',
        description: 'Despacho Aduanal en Manzanillo',
        providerQuotes: []
      }
    ],
    responsible: 'Laura Martínez',
    deadline: '2023-11-10',
    status: 'En proceso',
    surchargesPercent: 2,
    marginPercent: 15,
  },
  {
    id: 'RFQ-002',
    quoteRef: 'QT-1005',
    client: 'Industrias Querétaro SA',
    services: [
      {
        id: 'srv-3',
        modality: 'aereo',
        description: 'Air Freight Frankfurt -> CDMX 500kg',
        providerQuotes: []
      }
    ],
    responsible: 'Carlos Ruiz',
    deadline: '2023-11-12',
    status: 'Pendiente',
    surchargesPercent: 0,
    marginPercent: 0,
  },
  {
    id: 'RFQ-003',
    quoteRef: 'QT-0990',
    client: 'Comercial del Norte',
    services: [
      {
        id: 'srv-4',
        modality: 'terrestre',
        description: 'FTL Laredo -> Monterrey',
        providerQuotes: [
          {
            id: 'pq-3',
            providerName: 'Swift Logistics SA de CV',
            description: 'Cruce + Flete directo',
            cost: 850,
            currency: 'USD',
            dateReceived: '2023-10-25',
            selected: true
          }
        ]
      }
    ],
    responsible: 'Laura Martínez',
    deadline: '2023-10-26',
    status: 'Completado',
    surchargesPercent: 0,
    marginPercent: 20,
  }
];
