import React, { useState } from 'react';
import { Search, MapPin, Package, Clock, FileText, Download, DollarSign, Box, ArrowRight, Compass, ShieldCheck, ChevronRight, CheckCircle2, User, LogOut, Send } from 'lucide-react';

export default function ClientPortal({ onReturn }: { onReturn: () => void }) {
  const [activeTab, setActiveTab] = useState('rastreo');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingResult, setTrackingResult] = useState<any>(null);

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingNumber) return;
    // Simulate finding a shipment
    setTrackingResult({
      id: trackingNumber.toUpperCase(),
      origin: 'Qingdao, Port (CN)',
      destination: 'Manzanillo (MX)',
      status: 'En tránsito',
      eta: '12 Nov 2023',
      timeline: [
        { step: 'Reserva confirmada', date: '15 Oct 2023, 10:00', done: true },
        { step: 'Carga recibida en origen', date: '18 Oct 2023, 14:30', done: true },
        { step: 'Salida de puerto (Vessel Departs)', date: '20 Oct 2023, 08:00', done: true },
        { step: 'En tránsito', date: 'Actual', done: true, current: true },
        { step: 'Llegada a destino (ETA)', date: '12 Nov 2023', done: false },
        { step: 'Despacho y entrega', date: 'Pendiente', done: false }
      ]
    });
  };

  const myShipments = [
    { id: 'SHP-2023-003', origin: 'Shanghai, CN', destination: 'Manzanillo, MX', type: 'FCL', status: 'En tránsito', eta: '12 Nov 2023' },
    { id: 'SHP-2023-005', origin: 'Laredo, TX', destination: 'Nuevo Laredo, MX', type: 'FTL', status: 'En aduana', eta: '25 Oct 2023' },
    { id: 'SHP-2023-001', origin: 'Ningbo, CN', destination: 'Manzanillo, MX', type: 'FCL', status: 'Entregado', eta: '10 Oct 2023' }
  ];

  const invoices = [
    { id: 'F-2023-086', concept: 'Despacho aduanal y flete terrestre (SHP-2023-003)', total: 1392, currency: 'USD', status: 'Vencida', date: '15 Oct 2023' },
    { id: 'F-2023-082', concept: 'Flete marítimo SHP-2023-001', total: 4500, currency: 'USD', status: 'Pagada', date: '01 Oct 2023' }
  ];

  const inventory = [
    { partNo: 'PN-88392-A', desc: 'Filtros industriales', qty: 250, location: 'Rack C-4 (Manzanillo)', days: 12 },
    { partNo: 'PN-10293-B', desc: 'Sensores de movimiento', qty: 1200, location: 'Rack C-5 (Manzanillo)', days: 12 }
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-text-primary font-sans flex flex-col">
      {/* Top Navigation */}
      <header className="bg-white border-b border-card-border px-[5%] py-[20px] flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center space-x-[12px] cursor-pointer" onClick={onReturn} title="Volver al Admin">
          <div className="bg-white rounded py-2 px-3 flex items-center justify-center shadow-sm border border-card-border">
             <img src="https://firebasestorage.googleapis.com/v0/b/digsol-academy.firebasestorage.app/o/LOGOTIPO%20(1).png?alt=media&token=702db209-5869-4471-acb6-ac7740e5453b" alt="Vermur Logo" className="h-6 object-contain" />
          </div>
        </div>
        
        <nav className="hidden md:flex space-x-[32px]">
          <button onClick={() => setActiveTab('rastreo')} className={`text-[14px] font-medium transition-colors ${activeTab === 'rastreo' ? 'text-brand' : 'text-text-secondary hover:text-text-primary'}`}>Rastreo</button>
          <button onClick={() => setActiveTab('embarques')} className={`text-[14px] font-medium transition-colors ${activeTab === 'embarques' ? 'text-brand' : 'text-text-secondary hover:text-text-primary'}`}>Mis Embarques</button>
          <button onClick={() => setActiveTab('cotizar')} className={`text-[14px] font-medium transition-colors ${activeTab === 'cotizar' ? 'text-brand' : 'text-text-secondary hover:text-text-primary'}`}>Cotizar</button>
          <button onClick={() => setActiveTab('finanzas')} className={`text-[14px] font-medium transition-colors ${activeTab === 'finanzas' ? 'text-brand' : 'text-text-secondary hover:text-text-primary'}`}>Facturas</button>
          <button onClick={() => setActiveTab('inventario')} className={`text-[14px] font-medium transition-colors ${activeTab === 'inventario' ? 'text-brand' : 'text-text-secondary hover:text-text-primary'}`}>Inventario WMS</button>
        </nav>

        <div className="flex items-center space-x-[16px]">
          <div className="hidden sm:flex items-center space-x-[12px] text-right">
             <div>
               <p className="text-[13px] font-semibold text-text-primary leading-tight">Comercial del Norte</p>
               <p className="text-[11px] text-text-muted">ID: CL-8842</p>
             </div>
             <div className="w-[36px] h-[36px] rounded-full bg-canvas border border-card-border flex items-center justify-center">
                <User className="w-[16px] h-[16px] text-text-secondary" />
             </div>
          </div>
          <button className="text-text-muted hover:text-error-text transition-colors"><LogOut className="w-[18px] h-[18px]" /></button>
        </div>
      </header>

      <main className="flex-1">
        {activeTab === 'rastreo' && (
          <div className="w-full">
             <div className="bg-brand text-white py-[80px] px-[5%] relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 100% 0%, white 0%, transparent 50%)' }}></div>
                <div className="max-w-[700px] mx-auto text-center relative z-10">
                   <h1 className="text-[40px] md:text-[52px] font-extrabold tracking-tight mb-[16px] leading-[1.1]">Rastrea tu carga en un instante</h1>
                   <p className="text-[16px] md:text-[18px] text-white/80 font-medium mb-[40px]">Cotiza, monitorea y administra tu logística, todo desde un solo lugar.</p>
                   
                   <form onSubmit={handleTrack} className="bg-white p-[8px] rounded-[16px] shadow-2xl flex items-center max-w-[600px] mx-auto border-[4px] border-white/20">
                      <div className="flex-1 flex items-center pl-[16px]">
                         <Search className="w-[20px] h-[20px] text-text-muted mr-[12px]" />
                         <input 
                           type="text" 
                           placeholder="Ingresa tu # de embarque (ej. SHP-2023-003)" 
                           value={trackingNumber}
                           onChange={(e) => setTrackingNumber(e.target.value)}
                           className="w-full text-[16px] font-medium text-text-primary focus:outline-none placeholder:text-text-muted/60"
                         />
                      </div>
                      <button type="submit" className="bg-brand text-white font-medium text-[15px] px-[32px] py-[16px] rounded-[12px] hover:bg-brand-hover transition-colors whitespace-nowrap">
                         Rastrear
                      </button>
                   </form>
                </div>
             </div>

             <div className="px-[5%] py-[60px] max-w-[1200px] mx-auto">
                {trackingResult ? (
                   <div className="bg-white rounded-[24px] shadow-sm border border-card-border p-[32px] md:p-[48px] animate-in fade-in slide-in-from-bottom-8 duration-500">
                      <div className="flex flex-col md:flex-row justify-between md:items-center border-b border-divider pb-[32px] mb-[40px] gap-[24px]">
                         <div>
                            <span className="inline-block px-[12px] py-[4px] bg-brand/10 text-brand text-[12px] font-bold tracking-[0.05em] uppercase rounded-full mb-[12px]">Embarque {trackingResult.id}</span>
                            <h2 className="text-[28px] font-bold text-text-primary tracking-tight">{trackingResult.status}</h2>
                            <p className="text-[15px] text-text-secondary mt-[4px]">ETA estimado: <strong className="text-text-primary">{trackingResult.eta}</strong></p>
                         </div>
                         <div className="flex items-center space-x-[16px] text-[15px] font-medium bg-canvas p-[20px] rounded-[16px] border border-card-border">
                            <div className="flex flex-col">
                               <span className="text-[11px] text-text-muted uppercase tracking-[0.05em] mb-[4px]">Origen</span>
                               <span className="text-text-primary flex items-center"><MapPin className="w-[14px] h-[14px] mr-[6px] text-text-muted" />{trackingResult.origin}</span>
                            </div>
                            <ArrowRight className="w-[20px] h-[20px] text-text-muted mx-[8px]" />
                            <div className="flex flex-col">
                               <span className="text-[11px] text-text-muted uppercase tracking-[0.05em] mb-[4px]">Destino</span>
                               <span className="text-text-primary flex items-center"><MapPin className="w-[14px] h-[14px] mr-[6px] text-text-muted" />{trackingResult.destination}</span>
                            </div>
                         </div>
                      </div>

                      <div className="max-w-[600px] mx-auto">
                         <div className="relative pl-[40px] border-l-[3px] border-brand/20 space-y-[40px]">
                           {trackingResult.timeline.map((event: any, idx: number) => (
                              <div key={idx} className="relative">
                                 <div className={`absolute -left-[41.5px] top-[2px] w-[20px] h-[20px] rounded-full border-[4px] shadow-[0_0_0_6px_white] flex items-center justify-center
                                    ${event.current ? 'bg-brand border-brand animate-pulse' : event.done ? 'bg-brand border-brand' : 'bg-white border-card-border'}
                                 `}>
                                    {event.done && !event.current && <CheckCircle2 className="w-[10px] h-[10px] text-white" />}
                                 </div>
                                 <p className={`text-[16px] font-bold leading-tight mb-[4px] ${event.current ? 'text-brand' : event.done ? 'text-text-primary' : 'text-text-muted'}`}>{event.step}</p>
                                 <p className="text-[13px] text-text-secondary font-medium">{event.date}</p>
                              </div>
                           ))}
                         </div>
                      </div>
                   </div>
                ) : (
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-[24px]">
                      <div className="bg-white p-[32px] rounded-[16px] border border-card-border shadow-sm text-center flex flex-col items-center">
                         <div className="w-[64px] h-[64px] bg-brand/10 text-brand rounded-full flex items-center justify-center mb-[24px]">
                            <Compass className="w-[32px] h-[32px]" />
                         </div>
                         <h3 className="text-[18px] font-bold text-text-primary mb-[8px]">Rastreo en tiempo real</h3>
                         <p className="text-[14px] text-text-secondary">Conoce el estatus exacto de tus mercancías las 24 horas del día.</p>
                      </div>
                      <div className="bg-white p-[32px] rounded-[16px] border border-card-border shadow-sm text-center flex flex-col items-center">
                         <div className="w-[64px] h-[64px] bg-brand/10 text-brand rounded-full flex items-center justify-center mb-[24px]">
                            <FileText className="w-[32px] h-[32px]" />
                         </div>
                         <h3 className="text-[18px] font-bold text-text-primary mb-[8px]">Documentación digital</h3>
                         <p className="text-[14px] text-text-secondary">Descarga tus facturas, pedimentos y BLs directamente desde el portal.</p>
                      </div>
                      <div className="bg-white p-[32px] rounded-[16px] border border-card-border shadow-sm text-center flex flex-col items-center">
                         <div className="w-[64px] h-[64px] bg-brand/10 text-brand rounded-full flex items-center justify-center mb-[24px]">
                            <Box className="w-[32px] h-[32px]" />
                         </div>
                         <h3 className="text-[18px] font-bold text-text-primary mb-[8px]">Visibilidad de inventario</h3>
                         <p className="text-[14px] text-text-secondary">Revisa tu stock en nuestros almacenes y gestiona recolecciones.</p>
                      </div>
                   </div>
                )}
             </div>
          </div>
        )}

        {activeTab === 'embarques' && (
          <div className="max-w-[1200px] mx-auto px-[5%] py-[48px]">
             <div className="flex justify-between items-end mb-[32px]">
                <div>
                   <h2 className="text-[32px] font-extrabold text-text-primary tracking-tight">Mis Embarques</h2>
                   <p className="text-[15px] text-text-secondary mt-[4px]">Últimos movimientos de tu carga.</p>
                </div>
                <div className="relative w-[300px]">
                   <Search className="w-[18px] h-[18px] text-text-muted absolute left-[12px] top-1/2 -translate-y-1/2" />
                   <input type="text" placeholder="Buscar embarque..." className="w-full pl-[40px] pr-[16px] py-[10px] bg-white border border-card-border rounded-[8px] text-[14px] shadow-sm focus:outline-none focus:border-brand" />
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[24px]">
                {myShipments.map(shp => (
                   <div key={shp.id} className="bg-white rounded-[16px] p-[24px] border border-card-border shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col">
                      <div className="flex justify-between items-start mb-[20px]">
                         <span className="text-[16px] font-bold text-text-primary">{shp.id}</span>
                         <span className={`px-[10px] py-[4px] rounded-full text-[11px] font-bold uppercase tracking-[0.05em] 
                            ${shp.status === 'En tránsito' ? 'bg-brand/10 text-brand' : 
                              shp.status === 'En aduana' ? 'bg-warning-bg text-warning-text' : 
                              'bg-success-bg text-success-text'}`}>
                            {shp.status}
                         </span>
                      </div>
                      
                      <div className="flex flex-col space-y-[12px] mb-[24px] flex-1">
                         <div className="flex items-start">
                            <div className="w-[24px] flex justify-center mr-[12px] mt-[2px]"><div className="w-[8px] h-[8px] rounded-full bg-text-muted"></div></div>
                            <div>
                               <p className="text-[11px] text-text-muted uppercase font-medium">Origen</p>
                               <p className="text-[14px] font-semibold text-text-primary">{shp.origin}</p>
                            </div>
                         </div>
                         <div className="flex items-start">
                            <div className="w-[24px] flex justify-center mr-[12px] mt-[2px]"><div className="w-[8px] h-[8px] rounded-full bg-brand"></div></div>
                            <div>
                               <p className="text-[11px] text-text-muted uppercase font-medium">Destino</p>
                               <p className="text-[14px] font-semibold text-text-primary">{shp.destination}</p>
                            </div>
                         </div>
                      </div>

                      <div className="pt-[16px] border-t border-divider flex justify-between items-center">
                         <div className="flex items-center text-[13px] text-text-secondary font-medium">
                            <Clock className="w-[16px] h-[16px] mr-[6px] text-brand" />
                            ETA: {shp.eta}
                         </div>
                         <span className="text-[13px] font-bold text-text-primary bg-canvas px-[8px] py-[4px] rounded-[6px]">{shp.type}</span>
                      </div>
                   </div>
                ))}
             </div>
          </div>
        )}

        {activeTab === 'cotizar' && (
          <div className="max-w-[800px] mx-auto px-[5%] py-[48px]">
             <div className="bg-white rounded-[24px] border border-card-border shadow-md overflow-hidden">
                <div className="bg-brand px-[40px] py-[32px] text-white">
                   <h2 className="text-[28px] font-bold tracking-tight mb-[8px]">Solicita una Cotización</h2>
                   <p className="text-[15px] font-medium text-white/80">Cuéntanos sobre tu carga y te enviaremos una propuesta competitiva en menos de 24 horas.</p>
                </div>
                <div className="p-[40px] space-y-[24px]">
                   <div className="grid grid-cols-2 gap-[24px]">
                      <div>
                         <label className="block text-[13px] font-bold text-text-primary mb-[8px]">Origen</label>
                         <input type="text" placeholder="Ej. Shanghai, China" className="w-full px-[16px] py-[12px] bg-canvas border border-card-border rounded-[12px] text-[14px] focus:outline-none focus:border-brand focus:bg-white transition-colors" />
                      </div>
                      <div>
                         <label className="block text-[13px] font-bold text-text-primary mb-[8px]">Destino</label>
                         <input type="text" placeholder="Ej. Manzanillo, México" className="w-full px-[16px] py-[12px] bg-canvas border border-card-border rounded-[12px] text-[14px] focus:outline-none focus:border-brand focus:bg-white transition-colors" />
                      </div>
                   </div>
                   
                   <div>
                      <label className="block text-[13px] font-bold text-text-primary mb-[8px]">Modo de Transporte</label>
                      <div className="grid grid-cols-3 gap-[16px]">
                         {['FCL (Contenedor)', 'LCL (Carga Suelta)', 'Aéreo', 'FTL (Caja Completa)', 'LTL', 'Aduanas'].map(mode => (
                            <label key={mode} className="flex items-center p-[16px] border border-card-border rounded-[12px] hover:border-brand cursor-pointer group transition-colors">
                               <input type="radio" name="mode" className="w-[16px] h-[16px] text-brand border-card-border focus:ring-brand" />
                               <span className="ml-[12px] text-[14px] font-semibold text-text-secondary group-hover:text-text-primary">{mode}</span>
                            </label>
                         ))}
                      </div>
                   </div>

                   <div>
                      <label className="block text-[13px] font-bold text-text-primary mb-[8px]">Detalles de la carga</label>
                      <textarea rows={4} placeholder="Peso, dimensiones, tipo de mercancía, requerimientos especiales..." className="w-full px-[16px] py-[12px] bg-canvas border border-card-border rounded-[12px] text-[14px] focus:outline-none focus:border-brand focus:bg-white transition-colors"></textarea>
                   </div>
                   
                   <div className="pt-[16px]">
                      <button className="w-full bg-brand text-white font-bold text-[16px] py-[16px] rounded-[12px] hover:bg-brand-hover transition-colors shadow-sm flex items-center justify-center">
                         <Send className="w-[18px] h-[18px] mr-[12px]" />
                         Enviar Solicitud
                      </button>
                   </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'finanzas' && (
          <div className="max-w-[1200px] mx-auto px-[5%] py-[48px]">
             <div className="flex justify-between items-end mb-[32px]">
                <div>
                   <h2 className="text-[32px] font-extrabold text-text-primary tracking-tight">Mis Facturas</h2>
                   <p className="text-[15px] text-text-secondary mt-[4px]">Historial de pagos y descargas CFDI.</p>
                </div>
                <div className="bg-error-bg/10 border border-error-bg rounded-[12px] p-[16px] flex items-center">
                   <div className="w-[12px] h-[12px] rounded-full bg-error-text mr-[12px] animate-pulse"></div>
                   <div>
                      <span className="block text-[11px] font-bold text-error-text uppercase tracking-wide">Saldo Vencido</span>
                      <span className="block text-[18px] font-black text-text-primary">$1,392.00 USD</span>
                   </div>
                </div>
             </div>

             <div className="bg-white rounded-[16px] border border-card-border shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                   <thead>
                      <tr>
                         <th className="bg-canvas border-b border-card-border py-[16px] px-[24px] text-[12px] font-bold text-text-muted uppercase tracking-[0.05em]">Folio</th>
                         <th className="bg-canvas border-b border-card-border py-[16px] px-[24px] text-[12px] font-bold text-text-muted uppercase tracking-[0.05em]">Concepto</th>
                         <th className="bg-canvas border-b border-card-border py-[16px] px-[24px] text-[12px] font-bold text-text-muted uppercase tracking-[0.05em]">Fecha</th>
                         <th className="bg-canvas border-b border-card-border py-[16px] px-[24px] text-[12px] font-bold text-text-muted uppercase tracking-[0.05em]">Monto</th>
                         <th className="bg-canvas border-b border-card-border py-[16px] px-[24px] text-[12px] font-bold text-text-muted uppercase tracking-[0.05em]">Estatus</th>
                         <th className="bg-canvas border-b border-card-border py-[16px] px-[24px]"></th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-card-border">
                      {invoices.map((inv) => (
                         <tr key={inv.id} className="hover:bg-canvas/50 transition-colors">
                            <td className="py-[20px] px-[24px] font-bold text-[14px] text-text-primary">{inv.id}</td>
                            <td className="py-[20px] px-[24px] font-medium text-[14px] text-text-secondary">{inv.concept}</td>
                            <td className="py-[20px] px-[24px] font-medium text-[14px] text-text-secondary">{inv.date}</td>
                            <td className="py-[20px] px-[24px] font-black text-[15px] text-text-primary">${inv.total.toLocaleString()} {inv.currency}</td>
                            <td className="py-[20px] px-[24px]">
                               <span className={`px-[10px] py-[4px] rounded-[6px] text-[11px] font-bold uppercase tracking-[0.05em] 
                                  ${inv.status === 'Pagada' ? 'bg-success-bg text-success-text' : 'bg-error-bg text-error-text'}`}>
                                  {inv.status}
                               </span>
                            </td>
                            <td className="py-[20px] px-[24px] text-right space-x-[8px]">
                               {inv.status === 'Vencida' && (
                                 <button className="bg-text-primary text-white text-[12px] font-bold px-[16px] py-[8px] rounded-[8px] hover:bg-black transition-colors">Pagar</button>
                               )}
                               <button className="text-text-muted hover:text-brand bg-white border border-card-border p-[8px] rounded-[8px] shadow-sm transition-colors" title="Descargar CFDI (PDF/XML)">
                                  <Download className="w-[16px] h-[16px]" />
                               </button>
                            </td>
                         </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </div>
        )}

        {activeTab === 'inventario' && (
          <div className="max-w-[1200px] mx-auto px-[5%] py-[48px]">
             <div className="mb-[32px]">
                <h2 className="text-[32px] font-extrabold text-text-primary tracking-tight">Mi Inventario</h2>
                <p className="text-[15px] text-text-secondary mt-[4px]">Mercancía on-hand en almacenes Vermur.</p>
             </div>

             <div className="bg-white rounded-[16px] border border-card-border shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                   <thead>
                      <tr>
                         <th className="bg-canvas border-b border-card-border py-[16px] px-[24px] text-[12px] font-bold text-text-muted uppercase tracking-[0.05em]">Número de Parte</th>
                         <th className="bg-canvas border-b border-card-border py-[16px] px-[24px] text-[12px] font-bold text-text-muted uppercase tracking-[0.05em]">Descripción</th>
                         <th className="bg-canvas border-b border-card-border py-[16px] px-[24px] text-[12px] font-bold text-text-muted uppercase tracking-[0.05em]">Cantidad Disponible</th>
                         <th className="bg-canvas border-b border-card-border py-[16px] px-[24px] text-[12px] font-bold text-text-muted uppercase tracking-[0.05em]">Ubicación</th>
                         <th className="bg-canvas border-b border-card-border py-[16px] px-[24px] text-[12px] font-bold text-text-muted uppercase tracking-[0.05em]">Días en almacén</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-card-border">
                      {inventory.map((inv, idx) => (
                         <tr key={idx} className="hover:bg-canvas/50 transition-colors">
                            <td className="py-[20px] px-[24px] font-mono font-bold text-[14px] text-text-primary">{inv.partNo}</td>
                            <td className="py-[20px] px-[24px] font-medium text-[14px] text-text-primary">{inv.desc}</td>
                            <td className="py-[20px] px-[24px] font-black text-[15px] text-brand">{inv.qty.toLocaleString()} <span className="text-[12px] font-medium text-text-muted ml-[4px]">pzas</span></td>
                            <td className="py-[20px] px-[24px] font-medium text-[14px] text-text-secondary">{inv.location}</td>
                            <td className="py-[20px] px-[24px] font-medium text-[14px] text-text-secondary">{inv.days} días</td>
                         </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-card-border py-[32px] px-[5%] text-center mt-auto">
         <div className="flex items-center justify-center space-x-[8px] mb-[16px]">
            <Compass className="w-[18px] h-[18px] text-brand" />
            <span className="font-bold text-text-primary text-[14px]">Vermur <span className="font-medium text-text-secondary">Logistics</span></span>
         </div>
         <p className="text-[12px] font-medium text-text-muted">© 2023 Vermur Logistics. Todos los derechos reservados. Portal impulsado por VermurOps.</p>
      </footer>
    </div>
  );
}
