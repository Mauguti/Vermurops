/**
 * VistaFacturasProveedor.tsx (tarea 58)
 *
 * Cuentas por pagar vista como la ve Julio: un bloque por PROVEEDOR y, dentro,
 * un renglón por FACTURA. Las órdenes que cubre cada factura se ven al abrirla,
 * y su folio —el COD— enlaza directo a la ficha de la orden.
 *
 * El duplicado que motivó esto: IDAMEX aparecía tres veces porque la bandeja
 * cuenta órdenes, y dos de ellas eran la misma factura. La lógica de agrupado
 * vive en `lib/facturasProveedor.ts`, con el caso fijado en sus tests.
 */

import BadgePrefactura from './BadgePrefactura';
import React, { useMemo, useState } from 'react';
import { ChevronRight, FileText, AlertTriangle, CalendarClock } from 'lucide-react';
import type { OrdenCompra } from './OrdenesCompraData';
import { ESTADOS_OC_MAP } from './OrdenesCompraData';
import { facturasPorProveedor, ordenesAgrupadas, type FacturaProveedor } from '../../lib/facturasProveedor';
import { formatearPorMoneda } from '../../lib/sumarPorMoneda';
import EstadoVacio from '../ui/EstadoVacio';

interface Props {
  /** Las órdenes YA filtradas por la barra de la bandeja. */
  ordenes: OrdenCompra[];
  onSelectOC?: (oc: OrdenCompra) => void;
  /** Para que el vacío diga cuál de los dos vacíos es. */
  hayFiltro?: boolean;
}

