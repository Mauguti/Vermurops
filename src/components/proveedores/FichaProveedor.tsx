import React, { useState, useMemo } from 'react';
import { ChevronRight, Phone, Mail, Check, BookOpen } from 'lucide-react';
import { ProveedorVermur, contactoPrincipal } from './ProveedoresData';
import { PIPELINE_STAGES } from '../quotes/QuotesData';
import type { KanbanQuote } from '../quotes/QuotesData';
import { extraerHistorialProveedor, calcularResumenProveedor, formatTotalesPorMoneda } from '../../lib/historialProveedor';

interface Props {
  proveedor: ProveedorVermur;
  quotes: KanbanQuote[];
  onBack: () => void;
  onEdit: () => void;
}

const getTransportLabel = (type: string) => {
  switch (type) {
    case 'aereo': return 'Aereo';
    case 'maritimo': return 'Maritimo';
    case 'terrestre': return 'Terrestre';
    case 'aduanal': return 'Aduanal';
    case 'proveedor': return 'Proveedor';
    case 'transportista': return 'Transportista';
    case 'agente_carga': return 'Agente';
    default: return type;
  }
};

export default function FichaProveedor({ proveedor, quotes, onBack, onEdit }: Props) {
  const [fichaTab, setFichaTab] = useState<'historial' | 'notas'>('historial');

  const cp = contactoPrincipal(proveedor);

  const provHistorial = useMemo(
    () => extraerHistorialProveedor(quotes, proveedor.id, proveedor.nombre),
    [quotes, proveedor.id, proveedor.nombre],
  );

  const provResumen = useMemo(
    () => calcularResumenProveedor(provHistorial),
    [provHistorial],
  );

  const etapaLabel = (etapa: string) =>
    PIPELINE_STAGES.find(s => s.id === etapa)?.label ?? etapa;

  return (
    <div className="space-y-[24px]">
      {/* Header Ficha Proveedor */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-[8px] text-[13px] text-text-secondary">
          <button onClick={onBack} className="hover:text-text-primary transition-colors">Proveedores</button>
          <ChevronRight className="w-4 h-4 text-text-muted" />
          <span className="text-text-primary font-medium">{proveedor.nombre}</span>
        </div>
        <div className="flex space-x-[12px]">
           <button
             onClick={onEdit}
             className="bg-white border border-card-border text-text-primary px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium hover:bg-neutral-bg transition-colors shadow-sm"
           >
             Editar Datos
           </button>
           <button className="bg-brand text-white px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors">
             Nueva Solicitud
           </button>
        </div>
      </div>

      <div className="bg-card rounded-[12px] border border-card-border shadow-sm overflow-hidden flex flex-col md:flex-row">
        {/* Main Content (Left 2/3) */}
        <div className="flex-1 border-r border-divider flex flex-col">
          <div className="p-[32px] border-b border-divider bg-white">
            <div className="flex justify-between items-start">
              <div className="flex items-center space-x-[16px] mb-[16px]">
                <div className="w-[64px] h-[64px] bg-brand/10 border border-brand/20 rounded-[12px] flex items-center justify-center text-[24px] font-bold text-brand">
                  {proveedor.nombre.charAt(0)}
                </div>
                <div>
                  <h2 className="text-[24px] font-semibold text-text-primary tracking-tight leading-none mb-[8px]">{proveedor.nombre}</h2>
                  <div className="flex items-center text-[13px] space-x-[12px]">
                    <span className="text-text-secondary font-mono">RFC: {proveedor.rfc ?? proveedor.numeroEntidadMagaya ?? '—'}</span>
                    <span className="text-divider">•</span>
                    <a href={`http://${proveedor.website}`} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                      {proveedor.website}
                    </a>
                  </div>
                </div>
              </div>

              <span className={`px-[10px] py-[4px] rounded-md text-[12px] font-semibold tracking-wide ${proveedor.activo ? 'bg-success-bg text-success-text' : 'bg-neutral-bg text-text-secondary'}`}>
                {proveedor.activo ? 'PROVEEDOR ACTIVO' : 'INACTIVO'}
              </span>
            </div>

            <div className="mt-[24px] pt-[24px] border-t border-divider">
              <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-[12px]">Modalidades Soportadas</h4>
              <div className="flex flex-wrap gap-4">
                {['maritimo', 'aereo', 'terrestre', 'aduanal'].map(mod => {
                  const isSupported = proveedor.modalidades?.includes(mod as any) ?? false;
                  return (
                    <div key={mod} className={`flex items-center border rounded-lg px-3 py-2 ${isSupported ? 'border-brand/30 bg-brand/5' : 'border-card-border bg-canvas opacity-50'}`}>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center mr-2 ${isSupported ? 'bg-brand border-brand' : 'border-text-muted'}`}>
                        {isSupported && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className={`text-[12px] font-semibold uppercase tracking-wide ${isSupported ? 'text-brand' : 'text-text-muted'}`}>
                        {getTransportLabel(mod)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {cp && (
            <div className="flex flex-wrap gap-[24px] mt-[24px] pt-[24px] border-t border-divider">
              <div className="flex-1 min-w-[200px]">
                <p className="text-[11px] font-medium text-text-muted mb-[4px]">Contacto Principal</p>
                <p className="text-[15px] font-semibold text-text-primary">{cp.nombre}</p>
                <p className="text-[13px] text-text-secondary">{cp.puesto ?? cp.tipo ?? ''}</p>
              </div>
              <div className="flex-1 min-w-[200px]">
                <p className="text-[11px] font-medium text-text-muted mb-[4px]">Contacto Rapido</p>
                <div className="space-y-1">
                  <p className="text-[14px] font-medium text-text-primary flex items-center"><Mail className="w-4 h-4 mr-2 text-text-muted"/> {cp.email}</p>
                  <p className="text-[14px] font-medium text-text-primary flex items-center"><Phone className="w-4 h-4 mr-2 text-text-muted"/> {cp.telefono ?? '—'}</p>
                </div>
              </div>
            </div>
            )}
          </div>

          {/* Internal Tabs Provider */}
          <div className="px-[32px] border-b border-divider bg-canvas">
            <nav className="-mb-px flex space-x-[24px]">
              {([['historial', 'Historial de Cotizaciones'], ['notas', 'Notas Internas']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFichaTab(key)}
                  className={`py-[16px] px-[4px] text-[13px] font-medium transition-colors border-b-[2px] ${
                    fichaTab === key
                      ? 'border-brand text-text-primary'
                      : 'border-transparent text-text-muted hover:text-text-secondary hover:border-text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-[32px] flex-1 bg-white">
            {/* Tab: Historial de Cotizaciones */}
            {fichaTab === 'historial' && (
              <>
                <h3 className="text-[15px] font-semibold text-text-primary mb-4">
                  Cotizaciones de {proveedor.nombre}
                </h3>

                {provHistorial.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 border border-dashed border-card-border rounded-lg bg-canvas text-text-muted">
                    <BookOpen className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-[13px] font-medium">Sin participacion en cotizaciones</p>
                    <p className="text-[11px] mt-1">Cuando este proveedor participe en una cotizacion, su historial aparecera aqui.</p>
                  </div>
                ) : (
                  <div className="border border-card-border rounded-lg overflow-hidden">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="bg-canvas border-b border-divider text-left">
                          <th className="px-3 py-2.5 text-[10px] font-bold text-text-muted uppercase tracking-wider">Folio</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold text-text-muted uppercase tracking-wider">Fecha</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold text-text-muted uppercase tracking-wider">Concepto</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold text-text-muted uppercase tracking-wider">Etapa</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold text-text-muted uppercase tracking-wider text-right">Monto</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold text-text-muted uppercase tracking-wider text-center">Elegida</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-divider">
                        {provHistorial.map((r, i) => (
                          <tr key={`${r.folio}-${r.concepto}-${i}`} className="hover:bg-canvas/50 transition-colors">
                            <td className="px-3 py-2.5 font-mono font-medium text-brand">{r.folio}</td>
                            <td className="px-3 py-2.5 text-text-secondary">{r.fecha.slice(0, 10)}</td>
                            <td className="px-3 py-2.5 text-text-primary font-medium truncate max-w-[160px]">{r.concepto}</td>
                            <td className="px-3 py-2.5 text-text-secondary">{etapaLabel(r.etapa)}</td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary">
                              ${r.monto.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {r.moneda}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {r.seleccionada ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-success-text bg-success-bg px-1.5 py-0.5 rounded">
                                  <Check className="w-3 h-3" /> Si
                                </span>
                              ) : (
                                <span className="text-text-muted">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* Tab: Notas Internas */}
            {fichaTab === 'notas' && (
              <>
                <h3 className="text-[15px] font-semibold text-text-primary mb-3">Notas Internas (Pricing / Operaciones)</h3>
                <div className="bg-warning-bg border border-warning-border rounded-lg p-4">
                  <p className="text-[13px] text-warning-text leading-relaxed">{proveedor.notas || 'Sin notas.'}</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sidebar Resumen */}
        <div className="w-full md:w-[280px] bg-canvas shrink-0 p-[24px]">
          <h3 className="text-[14px] font-semibold text-text-primary mb-[20px]">Resumen Operativo</h3>
          <div className="space-y-4">
            <div className="bg-white border border-card-border p-4 rounded-lg shadow-sm">
              <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold mb-1">Total Cotizado</p>
              <p className={`font-bold text-text-primary ${provResumen.cotizacionesTotal > 0 ? 'text-[15px]' : 'text-[20px]'}`}>
                {formatTotalesPorMoneda(provResumen.totalCotizado)}
              </p>
            </div>
            <div className="bg-white border border-card-border p-4 rounded-lg shadow-sm">
              <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold mb-1">Cotizaciones Atendidas</p>
              <p className="text-[20px] font-bold text-text-primary">
                {provResumen.cotizacionesTotal > 0
                  ? `${provResumen.cotizacionesAtendidas} / ${provResumen.cotizacionesTotal}`
                  : '—'}
              </p>
            </div>
            <div className="bg-white border border-card-border p-4 rounded-lg shadow-sm">
              <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold mb-1">Veces Elegido</p>
              <p className="text-[20px] font-bold text-text-primary">
                {provResumen.cotizacionesTotal > 0
                  ? provResumen.vecesSeleccionado
                  : '—'}
              </p>
            </div>
            <div className="bg-white border border-card-border p-4 rounded-lg shadow-sm">
              <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold mb-1">Cotizaciones Participadas</p>
              <p className="text-[20px] font-bold text-text-primary">
                {provResumen.cotizacionesUnicas > 0
                  ? provResumen.cotizacionesUnicas
                  : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
