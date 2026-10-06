/**
 * ocColumns.tsx
 *
 * Catálogo de columnas de Cuentas por pagar, vista «Por orden»
 * (SpreadsheetTable). Cada id es estable: las vistas guardadas lo
 * referencian, y renombrar uno deja la columna fuera de las vistas viejas.
 *
 * Cada columna que pinta JSX declara su `meta.csv`: lo que se exporta son las
 * columnas de la vista (`lib/exportarVista`), y un badge no cabe en un CSV.
 */

import React from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { AlertTriangle, Ban, Clock, Settings, CheckCircle, CheckCircle2, XCircle } from 'lucide-react';
import type { OrdenCompra, EstadoOC } from './OrdenesCompraData';
import { ESTADOS_OC_MAP } from './OrdenesCompraData';
import type { VistaConfig } from '../table/SpreadsheetTable';
import { EnlaceEntidad } from '../ui/ficha/EnlaceEntidad';
import type { EtiquetaIVA } from '../../lib/ivaOrdenCompra';
import { estadoPrefactura, textoFacturaPendiente } from '../../lib/prefactura';
import BadgePrefactura from './BadgePrefactura';

const col = createColumnHelper<OrdenCompra>();

/**
 * El catálogo se construye con una función y no es una constante porque la
 * columna de IVA necesita el catálogo de conceptos para resolver la regla de
 * cada orden. Pasarlo por aquí —en vez de por `tableMeta`— hace que el CSV
 * exporte el mismo valor que se ve: `meta.csv` queda ligado a la misma
 * función que el badge.
 */
export interface OpcionesColumnasOC {
  /** Tarea 36 · Etiqueta de IVA, que necesita el catálogo de conceptos. */
  etiquetaIVA?: (oc: OrdenCompra) => EtiquetaIVA;
}

const ESTADO_ICON: Record<EstadoOC, React.ReactNode> = {
  solicitada: <Clock className="w-3 h-3" />,
  en_gestion: <Settings className="w-3 h-3" />,
  autorizada: <CheckCircle className="w-3 h-3" />,
  pagada: <CheckCircle2 className="w-3 h-3" />,
  rechazada: <XCircle className="w-3 h-3" />,
};

