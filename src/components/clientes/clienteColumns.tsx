/**
 * clienteColumns.tsx
 *
 * Catálogo de columnas de la lista de Clientes (SpreadsheetTable).
 * Cada id es estable: las vistas guardadas lo referencian.
 */

import React from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import type { ClienteVermur } from './ClientesData';
import type { VistaConfig } from '../table/SpreadsheetTable';
import { nombreDeUsuario } from '../../auth/AuthContext';

const col = createColumnHelper<ClienteVermur>();

function BadgeEstado({ status }: { status: string }) {
  const activo = status === 'ACTIVO';
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
      activo
        ? 'bg-green-50 text-green-700 border-green-200'
        : 'bg-gray-100 text-gray-500 border-gray-200'
    }`}>
      {status}
    </span>
  );
}

function CeldaEjecutivo({ email }: { email: string | null | undefined }) {
  if (!email) return <span className="text-gray-300 italic">—</span>;
  const nombre = nombreDeUsuario(email);
  return (
    <span className="text-gray-700" title={email}>
      {nombre}
    </span>
  );
}

export const CLIENTE_COLUMNS = [
  col.accessor('nombre', {
    id: 'nombre', header: 'Cliente', size: 240,
    cell: info => (
      <span className="font-semibold text-gray-900 truncate block" title={info.getValue()}>
        {info.getValue()}
      </span>
    ),
  }),
  col.accessor(c => c.comercial ?? '', {
    id: 'comercial', header: 'Nombre comercial', size: 180,
    cell: info => <span className="truncate block text-gray-600" title={info.getValue()}>{info.getValue() || '—'}</span>,
  }),
  col.accessor(c => c.rfc ?? '', {
    id: 'rfc', header: 'RFC', size: 150,
    cell: info => <span className="font-mono text-gray-500">{info.getValue() || '—'}</span>,
  }),
  col.accessor('statusOperativo', {
    id: 'statusOperativo', header: 'Estado', size: 100,
    cell: info => <BadgeEstado status={info.getValue()} />,
  }),
  col.accessor(c => c.correo ?? '', {
    id: 'correo', header: 'Correo', size: 200,
    cell: info => <span className="truncate block text-gray-600" title={info.getValue()}>{info.getValue() || '—'}</span>,
  }),
  col.accessor(c => c.telefono ?? '', {
    id: 'telefono', header: 'Teléfono', size: 130,
    cell: info => <span className="text-gray-600">{info.getValue() || '—'}</span>,
  }),
  col.accessor(c => c.tipoCredito === 'credito' ? `${c.dias}d` : 'Contado', {
    id: 'credito', header: 'Crédito', size: 90,
    meta: { align: 'center' },
    cell: info => <span className="font-medium text-gray-700">{info.getValue()}</span>,
  }),
  col.accessor(c => c.divisa ?? '', {
    id: 'divisa', header: 'Divisa', size: 70,
    meta: { align: 'center' },
    cell: info => <span className="tabular-nums text-gray-600">{info.getValue() || '—'}</span>,
  }),
  col.accessor(c => c.monto ?? 0, {
    id: 'lineaCredito', header: 'Línea', size: 90,
    meta: { align: 'right' },
    cell: info => {
      const v = info.getValue();
      return <span className="tabular-nums text-gray-700">{v > 0 ? `${(v / 1000).toFixed(0)}k` : '—'}</span>;
    },
  }),
  col.accessor(c => c.responsableVentas ?? '', {
    id: 'responsableVentas', header: 'Ejecutivo Ventas', size: 150,
    cell: info => <CeldaEjecutivo email={info.getValue() || null} />,
  }),
  col.accessor(c => c.responsablePricing ?? '', {
    id: 'responsablePricing', header: 'Ejecutivo Pricing', size: 150,
    cell: info => <CeldaEjecutivo email={info.getValue() || null} />,
  }),
  col.accessor(c => c.responsableOperativo ?? '', {
    id: 'responsableOperativo', header: 'Ejecutivo Operaciones', size: 160,
    cell: info => <CeldaEjecutivo email={info.getValue() || null} />,
  }),
];

export const VISTA_DEFAULT_CLIENTES: VistaConfig = {
  columnas: [
    { id: 'nombre' }, { id: 'rfc' }, { id: 'statusOperativo' },
    { id: 'correo' }, { id: 'credito' }, { id: 'divisa' },
    { id: 'responsableVentas' }, { id: 'responsablePricing' }, { id: 'responsableOperativo' },
  ],
  ordenamiento: { columnaId: 'nombre', direccion: 'asc' },
};
