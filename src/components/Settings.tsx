import React, { useState } from 'react';
import { 
  Building2, Users, Database, Link as LinkIcon, FileCheck, 
  Settings2, Plus, Search, Shield, Zap, Mail, MessageSquare, 
  Table2, Terminal, CheckCircle2, AlertCircle, LogOut, Package, Trash2, Hash
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useServicios, renderIcon, CategoriaServicio } from '../config/serviciosStore';
import ContadoresFolio from './settings/ContadoresFolio';
import CatalogoConceptos from './conceptos/CatalogoConceptos';

export default function Settings() {
  const { user, logout } = useAuth();
  const [activeSection, setActiveSection] = useState('users');
  const [activeCatalogTab, setActiveCatalogTab] = useState('carriers');
  const [editNombre, setEditNombre] = useState(user?.nombre ?? '');

  // Servicios
  const { servicios, addServicio, updateServicio, deleteServicio } = useServicios();
  const [showServicioModal, setShowServicioModal] = useState(false);
  const [newSrvNombre, setNewSrvNombre] = useState('');
  const [newSrvCategoria, setNewSrvCategoria] = useState<CategoriaServicio>('transporte');
  const [newSrvIcono, setNewSrvIcono] = useState('Box');
  const [newSrvDesc, setNewSrvDesc] = useState('');

  // Solo 'admin' (superusuario técnico) ve la configuración completa.
  // 'administracion' es un área de la operación, no un superusuario.
  const isRestrictedRole = !!user && user.rol !== 'admin';
  const isAdmin = user?.rol === 'admin';

  const ROLE_BADGE: Record<string, { label: string; bg: string; color: string }> = {
    ventas:         { label: 'Ventas',         bg: '#FFF7ED', color: '#C2410C' },
    pricing:        { label: 'Pricing',        bg: '#EFF6FF', color: '#1D4ED8' },
    operaciones:    { label: 'Operaciones',    bg: '#ECFDF5', color: '#047857' },
    administracion: { label: 'Administración', bg: '#F0FDF4', color: '#15803D' },
    admin:          { label: 'Admin',          bg: '#FEE2E2', color: '#B91C1C' },
  };

  // ── Vista de perfil para roles restringidos ───────────────────────────────
  if (isRestrictedRole && user) {
    const badge = ROLE_BADGE[user.rol];
    return (
      <div className="flex flex-col h-full bg-[#F8FAFC]">
        <div className="mb-[24px]">
          <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">Mi Perfil</h2>
          <p className="text-[13px] text-text-secondary mt-[4px]">Información de tu cuenta en VermurOps.</p>
        </div>

        <div className="bg-white border border-card-border rounded-[12px] shadow-sm max-w-[500px] overflow-hidden">
          {/* Avatar header */}
          <div className="bg-[#18181B] px-[32px] py-[28px] flex items-center gap-[16px]">
            <div
              className="w-[56px] h-[56px] rounded-full flex items-center justify-center text-[18px] font-black text-white shrink-0"
              style={{ background: '#E11D48' }}
            >
              {user.avatar}
            </div>
            <div>
              <p className="text-[16px] font-semibold text-white">{editNombre}</p>
              <span
                className="inline-block mt-[4px] text-[10px] font-bold uppercase tracking-wider px-[8px] py-[2px] rounded-[4px]"
                style={{ background: badge.bg, color: badge.color }}
              >
                {badge.label}
              </span>
            </div>
          </div>

          {/* Fields */}
          <div className="p-[32px] space-y-[20px]">
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-[0.06em] mb-[6px]">
                Nombre
              </label>
              <input
                type="text"
                value={editNombre}
                onChange={(e) => setEditNombre(e.target.value)}
                className="w-full bg-canvas border border-card-border rounded-[8px] px-[12px] py-[10px] text-[14px] text-text-primary focus:outline-none focus:border-brand shadow-sm"
              />
              <p className="text-[11px] text-text-muted mt-[4px]">Solo visual, no persiste al recargar.</p>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-[0.06em] mb-[6px]">
                Correo Electrónico
              </label>
              <input
                type="email"
                value={user.email}
                readOnly
                className="w-full bg-canvas border border-card-border rounded-[8px] px-[12px] py-[10px] text-[14px] text-text-muted cursor-not-allowed shadow-sm"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-[0.06em] mb-[6px]">
                Rol
              </label>
              <span
                className="inline-block text-[12px] font-bold uppercase tracking-wider px-[12px] py-[6px] rounded-[6px]"
                style={{ background: badge.bg, color: badge.color }}
              >
                {badge.label}
              </span>
            </div>
          </div>

          <div className="px-[32px] pb-[28px] border-t border-divider pt-[20px]">
            <button
              onClick={logout}
              className="flex items-center gap-[8px] bg-brand text-white px-[16px] py-[10px] rounded-[8px] text-[13px] font-semibold hover:bg-brand-hover transition-colors shadow-sm"
            >
              <LogOut className="w-[15px] h-[15px]" />
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  const menuItems = [
    { id: 'company', label: 'Mi empresa', icon: <Building2 className="w-[18px] h-[18px]" /> },
    { id: 'users', label: 'Usuarios y roles', icon: <Users className="w-[18px] h-[18px]" /> },
    { id: 'catalogs', label: 'Catálogos base', icon: <Database className="w-[18px] h-[18px]" /> },
    // B3 · Visible para todos: consultar la regla de IVA de un concepto es
    // trabajo diario de Pricing y Operaciones. Editar exige concepto.editar.
    { id: 'conceptos', label: 'Catálogo de conceptos', icon: <Package className="w-[18px] h-[18px]" /> },
    ...(isAdmin ? [{ id: 'services_catalog', label: 'Catálogo de servicios', icon: <Package className="w-[18px] h-[18px]" /> }] : []),
    // Mantenimiento, no función del negocio: solo superusuario, igual que la
    // importación masiva de catálogos.
    ...(isAdmin ? [{ id: 'folios', label: 'Consecutivos de folio', icon: <Hash className="w-[18px] h-[18px]" /> }] : []),
    { id: 'integrations', label: 'Integraciones', icon: <LinkIcon className="w-[18px] h-[18px]" /> },
    { id: 'billing', label: 'Facturación SAT / PAC', icon: <FileCheck className="w-[18px] h-[18px]" /> },
    { id: 'preferences', label: 'Preferencias', icon: <Settings2 className="w-[18px] h-[18px]" /> },
  ];


  const integrations = [
    { id: 'gmail', name: 'Gmail Workspace', desc: 'Sincroniza correos con expedientes de embarques.', icon: <Mail className="w-[24px] h-[24px] text-[#EA4335]" />, status: 'Conectado' },
    { id: 'whatsapp', name: 'WhatsApp Business API', desc: 'Envío de notificaciones automáticas y ETAs a clientes.', icon: <MessageSquare className="w-[24px] h-[24px] text-[#25D366]" />, status: 'Desconectado' },
    { id: 'slack', name: 'Slack', desc: 'Recibe alertas operativas y de aduanas en canales.', icon: <span className="text-[24px] font-black tracking-tighter text-[#E01E5A]">#</span>, status: 'Conectado' },
    { id: 'sheets', name: 'Google Sheets', desc: 'Exportación en tiempo real de data para análisis externo.', icon: <Table2 className="w-[24px] h-[24px] text-[#0F9D58]" />, status: 'Desconectado' },
    { id: 'api', name: 'API REST Vermur', desc: 'Conecta tu ERP (SAP, Oracle) o sistemas a la medida.', icon: <Terminal className="w-[24px] h-[24px] text-text-primary" />, status: 'Conectado' },
  ];

  const catalogs = [
    { id: 'carriers', label: 'Carriers / Navieras' },
    { id: 'agents', label: 'Agentes Aduanales' },
    { id: 'customs', label: 'Aduanas y Puertos' },
    { id: 'incoterms', label: 'Incoterms' },
    { id: 'concepts', label: 'Conceptos de Cobro' },
    { id: 'locations', label: 'Ubicaciones Almacén' },
  ];

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]">
      <div className="mb-[24px]">
        <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">Configuración</h2>
        <p className="text-[13px] text-text-secondary mt-[4px]">Administración del sistema, usuarios e integraciones.</p>
      </div>

      <div className="flex flex-col md:flex-row flex-1 bg-white border border-card-border rounded-[12px] shadow-sm overflow-hidden min-h-[600px]">
        
        {/* Left Navigation */}
        <div className="w-full md:w-[260px] bg-canvas border-r border-card-border p-[16px] shrink-0">
           <nav className="space-y-[4px]">
              {menuItems.map(item => (
                 <button
                   key={item.id}
                   onClick={() => setActiveSection(item.id)}
                   className={`w-full flex items-center px-[12px] py-[10px] rounded-[8px] text-[13px] font-medium transition-colors ${
                     activeSection === item.id 
                       ? 'bg-brand/10 text-brand' 
                       : 'text-text-secondary hover:bg-neutral-bg hover:text-text-primary'
                   }`}
                 >
                   <span className="mr-[12px]">{item.icon}</span>
                   {item.label}
                 </button>
              ))}
           </nav>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 p-[32px] overflow-y-auto">
           {activeSection === 'company' && (
              <div className="max-w-[600px]">
                 <h3 className="text-[18px] font-semibold text-text-primary mb-[24px] pb-[16px] border-b border-divider">Mi Empresa</h3>
                 <div className="space-y-[20px]">
                    <div className="flex items-center space-x-[24px]">
                       <div className="bg-white border border-dashed border-card-border p-2 rounded-[12px] flex items-center justify-center shadow-sm">
                          <img src="https://firebasestorage.googleapis.com/v0/b/digsol-academy.firebasestorage.app/o/LOGOTIPO%20(1).png?alt=media&token=702db209-5869-4471-acb6-ac7740e5453b" alt="Logo de la Empresa" className="h-[48px] object-contain" />
                       </div>
                       <div>
                          <button className="bg-white border border-card-border px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium text-text-primary shadow-sm hover:bg-neutral-bg transition-colors">Subir nuevo logo</button>
                          <p className="text-[11px] text-text-muted mt-[8px]">PNG, JPG hasta 2MB (Para portal y PDFs)</p>
                       </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-[16px]">
                       <div className="col-span-2">
                          <label className="block text-[12px] font-medium text-text-primary mb-[6px]">Razón Social</label>
                          <input type="text" defaultValue="Vermur Logistics S.A. de C.V." className="w-full bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm" />
                       </div>
                       <div>
                          <label className="block text-[12px] font-medium text-text-primary mb-[6px]">RFC / Tax ID</label>
                          <input type="text" defaultValue="VLO210415XYZ" className="w-full bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm" />
                       </div>
                       <div>
                          <label className="block text-[12px] font-medium text-text-primary mb-[6px]">Moneda Base</label>
                          <select className="w-full bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm">
                             <option>USD ($)</option>
                             <option>MXN ($)</option>
                          </select>
                       </div>
                       <div className="col-span-2">
                          <label className="block text-[12px] font-medium text-text-primary mb-[6px]">Dirección Fiscal</label>
                          <textarea rows={2} defaultValue="Av. Paseo de la Reforma 250, Col. Juárez, Cuauhtémoc, 06600 Ciudad de México, CDMX" className="w-full bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm"></textarea>
                       </div>
                    </div>
                 </div>
                 <div className="mt-[32px] pt-[24px] border-t border-divider flex justify-end">
                    <button className="bg-brand text-white px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium shadow-sm hover:bg-brand-hover transition-colors">Guardar cambios</button>
                 </div>
              </div>
           )}

           {activeSection === 'users' && (
              <div>
                 <h3 className="text-[18px] font-semibold text-text-primary mb-[24px]">Usuarios y Roles</h3>
                 <div className="flex flex-col items-center justify-center p-[60px] border border-dashed border-card-border rounded-[8px] bg-white">
                    <Users className="w-[32px] h-[32px] text-text-muted mb-[16px]" />
                    <p className="text-[14px] font-medium text-text-primary mb-[4px]">Módulo en desarrollo</p>
                    <p className="text-[13px] text-text-secondary text-center max-w-[300px]">La gestión de usuarios y roles estará disponible próximamente. Por ahora, los usuarios se administran directamente en Firebase.</p>
                 </div>
              </div>
           )}

           {activeSection === 'conceptos' && (
             <div>
               <h3 className="text-[16px] font-semibold text-text-primary mb-1">Catálogo de conceptos</h3>
               <p className="text-[12px] text-text-secondary mb-5">
                 Los servicios y cargos que Vermur cobra o paga. El IVA de cada
                 uno se deriva de su regla — lo que ves aquí es lo que la
                 facturación aplica.
               </p>
               <CatalogoConceptos />
             </div>
           )}

           {activeSection === 'catalogs' && (
              <div>
                 <h3 className="text-[18px] font-semibold text-text-primary mb-[24px]">Catálogos del Sistema</h3>
                 <div className="flex gap-[24px] h-[400px]">
                    <div className="w-[220px] shrink-0 border border-card-border rounded-[12px] overflow-hidden bg-white">
                       {catalogs.map(cat => (
                          <button 
                            key={cat.id}
                            onClick={() => setActiveCatalogTab(cat.id)}
                            className={`w-full text-left px-[16px] py-[12px] text-[13px] font-medium border-b border-card-border last:border-b-0 transition-colors ${activeCatalogTab === cat.id ? 'bg-canvas text-brand border-l-[3px] border-l-brand' : 'text-text-secondary hover:bg-neutral-bg hover:text-text-primary border-l-[3px] border-l-transparent'}`}
                          >
                             {cat.label}
                          </button>
                       ))}
                    </div>
                    <div className="flex-1 border border-card-border rounded-[12px] bg-white p-[24px] flex flex-col">
                       <div className="flex justify-between items-center mb-[16px]">
                          <div className="relative w-[250px]">
                             <Search className="w-[14px] h-[14px] text-text-muted absolute left-[12px] top-1/2 -translate-y-1/2" />
                             <input type="text" placeholder={`Buscar en ${catalogs.find(c=>c.id===activeCatalogTab)?.label}...`} className="w-full bg-white border border-card-border rounded-[8px] py-[6px] pl-[32px] pr-[12px] text-[12px] focus:outline-none focus:border-brand shadow-sm" />
                          </div>
                          <button className="flex items-center text-brand text-[12px] font-medium hover:underline">
                             <Plus className="w-[14px] h-[14px] mr-[4px]" /> Nuevo registro
                          </button>
                       </div>
                       <div className="flex-1 border border-dashed border-card-border rounded-[8px] bg-canvas flex items-center justify-center text-text-muted text-[13px]">
                          Tabla de gestión para: <strong>{catalogs.find(c=>c.id===activeCatalogTab)?.label}</strong>
                       </div>
                    </div>
                 </div>
               </div>
            )}

            {activeSection === 'services_catalog' && isAdmin && (
               <div>
                  <div className="flex justify-between items-center mb-[24px]">
                     <div>
                        <h3 className="text-[18px] font-semibold text-text-primary">Catálogo de Servicios</h3>
                        <p className="text-[12px] text-text-secondary mt-1">Configura los servicios dinámicos que se muestran en el módulo CRM y Pricing.</p>
                     </div>
                     <button onClick={() => setShowServicioModal(true)} className="flex items-center bg-brand text-white px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium shadow-sm hover:bg-brand-hover transition-colors">
                        <Plus className="w-[16px] h-[16px] mr-[8px]" /> Agregar servicio
                     </button>
                  </div>

                  <div className="border border-card-border rounded-[12px] overflow-hidden bg-white">
                     <table className="w-full text-left border-collapse">
                        <thead>
                           <tr>
                              <th className="bg-canvas border-b border-card-border py-[12px] px-[16px] text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] w-12 text-center">Ícono</th>
                              <th className="bg-canvas border-b border-card-border py-[12px] px-[16px] text-[11px] font-medium text-text-muted uppercase tracking-[0.05em]">Servicio</th>
                              <th className="bg-canvas border-b border-card-border py-[12px] px-[16px] text-[11px] font-medium text-text-muted uppercase tracking-[0.05em]">Categoría</th>
                              <th className="bg-canvas border-b border-card-border py-[12px] px-[16px] text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] text-center">Estatus</th>
                              <th className="bg-canvas border-b border-card-border py-[12px] px-[16px] text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] text-right">Acciones</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-divider">
                           {servicios.map(srv => (
                              <tr key={srv.id} className={`hover:bg-neutral-bg transition-colors ${!srv.activo ? 'opacity-60' : ''}`}>
                                 <td className="py-[12px] px-[16px] text-center text-text-secondary">
                                    <div className="w-8 h-8 rounded-lg bg-canvas border border-card-border flex items-center justify-center mx-auto">
                                       {renderIcon(srv.icono, "w-4 h-4 text-text-secondary")}
                                    </div>
                                 </td>
                                 <td className="py-[12px] px-[16px]">
                                    <p className="text-[13px] font-semibold text-text-primary">{srv.nombre}</p>
                                    {srv.descripcion && <p className="text-[11px] text-text-muted mt-0.5">{srv.descripcion}</p>}
                                 </td>
                                 <td className="py-[12px] px-[16px]">
                                    <span className="inline-block bg-canvas border border-card-border text-text-secondary text-[11px] font-medium px-2 py-0.5 rounded capitalize">
                                       {srv.categoria}
                                    </span>
                                 </td>
                                 <td className="py-[12px] px-[16px] text-center">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                       <input 
                                          type="checkbox" 
                                          className="sr-only peer" 
                                          checked={srv.activo} 
                                          onChange={(e) => updateServicio(srv.id, { activo: e.target.checked })} 
                                       />
                                       <div className="w-[32px] h-[18px] bg-card-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-[14px] after:w-[14px] after:transition-all peer-checked:bg-brand"></div>
                                    </label>
                                 </td>
                                 <td className="py-[12px] px-[16px] text-right">
                                    {!srv.esDefault ? (
                                       <button 
                                          onClick={() => { if(confirm('¿Eliminar este servicio?')) deleteServicio(srv.id) }} 
                                          className="text-text-muted hover:text-danger-text p-1 transition-colors"
                                          title="Eliminar servicio"
                                       >
                                          <Trash2 className="w-4 h-4" />
                                       </button>
                                    ) : (
                                       <span className="text-[10px] text-text-muted uppercase font-semibold">Sistema</span>
                                    )}
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>

                  {/* Modal Agregar Servicio */}
                  {showServicioModal && (
                     <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                           <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                              <h3 className="text-[14px] font-bold text-gray-800">Agregar nuevo servicio</h3>
                              <button onClick={() => setShowServicioModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                           </div>
                           <div className="p-6 space-y-4">
                              <div>
                                 <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nombre del Servicio *</label>
                                 <input type="text" value={newSrvNombre} onChange={e=>setNewSrvNombre(e.target.value)} placeholder="Ej. Empaque especial" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-brand outline-none" />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                 <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Categoría *</label>
                                    <select value={newSrvCategoria} onChange={e=>setNewSrvCategoria(e.target.value as CategoriaServicio)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-brand outline-none bg-white">
                                       <option value="transporte">Transporte</option>
                                       <option value="aduana">Aduana</option>
                                       <option value="carga">Carga</option>
                                       <option value="otros">Otros</option>
                                    </select>
                                 </div>
                                 <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Ícono *</label>
                                    <div className="flex gap-2">
                                       <div className="w-10 h-10 shrink-0 border border-gray-200 rounded-lg flex items-center justify-center bg-gray-50">
                                          {renderIcon(newSrvIcono, "w-5 h-5 text-gray-500")}
                                       </div>
                                       <select value={newSrvIcono} onChange={e=>setNewSrvIcono(e.target.value)} className="w-full px-2 py-2 border border-gray-200 rounded-lg text-xs focus:border-brand outline-none bg-white">
                                          <option value="Box">Caja</option>
                                          <option value="Ship">Barco</option>
                                          <option value="Plane">Avión</option>
                                          <option value="Truck">Camión</option>
                                          <option value="MapPin">Pin</option>
                                          <option value="Shield">Escudo</option>
                                          <option value="FileCheck">Archivo</option>
                                          <option value="Warehouse">Almacén</option>
                                          <option value="Package">Paquete</option>
                                          <option value="MoreHorizontal">Otros</option>
                                       </select>
                                    </div>
                                 </div>
                              </div>
                              <div>
                                 <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Descripción</label>
                                 <input type="text" value={newSrvDesc} onChange={e=>setNewSrvDesc(e.target.value)} placeholder="Opcional..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-brand outline-none" />
                              </div>
                           </div>
                           <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex justify-end gap-2">
                              <button onClick={() => setShowServicioModal(false)} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800">Cancelar</button>
                              <button onClick={() => {
                                 if(!newSrvNombre) return;
                                 addServicio({ nombre: newSrvNombre, categoria: newSrvCategoria, icono: newSrvIcono, descripcion: newSrvDesc, activo: true });
                                 setShowServicioModal(false);
                                 setNewSrvNombre('');
                              }} className="px-4 py-2 bg-brand hover:bg-brand-hover text-white text-sm font-semibold rounded-lg shadow-sm">Guardar Servicio</button>
                           </div>
                        </div>
                     </div>
                  )}
               </div>
            )}

           {activeSection === 'folios' && isAdmin && (
              <ContadoresFolio />
           )}

           {activeSection === 'integrations' && (
              <div>
                 <h3 className="text-[18px] font-semibold text-text-primary mb-[24px]">Integraciones</h3>
                 <p className="text-[13px] text-text-secondary mb-[24px] max-w-[600px]">Conecta tus herramientas favoritas para sincronizar datos, recibir notificaciones y automatizar flujos operativos en Vermur.</p>

                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-[16px]">
                    {integrations.map(integ => (
                       <div key={integ.id} className="bg-white border border-card-border rounded-[12px] p-[20px] shadow-sm flex items-start gap-[16px]">
                          <div className="w-[48px] h-[48px] bg-canvas rounded-[12px] border border-card-border flex items-center justify-center shrink-0">
                             {integ.icon}
                          </div>
                          <div className="flex-1">
                             <div className="flex justify-between items-start mb-[4px]">
                                <h4 className="text-[14px] font-semibold text-text-primary leading-tight">{integ.name}</h4>
                                {integ.status === 'Conectado' ? (
                                   <span className="flex items-center text-[10px] font-bold text-success-text uppercase tracking-wider bg-success-bg/30 px-[6px] py-[2px] rounded-[4px]"><CheckCircle2 className="w-[10px] h-[10px] mr-[4px]" /> Conectado</span>
                                ) : (
                                   <span className="flex items-center text-[10px] font-bold text-text-muted uppercase tracking-wider bg-neutral-bg px-[6px] py-[2px] rounded-[4px]">Desconectado</span>
                                )}
                             </div>
                             <p className="text-[12px] text-text-secondary leading-relaxed mb-[16px] min-h-[36px]">{integ.desc}</p>
                             <div className="flex border-t border-divider pt-[12px]">
                                {integ.status === 'Conectado' ? (
                                   <button className="text-[12px] font-medium text-text-muted hover:text-error-text transition-colors">Desconectar</button>
                                ) : (
                                   <button className="text-[12px] font-medium text-brand hover:text-brand-hover transition-colors">Conectar ahora</button>
                                )}
                             </div>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
           )}

           {activeSection === 'billing' && (
              <div className="max-w-[700px]">
                 <div className="flex items-center justify-between mb-[24px] pb-[16px] border-b border-divider">
                    <h3 className="text-[18px] font-semibold text-text-primary">Facturación Electrónica SAT (MX)</h3>
                    <span className="bg-success-bg/30 text-success-text px-[10px] py-[4px] rounded-full text-[11px] font-bold uppercase tracking-wide flex items-center"><CheckCircle2 className="w-[12px] h-[12px] mr-[4px]" /> Timbrado Activo</span>
                 </div>

                 <div className="space-y-[24px]">
                    <div className="bg-white border border-card-border rounded-[12px] p-[20px] shadow-sm">
                       <h4 className="text-[14px] font-semibold text-text-primary mb-[16px] flex items-center"><Zap className="w-[16px] h-[16px] mr-[8px] text-brand" /> Configuración del PAC</h4>
                       <div className="grid grid-cols-2 gap-[16px]">
                          <div>
                             <label className="block text-[12px] font-medium text-text-primary mb-[6px]">Proveedor Autorizado (PAC)</label>
                             <select className="w-full bg-canvas border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] focus:outline-none shadow-sm">
                                <option>Ateb Servicios</option>
                                <option>Edicom</option>
                                <option>Facturador.com</option>
                             </select>
                          </div>
                          <div>
                             <label className="block text-[12px] font-medium text-text-primary mb-[6px]">Modo de Timbrado</label>
                             <select className="w-full bg-canvas border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] focus:outline-none shadow-sm">
                                <option>Producción</option>
                                <option>Pruebas (Sandbox)</option>
                             </select>
                          </div>
                       </div>
                    </div>

                    <div className="bg-white border border-card-border rounded-[12px] p-[20px] shadow-sm">
                       <h4 className="text-[14px] font-semibold text-text-primary mb-[16px] flex items-center"><FileCheck className="w-[16px] h-[16px] mr-[8px] text-brand" /> Certificado de Sello Digital (CSD)</h4>
                       
                       <div className="bg-info-bg/30 border border-info-bg rounded-[8px] p-[12px] flex items-center justify-between mb-[16px]">
                          <div>
                             <p className="text-[12px] font-bold text-text-primary">CSD Activo (VLO210415XYZ)</p>
                             <p className="text-[11px] text-text-secondary">Válido hasta: 15 Octubre 2026</p>
                          </div>
                          <span className="text-[11px] text-info-text font-medium bg-white px-2 py-1 rounded border border-info-bg opacity-80">943 días restantes</span>
                       </div>

                       <div className="grid grid-cols-2 gap-[16px]">
                          <div className="border border-dashed border-card-border rounded-[8px] p-[12px] text-center hover:bg-canvas transition-colors cursor-pointer">
                             <p className="text-[12px] font-medium text-text-primary mb-[4px]">Actualizar Archivo .CER</p>
                             <p className="text-[10px] text-text-muted">Arrastra tu certificado aquí</p>
                          </div>
                          <div className="border border-dashed border-card-border rounded-[8px] p-[12px] text-center hover:bg-canvas transition-colors cursor-pointer">
                             <p className="text-[12px] font-medium text-text-primary mb-[4px]">Actualizar Archivo .KEY</p>
                             <p className="text-[10px] text-text-muted">Arrastra tu llave privada aquí</p>
                          </div>
                          <div className="col-span-2">
                             <label className="block text-[12px] font-medium text-text-primary mb-[6px]">Contraseña de la Llave Privada</label>
                             <input type="password" placeholder="••••••••••••" className="w-full bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm" />
                          </div>
                       </div>
                    </div>

                    <div className="bg-white border border-card-border rounded-[12px] p-[20px] shadow-sm">
                       <h4 className="text-[14px] font-semibold text-text-primary mb-[16px]">Series y Folios (Carta Porte y Facturas)</h4>
                       <table className="w-full text-left border-collapse text-[12px]">
                          <thead>
                             <tr>
                                <th className="border-b border-divider py-[8px] font-medium text-text-muted uppercase">Tipo CFDI</th>
                                <th className="border-b border-divider py-[8px] font-medium text-text-muted uppercase">Serie</th>
                                <th className="border-b border-divider py-[8px] font-medium text-text-muted uppercase">Siguiente Folio</th>
                             </tr>
                          </thead>
                          <tbody className="font-medium text-text-primary">
                             <tr>
                                <td className="py-[12px] border-b border-divider">Ingreso (Factura)</td>
                                <td className="py-[12px] border-b border-divider"><input type="text" defaultValue="F" className="w-[60px] border border-card-border rounded px-2 py-1 text-center" /></td>
                                <td className="py-[12px] border-b border-divider"><input type="number" defaultValue="2084" className="w-[80px] border border-card-border rounded px-2 py-1" /></td>
                             </tr>
                             <tr>
                                <td className="py-[12px] border-b border-divider">Traslado (Carta Porte)</td>
                                <td className="py-[12px] border-b border-divider"><input type="text" defaultValue="CP" className="w-[60px] border border-card-border rounded px-2 py-1 text-center" /></td>
                                <td className="py-[12px] border-b border-divider"><input type="number" defaultValue="1045" className="w-[80px] border border-card-border rounded px-2 py-1" /></td>
                             </tr>
                             <tr>
                                <td className="py-[12px]">Pago (Complemento)</td>
                                <td className="py-[12px]"><input type="text" defaultValue="P" className="w-[60px] border border-card-border rounded px-2 py-1 text-center" /></td>
                                <td className="py-[12px]"><input type="number" defaultValue="590" className="w-[80px] border border-card-border rounded px-2 py-1" /></td>
                             </tr>
                          </tbody>
                       </table>
                    </div>
                    
                 </div>
                 
                 <div className="mt-[32px] pt-[24px] border-t border-divider flex justify-end">
                    <button className="bg-brand text-white px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium shadow-sm hover:bg-brand-hover transition-colors">Guardar Configuración PAC</button>
                 </div>
              </div>
           )}

           {activeSection === 'preferences' && (
              <div className="max-w-[600px]">
                 <h3 className="text-[18px] font-semibold text-text-primary mb-[24px] pb-[16px] border-b border-divider">Preferencias Locales</h3>
                 <div className="space-y-[24px]">
                    <div>
                       <h4 className="text-[13px] font-medium text-text-primary mb-[12px]">Idioma de la Interfaz</h4>
                       <select className="w-full bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm">
                          <option>Español (México)</option>
                          <option>English (US)</option>
                       </select>
                    </div>
                    <div>
                       <h4 className="text-[13px] font-medium text-text-primary mb-[12px]">Huso Horario Base</h4>
                       <select className="w-full bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm">
                          <option>America/Mexico_City (GMT-6)</option>
                          <option>America/Monterrey (GMT-6)</option>
                          <option>America/Tijuana (GMT-8)</option>
                       </select>
                    </div>
                    <div className="pt-[16px] border-t border-divider">
                       <label className="flex items-center space-x-[12px] cursor-pointer">
                          <div className="relative inline-flex items-center">
                             <input type="checkbox" className="sr-only peer" defaultChecked={false} />
                             <div className="w-[36px] h-[20px] bg-card-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[16px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-[16px] after:w-[16px] after:transition-all peer-checked:bg-brand"></div>
                          </div>
                          <span className="text-[13px] font-medium text-text-primary">Modo Oscuro (Beta)</span>
                       </label>
                    </div>
                 </div>
              </div>
           )}
        </div>
      </div>
    </div>
  );
}
