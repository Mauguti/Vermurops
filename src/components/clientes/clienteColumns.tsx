/**
 * clienteColumns.tsx
 *
 * Catálogo de columnas de la lista de Clientes (SpreadsheetTable).
 * Cada id es estable: las vistas guardadas lo referencian.
 *
 * Las columnas de estado y ejecutivos soportan edición en línea cuando el
 * contexto de la tabla (`meta.edicion`) lo indica. Los demás roles ven las
 * celdas en solo lectura.
 */

import React from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import type { ClienteVermur } from './ClientesData';
import type { VistaConfig } from '../table/SpreadsheetTable';
import { nombreDeUsuario } from '../../auth/AuthContext';
import type { EdicionEnListaMeta } from './edicionMeta';
import { CeldaEstado, CeldaEjecutivoEditable } from '../table/CeldaEditable';
import { estadoFiscal } from '../../lib/datosFiscales';
import { estatusDeCliente, ETIQUETA_ESTATUS } from '../../lib/estatusCliente';

const col = createColumnHelper<ClienteVermur>();

function CeldaEjecutivoLectura({ email }: { email: string | null | undefined }) {
  if (!email) return <span className="text-gray-300 italic">—</span>;
  const nombre = nombreDeUsuario(email);
  return <span className="text-gray-700" title={email}>{nombre}</span>;
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
    cell: info => {
      const meta = info.table.options.meta as EdicionEnListaMeta | undefined;
      const estatus = estatusDeCliente({ statusOperativo: info.getValue() });
      const activo = estatus === 'activo';
      if (estatus === 'sin_estatus') {
        return (
          <span title="Este cliente no tiene estatus operativo guardado"
            className="px-2 py-0.5 rounded text-[10px] font-bold border bg-amber-50 text-amber-700 border-amber-200">
            {ETIQUETA_ESTATUS.sin_estatus}
          </span>
        );
      }
      if (!meta?.edicion) {
        return (
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
            activo ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'
          }`}>{activo ? 'Activo' : 'Inactivo'}</span>
        );
      }
      return (
        <CeldaEstado
          activo={activo}
          puedeEditar={meta.edicion.puedeEditar}
          onChange={async (nuevoActivo) => {
            await meta.edicion!.onCambiarEstado(info.row.original.id, nuevoActivo);
          }}
        />
      );
    },
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
  col.accessor(c => estadoFiscal(c), {
    id: 'fiscal', header: 'Fiscal', size: 110,
    meta: { align: 'center' },
    cell: info => {
      const estado = info.getValue();
      return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
          estado === 'completo'
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
          {estado === 'completo' ? 'Completo' : 'Incompleto'}
        </span>
      );
    },
    filterFn: (row, _colId, filterValue) => {
      return estadoFiscal(row.original) === filterValue;
    },
  }),
  /*
   * Tarea 57 · «Carpeta en OneDrive». El campo de la base se sigue llamando
   * `expedienteDrive` (nació creyendo que era Google Drive); solo cambia la
   * etiqueta. El filtro de la pantalla es lo que sirve para sacar la lista
   * de los que NO tienen carpeta.
   */
  col.accessor(c => (c.expedienteDrive ? 'si' : 'no'), {
    id: 'expedienteDrive', header: 'OneDrive', size: 100,
    meta: { align: 'center' },
    cell: info => (
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
        info.getValue() === 'si'
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-gray-100 text-gray-500 border-gray-200'
      }`}>
        {info.getValue() === 'si' ? 'Sí' : 'No'}
      </span>
    ),
  }),
  col.accessor(c => c.responsableVentas ?? '', {
    id: 'responsableVentas', header: 'Ejecutivo Ventas', size: 150,
    cell: info => {
      const meta = info.table.options.meta as EdicionEnListaMeta | undefined;
      const email = info.getValue() || null;
      if (!meta?.edicion) return <CeldaEjecutivoLectura email={email} />;
      return (
        <CeldaEjecutivoEditable
          email={email}
          puedeEditar={meta.edicion.puedeEditar}
          opciones={meta.edicion.opcionesEjecutivo('ventas')}
          onChange={async (nuevoEmail) => {
            await meta.edicion!.onCambiarEjecutivo(info.row.original.id, 'ventas', nuevoEmail);
          }}
        />
      );
    },
  }),
  col.accessor(c => c.responsablePricing ?? '', {
    id: 'responsablePricing', header: 'Ejecutivo Pricing', size: 150,
    cell: info => {
      const meta = info.table.options.meta as EdicionEnListaMeta | undefined;
      const email = info.getValue() || null;
      if (!meta?.edicion) return <CeldaEjecutivoLectura email={email} />;
      return (
        <CeldaEjecutivoEditable
          email={email}
          puedeEditar={meta.edicion.puedeEditar}
          opciones={meta.edicion.opcionesEjecutivo('pricing')}
          onChange={async (nuevoEmail) => {
            await meta.edicion!.onCambiarEjecutivo(info.row.original.id, 'pricing', nuevoEmail);
          }}
        />
      );
    },
  }),
  col.accessor(c => c.responsableOperativo ?? '', {
    id: 'responsableOperativo', header: 'Ejecutivo Operaciones', size: 160,
    cell: info => {
      const meta = info.table.options.meta as EdicionEnListaMeta | undefined;
      const email = info.getValue() || null;
      if (!meta?.edicion) return <CeldaEjecutivoLectura email={email} />;
      return (
        <CeldaEjecutivoEditable
          email={email}
          puedeEditar={meta.edicion.puedeEditar}
          opciones={meta.edicion.opcionesEjecutivo('operativo')}
          onChange={async (nuevoEmail) => {
            await meta.edicion!.onCambiarEjecutivo(info.row.original.id, 'operativo', nuevoEmail);
          }}
        />
      );
    },
  }),
];

export const VISTA_DEFAULT_CLIENTES: VistaConfig = {
  columnas: [
    { id: 'nombre' }, { id: 'rfc' }, { id: 'fiscal' }, { id: 'statusOperativo' },
    { id: 'correo' }, { id: 'credito' }, { id: 'divisa' }, { id: 'expedienteDrive' },
    { id: 'responsableVentas' }, { id: 'responsablePricing' }, { id: 'responsableOperativo' },
  ],
  ordenamiento: { columnaId: 'nombre', direccion: 'asc' },
};
