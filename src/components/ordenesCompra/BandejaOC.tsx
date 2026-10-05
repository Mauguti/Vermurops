/**
 * BandejaOC.tsx
 *
 * Bandeja de Órdenes de Compra integrada en Finanzas → Cuentas por pagar.
 * Muestra las OCs con filtros por estado, búsqueda, y tabla interactiva.
 */

import React, { useState, useMemo } from 'react';
import { Search, Filter, Download, Clock, Settings, CheckCircle, CheckCircle2, XCircle, AlertTriangle, FileText } from 'lucide-react';
import { contiene } from '../../lib/texto';
import type { OrdenCompra, EstadoOC } from './OrdenesCompraData';
import { ESTADOS_OC_MAP } from './OrdenesCompraData';
import EstadoVacio from '../ui/EstadoVacio';
import { sumarPorMoneda, formatearPorMoneda } from '../../lib/sumarPorMoneda';
import type { ConceptoVermur } from '../conceptos/ConceptosData';
import { compararIVAFactura, etiquetaIVA, type EtiquetaIVA } from '../../lib/ivaOrdenCompra';
import VistaFacturasProveedor from './VistaFacturasProveedor';
import { usePreferenciasUsuario } from '../../hooks/usePreferenciasUsuario';

// ─── Props ──────────────────────────────────────────────────────────────────

interface BandejaOCProps {
  ordenes: OrdenCompra[];
  loading: boolean;
  conteosPorEstado: Record<EstadoOC, number>;
  onSelectOC?: (oc: OrdenCompra) => void;
  /** Tarea 36 · Catálogo de conceptos para resolver la regla IVA de cada OC. */
  conceptos?: ConceptoVermur[];
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

type FiltroIVA = 'todos' | EtiquetaIVA;

const FILTROS_IVA: { id: FiltroIVA; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'alerta', label: 'IVA no cuadra' },
  { id: 'pendiente', label: 'IVA pendiente' },
  { id: 'ok', label: 'IVA ok' },
];

