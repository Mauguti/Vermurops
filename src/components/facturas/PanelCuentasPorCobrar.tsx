/**
 * PanelCuentasPorCobrar.tsx
 *
 * Finanzas → Cuentas por cobrar: la contraparte de Cuentas por pagar.
 *
 * Facturas emitidas con su vencimiento, agrupadas por cliente con lo que
 * debe cada uno, y el registro de cobro desde aquí, sin entrar al embarque.
 * Los totales van POR MONEDA (§4.3). Un cobro registrado aquí alimenta el
 * fondeo que libera el pago al proveedor (1.1), igual que desde el embarque.
 */

import React, { useMemo, useState } from 'react';
import {
  ChevronDown, ChevronRight, Search, AlertTriangle, Banknote, Clock, CheckCircle2, X,
} from 'lucide-react';
import type { FacturaCliente, CobroCliente } from './FacturasData';
import {
  cartera, resumenCartera, agruparPorCliente, montoCobrable,
  ETIQUETA_ESTADO_COBRO, type EstadoCobro, type FacturaEnCartera, type ClienteEnCartera,
} from '../../lib/cuentasPorCobrar';
import { formatearPorMoneda, type TotalPorMoneda } from '../../lib/sumarPorMoneda';
import { BANCOS_VERMUR } from '../../lib/cuentasPago';
import { EnlaceEntidad } from '../ui/ficha/EnlaceEntidad';
import EstadoVacio from '../ui/EstadoVacio';

