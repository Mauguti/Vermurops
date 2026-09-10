/**
 * VersionesCotizacion.tsx (V-3)
 *
 * Las piezas de UI del versionado. La lógica vive en
 * `lib/versionesCotizacion.ts`; aquí solo se pinta.
 */

import React, { useState } from 'react';
import { X, History, RotateCcw, Eye } from 'lucide-react';
import type { OpcionVersion, ResumenVersion } from '../../lib/versionesCotizacion';
import { formatearPorMoneda } from '../../lib/sumarPorMoneda';

// ─── Selector del encabezado ─────────────────────────────────────────────────

/**
 * «v3 (actual) · v2 · v1». No se pinta si la cotización nunca se versionó.
 */
export function SelectorVersiones({ opciones, numeroVisto, onElegir }: {
  opciones: OpcionVersion[];
  /** La que se está viendo. null = la actual. */
  numeroVisto: number | null;
  onElegir: (numero: number | null) => void;
}) {
  if (opciones.length === 0) return null;
  const actual = opciones.find(o => o.esActual)!;
  const valor = numeroVisto ?? actual.numero;

  return (
    <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
      <History className="w-3.5 h-3.5 text-gray-400" />
      <span className="sr-only">Versión</span>
      <select
        value={valor}
        onChange={e => {
          const n = Number(e.target.value);
          onElegir(n === actual.numero ? null : n);
        }}
        title={opciones.find(o => o.numero === valor)?.detalle}
        className={`px-2 py-1.5 border rounded-lg text-xs font-semibold outline-none bg-white
          ${numeroVisto !== null
            ? 'border-amber-300 text-amber-800 bg-amber-50'
            : 'border-gray-200 text-gray-700 focus:border-[#E11D48]'}`}
      >
        {opciones.map(o => (
          <option key={o.numero} value={o.numero}>{o.etiqueta}</option>
        ))}
      </select>
    </label>
  );
}

export function BotonNuevaVersion({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-[#18181B] text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5"
    >
      <History className="w-3.5 h-3.5 text-[#E11D48]" /> Nueva versión
    </button>
  );
}

// ─── Aviso de versión pasada ─────────────────────────────────────────────────

function fecha(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso.slice(0, 10)
    : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * La franja que deja claro que lo que se ve NO es lo vigente. Sin ella, una
 * v1 en pantalla se confunde con la cotización actual y alguien la manda.
 */
export function AvisoVersionVista({ resumen, numeroActual, onVolver, onRestaurar }: {
  resumen: ResumenVersion | null;
  numeroActual: number;
  onVolver: () => void;
  /** Ausente para quien no puede versionar. */
  onRestaurar?: () => void;
}) {
  return (
    <div className="mx-6 mt-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 flex flex-wrap items-center gap-x-4 gap-y-2">
      <Eye className="w-4 h-4 text-amber-600 shrink-0" />
      <div className="min-w-0 flex-1 text-[12px] text-amber-900 leading-snug">
        {resumen ? (
          <>
            <p className="font-bold">
              Estás viendo la v{resumen.numero}
              {resumen.trasRechazo ? ' · creada tras rechazo' : ''} — solo lectura.
              {' '}La vigente es la v{numeroActual}.
            </p>
            <p className="text-amber-800/80">
              {resumen.motivo ?? 'Versión original'}
              {' · '}congelada el {fecha(resumen.congeladaEn)} por {resumen.congeladaPor.nombre}
              {' · '}{formatearPorMoneda(resumen.totalPorMoneda, { vacio: 'sin montos' })}
              {resumen.estadoFinalAlCongelar === 'perdida' ? ' · estaba perdida' : ''}
            </p>
          </>
        ) : (
          <p className="font-bold">Cargando la versión…</p>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        {onRestaurar && resumen && (
          <button
            onClick={onRestaurar}
            className="px-3 py-1.5 border border-amber-300 bg-white hover:bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5"
          >
            <RotateCcw className="w-3 h-3" /> Restaurar esta versión
          </button>
        )}
        <button
          onClick={onVolver}
          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg"
        >
          Volver a la actual
        </button>
      </div>
    </div>
  );
}

// ─── Modal del motivo ────────────────────────────────────────────────────────

/**
 * Pide el motivo. Obligatorio: una v3 sin motivo no le dice nada a nadie, y
 * es lo que el historial va a mostrar.
 */
export function ModalMotivoVersion({ titulo, descripcion, accion, onCancelar, onConfirmar }: {
  titulo: string;
  descripcion: string;
  accion: string;
  onCancelar: () => void;
  onConfirmar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listo = motivo.trim().length > 0;

  const confirmar = async () => {
    if (!listo || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      await onConfirmar(motivo.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-150 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#E11D48]" />
            <h3 className="text-[14px] font-bold text-[#18181B]">{titulo}</h3>
          </div>
          <button onClick={onCancelar} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-[12px] text-gray-500 leading-snug">{descripcion}</p>
          <div>
            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">
              Motivo *
            </label>
            <textarea
              rows={3}
              autoFocus
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="El cliente pidió otra naviera, bajó el flete, cambió el volumen…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-700 outline-none focus:border-[#E11D48] resize-none"
            />
          </div>
          {error && (
            <p className="text-[11px] text-red-600 font-semibold leading-snug">{error}</p>
          )}
        </div>

        <div className="px-5 py-4 bg-gray-50/50 border-t border-gray-150 flex justify-end gap-2">
          <button
            onClick={onCancelar}
            className="text-xs font-bold text-gray-500 hover:text-gray-700 uppercase tracking-wider px-4 py-2"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={!listo || guardando}
            className="bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold uppercase tracking-wider px-5 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {guardando ? 'Guardando…' : accion}
          </button>
        </div>
      </div>
    </div>
  );
}
