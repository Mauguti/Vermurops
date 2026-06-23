import React, { useState } from 'react';
import {
  Search, Plus, X, Plane, Ship, Truck, ShieldCheck, Calendar, ArrowRight, HelpCircle,
} from 'lucide-react';
import {
  KanbanQuote, PIPELINE_STAGES, ORIGENES_PROSPECTO, QuoteActivity, TipoServicio,
  TIPOS_SERVICIO, VENDEDORES, EQUIPO_PRICING, calcularTotalConsolidado, PipelineStageId,
} from './QuotesData';
import FichaCotizacion from './FichaCotizacion';
import { useNotifications } from '../../notifications/NotificationsContext';
import { crearNotificacionEtapa } from '../../notifications/notificationsStore';

interface KanbanCotizacionesProps {
  quotes: KanbanQuote[];
  onUpdateQuotes: (quotes: KanbanQuote[]) => void;
  onConvertToShipment: (quote: KanbanQuote) => void;
  /** Rol activo del usuario simulado */
  rolActivo: 'ventas' | 'pricing' | 'admin';
}

// ─── Icono por tipo de servicio ───────────────────────────────────────────────

function ServiceIcon({ tipo, size = 'sm' }: { tipo: TipoServicio; size?: 'sm' | 'xs' }) {
  const cls = size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  switch (tipo) {
    case 'aereo':     return <Plane className={cls} />;
    case 'maritimo':  return <Ship className={cls} />;
    case 'terrestre': return <Truck className={cls} />;
    case 'aduanal':   return <ShieldCheck className={cls} />;
    default:          return <HelpCircle className={cls} />;
  }
}

// ─── Chip de servicio ─────────────────────────────────────────────────────────

