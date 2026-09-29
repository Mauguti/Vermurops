/**
 * proveedorColumns.tsx
 *
 * Catálogo de columnas de la lista de Proveedores (SpreadsheetTable).
 * Cada id es estable: las vistas guardadas lo referencian.
 */

import React from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Plane, Ship, Truck } from 'lucide-react';
import type { ProveedorVermur, TipoProveedor } from './ProveedoresData';
import { contactoPrincipal } from './ProveedoresData';
import type { VistaConfig } from '../table/SpreadsheetTable';

const col = createColumnHelper<ProveedorVermur>();

const LABEL_TIPO: Record<TipoProveedor, string> = {
  proveedor: 'Proveedor',
  transportista: 'Transportista',
  agente_carga: 'Agente de carga',
};

function BadgeTipos({ tipos }: { tipos: TipoProveedor[] }) {
  if (!tipos?.length) return <span className="text-gray-300">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {tipos.map(t => (
        <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-gray-50 text-gray-500 border border-gray-200">
          {LABEL_TIPO[t] ?? t}
        </span>
      ))}
    </span>
  );
}

export const PROVEEDOR_COLUMNS = [
  col.accessor('nombre', {
    id: 'nombre', header: 'Proveedor', size: 260,
    cell: info => (
      <span className="font-semibold text-gray-900 truncate block" title={info.getValue()}>
        {info.getValue()}
      </span>
    ),
  }),
  col.accessor(p => (p.tipos ?? []).map(t => LABEL_TIPO[t] ?? t).join(', '), {
    id: 'tipos', header: 'Tipo', size: 180,
    cell: info => <BadgeTipos tipos={info.row.original.tipos ?? []} />,
  }),
  col.accessor('activo', {
    id: 'activo', header: 'Estado', size: 90,
    cell: info => (
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
        info.getValue()
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-gray-100 text-gray-500 border-gray-200'
      }`}>
        {info.getValue() ? 'Activo' : 'Inactivo'}
      </span>
    ),
  }),
  col.accessor(p => contactoPrincipal(p)?.nombre ?? '', {
    id: 'contacto', header: 'Contacto', size: 180,
    cell: info => <span className="truncate block text-gray-700" title={info.getValue()}>{info.getValue() || '—'}</span>,
  }),
  col.accessor(p => contactoPrincipal(p)?.email ?? '', {
    id: 'email', header: 'Email', size: 200,
    cell: info => <span className="truncate block text-gray-600" title={info.getValue()}>{info.getValue() || '—'}</span>,
  }),
  col.accessor(p => contactoPrincipal(p)?.telefono ?? p.telefono ?? '', {
    id: 'telefono', header: 'Teléfono', size: 130,
    cell: info => <span className="text-gray-600">{info.getValue() || '—'}</span>,
  }),
  col.accessor(p => p.rfc ?? p.numeroEntidadMagaya ?? '', {
    id: 'rfc', header: 'RFC / ID', size: 150,
    cell: info => <span className="font-mono text-gray-500">{info.getValue() || '—'}</span>,
  }),
  col.accessor(p => p.direccion?.pais ?? '', {
    id: 'pais', header: 'País', size: 110,
    cell: info => <span className="text-gray-600 truncate block" title={info.getValue()}>{info.getValue() || '—'}</span>,
  }),
  col.accessor(p => {
    const dc = p.diasCredito;
    if (!dc) return '';
    if (dc.general > 0) return `${dc.general}d`;
    const parts: string[] = [];
    if (dc.maritimo > 0) parts.push(`M${dc.maritimo}`);
    if (dc.aereo > 0) parts.push(`A${dc.aereo}`);
    if (dc.terrestre > 0) parts.push(`T${dc.terrestre}`);
    return parts.join('/') || '—';
  }, {
    id: 'credito', header: 'Crédito', size: 90,
    meta: { align: 'center' },
    cell: info => <span className="tabular-nums text-gray-600">{info.getValue() || '—'}</span>,
  }),
];

export const VISTA_DEFAULT_PROVEEDORES: VistaConfig = {
  columnas: [
    { id: 'nombre' }, { id: 'tipos' }, { id: 'activo' },
    { id: 'contacto' }, { id: 'email' }, { id: 'telefono' },
    { id: 'rfc' },
  ],
  ordenamiento: { columnaId: 'nombre', direccion: 'asc' },
};
