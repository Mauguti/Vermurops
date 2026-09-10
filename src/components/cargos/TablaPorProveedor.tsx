/**
 * TablaPorProveedor.tsx (3.2)
 *
 * La tabla de cargos agrupada por proveedor, compartida por la cotización y
 * el embarque. Mismas columnas que la tabla de Pricing —Concepto · Costo ·
 * Profit · Venta · Margen %— con el total por proveedor y el total general,
 * siempre por moneda (§4.3).
 *
 * La tabla pinta los grupos y los totales; las CELDAS editables las pone
 * quien la usa (`celdas`), porque editar un costo significa cosas distintas
 * en la cotización (la línea) y en el embarque (el cargo). Lo que aquí vive
 * es lo que las dos pantallas tienen que ver IGUAL.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Building2, Info } from 'lucide-react';
import type {
  ConsolidadoProveedores, GrupoProveedor, RenglonProveedor, EstadoProveedor,
} from '../../lib/cargosPorProveedor';
import { ETIQUETA_ESTADO_PROVEEDOR } from '../../lib/cargosPorProveedor';
import type { Moneda } from '../../lib/sumarPorMoneda';
import { EnlaceEntidad } from '../ui/ficha/EnlaceEntidad';

export const money = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const pct = (m: number | null) => (m === null ? '—' : `${(m * 100).toFixed(1)}%`);

/** Lo que cada pantalla decide cómo pintar. Ausente = el valor en texto. */
export interface CeldasRenglon {
  costo?: React.ReactNode;
  profit?: React.ReactNode;
  venta?: React.ReactNode;
  acciones?: React.ReactNode;
}