function ServiceChip({ tipo }: { key?: React.Key; tipo: TipoServicio }) {
  const meta = TIPOS_SERVICIO[tipo] || { label: tipo, color: 'bg-gray-100 text-gray-700', icon: 'help-circle' };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${meta.color}`}>
      <ServiceIcon tipo={tipo} size="xs" />
      {meta.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function KanbanCotizaciones({
  quotes,
  onUpdateQuotes,
  onConvertToShipment,
  rolActivo,
}: KanbanCotizacionesProps) {
  const { agregarNotificacion } = useNotifications();
  const [selectedQuote, setSelectedQuote] = useState<KanbanQuote | null>(null);

  // Búsqueda y filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filterVendedor, setFilterVendedor] = useState('Todos');
  const [filterServicio, setFilterServicio] = useState<TipoServicio | 'Todos'>('Todos');
  const [filterOrigen, setFilterOrigen] = useState('Todos');

  // Quick Add Form
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [qaEmpresa, setQaEmpresa] = useState('');
  const [qaContacto, setQaContacto] = useState('');
  const [qaOrigen, setQaOrigen] = useState<KanbanQuote['prospecto']['origen']>('web');
  const [qaServicios, setQaServicios] = useState<TipoServicio[]>(['maritimo']);
  const [qaVendedor, setQaVendedor] = useState(VENDEDORES[0].nombre);

  // Drag & Drop
  const [draggedOverColumn, setDraggedOverColumn] = useState<string | null>(null);

  // ─── Filtrado ─────────────────────────────────────────────────────────────

  const filteredQuotes = quotes.filter(q => {
    const matchSearch =
      q.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.prospecto.empresa.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.prospecto.contacto.toLowerCase().includes(searchTerm.toLowerCase());

    const matchVendedor = filterVendedor === 'Todos' || q.vendedorId === filterVendedor;
    const matchServicio =
      filterServicio === 'Todos' || q.servicios.some(s => s.tipo === filterServicio);
    const matchOrigen = filterOrigen === 'Todos' || q.prospecto.origen === filterOrigen;

    return matchSearch && matchVendedor && matchServicio && matchOrigen;
  });

  // ─── Drag & Drop handlers ──────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, quoteId: string) => {
    e.dataTransfer.setData('text/plain', quoteId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    if (draggedOverColumn !== stageId) setDraggedOverColumn(stageId);
  };

  const handleDragLeave = () => setDraggedOverColumn(null);

  const handleDrop = (e: React.DragEvent, targetStage: PipelineStageId) => {
    e.preventDefault();
    setDraggedOverColumn(null);
    const quoteId = e.dataTransfer.getData('text/plain');
    if (!quoteId) return;
    const quoteToMove = quotes.find(q => q.id === quoteId);
    if (!quoteToMove || quoteToMove.etapa === targetStage) return;
    updateQuoteStage(quoteId, targetStage);
  };

  const updateQuoteStage = (quoteId: string, newEtapa: PipelineStageId) => {
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');
    let notifPayload: ReturnType<typeof crearNotificacionEtapa> = null;

    const updatedQuotes = quotes.map(q => {
      if (q.id !== quoteId) return q;
      const prevLabel = PIPELINE_STAGES.find(s => s.id === q.etapa)?.label ?? q.etapa;
      const newLabel  = PIPELINE_STAGES.find(s => s.id === newEtapa)?.label ?? newEtapa;

      // Generar notificación (capturar antes de actualizar)
      notifPayload = crearNotificacionEtapa(
        q.id,
        q.prospecto.empresa,
        q.etapa,
        newEtapa,
        prevLabel,
        newLabel,
      );

      const newSysAct: QuoteActivity = {
        id: `act-sys-${Date.now()}`,
        titulo: `Etapa cambiada via Kanban`,
        descripcion: `Arrastrado de "${prevLabel}" a "${newLabel}".`,
        responsableId: q.vendedorId,
        fechaLimite: fechaActual.split(' ')[0],
        estado: 'hecha',
        tipo: 'cambio_etapa',
        createdAt: fechaActual,
      };

      const updated: KanbanQuote = {
        ...q,
        etapa: newEtapa,
        updatedAt: fechaActual,
        historialEtapas: [...q.historialEtapas, { etapa: newEtapa, fecha: fechaActual }],
        actividades: [...q.actividades, newSysAct],
      };

      if (selectedQuote?.id === quoteId) setSelectedQuote(updated);
      return updated;
    });

    onUpdateQuotes(updatedQuotes);

    // Disparar notificación si aplica
    if (notifPayload) agregarNotificacion(notifPayload);
  };

  const handleUpdateQuote = (updatedQuote: KanbanQuote) => {
    onUpdateQuotes(quotes.map(q => q.id === updatedQuote.id ? updatedQuote : q));
    setSelectedQuote(updatedQuote);
  };

  // ─── Quick Add ────────────────────────────────────────────────────────────

  const toggleServicioQA = (tipo: TipoServicio) => {
    setQaServicios(prev =>
      prev.includes(tipo) ? prev.filter(s => s !== tipo) : [...prev, tipo]
    );
  };

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qaEmpresa.trim() || qaServicios.length === 0) return;

    const nextNumber = quotes.length + 1;
    const folio = `COT-2026-${String(nextNumber).padStart(4, '0')}`;
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');

    const newQuote: KanbanQuote = {
      id: folio,
      etapa: 'solicitud_cliente',
      prospecto: {
        empresa: qaEmpresa,
        contacto: qaContacto || 'Por definir',
        telefono: '—',
        email: '—',
        origen: qaOrigen,
      },
      vendedorId: qaVendedor,
      pricingId: null,
      servicios: qaServicios.map((tipo, i) => ({
        id: `srv-${nextNumber}-${tipo}`,
        tipo,
        ruta: { origen: 'Por definir', destino: 'Por definir' },
        incoterm: 'FOB',
        mercancia: 'Por definir',
        peso: 0,
        volumen: 0,
        estado: 'pendiente',
        margen: 0,
        cotizacionesProveedor: [],
      })),
      valorTotalConsolidado: 0,
      moneda: 'USD',
      estadoFinal: null,
      motivoPerdida: null,
      createdAt: fechaActual,
      updatedAt: fechaActual,
      historialEtapas: [{ etapa: 'solicitud_cliente', fecha: fechaActual }],
      actividades: [],
    };

    onUpdateQuotes([newQuote, ...quotes]);
    // Reset form
    setQaEmpresa('');
    setQaContacto('');
    setQaServicios(['maritimo']);
    setShowQuickAdd(false);
  };

  // ─── Estadísticas por columna ─────────────────────────────────────────────

  const getColumnStats = (stageId: string) => {
    const stageQuotes = filteredQuotes.filter(q => q.etapa === stageId);
    const count = stageQuotes.length;
    let sumUSD = 0;
    stageQuotes.forEach(q => {
      const total = q.valorTotalConsolidado > 0
        ? q.valorTotalConsolidado
        : calcularTotalConsolidado(q.servicios);
      sumUSD += total;
    });
    return { count, sumText: sumUSD > 0 ? `$${sumUSD.toLocaleString()} USD` : '' };
  };

  const isActivityOverdue = (dateStr: string) =>
    dateStr < new Date().toISOString().split('T')[0];

  const vendedoresUnicos = Array.from(new Set(quotes.map(q => q.vendedorId)));

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Filtros ───────────────────────────────────────────────────────── */}
      <div className="bg-white p-5 rounded-xl border border-gray-150 shadow-xs flex flex-col md:flex-row gap-4 items-center justify-between">

        {/* Búsqueda */}
        <div className="relative w-full md:max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar folio o empresa..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 outline-none focus:border-[#E11D48] focus:ring-1 focus:ring-[#E11D48]/20 shadow-2xs"
          />
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">

          <FilterPill label="Vendedor">
            <select
              value={filterVendedor}
              onChange={e => setFilterVendedor(e.target.value)}
              className="bg-transparent border-none outline-none font-bold text-gray-700 cursor-pointer p-0 text-xs"
            >
              <option value="Todos">Todos</option>
              {vendedoresUnicos.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </FilterPill>

          <FilterPill label="Servicio">
            <select
              value={filterServicio}
              onChange={e => setFilterServicio(e.target.value as TipoServicio | 'Todos')}
              className="bg-transparent border-none outline-none font-bold text-gray-700 cursor-pointer p-0 text-xs"
            >
              <option value="Todos">Todos</option>
              {(Object.entries(TIPOS_SERVICIO) as [TipoServicio, { label: string }][]).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </FilterPill>

          <FilterPill label="Origen lead">
            <select
              value={filterOrigen}
              onChange={e => setFilterOrigen(e.target.value)}
              className="bg-transparent border-none outline-none font-bold text-gray-700 cursor-pointer p-0 text-xs"
            >
              <option value="Todos">Todos</option>
              {Object.entries(ORIGENES_PROSPECTO).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </FilterPill>

          {(searchTerm || filterVendedor !== 'Todos' || filterServicio !== 'Todos' || filterOrigen !== 'Todos') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterVendedor('Todos');
                setFilterServicio('Todos');
                setFilterOrigen('Todos');
              }}
              className="p-2 text-xs font-bold text-[#E11D48] hover:text-[#BE123C] flex items-center hover:bg-red-50 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5 mr-1" /> Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ── Kanban ────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto pb-4">
        {/* Ancho mínimo: 9 columnas × ~250px */}
        <div className="flex gap-3 select-none min-w-[2250px] items-stretch">

          {PIPELINE_STAGES.filter(stage => {
            if (rolActivo === 'ventas') {
              return !['pricing_solicitando', 'cotizaciones_recibidas', 'consolidada'].includes(stage.id);
            }
            return true;
          }).map(stage => {
            const stageQuotesList = filteredQuotes.filter(q => {
              if (rolActivo === 'ventas' && stage.id === 'solicitado_pricing') {
                return ['solicitado_pricing', 'pricing_solicitando', 'cotizaciones_recibidas', 'consolidada'].includes(q.etapa);
              }
              return q.etapa === stage.id;
            });
            const { count, sumText } = getColumnStats(stage.id);
            const isDraggedOver = draggedOverColumn === stage.id;
            // Indicar si la columna corresponde a Pricing (visual)
            const isPricingColumn = stage.rol === 'pricing';

            return (
              <div
                key={stage.id}
                onDragOver={e => handleDragOver(e, stage.id)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, stage.id as PipelineStageId)}
                className={`w-[240px] bg-gray-50/50 rounded-xl border flex flex-col min-h-[520px] transition-all duration-200
                  ${isDraggedOver
                    ? 'bg-[#E11D48]/[0.03] border-dashed border-[#E11D48]/30 ring-2 ring-[#E11D48]/10'
                    : 'border-gray-150'}
                  ${isPricingColumn ? 'ring-1 ring-indigo-100' : ''}`}
              >
                {/* Cabecera columna */}
                <div className={`p-3.5 border-t-4 ${stage.color} rounded-t-xl border-b border-gray-150 flex flex-col justify-between shrink-0`}>
                  <div className="flex items-start justify-between">
                    <h3 className="text-[10px] font-bold uppercase tracking-wider leading-tight max-w-[85%]">
                      {stage.label}
                    </h3>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500 tabular-nums shrink-0">
                      {count}
                    </span>
                  </div>
                  {sumText && (
                    <div className="text-[9px] font-semibold text-gray-400 mt-1 truncate">
                      {sumText}
                    </div>
                  )}
                  {isPricingColumn && (
                    <span className="mt-1.5 inline-block text-[8px] font-bold uppercase tracking-wider text-indigo-500 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded w-fit">
                      Pricing
                    </span>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 p-2.5 space-y-2.5 overflow-y-auto max-h-[580px] scrollbar-none">

                  {/* Botón de nuevo prospecto (solo en primera columna) */}
                  {stage.id === 'solicitud_cliente' && (
                    <button
                      onClick={() => setShowQuickAdd(true)}
                      className="w-full py-2.5 bg-white border border-dashed border-gray-300 hover:border-[#E11D48] text-gray-500 hover:text-[#E11D48] rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-1.5 shadow-2xs hover:shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" /> Nueva solicitud
                    </button>
                  )}

                  {stageQuotesList.length === 0 ? (
                    <div className="h-20 flex items-center justify-center border border-dashed border-gray-200 rounded-xl text-[10px] text-gray-400 italic">
                      Sin cotizaciones
                    </div>
                  ) : (
                    stageQuotesList.map(quote => {
                      const pendingActs = quote.actividades.filter(a => a.estado === 'pendiente');
                      const nextAct = pendingActs.length > 0
                        ? [...pendingActs].sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite))[0]
                        : null;
                      const actOverdue = nextAct ? isActivityOverdue(nextAct.fechaLimite) : false;

                      // Total calculado
                      const total = quote.valorTotalConsolidado > 0
                        ? quote.valorTotalConsolidado
                        : calcularTotalConsolidado(quote.servicios);

                      // Servicios únicos
                      const tipos = Array.from(new Set(quote.servicios.map(s => s.tipo)));

                      return (
                        <div
                          key={quote.id}
                          draggable="true"
                          onDragStart={e => handleDragStart(e, quote.id)}
                          onClick={() => setSelectedQuote(quote)}
                          className="bg-white p-3.5 rounded-xl border border-gray-200 hover:border-[#E11D48]/30 shadow-2xs hover:shadow-md cursor-grab active:cursor-grabbing transition-all duration-200 space-y-2.5 group"
                        >
                          {/* Folio + origen */}
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-mono font-bold text-gray-400 group-hover:text-[#E11D48] transition-colors">
                              {quote.id}
                            </span>
                            {quote.prospecto.origen.startsWith('interno') ? (
                              <span className="text-[8px] font-bold bg-[#4B2A8C]/5 text-[#4B2A8C] border border-[#4B2A8C]/15 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                Interna ({quote.prospecto.origen === 'interno_ventas' ? 'Ventas' : 'Pricing'})
                              </span>
                            ) : (
                              <span className="text-[8px] font-semibold bg-gray-50 border border-gray-150 text-gray-400 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                Cliente ({ORIGENES_PROSPECTO[quote.prospecto.origen]?.split(' ')[0]})
                              </span>
                            )}
                          </div>

                          {/* Empresa */}
                          <h4 className="text-xs font-bold text-[#18181B] leading-tight truncate">
                            {quote.prospecto.empresa}
                          </h4>

                          {/* Badge En Proceso con Pricing (Ventas) */}
                          {rolActivo === 'ventas' && ['pricing_solicitando', 'cotizaciones_recibidas', 'consolidada'].includes(quote.etapa) && (
                            <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider w-fit">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                              </span>
                              En proceso con Pricing
                            </div>
                          )}

                          {/* Chips de servicios */}
                          <div className="flex flex-wrap gap-1">
                            {tipos.map(tipo => (
                              <ServiceChip key={tipo} tipo={tipo} />
                            ))}
                          </div>

                          {/* Responsables */}
                          <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                            <span className="text-[10px] font-black text-[#18181B] tabular-nums">
                              {total > 0 ? `$${total.toLocaleString()} ${quote.moneda}` : <span className="text-gray-300 font-normal">Sin cotizar</span>}
                            </span>
                            <div className="flex -space-x-1">
                              {/* Avatar vendedor */}
                              <div
                                className="w-5 h-5 rounded-full bg-[#E11D48]/10 text-[#E11D48] font-bold text-[8px] flex items-center justify-center ring-1 ring-white"
                                title={`Ventas: ${quote.vendedorId}`}
                              >
                                {quote.vendedorId.split(' ').map(n => n[0]).join('')}
                              </div>
                              {/* Avatar pricing */}
                              {quote.pricingId && (
                                <div
                                  className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[8px] flex items-center justify-center ring-1 ring-white"
                                  title={`Pricing: ${quote.pricingId}`}
                                >
                                  {quote.pricingId.split(' ').map(n => n[0]).join('')}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Próxima actividad */}
                          {nextAct && (
                            <div className="text-[9px] flex items-start pt-1.5 border-t border-dashed border-gray-100">
                              <Calendar className={`w-3.5 h-3.5 mr-1 shrink-0 ${actOverdue ? 'text-red-500' : 'text-gray-400'}`} />
                              <div className="min-w-0">
                                <span className={`font-bold block leading-tight truncate ${actOverdue ? 'text-red-500' : 'text-gray-500'}`}>
                                  {nextAct.titulo}
                                </span>
                                <span className="text-[8px] text-gray-400 tabular-nums">Límite: {nextAct.fechaLimite}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Drawer Ficha ──────────────────────────────────────────────────── */}
      <FichaCotizacion
        quote={selectedQuote}
        isOpen={selectedQuote !== null}
        onClose={() => setSelectedQuote(null)}
        onUpdateQuote={handleUpdateQuote}
        onConvertToShipment={onConvertToShipment}
        rolActivo={rolActivo}
      />

      {/* ── Modal Quick Add ───────────────────────────────────────────────── */}
      {showQuickAdd && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setShowQuickAdd(false)} />

          <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <h3 className="text-sm font-bold text-[#18181B] uppercase tracking-wider">
                Nueva Solicitud de Cotización
              </h3>
              <button onClick={() => setShowQuickAdd(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickAdd} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Empresa *</label>
                <input
                  type="text" required
                  placeholder="Ej. Comercializadora del Centro"
                  value={qaEmpresa}
                  onChange={e => setQaEmpresa(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#E11D48] shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Contacto</label>
                <input
                  type="text"
                  placeholder="Ej. Ing. Daniel Ortiz"
                  value={qaContacto}
                  onChange={e => setQaContacto(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#E11D48] shadow-2xs"
                />
              </div>

              {/* Servicios requeridos (multi-selección) */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">
                  Servicios requeridos *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(TIPOS_SERVICIO) as [TipoServicio, { label: string; color: string; icon: string }][]).map(([tipo, meta]) => {
                    const selected = qaServicios.includes(tipo);
                    return (
                      <button
                        key={tipo}
                        type="button"
                        onClick={() => toggleServicioQA(tipo)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-all
                          ${selected
                            ? `${meta.color} shadow-xs ring-1 ring-offset-1`
                            : 'border-gray-200 text-gray-400 bg-gray-50 hover:border-gray-300'}`}
                      >
                        {tipo === 'aereo' && <Plane className="w-3.5 h-3.5" />}
                        {tipo === 'maritimo' && <Ship className="w-3.5 h-3.5" />}
                        {tipo === 'terrestre' && <Truck className="w-3.5 h-3.5" />}
                        {tipo === 'aduanal' && <ShieldCheck className="w-3.5 h-3.5" />}
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
                {qaServicios.length === 0 && (
                  <p className="text-[10px] text-red-500 mt-1">Selecciona al menos un servicio.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Origen del lead</label>
                  <select
                    value={qaOrigen}
                    onChange={e => setQaOrigen(e.target.value as KanbanQuote['prospecto']['origen'])}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-[#E11D48] bg-white"
                  >
                    {Object.entries(ORIGENES_PROSPECTO).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Vendedor</label>
                  <select
                    value={qaVendedor}
                    onChange={e => setQaVendedor(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-[#E11D48] bg-white"
                  >
                    {VENDEDORES.map(v => <option key={v.id} value={v.nombre}>{v.nombre}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 text-xs font-bold uppercase border-t border-gray-100">
                <button type="button" onClick={() => setShowQuickAdd(false)} className="px-4 py-2 text-gray-500 hover:text-gray-700">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2.5 bg-[#E11D48] hover:bg-[#BE123C] text-white rounded-lg shadow-xs transition-colors">
                  Crear solicitud
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente auxiliar de pill de filtro ────────────────────────────────────

function FilterPill({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center space-x-1.5 text-xs text-gray-500 font-semibold bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">
      <span>{label}:</span>
      {children}
    </div>
  );
}
