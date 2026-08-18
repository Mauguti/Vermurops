import React, { useState } from 'react';
import {
  Plane, Ship, Truck, ShieldCheck, Plus, X, Check, Clock, AlertTriangle,
  ChevronDown, ChevronRight, DollarSign, User, Building,
} from 'lucide-react';
import {
  KanbanQuote, ServicioSolicitado, CotizacionProveedor, TipoServicio,
  TIPOS_SERVICIO, PIPELINE_STAGES, calcularTotalConsolidado,
} from './QuotesData';
import { calcLinea } from '../../lib/cotizacionCalculator';
import FichaCotizacion from './FichaCotizacion';
import { useProveedores } from '../../hooks/useProveedores';
import { ProveedorVermur, Modalidad, contactoPrincipal } from '../proveedores/ProveedoresData';
import AltaRapidaProveedorModal from '../proveedores/AltaRapidaProveedorModal';

interface BandejaPricingProps {
  quotes: KanbanQuote[];
  onUpdateQuotes: (quotes: KanbanQuote[]) => void;
  onConvertToShipment: (quote: KanbanQuote) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Icono por tipo de servicio
// ─────────────────────────────────────────────────────────────────────────────

function ServicioIcon({ tipo }: { tipo: TipoServicio }) {
  switch (tipo) {
    case 'aereo':     return <Plane className="w-4 h-4" />;
    case 'maritimo':  return <Ship className="w-4 h-4" />;
    case 'terrestre': return <Truck className="w-4 h-4" />;
    case 'aduanal':   return <ShieldCheck className="w-4 h-4" />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Formulario para cargar cotización de proveedor (inline dentro de la bandeja)
// ─────────────────────────────────────────────────────────────────────────────

interface FormProveedorProps {
  onGuardar: (cp: CotizacionProveedor) => void;
  onCancelar: () => void;
  servicioTipo: TipoServicio;
  proveedores: ProveedorVermur[];
}

function FormProveedor({ onGuardar, onCancelar, servicioTipo, proveedores }: FormProveedorProps) {
  const { createProveedor } = useProveedores();
  const [proveedor, setProveedor] = useState('');
  const [contacto, setContacto] = useState('');
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<'USD' | 'MXN'>('USD');
  const [tiempo, setTiempo] = useState('');
  const [vigencia, setVigencia] = useState('');
  const [condiciones, setCondiciones] = useState('');
  const [showAltaRapida, setShowAltaRapida] = useState(false);

  // Filtrar proveedores por modalidad del servicio.
  const TIPO_A_MODALIDAD: Record<string, Modalidad> = {
    'maritimo': 'maritimo', 'Flete Internacional': 'maritimo',
    'aereo': 'aereo', 'Transporte Aéreo': 'aereo',
    'terrestre': 'terrestre', 'Transporte Terrestre': 'terrestre', 'Recolección': 'terrestre',
    'aduanal': 'aduanal', 'Asesoría Aduanal': 'aduanal',
  };
  const modalidadFiltro = TIPO_A_MODALIDAD[servicioTipo];
  const availableProviders = proveedores.filter(p =>
    p.activo && (modalidadFiltro ? (!p.modalidades?.length || p.modalidades.includes(modalidadFiltro)) : true)
  );

  const handleProveedorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__nuevo__') {
      setShowAltaRapida(true);
      return;
    }
    setProveedor(val);
    const provObj = availableProviders.find(p => p.nombre === val);
    if (provObj) {
      const cp = contactoPrincipal(provObj);
      setContacto(cp?.nombre ?? '');
    } else {
      setContacto('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!proveedor.trim() || !monto) return;
    onGuardar({
      id: `cp-${Date.now()}`,
      proveedor,
      contacto,
      monto: Number(monto),
      moneda,
      tiempoTransito: tiempo,
      vigencia,
      condiciones,
      adjuntoUrl: null,
      seleccionada: false,
    });
  };

  return (
    <>
    <form
      onSubmit={handleSubmit}
      className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 space-y-3 mt-3"
      onClick={e => e.stopPropagation()}
    >
      <h5 className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest">
        Cargar cotización de proveedor
      </h5>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Proveedor *</label>
          <select
            required
            value={proveedor}
            onChange={handleProveedorChange}
            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400 bg-white"
          >
            <option value="">Seleccionar proveedor...</option>
            {availableProviders.map(p => (
              <option key={p.id} value={p.nombre}>{p.nombre}</option>
            ))}
            <option value="__nuevo__">+ Nuevo proveedor...</option>
          </select>
        </div>
        <div>
          <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Contacto</label>
          <input
            type="text"
            placeholder="Nombre del contacto"
            value={contacto}
            onChange={e => setContacto(e.target.value)}
            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400 bg-white"
            readOnly
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Monto *</label>
          <input
            required
            type="number"
            placeholder="3200"
            value={monto}
            onChange={e => setMonto(e.target.value)}
            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400 bg-white"
          />
        </div>
        <div>
          <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Moneda</label>
          <select
            value={moneda}
            onChange={e => setMoneda(e.target.value as 'USD' | 'MXN')}
            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400 bg-white"
          >
            <option value="USD">USD</option>
            <option value="MXN">MXN</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Tiempo de tránsito</label>
          <input
            type="text"
            placeholder="Ej. 18-22 días"
            value={tiempo}
            onChange={e => setTiempo(e.target.value)}
            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400 bg-white"
          />
        </div>
        <div>
          <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Vigencia</label>
          <input
            type="date"
            value={vigencia}
            onChange={e => setVigencia(e.target.value)}
            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400 bg-white"
          />
        </div>
      </div>

      <div>
        <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Condiciones / Notas</label>
        <textarea
          placeholder="Condiciones especiales, incluye/excluye..."
          value={condiciones}
          onChange={e => setCondiciones(e.target.value)}
          rows={2}
          className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400 bg-white resize-none"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancelar}
          className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-700 uppercase"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
        >
          <Plus className="w-3 h-3" /> Guardar cotización
        </button>
      </div>
    </form>
    {showAltaRapida && (
      <AltaRapidaProveedorModal
        onClose={() => setShowAltaRapida(false)}
        onCreate={createProveedor}
        modalidadContexto={modalidadFiltro}
        onCreated={(_id, nombre) => {
          setProveedor(nombre);
          setShowAltaRapida(false);
        }}
      />
    )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fila de cotización de proveedor dentro de un servicio
// ─────────────────────────────────────────────────────────────────────────────

function FilaProveedor({
  cp,
  onSeleccionar,
  onEliminar,
}: {
  key?: React.Key;
  cp: CotizacionProveedor;
  onSeleccionar: () => void;
  onEliminar: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all
        ${cp.seleccionada
          ? 'bg-green-50 border-green-200 ring-1 ring-green-300'
          : 'bg-white border-gray-150 hover:border-gray-300'}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Check de selección */}
        <button
          onClick={onSeleccionar}
          title={cp.seleccionada ? 'Deseleccionar' : 'Seleccionar esta cotización'}
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
            ${cp.seleccionada ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400'}`}
        >
          {cp.seleccionada && <Check className="w-3 h-3 text-white" />}
        </button>

        {/* Info del proveedor */}
        <div className="min-w-0">
          <p className="text-xs font-bold text-[#18181B] truncate">{cp.proveedor}</p>
          <p className="text-[9px] text-gray-400 truncate">{cp.contacto}</p>
        </div>
      </div>

      {/* Monto, tránsito, vigencia */}
      <div className="flex items-center gap-4 shrink-0 ml-3">
        <div className="text-right">
          <p className="text-xs font-black text-[#18181B] tabular-nums">
            ${cp.monto.toLocaleString()} <span className="text-[9px] font-normal text-gray-400">{cp.moneda}</span>
          </p>
          {cp.tiempoTransito && (
            <p className="text-[9px] text-gray-400 flex items-center gap-0.5 justify-end">
              <Clock className="w-2.5 h-2.5" /> {cp.tiempoTransito}
            </p>
          )}
        </div>
        <button
          onClick={onEliminar}
          title="Eliminar"
          className="text-gray-200 hover:text-red-400 p-1 rounded transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fila de servicio (con expand)
// ─────────────────────────────────────────────────────────────────────────────

interface ServicioRowProps {
  key?: React.Key;
  servicio: ServicioSolicitado;
  quoteId: string;
  onUpdateServicio: (updated: ServicioSolicitado) => void;
}

function ServicioRow({ servicio, quoteId, onUpdateServicio }: ServicioRowProps) {
  const { proveedores } = useProveedores();
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [profitLocal, setProfitLocal] = useState(String(servicio.profit ?? 0));

  const meta = TIPOS_SERVICIO[servicio.tipo] || { label: servicio.tipo, color: 'bg-gray-100 text-gray-700', icon: 'help-circle' };

  const seleccionada = (servicio.cotizacionesProveedor ?? []).find(cp => cp.seleccionada);
  const serviciosCount = (servicio.cotizacionesProveedor ?? []).length;

  // Actualizar profit absoluto
  const handleProfitBlur = () => {
    const val = Number(profitLocal);
    if (!isNaN(val)) {
      onUpdateServicio({ ...servicio, profit: val });
    }
  };

  // Seleccionar/deseleccionar proveedor (resetea profit si se deselecciona todo)
  const handleSeleccionar = (cpId: string) => {
    const updated = (servicio.cotizacionesProveedor ?? []).map(cp => ({
      ...cp,
      seleccionada: cp.id === cpId ? !cp.seleccionada : false,
    }));
    const nuevoEstado = updated.some(cp => cp.seleccionada) ? 'cotizado' : 'solicitado_proveedores';
    onUpdateServicio({
      ...servicio,
      cotizacionesProveedor: updated,
      estado: nuevoEstado as ServicioSolicitado['estado'],
    });
  };

  const handleEliminarProveedor = (cpId: string) => {
    const updated = (servicio.cotizacionesProveedor ?? []).filter(cp => cp.id !== cpId);
    onUpdateServicio({ ...servicio, cotizacionesProveedor: updated });
  };

  const handleGuardarProveedor = (cp: CotizacionProveedor) => {
    const updated = [...(servicio.cotizacionesProveedor ?? []), cp];
    const nuevoEstado = servicio.estado === 'pendiente' ? 'solicitado_proveedores' : servicio.estado;
    onUpdateServicio({
      ...servicio,
      cotizacionesProveedor: updated,
      estado: nuevoEstado as ServicioSolicitado['estado'],
    });
    setShowForm(false);
  };

  return (
    <div className="border border-gray-150 rounded-xl overflow-hidden bg-white shadow-2xs">
      {/* Cabecera del servicio */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50/70 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Icono + tipo */}
          <span className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold border ${meta.color}`}>
            <ServicioIcon tipo={servicio.tipo} />
            {meta.label}
          </span>

          {/* Ruta */}
          <span className="text-xs text-gray-500 truncate hidden sm:flex items-center gap-1">
            {servicio.ruta.origen.split(',')[0]}
            <ChevronRight className="w-3 h-3 text-gray-300" />
            {servicio.ruta.destino.split(',')[0]}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Estado */}
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded
            ${servicio.estado === 'cotizado' ? 'bg-green-100 text-green-700' :
              servicio.estado === 'solicitado_proveedores' ? 'bg-amber-100 text-amber-700' :
              'bg-gray-100 text-gray-500'}`}
          >
            {servicio.estado === 'cotizado' ? '✓ Cotizado'
              : servicio.estado === 'solicitado_proveedores' ? 'En espera'
              : 'Pendiente'}
          </span>

          {/* Cantidad de cotizaciones */}
          <span className="text-[10px] font-semibold text-gray-400">
            {serviciosCount} {serviciosCount === 1 ? 'proveedor' : 'proveedores'}
          </span>

          {/* Expand */}
          {expanded
            ? <ChevronDown className="w-4 h-4 text-gray-400" />
            : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {/* Cuerpo expandido */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">

          {/* Datos del servicio */}
          <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-500 bg-gray-50 rounded-lg p-3">
            <div><span className="font-bold uppercase text-gray-400">Mercancía:</span><br />{servicio.mercancia}</div>
            <div><span className="font-bold uppercase text-gray-400">Peso / Volumen:</span><br />{servicio.peso} kg / {servicio.volumen} m³</div>
            <div><span className="font-bold uppercase text-gray-400">Incoterm:</span><br />{servicio.incoterm}</div>
          </div>

          {/* Lista de cotizaciones de proveedor */}
          {serviciosCount === 0 ? (
            <p className="text-[10px] text-gray-400 italic text-center py-2">
              Sin cotizaciones de proveedor cargadas aún.
            </p>
          ) : (
            <div className="space-y-2">
              {(servicio.cotizacionesProveedor ?? []).map(cp => (
                <FilaProveedor
                  key={cp.id}
                  cp={cp}
                  onSeleccionar={() => handleSeleccionar(cp.id)}
                  onEliminar={() => handleEliminarProveedor(cp.id)}
                />
              ))}
            </div>
          )}

          {/* Profit absoluto → Venta / Margen calculados */}
          {seleccionada && (() => {
            const linea = calcLinea(seleccionada.monto, Number(profitLocal) || 0);
            return (
              <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2.5 space-y-2">
                <div className="text-xs text-green-700 font-bold">
                  Costo proveedor: ${seleccionada.monto.toLocaleString()} {seleccionada.moneda}
                  <span className="ml-2 font-normal text-gray-500">({seleccionada.proveedor})</span>
                </div>
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500 font-semibold">Profit $</span>
                    <input
                      type="number"
                      value={profitLocal}
                      onChange={e => setProfitLocal(e.target.value)}
                      onBlur={handleProfitBlur}
                      className="w-20 text-center border border-gray-200 rounded-md px-1 py-0.5 text-xs outline-none focus:border-indigo-400"
                      placeholder="0"
                    />
                  </div>
                  <span className="text-gray-300">→</span>
                  <span className="font-bold text-indigo-900">
                    Venta: ${linea.venta.toLocaleString()} {seleccionada.moneda}
                  </span>
                  <span className="text-green-700 font-semibold">
                    Margen: {(linea.margen * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Botón añadir cotización de proveedor */}
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-2 border border-dashed border-indigo-200 hover:border-indigo-400 text-indigo-500 hover:text-indigo-700 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Cargar cotización de proveedor
            </button>
          ) : (
            <FormProveedor
              onGuardar={handleGuardarProveedor}
              onCancelar={() => setShowForm(false)}
              servicioTipo={servicio.tipo}
              proveedores={proveedores}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal: BandejaPricing
// ─────────────────────────────────────────────────────────────────────────────

export default function BandejaPricing({
  quotes,
  onUpdateQuotes,
  onConvertToShipment,
}: BandejaPricingProps) {

  const [selectedQuote, setSelectedQuote] = useState<KanbanQuote | null>(null);

  // Etapas relevantes para Pricing
  const pricingStages: string[] = [
    'solicitado_pricing',
    'pricing_solicitando',
    'cotizaciones_recibidas',
    'consolidada',
  ];

  // Filtrar cotizaciones en etapas de Pricing
  const bandeja = quotes
    .filter(q => pricingStages.includes(q.etapa))
    .sort((a, b) => {
      // Prioridad: cotizaciones recibidas > solicitando > solicitado > consolidada
      const order = ['cotizaciones_recibidas', 'pricing_solicitando', 'solicitado_pricing', 'consolidada'];
      return order.indexOf(a.etapa) - order.indexOf(b.etapa);
    });

  // Actualizar un servicio dentro de una cotización
  const handleUpdateServicio = (quoteId: string, servicioId: string, updatedServicio: ServicioSolicitado) => {
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');

    const updatedQuotes = quotes.map(q => {
      if (q.id !== quoteId) return q;

      const nuevosServicios = q.servicios.map(s =>
        s.id === servicioId ? updatedServicio : s
      );

      // Recalcular total consolidado
      const nuevoTotal = calcularTotalConsolidado(nuevosServicios);

      // Auto-avanzar etapa si todos los servicios están cotizados
      const todosCotizados = nuevosServicios.every(s => s.estado === 'cotizado');
      const nuevaEtapa = todosCotizados && q.etapa === 'pricing_solicitando'
        ? 'cotizaciones_recibidas'
        : q.etapa;

      return {
        ...q,
        servicios: nuevosServicios,
        valorTotalConsolidado: nuevoTotal,
        etapa: nuevaEtapa as KanbanQuote['etapa'],
        updatedAt: fechaActual,
      };
    });

    onUpdateQuotes(updatedQuotes);
  };

  // Consolidar y avanzar etapa a "consolidada"
  const handleConsolidar = (quoteId: string) => {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;

    const faltanCotizaciones = quote.servicios.some(
      s => !(s.cotizacionesProveedor ?? []).some(cp => cp.seleccionada)
    );
    if (faltanCotizaciones) {
      alert('Selecciona al menos una cotización de proveedor por servicio antes de consolidar.');
      return;
    }

    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const updated: KanbanQuote = {
      ...quote,
      etapa: 'consolidada',
      valorTotalConsolidado: calcularTotalConsolidado(quote.servicios),
      updatedAt: fechaActual,
      historialEtapas: [
        ...quote.historialEtapas,
        { etapa: 'consolidada', fecha: fechaActual, nota: 'Consolidada por Pricing.' },
      ],
      actividades: [
        ...quote.actividades,
        {
          id: `act-sys-${Date.now()}`,
          titulo: 'Cotización consolidada por Pricing',
          descripcion: 'Total consolidado calculado. Lista para revisión de Ventas.',
          responsableId: quote.pricingId ?? 'Pricing',
          fechaLimite: fechaActual.split(' ')[0],
          estado: 'hecha',
          tipo: 'cambio_etapa',
          createdAt: fechaActual,
        },
      ],
    };
    onUpdateQuotes(quotes.map(q => q.id === quoteId ? updated : q));
  };

  const handleUpdateQuote = (updatedQuote: KanbanQuote) => {
    onUpdateQuotes(quotes.map(q => q.id === updatedQuote.id ? updatedQuote : q));
    setSelectedQuote(updatedQuote);
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  // ── Vista de ficha completa (reemplaza la bandeja) ──────────────────────
  if (selectedQuote) {
    return (
      <FichaCotizacion
        quote={selectedQuote}
        onBack={() => setSelectedQuote(null)}
        onUpdateQuote={handleUpdateQuote}
        onConvertToShipment={onConvertToShipment}
        rolActivo="pricing"
      />
    );
  }

  if (bandeja.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-4">
          <ShieldCheck className="w-8 h-8 text-indigo-400" />
        </div>
        <h3 className="text-base font-bold text-[#18181B] mb-1">Bandeja de Pricing vacía</h3>
        <p className="text-sm text-gray-400 max-w-xs">
          No hay cotizaciones asignadas a Pricing en este momento.
          Cuando Ventas solicite una cotización, aparecerá aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Encabezado de la bandeja */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[#18181B]">Bandeja de Pricing</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {bandeja.length} cotización{bandeja.length !== 1 ? 'es' : ''} pendiente{bandeja.length !== 1 ? 's' : ''} de cotizar o consolidar
          </p>
        </div>
      </div>

      {/* Tarjetas por cotización */}
      {bandeja.map(quote => {
        const etapa = PIPELINE_STAGES.find(s => s.id === quote.etapa);
        const todosCotizados = quote.servicios.every(s => s.estado === 'cotizado');
        const total = calcularTotalConsolidado(quote.servicios);
        const serviciosPendientes = quote.servicios.filter(s => s.estado === 'pendiente').length;

        return (
          <div
            key={quote.id}
            className="bg-white rounded-2xl border border-gray-150 shadow-xs overflow-hidden hover:shadow-md transition-shadow"
          >
            {/* Header de la tarjeta */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-mono font-bold text-gray-400">{quote.id}</span>
                <div>
                  <p className="text-sm font-bold text-[#18181B] leading-tight">{quote.prospecto.empresa}</p>
                  <p className="text-[10px] text-gray-400">{quote.prospecto.contacto}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 flex-wrap">
                {/* Etapa actual */}
                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border
                  ${etapa?.color.replace('border-t-', 'border-') ?? ''}`}
                >
                  {etapa?.label}
                </span>

                {/* Alerta de servicios pendientes */}
                {serviciosPendientes > 0 && (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    {serviciosPendientes} sin cotizar
                  </span>
                )}

                {/* Total consolidado */}
                {total > 0 && (
                  <span className="text-xs font-black text-[#18181B] tabular-nums">
                    ${total.toLocaleString()} {quote.moneda}
                  </span>
                )}

                {/* Responsable Pricing */}
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[9px] flex items-center justify-center">
                    {(quote.pricingId ?? 'P').split(' ').map(n => n[0]).join('')}
                  </div>
                  <span className="text-[10px] text-gray-500">{quote.pricingId ?? 'Sin asignar'}</span>
                </div>

                {/* Botón abrir ficha completa */}
                <button
                  onClick={() => setSelectedQuote(quote)}
                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 px-2.5 py-1 rounded-lg transition-colors"
                >
                  Ver ficha
                </button>
              </div>
            </div>

            {/* Servicios */}
            <div className="p-5 space-y-3">
              {quote.servicios.map(servicio => (
                <ServicioRow
                  key={servicio.id}
                  servicio={servicio}
                  quoteId={quote.id}
                  onUpdateServicio={updated => handleUpdateServicio(quote.id, servicio.id, updated)}
                />
              ))}

              {/* Botón Consolidar */}
              {quote.etapa !== 'consolidada' && (
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => handleConsolidar(quote.id)}
                    disabled={!todosCotizados}
                    className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center gap-2 shadow-xs
                      ${todosCotizados
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                    title={todosCotizados ? 'Consolidar y enviar a Ventas' : 'Selecciona un proveedor por cada servicio'}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Consolidar cotización
                  </button>
                </div>
              )}

              {quote.etapa === 'consolidada' && (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 text-green-800">
                    <Check className="w-4 h-4" />
                    <span className="text-xs font-bold">Cotización consolidada lista para Ventas</span>
                  </div>
                  <span className="text-sm font-black text-green-900 tabular-nums">
                    ${total.toLocaleString()} {quote.moneda}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Ficha se muestra a pantalla completa arriba (early return) */}
    </div>
  );
}
