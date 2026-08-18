/**
 * TarifaPanel.tsx (FC-2)
 *
 * Panel lateral persistente que muestra tarifas del catálogo
 * filtradas por el concepto activo. Reemplaza TarifaSuggestions
 * inline en la vista de escritorio.
 */

import React, { useState, useMemo } from 'react';
import { BookOpen, Search, AlertTriangle, Check, GripVertical } from 'lucide-react';
import type { TarifaVermur } from './TarifasData';
import { buscarTarifasVigentes } from './TarifasData';
import {
  normalize, fmtPrecio, etiquetaContenedor,
  matchConceptByName, buildTarifaRuta, groupManobrasByTerminal,
} from './tarifaMatching';
import { useConceptos } from '../../hooks/useConceptos';
import { useProveedores } from '../../hooks/useProveedores';
import { usePuertos } from '../../hooks/usePuertos';
import { contactoPrincipal } from '../proveedores/ProveedoresData';
import CapturaManualConcepto from './CapturaManualConcepto';
import type { CotizacionProveedor } from '../quotes/QuotesData';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

// ─── FC-3: Draggable tariff card ────────────────────────────────────────────

interface DraggableTarifaCardProps {
  tarifa: TarifaVermur;
  provNombre: string;
  contactoNombre: string;
  ruta: string | null;
  isMaxTerminal: boolean;
  terminalName: string | null;
  yaUsada: boolean;
  onUsar: () => void;
}

