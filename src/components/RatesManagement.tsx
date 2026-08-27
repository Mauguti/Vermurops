import React, { useState, useMemo } from 'react';
import { Plus, Search, Pencil, DollarSign, AlertTriangle, Clock, CheckCircle2, Upload } from 'lucide-react';
import { useTarifas } from '../hooks/useTarifas';
import { useProveedores } from '../hooks/useProveedores';
import { useConceptos } from '../hooks/useConceptos';
import { usePuertos } from '../hooks/usePuertos';
import {
  TarifaVermur, TipoTarifa, EstadoVigencia, estadoVigencia, UnidadTarifa,
} from './tarifas/TarifasData';
import TarifaFormModal from './tarifas/TarifaFormModal';
import CargaMasivaTarifas from './tarifas/CargaMasivaTarifas';

// ─── Helpers de display ──────────────────────────────────────────────────────

const UNIDAD_LABEL: Record<UnidadTarifa, string> = {
  CONTENEDOR: 'cntr',
  CBM: 'm³',
  TON: 'ton',
  WM: 'W/M',
  PEDIMENTO: 'pedimento',
  VIAJE: 'viaje',
  BL: 'B/L',
  FIJO: 'fijo',
  DIA: 'día',
};

function formatPrecio(t: TarifaVermur): string {
  const { monto, unidad, montoPor40, montoPor40HC } = t.precios;
  const sym = t.moneda === 'USD' ? 'USD' : 'MXN';
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  if (unidad === 'CONTENEDOR') {
    let s = `$${fmt(monto)} / 20'`;
    if (montoPor40) s += ` · $${fmt(montoPor40)} / 40'`;
    if (montoPor40HC) s += ` · $${fmt(montoPor40HC)} / 40'HC`;
    return `${s}  ${sym}`;
  }
  return `$${fmt(monto)} / ${UNIDAD_LABEL[unidad]}  ${sym}`;
}

const VIGENCIA_BADGE: Record<EstadoVigencia, { cls: string; label: string }> = {
  vigente:    { cls: 'bg-success-bg text-success-text', label: 'Vigente' },
  por_vencer: { cls: 'bg-warning-bg text-warning-text', label: 'Por vencer' },
  vencida:    { cls: 'bg-danger-bg text-danger-text', label: 'Vencida' },
  indefinida: { cls: 'bg-neutral-bg text-text-muted', label: 'Indefinida' },
};

type FiltroVigencia = 'todas' | EstadoVigencia;

// ─── Componente principal ────────────────────────────────────────────────────

