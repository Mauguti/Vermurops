/**
 * VistaSelector.tsx (TV-5)
 *
 * Selector de vistas guardadas para la tabla tipo spreadsheet.
 * - Dropdown para elegir vista guardada o "Vista por defecto"
 * - Guardar vista actual (nombre + columnas + ordenamiento)
 * - Marcar como default
 * - Compartir / dejar de compartir
 * - Eliminar (solo el creador)
 * - Muestra quién creó cada vista compartida
 */

import React, { useCallback, useState } from 'react';
import {
  ChevronDown, Star, StarOff, Share2, Trash2, Save, Plus, User,
} from 'lucide-react';
import type { VistaUsuario } from './VistasData';
import type { VistaConfig } from './SpreadsheetTable';

// ─── Props ──────────────────────────────────────────────────────────────────

interface VistaSelectorProps {
  /** Vistas disponibles (propias + compartidas). */
  vistas: VistaUsuario[];
  /** ID de la vista actualmente seleccionada. null = vista por defecto del módulo. */
  vistaActivaId: string | null;
  /** UID del usuario actual. */
  currentUserId: string;
  /** Vista actual en la tabla (para guardar). */
  vistaActual: VistaConfig;
  /** Nombre default de la vista del módulo (ej. "Cotizaciones"). */
  labelDefault?: string;
  /** Callbacks. */
  onSeleccionar: (vistaId: string | null) => void;
  onGuardar: (nombre: string) => void;
  onActualizar: (id: string, cambios: Partial<Pick<VistaUsuario, 'nombre' | 'columnas' | 'ordenamiento' | 'compartida' | 'esDefault'>>) => void;
  onEliminar: (id: string) => void;
}

// ─── Componente ─────────────────────────────────────────────────────────────

