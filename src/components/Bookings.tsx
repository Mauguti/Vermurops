import React, { useState } from 'react';
import { Plane, Ship, Truck, Search, Plus, Filter, ChevronRight, FileCheck, CheckCircle2, Circle, ArrowRight } from 'lucide-react';

export default function Bookings() {
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);

  const initialBookings = [
    {
      id: 'BKG-2023-014',
      client: 'Industrias Querétaro SA',
      quoteId: 'QT-1001',
      mode: 'Aéreo',
      carrier: 'Lufthansa Cargo',
      origin: 'Shenzhen',
      destination: 'Qro',
      cutoffEtd: 'ETD 2023-11-02',
      status: 'Confirmada',
      awbContainer: 'AWB-020-12345675',
      checklist: [
        { name: 'Instrucciones de embarque (SLI)', done: true },
        { name: 'Factura Comercial', done: true },
        { name: 'Packing List', done: false }
      ]
    },
    {
      id: 'BKG-2023-015',
      client: 'Grupo Textil Monterrey',
      quoteId: 'QT-1002',
      mode: 'Marítimo',
      carrier: 'Maersk',
      origin: 'Qingdao',
      destination: 'Manzanillo',
      cutoffEtd: 'Cut-off 2023-11-05',
      status: 'Documentando',
      awbContainer: 'Por asignar (2x40HC)',
      checklist: [
        { name: 'Confirmación de Booking (SO)', done: true },
        { name: 'Borrador HBL', done: false },
        { name: 'Checklist VGM', done: false }
      ]
    }
  ];

  const getTransportIcon = (type: string) => {
    switch(type) {
      case 'Aéreo': return <Plane className="w-[14px] h-[14px] mr-[8px] text-text-muted" />;
      case 'Marítimo': return <Ship className="w-[14px] h-[14px] mr-[8px] text-text-muted" />;
      case 'Terrestre': return <Truck className="w-[14px] h-[14px] mr-[8px] text-text-muted" />;
      default: return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'Solicitada': return <span className="px-[10px] py-[4px] rounded-[6px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-neutral-bg text-text-secondary">Solicitada</span>;
      case 'Confirmada': return <span className="px-[10px] py-[4px] rounded-[6px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-info-bg text-info-text">Confirmada</span>;
      case 'Documentando': return <span className="px-[10px] py-[4px] rounded-[6px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-warning-bg text-warning-text">Documentando</span>;
      case 'Lista para embarque': return <span className="px-[10px] py-[4px] rounded-[6px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-success-bg text-success-text">Lista para embarque</span>;
      default: return null;
    }
  };

  return (
    <div className="space-y-[24px]">
      {!selectedBooking && !showForm && (
        <>
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-[16px] mb-[24px]">
            <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">Reservas</h2>
            <button 
              onClick={() => setShowForm(true)}
              className="bg-brand text-white px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover transition-colors shadow-sm flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nueva reserva
            </button>
          </div>

          <div className="flex gap-[12px] items-center mb-[24px]">
            <div className="relative max-w-[400px] flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input type="text" placeholder="Buscar por reserva, cliente o cotización..." className="w-full pl-[36px] bg-card border border-card-border rounded-[8px] p-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm text-text-primary" />
            </div>
            <button className="flex items-center text-[13px] font-medium text-text-secondary bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] hover:bg-neutral-bg transition-colors shadow-sm">
              <Filter className="w-4 h-4 mr-2" /> Filtros
            </button>
          </div>

          <div className="bg-card rounded-[12px] border border-card-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]"># Reserva</th>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Cliente</th>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Cotización</th>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Ruta y Modo</th>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Carrier</th>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Cut-off / ETD</th>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Estatus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {initialBookings.map((bkg) => (
                    <tr 
                      key={bkg.id} 
                      onClick={() => setSelectedBooking(bkg)}
                      className="hover:bg-neutral-bg transition-colors cursor-pointer group"
                    >
                      <td className="px-[24px] py-[16px] text-[13px] text-text-primary font-medium whitespace-nowrap">{bkg.id}</td>
                      <td className="px-[24px] py-[16px] text-[13px] text-text-primary">{bkg.client}</td>
                      <td className="px-[24px] py-[16px] text-[13px] text-text-secondary tabular-nums group-hover:text-brand transition-colors">{bkg.quoteId}</td>
                      <td className="px-[24px] py-[16px] text-[13px] text-text-secondary whitespace-nowrap">
                        <div className="flex items-center">
                          {getTransportIcon(bkg.mode)}
                          <span>{bkg.origin} <span className="mx-1 text-text-muted">→</span> {bkg.destination}</span>
                        </div>
                      </td>
                      <td className="px-[24px] py-[16px] text-[13px] text-text-primary whitespace-nowrap">{bkg.carrier}</td>
                      <td className="px-[24px] py-[16px] text-[13px] text-text-secondary tabular-nums whitespace-nowrap">{bkg.cutoffEtd}</td>
                      <td className="px-[24px] py-[16px]">
                        {getStatusBadge(bkg.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showForm && (
        <div className="bg-card rounded-[12px] border border-card-border shadow-sm flex flex-col">
          <div className="px-[32px] py-[24px] border-b border-divider flex justify-between items-center">
            <h3 className="text-[18px] font-semibold text-text-primary tracking-tight">Crear nueva reserva</h3>
            <button onClick={() => setShowForm(false)} className="text-[13px] text-text-secondary hover:text-text-primary font-medium transition-colors">Volver</button>
          </div>
          <div className="p-[32px] flex-1">
            <div className="max-w-3xl">
              <div className="bg-info-bg border border-info-bg/50 p-[16px] rounded-[8px] mb-[24px]">
                 <label className="block text-info-text text-[12px] font-medium mb-[8px]">Crear desde cotización aceptada</label>
                 <select className="w-full border-none bg-white rounded-[6px] p-[10px] text-[13px] text-text-primary shadow-sm focus:ring-1 focus:ring-brand focus:outline-none">
                    <option value="">Selecciona una cotización...</option>
                    <option value="QT-1002">QT-1002 - Grupo Textil Monterrey (Aceptada)</option>
                 </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-[24px]">
                 <div>
                    <label className="block text-text-primary text-[11px] font-medium mb-[8px]">Carrier / Naviera</label>
                    <input type="text" className="w-full border border-card-border rounded-[8px] p-[10px] focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none text-[13px] text-text-primary bg-canvas shadow-sm" placeholder="Ej. Maersk" />
                 </div>
                 <div>
                    <label className="block text-text-primary text-[11px] font-medium mb-[8px]">Número de Booking / AWB (Opcional)</label>
                    <input type="text" className="w-full border border-card-border rounded-[8px] p-[10px] focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none text-[13px] text-text-primary bg-canvas shadow-sm" placeholder="Ej. MSKU1234567" />
                 </div>
                 <div>
                    <label className="block text-text-primary text-[11px] font-medium mb-[8px]">Cut-off Documental</label>
                    <input type="date" className="w-full border border-card-border rounded-[8px] p-[10px] focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none text-[13px] text-text-primary bg-canvas shadow-sm" />
                 </div>
                 <div>
                    <label className="block text-text-primary text-[11px] font-medium mb-[8px]">ETD (Salida Estimada)</label>
                    <input type="date" className="w-full border border-card-border rounded-[8px] p-[10px] focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none text-[13px] text-text-primary bg-canvas shadow-sm" />
                 </div>
              </div>
            </div>
          </div>
          <div className="px-[32px] py-[24px] border-t border-divider bg-canvas rounded-b-[12px] flex justify-end space-x-[12px]">
            <button 
              onClick={() => setShowForm(false)}
              className="px-[16px] py-[10px] border border-card-border bg-white text-text-primary rounded-[8px] text-[13px] font-medium hover:bg-neutral-bg transition-colors shadow-sm"
            >
              Cancelar
            </button>
            <button 
              onClick={() => { alert('Reserva creada.'); setShowForm(false); }}
              className="px-[16px] py-[10px] bg-brand text-white rounded-[8px] text-[13px] font-medium hover:bg-brand-hover transition-colors shadow-sm"
            >
              Confirmar reserva
            </button>
          </div>
        </div>
      )}

      {selectedBooking && (
        <div className="space-y-[24px]">
          {/* Breadcrumb / Header Ficha */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-[8px] text-[13px] text-text-secondary">
              <button onClick={() => setSelectedBooking(null)} className="hover:text-text-primary transition-colors">Reservas</button>
              <ChevronRight className="w-4 h-4 text-text-muted" />
              <span className="text-text-primary font-medium">{selectedBooking.id}</span>
            </div>
            <div className="flex space-x-[12px]">
               <button className="bg-white border border-card-border text-text-primary px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium hover:bg-neutral-bg transition-colors shadow-sm">
                 Editar
               </button>
               <button className="bg-brand text-white px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors flex items-center">
                 <ArrowRight className="w-4 h-4 mr-2" />
                 Convertir en embarque
               </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-[24px]">
            <div className="md:col-span-2 space-y-[24px]">
               <div className="bg-card rounded-[12px] border border-card-border shadow-sm p-[32px]">
                 <div className="flex justify-between items-start mb-[24px] pb-[24px] border-b border-divider">
                    <div>
                      <div className="flex items-center mb-[8px]">
                        <h2 className="text-[24px] font-semibold text-text-primary tracking-tight mr-[16px]">{selectedBooking.id}</h2>
                        {getStatusBadge(selectedBooking.status)}
                      </div>
                      <p className="text-[14px] text-text-secondary">{selectedBooking.client} — Cotización <span className="text-text-primary font-medium">{selectedBooking.quoteId}</span></p>
                    </div>
                    <div className="text-right">
                       <span className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] block mb-[4px]">Carrier</span>
                       <span className="text-[15px] font-medium text-text-primary">{selectedBooking.carrier}</span>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 md:grid-cols-4 gap-[24px]">
                    <div>
                      <p className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] mb-[4px]">Modo</p>
                      <div className="flex items-center text-[13px] font-medium text-text-primary">
                        {getTransportIcon(selectedBooking.mode)} {selectedBooking.mode}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] mb-[4px]">Origen</p>
                      <p className="text-[13px] font-medium text-text-primary">{selectedBooking.origin}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] mb-[4px]">Destino</p>
                      <p className="text-[13px] font-medium text-text-primary">{selectedBooking.destination}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] mb-[4px]">Booking / AWB</p>
                      <p className="text-[13px] font-medium text-text-primary">{selectedBooking.awbContainer}</p>
                    </div>
                 </div>
               </div>

               <div className="bg-card rounded-[12px] border border-card-border shadow-sm p-[32px]">
                  <h3 className="text-[15px] font-semibold text-text-primary mb-[20px]">Fechas Clave</h3>
                  <div className="grid grid-cols-3 gap-[24px]">
                     <div className="bg-canvas border border-card-border rounded-[8px] p-[16px] text-center">
                        <span className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] block mb-[8px]">Cut-off Doc</span>
                        <span className="text-[14px] font-medium text-text-primary tabular-nums">{selectedBooking.cutoffEtd.replace('Cut-off', '').replace('ETD', '').trim()}</span>
                     </div>
                     <div className="bg-canvas border border-card-border rounded-[8px] p-[16px] text-center">
                        <span className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] block mb-[8px]">ETD</span>
                        <span className="text-[14px] font-medium text-text-primary tabular-nums">Por confirmar</span>
                     </div>
                     <div className="bg-canvas border border-card-border rounded-[8px] p-[16px] text-center">
                        <span className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] block mb-[8px]">ETA Estimado</span>
                        <span className="text-[14px] font-medium text-text-primary tabular-nums">Por confirmar</span>
                     </div>
                  </div>
               </div>
            </div>

            <div className="md:col-span-1">
               <div className="bg-card rounded-[12px] border border-card-border shadow-sm p-[24px]">
                 <div className="flex items-center mb-[20px]">
                    <FileCheck className="w-[18px] h-[18px] mr-[8px] text-text-secondary" />
                    <h3 className="text-[15px] font-semibold text-text-primary">Checklist Documental</h3>
                 </div>
                 
                 <ul className="space-y-[16px]">
                   {selectedBooking.checklist.map((item: any, idx: number) => (
                      <li key={idx} className="flex items-start group cursor-pointer">
                        <div className="mt-[2px] w-[18px] h-[18px] shrink-0 mr-[12px]">
                           {item.done ? (
                             <CheckCircle2 className="w-[18px] h-[18px] text-success-text" />
                           ) : (
                             <Circle className="w-[18px] h-[18px] text-text-muted group-hover:text-brand" />
                           )}
                        </div>
                        <span className={`text-[13px] ${item.done ? 'text-text-muted line-through' : 'text-text-secondary'}`}>
                           {item.name}
                        </span>
                      </li>
                   ))}
                 </ul>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
