/**
 * ModalGenerarPdf.tsx (Bloque 1)
 *
 * Idioma, vigencia y notas antes de generar. Lo que sale al cliente lleva
 * solo concepto y venta; aquí se muestra ese resumen para que Pricing vea
 * exactamente qué va a firmar.
 */

import React, { useState } from 'react';
import { X, FileText, Loader2 } from 'lucide-react';
import type { KanbanQuote, PdfCotizacion } from '../quotes/QuotesData';
import { lineasParaPdf, vigenciaSugerida, nombreArchivoPdf, type IdiomaPdf } from '../../lib/pdfCotizacion';
import { aplanarCotizacion } from '../../lib/lineasCotizacion';
import { sumarPorMoneda, formatearPorMoneda } from '../../lib/sumarPorMoneda';

interface Props {
  quote: KanbanQuote;
  generando: boolean;
  onGenerar: (o: { idioma: IdiomaPdf; vigencia: string; notas: string }) => Promise<PdfCotizacion>;
  onCerrar: () => void;
}

export default function ModalGenerarPdf({ quote, generando, onGenerar, onCerrar }: Props) {
  const lineas = aplanarCotizacion(quote);
  const [idioma, setIdioma] = useState<IdiomaPdf>('es');
  const [vigencia, setVigencia] = useState(vigenciaSugerida(lineas));
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<PdfCotizacion | null>(null);

  const alCliente = lineasParaPdf(lineas);
  const total = formatearPorMoneda(sumarPorMoneda(alCliente, l => l.venta, l => l.moneda));

  const generar = async () => {
    setError(null);
    try {
      setListo(await onGenerar({ idioma, vigencia, notas }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-150 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primario" />
            <h3 className="text-[14px] font-bold text-[#18181B]">Generar PDF · {nombreArchivoPdf(quote, idioma)}</h3>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Idioma</span>
              <select value={idioma} onChange={e => setIdioma(e.target.value as IdiomaPdf)} disabled={generando || !!listo}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none focus:border-primario bg-white">
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Vigencia</span>
              <input type="date" value={vigencia} onChange={e => setVigencia(e.target.value)} disabled={generando || !!listo}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario" />
              <span className="block text-[9px] text-gray-400 mt-0.5">Sugerida: la tarifa elegida más corta.</span>
            </label>
          </div>

          <label className="block">
            <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Notas para el cliente</span>
            <textarea rows={2} value={notas} onChange={e => setNotas(e.target.value)} disabled={generando || !!listo}
              placeholder="Sujeto a disponibilidad de espacio. No incluye impuestos…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario resize-none" />
          </label>

          {/* Lo que sale: solo concepto y venta. */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-gray-50 text-[9px] font-bold text-gray-500 uppercase tracking-wider">
              Lo que verá el cliente · {alCliente.length} línea{alCliente.length !== 1 ? 's' : ''}
            </div>
            <table className="w-full text-[12px]">
              <tbody className="divide-y divide-gray-100">
                {alCliente.map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-gray-700">{l.concepto}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{l.moneda} {l.venta.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50/60 font-bold">
                  <td className="px-3 py-1.5 text-[11px] text-gray-500 uppercase">Total</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{total}</td>
                </tr>
              </tbody>
            </table>
            <p className="px-3 py-1.5 text-[10px] text-gray-400">Sin costos, proveedores ni margen.</p>
          </div>

          {error && <p className="text-[11px] text-red-600 font-semibold">{error}</p>}
          {listo && (
            <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Listo: <strong>{listo.nombreArchivo}</strong> se descargó y quedó guardado como evidencia de la v{listo.version}.
            </p>
          )}
        </div>

        <div className="px-5 py-4 bg-gray-50/50 border-t border-gray-150 flex justify-end gap-2">
          <button onClick={onCerrar} className="text-xs font-bold text-gray-500 hover:text-gray-700 uppercase tracking-wider px-4 py-2">
            {listo ? 'Cerrar' : 'Cancelar'}
          </button>
          {!listo && (
            <button onClick={generar} disabled={generando || alCliente.length === 0}
              className="bg-primario hover:bg-primario-hover text-white text-xs font-bold uppercase tracking-wider px-5 py-2 rounded-lg disabled:opacity-40 flex items-center gap-2">
              {generando ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generando…</> : 'Generar PDF'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
