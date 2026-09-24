/**
 * BandejaPricing.tsx (BP-3 to BP-6)
 *
 * Bandeja de trabajo para el equipo de Pricing.
 * Agrupa cotizaciones por acción requerida, no por etapa del pipeline.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { antesDeLaComa } from '../../lib/texto';
import { alDiaConVersion } from '../../lib/versionesCotizacion';
import {
  Plane, Ship, Truck, ShieldCheck, Check, Clock,
  ChevronRight, BookOpen, Inbox,
} from 'lucide-react';
import {
  KanbanQuote, ServicioSolicitado, CotizacionProveedor, TipoServicio,
  EQUIPO_PRICING, calcularTotalConsolidado,
} from './QuotesData';
import FichaCotizacion from './FichaCotizacion';
import { useAuth } from '../../auth/AuthContext';
import { useTarifas } from '../../hooks/useTarifas';
import { useConceptos } from '../../hooks/useConceptos';
import { buildConceptoMap } from '../tarifas/tarifaMatching';
import { cargaDesdeLegacy, resumenCarga } from '../../lib/cargaSolicitud';
import {
  clasificarBandeja,
  calcularProgreso,
  diasEsperando,
  buildTarifaCountMap,
  contarTarifasDisponibles,
  type BandejaClasificada,
  type ProgresoCotizacion,
} from '../../lib/clasificarBandeja';

// ─── Props ───────────────────────────────────────────────────────────────────

interface BandejaPricingProps {
  quotes: KanbanQuote[];
  onUpdateQuotes: (quotes: KanbanQuote[]) => void;
  onConvertToShipment: (quote: KanbanQuote) => void;
  onFichaVisible?: (visible: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ServicioIcon({ tipo }: { tipo: TipoServicio }) {
  switch (tipo) {
    case 'aereo':     return <Plane className="w-3.5 h-3.5" />;
    case 'maritimo':  return <Ship className="w-3.5 h-3.5" />;
    case 'terrestre': return <Truck className="w-3.5 h-3.5" />;
    case 'aduanal':
    case 'despacho_aduanal': return <ShieldCheck className="w-3.5 h-3.5" />;
  }
}

type Filtro = 'todas' | 'mias' | 'sin_asignar';

// ─── Badge de días esperando ─────────────────────────────────────────────────

function BadgeDias({ dias }: { dias: number }) {
  const color = dias <= 2
    ? 'bg-green-100 text-green-700'
    : dias <= 5
    ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-700';
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${color} tabular-nums whitespace-nowrap`}>
      <Clock className="w-2.5 h-2.5 inline -mt-px mr-0.5" />
      {dias}d
    </span>
  );
}

// ─── Barra de progreso ───────────────────────────────────────────────────────

function BarraProgreso({ progreso }: { progreso: ProgresoCotizacion }) {
  if (progreso.total === 0) {
    return (
      <span className="text-[9px] text-gray-400 italic">Sin conceptos definidos</span>
    );
  }
  const pct = Math.round((progreso.conOficial / progreso.total) * 100);
  const color = pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-gray-300';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[60px] max-w-[100px]">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-gray-500 tabular-nums whitespace-nowrap">
        {progreso.conOficial} de {progreso.total}
      </span>
    </div>
  );
}

// ─── Badge de tarifas disponibles ────────────────────────────────────────────

function BadgeTarifas({ count }: { count: number }) {
  if (count > 0) {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 tabular-nums whitespace-nowrap">
        <BookOpen className="w-2.5 h-2.5 inline -mt-px mr-0.5" />
        {count} tarifa{count !== 1 ? 's' : ''}
      </span>
    );
  }
  return (
    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 whitespace-nowrap">
      Sin tarifario
    </span>
  );
}

// ─── Renglón de cotización ───────────────────────────────────────────────────

interface CotizacionRowProps {
  quote: KanbanQuote;
  progreso: ProgresoCotizacion;
  dias: number;
  tarifasCount: number;
  bloque: 'te_toca' | 'esperando' | 'listas';
  onAbrir: () => void;
  onConsolidar?: () => void;
}

function CotizacionRow({ quote, progreso, dias, tarifasCount, bloque, onAbrir, onConsolidar }: CotizacionRowProps) {
  // Modalidades únicas de los servicios
  const modalidades = Array.from(new Set(quote.servicios.map(s => s.tipo)));
  // Ruta (del primer servicio)
  const ruta = quote.servicios[0]?.ruta;
  // La carga que declaró Ventas (S-3): «FCL 2×40' · 18,500 kg». Las
  // solicitudes viejas sin carga simplemente no pintan la línea.
  const resumenesCarga = quote.servicios
    .map(s => { const c = cargaDesdeLegacy(s); return c ? resumenCarga(c) : null; })
    .filter((r): r is string => !!r);

  // Conteo de respondidos para bloque "esperando"
  const respondidos = quote.servicios.filter(s => s.estado === 'cotizado').length;
  const totalServicios = quote.servicios.length;

  // Borde izquierdo por bloque
  const borderColor = bloque === 'te_toca' ? 'border-l-red-400' : bloque === 'listas' ? 'border-l-green-400' : '';

  return (
    <div
      className={`bg-white rounded-lg border border-gray-150 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer border-l-[3px] ${borderColor || 'border-l-transparent'}`}
      onClick={onAbrir}
    >
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Columna izquierda: info principal */}
        <div className="flex-1 min-w-0 space-y-1">
          {/* Línea 1: folio + cliente + badge días */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono font-bold text-gray-400">{quote.id}</span>
            <span className="text-xs font-bold text-[#18181B] truncate">{quote.prospecto.empresa}</span>
            <BadgeDias dias={dias} />
          </div>

          {/* Línea 2: modalidad + ruta + conceptos/respondieron + asignado */}
          <div className="flex items-center gap-3 text-[10px] text-gray-500 flex-wrap">
            {/* Modalidades */}
            <div className="flex items-center gap-1">
              {modalidades.map(m => (
                <span key={m} className="text-gray-400" title={m}>
                  <ServicioIcon tipo={m} />
                </span>
              ))}
            </div>

            {/* Ruta */}
            {ruta && (
              <span className="flex items-center gap-0.5 truncate max-w-[160px]">
                {antesDeLaComa(ruta.origen)}
                <ChevronRight className="w-2.5 h-2.5 text-gray-300 shrink-0" />
                {antesDeLaComa(ruta.destino)}
              </span>
            )}

            {/* Carga declarada (S-3) */}
            {resumenesCarga.length > 0 && (
              <span className="truncate max-w-[260px] text-gray-400" title={resumenesCarga.join('  |  ')}>
                {resumenesCarga.join(' | ')}
              </span>
            )}

            {/* Conceptos o respondieron */}
            {bloque === 'esperando' ? (
              <span className="text-amber-600 font-medium">
                {respondidos} de {totalServicios} respondieron
              </span>
            ) : (
              <BarraProgreso progreso={progreso} />
            )}

            {/* Asignado */}
            {quote.pricingId ? (
              <span className="flex items-center gap-1 shrink-0">
                <span className="w-4 h-4 rounded-full bg-primario/10 text-primario-hover font-bold text-[7px] flex items-center justify-center">
                  {quote.pricingId.split(' ').map(n => n[0]).join('')}
                </span>
                <span className="text-gray-400 truncate max-w-[80px]">{quote.pricingId}</span>
              </span>
            ) : (
              <span className="text-gray-300 italic">Sin asignar</span>
            )}
          </div>
        </div>

        {/* Columna derecha: badge tarifas + botón */}
        <div className="flex items-center gap-2 shrink-0">
          <BadgeTarifas count={tarifasCount} />

          {bloque === 'te_toca' && (
            <button
              onClick={e => { e.stopPropagation(); onAbrir(); }}
              className="text-[9px] font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded transition-colors whitespace-nowrap"
            >
              Cotizar
            </button>
          )}
          {bloque === 'esperando' && (
            <button
              onClick={e => { e.stopPropagation(); onAbrir(); }}
              className="text-[9px] font-bold text-primario hover:text-primario-fuerte border border-primario/30 hover:border-primario/60 px-3 py-1.5 rounded transition-colors whitespace-nowrap"
            >
              Abrir
            </button>
          )}
          {bloque === 'listas' && (
            <button
              onClick={e => { e.stopPropagation(); onConsolidar?.(); }}
              className="text-[9px] font-bold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded transition-colors whitespace-nowrap"
            >
              Consolidar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sección de bloque ──────────────────────────────────────────────────────

function BloqueSection({ titulo, count, children }: {
  titulo: string; count: number; children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
          {titulo}
        </h4>
        <span className="text-[10px] font-bold text-gray-300 tabular-nums">({count})</span>
      </div>
      <div className="space-y-1.5">
        {children}
      </div>
    </section>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function BandejaPricing({
  quotes,
  onUpdateQuotes,
  onConvertToShipment,
  onFichaVisible,
}: BandejaPricingProps) {
  const { user } = useAuth();
  const { tarifas: catalogoTarifas } = useTarifas();
  const { conceptos: conceptosCatalogo } = useConceptos();
  const [selectedQuote, setSelectedQuote] = useState<KanbanQuote | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todas');

  // ── Notificar al padre cuando la ficha está visible ─────────────────────
  useEffect(() => {
    onFichaVisible?.(!!selectedQuote);
    return () => onFichaVisible?.(false);
  }, [!!selectedQuote, onFichaVisible]);

  // ── Maps memoizados para matching O(1) ──────────────────────────────────
  const conceptosActivos = useMemo(() => conceptosCatalogo.filter(c => c.activo), [conceptosCatalogo]);
  const conceptoMap = useMemo(() => buildConceptoMap(conceptosActivos), [conceptosActivos]);
  const tarifaCountMap = useMemo(() => buildTarifaCountMap(catalogoTarifas), [catalogoTarifas]);

  // ── Clasificar cotizaciones ─────────────────────────────────────────────
  const clasificacion = useMemo(() => clasificarBandeja(quotes), [quotes]);

  // ── Aplicar filtro de usuario ───────────────────────────────────────────
  const filtrar = (arr: KanbanQuote[]): KanbanQuote[] => {
    if (filtro === 'mias') return arr.filter(q => q.pricingId === user?.nombre);
    if (filtro === 'sin_asignar') return arr.filter(q => !q.pricingId);
    return arr;
  };

  const teCotizar = filtrar(clasificacion.teCotizar);
  const esperando = filtrar(clasificacion.esperando);
  const listasConsolidar = filtrar(clasificacion.listasConsolidar);
  const totalVisible = teCotizar.length + esperando.length + listasConsolidar.length;

  // ── Conteos para las tarjetas resumen (sin filtro) ──────────────────────
  const totalMias = [...clasificacion.teCotizar, ...clasificacion.esperando, ...clasificacion.listasConsolidar]
    .filter(q => q.pricingId === user?.nombre).length;
  const totalEquipo = clasificacion.teCotizar.length + clasificacion.esperando.length + clasificacion.listasConsolidar.length;

  // ── Precalcular datos por cotización ────────────────────────────────────
  const quoteData = useMemo(() => {
    const m = new Map<string, { progreso: ProgresoCotizacion; dias: number; tarifas: number }>();
    const todas = [...clasificacion.teCotizar, ...clasificacion.esperando, ...clasificacion.listasConsolidar];
    for (const q of todas) {
      m.set(q.id, {
        progreso: calcularProgreso(q),
        dias: diasEsperando(q),
        tarifas: contarTarifasDisponibles(q, tarifaCountMap, conceptosActivos, conceptoMap),
      });
    }
    return m;
  }, [clasificacion, tarifaCountMap, conceptosActivos, conceptoMap]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleUpdateQuote = (updatedQuote: KanbanQuote) => {
    onUpdateQuotes(quotes.map(q => q.id === updatedQuote.id ? updatedQuote : q));
    setSelectedQuote(updatedQuote);
  };

  const handleConsolidar = (quoteId: string) => {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;

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

  // ── Vista de ficha completa (reemplaza la bandeja) ──────────────────────
  if (selectedQuote) {
    return (
      <FichaCotizacion
        quote={alDiaConVersion(selectedQuote, quotes)}
        onBack={() => setSelectedQuote(null)}
        onUpdateQuote={handleUpdateQuote}
        onConvertToShipment={onConvertToShipment}
        rolActivo="pricing"
      />
    );
  }

  // ── Bandeja vacía ───────────────────────────────────────────────────────
  if (totalEquipo === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primario/5 border border-primario/10 flex items-center justify-center mb-4">
          <Inbox className="w-8 h-8 text-primario/60" />
        </div>
        <h3 className="text-base font-bold text-[#18181B] mb-1">Bandeja vacía</h3>
        <p className="text-sm text-gray-400 max-w-xs">
          No hay cotizaciones pendientes de pricing.
          Cuando Ventas solicite una cotización, aparecerá aquí.
        </p>
      </div>
    );
  }

  // ── Render principal ────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-red-200/60 bg-red-50/40 px-4 py-3">
          <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest">Te toca cotizar</p>
          <p className="text-2xl font-black text-red-700 tabular-nums mt-0.5">{clasificacion.teCotizar.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50/40 px-4 py-3">
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Esperando proveedor</p>
          <p className="text-2xl font-black text-gray-700 tabular-nums mt-0.5">{clasificacion.esperando.length}</p>
        </div>
        <div className="rounded-xl border border-green-200/60 bg-green-50/40 px-4 py-3">
          <p className="text-[9px] font-bold text-green-500 uppercase tracking-widest">Listas para consolidar</p>
          <p className="text-2xl font-black text-green-700 tabular-nums mt-0.5">{clasificacion.listasConsolidar.length}</p>
        </div>
        <div className="rounded-xl border border-primario/30 bg-primario/5 px-4 py-3">
          <p className="text-[9px] font-bold text-primario/60 uppercase tracking-widest">Mías / del equipo</p>
          <p className="text-2xl font-black text-primario-hover tabular-nums mt-0.5">
            {totalMias} <span className="text-base font-bold text-gray-300">/ {totalEquipo}</span>
          </p>
        </div>
      </div>

      {/* Filtros + orden */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {(['todas', 'mias', 'sin_asignar'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors ${
                filtro === f
                  ? 'bg-primario text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {f === 'todas' ? 'Todas' : f === 'mias' ? 'Solo mías' : 'Sin asignar'}
            </button>
          ))}
        </div>
        <span className="text-[9px] text-gray-400">Ordenadas por antigüedad</span>
      </div>

      {/* Filtro vacío */}
      {totalVisible === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">
          No hay cotizaciones que coincidan con el filtro seleccionado.
        </p>
      )}

      {/* Bloques de trabajo */}
      <BloqueSection titulo="Te toca cotizar" count={teCotizar.length}>
        {teCotizar.map(q => {
          const data = quoteData.get(q.id)!;
          return (
            <CotizacionRow
              key={q.id}
              quote={q}
              progreso={data.progreso}
              dias={data.dias}
              tarifasCount={data.tarifas}
              bloque="te_toca"
              onAbrir={() => setSelectedQuote(q)}
            />
          );
        })}
      </BloqueSection>

      <BloqueSection titulo="Esperando respuesta de proveedores" count={esperando.length}>
        {esperando.map(q => {
          const data = quoteData.get(q.id)!;
          return (
            <CotizacionRow
              key={q.id}
              quote={q}
              progreso={data.progreso}
              dias={data.dias}
              tarifasCount={data.tarifas}
              bloque="esperando"
              onAbrir={() => setSelectedQuote(q)}
            />
          );
        })}
      </BloqueSection>

      <BloqueSection titulo="Listas para consolidar" count={listasConsolidar.length}>
        {listasConsolidar.map(q => {
          const data = quoteData.get(q.id)!;
          return (
            <CotizacionRow
              key={q.id}
              quote={q}
              progreso={data.progreso}
              dias={data.dias}
              tarifasCount={data.tarifas}
              bloque="listas"
              onAbrir={() => setSelectedQuote(q)}
              onConsolidar={() => handleConsolidar(q.id)}
            />
          );
        })}
      </BloqueSection>
    </div>
  );
}
