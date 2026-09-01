import React from 'react';
import { USANDO_EMULADORES } from '../../firebase';

/**
 * El aviso de que estás viendo EMULADORES, no producción.
 *
 * Fijo en la esquina, imposible de confundir. La pregunta «¿contra qué base
 * estoy viendo esto?» tiene que responderse de un vistazo: un alta de prueba
 * en la base equivocada es un registro real que el equipo de Vermur ve.
 */
export default function EmuladorBadge() {
  if (!USANDO_EMULADORES) return null;
  return (
    <div className="fixed bottom-3 left-3 z-[999] bg-amber-400 text-amber-950 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded shadow-lg pointer-events-none select-none">
      Emuladores · producción intacta
    </div>
  );
}
