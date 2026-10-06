/**
 * MotivoCorreccion.tsx — tarea 79
 *
 * El campo de motivo que piden anular un pago y quitar una aplicación. Es UN
 * solo componente: la ficha del pago lo pinta en línea y la pestaña Facturas
 * del embarque lo pinta en un modal (`ModalMotivoCorreccion`), en lugar del
 * cuadro nativo del navegador que usaba antes.
 *
 * La regla del motivo (`problemaMotivo`) vive en `lib/reversaPagos.ts`; el
 * hook la vuelve a exigir al escribir.
 */

import { useState } from 'react';
import { problemaMotivo } from '../../lib/reversaPagos';

interface Props {
  /** Qué va a pasar si se confirma. */
  descripcion: string;
  /** Texto del botón de confirmar. */
  confirmar: string;
  onConfirmar: (motivo: string) => Promise<void>;
  onCancelar: () => void;
}

export default function MotivoCorreccion({ descripcion, confirmar, onConfirmar, onCancelar }: Props) {
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problema = problemaMotivo(motivo);

  const aceptar = async () => {
    if (problema || guardando) return;
    setGuardando(true); setError(null);
    try {
      await onConfirmar(motivo.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGuardando(false);
    }
  };

  return (
    <section className="border border-peligro/30 bg-peligro/[0.03] rounded-lg p-3 space-y-2" data-testid="motivo-pago">
      <p className="text-[12px] font-semibold text-gray-800">{descripcion}</p>
      <label className="block">
        <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Motivo (obligatorio)</span>
        <textarea
          value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
          aria-label="Motivo de la corrección"
          placeholder="Qué pasó: «se aplicó a la factura equivocada», «el banco devolvió la transferencia»…"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario"
        />
      </label>
      {(error || (motivo !== '' && problema)) && (
        <p className="text-[11px] text-peligro font-semibold">{error ?? problema}</p>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onCancelar} className="text-xs font-bold text-gray-500 hover:text-gray-700 uppercase tracking-wider px-3 py-1.5">Cancelar</button>
        <button
          onClick={aceptar} disabled={!!problema || guardando}
          className="bg-peligro text-white text-xs font-bold uppercase tracking-wider px-4 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {guardando ? 'Guardando…' : confirmar}
        </button>
      </div>
    </section>
  );
}

/** El mismo motivo, en un modal, para las pantallas que no son la ficha del pago. */
export function ModalMotivoCorreccion(props: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" data-testid="modal-motivo-pago">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-4">
        <MotivoCorreccion {...props} />
      </div>
    </div>
  );
}
