/**
 * ExchangeRates.tsx — Módulo «Tipo de cambio».
 *
 * Muestra el FIX del DOF (serie SF43718 de Banxico) con su fecha de
 * determinación, un aviso si está desactualizado, historial de los últimos
 * 30 días, y botón «Actualizar ahora» para admin, administracion y pricing.
 *
 * Tarea 56: esta pantalla es el dato FISCAL, de referencia. Con lo que se
 * cotiza es el tipo de cambio de Pricing, que se captura en cada cotización y
 * se congela ahí. Aquí se dice, para que nadie lea este número como «el tipo
 * de cambio de la empresa». Ver `lib/tipoCambioPricing.ts`.
 */

import React from 'react';
import { RefreshCw, AlertTriangle, CheckCircle, TrendingUp, Clock } from 'lucide-react';
import { useTipoCambioActual, useHistorialTipoCambio, useActualizarTipoCambio } from '../hooks/useTipoCambio';
import { estaDesactualizado, etiquetaFechaTC } from '../lib/tipoCambioBanxico';
import { useAuth } from '../auth/AuthContext';

const fmt = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

const fmtHora = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-MX', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
};

export default function ExchangeRates() {
  const { puede: puedeUsuario } = useAuth();
  const { config, cargando, error } = useTipoCambioActual();
  const { registros, cargando: cargandoHist } = useHistorialTipoCambio();
  const { actualizar, actualizando, error: errorActualizar } = useActualizarTipoCambio();
  const puedeActualizar = puedeUsuario('tipoCambio.actualizar');
  const desactualizado = config ? estaDesactualizado(config.fechaDeterminacion) : false;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">
          Tipo de Cambio
        </h2>
        <p className="text-[13px] text-text-secondary mt-1">
          FIX del DOF publicado por Banxico (serie SF43718). Se consulta solo a las 8, 10, 12, 14, 16 y 18 h
          en días hábiles.
        </p>
      </div>

      {/* ── Qué es y qué no es este número (tarea 56) ──────────────────── */}
      <div className="bg-primario/5 border border-primario/20 rounded-xl px-5 py-3 text-[12px] text-gray-700 leading-relaxed">
        <strong className="text-primario">Esta pantalla es de referencia.</strong> Con lo que Vermur cotiza
        es el <strong>tipo de cambio de Pricing</strong>, que se captura en cada cotización y se congela ahí
        junto con el margen. El FIX de Banxico se muestra al lado de esa captura, informativo; no la precarga
        ni entra en ningún cálculo.
      </div>

      {/* ── Tarjeta principal ──────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        {cargando ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Cargando...
          </div>
        ) : error ? (
          <div className="text-red-600 text-sm">{error}</div>
        ) : !config ? (
          <div className="text-center py-8">
            <TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              Aún no se ha consultado el tipo de cambio.
              {puedeActualizar && ' Usa «Actualizar ahora» para obtener el dato de Banxico.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            {/* Valor grande */}
            <div className="flex-1">
              <div className="flex items-baseline gap-3">
                <span className="text-[40px] font-bold tabular-nums text-text-primary">
                  {fmt(config.valor)}
                </span>
                <span className="text-lg text-gray-400 font-medium">MXN / USD</span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[13px] text-gray-500">
                <span>
                  Determinación: <strong className="text-gray-700">
                    {etiquetaFechaTC(config.fechaDeterminacion)}
                  </strong>
                </span>
                {config.fechaLiquidacion && (
                  <span>
                    Liquidación: <strong className="text-gray-700">
                      {etiquetaFechaTC(config.fechaLiquidacion)}
                    </strong>
                  </span>
                )}
              </div>

              {config.ultimaConsulta && (
                <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Última consulta: {fmtHora(config.ultimaConsulta)}
                </p>
              )}
            </div>

            {/* Estado + botón */}
            <div className="flex flex-col items-end gap-3">
              {desactualizado ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Desactualizado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Al día
                </span>
              )}

              {puedeActualizar && (
                <button
                  onClick={actualizar}
                  disabled={actualizando}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primario border border-primario/30 rounded-lg px-3 py-1.5 hover:bg-primario/5 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${actualizando ? 'animate-spin' : ''}`} />
                  {actualizando ? 'Consultando...' : 'Actualizar ahora'}
                </button>
              )}

              {errorActualizar && (
                <p className="text-[11px] text-red-500 max-w-[240px] text-right">{errorActualizar}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Nota fiscal ────────────────────────────────────────────────── */}
      <div className="bg-amber-50/50 border border-amber-200 rounded-xl px-5 py-3 text-[12px] text-amber-800 leading-relaxed">
        <strong>Para qué servirá:</strong> el CFDI exige el tipo de cambio publicado en el DOF, no el de
        Pricing. Este dato es el que usará la factura cuando exista el timbrado; se guardan las dos fechas
        (determinación y liquidación) para aplicar la regla que confirme Julio —el día hábil anterior a la
        operación, salvo que él diga otra.
      </div>

      {/* ── Historial ──────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-[15px] font-semibold text-text-primary mb-3">Historial</h3>
        {cargandoHist ? (
          <p className="text-sm text-gray-400">Cargando historial...</p>
        ) : registros.length === 0 ? (
          <p className="text-sm text-gray-400">Sin registros todavía.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] font-bold text-gray-400 uppercase">
                  <th className="px-4 py-2">Fecha determinación</th>
                  <th className="px-4 py-2">Fecha liquidación</th>
                  <th className="px-4 py-2 text-right">Valor</th>
                  <th className="px-4 py-2">Consultado</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r, i) => (
                  <tr key={r.fechaDeterminacion ?? i} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2 font-medium text-gray-700">
                      {etiquetaFechaTC(r.fechaDeterminacion)}
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {r.fechaLiquidacion ? etiquetaFechaTC(r.fechaLiquidacion) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-800">
                      {fmt(r.valor)}
                    </td>
                    <td className="px-4 py-2 text-gray-400 text-[11px]">
                      {fmtHora(r.consultado)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