export default function BandejaOC({ ordenes, loading, conteosPorEstado, onSelectOC, conceptos = [] }: BandejaOCProps) {
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos');
  const [filtroIVA, setFiltroIVA] = useState<FiltroIVA>('todos');
  const [searchTerm, setSearchTerm] = useState('');

  /*
   * Tarea 58 · Cómo se ve lo que se debe. Por proveedor es el default: es
   * como Julio lo lee, y es la vista donde una factura repartida en varias
   * órdenes deja de contarse dos veces. La preferencia se guarda por usuario
   * (preferenciasUsuario/{uid}) como la de cargos (§4.14): quien prefiera el
   * detalle orden por orden no lo vuelve a elegir cada vez.
   */
  const { prefs, guardar } = usePreferenciasUsuario();
  const vista: 'proveedor' | 'orden' = prefs.vistaCuentasPorPagar ?? 'proveedor';

  /** Mapa de conceptoId → reglaIVA para resolución rápida. */
  const reglasPorConcepto = useMemo(() => {
    const m = new Map<string, ConceptoVermur['reglaIVA']>();
    conceptos.forEach(c => { if (c.reglaIVA) m.set(c.id, c.reglaIVA); });
    return m;
  }, [conceptos]);

  /** Calcula la etiqueta IVA de una OC. */
  const etiquetaIVADeOC = (oc: OrdenCompra): EtiquetaIVA => {
    if (!oc.facturaDatos) return null;
    const regla = reglasPorConcepto.get(oc.conceptoId);
    const r = compararIVAFactura(oc, regla);
    return etiquetaIVA(r.estado);
  };

  /** Para que el estado vacío diga cuál de los dos vacíos es. */
  const hayFiltro = filtroEstado !== 'todos' || filtroIVA !== 'todos' || searchTerm.trim() !== '';

  // Filtrado
  const ordenesFiltradas = useMemo(() => {
    let resultado = ordenes;

    // Filtro por estado
    if (filtroEstado !== 'todos') {
      resultado = resultado.filter(oc => oc.estado === filtroEstado);
    }

    // Tarea 36 · Filtro por IVA
    if (filtroIVA !== 'todos') {
      resultado = resultado.filter(oc => etiquetaIVADeOC(oc) === filtroIVA);
    }

    // Búsqueda
    if (searchTerm.trim()) {
      const term = searchTerm.trim();
      resultado = resultado.filter(oc =>
        contiene(oc.folio, term) ||
        contiene(oc.proveedorNombre, term) ||
        contiene(oc.conceptoNombre, term) ||
        contiene(oc.clienteNombre, term) ||
        contiene(oc.embarqueFolio, term)
      );
    }

    return resultado;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenes, filtroEstado, filtroIVA, searchTerm, reglasPorConcepto]);

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
          Las órdenes de compra aparecerán aquí cuando Operaciones las solicite desde un embarque o Administración cargue un gasto de oficina.
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

      {/* Tarea 36 · Filtro de IVA */}
      <div className="flex flex-wrap gap-[6px]">
        {FILTROS_IVA.map(f => (
          <button
            key={f.id ?? 'todos'}
            onClick={() => setFiltroIVA(f.id)}
            className={`px-[10px] py-[4px] rounded-[5px] text-[11px] font-medium transition-colors border ${
              filtroIVA === f.id
                ? f.id === 'alerta' ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-brand text-white border-brand'
                : 'bg-white text-text-secondary border-card-border hover:bg-neutral-bg'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Barra de búsqueda y acciones */}
      {/* Tarea 58 · `flex-wrap`: con el toggle nuevo, a 390 px la barra ya no
          cabe en un renglón y «Exportar» se salía del borde. */}
      <div className="flex gap-[12px] items-center flex-wrap">
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
        {/* Tarea 58 · Por proveedor | Por orden */}
        <div className="flex rounded-[8px] border border-card-border overflow-hidden shrink-0">
          {([['proveedor', 'Por proveedor'], ['orden', 'Por orden']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => guardar('vistaCuentasPorPagar', id)}
              aria-pressed={vista === id}
              className={`text-[12px] font-medium px-[12px] py-[8px] transition-colors ${
                vista === id
                  ? 'bg-primario text-white'
                  : 'bg-white text-text-secondary hover:bg-neutral-bg'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={handleExportCSV}
          className="flex items-center text-[13px] font-medium text-text-secondary bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] hover:bg-neutral-bg transition-colors shadow-sm"
        >
          <Download className="w-4 h-4 mr-2" /> Exportar
        </button>
      </div>

      {/* Tarea 58 · Un renglón por factura del proveedor. El agrupado y el
          caso del duplicado viven en lib/facturasProveedor.ts. */}
      {vista === 'proveedor' && (
        <VistaFacturasProveedor
          ordenes={ordenesFiltradas}
          onSelectOC={onSelectOC}
          hayFiltro={hayFiltro}
        />
      )}

      {/* Tabla */}
      {vista === 'orden' && (
      <div className="overflow-x-auto border border-divider rounded-[8px]">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="bg-gray-50/70 text-left px-[16px] py-[12px] text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">Folio</th>
              <th className="bg-gray-50/70 text-left px-[16px] py-[12px] text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">Estado</th>
              <th className="bg-gray-50/70 text-left px-[16px] py-[12px] text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">Proveedor</th>
              <th className="bg-gray-50/70 text-left px-[16px] py-[12px] text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">Concepto</th>
              <th className="bg-canvas text-right px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Monto</th>
              <th className="bg-gray-50/70 text-left px-[16px] py-[12px] text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">Urgencia</th>
              <th className="bg-gray-50/70 text-left px-[16px] py-[12px] text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">Fecha requerida</th>
              <th className="bg-gray-50/70 text-left px-[16px] py-[12px] text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">Origen</th>
              <th className="bg-gray-50/70 text-left px-[16px] py-[12px] text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">IVA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider bg-white">
            {ordenesFiltradas.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  {/* U-6 · El vacío explica cuál de los dos es: no hay ninguna,
                      o el filtro las escondió. Antes decía siempre lo segundo. */}
                  <EstadoVacio
                    variante="plano"
                    icono={<FileText className="w-5 h-5" />}
                    titulo={hayFiltro
                      ? 'Ninguna orden coincide con los filtros'
                      : 'Todavía no hay órdenes de compra'}
                    detalle={hayFiltro
                      ? 'Quita los filtros para ver todas las órdenes.'
                      : 'Nacen del embarque cuando hay que pagarle a un proveedor, o se capturan sueltas para los gastos de oficina.'}
                  />
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
                    <td className="px-[16px] py-[12px]">
                      <BadgeIVA etiqueta={etiquetaIVADeOC(oc)} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* Footer con total. En la vista por proveedor no va: ahí el pie lo
          pone VistaFacturasProveedor, que cuenta renglones y no órdenes. */}
      {vista === 'orden' && (
      <div className="flex justify-between items-center text-[12px] text-text-muted px-[4px]">
        <span>{totalFiltrado} {totalFiltrado === 1 ? 'orden' : 'órdenes'} de compra</span>
        {/* §4.3 · Por moneda. Este pie era la CUARTA aparición del mismo bug:
            un reduce sobre `monto` sin mirar `moneda`, con el resultado
            rotulado como si fuera una sola. */}
        {filtroEstado === 'autorizada' && (
          <span className="font-medium text-text-primary">
            Total por pagar: {formatearPorMoneda(
              sumarPorMoneda(ordenesFiltradas, oc => oc.monto, oc => oc.moneda),
              { vacio: 'sin órdenes autorizadas' },
            )}
          </span>
        )}
      </div>
      )}
    </div>
  );
}

// ─── Tarea 36 · Badge de IVA ─────────────────────────────────────────────────

function BadgeIVA({ etiqueta }: { etiqueta: EtiquetaIVA }) {
  if (!etiqueta) return <span className="text-[11px] text-text-muted">—</span>;

  const estilos: Record<NonNullable<EtiquetaIVA>, string> = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    alerta: 'bg-amber-100 text-amber-800 border-amber-300',
    pendiente: 'bg-gray-100 text-gray-500 border-gray-200',
  };
  const textos: Record<NonNullable<EtiquetaIVA>, string> = {
    ok: 'OK',
    alerta: 'No cuadra',
    pendiente: 'Pendiente',
  };

  return (
    <span className={`inline-flex items-center gap-1 px-[6px] py-[2px] rounded-[4px] text-[10px] font-bold border ${estilos[etiqueta]}`}>
      {etiqueta === 'alerta' && <AlertTriangle className="w-3 h-3" />}
      {textos[etiqueta]}
    </span>
  );
}
