import React, { useState } from 'react';
import { initialClients } from '../data';
import { DollarSign, FileText, CheckCircle, Clock, AlertCircle, Plus, Search, Filter, Download, ArrowRight, X, File, ShieldCheck, Calculator } from 'lucide-react';
import FichaFactura from './finance/FichaFactura';
import { useOrdenesCompra } from '../hooks/useOrdenesCompra';
import BandejaOC from './ordenesCompra/BandejaOC';
import ModuloEnDesarrollo from './ui/ModuloEnDesarrollo';
import { useDestinoPendiente } from '../navegacion/NavegacionContext';

export default function Finance() {
  const [activeTab, setActiveTab] = useState('Facturas (CFDI)');
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  /*
   * U-4 · Alguien enlazó a una orden de compra desde un embarque o desde un
   * proveedor. La OC todavía no tiene ficha propia —se construye en el bloque
   * C del plan de operación— así que el salto deja al usuario en la bandeja
   * donde vive, que es lo más cerca que se puede llevar hoy.
   */
  useDestinoPendiente(['ordenCompra'], () => {
    setSelectedInvoice(null);
    setShowForm(false);
    setActiveTab('Cuentas por pagar');
  });

  // ── OC: datos reales de Firestore ─────────────────────────────────────────
  const { ordenes, loading: loadingOC, totalPorPagar, conteosPorEstado } = useOrdenesCompra();

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
            {/* El botón «Nueva factura» abría un formulario mock que no
                timbraba nada. Se retira hasta que la facturación exista dentro
                del embarque (Bloque 5). */}
          </div>

          {/* KPIs
              Aquí había cuatro tarjetas: tres con cifras inventadas
              ($145,250 facturado, $62,400 por cobrar, $18,250 vencido) que
              nunca se conectaron a nada. Cifras financieras falsas que se ven
              creíbles son peor que no tener el dato. Se conserva solo la que
              sale de datos reales: por pagar a proveedores, desde las OC. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-[16px]">
            <div className="bg-white p-[20px] rounded-[12px] border border-card-border shadow-sm">
               <p className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] mb-[4px]">Por pagar (Prov.)</p>
               <p className="text-[24px] font-semibold text-text-primary tabular-nums">
                 {loadingOC ? (
                   <span className="text-text-muted">...</span>
                 ) : (
                   <>${totalPorPagar.toLocaleString()} <span className="text-[14px] text-text-muted font-normal">USD</span></>
                 )}
               </p>
            </div>
            <div className="col-span-1 md:col-span-3 bg-white p-[20px] rounded-[12px] border border-dashed border-card-border shadow-sm flex items-center">
               <p className="text-[12px] text-text-secondary leading-snug">
                 Los indicadores de facturado, por cobrar y vencido todavía no
                 están conectados. Se muestran en cuanto la facturación viva
                 dentro del embarque.
               </p>
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
                   <ModuloEnDesarrollo
                     descripcion="La emisión de CFDI todavía no está conectada. La factura se generará dentro del embarque, asociada a la operación, para no capturar dos veces los conceptos."
                     pendiente="el timbrado CFDI y dónde se administran las notas de crédito."
                   />
                )}

                {activeTab === 'Cuentas por cobrar' && (
                   <ModuloEnDesarrollo
                     descripcion="La cartera por cobrar se alimentará de las facturas emitidas desde el embarque. Hoy no hay facturas reales que mostrar."
                   />
                )}

                {activeTab === 'Cuentas por pagar' && (
                   <BandejaOC
                     ordenes={ordenes}
                     loading={loadingOC}
                     conteosPorEstado={conteosPorEstado}
                   />
                )}

                {activeTab === 'Estados de cuenta' && (
                   <ModuloEnDesarrollo
                     descripcion="El estado de cuenta por cliente requiere las facturas emitidas y los pagos aplicados."
                   />
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
