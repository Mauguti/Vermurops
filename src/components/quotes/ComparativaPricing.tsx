// ============================================================
// ComparativaPricing.tsx — Comparativa de proveedores por concepto
//
// CP-3: Selección interactiva + recálculo de métricas en vivo.
//   - Candidata (toggle): apoyo visual del analista, NO afecta cálculos.
//   - Seleccionada (toggle): elegida en firme, SÍ suma al costo.
//   - Profit editable con % mostrado junto.
//   - Desglose visible cuando hay 2+ seleccionadas.
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import {
  ArrowUpDown, Clock, Ship, TrendingDown, Star,
  Ban, AlertTriangle, Mail, DollarSign, BarChart2, Wallet,
  Bookmark, Check,
} from 'lucide-react';
import type { CotizacionProveedor, EstadoRespuesta } from './QuotesData';

// ─── Tipos internos ─────────────────────────────────────────────────────────────

type SortKey = 'precio' | 'transito' | 'freetime';

interface ProveedorComparativa extends CotizacionProveedor {
  tiempoTransitoDias?: number;
  esPreferido?: boolean;
  esVetado?: boolean;
}

export interface ComparativaPricingProps {
  concepto: string;
  ruta: string;
  tipoContenedor?: string;
  folio?: string;
  moneda: 'USD' | 'MXN';
  cotizaciones: ProveedorComparativa[];
  sinRespuesta: { proveedor: string; estadoRespuesta: EstadoRespuesta }[];
  totalSolicitados: number;
  profitInicial: number;
  diasCredito: number;
  /** Callback cuando cambia la selección (para integración CP-4). */
  onSeleccionChange?: (seleccionadas: ProveedorComparativa[]) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function parseTTDias(tt?: string, ttDias?: number): number | null {
  if (ttDias != null) return ttDias;
  if (!tt) return null;
  const match = tt.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

function esVigente(vigencia?: string): boolean {
  if (!vigencia) return true;
  return new Date(vigencia) >= new Date();
}

function formatMoneda(monto: number, moneda: string): string {
  return `$${monto.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${moneda}`;
}

// ─── Componente: tarjeta de métrica ──────────────────────────────────────────────

function MetricCard({ label, valor, sub, icon: Icon, highlight }: {
  label: string;
  valor: string;
  sub?: string;
  icon: React.ElementType;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-[10px] border p-4 flex flex-col gap-1 ${
      highlight
        ? 'bg-amber-50 border-amber-200'
        : 'bg-white border-card-border'
    }`}>
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 ${highlight ? 'text-amber-600' : 'text-text-muted'}`} />
        <span className={`text-[11px] font-medium uppercase tracking-wide ${
          highlight ? 'text-amber-700' : 'text-text-muted'
        }`}>{label}</span>
      </div>
      <span className={`text-[20px] font-bold tabular-nums ${
        highlight ? 'text-amber-900' : 'text-text-primary'
      }`}>{valor}</span>
      {sub && (
        <span className={`text-[11px] ${highlight ? 'text-amber-600' : 'text-text-muted'}`}>{sub}</span>
      )}
    </div>
  );
}

// ─── Componente: tarjeta de proveedor ────────────────────────────────────────────

interface ProveedorCardProps {
  key?: React.Key;
  cp: ProveedorComparativa;
  esSugerida: boolean;
  esMasRapida: boolean;
  diffPrecio: number;
  moneda: string;
  onToggleSeleccionada: (id: string) => void;
  onToggleCandidata: (id: string) => void;
}

function ProveedorCard({
  cp, esSugerida, esMasRapida, diffPrecio, moneda,
  onToggleSeleccionada, onToggleCandidata,
}: ProveedorCardProps) {
  const vencida = !esVigente(cp.vigencia);
  const atenuada = vencida || cp.esVetado;

  return (
    <div
      className={`rounded-[10px] border p-4 transition-all ${
        cp.seleccionada
          ? 'bg-brand/5 border-brand shadow-sm ring-1 ring-brand/20'
          : cp.candidata
          ? 'bg-white border-dashed border-gray-300'
          : esSugerida
          ? 'bg-white border-[#E11D48] border-2 shadow-sm'
          : 'bg-white border-card-border'
      } ${atenuada ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        {/* ── Lado izquierdo: info del proveedor ── */}
        <div className="flex-1 min-w-0">
          {/* Nombre + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <Ship className="w-4 h-4 text-text-muted shrink-0" />
            <span className="text-[14px] font-bold text-[#1F2937] truncate">{cp.proveedor}</span>

            {esSugerida && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E11D48]/10 text-[#E11D48] text-[10px] font-bold">
                <TrendingDown className="w-3 h-3" /> Sugerida · más barata
              </span>
            )}
            {esMasRapida && !esSugerida && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                <Clock className="w-3 h-3" /> Más rápida
              </span>
            )}
            {cp.esPreferido && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold">
                <Star className="w-3 h-3" /> Preferido del cliente
              </span>
            )}
            {cp.esVetado && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger-bg text-danger-text text-[10px] font-bold">
                <Ban className="w-3 h-3" /> Vetado por el cliente
              </span>
            )}
            {vencida && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning-bg text-warning-text text-[10px] font-bold">
                <AlertTriangle className="w-3 h-3" /> Vigencia vencida
              </span>
            )}

            {/* Estado visual: candidata vs seleccionada */}
            {cp.seleccionada && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[10px] font-bold">
                Seleccionada
              </span>
            )}
            {cp.candidata && !cp.seleccionada && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-neutral-bg text-text-muted text-[10px] font-medium border border-dashed border-gray-300">
                Candidata
              </span>
            )}
          </div>

          {/* Detalles en una línea */}
          <div className="flex items-center gap-4 mt-2 text-[12px] text-text-secondary">
            {cp.tiempoTransito && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-text-muted" />
                {cp.tiempoTransito}
              </span>
            )}
            {cp.freeTimeDias != null && (
              <span className="flex items-center gap-1">
                <span className="text-text-muted font-medium">FT:</span>
                {cp.freeTimeDias} días
              </span>
            )}
            {cp.vigencia && (
              <span className={`flex items-center gap-1 ${vencida ? 'text-warning-text' : ''}`}>
                <span className="text-text-muted font-medium">Vigencia:</span>
                {new Date(cp.vigencia).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
              </span>
            )}
            {cp.condiciones && (
              <span className="text-text-muted italic truncate max-w-[200px]">{cp.condiciones}</span>
            )}
          </div>
        </div>

        {/* ── Lado derecho: precio + diferencia ── */}
        <div className="text-right shrink-0">
          <div className="text-[20px] font-black text-[#1F2937] tabular-nums">
            {formatMoneda(cp.monto, moneda)}
          </div>
          {!esSugerida && diffPrecio !== 0 && (
            <div className={`text-[12px] font-semibold tabular-nums ${
              diffPrecio > 0 ? 'text-danger-text' : 'text-success-text'
            }`}>
              {diffPrecio > 0 ? '+' : ''}{formatMoneda(diffPrecio, moneda)}
            </div>
          )}
        </div>
      </div>

      {/* Botones de acción */}
      <div className="flex items-center justify-end gap-2 mt-3">
        {/* Candidata toggle — solo visible si no está seleccionada ni vencida */}
        {!cp.seleccionada && !vencida && (
          <button
            onClick={() => onToggleCandidata(cp.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[11px] font-medium transition-colors ${
              cp.candidata
                ? 'bg-gray-200 text-text-primary'
                : 'bg-neutral-bg text-text-muted hover:bg-gray-200'
            }`}
            title={cp.candidata ? 'Quitar de candidatas' : 'Marcar como candidata'}
          >
            <Bookmark className={`w-3 h-3 ${cp.candidata ? 'fill-current' : ''}`} />
            Candidata
          </button>
        )}

