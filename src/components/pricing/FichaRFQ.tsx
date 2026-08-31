import React, { useState, useMemo } from 'react';
import { RFQ, ProviderQuote, Modality, RFQService } from './PricingData';
import { useProveedores } from '../../hooks/useProveedores';
import { Modalidad } from '../proveedores/ProveedoresData';
import AltaRapidaProveedorModal from '../proveedores/AltaRapidaProveedorModal';
import { ChevronRight, ChevronDown, Check, X, Plane, Ship, Truck, FileText, Plus, DollarSign, Send, ArrowLeft, Paperclip, File as FileIcon, HelpCircle } from 'lucide-react';
import { useServicios, renderIcon } from '../../config/serviciosStore';
import { FichaHeader, BadgeEstado } from '../ui/ficha/FichaLayout';

interface FichaRFQProps {
  rfq: RFQ;
  onClose: () => void;
  onUpdate: (updated: RFQ) => void;
}

export default function FichaRFQ({ rfq, onClose, onUpdate }: FichaRFQProps) {
  const { proveedores, createProveedor } = useProveedores();
  const [expandedServices, setExpandedServices] = useState<string[]>(rfq.services.map(s => s.id));
  const [surcharges, setSurcharges] = useState(rfq.surchargesPercent);
  const [margin, setMargin] = useState(rfq.marginPercent);

  // Estado para un nuevo proveedor en línea
  const [addingToService, setAddingToService] = useState<string | null>(null);
  const [newProvName, setNewProvName] = useState('');
  const [showAltaRapida, setShowAltaRapida] = useState(false);
  const [altaRapidaModalidad, setAltaRapidaModalidad] = useState<Modalidad | undefined>(undefined);
  const [newProvCost, setNewProvCost] = useState('');
  const [newProvCurrency, setNewProvCurrency] = useState<'USD'|'MXN'>('USD');
  const [newProvDesc, setNewProvDesc] = useState('');
  const [newProvFile, setNewProvFile] = useState<{name: string, url: string} | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setNewProvFile({
        name: file.name,
        url: URL.createObjectURL(file) // preview mock
      });
    }
  };

  const toggleService = (id: string) => {
    setExpandedServices(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const { servicios } = useServicios();

  const handleSelectQuote = (serviceId: string, quoteId: string) => {
    const updatedServices = rfq.services.map(srv => {
      if (srv.id === serviceId) {
        return {
          ...srv,
          providerQuotes: srv.providerQuotes.map(pq => ({
            ...pq,
            selected: pq.id === quoteId
          }))
        };
      }
      return srv;
    });
    onUpdate({ ...rfq, services: updatedServices });
  };

  const handleSaveNewQuote = (serviceId: string, modality: Modality) => {
    if (!newProvName || !newProvCost) return;

    const newQuote: ProviderQuote = {
      id: `pq-${Date.now()}`,
      providerName: newProvName,
      description: newProvDesc || 'Flete básico',
      cost: Number(newProvCost),
      currency: newProvCurrency,
      dateReceived: new Date().toISOString().split('T')[0],
      selected: false,
      ...(newProvFile && { attachment: newProvFile })
    };

    const updatedServices = rfq.services.map(srv => {
      if (srv.id === serviceId) {
        // Si es el primero, lo auto-seleccionamos
        if (srv.providerQuotes.length === 0) newQuote.selected = true;
        return { ...srv, providerQuotes: [...srv.providerQuotes, newQuote] };
      }
      return srv;
    });

    onUpdate({ ...rfq, services: updatedServices });
    
    // reset form
    setAddingToService(null);
    setNewProvName('');
    setNewProvCost('');
    setNewProvDesc('');
    setNewProvFile(null);
  };

  const baseCost = useMemo(() => {
    let total = 0;
    rfq.services.forEach(srv => {
      const selected = srv.providerQuotes.find(pq => pq.selected);
      // Para este demo simplificado asumimos que si es MXN lo dividimos entre 18
      if (selected) {
        total += selected.currency === 'USD' ? selected.cost : selected.cost / 18;
      }
    });
    return total;
  }, [rfq.services]);

  const surchargesAmount = baseCost * (surcharges / 100);
  const costWithSurcharges = baseCost + surchargesAmount;
  const marginAmount = costWithSurcharges * (margin / 100);
  const finalTotal = costWithSurcharges + marginAmount;

  const handleSendToSales = () => {
    onUpdate({
      ...rfq,
      surchargesPercent: surcharges,
      marginPercent: margin,
      status: 'Completado'
    });
    alert('Cotización consolidada enviada a Ventas.');
    onClose();
  };

  return (
    <div className="space-y-[24px]">
      {/* U-3 · Mismo encabezado que las demás fichas. Antes eran dos piezas: la
          miga de pan por un lado y una tarjeta con el nombre y el estado por
          otro, con tipografías que no coincidían con ninguna otra ficha. */}
      <FichaHeader
        modulo="Solicitudes"
        onBack={onClose}
        folio={rfq.quoteRef}
        titulo={rfq.client}
        badges={
          <BadgeEstado tono={
            rfq.status === 'Completado' ? 'exito'
            : rfq.status === 'En proceso' ? 'activo'
            : 'espera'}
          >
            {rfq.status}
          </BadgeEstado>
        }
        subtitulo={
          <div className="flex items-center text-[13px] text-text-secondary space-x-[12px]">
            <span>Responsable: {rfq.responsible}</span>
            <span className="text-divider">•</span>
            <span>Límite: <span className="text-danger-text">{rfq.deadline}</span></span>
          </div>
        }
      />

      {/* Main Content Layout */}
      <div className="flex flex-col lg:flex-row gap-[24px]">
        
        {/* Left Col (Services) */}
        <div className="flex-1 space-y-[16px]">
          <h3 className="text-[16px] font-semibold text-text-primary mb-[16px]">Servicios Requeridos</h3>
          
          {rfq.services.map(srv => {
            const isExpanded = expandedServices.includes(srv.id);
            const def = servicios.find(s => s.id === srv.modality);
            const nombreSrv = def?.nombre || srv.modality;
            const iconSrv = def?.icono || 'HelpCircle';
            
            /**
             * TODOS los proveedores activos.
             *
             * Antes esto EXCLUÍA por `modalidades`: si un proveedor no tenía
             * la modalidad etiquetada desaparecía, y con un catálogo poco
             * etiquetado la lista salía vacía y no dejaba seleccionar nada.
             *
             * A quién le pides precio no lo decide una etiqueta del catálogo.
             * La modalidad ORDENA —los relevantes primero— pero no excluye.
             */
            const relevante: string | undefined =
              def?.categoria === 'aduana' ? 'aduanal'
              : def?.categoria === 'transporte' ? (srv.modality as string)
              : undefined;

            const availableProviders = proveedores
              .filter(p => p.activo)
              .sort((a, b) => {
                const ra = relevante && a.modalidades?.includes(relevante as never) ? 0 : 1;
                const rb = relevante && b.modalidades?.includes(relevante as never) ? 0 : 1;
                return ra !== rb ? ra - rb : a.nombre.localeCompare(b.nombre, 'es');
              });

            return (
              <div key={srv.id} className="bg-white border border-card-border rounded-[10px] overflow-hidden shadow-sm">
                {/* Accordion Header */}
                <div 
                  className="flex items-center justify-between p-[16px] cursor-pointer hover:bg-neutral-bg transition-colors select-none"
                  onClick={() => toggleService(srv.id)}
                >
                  <div className="flex items-center">
                    <div className="w-[36px] h-[36px] rounded-lg bg-canvas border border-card-border flex items-center justify-center text-text-secondary mr-[16px]">
                      {renderIcon(iconSrv, "w-4 h-4")}
                    </div>
                    <div>
                      <h4 className="text-[14px] font-bold text-text-primary uppercase tracking-wide">{nombreSrv}</h4>
                      <p className="text-[12px] text-text-secondary">{srv.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <span className="text-[12px] font-medium text-brand mr-[16px]">
                      {srv.providerQuotes.length} cotizaciones
                    </span>
                    <ChevronDown className={`w-5 h-5 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {/* Accordion Body */}
                {isExpanded && (
                  <div className="border-t border-divider p-[16px] bg-canvas">
                    
                    {srv.providerQuotes.length > 0 ? (
                      <div className="border border-card-border rounded-lg overflow-hidden mb-[16px] bg-white">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-canvas border-b border-card-border">
                              <th className="py-2 px-4 text-[11px] font-semibold text-text-muted uppercase w-10 text-center">Sel</th>
                              <th className="py-2 px-4 text-[11px] font-semibold text-text-muted uppercase">Proveedor</th>
                              <th className="py-2 px-4 text-[11px] font-semibold text-text-muted uppercase">Detalle</th>
                              <th className="py-2 px-4 text-[11px] font-semibold text-text-muted uppercase text-right">Costo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {srv.providerQuotes.map(pq => (
                              <tr key={pq.id} className={`border-b border-card-border last:border-0 hover:bg-neutral-bg transition-colors ${pq.selected ? 'bg-success-bg/20' : ''}`}>
                                <td className="py-2 px-4 text-center">
                                  <input 
                                    type="radio" 
                                    name={`sel-${srv.id}`} 
                                    checked={pq.selected} 
                                    onChange={() => handleSelectQuote(srv.id, pq.id)}
                                    className="w-4 h-4 text-brand focus:ring-brand accent-brand cursor-pointer"
                                  />
                                </td>
                                <td className="py-2 px-4 text-[13px] font-medium text-text-primary">{pq.providerName}</td>
                                <td className="py-2 px-4 text-[12px] text-text-secondary">
                                  {pq.description}
                                  {pq.attachment && (
                                    <div className="mt-1">
                                      <a href={pq.attachment.url} target="_blank" rel="noreferrer" className="inline-flex items-center text-[11px] text-brand hover:underline font-medium">
                                        <Paperclip className="w-3 h-3 mr-1" /> Ver archivo
                                      </a>
                                    </div>
                                  )}
                                </td>
                                <td className="py-2 px-4 text-[13px] font-bold text-text-primary text-right tabular-nums">
                                  ${pq.cost.toLocaleString()} <span className="text-[10px] text-text-muted">{pq.currency}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                       <p className="text-[12px] text-text-muted mb-[16px] italic">No se han cargado tarifas de proveedores aún.</p>
                    )}

                    {addingToService === srv.id ? (
                      <div className="bg-white border border-brand/30 rounded-lg p-[16px] shadow-sm">
                        <h5 className="text-[11px] font-bold text-brand uppercase tracking-wider mb-3">Agregar Cotización de Proveedor</h5>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="col-span-2 md:col-span-1">
                            <label className="block text-[10px] font-semibold text-text-muted uppercase mb-1">Proveedor *</label>
                            <select
                              className="w-full text-[13px] border border-card-border rounded-md px-2 py-1.5 focus:border-brand outline-none"
                              value={newProvName} onChange={e => {
                                if (e.target.value === '__nuevo__') {
                                  const modalidadCtx: Modalidad | undefined = def?.categoria === 'aduana' ? 'aduanal' : undefined;
                                  setAltaRapidaModalidad(modalidadCtx);
                                  setShowAltaRapida(true);
                                } else {
                                  setNewProvName(e.target.value);
                                }
                              }}
                            >
                              <option value="">Seleccionar...</option>
                              {availableProviders.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                              <option value="__nuevo__">+ Nuevo proveedor...</option>
                            </select>
                          </div>
                          <div className="col-span-2 md:col-span-1">
                            <label className="block text-[10px] font-semibold text-text-muted uppercase mb-1">Descripción</label>
                            <input 
                              type="text" placeholder="Ej. Flete Base"
                              className="w-full text-[13px] border border-card-border rounded-md px-2 py-1.5 focus:border-brand outline-none"
                              value={newProvDesc} onChange={e => setNewProvDesc(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-text-muted uppercase mb-1">Costo *</label>
                            <input 
                              type="number" placeholder="0.00"
                              className="w-full text-[13px] border border-card-border rounded-md px-2 py-1.5 focus:border-brand outline-none"
                              value={newProvCost} onChange={e => setNewProvCost(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-text-muted uppercase mb-1">Moneda</label>
                            <select 
                              className="w-full text-[13px] border border-card-border rounded-md px-2 py-1.5 focus:border-brand outline-none"
                              value={newProvCurrency} onChange={e => setNewProvCurrency(e.target.value as 'USD'|'MXN')}
                            >
                              <option value="USD">USD</option>
                              <option value="MXN">MXN</option>
                            </select>
                          </div>
                        </div>
                        {/* Adjunto */}
                        <div className="mt-3">
                          <label className="block text-[10px] font-semibold text-text-muted uppercase mb-1">Cotización del proveedor (adjunto)</label>
                          {!newProvFile ? (
                            <div className="flex flex-col items-start">
                              <label className="cursor-pointer inline-flex items-center px-3 py-1.5 border border-brand text-brand text-[12px] font-medium rounded-md hover:bg-brand/5 transition-colors">
                                <Paperclip className="w-3.5 h-3.5 mr-1.5" />
                                Seleccionar archivo
                                <input 
                                  type="file" 
                                  className="hidden" 
                                  accept="application/pdf,image/jpeg,image/png"
                                  onChange={handleFileChange}
                                />
                              </label>
                              <span className="text-[10px] text-text-muted mt-1.5">PDF, JPG o PNG · Máx. 10 MB</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center bg-canvas border border-card-border rounded-full px-3 py-1.5 shadow-sm">
                              <FileIcon className="w-3.5 h-3.5 text-text-muted mr-1.5" />
                              <span className="text-[12px] text-text-primary font-medium mr-2 truncate max-w-[200px]">{newProvFile.name}</span>
                              <button onClick={() => setNewProvFile(null)} className="text-text-muted hover:text-danger-text transition-colors" title="Eliminar archivo">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="flex justify-end mt-3 space-x-2">
                          <button onClick={() => setAddingToService(null)} className="px-3 py-1.5 text-[12px] text-text-secondary hover:text-text-primary">Cancelar</button>
                          <button onClick={() => handleSaveNewQuote(srv.id, srv.modality as Modality)} className="px-3 py-1.5 bg-brand text-white text-[12px] rounded-md font-medium hover:bg-brand-hover">Guardar</button>
                        </div>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setAddingToService(srv.id)}
                        className="text-[12px] font-semibold text-brand flex items-center hover:text-brand-hover transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Agregar cotización de proveedor
                      </button>
                    )}
                    
                  </div>
                )}
              </div>
            );
          })}

        </div>

        {/* Right Col (Consolidated) */}
        <div className="w-full lg:w-[340px] shrink-0">
          <div className="bg-surface-dark rounded-[12px] p-[24px] text-text-inverse shadow-md sticky top-[24px]">
            <h3 className="text-[16px] font-semibold text-white mb-[20px] flex items-center">
              <DollarSign className="w-5 h-5 mr-2 text-brand" />
              Consolidado Final
            </h3>
            
            <div className="space-y-[16px]">
              <div className="flex justify-between items-center py-2 border-b border-surface-border/50">
                <span className="text-[13px] text-text-inverse-muted">Costo Base (Prov.)</span>
                <span className="text-[15px] font-semibold tabular-nums">${baseCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-surface-border/50">
                <span className="text-[13px] text-text-inverse-muted">Recargos (%)</span>
                <input 
                  type="number" min="0" max="100"
                  value={surcharges} onChange={e => setSurcharges(Number(e.target.value))}
                  className="w-[70px] bg-surface border border-surface-border rounded p-1 text-right text-[13px] outline-none focus:border-brand text-white"
                />
              </div>

              <div className="flex justify-between items-center py-2 border-b border-surface-border/50">
                <span className="text-[13px] text-text-inverse-muted">Margen Pricing (%)</span>
                <input 
                  type="number" min="0" max="100"
                  value={margin} onChange={e => setMargin(Number(e.target.value))}
                  className="w-[70px] bg-surface border border-surface-border rounded p-1 text-right text-[13px] outline-none focus:border-brand text-white"
                />
              </div>

              <div className="pt-4">
                <div className="flex justify-between items-end mb-[24px]">
                  <span className="text-[13px] text-text-inverse-muted uppercase tracking-wider font-bold">Total Venta</span>
                  <span className="text-[28px] font-bold text-white tabular-nums leading-none">${finalTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>

                <button 
                  onClick={handleSendToSales}
                  disabled={finalTotal === 0}
                  className="w-full bg-brand hover:bg-brand-hover disabled:bg-surface-border disabled:text-text-inverse-muted text-white font-semibold py-[12px] rounded-[8px] flex items-center justify-center transition-colors shadow-sm"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Enviar a Ventas
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>

      {showAltaRapida && (
        <AltaRapidaProveedorModal
          onClose={() => setShowAltaRapida(false)}
          // Alta rápida = «probable proveedor» (Pricing). No es alta definitiva.
          onCreate={p => createProveedor(p, { modo: 'rapida' })}
          modalidadContexto={altaRapidaModalidad}
          onCreated={(_id, nombre) => {
            setNewProvName(nombre);
            setShowAltaRapida(false);
          }}
        />
      )}
    </div>
  );
}
