import React, { useState } from 'react';
import { Search, Phone, Mail, Upload, Plane, Ship, Truck, FileText, Check, ChevronRight } from 'lucide-react';
import { useClientes } from '../hooks/useClientes';
import { useProveedores } from '../hooks/useProveedores';
import { ProveedorVermur, contactoPrincipal } from './proveedores/ProveedoresData';
import FichaCliente from './clientes/FichaCliente';
import NuevoClienteModal from './clientes/NuevoClienteModal';
import ProveedorFormModal from './proveedores/ProveedorFormModal';

export default function Clients() {
  const { clientes, loading, error, createCliente, updateCliente } = useClientes();
  const { proveedores, loading: loadingProv, error: errorProv, createProveedor, updateProveedor } = useProveedores();
  const [viewType, setViewType] = useState<'Clientes' | 'Proveedores'>('Clientes');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('Cuentas');
  const [showModal, setShowModal] = useState(false);

  const [providerSearchTerm, setProviderSearchTerm] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const selectedProvider = selectedProviderId
    ? (proveedores.find(p => p.id === selectedProviderId) ?? null)
    : null;

  const [showProvModal, setShowProvModal] = useState<false | 'crear' | 'editar'>(false);

  // Derive selectedClient from live clientes array so FichaCliente always gets fresh data
  const selectedClient = selectedClientId
    ? (clientes.find(c => c.id === selectedClientId) ?? null)
    : null;

  if (loading || loadingProv) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  if (error || errorProv) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-center">
          <p className="text-[14px] font-medium text-danger-text mb-1">Error al cargar datos</p>
          <p className="text-[12px] text-text-muted">{error || errorProv}</p>
        </div>
      </div>
    );
  }

  const filteredClients = clientes.filter(c =>
    c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.rfc.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.representante.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredProviders = proveedores.filter(p => {
    const cp = contactoPrincipal(p);
    return p.nombre.toLowerCase().includes(providerSearchTerm.toLowerCase()) ||
      p.rfc.toLowerCase().includes(providerSearchTerm.toLowerCase()) ||
      (cp?.nombre ?? '').toLowerCase().includes(providerSearchTerm.toLowerCase());
  });

  const tabs = ['Cuentas', 'Contactos', 'Leads', 'Oportunidades'];
  const providerTabs = ['Todos', 'Navieras', 'Aerolíneas', 'Transportistas', 'Aduanales'];

  const getTransportIcon = (type: string) => {
    switch (type) {
      case 'aereo':      return <Plane className="w-3 h-3 mr-1" />;
      case 'maritimo':   return <Ship className="w-3 h-3 mr-1" />;
      case 'terrestre':  return <Truck className="w-3 h-3 mr-1" />;
      case 'aduanal':    return <FileText className="w-3 h-3 mr-1" />;
      default:           return null;
    }
  };

  const getTransportLabel = (type: string) => {
    switch (type) {
      case 'aereo': return 'Aéreo';
      case 'maritimo': return 'Marítimo';
      case 'terrestre': return 'Terrestre';
      case 'aduanal': return 'Aduanal';
      default: return type;
    }
  };

  return (
    <div className="space-y-[24px]">
      {/* Top Toggle Selector */}
      {!selectedClientId && !selectedProvider && (
        <div className="flex justify-between items-center mb-[12px] bg-card p-4 rounded-xl border border-card-border shadow-sm">
          <h2 className="text-[18px] font-semibold text-text-primary tracking-tight">
            Directorio Empresarial
          </h2>
          <div className="bg-canvas border border-card-border p-1 rounded-lg flex items-center shadow-2xs">
            <button
              onClick={() => setViewType('Clientes')}
              className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors ${viewType === 'Clientes' ? 'bg-white text-text-primary shadow-sm border border-card-border' : 'text-text-muted hover:text-text-secondary'}`}
            >
              Clientes
            </button>
            <button
              onClick={() => setViewType('Proveedores')}
              className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors ${viewType === 'Proveedores' ? 'bg-white text-text-primary shadow-sm border border-card-border' : 'text-text-muted hover:text-text-secondary'}`}
            >
              Proveedores
            </button>
          </div>
        </div>
      )}

      {viewType === 'Clientes' && !selectedClientId && (
        <>
          {/* Top Tabs */}
          <div className="border-b border-divider mb-[24px]">
            <nav className="-mb-px flex space-x-[32px]">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`pb-[12px] px-[4px] text-[14px] font-medium transition-colors border-b-[2px] ${
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

          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-[16px] mb-[24px]">
            <div className="relative flex-1 max-w-[480px]">
              <Search className="w-[18px] h-[18px] absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Buscar por razón social, RFC, representante..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-[36px] pr-[12px] py-[10px] outline-none text-[14px] bg-card border border-card-border rounded-[8px] focus:border-brand focus:ring-1 focus:ring-brand shadow-sm text-text-primary"
              />
            </div>
            <div className="flex items-center space-x-[12px]">
              <button className="flex items-center bg-white border border-card-border text-text-primary px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-neutral-bg shadow-sm transition-colors shrink-0">
                <Upload className="w-[16px] h-[16px] mr-2 text-text-muted" />
                Importar CSV
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="bg-brand text-white px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors shrink-0"
              >
                Nuevo cliente
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[24px]">
            {filteredClients.map(cliente => (
              <div
                key={cliente.id}
                className="bg-card rounded-[12px] border border-card-border transition-all overflow-hidden flex flex-col shadow-sm"
              >
                <div className="p-[20px] pb-[16px]">
                  <div className="flex justify-between items-start mb-[4px]">
                    <div className="pr-[12px]">
                      <h3 className="font-semibold text-text-primary text-[15px] leading-snug">{cliente.nombre}</h3>
                      {cliente.comercial && (
                        <p className="text-[12px] text-text-muted mt-0.5">{cliente.comercial}</p>
                      )}
                    </div>
                    <span className={`shrink-0 text-[11px] font-medium tracking-[0.02em] px-[8px] py-[2px] rounded-[4px] ${
                      cliente.statusOperativo === 'ACTIVO'
                        ? 'bg-success-bg text-success-text'
                        : 'bg-neutral-bg text-text-secondary'
                    }`}>
                      {cliente.statusOperativo}
                    </span>
                  </div>
                  <p className="text-[13px] text-text-muted font-mono">{cliente.rfc}</p>
                </div>

                <div className="px-[20px] pb-[20px] space-y-[10px] flex-1">
                  <div className="flex items-center text-[13px] text-text-secondary">
                    <Mail className="w-[16px] h-[16px] mr-[10px] text-text-muted" />
                    <span className="truncate">{cliente.correo}</span>
                  </div>
                  <div className="flex items-center text-[13px] text-text-secondary">
                    <Phone className="w-[16px] h-[16px] mr-[10px] text-text-muted" />
                    {cliente.telefono}
                  </div>
                </div>

                <div className="grid grid-cols-3 divide-x divide-divider border-t border-divider bg-canvas">
                  <div className="p-[12px] text-center">
                    <div className="text-[11px] text-text-muted font-medium mb-[2px]">Crédito</div>
                    <div className="font-medium text-text-primary text-[13px]">
                      {cliente.tipoCredito === 'credito' ? `${cliente.dias}d` : 'Contado'}
                    </div>
                  </div>
                  <div className="p-[12px] text-center">
                    <div className="text-[11px] text-text-muted font-medium mb-[2px]">Divisa</div>
                    <div className="font-medium text-text-primary text-[13px] tabular-nums">{cliente.divisa}</div>
                  </div>
                  <div className="p-[12px] text-center">
                    <div className="text-[11px] text-text-muted font-medium mb-[2px]">Línea</div>
                    <div className="font-medium text-text-primary text-[13px] tabular-nums">
                      {cliente.monto > 0 ? `${(cliente.monto / 1000).toFixed(0)}k` : '—'}
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => setSelectedClientId(cliente.id)}
                  className="border-t border-divider py-[12px] text-center cursor-pointer transition-colors hover:bg-neutral-bg group"
                >
                  <span className="text-[13px] font-medium text-text-primary group-hover:text-brand transition-colors">Ver ficha</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {viewType === 'Clientes' && selectedClient && (
        <FichaCliente
          cliente={selectedClient}
          onBack={() => setSelectedClientId(null)}
          onUpdate={updateCliente}
        />
      )}

      {/* ========================================================= */}
      {/* VISTA DE PROVEEDORES */}
      {/* ========================================================= */}

      {viewType === 'Proveedores' && !selectedProvider ? (
        <>
          <div className="border-b border-divider mb-[24px]">
            <nav className="-mb-px flex space-x-[32px]">
              {providerTabs.map((tab) => (
                <button
                  key={tab}
                  className={`pb-[12px] px-[4px] text-[14px] font-medium transition-colors border-b-[2px] ${
                    tab === 'Todos'
                      ? 'border-brand text-text-primary'
                      : 'border-transparent text-text-muted hover:text-text-secondary hover:border-text-muted'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-[16px] mb-[24px]">
            <div className="relative flex-1 max-w-[480px]">
              <Search className="w-[18px] h-[18px] absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Buscar por nombre, RFC o contacto..."
                value={providerSearchTerm}
                onChange={(e) => setProviderSearchTerm(e.target.value)}
                className="w-full pl-[36px] pr-[12px] py-[10px] outline-none text-[14px] bg-card border border-card-border rounded-[8px] focus:border-brand focus:ring-1 focus:ring-brand shadow-sm text-text-primary"
              />
            </div>
            <div className="flex items-center space-x-[12px]">
              <button
                onClick={() => setShowProvModal('crear')}
                className="bg-brand text-white px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors shrink-0"
              >
                Nuevo proveedor
              </button>
            </div>
          </div>

          {/* Grid de proveedores */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[24px]">
            {filteredProviders.map(provider => {
              const cp = contactoPrincipal(provider);
              return (
              <div
                key={provider.id}
                onClick={() => setSelectedProviderId(provider.id)}
                className="bg-card rounded-[12px] border border-card-border transition-all overflow-hidden flex flex-col shadow-sm hover:border-brand/30 cursor-pointer group"
              >
                <div className="p-[20px] pb-[16px] border-b border-divider">
                  <div className="flex justify-between items-start mb-[8px]">
                    <h3 className="font-semibold text-text-primary text-[15px] leading-snug pr-[12px]">{provider.nombre}</h3>
                    <span className={`shrink-0 text-[11px] font-medium tracking-[0.02em] px-[8px] py-[2px] rounded-[4px] ${provider.activo ? 'bg-success-bg text-success-text' : 'bg-neutral-bg text-text-secondary'}`}>
                      {provider.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>

                  {/* Modalidades Badges */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {provider.modalidades.map(mod => (
                      <span key={mod} className="flex items-center bg-canvas border border-card-border text-text-secondary px-2 py-1 rounded-md text-[10px] font-medium uppercase tracking-wider">
                        {getTransportIcon(mod)}
                        {getTransportLabel(mod)}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="px-[20px] py-[16px] space-y-[10px] flex-1 bg-canvas">
                  {cp && (
                  <div className="flex items-start text-[13px]">
                    <div className="w-[32px] h-[32px] bg-white border border-card-border rounded-full flex items-center justify-center font-bold text-brand mr-3 shrink-0">
                      {cp.nombre.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-text-primary leading-tight">{cp.nombre}</p>
                      <p className="text-[11px] text-text-muted mt-0.5">{cp.puesto}</p>
                    </div>
                  </div>
                  )}
                  {cp && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center text-[12px] text-text-secondary">
                      <Mail className="w-[14px] h-[14px] mr-[10px] text-text-muted" />
                      <span className="truncate">{cp.email}</span>
                    </div>
                    <div className="flex items-center text-[12px] text-text-secondary">
                      <Phone className="w-[14px] h-[14px] mr-[10px] text-text-muted" />
                      {cp.telefono}
                    </div>
                  </div>
                  )}
                </div>

                <div className="border-t border-divider py-[10px] bg-white text-center transition-colors group-hover:bg-brand/5">
                  <span className="text-[12px] font-medium text-text-primary group-hover:text-brand transition-colors">Ver ficha completa</span>
                </div>
              </div>
              );
            })}
          </div>
        </>
      ) : null}

      {/* Ficha de Proveedor */}
      {viewType === 'Proveedores' && selectedProvider ? (() => {
        const cp = contactoPrincipal(selectedProvider);
        return (
        <div className="space-y-[24px]">
          {/* Header Ficha Proveedor */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-[8px] text-[13px] text-text-secondary">
              <button onClick={() => setSelectedProviderId(null)} className="hover:text-text-primary transition-colors">Proveedores</button>
              <ChevronRight className="w-4 h-4 text-text-muted" />
              <span className="text-text-primary font-medium">{selectedProvider.nombre}</span>
            </div>
            <div className="flex space-x-[12px]">
               <button
                 onClick={() => setShowProvModal('editar')}
                 className="bg-white border border-card-border text-text-primary px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium hover:bg-neutral-bg transition-colors shadow-sm"
               >
                 Editar Datos
               </button>
               <button className="bg-brand text-white px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors">
                 Nueva Solicitud
               </button>
            </div>
          </div>

          <div className="bg-card rounded-[12px] border border-card-border shadow-sm overflow-hidden flex flex-col md:flex-row">
            {/* Main Content (Left 2/3) */}
            <div className="flex-1 border-r border-divider flex flex-col">
              <div className="p-[32px] border-b border-divider bg-white">
                <div className="flex justify-between items-start">
                  <div className="flex items-center space-x-[16px] mb-[16px]">
                    <div className="w-[64px] h-[64px] bg-brand/10 border border-brand/20 rounded-[12px] flex items-center justify-center text-[24px] font-bold text-brand">
                      {selectedProvider.nombre.charAt(0)}
                    </div>
                    <div>
                      <h2 className="text-[24px] font-semibold text-text-primary tracking-tight leading-none mb-[8px]">{selectedProvider.nombre}</h2>
                      <div className="flex items-center text-[13px] space-x-[12px]">
                        <span className="text-text-secondary font-mono">RFC: {selectedProvider.rfc}</span>
                        <span className="text-divider">•</span>
                        <a href={`http://${selectedProvider.website}`} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                          {selectedProvider.website}
                        </a>
                      </div>
                    </div>
                  </div>

                  <span className={`px-[10px] py-[4px] rounded-md text-[12px] font-semibold tracking-wide ${selectedProvider.activo ? 'bg-success-bg text-success-text' : 'bg-neutral-bg text-text-secondary'}`}>
                    {selectedProvider.activo ? 'PROVEEDOR ACTIVO' : 'INACTIVO'}
                  </span>
                </div>

                <div className="mt-[24px] pt-[24px] border-t border-divider">
                  <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-[12px]">Modalidades Soportadas</h4>
                  <div className="flex flex-wrap gap-4">
                    {['maritimo', 'aereo', 'terrestre', 'aduanal'].map(mod => {
                      const isSupported = selectedProvider.modalidades.includes(mod as any);
                      return (
                        <div key={mod} className={`flex items-center border rounded-lg px-3 py-2 ${isSupported ? 'border-brand/30 bg-brand/5' : 'border-card-border bg-canvas opacity-50'}`}>
                          <div className={`w-4 h-4 rounded border flex items-center justify-center mr-2 ${isSupported ? 'bg-brand border-brand' : 'border-text-muted'}`}>
                            {isSupported && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span className={`text-[12px] font-semibold uppercase tracking-wide ${isSupported ? 'text-brand' : 'text-text-muted'}`}>
                            {getTransportLabel(mod)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {cp && (
                <div className="flex flex-wrap gap-[24px] mt-[24px] pt-[24px] border-t border-divider">
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-[11px] font-medium text-text-muted mb-[4px]">Contacto Principal</p>
                    <p className="text-[15px] font-semibold text-text-primary">{cp.nombre}</p>
                    <p className="text-[13px] text-text-secondary">{cp.puesto}</p>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-[11px] font-medium text-text-muted mb-[4px]">Contacto Rápido</p>
                    <div className="space-y-1">
                      <p className="text-[14px] font-medium text-text-primary flex items-center"><Mail className="w-4 h-4 mr-2 text-text-muted"/> {cp.email}</p>
                      <p className="text-[14px] font-medium text-text-primary flex items-center"><Phone className="w-4 h-4 mr-2 text-text-muted"/> {cp.telefono}</p>
                    </div>
                  </div>
                </div>
                )}
              </div>

              {/* Internal Tabs Provider */}
              <div className="px-[32px] border-b border-divider bg-canvas">
                <nav className="-mb-px flex space-x-[24px]">
                  {['Historial de Cotizaciones', 'Notas Internas'].map((tab) => (
                    <button
                      key={tab}
                      className={`py-[16px] px-[4px] text-[13px] font-medium transition-colors border-b-[2px] ${
                        tab === 'Historial de Cotizaciones'
                          ? 'border-brand text-text-primary'
                          : 'border-transparent text-text-muted hover:text-text-secondary hover:border-text-muted'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </nav>
              </div>

              <div className="p-[32px] flex-1 bg-white">
                <h3 className="text-[15px] font-semibold text-text-primary mb-4">Cotizaciones Enviadas por {selectedProvider.nombre}</h3>

                {/* Historial se conectará en E15 (trazabilidad) — por ahora placeholder */}
                <div className="flex flex-col items-center justify-center py-10 border border-dashed border-card-border rounded-lg bg-canvas text-text-muted">
                  <FileText className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-[13px]">Sin historial — se conectará al historial real de cotizaciones.</p>
                </div>

                {/* Notas Internas */}
                <div className="mt-8">
                  <h3 className="text-[15px] font-semibold text-text-primary mb-3">Notas Internas (Pricing / Operaciones)</h3>
                  <div className="bg-warning-bg border border-warning-border rounded-lg p-4">
                    <p className="text-[13px] text-warning-text leading-relaxed">{selectedProvider.notas || 'Sin notas.'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar Resumen */}
            <div className="w-full md:w-[280px] bg-canvas shrink-0 p-[24px]">
              <h3 className="text-[14px] font-semibold text-text-primary mb-[20px]">Resumen Operativo</h3>
              <div className="space-y-4">
                <div className="bg-white border border-card-border p-4 rounded-lg shadow-sm">
                  <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold mb-1">Total Cotizado</p>
                  <p className="text-[20px] font-bold text-text-primary">—</p>
                </div>
                <div className="bg-white border border-card-border p-4 rounded-lg shadow-sm">
                  <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold mb-1">Cotizaciones Atendidas</p>
                  <p className="text-[20px] font-bold text-text-primary">—</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        );
      })() : null}

      {showModal && (
        <NuevoClienteModal
          onClose={() => setShowModal(false)}
          onCreate={createCliente}
        />
      )}

      {showProvModal && (
        <ProveedorFormModal
          mode={showProvModal}
          proveedor={showProvModal === 'editar' && selectedProvider ? selectedProvider : undefined}
          onClose={() => setShowProvModal(false)}
          onCreate={createProveedor}
          onUpdate={updateProveedor}
        />
      )}
    </div>
  );
}