        {/* Elegir / Elegida toggle */}
        {vencida ? (
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[11px] font-medium bg-warning-bg text-warning-text hover:bg-amber-100 transition-colors">
            <Mail className="w-3 h-3" /> Repedir
          </button>
        ) : (
          <button
            onClick={() => onToggleSeleccionada(cp.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[11px] font-medium transition-colors ${
              cp.seleccionada
                ? 'bg-brand text-white hover:bg-brand-hover'
                : 'bg-neutral-bg text-text-secondary hover:bg-gray-200'
            }`}
          >
            {cp.seleccionada ? (
              <><Check className="w-3 h-3" /> Elegida</>
            ) : (
              'Elegir'
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────────

export default function ComparativaPricing({
  concepto,
  ruta,
  tipoContenedor,
  folio,
  moneda,
  cotizaciones: cotizacionesIniciales,
  sinRespuesta,
  totalSolicitados,
  profitInicial,
  diasCredito,
  onSeleccionChange,
}: ComparativaPricingProps) {
  // ── Estado local ────────────────────────────────────────────────────────────
  const [items, setItems] = useState<ProveedorComparativa[]>(cotizacionesIniciales);
  const [profit, setProfit] = useState(profitInicial);
  const [sortKey, setSortKey] = useState<SortKey>('precio');

  const totalRespondieron = items.length;

  // ── Toggles ─────────────────────────────────────────────────────────────────

  const toggleSeleccionada = useCallback((id: string) => {
    setItems(prev => {
      const next = prev.map(item =>
        item.id === id
          ? {
              ...item,
              seleccionada: !item.seleccionada,
              // Al seleccionar, quitar candidata (seleccionada > candidata)
              candidata: item.seleccionada ? item.candidata : false,
            }
          : item
      );
      onSeleccionChange?.(next.filter(i => i.seleccionada));
      return next;
    });
  }, [onSeleccionChange]);

  const toggleCandidata = useCallback((id: string) => {
    setItems(prev =>
      prev.map(item =>
        item.id === id && !item.seleccionada
          ? { ...item, candidata: !item.candidata }
          : item
      )
    );
  }, []);

  // ── Ordenamiento ──────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'precio':
          return a.monto - b.monto;
        case 'transito': {
          const aDias = parseTTDias(a.tiempoTransito, a.tiempoTransitoDias);
          const bDias = parseTTDias(b.tiempoTransito, b.tiempoTransitoDias);
          return (aDias ?? 999) - (bDias ?? 999);
        }
        case 'freetime':
          return (b.freeTimeDias ?? 0) - (a.freeTimeDias ?? 0);
      }
    });
    return arr;
  }, [items, sortKey]);

  const masBarata = useMemo(() => {
    return [...items].sort((a, b) => a.monto - b.monto)[0];
  }, [items]);

  const masRapida = useMemo(() => {
    const conTT = items.filter(c => parseTTDias(c.tiempoTransito, c.tiempoTransitoDias) != null);
    if (conTT.length === 0) return null;
    return conTT.reduce((min, c) => {
      const dias = parseTTDias(c.tiempoTransito, c.tiempoTransitoDias)!;
      const minDias = parseTTDias(min.tiempoTransito, min.tiempoTransitoDias)!;
      return dias < minDias ? c : min;
    });
  }, [items]);

  // ── Métricas derivadas ──────────────────────────────────────────────────────
  const seleccionadas = useMemo(() => items.filter(i => i.seleccionada), [items]);
  const costoElegido = useMemo(
    () => seleccionadas.reduce((sum, i) => sum + i.monto, 0),
    [seleccionadas],
  );

  const venta = costoElegido + profit;
  const margenPct = venta === 0 ? 0 : (profit / venta) * 100;

  const financiamientoPct = diasCredito / 2000;
  const financiamientoMonto = venta * financiamientoPct;
  const comisionMonto = profit * 0.10;
  const profitReal = profit - comisionMonto - financiamientoMonto;

  // ── Profit input ────────────────────────────────────────────────────────────
  const handleProfitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.-]/g, '');
    setProfit(raw === '' || raw === '-' ? 0 : parseFloat(raw) || 0);
  };

  return (
    <div className="space-y-5">
      {/* ── Encabezado ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-[16px] font-bold text-[#1F2937]">{concepto}</h3>
          <span className="text-[13px] text-text-muted">·</span>
          <span className="text-[13px] text-text-secondary">{ruta}</span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-[12px] text-text-muted">
          {tipoContenedor && <span>{tipoContenedor}</span>}
          {folio && <span className="font-mono">{folio}</span>}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-info-bg text-info-text font-medium">
            {totalRespondieron} de {totalSolicitados} proveedores respondieron
          </span>
        </div>
      </div>

      {/* ── Métricas ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {/* 1. Costo elegido — derivado de seleccionadas */}
        <MetricCard
          label="Costo elegido"
          valor={costoElegido === 0 ? '—' : formatMoneda(costoElegido, moneda)}
          sub={
            seleccionadas.length === 0
              ? 'Sin selección'
              : `${seleccionadas.length} proveedor${seleccionadas.length > 1 ? 'es' : ''}`
          }
          icon={DollarSign}
        />

        {/* 2. Profit — editable con % al lado */}
        <div className="rounded-[10px] border border-card-border bg-white p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Profit
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-text-muted text-[14px]">$</span>
            <input
              type="text"
              value={profit}
              onChange={handleProfitChange}
              className="text-[20px] font-bold tabular-nums text-text-primary bg-transparent border-b border-dashed border-gray-300 focus:border-brand focus:outline-none w-[90px] transition-colors"
            />
            <span className="text-[12px] text-text-muted">{moneda}</span>
            {costoElegido > 0 && (
              <span className="text-[12px] font-semibold text-text-secondary ml-1">
                {margenPct.toFixed(1)}%
              </span>
            )}
          </div>
          <span className="text-[11px] text-text-muted">
            Venta: {costoElegido === 0 ? '—' : formatMoneda(venta, moneda)}
          </span>
        </div>

        {/* 3. Venta total */}
        <MetricCard
          label="Venta"
          valor={costoElegido === 0 ? '—' : formatMoneda(venta, moneda)}
          sub={costoElegido > 0 ? `Margen ${margenPct.toFixed(1)}% sobre venta` : 'Sin selección'}
          icon={DollarSign}
        />

        {/* 4. Profit real — amber */}
        <MetricCard
          label="Profit real"
          valor={costoElegido === 0 ? '—' : formatMoneda(Math.round(profitReal), moneda)}
          sub={
            costoElegido > 0
              ? `-${formatMoneda(Math.round(comisionMonto), moneda)} com. · -${formatMoneda(Math.round(financiamientoMonto), moneda)} fin.`
              : 'Sin selección'
          }
          icon={Wallet}
          highlight
        />
      </div>

      {/* ── Desglose (solo con 2+ seleccionadas) ──────────────────────────── */}
      {seleccionadas.length >= 2 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-[8px] bg-brand/5 border border-brand/15 text-[12px]">
          <span className="font-semibold text-text-secondary shrink-0">Desglose:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {seleccionadas.map((s, i) => (
              <React.Fragment key={s.id}>
                {i > 0 && <span className="text-text-muted font-bold">+</span>}
                <span className="text-text-primary">
                  {s.proveedor}{' '}
                  <span className="font-bold tabular-nums">{formatMoneda(s.monto, moneda)}</span>
                </span>
              </React.Fragment>
            ))}
            <span className="text-text-muted font-bold">=</span>
            <span className="font-black text-brand tabular-nums">
              {formatMoneda(costoElegido, moneda)}
            </span>
          </div>
        </div>
      )}

      {/* ── Aviso sin selección ────────────────────────────────────────────── */}
      {seleccionadas.length === 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-[8px] bg-warning-bg border border-amber-200 text-[12px] text-warning-text">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Sin proveedores seleccionados — elige al menos uno para calcular métricas.
        </div>
      )}

      {/* ── Ordenamiento ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <ArrowUpDown className="w-3.5 h-3.5 text-text-muted" />
        <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide mr-1">Ordenar por</span>
        {(['precio', 'transito', 'freetime'] as SortKey[]).map(key => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
              sortKey === key
                ? 'bg-[#1F2937] text-white'
                : 'bg-neutral-bg text-text-secondary hover:bg-gray-200'
            }`}
          >
            {key === 'precio' ? 'Precio' : key === 'transito' ? 'Tránsito' : 'Free time'}
          </button>
        ))}
      </div>

