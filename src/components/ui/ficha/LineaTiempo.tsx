import React from 'react';

/**
 * La línea del tiempo de una ficha: en qué paso va, de cuántos.
 *
 * ── De dónde sale ──────────────────────────────────────────────────────────
 * Es la barra de avance que la ficha de cotización ya tenía para Ventas, con
 * el mismo marcado. Las demás fichas resolvían lo mismo cada una a su manera:
 * el prospecto con círculos y una línea, el embarque sin nada.
 *
 * ── El criterio de los roles ───────────────────────────────────────────────
 * La cotización muestra cinco pasos a Ventas y las etapas internas a Pricing:
 * a Ventas le importa que está con Pricing, no en cuál paso interno va. Eso
 * vive en `visibilidadCotizacion.ts` y NO se resuelve aquí — este componente
 * recibe los pasos ya elegidos. Quien lo use decide cuáles enseñar, que es lo
 * que permite aplicar el mismo criterio sin duplicarlo.
 */

export interface PasoLinea {
  id: string;
  label: string;
}

interface Props {
  titulo: string;
  pasos: PasoLinea[];
  /** Índice del paso actual. -1 si la etapa no está en la línea. */
  indiceActual: number;
  /**
   * El recorrido terminó mal (perdida, rechazada, cancelada). El último tramo
   * se pinta en rojo en vez de en el color de marca.
   */
  fallido?: boolean;
  /** Interactivo: llevar la entidad a ese paso. Sin él, la línea solo informa. */
  onIrAPaso?: (pasoId: string) => void;
}

export default function LineaTiempo({
  titulo, pasos, indiceActual, fallido = false, onIrAPaso,
}: Props) {
  if (pasos.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
        {titulo}
      </h4>
      <div className="flex items-center gap-1">
        {pasos.map((paso, i) => {
          const hecho = i < indiceActual;
          const esActual = i === indiceActual;
          const enRojo = fallido && i === pasos.length - 1;

          const contenido = (
            <>
              <div className={`w-full h-1.5 rounded-full ${
                enRojo ? 'bg-red-400'
                : hecho || esActual ? 'bg-[#E11D48]'
                : 'bg-gray-200'}`} />
              <span className={`mt-1.5 text-[10px] text-center leading-tight truncate w-full ${
                esActual ? 'font-bold text-[#18181B]' : 'text-gray-400'}`}>
                {paso.label}
              </span>
            </>
          );

          return onIrAPaso ? (
            <button
              key={paso.id}
              onClick={() => onIrAPaso(paso.id)}
              className="flex flex-col items-center flex-1 min-w-0 group"
              title={`Mover a «${paso.label}»`}
            >
              {contenido}
            </button>
          ) : (
            <div key={paso.id} className="flex flex-col items-center flex-1 min-w-0">
              {contenido}
            </div>
          );
        })}
      </div>
    </div>
  );
}
