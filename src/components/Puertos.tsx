import React, { useState, useMemo } from 'react';
import { Plus, Search, Pencil, Anchor } from 'lucide-react';
import { usePuertos } from '../hooks/usePuertos';
import { PuertoVermur } from './puertos/PuertosData';
import PuertoFormModal from './puertos/PuertoFormModal';
import { useAuth } from '../auth/AuthContext';

export default function Puertos() {
  // Matriz §4.1: el alta de puertos es solo de Administración.
  const { puede } = useAuth();
  const puedeAltaPuerto = puede('puerto.alta');

  const { puertos, loading, error, createPuerto, updatePuerto } = usePuertos();

  const [search, setSearch] = useState('');
  const [filterPais, setFilterPais] = useState('');
  const [showInactivos, setShowInactivos] = useState(false);
  const [modal, setModal] = useState<{ mode: 'crear' | 'editar'; puerto?: PuertoVermur } | null>(null);

  // ── Filtros ──────────────────────────────────────────────────────────────
  const paises = useMemo(() => {
    const set = new Set<string>(puertos.map(p => p.pais));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [puertos]);

  const filtered = useMemo(() => {
    let list = puertos;
    if (!showInactivos) list = list.filter(p => p.activo);
    if (filterPais) list = list.filter(p => p.pais === filterPais);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p =>
        p.nombre.toLowerCase().includes(q) ||
        p.codigo.toLowerCase().includes(q) ||
        p.pais.toLowerCase().includes(q)
      );
    }
    return list;
  }, [puertos, search, filterPais, showInactivos]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-danger-bg text-danger-text px-4 py-3 rounded-lg text-[13px]">
        Error al cargar puertos: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-bold text-text-primary">Catálogo de puertos</h2>
          <p className="text-[13px] text-text-muted mt-1">
            {filtered.length} puerto{filtered.length !== 1 ? 's' : ''} · {puertos.filter(p => p.activo).length} activos
          </p>
        </div>
        {puedeAltaPuerto && (
          <button
            onClick={() => setModal({ mode: 'crear' })}
            className="flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-[8px] text-[13px] font-medium hover:bg-brand-hover transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nuevo puerto
          </button>
        )}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            className="w-full pl-9 pr-3 py-2 text-[13px] bg-white border border-card-border rounded-[8px] focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-text-primary"
            placeholder="Buscar por nombre, código o país..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-2 text-[13px] bg-white border border-card-border rounded-[8px] focus:outline-none focus:border-brand text-text-primary"
          value={filterPais}
          onChange={e => setFilterPais(e.target.value)}
        >
          <option value="">Todos los países</option>
          {paises.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="flex items-center gap-2 cursor-pointer select-none text-[13px] text-text-secondary whitespace-nowrap">
          <input
            type="checkbox"
            checked={showInactivos}
            onChange={e => setShowInactivos(e.target.checked)}
            className="w-4 h-4 rounded border-card-border text-brand focus:ring-brand accent-brand"
          />
          Mostrar inactivos
        </label>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-card-border rounded-[12px] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-divider bg-neutral-bg">
                <th className="px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Código</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Puerto</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">País</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">ISO</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Terminales</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider w-[60px]"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Anchor className="w-8 h-8 text-text-muted mx-auto mb-3" />
                    <p className="text-[13px] text-text-muted">
                      {search || filterPais ? 'Sin resultados para los filtros aplicados.' : 'No hay puertos en el catálogo.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.id} className="border-b border-divider last:border-b-0 hover:bg-neutral-bg/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center px-2 py-0.5 bg-brand/10 text-brand text-[12px] font-bold rounded tracking-wider">
                        {p.codigo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] font-medium text-text-primary">{p.nombre}</td>
                    <td className="px-4 py-3 text-[13px] text-text-secondary">{p.pais}</td>
                    <td className="px-4 py-3 text-[12px] text-text-muted font-mono">{p.codigoPais}</td>
                    <td className="px-4 py-3 text-[12px] text-text-muted">
                      {p.terminales?.length ? (
                        <span className="text-text-secondary">{p.terminales.length}</span>
                      ) : (
                        <span className="italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        p.activo
                          ? 'bg-success-bg text-success-text'
                          : 'bg-neutral-bg text-text-muted'
                      }`}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setModal({ mode: 'editar', puerto: p })}
                        className="p-1.5 rounded-lg text-text-muted hover:text-brand hover:bg-brand/10 transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      {modal && (
        <PuertoFormModal
          mode={modal.mode}
          puerto={modal.puerto}
          onClose={() => setModal(null)}
          onCreate={createPuerto}
          onUpdate={updatePuerto}
        />
      )}
    </div>
  );
}
