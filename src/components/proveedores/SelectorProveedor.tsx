import React, { useMemo, useRef, useState, useEffect } from 'react';
import { compararTexto, normalizarTexto } from '../../lib/texto';
import { Search, ChevronDown, X, Building2, Check } from 'lucide-react';
import type { ProveedorVermur, Modalidad } from './ProveedoresData';

/**
 * Selector de proveedor con buscador.
 *
 * ── Dos problemas que resuelve ─────────────────────────────────────────────
 *
 * 1. Son 544 y estaban en un `<select>` plano. Mismo criterio que el
 *    ConceptoSelector: con pocas opciones una lista funciona, con muchas
 *    estorba.
 *
 * 2. Los filtros por `modalidades` EXCLUÍAN. Si un proveedor no tenía la
 *    modalidad etiquetada, desaparecía de la lista y la pantalla decía que no
 *    había ninguno disponible.
 *
 *    En una comparativa, «agente» no significa agente de carga: es cualquier
 *    proveedor al que le pediste precio para ese servicio — naviera,
 *    transportista, aduanal, almacén. La modalidad ORDENA, no excluye: los
 *    relevantes salen primero y los demás siguen accesibles.
 */

interface Props {
  proveedores: ProveedorVermur[];
  /** Id seleccionado. null = ninguno. */
  valorId: string | null;
  onSelect: (proveedor: ProveedorVermur) => void;
  /** Modalidad del servicio: ordena, NO filtra. */
  modalidadRelevante?: Modalidad;
  /** Ids que ya están usados y no se vuelven a ofrecer. */
  excluirIds?: string[];
  placeholder?: string;
  /** Permite usar un nombre libre («probable proveedor» sin dar de alta). */
  onNombreLibre?: (nombre: string) => void;
  /** Nombre libre YA elegido, para que el botón lo muestre en vez del placeholder. */
  nombreLibreActual?: string;
  compacto?: boolean;
  disabled?: boolean;
}

// Bloque 4: tolera campos ausentes (nombre, código, país, rfc).
const norm = normalizarTexto;

const ETIQUETA_MODALIDAD: Record<string, string> = {
  maritimo: 'Marítimo', aereo: 'Aéreo', terrestre: 'Terrestre', aduanal: 'Aduanal',
};

export default function SelectorProveedor({
  proveedores, valorId, onSelect, modalidadRelevante, excluirIds = [],
  placeholder = 'Buscar proveedor…', onNombreLibre, nombreLibreActual, compacto, disabled,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    setTimeout(() => inputRef.current?.focus(), 0);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  const excluidos = useMemo(() => new Set(excluirIds), [excluirIds]);
  const seleccionado = proveedores.find(p => p.id === valorId) ?? null;

  const { relevantes, resto } = useMemo(() => {
    const q = norm(busqueda);
    const base = proveedores
      .filter(p => p.activo && !excluidos.has(p.id))
      .filter(p => !q || norm(p.nombre).includes(q) || norm(p.rfc ?? '').includes(q))
      .sort((a, b) => compararTexto(a.nombre, b.nombre));

    if (!modalidadRelevante) return { relevantes: [] as ProveedorVermur[], resto: base };

    // ORDENA, no excluye: los de la modalidad primero, los demás debajo.
    return {
      relevantes: base.filter(p => p.modalidades?.includes(modalidadRelevante)),
      resto: base.filter(p => !p.modalidades?.includes(modalidadRelevante)),
    };
  }, [proveedores, busqueda, excluidos, modalidadRelevante]);

  const total = relevantes.length + resto.length;
  const nombreLibre = busqueda.trim();
  const hayExacto = proveedores.some(p => norm(p.nombre) === norm(nombreLibre));

  const elegir = (p: ProveedorVermur) => {
    onSelect(p);
    setAbierto(false);
    setBusqueda('');
  };

  const Fila = ({ p }: { p: ProveedorVermur }) => (
    <button
      type="button"
      onClick={() => elegir(p)}
      className="w-full flex items-start gap-2 px-3 py-1.5 text-left hover:bg-gray-50 transition-colors"
    >
      <Building2 className="w-3 h-3 text-gray-300 mt-[3px] shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] text-gray-800 leading-tight truncate">{p.nombre}</span>
        {p.rfc && <span className="block text-[10px] text-gray-400">{p.rfc}</span>}
      </span>
      {p.id === valorId && <Check className="w-3 h-3 text-primario shrink-0 mt-[3px]" />}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAbierto(v => !v)}
        className={`w-full flex items-center justify-between gap-1 rounded border transition-colors text-left disabled:opacity-50 ${
          compacto ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-[12px]'
        } ${seleccionado || nombreLibreActual
          ? 'border-gray-200 bg-white text-gray-800 hover:border-primario/50'
          : 'border-dashed border-gray-300 bg-white text-gray-400 hover:border-primario hover:text-primario'}`}
      >
        <span className="truncate">{seleccionado?.nombre ?? nombreLibreActual ?? 'Seleccionar proveedor'}</span>
        <ChevronDown className="w-3 h-3 shrink-0 text-gray-400" />
      </button>

      {abierto && (
        <div className="absolute z-50 mt-1 w-[280px] max-w-[90vw] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="relative border-b border-gray-100">
            <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder={placeholder}
              className="w-full pl-7 pr-7 py-2 text-[11px] text-gray-700 outline-none"
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Limpiar"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="max-h-[240px] overflow-y-auto">
            {total === 0 && !nombreLibre && (
              <p className="px-3 py-5 text-center text-[11px] text-gray-400">
                Sin proveedores disponibles.
              </p>
            )}

            {relevantes.length > 0 && (
              <>
                <div className="sticky top-0 bg-gray-50 border-b border-gray-100 px-3 py-1 text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                  {ETIQUETA_MODALIDAD[modalidadRelevante ?? ''] ?? 'Relevantes'}
                </div>
                {relevantes.map(p => <Fila key={p.id} p={p} />)}
              </>
            )}

            {resto.length > 0 && (
              <>
                {relevantes.length > 0 && (
                  <div className="sticky top-0 bg-gray-50 border-y border-gray-100 px-3 py-1 text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                    Otros proveedores
                  </div>
                )}
                {resto.map(p => <Fila key={p.id} p={p} />)}
              </>
            )}

            {/* «Probable proveedor»: se usa el nombre sin dar de alta. */}
            {onNombreLibre && nombreLibre && !hayExacto && (
              <button
                type="button"
                onClick={() => { onNombreLibre(nombreLibre); setAbierto(false); setBusqueda(''); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left border-t border-gray-100 hover:bg-primario/5 transition-colors"
              >
                <span className="text-[11px] text-primario font-semibold truncate">
                  Usar «{nombreLibre}»
                </span>
                <span className="text-[10px] text-gray-400 ml-auto shrink-0">sin dar de alta</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
