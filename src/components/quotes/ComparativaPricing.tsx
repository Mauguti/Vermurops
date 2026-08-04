// ============================================================
// ComparativaPricing.tsx — Comparativa de proveedores por concepto
//
// CP-2: Visual con datos mock. Sin lógica de selección (CP-3).
// Diseño: tarjetas minimalistas, la más barata arriba como sugerida,
// badges contextuales, métricas en tiempo real.
// ============================================================

import React, { useState, useMemo } from 'react';
import {
  ArrowUpDown, Clock, Ship, TrendingDown, TrendingUp, Star,
  Ban, AlertTriangle, Mail, DollarSign, BarChart2, Percent, Wallet,
} from 'lucide-react';
import type { CotizacionProveedor, EstadoRespuesta } from './QuotesData';

// ─── Tipos internos ─────────────────────────────────────────────────────────────

type SortKey = 'precio' | 'transito' | 'freetime';

interface ProveedorComparativa extends CotizacionProveedor {
  tiempoTransitoDias?: number;
  esPreferido?: boolean;
  esVetado?: boolean;
}

interface ComparativaPricingProps {
  concepto: string;
  ruta: string;
  tipoContenedor?: string;
  folio?: string;
  moneda: 'USD' | 'MXN';
  cotizaciones: ProveedorComparativa[];
  sinRespuesta: { proveedor: string; estadoRespuesta: EstadoRespuesta }[];
  totalSolicitados: number;
  // Métricas (se recalcularán en CP-3 con selección real)
  costoElegido: number;
  profitAbsoluto: number;
  diasCredito: number;
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
}

function ProveedorCard({ cp, esSugerida, esMasRapida, diffPrecio, moneda }: ProveedorCardProps) {
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

      {/* Botón de acción */}
      <div className="flex justify-end mt-3">
        {vencida ? (
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[11px] font-medium bg-warning-bg text-warning-text hover:bg-amber-100 transition-colors">
            <Mail className="w-3 h-3" /> Repedir
          </button>
        ) : (
          <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[11px] font-medium transition-colors ${
            cp.seleccionada
              ? 'bg-brand text-white hover:bg-brand-hover'
              : 'bg-neutral-bg text-text-secondary hover:bg-gray-200'
          }`}>
            {cp.seleccionada ? 'Elegida' : 'Elegir'}
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
  cotizaciones,
  sinRespuesta,
  totalSolicitados,
  costoElegido,
  profitAbsoluto,
  diasCredito,
}: ComparativaPricingProps) {
  const [sortKey, setSortKey] = useState<SortKey>('precio');

  const totalRespondieron = cotizaciones.length;

  // ── Ordenamiento ──────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const arr = [...cotizaciones];
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
  }, [cotizaciones, sortKey]);

  // La más barata siempre es la primera del ordenamiento por precio
  const masBarata = useMemo(() => {
    return [...cotizaciones].sort((a, b) => a.monto - b.monto)[0];
  }, [cotizaciones]);

  // La más rápida
  const masRapida = useMemo(() => {
    const conTT = cotizaciones.filter(c => parseTTDias(c.tiempoTransito, c.tiempoTransitoDias) != null);
    if (conTT.length === 0) return null;
    return conTT.reduce((min, c) => {
      const dias = parseTTDias(c.tiempoTransito, c.tiempoTransitoDias)!;
      const minDias = parseTTDias(min.tiempoTransito, min.tiempoTransitoDias)!;
      return dias < minDias ? c : min;
    });
  }, [cotizaciones]);

  // ── Cálculos de métricas ──────────────────────────────────────────────────
  const venta = costoElegido + profitAbsoluto;
  const margenPct = venta === 0 ? 0 : (profitAbsoluto / venta) * 100;

  const financiamientoPct = diasCredito / 2000;
  const financiamientoMonto = venta * financiamientoPct;
  const comisionMonto = profitAbsoluto * 0.10;
  const profitReal = profitAbsoluto - comisionMonto - financiamientoMonto;

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
          {tipoContenedor && (
            <span>{tipoContenedor}</span>
          )}
          {folio && (
            <span className="font-mono">{folio}</span>
          )}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-info-bg text-info-text font-medium">
            {totalRespondieron} de {totalSolicitados} proveedores respondieron
          </span>
        </div>
      </div>

      {/* ── Métricas ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard
          label="Costo elegido"
          valor={formatMoneda(costoElegido, moneda)}
          icon={DollarSign}
        />
        <MetricCard
          label="Venta"
          valor={formatMoneda(venta, moneda)}
          sub={`Profit: ${formatMoneda(profitAbsoluto, moneda)}`}
          icon={BarChart2}
        />
        <MetricCard
          label="Margen"
          valor={`${margenPct.toFixed(1)}%`}
          sub="sobre venta"
          icon={Percent}
        />
        <MetricCard
          label="Profit real"
          valor={formatMoneda(Math.round(profitReal), moneda)}
          sub={`-${formatMoneda(Math.round(comisionMonto), moneda)} comisión · -${formatMoneda(Math.round(financiamientoMonto), moneda)} financ.`}
          icon={Wallet}
          highlight
        />
      </div>

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

// ─── Datos mock para desarrollo (CP-2) ────────────────────────────────────────

export const MOCK_COMPARATIVA_PROPS: ComparativaPricingProps = {
  concepto: 'Ocean Freight',
  ruta: 'Shanghái → Manzanillo',
  tipoContenedor: '2 × 40\' HC',
  folio: 'COT-2026-0004',
  moneda: 'USD',
  costoElegido: 2400,
  profitAbsoluto: 800,
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
      esPreferido: false,
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
      candidata: true,
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
