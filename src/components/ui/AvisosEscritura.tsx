import React, { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import {
  suscribirErroresEscritura, instalarRedDeSeguridad, type ErrorEscritura,
} from '../../lib/erroresEscritura';

/**
 * Avisos de fallo de escritura, montado una sola vez en la raíz.
 *
 * Cualquier hook puede reportar sin pasar props por el árbol. Los errores de
 * guardado no son un detalle de una pantalla: son pérdida de trabajo, y tienen
 * que verse desde donde sea que ocurran.
 *
 * No se cierran solos. Un toast de éxito puede desaparecer a los 4 segundos;
 * uno que dice «tu cambio no se guardó» tiene que esperar a que lo lean.
 */

export default function AvisosEscritura() {
  const [errores, setErrores] = useState<ErrorEscritura[]>([]);

  useEffect(() => {
    const desuscribir = suscribirErroresEscritura(e =>
      // Se conservan los últimos tres: si algo falla en bucle, no tapar la
      // pantalla entera.
      setErrores(prev => [...prev.slice(-2), e]),
    );
    const quitarRed = instalarRedDeSeguridad();
    return () => { desuscribir(); quitarRed(); };
  }, []);

  if (errores.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-[380px]">
      {errores.map(e => (
        <div
          key={e.id}
          className="flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg"
          style={{ background: '#FEF2F2', borderColor: '#FECACA' }}
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-[1px]" style={{ color: '#B91C1C' }} />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold" style={{ color: '#B91C1C' }}>
              No se guardó {e.contexto}
            </p>
            <p className="text-[11px] leading-snug mt-0.5" style={{ color: '#991B1B' }}>
              {e.mensaje}
            </p>
            {e.codigo && (
              <p className="text-[10px] mt-1 font-mono" style={{ color: '#DC2626' }}>
                {e.codigo}
              </p>
            )}
          </div>
          <button
            onClick={() => setErrores(prev => prev.filter(x => x.id !== e.id))}
            className="shrink-0 hover:opacity-70"
            style={{ color: '#B91C1C' }}
            aria-label="Cerrar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
