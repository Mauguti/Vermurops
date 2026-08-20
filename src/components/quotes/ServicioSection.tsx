import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, BarChart2 } from 'lucide-react';
import {
  ServicioSolicitado, ConceptoCotizacion, CotizacionProveedor, TipoServicio,
  INCOTERMS,
} from './QuotesData';
import ComparativaPricing from './ComparativaPricing';
import type { ProveedorComparativa } from './ComparativaPricing';
import type { TarifaVermur } from '../tarifas/TarifasData';
import type { ConceptoVermur } from '../conceptos/ConceptosData';
import { ConceptoSection } from './ConceptoSection';

export interface ServicioSectionProps {
  key?: React.Key;
  servicio: ServicioSolicitado;
  rolActivo: 'ventas' | 'pricing' | 'admin';
  onUpdateServicio: (updated: ServicioSolicitado) => void;
  servicios: any[];
  renderIcon: any;
  moneda?: 'USD' | 'MXN';
  clientePreferidos?: string[];
  clienteVetados?: string[];
  diasCredito?: number;
  catalogoTarifas?: TarifaVermur[];
  onCrearTarifaSpot?: (t: TarifaVermur) => Promise<void>;
  /** FC-2: ID del concepto activo en el panel de tarifas. */
  activeConceptoId?: string;
  /** FC-2: callback para activar un concepto en el panel lateral. */
  onConceptoActivate?: (conceptoId: string) => void;
  /** FC-2: true si el panel lateral está visible. */
  panelVisible?: boolean;
  /** FC-2: callback cuando se abre/cierra una comparativa (D2). */
  onComparativaToggle?: (open: boolean) => void;
  /** CC-2: conceptos activos del catálogo para el selector. */
  conceptosActivos?: ConceptoVermur[];
  /** CC-3: callback para alta rápida de concepto. */
  onCrearConcepto?: () => void;
}

/** Detecta la modalidad de transporte por tipo (clave legacy o nombre) e icono. */
function getModality(tipo: string, icono: string): 'maritimo' | 'terrestre' | 'otro' {
  const t = tipo.toLowerCase();
  const i = icono.toLowerCase();
  if (t.includes('maritim') || t === 'flete internacional' || i === 'ship' || i === 'anchor') return 'maritimo';
  if (t.includes('terrestre') || t.includes('recolec') || i === 'truck' || i === 'map-pin') return 'terrestre';
  return 'otro';
}

