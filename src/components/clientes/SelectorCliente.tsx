import React, { useEffect, useMemo, useRef, useState } from 'react';
import { compararTexto, normalizarTexto } from '../../lib/texto';
import { Search, X, Check, ChevronDown, Building2 } from 'lucide-react';
import type { ClienteVermur } from './ClientesData';

/**
 * Buscador de cliente del catálogo, con la misma API que SelectorProveedor.
 *
 * Extraído del buscador inline de FichaCotizacion (E6.4) para que el
 * embarque, la OC y quien venga después elijan al cliente igual: por nombre
 * o RFC, del catálogo, nunca tecleado — salvo la excepción explícita de
 * `onNombreLibre`, que queda marcada como no validada.
 */

interface Props {
  clientes: ClienteVermur[];
  /** Id seleccionado. null = ninguno. */
  valorId: string | null;
  onSelect: (cliente: ClienteVermur) => void;
  /** Nombre tecleado que NO está en el catálogo, para mostrarlo en el botón. */
  nombreLibreActual?: string;
  /** Permite usar un nombre libre (entidad no catalogada). */
  onNombreLibre?: (nombre: string) => void;
  placeholder?: string;
  compacto?: boolean;
  disabled?: boolean;
}

// Bloque 4: tolera campos ausentes (nombre, código, país, rfc).
const norm = normalizarTexto;

export default function SelectorCliente({
  clientes, valorId, onSelect, nombreLibreActual, onNombreLibre,
  placeholder = 'Buscar cliente por nombre o RFC…', compacto, disabled,
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

  const seleccionado = clientes.find(c => c.id === valorId) ?? null;

  const resultados = useMemo(() => {
    const q = norm(busqueda);
    return clientes
      .filter(c => !q || norm(c.nombre).includes(q) || norm(c.rfc ?? '').includes(q) || norm(c.comercial ?? '').includes(q))
      .sort((a, b) => compararTexto(a.nombre, b.nombre))
      .slice(0, 40);
  }, [clientes, busqueda]);

  const nombreLibre = busqueda.trim();
  const hayExacto = clientes.some(c => norm(c.nombre) === norm(nombreLibre));

  const elegir = (c: ClienteVermur) => {
    onSelect(c);
    setAbierto(false);
    setBusqueda('');
  };

  const textoBoton = seleccionado?.nombre ?? nombreLibreActual ?? 'Seleccionar cliente';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAbierto(v => !v)}
        className={`w-full flex items-center justify-between gap-1 rounded border transition-colors text-left disabled:opacity-50 ${
          compacto ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-[12px]'
        } ${seleccionado || nombreLibreActual
          ? 'border-gray-200 bg-white text-gray-800 hover:border-[#E11D48]/50'
          : 'border-dashed border-gray-300 bg-white text-gray-400 hover:border-[#E11D48] hover:text-[#E11D48]'}`}
      >
        <span className="truncate">{textoBoton}</span>
        <ChevronDown className="w-3 h-3 shrink-0 text-gray-400" />
      </button>

      {abierto && (
        <div className="absolute z-50 mt-1 w-[300px] max-w-[90vw] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
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
            {resultados.length === 0 && !nombreLibre && (
              <p className="px-3 py-5 text-center text-[11px] text-gray-400">Sin clientes disponibles.</p>
            )}
            {resultados.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => elegir(c)}
                className="w-full flex items-start gap-2 px-3 py-1.5 text-left hover:bg-gray-50 transition-colors"
              >
                <Building2 className="w-3 h-3 text-gray-300 mt-[3px] shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-gray-800 leading-tight truncate">{c.nombre}</span>
                  <span className="block text-[10px] text-gray-400">
                    {c.rfc || 'Sin RFC'}
                    {c.tipoCredito === 'credito' && c.dias ? ` · Crédito ${c.dias} días` : ''}
                  </span>
                </span>
                {c.id === valorId && <Check className="w-3 h-3 text-[#E11D48] shrink-0 mt-[3px]" />}
              </button>
            ))}

            {onNombreLibre && nombreLibre && !hayExacto && (
              <button
                type="button"
                onClick={() => { onNombreLibre(nombreLibre); setAbierto(false); setBusqueda(''); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left border-t border-gray-100 hover:bg-[#E11D48]/5 transition-colors"
              >
                <span className="text-[11px] text-[#E11D48] font-semibold truncate">Usar «{nombreLibre}»</span>
                <span className="text-[10px] text-gray-400 ml-auto shrink-0">sin validar</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
