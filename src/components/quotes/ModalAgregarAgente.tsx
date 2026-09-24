import React, { useMemo, useState } from 'react';
import { normalizarTexto, compararTexto } from '../../lib/texto';
import { X, Search, Plus, Building2 } from 'lucide-react';
import type { ProveedorVermur } from '../proveedores/ProveedoresData';

/**
 * Elegir el proveedor que entra como columna de la comparativa.
 *
 * Se llama «agregar proveedor», no «agregar agente»: en la matriz «agente» no
 * significa agente de carga, sino cualquier proveedor al que le pediste precio
 * para ese servicio —naviera, transportista, aduanal, almacén—. El nombre
 * viene del sistema anterior, donde el caso típico eran agentes de carga.
 *
 * Por lo mismo NO se filtra por `tipos[]` ni por modalidad: eso dejaba la
 * lista vacía cuando el catálogo no estaba etiquetado. La modalidad ordena.
 *
 * Con buscador porque son muchos —544 proveedores en el catálogo— y porque
 * Pricing pide la misma ruta «a entre 7 y 10» de ellos. Una lista sin filtro
 * ahí no sirve.
 *
 * Si el agente no existe todavía, se puede capturar por nombre: es el
 * «probable proveedor» sin RFC que Administración valida después (§6).
 */

interface Props {
  proveedores: ProveedorVermur[];
  /** Modalidad del servicio: ordena la lista, NO la filtra. */
  modalidadRelevante?: string;
  /** Ya son columnas: no se ofrecen otra vez. */
  yaEnMatriz: string[];
  onCerrar: () => void;
  onAgregar: (agente: { proveedorId: string | null; nombre: string }) => void;
  /** Alta rápida de proveedor. Si no se provee, no se ofrece. */
  onAltaRapida?: () => void;
}

// Bloque 4: tolera proveedores sin nombre o sin rfc.
const norm = normalizarTexto;

export default function ModalAgregarAgente({
  proveedores, yaEnMatriz, modalidadRelevante, onCerrar, onAgregar, onAltaRapida,
}: Props) {
  const [busqueda, setBusqueda] = useState('');

  const yaEsta = useMemo(() => new Set(yaEnMatriz), [yaEnMatriz]);

  const filtrados = useMemo(() => {
    const q = norm(busqueda);
    return proveedores
      .filter(p => p.activo && !yaEsta.has(p.id))
      .filter(p => !q || norm(p.nombre).includes(q) || norm(p.rfc ?? '').includes(q))
      // Los de la modalidad del servicio primero; los demás siguen accesibles.
      .sort((a, b) => {
        const ra = modalidadRelevante && a.modalidades?.includes(modalidadRelevante as never) ? 0 : 1;
        const rb = modalidadRelevante && b.modalidades?.includes(modalidadRelevante as never) ? 0 : 1;
        return ra !== rb ? ra - rb : compararTexto(a.nombre, b.nombre);
      })
      .slice(0, 40);
  }, [proveedores, busqueda, yaEsta, modalidadRelevante]);

  const nombreLibre = busqueda.trim();
  const hayExacto = proveedores.some(p => norm(p.nombre) === norm(nombreLibre));

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
        <div className="px-5 py-4 border-b border-gray-150 flex items-center justify-between bg-gray-50/50 shrink-0">
          <h3 className="text-[14px] font-bold text-[#18181B]">Agregar proveedor a comparar</h3>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative border-b border-gray-100 shrink-0">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            autoFocus
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o RFC…"
            className="w-full pl-9 pr-3 py-2.5 text-xs text-gray-700 outline-none"
          />
        </div>

        <div className="overflow-y-auto flex-1">
          {filtrados.length === 0 && !nombreLibre && (
            <p className="px-3 py-8 text-center text-[12px] text-gray-400">
              Escribe para buscar entre los proveedores del catálogo.
            </p>
          )}

          {filtrados.map(p => (
            <button
              key={p.id}
              onClick={() => onAgregar({ proveedorId: p.id, nombre: p.nombre })}
              className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
            >
              <Building2 className="w-3.5 h-3.5 text-gray-300 mt-[2px] shrink-0" />
              <span className="min-w-0">
                <span className="block text-[12px] text-gray-800 leading-tight">{p.nombre}</span>
                {p.rfc && <span className="block text-[10px] text-gray-400">{p.rfc}</span>}
              </span>
            </button>
          ))}

          {/* Capturar por nombre: el «probable proveedor» que Administración
              valida después. Solo si no coincide con uno del catálogo. */}
          {nombreLibre && !hayExacto && (
            <button
              onClick={() => onAgregar({ proveedorId: null, nombre: nombreLibre })}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left border-t border-gray-100 hover:bg-primario/5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-primario shrink-0" />
              <span className="text-[12px] text-primario font-semibold">
                Usar «{nombreLibre}» como agente
              </span>
              <span className="text-[10px] text-gray-400 ml-auto shrink-0">sin dar de alta</span>
            </button>
          )}
        </div>

        {onAltaRapida && (
          <div className="px-3 py-2.5 border-t border-gray-100 bg-gray-50/50 shrink-0">
            <button
              onClick={onAltaRapida}
              className="text-[11px] font-semibold text-gray-500 hover:text-primario transition-colors"
            >
              ¿No está? Dar de alta un proveedor nuevo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
