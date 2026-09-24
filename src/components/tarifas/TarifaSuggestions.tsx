/**
 * TarifaSuggestions.tsx (TA-4 + TA-5)
 *
 * Panel colapsable que muestra tarifas vigentes del catálogo para un concepto.
 * Se renderiza dentro de ConceptoSection en FichaCotizacion.
 *
 * TA-4: Lookup y visualización.
 * TA-5: Botón "Usar" que convierte TarifaVermur → CotizacionProveedor,
 *        detección de duplicados, resolución de monto por contenedor.
 */

import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, BookOpen, AlertTriangle, Check } from 'lucide-react';
import { TarifaVermur, buscarTarifasVigentes } from './TarifasData';
import { useConceptos } from '../../hooks/useConceptos';
import { useProveedores } from '../../hooks/useProveedores';
import { usePuertos } from '../../hooks/usePuertos';
import { contactoPrincipal } from '../proveedores/ProveedoresData';
import {
  normalize, resolverMonto, fmtPrecio, etiquetaContenedor,
  matchConcept, buildConceptoMap, buildTarifaRuta, groupManobrasByTerminal,
} from './tarifaMatching';

// ─── Re-exports for backward compat ─────────────────────────────────────────
export { normalize, resolverMonto } from './tarifaMatching';

// ─── Props ─────────────────────────────────────────────────────────────────

