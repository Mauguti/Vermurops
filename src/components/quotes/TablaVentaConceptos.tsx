/**
 * TablaVentaConceptos.tsx (sep-2026)
 *
 * La cotización como la ve VENTAS: la lista de conceptos con su precio de
 * venta, y el total. Nada más.
 *
 * Textual de Gabi: «que vean la coti, o sea, la información que tiene una
 * cotización, y el margen. Eso es todo». El margen de la operación vive en la
 * pestaña de Información; aquí va lo que se le dice al cliente.
 *
 * ── Por qué es un componente aparte y no columnas escondidas ───────────────
 * La tabla completa (TablaConceptos) recibe y renderiza costo, profit, margen
 * y proveedor. Ocultarlos con CSS o con un if por columna deja el dato a un
 * descuido de distancia. Este componente NUNCA los pinta: no hay rama de
 * código que pueda mostrarlos. El límite de fondo sigue siendo el de §6 — las
 * reglas de Firestore aún no distinguen roles — pero dentro de la app no
 * existe camino a esos números desde la vista de Ventas.
 */

import React from 'react';
import type { LineaPlana } from '../../lib/lineasCotizacion';
import { sumarPorMoneda, monedasConMonto } from '../../lib/sumarPorMoneda';

const money = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  lineas: LineaPlana[];
  /** Nombre legible del servicio, para agrupar cuando hay varios. */
  etiquetaServicio: (servicioId: string) => string;
}

export default function TablaVentaConceptos({ lineas, etiquetaServicio }: Props) {
  const ordenadas = [...lineas].sort((a, b) =>
    a.servicioId.localeCompare(b.servicioId) || a.orden - b.orden);
  const totales = sumarPorMoneda(ordenadas, l => l.venta, l => l.moneda);
  const monedas = monedasConMonto(totales);
  const variosServicios = new Set(ordenadas.map(l => l.servicioId)).size > 1;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
        <span className="text-[13px] font-bold text-[#18181B]">Conceptos de la cotización</span>
        <span className="text-[11px] text-gray-400">
          {ordenadas.length} concepto{ordenadas.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100">
              {variosServicios && (
                <th className="px-4 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Servicio</th>
              )}
              <th className="px-4 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Concepto</th>
              <th className="px-4 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">Precio</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map(l => (
              <tr key={l.id} className="border-b border-gray-50 last:border-b-0">
                {variosServicios && (
                  <td className="px-4 py-2.5 text-[11px] text-gray-400">{etiquetaServicio(l.servicioId)}</td>
                )}
                <td className="px-4 py-2.5 text-[12px] font-medium text-gray-800">
                  {l.concepto || <span className="italic text-gray-400">Concepto por definir</span>}
                </td>
                <td className="px-4 py-2.5 text-[12px] font-semibold text-gray-800 text-right tabular-nums whitespace-nowrap">
                  {l.moneda} {money(l.venta)}
                </td>
              </tr>
            ))}
            {ordenadas.length === 0 && (
              <tr>
                <td colSpan={variosServicios ? 3 : 2} className="px-4 py-8 text-center text-[12px] text-gray-400 italic">
                  Pricing aún no captura los conceptos de esta cotización.
                </td>
              </tr>
            )}
          </tbody>
          {ordenadas.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50/60">
                <td colSpan={variosServicios ? 2 : 1} className="px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Total
                </td>
                {/* §4.3: un total POR moneda, nunca un escalar revuelto. */}
                <td className="px-4 py-2.5 text-right text-[13px] font-bold text-[#18181B] tabular-nums whitespace-nowrap">
                  {monedas.map(m => `${m} ${money(totales[m as 'USD' | 'MXN'])}`).join(' + ')}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
