import React, { useState, useMemo, useCallback } from 'react';
import {
  X, User, FileText, Plus, Trash2, CheckCircle2, AlertTriangle,
  MessageSquare, Clock, Send, BarChart2, Building2, Search, Link2,
  ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import {
  KanbanQuote, QuoteActivity, StageHistory, ORIGENES_PROSPECTO, PIPELINE_STAGES,
  ServicioSolicitado, TipoServicio, CotizacionProveedor,
  EQUIPO_PRICING, VENDEDORES, calcularTotalConsolidado, getOficialIds,
  PipelineStageId,
} from './QuotesData';
import { useAuth } from '../../auth/AuthContext';
import { useNotifications } from '../../notifications/NotificationsContext';
import { idUnico } from '../../lib/idUnico';
import { sumarPorMoneda, monedasConMonto, formatearPorMoneda } from '../../lib/sumarPorMoneda';
import { crearNotificacionEtapa } from '../../notifications/notificationsStore';
import { useServicios, renderIcon } from '../../config/serviciosStore';
import { useClientes } from '../../hooks/useClientes';
import { calcLinea } from '../../lib/cotizacionCalculator';
import { puedeTransicionarA, transicionesDisponibles, type Rol } from '../../lib/stateMachine';
import { useTarifas } from '../../hooks/useTarifas';
import { useConceptos } from '../../hooks/useConceptos';
import { ServicioSection } from './ServicioSection';
import TarifaPanel from '../tarifas/TarifaPanel';
import { resolverMonto, fmtPrecio } from '../tarifas/tarifaMatching';
import { useProveedores } from '../../hooks/useProveedores';
import { contactoPrincipal } from '../proveedores/ProveedoresData';
import type { TarifaVermur } from '../tarifas/TarifasData';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import {
  visibilidadDe, tabsVisibles, LINEA_TIEMPO_VENTAS,
  indicePasoVentas, lineaTiempoColapsada,
} from '../../lib/visibilidadCotizacion';
import {
  aplanarCotizacion, aplicarEdicionLinea, quitarLinea, agregarLinea,
  reordenarLinea, aplicarOrden, estaCongelada, moverLineaDeServicio,
  repararConceptosDuplicados,
} from '../../lib/lineasCotizacion';
import {
  matricesPorServicio, escribirCelda, quitarAgenteDeCotizacion,
  conceptosSinCotizar, claveAgente, construirMatriz, CONCEPTOS_POR_PLANTILLA,
  type FilaMatriz,
  type AgenteColumna,
} from '../../lib/matrizComparativa';
import MatrizAgentes from './MatrizAgentes';
import ModalAgregarAgente from './ModalAgregarAgente';
import CapturaTipoCambio from './CapturaTipoCambio';
import EvidenciasTarifas from './EvidenciasTarifas';
import RevisionTarifasExtraidas from '../tarifas/RevisionTarifasExtraidas';
import CargarTarifario from '../tarifas/CargarTarifario';
import Toast from '../ui/Toast';
import { usePuertos } from '../../hooks/usePuertos';
import { useDocumentosTarifario } from '../../hooks/useDocumentosTarifario';
import { totalesComparables } from '../../lib/matrizComparativa';
import { compararColumnas, type MonedaCotizacion } from '../../lib/monedaComparativa';
import {
  evaluarProntitud, faltantesPorLinea, resumenFaltantes, textoFaltantesLinea,
} from '../../lib/prontitudCotizacion';
import TablaConceptos, { ServicioDeLaTabla } from './TablaConceptos';
import {
  FichaLayout, FichaHeader, FichaTabs, FichaFooter, BadgeEstado,
} from '../ui/ficha/FichaLayout';
import { BloqueEnlaces } from '../ui/ficha/EnlaceEntidad';
import LineaTiempo from '../ui/ficha/LineaTiempo';
import {
  elegirCelda, elegirColumna, derivarSeleccion, agenteDominante,
  menorPorFila, resumenSeleccion,
} from '../../lib/seleccionMatriz';
import ResumenFinancieroInline from './ResumenFinancieroInline';
import { calcTotales } from '../../lib/cotizacionCalculator';
import { cargaDesdeLegacy, resumenCarga, ETIQUETA_MODALIDAD, ModalidadSolicitud } from '../../lib/cargaSolicitud';

// ─── Re-exports for backward compat (other files may import these from here) ──
export { ServicioSection } from './ServicioSection';
export { ConceptoSection } from './ConceptoSection';

interface FichaCotizacionProps {
  quote: KanbanQuote;
  onBack: () => void;
  onUpdateQuote: (quote: KanbanQuote) => void;
  onConvertToShipment: (quote: KanbanQuote) => void;
  /** Rol activo del usuario (Ventas o Pricing) */
  rolActivo: Rol;
}

// ─── Forward-advance config (Pre-TA: footer fix) ─────────────────────────────
// Para cada etapa, lista las transiciones "hacia adelante" en orden de prioridad.
// La primera que esté en `disponibles` se convierte en el botón primario.
const FORWARD_TARGETS: Partial<Record<PipelineStageId, PipelineStageId[]>> = {
  solicitud_cliente:      ['solicitado_pricing'],
  solicitado_pricing:     ['pricing_solicitando'],
  pricing_solicitando:    ['cotizaciones_recibidas'],
  cotizaciones_recibidas: ['consolidada'],
  consolidada:            ['enviada_cliente'],
  enviada_cliente:        ['negociacion'],
  negociacion:            ['ganada'],
};

/**
 * ¿Existe ya el generador de PDF?
 *
 * Hoy el botón solo dispara un alert. Se apaga entero en vez de deshabilitarlo:
 * un botón gris con «(próximamente)» sigue prometiendo algo, y es justo el
 * patrón que le molesta al cliente — «botones que no corresponden al momento o
 * que se llaman distinto a lo que hacen».
 *
 * El PDF es trabajo propio: sin margen, sin proveedores y sin desglose de
 * costos, solo montos individuales y totales. Al construirlo, poner en true.
 */
const PDF_DISPONIBLE = false;

const ADVANCE_CONFIG: Partial<Record<PipelineStageId, { label: string; cls: string }>> = {
  solicitado_pricing:     { label: 'Enviar a Pricing',        cls: 'bg-[#4B2A8C] hover:bg-[#3d2277]' },
  pricing_solicitando:    { label: 'Iniciar cotización',      cls: 'bg-[#E11D48] hover:bg-[#BE123C]' },
  cotizaciones_recibidas: { label: 'Cotizaciones recibidas',  cls: 'bg-violet-600 hover:bg-violet-700' },
  consolidada:            { label: 'Consolidar cotización',   cls: 'bg-cyan-600 hover:bg-cyan-700' },
  enviada_cliente:        { label: 'Enviar al cliente',       cls: 'bg-blue-600 hover:bg-blue-700' },
  negociacion:            { label: 'Iniciar negociación',     cls: 'bg-rose-600 hover:bg-rose-700' },
  ganada:                 { label: 'Marcar ganada',           cls: 'bg-green-600 hover:bg-green-700' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal: FichaCotizacion (pantalla completa)
// ─────────────────────────────────────────────────────────────────────────────

export default function FichaCotizacion({
  quote, onBack, onUpdateQuote, onConvertToShipment, rolActivo,
}: FichaCotizacionProps) {
  const { user } = useAuth();
  const { agregarNotificacion } = useNotifications();
  const { servicios } = useServicios();
  const { clientes } = useClientes();
  const { tarifas: catalogoTarifas, createTarifa } = useTarifas();
  const { proveedores } = useProveedores();
  const { puertos } = usePuertos();
  const { conceptos: conceptosCatalogo } = useConceptos();
  const conceptosActivos = useMemo(() => conceptosCatalogo.filter(c => c.activo), [conceptosCatalogo]);

  const [activeTab, setActiveTab] = useState<'info' | 'servicios' | 'actividades' | 'historial' | 'chat'>('info');

  /**
   * Agentes agregados a la comparativa que todavía no tienen precio.
   *
   * Es lo único de la matriz que NO se deriva: un agente sin tarifas no deja
   * rastro en el árbol. Los que sí cotizaron salen solos de concepto.tarifas.
   */
  const [agentesGuardados, setAgentesGuardados] = useState<Record<string, AgenteColumna[]>>({});
  /** Agente elegido por servicio. Sin elección explícita manda el menor. */
  const [modalAgente, setModalAgente] = useState<string | null>(null);
  /** Extracción recién llegada, esperando la pantalla de revisión (TA-4). */
  const [toastLocal, setToastLocal] = useState<string | null>(null);
  const [cargandoTarifario, setCargandoTarifario] = useState(false);
  /** Servicio cuyos datos de embarque se están editando. */
  const [datosEmbarqueDe, setDatosEmbarqueDe] = useState<string | null>(null);
  /** El catálogo de tarifas, colapsable — abierto por default: es el insumo. */
  const [catalogoAbierto, setCatalogoAbierto] = useState(true);
  const [extraccionPendiente, setExtraccionPendiente] =
    useState<{ documento: import('../../lib/documentoTarifario').DocumentoTarifario; respuesta: unknown } | null>(null);
  /**
   * Servicio activo de la comparativa.
   *
   * Una sola matriz que cambia de contenido, no una por servicio: cuatro
   * tablas saturan la pantalla. Mismo patrón que el panel lateral de tarifas.
   */
  const [servicioComparativa, setServicioComparativa] = useState<string | null>(null);

  /**
   * Evidencias: los documentos de los que salieron los costos.
   * Es la misma pieza que sube los tarifarios — una subida, dos usos.
   */
  const {
    documentos, subiendo: subiendoDoc, subirDocumento, registrarExtraccion,
  } = useDocumentosTarifario(quote.id);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [newChatMessage, setNewChatMessage] = useState('');
  const [showLossReasonForm, setShowLossReasonForm] = useState(false);
  const [lossReason, setLossReason] = useState('');

  // Buscador de cliente (E6.4): query de búsqueda por nombre/RFC.
  const [clienteQuery, setClienteQuery] = useState('');

  // Nuevo Servicio
  const [showAddServicio, setShowAddServicio] = useState(false);
  const [newServicioTipo, setNewServicioTipo] = useState<TipoServicio>('maritimo');

  // FC-2: concepto activo en el panel de tarifas
  const [activeConcepto, setActiveConcepto] = useState<{ id: string; servicioId: string } | null>(null);
  const [comparativaCount, setComparativaCount] = useState(0);
  const anyComparativaOpen = comparativaCount > 0;

  const handleComparativaToggle = useCallback((open: boolean) => {
    setComparativaCount(prev => Math.max(0, prev + (open ? 1 : -1)));
  }, []);

  // FC-3: Drag and drop state + sensors
  const [activeDrag, setActiveDrag] = useState<{
    tarifa: TarifaVermur; provNombre: string; contactoNombre: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Actividades
  const [newActivityTitle, setNewActivityTitle] = useState('');
  const [newActivityDesc, setNewActivityDesc] = useState('');
  const [newActivityDate, setNewActivityDate] = useState('');
  const [newActivityType, setNewActivityType] = useState<QuoteActivity['tipo']>('tarea');
  const [newNoteText, setNewNoteText] = useState('');

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const isActivityOverdue = (dateStr: string) =>
    dateStr < new Date().toISOString().split('T')[0];

  const filterTasks = quote.actividades.filter(a => a.tipo !== 'cambio_etapa' && a.tipo !== 'nota');
  const filterNotes = quote.actividades.filter(a => (a.tipo === 'nota' && !a.parentId) || a.tipo === 'cambio_etapa');

  const handleAddServicio = () => {
    const newService: ServicioSolicitado = {
      id: `srv-${Date.now()}`,
      tipo: newServicioTipo,
      ruta: { origen: '', destino: '', aduanaSalida: '', aduanaRecepcion: '' },
      incoterm: 'FOB',
      mercancia: '',
      peso: 0,
      volumen: 0,
      estado: 'pendiente',
      cotizacionesProveedor: [], profit: 0, recargosPct: 0,
      conceptos: [],
    };
    onUpdateQuote({
      ...quote,
      servicios: [...quote.servicios, newService]
    });
    setShowAddServicio(false);
  };

  // ─── Handlers: stage ────────────────────────────────────────────────────

  const handleStageChange = (newEtapa: PipelineStageId, lossReasonText: string | null = null) => {
    if (quote.etapa === newEtapa) return;

    // ── Guard E5.2: validar transición antes de ejecutar ──────────────────
    const guard = puedeTransicionarA(quote.etapa, newEtapa, rolActivo, quote);
    if (!guard.ok) {
      alert(guard.razon ?? 'Transición no permitida.');
      return;
    }

    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');

    const prevLabel = PIPELINE_STAGES.find(s => s.id === quote.etapa)?.label ?? quote.etapa;
    const newLabel  = PIPELINE_STAGES.find(s => s.id === newEtapa)?.label ?? newEtapa;

    const newHistoryEntry: StageHistory = {
      etapa: newEtapa,
      fecha: fechaActual,
      nota: lossReasonText ? `Motivo de pérdida: ${lossReasonText}` : undefined,
    };

    const newActivityEntry: QuoteActivity = {
      id: `act-sys-${Date.now()}`,
      titulo: `Cambio de etapa: ${prevLabel} → ${newLabel}`,
      descripcion: lossReasonText ? `Motivo: ${lossReasonText}` : 'Transición de etapa comercial.',
      responsableId: quote.vendedorId,
      fechaLimite: fechaActual.split(' ')[0],
      estado: 'hecha',
      tipo: 'cambio_etapa',
      createdAt: fechaActual,
    };

    const actualizada: KanbanQuote = {
      ...quote,
      etapa: newEtapa,
      motivoPerdida: newEtapa === 'perdida' ? lossReasonText : null,
      estadoFinal: newEtapa === 'ganada' ? 'ganada' : newEtapa === 'perdida' ? 'perdida' : null,
      updatedAt: fechaActual,
      historialEtapas: [...quote.historialEtapas, newHistoryEntry],
      actividades: [...quote.actividades, newActivityEntry],
    };

    /*
     * A-1 · Ganada es la única etapa que NO se guarda por su cuenta.
     *
     * De esta transición nace el embarque, y las dos escrituras tienen que
     * caer juntas: una cotización ganada sin embarque deja la venta cerrada
     * sin nada que operar, y un embarque sin la cotización marcada haría que
     * el siguiente clic generara un gemelo con otro folio.
     *
     * `onConvertToShipment` recibe la cotización YA actualizada y la escribe
     * dentro de la misma transacción que crea los embarques.
     */
    if (newEtapa === 'ganada') {
      onConvertToShipment(actualizada);
    } else {
      onUpdateQuote(actualizada);
    }

    // Disparar notificación si aplica
    const notif = crearNotificacionEtapa(
      quote.id,
      quote.prospecto.empresa,
      quote.etapa,
      newEtapa,
      prevLabel,
      newLabel,
    );
    if (notif) agregarNotificacion(notif);
  };

  // ─── Handlers: servicios ─────────────────────────────────────────────────

  const handleUpdateServicio = (servicioId: string, updatedServicio: ServicioSolicitado) => {
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const nuevosServicios = quote.servicios.map(s =>
      s.id === servicioId ? updatedServicio : s
    );
    const nuevoTotal = calcularTotalConsolidado(nuevosServicios);
    onUpdateQuote({
      ...quote,
      servicios: nuevosServicios,
      valorTotalConsolidado: nuevoTotal,
      updatedAt: fechaActual,
    });
  };

  // ─── FC-2: Handlers para el panel de tarifas ────────────────────────────

  /** Datos del concepto activo (para el panel). */
  const activeConceptoData = useMemo(() => {
    if (!activeConcepto) return null;
    const srv = quote.servicios.find(s => s.id === activeConcepto.servicioId);
    if (!srv) return null;
    const conc = (srv.conceptos || []).find(c => c.id === activeConcepto.id);
    if (!conc) return null;
    return { concepto: conc, servicio: srv };
  }, [activeConcepto, quote.servicios]);

  // ── SP-2: Costo de la cotización por moneda para el simulador ──────────
  /** Costo total por moneda de todos los conceptos EXCEPTO el activo (incluye subconceptos del activo). */
  const costoBaseByMoneda = useMemo(() => {
    const r = { USD: 0, MXN: 0 };
    for (const srv of quote.servicios) {
      for (const conc of srv.conceptos || []) {
        const isActive = activeConcepto && conc.id === activeConcepto.id && srv.id === activeConcepto.servicioId;
        if (isActive) {
          // Solo subconceptos del activo (no cambian en simulación)
          for (const s of conc.subconceptos || []) r[s.moneda] += s.costo;
        } else {
          // Todo: tarifas oficiales + subconceptos
          const ids = getOficialIds(conc);
          for (const t of conc.tarifas || []) {
            if (ids.includes(t.id)) r[t.moneda] += t.monto;
          }
          for (const s of conc.subconceptos || []) r[s.moneda] += s.costo;
        }
      }
    }
    return r;
  }, [quote.servicios, activeConcepto]);

  /** Costo actual del concepto activo por moneda (solo tarifas oficiales — lo que la simulación reemplaza). */
  const costoConceptoActualByMoneda = useMemo(() => {
    const r = { USD: 0, MXN: 0 };
    if (!activeConceptoData) return r;
    const { concepto } = activeConceptoData;
    const ids = getOficialIds(concepto);
    for (const t of concepto.tarifas || []) {
      if (ids.includes(t.id)) r[t.moneda] += t.monto;
    }
    return r;
  }, [activeConceptoData]);

  /** Aplica una tarifa del catálogo a un concepto específico (usado por panel "Usar" y drag & drop). */
  const applyTarifaToConcepto = (
    tarifa: TarifaVermur, provNombre: string, contactoNombre: string,
    conceptoId: string, servicioId: string,
  ) => {
    const srv = quote.servicios.find(s => s.id === servicioId);
    if (!srv) return;
    const conc = (srv.conceptos || []).find(c => c.id === conceptoId);
    if (!conc) return;
    // Duplicate check
    if ((conc.tarifas || []).some(t => t.tarifaOrigenId === tarifa.id)) return;
    const esPrimera = !(conc.tarifas?.length);
    const cpId = idUnico('cp');
    const cp: CotizacionProveedor = {
      id: cpId,
      proveedor: provNombre,
      contacto: contactoNombre,
      monto: resolverMonto(tarifa, srv.fcl_contenedor),
      moneda: tarifa.moneda,
      tiempoTransito: tarifa.tiempoTransitoDias ? `${tarifa.tiempoTransitoDias} días` : undefined,
      vigencia: tarifa.fechaFin ?? undefined,
      condiciones: tarifa.condiciones || undefined,
      adjuntoUrl: null,
      archivoNombre: null,
      seleccionada: esPrimera,
      estadoRespuesta: 'recibida',
      freeTimeDias: tarifa.freeTimeDias,
      proveedorId: tarifa.proveedorId,
      conceptoId: tarifa.conceptoId,
      tarifaOrigenId: tarifa.id,
    };
    const updatedConcepto = {
      ...conc,
      tarifas: [...(conc.tarifas || []), cp],
      ...(esPrimera ? { proveedoresOficialIds: [cpId] } : {}),
    };
    const updatedServicio = {
      ...srv,
      conceptos: (srv.conceptos || []).map(c => c.id === conc.id ? updatedConcepto : c),
    };
    handleUpdateServicio(srv.id, updatedServicio);
  };

  /** "Usar" tarifa desde el panel lateral. */
  const handlePanelUsarTarifa = useCallback((tarifa: TarifaVermur, provNombre: string, contactoNombre: string) => {
    if (!activeConcepto) return;
    applyTarifaToConcepto(tarifa, provNombre, contactoNombre, activeConcepto.id, activeConcepto.servicioId);
  }, [activeConcepto, quote.servicios]);

  /** SP-3: Aplicar múltiples tarifas simuladas al concepto activo. */
  const handlePanelAplicarSimulacion = useCallback((tarifas: TarifaVermur[]) => {
    if (!activeConcepto) return;
    const srv = quote.servicios.find(s => s.id === activeConcepto.servicioId);
    if (!srv) return;
    const conc = (srv.conceptos || []).find(c => c.id === activeConcepto.id);
    if (!conc) return;

    const existingTarifas = conc.tarifas || [];
    const esPrimeraYUnica = existingTarifas.length === 0 && tarifas.length === 1;

    const newCps: CotizacionProveedor[] = [];
    for (const tarifa of tarifas) {
      // Duplicate check
      if (existingTarifas.some(t => t.tarifaOrigenId === tarifa.id)) continue;
      if (newCps.some(t => t.tarifaOrigenId === tarifa.id)) continue;
      const prov = proveedores.find(p => p.id === tarifa.proveedorId);
      const contacto = prov ? contactoPrincipal(prov) : undefined;
      const cpId = idUnico('cp');
      newCps.push({
        id: cpId,
        proveedor: prov?.nombre ?? tarifa.proveedorId,
        contacto: contacto?.nombre ?? '',
        monto: resolverMonto(tarifa, srv.fcl_contenedor),
        moneda: tarifa.moneda,
        tiempoTransito: tarifa.tiempoTransitoDias ? `${tarifa.tiempoTransitoDias} días` : undefined,
        vigencia: tarifa.fechaFin ?? undefined,
        condiciones: tarifa.condiciones || undefined,
        adjuntoUrl: null,
        archivoNombre: null,
        seleccionada: esPrimeraYUnica,
        estadoRespuesta: 'recibida',
        freeTimeDias: tarifa.freeTimeDias,
        proveedorId: tarifa.proveedorId,
        conceptoId: tarifa.conceptoId,
        tarifaOrigenId: tarifa.id,
      });
    }
    if (newCps.length === 0) return;

    const updatedConcepto = {
      ...conc,
      tarifas: [...existingTarifas, ...newCps],
      ...(esPrimeraYUnica ? { proveedoresOficialIds: [newCps[0].id] } : {}),
    };
    const updatedServicio = {
      ...srv,
      conceptos: (srv.conceptos || []).map(c => c.id === conc.id ? updatedConcepto : c),
    };
    handleUpdateServicio(srv.id, updatedServicio);
  }, [activeConcepto, quote.servicios, proveedores]);

  /** Captura manual desde el panel lateral. */
  const handlePanelCaptura = useCallback((cp: CotizacionProveedor) => {
    if (!activeConceptoData) return;
    const { concepto, servicio } = activeConceptoData;
    const updatedConcepto = { ...concepto, tarifas: [...(concepto.tarifas || []), cp] };
    const updatedServicio = {
      ...servicio,
      conceptos: (servicio.conceptos || []).map(c => c.id === concepto.id ? updatedConcepto : c),
    };
    handleUpdateServicio(servicio.id, updatedServicio);
  }, [activeConceptoData]);

  /** Activar un concepto (desde ServicioSection → ConceptoSection). */
  const handleConceptoActivate = useCallback((conceptoId: string, servicioId: string) => {
    setActiveConcepto({ id: conceptoId, servicioId });
  }, []);

  // ─── FC-3: Drag & drop handlers ────────────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === 'tarifa') {
      setActiveDrag({
        tarifa: data.tarifa as TarifaVermur,
        provNombre: data.provNombre as string,
        contactoNombre: data.contactoNombre as string,
      });
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const dragData = active.data.current;
    const dropData = over.data.current;
    if (dragData?.type !== 'tarifa' || dropData?.type !== 'concepto') return;

    applyTarifaToConcepto(
      dragData.tarifa as TarifaVermur,
      dragData.provNombre as string,
      dragData.contactoNombre as string,
      dropData.conceptoId as string,
      dropData.servicioId as string,
    );
  }, [quote.servicios]);

  const handleDragCancel = useCallback(() => {
    setActiveDrag(null);
  }, []);

  // ─── Handlers: campos generales ──────────────────────────────────────────

  const handleFieldChange = (section: 'prospecto' | 'general', field: string, value: any) => {
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');
    let updatedQuote: KanbanQuote = { ...quote, updatedAt: fechaActual };
    if (section === 'prospecto') {
      updatedQuote.prospecto = { ...quote.prospecto, [field]: value };
    } else {
      updatedQuote = { ...updatedQuote, [field]: value };
    }
    onUpdateQuote(updatedQuote);
  };

  // ─── Handlers: vínculo cliente (E6.4) ────────────────────────────────────
  const handleVincularCliente = (clienteId: string) => {
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');
    onUpdateQuote({ ...quote, clienteId, updatedAt: fechaActual });
    setClienteQuery('');
  };

  const handleDesvincularCliente = () => {
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');
    onUpdateQuote({ ...quote, clienteId: null, updatedAt: fechaActual });
  };

  // ─── Handlers: actividades ───────────────────────────────────────────────

  const handleAddActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActivityTitle.trim()) return;
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const newAct: QuoteActivity = {
      id: `act-${Date.now()}`,
      titulo: newActivityTitle,
      descripcion: newActivityDesc,
      responsableId: quote.vendedorId,
      fechaLimite: newActivityDate || new Date().toISOString().split('T')[0],
      estado: 'pendiente',
      tipo: newActivityType,
      createdAt: fechaActual,
    };
    onUpdateQuote({ ...quote, actividades: [...quote.actividades, newAct], updatedAt: fechaActual });
    setNewActivityTitle('');
    setNewActivityDesc('');
    setNewActivityDate('');
    setNewActivityType('tarea');
  };

  const handleToggleActivity = (actId: string) => {
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const updatedActs = quote.actividades.map(act =>
      act.id === actId
        ? { ...act, estado: act.estado === 'pendiente' ? 'hecha' as const : 'pendiente' as const }
        : act
    );
    onUpdateQuote({ ...quote, actividades: updatedActs, updatedAt: fechaActual });
  };

  const handleDeleteActivity = (actId: string) => {
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');
    onUpdateQuote({ ...quote, actividades: quote.actividades.filter(a => a.id !== actId), updatedAt: fechaActual });
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const nota: QuoteActivity = {
      id: `act-note-${Date.now()}`,
      titulo: 'Nota comercial',
      descripcion: newNoteText,
      responsableId: quote.vendedorId,
      fechaLimite: fechaActual.split(' ')[0],
      estado: 'hecha',
      tipo: 'nota',
      createdAt: fechaActual,
    };
    onUpdateQuote({ ...quote, actividades: [...quote.actividades, nota], updatedAt: fechaActual });
    setNewNoteText('');
  };

  const handleMarkLost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lossReason.trim()) return;
    handleStageChange('perdida', lossReason);
    setShowLossReasonForm(false);
    setLossReason('');
  };

  // ─── Total consolidado ───────────────────────────────────────────────────

  const totalConsolidado = quote.valorTotalConsolidado > 0
    ? quote.valorTotalConsolidado
    : calcularTotalConsolidado(quote.servicios);

  /**
   * Margen de la OPERACIÓN COMPLETA, no de un concepto.
   *
   * Es el número con el que Pricing juega: pueden bajar el margen de un
   * concepto y subirlo en otro. «El margen de mi concepto no va a ser bueno,
   * pero el margen de mi operación sí.» Es también lo único de rentabilidad
   * que Ventas ve.
   */
  const margenGeneralOperacion = useMemo(() => {
    const lineas = aplanarCotizacion(quote);
    const { margen_real } = calcTotales(
      lineas.map(l => ({ costo: l.costo, profit: l.profit })),
      // El financiamiento por días de crédito afecta el profit real, no el
      // margen bruto de la operación, así que aquí va en cero. El profit real
      // con financiamiento vive en el resumen financiero de Pricing.
      0,
    );
    return margen_real;
  }, [quote]);

  // ── Vista plana para las tarjetas por modalidad ─────────────────────────
  const lineasPlanas = useMemo(() => aplanarCotizacion(quote), [quote]);

  /**
   * El total del encabezado, POR MONEDA de las líneas (§4.3).
   *
   * Antes decía «Total: $350 MXN» leyendo quote.moneda como etiqueta, con las
   * líneas en USD: el número era de una moneda y el rótulo de otra. La
   * etiqueta sale de las MISMAS líneas que producen el número.
   */
  const totalEncabezado = useMemo(() => {
    const t = sumarPorMoneda(lineasPlanas, l => l.venta, l => l.moneda);
    return monedasConMonto(t).length > 0 ? formatearPorMoneda(t) : null;
  }, [lineasPlanas]);

  /**
   * Qué le falta a la cotización para poder avanzar (BC-1).
   *
   * Gobierna qué botones se muestran. Un botón visible que no aplica es peor
   * que uno ausente: obliga a preguntarse si uno lo está usando mal.
   */
  const prontitud = useMemo(() => evaluarProntitud(quote), [quote]);
  /**
   * C.4 · Los servicios de la cotización con nombre legible, para la columna
   * «Servicio» de la tabla única. El nombre sale del catálogo cuando el tipo
   * es un id (`srv-def-2`); si no, el tipo tal cual con inicial mayúscula.
   */
  const serviciosDeLaTabla = useMemo<ServicioDeLaTabla[]>(
    () => (quote.servicios ?? []).map(srv => {
      const delCatalogo = (servicios ?? []).find(c => c.id === srv.tipo);
      // Las solicitudes del rediseño traen la modalidad como tipo
      // ('despacho_aduanal'): su etiqueta sale del mapa, no del snake_case.
      const deModalidad = ETIQUETA_MODALIDAD[srv.tipo as ModalidadSolicitud];
      const crudo = delCatalogo?.nombre ?? deModalidad ?? srv.tipo;
      return { id: srv.id, etiqueta: crudo.charAt(0).toUpperCase() + crudo.slice(1) };
    }),
    [quote.servicios, servicios],
  );

  /**
   * La carga que declaró Ventas en la solicitud (S-3), para que Pricing
   * cotice sin volver a preguntar. Solo servicios con algo que decir.
   */
  const solicitudDeclarada = useMemo(
    () => (quote.servicios ?? []).flatMap(srv => {
      const carga = cargaDesdeLegacy(srv);
      if (!carga) return [];
      const etiqueta = serviciosDeLaTabla.find(x => x.id === srv.id)?.etiqueta ?? srv.tipo;
      const ruta = srv.ruta?.origen && srv.ruta.origen !== 'Por definir'
        ? `${srv.ruta.origen.split(',')[0]} → ${srv.ruta.destino.split(',')[0]}`
        : null;
      return [{ id: srv.id, etiqueta, resumen: resumenCarga(carga), ruta,
        requeridos: srv.conceptosRequeridos?.length ?? 0 }];
    }),
    [quote.servicios, serviciosDeLaTabla],
  );

  /** Aplica una edición de la tabla plana sobre el árbol anidado. */
  const handleEditarLineaPlana = (
    lineaId: string,
    campo: 'costo' | 'profit' | 'target',
    valor: number,
  ) => {
    onUpdateQuote(aplicarEdicionLinea(quote, lineaId, { [campo]: Number(valor) }));
  };

  /**
   * Concepto elegido del catálogo.
   *
   * Se guardan el id Y el nombre juntos: el nombre es para leer, el id es lo
   * que hace match con las tarifas. Teclear el concepto a mano dejaba el id
   * vacío y el panel de tarifas sin nada que ofrecer.
   */
  const handleElegirConcepto = (lineaId: string, conceptoId: string, nombre: string) => {
    onUpdateQuote(aplicarEdicionLinea(quote, lineaId, { conceptoId, concepto: nombre }));
  };

  const handleQuitarLineaPlana = (lineaId: string) => {
    onUpdateQuote(quitarLinea(quote, lineaId));
  };

  const handleMoverLineaPlana = (lineaId: string, direccion: 'arriba' | 'abajo') => {
    const movidas = reordenarLinea(lineasPlanas, lineaId, direccion);
    onUpdateQuote(aplicarOrden(quote, movidas));
  };

  /**
   * C.4 · Agrega un concepto al servicio indicado.
   *
   * Con un solo servicio la tabla lo preselecciona sola; con varios, la línea
   * nace en el primero y su columna «Servicio» es el selector mientras esté
   * fresca. Nace sin nombre: el usuario elige del catálogo — poner «Nuevo
   * concepto» como texto invitaba a dejarlo así, que es como aparecen los
   * duplicados.
   */
  const handleAgregarLineaPlana = (servicioId: string) => {
    if (!servicioId) return;
    onUpdateQuote(agregarLinea(quote, { servicioId, concepto: '' }));
  };

  /** C.4 · Cambia el servicio de una línea fresca. La lib se niega si ya está fija. */
  const handleCambiarServicioDeLinea = (lineaId: string, servicioId: string) => {
    onUpdateQuote(moverLineaDeServicio(quote, lineaId, servicioId));
  };

  // ── Comparativa por servicio (MC-2/3/4) ────────────────────────────────
  const matrices = useMemo(
    () => matricesPorServicio(quote, agentesGuardados),
    [quote, agentesGuardados],
  );

  const servicioActivoId = servicioComparativa ?? quote.servicios?.[0]?.id ?? '';
  const matrizActiva = useMemo(
    () => matrices.find(m => m.servicioId === servicioActivoId) ?? matrices[0],
    [matrices, servicioActivoId],
  );

  /** M-2 · La selección derivada de los datos, nunca guardada aparte. */
  const seleccionActiva = useMemo(
    () => matrizActiva
      ? derivarSeleccion(matrizActiva.matriz, quote)
      : { porFila: {}, combinadas: [] },
    [matrizActiva, quote],
  );
  const dominanteActivo = useMemo(() => agenteDominante(seleccionActiva), [seleccionActiva]);
  const menoresActivos = useMemo(
    () => matrizActiva ? menorPorFila(matrizActiva.matriz) : {},
    [matrizActiva],
  );
  const resumenActivo = useMemo(
    () => matrizActiva
      ? resumenSeleccion(matrizActiva.matriz, seleccionActiva,
          quote.moneda === 'MXN' ? 'MXN' : 'USD', quote.tipoCambio)
      : null,
    [matrizActiva, seleccionActiva, quote.moneda, quote.tipoCambio],
  );

  /** Totales que respetan la moneda de cada celda (MO-1/MO-2). */
  const totalesConMoneda = useMemo(
    () => matrizActiva
      ? totalesComparables(matrizActiva.matriz, quote.moneda === 'MXN' ? 'MXN' : 'USD', quote.tipoCambio)
      : {},
    [matrizActiva, quote.moneda, quote.tipoCambio],
  );

  const comparacionMatriz = useMemo(
    () => compararColumnas(totalesConMoneda),
    [totalesConMoneda],
  );

  /** Escribe el precio de un concepto para un agente, con su moneda. */
  const handleEditarCelda = (
    filaId: string, agente: AgenteColumna, valor: number | null,
    moneda: MonedaCotizacion = 'USD',
  ) => {
    onUpdateQuote(escribirCelda(quote, filaId, agente, valor, moneda));
  };

  /** Cambia solo la moneda, conservando el monto. */
  const handleEditarMoneda = (filaId: string, agente: AgenteColumna, moneda: MonedaCotizacion) => {
    const fila = matrizActiva?.matriz.filas.find(f => f.id === filaId);
    const valor = fila?.celdas[agente.id];
    if (valor === null || valor === undefined) return;
    onUpdateQuote(escribirCelda(quote, filaId, agente, valor, moneda));
  };

  /** La vigencia es de la COLUMNA: se propaga a las tarifas de ese agente. */
  const handleEditarVigencia = (agenteId: string, vigencia: string | null) => {
    setAgentesGuardados(prev => {
      const copia = { ...prev };
      Object.keys(copia).forEach(srvId => {
        copia[srvId] = copia[srvId].map(a => a.id === agenteId ? { ...a, vigencia } : a);
      });
      return copia;
    });
    onUpdateQuote({
      ...quote,
      servicios: quote.servicios.map(srv => ({
        ...srv,
        conceptos: (srv.conceptos ?? []).map(c => ({
          ...c,
          tarifas: (c.tarifas ?? []).map(t =>
            claveAgente(t) === agenteId ? { ...t, vigencia: vigencia ?? undefined } : t),
        })),
      })),
    });
  };

  const handleAgregarAgente = (servicioId: string, agente: { proveedorId: string | null; nombre: string }) => {
    const id = agente.proveedorId ?? `nom:${agente.nombre.toLowerCase().trim()}`;
    setAgentesGuardados(prev => ({
      ...prev,
      [servicioId]: [
        ...(prev[servicioId] ?? []),
        { id, proveedorId: agente.proveedorId, nombre: agente.nombre, vigencia: null,
          orden: (prev[servicioId] ?? []).length + 100 },
      ],
    }));

    // Primer agente del servicio: precargar los conceptos de la plantilla.
    const servicio = quote.servicios.find(s => s.id === servicioId);
    const sinConceptos = (servicio?.conceptos ?? []).length === 0;
    if (sinConceptos) {
      const plantilla = servicio?.tipo === 'terrestre' ? 'terrestre'
        : servicio?.fcl_contenedor ? 'FCL' : 'default';
      let actualizada = quote;
      CONCEPTOS_POR_PLANTILLA[plantilla].forEach(cp => {
        actualizada = agregarLinea(actualizada, { servicioId, concepto: cp.etiqueta });
      });
      onUpdateQuote(actualizada);
    }
    setModalAgente(null);
  };

  const handleQuitarAgente = (agenteId: string) => {
    setAgentesGuardados(prev => {
      const copia = { ...prev };
      Object.keys(copia).forEach(k => { copia[k] = copia[k].filter(a => a.id !== agenteId); });
      return copia;
    });
    onUpdateQuote(quitarAgenteDeCotizacion(quote, agenteId));
  };

  /**
   * M-2 · Elegir YA es cargar: no hay paso intermedio.
   *
   * El clic en una celda elige (o des-elige) ese agente para esa fila y
   * escribe en concepto.tarifas al momento, igual que toda edición de la
   * tabla. El clic en el total elige la columna completa — el caso A — y
   * pregunta SOLO cuando pisa una selección ya hecha de otro agente: ahí sí
   * hay algo que perder.
   */
  const handleElegirCelda = (fila: FilaMatriz, agenteId: string) => {
    onUpdateQuote(elegirCelda(quote, fila.servicioId, fila.id, agenteId));
  };

  const handleElegirColumnaCompleta = (agenteId: string) => {
    if (!matrizActiva) return;
    const { matriz, servicioId } = matrizActiva;
    const nombre = matriz.agentes.find(a => a.id === agenteId)?.nombre ?? '';

    // ¿Pisa elecciones de OTROS agentes ya hechas en esta matriz?
    const sel = derivarSeleccion(matriz, quote);
    const pisadas = Object.values(sel.porFila).filter(a => a && a !== agenteId).length;
    const sinCotizar = conceptosSinCotizar(matriz, agenteId);

    const avisos = [
      pisadas > 0
        ? `${pisadas} fila${pisadas !== 1 ? 's' : ''} ya elegida${pisadas !== 1 ? 's' : ''} con otro proveedor se va${pisadas !== 1 ? 'n' : ''} a reemplazar.`
        : '',
      sinCotizar.length > 0
        ? `${nombre} no cotizó: ${sinCotizar.join(', ')}. Esos conceptos quedan sin elegir.`
        : '',
    ].filter(Boolean);

    if (avisos.length > 0 && !window.confirm(
      `Elegir a ${nombre} para todas las filas.\n\n${avisos.join('\n\n')}\n\n¿Continuar?`
    )) return;

    onUpdateQuote(elegirColumna(quote, servicioId, agenteId));
  };

  /**
   * Guarda las tarifas revisadas en el catálogo general (TA-5).
   *
   * Entran al catálogo GENERAL —una tarifa sirve para todas las cotizaciones—
   * pero se registra de qué documento salieron: es la vuelta completa de la
   * trazabilidad. Desde la tarifa se puede ver el PDF del proveedor.
   */
  const guardarTarifasExtraidas = async (
    lineasListas: import('../../lib/importacionTarifas').LineaEnRevision[],
    documento: import('../../lib/documentoTarifario').DocumentoTarifario,
    proveedorId: string,
  ) => {
    let creadas = 0;
    for (const l of lineasListas) {
      try {
        await createTarifa({
          id: `TAR-${Date.now()}-${creadas}`,
          tipo: 'estandar',
          conceptoId: l.conceptoId!,
          proveedorId,
          puertoOrigenId: l.puertoOrigenId,
          puertoDestinoId: l.puertoDestinoId,
          terminalId: null,
          rutaTexto: l.rutaTexto,
          precios: {
            monto: l.monto, unidad: l.unidad!,
            ...(l.montoPor40 ? { montoPor40: l.montoPor40 } : {}),
            ...(l.montoPor40HC ? { montoPor40HC: l.montoPor40HC } : {}),
            ...(l.montoMinimo ? { montoMinimo: l.montoMinimo } : {}),
          },
          moneda: l.moneda!,
          vigenciaTexto: '',
          fechaInicio: new Date().toISOString().slice(0, 10),
          fechaFin: null,
          tiempoTransitoDias: l.extraida.tiempoTransito ?? null,
          freeTimeDias: l.extraida.freeTime ?? null,
          condiciones: l.extraida.condiciones ?? '',
          activo: true,
          origenDatos: 'ocr',
          documentoOrigen: {
            path: documento.path,
            nombreArchivo: documento.nombreArchivo,
            importacionId: documento.id,
          },
          creadoPor: user?.uid ?? '',
          fechaAlta: new Date().toISOString().slice(0, 10),
          updatedAt: new Date().toISOString(),
        } as never);
        creadas++;
      } catch {
        // conAviso ya reportó; se sigue con las demás en vez de abortar todo.
      }
    }
    await registrarExtraccion(documento.id, documento.id, creadas);
    setToastLocal(`${creadas} tarifa${creadas !== 1 ? 's' : ''} guardada${creadas !== 1 ? 's' : ''} en el catálogo.`);
  };

  /**
   * Apunta el panel de tarifas a esa línea.
   *
   * Es la única forma de fijar `activeConcepto`, y de eso dependen «Usar», la
   * captura manual y el simulador del panel. Antes solo se llegaba aquí desde
   * el enlace «Elegir proveedor», que aparece cuando la línea NO tiene
   * proveedor: una línea ya resuelta quedaba fuera del alcance del panel.
   */
  const handleCompararProveedor = (lineaId: string) => {
    const linea = lineasPlanas.find(l => l.id === lineaId);
    if (!linea?.conceptoLocalId) return;
    handleConceptoActivate(linea.conceptoLocalId, linea.servicioId);
  };

  /*
   * Reparación de conceptos gemelos (4-sep-2026).
   *
   * Las cotizaciones guardadas antes de idUnico pueden traer dos conceptos con
   * el mismo id — editar uno editaba todos. Se separan al abrir la ficha, UNA
   * vez y avisando: renombrar ids en silencio es cómo se pierde la confianza.
   * Solo cuando la cotización es editable; una congelada se queda como está.
   */
  const reparacionHecha = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (rolActivo === 'ventas' || estaCongelada(quote)) return;
    if (reparacionHecha.current === quote.id) return;
    const { quote: reparada, reparados } = repararConceptosDuplicados(quote);
    if (reparados === 0) { reparacionHecha.current = quote.id; return; }
    reparacionHecha.current = quote.id;
    onUpdateQuote(reparada);
    setToastLocal(
      `Se separaron ${reparados} concepto(s) que compartían identidad interna. ` +
      'Antes, editar uno editaba los dos; ya son independientes.',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.id, quote.servicios]);

  /** Línea que corresponde al concepto activo, para resaltarla en la tabla. */
  const lineaActivaId = useMemo(() => {
    if (!activeConcepto) return null;
    return lineasPlanas.find(
      l => l.conceptoLocalId === activeConcepto.id && l.servicioId === activeConcepto.servicioId,
    )?.id ?? null;
  }, [activeConcepto, lineasPlanas]);

  const serviciosConProveedor = quote.servicios.filter(
    s => (s.cotizacionesProveedor ?? []).some(cp => cp.seleccionada)
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  /** Etapas a las que el rol activo puede transicionar desde la etapa actual. */
  const disponibles = transicionesDisponibles(quote.etapa, rolActivo, quote);

  /** Pre-TA: botón primario de avance (primera transición forward disponible). */
  const advanceTarget = (FORWARD_TARGETS[quote.etapa] ?? []).find(t => disponibles.includes(t)) ?? null;
  const advanceCfg = advanceTarget ? ADVANCE_CONFIG[advanceTarget] ?? null : null;

  /**
   * Matriz de botones (BC-2).
   *
   * Cada transición declara qué necesita la cotización para poder cumplir su
   * promesa. Si no la cumple, el botón NO se muestra y en su lugar se explica
   * qué falta — esconderlo sin más solo cambia «no aplica» por «no sé por qué
   * no puedo avanzar».
   */
  const CONDICION_AVANCE: Partial<Record<PipelineStageId, { ok: boolean; porque: string }>> = {
    // Una solicitud vacía no tiene nada que cotizar.
    solicitado_pricing:     { ok: prontitud.conConceptos, porque: 'Agrega al menos un concepto antes de enviarla a Pricing.' },
    // Registrar respuestas exige que haya alguna respuesta.
    cotizaciones_recibidas: { ok: prontitud.algunProveedor, porque: 'Ningún concepto tiene proveedor todavía.' },
    // Consolidar, enviar y ganar exigen la cotización completa.
    consolidada:            { ok: prontitud.lista, porque: '' },
    enviada_cliente:        { ok: prontitud.lista, porque: '' },
    ganada:                 { ok: prontitud.lista, porque: '' },
  };

  const condicionAvance = advanceTarget ? CONDICION_AVANCE[advanceTarget] : undefined;
  const puedeAvanzar = condicionAvance ? condicionAvance.ok : true;

  /** «Marcar ganada» como botón secundario obedece la misma condición. */
  const puedeMarcarGanada = disponibles.includes('ganada') && prontitud.lista;

  /**
   * El PDF es solo de Pricing y Admin —lleva los costos implícitos en los
   * montos y Ventas no ve costos— y solo con la cotización completa.
   *
   * Pero además está apagado por PDF_DISPONIBLE: hoy el generador no existe,
   * es un alert. Un botón deshabilitado seguiría prometiendo algo, así que no
   * se muestra hasta que funcione de verdad. Cuando el generador exista, se
   * cambia esa constante a true y las condiciones de rol y prontitud ya están
   * puestas.
   */
  const puedeGenerarPDF =
    PDF_DISPONIBLE &&
    rolActivo !== 'ventas' &&
    prontitud.lista &&
    ['consolidada', 'enviada_cliente', 'negociacion', 'ganada'].includes(quote.etapa);

  const inputCls ='w-full text-sm text-gray-700 bg-transparent hover:bg-gray-50 border border-transparent hover:border-gray-200 rounded-lg px-2.5 py-1.5 focus:bg-white focus:border-[#E11D48] outline-none transition-all';
  // Estilo atenuado/solo-lectura para campos del prospecto cuando hay cliente vinculado.
  const inputReadonlyCls = 'w-full text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none cursor-not-allowed';

  // Cliente vinculado (E6.4): fuente de verdad cuando clienteId existe en la colección.
  const clienteVinculado = quote.clienteId
    ? clientes.find(c => c.id === quote.clienteId) ?? null
    : null;

  // Sesión 30-ago-2026: Ventas ve la cotización y el margen, no el desglose
  // de costos ni los proveedores. Ver lib/visibilidadCotizacion.ts.
  const visible = visibilidadDe(rolActivo);
  const tabsPermitidas = tabsVisibles(rolActivo);

  const TODAS_LAS_TABS = [
    { id: 'info', label: 'Información' },
    { id: 'servicios', label: `Servicios (${quote.servicios.length})` },
    { id: 'actividades', label: 'Actividades' },
    { id: 'historial', label: 'Historial / Notas' },
    { id: 'chat', label: 'Chat Interno' }
  ] as const;

  const TABS = TODAS_LAS_TABS.filter(t => (tabsPermitidas as string[]).includes(t.id));

  const renderConsolidadoPanel = () => {
    if (totalConsolidado === 0) return null;

    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <h4 className="text-[10px] font-bold text-[#18181B] uppercase tracking-widest flex items-center gap-1.5">
            <BarChart2 className="w-4 h-4 text-[#E11D48]" /> Desglose del Consolidado
          </h4>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-2">
            {quote.servicios.filter(s => (s.cotizacionesProveedor ?? []).some(cp => cp.seleccionada)).map(srv => {
              const def = (servicios ?? []).find(s => s.id === srv.tipo);
              const prov = (srv.cotizacionesProveedor ?? []).find(cp => cp.seleccionada)!;
              const linea = calcLinea(prov.monto, srv.profit);
              return (
                <div key={srv.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 text-xs">
                  <div className="flex-1">
                    <span className="font-bold text-[#18181B]">{def?.nombre || srv.tipo}</span>
                    <span className="text-[10px] text-gray-400 ml-2">Prov: {prov.proveedor}</span>
                  </div>
                  <div className="flex gap-6 shrink-0 text-right">
                    <div className="w-20">
                      <p className="text-[9px] text-gray-400 uppercase">Costo Base</p>
                      <p className="font-semibold text-gray-700 tabular-nums">${prov.monto.toLocaleString()}</p>
                    </div>
                    {rolActivo !== 'ventas' && (
                      <>
                        <div className="w-16">
                          <p className="text-[9px] text-gray-400 uppercase">Profit $</p>
                          <p className="font-semibold text-gray-700 tabular-nums">${(srv.profit || 0).toLocaleString()}</p>
                        </div>
                        <div className="w-16">
                          <p className="text-[9px] text-gray-400 uppercase">Margen</p>
                          <p className="font-semibold text-gray-700 tabular-nums">{(linea.margen * 100).toFixed(1)}%</p>
                        </div>
                      </>
                    )}
                    <div className="w-24">
                      <p className="text-[9px] text-[#E11D48]/60 font-bold uppercase">Venta</p>
                      <p className="font-black text-[#9F1239] tabular-nums">${linea.venta.toLocaleString()} {prov.moneda}</p>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Trámites aduanales agregados al consolidado */}
            {quote.servicios.filter(s => s.subTramites && s.subTramites.length > 0).map(srv => (
              srv.subTramites!.map(tram => (
                <div key={tram.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 text-xs">
                  <div className="flex-1">
                    <span className="font-bold text-gray-600">↳ Sub-trámite: {tram.nombre}</span>
                    <span className="text-[10px] text-gray-400 ml-2">Prov: {tram.proveedor}</span>
                  </div>
                  <div className="flex gap-6 shrink-0 text-right">
                    <div className="w-20">
                      <p className="text-[9px] text-gray-400 uppercase">Costo Base</p>
                      <p className="font-semibold text-gray-700 tabular-nums">${tram.costo.toLocaleString()}</p>
                    </div>
                    {rolActivo !== 'ventas' && (
                      <>
                        <div className="w-16" />
                        <div className="w-16">
                          <p className="text-[9px] text-gray-400 uppercase">Margen</p>
                          <p className="font-semibold text-gray-700 tabular-nums">{tram.margenPct}%</p>
                        </div>
                      </>
                    )}
                    <div className="w-24">
                      <p className="text-[9px] text-[#E11D48]/60 font-bold uppercase">Venta</p>
                      <p className="font-black text-[#9F1239] tabular-nums">${(tram.costo * (1 + tram.margenPct / 100)).toLocaleString()} {tram.moneda}</p>
                    </div>
                  </div>
                </div>
              ))
            ))}
          </div>

          <div className="pt-4 border-t border-gray-200 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500 uppercase font-bold">Total Venta Consolidado</p>
              <p className="text-[9px] text-gray-400">
                Basado en {serviciosConProveedor.length} servicio{serviciosConProveedor.length !== 1 ? 's' : ''} con proveedor
              </p>
            </div>
            <p className="text-2xl font-black text-[#E11D48] tabular-nums">
              ${totalConsolidado.toLocaleString()} <span className="text-sm font-bold text-[#E11D48]/70">{quote.moneda}</span>
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <FichaLayout>
      {/* Anatomía compartida (ui/ficha/FichaLayout): esta ficha es la que la
          define, así que usarla aquí es lo que garantiza que las demás se vean
          igual y no al revés. */}
      <FichaHeader
        modulo="Cotizaciones"
        onBack={onBack}
        folio={quote.id}
        titulo={quote.prospecto.empresa}
        badges={
          <>
            <BadgeEstado tono={
              quote.etapa === 'ganada' ? 'exito'
              : quote.etapa === 'perdida' ? 'peligro'
              : 'activo'}
            >
              {lineaTiempoColapsada(rolActivo)
                ? (LINEA_TIEMPO_VENTAS[indicePasoVentas(quote.etapa)]?.label ?? quote.etapa)
                : PIPELINE_STAGES.find(s => s.id === quote.etapa)?.label}
            </BadgeEstado>
            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide border
              ${rolActivo === 'pricing'
                ? 'bg-[#1F2937]/5 text-[#1F2937] border-[#1F2937]/20'
                : 'bg-[#E11D48]/5 text-[#E11D48] border-[#E11D48]/20'}`}
            >
              Vista: {rolActivo === 'pricing' ? 'Pricing'
                : rolActivo === 'admin' ? 'Admin'
                : rolActivo === 'operaciones' ? 'Operaciones'
                : rolActivo === 'administracion' ? 'Administración'
                : 'Ventas'}
            </span>
          </>
        }
        subtitulo={totalEncabezado ? (
          <p className="font-black text-[#E11D48] tabular-nums">
            Total: {totalEncabezado}
          </p>
        ) : undefined}
      />

      {/* U-4/U-8 · De dónde vino y a dónde fue. Cada bloque aparece solo si
          hay algo que enlazar: una cotización sin ganar no tiene embarques, y
          una anterior a `prospectoId` no sabe de qué prospecto salió. Un
          rótulo con un hueco al lado no informa de nada. */}
      {(quote.prospectoId || (quote.embarqueIds?.length ?? 0) > 0) && (
        <div className="px-6 pt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
          {quote.prospectoId && (
            <BloqueEnlaces
              titulo="Prospecto de origen"
              tipo="prospecto"
              ids={[quote.prospectoId]}
              vacio=""
            />
          )}
          {(quote.embarqueIds?.length ?? 0) > 0 && (
            <BloqueEnlaces
              titulo="Embarques"
              tipo="embarque"
              ids={quote.embarqueIds ?? []}
              vacio=""
            />
          )}
        </div>
      )}

      <FichaTabs
        pestanas={TABS.map(t => ({ id: t.id, label: t.label }))}
        activa={activeTab}
        onCambiar={(id) => { setActiveTab(id); setShowLossReasonForm(false); }}
      />

      {/* ── Contenido: Servicios en UNA columna (4-sep-2026) ─────────────────
          El catálogo de tarifas deja el panel lateral y baja al final, a todo
          lo ancho: la tabla recupera el espacio donde se captura y se decide,
          y el orden vertical refleja cómo se trabaja — defines conceptos,
          comparas agentes, y las tarifas son el insumo de esa comparación.
          Es el orden del sistema de Luis. */}
      {activeTab === 'servicios' && visible.desglosePorConcepto && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* 1 · La tabla de conceptos, a todo el ancho. */}
            {/* ── C.4 · La tabla única (4-sep-2026) ────────────────────────
                Reemplaza a las cinco tarjetas por modalidad. Luis: «falta
                quitar los cuadros que teníamos, para que solo quedara 1». La
                modalidad sigue existiendo como dato en el servicio — de ahí
                leen la matriz y la generación de embarques — pero deja de ser
                el criterio de agrupación visual. */}
            {solicitudDeclarada.length > 0 && (
              <div className="border border-gray-200 bg-gray-50/60 rounded-xl px-4 py-2.5 space-y-1">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                  Lo que pidió el cliente
                </p>
                {solicitudDeclarada.map(d => (
                  <p key={d.id} className="text-[11px] text-gray-600 flex flex-wrap items-center gap-x-2">
                    <span className="font-bold text-gray-700">{d.etiqueta}:</span>
                    <span>{d.resumen}</span>
                    {d.ruta && <span className="text-gray-400">· {d.ruta}</span>}
                    {d.requeridos > 0 && (
                      <span className="text-gray-400">· {d.requeridos} concepto{d.requeridos !== 1 ? 's' : ''} señalado{d.requeridos !== 1 ? 's' : ''}</span>
                    )}
                  </p>
                ))}
              </div>
            )}

            <TablaConceptos
              lineas={lineasPlanas}
              servicios={serviciosDeLaTabla}
              editable={rolActivo !== 'ventas' && !estaCongelada(quote)}
              soloLectura={rolActivo === 'ventas'}
              lineaActivaId={lineaActivaId}
              conceptosActivos={conceptosActivos}
              onEditarLinea={handleEditarLineaPlana}
              onElegirConcepto={handleElegirConcepto}
              onQuitarLinea={handleQuitarLineaPlana}
              onMoverLinea={handleMoverLineaPlana}
              onAgregarLinea={handleAgregarLineaPlana}
              onCompararProveedor={handleCompararProveedor}
              onCambiarServicio={handleCambiarServicioDeLinea}
              onDatosEmbarque={(servicioId) => setDatosEmbarqueDe(servicioId)}
              onAgregarServicio={rolActivo !== 'ventas' && !estaCongelada(quote)
                ? () => setShowAddServicio(true)
                : undefined}
            />

            {/* El alta de servicio vive en el chip «+ Servicio» de la tabla.
                El formulario aparece aquí, pegado a ella, cuando se pide. */}
            {rolActivo !== 'ventas' && showAddServicio && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Nuevo Servicio</h4>
                <div className="flex gap-2">
                  <select
                    value={newServicioTipo}
                    onChange={(e) => setNewServicioTipo(e.target.value as TipoServicio)}
                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#E11D48]"
                  >
                    <option value="maritimo">Flete Marítimo</option>
                    <option value="aereo">Flete Aéreo</option>
                    <option value="terrestre">Flete Terrestre</option>
                    <option value="aduanal">Despacho Aduanal</option>
                  </select>
                  <button
                    onClick={handleAddServicio}
                    className="px-4 py-2 bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold uppercase rounded-lg transition-colors"
                  >
                    Agregar
                  </button>
                  <button
                    onClick={() => setShowAddServicio(false)}
                    className="px-3 py-2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* 2 · La comparativa de agentes, una por servicio. Pricing pide
                la misma ruta «a entre 7 y 10» proveedores, y un agente
                marítimo no compite contra un transportista terrestre. */}
            {matrizActiva && (
              <MatrizAgentes
                matriz={matrizActiva.matriz}
                titulo={matrizActiva.servicioTipo}
                servicios={matrices.map(m => ({ id: m.servicioId, etiqueta: m.servicioTipo }))}
                servicioActivoId={matrizActiva.servicioId}
                onCambiarServicio={setServicioComparativa}
                totalesComparables={totalesConMoneda}
                comparacion={comparacionMatriz}
                tipoCambio={
                  <CapturaTipoCambio
                    tipoCambio={quote.tipoCambio}
                    editable={rolActivo !== 'ventas' && !estaCongelada(quote)}
                    onCambiar={(tc) => onUpdateQuote({
                      ...quote,
                      ...(tc ? { tipoCambio: tc } : { tipoCambio: undefined }),
                    })}
                  />
                }
                editable={rolActivo !== 'ventas' && !estaCongelada(quote)}
                seleccion={seleccionActiva}
                dominante={dominanteActivo}
                menoresPorFila={menoresActivos}
                resumen={resumenActivo!}
                onElegirCelda={handleElegirCelda}
                onElegirAgente={handleElegirColumnaCompleta}
                onEditarCelda={handleEditarCelda}
                onEditarMoneda={handleEditarMoneda}
                onEditarVigencia={handleEditarVigencia}
                onEditarEtiqueta={(filaId, etiqueta) =>
                  onUpdateQuote(aplicarEdicionLinea(quote, filaId, { concepto: etiqueta }))}
                onQuitarAgente={handleQuitarAgente}
                onQuitarFila={(filaId) => onUpdateQuote(quitarLinea(quote, filaId))}
                onAgregarAgente={() => setModalAgente(matrizActiva.servicioId)}
                onAgregarFila={() => onUpdateQuote(
                  agregarLinea(quote, { servicioId: matrizActiva.servicioId, concepto: '' }))}
              />
            )}

            {/* 3 · El catálogo de tarifas: el insumo de la comparativa, a
                todo lo ancho y colapsable para que no estorbe cuando ya
                elegiste. «Usar» y el arrastre alimentan la matriz de arriba
                vía el concepto activo, igual que siempre. Ya no se oculta en
                móvil: abajo no le roba ancho a nadie. */}
            {rolActivo !== 'ventas' && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <button
                  onClick={() => setCatalogoAbierto(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60"
                >
                  <span className="flex items-center gap-2 text-[13px] font-bold text-[#18181B]">
                    Catálogo de tarifas
                    {activeConceptoData && (
                      <span className="text-[10px] font-semibold text-[#E11D48] uppercase tracking-wider">
                        → {activeConceptoData.concepto.nombre}
                      </span>
                    )}
                  </span>
                  {catalogoAbierto
                    ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                    : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                </button>
                {catalogoAbierto && (
                  <TarifaPanel
                    horizontal
                    conceptoNombre={activeConceptoData?.concepto.nombre ?? null}
                    conceptoId={activeConceptoData?.concepto.conceptoId}
                    contenedorTipo={activeConceptoData?.servicio.fcl_contenedor}
                    catalogoTarifas={catalogoTarifas}
                    tarifasYaUsadas={
                      activeConceptoData
                        ? (activeConceptoData.concepto.tarifas || []).map(t => t.tarifaOrigenId).filter((id): id is string => !!id)
                        : []
                    }
                    onUsarTarifa={handlePanelUsarTarifa}
                    onCaptura={handlePanelCaptura}
                    onCrearTarifaSpot={createTarifa}
                    costoBaseByMoneda={costoBaseByMoneda}
                    costoConceptoActualByMoneda={costoConceptoActualByMoneda}
                    onAplicarSimulacion={handlePanelAplicarSimulacion}
                  />
                )}
              </div>
            )}

            {/* Resumen financiero DENTRO de la ficha: «mientras cotizan no lo
                pueden ver, se tendrían que salir de lo que están haciendo». */}
            {lineasPlanas.length > 0 && (
              <ResumenFinancieroInline
                lineas={lineasPlanas}
                moneda={quote.moneda}
                diasCredito={clienteVinculado?.dias ?? 0}
              />
            )}

            {/* Evidencias: «¿de dónde saqué este costo?». Solo pricing/admin,
                porque son costos de proveedor. */}
            {visible.adjuntosTarifa && (
              <EvidenciasTarifas
                documentos={documentos}
                editable={rolActivo !== 'ventas' && !estaCongelada(quote)}
                subiendo={subiendoDoc}
                onCargarTarifario={() => setCargandoTarifario(true)}
                onSubir={(file) => {
                  subirDocumento(file, { procesarConIA: false, cotizacionId: quote.id })
                    .then(({ duplicadoDe }) => {
                      if (duplicadoDe) {
                        setToastLocal(
                          `Este archivo ya se había subido el ${duplicadoDe.fechaSubida.slice(0, 10)}` +
                          ` por ${duplicadoDe.subidoPorNombre}. Se guardó de todos modos.`,
                        );
                      }
                    })
                    .catch(err => setToastLocal(err instanceof Error ? err.message : String(err)));
                }}
              />
            )}

            {/* Total consolidado dentro de la tab */}
            {renderConsolidadoPanel()}
          </div>
        </div>

        {/* FC-3: DragOverlay — tarjeta flotante siguiendo el cursor */}
        <DragOverlay dropAnimation={null}>
          {activeDrag && (
            <div className="rounded-lg border border-[#E11D48]/30 bg-white p-2.5 text-[10px] shadow-xl w-[320px] pointer-events-none">
              <div className="font-bold text-gray-800 truncate">{activeDrag.provNombre}</div>
              <div className="font-black text-[#9F1239] tabular-nums mt-1">
                {fmtPrecio(activeDrag.tarifa)}
              </div>
              <p className="text-[9px] text-gray-400 mt-0.5">Suelta sobre un concepto para aplicar</p>
            </div>
          )}
        </DragOverlay>
        </DndContext>
      )}

      {/* ── Contenido: otros tabs (con scroll y padding) ────────────────────── */}
      {activeTab !== 'servicios' && (
      <div className="flex-1 overflow-y-auto p-6">

        {/* ────────────── Tab: Información ────────────── */}
        {activeTab === 'info' && lineaTiempoColapsada(rolActivo) && (
          <div className="mb-6 space-y-4">
            {/* Línea del tiempo de Ventas: cinco pasos. Las tres etapas
                internas de Pricing se colapsan en «En pricing» — a Ventas le
                importa que está con Pricing, no en cuál paso interno va. */}
            <LineaTiempo
              titulo="Avance de la cotización"
              pasos={LINEA_TIEMPO_VENTAS.map(p => ({ id: p.id, label: p.label }))}
              indiceActual={indicePasoVentas(quote.etapa)}
              fallido={quote.etapa === 'perdida'}
            />

            {/* Margen de la OPERACIÓN, sin desglose. Es lo único de rentabilidad
                que Ventas necesita: «que vean la coti y el margen. Eso es todo». */}
            {visible.margenGeneral && totalConsolidado > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Valor de la operación</p>
                  <p className="text-xl font-black text-[#18181B] tabular-nums mt-0.5">
                    {totalEncabezado ?? '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Margen de la operación</p>
                  <p className="text-xl font-black text-emerald-600 tabular-nums mt-0.5">
                    {(margenGeneralOperacion * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'info' && (
          <div className="max-w-3xl mx-auto space-y-6">

            {/* Etapa del Pipeline */}
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
              <label className="block text-[10px] font-bold text-[#18181B] uppercase tracking-wider">
                Etapa del Pipeline
              </label>
              <select
                value={quote.etapa}
                onChange={e => {
                  const val = e.target.value as PipelineStageId;
                  if (val === 'perdida') setShowLossReasonForm(true);
                  else handleStageChange(val);
                }}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 outline-none focus:border-[#E11D48] shadow-xs"
              >
                {/* Siempre muestra la etapa actual + solo las transiciones permitidas */}
                {PIPELINE_STAGES
                  .filter(s => s.id === quote.etapa || disponibles.includes(s.id))
                  .map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>

              {quote.etapa === 'perdida' && quote.motivoPerdida && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-2.5 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div><span className="font-bold">Motivo de pérdida:</span> {quote.motivoPerdida}</div>
                </div>
              )}

              {showLossReasonForm && (
                <form onSubmit={handleMarkLost} className="space-y-2 pt-2 border-t border-gray-100">
                  <label className="block text-xs font-semibold text-red-700">Explica el motivo de pérdida:</label>
                  <input
                    type="text" required
                    placeholder="Ej. Precio muy alto, competencia, cobertura..."
                    value={lossReason}
                    onChange={e => setLossReason(e.target.value)}
                    className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm outline-none focus:border-red-500"
                  />
                  <div className="flex justify-end gap-2 text-xs font-bold uppercase">
                    <button type="button" onClick={() => setShowLossReasonForm(false)} className="px-3 py-1.5 text-gray-500">Cancelar</button>
                    <button type="submit" className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg">Marcar Perdida</button>
                  </div>
                </form>
              )}
            </div>

            {/* Prospecto */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-bold text-[#E11D48] uppercase tracking-widest border-b border-gray-100 pb-2 flex items-center gap-1.5">
                <User className="w-4 h-4" /> Prospecto / Cliente
              </h3>

              {/* ── Capa de vínculo a Cliente (E6.4) ────────────────────────── */}
              {(() => {
                if (clienteVinculado) {
                  const creditoLabel = clienteVinculado.tipoCredito === 'credito'
                    ? `Crédito ${clienteVinculado.dias} días`
                    : 'Contado';
                  return (
                    <div className="flex items-start justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-bold text-gray-800 truncate">{clienteVinculado.nombre}</span>
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-emerald-600 text-white tracking-wider">Cliente</span>
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-white border border-emerald-300 text-emerald-700 tracking-wider">{creditoLabel}</span>
                          </div>
                          {clienteVinculado.rfc && (
                            <div className="text-[10px] text-gray-500 font-mono mt-0.5">RFC {clienteVinculado.rfc}</div>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleDesvincularCliente}
                        className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-gray-400 hover:text-red-600 flex items-center gap-1"
                      >
                        <X className="w-3 h-3" /> Desvincular
                      </button>
                    </div>
                  );
                }

                // Sin vínculo: buscador por nombre / RFC sobre useClientes().
                const q = clienteQuery.trim().toLowerCase();
                const resultados = q
                  ? clientes
                      .filter(c => c.nombre.toLowerCase().includes(q) || c.rfc.toLowerCase().includes(q))
                      .slice(0, 6)
                  : [];
                return (
                  <div className="relative">
                    <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg focus-within:border-[#E11D48]">
                      <Link2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <Search className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                      <input
                        type="text"
                        value={clienteQuery}
                        onChange={e => setClienteQuery(e.target.value)}
                        placeholder="Vincular cliente — buscar por nombre o RFC…"
                        className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
                      />
                    </div>
                    {q && (
                      <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                        {resultados.length === 0 ? (
                          <div className="px-3 py-2.5 text-xs text-gray-400">Sin clientes que coincidan con "{clienteQuery}".</div>
                        ) : (
                          resultados.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => handleVincularCliente(c.id)}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                            >
                              <div className="text-sm font-semibold text-gray-800 truncate">{c.nombre}</div>
                              <div className="text-[10px] text-gray-400 font-mono">
                                {c.rfc || 'Sin RFC'} · {c.tipoCredito === 'credito' ? `Crédito ${c.dias} días` : 'Contado'}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {clienteVinculado && (
                <p className="text-[9px] text-gray-400 italic -mb-1">
                  Datos del cliente vinculado — edítalos en la ficha del Cliente.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Razón Social</label>
                  <input type="text"
                    value={clienteVinculado ? clienteVinculado.nombre : quote.prospecto.empresa}
                    onChange={e => handleFieldChange('prospecto', 'empresa', e.target.value)}
                    readOnly={!!clienteVinculado}
                    className={clienteVinculado ? inputReadonlyCls : inputCls} />
                </div>
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Contacto</label>
                  <input type="text"
                    value={clienteVinculado ? clienteVinculado.representante : quote.prospecto.contacto}
                    onChange={e => handleFieldChange('prospecto', 'contacto', e.target.value)}
                    readOnly={!!clienteVinculado}
                    className={clienteVinculado ? inputReadonlyCls : inputCls} />
                </div>
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Origen del lead</label>
                  <select value={quote.prospecto.origen}
                    onChange={e => handleFieldChange('prospecto', 'origen', e.target.value)}
                    className={inputCls}>
                    {Object.entries(ORIGENES_PROSPECTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Teléfono</label>
                  <input type="text"
                    value={clienteVinculado ? clienteVinculado.telefono : quote.prospecto.telefono}
                    onChange={e => handleFieldChange('prospecto', 'telefono', e.target.value)}
                    readOnly={!!clienteVinculado}
                    className={clienteVinculado ? inputReadonlyCls : inputCls} />
                </div>
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Email</label>
                  <input type="email"
                    value={clienteVinculado ? clienteVinculado.correo : quote.prospecto.email}
                    onChange={e => handleFieldChange('prospecto', 'email', e.target.value)}
                    readOnly={!!clienteVinculado}
                    className={clienteVinculado ? inputReadonlyCls : inputCls} />
                </div>
              </div>
            </div>

            {/* Responsables */}
            <div className="space-y-3">
              <h3 className="text-[10px] font-bold text-[#E11D48] uppercase tracking-widest border-b border-gray-100 pb-2 flex items-center gap-1.5">
                <User className="w-4 h-4" /> Responsables
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Vendedor (Ventas)</label>
                  <select value={quote.vendedorId}
                    onChange={e => handleFieldChange('general', 'vendedorId', e.target.value)}
                    className={inputCls}>
                    {VENDEDORES.map(v => <option key={v.id} value={v.nombre}>{v.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Responsable Pricing</label>
                  <select value={quote.pricingId ?? ''}
                    onChange={e => handleFieldChange('general', 'pricingId', e.target.value || null)}
                    className={inputCls}>
                    <option value="">Sin asignar</option>
                    {EQUIPO_PRICING.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Total consolidado */}
            {renderConsolidadoPanel()}
          </div>
        )}

        {/* ────────────── Tab: Actividades ────────────── */}
        {activeTab === 'actividades' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <form onSubmit={handleAddActivity} className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
              <h4 className="text-[10px] font-bold text-[#18181B] uppercase tracking-wider">Registrar actividad</h4>
              <input
                type="text" required
                placeholder="¿Qué hay que hacer?"
                value={newActivityTitle}
                onChange={e => setNewActivityTitle(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-[#E11D48] shadow-xs"
              />
              <textarea
                placeholder="Descripción detallada..."
                value={newActivityDesc}
                onChange={e => setNewActivityDesc(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-[#E11D48] shadow-xs resize-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Fecha límite</label>
                  <input type="date" value={newActivityDate} onChange={e => setNewActivityDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-[#E11D48]" />
                </div>
                <div>
                  <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Tipo</label>
                  <select value={newActivityType} onChange={e => setNewActivityType(e.target.value as QuoteActivity['tipo'])}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-[#E11D48]">
                    <option value="tarea">Tarea</option>
                    <option value="llamada">Llamada</option>
                    <option value="correo">Correo</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit"
                  className="px-4 py-2 bg-[#E11D48] hover:bg-[#BE123C] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center shadow-xs">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Registrar
                </button>
              </div>
            </form>

            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-[#18181B] uppercase tracking-wider border-b border-gray-150 pb-2">
                Lista de Actividades
              </h4>
              {filterTasks.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-4 text-center">Sin actividades registradas.</p>
              ) : (
                <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden bg-white shadow-xs">
                  {filterTasks.map(act => {
                    const isOverdue = act.estado === 'pendiente' && isActivityOverdue(act.fechaLimite);
                    return (
                      <div key={act.id} className="p-4 flex items-start gap-3 hover:bg-gray-50/50 transition-colors">
                        <input
                          type="checkbox"
                          checked={act.estado === 'hecha'}
                          onChange={() => handleToggleActivity(act.id)}
                          className="w-4 h-4 text-[#E11D48] border-gray-300 rounded mt-0.5 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded
                              ${act.tipo === 'llamada' ? 'bg-amber-100 text-amber-800' :
                                act.tipo === 'correo' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                              {act.tipo}
                            </span>
                            <span className={`text-xs tabular-nums font-semibold ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                              Límite: {act.fechaLimite}{isOverdue ? ' (Vencida)' : ''}
                            </span>
                          </div>
                          <h5 className={`text-sm font-semibold mt-1 ${act.estado === 'hecha' ? 'line-through text-gray-400' : 'text-[#18181B]'}`}>
                            {act.titulo}
                          </h5>
                          {act.descripcion && (
                            <p className={`text-xs mt-1 ${act.estado === 'hecha' ? 'text-gray-300' : 'text-gray-500'}`}>
                              {act.descripcion}
                            </p>
                          )}
                        </div>
                        <button onClick={() => handleDeleteActivity(act.id)}
                          className="text-gray-300 hover:text-red-500 p-1.5 rounded transition-colors shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ────────────── Tab: Historial ────────────── */}
        {activeTab === 'historial' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <form onSubmit={handleAddNote} className="space-y-2">
              <textarea
                required
                placeholder="Agregar una anotación comercial..."
                value={newNoteText}
                onChange={e => setNewNoteText(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-[#E11D48] shadow-xs resize-none"
              />
              <div className="flex justify-end">
                <button type="submit"
                  className="px-4 py-2 bg-[#4B2A8C] hover:bg-[#3d2277] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center shadow-xs">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Agregar nota
                </button>
              </div>
            </form>

            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-[#18181B] uppercase tracking-wider border-b border-gray-150 pb-2">Línea de Tiempo</h4>
              <div className="relative pl-6 border-l-2 border-gray-100 space-y-6">
                {[
                  ...quote.historialEtapas.map(h => ({
                    type: 'etapa' as const,
                    date: h.fecha,
                    title: `Etapa: ${PIPELINE_STAGES.find(s => s.id === h.etapa)?.label ?? h.etapa}`,
                    desc: h.nota ?? 'Cambio registrado en pipeline.',
                  })),
                  ...filterNotes.map(n => ({
                    type: n.tipo,
                    date: n.createdAt,
                    title: 'Nota registrada',
                    desc: n.descripcion,
                    id: n.id,
                    autor: n.responsableId
                  })),
                ]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((item, idx) => (
                    <div key={idx} className="relative">
                      <div className={`absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full border-2 bg-white flex items-center justify-center
                        ${item.type === 'etapa' ? 'border-[#4B2A8C]' : 'border-[#E11D48]'}`}>
                        {item.type === 'etapa'
                          ? <Clock className="w-1.5 h-1.5 text-[#4B2A8C]" />
                          : <MessageSquare className="w-1.5 h-1.5 text-[#E11D48]" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#18181B]">
                            {item.title} {item.autor ? `por ${item.autor}` : ''}
                          </span>
                          <span className="text-[9px] text-gray-400 font-semibold tabular-nums">{item.date}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed whitespace-pre-line">{item.desc}</p>

                        {item.type === 'nota' && (
                          <div className="mt-3">
                            {quote.actividades.filter(a => a.parentId === item.id).map(reply => (
                              <div key={reply.id} className="ml-4 pl-3 border-l-2 border-gray-200 mt-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-[#18181B]">{reply.responsableId}</span>
                                  <span className="text-[9px] text-gray-400 tabular-nums">{reply.createdAt}</span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">{reply.descripcion}</p>
                              </div>
                            ))}

                            {replyingTo === item.id ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  if(!replyText.trim()) return;
                                  const nuevaRespuesta = {
                                    id: `rep-${Date.now()}`,
                                    titulo: 'Respuesta',
                                    descripcion: replyText,
                                    responsableId: rolActivo,
                                    fechaLimite: '',
                                    estado: 'hecha' as const,
                                    tipo: 'nota' as const,
                                    createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
                                    parentId: item.id
                                  };
                                  onUpdateQuote({ ...quote, actividades: [...quote.actividades, nuevaRespuesta] });
                                  setReplyingTo(null);
                                  setReplyText('');
                                }}
                                className="mt-3 flex items-start gap-2 ml-4"
                              >
                                <textarea
                                  value={replyText}
                                  onChange={e => setReplyText(e.target.value)}
                                  placeholder="Escribe una respuesta..."
                                  rows={1}
                                  autoFocus
                                  className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-[#E11D48] resize-none"
                                />
                                <div className="flex flex-col gap-1">
                                  <button type="submit" className="px-2 py-1 bg-[#4B2A8C] text-white text-[10px] rounded hover:bg-[#3d2277] transition-colors font-bold">Enviar</button>
                                  <button type="button" onClick={() => {setReplyingTo(null); setReplyText('');}} className="px-2 py-1 bg-gray-200 text-gray-600 text-[10px] rounded hover:bg-gray-300 transition-colors font-bold">Cancelar</button>
                                </div>
                              </form>
                            ) : (
                              <button
                                onClick={() => setReplyingTo(item.id || null)}
                                className="mt-2 ml-4 text-[10px] font-bold text-[#E11D48] hover:text-[#BE123C] uppercase tracking-wider"
                              >
                                Responder
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ────────────── Tab: Chat Interno ────────────── */}
        {activeTab === 'chat' && (
          <div className="max-w-3xl mx-auto flex flex-col h-full space-y-4">
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 min-h-[300px] border border-gray-100 bg-gray-50/30 rounded-xl p-4">
              {quote.chat.length === 0 ? (
                <div className="text-center text-gray-400 text-xs py-8">
                  No hay mensajes en este chat todavía.
                </div>
              ) : (
                quote.chat.map(msg => {
                  const isVentas = msg.rol === 'ventas';
                  return (
                    <div key={msg.id} className={`flex flex-col ${isVentas ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[80%] rounded-xl px-4 py-2 ${
                        isVentas ? 'bg-[#E11D48] text-white rounded-br-none' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
                      }`}>
                        <div className="flex justify-between items-baseline gap-4 mb-1">
                          <span className={`text-[10px] font-bold ${isVentas ? 'text-rose-100' : 'text-[#4B2A8C]'}`}>{msg.autorNombre}</span>
                          <span className={`text-[9px] ${isVentas ? 'text-rose-200' : 'text-gray-400'} tabular-nums`}>{msg.timestamp.split(' ')[1]}</span>
                        </div>
                        <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.texto}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if(!newChatMessage.trim()) return;
                const timestampStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
                const newMessage = {
                  id: `msg-${Date.now()}`,
                  autorId: user?.uid || rolActivo,
                  autorNombre: user?.nombre || (rolActivo === 'ventas' ? 'Vendedor' : rolActivo === 'pricing' ? 'Pricing' : 'Admin'),
                  rol: rolActivo,
                  texto: newChatMessage,
                  timestamp: timestampStr
                };

                // Generar notificaciones para los involucrados
                const involucrados = new Set<string>();
                // 1. Dueño de la cotización
                if (quote.vendedorId && quote.vendedorId !== (user?.uid || rolActivo)) {
                  involucrados.add(quote.vendedorId);
                }
                // 2. Administradores (opcional, o Pricing si no está explícito)
                if (rolActivo !== 'pricing' && rolActivo !== 'admin') {
                   involucrados.add('pricing');
                }
                if (rolActivo !== 'admin') {
                   involucrados.add('admin');
                }
                // 3. Otros participantes del chat
                quote.chat.forEach(msg => {
                  if (msg.autorId && msg.autorId !== (user?.uid || rolActivo)) {
                     involucrados.add(msg.autorId);
                  }
                });

                involucrados.forEach(destId => {
                  agregarNotificacion({
                    id: `notif-${Date.now()}-${Math.random().toString(36).substring(2,7)}`,
                    tipo: 'chat',
                    cotizacionId: quote.id,
                    cotizacionFolio: quote.folio,
                    destinatarios: [],
                    destinatarioId: destId,
                    remitenteNombre: newMessage.autorNombre,
                    preview: newMessage.texto.length > 60 ? newMessage.texto.substring(0, 60) + '...' : newMessage.texto,
                    leida: false,
                    timestamp: new Date().toISOString()
                  });
                });

                onUpdateQuote({ ...quote, chat: [...quote.chat, newMessage] });
                setNewChatMessage('');
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                placeholder="Escribe un mensaje..."
                value={newChatMessage}
                onChange={e => setNewChatMessage(e.target.value)}
                className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:border-[#E11D48] shadow-sm"
              />
              <button type="submit" className="p-2.5 bg-[#E11D48] text-white rounded-xl hover:bg-[#BE123C] transition-colors shadow-sm flex items-center justify-center shrink-0">
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </form>
          </div>
        )}

      </div>
      )}

      {/* ── Footer de acciones (Pre-TA: jerarquía corregida) ─────────────────── */}
      <FichaFooter>

        {/* ── Primario: avanzar etapa (dinámico según etapa + rol) ── */}
        {advanceCfg && advanceTarget && puedeAvanzar && (
          <button
            onClick={() => {
              if (advanceTarget === 'ganada') {
                if (confirm(`¿Marcar ${quote.id} como GANADA?\n\nSe generará el embarque en automático con los conceptos a cobrar y a pagar, y la cotización quedará congelada.`)) {
                  handleStageChange('ganada');
                }
              } else {
                handleStageChange(advanceTarget);
              }
            }}
            className={`w-full max-w-3xl mx-auto px-4 py-3 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs ${advanceCfg.cls}`}
          >
            {advanceTarget === 'ganada'
              ? <CheckCircle2 className="w-4 h-4" />
              : <Send className="w-4 h-4" />}
            {advanceCfg.label}
          </button>
        )}

        {/* En lugar del botón, qué falta. La diferencia entre «no puedo
            avanzar» y «no sé por qué no puedo avanzar». */}
        {advanceCfg && !puedeAvanzar && (
          <BloqueFaltantes
            prontitud={prontitud}
            porque={condicionAvance?.porque ?? ''}
            accion={advanceCfg.label}
          />
        )}

        {/* ── Ganada (cuando disponible pero NO es el botón primario) ──
            Exige la cotización completa: de esta transición nace el embarque
            heredando los cargos. Si falta un costo, el embarque nace mal y
            nadie se entera hasta pagarle al proveedor. */}
        {puedeMarcarGanada && advanceTarget !== 'ganada' && (
          <button
            onClick={() => {
              if (confirm(`¿Marcar ${quote.id} como GANADA?\n\nSe generará el embarque en automático con los conceptos a cobrar y a pagar, y la cotización quedará congelada.`)) {
                handleStageChange('ganada');
              }
            }}
            className="w-full max-w-3xl mx-auto px-4 py-3 bg-green-600 hover:bg-green-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs"
          >
            <CheckCircle2 className="w-4 h-4" /> Marcar ganada
          </button>
        )}

        {/* ── Secundarios: PDF + Perdida ── */}
        <div className="flex gap-3 max-w-3xl mx-auto w-full">
          {/* Solo Pricing y Admin: un PDF lleva los costos implícitos en los
              montos, y Ventas no ve costos (§ bloque 2). Y solo cuando la
              cotización está completa: un PDF a medias es un documento que
              sale al cliente con huecos.
              ⚠️ PENDIENTE REAL: hoy este botón es un stub. Condicionarlo lo
              esconde, pero el PDF sigue sin construirse. */}
          {puedeGenerarPDF && (
            <button
              onClick={() => alert('Generando PDF de la cotización consolidada...')}
              className="flex-1 px-4 py-2.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <FileText className="w-3.5 h-3.5 text-gray-400" /> Generar PDF
            </button>
          )}

          {disponibles.includes('perdida') && !showLossReasonForm && (
            <button
              onClick={() => setShowLossReasonForm(true)}
              className="flex-1 px-4 py-2.5 border border-red-200 bg-white hover:bg-red-50 text-red-500 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              Marcar perdida
            </button>
          )}
        </div>

        {/* ── Indicador de auto-guardado ── */}
        <div className="flex items-center justify-center gap-1.5 pt-1">
          <CheckCircle2 className="w-3 h-3 text-green-500" />
          <span className="text-[10px] text-gray-400">Guardado automáticamente</span>
        </div>
      </FichaFooter>

      {/* ═══ Modales ═══════════════════════════════════════════════════════
          Estaban declarados como estado pero nunca se renderizaban: los
          botones que los abren no hacían nada. */}

      {/* Elegir el proveedor que entra como columna de la comparativa. */}
      {modalAgente && (
        <ModalAgregarAgente
          proveedores={proveedores}
          modalidadRelevante={quote.servicios.find(sv => sv.id === modalAgente)?.tipo}
          yaEnMatriz={(matrizActiva?.matriz.agentes ?? [])
            .map(a => a.proveedorId).filter(Boolean) as string[]}
          onCerrar={() => setModalAgente(null)}
          onAgregar={(agente) => handleAgregarAgente(modalAgente, agente)}
        />
      )}

      {/* Carga de tarifario: el MISMO componente que en el módulo de Tarifas. */}
      {cargandoTarifario && (
        <CargarTarifario
          cotizacionId={quote.id}
          onCerrar={() => setCargandoTarifario(false)}
          onGuardadas={(n) => setToastLocal(
            `${n} tarifa${n !== 1 ? 's' : ''} agregada${n !== 1 ? 's' : ''} al catálogo.`)}
        />
      )}

      {/* Revisión de lo que extrajo la IA. Nada se guarda sin pasar por aquí. */}
      {extraccionPendiente && (
        <RevisionTarifasExtraidas
          respuestaCruda={extraccionPendiente.respuesta}
          nombreArchivo={extraccionPendiente.documento.nombreArchivo}
          conceptos={conceptosActivos}
          puertos={puertos.map(p => ({ id: p.id, nombre: p.nombre, codigo: p.codigo }))}
          proveedores={proveedores}
          onCancelar={() => setExtraccionPendiente(null)}
          onGuardar={async (lineasListas, proveedorId) => {
            await guardarTarifasExtraidas(lineasListas, extraccionPendiente.documento, proveedorId);
            setExtraccionPendiente(null);
          }}
        />
      )}

      {/* Datos que el embarque necesita —tráfico, ruta, FCL/LCL— y que la
          tabla no cubre. Los conceptos se agregan SOLO en la tabla. */}
      {datosEmbarqueDe && (() => {
        const srv = quote.servicios.find(sv => sv.id === datosEmbarqueDe);
        if (!srv) return null;
        return (
          <div
            className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4"
            onClick={() => setDatosEmbarqueDe(null)}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-gray-150 flex items-center justify-between bg-gray-50/50 sticky top-0 z-10">
                <div>
                  <h3 className="text-[14px] font-bold text-[#18181B]">Datos del embarque</h3>
                  <p className="text-[11px] text-gray-400 capitalize">{srv.tipo}</p>
                </div>
                <button onClick={() => setDatosEmbarqueDe(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4">
                <ServicioSection
                  soloDatosOperacion
                  servicio={srv}
                  rolActivo={rolActivo}
                  onUpdateServicio={updated => handleUpdateServicio(srv.id, updated)}
                  servicios={servicios}
                  renderIcon={renderIcon}
                  moneda={quote.moneda}
                  diasCredito={clienteVinculado?.dias ?? 30}
                  catalogoTarifas={catalogoTarifas}
                  onCrearTarifaSpot={createTarifa}
                  panelVisible={false}
                  onComparativaToggle={handleComparativaToggle}
                  conceptosActivos={conceptosActivos}
                />
              </div>
            </div>
          </div>
        );
      })()}

      <Toast mensaje={toastLocal} tipo="exito" onClose={() => setToastLocal(null)} />
    </FichaLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bloque que ocupa el lugar del botón ausente.
//
// Esconder un botón que no aplica resuelve la mitad del problema; la otra
// mitad es que el usuario sepa por qué. Sin esto, «no aplica» se convierte en
// «no sé por qué no puedo avanzar», que genera el mismo estrés.
// ─────────────────────────────────────────────────────────────────────────────
function BloqueFaltantes({
  prontitud, porque, accion,
}: {
  prontitud: ReturnType<typeof evaluarProntitud>;
  porque: string;
  accion: string;
}) {
  const grupos = faltantesPorLinea(prontitud);
  const resumen = resumenFaltantes(prontitud);

  return (
    <div className="w-full max-w-3xl mx-auto rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
      <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
        {resumen || porque || `Falta información para «${accion}»`}
      </p>

      {porque && grupos.length === 0 && (
        <p className="text-[12px] text-amber-700 mt-1">{porque}</p>
      )}

      {grupos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {grupos.slice(0, 6).map(g => (
            <li key={g.lineaId} className="text-[12px] text-amber-800 flex items-baseline gap-1.5">
              <span className="text-amber-400">·</span>
              <span className="font-medium">{g.concepto}</span>
              <span className="text-amber-600">— {textoFaltantesLinea(g.tipos)}</span>
            </li>
          ))}
          {grupos.length > 6 && (
            <li className="text-[11px] text-amber-600 pl-3">
              y {grupos.length - 6} concepto{grupos.length - 6 !== 1 ? 's' : ''} más
            </li>
          )}
        </ul>
      )}

      <p className="text-[10px] text-amber-600 mt-2">
        «{accion}» aparecerá cuando esté completo.
      </p>
    </div>
  );
}
