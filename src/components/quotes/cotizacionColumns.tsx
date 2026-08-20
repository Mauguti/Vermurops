/**
 * cotizacionColumns.tsx (TV-1)
 *
 * Catálogo de columnas para la vista de lista (SpreadsheetTable) del módulo de Cotizaciones.
 * Cada columna tiene un id estable que se referencia en las vistas guardadas.
 *
 * Vista default (6 columnas): folio, cliente, etapa, total, moneda, updatedAt.
 */

import React from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Plane, Ship, Truck } from 'lucide-react';
import type { KanbanQuote, PipelineStage } from './QuotesData';
import { PIPELINE_STAGES } from './QuotesData';
import type { SpreadsheetColumnMeta, VistaConfig } from '../table/SpreadsheetTable';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const stageMap = new Map<string, PipelineStage>(
  PIPELINE_STAGES.map(s => [s.id, s]),
);

function ModalidadIcon({ tipo }: { tipo: string }) {
  const t = tipo?.toLowerCase();
  if (t?.startsWith('mar')) return <Ship className="w-3.5 h-3.5 text-blue-500" />;
  if (t?.startsWith('aer') || t?.startsWith('aér')) return <Plane className="w-3.5 h-3.5 text-sky-500" />;
  if (t?.startsWith('ter')) return <Truck className="w-3.5 h-3.5 text-amber-600" />;
  return null;
}

// ─── Badge de etapa ─────────────────────────────────────────────────────────

const ETAPA_COLORS: Record<string, string> = {
  solicitud_cliente:     'bg-gray-100 text-gray-700',
  solicitado_pricing:    'bg-amber-50 text-amber-700',
  pricing_solicitando:   'bg-indigo-50 text-indigo-700',
  cotizaciones_recibidas:'bg-violet-50 text-violet-700',
  consolidada:           'bg-cyan-50 text-cyan-700',
  enviada_cliente:       'bg-blue-50 text-blue-700',
  negociacion:           'bg-rose-50 text-rose-700',
  ganada:                'bg-emerald-50 text-emerald-700',
  perdida:               'bg-red-50 text-red-700',
};

// ─── Column definitions ─────────────────────────────────────────────────────

const col = createColumnHelper<KanbanQuote>();

export const COTIZACION_COLUMNS = [
  // 1. Folio (pinned)
  col.accessor('id', {
    id: 'folio',
    header: 'Folio',
    size: 140,
    cell: info => (
      <span className="font-mono font-medium text-gray-900">{info.getValue()}</span>
    ),
  }),

  // 2. Cliente
  col.accessor(row => row.prospecto.empresa, {
    id: 'cliente',
    header: 'Cliente',
    size: 180,
    cell: info => info.getValue() || 'Sin cliente',
  }),

  // 3. Etapa
  col.accessor('etapa', {
    id: 'etapa',
    header: 'Etapa',
    size: 170,
    cell: info => {
      const etapa = info.getValue();
      const stage = stageMap.get(etapa);
      const colors = ETAPA_COLORS[etapa] || 'bg-gray-100 text-gray-600';
      return (
        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${colors}`}>
          {stage?.label || etapa.replace(/_/g, ' ')}
        </span>
      );
    },
    sortingFn: (a, b) => {
      const order = PIPELINE_STAGES.map(s => s.id);
      return order.indexOf(a.original.etapa) - order.indexOf(b.original.etapa);
    },
  }),

  // 4. Modalidad (primer servicio)
  col.accessor(row => row.servicios[0]?.tipo || '', {
    id: 'modalidad',
    header: 'Modalidad',
    size: 100,
    cell: info => {
      const tipo = info.getValue();
      if (!tipo) return <span className="text-gray-300">—</span>;
      return (
        <span className="flex items-center gap-1">
          <ModalidadIcon tipo={tipo} />
          <span className="capitalize">{tipo}</span>
        </span>
      );
    },
  }),

  // 5. Ruta (primer servicio)
  col.accessor(row => {
    const srv = row.servicios[0];
    if (!srv?.ruta) return '';
    return `${srv.ruta.origen || ''} → ${srv.ruta.destino || ''}`;
  }, {
    id: 'ruta',
    header: 'Ruta',
    size: 200,
    cell: info => {
      const val = info.getValue();
      return val || <span className="text-gray-300">—</span>;
    },
  }),

  // 6. Servicios (conteo)
  col.accessor(row => row.servicios.length, {
    id: 'servicios',
    header: 'Servicios',
    size: 80,
    meta: { align: 'center' } as SpreadsheetColumnMeta,
    cell: info => info.getValue(),
  }),

  // 7. Total consolidado
  col.accessor('valorTotalConsolidado', {
    id: 'total',
    header: 'Total',
    size: 120,
    meta: { align: 'right' } as SpreadsheetColumnMeta,
    cell: info => {
      const val = info.getValue() || 0;
      return `$${val.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`;
    },
  }),

  // 8. Moneda
  col.accessor('moneda', {
    id: 'moneda',
    header: 'Moneda',
    size: 70,
    meta: { align: 'center' } as SpreadsheetColumnMeta,
    cell: info => (
      <span className="text-gray-500">{info.getValue()}</span>
    ),
  }),

  // 9. Vendedor
  col.accessor('vendedorId', {
    id: 'vendedor',
    header: 'Vendedor',
    size: 130,
    cell: info => info.getValue() || '—',
  }),

  // 10. Pricing
  col.accessor('pricingId', {
    id: 'pricing',
    header: 'Pricing',
    size: 130,
    cell: info => info.getValue() || <span className="text-gray-300">Sin asignar</span>,
  }),

  // 11. Incoterm (primer servicio)
  col.accessor(row => row.servicios[0]?.incoterm || '', {
    id: 'incoterm',
    header: 'Incoterm',
    size: 80,
    meta: { align: 'center' } as SpreadsheetColumnMeta,
    cell: info => info.getValue() || <span className="text-gray-300">—</span>,
  }),

  // 12. Creado
  col.accessor('createdAt', {
    id: 'createdAt',
    header: 'Creado',
    size: 100,
    cell: info => {
      const val = info.getValue();
      return val ? val.slice(0, 10) : '—';
    },
  }),

  // 13. Actualizado
  col.accessor('updatedAt', {
    id: 'updatedAt',
    header: 'Actualizado',
    size: 100,
    cell: info => {
      const val = info.getValue();
      return val ? val.slice(0, 10) : '—';
    },
  }),

  // 14. Contacto
  col.accessor(row => row.prospecto.contacto, {
    id: 'contacto',
    header: 'Contacto',
    size: 150,
    cell: info => info.getValue() || '—',
  }),

  // 15. Origen prospecto
  col.accessor(row => row.prospecto.origen, {
    id: 'origenProspecto',
    header: 'Origen',
    size: 100,
    cell: info => {
      const val = info.getValue();
      return val ? val.replace(/_/g, ' ') : '—';
    },
  }),
];

// ─── Vista default ──────────────────────────────────────────────────────────

/** Vista default: solo 6 columnas esenciales. */
export const VISTA_DEFAULT_COTIZACIONES: VistaConfig = {
  columnas: [
    { id: 'folio' },
    { id: 'cliente' },
    { id: 'etapa' },
    { id: 'total' },
    { id: 'moneda' },
    { id: 'updatedAt' },
  ],
  ordenamiento: null,
};
