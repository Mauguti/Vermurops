import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { initialQuotes, initialClients, initialProspectos, Prospecto } from '../data';
import { X, Plus, Search, Filter, Download, Upload, List, LayoutGrid, MessageSquare } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { UserRole } from '../auth/users';
import KanbanCotizaciones from './quotes/KanbanCotizaciones';
import BandejaPricing from './quotes/BandejaPricing';
import KanbanProspeccion from './quotes/KanbanProspeccion';
import FichaCotizacion from './quotes/FichaCotizacion';
import RightChatPanel from './quotes/RightChatPanel';
import {
  KanbanQuote, TipoServicio, PIPELINE_STAGES,
  ORIGENES_PROSPECTO, VENDEDORES, INCOTERMS,
} from './quotes/QuotesData';
import { useServicios, renderIcon } from '../config/serviciosStore';
import { useNotifications } from '../notifications/NotificationsContext';
import { useCotizaciones } from '../hooks/useCotizaciones';
import { useProspectos } from '../hooks/useProspectos';
import { useClientes } from '../hooks/useClientes';
import { generateFolio, generateFolioProspecto } from '../lib/folioService';
import Toast, { TipoToast } from './ui/Toast';
import SpreadsheetTable, { type VistaConfig } from './table/SpreadsheetTable';
import { COTIZACION_COLUMNS, VISTA_DEFAULT_COTIZACIONES } from './quotes/cotizacionColumns';
import { PROSPECTO_COLUMNS, VISTA_DEFAULT_PROSPECTOS } from './quotes/prospectoColumns';
import FichaProspecto from './quotes/FichaProspecto';
import { useVistasUsuario } from '../hooks/useVistasUsuario';
import VistaSelector from './table/VistaSelector';

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal del módulo de Cotizaciones
// Soporta tres vistas: Tablero CRM (Kanban), Bandeja Pricing, y Lista simple
// ─────────────────────────────────────────────────────────────────────────────