const money = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function VistaFacturasProveedor({ ordenes, onSelectOC, hayFiltro = false }: Props) {
  const proveedores = useMemo(() => facturasPorProveedor(ordenes), [ordenes]);
  const agrupadas = useMemo(() => ordenesAgrupadas(proveedores), [proveedores]);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

  const alternar = (clave: string) =>
    setAbiertas(prev => {
      const s = new Set(prev);
      if (s.has(clave)) s.delete(clave); else s.add(clave);
      return s;
    });

  const totalFacturas = proveedores.reduce((a, p) => a + p.facturas.length, 0);

  if (proveedores.length === 0) {
    return (
      <EstadoVacio
        variante="plano"
        icono={<FileText className="w-5 h-5" />}
        titulo={hayFiltro ? 'Ninguna orden coincide con los filtros' : 'Todavía no hay órdenes de compra'}
        detalle={hayFiltro
          ? 'Quita los filtros para ver todas las órdenes.'
          : 'Nacen del embarque cuando hay que pagarle a un proveedor, o se capturan sueltas para los gastos de oficina.'}
      />
    );
  }

  return (
    <div className="space-y-[12px]">
      {proveedores.map(p => (
        <div key={p.proveedorId} className="border border-card-border rounded-[8px] bg-white overflow-hidden">
          {/* El proveedor, UNA sola vez */}
          <div className="px-[16px] py-[10px] bg-neutral-bg border-b border-divider flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-text-primary truncate">{p.proveedorNombre}</p>
              <p className="text-[11px] text-text-muted">
                {p.facturas.length} factura{p.facturas.length !== 1 ? 's' : ''} ·{' '}
                {p.totalOrdenes} {p.totalOrdenes === 1 ? 'orden' : 'órdenes'}
              </p>
            </div>
            {/* §4.3 · un renglón por moneda, nunca un total revuelto. */}
            <div className="text-right shrink-0">
              {p.monedas.length === 0 ? (
                <p className="text-[13px] text-text-muted">—</p>
              ) : p.monedas.map(m => (
                <p key={m} className="text-[14px] font-bold text-text-primary tabular-nums leading-tight">
                  {m} {money(p.totales[m])}
                </p>
              ))}
            </div>
          </div>

          <div className="divide-y divide-divider">
            {p.facturas.map(f => (
              <RenglonFactura
                key={f.clave}
                factura={f}
                abierta={abiertas.has(f.clave)}
                onAlternar={() => alternar(f.clave)}
                onSelectOC={onSelectOC}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="flex justify-between items-center text-[12px] text-text-muted px-[4px] gap-3 flex-wrap">
        <span>
          {totalFacturas} {totalFacturas === 1 ? 'renglón' : 'renglones'} ·{' '}
          {proveedores.length} proveedor{proveedores.length !== 1 ? 'es' : ''}
        </span>
        {agrupadas > 0 && (
          <span>
            {agrupadas === 1
              ? '1 orden se agrupó en la factura que la cubre.'
              : `${agrupadas} órdenes se agruparon en la factura que las cubre.`}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Un renglón: una factura del proveedor ──────────────────────────────────

function RenglonFactura({
  factura, abierta, onAlternar, onSelectOC,
}: {
  factura: FacturaProveedor;
  abierta: boolean;
  onAlternar: () => void;
  onSelectOC?: (oc: OrdenCompra) => void;
}) {
  const estadoCfg = ESTADOS_OC_MAP[factura.estado];
  const sinFactura = factura.fuente === 'sin_factura';

  return (
    <div>
      {/*
       * El renglón NO es un botón: dentro viven los COD, que son enlaces a su
       * orden, y un botón dentro de otro botón no es HTML válido. Abre y
       * cierra el chevron o el número de la factura.
       */}
      <div className="w-full px-[16px] py-[10px] flex items-center justify-between gap-3 hover:bg-neutral-bg/60 transition-colors">
        <span className="min-w-0 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onAlternar}
            aria-expanded={abierta}
            aria-label={`Desglose de ${factura.numero ?? factura.folios.join(', ')}`}
            className="shrink-0 text-text-muted hover:text-text-primary"
          >
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform ${abierta ? 'rotate-90' : ''}`}
            />
          </button>
          {sinFactura ? (
            <button type="button" onClick={onAlternar} className="text-[13px] text-text-muted italic">
              Sin factura del proveedor
            </button>
          ) : (
            <button type="button" onClick={onAlternar} className="text-[13px] font-medium text-text-primary">
              {factura.numero}
            </button>
          )}
          <span className={`inline-flex items-center px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium border ${estadoCfg.color}`}>
            {estadoCfg.label}
          </span>
          {/*
           * Los COD, a la vista y no escondidos tras la expansión: es como se
           * busca una orden de la que alguien te pasó el folio. Cada uno abre
           * su ficha, que regresa aquí.
           */}
          {factura.ordenes.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelectOC?.(o)}
              className="font-mono text-[11px] text-primario hover:text-primario-hover underline underline-offset-2 font-medium"
              title={`Abrir ${o.folio}`}
            >
              {o.folio}
            </button>
          ))}
          {/* Tarea 74 · una factura repartida en varias órdenes puede traer
              varias marcas; cada una dice la suya. */}
          {factura.ordenes.map(o => <BadgePrefactura key={`pf-${o.id}`} oc={o} vacio={false} />)}
          <span className="text-[11px] text-text-muted">
            {factura.fechaPago && `se paga ${factura.fechaPago}`}
          </span>
          {factura.fechasDistintas && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-[6px] py-[2px] rounded bg-amber-100 text-amber-800">
              <CalendarClock className="w-3 h-3" />
              Fechas distintas
            </span>
          )}
          {factura.monedasMezcladas && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-[6px] py-[2px] rounded bg-amber-100 text-amber-800">
              <AlertTriangle className="w-3 h-3" />
              Dos monedas
            </span>
          )}
          {factura.noPagar && (
            <span className="text-[10px] font-bold uppercase px-[6px] py-[2px] rounded bg-peligro-suave text-peligro">
              No pagar
            </span>
          )}
        </span>
        <span className="text-right shrink-0 text-[13px] font-semibold text-text-primary tabular-nums">
          {formatearPorMoneda(factura.totales, { vacio: '—' })}
        </span>
      </div>

      {abierta && (
        <div className="bg-canvas border-t border-divider divide-y divide-divider/60">
          {factura.ordenes.map(o => (
            <div key={o.id} className="px-[16px] py-[8px] pl-[38px] flex items-center justify-between gap-3">
              <span className="min-w-0 flex items-center gap-2 flex-wrap">
                {/* El enlace vive arriba, en el renglón: aquí el folio es la
                    etiqueta del desglose, no un segundo botón con el mismo
                    nombre. */}
                <span className="font-mono text-[11px] text-text-muted">{o.folio}</span>
                <span className="text-[12px] text-text-secondary truncate">{o.conceptoNombre}</span>
                <span className="text-[11px] text-text-muted">
                  {ESTADOS_OC_MAP[o.estado].label}
                  {o.fechaSugeridaPago && ` · ${o.fechaSugeridaPago}`}
                  {o.embarqueFolio ? ` · ${o.embarqueFolio}` : ' · Oficina'}
                </span>
              </span>
              <span className="text-[12px] text-text-primary tabular-nums shrink-0">
                {o.moneda} {money(o.monto ?? 0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
