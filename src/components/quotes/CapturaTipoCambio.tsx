import React, { useState } from 'react';
import { Coins, Check } from 'lucide-react';
import {
  ETIQUETA_FUENTE, aplicarReglaPricingRate, etiquetaTipoCambio, tasaUtilizable,
  type TipoCambioCotizacion, type FuenteTipoCambio, type ReglaPricingRate,
} from '../../lib/monedaComparativa';

/**
 * Captura del tipo de cambio de la cotización (MO-3).
 *
 * Se guarda CON la cotización y no se relee: si se tomara el vigente en cada
 * apertura, reabrir el documento el mes que viene podría reordenar a los
 * agentes de la comparativa y contradecir una decisión ya tomada.
 *
 * El «pricing rate» es una REGLA sobre otra tasa, no un número suelto: «el de
 * Pricing se puede poner que sea el de Banamex más cuatro pesos o más un
 * porcentaje». Por eso se captura la base y el colchón por separado, y queda
 * escrito de dónde salió el número.
 */

interface Props {
  tipoCambio: TipoCambioCotizacion | null | undefined;
  editable: boolean;
  onCambiar: (tc: TipoCambioCotizacion | null) => void;
}

const FUENTES_BASE: Exclude<FuenteTipoCambio, 'pricing_rate' | 'manual'>[] =
  ['sat', 'banxico', 'banamex_compra', 'banamex_venta'];

export default function CapturaTipoCambio({ tipoCambio, editable, onCambiar }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<'directo' | 'regla'>('directo');
  const [valor, setValor] = useState(String(tipoCambio?.valor ?? ''));
  const [fuente, setFuente] = useState<FuenteTipoCambio>(tipoCambio?.fuente ?? 'banxico');
  const [tasaBase, setTasaBase] = useState('');
  const [baseFuente, setBaseFuente] = useState<ReglaPricingRate['baseFuente']>('banamex_venta');
  const [colchonTipo, setColchonTipo] = useState<'monto' | 'porcentaje'>('monto');
  const [colchon, setColchon] = useState('');

  const hoy = new Date().toISOString().slice(0, 10);

  const guardar = () => {
    if (modo === 'regla') {
      const base = Number(tasaBase);
      const c = Number(colchon);
      if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(c)) return;
      onCambiar(aplicarReglaPricingRate(base, { baseFuente, tipo: colchonTipo, valor: c }, hoy));
    } else {
      const v = Number(valor);
      if (!Number.isFinite(v) || v <= 0) return;
      onCambiar({ valor: v, base: 'USD', destino: 'MXN', fuente, fecha: hoy });
    }
    setAbierto(false);
  };

  const definido = tasaUtilizable(tipoCambio);

  if (!editable) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
        <Coins className="w-3 h-3 text-gray-400" />
        {etiquetaTipoCambio(tipoCambio)}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto(v => !v)}
        className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border transition-colors ${
          definido
            ? 'border-gray-200 bg-white text-gray-600 hover:border-primario/40'
            : 'border-dashed border-amber-300 bg-amber-50/60 text-amber-700 hover:border-amber-400'
        }`}
      >
        <Coins className="w-3 h-3" />
        {etiquetaTipoCambio(tipoCambio)}
      </button>

      {abierto && (
        <div className="absolute z-50 mt-1 w-[320px] bg-white border border-gray-200 rounded-xl shadow-lg p-3 space-y-3">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {(['directo', 'regla'] as const).map(m => (
              <button
                key={m}
                onClick={() => setModo(m)}
                className={`flex-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  modo === m ? 'bg-white text-[#18181B] shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {m === 'directo' ? 'Valor directo' : 'Pricing rate'}
              </button>
            ))}
          </div>

          {modo === 'directo' ? (
            <>
              <div>
                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">
                  1 USD equivale a
                </label>
                <input
                  type="number" step="0.0001" autoFocus
                  value={valor}
                  onChange={e => setValor(e.target.value)}
                  placeholder="18.5000"
                  className="w-full px-2 py-1.5 text-[12px] tabular-nums border border-gray-200 rounded-lg outline-none focus:border-primario"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Fuente</label>
                <select
                  value={fuente}
                  onChange={e => setFuente(e.target.value as FuenteTipoCambio)}
                  className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-primario bg-white"
                >
                  {(Object.keys(ETIQUETA_FUENTE) as FuenteTipoCambio[])
                    .filter(f => f !== 'pricing_rate')
                    .map(f => <option key={f} value={f}>{ETIQUETA_FUENTE[f]}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <p className="text-[10px] text-gray-400 leading-snug">
                El pricing rate es una regla sobre otra tasa. Queda escrito de dónde salió.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Base</label>
                  <select
                    value={baseFuente}
                    onChange={e => setBaseFuente(e.target.value as ReglaPricingRate['baseFuente'])}
                    className="w-full px-2 py-1.5 text-[11px] border border-gray-200 rounded-lg outline-none focus:border-primario bg-white"
                  >
                    {FUENTES_BASE.map(f => <option key={f} value={f}>{ETIQUETA_FUENTE[f]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Su valor</label>
                  <input
                    type="number" step="0.0001"
                    value={tasaBase}
                    onChange={e => setTasaBase(e.target.value)}
                    placeholder="20.00"
                    className="w-full px-2 py-1.5 text-[11px] tabular-nums border border-gray-200 rounded-lg outline-none focus:border-primario"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Colchón</label>
                  <select
                    value={colchonTipo}
                    onChange={e => setColchonTipo(e.target.value as 'monto' | 'porcentaje')}
                    className="w-full px-2 py-1.5 text-[11px] border border-gray-200 rounded-lg outline-none focus:border-primario bg-white"
                  >
                    <option value="monto">Pesos</option>
                    <option value="porcentaje">Porcentaje</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Cuánto</label>
                  <input
                    type="number" step="0.01"
                    value={colchon}
                    onChange={e => setColchon(e.target.value)}
                    placeholder={colchonTipo === 'monto' ? '0.50' : '2.5'}
                    className="w-full px-2 py-1.5 text-[11px] tabular-nums border border-gray-200 rounded-lg outline-none focus:border-primario"
                  />
                </div>
              </div>
              {tasaBase && colchon && (
                <p className="text-[11px] text-gray-600 bg-gray-50 rounded-lg px-2 py-1.5">
                  Resultado:{' '}
                  <span className="font-mono font-bold text-[#18181B]">
                    {aplicarReglaPricingRate(Number(tasaBase),
                      { baseFuente, tipo: colchonTipo, valor: Number(colchon) }, hoy).valor}
                  </span>
                </p>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-1">
            {definido && (
              <button
                onClick={() => { onCambiar(null); setAbierto(false); }}
                className="text-[11px] font-semibold text-gray-400 hover:text-red-500 px-2 py-1"
              >
                Quitar
              </button>
            )}
            <button
              onClick={guardar}
              className="flex items-center gap-1 bg-primario text-white text-[11px] font-bold px-3 py-1.5 rounded-lg hover:bg-primario-hover transition-colors"
            >
              <Check className="w-3 h-3" /> Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
