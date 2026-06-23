import React, { useState } from 'react';
import { initialProviders, Provider } from '../data';
import { Search, Phone, Mail, ChevronRight, Upload, Calendar, ArrowRight, MessageSquare, CheckCircle2, Clock, Plane, Ship, Truck, FileText, Check } from 'lucide-react';
import { useClientes } from '../hooks/useClientes';
import { ClienteVermur } from './clientes/ClientesData';

export default function Clients() {
  const { clientes, loading, error } = useClientes();
  const [viewType, setViewType] = useState<'Clientes' | 'Proveedores'>('Clientes');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClienteVermur | null>(null);
  const [activeTab, setActiveTab] = useState('Cuentas');
  const [detailTab, setDetailTab] = useState('Resumen');

  const [providerSearchTerm, setProviderSearchTerm] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-center">
          <p className="text-[14px] font-medium text-danger-text mb-1">Error al cargar clientes</p>
          <p className="text-[12px] text-text-muted">{error}</p>
        </div>
      </div>
    );
  }

  const filteredClients = clientes.filter(c =>
    c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.rfc.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.representante.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredProviders = initialProviders.filter(p =>
    p.name.toLowerCase().includes(providerSearchTerm.toLowerCase()) ||
    p.rfc.toLowerCase().includes(providerSearchTerm.toLowerCase()) ||
    p.contact.name.toLowerCase().includes(providerSearchTerm.toLowerCase())
  );

  const tabs = ['Cuentas', 'Contactos', 'Leads', 'Oportunidades'];
  const detailTabs = ['Resumen', 'Embarques', 'Cotizaciones', 'Documentos', 'Estado de cuenta'];
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
      {!selectedClient && !selectedProvider && (
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

      {viewType === 'Clientes' && !selectedClient && (
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
              <button className="bg-brand text-white px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors shrink-0">
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
                  onClick={() => setSelectedClient(cliente)}
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
        <div className="space-y-[24px]">
          {/* Breadcrumb / Header Ficha */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-[8px] text-[13px] text-text-secondary">
              <button onClick={() => setSelectedClient(null)} className="hover:text-text-primary transition-colors">Cuentas</button>
              <ChevronRight className="w-4 h-4 text-text-muted" />
              <span className="text-text-primary font-medium">{selectedClient.nombre}</span>
            </div>
            <div className="flex space-x-[12px]">
               <button className="bg-white border border-card-border text-text-primary px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium hover:bg-neutral-bg transition-colors shadow-sm">
                 Editar
               </button>
               <button className="bg-brand text-white px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors">
                 Nueva Operación
               </button>
            </div>
          </div>

          <div className="bg-card rounded-[12px] border border-card-border shadow-sm overflow-hidden flex flex-col md:flex-row">
            {/* Main Content (Left 2/3) */}
            <div className="flex-1 border-r border-divider flex flex-col">
              <div className="p-[32px] border-b border-divider bg-white">
                <div className="flex items-center space-x-[16px] mb-[16px]">
                  <div className="w-[64px] h-[64px] bg-canvas border border-card-border rounded-[12px] flex items-center justify-center text-[24px] font-medium text-text-primary">
                    {selectedClient.nombre.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-[24px] font-semibold text-text-primary tracking-tight leading-none mb-[8px]">{selectedClient.nombre}</h2>
                    <div className="flex items-center text-[13px] space-x-[12px]">
                      <span className="text-text-secondary font-mono">RFC: {selectedClient.rfc}</span>
                      <span className="text-divider">•</span>
                      <span className={`px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium ${
                        selectedClient.statusOperativo === 'ACTIVO'
                          ? 'bg-success-bg text-success-text'
                          : 'bg-neutral-bg text-text-secondary'
                      }`}>
                        {selectedClient.statusOperativo}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-[24px] mt-[24px] pt-[24px] border-t border-divider">
                  <div>
                    <p className="text-[11px] font-medium text-text-muted mb-[4px]">Representante Legal</p>
                    <p className="text-[14px] font-medium text-text-primary">{selectedClient.representante}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-text-muted mb-[4px]">Correo</p>
                    <p className="text-[14px] font-medium text-text-primary">{selectedClient.correo}</p>
                  </div>
                  <div>
                     <p className="text-[11px] font-medium text-text-muted mb-[4px]">Teléfono</p>
                     <p className="text-[14px] font-medium text-text-primary">{selectedClient.telefono}</p>
                  </div>
                </div>
              </div>

              {/* Internal Tabs */}
              <div className="px-[32px] border-b border-divider bg-canvas">
                <nav className="-mb-px flex space-x-[24px]">
                  {detailTabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setDetailTab(tab)}
                      className={`py-[16px] px-[4px] text-[13px] font-medium transition-colors border-b-[2px] ${
                        detailTab === tab
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
                <div className="flex items-center justify-center p-[40px] text-text-muted text-[14px] border border-dashed border-card-border rounded-[8px] bg-canvas">
                   Contenido de {detailTab}
                </div>
              </div>
            </div>

            {/* Sidebar (Right 1/3) */}
            <div className="w-full md:w-[320px] bg-canvas shrink-0 p-[24px]">
              <h3 className="text-[14px] font-semibold text-text-primary mb-[20px]">Actividad Reciente</h3>

              <div className="space-y-[24px]">
                <div className="flex gap-[16px]">
                  <div className="flex flex-col items-center">
                    <div className="w-[32px] h-[32px] bg-white border border-card-border rounded-full flex items-center justify-center text-text-primary shadow-sm z-10">
                      <MessageSquare className="w-[14px] h-[14px]" />
                    </div>
                    <div className="w-px h-full bg-divider mt-[8px]"></div>
                  </div>
                  <div className="pb-[8px]">
                    <p className="text-[13px] text-text-primary font-medium mb-[2px]">Correo enviado</p>
                    <p className="text-[13px] text-text-secondary mb-[4px]">Cotización #QT-1004 enviada a {selectedClient.representante}.</p>
                    <p className="text-[12px] text-text-muted flex items-center">
                      <Clock className="w-[12px] h-[12px] mr-[4px]" />
                      Hace 2 horas
                    </p>
                  </div>
                </div>

                <div className="flex gap-[16px]">
                  <div className="flex flex-col items-center">
                    <div className="w-[32px] h-[32px] bg-white border border-card-border rounded-full flex items-center justify-center text-text-primary shadow-sm z-10">
                      <CheckCircle2 className="w-[14px] h-[14px] text-success-text" />
                    </div>
                    <div className="w-px h-full bg-divider mt-[8px]"></div>
                  </div>
                  <div className="pb-[8px]">
                    <p className="text-[13px] text-text-primary font-medium mb-[2px]">Embarque entregado</p>
                    <p className="text-[13px] text-text-secondary mb-[4px]">El embarque SHP-2023-004 fue entregado en Manzanillo.</p>
                    <p className="text-[12px] text-text-muted flex items-center">
                      <Calendar className="w-[12px] h-[12px] mr-[4px]" />
                      20 Oct, 2023
                    </p>
                  </div>
                </div>

                <div className="flex gap-[16px]">
                  <div className="flex flex-col items-center">
                    <div className="w-[32px] h-[32px] bg-white border border-card-border rounded-full flex items-center justify-center text-text-primary shadow-sm z-10">
                      <ArrowRight className="w-[14px] h-[14px]" />
                    </div>
                  </div>
                  <div className="pb-[8px]">
                    <p className="text-[13px] text-text-primary font-medium mb-[2px]">Oportunidad ganada</p>
                    <p className="text-[13px] text-text-secondary mb-[4px]">Negocio cerrado vía marítima.</p>
                    <p className="text-[12px] text-text-muted flex items-center">
                      <Calendar className="w-[12px] h-[12px] mr-[4px]" />
                      15 Oct, 2023
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
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
              <button className="bg-brand text-white px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors shrink-0">
                Nuevo proveedor
              </button>
            </div>
          </div>

          {/* Grid de proveedores */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[24px]">
            {filteredProviders.map(provider => (
              <div
                key={provider.id}
                onClick={() => setSelectedProvider(provider)}
                className="bg-card rounded-[12px] border border-card-border transition-all overflow-hidden flex flex-col shadow-sm hover:border-brand/30 cursor-pointer group"
              >
                <div className="p-[20px] pb-[16px] border-b border-divider">
                  <div className="flex justify-between items-start mb-[8px]">
                    <h3 className="font-semibold text-text-primary text-[15px] leading-snug pr-[12px]">{provider.name}</h3>
                    <span className={`shrink-0 text-[11px] font-medium tracking-[0.02em] px-[8px] py-[2px] rounded-[4px] ${provider.active ? 'bg-success-bg text-success-text' : 'bg-neutral-bg text-text-secondary'}`}>
                      {provider.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>

                  {/* Modalidades Badges */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {provider.modalities.map(mod => (
                      <span key={mod} className="flex items-center bg-canvas border border-card-border text-text-secondary px-2 py-1 rounded-md text-[10px] font-medium uppercase tracking-wider">
                        {getTransportIcon(mod)}
                        {getTransportLabel(mod)}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="px-[20px] py-[16px] space-y-[10px] flex-1 bg-canvas">
                  <div className="flex items-start text-[13px]">
                    <div className="w-[32px] h-[32px] bg-white border border-card-border rounded-full flex items-center justify-center font-bold text-brand mr-3 shrink-0">
                      {provider.contact.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-text-primary leading-tight">{provider.contact.name}</p>
                      <p className="text-[11px] text-text-muted mt-0.5">{provider.contact.role}</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center text-[12px] text-text-secondary">
                      <Mail className="w-[14px] h-[14px] mr-[10px] text-text-muted" />
                      <span className="truncate">{provider.contact.email}</span>
                    </div>
                    <div className="flex items-center text-[12px] text-text-secondary">
                      <Phone className="w-[14px] h-[14px] mr-[10px] text-text-muted" />
                      {provider.contact.phone}
                    </div>
                  </div>
                </div>

                <div className="border-t border-divider py-[10px] bg-white text-center transition-colors group-hover:bg-brand/5">
                  <span className="text-[12px] font-medium text-text-primary group-hover:text-brand transition-colors">Ver ficha completa</span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* Ficha de Proveedor */}
      {viewType === 'Proveedores' && selectedProvider ? (
        <div className="space-y-[24px]">
          {/* Header Ficha Proveedor */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-[8px] text-[13px] text-text-secondary">
              <button onClick={() => setSelectedProvider(null)} className="hover:text-text-primary transition-colors">Proveedores</button>
              <ChevronRight className="w-4 h-4 text-text-muted" />
              <span className="text-text-primary font-medium">{selectedProvider.name}</span>
            </div>
            <div className="flex space-x-[12px]">
               <button className="bg-white border border-card-border text-text-primary px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium hover:bg-neutral-bg transition-colors shadow-sm">
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
                      {selectedProvider.name.charAt(0)}
                    </div>
                    <div>
                      <h2 className="text-[24px] font-semibold text-text-primary tracking-tight leading-none mb-[8px]">{selectedProvider.name}</h2>
                      <div className="flex items-center text-[13px] space-x-[12px]">
                        <span className="text-text-secondary font-mono">RFC: {selectedProvider.rfc}</span>
                        <span className="text-divider">•</span>
                        <a href={`http://${selectedProvider.website}`} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                          {selectedProvider.website}
                        </a>
                      </div>
                    </div>
                  </div>

                  <span className={`px-[10px] py-[4px] rounded-md text-[12px] font-semibold tracking-wide ${selectedProvider.active ? 'bg-success-bg text-success-text' : 'bg-neutral-bg text-text-secondary'}`}>
                    {selectedProvider.active ? 'PROVEEDOR ACTIVO' : 'INACTIVO'}
                  </span>
                </div>

                <div className="mt-[24px] pt-[24px] border-t border-divider">
                  <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-[12px]">Modalidades Soportadas</h4>
                  <div className="flex flex-wrap gap-4">
                    {['maritimo', 'aereo', 'terrestre', 'aduanal'].map(mod => {
                      const isSupported = selectedProvider.modalities.includes(mod as any);
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

                <div className="flex flex-wrap gap-[24px] mt-[24px] pt-[24px] border-t border-divider">
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-[11px] font-medium text-text-muted mb-[4px]">Contacto Principal</p>
                    <p className="text-[15px] font-semibold text-text-primary">{selectedProvider.contact.name}</p>
                    <p className="text-[13px] text-text-secondary">{selectedProvider.contact.role}</p>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-[11px] font-medium text-text-muted mb-[4px]">Contacto Rápido</p>
                    <div className="space-y-1">
                      <p className="text-[14px] font-medium text-text-primary flex items-center"><Mail className="w-4 h-4 mr-2 text-text-muted"/> {selectedProvider.contact.email}</p>
                      <p className="text-[14px] font-medium text-text-primary flex items-center"><Phone className="w-4 h-4 mr-2 text-text-muted"/> {selectedProvider.contact.phone}</p>
                    </div>
                  </div>
                </div>
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
                <h3 className="text-[15px] font-semibold text-text-primary mb-4">Cotizaciones Enviadas por {selectedProvider.name}</h3>

                {selectedProvider.quotesHistory.length > 0 ? (
                  <div className="border border-card-border rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-canvas border-b border-card-border">
                          <th className="py-3 px-4 text-[11px] font-semibold text-text-muted uppercase tracking-wider">ID Pricing</th>
                          <th className="py-3 px-4 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Fecha</th>
                          <th className="py-3 px-4 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Modalidad</th>
                          <th className="py-3 px-4 text-[11px] font-semibold text-text-muted uppercase tracking-wider text-right">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedProvider.quotesHistory.map(qh => (
                          <tr key={qh.id} className="border-b border-card-border last:border-0 hover:bg-neutral-bg transition-colors">
                            <td className="py-3 px-4 text-[13px] font-medium text-brand">{qh.id}</td>
                            <td className="py-3 px-4 text-[13px] text-text-secondary">{qh.date}</td>
                            <td className="py-3 px-4 text-[13px] text-text-secondary">
                               <span className="flex items-center text-[11px] font-medium uppercase tracking-wider">
                                 {getTransportIcon(qh.modality)} {getTransportLabel(qh.modality)}
                               </span>
                            </td>
                            <td className="py-3 px-4 text-[14px] font-semibold text-text-primary text-right tabular-nums">
                              ${qh.amount.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 border border-dashed border-card-border rounded-lg bg-canvas text-text-muted">
                    <FileText className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-[13px]">No hay historial de cotizaciones registrado para este proveedor.</p>
                  </div>
                )}

                {/* Notas Internas */}
                <div className="mt-8">
                  <h3 className="text-[15px] font-semibold text-text-primary mb-3">Notas Internas (Pricing / Operaciones)</h3>
                  <div className="bg-warning-bg border border-warning-border rounded-lg p-4">
                    <p className="text-[13px] text-warning-text leading-relaxed">{selectedProvider.notes || 'Sin notas.'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar Empty State for Provider */}
            <div className="w-full md:w-[280px] bg-canvas shrink-0 p-[24px]">
              <h3 className="text-[14px] font-semibold text-text-primary mb-[20px]">Resumen Operativo</h3>
              <div className="space-y-4">
                <div className="bg-white border border-card-border p-4 rounded-lg shadow-sm">
                  <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold mb-1">Total Cotizado</p>
                  <p className="text-[20px] font-bold text-text-primary">${selectedProvider.quotesHistory.reduce((acc, val) => acc + val.amount, 0).toLocaleString()}</p>
                </div>
                <div className="bg-white border border-card-border p-4 rounded-lg shadow-sm">
                  <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold mb-1">Cotizaciones Atendidas</p>
                  <p className="text-[20px] font-bold text-text-primary">{selectedProvider.quotesHistory.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
