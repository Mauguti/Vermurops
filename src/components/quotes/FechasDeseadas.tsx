/**
 * FechasDeseadas.tsx (tarea 101)
 *
 * Las dos fechas que desea el cliente, en tres usos: captura (solicitud y
 * ficha), y solo lectura (franja de Pricing y ficha del embarque). Las reglas
 * viven en lib/fechasDeseadas.ts.
 */
import { useEffect, useState } from 'react';
import { problemasFechasDeseadas, formatearFechaDeseada, fechasDeseadasDe, type FechasDeseadas } from '../../lib/fechasDeseadas';

const LBL = 'block text-[9px] font-bold text-gray-400 uppercase mb-1.5';
const INPUT = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-primario bg-white';

export function CapturaFechasDeseadas({ recoleccion, entrega, onCambio, deshabilitado }: {
  recoleccion: string | null | undefined;
  entrega: string | null | undefined;
  onCambio: (r: string | null, e: string | null) => void;
  deshabilitado?: boolean;
}) {
  const { error, avisos } = problemasFechasDeseadas(recoleccion, entrega);
  return (
    <div data-testid="fechas-deseadas">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LBL} htmlFor="fecha-recoleccion-deseada">¿Cuándo quiere el cliente que se recoja?</label>
          <input
            id="fecha-recoleccion-deseada" type="date" disabled={deshabilitado}
            value={recoleccion ?? ''} className={INPUT}
            onChange={e => onCambio(e.target.value || null, entrega ?? null)}
          />
        </div>
        <div>
          <label className={LBL} htmlFor="fecha-entrega-deseada">¿Cuándo quiere que se entregue?</label>
          <input
            id="fecha-entrega-deseada" type="date" disabled={deshabilitado}
            value={entrega ?? ''} className={INPUT}
            onChange={e => onCambio(recoleccion ?? null, e.target.value || null)}
          />
        </div>
      </div>
      {error && <p role="alert" className="mt-1 text-[10px] font-semibold text-peligro">{error}</p>}
      {avisos.map(a => <p key={a} className="mt-1 text-[10px] font-semibold text-amber-700">{a} Se guarda igual.</p>)}
    </div>
  );
}

/** Solo lectura. Sin ninguna fecha no pinta nada (`siempre` la muestra con guiones). */
export function LecturaFechasDeseadas({ fuente, titulo, siempre }: {
  fuente: FechasDeseadas | null | undefined;
  titulo: string;
  siempre?: boolean;
}) {
  const { recoleccion, entrega } = fechasDeseadasDe(fuente);
  if (!recoleccion && !entrega && !siempre) return null;
  return (
    <div data-testid="fechas-deseadas-lectura">
      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{titulo}</p>
      <p className="text-[12px] text-gray-700 mt-0.5">
        <span className="text-gray-500">Recolección:</span> <span className="font-semibold">{formatearFechaDeseada(recoleccion)}</span>
        <span className="text-gray-300"> · </span>
        <span className="text-gray-500">Entrega:</span> <span className="font-semibold">{formatearFechaDeseada(entrega)}</span>
      </p>
    </div>
  );
}

/**
 * Captura de la ficha: guarda cada cambio válido y, si la entrega queda antes
 * de la recolección, la deja en pantalla con su error SIN guardarla.
 */
export function EditorFechasDeseadas({ fuente, onGuardar }: {
  fuente: FechasDeseadas;
  onGuardar: (r: string | null, e: string | null) => void;
}) {
  const [r, setR] = useState<string | null>(fuente.fechaRecoleccionDeseada ?? null);
  const [e, setE] = useState<string | null>(fuente.fechaEntregaDeseada ?? null);
  useEffect(() => {
    setR(fuente.fechaRecoleccionDeseada ?? null);
    setE(fuente.fechaEntregaDeseada ?? null);
  }, [fuente.fechaRecoleccionDeseada, fuente.fechaEntregaDeseada]);
  return (
    <CapturaFechasDeseadas
      recoleccion={r} entrega={e}
      onCambio={(nr, ne) => {
        setR(nr); setE(ne);
        if (!problemasFechasDeseadas(nr, ne).error) onGuardar(nr, ne);
      }}
    />
  );
}
