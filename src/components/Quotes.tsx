import React, { useState } from 'react';
import { initialQuotes, initialClients, initialProspectos, Prospecto } from '../data';
import { Plane, Ship, Truck, Check, X, Clock, MoreVertical, Plus, Trash2, Search, Filter, ShieldCheck, Settings, Download, Upload, List, LayoutGrid, MessageSquare } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import KanbanCotizaciones from './quotes/KanbanCotizaciones';
import BandejaPricing from './quotes/BandejaPricing';
import KanbanProspeccion from './quotes/KanbanProspeccion';
import FichaCotizacion from './quotes/FichaCotizacion';
import RightChatPanel from './quotes/RightChatPanel';
import {
  KanbanQuote, TipoServicio,
  ORIGENES_PROSPECTO, VENDEDORES, INCOTERMS, calcularTotalConsolidado,
  PipelineStageId,
} from './quotes/QuotesData';
import { useServicios, renderIcon } from '../config/serviciosStore';
import { useNotifications } from '../notifications/NotificationsContext';
import { useCotizaciones } from '../hooks/useCotizaciones';
import { generateFolio } from '../lib/folioService';

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal del módulo de Cotizaciones
// Soporta tres vistas: Tablero CRM (Kanban), Bandeja Pricing, y Lista simple
// ─────────────────────────────────────────────────────────────────────────────

