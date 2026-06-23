import React, { useState } from 'react';
import { initialClients } from '../data';
import { Warehouse as WarehouseIcon, Search, Plus, Filter, FileText, Printer, CheckCircle, PackageSearch, Box, Coins, Settings } from 'lucide-react';

export default function Warehouse() {
  const [activeTab, setActiveTab] = useState('Recibos de almacén');
  const [searchTerm, setSearchTerm] = useState('');

  const tabs = ['Recibos de almacén', 'Inventario', 'Picking', 'Packing', 'Cargos de almacenaje'];

  const warehouseReceipts = [
    { id: 'WR-2023-0089', client: 'Industrias Querétaro SA', linkedRef: 'PK-2023-111', pieces: '5 cajas', weight: '150 kg', volume: '0.12 CBM', location: 'Rack A-2', date: '2023-10-26', status: 'En almacén' },
    { id: 'WR-2023-0090', client: 'Comercial del Norte', linkedRef: 'SHP-2023-003', pieces: '2 pallets', weight: '1,200 kg', volume: '3.6 CBM', location: 'Rack B-1', date: '2023-10-24', status: 'Embarcado' },
    { id: 'WR-2023-0091', client: 'Grupo Textil Monterrey', linkedRef: 'PK-2023-112', pieces: '1 pallet', weight: '500 kg', volume: '1.4 CBM', location: 'Piso 1', date: '2023-10-25', status: 'En almacén' }
  ];

  const inventory = [
    { partNo: 'PN-88392-A', desc: 'Filtros industriales', qty: 250, location: 'Rack C-4', client: 'Industrias Querétaro SA', days: 12 },
    { partNo: 'PN-10293-B', desc: 'Sensores de movimiento', qty: 1200, location: 'Rack C-5', client: 'Industrias Querétaro SA', days: 12 },
    { partNo: 'TXT-A01', desc: 'Rollo mezclilla 15oz', qty: 45, location: 'Rack A-1', client: 'Grupo Textil Monterrey', days: 5 },
  ];

  const storageCharges = [
    { rule: 'Tarifa General - Pallet', rate: '$5.00 USD / día', condition: 'Por cada pallet almacenado > 3 días' },
    { rule: 'Tarifa General - Caja', rate: '$0.50 USD / día', condition: 'Por cada caja suelta' },
    { rule: 'Refrigerado', rate: '$15.00 USD / día', condition: 'Aplica a carga perecedera' }
  ];

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'En almacén': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-info-bg text-info-text">En almacén</span>;
      case 'Liberado': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-warning-bg text-warning-text">Liberado</span>;
      case 'Embarcado': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-success-bg text-success-text">Embarcado</span>;
      default: return null;
    }
  };

  return (
    <div className="space-y-[32px]">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-[16px]">
        <div>
          <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">Almacén (WMS)</h2>
          <p className="text-[13px] text-text-secondary mt-[4px]">Gestión de inventario y recibos de almacén.</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[24px]">
        <div className="bg-card p-[20px] rounded-[12px] border border-card-border shadow-sm flex items-center">
           <div className="w-[48px] h-[48px] rounded-full bg-brand/10 flex items-center justify-center mr-[16px]">
             <WarehouseIcon className="w-[20px] h-[20px] text-brand" />
           </div>
           <div>
             <p className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] mb-[2px]">Ocupación actual</p>
             <p className="text-[24px] font-semibold text-text-primary tabular-nums leading-none">68%</p>
           </div>
        </div>
        <div className="bg-card p-[20px] rounded-[12px] border border-card-border shadow-sm flex items-center">
           <div className="w-[48px] h-[48px] rounded-full bg-info-bg flex items-center justify-center mr-[16px]">
             <Box className="w-[20px] h-[20px] text-info-text" />
           </div>
           <div>
             <p className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] mb-[2px]">Ítems en piso</p>
             <p className="text-[24px] font-semibold text-text-primary tabular-nums leading-none">1,495</p>
           </div>
        </div>
        <div className="bg-card p-[20px] rounded-[12px] border border-card-border shadow-sm flex items-center">
           <div className="w-[48px] h-[48px] rounded-full bg-success-bg flex items-center justify-center mr-[16px]">
             <FileText className="w-[20px] h-[20px] text-success-text" />
           </div>
           <div>
             <p className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] mb-[2px]">Recibos de hoy</p>
             <p className="text-[24px] font-semibold text-text-primary tabular-nums leading-none">14</p>
           </div>
        </div>
      </div>

      {/* Tabs Layout */}
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
            {activeTab === 'Recibos de almacén' && (
               <div className="space-y-[20px]">
                  <div className="flex gap-[12px] items-center mb-[16px]">
                    <div className="relative max-w-[400px] flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input 
                        type="text" 
                        placeholder="Buscar recibos..." 
                        className="w-full pl-[36px] bg-white border border-card-border rounded-[8px] p-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm text-text-primary" 
                      />
                    </div>
                    <button className="flex items-center text-[13px] font-medium text-text-secondary bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] hover:bg-neutral-bg transition-colors shadow-sm">
                      <Filter className="w-4 h-4 mr-2" /> Filtros
                    </button>
                    <div className="flex-1 text-right">
                       <button className="bg-brand text-white px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover transition-colors shadow-sm inline-flex items-center">
                         <Plus className="w-4 h-4 mr-2" />
                         Nuevo recibo
                       </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-divider rounded-[8px]">
                     <table className="w-full border-collapse">
                        <thead>
                           <tr>
                              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase"># Recibo</th>
                              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Cliente</th>
                              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Ref. vinculada</th>
                              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Piezas / Peso / Vol</th>
                              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Ubicación</th>
                              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Fecha rec.</th>
                              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Estatus</th>
                              <th className="bg-canvas border-b border-divider"></th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-divider bg-white">
                           {warehouseReceipts.map(wr => (
                              <tr key={wr.id} className="hover:bg-neutral-bg transition-colors group">
                                 <td className="px-[16px] py-[12px] text-[13px] font-medium text-text-primary whitespace-nowrap">{wr.id}</td>
                                 <td className="px-[16px] py-[12px] text-[13px] text-text-primary truncate max-w-[150px]">{wr.client}</td>
                                 <td className="px-[16px] py-[12px] text-[13px] text-text-secondary">{wr.linkedRef}</td>
                                 <td className="px-[16px] py-[12px] text-[13px] text-text-secondary whitespace-nowrap">{wr.pieces} / {wr.weight} / {wr.volume}</td>
                                 <td className="px-[16px] py-[12px] text-[13px] text-text-primary font-medium">{wr.location}</td>
                                 <td className="px-[16px] py-[12px] text-[13px] text-text-secondary tabular-nums whitespace-nowrap">{wr.date}</td>
                                 <td className="px-[16px] py-[12px]">{getStatusBadge(wr.status)}</td>
                                 <td className="px-[16px] py-[12px] text-right space-x-[8px] whitespace-nowrap">
                                    <button className="text-text-muted hover:text-text-primary transition-colors p-[4px]" title="Imprimir etiqueta">
                                       <Printer className="w-[14px] h-[14px]" />
                                    </button>
                                    <button className="text-text-muted hover:text-text-primary transition-colors p-[4px]" title="Ver detalle">
                                       <FileText className="w-[14px] h-[14px]" />
                                    </button>
                                    {wr.status === 'En almacén' && (
                                       <button className="text-text-muted hover:text-brand transition-colors p-[4px]" title="Liberar carga">
                                          <CheckCircle className="w-[14px] h-[14px]" />
                                       </button>
                                    )}
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>
            )}

            {activeTab === 'Inventario' && (
               <div className="space-y-[20px]">
                  <div className="flex gap-[12px] items-center mb-[16px]">
                    <div className="relative max-w-[400px] flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input 
                        type="text" 
                        placeholder="Buscar part number..." 
                        className="w-full pl-[36px] bg-white border border-card-border rounded-[8px] p-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm text-text-primary" 
                      />
                    </div>
                    <select className="border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] text-text-primary bg-white shadow-sm outline-none focus:border-brand">
                       <option>Todos los clientes</option>
                       {initialClients.map(c => <option key={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div className="overflow-x-auto border border-divider rounded-[8px]">
                     <table className="w-full border-collapse">
                        <thead>
                           <tr>
                              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Part Number</th>
                              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Descripción</th>
                              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">On-Hand Qty</th>
                              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Ubicación</th>
                              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Propietario</th>
                              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Antigüedad</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-divider bg-white">
                           {inventory.map((inv, idx) => (
                              <tr key={idx} className="hover:bg-neutral-bg transition-colors">
                                 <td className="px-[16px] py-[12px] text-[13px] font-medium text-text-primary font-mono">{inv.partNo}</td>
                                 <td className="px-[16px] py-[12px] text-[13px] text-text-primary">{inv.desc}</td>
                                 <td className="px-[16px] py-[12px] text-[13px] font-medium text-text-primary tabular-nums">{inv.qty.toLocaleString()}</td>
                                 <td className="px-[16px] py-[12px] text-[13px] text-text-secondary">{inv.location}</td>
                                 <td className="px-[16px] py-[12px] text-[13px] text-text-primary">{inv.client}</td>
                                 <td className="px-[16px] py-[12px] text-[13px] text-text-secondary tabular-nums">
                                    <span className={`${inv.days > 10 ? 'text-warning-text font-medium' : ''}`}>{inv.days} días</span>
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>
            )}

            {activeTab === 'Cargos de almacenaje' && (
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-[24px]">
                  <div className="lg:col-span-2 space-y-[20px]">
                     <h3 className="text-[14px] font-semibold text-text-primary flex items-center">
                        <Settings className="w-[16px] h-[16px] mr-[8px] text-text-muted" />
                        Reglas de cobro
                     </h3>
                     <div className="border border-card-border rounded-[8px] bg-white overflow-hidden">
                        <table className="w-full">
                           <thead className="bg-canvas text-[11px] font-medium text-text-muted border-b border-divider">
                              <tr>
                                 <th className="text-left px-[16px] py-[12px] uppercase">Concepto</th>
                                 <th className="text-left px-[16px] py-[12px] uppercase">Tarifa</th>
                                 <th className="text-left px-[16px] py-[12px] uppercase">Condición</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-divider text-[13px]">
                              {storageCharges.map((charge, idx) => (
                                 <tr key={idx}>
                                    <td className="px-[16px] py-[12px] font-medium text-text-primary">{charge.rule}</td>
                                    <td className="px-[16px] py-[12px] text-text-secondary tabular-nums">{charge.rate}</td>
                                    <td className="px-[16px] py-[12px] text-text-muted">{charge.condition}</td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                  </div>
                  <div className="lg:col-span-1">
                     <div className="bg-canvas border border-card-border rounded-[12px] p-[24px]">
                        <h3 className="text-[14px] font-semibold text-text-primary mb-[16px] flex items-center">
                           <Coins className="w-[16px] h-[16px] mr-[8px] text-text-muted" />
                           Liquidación / Facturación
                        </h3>
                        <div className="space-y-[12px] mb-[24px]">
                           <div>
                              <label className="block text-[11px] font-medium text-text-muted mb-[4px] uppercase">Cliente a liquidar</label>
                              <select className="w-full border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] bg-white shadow-sm focus:outline-none focus:border-brand">
                                 <option>Industrias Querétaro SA</option>
                              </select>
                           </div>
                           <div>
                              <p className="text-[11px] font-medium text-text-muted mb-[4px] uppercase mt-[16px]">Cargos calculados al día de hoy</p>
                              <div className="flex justify-between items-center text-[13px] mb-[8px]">
                                 <span className="text-text-secondary">Almacenaje (12 días)</span>
                                 <span className="font-medium text-text-primary">$180.00 USD</span>
                              </div>
                              <div className="flex justify-between items-center text-[13px] border-b border-divider pb-[12px]">
                                 <span className="text-text-secondary">Maniobras de entrada</span>
                                 <span className="font-medium text-text-primary">$50.00 USD</span>
                              </div>
                              <div className="flex justify-between items-center text-[15px] font-bold text-text-primary pt-[12px]">
                                 <span>Total sugerido</span>
                                 <span>$230.00 USD</span>
                              </div>
                           </div>
                        </div>
                        <button className="w-full bg-brand text-white px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors">
                           Generar factura de almacenaje
                        </button>
                     </div>
                  </div>
               </div>
            )}

            {(activeTab === 'Picking' || activeTab === 'Packing') && (
               <div className="flex flex-col items-center justify-center p-[60px] border border-dashed border-card-border rounded-[8px] bg-white">
                  <PackageSearch className="w-[32px] h-[32px] text-text-muted mb-[16px]" />
                  <p className="text-[14px] font-medium text-text-primary mb-[4px]">Cola de {activeTab} vacía</p>
                  <p className="text-[13px] text-text-secondary text-center max-w-[300px]">No hay órdenes pendientes de {activeTab.toLowerCase()} en este momento.</p>
               </div>
            )}
         </div>
      </div>
    </div>
  );
}
