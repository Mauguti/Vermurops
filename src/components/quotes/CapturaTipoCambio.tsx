import React, { useState } from 'react';
import { Coins, Check, Info, AlertTriangle } from 'lucide-react';
import {
  ETIQUETA_FUENTE, aplicarReglaPricingRate, etiquetaTipoCambio, tasaUtilizable,
  type TipoCambioCotizacion, type FuenteTipoCambio, type ReglaPricingRate,
} from '../../lib/monedaComparativa';
import {
  FUENTES_OPERATIVAS, FUENTES_REFERENCIA, fuenteInicial, modoInicial,
  avisoFuenteReferencia, etiquetaReferenciaBanxico, type ModoCaptura,
} from '../../lib/tipoCambioPricing';
import { useTipoCambioActual } from '../../hooks/useTipoCambio';

/**
 * Captura del tipo de cambio de la cotización (MO-3, revisada en la tarea 56).
 *
 * Se guarda CON la cotización y no se relee: si se tomara el vigente en cada
 * apertura, reabrir el documento el mes que viene podría reordenar a los
 * agentes de la comparativa y contradecir una decisión ya tomada.
 *
 * La tasa que se captura aquí es la OPERATIVA, la de Pricing — es la que abre
 * por defecto. El FIX de Banxico (`configuracion/tipoCambio`) se ve al lado
 * como dato informativo: no precarga el campo ni entra en ningún cálculo. Si
 * alguien lo quiere, lo teclea. Ver `lib/tipoCambioPricing.ts`.
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
  const [modo, setModo] = useState<ModoCaptura>(modoInicial(tipoCambio));
  const [valor, setValor] = useState(String(tipoCambio?.valor ?? ''));
  const [fuente, setFuente] = useState<FuenteTipoCambio>(fuenteInicial(tipoCambio));
  const [tasaBase, setTasaBase] = useState('');
  const [baseFuente, setBaseFuente] = useState<ReglaPricingRate['baseFuente']>('banamex_venta');
  const [colchonTipo, setColchonTipo] = useState<'monto' | 'porcentaje'>('monto');
  const [colchon, setColchon] = useState('');

  const { config: tcBanxico } = useTipoCambioActual();

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

  /**
   * El FIX, solo para leerlo. No hay botón que lo copie: un botón que
   * precarga se aprieta por reflejo, y 18.19 se ve idéntico a 20.50 en el
   * renglón del total — la diferencia aparece en el margen, semanas después.
   */
  const referenciaBanxico = etiquetaReferenciaBanxico(tcBanxico);
  const aviso = avisoFuenteReferencia(tipoCambio);

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
                {m === 'directo' ? 'Valor directo' : 'Con regla'}
              </button>
            ))}
          </div>

          {aviso && (
            <p className="flex items-start gap-1.5 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 leading-snug">
              <AlertTriangle className="w-3 h-3 mt-px shrink-0" />
              {aviso}
            </p>
          )}

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
                  {/* El de Pricing primero y por defecto: es la tasa con la
                      que Vermur cotiza. Las de mercado siguen disponibles,
                      agrupadas aparte, porque hay cotizaciones viejas con
                      ellas y porque alguien puede querer dejarlo escrito. */}
                  <optgroup label="El de Vermur">
                    {FUENTES_OPERATIVAS.map(f => (
                      <option key={f} value={f}>{ETIQUETA_FUENTE[f]}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Tasas de mercado (referencia)">
                    {FUENTES_REFERENCIA.map(f => (
                      <option key={f} value={f}>{ETIQUETA_FUENTE[f]}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </>
          ) : (
            <>
              <p className="text-[10px] text-gray-400 leading-snug">
                El de Pricing también se puede expresar como una regla sobre otra tasa
                («Banamex más cuatro pesos»). Queda escrito de dónde salió.
              </p>
              {tipoCambio?.reglaAplicada && (
                /* Al reabrir, los campos de la regla salen vacíos: sin esto no
                   se vería cuál está aplicada y parecería que no hay ninguna. */
                <p className="text-[10px] text-gray-500 bg-gray-50 rounded-lg px-2 py-1">
                  Regla aplicada:{' '}
                  <span className="font-mono text-gray-700">{tipoCambio.reglaAplicada}</span>
                  {' '}= <span className="font-mono text-gray-700">{tipoCambio.valor}</span>
                </p>
              )}
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

          {/* Banxico, solo como referencia. Sin botón: se teclea a mano. */}
          <div className="border-t border-gray-100 pt-2">
            {referenciaBanxico ? (
              <p className="flex items-start gap-1.5 text-[10px] text-gray-500 leading-snug">
                <Info className="w-3 h-3 mt-px shrink-0 text-gray-400" />
                <span>
                  <span className="tabular-nums">{referenciaBanxico}</span>
                  <span className="block text-gray-400">
                    Informativo. Es el que el SAT exige en la factura, no el que usa Pricing para cotizar.
                  </span>
                </span>
              </p>
            ) : (
              <p className="text-[10px] text-gray-400 leading-snug">
                Sin dato de Banxico para mostrar como referencia.
              </p>
            )}
          </div>

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