const ESTADO_CLS: Record<EstadoProveedor, string> = {
  sin_factura: 'bg-gray-100 text-gray-600 border-gray-200',
  facturado: 'bg-sky-50 text-sky-700 border-sky-200',
  en_oc: 'bg-amber-50 text-amber-800 border-amber-300',
  pagado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

interface Props {
  consolidado: ConsolidadoProveedores;
  /** Nombre del proveedor por id; cae al que traía la línea. */
  nombreProveedor: (id: string | null, fallback: string) => string;
  /** Celdas editables por renglón. */
  celdas?: (r: RenglonProveedor, grupo: GrupoProveedor) => CeldasRenglon;
  /** Estado de pago del proveedor (embarque). Null = no se muestra. */
  estadoDe?: (g: GrupoProveedor) => EstadoProveedor | null;
  /** Contenido extra en el encabezado del grupo: factura asociada, desvío… */
  extraGrupo?: (g: GrupoProveedor) => React.ReactNode;
  /** Hay columna de acciones. */
  conAcciones?: boolean;
  /** Renglón «resaltado» (la línea activa del panel de tarifas). */
  claveActiva?: string | null;
  onClickRenglon?: (r: RenglonProveedor) => void;
  vacio?: React.ReactNode;
}

export default function TablaPorProveedor({
  consolidado, nombreProveedor, celdas, estadoDe, extraGrupo, conAcciones = false,
  claveActiva, onClickRenglon, vacio,
}: Props) {
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setCerrados(prev => {
    const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n;
  });

  if (consolidado.grupos.length === 0) {
    return <>{vacio ?? null}</>;
  }

  const variasMonedas = consolidado.monedasActivas.length > 1;
  const cols = 5 + (conAcciones ? 1 : 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left border-b border-gray-100 bg-gray-50/60">
              <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Concepto</th>
              <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">Costo</th>
              <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">Profit</th>
              <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">Venta</th>
              <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">Margen %</th>
              {conAcciones && <th className="px-2 py-2 w-[140px]" />}
            </tr>
          </thead>

          {consolidado.grupos.map(g => {
            const clave = g.proveedorId ?? (g.proveedorNombre ? `nombre:${g.proveedorNombre}` : '__sin__');
            const cerrado = cerrados.has(clave);
            // Sin catálogo a la mano (o un id que ya no existe) se muestra el
            // id: un grupo sin nombre parece un error de la tabla.
            const nombre = g.proveedorId
              ? (nombreProveedor(g.proveedorId, g.proveedorNombre) || g.proveedorId)
              : (g.proveedorNombre || 'Sin proveedor');
            const estado = estadoDe?.(g) ?? null;

            return (
              <tbody key={clave} className="border-t border-gray-200">
                {/* Encabezado del grupo */}
                <tr className="bg-gray-50/80">
                  <td colSpan={cols} className="px-3 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => toggle(clave)}
                        className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#18181B]"
                      >
                        {cerrado ? <ChevronRight className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        <Building2 className="w-3.5 h-3.5 text-gray-400" />
                        {nombre}
                      </button>
                      {g.proveedorId && (
                        <EnlaceEntidad tipo="proveedor" id={g.proveedorId} title={`Abrir la ficha de ${nombre}`}>
                          <span className="font-sans text-[10px] font-semibold">ficha</span>
                        </EnlaceEntidad>
                      )}
                      {!g.proveedorId && !g.proveedorNombre && (
                        <span className="text-[10px] text-amber-700 font-semibold" title="Costos tecleados sin proveedor, o ventas sin costo detrás.">
                          sin proveedor asignado
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400">{g.renglones.length} concepto{g.renglones.length !== 1 ? 's' : ''}</span>
                      {estado && (
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${ESTADO_CLS[estado]}`}>
                          {ETIQUETA_ESTADO_PROVEEDOR[estado]}
                        </span>
                      )}
                      {g.mezclaMonedas && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-700" title="Algún concepto se cobra en una moneda y se paga en otra: el margen de ese renglón no se resta.">
                          <Info className="w-3 h-3" /> venta y costo en monedas distintas
                        </span>
                      )}
                      {extraGrupo?.(g)}
                    </div>
                  </td>
                </tr>

                {!cerrado && g.renglones.map(r => {
                  const c = celdas?.(r, g) ?? {};
                  const activa = claveActiva !== undefined && claveActiva !== null && r.clave === claveActiva;
                  return (
                    <tr
                      key={r.clave}
                      onClick={() => onClickRenglon?.(r)}
                      className={`group transition-colors ${activa ? 'bg-[#E11D48]/[0.04] ring-1 ring-inset ring-[#E11D48]/25' : 'hover:bg-gray-50/60'} ${onClickRenglon ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-3 py-1.5 text-gray-700">
                        {r.concepto}
                        {r.compartido && (
                          <span
                            className="ml-1.5 text-[8px] font-bold uppercase tracking-wider text-violet-700 bg-violet-50 border border-violet-100 px-1 py-0.5 rounded cursor-help"
                            title={r.detalleReparto ?? undefined}
                          >
                            compartido {(r.participacion * 100).toFixed(0)}%
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">
                        {c.costo ?? <>${money(r.costo)} <Mon m={r.monedaCosto} mostrar={variasMonedas || r.monedaCosto !== r.monedaVenta} /></>}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">
                        {c.profit ?? (r.profit === null ? <span className="text-gray-300" title="Venta y costo en monedas distintas">—</span> : `$${money(r.profit)}`)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-[#18181B]">
                        {c.venta ?? <span title={r.detalleReparto ?? undefined}>${money(r.venta)} <Mon m={r.monedaVenta} mostrar={variasMonedas || r.monedaCosto !== r.monedaVenta} /></span>}
                      </td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${r.margen !== null && r.margen < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {pct(r.margen)}
                      </td>
                      {conAcciones && <td className="px-2 py-1.5">{c.acciones ?? null}</td>}
                    </tr>
                  );
                })}

                {/* Total del proveedor, por moneda */}
                {g.monedasActivas.map(m => (
                  <FilaTotal key={m} etiqueta={`Total ${nombre}`} moneda={m} variasMonedas={variasMonedas || g.monedasActivas.length > 1} t={g.totales[m]} cols={cols} tono="grupo" />
                ))}
              </tbody>
            );
          })}

          <tfoot>
            {consolidado.monedasActivas.map(m => (
              <FilaTotal key={m} etiqueta="Total general" moneda={m} variasMonedas={variasMonedas} t={consolidado.totalGeneral[m]} cols={cols} tono="general" />
            ))}
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Mon({ m, mostrar }: { m: Moneda; mostrar: boolean }) {
  return mostrar ? <span className="text-[10px] text-gray-400 font-mono">{m}</span> : null;
}

function FilaTotal({ etiqueta, moneda, variasMonedas, t, cols, tono }: {
  etiqueta: string; moneda: Moneda; variasMonedas: boolean;
  t: { costo: number; profit: number; venta: number; margen: number | null };
  cols: number; tono: 'grupo' | 'general';
}) {
  const cls = tono === 'general' ? 'bg-gray-100 border-t-2 border-gray-300' : 'bg-gray-50/60 border-t border-gray-200';
  return (
    <tr className={`${cls} font-bold`}>
      <td className="px-3 py-2 text-[11px] text-gray-500 uppercase tracking-wider">
        {etiqueta}{variasMonedas ? ` ${moneda}` : ''}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-700">${money(t.costo)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-700">${money(t.profit)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-[#18181B]">
        ${money(t.venta)} <span className="text-[10px] text-gray-400 font-mono">{moneda}</span>
      </td>
      <td className={`px-3 py-2 text-right tabular-nums ${t.margen !== null && t.margen < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
        {pct(t.margen)}
      </td>
      {cols > 5 && <td />}
    </tr>
  );
}

/** El toggle «Por proveedor | Por concepto», igual en las dos fichas. */
export function ToggleVistaCargos({ vista, onCambiar }: {
  vista: 'proveedor' | 'concepto';
  onCambiar: (v: 'proveedor' | 'concepto') => void;
}) {
  return (
    <div className="inline-flex bg-gray-100 p-0.5 rounded-lg" role="tablist" aria-label="Cómo ver los cargos">
      {([['proveedor', 'Por proveedor'], ['concepto', 'Por concepto']] as const).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={vista === id}
          onClick={() => onCambiar(id)}
          className={`px-3 py-1 rounded-md text-[11px] font-bold transition-colors ${
            vista === id ? 'bg-white text-[#18181B] shadow-2xs' : 'text-gray-500 hover:text-gray-700'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