export default function Quotes() {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [showProspectForm, setShowProspectForm] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const { serviciosActivos } = useServicios();
  const { agregarNotificacion, notificaciones } = useNotifications();
  const [chatOpen, setChatOpen] = useState(false);
  const chatUnreadCount = notificaciones.filter(n => n.tipo === 'chat' && !n.leida).length;

  // Rol activo derivado del usuario autenticado
  const rolActivo: 'ventas' | 'pricing' | 'admin' = user?.rol === 'admin' ? 'admin' : (user?.rol === 'pricing' ? 'pricing' : 'ventas');
  const isAdmin = rolActivo === 'admin';

  let defaultView: 'kanban' | 'pricing' | 'lista' | 'prospeccion' = 'kanban';
  if (rolActivo === 'ventas') defaultView = 'prospeccion';
  else if (rolActivo === 'pricing') defaultView = 'kanban';
  else if (isAdmin) defaultView = 'prospeccion';

  const [viewMode, setViewMode] = useState<'kanban' | 'pricing' | 'lista' | 'prospeccion'>(defaultView);
  const ALL_QUOTES_COLUMNS = [
    { id: 'id', label: 'Cotización' },
    { id: 'client', label: 'Cliente' },
    { id: 'details', label: 'Detalles' },
    { id: 'date', label: 'Fecha' },
    { id: 'validity', label: 'Validez' },
    { id: 'value', label: 'Valor' },
    { id: 'status', label: 'Estatus' },
    { id: 'actions', label: '' }
  ];
  const [visibleQuoteCols, setVisibleQuoteCols] = useState<string[]>(ALL_QUOTES_COLUMNS.map(c => c.id));
  const [showQuoteColConfig, setShowQuoteColConfig] = useState(false);
  const [showQuoteImportModal, setShowQuoteImportModal] = useState(false);

  // Sub-vista dentro de Prospectos/Negociación: 'tabla' o 'kanban'
  const [subView, setSubView] = useState<'tabla' | 'kanban'>('tabla');

  // Cotización seleccionada para abrir la ficha de detalle
  const [selectedQuote, setSelectedQuote] = useState<KanbanQuote | null>(null);

  const toggleQuoteColumn = (id: string) => {
    setVisibleQuoteCols(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const handleExportCSVQuotes = () => {
    const headers = ['Cotización', 'Cliente', 'Detalles', 'Fecha', 'Valor', 'Estatus'];
    const rows = initialQuotes.map(q => {
      const clientName = initialClients.find(c => c.id === q.clientId)?.name || q.clientId;
      return [q.id, clientName, `${q.origin} -> ${q.destination}`, q.date, q.total, q.status];
    });
    const csvContent = [headers.join(','), ...rows.map(r => r.map(f => `"${String(f).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'cotizaciones_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadTemplateQuotes = () => {
    const headers = 'Cotización,Cliente,Detalles,Fecha,Valor,Estatus\nQT-1001,Empresa S.A.,Manzanillo -> Ningbo,2026-06-15,1500,Pendiente';
    const blob = new Blob([headers], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'plantilla_cotizaciones.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };



  // Estado central de cotizaciones — Firestore (E3.3 lectura, E3.4 writes)
  const { quotes: kanbanQuotes, loading: quotesLoading, error: quotesError, createCotizacion, updateCotizacion } = useCotizaciones();

  // Recibe el array completo que devuelven los componentes hijos y persiste
  // solo el documento que cambió (o el nuevo que se añadió).
  const handleUpdateQuotes = async (newQuotes: KanbanQuote[]) => {
    const existingIds = new Set(kanbanQuotes.map(q => q.id));
    // Detectar cotización nueva: su id no existe en Firestore todavía
    const added = newQuotes.find(q => !existingIds.has(q.id));
    if (added) { await createCotizacion(added); return; }
    // Detectar cotización actualizada: referencia distinta al original
    const changed = newQuotes.find(newQ => {
      const existing = kanbanQuotes.find(q => q.id === newQ.id);
      return existing !== undefined && existing !== newQ;
    });
    if (changed) await updateCotizacion(changed.id, changed);
  };
  
  const filteredInitialProspectos = initialProspectos.filter(p => {
    if (rolActivo === 'ventas') {
      return p.responsable === user?.nombre || p.responsable === user?.uid;
    }
    return true; // admin y pricing ven todo
  });
  const [prospectos, setProspectos] = useState<Prospecto[]>(filteredInitialProspectos);

  // Filtro de visibilidad por rol (Ventas solo ve lo suyo)
  const permittedQuotes = kanbanQuotes.filter(q => {
    if (rolActivo === 'ventas') {
      return q.vendedorId === user?.uid || q.vendedorId === user?.nombre;
    }
    return true; // Admin y Pricing ven todo (Bandeja Pricing tiene su propio filtro de etapas)
  });

  // ─── Formulario de creación de cotizaciones ────────────────────────
  const [formEmpresa, setFormEmpresa] = useState('');
  const [formContacto, setFormContacto] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formOrigen, setFormOrigen] = useState<KanbanQuote['prospecto']['origen']>('web');
  const [formVendedor, setFormVendedor] = useState(VENDEDORES[0].nombre);
  const [formServicios, setFormServicios] = useState<string[]>(['maritimo']);
  const [formOrigenRuta, setFormOrigenRuta] = useState('');
  const [formDestinoRuta, setFormDestinoRuta] = useState('');
  const [formIncoterm, setFormIncoterm] = useState('FOB');
  const [formMercancia, setFormMercancia] = useState('');
  const [formPeso, setFormPeso] = useState(0);
  const [formVolumen, setFormVolumen] = useState(0);

  // Formulario Nuevo Prospecto
  const [formProspectoEmpresa, setFormProspectoEmpresa] = useState('');
  const [formProspectoContacto, setFormProspectoContacto] = useState('');
  const [formProspectoTel, setFormProspectoTel] = useState('');
  const [formProspectoEmail, setFormProspectoEmail] = useState('');

  const handleCreateProspecto = () => {
    if (!formProspectoEmpresa.trim()) {
      alert('Por favor introduce la empresa.');
      return;
    }
    const nextNumber = kanbanQuotes.length + prospectos.length + 1;
    const newId = `PR-${String(nextNumber).padStart(4, '0')}`;
    const nuevo: Prospecto = {
      id: newId,
      etapa: 'nuevo_lead',
      empresa: formProspectoEmpresa,
      contactoNombre: formProspectoContacto || 'Por definir',
      contactoTel: formProspectoTel || '—',
      contactoEmail: formProspectoEmail || '—',
      origenLead: 'web',
      servicioPotencial: ['maritimo'],
      responsable: user?.nombre || 'Vendedor',
      fechaRegistro: new Date().toISOString().split('T')[0],
      ultimoContacto: new Date().toISOString().split('T')[0],
      probabilidadCierre: 10,
    };
    setProspectos([nuevo, ...prospectos]);
    setShowProspectForm(false);
    setFormProspectoEmpresa('');
    setFormProspectoContacto('');
    setFormProspectoTel('');
    setFormProspectoEmail('');
    agregarNotificacion({ id: `notif-${Date.now()}`, tipo: 'cambio_etapa', titulo: 'Nuevo Prospecto', mensaje: `Se ha registrado el prospecto ${nuevo.empresa}`, cotizacionId: nuevo.id, etapaAnterior: 'nuevo_lead', etapaNueva: 'nuevo_lead', destinatarios: ['ventas', 'admin'], leida: false, fecha: new Date().toISOString() });
  };

  const toggleServicioForm = (id: string) => {
    setFormServicios(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const handleCreateQuote = async (stage: 'solicitud_cliente' | 'solicitado_pricing') => {
    if (!formEmpresa.trim() || formServicios.length === 0) {
      alert('Por favor introduce la empresa y selecciona al menos un servicio requerido.');
      return;
    }

    const folio = await generateFolio();
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');

    const newQuote: KanbanQuote = {
      id: folio,
      etapa: stage,
      prospecto: {
        empresa: formEmpresa,
        contacto: formContacto || 'Por definir',
        telefono: formTelefono || '—',
        email: formEmail || '—',
        origen: formOrigen,
      },
      vendedorId: formVendedor,
      pricingId: null,
      servicios: formServicios.map(id => ({
        id: `srv-${folio}-${id}`,
        tipo: id as TipoServicio,
        ruta: { origen: formOrigenRuta || 'Por definir', destino: formDestinoRuta || 'Por definir' },
        incoterm: formIncoterm,
        mercancia: formMercancia || 'Por definir',
        peso: Number(formPeso) || 0,
        volumen: Number(formVolumen) || 0,
        estado: 'pendiente',
        recargosPct: 0,
        profit: 0,
        cotizacionesProveedor: [],
        conceptos: [],
      })),
      valorTotalConsolidado: 0,
      moneda: 'USD',
      estadoFinal: null,
      motivoPerdida: null,
      createdAt: fechaActual,
      updatedAt: fechaActual,
      historialEtapas: [{ etapa: stage, fecha: fechaActual }],
      actividades: [],
      chat: [],
    };

    await createCotizacion(newQuote);
    setShowForm(false);

    // Reset
    setFormEmpresa('');
    setFormContacto('');
    setFormTelefono('');
    setFormEmail('');
    setFormOrigen('web');
    setFormServicios(['maritimo']);
    setFormOrigenRuta('');
    setFormDestinoRuta('');
    setFormIncoterm('FOB');
    setFormMercancia('');
    setFormPeso(0);
    setFormVolumen(0);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Enviada':   return <span className="flex items-center px-[10px] py-[4px] bg-info-bg text-info-text rounded-[6px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap"><Clock className="w-3 h-3 mr-1" /> Enviada</span>;
      case 'Aceptada':  return <span className="flex items-center px-[10px] py-[4px] bg-success-bg text-success-text rounded-[6px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap"><Check className="w-3 h-3 mr-1" /> Aceptada</span>;
      case 'Rechazada': return <span className="flex items-center px-[10px] py-[4px] bg-neutral-bg text-neutral-text rounded-[6px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap"><X className="w-3 h-3 mr-1" /> Rechazada</span>;
      case 'Vencida':   return <span className="flex items-center px-[10px] py-[4px] bg-danger-bg text-danger-text rounded-[6px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap"><Clock className="w-3 h-3 mr-1" /> Vencida</span>;
      default:          return null;
    }
  };

  const getTransportIcon = (type: string) => {
    switch (type) {
      case 'Aéreo':      return <Plane className="w-4 h-4 mr-2 text-text-muted" />;
      case 'Marítimo':   return <Ship className="w-4 h-4 mr-2 text-text-muted" />;
      case 'Terrestre':  return <Truck className="w-4 h-4 mr-2 text-text-muted" />;
      default:           return null;
    }
  };

  const toggleMenu = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenu(activeMenu === id ? null : id);
  };

  // Conteo de cotizaciones en etapas de Pricing para el badge
  const pricingCount = kanbanQuotes.filter(q =>
    ['solicitado_pricing', 'pricing_solicitando', 'cotizaciones_recibidas', 'consolidada'].includes(q.etapa)
  ).length;

  // ─────────────────────────────────────────────────────────────────────────  };

  const handleSelectQuoteForChat = (quote: KanbanQuote) => {
    setSelectedQuote(quote);
    setTimeout(() => {
      // Small hack to switch the active tab to 'chat' inside FichaCotizacion
      // By default it might open on 'info' or 'servicios', but we want 'chat'
      // FichaCotizacion will need a prop or we can just let the user click it for now
      // Or we can add an event/state. Let's just open the quote.
    }, 100);
  };

  // ── Loading / error de Firestore ─────────────────────────────────────────
  if (quotesLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-[#E11D48] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (quotesError) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-red-500">
        Error al cargar cotizaciones: {quotesError}
      </div>
    );
  }

  return (
    <div className={`space-y-[32px] animate-fade-in pb-12 ${chatOpen ? 'xl:pr-[320px]' : ''}`} onClick={() => setActiveMenu(null)}>
      {/* ── Header principal ──────────────────────────────────────────── */}
      {!showForm && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-end border-b border-[#E4E4E7] pb-0">
            <div className="flex flex-col gap-4 w-full">
              {/* Fila superior: Título y Acciones */}
              <div className="flex justify-between items-center w-full">
                <h2 className="text-[24px] font-bold text-[#18181B] tracking-tight">
                  Cotizaciones
                </h2>
                
                <div className="flex items-center gap-3">
                  {(viewMode === 'prospeccion' || viewMode === 'kanban') && (
                    <>
                      {/* Toggle sub-vista: Lista / Kanban */}
                      <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                        <button
                          onClick={() => setSubView('tabla')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${
                            subView === 'tabla'
                              ? 'bg-white text-[#18181B] shadow-sm'
                              : 'text-gray-400 hover:text-gray-600'
                          }`}
                        >
                          <List className="w-3.5 h-3.5" /> Lista
                        </button>
                        <button
                          onClick={() => setSubView('kanban')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${
                            subView === 'kanban'
                              ? 'bg-white text-[#18181B] shadow-sm'
                              : 'text-gray-400 hover:text-gray-600'
                          }`}
                        >
                          <LayoutGrid className="w-3.5 h-3.5" /> Kanban
                        </button>
                      </div>

                      {subView === 'tabla' && (
                        <>
                          <div className="relative w-[250px]">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input type="text" placeholder="Filtrar cotizaciones..." className="w-full pl-[36px] bg-white border border-gray-200 rounded-lg p-2 text-[13px] focus:outline-none focus:border-[#E11D48] focus:ring-1 focus:ring-[#E11D48] text-gray-700 shadow-sm" />
                          </div>
                          <button className="flex items-center text-[13px] font-bold text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors shadow-sm">
                            <Filter className="w-4 h-4 mr-2" /> Filtros
                          </button>
                        </>
                      )}

                      {rolActivo !== 'pricing' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowProspectForm(true)}
                            className="bg-white border border-[#E11D48] text-[#E11D48] px-4 py-2 rounded-lg text-[13px] font-bold hover:bg-[#E11D48]/5 transition-colors shadow-sm flex items-center gap-2"
                          >
                            <Plus className="w-4 h-4" /> Nuevo prospecto
                          </button>
                          <button
                            onClick={() => setShowForm(true)}
                            className="bg-[#E11D48] text-white px-4 py-2 rounded-lg text-[13px] font-bold hover:bg-[#BE123C] transition-colors shadow-sm flex items-center gap-2"
                          >
                            <Plus className="w-4 h-4" /> Nueva cotización
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {viewMode === 'pricing' && rolActivo !== 'pricing' && (
                    <button
                      onClick={() => setShowForm(true)}
                      className="bg-[#E11D48] text-white px-4 py-2 rounded-lg text-[13px] font-bold hover:bg-[#BE123C] transition-colors shadow-sm flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Nueva cotización
                    </button>
                  )}

                  {/* Toggle panel de chat */}
                  <button
                    onClick={() => setChatOpen(o => !o)}
                    title={chatOpen ? 'Cerrar conversaciones' : 'Abrir conversaciones'}
                    className={`relative p-2 rounded-lg border transition-all shadow-sm ${
                      chatOpen
                        ? 'bg-[#E11D48]/10 border-[#E11D48]/30 text-[#E11D48]'
                        : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    {chatUnreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-[#E11D48] text-white text-[9px] font-bold min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center leading-none">
                        {chatUnreadCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Fila inferior: Tabs */}
              <div className="flex gap-6 -mb-[1px]">
                {/* Ventas y Admin ven Prospección — Pricing NO */}
                {rolActivo !== 'pricing' && (
                  <ViewButton
                    active={viewMode === 'prospeccion'}
                    onClick={() => setViewMode('prospeccion')}
                    label="Prospectos"
                  />
                )}
                {/* Todos ven Negociación */}
                <ViewButton
                  active={viewMode === 'kanban'}
                  onClick={() => setViewMode('kanban')}
                  label="Cotizaciones"
                />
                {/* Pricing y Admin ven Bandeja Pricing */}
                {(rolActivo === 'pricing' || isAdmin) && (
                  <ViewButton
                    active={viewMode === 'pricing'}
                    onClick={() => setViewMode('pricing')}
                    label="Bandeja Pricing"
                    badge={pricingCount > 0 ? pricingCount : undefined}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Vistas ───────────────────────────────────────────────────── */}

      {showProspectForm ? (
        /* ─── Formulario de creación de prospecto ─── */
        <div className="bg-white rounded-2xl border border-gray-150 shadow-sm flex flex-col overflow-hidden max-w-3xl mx-auto mt-6">
          <div className="px-8 py-5 bg-gray-50/50 border-b border-gray-150 flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-[#18181B] uppercase tracking-wider">Crear nuevo prospecto</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mt-0.5">Prospección — Registro de Lead</p>
            </div>
            <button onClick={() => setShowProspectForm(false)} className="text-xs font-bold text-gray-400 hover:text-gray-600 uppercase tracking-wide">Cancelar</button>
          </div>

          <div className="p-8 space-y-6">
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-[#E11D48] uppercase tracking-widest border-b border-gray-100 pb-1.5">
                Datos del Prospecto
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Razón Social (Empresa) *</label>
                  <input
                    type="text" required
                    placeholder="Ej. Alfa Corporativo S.A."
                    value={formProspectoEmpresa}
                    onChange={e => setFormProspectoEmpresa(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48]"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Contacto Principal</label>
                  <input
                    type="text"
                    placeholder="Ej. Roberto Jiménez"
                    value={formProspectoContacto}
                    onChange={e => setFormProspectoContacto(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48]"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Teléfono</label>
                  <input
                    type="text"
                    placeholder="Ej. 555-123-4567"
                    value={formProspectoTel}
                    onChange={e => setFormProspectoTel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48]"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Email</label>
                  <input
                    type="email"
                    placeholder="Ej. roberto@alfa.com"
                    value={formProspectoEmail}
                    onChange={e => setFormProspectoEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48]"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="px-8 py-5 bg-gray-50/50 border-t border-gray-150 flex justify-end items-center gap-3">
            <button
              type="button"
              onClick={() => setShowProspectForm(false)}
              className="text-xs font-bold text-gray-500 hover:text-gray-700 uppercase tracking-wider px-4 py-2.5"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCreateProspecto}
              className="bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg shadow-xs transition-colors"
            >
              Guardar Prospecto
            </button>
          </div>
        </div>
      ) : showForm ? (
        /* ─── Formulario de creación completa de cotizaciones ─── */
        <div className="bg-white rounded-2xl border border-gray-150 shadow-sm flex flex-col overflow-hidden">
          <div className="px-8 py-5 bg-gray-50/50 border-b border-gray-150 flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-[#18181B] uppercase tracking-wider">Crear nueva cotización consolidada</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mt-0.5">Cotizaciones — Registro inicial de RFQ</p>
            </div>
            <button onClick={() => setShowForm(false)} className="text-xs font-bold text-gray-400 hover:text-gray-600 uppercase tracking-wide">Cancelar</button>
          </div>

          <div className="p-8 space-y-6">
            
            {/* Sección 1: Prospecto */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-[#E11D48] uppercase tracking-widest border-b border-gray-100 pb-1.5">
                Datos del Prospecto / Cliente
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Razón Social (Empresa) *</label>
                  <input
                    type="text" required
                    placeholder="Ej. Alfa Corporativo S.A."
                    value={formEmpresa}
                    onChange={e => setFormEmpresa(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48]"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Contacto Principal</label>
                  <input
                    type="text"
                    placeholder="Ej. Roberto Jiménez"
                    value={formContacto}
                    onChange={e => setFormContacto(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48]"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Origen del lead</label>
                  <select
                    value={formOrigen}
                    onChange={e => setFormOrigen(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 outline-none focus:border-[#E11D48] bg-white cursor-pointer"
                  >
                    {Object.entries(ORIGENES_PROSPECTO).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Teléfono</label>
                  <input
                    type="text"
                    placeholder="55 4321 0987"
                    value={formTelefono}
                    onChange={e => setFormTelefono(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48]"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Email</label>
                  <input
                    type="email"
                    placeholder="rjimenez@alfacorp.mx"
                    value={formEmail}
                    onChange={e => setFormEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48]"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Vendedor Asignado</label>
                  <select
                    value={formVendedor}
                    onChange={e => setFormVendedor(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48] bg-white cursor-pointer"
                  >
                    {VENDEDORES.map(v => (
                      <option key={v.id} value={v.nombre}>{v.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Sección 2: Servicios Requeridos */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-[#E11D48] uppercase tracking-widest border-b border-gray-100 pb-1.5">
                Servicios a Cotizar (Consolidación Multimodal) *
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {serviciosActivos.map((srv) => {
                  const selected = formServicios.includes(srv.id);
                  return (
                    <button
                      key={srv.id}
                      type="button"
                      onClick={() => toggleServicioForm(srv.id)}
                      className={`flex flex-col items-center justify-center gap-2.5 p-3 rounded-xl border text-xs font-bold transition-all shadow-2xs
                        ${selected
                          ? `ring-2 ring-offset-2 font-black border-brand bg-brand/5`
                          : 'border-gray-200 text-gray-400 bg-gray-50 hover:border-gray-300'}`}
                    >
                      <div className={`mb-2 ${selected ? 'text-brand' : 'text-text-muted'}`}>
                        {renderIcon(srv.icono, "w-6 h-6")}
                      </div>
                      <span className={`text-[11px] font-bold uppercase tracking-wide text-center leading-tight ${selected ? 'text-brand' : 'text-text-secondary'}`}>
                        {srv.nombre}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sección 3: Detalles de la Carga */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-[#E11D48] uppercase tracking-widest border-b border-gray-100 pb-1.5">
                Detalles del Flete y Mercancía (Común para todos los servicios)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Puerto / Ciudad de Origen</label>
                  <input
                    type="text"
                    placeholder="Ej. Shanghai, CHN"
                    value={formOrigenRuta}
                    onChange={e => setFormOrigenRuta(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48]"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Puerto / Ciudad de Destino</label>
                  <input
                    type="text"
                    placeholder="Ej. Manzanillo, MEX"
                    value={formDestinoRuta}
                    onChange={e => setFormDestinoRuta(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48]"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Incoterm</label>
                  <select
                    value={formIncoterm}
                    onChange={e => setFormIncoterm(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48] bg-white cursor-pointer"
                  >
                    {INCOTERMS.map(inc => (
                      <option key={inc} value={inc}>{inc}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Descripción de la Mercancía</label>
                  <input
                    type="text"
                    placeholder="Ej. Componentes electrónicos en pallets..."
                    value={formMercancia}
                    onChange={e => setFormMercancia(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Peso (kg)</label>
                    <input
                      type="number"
                      placeholder="4500"
                      value={formPeso || ''}
                      onChange={e => setFormPeso(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48]"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Volumen (m³)</label>
                    <input
                      type="number"
                      placeholder="12"
                      value={formVolumen || ''}
                      onChange={e => setFormVolumen(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48]"
                    />
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div className="px-8 py-5 bg-gray-50/50 border-t border-gray-150 flex justify-end items-center gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs font-bold text-gray-500 hover:text-gray-700 uppercase tracking-wider px-4 py-2.5"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => handleCreateQuote('solicitud_cliente')}
              className="border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg shadow-2xs transition-colors"
            >
              Guardar borrador
            </button>
            <button
              type="button"
              onClick={() => handleCreateQuote('solicitado_pricing')}
              className="bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg shadow-xs transition-colors"
            >
              Enviar a Pricing
            </button>
          </div>
        </div>

      ) : viewMode === 'pricing' ? (
        /* ─── Vista Bandeja Pricing ─── */
        <BandejaPricing
          quotes={permittedQuotes}
          onUpdateQuotes={handleUpdateQuotes}
          onConvertToShipment={q => {
            alert(`"${q.prospecto.empresa}" convertida a embarque.`);
          }}
        />

      ) : (viewMode === 'prospeccion' || viewMode === 'kanban') ? (
        /* ─── Vista Prospectos / Negociación (con sub-vista tabla/kanban) ─── */
        selectedQuote ? (
          <FichaCotizacion
            quote={selectedQuote}
            onBack={() => setSelectedQuote(null)}
            onUpdateQuote={(updated) => {
              updateCotizacion(updated.id, updated);
              setSelectedQuote(updated);
            }}
            onConvertToShipment={q => { alert(`¡Felicidades! "${q.prospecto.empresa}" marcada como GANADA.`); }}
            rolActivo={rolActivo}
          />
        ) : (
        <>
          {subView === 'kanban' ? (
            /* ── Sub-vista Kanban ── */
            viewMode === 'prospeccion' ? (
              <KanbanProspeccion
                onConvert={async (p) => {
                  const folio = await generateFolio();
                  const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');
                  const newQuote: KanbanQuote = {
                    id: folio, etapa: 'solicitud_cliente',
                    prospecto: { empresa: p.empresa, contacto: p.contactoNombre || 'Por definir', telefono: p.contactoTel || '—', email: p.contactoEmail || '—', origen: p.origenLead as any },
                    vendedorId: p.responsable || user?.nombre || '', pricingId: null,
                    servicios: p.servicioPotencial.map((tipo) => ({ id: `srv-${folio}-${tipo}`, tipo, ruta: { origen: 'Por definir', destino: 'Por definir' }, incoterm: 'FOB', mercancia: 'Por definir', peso: 0, volumen: 0, estado: 'pendiente' as const, cotizacionesProveedor: [], profit: 0, recargosPct: 0, conceptos: [] })),
                    valorTotalConsolidado: 0, moneda: 'USD', estadoFinal: null, motivoPerdida: null,
                    createdAt: fechaActual, updatedAt: fechaActual,
                    historialEtapas: [{ etapa: 'solicitud_cliente', fecha: fechaActual }], actividades: [], chat: [],
                  };
                  await createCotizacion(newQuote);
                  agregarNotificacion({ id: `notif-${Date.now()}`, tipo: 'cambio_etapa', titulo: 'Prospecto convertido', mensaje: `${p.empresa} fue convertido a cotización ${folio}`, cotizacionId: folio, etapaAnterior: 'nuevo_lead', etapaNueva: 'solicitud_cliente', destinatarios: ['ventas', 'admin'], leida: false, fecha: new Date().toISOString() });
                  setTimeout(() => { if (window.confirm(`Cotización ${folio} creada desde prospecto ${p.folio}\n\n¿Ir a Cotizaciones?`)) { setViewMode('kanban'); } }, 100);
                }}
                prospectos={prospectos}
                setProspectos={setProspectos}
                quotes={permittedQuotes}
              />
            ) : (
              <KanbanCotizaciones
                quotes={permittedQuotes}
                onUpdateQuotes={handleUpdateQuotes}
                rolActivo={rolActivo}
                onConvertToShipment={q => { alert(`¡Felicidades! "${q.prospecto.empresa}" marcada como GANADA.`); }}
              />
            )
          ) : (
            /* ── Sub-vista Tabla ── */
            <>
              <div className="flex justify-end mb-[24px]">
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <button onClick={() => setShowQuoteColConfig(!showQuoteColConfig)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200">
                        <Settings className="w-4 h-4" />
                      </button>
                      {showQuoteColConfig && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 shadow-lg rounded-xl p-3 z-10">
                          <h4 className="text-[11px] font-bold text-gray-400 uppercase mb-2">Columnas Visibles</h4>
                          <div className="space-y-2">
                            {ALL_QUOTES_COLUMNS.map(col => (
                              <label key={col.id} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                                <input type="checkbox" checked={visibleQuoteCols.includes(col.id)} onChange={() => toggleQuoteColumn(col.id)} className="rounded text-[#E11D48] focus:ring-[#E11D48]" />
                                {col.label || 'Acciones'}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <button onClick={() => setShowQuoteImportModal(true)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200">
                      <Upload className="w-4 h-4" />
                    </button>
                    <button onClick={handleExportCSVQuotes} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200">
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-card rounded-[12px] border border-card-border shadow-sm overflow-visible">
                <div className="overflow-visible min-h-[300px]">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {ALL_QUOTES_COLUMNS.map(col => visibleQuoteCols.includes(col.id) && (
                          <th key={col.id} className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider">{col.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-divider">
                      {permittedQuotes.filter(q => {
                        if (viewMode === 'prospeccion') {
                          return ['solicitud_cliente', 'solicitado_pricing'].includes(q.etapa);
                        }
                        if (viewMode === 'kanban') {
                          return ['enviada_cliente', 'negociacion', 'ganada', 'perdida', 'pricing_solicitando', 'cotizaciones_recibidas', 'consolidada'].includes(q.etapa);
                        }
                        return true;
                      }).map(quote => {
                        const clientName = quote.prospecto.empresa || 'Desconocido';
                        const srv = quote.servicios[0];
                        const origin = srv?.ruta?.origen || 'N/A';
                        const destination = srv?.ruta?.destino || 'N/A';
                        const transportType = srv?.tipo?.charAt(0).toUpperCase() + srv?.tipo?.slice(1) || 'Aéreo';
                        const validez = '—';

                        return (
                          <tr
                            key={quote.id}
                            onClick={() => setSelectedQuote(quote)}
                            className="hover:bg-neutral-bg transition-colors relative group cursor-pointer"
                          >
                            {visibleQuoteCols.includes('id') && <td className="px-[24px] py-[16px] text-[13px] text-text-primary font-medium">{quote.id}</td>}
                            {visibleQuoteCols.includes('client') && <td className="px-[24px] py-[16px] text-[13px] text-text-primary">{clientName}</td>}
                            {visibleQuoteCols.includes('details') && (
                              <td className="px-[24px] py-[16px] text-[13px] text-text-secondary whitespace-nowrap">
                                <div className="flex items-center">
                                  {getTransportIcon(transportType)}
                                  <span>{origin} <span className="mx-1 text-text-muted">→</span> {destination}</span>
                                </div>
                              </td>
                            )}
                            {visibleQuoteCols.includes('date') && <td className="px-[24px] py-[16px] text-[13px] text-text-secondary tabular-nums whitespace-nowrap">{quote.createdAt?.split(' ')[0]}</td>}
                            {visibleQuoteCols.includes('validity') && <td className="px-[24px] py-[16px] text-[13px] text-text-secondary">{validez}</td>}
                            {visibleQuoteCols.includes('value') && <td className="px-[24px] py-[16px] text-[13px] text-text-primary tabular-nums font-medium whitespace-nowrap">${(quote.valorTotalConsolidado || 0).toLocaleString()} {quote.moneda}</td>}
                            {visibleQuoteCols.includes('status') && <td className="px-[24px] py-[16px]">
                              <span className="flex items-center px-[10px] py-[4px] bg-neutral-bg text-neutral-text rounded-[6px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap w-fit capitalize">
                                {quote.etapa.replace(/_/g, ' ')}
                              </span>
                            </td>}
                            {visibleQuoteCols.includes('actions') && (
                              <td className="px-[24px] py-[16px] text-center relative">
                              <button onClick={e => { e.stopPropagation(); toggleMenu(quote.id, e); }} className="text-text-muted hover:text-text-primary p-[4px] rounded-[4px] hover:bg-canvas transition-colors">
                                <MoreVertical className="w-4 h-4" />
                              </button>
                              {activeMenu === quote.id && (
                                <div className="absolute right-[24px] top-[40px] w-[180px] bg-white border border-card-border rounded-[8px] shadow-lg py-[8px] z-20 text-left">
                                  <button onClick={(e) => { e.stopPropagation(); setActiveMenu(null); setSelectedQuote(quote); }} className="w-full text-left px-[16px] py-[8px] text-[13px] text-text-primary hover:bg-neutral-bg">Ver detalle</button>
                                  <button className="w-full text-left px-[16px] py-[8px] text-[13px] text-text-primary hover:bg-neutral-bg">Editar</button>
                                  <button className="w-full text-left px-[16px] py-[8px] text-[13px] text-text-primary hover:bg-neutral-bg">Duplicar</button>
                                  {['ganada', 'negociacion'].includes(quote.etapa) && (
                                    <button className="w-full text-left px-[16px] py-[8px] text-[13px] text-brand hover:bg-neutral-bg font-medium">Convertir en reserva</button>
                                  )}
                                  <div className="my-[4px] border-t border-divider" />
                                  <button className="w-full text-left px-[16px] py-[8px] text-[13px] text-text-secondary hover:bg-neutral-bg">Descargar PDF</button>
                                </div>
                              )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {showQuoteImportModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                      <h3 className="text-[14px] font-bold text-gray-800">Importar Cotizaciones (CSV)</h3>
                      <button onClick={() => setShowQuoteImportModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="p-6 space-y-4">
                      <p className="text-xs text-gray-500">Sube un archivo CSV con tus cotizaciones. Descarga la plantilla de muestra para ver el formato.</p>
                      <button onClick={handleDownloadTemplateQuotes} className="w-full py-2 px-4 border border-[#E11D48] text-[#E11D48] bg-[#E11D48]/5 hover:bg-[#E11D48]/10 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2">
                        <Download className="w-4 h-4" /> Descargar plantilla de muestra
                      </button>
                      <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center justify-center bg-gray-50">
                        <Upload className="w-8 h-8 text-gray-400 mb-2" />
                        <p className="text-xs font-semibold text-gray-600 mb-1">Arrastra tu archivo CSV aquí</p>
                        <p className="text-[10px] text-gray-400 mb-4">o haz clic para seleccionar</p>
                        <button onClick={() => { alert('Demo: La importación abriría el selector y procesaría los datos.'); setShowQuoteImportModal(false); }} className="bg-gray-800 hover:bg-gray-900 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
                          Seleccionar archivo
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Ficha se muestra a pantalla completa (ver bloque selectedQuote arriba) */}
        </>
        )
      ) : null}
      {/* Panel Lateral de Chat — colapsable */}
      <RightChatPanel
        quotes={permittedQuotes}
        onSelectQuote={handleSelectQuoteForChat}
        user={user}
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </div>
  );
}

// ─── Componente auxiliar: botón de selección de vista ───────────────────────

function ViewButton({
  active, onClick, label, badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative pb-3 text-[14px] font-medium transition-colors flex items-center gap-2
        ${active ? 'text-[#E11D48] border-b-2 border-[#E11D48] bg-transparent' : 'text-[#71717A] border-b-2 border-transparent hover:text-[#18181B]'}`}
    >
      {label}
      {badge !== undefined && (
        <span className="flex items-center justify-center w-[18px] h-[18px] bg-[#E11D48] text-white text-[10px] font-bold rounded-full">
          {badge}
        </span>
      )}
    </button>
  );
}
