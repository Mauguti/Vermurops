/**
 * EmbarquesList.tsx
 *
 * La vista general de Embarques: SpreadsheetTable con vistas guardables y
 * los filtros que Operaciones usa todos los días (10-sep-2026).
 *
 * Todos ven todos los embarques —es carga compartida— pero cada quien
 * trabaja los suyos: «Solo los míos» filtra por el responsable operativo, que
 * el embarque hereda del cliente. Los filtros se guardan CON la vista, para
 * que nadie los repita cada mañana.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, Ship, X, Download, UserCheck, SlidersHorizontal } from 'lucide-react';
import type { EmbarqueCompleto } from './EmbarquesData';
import EstadoVacio from '../ui/EstadoVacio';
import SpreadsheetTable, { type VistaConfig } from '../table/SpreadsheetTable';
import VistaSelector from '../table/VistaSelector';
import { useVistasUsuario } from '../../hooks/useVistasUsuario';
import { useAuth, usuariosPorRol } from '../../auth/AuthContext';
import { useClientes } from '../../hooks/useClientes';
import { EMBARQUE_COLUMNS, VISTA_DEFAULT_EMBARQUES } from './embarqueColumns';
import {
  FILTROS_VACIOS, SIN_ASIGNAR, aplicarFiltros, filtrosActivos, filtrosDesdeVista,
  filtrosParaVista, responsablesPresentes, type FiltrosEmbarques,
} from '../../lib/filtrosEmbarques';
import { ETAPAS_EMBARQUE } from '../../lib/estadoEmbarque';

interface EmbarquesListProps {
  embarques: EmbarqueCompleto[];
  onSelectEmbarque: (embarque: EmbarqueCompleto) => void;
  onCrearEmbarque: () => void;
}

const SELECT = 'bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-gray-700 outline-none focus:border-[#E11D48]';

export default function EmbarquesList({ embarques, onSelectEmbarque, onCrearEmbarque }: EmbarquesListProps) {
  const { user } = useAuth();
  const { clientes } = useClientes();
  const [filtros, setFiltros] = useState<FiltrosEmbarques>(FILTROS_VACIOS);
  const set = <K extends keyof FiltrosEmbarques>(k: K, v: FiltrosEmbarques[K]) =>
    setFiltros(f => ({ ...f, [k]: v }));

  // ── Vistas guardadas (columnas + filtros) ─────────────────────────────────
  const { vistas, crearVista, actualizarVista, eliminarVista, vistaDefault } = useVistasUsuario('embarques');
  const [vistaActivaId, setVistaActivaId] = useState<string | null>(null);
  const [vistaTabla, setVistaTabla] = useState<VistaConfig>(VISTA_DEFAULT_EMBARQUES);

  const aplicarVista = useCallback((v: { columnas: VistaConfig['columnas']; ordenamiento?: VistaConfig['ordenamiento']; filtros?: Record<string, string | null> } | null) => {
    if (!v) {
      setVistaTabla(VISTA_DEFAULT_EMBARQUES);
      setFiltros(FILTROS_VACIOS);
      return;
    }
    setVistaTabla({ columnas: v.columnas, ordenamiento: v.ordenamiento ?? null });
    setFiltros(filtrosDesdeVista(v.filtros));
  }, []);

  const defaultCargada = useRef(false);
  useEffect(() => {
    if (defaultCargada.current || !vistaDefault || vistaActivaId !== null) return;
    defaultCargada.current = true;
    setVistaActivaId(vistaDefault.id);
    aplicarVista(vistaDefault);
  }, [vistaDefault, vistaActivaId, aplicarVista]);

  const seleccionarVista = (id: string | null) => {
    setVistaActivaId(id);
    aplicarVista(id ? vistas.find(v => v.id === id) ?? null : vistaDefault ?? null);
  };

  // ── Filtrado ──────────────────────────────────────────────────────────────
  const equipoOperaciones = useMemo(() => usuariosPorRol('operaciones'), []);
  const responsables = useMemo(
    () => responsablesPresentes(embarques, equipoOperaciones),
    [embarques, equipoOperaciones],
  );
  const filtrados = useMemo(
    () => aplicarFiltros(embarques, filtros, { clientes }),
    [embarques, filtros, clientes],
  );
  const activos = filtrosActivos(filtros);
  const miCorreo = (user?.email ?? '').toLowerCase();
  const soloMios = !!miCorreo && filtros.responsable.toLowerCase() === miCorreo;

  /** Clientes que aparecen en los embarques, para no ofrecer 817 opciones. */
  const clientesPresentes = useMemo(() => {
    const ids = new Set<string>();
    embarques.forEach(e => {
      const id = e.entidadesRef?.clienteCobrar?.id
        ?? clientes.find(c => c.nombre.trim() === (e.entidades?.clienteCobrar ?? '').trim())?.id;
      if (id) ids.add(id);
    });
    return clientes.filter(c => ids.has(c.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [embarques, clientes]);

  const exportarCSV = () => {
    const headers = ['Folio', 'Cliente', 'Responsable', 'Modalidad', 'BL/AWB', 'ETD', 'ETA'];
    const rows = filtrados.map(e => [
      e.folio, e.entidades?.clienteCobrar ?? '', e.responsableOperativo ?? '', e.modalidad,
      e.numeroGuia, e.fechas?.salida ?? '', e.fechas?.arribo ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'embarques.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="bg-white p-5 rounded-xl border border-gray-150 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#18181B] tracking-tight">Embarques</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {filtrados.length} de {embarques.length}{activos > 0 ? ` · ${activos} filtro${activos !== 1 ? 's' : ''}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportarCSV}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg border border-gray-200"
              title="Exportar lo filtrado a CSV"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onCrearEmbarque}
              className="bg-[#E11D48] hover:bg-[#BE123C] text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 shadow-xs"
            >
              <Plus className="w-4 h-4" /> Nuevo Embarque
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
          {/* Solo los míos: el acceso rápido de todos los días */}
          {miCorreo && (
            <button
              onClick={() => set('responsable', soloMios ? '' : miCorreo)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 border transition-colors
                ${soloMios ? 'bg-[#E11D48] text-white border-[#E11D48]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#E11D48] hover:text-[#E11D48]'}`}
            >
              <UserCheck className="w-3.5 h-3.5" /> Solo los míos
            </button>
          )}

          <select value={filtros.responsable} onChange={e => set('responsable', e.target.value)} className={SELECT} title="Responsable operativo">
            <option value="">Responsable: todos</option>
            <option value={SIN_ASIGNAR}>Sin asignar</option>
            {responsables.map(r => <option key={r.email} value={r.email}>{r.nombre}</option>)}
          </select>

          <select value={filtros.estado} onChange={e => set('estado', e.target.value as FiltrosEmbarques['estado'])} className={SELECT}>
            <option value="">Estado: todos</option>
            {ETAPAS_EMBARQUE.map(et => <option key={et.id} value={et.id}>{et.label}</option>)}
          </select>

          <select value={filtros.modalidad} onChange={e => set('modalidad', e.target.value as FiltrosEmbarques['modalidad'])} className={SELECT}>
            <option value="">Modalidad: todas</option>
            <option value="maritimo">Marítimo</option>
            <option value="aereo">Aéreo</option>
            <option value="terrestre">Terrestre</option>
          </select>

          <select value={filtros.clienteId} onChange={e => set('clienteId', e.target.value)} className={`${SELECT} max-w-[220px]`}>
            <option value="">Cliente: todos</option>
            {clientesPresentes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>

          <div className="flex items-center gap-1">
            <select value={filtros.fechaCampo} onChange={e => set('fechaCampo', e.target.value as FiltrosEmbarques['fechaCampo'])} className={SELECT}>
              <option value="arribo">ETA</option>
              <option value="salida">ETD</option>
            </select>
            <input type="date" value={filtros.desde} onChange={e => set('desde', e.target.value)} className={SELECT} title="Desde" />
            <span className="text-gray-300 text-xs">–</span>
            <input type="date" value={filtros.hasta} onChange={e => set('hasta', e.target.value)} className={SELECT} title="Hasta" />
          </div>

          <select value={filtros.cierrePendiente} onChange={e => set('cierrePendiente', e.target.value as FiltrosEmbarques['cierrePendiente'])} className={SELECT}>
            <option value="">Cierres: todos</option>
            <option value="operativo">Falta cierre operativo</option>
            <option value="pago">Falta cierre de pago</option>
            <option value="administrativo">Falta cierre administrativo</option>
          </select>

          {activos > 0 && (
            <button
              onClick={() => setFiltros(FILTROS_VACIOS)}
              className="text-[11px] font-bold text-gray-400 hover:text-[#E11D48] flex items-center gap-1 px-2"
            >
              <X className="w-3 h-3" /> Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Buscador + vistas */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por folio, BL, PO, cliente, consignatario…"
            value={filtros.busqueda}
            onChange={e => set('busqueda', e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 focus:border-[#E11D48] rounded-lg text-xs font-semibold text-gray-700 outline-none shadow-2xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" />
          <VistaSelector
            vistas={vistas}
            vistaActivaId={vistaActivaId}
            currentUserId={user?.uid || user?.id || ''}
            vistaActual={vistaTabla}
            filtrosActuales={filtrosParaVista(filtros)}
            labelDefault="Vista por defecto"
            onSeleccionar={seleccionarVista}
            onGuardar={async (nombre) => {
              // Las columnas Y los filtros: la vista es «mis marítimos en
              // proceso», no solo qué columnas se ven.
              const id = await crearVista(nombre, vistaTabla.columnas, { filtros: filtrosParaVista(filtros) });
              setVistaActivaId(id);
            }}
            onActualizar={(id, cambios) => actualizarVista(id, cambios)}
            onEliminar={async (id) => {
              await eliminarVista(id);
              if (vistaActivaId === id) seleccionarVista(null);
            }}
          />
        </div>
      </div>

      {/* Tabla */}
      {filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-150 shadow-2xs">
          <EstadoVacio
            variante="plano"
            icono={<Ship className="w-5 h-5" />}
            titulo={embarques.length === 0 ? 'Todavía no hay embarques' : 'Ningún embarque coincide con los filtros'}
            detalle={embarques.length === 0
              ? 'Nacen solos al marcar una cotización como ganada, o se capturan a mano desde «Nuevo embarque».'
              : soloMios
                ? 'No tienes embarques asignados. El responsable operativo se hereda del cliente y se cambia en la ficha del embarque.'
                : 'Prueba quitando un filtro o con otra búsqueda.'}
          />
        </div>
      ) : (
        <SpreadsheetTable<EmbarqueCompleto>
          data={filtrados}
          columns={EMBARQUE_COLUMNS}
          pinnedColumnIds={['folio']}
          vista={vistaTabla}
          onVistaChange={setVistaTabla}
          onRowClick={onSelectEmbarque}
          maxHeight="calc(100vh - 340px)"
        />
      )}
    </div>
  );
}
