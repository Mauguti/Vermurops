import React, { useState } from 'react';
import { Ship, Plane, Truck, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { KanbanQuote } from '../quotes/QuotesData';
import { aplanarCotizacion, totalVenta } from '../../lib/lineasCotizacion';
import { modalidadDominante, PREFIJO_FOLIO } from '../../lib/generacionEmbarque';
import { SERIES_EMBARQUE } from '../../lib/folioService';

/** Las series reales (sin la provisional VL): la que se elige va impresa en documentos. */
export const SERIES_ELEGIBLES = SERIES_EMBARQUE.filter(s => s !== 'VL');
export const ETIQUETA_SERIE: Record<string, string> = {
  VLIM: 'VLIM · impo marítimo', VLEM: 'VLEM · expo marítimo',
  VLIT: 'VLIT · impo terrestre', VLET: 'VLET · expo terrestre',
  VLIA: 'VLIA · impo aéreo',     VLEA: 'VLEA · expo aéreo',
};

/** La serie que corresponde a la cotización, si su tráfico se conoce. */
export function serieSugerida(q: KanbanQuote): string {
  const modalidad = modalidadDominante(q).modalidad;
  const t = q.servicios?.find(s => s.trafico)?.trafico;
  const trafico = t === 'importacion' ? 'impo' : t === 'exportacion' ? 'expo' : null;
  return trafico ? PREFIJO_FOLIO[modalidad][trafico] : PREFIJO_FOLIO[modalidad].impo;
}

/**
 * Embarques por capturar.
 *
 * NO es una bandeja de «por convertir»: el embarque se crea SOLO al marcar la
 * cotización como ganada, sin paso intermedio. Lo que espera aquí es la
 * CAPTURA operativa —guía, booking, buque, fechas—, no la conversión.
 *
 * El nombre importa: «Por abrir» sugería una acción pendiente que ya no
 * existe. Gabi lo planteó como pregunta, no como requisito: «si ventas pone la
 * cotización como ganada y en automático les aparece un embarque a
 * operaciones... ¿cómo distingue operaciones que es uno que les acaba de
 * enviar ventas, y no uno que ellos ya abrieron?». La respuesta es el estado,
 * no un botón de conversión.
 */

interface Props {
  ganadas: KanbanQuote[];
  /** Cotizaciones que ya generaron embarque, para no ofrecerlas otra vez. */
  yaConEmbarque: Set<string>;
  /** La serie elegida decide el folio y, de él, el tráfico y el IVA. */
  onAbrirEmbarque: (quote: KanbanQuote, serie: string) => void;
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
  const [series, setSeries] = useState<Record<string, string>>({});
  const serieDe = (q: KanbanQuote) => series[q.id] ?? serieSugerida(q);

  if (pendientes.length === 0) {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-xl py-10 text-center">
        <CheckCircle2 className="w-6 h-6 text-gray-300 mx-auto mb-2" />
        <p className="text-[12px] text-gray-400">
          Todas las cotizaciones ganadas tienen su embarque.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
        {/* Con A-1 cableado esta lista debería estar vacía: el embarque nace
            al marcar la cotización ganada. Lo que aparece aquí son las que se
            ganaron antes de que eso existiera, o aquellas en las que la
            generación falló. Por eso se explica en vez de solo listarse. */}
        <div>
          <h3 className="text-[11px] font-bold text-[#18181B] uppercase tracking-widest">
            Cotizaciones ganadas sin embarque
          </h3>
          <p className="text-[10px] text-gray-400 mt-0.5">
            El embarque nace solo al marcar la cotización ganada. Estas se
            quedaron sin él: ábrelas para generarlo.
          </p>
        </div>
        <span className="text-[11px] font-bold text-primario bg-primario/10 px-2 py-0.5 rounded-full">
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
              <th className="px-4 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Serie</th>
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
                  <td className="px-4 py-2.5">
                    {/* B3 · El tráfico se deriva del folio (VLIM impo, VLEM
                        expo…), y de él el IVA. Se sugiere por la cotización
                        y Operaciones lo confirma. */}
                    <select
                      value={serieDe(q)}
                      onChange={e => setSeries(prev => ({ ...prev, [q.id]: e.target.value }))}
                      disabled={!puedeGenerar}
                      aria-label={`Serie del embarque de ${q.id}`}
                      className="px-2 py-1 text-[11px] font-semibold bg-white border border-gray-200 rounded-md outline-none focus:border-primario"
                    >
                      {SERIES_ELEGIBLES.map(s => <option key={s} value={s}>{ETIQUETA_SERIE[s] ?? s}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!q.clienteId && (
                      <span className="block mb-1 text-[10px] font-semibold text-amber-700">Sin cliente vinculado: vincúlalo en la cotización</span>
                    )}
                    <button
                      onClick={() => onAbrirEmbarque(q, serieDe(q))}
                      disabled={!puedeGenerar || !q.clienteId}
                      className="inline-flex items-center gap-1.5 bg-primario text-white text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg hover:bg-primario-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title={!q.clienteId ? 'Esta cotización no tiene cliente vinculado' : puedeGenerar ? undefined : 'Solo Operaciones puede abrir embarques'}
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