function DraggableTarifaCard({
  tarifa, provNombre, contactoNombre, ruta, isMaxTerminal, terminalName, yaUsada, onUsar,
}: DraggableTarifaCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `tarifa-drag-${tarifa.id}`,
    data: { type: 'tarifa', tarifa, provNombre, contactoNombre },
    disabled: yaUsada,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border p-2.5 text-[10px] transition-colors ${
        isDragging ? 'opacity-40 z-10' : ''
      } ${
        yaUsada
          ? 'bg-green-50/40 border-green-200/50'
          : isMaxTerminal
          ? 'bg-amber-50/60 border-amber-300/50'
          : 'bg-white border-gray-150 hover:border-indigo-200'
      }`}
    >
      <div className="flex items-start gap-1.5">
        {/* Drag handle — hidden on mobile, disabled for applied tarifas */}
        {!yaUsada && (
          <div
            {...listeners}
            {...attributes}
            className="hidden md:flex items-center pt-0.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 shrink-0 touch-none"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Proveedor + ruta */}
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-gray-800 truncate max-w-[140px]">
                {provNombre}
              </span>
              {terminalName && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-500 font-medium truncate max-w-[100px]">
                  {terminalName}
                </span>
              )}
              {isMaxTerminal && (
                <span className="text-[8px] px-1 py-0.5 rounded bg-amber-200/60 text-amber-800 font-black uppercase">
                  Más caro
                </span>
              )}
            </div>
            {ruta && (
              <p className="text-gray-400 font-medium truncate">{ruta}</p>
            )}
          </div>

          {/* Precio + metadata */}
          <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-100">
            <div className="flex items-center gap-2 text-[9px] text-gray-400 min-w-0 flex-1">
              <span className="truncate">{tarifa.vigenciaTexto}</span>
              {tarifa.tiempoTransitoDias != null && <span className="shrink-0">TT: {tarifa.tiempoTransitoDias}d</span>}
              {tarifa.freeTimeDias != null && <span className="shrink-0">FT: {tarifa.freeTimeDias}d</span>}
            </div>
            <span className="font-black text-indigo-800 tabular-nums whitespace-nowrap ml-2">
              {fmtPrecio(tarifa)}
            </span>
          </div>

          {/* Botón Usar */}
          <div className="flex justify-end mt-1.5">
            {yaUsada ? (
              <span className="flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-bold whitespace-nowrap">
                <Check className="w-2.5 h-2.5" />
                Aplicada
              </span>
            ) : (
              <button
                type="button"
                onClick={onUsar}
                className="text-[9px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1 rounded transition-colors whitespace-nowrap"
              >
                Usar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface TarifaPanelProps {
  /** Nombre del concepto activo. null = ningún concepto seleccionado. */
  conceptoNombre: string | null;
  /** Tipo de contenedor del servicio (para resolución de monto). */
  contenedorTipo?: string;
  /** Tarifas del catálogo completo (de useTarifas). */
  catalogoTarifas: TarifaVermur[];
  /** IDs de tarifas ya aplicadas al concepto activo. */
  tarifasYaUsadas: string[];
  /** Callback para aplicar una tarifa al concepto activo. */
  onUsarTarifa: (tarifa: TarifaVermur, provNombre: string, contacto: string) => void;
  /** Callback para captura manual. */
  onCaptura: (cp: CotizacionProveedor) => void;
  /** Callback para crear tarifa spot en catálogo. */
  onCrearTarifaSpot?: (t: TarifaVermur) => Promise<void>;
}

export default function TarifaPanel({
  conceptoNombre,
  contenedorTipo,
  catalogoTarifas,
  tarifasYaUsadas,
  onUsarTarifa,
  onCaptura,
  onCrearTarifaSpot,
}: TarifaPanelProps) {
  const { conceptos } = useConceptos();
  const { proveedores } = useProveedores();
  const { puertos } = usePuertos();
  const [provSearch, setProvSearch] = useState('');

  // ── Match concept name → catálogo ─────────────────────────────────────────
  const matchedConcept = useMemo(() => {
    if (!conceptoNombre) return null;
    return matchConceptByName(conceptoNombre, conceptos);
  }, [conceptoNombre, conceptos]);

  // ── Tarifas vigentes ──────────────────────────────────────────────────────
  const vigentes = useMemo(() => {
    if (!matchedConcept) return [];
    return buscarTarifasVigentes(catalogoTarifas, { conceptoId: matchedConcept.id });
  }, [matchedConcept, catalogoTarifas]);

  // ── Lookup maps ───────────────────────────────────────────────────────────
  const provMap = useMemo(() => {
    const m = new Map<string, string>();
    proveedores.forEach(p => m.set(p.id, p.nombre));
    return m;
  }, [proveedores]);

  const puertoMap = useMemo(() => {
    const m = new Map<string, string>();
    puertos.forEach(p => m.set(p.id, p.codigo));
    return m;
  }, [puertos]);

  // ── Filtro por proveedor ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!provSearch.trim()) return vigentes;
    const q = normalize(provSearch);
    return vigentes.filter(t => {
      const provName = provMap.get(t.proveedorId) ?? t.proveedorId;
      return normalize(provName).includes(q);
    });
  }, [vigentes, provSearch, provMap]);

  // ── Maniobras ─────────────────────────────────────────────────────────────
  const esManiobra = matchedConcept?.categoria === 'maniobras';
  const terminalInfo = useMemo(() => {
    if (!esManiobra) return null;
    return groupManobrasByTerminal(filtered);
  }, [esManiobra, filtered]);

  const getTerminalName = (terminalId: string): string => {
    if (terminalId === '_sin_terminal') return 'Sin terminal';
    for (const p of puertos) {
      const t = (p as any).terminales?.find((t: any) => t.id === terminalId);
      if (t) return t.nombre;
    }
    return terminalId;
  };

  // ── "Usar" handler ────────────────────────────────────────────────────────
  const handleUsar = (t: TarifaVermur) => {
    const prov = proveedores.find(p => p.id === t.proveedorId);
    const contacto = prov ? contactoPrincipal(prov) : undefined;
    onUsarTarifa(t, prov?.nombre ?? t.proveedorId, contacto?.nombre ?? '');
  };

  // Reset search when concept changes
  React.useEffect(() => { setProvSearch(''); }, [conceptoNombre]);

  // ── Sin concepto seleccionado ─────────────────────────────────────────────
  if (!conceptoNombre) {
    return (
      <div className="h-full bg-gray-50/30 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" /> Catálogo de Tarifas
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center px-6">
          <p className="text-xs text-gray-400 text-center leading-relaxed">
            Selecciona un concepto en el panel izquierdo para ver las tarifas disponibles.
          </p>
        </div>
      </div>
    );
  }

  // ── Panel con concepto activo ─────────────────────────────────────────────
  return (
    <div className="h-full bg-gray-50/30 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 space-y-2 shrink-0">
        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" /> Catálogo de Tarifas
        </h3>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] font-bold text-indigo-700 uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100/60 border border-indigo-200/40">
            {matchedConcept?.nombre ?? conceptoNombre}
          </span>
          <span className="text-[9px] text-gray-400">
            {vigentes.length} tarifa{vigentes.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Buscador por proveedor */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-300" />
          <input
            type="text"
            value={provSearch}
            onChange={e => setProvSearch(e.target.value)}
            placeholder="Buscar proveedor..."
            className="w-full pl-7 pr-2.5 py-1.5 border border-gray-200 rounded-lg text-[11px] outline-none focus:border-indigo-400 bg-white"
          />
        </div>
      </div>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {/* Maniobras warning */}
        {esManiobra && terminalInfo && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-amber-50 border border-amber-200/60 text-[9px] font-semibold text-amber-700">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            Maniobras: usar el costo más caro por terminal
          </div>
        )}

        {/* Sin tarifario */}
        {vigentes.length === 0 && matchedConcept && (
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-gray-50 border border-gray-150 text-[10px] text-gray-400">
            <BookOpen className="w-3 h-3" />
            <span>Sin tarifario para &quot;{matchedConcept.nombre}&quot; — usa captura manual</span>
          </div>
        )}

        {/* Sin resultados por filtro */}
        {vigentes.length > 0 && filtered.length === 0 && (
          <p className="text-[10px] text-gray-400 italic py-2">
            Sin resultados para &quot;{provSearch}&quot;
          </p>
        )}

        {/* Tarjetas de tarifas (draggable FC-3) */}
        {filtered.map(t => {
          const ruta = buildTarifaRuta(t, puertoMap);
          const isMaxTerminal = !!(esManiobra && terminalInfo && t.terminalId === terminalInfo.maxTerminalId);
          const yaUsada = tarifasYaUsadas.includes(t.id);
          const prov = proveedores.find(p => p.id === t.proveedorId);
          const provNombre = provMap.get(t.proveedorId) ?? t.proveedorId;
          const contacto = prov ? contactoPrincipal(prov) : undefined;

          return (
            <DraggableTarifaCard
              key={t.id}
              tarifa={t}
              provNombre={provNombre}
              contactoNombre={contacto?.nombre ?? ''}
              ruta={ruta}
              isMaxTerminal={isMaxTerminal}
              terminalName={t.terminalId ? getTerminalName(t.terminalId) : null}
              yaUsada={yaUsada}
              onUsar={() => handleUsar(t)}
            />
          );
        })}

        {/* Nota de resolución por contenedor */}
        {contenedorTipo && vigentes.some(v => v.precios.unidad === 'CONTENEDOR') && (
          <p className="text-[8px] text-indigo-400 mt-1">
            Contenedor: <strong>{contenedorTipo}</strong> — al usar, se aplica el precio de {etiquetaContenedor(contenedorTipo)}.
          </p>
        )}
      </div>

      {/* Captura manual al fondo */}
      <div className="px-4 py-3 border-t border-gray-100 bg-white shrink-0">
        <CapturaManualConcepto
          conceptoNombre={conceptoNombre}
          onGuardar={onCaptura}
          onCrearSpot={onCrearTarifaSpot}
        />
      </div>
    </div>
  );
}