interface Props {
  conceptoNombre: string;
  /** FK al catálogo conceptos/. undefined = concepto legacy. */
  conceptoId?: string;
  rutaTexto: string;
  catalogoTarifas: TarifaVermur[];
  /** Callback para aplicar una tarifa como CotizacionProveedor. */
  onUsarTarifa?: (tarifa: TarifaVermur, provNombre: string, contacto: string) => void;
  /** IDs de tarifas ya aplicadas (concepto.tarifas[].tarifaOrigenId). */
  tarifasYaUsadas?: string[];
  /** Tipo de contenedor del servicio (para resolución de monto). */
  contenedorTipo?: string;
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function TarifaSuggestions({
  conceptoNombre, conceptoId, rutaTexto, catalogoTarifas,
  onUsarTarifa, tarifasYaUsadas = [], contenedorTipo,
}: Props) {
  const { conceptos } = useConceptos();
  const { proveedores } = useProveedores();
  const { puertos } = usePuertos();

  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // 0. Map para búsqueda O(1) por conceptoId
  const conceptoMap = useMemo(() => buildConceptoMap(conceptos), [conceptos]);

  // 1. Match concept: ID primero, fallback a nombre
  const matchedConcept = useMemo(
    () => matchConcept(conceptoId, conceptoNombre, conceptos, conceptoMap).match,
    [conceptoId, conceptoNombre, conceptos, conceptoMap],
  );

  // 2. Find vigente tariffs
  const vigentes = useMemo(() => {
    if (!matchedConcept) return [];
    return buscarTarifasVigentes(catalogoTarifas, { conceptoId: matchedConcept.id });
  }, [matchedConcept, catalogoTarifas]);

  // 3. Lookup maps
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

  // 4. Maniobras detection
  const esManiobra = matchedConcept?.categoria === 'maniobras';

  // 5. Terminal grouping for maniobras
  const terminalInfo = useMemo(() => {
    if (!esManiobra) return null;
    return groupManobrasByTerminal(vigentes);
  }, [esManiobra, vigentes]);

  const getTerminalName = (terminalId: string): string => {
    if (terminalId === '_sin_terminal') return 'Sin terminal';
    for (const p of puertos) {
      const t = p.terminales?.find(t => t.id === terminalId);
      if (t) return t.nombre;
    }
    return terminalId;
  };

  // 7. "Usar" handler
  const handleUsar = (t: TarifaVermur) => {
    if (!onUsarTarifa) return;
    const prov = proveedores.find(p => p.id === t.proveedorId);
    const contacto = prov ? contactoPrincipal(prov) : undefined;
    onUsarTarifa(t, prov?.nombre ?? t.proveedorId, contacto?.nombre ?? '');
  };

  // ── Don't render if no matched concept ──────────────────────────────────
  if (!matchedConcept) return null;

  const count = vigentes.length;
  const displayList = showAll ? vigentes : vigentes.slice(0, 3);

  // ── No tariffs ──────────────────────────────────────────────────────────
  if (count === 0) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-gray-50 border border-gray-150 text-[10px] text-gray-400">
        <BookOpen className="w-3 h-3" />
        <span>Sin tarifario para &quot;{matchedConcept.nombre}&quot; — captura manual</span>
      </div>
    );
  }

  // ── With tariffs: collapsible panel ─────────────────────────────────────
  return (
    <div className="rounded-md border border-primario/30 bg-primario/5 overflow-hidden">
      {/* Header (clickable) */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-left hover:bg-primario/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-3 h-3 text-primario" />
          <span className="text-[10px] font-bold text-primario-hover">
            {count} tarifa{count !== 1 ? 's' : ''} vigente{count !== 1 ? 's' : ''}
          </span>
          <span className="text-[9px] font-medium text-primario/60 uppercase tracking-wider px-1.5 py-0.5 rounded bg-primario/10 border border-primario/30">
            Catálogo
          </span>
        </div>
        {expanded
          ? <ChevronDown className="w-3 h-3 text-primario/60" />
          : <ChevronRight className="w-3 h-3 text-primario/60" />
        }
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-1.5">
          {/* Maniobras warning */}
          {esManiobra && terminalInfo && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 border border-amber-200/60 text-[9px] font-semibold text-amber-700">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              Maniobras: usar el costo más caro por terminal
            </div>
          )}

          {/* Tariff rows */}
          {displayList.map(t => {
            const ruta = buildTarifaRuta(t, puertoMap);
            const isMaxTerminal = esManiobra && terminalInfo && t.terminalId === terminalInfo.maxTerminalId;
            const yaUsada = tarifasYaUsadas.includes(t.id);

            return (
              <div
                key={t.id}
                className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded border text-[10px] transition-colors ${
                  yaUsada
                    ? 'bg-green-50/40 border-green-200/50'
                    : isMaxTerminal
                    ? 'bg-amber-50/60 border-amber-300/50'
                    : 'bg-white border-gray-150'
                }`}
              >
                {/* Left: provider + route + extras */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-gray-800 truncate max-w-[140px]">
                      {provMap.get(t.proveedorId) ?? t.proveedorId}
                    </span>
                    {ruta && (
                      <span className="text-gray-400 font-medium truncate max-w-[120px]">{ruta}</span>
                    )}
                    {t.terminalId && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-500 font-medium truncate max-w-[100px]">
                        {getTerminalName(t.terminalId)}
                      </span>
                    )}
                    {isMaxTerminal && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-amber-200/60 text-amber-800 font-black uppercase">
                        Más caro
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-gray-400">
                    <span>{t.vigenciaTexto}</span>
                    {t.tiempoTransitoDias != null && <span>TT: {t.tiempoTransitoDias}d</span>}
                    {t.freeTimeDias != null && <span>FT: {t.freeTimeDias}d</span>}
                  </div>
                </div>

                {/* Right: price + action */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-black text-primario-fuerte tabular-nums whitespace-nowrap">
                    {fmtPrecio(t)}
                  </span>
                  {onUsarTarifa && (
                    yaUsada ? (
                      <span className="flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-bold whitespace-nowrap">
                        <Check className="w-2.5 h-2.5" />
                        Aplicada
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); handleUsar(t); }}
                        className="text-[9px] font-bold text-white bg-primario hover:bg-primario-hover px-2 py-0.5 rounded transition-colors whitespace-nowrap"
                      >
                        Usar
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}

          {/* Container resolution note */}
          {contenedorTipo && vigentes.some(v => v.precios.unidad === 'CONTENEDOR') && (
            <p className="text-[8px] text-primario/60 ml-1">
              Contenedor del servicio: <strong>{contenedorTipo}</strong> — al usar, se aplica el precio de {etiquetaContenedor(contenedorTipo)}.
            </p>
          )}

          {/* Show all / collapse */}
          {count > 3 && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="text-[9px] font-semibold text-primario hover:text-primario-hover transition-colors ml-1"
            >
              {showAll ? 'Mostrar solo las 3 más baratas' : `Ver todas (${count})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
