import React from 'react';

/**
 * Una lista o sección vacía, explicada.
 *
 * Regla: nunca en blanco. Un espacio vacío no distingue «no hay nada todavía»
 * de «no cargó» ni de «el filtro no encontró». Cada vacío dice qué es, por qué
 * está vacío y qué hacer.
 *
 * El marcado sale de los vacíos que la ficha de cotización y las tarjetas de
 * modalidad ya usaban; aquí solo queda en un lugar para que no diverjan.
 */

interface Props {
  /** Icono de lucide, ya dimensionado por el componente. */
  icono?: React.ReactNode;
  /** Qué es lo que está vacío. Una frase, no un título de error. */
  titulo: string;
  /** Por qué está vacío o qué lo llenaría. Opcional pero casi siempre útil. */
  detalle?: string;
  /** La acción que lo llena, si existe y el rol puede ejecutarla. */
  accion?: React.ReactNode;
  /** Con borde punteado (una zona que se va a llenar) o sin él (dentro de una tabla). */
  variante?: 'caja' | 'plano';
}

export default function EstadoVacio({
  icono, titulo, detalle, accion, variante = 'caja',
}: Props) {
  return (
    <div className={variante === 'caja'
      ? 'border-2 border-dashed border-gray-200 rounded-xl py-10 px-6 text-center'
      : 'py-8 px-6 text-center'}>
      {icono && (
        <div className="text-gray-300 mx-auto mb-2 w-6 h-6 flex items-center justify-center">
          {icono}
        </div>
      )}
      <p className="text-[12px] text-gray-500 font-medium">{titulo}</p>
      {detalle && (
        <p className="text-[11px] text-gray-400 mt-1 max-w-sm mx-auto leading-relaxed">
          {detalle}
        </p>
      )}
      {accion && <div className="mt-3 flex justify-center">{accion}</div>}
    </div>
  );
}