export default function VistaSelector({
  vistas,
  vistaActivaId,
  currentUserId,
  vistaActual,
  labelDefault = 'Vista por defecto',
  onSeleccionar,
  onGuardar,
  onActualizar,
  onEliminar,
}: VistaSelectorProps) {
  const [open, setOpen] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveNombre, setSaveNombre] = useState('');

  const vistaActiva = vistas.find(v => v.id === vistaActivaId);
  const esMia = vistaActiva ? vistaActiva.usuarioId === currentUserId : false;

  const handleGuardar = useCallback(() => {
    const nombre = saveNombre.trim();
    if (!nombre) return;
    onGuardar(nombre);
    setSaveNombre('');
    setShowSaveInput(false);
  }, [saveNombre, onGuardar]);

  const handleSobreescribir = useCallback(() => {
    if (!vistaActiva || !esMia) return;
    onActualizar(vistaActiva.id, {
      columnas: vistaActual.columnas,
      ordenamiento: vistaActual.ordenamiento,
    });
  }, [vistaActiva, esMia, vistaActual, onActualizar]);

  return (
    <div className="relative flex items-center gap-1.5">
      {/* Dropdown trigger */}
      <button
        onClick={() => { setOpen(!open); setShowSaveInput(false); }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <span className="truncate max-w-[160px]">
          {vistaActiva ? vistaActiva.nombre : labelDefault}
        </span>
        <ChevronDown className="w-3 h-3 shrink-0 text-gray-400" />
      </button>

      {/* Guardar como nueva */}
      {!showSaveInput && (
        <button
          onClick={() => { setShowSaveInput(true); setOpen(false); }}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          title="Guardar vista actual"
        >
          <Save className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Sobreescribir vista activa (solo si es mía) */}
      {vistaActiva && esMia && (
        <button
          onClick={handleSobreescribir}
          className="p-1.5 text-gray-400 hover:text-[#E11D48] hover:bg-[#E11D48]/5 rounded transition-colors"
          title="Sobreescribir vista actual"
        >
          <Save className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Input para guardar nueva vista */}
      {showSaveInput && (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={saveNombre}
            onChange={e => setSaveNombre(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleGuardar(); if (e.key === 'Escape') setShowSaveInput(false); }}
            placeholder="Nombre de la vista..."
            className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#E11D48] w-36"
          />
          <button
            onClick={handleGuardar}
            disabled={!saveNombre.trim()}
            className="px-2 py-1 text-xs font-medium text-white bg-[#E11D48] rounded hover:bg-[#E11D48] disabled:opacity-40 transition-colors"
          >
            Guardar
          </button>
          <button
            onClick={() => setShowSaveInput(false)}
            className="px-1.5 py-1 text-xs text-gray-400 hover:text-gray-600"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Dropdown menu */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute left-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 max-h-80 overflow-y-auto">
            {/* Vista por defecto del módulo */}
            <button
              onClick={() => { onSeleccionar(null); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 ${vistaActivaId === null ? 'bg-[#E11D48]/5 text-[#BE123C] font-medium' : 'text-gray-700'}`}
            >
              <span className="flex-1">{labelDefault}</span>
            </button>

            {vistas.length > 0 && (
              <div className="mx-2 my-1 border-t border-gray-100" />
            )}

            {/* Vistas guardadas */}
            {vistas.map(v => {
              const esCreador = v.usuarioId === currentUserId;
              const activa = v.id === vistaActivaId;

              return (
                <div
                  key={v.id}
                  className={`group flex items-center gap-1 px-3 py-2 text-xs hover:bg-gray-50 ${activa ? 'bg-[#E11D48]/5' : ''}`}
                >
                  {/* Nombre + autor */}
                  <button
                    onClick={() => { onSeleccionar(v.id); setOpen(false); }}
                    className={`flex-1 text-left truncate ${activa ? 'text-[#BE123C] font-medium' : 'text-gray-700'}`}
                  >
                    {v.nombre}
                    {!esCreador && v.compartida && (
                      <span className="ml-1.5 text-[10px] text-gray-400 font-normal">
                        <User className="w-2.5 h-2.5 inline -mt-0.5" /> {v.creadoPorNombre}
                      </span>
                    )}
                  </button>

                  {/* Actions (solo visible en hover, solo para el creador) */}
                  {esCreador && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Toggle default */}
                      <button
                        onClick={e => { e.stopPropagation(); onActualizar(v.id, { esDefault: !v.esDefault }); }}
                        className={`p-1 rounded ${v.esDefault ? 'text-amber-500' : 'text-gray-300 hover:text-amber-500'}`}
                        title={v.esDefault ? 'Quitar como predeterminada' : 'Marcar como predeterminada'}
                      >
                        {v.esDefault ? <Star className="w-3 h-3 fill-amber-500" /> : <StarOff className="w-3 h-3" />}
                      </button>

                      {/* Toggle compartir */}
                      <button
                        onClick={e => { e.stopPropagation(); onActualizar(v.id, { compartida: !v.compartida }); }}
                        className={`p-1 rounded ${v.compartida ? 'text-blue-500' : 'text-gray-300 hover:text-blue-500'}`}
                        title={v.compartida ? 'Dejar de compartir' : 'Compartir con el equipo'}
                      >
                        <Share2 className="w-3 h-3" />
                      </button>

                      {/* Eliminar */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (window.confirm(`¿Eliminar la vista "${v.nombre}"?`)) {
                            onEliminar(v.id);
                            if (activa) onSeleccionar(null);
                          }
                        }}
                        className="p-1 rounded text-gray-300 hover:text-red-500"
                        title="Eliminar vista"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Badges for non-creators */}
                  {!esCreador && (
                    <div className="flex items-center gap-1">
                      {v.esDefault && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                      <Share2 className="w-3 h-3 text-blue-400" />
                    </div>
                  )}
                </div>
              );
            })}

            {vistas.length === 0 && (
              <p className="px-3 py-3 text-[10px] text-gray-400 text-center">
                Aún no hay vistas guardadas
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
