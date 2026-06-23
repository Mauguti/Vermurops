import React, { useState } from 'react';
import { initialClients } from '../data';
import { DollarSign, FileText, CheckCircle, Clock, AlertCircle, Plus, Search, Filter, Download, ArrowRight, X, File, ShieldCheck, Calculator } from 'lucide-react';
import FichaFactura from './finance/FichaFactura';

export default function Finance() {
  const [activeTab, setActiveTab] = useState('Facturas (CFDI)');
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  const tabs = ['Facturas (CFDI)', 'Cuentas por cobrar', 'Cuentas por pagar', 'Estados de cuenta'];

  const invoices = [
    { id: 'F-2023-085', uuid: '1A2B3C4D-5E6F...', client: 'Grupo Textil Monterrey', rfc: 'GTM991012XXX', concept: 'Flete marítimo y maniobras (QT-1002)', subtotal: 3500, vat: 525, total: 4025, currency: 'USD', cfdiStatus: 'Timbrada', paymentStatus: 'Pagada' },
    { id: 'F-2023-086', uuid: '9F8E7D6C-5B4A...', client: 'Comercial del Norte', rfc: 'CNO880505YYY', concept: 'Despacho aduanal y flete terrestre (SHP-2023-003)', subtotal: 1200, vat: 192, total: 1392, currency: 'USD', cfdiStatus: 'Timbrada', paymentStatus: 'Vencida' },
    { id: 'F-2023-087', uuid: 'Pendiente', client: 'Industrias Querétaro SA', rfc: 'IQU770101ZZZ', concept: 'Flete aéreo (QT-1001)', subtotal: 2800, vat: 448, total: 3248, currency: 'USD', cfdiStatus: 'Borrador', paymentStatus: 'Pendiente' },
    { id: 'F-2023-080', uuid: '5D4C3B2A-1F0E...', client: 'Tech Solutions MX', rfc: 'TSM660707AAA', concept: 'Despacho aduanal', subtotal: 800, vat: 128, total: 928, currency: 'USD', cfdiStatus: 'Cancelada', paymentStatus: 'Cancelada' }
  ];

  const receivables = [
    { client: 'Comercial del Norte', current: 0, days30: 1392, days60: 4500, days90: 1200, total: 7092 },
    { client: 'Tech Solutions MX', current: 5200, days30: 800, days60: 0, days90: 0, total: 6000 },
    { client: 'Industrias Querétaro SA', current: 3248, days30: 0, days60: 0, days90: 0, total: 3248 }
  ];

  const getCfdiBadge = (status: string) => {
    switch(status) {
      case 'Borrador': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-neutral-bg text-text-secondary">Borrador</span>;
      case 'Timbrada': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-info-bg text-info-text">Timbrada</span>;
      case 'Cancelada': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-error-bg text-error-text">Cancelada</span>;
      default: return null;
    }
  };

  const getPaymentBadge = (status: string) => {
    switch(status) {
      case 'Pendiente': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-warning-bg text-warning-text">Pendiente</span>;
      case 'Pagada': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-success-bg text-success-text">Pagada</span>;
      case 'Vencida': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-error-bg text-error-text">Vencida</span>;
      case 'Cancelada': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-neutral-bg text-text-secondary">Cancelada</span>;
      default: return null;
    }
  };

  const handleExportCSV = () => {
    const headers = ['Folio', 'UUID', 'Cliente', 'RFC', 'Concepto', 'Total', 'Moneda', 'Estatus CFDI', 'Estatus Pago'];
    const rows = invoices.map(inv => [
      inv.id, inv.uuid, inv.client, inv.rfc, inv.concept, inv.total, inv.currency, inv.cfdiStatus, inv.paymentStatus
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(f => `"${String(f).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'facturas_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (selectedInvoice) {
    return <FichaFactura invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />;
  }

  return (
    <div className="space-y-[32px]">
      {!showForm ? (
        <>
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-[16px]">
            <div>
              <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">Facturación y Finanzas</h2>
              <p className="text-[13px] text-text-secondary mt-[4px]">Control de pagos, facturación CFDI 4.0 y cuentas por cobrar.</p>
            </div>
            {activeTab === 'Facturas (CFDI)' && (
              <button 
                onClick={() => setShowForm(true)}
                className="bg-brand text-white px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors flex items-center shrink-0"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nueva factura (CFDI)
              </button>
            )}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-[16px]">
            <div className="bg-white p-[20px] rounded-[12px] border border-card-border shadow-sm">
               <p className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] mb-[4px]">Facturado del mes</p>
               <p className="text-[24px] font-semibold text-text-primary tabular-nums">$145,250 <span className="text-[14px] text-text-muted font-normal">USD</span></p>
            </div>
            <div className="bg-white p-[20px] rounded-[12px] border border-card-border shadow-sm">
               <p className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] mb-[4px]">Por cobrar</p>
               <p className="text-[24px] font-semibold text-info-text tabular-nums">$62,400 <span className="text-[14px] text-info-text/70 font-normal">USD</span></p>
            </div>
            <div className="bg-white p-[20px] rounded-[12px] border border-warning-bg shadow-sm bg-warning-bg/10">
               <p className="text-[11px] font-medium text-warning-text uppercase tracking-[0.05em] mb-[4px]">Vencido</p>
               <p className="text-[24px] font-semibold text-error-text tabular-nums">$18,250 <span className="text-[14px] text-error-text/70 font-normal">USD</span></p>
            </div>
            <div className="bg-white p-[20px] rounded-[12px] border border-card-border shadow-sm">
               <p className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] mb-[4px]">Por pagar (Prov.)</p>
               <p className="text-[24px] font-semibold text-text-primary tabular-nums">$42,100 <span className="text-[14px] text-text-muted font-normal">USD</span></p>
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-[12px] shadow-sm flex flex-col overflow-hidden">
             <div className="px-[24px] border-b border-divider bg-canvas">
                <nav className="-mb-px flex space-x-[24px] overflow-x-auto">
                  {tabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`py-[16px] px-[4px] text-[13px] font-medium transition-colors border-b-[2px] whitespace-nowrap ${
                        activeTab === tab
                          ? 'border-brand text-text-primary'
                          : 'border-transparent text-text-muted hover:text-text-secondary hover:border-text-muted'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </nav>
             </div>

             <div className="p-[24px]">
                {activeTab === 'Facturas (CFDI)' && (
                   <div className="space-y-[20px]">
                      <div className="flex gap-[12px] items-center mb-[16px]">
                        <div className="relative max-w-[400px] flex-1">
                          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                          <input 
                            type="text" 
                            placeholder="Buscar folio, UUID, cliente..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-[36px] bg-white border border-card-border rounded-[8px] p-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm text-text-primary" 
                          />
                        </div>
                        <button className="flex items-center text-[13px] font-medium text-text-secondary bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] hover:bg-neutral-bg transition-colors shadow-sm">
                          <Filter className="w-4 h-4 mr-2" /> Filtros
                        </button>
                        <button onClick={handleExportCSV} className="flex items-center text-[13px] font-medium text-text-secondary bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] hover:bg-neutral-bg transition-colors shadow-sm">
                          <Download className="w-4 h-4 mr-2" /> Exportar a CSV
                        </button>
                      </div>

                      <div className="overflow-x-auto border border-divider rounded-[8px]">
                         <table className="w-full border-collapse">
                            <thead>
                               <tr>
                                  <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Folio</th>
                                  <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">UUID</th>
                                  <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Cliente / RFC</th>
                                  <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Concepto</th>
                                  <th className="bg-canvas text-right px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Total (Mon)</th>
                                  <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Estatus CFDI</th>
                                  <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Estatus Pago</th>
                                  <th className="bg-canvas border-b border-divider"></th>
                               </tr>
                            </thead>
                            <tbody className="divide-y divide-divider bg-white">
                               {invoices.map(inv => (
                                  <tr key={inv.id} className="hover:bg-neutral-bg transition-colors group">
                                     <td className="px-[16px] py-[12px] text-[13px] font-medium text-text-primary whitespace-nowrap">{inv.id}</td>
                                     <td className="px-[16px] py-[12px] text-[12px] text-text-muted font-mono whitespace-nowrap">{inv.uuid}</td>
                                     <td className="px-[16px] py-[12px] text-[13px] truncate max-w-[200px]">
                                        <span className="block text-text-primary font-medium truncate">{inv.client}</span>
                                        <span className="block text-text-secondary text-[11px]">{inv.rfc}</span>
                                     </td>
                                     <td className="px-[16px] py-[12px] text-[13px] text-text-secondary truncate max-w-[200px]">{inv.concept}</td>
                                     <td className="px-[16px] py-[12px] text-[13px] font-medium text-text-primary text-right tabular-nums whitespace-nowrap">
                                        ${inv.total.toLocaleString()} {inv.currency}
                                     </td>
                                     <td className="px-[16px] py-[12px]">{getCfdiBadge(inv.cfdiStatus)}</td>
                                     <td className="px-[16px] py-[12px]">{getPaymentBadge(inv.paymentStatus)}</td>
                                     <td className="px-[16px] py-[12px] text-right space-x-[4px] whitespace-nowrap">
                                        <button onClick={() => setSelectedInvoice(inv)} className="text-text-muted hover:text-text-primary transition-colors p-[4px] rounded hover:bg-canvas" title="Ver PDF/XML">
                                           <FileText className="w-[14px] h-[14px]" />
                                        </button>
                                        {inv.cfdiStatus === 'Borrador' && (
                                          <button className="text-text-muted hover:text-brand transition-colors p-[4px] rounded hover:bg-canvas" title="Timbrar">
                                             <ShieldCheck className="w-[14px] h-[14px]" />
                                          </button>
                                        )}
                                        {inv.paymentStatus === 'Pendiente' || inv.paymentStatus === 'Vencida' ? (
                                          <button className="text-text-muted hover:text-success-text transition-colors p-[4px] rounded hover:bg-canvas" title="Registrar pago">
                                             <DollarSign className="w-[14px] h-[14px]" />
                                          </button>
                                        ) : null}
                                     </td>
                                  </tr>
                               ))}
                            </tbody>
                         </table>
                      </div>
                   </div>
                )}

                {activeTab === 'Cuentas por cobrar' && (
                   <div className="space-y-[20px]">
                      <div className="flex justify-between items-center mb-[16px]">
                         <h3 className="text-[15px] font-semibold text-text-primary">Antigüedad de saldos (Aging)</h3>
                         <button className="flex items-center text-[12px] text-brand hover:underline font-medium">
                            <Download className="w-[14px] h-[14px] mr-[6px]" /> Exportar reporte
                         </button>
                      </div>
                      <div className="overflow-x-auto border border-divider rounded-[8px]">
                         <table className="w-full border-collapse">
                            <thead>
                               <tr>
                                  <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Cliente</th>
                                  <th className="bg-canvas text-right px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Corriente</th>
                                  <th className="bg-canvas text-right px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">1 - 30 Días</th>
                                  <th className="bg-canvas text-right px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">31 - 60 Días</th>
                                  <th className="bg-canvas text-right px-[16px] py-[12px] text-[11px] font-medium text-warning-text border-b border-divider uppercase">60+ Días</th>
                                  <th className="bg-canvas text-right px-[16px] py-[12px] text-[11px] font-bold text-text-primary border-b border-divider uppercase">Total Deuda</th>
                               </tr>
                            </thead>
                            <tbody className="divide-y divide-divider bg-white">
                               {receivables.map((rec, idx) => {
                                  const hasOverdue = rec.days60 > 0 || rec.days90 > 0 || rec.days30 > 0;
                                  return (
                                  <tr key={idx} className={`hover:bg-neutral-bg transition-colors ${rec.client === 'Comercial del Norte' ? 'bg-warning-bg/5' : ''}`}>
                                     <td className="px-[16px] py-[12px] text-[13px] font-medium text-text-primary">{rec.client}</td>
                                     <td className="px-[16px] py-[12px] text-[13px] text-text-secondary text-right tabular-nums">${rec.current.toLocaleString()}</td>
                                     <td className="px-[16px] py-[12px] text-[13px] text-text-secondary text-right tabular-nums">${rec.days30.toLocaleString()}</td>
                                     <td className="px-[16px] py-[12px] text-[13px] text-text-secondary text-right tabular-nums">
                                        <span className={rec.days60 > 0 ? 'text-warning-text font-medium' : ''}>${rec.days60.toLocaleString()}</span>
                                     </td>
                                     <td className="px-[16px] py-[12px] text-[13px] text-text-secondary text-right tabular-nums">
                                        <span className={rec.days90 > 0 ? 'text-error-text font-medium' : ''}>${rec.days90.toLocaleString()}</span>
                                     </td>
                                     <td className={`px-[16px] py-[12px] text-[13px] font-semibold text-right tabular-nums ${hasOverdue ? 'text-error-text' : 'text-text-primary'}`}>
                                        ${rec.total.toLocaleString()}
                                     </td>
                                  </tr>
                               )})}
                            </tbody>
                         </table>
                      </div>
                   </div>
                )}
                
                {(activeTab === 'Cuentas por pagar' || activeTab === 'Estados de cuenta') && (
                   <div className="flex flex-col items-center justify-center p-[60px] border border-dashed border-card-border rounded-[8px] bg-white">
                      <Calculator className="w-[32px] h-[32px] text-text-muted mb-[16px]" />
                      <p className="text-[14px] font-medium text-text-primary mb-[4px]">Módulo en desarrollo</p>
                      <p className="text-[13px] text-text-secondary text-center max-w-[300px]">Esta sección estará disponible próximamente en la plataforma.</p>
                   </div>
                )}
             </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-[12px] border border-card-border shadow-sm flex flex-col h-[calc(100vh-120px)] min-h-[600px] overflow-hidden">
           <div className="px-[32px] py-[20px] border-b border-divider flex justify-between items-center bg-canvas shrink-0">
             <div>
                <h3 className="text-[18px] font-semibold text-text-primary tracking-tight">Nueva Factura (CFDI 4.0)</h3>
                <p className="text-[12px] text-text-secondary">Folio siguiente: F-2023-088</p>
             </div>
             <button onClick={() => setShowForm(false)} className="bg-white p-[6px] border border-card-border rounded-[6px] text-text-muted hover:text-text-primary transition-colors">
               <X className="w-[18px] h-[18px]" />
             </button>
           </div>
           
           <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* Form Side */}
              <div className="flex-1 overflow-y-auto p-[32px] border-r border-divider custom-scrollbar">
                 <div className="space-y-[24px]">
                    <div>
                       <h4 className="text-[13px] font-semibold text-text-primary mb-[12px] border-b border-divider pb-[8px]">Datos del Receptor</h4>
                       <div className="grid grid-cols-1 gap-[16px]">
                          <div>
                            <label className="block text-[11px] font-medium text-text-muted mb-[6px] uppercase">Cliente</label>
                            <select className="w-full border border-card-border rounded-[8px] p-[10px] text-[13px] text-text-primary shadow-sm focus:border-brand focus:outline-none">
                               <option>Seleccione cliente...</option>
                               <option>Industrias Querétaro SA (IQU770101ZZZ)</option>
                               <option>Comercial del Norte (CNO880505YYY)</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-[16px]">
                             <div>
                                <label className="block text-[11px] font-medium text-text-muted mb-[6px] uppercase">Régimen Fiscal (Receptor)</label>
                                <select className="w-full border border-card-border rounded-[8px] p-[10px] text-[13px] text-text-primary shadow-sm focus:border-brand focus:outline-none">
                                   <option>601 - General de Ley Personas Morales</option>
                                </select>
                             </div>
                             <div>
                                <label className="block text-[11px] font-medium text-text-muted mb-[6px] uppercase">Uso de CFDI</label>
                                <select className="w-full border border-card-border rounded-[8px] p-[10px] text-[13px] text-text-primary shadow-sm focus:border-brand focus:outline-none">
                                   <option>G03 - Gastos en general</option>
                                   <option>P01 - Por definir</option>
                                </select>
                             </div>
                          </div>
                       </div>
                    </div>

                    <div>
                       <h4 className="text-[13px] font-semibold text-text-primary mb-[12px] border-b border-divider pb-[8px]">Datos de Pago</h4>
                       <div className="grid grid-cols-3 gap-[16px]">
                          <div>
                            <label className="block text-[11px] font-medium text-text-muted mb-[6px] uppercase">Método de Pago</label>
                            <select className="w-full border border-card-border rounded-[8px] p-[10px] text-[13px] text-text-primary shadow-sm focus:border-brand focus:outline-none">
                               <option>PUE - Pago en una sola exhibición</option>
                               <option>PPD - Pago en parcialidades o diferido</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-text-muted mb-[6px] uppercase">Forma de Pago</label>
                            <select className="w-full border border-card-border rounded-[8px] p-[10px] text-[13px] text-text-primary shadow-sm focus:border-brand focus:outline-none">
                               <option>03 - Transferencia electrónica</option>
                               <option>99 - Por definir</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-text-muted mb-[6px] uppercase">Moneda</label>
                            <select className="w-full border border-card-border rounded-[8px] p-[10px] text-[13px] text-text-primary shadow-sm focus:border-brand focus:outline-none">
                               <option>USD</option>
                               <option>MXN</option>
                            </select>
                          </div>
                       </div>
                    </div>

                    <div>
                       <div className="flex justify-between items-center mb-[12px] border-b border-divider pb-[8px]">
                          <h4 className="text-[13px] font-semibold text-text-primary">Conceptos</h4>
                          <button className="text-[12px] font-medium text-brand hover:underline">Vincular cotización...</button>
                       </div>
                       
                       <div className="bg-canvas border border-card-border rounded-[8px] p-[16px] space-y-[16px]">
                          <div className="grid grid-cols-12 gap-[12px]">
                             <div className="col-span-3">
                                <label className="block text-[10px] font-medium text-text-muted uppercase mb-[4px]">Clave Prod/Serv (SAT)</label>
                                <input type="text" value="78101802" className="w-full border border-card-border rounded-[6px] p-[8px] text-[12px] focus:outline-none focus:border-brand" />
                             </div>
                             <div className="col-span-2">
                                <label className="block text-[10px] font-medium text-text-muted uppercase mb-[4px]">Cantidad</label>
                                <input type="number" value="1" className="w-full border border-card-border rounded-[6px] p-[8px] text-[12px] focus:outline-none focus:border-brand" />
                             </div>
                             <div className="col-span-3">
                                <label className="block text-[10px] font-medium text-text-muted uppercase mb-[4px]">V. Unitario</label>
                                <input type="text" value="3500.00" className="w-full border border-card-border rounded-[6px] p-[8px] text-[12px] focus:outline-none focus:border-brand" />
                             </div>
                             <div className="col-span-4">
                                <label className="block text-[10px] font-medium text-text-muted uppercase mb-[4px]">Importe</label>
                                <input type="text" value="3500.00" disabled className="w-full border border-card-border rounded-[6px] p-[8px] text-[12px] bg-neutral-bg font-medium" />
                             </div>
                             <div className="col-span-12">
                                <label className="block text-[10px] font-medium text-text-muted uppercase mb-[4px]">Descripción</label>
                                <input type="text" value="Flete marítimo y maniobras" className="w-full border border-card-border rounded-[6px] p-[8px] text-[12px] focus:outline-none focus:border-brand" />
                             </div>
                          </div>

                          <button className="w-full border border-dashed border-card-border rounded-[6px] p-[8px] text-[12px] font-medium text-text-secondary hover:bg-white transition-colors cursor-pointer text-center">
                             + Agregar concepto
                          </button>
                       </div>
                    </div>

                 </div>
              </div>

              {/* Preview Side */}
              <div className="w-[380px] bg-canvas hidden md:flex flex-col shrink-0 border-l border-divider">
                 <div className="p-[20px] border-b border-divider">
                    <h4 className="text-[13px] font-semibold text-text-primary">Vista Previa Totales</h4>
                 </div>
                 <div className="flex-1 p-[24px]">
                    <div className="bg-white border border-card-border rounded-[12px] p-[24px] shadow-sm">
                       <div className="flex justify-between items-center border-b border-divider pb-[16px] mb-[16px]">
                          <span className="text-[12px] text-text-secondary uppercase tracking-[0.05em]">Subtotal</span>
                          <span className="text-[14px] font-medium text-text-primary tabular-nums">$3,500.00 USD</span>
                       </div>
                       <div className="flex justify-between items-center border-b border-divider pb-[16px] mb-[16px]">
                          <span className="text-[12px] text-text-secondary uppercase tracking-[0.05em]">IVA (16%)</span>
                          <span className="text-[14px] font-medium text-text-primary tabular-nums">$560.00 USD</span>
                       </div>
                       <div className="flex justify-between items-center border-b border-divider pb-[16px] mb-[16px]">
                          <span className="text-[12px] text-text-secondary uppercase tracking-[0.05em]">Retenciones</span>
                          <span className="text-[14px] font-medium text-text-primary tabular-nums">$0.00 USD</span>
                       </div>
                       <div className="flex justify-between items-center pt-[8px]">
                          <span className="text-[14px] font-semibold text-text-primary uppercase tracking-[0.05em]">Total</span>
                          <span className="text-[20px] font-bold text-brand tabular-nums">$4,060.00 USD</span>
                       </div>
                    </div>
                 </div>
                 <div className="p-[24px] border-t border-divider bg-white flex justify-end space-x-[12px]">
                    <button onClick={() => setShowForm(false)} className="px-[16px] py-[10px] text-[13px] font-medium text-text-secondary hover:bg-canvas rounded-[8px] transition-colors border border-card-border shadow-sm">
                       Guardar borrador
                    </button>
                    <button onClick={() => { alert('CFDI Timbrado'); setShowForm(false); }} className="px-[16px] py-[10px] text-[13px] font-medium text-white bg-brand hover:bg-brand-hover rounded-[8px] transition-colors shadow-sm flex items-center">
                       <ShieldCheck className="w-[16px] h-[16px] mr-[8px]" />
                       Timbrar CFDI
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
