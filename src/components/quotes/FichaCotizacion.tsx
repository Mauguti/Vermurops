import React, { useState } from 'react';
import {
  X, User, FileText, CheckSquare, Plus, Trash2, CheckCircle2, AlertTriangle,
  MessageSquare, Clock, Plane, Ship, Truck, ShieldCheck, ChevronDown, ChevronRight,
  Send, DollarSign, BarChart2, HelpCircle, Building2, Search, Link2,
} from 'lucide-react';
import {
  KanbanQuote, QuoteActivity, StageHistory, ORIGENES_PROSPECTO, PIPELINE_STAGES,
  ServicioSolicitado, ConceptoCotizacion, CotizacionProveedor, TipoServicio,
  INCOTERMS, Subconcepto, EQUIPO_PRICING, VENDEDORES, calcularTotalConsolidado,
  PipelineStageId,
} from './QuotesData';
import { ProveedorVermur, contactoPrincipal } from '../proveedores/ProveedoresData';
import { useProveedores } from '../../hooks/useProveedores';
import { useAuth } from '../../auth/AuthContext';
import { useNotifications } from '../../notifications/NotificationsContext';
import { crearNotificacionEtapa } from '../../notifications/notificationsStore';
import { useServicios, renderIcon } from '../../config/serviciosStore';
import { useClientes } from '../../hooks/useClientes';
import { storage } from '../../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { calcLinea } from '../../lib/cotizacionCalculator';
import { puedeTransicionarA, transicionesDisponibles } from '../../lib/stateMachine';

interface FichaCotizacionProps {
  quote: KanbanQuote | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateQuote: (quote: KanbanQuote) => void;
  onConvertToShipment: (quote: KanbanQuote) => void;
  /** Rol activo del usuario (Ventas o Pricing) */
  rolActivo: 'ventas' | 'pricing' | 'admin';
}

// ─── Formulario de proveedor ──────────────────────────────────────────────────

interface FormProveedorProps {
  onGuardar: (cp: CotizacionProveedor) => void;
  onCancelar: () => void;
  servicioTipo: TipoServicio;
  proveedores: ProveedorVermur[];
}

