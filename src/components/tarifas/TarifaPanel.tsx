/**
 * TarifaPanel.tsx (FC-2)
 *
 * Panel lateral persistente que muestra tarifas del catálogo
 * filtradas por el concepto activo. Reemplaza TarifaSuggestions
 * inline en la vista de escritorio.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { BookOpen, Search, AlertTriangle, Check, GripVertical } from 'lucide-react';
import type { TarifaVermur } from './TarifasData';
import { buscarTarifasVigentes } from './TarifasData';
import {
  normalize, fmtPrecio, etiquetaContenedor, resolverMonto,
  matchConcept, buildConceptoMap, buildTarifaRuta, groupManobrasByTerminal,
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
  /** SP-1: tarjeta marcada para simulación de costo. */
  simulada: boolean;
  /** SP-1: toggle simulación al clicar el cuerpo de la tarjeta. */
  onToggleSimulacion: () => void;
}

function DraggableTarifaCard({
  tarifa, provNombre, contactoNombre, ruta, isMaxTerminal, terminalName, yaUsada, onUsar,
  simulada, onToggleSimulacion,
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
      onClick={() => { if (!yaUsada) onToggleSimulacion(); }}
      className={`rounded-lg border p-2.5 text-[10px] transition-colors ${
        isDragging ? 'opacity-40 z-10' : ''
      } ${
        yaUsada
          ? 'bg-green-50/40 border-green-200/50'
          : simulada
          ? 'bg-[#E11D48]/5 border-[#E11D48]/60 border-dashed ring-1 ring-[#E11D48]/30 cursor-pointer'
          : isMaxTerminal
          ? 'bg-amber-50/60 border-amber-300/50 cursor-pointer'
          : 'bg-white border-gray-150 hover:border-[#E11D48]/30 cursor-pointer'
      }`}
    >
      <div className="flex items-start gap-1.5">
        {/* Drag handle — hidden on mobile, disabled for applied tarifas */}
        {!yaUsada && (
          <div
            {...listeners}
            {...attributes}
            onClick={e => e.stopPropagation()}
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
            <span className="font-black text-[#9F1239] tabular-nums whitespace-nowrap ml-2">
              {fmtPrecio(tarifa)}
            </span>
          </div>

          {/* Botón Usar + badge simulación */}
          <div className="flex items-center justify-end gap-1.5 mt-1.5">
            {simulada && !yaUsada && (
              <span className="text-[8px] font-bold text-[#E11D48] px-1.5 py-0.5 rounded border border-dashed border-[#E11D48]/30 bg-[#E11D48]/5 whitespace-nowrap">
                Simulando
              </span>
            )}
            {yaUsada ? (
              <span className="flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-bold whitespace-nowrap">
                <Check className="w-2.5 h-2.5" />
                Aplicada
              </span>
            ) : (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onUsar(); }}
                className="text-[9px] font-bold text-white bg-[#E11D48] hover:bg-[#BE123C] px-3 py-1 rounded transition-colors whitespace-nowrap"
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

/** SP-2: Costo agrupado por moneda. */
export interface CostoByMoneda { USD: number; MXN: number; }

// ─── SP-2: Footer de simulación de costo ────────────────────────────────────

const fmtMonto = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

function SimuladorFooter({
  costoBase, costoConceptoActual, costoSimulado, haySimulacion,
  simuladasCount, onAplicar, onLimpiar,
}: {
  costoBase: CostoByMoneda;
  costoConceptoActual: CostoByMoneda;
  costoSimulado: CostoByMoneda;
  haySimulacion: boolean;
  simuladasCount: number;
  onAplicar: () => void;
  onLimpiar: () => void;
}) {
  const monedas = (['USD', 'MXN'] as const).filter(m =>
    costoBase[m] > 0 || costoConceptoActual[m] > 0 || costoSimulado[m] > 0
  );
  if (monedas.length === 0) return null;

  return (
    <div className="px-4 py-2.5 border-t border-gray-200 bg-gray-50/80 shrink-0 space-y-1.5">
      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
        {haySimulacion ? 'Simulación de costo' : 'Costo cotización'}
      </p>

      {monedas.map(m => {
        const actual = costoBase[m] + costoConceptoActual[m];
        const simulado = costoBase[m] + costoSimulado[m];
        const delta = simulado - actual;

        if (!haySimulacion) {
          return (
            <div key={m} className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-gray-700 tabular-nums">
                {fmtMonto(actual)} {m}
              </span>
            </div>
          );
        }

        return (
          <div key={m} className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-gray-500 tabular-nums">
              {fmtMonto(actual)}
            </span>
            <span className="text-[9px] text-gray-300">&rarr;</span>
            <span className="text-[10px] font-bold text-[#BE123C] tabular-nums">
              {fmtMonto(simulado)} {m}
            </span>
            {delta !== 0 && (
              <span className={`text-[9px] font-bold tabular-nums ${
                delta > 0 ? 'text-red-500' : 'text-green-600'
              }`}>
                ({delta > 0 ? '+' : ''}{fmtMonto(delta)})
              </span>
            )}
          </div>
        );
      })}

      {/* SP-3: Botones de acción */}
      {haySimulacion && (
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onAplicar}
            className="text-[9px] font-bold text-white bg-[#E11D48] hover:bg-[#BE123C] px-3 py-1 rounded transition-colors"
          >
            Aplicar {simuladasCount > 1 ? `${simuladasCount} tarifas` : 'tarifa'}
          </button>
          <button
            type="button"
            onClick={onLimpiar}
            className="text-[9px] font-bold text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 hover:border-gray-300 transition-colors"
          >
            Limpiar
          </button>
        </div>
      )}
    </div>
  );
}

interface TarifaPanelProps {
  /** Nombre del concepto activo. null = ningún concepto seleccionado. */
  conceptoNombre: string | null;
  /**
   * A todo lo ancho, debajo de la comparativa (4-sep-2026). Las tarjetas se
   * acomodan en rejilla en vez de pila, y el alto lo dicta el contenido en
   * lugar de estirarse al del contenedor. Todo lo demás —filtros, vigencia,
   * maniobras, simulador, captura— es idéntico en ambas orientaciones.
   */
  horizontal?: boolean;
  /** FK al catálogo conceptos/. undefined = concepto legacy. */
  conceptoId?: string;
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
  /** SP-2: Costo de la cotización por moneda (todos los conceptos excepto el activo + subs del activo). */
  costoBaseByMoneda?: CostoByMoneda;
  /** SP-2: Costo actual del concepto activo por moneda (tarifas oficiales, lo que la simulación reemplaza). */
  costoConceptoActualByMoneda?: CostoByMoneda;
  /** SP-3: Aplicar múltiples tarifas simuladas al concepto activo. */
  onAplicarSimulacion?: (tarifas: TarifaVermur[]) => void;
}

export default function TarifaPanel({
  conceptoNombre,
  horizontal = false,
  conceptoId,
  contenedorTipo,
  catalogoTarifas,
  tarifasYaUsadas,
  onUsarTarifa,
  onCaptura,
  onCrearTarifaSpot,
  costoBaseByMoneda,
  costoConceptoActualByMoneda,
  onAplicarSimulacion,
}: TarifaPanelProps) {
  const { conceptos } = useConceptos();
  const { proveedores } = useProveedores();
  const { puertos } = usePuertos();
  const [provSearch, setProvSearch] = useState('');

  // ── SP-1: IDs de tarifas marcadas para simulación de costo ──────────────
  const [simulatedIds, setSimulatedIds] = useState<Set<string>>(new Set());

  const toggleSimulacion = useCallback((tarifaId: string) => {
    setSimulatedIds(prev => {
      const next = new Set(prev);
      if (next.has(tarifaId)) next.delete(tarifaId);
      else next.add(tarifaId);
      return next;
    });
  }, []);

  // ── Map para búsqueda O(1) por conceptoId ───────────────────────────────
  const conceptoMap = useMemo(() => buildConceptoMap(conceptos), [conceptos]);

  // ── Match concept: ID primero, fallback a nombre ────────────────────────
  const { match: matchedConcept, method: matchMethod } = useMemo(() => {
    if (!conceptoNombre && !conceptoId) return { match: null, method: null as null };
    return matchConcept(conceptoId, conceptoNombre ?? '', conceptos, conceptoMap);
  }, [conceptoId, conceptoNombre, conceptos, conceptoMap]);

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

  // ── SP-2: Costo simulado por moneda ──────────────────────────────────────
  const costoSimuladoByMoneda = useMemo((): CostoByMoneda => {
    const r: CostoByMoneda = { USD: 0, MXN: 0 };
    for (const t of vigentes) {
      if (simulatedIds.has(t.id)) {
        r[t.moneda] += resolverMonto(t, contenedorTipo);
      }
    }
    return r;
  }, [vigentes, simulatedIds, contenedorTipo]);

  // ── "Usar" handler ────────────────────────────────────────────────────────
  const handleUsar = (t: TarifaVermur) => {
    const prov = proveedores.find(p => p.id === t.proveedorId);
    const contacto = prov ? contactoPrincipal(prov) : undefined;
    onUsarTarifa(t, prov?.nombre ?? t.proveedorId, contacto?.nombre ?? '');
  };

  // Reset search and simulation when concept changes
  React.useEffect(() => { setProvSearch(''); setSimulatedIds(new Set()); }, [conceptoNombre, conceptoId]);

  // ── Sin concepto seleccionado ─────────────────────────────────────────────
  if (!conceptoNombre) {
    return (
      <div className={`${horizontal ? '' : 'h-full'} bg-gray-50/30 flex flex-col`}>
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className={`text-[10px] font-bold text-gray-400 uppercase tracking-widest items-center gap-1.5 ${horizontal ? 'hidden' : 'flex'}`}>
            <BookOpen className="w-3.5 h-3.5" /> Catálogo de Tarifas
          </h3>
        </div>
        <div className={`flex-1 flex items-center justify-center px-6 ${horizontal ? 'py-6' : ''}`}>
          <p className="text-xs text-gray-400 text-center leading-relaxed">
            Haz clic en un renglón de la tabla para ver sus tarifas.
            También puedes arrastrar una tarifa hasta el renglón.
          </p>
        </div>
      </div>
    );
  }

  // ── Panel con concepto activo ─────────────────────────────────────────────
  return (
    <div className={`${horizontal ? '' : 'h-full'} bg-gray-50/30 flex flex-col`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 space-y-2 shrink-0">
        <h3 className={`text-[10px] font-bold text-gray-400 uppercase tracking-widest items-center gap-1.5 ${horizontal ? 'hidden' : 'flex'}`}>
          <BookOpen className="w-3.5 h-3.5" /> Catálogo de Tarifas
        </h3>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] font-bold text-[#BE123C] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#E11D48]/10 border border-[#E11D48]/30">
            {matchedConcept?.nombre ?? conceptoNombre}
          </span>
          <span className="text-[9px] text-gray-400">
            {vigentes.length} tarifa{vigentes.length !== 1 ? 's' : ''}
          </span>
          {simulatedIds.size > 0 && (
            <span className="text-[9px] font-bold text-[#E11D48] px-1.5 py-0.5 rounded border border-dashed border-[#E11D48]/30 bg-[#E11D48]/5">
              {simulatedIds.size} simulando
            </span>
          )}
        </div>

        {/* Buscador por proveedor */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-300" />
          <input
            type="text"
            value={provSearch}
            onChange={e => setProvSearch(e.target.value)}
            placeholder="Buscar proveedor..."
            className="w-full pl-7 pr-2.5 py-1.5 border border-gray-200 rounded-lg text-[11px] outline-none focus:border-[#E11D48]/60 bg-white"
          />
        </div>
      </div>

      {/* Contenido scrollable */}
      <div className={horizontal
        ? 'px-4 py-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3 max-h-[420px] overflow-y-auto content-start'
        : 'flex-1 overflow-y-auto px-4 py-3 space-y-2'}>
        {/* Maniobras warning */}
        {esManiobra && terminalInfo && (
          <div className="col-span-full flex items-center gap-1.5 px-2 py-1.5 rounded bg-amber-50 border border-amber-200/60 text-[9px] font-semibold text-amber-700">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            Maniobras: usar el costo más caro por terminal
          </div>
        )}

        {/* Concepto no encontrado en el catálogo */}
        {!matchedConcept && conceptoNombre && (
          <div className="col-span-full flex items-start gap-2 px-2.5 py-2 rounded-md bg-amber-50 border border-amber-200/60 text-[10px] text-amber-700">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
            <span>
              <strong>&quot;{conceptoNombre}&quot;</strong> no está en el catálogo de conceptos.
              Selecciona uno del catálogo para ver tarifas, o usa captura manual.
            </span>
          </div>
        )}

        {/* Concepto encontrado pero sin tarifas vigentes */}
        {vigentes.length === 0 && matchedConcept && (
          <div className="col-span-full flex items-start gap-2 px-2.5 py-2 rounded-md bg-gray-50 border border-gray-150 text-[10px] text-gray-400">
            <BookOpen className="w-3 h-3 shrink-0 mt-0.5" />
            <span>
              Sin tarifas vigentes para <strong>&quot;{matchedConcept.nombre}&quot;</strong> — usa captura manual o crea una tarifa spot.
            </span>
          </div>
        )}

        {/* Sin resultados por filtro */}
        {vigentes.length > 0 && filtered.length === 0 && (
          <p className="col-span-full text-[10px] text-gray-400 italic py-2">
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
              simulada={simulatedIds.has(t.id)}
              onToggleSimulacion={() => toggleSimulacion(t.id)}
            />
          );
        })}

        {/* Nota de resolución por contenedor */}
        {contenedorTipo && vigentes.some(v => v.precios.unidad === 'CONTENEDOR') && (
          <p className="col-span-full text-[8px] text-[#E11D48]/60 mt-1">
            Contenedor: <strong>{contenedorTipo}</strong> — al usar, se aplica el precio de {etiquetaContenedor(contenedorTipo)}.
          </p>
        )}
      </div>

      {/* SP-2: Simulador de costo — siempre visible cuando hay concepto activo */}
      {costoBaseByMoneda && costoConceptoActualByMoneda && (
        <SimuladorFooter
          costoBase={costoBaseByMoneda}
          costoConceptoActual={costoConceptoActualByMoneda}
          costoSimulado={costoSimuladoByMoneda}
          haySimulacion={simulatedIds.size > 0}
          simuladasCount={simulatedIds.size}
          onAplicar={() => {
            const tarifasParaAplicar = vigentes.filter(t => simulatedIds.has(t.id));
            if (tarifasParaAplicar.length === 0) return;
            // Confirmación si son varias
            if (tarifasParaAplicar.length > 1) {
              const ok = window.confirm(
                `¿Aplicar ${tarifasParaAplicar.length} tarifas al concepto?\n\nNinguna se marcará como oficial automáticamente — asígnalas en la comparativa.`
              );
              if (!ok) return;
            }
            onAplicarSimulacion?.(tarifasParaAplicar);
            setSimulatedIds(new Set());
          }}
          onLimpiar={() => setSimulatedIds(new Set())}
        />
      )}

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
