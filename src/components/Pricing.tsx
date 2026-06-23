import React, { useState } from 'react';
import { initialRFQs, RFQ, Modality } from './pricing/PricingData';
import { Search, Filter, Plane, Ship, Truck, FileText, ChevronRight } from 'lucide-react';
import FichaRFQ from './pricing/FichaRFQ';

export default function Pricing() {
  const [rfqs, setRfqs] = useState<RFQ[]>(initialRFQs);
  const [selectedRFQId, setSelectedRFQId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const handleOpenRFQ = (id: string) => {
    setSelectedRFQId(id);
  };

  const handleUpdateRFQ = (updatedRFQ: RFQ) => {
    setRfqs(rfqs.map(r => r.id === updatedRFQ.id ? updatedRFQ : r));
  };

  if (selectedRFQId) {
    const selectedRFQ = rfqs.find(r => r.id === selectedRFQId);
    if (selectedRFQ) {
      return (
        <FichaRFQ 
          rfq={selectedRFQ} 
          onClose={() => setSelectedRFQId(null)} 
          onUpdate={handleUpdateRFQ} 
        />
      );
    }
  }

  const filteredRFQs = rfqs.filter(r => {
    const matchesSearch = r.quoteRef.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          r.client.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter ? r.status === statusFilter : true;
    return matchesSearch && matchesStatus;
  });

  const getTransportIcon = (mod: Modality) => {
    switch (mod) {
      case 'aereo':      return <Plane className="w-3 h-3 mr-1" />;
      case 'maritimo':   return <Ship className="w-3 h-3 mr-1" />;
      case 'terrestre':  return <Truck className="w-3 h-3 mr-1" />;
      case 'aduanal':    return <FileText className="w-3 h-3 mr-1" />;
      default:           return null;
    }
  };

  const getTransportLabel = (mod: Modality) => {
    switch (mod) {
      case 'aereo': return 'Aéreo';
      case 'maritimo': return 'Marítimo';
      case 'terrestre': return 'Terrestre';
      case 'aduanal': return 'Aduanal';
      default: return mod;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pendiente':   return <span className="bg-neutral-bg text-text-secondary px-2.5 py-1 rounded-md text-[11px] font-medium tracking-wide">Pendiente</span>;
      case 'En proceso':  return <span className="bg-info-bg text-info-text px-2.5 py-1 rounded-md text-[11px] font-medium tracking-wide">En proceso</span>;
      case 'Completado':  return <span className="bg-success-bg text-success-text px-2.5 py-1 rounded-md text-[11px] font-medium tracking-wide">Completado</span>;
      default:            return null;
    }
  };

  return (
    <div className="space-y-[24px]">
      <div className="flex justify-between items-center mb-[12px]">
        <h2 className="text-[22px] font-semibold text-text-primary tracking-tight">
          Solicitudes de Pricing (RFQs)
        </h2>
      </div>

      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-[16px]">
        <div className="relative flex-1 max-w-[400px]">
          <Search className="w-[18px] h-[18px] absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input 
            type="text" 
            placeholder="Buscar por Cotización o Cliente..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-[36px] pr-[12px] py-[10px] outline-none text-[14px] bg-card border border-card-border rounded-[8px] focus:border-brand focus:ring-1 focus:ring-brand shadow-sm text-text-primary"
          />
        </div>
        <div className="flex items-center space-x-[12px]">
          <div className="relative">
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none pl-[36px] pr-[32px] py-[10px] bg-card border border-card-border rounded-[8px] text-[13px] font-medium text-text-primary focus:outline-none focus:border-brand shadow-sm cursor-pointer"
            >
              <option value="">Todos los estados</option>
              <option value="Pendiente">Pendiente</option>
              <option value="En proceso">En proceso</option>
              <option value="Completado">Completado</option>
            </select>
            <Filter className="w-[16px] h-[16px] absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <ChevronRight className="w-[14px] h-[14px] absolute right-3 top-1/2 -translate-y-1/2 text-text-muted rotate-90 pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-[12px] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-canvas border-b border-card-border">
                <th className="py-[12px] px-[20px] text-[12px] font-semibold text-text-muted uppercase tracking-wider"># Cotización</th>
                <th className="py-[12px] px-[20px] text-[12px] font-semibold text-text-muted uppercase tracking-wider">Cliente</th>
                <th className="py-[12px] px-[20px] text-[12px] font-semibold text-text-muted uppercase tracking-wider">Servicios Requeridos</th>
                <th className="py-[12px] px-[20px] text-[12px] font-semibold text-text-muted uppercase tracking-wider">Responsable</th>
                <th className="py-[12px] px-[20px] text-[12px] font-semibold text-text-muted uppercase tracking-wider">Fecha Límite</th>
                <th className="py-[12px] px-[20px] text-[12px] font-semibold text-text-muted uppercase tracking-wider">Estatus</th>
              </tr>
            </thead>
            <tbody>
              {filteredRFQs.length > 0 ? (
                filteredRFQs.map(r => (
                  <tr 
                    key={r.id} 
                    onClick={() => handleOpenRFQ(r.id)}
                    className="border-b border-card-border last:border-0 hover:bg-neutral-bg transition-colors cursor-pointer"
                  >
                    <td className="py-[16px] px-[20px]">
                      <span className="text-[14px] font-semibold text-brand">{r.quoteRef}</span>
                    </td>
                    <td className="py-[16px] px-[20px]">
                      <span className="text-[14px] font-medium text-text-primary">{r.client}</span>
                    </td>
                    <td className="py-[16px] px-[20px]">
                      <div className="flex flex-wrap gap-2">
                        {r.services.map(srv => (
                          <span key={srv.id} className="flex items-center bg-canvas border border-card-border text-text-secondary px-2 py-1 rounded-md text-[10px] font-medium uppercase tracking-wider">
                            {getTransportIcon(srv.modality)} {getTransportLabel(srv.modality)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-[16px] px-[20px]">
                      <span className="text-[13px] text-text-secondary">{r.responsible}</span>
                    </td>
                    <td className="py-[16px] px-[20px]">
                      <span className="text-[13px] text-text-secondary">{r.deadline}</span>
                    </td>
                    <td className="py-[16px] px-[20px]">
                      {getStatusBadge(r.status)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-[40px] text-center text-[13px] text-text-muted">
                    No se encontraron solicitudes de pricing que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