function FormProveedor({ onGuardar, onCancelar, servicioTipo, proveedores }: FormProveedorProps) {
  const [proveedor, setProveedor] = useState('');
  const [contacto, setContacto] = useState('');
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<'USD' | 'MXN'>('USD');
  const [tiempo, setTiempo] = useState('');
  const [vigencia, setVigencia] = useState('');
  const [condiciones, setCondiciones] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proveedor.trim() || !monto) return;
    
    setUploading(true);
    let adjuntoUrl: string | null = null;
    let archivoNombre: string | null = null;

    try {
      if (file) {
        const fileRef = ref(storage, `quotes/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(fileRef, file);
        adjuntoUrl = await getDownloadURL(snapshot.ref);
        archivoNombre = file.name;
      }
      onGuardar({
        id: `cp-${Date.now()}`,
        proveedor, contacto,
        monto: Number(monto), moneda,
        tiempoTransito: tiempo, vigencia, condiciones,
        adjuntoUrl, archivoNombre, seleccionada: false,
      });
    } catch (err) {
      console.error("Error subiendo archivo:", err);
      alert("Hubo un error al subir el archivo.");
    } finally {
      setUploading(false);
    }
  };

  const labelCls = 'block text-[9px] font-bold text-gray-400 uppercase mb-1';
  const inputCls = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400 bg-white';

  const availableProviders = proveedores.filter(p => p.activo && p.modalidades.includes(servicioTipo as any));

  const handleProveedorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const provName = e.target.value;
    setProveedor(provName);
    const provObj = availableProviders.find(p => p.nombre === provName);
    if (provObj) {
      const cp = contactoPrincipal(provObj);
      setContacto(cp?.nombre ?? '');
    } else {
      setContacto('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3.5 space-y-3 mt-2">
      <h6 className="text-[9px] font-bold text-indigo-700 uppercase tracking-widest">
        Nueva cotización de proveedor
      </h6>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Proveedor *</label>
          <select required value={proveedor} onChange={handleProveedorChange} className={inputCls}>
            <option value="">Seleccionar proveedor...</option>
            {availableProviders.map(p => (
              <option key={p.id} value={p.nombre}>{p.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Contacto</label>
          <input type="text" placeholder="Nombre" value={contacto}
            onChange={e => setContacto(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className={labelCls}>Monto *</label>
          <input required type="number" placeholder="3200" value={monto}
            onChange={e => setMonto(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Moneda</label>
          <select value={moneda} onChange={e => setMoneda(e.target.value as 'USD' | 'MXN')} className={inputCls}>
            <option value="USD">USD</option>
            <option value="MXN">MXN</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Tiempo de tránsito</label>
          <input type="text" placeholder="18-22 días" value={tiempo}
            onChange={e => setTiempo(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Vigencia</label>
          <input type="date" value={vigencia} onChange={e => setVigencia(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Condiciones / Notas</label>
        <textarea rows={2} placeholder="Condiciones especiales..." value={condiciones}
          onChange={e => setCondiciones(e.target.value)}
          className={`${inputCls} resize-none`} />
      </div>

      <div>
        <label className={labelCls}>Cotización del proveedor (adjunto)</label>
        <input 
          type="file" 
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={e => setFile(e.target.files?.[0] || null)}
          className="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200 focus:outline-none transition-all"
        />
        {file && <p className="text-[10px] text-gray-400 mt-1">Seleccionado: {file.name}</p>}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancelar} disabled={uploading}
          className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-700 uppercase disabled:opacity-50">
          Cancelar
        </button>
        <button type="submit" disabled={uploading}
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50">
          {uploading ? (
            <span className="flex items-center gap-1"><Clock className="w-3 h-3 animate-spin" /> Subiendo...</span>
          ) : (
            <span className="flex items-center gap-1"><Plus className="w-3 h-3" /> Guardar</span>
          )}
        </button>
      </div>
    </form>
  );
}

// ─── Sección de un servicio (accordion) ──────────────────────────────────────

interface ServicioSectionProps {
  key?: React.Key;
  servicio: ServicioSolicitado;
  rolActivo: 'ventas' | 'pricing' | 'admin';
  onUpdateServicio: (updated: ServicioSolicitado) => void;
  servicios: any[];
  renderIcon: any;
}

/** Detecta la modalidad de transporte por tipo (clave legacy o nombre) e icono. */
function getModality(tipo: string, icono: string): 'maritimo' | 'terrestre' | 'otro' {
  const t = tipo.toLowerCase();
  const i = icono.toLowerCase();
  if (t.includes('maritim') || t === 'flete internacional' || i === 'ship' || i === 'anchor') return 'maritimo';
  if (t.includes('terrestre') || t.includes('recolec') || i === 'truck' || i === 'map-pin') return 'terrestre';
  return 'otro';
}

export function ServicioSection({ servicio, rolActivo, onUpdateServicio, servicios, renderIcon }: ServicioSectionProps) {
  const [expanded, setExpanded] = useState(true);
  
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

            {(!servicio.conceptos || servicio.conceptos.length === 0) ? (
              <p className="text-[10px] text-gray-400 italic">No hay conceptos definidos.</p>
            ) : (
              <div className="space-y-3">
                {servicio.conceptos.map(concepto => (
                  <ConceptoSection 
                    key={concepto.id} 
                    concepto={concepto} 
                    rolActivo={rolActivo} 
                    onUpdate={handleUpdateConcepto} 
                    onDelete={() => handleDeleteConcepto(concepto.id)}
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

export function ConceptoSection({ concepto, rolActivo, onUpdate, onDelete }: { concepto: ConceptoCotizacion, rolActivo: string, onUpdate: (c: ConceptoCotizacion) => void, onDelete: () => void }) {
  const [newSubNombre, setNewSubNombre] = useState('');
  const [newSubCosto, setNewSubCosto] = useState('');

  const tarifaOficial = concepto.tarifas?.find(t => t.id === concepto.proveedorOficialId);
  const costoOficial = tarifaOficial ? tarifaOficial.monto : 0;
  const costoSubconceptos = (concepto.subconceptos || []).reduce((acc, sub) => acc + sub.costo, 0);
  const costoTotalConcepto = costoOficial + costoSubconceptos;
  // Usa calcLinea para mantener consistencia con la calculadora de E1
  const lineaCalc = calcLinea(costoTotalConcepto, concepto.profit || 0);
  const precioVenta = lineaCalc.venta;
  const margenRealPct = lineaCalc.margen * 100;

  // Persistir costo/venta/margen calculados cada vez que cambian subconceptos
  const updateConSubs = (newSubs: typeof concepto.subconceptos) => {
    const newCosto = costoOficial + newSubs.reduce((acc, s) => acc + s.costo, 0);
    const { venta, margen } = calcLinea(newCosto, concepto.profit || 0);
    onUpdate({ ...concepto, subconceptos: newSubs, costo: newCosto, venta, margen });
  };

  const handleAddSub = () => {
    if (!newSubNombre || !newSubCosto) return;
    const sub = { id: `sub-${Date.now()}`, nombre: newSubNombre, costo: Number(newSubCosto), moneda: 'USD' as const };
    updateConSubs([...(concepto.subconceptos || []), sub]);
    setNewSubNombre(''); setNewSubCosto('');
  };

  const handleRemoveSub = (subId: string) => {
    updateConSubs((concepto.subconceptos || []).filter(s => s.id !== subId));
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-gray-50/50 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <input 
          type="text" 
          value={concepto.nombre} 
          onChange={e => onUpdate({ ...concepto, nombre: e.target.value })} 
          className="text-xs font-bold text-[#18181B] bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#E11D48] outline-none px-1 py-0.5"
          placeholder="Nombre del concepto"
          readOnly={rolActivo === 'ventas'}
        />
        {rolActivo !== 'ventas' && (
          <button onClick={onDelete} className="text-gray-300 hover:text-red-500"><X className="w-4 h-4" /></button>
        )}
      </div>

      {/* Proveedor Oficial */}
      <div className="bg-white border border-gray-150 rounded p-2 text-xs flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-500">Proveedor Oficial:</span>{' '}
          {tarifaOficial ? (
            <span className="font-bold text-indigo-700">{tarifaOficial.proveedor}</span>
          ) : (
            <span className="text-gray-400 italic">Por definir en Bandeja Pricing</span>
          )}
        </div>
        <div className="font-black text-indigo-900 tabular-nums bg-indigo-50 px-2 py-0.5 rounded">
          ${costoOficial.toLocaleString()} {tarifaOficial?.moneda || 'USD'}
        </div>
      </div>

      {/* Subconceptos */}
      {concepto.subconceptos && concepto.subconceptos.length > 0 && (
        <div className="pl-4 space-y-1.5 border-l-2 border-gray-200">
          <p className="text-[9px] font-bold text-gray-400 uppercase">Subconceptos (Costos Adicionales)</p>
          {concepto.subconceptos.map(sub => (
            <div key={sub.id} className="flex justify-between items-center text-[11px] bg-white border border-gray-100 rounded px-2 py-1 shadow-sm">
              <span className="text-gray-600 font-medium">{sub.nombre}</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-700 tabular-nums">${sub.costo.toLocaleString()} {sub.moneda}</span>
                {rolActivo !== 'ventas' && <button onClick={() => handleRemoveSub(sub.id)} className="text-gray-300 hover:text-red-500"><X className="w-3 h-3" /></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add subconcepto */}
      {rolActivo !== 'ventas' && (
        <div className="flex gap-2 items-center pl-4 mt-2">
          <input type="text" placeholder="Nuevo subconcepto..." value={newSubNombre} onChange={e => setNewSubNombre(e.target.value)} className="flex-1 text-[10px] border border-gray-200 rounded px-2 py-1 outline-none focus:border-[#E11D48]" />
          <input type="number" placeholder="Costo" value={newSubCosto} onChange={e => setNewSubCosto(e.target.value)} className="w-20 text-[10px] border border-gray-200 rounded px-2 py-1 outline-none focus:border-[#E11D48]" />
          <button onClick={handleAddSub} className="text-[10px] bg-white border border-gray-200 hover:border-[#E11D48] hover:text-[#E11D48] px-2 py-1 rounded font-bold text-gray-600 transition-colors">Añadir</button>
        </div>
      )}

      {/* Financieros */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-indigo-50 p-2.5 rounded border border-indigo-100 mt-3 shadow-sm">
        <div className="text-[10px] text-gray-500 font-semibold uppercase flex flex-col">
          <span>Costo Total Concepto:</span>
          <span className="text-xs font-bold text-gray-700">${costoTotalConcepto.toLocaleString()}</span>
        </div>
        
        {rolActivo !== 'ventas' ? (
          <div className="flex items-center gap-2 border-l border-indigo-200 pl-3">
            <span className="text-[10px] text-indigo-600 font-bold uppercase">Profit: $</span>
            <input
              type="number"
              value={concepto.profit === 0 && !concepto.profit ? '' : concepto.profit}
              onChange={e => {
                const newProfit = Number(e.target.value) || 0;
                const { venta, margen } = calcLinea(costoTotalConcepto, newProfit);
                onUpdate({ ...concepto, profit: newProfit, costo: costoTotalConcepto, venta, margen });
              }}
              className="w-20 text-xs font-bold text-indigo-700 border border-indigo-200 focus:border-indigo-400 rounded px-1.5 py-1 outline-none text-right shadow-sm"
              placeholder="0"
            />
          </div>
        ) : (
          <div className="text-[10px] text-gray-500 font-semibold uppercase flex flex-col text-right border-l border-indigo-200 pl-3">
            <span>Margen:</span>
            <span className="text-xs font-bold text-gray-700">{margenRealPct.toFixed(1)}%</span>
          </div>
        )}

        <div className="text-right border-l border-indigo-200 pl-3">
          <span className="text-[10px] text-gray-500 font-semibold uppercase">Venta:</span>
          <p className="text-sm font-black text-indigo-900 tabular-nums">${precioVenta.toLocaleString()}</p>
          {rolActivo !== 'ventas' && (
            <p className="text-[9px] text-indigo-500/70 font-bold mt-0.5">{margenRealPct.toFixed(1)}% Margen</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal: FichaCotizacion
// ─────────────────────────────────────────────────────────────────────────────

export default function FichaCotizacion({
  quote, isOpen, onClose, onUpdateQuote, onConvertToShipment, rolActivo,
}: FichaCotizacionProps) {
  if (!quote || !isOpen) return null;

  const { user } = useAuth();
  const { agregarNotificacion } = useNotifications();
  const { servicios } = useServicios();
  const { clientes } = useClientes();

  const [activeTab, setActiveTab] = useState<'info' | 'servicios' | 'actividades' | 'historial' | 'chat'>('info');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [newChatMessage, setNewChatMessage] = useState('');
  const [showLossReasonForm, setShowLossReasonForm] = useState(false);
  const [lossReason, setLossReason] = useState('');

  // Buscador de cliente (E6.4): query de búsqueda por nombre/RFC.
  const [clienteQuery, setClienteQuery] = useState('');

  // Nuevo Servicio
  const [showAddServicio, setShowAddServicio] = useState(false);
  const [newServicioTipo, setNewServicioTipo] = useState<TipoServicio>('maritimo');

  // Actividades
  const [newActivityTitle, setNewActivityTitle] = useState('');
  const [newActivityDesc, setNewActivityDesc] = useState('');
  const [newActivityDate, setNewActivityDate] = useState('');
  const [newActivityType, setNewActivityType] = useState<QuoteActivity['tipo']>('tarea');
  const [newNoteText, setNewNoteText] = useState('');

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const isActivityOverdue = (dateStr: string) =>
    dateStr < new Date().toISOString().split('T')[0];

  const filterTasks = quote.actividades.filter(a => a.tipo !== 'cambio_etapa' && a.tipo !== 'nota');
  const filterNotes = quote.actividades.filter(a => (a.tipo === 'nota' && !a.parentId) || a.tipo === 'cambio_etapa');

  const handleAddServicio = () => {
    const newService: ServicioSolicitado = {
      id: `srv-${Date.now()}`,
      tipo: newServicioTipo,
      ruta: { origen: '', destino: '', aduanaSalida: '', aduanaRecepcion: '' },
      incoterm: 'FOB',
      mercancia: '',
      peso: 0,
      volumen: 0,
      estado: 'pendiente',
      cotizacionesProveedor: [], profit: 0, recargosPct: 0,
      conceptos: [],
    };
    onUpdateQuote({
      ...quote,
      servicios: [...quote.servicios, newService]
    });
    setShowAddServicio(false);
  };

  // ─── Handlers: stage ────────────────────────────────────────────────────

  const handleStageChange = (newEtapa: PipelineStageId, lossReasonText: string | null = null) => {
    if (quote.etapa === newEtapa) return;

    // ── Guard E5.2: validar transición antes de ejecutar ──────────────────
    const guard = puedeTransicionarA(quote.etapa, newEtapa, rolActivo, quote);
    if (!guard.ok) {
      alert(guard.razon ?? 'Transición no permitida.');
      return;
    }

    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');

    const prevLabel = PIPELINE_STAGES.find(s => s.id === quote.etapa)?.label ?? quote.etapa;
    const newLabel  = PIPELINE_STAGES.find(s => s.id === newEtapa)?.label ?? newEtapa;

    const newHistoryEntry: StageHistory = {
      etapa: newEtapa,
      fecha: fechaActual,
      nota: lossReasonText ? `Motivo de pérdida: ${lossReasonText}` : undefined,
    };

    const newActivityEntry: QuoteActivity = {
      id: `act-sys-${Date.now()}`,
      titulo: `Cambio de etapa: ${prevLabel} → ${newLabel}`,
      descripcion: lossReasonText ? `Motivo: ${lossReasonText}` : 'Transición de etapa comercial.',
      responsableId: quote.vendedorId,
      fechaLimite: fechaActual.split(' ')[0],
      estado: 'hecha',
      tipo: 'cambio_etapa',
      createdAt: fechaActual,
    };

    onUpdateQuote({
      ...quote,
      etapa: newEtapa,
      motivoPerdida: newEtapa === 'perdida' ? lossReasonText : null,
      estadoFinal: newEtapa === 'ganada' ? 'ganada' : newEtapa === 'perdida' ? 'perdida' : null,
      updatedAt: fechaActual,
      historialEtapas: [...quote.historialEtapas, newHistoryEntry],
      actividades: [...quote.actividades, newActivityEntry],
    });

    // Disparar notificación si aplica
    const notif = crearNotificacionEtapa(
      quote.id,
      quote.prospecto.empresa,
      quote.etapa,
      newEtapa,
      prevLabel,
      newLabel,
    );
    if (notif) agregarNotificacion(notif);
  };

  // ─── Handlers: servicios ─────────────────────────────────────────────────

  const handleUpdateServicio = (servicioId: string, updatedServicio: ServicioSolicitado) => {
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const nuevosServicios = quote.servicios.map(s =>
      s.id === servicioId ? updatedServicio : s
    );
    const nuevoTotal = calcularTotalConsolidado(nuevosServicios);
    onUpdateQuote({
      ...quote,
      servicios: nuevosServicios,
      valorTotalConsolidado: nuevoTotal,
      updatedAt: fechaActual,
    });
  };

  // ─── Handlers: campos generales ──────────────────────────────────────────

  const handleFieldChange = (section: 'prospecto' | 'general', field: string, value: any) => {
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');
    let updatedQuote: KanbanQuote = { ...quote, updatedAt: fechaActual };
    if (section === 'prospecto') {
      updatedQuote.prospecto = { ...quote.prospecto, [field]: value };
    } else {
      updatedQuote = { ...updatedQuote, [field]: value };
    }
    onUpdateQuote(updatedQuote);
  };

  // ─── Handlers: vínculo cliente (E6.4) ────────────────────────────────────
  // clienteId es una capa OPCIONAL sobre el prospecto embebido, no lo sustituye.

  const handleVincularCliente = (clienteId: string) => {
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');
    onUpdateQuote({ ...quote, clienteId, updatedAt: fechaActual });
    setClienteQuery('');
  };

  const handleDesvincularCliente = () => {
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');
    onUpdateQuote({ ...quote, clienteId: null, updatedAt: fechaActual });
  };

  // ─── Handlers: actividades ───────────────────────────────────────────────

  const handleAddActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActivityTitle.trim()) return;
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const newAct: QuoteActivity = {
      id: `act-${Date.now()}`,
      titulo: newActivityTitle,
      descripcion: newActivityDesc,
      responsableId: quote.vendedorId,
      fechaLimite: newActivityDate || new Date().toISOString().split('T')[0],
      estado: 'pendiente',
      tipo: newActivityType,
      createdAt: fechaActual,
    };
    onUpdateQuote({ ...quote, actividades: [...quote.actividades, newAct], updatedAt: fechaActual });
    setNewActivityTitle('');
    setNewActivityDesc('');
    setNewActivityDate('');
    setNewActivityType('tarea');
  };

  const handleToggleActivity = (actId: string) => {
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const updatedActs = quote.actividades.map(act =>
      act.id === actId
        ? { ...act, estado: act.estado === 'pendiente' ? 'hecha' as const : 'pendiente' as const }
        : act
    );
    onUpdateQuote({ ...quote, actividades: updatedActs, updatedAt: fechaActual });
  };

  const handleDeleteActivity = (actId: string) => {
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');
    onUpdateQuote({ ...quote, actividades: quote.actividades.filter(a => a.id !== actId), updatedAt: fechaActual });
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const nota: QuoteActivity = {
      id: `act-note-${Date.now()}`,
      titulo: 'Nota comercial',
      descripcion: newNoteText,
      responsableId: quote.vendedorId,
      fechaLimite: fechaActual.split(' ')[0],
      estado: 'hecha',
      tipo: 'nota',
      createdAt: fechaActual,
    };
    onUpdateQuote({ ...quote, actividades: [...quote.actividades, nota], updatedAt: fechaActual });
    setNewNoteText('');
  };

  const handleMarkLost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lossReason.trim()) return;
    handleStageChange('perdida', lossReason);
    setShowLossReasonForm(false);
    setLossReason('');
  };

  // ─── Total consolidado ───────────────────────────────────────────────────

  const totalConsolidado = quote.valorTotalConsolidado > 0
    ? quote.valorTotalConsolidado
    : calcularTotalConsolidado(quote.servicios);

  const serviciosConProveedor = quote.servicios.filter(
    s => (s.cotizacionesProveedor ?? []).some(cp => cp.seleccionada)
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  /** Etapas a las que el rol activo puede transicionar desde la etapa actual. */
  const disponibles = transicionesDisponibles(quote.etapa, rolActivo, quote);

  const inputCls ='w-full text-sm text-gray-700 bg-transparent hover:bg-gray-50 border border-transparent hover:border-gray-200 rounded-lg px-2.5 py-1.5 focus:bg-white focus:border-[#E11D48] outline-none transition-all';
  // Estilo atenuado/solo-lectura para campos del prospecto cuando hay cliente vinculado.
  const inputReadonlyCls = 'w-full text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none cursor-not-allowed';

  // Cliente vinculado (E6.4): fuente de verdad cuando clienteId existe en la colección.
  // Solo lectura en tiempo de render — NO se escribe en quote.prospecto.
  const clienteVinculado = quote.clienteId
    ? clientes.find(c => c.id === quote.clienteId) ?? null
    : null;

  const TABS = [
    { id: 'info', label: 'Información' },
    { id: 'servicios', label: `Servicios (${quote.servicios.length})` },
    { id: 'actividades', label: 'Actividades' },
    { id: 'historial', label: 'Historial / Notas' },
    { id: 'chat', label: 'Chat Interno' }
  ] as const;

  const renderConsolidadoPanel = () => {
    if (totalConsolidado === 0) return null;

    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <h4 className="text-[10px] font-bold text-[#18181B] uppercase tracking-widest flex items-center gap-1.5">
            <BarChart2 className="w-4 h-4 text-[#E11D48]" /> Desglose del Consolidado
          </h4>
        </div>
        
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            {quote.servicios.filter(s => (s.cotizacionesProveedor ?? []).some(cp => cp.seleccionada)).map(srv => {
              const def = (servicios ?? []).find(s => s.id === srv.tipo);
              const prov = (srv.cotizacionesProveedor ?? []).find(cp => cp.seleccionada)!;
              const linea = calcLinea(prov.monto, srv.profit);
              return (
                <div key={srv.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 text-xs">
                  <div className="flex-1">
                    <span className="font-bold text-[#18181B]">{def?.nombre || srv.tipo}</span>
                    <span className="text-[10px] text-gray-400 ml-2">Prov: {prov.proveedor}</span>
                  </div>
                  <div className="flex gap-6 shrink-0 text-right">
                    <div className="w-20">
                      <p className="text-[9px] text-gray-400 uppercase">Costo Base</p>
                      <p className="font-semibold text-gray-700 tabular-nums">${prov.monto.toLocaleString()}</p>
                    </div>
                    {rolActivo !== 'ventas' && (
                      <>
                        <div className="w-16">
                          <p className="text-[9px] text-gray-400 uppercase">Profit $</p>
                          <p className="font-semibold text-gray-700 tabular-nums">${(srv.profit || 0).toLocaleString()}</p>
                        </div>
                        <div className="w-16">
                          <p className="text-[9px] text-gray-400 uppercase">Margen</p>
                          <p className="font-semibold text-gray-700 tabular-nums">{(linea.margen * 100).toFixed(1)}%</p>
                        </div>
                      </>
                    )}
                    <div className="w-24">
                      <p className="text-[9px] text-indigo-400 font-bold uppercase">Venta</p>
                      <p className="font-black text-indigo-900 tabular-nums">${linea.venta.toLocaleString()} {prov.moneda}</p>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Trámites aduanales agregados al consolidado */}
            {quote.servicios.filter(s => s.subTramites && s.subTramites.length > 0).map(srv => (
              srv.subTramites!.map(tram => (
                <div key={tram.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 text-xs">
                  <div className="flex-1">
                    <span className="font-bold text-gray-600">↳ Sub-trámite: {tram.nombre}</span>
                    <span className="text-[10px] text-gray-400 ml-2">Prov: {tram.proveedor}</span>
                  </div>
                  <div className="flex gap-6 shrink-0 text-right">
                    <div className="w-20">
                      <p className="text-[9px] text-gray-400 uppercase">Costo Base</p>
                      <p className="font-semibold text-gray-700 tabular-nums">${tram.costo.toLocaleString()}</p>
                    </div>
                    {rolActivo !== 'ventas' && (
                      <>
                        <div className="w-16" />
                        <div className="w-16">
                          <p className="text-[9px] text-gray-400 uppercase">Margen</p>
                          <p className="font-semibold text-gray-700 tabular-nums">{tram.margenPct}%</p>
                        </div>
                      </>
                    )}
                    <div className="w-24">
                      <p className="text-[9px] text-indigo-400 font-bold uppercase">Venta</p>
                      <p className="font-black text-indigo-900 tabular-nums">${(tram.costo * (1 + tram.margenPct / 100)).toLocaleString()} {tram.moneda}</p>
                    </div>
                  </div>
                </div>
              ))
            ))}
          </div>

          <div className="pt-4 border-t border-gray-200 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500 uppercase font-bold">Total Venta Consolidado</p>
              <p className="text-[9px] text-gray-400">
                Basado en {serviciosConProveedor.length} servicio{serviciosConProveedor.length !== 1 ? 's' : ''} con proveedor
              </p>
            </div>
            <p className="text-2xl font-black text-[#E11D48] tabular-nums">
              ${totalConsolidado.toLocaleString()} <span className="text-sm font-bold text-[#E11D48]/70">{quote.moneda}</span>
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[140] bg-black/40 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed inset-y-0 right-0 z-[150] w-full max-w-[600px] bg-white shadow-2xl border-l border-gray-200 flex flex-col h-full animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-mono font-bold text-gray-500">{quote.id}</span>
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide
                ${quote.etapa === 'ganada' ? 'bg-green-100 text-green-800' :
                  quote.etapa === 'perdida' ? 'bg-red-100 text-red-800' :
                  'bg-[#E11D48]/10 text-[#E11D48]'}`}
              >
                {PIPELINE_STAGES.find(s => s.id === quote.etapa)?.label}
              </span>
              {/* Rol activo */}
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide border
                ${rolActivo === 'pricing' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-[#E11D48]/5 text-[#E11D48] border-[#E11D48]/20'}`}
              >
                Vista: {rolActivo === 'pricing' ? 'Pricing' : 'Ventas'}
              </span>
            </div>
            <h2 className="text-xl font-bold text-[#18181B] mt-1 tracking-tight truncate max-w-[380px]">
              {quote.prospecto.empresa}
            </h2>
            {/* Total consolidado si existe */}
            {totalConsolidado > 0 && (
              <p className="text-sm font-black text-[#E11D48] mt-0.5 tabular-nums">
                Total: ${totalConsolidado.toLocaleString()} {quote.moneda}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-150 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 bg-white shrink-0 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setShowLossReasonForm(false); }}
              className={`flex-1 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all duration-200 whitespace-nowrap px-2
                ${activeTab === tab.id
                  ? 'border-[#E11D48] text-[#E11D48] bg-[#E11D48]/[0.02]'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50/50'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Contenido con scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ────────────── Tab: Información ────────────── */}
          {activeTab === 'info' && (
            <div className="space-y-6">

              {/* Etapa del Pipeline */}
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
                <label className="block text-[10px] font-bold text-[#18181B] uppercase tracking-wider">
                  Etapa del Pipeline
                </label>
                <select
                  value={quote.etapa}
                  onChange={e => {
                    const val = e.target.value as PipelineStageId;
                    if (val === 'perdida') setShowLossReasonForm(true);
                    else if (val === 'ganada') { onConvertToShipment(quote); handleStageChange(val); }
                    else handleStageChange(val);
                  }}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 outline-none focus:border-[#E11D48] shadow-xs"
                >
                  {/* Siempre muestra la etapa actual + solo las transiciones permitidas */}
                  {PIPELINE_STAGES
                    .filter(s => s.id === quote.etapa || disponibles.includes(s.id))
                    .map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>

                {quote.etapa === 'perdida' && quote.motivoPerdida && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-2.5 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div><span className="font-bold">Motivo de pérdida:</span> {quote.motivoPerdida}</div>
                  </div>
                )}

                {showLossReasonForm && (
                  <form onSubmit={handleMarkLost} className="space-y-2 pt-2 border-t border-gray-100">
                    <label className="block text-xs font-semibold text-red-700">Explica el motivo de pérdida:</label>
                    <input
                      type="text" required
                      placeholder="Ej. Precio muy alto, competencia, cobertura..."
                      value={lossReason}
                      onChange={e => setLossReason(e.target.value)}
                      className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm outline-none focus:border-red-500"
                    />
                    <div className="flex justify-end gap-2 text-xs font-bold uppercase">
                      <button type="button" onClick={() => setShowLossReasonForm(false)} className="px-3 py-1.5 text-gray-500">Cancelar</button>
                      <button type="submit" className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg">Marcar Perdida</button>
                    </div>
                  </form>
                )}
              </div>

              {/* Prospecto */}
              <div className="space-y-4">
                <h3 className="text-[10px] font-bold text-[#E11D48] uppercase tracking-widest border-b border-gray-100 pb-2 flex items-center gap-1.5">
                  <User className="w-4 h-4" /> Prospecto / Cliente
                </h3>

                {/* ── Capa de vínculo a Cliente (E6.4) ──────────────────────────
                    clienteId es OPCIONAL: si está seteado y el cliente existe,
                    se muestra la tarjeta del cliente vinculado. Si no, un buscador.
                    Los campos del prospecto embebido (abajo) NUNCA se tocan. */}
                {(() => {
                  if (clienteVinculado) {
                    const creditoLabel = clienteVinculado.tipoCredito === 'credito'
                      ? `Crédito ${clienteVinculado.dias} días`
                      : 'Contado';
                    return (
                      <div className="flex items-start justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-bold text-gray-800 truncate">{clienteVinculado.nombre}</span>
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-emerald-600 text-white tracking-wider">Cliente</span>
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-white border border-emerald-300 text-emerald-700 tracking-wider">{creditoLabel}</span>
                            </div>
                            {clienteVinculado.rfc && (
                              <div className="text-[10px] text-gray-500 font-mono mt-0.5">RFC {clienteVinculado.rfc}</div>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleDesvincularCliente}
                          className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-gray-400 hover:text-red-600 flex items-center gap-1"
                        >
                          <X className="w-3 h-3" /> Desvincular
                        </button>
                      </div>
                    );
                  }

                  // Sin vínculo: buscador por nombre / RFC sobre useClientes().
                  const q = clienteQuery.trim().toLowerCase();
                  const resultados = q
                    ? clientes
                        .filter(c => c.nombre.toLowerCase().includes(q) || c.rfc.toLowerCase().includes(q))
                        .slice(0, 6)
                    : [];
                  return (
                    <div className="relative">
                      <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg focus-within:border-[#E11D48]">
                        <Link2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <Search className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                        <input
                          type="text"
                          value={clienteQuery}
                          onChange={e => setClienteQuery(e.target.value)}
                          placeholder="Vincular cliente — buscar por nombre o RFC…"
                          className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
                        />
                      </div>
                      {q && (
                        <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                          {resultados.length === 0 ? (
                            <div className="px-3 py-2.5 text-xs text-gray-400">Sin clientes que coincidan con “{clienteQuery}”.</div>
                          ) : (
                            resultados.map(c => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => handleVincularCliente(c.id)}
                                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                              >
                                <div className="text-sm font-semibold text-gray-800 truncate">{c.nombre}</div>
                                <div className="text-[10px] text-gray-400 font-mono">
                                  {c.rfc || 'Sin RFC'} · {c.tipoCredito === 'credito' ? `Crédito ${c.dias} días` : 'Contado'}
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {clienteVinculado && (
                  <p className="text-[9px] text-gray-400 italic -mb-1">
                    Datos del cliente vinculado — edítalos en la ficha del Cliente.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Razón Social</label>
                    <input type="text"
                      value={clienteVinculado ? clienteVinculado.nombre : quote.prospecto.empresa}
                      onChange={e => handleFieldChange('prospecto', 'empresa', e.target.value)}
                      readOnly={!!clienteVinculado}
                      className={clienteVinculado ? inputReadonlyCls : inputCls} />
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Contacto</label>
                    <input type="text"
                      value={clienteVinculado ? clienteVinculado.representante : quote.prospecto.contacto}
                      onChange={e => handleFieldChange('prospecto', 'contacto', e.target.value)}
                      readOnly={!!clienteVinculado}
                      className={clienteVinculado ? inputReadonlyCls : inputCls} />
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Origen del lead</label>
                    <select value={quote.prospecto.origen}
                      onChange={e => handleFieldChange('prospecto', 'origen', e.target.value)}
                      className={inputCls}>
                      {Object.entries(ORIGENES_PROSPECTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Teléfono</label>
                    <input type="text"
                      value={clienteVinculado ? clienteVinculado.telefono : quote.prospecto.telefono}
                      onChange={e => handleFieldChange('prospecto', 'telefono', e.target.value)}
                      readOnly={!!clienteVinculado}
                      className={clienteVinculado ? inputReadonlyCls : inputCls} />
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Email</label>
                    <input type="email"
                      value={clienteVinculado ? clienteVinculado.correo : quote.prospecto.email}
                      onChange={e => handleFieldChange('prospecto', 'email', e.target.value)}
                      readOnly={!!clienteVinculado}
                      className={clienteVinculado ? inputReadonlyCls : inputCls} />
                  </div>
                </div>
              </div>

              {/* Responsables */}
              <div className="space-y-3">
                <h3 className="text-[10px] font-bold text-[#E11D48] uppercase tracking-widest border-b border-gray-100 pb-2 flex items-center gap-1.5">
                  <User className="w-4 h-4" /> Responsables
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Vendedor (Ventas)</label>
                    <select value={quote.vendedorId}
                      onChange={e => handleFieldChange('general', 'vendedorId', e.target.value)}
                      className={inputCls}>
                      {VENDEDORES.map(v => <option key={v.id} value={v.nombre}>{v.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Responsable Pricing</label>
                    <select value={quote.pricingId ?? ''}
                      onChange={e => handleFieldChange('general', 'pricingId', e.target.value || null)}
                      className={inputCls}>
                      <option value="">Sin asignar</option>
                      {EQUIPO_PRICING.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Total consolidado */}
              {renderConsolidadoPanel()}
            </div>
          )}

          {/* ────────────── Tab: Servicios ────────────── */}
          {activeTab === 'servicios' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold text-[#E11D48] uppercase tracking-widest flex items-center gap-1.5">
                  <FileText className="w-4 h-4" /> Servicios Solicitados
                </h3>
                {/* Chips de resumen */}
                <div className="flex flex-wrap gap-1">
                  {Array.from(new Set(quote.servicios.map(s => s.tipo))).map(tipo => {
                    const def = (servicios ?? []).find(s => s.id === tipo);
                    return (
                      <span key={tipo} className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold border bg-gray-50 border-gray-200 text-gray-700 uppercase`}>
                        {renderIcon(def?.icono || 'HelpCircle', "w-2.5 h-2.5")}
                        {def?.nombre || tipo}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Servicios accordion */}
              {quote.servicios.map(srv => (
                <ServicioSection
                  key={srv.id}
                  servicio={srv}
                  rolActivo={rolActivo}
                  onUpdateServicio={updated => handleUpdateServicio(srv.id, updated)}
                  servicios={servicios}
                  renderIcon={renderIcon}
                />
              ))}

              {/* Botón para agregar nuevo servicio (Solo Pricing/Admin) */}
              {rolActivo !== 'ventas' && (
                <div className="pt-2">
                  {!showAddServicio ? (
                    <button
                      onClick={() => setShowAddServicio(true)}
                      className="w-full py-3 border-2 border-dashed border-gray-200 hover:border-[#E11D48]/50 hover:bg-[#E11D48]/5 rounded-xl text-xs font-bold text-gray-500 hover:text-[#E11D48] transition-all flex items-center justify-center gap-2 uppercase tracking-wider"
                    >
                      <Plus className="w-4 h-4" /> Agregar Servicio
                    </button>
                  ) : (
                    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
                      <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Nuevo Servicio</h4>
                      <div className="flex gap-2">
                        <select 
                          value={newServicioTipo} 
                          onChange={(e) => setNewServicioTipo(e.target.value as TipoServicio)}
                          className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#E11D48]"
                        >
                          <option value="maritimo">Flete Marítimo</option>
                          <option value="aereo">Flete Aéreo</option>
                          <option value="terrestre">Flete Terrestre</option>
                          <option value="aduanal">Despacho Aduanal</option>
                        </select>
                        <button 
                          onClick={handleAddServicio}
                          className="px-4 py-2 bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold uppercase rounded-lg transition-colors"
                        >
                          Agregar
                        </button>
                        <button 
                          onClick={() => setShowAddServicio(false)}
                          className="px-3 py-2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Total consolidado dentro de la tab */}
              {renderConsolidadoPanel()}
            </div>
          )}

          {/* ────────────── Tab: Actividades ────────────── */}
          {activeTab === 'actividades' && (
            <div className="space-y-6">
              <form onSubmit={handleAddActivity} className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
                <h4 className="text-[10px] font-bold text-[#18181B] uppercase tracking-wider">Registrar actividad</h4>
                <input
                  type="text" required
                  placeholder="¿Qué hay que hacer?"
                  value={newActivityTitle}
                  onChange={e => setNewActivityTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-[#E11D48] shadow-xs"
                />
                <textarea
                  placeholder="Descripción detallada..."
                  value={newActivityDesc}
                  onChange={e => setNewActivityDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-[#E11D48] shadow-xs resize-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Fecha límite</label>
                    <input type="date" value={newActivityDate} onChange={e => setNewActivityDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-[#E11D48]" />
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Tipo</label>
                    <select value={newActivityType} onChange={e => setNewActivityType(e.target.value as QuoteActivity['tipo'])}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-[#E11D48]">
                      <option value="tarea">Tarea</option>
                      <option value="llamada">Llamada</option>
                      <option value="correo">Correo</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="submit"
                    className="px-4 py-2 bg-[#E11D48] hover:bg-[#BE123C] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center shadow-xs">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Registrar
                  </button>
                </div>
              </form>

              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-[#18181B] uppercase tracking-wider border-b border-gray-150 pb-2">
                  Lista de Actividades
                </h4>
                {filterTasks.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-4 text-center">Sin actividades registradas.</p>
                ) : (
                  <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden bg-white shadow-xs">
                    {filterTasks.map(act => {
                      const isOverdue = act.estado === 'pendiente' && isActivityOverdue(act.fechaLimite);
                      return (
                        <div key={act.id} className="p-4 flex items-start gap-3 hover:bg-gray-50/50 transition-colors">
                          <input
                            type="checkbox"
                            checked={act.estado === 'hecha'}
                            onChange={() => handleToggleActivity(act.id)}
                            className="w-4 h-4 text-[#E11D48] border-gray-300 rounded mt-0.5 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded
                                ${act.tipo === 'llamada' ? 'bg-amber-100 text-amber-800' :
                                  act.tipo === 'correo' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                                {act.tipo}
                              </span>
                              <span className={`text-xs tabular-nums font-semibold ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                                Límite: {act.fechaLimite}{isOverdue ? ' (Vencida)' : ''}
                              </span>
                            </div>
                            <h5 className={`text-sm font-semibold mt-1 ${act.estado === 'hecha' ? 'line-through text-gray-400' : 'text-[#18181B]'}`}>
                              {act.titulo}
                            </h5>
                            {act.descripcion && (
                              <p className={`text-xs mt-1 ${act.estado === 'hecha' ? 'text-gray-300' : 'text-gray-500'}`}>
                                {act.descripcion}
                              </p>
                            )}
                          </div>
                          <button onClick={() => handleDeleteActivity(act.id)}
                            className="text-gray-300 hover:text-red-500 p-1.5 rounded transition-colors shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ────────────── Tab: Historial ────────────── */}
          {activeTab === 'historial' && (
            <div className="space-y-6">
              <form onSubmit={handleAddNote} className="space-y-2">
                <textarea
                  required
                  placeholder="Agregar una anotación comercial..."
                  value={newNoteText}
                  onChange={e => setNewNoteText(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-[#E11D48] shadow-xs resize-none"
                />
                <div className="flex justify-end">
                  <button type="submit"
                    className="px-4 py-2 bg-[#4B2A8C] hover:bg-[#3d2277] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center shadow-xs">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Agregar nota
                  </button>
                </div>
              </form>

              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-[#18181B] uppercase tracking-wider border-b border-gray-150 pb-2">Línea de Tiempo</h4>
                <div className="relative pl-6 border-l-2 border-gray-100 space-y-6">
                  {[
                    ...quote.historialEtapas.map(h => ({
                      type: 'etapa' as const,
                      date: h.fecha,
                      title: `Etapa: ${PIPELINE_STAGES.find(s => s.id === h.etapa)?.label ?? h.etapa}`,
                      desc: h.nota ?? 'Cambio registrado en pipeline.',
                    })),
                    ...filterNotes.map(n => ({
                      type: n.tipo,
                      date: n.createdAt,
                      title: 'Nota registrada',
                      desc: n.descripcion,
                      id: n.id,
                      autor: n.responsableId
                    })),
                  ]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((item, idx) => (
                      <div key={idx} className="relative">
                        <div className={`absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full border-2 bg-white flex items-center justify-center
                          ${item.type === 'etapa' ? 'border-[#4B2A8C]' : 'border-[#E11D48]'}`}>
                          {item.type === 'etapa'
                            ? <Clock className="w-1.5 h-1.5 text-[#4B2A8C]" />
                            : <MessageSquare className="w-1.5 h-1.5 text-[#E11D48]" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#18181B]">
                              {item.title} {item.autor ? `por ${item.autor}` : ''}
                            </span>
                            <span className="text-[9px] text-gray-400 font-semibold tabular-nums">{item.date}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1 leading-relaxed whitespace-pre-line">{item.desc}</p>
                          
                          {item.type === 'nota' && (
                            <div className="mt-3">
                              {quote.actividades.filter(a => a.parentId === item.id).map(reply => (
                                <div key={reply.id} className="ml-4 pl-3 border-l-2 border-gray-200 mt-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-[#18181B]">{reply.responsableId}</span>
                                    <span className="text-[9px] text-gray-400 tabular-nums">{reply.createdAt}</span>
                                  </div>
                                  <p className="text-xs text-gray-500 mt-1">{reply.descripcion}</p>
                                </div>
                              ))}
                              
                              {replyingTo === item.id ? (
                                <form 
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    if(!replyText.trim()) return;
                                    const nuevaRespuesta = {
                                      id: `rep-${Date.now()}`,
                                      titulo: 'Respuesta',
                                      descripcion: replyText,
                                      responsableId: rolActivo,
                                      fechaLimite: '',
                                      estado: 'hecha' as const,
                                      tipo: 'nota' as const,
                                      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
                                      parentId: item.id
                                    };
                                    onUpdateQuote({ ...quote, actividades: [...quote.actividades, nuevaRespuesta] });
                                    setReplyingTo(null);
                                    setReplyText('');
                                  }}
                                  className="mt-3 flex items-start gap-2 ml-4"
                                >
                                  <textarea
                                    value={replyText}
                                    onChange={e => setReplyText(e.target.value)}
                                    placeholder="Escribe una respuesta..."
                                    rows={1}
                                    autoFocus
                                    className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-[#E11D48] resize-none"
                                  />
                                  <div className="flex flex-col gap-1">
                                    <button type="submit" className="px-2 py-1 bg-[#4B2A8C] text-white text-[10px] rounded hover:bg-[#3d2277] transition-colors font-bold">Enviar</button>
                                    <button type="button" onClick={() => {setReplyingTo(null); setReplyText('');}} className="px-2 py-1 bg-gray-200 text-gray-600 text-[10px] rounded hover:bg-gray-300 transition-colors font-bold">Cancelar</button>
                                  </div>
                                </form>
                              ) : (
                                <button
                                  onClick={() => setReplyingTo(item.id || null)}
                                  className="mt-2 ml-4 text-[10px] font-bold text-[#E11D48] hover:text-[#BE123C] uppercase tracking-wider"
                                >
                                  Responder
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* ────────────── Tab: Chat Interno ────────────── */}
          {activeTab === 'chat' && (
            <div className="flex flex-col h-full space-y-4">
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 min-h-[300px] border border-gray-100 bg-gray-50/30 rounded-xl p-4">
                {quote.chat.length === 0 ? (
                  <div className="text-center text-gray-400 text-xs py-8">
                    No hay mensajes en este chat todavía.
                  </div>
                ) : (
                  quote.chat.map(msg => {
                    const isVentas = msg.rol === 'ventas';
                    return (
                      <div key={msg.id} className={`flex flex-col ${isVentas ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[80%] rounded-xl px-4 py-2 ${
                          isVentas ? 'bg-[#E11D48] text-white rounded-br-none' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
                        }`}>
                          <div className="flex justify-between items-baseline gap-4 mb-1">
                            <span className={`text-[10px] font-bold ${isVentas ? 'text-rose-100' : 'text-[#4B2A8C]'}`}>{msg.autorNombre}</span>
                            <span className={`text-[9px] ${isVentas ? 'text-rose-200' : 'text-gray-400'} tabular-nums`}>{msg.timestamp.split(' ')[1]}</span>
                          </div>
                          <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.texto}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if(!newChatMessage.trim()) return;
                  const timestampStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
                  const newMessage = {
                    id: `msg-${Date.now()}`,
                    autorId: user?.uid || rolActivo,
                    autorNombre: user?.nombre || (rolActivo === 'ventas' ? 'Vendedor' : rolActivo === 'pricing' ? 'Pricing' : 'Admin'),
                    rol: rolActivo,
                    texto: newChatMessage,
                    timestamp: timestampStr
                  };
                  
                  // Generar notificaciones para los involucrados
                  const involucrados = new Set<string>();
                  // 1. Dueño de la cotización
                  if (quote.vendedorId && quote.vendedorId !== (user?.uid || rolActivo)) {
                    involucrados.add(quote.vendedorId);
                  }
                  // 2. Administradores (opcional, o Pricing si no está explícito)
                  if (rolActivo !== 'pricing' && rolActivo !== 'admin') {
                     // Si ventas escribe, notificar a pricing por defecto (a menos que usemos un ID específico)
                     involucrados.add('pricing'); // Usaremos el rol como ID si no hay UID específico
                  }
                  if (rolActivo !== 'admin') {
                     involucrados.add('admin');
                  }
                  // 3. Otros participantes del chat
                  quote.chat.forEach(msg => {
                    if (msg.autorId && msg.autorId !== (user?.uid || rolActivo)) {
                       involucrados.add(msg.autorId);
                    }
                  });

                  involucrados.forEach(destId => {
                    agregarNotificacion({
                      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2,7)}`,
                      tipo: 'chat',
                      cotizacionId: quote.id,
                      cotizacionFolio: quote.folio,
                      destinatarios: [], // Legacy
                      destinatarioId: destId,
                      remitenteNombre: newMessage.autorNombre,
                      preview: newMessage.texto.length > 60 ? newMessage.texto.substring(0, 60) + '...' : newMessage.texto,
                      leida: false,
                      timestamp: new Date().toISOString()
                    });
                  });

                  onUpdateQuote({ ...quote, chat: [...quote.chat, newMessage] });
                  setNewChatMessage('');
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  placeholder="Escribe un mensaje..."
                  value={newChatMessage}
                  onChange={e => setNewChatMessage(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:border-[#E11D48] shadow-sm"
                />
                <button type="submit" className="p-2.5 bg-[#E11D48] text-white rounded-xl hover:bg-[#BE123C] transition-colors shadow-sm flex items-center justify-center shrink-0">
                  <Send className="w-4 h-4 ml-0.5" />
                </button>
              </form>
            </div>
          )}

        </div>

        {/* Footer de acciones */}
        <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex flex-col gap-3 shrink-0">

          {/* Acción: Enviar a Pricing (solo Ventas, etapas iniciales) */}
          {rolActivo === 'ventas' && quote.etapa === 'solicitud_cliente' && (
            <button
              onClick={() => handleStageChange('solicitado_pricing')}
              className="w-full px-4 py-3 bg-[#4B2A8C] hover:bg-[#3d2277] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs"
            >
              <Send className="w-4 h-4" /> Enviar a Pricing
            </button>
          )}

          {/* Acción: Enviar cotización al cliente (Ventas, etapa consolidada) */}
          {rolActivo === 'ventas' && quote.etapa === 'consolidada' && (
            <button
              onClick={() => handleStageChange('enviada_cliente')}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs"
            >
              <Send className="w-4 h-4" /> Enviar al cliente
            </button>
          )}

          {/* Acción: Consolidar (Pricing, solo desde cotizaciones_recibidas) */}
          {rolActivo === 'pricing' && quote.etapa === 'cotizaciones_recibidas' && (
            <button
              onClick={() => handleStageChange('consolidada')}
              className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs"
            >
              <CheckCircle2 className="w-4 h-4" /> Consolidar cotización
            </button>
          )}

          {/* Acciones estándar */}
          <div className="flex gap-3">
            <button
              onClick={() => alert('Generando PDF de la cotización consolidada...')}
              className="flex-1 px-4 py-3 border border-gray-200 bg-white hover:bg-gray-50 text-[#18181B] text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4 text-gray-400" /> Generar PDF
            </button>

            {disponibles.includes('ganada') && (
              <button
                onClick={() => {
                  if (confirm(`¿Marcar ${quote.id} como GANADA?`)) {
                    handleStageChange('ganada');
                    onConvertToShipment(quote);
                  }
                }}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs"
              >
                <CheckCircle2 className="w-4 h-4" /> Ganada
              </button>
            )}
          </div>

          {disponibles.includes('perdida') && !showLossReasonForm && (
            <button
              onClick={() => setShowLossReasonForm(true)}
              className="w-full px-4 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 text-xs font-bold uppercase tracking-wider rounded-xl transition-colors text-center border border-transparent hover:border-red-100"
            >
              Marcar como Perdida
            </button>
          )}
        </div>
      </div>
    </>
  );
}
