import React, { useState } from 'react';
import { initialClients, TransportType } from '../data';
import { Plane, Ship, Truck, Search, Upload, Filter, Plus, Info, FileSpreadsheet, AlertCircle } from 'lucide-react';

export default function RatesManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  
  const dummyRates = [
    { id: 1, route: 'Shanghai → Manzanillo', mode: 'Marítimo', carrier: 'Hapag-Lloyd', validity: '2023-12-31', type: 'Contrato', baseRate: 2100, surcharges: 350, margin: 15 },
    { id: 2, route: 'Shanghai → Manzanillo', mode: 'Marítimo', carrier: 'MSC', validity: '2023-11-15', type: 'Spot', baseRate: 2350, surcharges: 200, margin: 12 },
    { id: 3, route: 'Shenzhen → CDMX', mode: 'Aéreo', carrier: 'Lufthansa', validity: '2023-10-30', type: 'Spot', baseRate: 4.5, isKg: true, surcharges: 0.5, margin: 20 },
    { id: 4, route: 'Houston → Monterrey', mode: 'Terrestre', carrier: 'Swift', validity: '2024-01-31', type: 'Contrato', baseRate: 850, surcharges: 0, margin: 25 },
  ];

  const getTransportIcon = (type: string) => {
    switch(type) {
      case 'Aéreo': return <Plane className="w-[14px] h-[14px] mr-[8px] text-text-muted" />;
      case 'Marítimo': return <Ship className="w-[14px] h-[14px] mr-[8px] text-text-muted" />;
      case 'Terrestre': return <Truck className="w-[14px] h-[14px] mr-[8px] text-text-muted" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-[32px]">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-[16px]">
        <div>
          <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">Centro de control de tarifas</h2>
          <p className="text-[13px] text-text-secondary mt-[4px]">Gestiona las tarifas de compra y configura márgenes por defecto.</p>
        </div>
        <div className="flex items-center space-x-[12px]">
          <button className="flex items-center bg-white border border-card-border text-text-primary px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-neutral-bg shadow-sm transition-colors shrink-0">
            <Upload className="w-[16px] h-[16px] mr-[8px] text-text-muted" />
            Importar tarifario
          </button>
          <button className="flex items-center bg-brand text-white px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors shrink-0">
            <Plus className="w-[16px] h-[16px] mr-[8px]" />
            Nueva tarifa
          </button>
        </div>
      </div>

      <div className="bg-canvas border border-card-border rounded-[12px] p-[24px]">
         <div className="flex flex-col md:flex-row gap-[16px] items-end">
            <div className="flex-1 w-full">
              <label className="block text-[11px] font-medium text-text-muted mb-[6px] uppercase tracking-[0.05em]">Ruta (Origen / Destino)</label>
              <div className="relative">
                <Search className="w-[16px] h-[16px] absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input 
                  type="text" 
                  className="w-full bg-white border border-card-border rounded-[8px] pl-[36px] pr-[12px] py-[10px] text-[13px] focus:outline-none focus:border-brand shadow-sm text-text-primary"
                  placeholder="Ej. Shanghai Manzanillo"
                />
              </div>
            </div>
            <div className="w-full md:w-[150px]">
              <label className="block text-[11px] font-medium text-text-muted mb-[6px] uppercase tracking-[0.05em]">Modo</label>
              <select className="w-full bg-white border border-card-border rounded-[8px] px-[12px] py-[10px] text-[13px] focus:outline-none focus:border-brand shadow-sm text-text-primary">
                 <option>Todos</option>
                 <option>Aéreo</option>
                 <option>Marítimo</option>
                 <option>Terrestre</option>
              </select>
            </div>
            <div className="w-full md:w-[180px]">
              <label className="block text-[11px] font-medium text-text-muted mb-[6px] uppercase tracking-[0.05em]">Carrier / Línea</label>
              <select className="w-full bg-white border border-card-border rounded-[8px] px-[12px] py-[10px] text-[13px] focus:outline-none focus:border-brand shadow-sm text-text-primary">
                 <option>Todos</option>
                 <option>Hapag-Lloyd</option>
                 <option>MSC</option>
                 <option>Lufthansa</option>
              </select>
            </div>
            <button className="h-[42px] px-[16px] flex items-center justify-center bg-white border border-card-border rounded-[8px] hover:bg-neutral-bg transition-colors shadow-sm shrink-0">
               <Filter className="w-[16px] h-[16px] text-text-muted" />
            </button>
         </div>
      </div>

      <div className="bg-card rounded-[12px] border border-card-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Ruta</th>
                <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Modo & Carrier</th>
                <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Tipo</th>
                <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Validez</th>
                <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Costo Base (USD)</th>
                <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Recargos</th>
                <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Margen Obj.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {dummyRates.map((rate, idx) => (
                <tr key={rate.id} className="hover:bg-neutral-bg transition-colors group cursor-pointer">
                  <td className="px-[24px] py-[16px] text-[13px] text-text-primary whitespace-nowrap">
                    {rate.route}
                  </td>
                  <td className="px-[24px] py-[16px] text-[13px] text-text-secondary whitespace-nowrap">
                    <div className="flex items-center">
                      {getTransportIcon(rate.mode)}
                      <span className="font-medium text-text-primary">{rate.carrier}</span>
                    </div>
                  </td>
                  <td className="px-[24px] py-[16px]">
                     <span className={`px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] ${rate.type === 'Contrato' ? 'bg-info-bg text-info-text' : 'bg-neutral-bg text-text-secondary'}`}>
                       {rate.type}
                     </span>
                  </td>
                  <td className="px-[24px] py-[16px] text-[13px] text-text-secondary tabular-nums whitespace-nowrap">
                    {rate.validity}
                  </td>
                  <td className="px-[24px] py-[16px] text-[13px] text-text-primary tabular-nums font-medium whitespace-nowrap">
                    ${rate.baseRate.toLocaleString()} {rate.isKg ? '/ kg' : ''}
                  </td>
                  <td className="px-[24px] py-[16px] text-[13px] text-text-secondary tabular-nums whitespace-nowrap flex items-center">
                    +${rate.surcharges.toLocaleString()}
                    {rate.surcharges > 0 && <Info className="w-[14px] h-[14px] ml-[6px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />}
                  </td>
                  <td className="px-[24px] py-[16px] text-[13px] text-success-text font-medium tabular-nums whitespace-nowrap">
                    {rate.margin}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