export function ServicioSection({ servicio, rolActivo, onUpdateServicio, servicios, renderIcon, moneda, clientePreferidos, clienteVetados, diasCredito, catalogoTarifas, onCrearTarifaSpot, activeConceptoId, onConceptoActivate, panelVisible, onComparativaToggle, conceptosActivos, onCrearConcepto }: ServicioSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const [srvComparativaOpen, setSrvComparativaOpen] = useState(false);

  const openSrvComparativa = () => {
    setSrvComparativaOpen(true);
    onComparativaToggle?.(true);
  };
  const closeSrvComparativa = () => {
    setSrvComparativaOpen(false);
    onComparativaToggle?.(false);
  };

  const def = (servicios ?? []).find((s: any) => s.id === servicio.tipo);
  const nombreSrv = def?.nombre || servicio.tipo;
  const iconSrv = def?.icono || 'HelpCircle';
  const modality = getModality(servicio.tipo, iconSrv);

  const inputCls ='w-full text-xs text-gray-700 bg-transparent hover:bg-gray-50 border border-transparent hover:border-gray-200 rounded-lg px-2 py-1.5 focus:bg-white focus:border-[#E11D48] outline-none transition-all';

  const handleFieldChange = (field: keyof ServicioSolicitado | 'ruta_origen' | 'ruta_destino' | 'ruta_aduana_salida' | 'ruta_aduana_recepcion', value: any) => {
    if (field === 'ruta_origen') {
      onUpdateServicio({ ...servicio, ruta: { ...servicio.ruta, origen: value } });
    } else if (field === 'ruta_destino') {
      onUpdateServicio({ ...servicio, ruta: { ...servicio.ruta, destino: value } });
    } else if (field === 'ruta_aduana_salida') {
      onUpdateServicio({ ...servicio, ruta: { ...servicio.ruta, aduanaSalida: value } });
    } else if (field === 'ruta_aduana_recepcion') {
      onUpdateServicio({ ...servicio, ruta: { ...servicio.ruta, aduanaRecepcion: value } });
    } else {
      onUpdateServicio({ ...servicio, [field as any]: value });
    }
  };

  const handleAddConcepto = () => {
    const newConcepto: ConceptoCotizacion = {
      id: `conc-${Date.now()}`,
      nombre: 'Nuevo Concepto',
      costo: 0, profit: 0, venta: 0, margen: 0,
      subconceptos: [],
      tarifas: [],
      proveedorOficialId: null,
      proveedoresOficialIds: [],
    };
    onUpdateServicio({ ...servicio, conceptos: [...(servicio.conceptos || []), newConcepto] });
  };

  const handleDeleteConcepto = (concId: string) => {
    onUpdateServicio({ ...servicio, conceptos: (servicio.conceptos || []).filter(c => c.id !== concId) });
  };

  const handleUpdateConcepto = (updatedConcepto: ConceptoCotizacion) => {
    onUpdateServicio({
      ...servicio,
      conceptos: (servicio.conceptos || []).map(c => c.id === updatedConcepto.id ? updatedConcepto : c)
    });
  };

  return (
    <div className="border border-gray-150 rounded-xl overflow-hidden">
      {/* Cabecera del servicio */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between px-4 py-3 bg-gray-50/70 hover:bg-gray-50 cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border bg-gray-50 border-gray-200 text-gray-700`}>
            {renderIcon(iconSrv, "w-3.5 h-3.5")}
            <span className="uppercase">{nombreSrv}</span>
          </span>
          <span className="text-xs text-gray-500 truncate">
            {servicio.ruta?.origen?.split(',')[0]} → {servicio.ruta?.destino?.split(',')[0]}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded
            ${servicio.estado === 'cotizado' ? 'bg-green-100 text-green-700' :
              servicio.estado === 'solicitado_proveedores' ? 'bg-amber-100 text-amber-700' :
              'bg-gray-100 text-gray-500'}`}
          >
            {servicio.estado === 'cotizado' ? '✓ Cotizado'
              : servicio.estado === 'solicitado_proveedores' ? 'En espera'
              : 'Pendiente'}
          </span>
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
        </div>
      </div>

      {/* Cuerpo del servicio */}
      {expanded && (
        <div className="px-4 pb-4 pt-3 space-y-4 bg-white">
          {/* Datos de Ruta */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Origen</label>
              <input type="text" value={servicio.ruta?.origen} onChange={e => handleFieldChange('ruta_origen', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Destino</label>
              <input type="text" value={servicio.ruta?.destino} onChange={e => handleFieldChange('ruta_destino', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Aduana Salida</label>
              <input type="text" value={servicio.ruta?.aduanaSalida || ''} onChange={e => handleFieldChange('ruta_aduana_salida', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Aduana Recepción</label>
              <input type="text" value={servicio.ruta?.aduanaRecepcion || ''} onChange={e => handleFieldChange('ruta_aduana_recepcion', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Incoterm</label>
              <select value={servicio.incoterm} onChange={e => handleFieldChange('incoterm', e.target.value)} className={inputCls}>
                {INCOTERMS.map(inc => <option key={inc} value={inc}>{inc}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Mercancía</label>
              <input type="text" value={servicio.mercancia} onChange={e => handleFieldChange('mercancia', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Peso (kg)</label>
              <input type="number" value={servicio.peso || ''} onChange={e => handleFieldChange('peso', Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Volumen (m³)</label>
              <input type="number" value={servicio.volumen || ''} onChange={e => handleFieldChange('volumen', Number(e.target.value))} className={inputCls} />
            </div>
          </div>

          {/* ── E4: Campos condicionales de embarque ──────────────────────── */}
          {modality === 'maritimo' && (
            <div className="border-t border-blue-100 pt-3 space-y-3">
              <h5 className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">Embarque Marítimo</h5>
              {/* Selector FCL / LCL / Ninguno */}
              <div className="flex items-center gap-2">
                {(['FCL', 'LCL', 'ninguno'] as const).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleFieldChange('tipo_embarque', opt)}
                    className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all
                      ${servicio.tipo_embarque === opt
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}
                  >
                    {opt === 'ninguno' ? 'Ninguno' : opt}
                  </button>
                ))}
              </div>

              {/* FCL fields */}
              {servicio.tipo_embarque === 'FCL' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Contenedor</label>
                    <select value={servicio.fcl_contenedor || ''} onChange={e => handleFieldChange('fcl_contenedor', e.target.value)} className={inputCls}>
                      <option value="">— Tipo —</option>
                      {["20' GP", "40' GP", "40' HC", "20' Reef", "40' Reef", "45' HC"].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Peso FCL</label>
                    <div className="flex gap-1">
                      <input type="number" value={servicio.fcl_peso || ''} onChange={e => handleFieldChange('fcl_peso', Number(e.target.value))} className={inputCls} placeholder="0" />
                      <select value={servicio.fcl_peso_unidad || 'kg'} onChange={e => handleFieldChange('fcl_peso_unidad', e.target.value)} className="text-xs border border-transparent hover:border-gray-200 bg-transparent rounded-lg px-1 focus:bg-white focus:border-[#E11D48] outline-none">
                        <option value="kg">kg</option><option value="tons">tons</option>
                      </select>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Requerimientos especiales</label>
                    <input type="text" value={servicio.fcl_reqs || ''} onChange={e => handleFieldChange('fcl_reqs', e.target.value)} className={inputCls} placeholder="Ej: temperatura controlada, humedad < 60%" />
                  </div>
                  <div className="col-span-2 flex flex-wrap gap-x-4 gap-y-2">
                    {([
                      ['food_grade', 'Food Grade'],
                      ['reforzado', 'Reforzado'],
                      ['sobredimension', 'Sobredimensión'],
                      ['enlonado', 'Enlonado'],
                      ['atmos_controlada', 'Atmósfera Controlada'],
                    ] as const).map(([field, label]) => (
                      <label key={field} className="flex items-center gap-1.5 text-[10px] text-gray-600 cursor-pointer select-none">
                        <input type="checkbox" checked={!!(servicio as any)[field]} onChange={e => handleFieldChange(field as keyof ServicioSolicitado, e.target.checked)} className="accent-blue-600" />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* LCL fields */}
              {servicio.tipo_embarque === 'LCL' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Núm. Pallets</label>
                    <input type="number" value={servicio.lcl_num_pallets || ''} onChange={e => handleFieldChange('lcl_num_pallets', Number(e.target.value))} className={inputCls} placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Cubicaje Total (CBM)</label>
                    <input type="number" value={servicio.lcl_cubicaje_total || ''} onChange={e => handleFieldChange('lcl_cubicaje_total', Number(e.target.value))} className={inputCls} placeholder="0.00" />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-1.5 text-[10px] text-gray-600 cursor-pointer select-none">
                      <input type="checkbox" checked={!!servicio.lcl_estibable} onChange={e => handleFieldChange('lcl_estibable', e.target.checked)} className="accent-blue-600" />
                      Estibable
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {modality === 'terrestre' && (
            <div className="border-t border-emerald-100 pt-3 space-y-3">
              <h5 className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Carga Terrestre</h5>
              {/* FTL / LTL selector */}
              <div className="flex items-center gap-2">
                {(['FTL', 'LTL'] as const).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleFieldChange('ter_tipo', opt)}
                    className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all
                      ${servicio.ter_tipo === opt
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Unidad</label>
                  <input type="text" value={servicio.ter_unidad || ''} onChange={e => handleFieldChange('ter_unidad', e.target.value)} className={inputCls} placeholder="Ej: Torton, Rabón, Caja 53'" />
                </div>
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Núm. Pallets</label>
                  <input type="number" value={servicio.ter_num_pallets || ''} onChange={e => handleFieldChange('ter_num_pallets', Number(e.target.value))} className={inputCls} placeholder="0" />
                </div>
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Peso</label>
                  <div className="flex gap-1">
                    <input type="number" value={servicio.ter_peso || ''} onChange={e => handleFieldChange('ter_peso', Number(e.target.value))} className={inputCls} placeholder="0" />
                    <select value={servicio.ter_peso_unidad || 'kg'} onChange={e => handleFieldChange('ter_peso_unidad', e.target.value)} className="text-xs border border-transparent hover:border-gray-200 bg-transparent rounded-lg px-1 focus:bg-white focus:border-[#E11D48] outline-none">
                      <option value="kg">kg</option><option value="tons">tons</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Medidas</label>
                  <input type="text" value={servicio.ter_medidas || ''} onChange={e => handleFieldChange('ter_medidas', e.target.value)} className={inputCls} placeholder="Ej: 120×100×80 cm" />
                </div>
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Volumen terrestre (m³)</label>
                  <input type="number" value={servicio.ter_volumen || ''} onChange={e => handleFieldChange('ter_volumen', Number(e.target.value))} className={inputCls} placeholder="0.00" />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-1.5 text-[10px] text-gray-600 cursor-pointer select-none">
                    <input type="checkbox" checked={!!servicio.ter_estibable} onChange={e => handleFieldChange('ter_estibable', e.target.checked)} className="accent-emerald-600" />
                    Estibable
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Conceptos */}
          <div className="border-t border-gray-150 pt-4 mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold text-[#E11D48] uppercase tracking-widest">
                Conceptos de Servicio
              </h4>
              {rolActivo !== 'ventas' && (
                <button onClick={handleAddConcepto} className="text-[9px] font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-wide flex items-center gap-1 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors">
                  <Plus className="w-3 h-3" /> Agregar Concepto
                </button>
              )}
            </div>

            {/* Comparativa a nivel servicio — siempre visible si 2+ cotizacionesProveedor */}
            {(() => {
              const srvCots = servicio.cotizacionesProveedor ?? [];
              const tieneSrvComparativa = srvCots.length >= 2;
              const enrichedSrvCots: ProveedorComparativa[] = srvCots.map(t => ({
                ...t,
                esPreferido: !!(t.proveedorId && clientePreferidos?.includes(t.proveedorId)),
                esVetado: !!(t.proveedorId && clienteVetados?.includes(t.proveedorId)),
              }));

              const handleSrvTarifasChange = (updatedItems: ProveedorComparativa[]) => {
                const nuevas: CotizacionProveedor[] = updatedItems.map(
                  ({ esPreferido, esVetado, tiempoTransitoDias, ...tarifa }) => tarifa
                );
                onUpdateServicio({ ...servicio, cotizacionesProveedor: nuevas });
              };

              const handleSrvProfitChange = (newProfit: number) => {
                onUpdateServicio({ ...servicio, profit: newProfit });
              };

              const rutaSrv = `${servicio.ruta?.origen?.split(',')[0] || ''} → ${servicio.ruta?.destino?.split(',')[0] || ''}`;
              const tieneConceptos = servicio.conceptos && servicio.conceptos.length > 0;

              if (srvComparativaOpen && tieneSrvComparativa) {
                return (
                  <div className="border border-gray-200 rounded-lg bg-gray-50/50 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={closeSrvComparativa}
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary hover:text-text-primary transition-colors"
                      >
                        <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                        Cerrar comparativa
                      </button>
                      <span className="text-[11px] font-bold text-[#18181B]">Comparativa del servicio · {nombreSrv}</span>
                    </div>
                    <ComparativaPricing
                      concepto={nombreSrv}
                      ruta={rutaSrv}
                      tipoContenedor={servicio.fcl_contenedor}
                      moneda={moneda ?? 'USD'}
                      cotizaciones={enrichedSrvCots}
                      sinRespuesta={[]}
                      totalSolicitados={enrichedSrvCots.length}
                      profitInicial={servicio.profit || 0}
                      diasCredito={diasCredito ?? 30}
                      onTarifasChange={handleSrvTarifasChange}
                      onProfitChange={handleSrvProfitChange}
                    />
                  </div>
                );
              }

              if (!tieneSrvComparativa && srvCots.length === 0 && !tieneConceptos) {
                return <p className="text-[10px] text-gray-400 italic">No hay conceptos definidos.</p>;
              }

              if (srvCots.length === 0) return null;

              return (
                <div className="space-y-2">
                  <p className="text-[10px] text-gray-500">
                    {srvCots.length} cotización{srvCots.length !== 1 ? 'es' : ''} de proveedor a nivel servicio
                  </p>
                  {tieneSrvComparativa && rolActivo !== 'ventas' && (
                    <button
                      onClick={openSrvComparativa}
                      className="flex items-center gap-1 text-[9px] font-bold text-[#E11D48] hover:text-[#BE123C] uppercase tracking-wide hover:bg-[#E11D48]/5 px-2 py-1 rounded-lg transition-colors"
                    >
                      <BarChart2 className="w-3 h-3" />
                      Comparar servicio ({srvCots.length})
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Conceptos — siempre visibles si existen */}
            {servicio.conceptos && servicio.conceptos.length > 0 && (
              <div className="space-y-3">
                {servicio.conceptos.map(concepto => (
                  <ConceptoSection
                    key={concepto.id}
                    concepto={concepto}
                    rolActivo={rolActivo}
                    onUpdate={handleUpdateConcepto}
                    onDelete={() => handleDeleteConcepto(concepto.id)}
                    moneda={moneda}
                    ruta={`${servicio.ruta?.origen?.split(',')[0] || ''} → ${servicio.ruta?.destino?.split(',')[0] || ''}`}
                    clientePreferidos={clientePreferidos}
                    clienteVetados={clienteVetados}
                    diasCredito={diasCredito}
                    catalogoTarifas={catalogoTarifas}
                    contenedorTipo={servicio.fcl_contenedor}
                    onCrearTarifaSpot={onCrearTarifaSpot}
                    isActive={activeConceptoId === concepto.id}
                    onActivate={() => onConceptoActivate?.(concepto.id)}
                    panelVisible={panelVisible}
                    onComparativaToggle={onComparativaToggle}
                    servicioId={servicio.id}
                    conceptosActivos={conceptosActivos}
                    onCrearConcepto={onCrearConcepto}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
