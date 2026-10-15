import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { etiquetaDeCampo } from '../../lib/adopcionCotizacion';

/**
 * Franja ámbar: el mismo campo cambió en las dos copias (tarea 122, P4).
 * No bloquea nada: gana el último en guardar, y la persona decide si ver qué
 * cambió o recargar la copia del servidor. Ámbar y no rojo (§4.20: el rojo es
 * solo peligro).
 */
export default function AvisoConflictoCotizacion({
  conflictos, onRecargar,
}: { conflictos: string[]; onRecargar: () => void }) {
  const [verCambios, setVerCambios] = useState(false);
  if (conflictos.length === 0) return null;
  return (
    <div
      role="alert"
      data-testid="aviso-conflicto-cotizacion"
      className="mb-[12px] rounded-[10px] border border-amber-300 bg-amber-50 px-[16px] py-[10px] text-[13px] text-amber-900"
    >
      <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[6px]">
        <AlertTriangle size={16} className="shrink-0 text-amber-600" />
        <span className="font-semibold">Otra persona modificó esta cotización.</span>
        <span className="text-amber-800">Si guardas ahora, tus cambios reemplazan los suyos.</span>
        <span className="ml-auto flex gap-[8px]">
          <button
            type="button"
            onClick={() => setVerCambios(v => !v)}
            className="rounded-[8px] border border-amber-400 bg-white px-[10px] py-[4px] text-[12px] font-semibold text-amber-900 hover:bg-amber-100"
          >
            {verCambios ? 'Ocultar cambios' : 'Ver cambios'}
          </button>
          <button
            type="button"
            onClick={onRecargar}
            className="rounded-[8px] border border-amber-500 bg-amber-100 px-[10px] py-[4px] text-[12px] font-semibold text-amber-900 hover:bg-amber-200"
          >
            Recargar
          </button>
        </span>
      </div>
      {verCambios && (
        <ul className="mt-[8px] list-disc pl-[28px] text-[12px]" data-testid="aviso-conflicto-detalle">
          {conflictos.map(c => (
            <li key={c}>{etiquetaDeCampo(c)}: cambió en las dos copias. «Recargar» toma la de la otra persona.</li>
          ))}
        </ul>
      )}
    </div>
  );
}