      {/* ── Lista de tarjetas de proveedor ──────────────────────────────────── */}
      <div className="space-y-3">
        {sorted.map(cp => (
          <ProveedorCard
            key={cp.id}
            cp={cp}
            esSugerida={masBarata?.id === cp.id}
            esMasRapida={masRapida?.id === cp.id && masRapida?.id !== masBarata?.id}
            diffPrecio={cp.monto - (masBarata?.monto ?? 0)}
            moneda={moneda}
            onToggleSeleccionada={toggleSeleccionada}
            onToggleCandidata={toggleCandidata}
          />
        ))}
      </div>

      {/* ── Pie: sin respuesta ─────────────────────────────────────────────── */}
      {sinRespuesta.length > 0 && (
        <div className="border-t border-divider pt-4">
          <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-2">
            Sin respuesta ({sinRespuesta.length})
          </p>
          <div className="space-y-2">
            {sinRespuesta.map((sr, i) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 rounded-[8px] bg-neutral-bg">
                <div className="flex items-center gap-2">
                  <Ship className="w-3.5 h-3.5 text-text-muted" />
                  <span className="text-[12px] text-text-secondary">{sr.proveedor}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    sr.estadoRespuesta === 'declinada'
                      ? 'bg-danger-bg text-danger-text'
                      : 'bg-warning-bg text-warning-text'
                  }`}>
                    {sr.estadoRespuesta === 'declinada' ? 'Declinó' : 'Pendiente'}
                  </span>
                </div>
                {sr.estadoRespuesta === 'pendiente' && (
                  <button className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-medium text-text-secondary hover:bg-gray-200 transition-colors">
                    <Mail className="w-3 h-3" /> Recordar
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Datos mock para desarrollo (CP-3) ──────────────────────────────────────────

export const MOCK_COMPARATIVA_PROPS: ComparativaPricingProps = {
  concepto: 'Ocean Freight',
  ruta: 'Shanghái → Manzanillo',
  tipoContenedor: '2 × 40\' HC',
  folio: 'COT-2026-0004',
  moneda: 'USD',
  profitInicial: 800,
  diasCredito: 30,
  totalSolicitados: 8,
  cotizaciones: [
    {
      id: 'cmp-1',
      proveedor: 'Hapag-Lloyd',
      contacto: 'Roberto Díaz',
      monto: 2400,
      moneda: 'USD',
      tiempoTransito: '22 días',
      tiempoTransitoDias: 22,
      freeTimeDias: 14,
      vigencia: '2026-09-30',
      condiciones: 'Sujeto a espacio',
      seleccionada: true,
      candidata: false,
      estadoRespuesta: 'recibida',
      proveedorId: 'PRV-001',
    },
    {
      id: 'cmp-2',
      proveedor: 'Evergreen',
      contacto: 'Li Wei',
      monto: 2560,
      moneda: 'USD',
      tiempoTransito: '18 días',
      tiempoTransitoDias: 18,
      freeTimeDias: 21,
      vigencia: '2026-09-15',
      seleccionada: false,
      candidata: true,
      estadoRespuesta: 'recibida',
    },
    {
      id: 'cmp-3',
      proveedor: 'MSC',
      contacto: 'Andrea Rossi',
      monto: 2680,
      moneda: 'USD',
      tiempoTransito: '25 días',
      tiempoTransitoDias: 25,
      freeTimeDias: 14,
      vigencia: '2026-10-15',
      seleccionada: false,
      candidata: false,
      estadoRespuesta: 'recibida',
      esPreferido: true,
    },
    {
      id: 'cmp-4',
      proveedor: 'Maersk',
      contacto: 'Karen Jensen',
      monto: 2750,
      moneda: 'USD',
      tiempoTransito: '20 días',
      tiempoTransitoDias: 20,
      freeTimeDias: 14,
      vigencia: '2026-09-20',
      seleccionada: false,
      candidata: false,
      estadoRespuesta: 'recibida',
    },
    {
      id: 'cmp-5',
      proveedor: 'ONE (Ocean Network Express)',
      contacto: 'Takeshi Yamamoto',
      monto: 2900,
      moneda: 'USD',
      tiempoTransito: '24 días',
      tiempoTransitoDias: 24,
      freeTimeDias: 7,
      vigencia: '2026-07-01',
      seleccionada: false,
      candidata: false,
      estadoRespuesta: 'recibida',
      esVetado: true,
    },
  ],
  sinRespuesta: [
    { proveedor: 'CMA CGM', estadoRespuesta: 'pendiente' },
    { proveedor: 'COSCO Shipping', estadoRespuesta: 'pendiente' },
    { proveedor: 'Yang Ming', estadoRespuesta: 'declinada' },
  ],
};
