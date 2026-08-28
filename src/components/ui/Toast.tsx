import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

/**
 * Toast — confirmación visible de que una acción ocurrió.
 *
 * Nace del bug que reportó el cliente: «al crear un prospecto no aparece
 * confirmación de que se registró». La app no tenía ningún mecanismo de
 * feedback; se usaba window.alert o nada.
 *
 * Se cierra solo a los `duracionMs`, o a mano. `mensaje` en null lo oculta.
 */

export type TipoToast = 'exito' | 'error';

interface ToastProps {
  mensaje: string | null;
  tipo?: TipoToast;
  onClose: () => void;
  duracionMs?: number;
}

const ESTILO: Record<TipoToast, { bg: string; borde: string; texto: string }> = {
  exito: { bg: '#F0FDF4', borde: '#BBF7D0', texto: '#15803D' },
  error: { bg: '#FEF2F2', borde: '#FECACA', texto: '#B91C1C' },
};

export default function Toast({ mensaje, tipo = 'exito', onClose, duracionMs = 4000 }: ToastProps) {
  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(onClose, duracionMs);
    return () => clearTimeout(t);
  }, [mensaje, duracionMs, onClose]);

  if (!mensaje) return null;

  const c = ESTILO[tipo];
  const Icono = tipo === 'exito' ? CheckCircle2 : AlertCircle;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[24px] right-[24px] z-[100] flex items-center gap-[10px] px-[16px] py-[12px] rounded-[10px] shadow-lg border animate-fade-in max-w-[420px]"
      style={{ background: c.bg, borderColor: c.borde, color: c.texto }}
    >
      <Icono className="w-[18px] h-[18px] shrink-0" />
      <span className="text-[13px] font-medium leading-snug">{mensaje}</span>
      <button
        onClick={onClose}
        aria-label="Cerrar aviso"
        className="ml-[4px] opacity-60 hover:opacity-100 transition-opacity shrink-0"
      >
        <X className="w-[14px] h-[14px]" />
      </button>
    </div>
  );
}
