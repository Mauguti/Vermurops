import React, { useState } from 'react';
import { initialClients } from '../data';
import { Scale, Plus, Search, Filter, ChevronRight, FileCheck, Landmark, CheckCircle2, Circle, AlertCircle, ArrowRight, DollarSign, MapPin, Receipt } from 'lucide-react';

export default function Customs() {
  const [selectedCustoms, setSelectedCustoms] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const initialCustoms = [
    {
      id: 'PED-23-47-3849',
      shipmentId: 'SHP-2023-003',
      client: 'Comercial del Norte',
      broker: 'Aduanas y Maniobras S.C.',
      customsLocation: 'Nuevo Laredo, Tamps.',
      type: 'Importación',
      hsCode: '8528.52.01',
      date: '2023-10-24',
      status: 'En revisión',
      value: 45000,
      taxes: { IGI: 6750, IVA: 8280, DTA: 360 },
      checklist: [
        { name: 'Factura Comercial', done: true },
        { name: 'Packing List', done: true },
        { name: 'Carta Porte / BL', done: true },
        { name: 'Certificado de Origen', done: true },
        { name: 'Pedimento validado', done: false },
        { name: 'NOM-019-SCFI', done: true }
      ],
      timeline: [
        { step: 'Documentación recibida', date: '21 Oct, 10:00 AM', done: true },
        { step: 'Clasificación y proforma', date: '22 Oct, 14:30 PM', done: true },
        { step: 'Validación y pago', date: '23 Oct, 09:15 AM', done: true },
        { step: 'Reconocimiento aduanero', date: '24 Oct, 11:00 AM', done: false },
        { step: 'Despacho libre', date: '-', done: false }
      ]
    },
    {
      id: 'PED-23-43-1928',
      shipmentId: 'SHP-2023-004',
      client: 'Industrias Querétaro SA',
      broker: 'Logística Aduanal Mex',
      customsLocation: 'Manzanillo, Col.',
      type: 'Importación',
      hsCode: '8421.29.99',
      date: '2023-10-20',
      status: 'Liberado',
      value: 120000,
      taxes: { IGI: 0, IVA: 19200, DTA: 960 },
      checklist: [
        { name: 'Factura Comercial', done: true },
        { name: 'Packing List', done: true },
        { name: 'BL', done: true },
        { name: 'Pedimento pagado', done: true }
      ],
      timeline: [
        { step: 'Documentación recibida', date: '18 Oct, 09:00 AM', done: true },
        { step: 'Despacho libre', date: '20 Oct, 15:45 PM', done: true }
      ]
    },
    {
      id: 'PED-23-64-5832',
      shipmentId: 'SHP-2023-001',
      client: 'Grupo Textil Monterrey',
      broker: 'Aduanas Globales',
      customsLocation: 'AICM, CDMX',
      type: 'Exportación',
      hsCode: '5208.32.01',
      date: '2023-10-26',
      status: 'Documentando',
      value: 18500,
      taxes: { IGI: 0, IVA: 0, DTA: 360 },
      checklist: [
        { name: 'Factura Comercial', done: true },
        { name: 'Carta de Instrucciones', done: false },
        { name: 'AWB', done: false }
      ],
      timeline: [
        { step: 'Recepción de docs', date: '26 Oct, 08:30 AM', done: true },
        { step: 'Elaboración de proforma', date: '-', done: false }
      ]
    },
    {
      id: 'PED-23-16-9482',
      shipmentId: 'SHP-2023-002',
      client: 'Tech Solutions MX',
      broker: 'Agencia Aduanal A.C.',
      customsLocation: 'Veracruz, Ver.',
      type: 'Importación',
      hsCode: '8517.62.00',
      date: '2023-10-25',
      status: 'Rojo aduanero',
      value: 85000,
      taxes: { IGI: 12750, IVA: 15640, DTA: 680 },
      checklist: [
        { name: 'Factura Comercial', done: true },
        { name: 'Packing List', done: true },
        { name: 'BL', done: true },
        { name: 'Pedimento validado', done: true }
      ],
      timeline: [
        { step: 'Validación y pago', date: '24 Oct, 16:00 PM', done: true },
        { step: 'Reconocimiento aduanero (Rojo)', date: '25 Oct, 10:30 AM', done: true },
        { step: 'Dictamen de liberación', date: '-', done: false }
      ]
    }
  ];

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'En clasificación': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-neutral-bg text-text-secondary">En clasificación</span>;
      case 'Documentando': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-warning-bg text-warning-text">Documentando</span>;
      case 'En revisión': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-info-bg text-info-text">En revisión</span>;
      case 'Liberado': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-success-bg text-success-text">Liberado</span>;
      case 'Rojo aduanero': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-error-bg text-error-text">Rojo aduanero</span>;
      default: return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-neutral-bg text-text-secondary">{status}</span>;
    }
  };

  const filteredCustoms = initialCustoms.filter(c => 
    c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.shipmentId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.client.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-[32px]">
      {!selectedCustoms && !showForm && (
        <>
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-[16px]">
            <div>
              <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">Aduanas</h2>
              <p className="text-[13px] text-text-secondary mt-[4px]">Cumplimiento aduanero y control de despachos.</p>
            </div>
            <button 
              onClick={() => setShowForm(true)}
              className="bg-brand text-white px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover transition-colors shadow-sm flex items-center shrink-0"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo despacho
            </button>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-[16px]">
            <div className="bg-white p-[20px] rounded-[12px] border border-card-border shadow-sm">
               <p className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] mb-[4px]">Pendientes</p>
               <p className="text-[24px] font-semibold text-text-primary tabular-nums">12</p>
            </div>
            <div className="bg-white p-[20px] rounded-[12px] border border-card-border shadow-sm">
               <p className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] mb-[4px]">En revisión</p>
               <p className="text-[24px] font-semibold text-info-text tabular-nums">5</p>
            </div>
            <div className="bg-white p-[20px] rounded-[12px] border border-card-border shadow-sm">
               <p className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] mb-[4px]">Liberados (Hoy)</p>
               <p className="text-[24px] font-semibold text-success-text tabular-nums">3</p>
            </div>
            <div className="bg-white p-[20px] rounded-[12px] border border-card-border shadow-sm">
               <p className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] mb-[4px]">Por pagar</p>
               <p className="text-[24px] font-semibold text-warning-text tabular-nums">8</p>
            </div>
          </div>

          <div className="flex gap-[12px] items-center">
            <div className="relative max-w-[400px] flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input 
                type="text" 
                placeholder="Buscar pedimento, embarque o cliente..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-[36px] bg-white border border-card-border rounded-[8px] p-[10px] text-[13px] focus:outline-none focus:border-brand shadow-sm text-text-primary" 
              />
            </div>
            <button className="flex items-center text-[13px] font-medium text-text-secondary bg-white border border-card-border rounded-[8px] px-[16px] py-[10px] hover:bg-neutral-bg transition-colors shadow-sm">
              <Filter className="w-4 h-4 mr-2" /> Filtros
            </button>
          </div>

          <div className="bg-card rounded-[12px] border border-card-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]"># Pedimento</th>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Embarque</th>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Cliente</th>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Aduana / Agente</th>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Fracción</th>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Estatus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider bg-white">
                  {filteredCustoms.map((c, idx) => (
                    <tr 
                      key={idx} 
                      onClick={() => setSelectedCustoms(c)}
                      className="hover:bg-neutral-bg transition-colors cursor-pointer group"
                    >
                      <td className="px-[24px] py-[16px] text-[13px] text-text-primary font-medium whitespace-nowrap">{c.id}</td>
                      <td className="px-[24px] py-[16px] text-[13px] text-text-primary hover:text-brand transition-colors whitespace-nowrap">{c.shipmentId}</td>
                      <td className="px-[24px] py-[16px] text-[13px] text-text-primary">{c.client}</td>
                      <td className="px-[24px] py-[16px] text-[13px]">
                         <span className="block text-text-primary">{c.customsLocation}</span>
                         <span className="block text-text-secondary text-[12px]">{c.broker}</span>
                      </td>
                      <td className="px-[24px] py-[16px] text-[13px] text-text-secondary tabular-nums whitespace-nowrap">{c.hsCode}</td>
                      <td className="px-[24px] py-[16px]">
                        {getStatusBadge(c.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selectedCustoms && (
        <div className="space-y-[24px]">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-[8px] text-[13px] text-text-secondary">
              <button onClick={() => setSelectedCustoms(null)} className="hover:text-text-primary transition-colors">Aduanas</button>
              <ChevronRight className="w-[14px] h-[14px] text-text-muted" />
              <span className="text-text-primary font-medium">{selectedCustoms.id}</span>
            </div>
            <div className="flex space-x-[12px]">
               {selectedCustoms.status !== 'Liberado' && (
                 <button className="bg-brand text-white px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors flex items-center">
                   <FileCheck className="w-[14px] h-[14px] mr-[8px]" />
                   Marcar como liberado
                 </button>
               )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-[24px]">
             <div className="lg:col-span-2 space-y-[24px]">
                <div className="bg-white rounded-[12px] border border-card-border shadow-sm p-[32px]">
                   <div className="flex justify-between items-start mb-[24px] pb-[24px] border-b border-divider">
                      <div>
                         <div className="flex items-center space-x-[12px] mb-[8px]">
                           <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">{selectedCustoms.id}</h2>
                           {getStatusBadge(selectedCustoms.status)}
                         </div>
                         <p className="text-[14px] text-text-secondary flex items-center">
                            {selectedCustoms.client} 
                            <span className="mx-[8px] text-divider">•</span> 
                            {selectedCustoms.type}
                         </p>
                      </div>
                      <div className="text-right">
                         <span className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] block mb-[4px]">Embarque</span>
                         <span className="text-[15px] font-medium text-text-primary hover:text-brand cursor-pointer">{selectedCustoms.shipmentId}</span>
                      </div>
                   </div>

                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-[24px] mb-[32px]">
                      <div>
                         <h4 className="flex items-center text-[13px] font-semibold text-text-primary mb-[12px]">
                           <Landmark className="w-[16px] h-[16px] mr-[8px] text-text-muted" /> Agente y Aduana
                         </h4>
                         <div className="space-y-[12px] text-[13px]">
                            <div className="flex justify-between border-b border-divider pb-[8px]">
                               <span className="text-text-secondary">Agente Aduanal</span>
                               <span className="text-text-primary font-medium">{selectedCustoms.broker}</span>
                            </div>
                            <div className="flex justify-between border-b border-divider pb-[8px]">
                               <span className="text-text-secondary">Aduana</span>
                               <span className="text-text-primary font-medium">{selectedCustoms.customsLocation}</span>
                            </div>
                         </div>
                      </div>

                      <div>
                         <h4 className="flex items-center text-[13px] font-semibold text-text-primary mb-[12px]">
                           <MapPin className="w-[16px] h-[16px] mr-[8px] text-text-muted" /> Clasificación
                         </h4>
                         <div className="space-y-[12px] text-[13px]">
                            <div className="flex justify-between border-b border-divider pb-[8px]">
                               <span className="text-text-secondary">Fracción Arancelaria</span>
                               <span className="text-text-primary font-medium font-mono">{selectedCustoms.hsCode}</span>
                            </div>
                            <div className="flex justify-between border-b border-divider pb-[8px]">
                               <span className="text-text-secondary">Valor en Aduana</span>
                               <span className="text-text-primary font-medium tabular-nums">${selectedCustoms.value.toLocaleString()} USD</span>
                            </div>
                         </div>
                      </div>
                   </div>

                   <div>
                      <h4 className="flex items-center text-[13px] font-semibold text-text-primary mb-[12px] border-t border-divider pt-[24px]">
                        <Receipt className="w-[16px] h-[16px] mr-[8px] text-text-muted" /> Contribuciones (Impuestos calculados)
                      </h4>
                      <table className="w-full text-[13px]">
                         <thead>
                            <tr>
                               <th className="text-left font-medium text-text-secondary py-[8px] border-b border-divider">Concepto</th>
                               <th className="text-right font-medium text-text-secondary py-[8px] border-b border-divider">Importe (MXN)</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-divider font-medium">
                            <tr>
                               <td className="py-[12px] text-text-primary">IGI (Impuesto General de Importación)</td>
                               <td className="py-[12px] text-text-primary text-right tabular-nums">${selectedCustoms.taxes.IGI.toLocaleString()}</td>
                            </tr>
                            <tr>
                               <td className="py-[12px] text-text-primary">IVA (Impuesto al Valor Agregado)</td>
                               <td className="py-[12px] text-text-primary text-right tabular-nums">${selectedCustoms.taxes.IVA.toLocaleString()}</td>
                            </tr>
                            <tr>
                               <td className="py-[12px] text-text-primary">DTA (Derecho de Trámite Aduanero)</td>
                               <td className="py-[12px] text-text-primary text-right tabular-nums">${selectedCustoms.taxes.DTA.toLocaleString()}</td>
                            </tr>
                            <tr className="bg-canvas border-t-2 border-card-border">
                               <td className="py-[12px] px-[12px] font-semibold text-text-primary">Total a pagar</td>
                               <td className="py-[12px] px-[12px] font-semibold text-text-primary text-right tabular-nums text-[15px]">
                                  ${(selectedCustoms.taxes.IGI + selectedCustoms.taxes.IVA + selectedCustoms.taxes.DTA).toLocaleString()}
                               </td>
                            </tr>
                         </tbody>
                      </table>
                   </div>
                </div>
             </div>

             <div className="lg:col-span-1 space-y-[24px]">
                <div className="bg-white rounded-[12px] border border-card-border shadow-sm p-[24px]">
                  <div className="flex items-center mb-[20px]">
                     <FileCheck className="w-[16px] h-[16px] mr-[8px] text-text-muted" />
                     <h3 className="text-[14px] font-semibold text-text-primary">Checklist Documental</h3>
                  </div>
                  
                  <ul className="space-y-[14px]">
                    {selectedCustoms.checklist.map((item: any, idx: number) => (
                       <li key={idx} className="flex items-start group cursor-pointer">
                         <div className="mt-[2px] w-[16px] h-[16px] shrink-0 mr-[12px]">
                            {item.done ? (
                              <CheckCircle2 className="w-[16px] h-[16px] text-success-text" />
                            ) : (
                              <Circle className="w-[16px] h-[16px] text-text-muted group-hover:text-brand" />
                            )}
                         </div>
                         <span className={`text-[13px] font-medium ${item.done ? 'text-text-primary' : 'text-text-secondary'}`}>
                            {item.name}
                         </span>
                       </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white rounded-[12px] border border-card-border shadow-sm p-[24px]">
                  <h3 className="text-[14px] font-semibold text-text-primary mb-[20px]">Línea de tiempo</h3>
                  <div className="relative pl-[16px] border-l-[2px] border-divider space-y-[24px]">
                    {selectedCustoms.timeline.map((event: any, idx: number) => (
                       <div key={idx} className="relative">
                          <div className={`absolute -left-[21px] top-[2px] w-[10px] h-[10px] rounded-full border-[2px] shadow-[0_0_0_4px_white] ${event.done ? 'bg-brand border-brand' : 'bg-white border-card-border'}`}></div>
                          <p className={`text-[12px] font-medium mb-[2px] ${event.done ? 'text-text-primary' : 'text-text-muted'}`}>{event.step}</p>
                          <p className="text-[11px] text-text-muted mt-[4px]">{event.date}</p>
                       </div>
                    ))}
                  </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {showForm && (
         <div className="bg-card flex items-center justify-center h-[400px] border border-dashed border-card-border rounded-[12px]">
            <p className="text-text-muted">Formulario de nuevo despacho no implementado</p>
            <button onClick={() => setShowForm(false)} className="ml-4 text-brand">Volver</button>
         </div>
      )}
    </div>
  );
}
