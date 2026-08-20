/**
 * ConceptoSelector.tsx (CC-2)
 *
 * Dropdown con buscador para seleccionar un concepto del catálogo.
 * Agrupa por categoría, muestra badges impo/expo, y soporta alta rápida.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, Search, X, Plus } from 'lucide-react';
import type { ConceptoVermur, CategoriaConcepto } from './ConceptosData';

// ─── Etiquetas de categoría ──────────────────────────────────────────────────

const CATEGORIA_LABEL: Record<CategoriaConcepto, string> = {
  flete: 'Flete',
  maniobras: 'Maniobras',
  despacho: 'Despacho',
  almacenaje: 'Almacenaje',
  seguro: 'Seguro',
  demoras: 'Demoras',
  documentacion: 'Documentación',
  financiero: 'Financiero',
  transporte: 'Transporte',
  otros: 'Otros',
};

const CATEGORIA_ORDER: CategoriaConcepto[] = [
  'flete', 'maniobras', 'despacho', 'transporte', 'almacenaje',
  'seguro', 'demoras', 'documentacion', 'financiero', 'otros',
];

// ─── Normalización para búsqueda ─────────────────────────────────────────────

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// ─── Props ───────────────────────────────────────────────────────────────────

interface ConceptoSelectorProps {
  /** Concepto seleccionado actualmente (nombre para display). null = sin selección. */
  selectedNombre: string | null;
  /** Conceptos activos del catálogo. */
  conceptos: ConceptoVermur[];
  /** Callback al seleccionar un concepto. */
  onSelect: (conceptoId: string, nombre: string) => void;
  /** Callback para alta rápida. Si no se provee, no se muestra la opción. */
  onCrearNuevo?: () => void;
  /** true = solo muestra el nombre, no permite cambiar (rol ventas). */
  readOnly?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ConceptoSelector({
  selectedNombre,
  conceptos,
  onSelect,
  onCrearNuevo,
  readOnly,
}: ConceptoSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Cerrar con click fuera
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus buscador al abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0);
    } else {
      setSearch('');
    }
  }, [open]);

  // Filtrar y agrupar
  const grouped = useMemo(() => {
    const activos = conceptos.filter(c => c.activo);
    const q = norm(search);
    const filtered = q
      ? activos.filter(c =>
          norm(c.nombre).includes(q) ||
          norm(c.categoria).includes(q) ||
          norm(c.idSemantico).includes(q)
        )
      : activos;

    const groups = new Map<CategoriaConcepto, ConceptoVermur[]>();
    filtered.forEach(c => {
      const arr = groups.get(c.categoria) || [];
      arr.push(c);
      groups.set(c.categoria, arr);
    });

    // Ordenar por CATEGORIA_ORDER
    const sorted: { categoria: CategoriaConcepto; items: ConceptoVermur[] }[] = [];
    CATEGORIA_ORDER.forEach(cat => {
      const items = groups.get(cat);
      if (items?.length) sorted.push({ categoria: cat, items });
    });
    return sorted;
  }, [conceptos, search]);

  const totalFiltered = grouped.reduce((acc, g) => acc + g.items.length, 0);

  // ── Solo lectura ────────────────────────────────────────────────────────────
  if (readOnly) {
    return (
      <span className="text-xs font-bold text-[#18181B] px-1 py-0.5">
        {selectedNombre || 'Sin concepto'}
      </span>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Botón trigger */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={`flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-md border transition-colors max-w-[260px] ${
          selectedNombre
            ? 'text-[#18181B] bg-white border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/30'
            : 'text-gray-400 bg-gray-50 border-dashed border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
        }`}
      >
        <span className="truncate">
          {selectedNombre || 'Seleccionar concepto...'}
        </span>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-50 left-0 top-full mt-1 w-[340px] bg-white border border-gray-200 rounded-lg shadow-lg flex flex-col max-h-[400px] overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Buscador */}
          <div className="px-3 py-2 border-b border-gray-100 shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar concepto..."
                className="w-full pl-7 pr-7 py-1.5 border border-gray-200 rounded-md text-[11px] outline-none focus:border-indigo-400 bg-white"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Lista agrupada */}
          <div className="overflow-y-auto flex-1">
            {totalFiltered === 0 && (
              <p className="text-[10px] text-gray-400 italic px-3 py-4 text-center">
                Sin resultados para &quot;{search}&quot;
              </p>
            )}

            {grouped.map(({ categoria, items }) => (
              <div key={categoria}>
                {/* Header de categoría */}
                <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                    {CATEGORIA_LABEL[categoria]}
                  </span>
                  <span className="text-[9px] text-gray-300 ml-1.5">({items.length})</span>
                </div>

                {/* Items */}
                {items.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onSelect(c.id, c.nombre);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-indigo-50 transition-colors border-b border-gray-50 ${
                      selectedNombre === c.nombre ? 'bg-indigo-50/60' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-gray-800 truncate">
                          {c.nombre}
                        </span>
                      </div>
                    </div>

                    {/* Badges impo/expo */}
                    <div className="flex items-center gap-1 shrink-0">
                      {c.aplicaImpo && (
                        <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-blue-100 text-blue-700">
                          Impo
                        </span>
                      )}
                      {c.aplicaExpo && (
                        <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">
                          Expo
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Alta rápida */}
          {onCrearNuevo && (
            <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/50 shrink-0">
              <button
                type="button"
                onClick={() => { onCrearNuevo(); setOpen(false); }}
                className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Crear nuevo concepto...
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
