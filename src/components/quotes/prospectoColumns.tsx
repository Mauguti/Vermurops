/**
 * prospectoColumns.tsx
 *
 * Columnas de la vista de Lista para Prospectos.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * La pestaña Prospectos en modo Lista mostraba `filteredTableQuotes`, o sea
 * COTIZACIONES en etapa de solicitud, no prospectos. Por eso un prospecto
 * recién creado aparecía en Kanban y no en Lista: la tabla nunca miró la
 * colección de prospectos.
 */

import React from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import type { Prospecto } from '../../data';
import type { VistaConfig } from '../table/SpreadsheetTable';

const ETAPA_LABEL: Record<string, string> = {
  nuevo_lead:  'Nuevo lead',
  contactado:  'Contactado',
  calificado:  'Calificado',
  convertido:  'Convertido',
  perdido:     'Perdido',
};

const ETAPA_COLORS: Record<string, string> = {
  nuevo_lead: 'bg-gray-100 text-gray-700',
  contactado: 'bg-amber-50 text-amber-700',
  calificado: 'bg-blue-50 text-blue-700',
  convertido: 'bg-emerald-50 text-emerald-700',
  perdido:    'bg-red-50 text-red-700',
};

const ORDEN_ETAPAS = ['nuevo_lead', 'contactado', 'calificado', 'convertido', 'perdido'];

const col = createColumnHelper<Prospecto>();

export const PROSPECTO_COLUMNS = [
  col.accessor('folio', {
    id: 'folio',
    header: 'Folio',
    size: 150,
    cell: info => (
      <span className="font-mono font-medium text-gray-900">{info.getValue() || info.row.original.id}</span>
    ),
  }),

  col.accessor('empresa', {
    id: 'empresa',
    header: 'Empresa',
    size: 220,
    cell: info => info.getValue() || 'Sin nombre',
  }),

  col.accessor('etapa', {
    id: 'etapa',
    header: 'Etapa',
    size: 140,
    cell: info => {
      const e = info.getValue();
      return (
        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${ETAPA_COLORS[e] ?? 'bg-gray-100 text-gray-600'}`}>
          {ETAPA_LABEL[e] ?? e}
        </span>
      );
    },
    sortingFn: (a, b) =>
      ORDEN_ETAPAS.indexOf(a.original.etapa) - ORDEN_ETAPAS.indexOf(b.original.etapa),
  }),

  col.accessor('contactoNombre', {
    id: 'contacto',
    header: 'Contacto',
    size: 170,
    cell: info => info.getValue() || '—',
  }),

  col.accessor(row => row.contactoEmail ?? '', {
    id: 'email',
    header: 'Correo',
    size: 200,
    cell: info => info.getValue() || '—',
  }),

  col.accessor(row => row.contactoTel ?? '', {
    id: 'telefono',
    header: 'Teléfono',
    size: 140,
    cell: info => info.getValue() || '—',
  }),

  col.accessor('origenLead', {
    id: 'origen',
    header: 'Origen',
    size: 120,
    cell: info => <span className="capitalize">{info.getValue()}</span>,
  }),

  col.accessor('responsable', {
    id: 'responsable',
    header: 'Responsable',
    size: 160,
    cell: info => info.getValue() || '—',
  }),

  col.accessor(row => (row.servicioPotencial ?? []).join(', '), {
    id: 'servicios',
    header: 'Servicios de interés',
    size: 200,
    cell: info => <span className="capitalize text-gray-600">{info.getValue() || '—'}</span>,
  }),

  col.accessor('fechaCreacion', {
    id: 'fechaCreacion',
    header: 'Alta',
    size: 120,
    cell: info => <span className="tabular-nums text-gray-600">{info.getValue() || '—'}</span>,
  }),

  col.accessor(row => row.motivoPerdida ?? '', {
    id: 'motivoPerdida',
    header: 'Motivo de pérdida',
    size: 240,
    cell: info => <span className="text-gray-500">{info.getValue() || '—'}</span>,
  }),
];

export const VISTA_DEFAULT_PROSPECTOS: VistaConfig = {
  columnas: [
    { id: 'folio' },
    { id: 'empresa' },
    { id: 'etapa' },
    { id: 'contacto' },
    { id: 'responsable' },
    { id: 'fechaCreacion' },
  ],
  ordenamiento: null,
};
