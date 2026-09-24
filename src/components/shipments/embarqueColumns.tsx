/**
 * embarqueColumns.tsx
 *
 * Catálogo de columnas de la lista de Embarques (SpreadsheetTable). Cada id
 * es estable: las vistas guardadas lo referencian.
 */

import React from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Plane, Ship, Truck, ArrowRight } from 'lucide-react';
import type { EmbarqueCompleto, ModalidadEmbarque } from './EmbarquesData';
import type { VistaConfig } from '../table/SpreadsheetTable';
import { estadoDe, ETAPAS_EMBARQUE } from '../../lib/estadoEmbarque';
import { nombreDeUsuario } from '../../auth/AuthContext';

const col = createColumnHelper<EmbarqueCompleto>();

function BadgeModalidad({ modalidad }: { modalidad: ModalidadEmbarque }) {
  const m = {
    maritimo: { icon: <Ship className="w-3 h-3" />, cls: 'bg-sky-50 text-sky-600 border-sky-100', label: 'Marítimo' },
    aereo: { icon: <Plane className="w-3 h-3" />, cls: 'bg-indigo-50 text-indigo-600 border-indigo-100', label: 'Aéreo' },
    terrestre: { icon: <Truck className="w-3 h-3" />, cls: 'bg-amber-50 text-amber-600 border-amber-100', label: 'Terrestre' },
  }[modalidad] ?? { icon: null, cls: 'bg-gray-50 text-gray-600 border-gray-100', label: modalidad };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.cls}`}>
      {m.icon}{m.label}
    </span>
  );
}


function CierreDot({ label, done }: { label: string; done: boolean }) {
  return (
    <span
      className={`text-[8px] font-extrabold uppercase px-1 py-0.5 rounded border min-w-[22px] inline-block text-center
        ${done ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}
      title={`${label}: ${done ? 'Cerrado' : 'Pendiente'}`}
    >
      {label}
    </span>
  );
}

export const EMBARQUE_COLUMNS = [
  col.accessor('folio', {
    id: 'folio', header: 'Folio', size: 130,
    cell: info => (
      <span className="font-mono font-semibold text-gray-900">
        {info.getValue()}
        {info.row.original.tipo === 'master' && (
          <span className="ml-1.5 text-[8px] font-extrabold text-primario bg-primario/5 px-1 rounded">MASTER</span>
        )}
      </span>
    ),
  }),
  col.accessor(e => e.entidades?.clienteCobrar ?? '', {
    id: 'cliente', header: 'Cliente', size: 200,
    cell: info => <span className="truncate block" title={info.getValue()}>{info.getValue() || '—'}</span>,
  }),
  col.accessor(e => e.responsableOperativo ?? '', {
    id: 'responsable', header: 'Responsable', size: 140,
    cell: info => info.getValue()
      ? <span className="text-gray-700">{nombreDeUsuario(info.getValue())}</span>
      : <span className="text-gray-300 italic">sin asignar</span>,
  }),
  col.accessor(e => estadoDe(e), {
    id: 'estado', header: 'Estado', size: 110,
    cell: info => {
      const id = info.getValue();
      const et = ETAPAS_EMBARQUE.find(x => x.id === id);
      return <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${et?.badge ?? ''}`}>{et?.label ?? id}</span>;
    },
  }),
  col.accessor('modalidad', {
    id: 'modalidad', header: 'Modalidad', size: 110,
    cell: info => <BadgeModalidad modalidad={info.getValue()} />,
  }),
  col.accessor(e => e.entidades?.consignatario ?? '', {
    id: 'consignatario', header: 'Consignatario', size: 180,
    cell: info => <span className="truncate block" title={info.getValue()}>{info.getValue() || '—'}</span>,
  }),
  col.accessor(e => `${e.ruta?.origen?.puertoCarga ?? ''}→${e.ruta?.destino?.puertoDescarga ?? ''}`, {
    id: 'ruta', header: 'Ruta', size: 200,
    cell: info => {
      const e = info.row.original;
      return (
        <span className="flex items-center gap-1.5 text-gray-600">
          <span className="truncate max-w-[90px]" title={e.ruta?.origen?.puertoCarga}>{(e.ruta?.origen?.puertoCarga ?? '').split(',')[0] || '—'}</span>
          <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
          <span className="truncate max-w-[90px]" title={e.ruta?.destino?.puertoDescarga}>{(e.ruta?.destino?.puertoDescarga ?? '').split(',')[0] || '—'}</span>
        </span>
      );
    },
  }),
  col.accessor('numeroGuia', {
    id: 'guia', header: 'BL / AWB', size: 130,
    cell: info => <span className="font-mono text-gray-500">{info.getValue() || '—'}</span>,
  }),
  col.accessor(e => e.fechas?.salida ?? '', {
    id: 'etd', header: 'ETD', size: 100,
    cell: info => <span className="tabular-nums">{info.getValue() || '—'}</span>,
  }),
  col.accessor(e => e.fechas?.arribo ?? '', {
    id: 'eta', header: 'ETA', size: 100,
    cell: info => <span className="tabular-nums">{info.getValue() || '—'}</span>,
  }),
  col.accessor(e => `${e.cierres?.operativo ? 1 : 0}${e.cierres?.pago ? 1 : 0}${e.cierres?.administrativo ? 1 : 0}`, {
    id: 'cierres', header: 'Cierres (O/P/A)', size: 110,
    meta: { align: 'center' },
    cell: info => {
      const c = info.row.original.cierres;
      return (
        <span className="inline-flex gap-1">
          <CierreDot label="Op" done={!!c?.operativo} />
          <CierreDot label="Pa" done={!!c?.pago} />
          <CierreDot label="Ad" done={!!c?.administrativo} />
        </span>
      );
    },
  }),
  col.accessor(e => e.ruta?.aduana?.pedimento ?? '', {
    id: 'pedimento', header: 'Pedimento', size: 120,
    cell: info => <span className="font-mono text-[11px] text-gray-500">{info.getValue() || '—'}</span>,
  }),
  col.accessor('referenciaCliente', {
    id: 'po', header: 'PO / Referencia', size: 120,
    cell: info => <span className="text-gray-500">{info.getValue() || '—'}</span>,
  }),
];

export const VISTA_DEFAULT_EMBARQUES: VistaConfig = {
  columnas: [
    { id: 'folio' }, { id: 'cliente' }, { id: 'responsable' }, { id: 'estado' },
    { id: 'modalidad' }, { id: 'ruta' }, { id: 'guia' }, { id: 'eta' }, { id: 'cierres' },
  ],
  ordenamiento: { columnaId: 'eta', direccion: 'asc' },
};
