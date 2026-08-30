import React from 'react';
import { Ship, Plane, Truck, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { KanbanQuote } from '../quotes/QuotesData';
import { aplanarCotizacion, totalVenta } from '../../lib/lineasCotizacion';

/**
 * Cotizaciones ganadas listas para abrir embarque.
 *
 * Gabi: «no encontré cómo el ejecutivo de operaciones abre un embarque a
 * partir de una cotización. Que es como la sangre del día».
 *
 * Operaciones no entra al módulo de Cotizaciones —se lo quitamos a propósito—,
 * así que la lista vive aquí, dentro de Embarques, como en Magaya.
 */

interface Props {
  ganadas: KanbanQuote[];
  /** Cotizaciones que ya generaron embarque, para no ofrecerlas otra vez. */
  yaConEmbarque: Set<string>;
  onAbrirEmbarque: (quote: KanbanQuote) => void;
  puedeGenerar: boolean;
}

const ICONO: Record<string, React.ReactNode> = {
  maritimo:  <Ship className="w-3.5 h-3.5 text-blue-500" />,
  aereo:     <Plane className="w-3.5 h-3.5 text-sky-500" />,
  terrestre: <Truck className="w-3.5 h-3.5 text-amber-600" />,
};

const money = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CotizacionesGanadas({
  ganadas, yaConEmbarque, onAbrirEmbarque, puedeGenerar,
}: Props) {
  const pendientes = ganadas.filter(q => !yaConEmbarque.has(q.id));

  if (pendientes.length === 0) {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-xl py-10 text-center">
        <CheckCircle2 className="w-6 h-6 text-gray-300 mx-auto mb-2" />
        <p className="text-[12px] text-gray-400">
          No hay cotizaciones ganadas esperando embarque.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
        <h3 className="text-[11px] font-bold text-[#18181B] uppercase tracking-widest">
          Cotizaciones ganadas por abrir
        </h3>
        <span className="text-[11px] font-bold text-[#E11D48] bg-[#E11D48]/10 px-2 py-0.5 rounded-full">
          {pendientes.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left border-b border-gray-100">
              <th className="px-4 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Folio</th>
              <th className="px-4 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Cliente</th>
              <th className="px-4 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Modalidades</th>
              <th className="px-4 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">Valor</th>
              <th className="px-4 py-2 w-[150px]" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {pendientes.map(q => {
              const lineas = aplanarCotizacion(q);
              const tipos = [...new Set(lineas.map(l => l.servicioTipo))];
              return (
                <tr key={q.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 font-mono font-medium text-gray-900">{q.id}</td>
                  <td className="px-4 py-2.5 text-gray-700">{q.prospecto?.empresa ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {tipos.map(t => (
                        <span key={t} title={t}>{ICONO[t] ?? <span className="text-[10px] text-gray-400">{t}</span>}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#18181B]">
                    ${money(totalVenta(lineas))} {q.moneda}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => onAbrirEmbarque(q)}
                      disabled={!puedeGenerar}
                      className="inline-flex items-center gap-1.5 bg-[#E11D48] text-white text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg hover:bg-[#BE123C] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title={puedeGenerar ? undefined : 'Solo Operaciones puede abrir embarques'}
                    >
                      Abrir embarque <ArrowRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