export default function Quotes() {
  const { user, puede } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [showProspectForm, setShowProspectForm] = useState(false);
  const { serviciosActivos } = useServicios();
  const { agregarNotificacion, notificaciones } = useNotifications();
  const [chatOpen, setChatOpen] = useState(false);
  const chatUnreadCount = notificaciones.filter(n => n.tipo === 'chat' && !n.leida).length;

  // Rol activo derivado del usuario autenticado
  const rolActivo: UserRole = user?.rol ?? 'ventas';
  const isAdmin = rolActivo === 'admin';

  // Capacidades (matriz §4.1) — qué acciones habilita la pantalla.
  const puedeCrearLead     = puede('lead.crear');
  const puedeSolicitar     = puede('cotizacion.solicitar');
  const puedeCrear         = puede('cotizacion.crear');
  const puedeVerKanban     = puede('kanban.ver');
  const puedeVerBandeja    = puede('cotizacion.crear'); // Bandeja Pricing = quien cotiza

  let defaultView: 'kanban' | 'pricing' | 'lista' | 'prospeccion' = 'kanban';
  if (rolActivo === 'ventas') defaultView = 'prospeccion';
  else if (rolActivo === 'pricing') defaultView = 'pricing';
  else if (rolActivo === 'operaciones') defaultView = 'kanban';
  else if (isAdmin) defaultView = 'prospeccion';

  const [viewMode, setViewMode] = useState<'kanban' | 'pricing' | 'lista' | 'prospeccion'>(defaultView);
  const [showQuoteImportModal, setShowQuoteImportModal] = useState(false);

  // Sub-vista dentro de Prospectos/Negociación: 'tabla' o 'kanban'
  const [subView, setSubView] = useState<'tabla' | 'kanban'>('tabla');

  /**
   * Búsqueda y filtro de la vista de Lista.
   *
   * Bug 1.3: el input de búsqueda no tenía `value` ni `onChange` y el botón
   * «Filtros» no tenía `onClick`. Eran decorativos, de ahí el «no me deja
   * seleccionar nada» del cliente.
   */
  const [busqueda, setBusqueda] = useState('');
  /** Vista de columnas de la tabla de prospectos, independiente de la de cotizaciones. */
  const [vistaProspectos, setVistaProspectos] = useState<VistaConfig>(VISTA_DEFAULT_PROSPECTOS);
  /** Prospecto abierto desde la lista. */
  const [prospectoAbierto, setProspectoAbierto] = useState<Prospecto | null>(null);
  const [filtroEtapa, setFiltroEtapa] = useState('');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

  // Cotización seleccionada para abrir la ficha de detalle
  const [selectedQuote, setSelectedQuote] = useState<KanbanQuote | null>(null);

  // Ficha abierta en un componente hijo (BandejaPricing o KanbanCotizaciones)
  const [fichaAbierta, setFichaAbierta] = useState(false);

  // Estado central de cotizaciones — Firestore (E3.3 lectura, E3.4 writes)
  const { quotes: kanbanQuotes, loading: quotesLoading, error: quotesError, createCotizacion, updateCotizacion } = useCotizaciones();

  // Recibe el array completo que devuelven los componentes hijos y persiste
  // solo el documento que cambió (o el nuevo que se añadió).
  const handleUpdateQuotes = async (newQuotes: KanbanQuote[]) => {
    const existingIds = new Set(kanbanQuotes.map(q => q.id));
    const added = newQuotes.find(q => !existingIds.has(q.id));
    if (added) { await createCotizacion(added); return; }
    const changed = newQuotes.find(newQ => {
      const existing = kanbanQuotes.find(q => q.id === newQ.id);
      return existing !== undefined && existing !== newQ;
    });
    if (changed) await updateCotizacion(changed.id, changed);
  };

  // ── Prospectos ───────────────────────────────────────────────────────────
  // Antes vivían en useState sembrados desde el mock de src/data.ts y no se
  // escribían en ningún lado: se perdían al recargar. Ahora vienen de Firestore.
  const {
    prospectos: todosLosProspectos,
    createProspecto,
    updateProspecto,
  } = useProspectos();

  // Para que una empresa que ya es cliente no se recapture como texto libre.
  const { clientes } = useClientes();

  // Ventas solo ve los suyos; los demás roles ven todos.
  const prospectos = todosLosProspectos.filter(p => {
    if (rolActivo === 'ventas') {
      return p.responsable === user?.nombre || p.responsable === user?.uid;
    }
    return true;
  });

  /**
   * Shim con forma de setState para los hijos que ya reciben `setProspectos`
   * (KanbanProspeccion arrastra tarjetas entre etapas). Calcula el array nuevo,
   * detecta qué documento cambió y persiste solo ese — mismo patrón que
   * handleUpdateQuotes.
   */
  const setProspectos: React.Dispatch<React.SetStateAction<Prospecto[]>> = (accion) => {
    const siguiente = typeof accion === 'function'
      ? (accion as (prev: Prospecto[]) => Prospecto[])(prospectos)
      : accion;

    const previos = new Map(prospectos.map(p => [p.id, p]));
    siguiente.forEach(p => {
      const antes = previos.get(p.id);
      if (antes && antes !== p) {
        updateProspecto(p.id, p).catch(err => {
          setToast({ mensaje: `No se pudo guardar el cambio: ${err.message}`, tipo: 'error' });
        });
      }
    });
  };

  // Aviso visible de que algo ocurrió (bug 1.1: no había confirmación alguna).
  const [toast, setToast] = useState<{ mensaje: string; tipo: TipoToast } | null>(null);

  // Filtro de visibilidad por rol (Ventas solo ve lo suyo)
  const permittedQuotes = kanbanQuotes.filter(q => {
    if (rolActivo === 'ventas') {
      return q.vendedorId === user?.uid || q.vendedorId === user?.nombre;
    }
    return true;
  });

  // ── Vistas guardadas (TV-4/5: Firestore) ─────────────────────────────
  const {
    vistas: vistasGuardadas,
    crearVista,
    actualizarVista,
    eliminarVista,
    vistaDefault,
  } = useVistasUsuario('cotizaciones');

  const [vistaActivaId, setVistaActivaId] = useState<string | null>(null);
  const [vistaTabla, setVistaTabla] = useState<VistaConfig>(VISTA_DEFAULT_COTIZACIONES);

  // Auto-cargar la vista default del usuario cuando se cargan las vistas de Firestore
  const defaultLoadedRef = useRef(false);
  useEffect(() => {
    if (defaultLoadedRef.current) return;
    if (vistaDefault && vistaActivaId === null) {
      defaultLoadedRef.current = true;
      setVistaActivaId(vistaDefault.id);
      setVistaTabla({
        columnas: vistaDefault.columnas,
        ordenamiento: vistaDefault.ordenamiento ?? null,
      });
    }
  }, [vistaDefault, vistaActivaId]);

  const handleSeleccionarVista = useCallback((id: string | null) => {
    setVistaActivaId(id);
    if (id) {
      const v = vistasGuardadas.find(vg => vg.id === id);
      if (v) {
        setVistaTabla({
          columnas: v.columnas,
          ordenamiento: v.ordenamiento ?? null,
        });
      }
    } else {
      if (vistaDefault) {
        setVistaTabla({
          columnas: vistaDefault.columnas,
          ordenamiento: vistaDefault.ordenamiento ?? null,
        });
      } else {
        setVistaTabla(VISTA_DEFAULT_COTIZACIONES);
      }
    }
  }, [vistasGuardadas, vistaDefault]);

  const handleGuardarVista = useCallback(async (nombre: string) => {
    const id = await crearVista(nombre, vistaTabla.columnas, {});
    setVistaActivaId(id);
  }, [crearVista, vistaTabla]);

  const handleActualizarVista = useCallback(async (
    id: string,
    cambios: Parameters<typeof actualizarVista>[1],
  ) => {
    await actualizarVista(id, cambios);
  }, [actualizarVista]);

  const handleEliminarVista = useCallback(async (id: string) => {
    await eliminarVista(id);
    if (vistaActivaId === id) {
      setVistaActivaId(null);
      setVistaTabla(vistaDefault
        ? { columnas: vistaDefault.columnas, ordenamiento: vistaDefault.ordenamiento ?? null }
        : VISTA_DEFAULT_COTIZACIONES
      );
    }
  }, [eliminarVista, vistaActivaId, vistaDefault]);

  const coincide = (texto: string) =>
    busqueda.trim() === '' || texto.toLowerCase().includes(busqueda.trim().toLowerCase());

  // Cotizaciones filtradas para la vista de tabla (SpreadsheetTable)
  const filteredTableQuotes = useMemo(() => {
    return permittedQuotes.filter(q => {
      if (viewMode === 'kanban') {
        const etapasCotizacion = ['enviada_cliente', 'negociacion', 'ganada', 'perdida', 'pricing_solicitando', 'cotizaciones_recibidas', 'consolidada', 'solicitud_cliente', 'solicitado_pricing'];
        if (!etapasCotizacion.includes(q.etapa)) return false;
      }
      if (filtroEtapa && q.etapa !== filtroEtapa) return false;
      return coincide(`${q.id} ${q.prospecto?.empresa ?? ''} ${q.prospecto?.contacto ?? ''}`);
    });
  }, [permittedQuotes, viewMode, busqueda, filtroEtapa]);

  /**
   * Prospectos para la vista de Lista.
   *
   * Bug 1.1: esta vista mostraba `filteredTableQuotes` —cotizaciones— así que
   * un prospecto recién creado aparecía en Kanban y nunca en Lista. La tabla
   * no estaba mirando la colección de prospectos.
   */
  const filteredTableProspectos = useMemo(() => {
    return prospectos.filter(p => {
      if (filtroEtapa && p.etapa !== filtroEtapa) return false;
      return coincide(`${p.folio ?? ''} ${p.empresa} ${p.contactoNombre ?? ''} ${p.responsable ?? ''}`);
    });
  }, [prospectos, busqueda, filtroEtapa]);

  /** Etapas ofrecidas en el filtro, según la pestaña activa. */
  const etapasDelFiltro = viewMode === 'prospeccion'
    ? [
        { id: 'nuevo_lead', label: 'Nuevo lead' },
        { id: 'contactado', label: 'Contactado' },
        { id: 'calificado', label: 'Calificado' },
        { id: 'convertido', label: 'Convertido' },
        { id: 'perdido', label: 'Perdido' },
      ]
    : PIPELINE_STAGES.map(s => ({ id: s.id, label: s.label }));

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

  // ─── Formulario de creación de cotizaciones ────────────────────────
  const [formEmpresa, setFormEmpresa] = useState('');
  const [formContacto, setFormContacto] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formOrigen, setFormOrigen] = useState<KanbanQuote['prospecto']['origen']>('web');
  const [formVendedor, setFormVendedor] = useState(VENDEDORES[0].nombre);
  const [formServicios, setFormServicios] = useState<string[]>(['maritimo']);

  /**
   * Origen de la empresa en el formulario de cotización:
   * '' sin elegir · 'prospecto:<id>' · 'cliente:<id>' · '__nuevo__' texto libre.
   *
   * Guardar de dónde salió permite enlazar la cotización con el prospecto y,
   * más adelante, no volver a pedir el alta de un cliente que ya existe
   * (pendiente §4.8 nº 1).
   */
  const [formProspectoOrigenId, setFormProspectoOrigenId] = useState('');

  const aplicarSeleccionEmpresa = (valor: string) => {
    setFormProspectoOrigenId(valor);

    if (valor === '__nuevo__' || valor === '') {
      setFormEmpresa('');
      setFormContacto('');
      setFormTelefono('');
      setFormEmail('');
      return;
    }

    const [tipo, id] = valor.split(':');
    if (tipo === 'prospecto') {
      const p = prospectos.find(x => x.id === id);
      if (!p) return;
      setFormEmpresa(p.empresa);
      setFormContacto(p.contactoNombre ?? '');
      setFormTelefono(p.contactoTel ?? '');
      setFormEmail(p.contactoEmail ?? '');
      setFormOrigen(p.origenLead as typeof formOrigen);
    } else if (tipo === 'cliente') {
      const c = clientes.find(x => x.id === id);
      if (!c) return;
      setFormEmpresa(c.nombre);
      // El cliente ya existe: sus contactos viven en su ficha, no aquí.
      setFormContacto('');
      setFormTelefono('');
      setFormEmail('');
    }
  };
  const [formOrigenRuta, setFormOrigenRuta] = useState('');
  const [formDestinoRuta, setFormDestinoRuta] = useState('');
  const [formIncoterm, setFormIncoterm] = useState('FOB');
  /**
   * Tráfico de la solicitud. Pricing lo sabe de entrada, así que se captura
   * aquí y no se deja a la derivación por ruta, que es el respaldo para las
   * cotizaciones viejas. De este dato depende el folio del embarque.
   */
  const [formTrafico, setFormTrafico] = useState<'importacion' | 'exportacion' | ''>('');
  const [formMercancia, setFormMercancia] = useState('');
  const [formPeso, setFormPeso] = useState(0);
  const [formVolumen, setFormVolumen] = useState(0);

  // Formulario Nuevo Prospecto
  const [formProspectoEmpresa, setFormProspectoEmpresa] = useState('');
  const [formProspectoContacto, setFormProspectoContacto] = useState('');
  const [formProspectoTel, setFormProspectoTel] = useState('');
  const [formProspectoEmail, setFormProspectoEmail] = useState('');

  const [guardandoProspecto, setGuardandoProspecto] = useState(false);

  const handleCreateProspecto = async () => {
    if (!formProspectoEmpresa.trim()) {
      setToast({ mensaje: 'La razón social es obligatoria.', tipo: 'error' });
      return;
    }

    setGuardandoProspecto(true);
    try {
      // Folio transaccional en vez de un id derivado de la longitud del array,
      // que colisionaba en cuanto dos personas creaban a la vez.
      const folio = await generateFolioProspecto();
      const hoy = new Date().toISOString().split('T')[0];

      const nuevo: Prospecto = {
        id: folio,
        folio,
        etapa: 'nuevo_lead',
        empresa: formProspectoEmpresa.trim(),
        contactoNombre: formProspectoContacto.trim() || 'Por definir',
        contactoTel: formProspectoTel.trim() || '',
        contactoEmail: formProspectoEmail.trim() || '',
        origenLead: 'web',
        servicioPotencial: ['maritimo'],
        responsable: user?.nombre || 'Vendedor',
        fechaCreacion: hoy,
        actividades: [],
      };

      await createProspecto(nuevo);

      agregarNotificacion({
        id: `notif-${Date.now()}`,
        tipo: 'cambio_etapa',
        titulo: 'Nuevo Prospecto',
        mensaje: `Se ha registrado el prospecto ${nuevo.empresa}`,
        cotizacionId: nuevo.id,
        etapaAnterior: 'nuevo_lead',
        etapaNueva: 'nuevo_lead',
        destinatarios: ['ventas', 'admin'],
        leida: false,
        fecha: new Date().toISOString(),
      });

      setToast({
        mensaje: `Prospecto ${folio} registrado: ${nuevo.empresa}. Ya está disponible para solicitar cotización.`,
        tipo: 'exito',
      });
    } catch (err) {
      setToast({
        mensaje: `No se pudo registrar el prospecto: ${err instanceof Error ? err.message : err}`,
        tipo: 'error',
      });
      setGuardandoProspecto(false);
      return;
    }
    setGuardandoProspecto(false);
    setShowProspectForm(false);
    setFormProspectoEmpresa('');
    setFormProspectoContacto('');
    setFormProspectoTel('');
    setFormProspectoEmail('');
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
        ...(formTrafico ? { trafico: formTrafico } : {}),
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
    setFormTrafico('');
    setFormMercancia('');
    setFormPeso(0);
    setFormVolumen(0);
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
      {/* ── Header principal (oculto cuando hay una ficha abierta) ──── */}
      {!showForm && !selectedQuote && !fichaAbierta && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-end border-b border-[#E4E4E7] pb-0">
            <div className="flex flex-col gap-4 w-full">
              {/* Fila superior: Título y Acciones */}
              <div className="flex justify-between items-center w-full">
                <h2 className="text-[24px] font-bold text-[#18181B] tracking-tight">
                  CRM
                </h2>
                
                <div className="flex items-center gap-3">
                  {(viewMode === 'prospeccion' || viewMode === 'kanban') && (
                    <>
                      {/* Toggle sub-vista: Lista / Kanban.
                          §4.1: «Consultar Kanban» es de Ventas (y Admin).
                          Pricing trabaja desde Bandeja Pricing y lista. */}
                      <div className={`items-center bg-gray-100 rounded-lg p-0.5 ${puedeVerKanban ? 'flex' : 'hidden'}`}>
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
                            <input
                              type="text"
                              value={busqueda}
                              onChange={e => setBusqueda(e.target.value)}
                              placeholder={viewMode === 'prospeccion' ? 'Buscar prospecto...' : 'Buscar cotización...'}
                              className="w-full pl-[36px] pr-8 bg-white border border-gray-200 rounded-lg p-2 text-[13px] focus:outline-none focus:border-[#E11D48] focus:ring-1 focus:ring-[#E11D48] text-gray-700 shadow-sm"
                            />
                            {busqueda && (
                              <button
                                onClick={() => setBusqueda('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                aria-label="Limpiar búsqueda"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="relative">
                            <button
                              onClick={() => setFiltrosAbiertos(v => !v)}
                              className={`flex items-center text-[13px] font-bold rounded-lg px-3 py-2 border transition-colors shadow-sm ${
                                filtroEtapa
                                  ? 'bg-[#E11D48]/10 border-[#E11D48]/30 text-[#E11D48]'
                                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              <Filter className="w-4 h-4 mr-2" />
                              {filtroEtapa
                                ? etapasDelFiltro.find(e => e.id === filtroEtapa)?.label ?? 'Filtros'
                                : 'Filtros'}
                            </button>

                            {filtrosAbiertos && (
                              <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-[240px] bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-2">Etapa</p>
                                <div className="space-y-0.5 max-h-[260px] overflow-y-auto">
                                  <button
                                    onClick={() => { setFiltroEtapa(''); setFiltrosAbiertos(false); }}
                                    className={`w-full text-left px-2 py-1.5 rounded text-[12px] transition-colors ${
                                      filtroEtapa === '' ? 'bg-[#E11D48]/10 text-[#E11D48] font-semibold' : 'text-gray-600 hover:bg-gray-50'
                                    }`}
                                  >
                                    Todas
                                  </button>
                                  {etapasDelFiltro.map(e => (
                                    <button
                                      key={e.id}
                                      onClick={() => { setFiltroEtapa(e.id); setFiltrosAbiertos(false); }}
                                      className={`w-full text-left px-2 py-1.5 rounded text-[12px] transition-colors ${
                                        filtroEtapa === e.id ? 'bg-[#E11D48]/10 text-[#E11D48] font-semibold' : 'text-gray-600 hover:bg-gray-50'
                                      }`}
                                    >
                                      {e.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {/* 2.4 · Botón contextual: en Prospectos solo se crean
                          prospectos; en Cotizaciones solo cotizaciones. Antes
                          aparecían los dos en las dos pestañas. */}
                      <div className="flex items-center gap-2">
                        {viewMode === 'prospeccion' && puedeCrearLead && (
                          <button
                            onClick={() => setShowProspectForm(true)}
                            className="bg-[#E11D48] text-white px-4 py-2 rounded-lg text-[13px] font-bold hover:bg-[#BE123C] transition-colors shadow-sm flex items-center gap-2"
                          >
                            <Plus className="w-4 h-4" /> Nuevo prospecto
                          </button>
                        )}
                        {viewMode === 'kanban' && puedeSolicitar && (
                          <button
                            onClick={() => setShowForm(true)}
                            className="bg-[#E11D48] text-white px-4 py-2 rounded-lg text-[13px] font-bold hover:bg-[#BE123C] transition-colors shadow-sm flex items-center gap-2"
                          >
                            <Plus className="w-4 h-4" />
                            {puedeCrear ? 'Nueva cotización' : 'Solicitar cotización'}
                          </button>
                        )}
                      </div>
                    </>
                  )}

                  {viewMode === 'pricing' && puedeCrear && (
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
                {/* Prospectos: solo quien crea leads (Ventas y Admin) */}
                {puedeCrearLead && (
                  <ViewButton
                    active={viewMode === 'prospeccion'}
                    onClick={() => setViewMode('prospeccion')}
                    label="Prospectos"
                  />
                )}
                {/* Cotizaciones: todos los roles con acceso al módulo */}
                <ViewButton
                  active={viewMode === 'kanban'}
                  onClick={() => setViewMode('kanban')}
                  label="Cotizaciones"
                />
                {/* Bandeja Pricing: quien cotiza (Pricing y Admin) */}
                {puedeVerBandeja && (
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
              disabled={guardandoProspecto}
              className="bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg shadow-xs transition-colors disabled:opacity-60"
            >
              {guardandoProspecto ? 'Guardando…' : 'Guardar Prospecto'}
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
                {/* Bug 1.2: aquí no había selector, solo un campo de texto libre.
                    Por eso «el prospecto recién creado no aparece»: nunca hubo
                    dónde apareciera. Ahora se elige de la lista y los datos de
                    contacto se rellenan solos. */}
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Razón Social (Empresa) *</label>
                  <select
                    value={formProspectoOrigenId}
                    onChange={e => aplicarSeleccionEmpresa(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48] bg-white"
                  >
                    <option value="">— Selecciona o captura —</option>
                    {prospectos.length > 0 && (
                      <optgroup label="Prospectos">
                        {prospectos.map(p => (
                          <option key={p.id} value={`prospecto:${p.id}`}>
                            {p.empresa}{p.folio ? ` · ${p.folio}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {clientes.length > 0 && (
                      <optgroup label="Clientes existentes">
                        {clientes.map(c => (
                          <option key={c.id} value={`cliente:${c.id}`}>{c.nombre}</option>
                        ))}
                      </optgroup>
                    )}
                    <option value="__nuevo__">+ Capturar empresa nueva…</option>
                  </select>

                  {/* El texto libre sigue existiendo, pero como excepción y no
                      como única opción. */}
                  {formProspectoOrigenId === '__nuevo__' && (
                    <input
                      type="text" required autoFocus
                      placeholder="Ej. Alfa Corporativo S.A."
                      value={formEmpresa}
                      onChange={e => setFormEmpresa(e.target.value)}
                      className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48]"
                    />
                  )}
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
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">Tráfico</label>
                  <select
                    value={formTrafico}
                    onChange={e => setFormTrafico(e.target.value as typeof formTrafico)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48] bg-white"
                  >
                    <option value="">— Definir después —</option>
                    <option value="importacion">Importación</option>
                    <option value="exportacion">Exportación</option>
                  </select>
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
          onFichaVisible={setFichaAbierta}
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
          {subView === 'kanban' && puedeVerKanban ? (
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
                onFichaVisible={setFichaAbierta}
              />
            )
          ) : (
            /* ── Sub-vista Tabla (SpreadsheetTable) ── */
            <>
              <div className="flex items-center justify-between mb-3">
                {/* Selector de vistas */}
                <VistaSelector
                  vistas={vistasGuardadas}
                  vistaActivaId={vistaActivaId}
                  currentUserId={user?.uid || user?.id || ''}
                  vistaActual={vistaTabla}
                  labelDefault="Vista por defecto"
                  onSeleccionar={handleSeleccionarVista}
                  onGuardar={handleGuardarVista}
                  onActualizar={handleActualizarVista}
                  onEliminar={handleEliminarVista}
                />

                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowQuoteImportModal(true)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200">
                      <Upload className="w-4 h-4" />
                    </button>
                    <button onClick={handleExportCSVQuotes} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200">
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Bug 1.1: en Prospectos, la Lista mostraba cotizaciones. Ahora
                  cada pestaña lista su propia entidad. */}
              {viewMode === 'prospeccion' ? (
                <SpreadsheetTable<Prospecto>
                  data={filteredTableProspectos}
                  columns={PROSPECTO_COLUMNS}
                  pinnedColumnIds={['folio']}
                  vista={vistaProspectos}
                  onVistaChange={setVistaProspectos}
                  onRowClick={(p) => setProspectoAbierto(p)}
                  maxHeight="calc(100vh - 220px)"
                />
              ) : (
                <SpreadsheetTable<KanbanQuote>
                  data={filteredTableQuotes}
                  columns={COTIZACION_COLUMNS}
                  pinnedColumnIds={['folio']}
                  vista={vistaTabla}
                  onVistaChange={setVistaTabla}
                  onRowClick={(quote) => setSelectedQuote(quote)}
                  maxHeight="calc(100vh - 220px)"
                />
              )}

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
      {prospectoAbierto && (
        <FichaProspecto
          prospecto={prospectoAbierto}
          isOpen={true}
          onClose={() => setProspectoAbierto(null)}
          onUpdate={(actualizado) => {
            updateProspecto(actualizado.id, actualizado).catch(err =>
              setToast({ mensaje: `No se pudo guardar: ${err.message}`, tipo: 'error' }));
            setProspectoAbierto(actualizado);
          }}
          onConvert={() => { /* la conversión vive en el Kanban */ }}
        />
      )}

      {/* Confirmación visible de las acciones (bug 1.1) */}
      <Toast
        mensaje={toast?.mensaje ?? null}
        tipo={toast?.tipo}
        onClose={() => setToast(null)}
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