interface Props {
  facturas: FacturaCliente[];
  cobros: CobroCliente[];
  puedeCobrar: boolean;
  onCobrar: (c: Omit<CobroCliente, 'id' | 'registradoPor' | 'activo' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  /** Inyectable para pruebas; default hoy. */
  hoy?: string;
}

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_CLS: Record<EstadoCobro, string> = {
  por_cobrar: 'bg-gray-100 text-gray-700 border-gray-200',
  por_vencer: 'bg-amber-50 text-amber-800 border-amber-300',
  vencido: 'bg-red-50 text-red-700 border-red-200',
  cobrado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

type Filtro = 'abiertas' | EstadoCobro | 'todas';

export default function PanelCuentasPorCobrar({ facturas, cobros, puedeCobrar, onCobrar, hoy }: Props) {
  const fecha = hoy ?? new Date().toISOString().slice(0, 10);
  const [filtro, setFiltro] = useState<Filtro>('abiertas');
  const [busqueda, setBusqueda] = useState('');
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [cobrando, setCobrando] = useState<FacturaEnCartera | null>(null);

  // La cartera completa (para los KPIs) y la filtrada (para la lista).
  const items = useMemo(() => cartera(facturas, cobros, fecha), [facturas, cobros, fecha]);
  const resumen = useMemo(() => resumenCartera(items, cobros, fecha), [items, cobros, fecha]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return items.filter(i => {
      if (filtro === 'abiertas' && i.estado === 'cobrado') return false;
      if (filtro !== 'abiertas' && filtro !== 'todas' && i.estado !== filtro) return false;
      if (q && !`${i.factura.numero} ${i.factura.clienteNombre} ${i.factura.embarqueFolio}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, filtro, busqueda]);

  const grupos = useMemo(() => agruparPorCliente(visibles), [visibles]);

  const toggle = (clave: string) => setAbiertos(prev => {
    const n = new Set(prev);
    if (n.has(clave)) n.delete(clave); else n.add(clave);
    return n;
  });

  const conteo = (e: EstadoCobro) => items.filter(i => i.estado === e).length;

  return (
    <div className="space-y-5">
      {/* KPIs por moneda */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Kpi icono={<Banknote className="w-4 h-4 text-gray-400" />} titulo="Por cobrar" total={resumen.porCobrar}
          pie={`${resumen.facturasAbiertas} factura${resumen.facturasAbiertas !== 1 ? 's' : ''} abierta${resumen.facturasAbiertas !== 1 ? 's' : ''}`} />
        <Kpi icono={<AlertTriangle className="w-4 h-4 text-red-500" />} titulo="Vencido" total={resumen.vencido} tono="peligro"
          pie={`${resumen.facturasVencidas} vencida${resumen.facturasVencidas !== 1 ? 's' : ''}`} />
        <Kpi icono={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} titulo="Cobrado del mes" total={resumen.cobradoDelMes} tono="exito"
          pie={fecha.slice(0, 7)} />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          ['abiertas', 'Abiertas', items.filter(i => i.estado !== 'cobrado').length],
          ['vencido', 'Vencidas', conteo('vencido')],
          ['por_vencer', 'Por vencer', conteo('por_vencer')],
          ['por_cobrar', 'Por cobrar', conteo('por_cobrar')],
          ['cobrado', 'Cobradas', conteo('cobrado')],
          ['todas', 'Todas', items.length],
        ] as [Filtro, string, number][]).map(([id, label, n]) => (
          <button
            key={id}
            onClick={() => setFiltro(id)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
              filtro === id ? 'bg-[#18181B] text-white border-[#18181B]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
          >
            {label} <span className="opacity-60">{n}</span>
          </button>
        ))}
        <div className="relative ml-auto w-full md:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Factura, cliente o embarque…"
            className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 focus:border-primario rounded-lg text-xs outline-none"
          />
        </div>
      </div>

      {/* Por cliente */}
      {grupos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-150">
          <EstadoVacio
            variante="plano"
            icono={<Banknote className="w-5 h-5" />}
            titulo={items.length === 0 ? 'No hay facturas registradas' : 'Nada con ese filtro'}
            detalle={items.length === 0
              ? 'Las facturas se registran desde la pestaña Facturas del embarque. Al registrarlas aparecen aquí con su vencimiento.'
              : 'Prueba con otro estado u otra búsqueda.'}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {grupos.map(g => (
            <GrupoCliente
              key={g.clave}
              grupo={g}
              abierto={abiertos.has(g.clave) || grupos.length <= 3}
              onToggle={() => toggle(g.clave)}
              puedeCobrar={puedeCobrar}
              onCobrar={setCobrando}
            />
          ))}
        </div>
      )}

      {cobrando && (
        <ModalCobro
          item={cobrando}
          hoy={fecha}
          onCancelar={() => setCobrando(null)}
          onConfirmar={async (c) => { await onCobrar(c); setCobrando(null); }}
        />
      )}
    </div>
  );
}

function Kpi({ icono, titulo, total, pie, tono }: {
  icono: React.ReactNode; titulo: string; total: TotalPorMoneda; pie: string; tono?: 'peligro' | 'exito';
}) {
  const cls = tono === 'peligro' ? 'text-red-600' : tono === 'exito' ? 'text-emerald-600' : 'text-[#18181B]';
  return (
    <div className="bg-white rounded-xl border border-gray-150 shadow-2xs p-4">
      <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{icono}{titulo}</div>
      {/* Nunca un solo número: «USD 1,500.00 + MXN 8,000.00» */}
      <p className={`text-lg font-black tabular-nums mt-1 ${cls}`}>{formatearPorMoneda(total, { vacio: '—' })}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{pie}</p>
    </div>
  );
}

function GrupoCliente({ grupo, abierto, onToggle, puedeCobrar, onCobrar }: {
  grupo: ClienteEnCartera; abierto: boolean; onToggle: () => void; puedeCobrar: boolean;
  onCobrar: (i: FacturaEnCartera) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-150 shadow-2xs overflow-hidden">
      {/* div y no button: adentro va el enlace a la ficha del cliente, y un
          botón dentro de otro botón es HTML inválido. */}
      <div
        role="button" tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 text-left cursor-pointer"
      >
        {abierto ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-[#18181B] truncate">
            {grupo.clienteId
              ? <span onClick={e => e.stopPropagation()}><EnlaceEntidad tipo="cliente" id={grupo.clienteId} title={`Abrir la ficha de ${grupo.clienteNombre}`}><span className="font-sans">{grupo.clienteNombre}</span></EnlaceEntidad></span>
              : grupo.clienteNombre}
          </p>
          <p className="text-[10px] text-gray-400">{grupo.facturas.length} factura{grupo.facturas.length !== 1 ? 's' : ''}
            {grupo.maxDiasVencido > 0 ? ` · hasta ${grupo.maxDiasVencido} días de atraso` : ''}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] font-bold text-gray-400 uppercase">Debe</p>
          <p className="text-[13px] font-black tabular-nums text-[#18181B]">{formatearPorMoneda(grupo.porCobrar, { vacio: '—' })}</p>
          {formatearPorMoneda(grupo.vencido, { vacio: '' }) && (
            <p className="text-[11px] font-bold tabular-nums text-red-600">vencido {formatearPorMoneda(grupo.vencido)}</p>
          )}
        </div>
      </div>

      {abierto && (
        <table className="w-full text-[12px] border-t border-gray-100">
          <thead>
            <tr className="bg-gray-50/70 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
              <th className="px-4 py-2 text-left">Factura</th>
              <th className="px-3 py-2 text-left">Embarque</th>
              <th className="px-3 py-2 text-left">Emisión</th>
              <th className="px-3 py-2 text-left">Vence</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Cobrado</th>
              <th className="px-3 py-2 text-right">Resta</th>
              <th className="px-3 py-2 text-left">Estado</th>
              {puedeCobrar && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {grupo.facturas.map(i => (
              <tr key={i.factura.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-2 font-mono font-semibold text-gray-800">{i.factura.numero}</td>
                <td className="px-3 py-2"><EnlaceEntidad tipo="embarque" id={i.factura.embarqueId}>{i.factura.embarqueFolio}</EnlaceEntidad></td>
                <td className="px-3 py-2 tabular-nums text-gray-500">{i.factura.fechaEmision}</td>
                <td className="px-3 py-2 tabular-nums">
                  {i.factura.fechaVencimiento}
                  {i.estado === 'vencido' && <span className="ml-1 text-[10px] font-bold text-red-600">+{i.diasVencido}d</span>}
                  {i.estado === 'por_vencer' && <span className="ml-1 text-[10px] font-bold text-amber-700">en {-i.diasVencido}d</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{i.factura.moneda} {money(i.factura.total)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">{i.cobrado > 0 ? money(i.cobrado) : '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold">{i.estado === 'cobrado' ? '—' : money(i.saldo)}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${ESTADO_CLS[i.estado]}`}>{ETIQUETA_ESTADO_COBRO[i.estado]}</span>
                  {i.avisoMoneda && <span className="block text-[9px] text-amber-700 mt-0.5">{i.avisoMoneda}</span>}
                </td>
                {puedeCobrar && (
                  <td className="px-3 py-2 text-right">
                    {i.estado !== 'cobrado' && (
                      <button
                        onClick={() => onCobrar(i)}
                        className="text-[10px] font-bold uppercase tracking-wider text-primario hover:underline whitespace-nowrap"
                      >
                        Registrar cobro
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ModalCobro({ item, hoy, onCancelar, onConfirmar }: {
  item: FacturaEnCartera; hoy: string; onCancelar: () => void;
  onConfirmar: (c: Omit<CobroCliente, 'id' | 'registradoPor' | 'activo' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}) {
  const f = item.factura;
  const [monto, setMonto] = useState(String(item.saldo));
  const [fechaCobro, setFechaCobro] = useState(hoy);
  const [banco, setBanco] = useState(BANCOS_VERMUR[0].nombre);
  const [referencia, setReferencia] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = Number(monto);
  const problema = montoCobrable(item, n, f.moneda) ?? (!referencia.trim() ? 'Captura la referencia bancaria.' : null);
  const parcial = n > 0 && n < item.saldo - 1;

  const confirmar = async () => {
    if (problema || guardando) return;
    setGuardando(true); setError(null);
    try {
      await onConfirmar({
        facturaId: f.id, facturaNumero: f.numero,
        embarqueId: f.embarqueId, embarqueFolio: f.embarqueFolio,
        clienteId: f.clienteId, clienteNombre: f.clienteNombre,
        monto: Math.round(n * 100) / 100, moneda: f.moneda,
        fechaCobro, banco, referencia: referencia.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-150 flex items-center justify-between bg-gray-50/50">
          <div>
            <h3 className="text-[14px] font-bold text-[#18181B]">Registrar cobro · {f.numero}</h3>
            <p className="text-[11px] text-gray-500">{f.clienteNombre} · resta {f.moneda} {money(item.saldo)}</p>
          </div>
          <button onClick={onCancelar} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Monto ({f.moneda})</span>
              <input type="number" min={0} step="0.01" value={monto} onChange={e => setMonto(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario tabular-nums" />
            </label>
            <label className="block">
              <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Fecha</span>
              <input type="date" value={fechaCobro} onChange={e => setFechaCobro(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario" />
            </label>
            <label className="block">
              <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Banco de Vermur</span>
              <select value={banco} onChange={e => setBanco(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario bg-white">
                {BANCOS_VERMUR.map(b => <option key={b.id} value={b.nombre}>{b.nombre}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Referencia</span>
              <input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Ref. bancaria"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario font-mono" />
            </label>
          </div>
          {parcial && !problema && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Cobro parcial: quedarán {f.moneda} {money(item.saldo - n)} por cobrar. La factura seguirá abierta.
            </p>
          )}
          {(problema || error) && <p className="text-[11px] text-red-600 font-semibold">{error ?? problema}</p>}
          <p className="text-[10px] text-gray-400">Este cobro fondea las órdenes de compra del embarque {f.embarqueFolio}.</p>
        </div>
        <div className="px-5 py-4 bg-gray-50/50 border-t border-gray-150 flex justify-end gap-2">
          <button onClick={onCancelar} className="text-xs font-bold text-gray-500 hover:text-gray-700 uppercase tracking-wider px-4 py-2">Cancelar</button>
          <button onClick={confirmar} disabled={!!problema || guardando}
            className="bg-primario hover:bg-primario-hover text-white text-xs font-bold uppercase tracking-wider px-5 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">
            {guardando ? 'Guardando…' : 'Registrar cobro'}
          </button>
        </div>
      </div>
    </div>
  );
}