export default function RatesManagement() {
  const { tarifas, loading, error, createTarifa, updateTarifa } = useTarifas();
  const { proveedores } = useProveedores();
  const { conceptos } = useConceptos();
  const { puertos } = usePuertos();

  const [search, setSearch] = useState('');
  const [filterConcepto, setFilterConcepto] = useState('');
  const [filterProveedor, setFilterProveedor] = useState('');
  const [filterTipo, setFilterTipo] = useState<'' | TipoTarifa>('');
  const [filterVigencia, setFilterVigencia] = useState<FiltroVigencia>('todas');
  const [modal, setModal] = useState<{ mode: 'crear' | 'editar'; tarifa?: TarifaVermur } | null>(null);
  const [view, setView] = useState<'catalogo' | 'masiva'>('catalogo');

  // ── Lookup maps (id → nombre) ──────────────────────────────────────────
  const provMap = useMemo(() => {
    const m = new Map<string, string>();
    proveedores.forEach(p => m.set(p.id, p.nombre));
    return m;
  }, [proveedores]);

  const concMap = useMemo(() => {
    const m = new Map<string, string>();
    conceptos.forEach(c => m.set(c.id, c.nombre));
    return m;
  }, [conceptos]);

  const puertoMap = useMemo(() => {
    const m = new Map<string, string>();
    puertos.forEach(p => m.set(p.id, `${p.codigo} — ${p.nombre}`));
    return m;
  }, [puertos]);

  // ── Conceptos y proveedores que aparecen en tarifas (para filtros) ──────
  const conceptosEnTarifas = useMemo(() => {
    const ids = new Set(tarifas.map(t => t.conceptoId));
    return conceptos.filter(c => ids.has(c.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [tarifas, conceptos]);

  const proveedoresEnTarifas = useMemo(() => {
    const ids = new Set(tarifas.map(t => t.proveedorId));
    return proveedores.filter(p => ids.has(p.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [tarifas, proveedores]);

  // ── Filtrado ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = tarifas;

    if (filterConcepto) list = list.filter(t => t.conceptoId === filterConcepto);
    if (filterProveedor) list = list.filter(t => t.proveedorId === filterProveedor);
    if (filterTipo) list = list.filter(t => t.tipo === filterTipo);
    if (filterVigencia !== 'todas') list = list.filter(t => estadoVigencia(t) === filterVigencia);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(t => {
        const concepto = concMap.get(t.conceptoId) ?? '';
        const prov = provMap.get(t.proveedorId) ?? '';
        const ruta = buildRuta(t);
        return concepto.toLowerCase().includes(q)
          || prov.toLowerCase().includes(q)
          || ruta.toLowerCase().includes(q)
          || t.vigenciaTexto.toLowerCase().includes(q);
      });
    }

    return list;
  }, [tarifas, search, filterConcepto, filterProveedor, filterTipo, filterVigencia, concMap, provMap]);

  // ── Contadores ──────────────────────────────────────────────────────────
  const conteos = useMemo(() => {
    let vigentes = 0, porVencer = 0, vencidas = 0;
    tarifas.forEach(t => {
      const ev = estadoVigencia(t);
      if (ev === 'vigente' || ev === 'indefinida') vigentes++;
      else if (ev === 'por_vencer') porVencer++;
      else if (ev === 'vencida') vencidas++;
    });
    return { total: tarifas.length, vigentes, porVencer, vencidas };
  }, [tarifas]);

  // ── Helpers ─────────────────────────────────────────────────────────────
  function buildRuta(t: TarifaVermur): string {
    if (t.puertoOrigenId || t.puertoDestinoId) {
      const orig = t.puertoOrigenId ? puertoMap.get(t.puertoOrigenId) ?? t.puertoOrigenId : '—';
      const dest = t.puertoDestinoId ? puertoMap.get(t.puertoDestinoId) ?? t.puertoDestinoId : '—';
      return `${orig} → ${dest}`;
    }
    return t.rutaTexto || '—';
  }

  // ── Loading / Error ─────────────────────────────────────────────────────
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
        Error al cargar tarifas: {error}
      </div>
    );
  }

  // ── Vista de carga masiva ───────────────────────────────────────────────
  if (view === 'masiva') {
    return (
      <CargaMasivaTarifas
        onClose={() => setView('catalogo')}
        onCreate={createTarifa}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-bold text-text-primary">Catálogo de tarifas</h2>
          <p className="text-[13px] text-text-muted mt-1">
            {conteos.total === 0
              ? 'Sin tarifas cargadas'
              : `${conteos.total} tarifa${conteos.total !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('masiva')}
            className="flex items-center gap-2 border border-card-border text-text-secondary px-4 py-2 rounded-[8px] text-[13px] font-medium hover:border-brand hover:text-brand transition-colors"
          >
            <Upload className="w-4 h-4" />
            Carga masiva
          </button>
          <button
            onClick={() => setModal({ mode: 'crear' })}
            className="flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-[8px] text-[13px] font-medium hover:bg-brand-hover transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nueva tarifa
          </button>
        </div>
      </div>

      {/* ── Contadores ─────────────────────────────────────────────────────── */}
      {conteos.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total" value={conteos.total} icon={<DollarSign className="w-4 h-4" />} cls="text-text-primary" />
          <StatCard label="Vigentes" value={conteos.vigentes} icon={<CheckCircle2 className="w-4 h-4" />} cls="text-success-text" />
          <StatCard label="Por vencer" value={conteos.porVencer} icon={<Clock className="w-4 h-4" />} cls="text-warning-text" />
          <StatCard label="Vencidas" value={conteos.vencidas} icon={<AlertTriangle className="w-4 h-4" />} cls="text-danger-text" />
        </div>
      )}

      {/* ── Filtros ────────────────────────────────────────────────────────── */}
      {conteos.total > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              className="w-full pl-9 pr-3 py-2 text-[13px] bg-white border border-card-border rounded-[8px] focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-text-primary"
              placeholder="Buscar por concepto, proveedor, ruta, vigencia..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="px-3 py-2 text-[13px] bg-white border border-card-border rounded-[8px] focus:outline-none focus:border-brand text-text-primary"
            value={filterConcepto}
            onChange={e => setFilterConcepto(e.target.value)}
          >
            <option value="">Todos los conceptos</option>
            {conceptosEnTarifas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select
            className="px-3 py-2 text-[13px] bg-white border border-card-border rounded-[8px] focus:outline-none focus:border-brand text-text-primary"
            value={filterProveedor}
            onChange={e => setFilterProveedor(e.target.value)}
          >
            <option value="">Todos los proveedores</option>
            {proveedoresEnTarifas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <select
            className="px-3 py-2 text-[13px] bg-white border border-card-border rounded-[8px] focus:outline-none focus:border-brand text-text-primary"
            value={filterTipo}
            onChange={e => setFilterTipo(e.target.value as '' | TipoTarifa)}
          >
            <option value="">Tipo: todos</option>
            <option value="tarifario">Tarifario</option>
            <option value="spot">Spot</option>
          </select>
          <select
            className="px-3 py-2 text-[13px] bg-white border border-card-border rounded-[8px] focus:outline-none focus:border-brand text-text-primary"
            value={filterVigencia}
            onChange={e => setFilterVigencia(e.target.value as FiltroVigencia)}
          >
            <option value="todas">Vigencia: todas</option>
            <option value="vigente">Vigente</option>
            <option value="por_vencer">Por vencer</option>
            <option value="vencida">Vencida</option>
            <option value="indefinida">Indefinida</option>
          </select>
        </div>
      )}

      {/* ── Tabla ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-card-border rounded-[12px] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-divider bg-neutral-bg">
                <th className="px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Concepto</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Proveedor</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Ruta</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Precio</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Vigencia</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider w-[60px]"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    {conteos.total === 0 ? (
                      <EmptyState onCreateClick={() => setModal({ mode: 'crear' })} onBulkClick={() => setView('masiva')} />
                    ) : (
                      <>
                        <DollarSign className="w-8 h-8 text-text-muted mx-auto mb-3" />
                        <p className="text-[13px] text-text-muted">Sin resultados para los filtros aplicados.</p>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map(t => {
                  const ev = estadoVigencia(t);
                  const badge = VIGENCIA_BADGE[ev];
                  return (
                    <tr key={t.id} className="border-b border-divider last:border-b-0 hover:bg-neutral-bg/50 transition-colors">
                      <td className="px-4 py-3 text-[13px] font-medium text-text-primary max-w-[180px] truncate">
                        {concMap.get(t.conceptoId) ?? t.conceptoId}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-text-secondary max-w-[160px] truncate">
                        {provMap.get(t.proveedorId) ?? t.proveedorId}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-text-muted max-w-[200px] truncate">
                        {buildRuta(t)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-[4px] text-[11px] font-medium ${
                          t.tipo === 'tarifario'
                            ? 'bg-info-bg text-info-text'
                            : 'bg-neutral-bg text-text-secondary'
                        }`}>
                          {t.tipo === 'tarifario' ? 'Tarifario' : 'Spot'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-text-primary tabular-nums font-mono whitespace-nowrap">
                        {formatPrecio(t)}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-text-muted max-w-[140px] truncate" title={t.vigenciaTexto}>
                        {t.vigenciaTexto}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setModal({ mode: 'editar', tarifa: t })}
                          className="p-1.5 rounded-lg text-text-muted hover:text-brand hover:bg-brand/10 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      {modal && (
        <TarifaFormModal
          mode={modal.mode}
          tarifa={modal.tarifa}
          onClose={() => setModal(null)}
          onCreate={createTarifa}
          onUpdate={updateTarifa}
        />
      )}
    </div>
  );
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function StatCard({ label, value, icon, cls }: { label: string; value: number; icon: React.ReactNode; cls: string }) {
  return (
    <div className="bg-white border border-card-border rounded-[10px] px-4 py-3 flex items-center gap-3 shadow-sm">
      <div className={`${cls} opacity-60`}>{icon}</div>
      <div>
        <p className={`text-[18px] font-bold tabular-nums ${cls}`}>{value}</p>
        <p className="text-[11px] text-text-muted font-medium">{label}</p>
      </div>
    </div>
  );
}

function EmptyState({ onCreateClick, onBulkClick }: { onCreateClick: () => void; onBulkClick: () => void }) {
  return (
    <div className="py-8 px-4">
      <div className="w-12 h-12 rounded-full bg-brand/10 flex items-center justify-center mx-auto mb-4">
        <DollarSign className="w-6 h-6 text-brand" />
      </div>
      <h3 className="text-[15px] font-semibold text-text-primary mb-2">Sin tarifas cargadas</h3>
      <p className="text-[13px] text-text-muted max-w-md mx-auto leading-relaxed mb-5">
        Las tarifas son los precios pactados con tus proveedores. Al cargar tarifas, el sistema las
        sugerirá automáticamente al armar cotizaciones — sin recapturar precios cada vez.
      </p>
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onCreateClick}
            className="flex items-center gap-2 bg-brand text-white px-5 py-2.5 rounded-[8px] text-[13px] font-medium hover:bg-brand-hover transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Crear primera tarifa
          </button>
          <button
            onClick={onBulkClick}
            className="flex items-center gap-2 border border-card-border text-text-secondary px-5 py-2.5 rounded-[8px] text-[13px] font-medium hover:border-brand hover:text-brand transition-colors"
          >
            <Upload className="w-4 h-4" />
            Carga masiva
          </button>
        </div>
        <p className="text-[11px] text-text-muted">
          La carga masiva permite importar un tarifario completo de un jalón.
        </p>
      </div>
    </div>
  );
}
