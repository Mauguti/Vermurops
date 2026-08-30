import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { MOTIVOS_PERDIDA, motivoValido, componerMotivo } from '../../lib/motivosPerdida';

/**
 * Pide el motivo al dar por perdido un prospecto o una cotización.
 *
 * Antes el borrado de prospecto solo pedía confirmación —y de hecho no hacía
 * nada, tenía un TODO—. Un prospecto que desaparece sin motivo es una venta
 * perdida sobre la que no se puede aprender nada.
 */

interface Props {
  titulo: string;
  descripcion: string;
  onCancelar: () => void;
  onConfirmar: (motivo: string) => void | Promise<void>;
}

export default function ModalMotivoPerdida({ titulo, descripcion, onCancelar, onConfirmar }: Props) {
  const [motivoId, setMotivoId] = useState('');
  const [detalle, setDetalle] = useState('');
  const [guardando, setGuardando] = useState(false);

  const requiereDetalle = MOTIVOS_PERDIDA.find(m => m.id === motivoId)?.requiereDetalle;
  const listo = motivoId !== '' && motivoValido(motivoId, detalle);

  const confirmar = async () => {
    if (!listo) return;
    setGuardando(true);
    try {
      await onConfirmar(componerMotivo(motivoId, detalle));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-150 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#E11D48]" />
            <h3 className="text-[14px] font-bold text-[#18181B]">{titulo}</h3>
          </div>
          <button onClick={onCancelar} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-[12px] text-gray-500 leading-snug">{descripcion}</p>

          <div>
            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">
              Motivo de pérdida *
            </label>
            <select
              value={motivoId}
              autoFocus
              onChange={e => setMotivoId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48] bg-white"
            >
              <option value="">— Selecciona el motivo —</option>
              {MOTIVOS_PERDIDA.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          {motivoId !== '' && (
            <div>
              <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">
                Detalle {requiereDetalle ? '*' : '(opcional)'}
              </label>
              <textarea
                rows={3}
                value={detalle}
                onChange={e => setDetalle(e.target.value)}
                placeholder={requiereDetalle
                  ? 'Explica el motivo'
                  : 'Contra quién se perdió, qué precio pedían, qué habría hecho la diferencia…'}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-700 outline-none focus:border-[#E11D48] resize-none"
              />
            </div>
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
            {guardando ? 'Guardando…' : 'Marcar como perdido'}
          </button>
        </div>
      </div>
    </div>
  );
}
