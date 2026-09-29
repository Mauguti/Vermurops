/**
 * CeldaEditable.tsx
 *
 * Celdas editables en línea para SpreadsheetTable.
 * Dos variantes: toggle de estado (activo/inactivo) y selector de ejecutivo.
 *
 * Solo se activan cuando `puedeEditar` es true en el contexto de la tabla.
 * Los demás roles ven la misma celda en solo lectura.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Check, X, Loader2, ChevronDown } from 'lucide-react';
import { nombreDeUsuario, type UsuarioEquipo } from '../../auth/AuthContext';

// ─── Feedback visual ──────────────────────────────────────────────────────────

type FeedbackEstado = 'idle' | 'saving' | 'ok' | 'error';

function useFeedback() {
  const [estado, setEstado] = useState<FeedbackEstado>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const mostrar = useCallback((tipo: 'ok' | 'error') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setEstado(tipo);
    timerRef.current = setTimeout(() => setEstado('idle'), 1800);
  }, []);

  const saving = useCallback(() => setEstado('saving'), []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { estado, mostrar, saving };
}

function Feedback({ estado }: { estado: FeedbackEstado }) {
  if (estado === 'saving') return <Loader2 className="w-3 h-3 animate-spin text-gray-400 shrink-0" />;
  if (estado === 'ok') return <Check className="w-3 h-3 text-green-500 shrink-0" />;
  if (estado === 'error') return <X className="w-3 h-3 text-red-500 shrink-0" />;
  return null;
}

// ─── Toggle de estado ─────────────────────────────────────────────────────────

interface CeldaEstadoProps {
  activo: boolean;
  puedeEditar: boolean;
  onChange: (nuevoValor: boolean) => Promise<void>;
}

export function CeldaEstado({ activo, puedeEditar, onChange }: CeldaEstadoProps) {
  const { estado, mostrar, saving } = useFeedback();

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation(); // No abrir la ficha
    saving();
    try {
      await onChange(!activo);
      mostrar('ok');
    } catch {
      mostrar('error');
    }
  }, [activo, onChange, saving, mostrar]);

  const badge = (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
      activo
        ? 'bg-green-50 text-green-700 border-green-200'
        : 'bg-gray-100 text-gray-500 border-gray-200'
    }`}>
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  );

  if (!puedeEditar) return badge;

  return (
    <span className="inline-flex items-center gap-1.5 group/estado">
      <button
        onClick={handleClick}
        className="hover:opacity-70 transition-opacity cursor-pointer"
        title={`Cambiar a ${activo ? 'Inactivo' : 'Activo'}`}
      >
        {badge}
      </button>
      <Feedback estado={estado} />
    </span>
  );
}

// ─── Selector de ejecutivo ────────────────────────────────────────────────────

interface CeldaEjecutivoEditableProps {
  email: string | null | undefined;
  puedeEditar: boolean;
  opciones: UsuarioEquipo[];
  onChange: (nuevoEmail: string | null) => Promise<void>;
}

export function CeldaEjecutivoEditable({ email, puedeEditar, opciones, onChange }: CeldaEjecutivoEditableProps) {
  const [abierto, setAbierto] = useState(false);
  const { estado, mostrar, saving } = useFeedback();
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al clicar fuera
  useEffect(() => {
    if (!abierto) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [abierto]);

  const nombre = email ? nombreDeUsuario(email) : null;

  if (!puedeEditar) {
    if (!nombre) return <span className="text-gray-300 italic">—</span>;
    return <span className="text-gray-700" title={email!}>{nombre}</span>;
  }

  const seleccionar = async (nuevoEmail: string | null) => {
    setAbierto(false);
    if ((nuevoEmail ?? '') === (email ?? '')) return;
    saving();
    try {
      await onChange(nuevoEmail);
      mostrar('ok');
    } catch {
      mostrar('error');
    }
  };

  return (
    <div ref={ref} className="relative inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setAbierto(!abierto)}
        className="inline-flex items-center gap-1 hover:bg-gray-50 rounded px-1 py-0.5 -mx-1 transition-colors text-left min-w-0 max-w-full"
        title={email ?? 'Sin asignar'}
      >
        <span className={`truncate ${nombre ? 'text-gray-700' : 'text-gray-300 italic'}`}>
          {nombre || '—'}
        </span>
        <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
      </button>
      <Feedback estado={estado} />

      {abierto && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[180px] max-h-[200px] overflow-auto py-1">
          <button
            onClick={() => seleccionar(null)}
            className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-gray-50 transition-colors ${
              !email ? 'text-primario font-medium' : 'text-gray-500 italic'
            }`}
          >
            Sin asignar
          </button>
          {opciones.map(u => (
            <button
              key={u.email}
              onClick={() => seleccionar(u.email)}
              className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-gray-50 transition-colors ${
                u.email === email ? 'text-primario font-medium bg-primario/5' : 'text-gray-700'
              }`}
              title={u.email}
            >
              {u.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