/** Tarea 36 · El cotejo del IVA de la factura contra la regla del concepto. */
export function BadgeIVA({ etiqueta }: { etiqueta: EtiquetaIVA }) {
  if (!etiqueta) return <span className="text-gray-300">—</span>;
  const estilos: Record<NonNullable<EtiquetaIVA>, string> = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    alerta: 'bg-amber-100 text-amber-800 border-amber-300',
    pendiente: 'bg-gray-100 text-gray-500 border-gray-200',
  };
  const textos: Record<NonNullable<EtiquetaIVA>, string> = {
    ok: 'OK', alerta: 'No cuadra', pendiente: 'Pendiente',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${estilos[etiqueta]}`}>
      {etiqueta === 'alerta' && <AlertTriangle className="w-3 h-3" />}
      {textos[etiqueta]}
    </span>
  );
}

export const ETIQUETA_IVA_CSV: Record<NonNullable<EtiquetaIVA>, string> = {
  ok: 'OK', alerta: 'No cuadra', pendiente: 'Pendiente',
};

/** El número de factura del proveedor, de lo más confiable a lo menos (§4.24). */
export function numeroFacturaDeOC(oc: OrdenCompra): string {
  return oc.facturaDatos?.numero?.trim() || oc.facturaAsociada?.trim() || '';
}

export function columnasOC({ etiquetaIVA }: OpcionesColumnasOC = {}) {
  return [
    col.accessor('folio', {
      id: 'folio', header: 'Folio', size: 130,
      cell: info => <span className="font-mono font-semibold text-gray-900">{info.getValue()}</span>,
    }),
    col.accessor('estado', {
      id: 'estado', header: 'Estado', size: 120,
      meta: { csv: (oc: OrdenCompra) => ESTADOS_OC_MAP[oc.estado]?.label ?? oc.estado },
      cell: info => {
        const cfg = ESTADOS_OC_MAP[info.getValue()];
        return (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${cfg?.color ?? ''}`}>
            {ESTADO_ICON[info.getValue()]}{cfg?.label ?? info.getValue()}
          </span>
        );
      },
    }),
    col.accessor('proveedorNombre', {
      id: 'proveedor', header: 'Proveedor', size: 190,
      cell: info => <span className="truncate block text-gray-800" title={info.getValue()}>{info.getValue() || '—'}</span>,
    }),
    col.accessor('conceptoNombre', {
      id: 'concepto', header: 'Concepto', size: 180,
      cell: info => <span className="truncate block" title={info.getValue()}>{info.getValue() || '—'}</span>,
    }),
    /*
     * §4.3 · Monto y moneda son DOS columnas. Una sola «$12,000» ordenada de
     * mayor a menor pondría 900 USD debajo de 12,000 MXN, y el renglón se lee
     * como si fuera menos dinero.
     */
    col.accessor('monto', {
      id: 'monto', header: 'Monto', size: 110,
      meta: { align: 'right', csv: (oc: OrdenCompra) => oc.monto },
      cell: info => <span className="font-semibold text-gray-900">{info.getValue().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>,
    }),
    col.accessor('moneda', {
      id: 'moneda', header: 'Moneda', size: 80,
      meta: { align: 'center' },
      cell: info => <span className="font-bold text-[10px] text-gray-500">{info.getValue()}</span>,
    }),
    col.accessor('urgencia', {
      id: 'urgencia', header: 'Urgencia', size: 100,
      meta: { csv: (oc: OrdenCompra) => (oc.urgencia === 'urgente' ? 'Urgente' : 'Normal') },
      cell: info => info.getValue() === 'urgente'
        ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-peligro/10 text-peligro border border-peligro/30">
            <AlertTriangle className="w-3 h-3" /> Urgente
          </span>
        )
        : <span className="text-gray-400">Normal</span>,
    }),
    col.accessor('fechaRequerida', {
      id: 'fechaRequerida', header: 'Fecha requerida', size: 120,
      meta: { align: 'right' },
      cell: info => <span>{info.getValue() || '—'}</span>,
    }),
    col.accessor(oc => oc.fechaSugeridaPago ?? '', {
      id: 'fechaPago', header: 'Fecha de pago', size: 120,
      meta: { align: 'right' },
      cell: info => info.getValue()
        ? <span>{info.getValue()}</span>
        : <span className="text-gray-300 italic" title="Se calcula con los días de crédito del proveedor">sin calcular</span>,
    }),
    /*
     * El enlace al embarque: «enlaces a la orden y al embarque» del
     * levantamiento. El de la orden es el renglón entero (onRowClick); este
     * salta al embarque sin pasar por la bandeja, y para que el clic no abra
     * además la orden, el <a> detiene la propagación.
     */
    col.accessor(oc => oc.embarqueFolio ?? '', {
      id: 'origen', header: 'Origen', size: 150,
      meta: { csv: (oc: OrdenCompra) => (oc.origen === 'embarque' ? (oc.embarqueFolio ?? 'Embarque') : 'Oficina') },
      cell: info => {
        const oc = info.row.original;
        if (oc.origen !== 'embarque') return <span className="text-gray-400">Oficina</span>;
        if (!oc.embarqueId) return <span className="text-gray-500">{oc.embarqueFolio || 'Embarque'}</span>;
        return (
          <span onClick={e => e.stopPropagation()}>
            <EnlaceEntidad tipo="embarque" id={oc.embarqueId}>{oc.embarqueFolio || oc.embarqueId}</EnlaceEntidad>
          </span>
        );
      },
    }),
    col.accessor(oc => oc.clienteNombre ?? '', {
      id: 'cliente', header: 'Cliente', size: 180,
      cell: info => <span className="truncate block" title={info.getValue()}>{info.getValue() || '—'}</span>,
    }),
    /*
     * §4.24 · La unidad de lo que se debe es la FACTURA. Aquí es columna para
     * poder ordenar por ella: dos renglones con el mismo número son la misma
     * factura repartida en dos órdenes, y es exactamente lo que la vista «Por
     * proveedor» junta en uno.
     */
    col.accessor(numeroFacturaDeOC, {
      id: 'factura', header: 'Factura', size: 140,
      cell: info => info.getValue()
        ? <span className="font-mono text-[11px] text-gray-600">{info.getValue()}</span>
        : <span className="text-gray-300 italic">sin factura</span>,
    }),
    col.accessor(oc => etiquetaIVA?.(oc) ?? '', {
      id: 'iva', header: 'IVA', size: 110,
      meta: {
        csv: (oc: OrdenCompra) => {
          const e = etiquetaIVA?.(oc);
          return e ? ETIQUETA_IVA_CSV[e] : '';
        },
      },
      cell: info => <BadgeIVA etiqueta={etiquetaIVA?.(info.row.original) ?? null} />,
    }),
    /*
     * §4.7 · «No pagar» bloquea la programación hasta confirmar fondeo. En la
     * vista por proveedor ya se veía; aquí también, porque es la razón por la
     * que una orden autorizada no aparece en Programación de pagos.
     */
    col.accessor(oc => (oc.noPagar ? 'si' : 'no'), {
      id: 'noPagar', header: 'No pagar', size: 110,
      meta: { csv: (oc: OrdenCompra) => (oc.noPagar ? 'Sí' : '') },
      cell: info => info.row.original.noPagar
        ? (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-peligro/10 text-peligro border border-peligro/30"
            title={info.row.original.motivoNoPagar ?? 'Pago detenido'}
          >
            <Ban className="w-3 h-3" /> No pagar
          </span>
        )
        : <span className="text-gray-300">—</span>,
    }),
    /* Tarea 74 · Prefactura: marcada, pendiente de factura o ya recibida. */
    col.accessor(oc => estadoPrefactura(oc), {
      id: 'prefactura', header: 'Prefactura', size: 170,
      meta: {
        csv: (oc: OrdenCompra) => {
          const e = estadoPrefactura(oc);
          if (e === 'no_aplica') return '';
          if (e === 'factura_pendiente') return textoFacturaPendiente(oc);
          return e === 'factura_recibida' ? 'Factura recibida' : 'Prefactura';
        },
      },
      cell: info => <BadgePrefactura oc={info.row.original} />,
    }),
    col.accessor('descripcion', {
      id: 'descripcion', header: 'Descripción', size: 220,
      cell: info => <span className="truncate block text-gray-500" title={info.getValue()}>{info.getValue() || '—'}</span>,
    }),
  ];
}

/**
 * Lo que Julio ve al entrar. Las fechas van al final porque la pregunta de
 * cada mañana es «qué está autorizado y de quién», y el orden por fecha de
 * pago ascendente ya pone primero lo más próximo.
 */
export const VISTA_DEFAULT_POR_PAGAR: VistaConfig = {
  columnas: [
    { id: 'folio' }, { id: 'estado' }, { id: 'proveedor' }, { id: 'concepto' },
    { id: 'monto' }, { id: 'moneda' }, { id: 'factura' }, { id: 'fechaPago' },
    { id: 'origen' }, { id: 'iva' }, { id: 'noPagar' }, { id: 'prefactura' },
  ],
  ordenamiento: { columnaId: 'fechaPago', direccion: 'asc' },
};
