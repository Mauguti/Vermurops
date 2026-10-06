/**
 * pagosColumns.tsx — tarea 72 · P5
 *
 * Catálogo de columnas de Finanzas → Pagos (SpreadsheetTable). Cada id es
 * estable: las vistas guardadas lo referencian.
 *
 * Todo lo que se pinta se LEE de `lib/reversaPagos` y `lib/pagos`: el estado,
 * lo aplicado y el saldo a favor se derivan, nunca se guardan (§1.1).
 */

import React from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import type { VistaConfig } from '../table/SpreadsheetTable';
import { EnlaceEntidad } from '../ui/ficha/EnlaceEntidad';
import { aplicado, type Pago } from '../../lib/pagos';
import { aFavorDe, estadoDePago, ETIQUETA_ESTADO_PAGO, type EstadoPago } from '../../lib/reversaPagos';

const col = createColumnHelper<Pago>();

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const ESTADO_PAGO_CLS: Record<EstadoPago, string> = {
  aplicado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  parcial: 'bg-amber-50 text-amber-800 border-amber-300',
  sin_aplicar: 'bg-primario/10 text-primario border-primario/30',
  // El rojo es de peligro (§4.20): un pago anulado es una corrección, no una alerta.
  anulado: 'bg-gray-100 text-gray-500 border-gray-200',
};

export interface OpcionesColumnasPagos {
  onAbrir?: (p: Pago) => void;
}

export function columnasPagos({ onAbrir }: OpcionesColumnasPagos = {}) {
  const cols = [
    col.accessor(p => p.folio, {
      id: 'folio', header: 'Folio', size: 140,
      cell: info => {
        const p = info.row.original;
        return (
          <span className={`font-mono font-semibold ${p.activo === false ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
            {info.getValue()}
          </span>
        );
      },
    }),
    col.accessor(p => p.terceroNombre, {
      id: 'cliente', header: 'Cliente', size: 220,
      cell: info => {
        const p = info.row.original;
        if (!p.terceroId) return <span className="truncate block" title={p.terceroNombre}>{p.terceroNombre || '—'}</span>;
        return (
          <span onClick={e => e.stopPropagation()}>
            <EnlaceEntidad tipo="cliente" id={p.terceroId} title={`Abrir la ficha de ${p.terceroNombre}`}>
              <span className="font-sans">{p.terceroNombre}</span>
            </EnlaceEntidad>
          </span>
        );
      },
    }),
    col.accessor(p => p.fecha, {
      id: 'fecha', header: 'Fecha', size: 110,
      meta: { align: 'right' },
      cell: info => <span className="text-gray-600">{info.getValue() || '—'}</span>,
    }),
    col.accessor(p => p.banco ?? '', {
      id: 'banco', header: 'Cuenta', size: 150,
      cell: info => info.getValue() ? <span className="truncate block">{info.getValue()}</span> : <span className="text-gray-300">—</span>,
    }),
    col.accessor(p => p.referencia ?? '', {
      id: 'referencia', header: 'Referencia', size: 140,
      cell: info => info.getValue() ? <span className="font-mono text-[11px]">{info.getValue()}</span> : <span className="text-gray-300">—</span>,
    }),
    // §4.3 · Monto y moneda, dos columnas: ordenar mezclado pone 900 USD debajo de 12,000 MXN.
    col.accessor(p => p.monto, {
      id: 'monto', header: 'Monto', size: 120,
      meta: { align: 'right', csv: (p: Pago) => p.monto },
      cell: info => <span className="font-semibold text-gray-900">{money(info.getValue())}</span>,
    }),
    col.accessor(p => p.moneda, {
      id: 'moneda', header: 'Moneda', size: 80,
      meta: { align: 'center' },
      cell: info => <span className="font-bold text-[10px] text-gray-500">{info.getValue()}</span>,
    }),
    col.accessor(p => p.activo === false ? 0 : aplicado(p), {
      id: 'aplicado', header: 'Aplicado', size: 120,
      meta: { align: 'right', csv: (p: Pago) => p.activo === false ? 0 : aplicado(p) },
      cell: info => info.getValue() > 0 ? <span>{money(info.getValue())}</span> : <span className="text-gray-300">—</span>,
    }),
    col.accessor(p => aFavorDe(p), {
      id: 'aFavor', header: 'A favor', size: 120,
      meta: { align: 'right', csv: (p: Pago) => aFavorDe(p) },
      cell: info => info.getValue() > 0
        ? <span className="font-bold text-primario">{money(info.getValue())}</span>
        : <span className="text-gray-300">—</span>,
    }),
    col.accessor(p => (p.aplicaciones ?? []).length, {
      id: 'facturas', header: 'Facturas', size: 90,
      meta: { align: 'right' },
      cell: info => info.getValue() > 0 ? <span>{info.getValue()}</span> : <span className="text-gray-300">—</span>,
    }),
    col.accessor(p => estadoDePago(p), {
      id: 'estado', header: 'Estado', size: 120,
      meta: { csv: (p: Pago) => ETIQUETA_ESTADO_PAGO[estadoDePago(p)] },
      cell: info => (
        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${ESTADO_PAGO_CLS[info.getValue()]}`}>
          {ETIQUETA_ESTADO_PAGO[info.getValue()]}
        </span>
      ),
    }),
    col.accessor(p => p.origen && p.origen !== 'app' ? 'Registro anterior' : '', {
      id: 'origen', header: 'Origen', size: 130,
      cell: info => info.getValue() ? <span className="text-[10px] text-gray-500">{info.getValue()}</span> : <span className="text-gray-300">—</span>,
    }),
  ];

  if (onAbrir) {
    cols.push(
      col.accessor(() => '', {
        id: 'accion', header: 'Ficha', size: 90,
        enableSorting: false,
        meta: { csv: () => '' },
        cell: info => (
          <button
            onClick={e => { e.stopPropagation(); onAbrir(info.row.original); }}
            className="text-[10px] font-bold uppercase tracking-wider text-primario hover:underline whitespace-nowrap"
          >
            Abrir
          </button>
        ),
      }) as (typeof cols)[number],
    );
  }
  return cols;
}

/** Lo que se ve al entrar: lo más reciente primero, con lo que sobra a la vista. */
export const VISTA_DEFAULT_PAGOS: VistaConfig = {
  columnas: [
    { id: 'folio' }, { id: 'cliente' }, { id: 'fecha' }, { id: 'monto' }, { id: 'moneda' },
    { id: 'aplicado' }, { id: 'aFavor' }, { id: 'estado' }, { id: 'accion' },
  ],
  ordenamiento: { columnaId: 'fecha', direccion: 'desc' },
};
