import React, { useMemo, useState } from 'react';
import { Search, X, Check, Ship, Plane, Truck, FileCheck, Package } from 'lucide-react';
import type { Servicio } from '../../config/serviciosStore';

/**
 * Selector de servicios de la cotización.
 *
 * ── Por qué dejó de ser una cuadrícula de iconos ───────────────────────────
 * Sesión 30-ago-2026: al equipo no le funcionaba. Es el mismo criterio del
 * ConceptoSelector — con pocas opciones un icono orienta, con muchas obliga a
 * interpretarlo. Aquí el nombre manda y el icono acompaña.
 *
 * Agrupado por modalidad porque es como Pricing lee un requerimiento: primero
 * el modo de transporte, después los cargos que cuelgan de él.
 */

interface Props {
  servicios: Servicio[];
  seleccionados: string[];
  onToggle: (id: string) => void;
}

type GrupoId = 'maritimo' | 'aereo' | 'terrestre' | 'aduanal' | 'otros';

const GRUPOS: { id: GrupoId; label: string; icono: React.ReactNode }[] = [
  { id: 'maritimo',  label: 'Marítimo',         icono: <Ship className="w-3.5 h-3.5" /> },
  { id: 'aereo',     label: 'Aéreo',            icono: <Plane className="w-3.5 h-3.5" /> },
  { id: 'terrestre', label: 'Terrestre',        icono: <Truck className="w-3.5 h-3.5" /> },
  { id: 'aduanal',   label: 'Despacho aduanal', icono: <FileCheck className="w-3.5 h-3.5" /> },
  { id: 'otros',     label: 'Otros',            icono: <Package className="w-3.5 h-3.5" /> },
];

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Modalidad declarada en el catálogo; lo aduanal por categoría; el resto, otros. */
function grupoDe(srv: Servicio): GrupoId {
  if (srv.modalidad) return srv.modalidad;
  if (srv.categoria === 'aduana') return 'aduanal';
  return 'otros';
}

export default function SelectorServicios({ servicios, seleccionados, onToggle }: Props) {
  const [busqueda, setBusqueda] = useState('');

  const grupos = useMemo(() => {
    const q = norm(busqueda);
    const filtrados = servicios.filter(s => {
      if (!s.activo) return false;
      if (!q) return true;
      const grupo = GRUPOS.find(g => g.id === grupoDe(s))?.label ?? '';
      return norm(s.nombre).includes(q)
        || norm(grupo).includes(q)
        || norm(s.descripcion ?? '').includes(q);
    });

    return GRUPOS
      .map(g => ({ ...g, items: filtrados.filter(s => grupoDe(s) === g.id) }))
      .filter(g => g.items.length > 0);
  }, [servicios, busqueda]);

  const nombresSeleccionados = servicios
    .filter(s => seleccionados.includes(s.id))
    .map(s => s.nombre);

  const totalFiltrado = grupos.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* Buscador */}
      <div className="relative border-b border-gray-100">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar servicio o modalidad…"
          className="w-full pl-9 pr-8 py-2.5 text-xs text-gray-700 outline-none"
        />
        {busqueda && (
          <button
            type="button"
            onClick={() => setBusqueda('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="Limpiar búsqueda"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Lista agrupada */}
      <div className="max-h-[260px] overflow-y-auto">
        {totalFiltrado === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-gray-400">
            Ningún servicio coincide con «{busqueda}».
          </p>
        ) : (
          grupos.map(g => (
            <div key={g.id}>
              <div className="sticky top-0 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border-y border-gray-100 text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                <span className="text-gray-400">{g.icono}</span>
                {g.label}
              </div>
              {g.items.map(srv => {
                const activo = seleccionados.includes(srv.id);
                return (
                  <button
                    key={srv.id}
                    type="button"
                    onClick={() => onToggle(srv.id)}
                    className={`w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors ${
                      activo ? 'bg-primario/5' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className={`mt-[1px] w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      activo ? 'bg-primario border-primario' : 'border-gray-300 bg-white'
                    }`}>
                      {activo && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-[12px] leading-tight ${
                        activo ? 'font-semibold text-[#18181B]' : 'text-gray-700'
                      }`}>
                        {srv.nombre}
                      </span>
                      {srv.descripcion && (
                        <span className="block text-[10px] text-gray-400 leading-tight mt-0.5">
                          {srv.descripcion}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Lo seleccionado, a la vista y sin interpretar iconos */}
      <div className="border-t border-gray-100 px-3 py-2 bg-gray-50/60">
        {nombresSeleccionados.length === 0 ? (
          <p className="text-[11px] text-gray-400">Ningún servicio seleccionado.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              {nombresSeleccionados.length} seleccionado{nombresSeleccionados.length !== 1 ? 's' : ''}:
            </span>
            {nombresSeleccionados.map(n => (
              <span key={n} className="text-[10px] font-semibold text-primario bg-primario/10 px-1.5 py-0.5 rounded">
                {n}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
