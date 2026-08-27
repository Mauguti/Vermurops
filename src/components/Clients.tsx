import React, { useState, useCallback } from 'react';
import { Search, Phone, Mail, Plane, Ship, Truck, FileText, Database, Loader2 } from 'lucide-react';
import { useClientes } from '../hooks/useClientes';
import { useProveedores } from '../hooks/useProveedores';
import { useCotizaciones } from '../hooks/useCotizaciones';
import { ProveedorVermur, contactoPrincipal } from './proveedores/ProveedoresData';
import FichaCliente from './clientes/FichaCliente';
import NuevoClienteModal from './clientes/NuevoClienteModal';
import ProveedorFormModal from './proveedores/ProveedorFormModal';
import FichaProveedor from './proveedores/FichaProveedor';
import { useAuth } from '../auth/AuthContext';

export default function Clients() {
  // Matriz §4.1: las altas definitivas de clientes y proveedores son solo de
  // Administración. Los demás roles entran a consultar.
  const { puede } = useAuth();
  const puedeAltaCliente = puede('cliente.alta');
  const puedeAltaProveedor = puede('proveedor.alta');
  // Herramienta de mantenimiento, no función de negocio: solo superusuario.
  const puedeImportarCatalogo = puede('catalogo.importarMasivo');

  const {
    clientes, loading, error,
    createCliente, updateCliente,
    analizarImportacionClientes, importarClientesDesdeJSON,
  } = useClientes();
  const [seedingClientes, setSeedingClientes] = useState(false);

  const handleSeedClientes = useCallback(async () => {
    setSeedingClientes(true);
    try {
      // Contar primero: la confirmación tiene que decir cuántos registros VIVOS
      // se pisan, no un aproximado. Es una escritura contra la base en uso.
      const { total, aSobrescribir, nuevos } = await analizarImportacionClientes();

      const ok = window.confirm(
        `IMPORTAR CATÁLOGO DE CLIENTES DESDE MAGAYA\n\n` +
        `Se escribirán ${total} registros:\n` +
        `  • ${aSobrescribir} SOBRESCRIBEN clientes que ya existen\n` +
        `  • ${nuevos} son nuevos\n\n` +
        `Los ${aSobrescribir} que se sobrescriben son registros con los que el ` +
        `equipo está trabajando ahora mismo. Todo cambio hecho sobre ellos desde ` +
        `la última carga se pierde.\n\n` +
        `Esta acción no se puede deshacer. ¿Continuar?`
      );
      if (!ok) return;

      const count = await importarClientesDesdeJSON();
      window.alert(`Importación completa: ${count} clientes escritos.`);
    } catch (err) {
      window.alert(`Error al importar: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSeedingClientes(false);
    }
  }, [analizarImportacionClientes, importarClientesDesdeJSON]);
  const { proveedores, loading: loadingProv, error: errorProv, createProveedor, updateProveedor } = useProveedores();
  const { quotes } = useCotizaciones();
  const [viewType, setViewType] = useState<'Clientes' | 'Proveedores'>('Clientes');

  const [searchTerm, setSearchTerm] = useState('');
  const [showInactivos, setShowInactivos] = useState(false);
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

  const filteredClients = clientes.filter(c => {
    // Filtro por estatus: por default solo activos
    if (!showInactivos && c.statusOperativo !== 'ACTIVO') return false;
    const q = searchTerm.toLowerCase();
    if (!q) return true;
    return c.nombre.toLowerCase().includes(q) ||
      (c.rfc ?? '').toLowerCase().includes(q) ||
      (c.representante ?? '').toLowerCase().includes(q) ||
      (c.idSemantico ?? '').toLowerCase().includes(q) ||
      (c.comercial ?? '').toLowerCase().includes(q);
  });

  const filteredProviders = proveedores.filter(p => {
    const cp = contactoPrincipal(p);
    const q = providerSearchTerm.toLowerCase();
    return p.nombre.toLowerCase().includes(q) ||
      (p.rfc ?? p.numeroEntidadMagaya ?? '').toLowerCase().includes(q) ||
      (cp?.nombre ?? '').toLowerCase().includes(q);
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
      case 'proveedor': return 'Proveedor';
      case 'transportista': return 'Transportista';
      case 'agente_carga': return 'Agente';
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
            <div className="flex items-center gap-3 flex-1">
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
              <label className="flex items-center gap-2 text-[12px] text-text-secondary cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={showInactivos}
                  onChange={e => setShowInactivos(e.target.checked)}
                  className="accent-brand w-3.5 h-3.5"
                />
                Mostrar inactivos
              </label>
              <span className="text-[11px] text-text-muted tabular-nums">{filteredClients.length} de {clientes.length}</span>
            </div>
            <div className="flex items-center space-x-[12px]">
              {/* Importar Magaya sobrescribe el catálogo completo contra la base
                  en uso. Los datos ya están cargados: hoy solo puede hacer daño.
                  Mantenimiento, no negocio → solo superusuario. */}
              {puedeImportarCatalogo && (
                <button
                  onClick={handleSeedClientes}
                  disabled={seedingClientes}
                  title="Sobrescribe el catálogo de clientes con el seed de Magaya"
                  className="flex items-center bg-white border border-danger-text/30 text-danger-text px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-danger-bg shadow-sm transition-colors shrink-0 disabled:opacity-60"
                >
                  {seedingClientes ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Database className="w-4 h-4 mr-2" />}
                  {seedingClientes ? 'Importando…' : 'Importar Magaya'}
                </button>
              )}
              {puedeAltaCliente && (
                <button
                  onClick={() => setShowModal(true)}
                  className="bg-brand text-white px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors shrink-0"
                >
                  Nuevo cliente
                </button>
              )}
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
                  <p className="text-[13px] text-text-muted font-mono">{cliente.rfc || '—'}</p>
                </div>

                <div className="px-[20px] pb-[20px] space-y-[10px] flex-1">
                  <div className="flex items-center text-[13px] text-text-secondary">
                    <Mail className="w-[16px] h-[16px] mr-[10px] text-text-muted" />
                    <span className="truncate">{cliente.correo || '—'}</span>
                  </div>
                  <div className="flex items-center text-[13px] text-text-secondary">
                    <Phone className="w-[16px] h-[16px] mr-[10px] text-text-muted" />
                    {cliente.telefono || '—'}
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
                    <div className="font-medium text-text-primary text-[13px] tabular-nums">{cliente.divisa ?? '—'}</div>
                  </div>
                  <div className="p-[12px] text-center">
                    <div className="text-[11px] text-text-muted font-medium mb-[2px]">Línea</div>
                    <div className="font-medium text-text-primary text-[13px] tabular-nums">
                      {(cliente.monto ?? 0) > 0 ? `${((cliente.monto ?? 0) / 1000).toFixed(0)}k` : '—'}
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
            {puedeAltaProveedor && (
              <div className="flex items-center space-x-[12px]">
                <button
                  onClick={() => setShowProvModal('crear')}
                  className="bg-brand text-white px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors shrink-0"
                >
                  Nuevo proveedor
                </button>
              </div>
            )}
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

                  {/* Tipos / Modalidades Badges */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {(provider.modalidades?.length ? provider.modalidades : provider.tipos ?? []).map(tag => (
                      <span key={tag} className="flex items-center bg-canvas border border-card-border text-text-secondary px-2 py-1 rounded-md text-[10px] font-medium uppercase tracking-wider">
                        {getTransportIcon(tag)}
                        {getTransportLabel(tag)}
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
                      <p className="text-[11px] text-text-muted mt-0.5">{cp.puesto ?? cp.tipo ?? ''}</p>
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
                      {cp.telefono ?? '—'}
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
      {viewType === 'Proveedores' && selectedProvider && (
        <FichaProveedor
          proveedor={selectedProvider}
          quotes={quotes}
          onBack={() => setSelectedProviderId(null)}
          onEdit={() => setShowProvModal('editar')}
        />
      )}

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
