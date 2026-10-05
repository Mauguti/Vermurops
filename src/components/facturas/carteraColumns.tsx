/**
 * carteraColumns.tsx
 *
 * Catálogo de columnas de Cuentas por cobrar, vista «Por factura»
 * (SpreadsheetTable). Cada id es estable: las vistas guardadas lo
 * referencian.
 *
 * La fila es una `FacturaEnCartera` —la factura ya evaluada contra sus
 * cobros— así que saldo, estado y días de atraso se LEEN, no se recalculan
 * aquí: la cartera entera la deriva `lib/cuentasPorCobrar` (§4.13).
 */

import React from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Ban } from 'lucide-react';
import type { VistaConfig } from '../table/SpreadsheetTable';
import { EnlaceEntidad } from '../ui/ficha/EnlaceEntidad';
import {
  ETIQUETA_ESTADO_COBRO, type EstadoCobro, type FacturaEnCartera,
} from '../../lib/cuentasPorCobrar';

const col = createColumnHelper<FacturaEnCartera>();

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<EstadoCobro, string> = {
  por_cobrar: 'bg-gray-100 text-gray-700 border-gray-200',
  por_vencer: 'bg-amber-50 text-amber-800 border-amber-300',
  vencido: 'bg-peligro/10 text-peligro border-peligro/30',
  cobrado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export interface OpcionesColumnasCartera {
  /** Si no se puede cobrar (`factura.generar`), la columna de acción no se
   *  arma: un botón que no hace nada es peor que no tenerlo. */
  onCobrar?: (i: FacturaEnCartera) => void;
}

export function columnasCartera({ onCobrar }: OpcionesColumnasCartera = {}) {
  const cols = [
    col.accessor(i => i.factura.numero, {
      id: 'numero', header: 'Factura', size: 130,
      cell: info => <span className="font-mono font-semibold text-gray-900">{info.getValue()}</span>,
    }),
    col.accessor(i => i.factura.clienteNombre, {
      id: 'cliente', header: 'Cliente', size: 220,
      cell: info => {
        const f = info.row.original.factura;
        if (!f.clienteId) return <span className="truncate block" title={f.clienteNombre}>{f.clienteNombre || '—'}</span>;
        return (
          <span onClick={e => e.stopPropagation()}>
            <EnlaceEntidad tipo="cliente" id={f.clienteId} title={`Abrir la ficha de ${f.clienteNombre}`}>
              <span className="font-sans">{f.clienteNombre}</span>
            </EnlaceEntidad>
          </span>
        );
      },
    }),
    col.accessor(i => i.factura.embarqueFolio, {
      id: 'embarque', header: 'Embarque', size: 140,
      cell: info => {
        const f = info.row.original.factura;
        if (!f.embarqueId) return <span className="text-gray-400">{f.embarqueFolio || '—'}</span>;
        return (
          <span onClick={e => e.stopPropagation()}>
            <EnlaceEntidad tipo="embarque" id={f.embarqueId}>{f.embarqueFolio || f.embarqueId}</EnlaceEntidad>
          </span>
        );
      },
    }),
    col.accessor(i => i.factura.fechaEmision, {
      id: 'emision', header: 'Emisión', size: 110,
      meta: { align: 'right' },
      cell: info => <span className="text-gray-500">{info.getValue() || '—'}</span>,
    }),
    /*
     * Vence lleva los días dentro: «2026-10-02 +3d» se lee de un golpe, y es
     * lo que decide a quién se le llama hoy. El CSV los separa en su propia
     * columna para poder ordenar en la hoja.
     */
    col.accessor(i => i.factura.fechaVencimiento, {
      id: 'vence', header: 'Vence', size: 130,
      meta: { align: 'right' },
      cell: info => {
        const i = info.row.original;
        return (
          <span>
            {info.getValue() || '—'}
            {i.estado === 'vencido' && <span className="ml-1 text-[10px] font-bold text-peligro">+{i.diasVencido}d</span>}
            {i.estado === 'por_vencer' && <span className="ml-1 text-[10px] font-bold text-amber-700">en {-i.diasVencido}d</span>}
          </span>
        );
      },
    }),
    col.accessor(i => i.diasVencido, {
      id: 'diasVencido', header: 'Días de atraso', size: 110,
      meta: { align: 'right' },
      cell: info => info.getValue() > 0
        ? <span className="font-bold text-peligro">{info.getValue()}</span>
        : <span className="text-gray-300">—</span>,
    }),
    // §4.3 · Monto y moneda separados, por lo mismo que en Cuentas por pagar.
    col.accessor(i => i.factura.total, {
      id: 'total', header: 'Total', size: 110,
      meta: { align: 'right', csv: (i: FacturaEnCartera) => i.factura.total },
      cell: info => <span className="font-semibold text-gray-900">{money(info.getValue())}</span>,
    }),
    col.accessor(i => i.factura.moneda, {
      id: 'moneda', header: 'Moneda', size: 80,
      meta: { align: 'center' },
      cell: info => <span className="font-bold text-[10px] text-gray-500">{info.getValue()}</span>,
    }),
    col.accessor(i => i.cobrado, {
      id: 'cobrado', header: 'Cobrado', size: 110,
      meta: { align: 'right', csv: (i: FacturaEnCartera) => i.cobrado },
      cell: info => info.getValue() > 0
        ? <span className="text-gray-500">{money(info.getValue())}</span>
        : <span className="text-gray-300">—</span>,
    }),
    col.accessor(i => i.saldo, {
      id: 'saldo', header: 'Resta', size: 110,
      meta: { align: 'right', csv: (i: FacturaEnCartera) => i.saldo },
      cell: info => info.row.original.estado === 'cobrado'
        ? <span className="text-gray-300">—</span>
        : <span className="font-bold text-gray-900">{money(info.getValue())}</span>,
    }),
    col.accessor(i => i.estado, {
      id: 'estado', header: 'Estado', size: 130,
      meta: { csv: (i: FacturaEnCartera) => ETIQUETA_ESTADO_COBRO[i.estado] },
      cell: info => {
        const i = info.row.original;
        return (
          <span>
            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${ESTADO_CLS[i.estado]}`}>
              {ETIQUETA_ESTADO_COBRO[i.estado]}
            </span>
            {/* §4.3 · Un cobro en otra moneda que la factura no se resta sin
                decirlo: el aviso viaja desde `saldoDeFactura`. */}
            {i.avisoMoneda && (
              <span className="ml-1 inline-flex items-center" title={i.avisoMoneda}>
                <Ban className="w-3 h-3 text-amber-600" />
              </span>
            )}
          </span>
        );
      },
    }),
    col.accessor(i => i.avisoMoneda ?? '', {
      id: 'avisoMoneda', header: 'Aviso', size: 200,
      cell: info => info.getValue()
        ? <span className="text-[10px] text-amber-700 truncate block" title={info.getValue()}>{info.getValue()}</span>
        : <span className="text-gray-300">—</span>,
    }),
    col.accessor(i => i.factura.diasCredito, {
      id: 'diasCredito', header: 'Días de crédito', size: 110,
      meta: { align: 'right' },
      cell: info => <span className="text-gray-500">{info.getValue() ?? '—'}</span>,
    }),
  ];

  if (onCobrar) {
    cols.push(
      col.accessor(() => '', {
        id: 'accion', header: 'Cobro', size: 120,
        enableSorting: false,
        // La acción no se exporta: en una hoja de cálculo no se puede apretar.
        meta: { csv: () => '' },
        cell: info => {
          const i = info.row.original;
          if (i.estado === 'cobrado') return <span className="text-gray-300">—</span>;
          return (
            <button
              onClick={e => { e.stopPropagation(); onCobrar(i); }}
              className="text-[10px] font-bold uppercase tracking-wider text-primario hover:underline whitespace-nowrap"
            >
              Registrar cobro
            </button>
          );
        },
      }) as (typeof cols)[number],
    );
  }

  return cols;
}

/**
 * Lo que se ve al entrar: la pregunta de Cuentas por cobrar es «quién debe,
 * cuánto y desde cuándo», ordenada por lo que vence primero.
 */
export const VISTA_DEFAULT_POR_COBRAR: VistaConfig = {
  columnas: [
    { id: 'numero' }, { id: 'cliente' }, { id: 'embarque' }, { id: 'vence' },
    { id: 'total' }, { id: 'moneda' }, { id: 'cobrado' }, { id: 'saldo' },
    { id: 'estado' }, { id: 'accion' },
  ],
  ordenamiento: { columnaId: 'vence', direccion: 'asc' },
};
