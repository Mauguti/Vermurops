/**
 * BandejaOC.tsx
 *
 * Bandeja de Órdenes de Compra integrada en Finanzas → Cuentas por pagar.
 * Muestra las OCs con filtros por estado, búsqueda, y tabla interactiva.
 */

import React, { useState, useMemo } from 'react';
import { Search, Filter, Download, Clock, Settings, CheckCircle, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import type { OrdenCompra, EstadoOC } from './OrdenesCompraData';
import { ESTADOS_OC_MAP } from './OrdenesCompraData';

// ─── Props ──────────────────────────────────────────────────────────────────

interface BandejaOCProps {
  ordenes: OrdenCompra[];
  loading: boolean;
  conteosPorEstado: Record<EstadoOC, number>;
  onSelectOC?: (oc: OrdenCompra) => void;
}

// ─── Íconos por estado ──────────────────────────────────────────────────────

const ESTADO_ICON: Record<EstadoOC, React.ReactNode> = {
  solicitada:  <Clock className="w-3.5 h-3.5" />,
  en_gestion:  <Settings className="w-3.5 h-3.5" />,
  autorizada:  <CheckCircle className="w-3.5 h-3.5" />,
  pagada:      <CheckCircle2 className="w-3.5 h-3.5" />,
  rechazada:   <XCircle className="w-3.5 h-3.5" />,
};

// ─── Filtros de estado ──────────────────────────────────────────────────────

type FiltroEstado = 'todos' | EstadoOC;

const FILTROS: { id: FiltroEstado; label: string }[] = [
  { id: 'todos', label: 'Todas' },
  { id: 'solicitada', label: 'Solicitadas' },
  { id: 'en_gestion', label: 'En gestión' },
  { id: 'autorizada', label: 'Autorizadas' },
  { id: 'pagada', label: 'Pagadas' },
  { id: 'rechazada', label: 'Rechazadas' },
];

// ─── Componente ─────────────────────────────────────────────────────────────

export default function BandejaOC({ ordenes, loading, conteosPorEstado, onSelectOC }: BandejaOCProps) {
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos');
  const [searchTerm, setSearchTerm] = useState('');

  // Filtrado
  const ordenesFiltradas = useMemo(() => {
    let resultado = ordenes;

    // Filtro por estado
    if (filtroEstado !== 'todos') {
      resultado = resultado.filter(oc => oc.estado === filtroEstado);
    }

    // Búsqueda
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      resultado = resultado.filter(oc =>
        oc.folio.toLowerCase().includes(term) ||
        oc.proveedorNombre.toLowerCase().includes(term) ||
        oc.conceptoNombre.toLowerCase().includes(term) ||
        (oc.clienteNombre && oc.clienteNombre.toLowerCase().includes(term)) ||
        (oc.embarqueFolio && oc.embarqueFolio.toLowerCase().includes(term))
      );
    }

    return resultado;
  }, [ordenes, filtroEstado, searchTerm]);

  const totalFiltrado = ordenesFiltradas.length;

  // Conteo para badges de filtro
  const getConteo = (filtro: FiltroEstado): number => {
    if (filtro === 'todos') return ordenes.length;
    return conteosPorEstado[filtro] || 0;
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Folio', 'Estado', 'Proveedor', 'Concepto', 'Monto', 'Moneda', 'Urgencia', 'Fecha requerida', 'Origen', 'Cliente'];
    const rows = ordenesFiltradas.map(oc => [
      oc.folio,
      ESTADOS_OC_MAP[oc.estado].label,
      oc.proveedorNombre,
      oc.conceptoNombre,
      oc.monto,
      oc.moneda,
      oc.urgencia,
      oc.fechaRequerida,
      oc.origen,
      oc.clienteNombre || '',
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(f => `"${String(f).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `ordenes_compra_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center p-[60px]">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-brand border-t-transparent" />
        <span className="ml-3 text-[13px] text-text-secondary">Cargando órdenes de compra...</span>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (ordenes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-[60px] border border-dashed border-card-border rounded-[8px] bg-white">
        <CheckCircle className="w-[32px] h-[32px] text-text-muted mb-[16px]" />
        <p className="text-[14px] font-medium text-text-primary mb-[4px]">Sin órdenes de compra</p>
        <p className="text-[13px] text-text-secondary text-center max-w-[300px]">
          Las órdenes de compra aparecerán aquí cuando Pricing las solicite desde una cotización o embarque.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-[20px]">
      {/* Filtros por estado */}
      <div className="flex flex-wrap gap-[8px]">
        {FILTROS.map(f => {
          const count = getConteo(f.id);
          const isActive = filtroEstado === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFiltroEstado(f.id)}
              className={`px-[12px] py-[6px] rounded-[6px] text-[12px] font-medium transition-colors border ${
                isActive
                  ? 'bg-brand text-white border-brand'
                  : 'bg-white text-text-secondary border-card-border hover:bg-neutral-bg'
              }`}
            >
              {f.label}
              {count > 0 && (
                <span className={`ml-[6px] px-[6px] py-[1px] rounded-full text-[10px] font-bold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-neutral-bg text-text-muted'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Barra de búsqueda y acciones */}
      <div className="flex gap-[12px] items-center">
        <div className="relative max-w-[400px] flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Buscar folio, proveedor, concepto, cliente..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-[36px] bg-white border border-card-border rounded-[8px] p-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm text-text-primary"
          />
        </div>
        <button
          onClick={handleExportCSV}
          className="flex items-center text-[13px] font-medium text-text-secondary bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] hover:bg-neutral-bg transition-colors shadow-sm"
        >
          <Download className="w-4 h-4 mr-2" /> Exportar
        </button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto border border-divider rounded-[8px]">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Folio</th>
              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Estado</th>
              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Proveedor</th>
              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Concepto</th>
              <th className="bg-canvas text-right px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Monto</th>
              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Urgencia</th>
              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Fecha requerida</th>
              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Origen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider bg-white">
            {ordenesFiltradas.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-[16px] py-[40px] text-center text-[13px] text-text-muted">
                  No hay órdenes de compra que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              ordenesFiltradas.map(oc => {
                const estadoCfg = ESTADOS_OC_MAP[oc.estado];
                return (
                  <tr
                    key={oc.id}
                    onClick={() => onSelectOC?.(oc)}
                    className="hover:bg-neutral-bg transition-colors cursor-pointer group"
                  >
                    <td className="px-[16px] py-[12px] text-[13px] font-medium text-text-primary whitespace-nowrap">
                      {oc.folio}
                    </td>
                    <td className="px-[16px] py-[12px]">
                      <span className={`inline-flex items-center gap-1.5 px-[8px] py-[3px] rounded-[4px] text-[11px] font-medium border ${estadoCfg.color}`}>
                        {ESTADO_ICON[oc.estado]}
                        {estadoCfg.label}
                      </span>
                    </td>
                    <td className="px-[16px] py-[12px] text-[13px] text-text-primary truncate max-w-[180px]">
                      {oc.proveedorNombre}
                    </td>
                    <td className="px-[16px] py-[12px] text-[13px] text-text-secondary truncate max-w-[180px]">
                      {oc.conceptoNombre}
                    </td>
                    <td className="px-[16px] py-[12px] text-[13px] font-medium text-text-primary text-right tabular-nums whitespace-nowrap">
                      ${oc.monto.toLocaleString()} {oc.moneda}
                    </td>
                    <td className="px-[16px] py-[12px]">
                      {oc.urgencia === 'urgente' ? (
                        <span className="inline-flex items-center gap-1 px-[8px] py-[3px] rounded-[4px] text-[11px] font-medium bg-red-100 text-red-700 border border-red-300">
                          <AlertTriangle className="w-3 h-3" />
                          Urgente
                        </span>
                      ) : (
                        <span className="text-[12px] text-text-muted">Normal</span>
                      )}
                    </td>
                    <td className="px-[16px] py-[12px] text-[13px] text-text-secondary whitespace-nowrap">
                      {oc.fechaRequerida}
                    </td>
                    <td className="px-[16px] py-[12px] text-[13px] text-text-secondary whitespace-nowrap">
                      {oc.origen === 'embarque' ? (
                        <span className="text-info-text font-medium">{oc.embarqueFolio || 'Embarque'}</span>
                      ) : (
                        <span className="text-text-muted">Oficina</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer con total */}
      <div className="flex justify-between items-center text-[12px] text-text-muted px-[4px]">
        <span>{totalFiltrado} orden{totalFiltrado !== 1 ? 'es' : ''} de compra</span>
        {filtroEstado === 'autorizada' && (
          <span className="font-medium text-text-primary">
            Total por pagar: ${ordenesFiltradas.reduce((acc, oc) => acc + oc.monto, 0).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
