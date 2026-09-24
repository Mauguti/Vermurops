import React, { useEffect, useMemo, useRef, useState } from 'react';
import { compararTexto, normalizarTexto } from '../../lib/texto';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Anchor, PenLine } from 'lucide-react';
import type { PuertoVermur, TipoPunto } from './PuertosData';
import { tipoDePunto } from './PuertosData';

/**
 * Selector de puerto para origen/destino de un servicio (D.3 de la ficha).
 *
 * Mismo criterio que ConceptoSelector y SelectorProveedor: se ELIGE del
 * catálogo, con el texto libre como excepción explícita y marcada — una ruta
 * terrestre o un destino sin puerto existen, pero que quede dicho que no
 * están catalogados.
 *
 * Del puerto elegido sale el país, y del país el tráfico (impo/expo), que
 * decide el prefijo del folio del embarque y el IVA. Por eso el catálogo va
 * primero: texto libre = tráfico adivinado; puerto elegido = tráfico sabido.
 *
 * La lista sale por PORTAL — la lección del recorte del ConceptoSelector: un
 * dropdown dentro de contenedores con overflow se abre completo en el DOM y
 * en pantalla solo se ve el buscador.
 */

interface Props {
  puertos: PuertoVermur[];
  /** El texto guardado en la ruta (nombre del puerto o texto libre). */
  valor: string;
  /** FK si el valor vino del catálogo; null si es texto libre. */
  puertoId: string | null | undefined;
  onChange: (texto: string, puertoId: string | null) => void;
  readOnly?: boolean;
  placeholder?: string;
  /**
   * Filtra el catálogo por tipo de punto: la modalidad aérea ofrece
   * aeropuertos, la marítima puertos. Sin filtro se ofrece todo (legacy).
   */
  tipo?: TipoPunto;
}

// Bloque 4: tolera campos ausentes (nombre, código, país, rfc).
const norm = normalizarTexto;

export default function PuertoSelector({
  puertos, valor, puertoId, onChange, readOnly, placeholder = 'Elegir puerto…', tipo,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const disparadorRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [posicion, setPosicion] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) { setPosicion(null); setSearch(''); return; }
    const calcular = () => {
      const r = disparadorRef.current?.getBoundingClientRect();
      if (!r) return;
      const ANCHO = 320, ALTO_MAX = 340;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - ANCHO - 8));
      const top = r.bottom + ALTO_MAX + 8 > window.innerHeight && r.top > ALTO_MAX
        ? r.top - ALTO_MAX - 4
        : r.bottom + 4;
      setPosicion({ top, left });
    };
    calcular();
    setTimeout(() => searchRef.current?.focus(), 0);
    window.addEventListener('scroll', calcular, true);
    window.addEventListener('resize', calcular);
    return () => {
      window.removeEventListener('scroll', calcular, true);
      window.removeEventListener('resize', calcular);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const enDisparador = disparadorRef.current?.contains(e.target as Node);
      const enLista = listaRef.current?.contains(e.target as Node);
      if (!enDisparador && !enLista) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  /*
   * Relevancia SIN exclusión (el criterio de la matriz): primero lo que
   * empieza con la búsqueda, luego lo que la contiene en nombre, código o
   * país. Sin búsqueda: México primero — la mitad de toda ruta pasa por un
   * puerto mexicano — y alfabético dentro de cada grupo.
   */
  const visibles = useMemo(() => {
    const activos = puertos.filter(p =>
      p.activo !== false && (!tipo || tipoDePunto(p) === tipo));
    const q = norm(search);
    if (!q) {
      return [...activos].sort((a, b) => {
        const aMx = a.codigoPais === 'MEX' ? 0 : 1;
        const bMx = b.codigoPais === 'MEX' ? 0 : 1;
        return aMx - bMx || compararTexto(a.nombre, b.nombre);
      });
    }
    const rango = (p: PuertoVermur) => {
      const n = norm(p.nombre);
      if (n.startsWith(q)) return 0;
      if (n.includes(q)) return 1;
      if (norm(p.codigo).includes(q) || norm(p.pais).includes(q)) return 2;
      return 3;
    };
    return activos
      .filter(p => rango(p) < 3)
      .sort((a, b) => rango(a) - rango(b) || compararTexto(a.nombre, b.nombre));
  }, [puertos, search, tipo]);

  const elegido = puertoId ? puertos.find(p => p.id === puertoId) : null;
  const esTextoLibre = !!valor && !elegido;

  if (readOnly) {
    return (
      <div className="px-2 py-1.5 text-xs text-gray-600">
        {valor || '—'}
        {esTextoLibre && <span className="ml-1 text-[8px] text-amber-600 font-bold uppercase">no catalogado</span>}
      </div>
    );
  }

  return (
    <div ref={disparadorRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-left outline-none focus:border-primario hover:border-gray-300 transition-colors"
      >
        <span className={`truncate ${valor ? 'text-gray-700' : 'text-gray-400'}`}>
          {valor || placeholder}
          {elegido && <span className="ml-1.5 font-mono text-[10px] text-gray-400">{elegido.codigo}</span>}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {esTextoLibre && (
            <span
              className="text-[8px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded"
              title="Capturado a mano: sin puerto del catálogo no se puede derivar el tráfico desde el país."
            >
              No catalogado
            </span>
          )}
          <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && posicion && createPortal(
        <div
          ref={listaRef}
          style={{ position: 'fixed', top: posicion.top, left: posicion.left }}
          className="z-[200] w-[320px] bg-white border border-gray-200 rounded-lg shadow-lg flex flex-col max-h-[340px] overflow-hidden"
        >
          <div className="p-2 border-b border-gray-100 shrink-0">
            <div className="relative">
              <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar puerto, código o país…"
                className="w-full pl-6 pr-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-[11px] outline-none focus:border-primario"
              />
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {visibles.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onChange(p.nombre, p.id); setOpen(false); }}
                className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-primario/5 transition-colors"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <Anchor className="w-3 h-3 text-gray-300 shrink-0" />
                  <span className="text-[11px] text-gray-700 truncate">{p.nombre}</span>
                </span>
                <span className="text-[9px] font-mono text-gray-400 shrink-0">
                  {p.codigo} · {p.codigoPais}
                </span>
              </button>
            ))}
            {visibles.length === 0 && (
              <p className="px-3 py-2 text-[10px] text-gray-400 italic">
                Sin puertos que coincidan.
              </p>
            )}
          </div>

          {/* La excepción explícita: la ruta terrestre o el destino sin puerto
              existen. Se usa tal cual, marcado como no catalogado. */}
          {search.trim() && (
            <button
              type="button"
              onClick={() => { onChange(search.trim(), null); setOpen(false); }}
              className="shrink-0 w-full flex items-center gap-1.5 px-3 py-2 border-t border-gray-100 bg-gray-50/60 text-left hover:bg-amber-50 transition-colors"
            >
              <PenLine className="w-3 h-3 text-amber-600 shrink-0" />
              <span className="text-[10px] text-gray-600">
                Usar «<strong>{search.trim()}</strong>» tal cual
                <span className="ml-1 text-[8px] font-bold uppercase text-amber-700">no catalogado</span>
              </span>
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
