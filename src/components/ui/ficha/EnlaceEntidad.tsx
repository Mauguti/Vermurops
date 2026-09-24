import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useNavegacion, TipoEntidad } from '../../../navegacion/NavegacionContext';

/**
 * Un enlace a otra entidad: un clic, sin buscar.
 *
 * Operaciones debe poder llegar de un embarque a la cotización que lo originó
 * sin salir a la lista. Antes el folio estaba en pantalla como texto y había
 * que copiarlo, ir al otro módulo y buscarlo.
 */

export function EnlaceEntidad({
  tipo, id, children, title,
}: {
  tipo: TipoEntidad;
  id: string;
  children?: React.ReactNode;
  title?: string;
}) {
  const irA = useNavegacion();
  return (
    <button
      onClick={() => irA({ tipo, id })}
      title={title ?? `Abrir ${id}`}
      className="inline-flex items-center gap-1 font-mono text-[12px] font-semibold text-primario hover:underline"
    >
      {children ?? id}
      <ArrowUpRight className="w-3 h-3 shrink-0" />
    </button>
  );
}

/**
 * Una fila de enlaces bajo un rótulo: «Embarques: VLIM-26-001 · VLIT-26-004».
 *
 * Cuando no hay nada que enlazar dice por qué, en vez de desaparecer: un hueco
 * no distingue «todavía no existe» de «no cargó».
 */
export function BloqueEnlaces({
  titulo, tipo, ids, vacio,
}: {
  titulo: string;
  tipo: TipoEntidad;
  ids: string[];
  vacio: string;
}) {
  return (
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider shrink-0">
        {titulo}
      </span>
      {ids.length === 0 ? (
        <span className="text-[11px] text-gray-400">{vacio}</span>
      ) : (
        ids.map(id => <EnlaceEntidad key={id} tipo={tipo} id={id} />)
      )}
    </div>
  );
}
