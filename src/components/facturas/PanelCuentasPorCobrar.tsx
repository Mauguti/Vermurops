/**
 * PanelCuentasPorCobrar.tsx
 *
 * Finanzas → Cuentas por cobrar: la contraparte de Cuentas por pagar.
 *
 * Facturas emitidas con su vencimiento, agrupadas por cliente con lo que
 * debe cada uno, y el registro de cobro desde aquí, sin entrar al embarque.
 * Los totales van POR MONEDA (§4.3). Un cobro registrado aquí alimenta el
 * fondeo que libera el pago al proveedor (1.1), igual que desde el embarque.
 *
 * Tarea 61 · Dos vistas sobre lo mismo: «Por cliente» —el agrupado de
 * siempre, que es el default— y «Por factura», `SpreadsheetTable` con
 * columnas configurables y vistas guardadas. El agrupado NO cabe en la tabla
 * genérica (una tabla plana no tiene encabezado de grupo con su total por
 * moneda), así que se conserva tal cual en vez de rehacerse peor.
 */

import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, Search, AlertTriangle, Banknote, Clock, CheckCircle2, X,
  Download, SlidersHorizontal,
} from 'lucide-react';
import type { FacturaCliente } from './FacturasData';
import type { DatosPagoAplicado, Pago } from '../../lib/pagos';
import {
  cartera, resumenCartera, agruparPorCliente,
  ETIQUETA_ESTADO_COBRO, type EstadoCobro, type FacturaEnCartera, type ClienteEnCartera,
} from '../../lib/cuentasPorCobrar';
import { coberturaDeFactura, type CoberturaDeFactura } from '../../lib/aplicarPago';
import ModalAplicarPago from './ModalAplicarPago';
import { formatearPorMoneda, type TotalPorMoneda } from '../../lib/sumarPorMoneda';
import { BANCOS_VERMUR, BANCO_COBRO_DEFAULT } from '../../lib/cuentasPago';
import {
  problemaAnticipo, type EmbarqueFondeable,
} from '../../lib/entradaDinero';
import { EnlaceEntidad } from '../ui/ficha/EnlaceEntidad';
import EstadoVacio from '../ui/EstadoVacio';
import SpreadsheetTable, { type VistaConfig } from '../table/SpreadsheetTable';
import VistaSelector from '../table/VistaSelector';
import { useVistasUsuario } from '../../hooks/useVistasUsuario';
import { usePreferenciasUsuario } from '../../hooks/usePreferenciasUsuario';
import { useAuth } from '../../auth/AuthContext';
import { columnasCartera, VISTA_DEFAULT_POR_COBRAR } from './carteraColumns';
import { csvDeVista, descargarCSV } from '../../lib/exportarVista';
import {
  FILTROS_POR_COBRAR_VACIOS, aplicarFiltrosPorCobrar, filtrosPorCobrarActivos,
  filtrosPorCobrarDesdeVista, filtrosPorCobrarParaVista, mesesDeVencimiento,
  type FiltrosPorCobrar,
} from '../../lib/filtrosFinanzas';

interface Props {
  facturas: FacturaCliente[];
  /** Tarea 67 · La lista unificada: un cobro viejo es un pago con una aplicación. */
  pagos: Pago[];
  puedeCobrar: boolean;
  /**
   * Tarea 70 · P4 · Registra UN pago repartido entre varias facturas (§7.1).
   * Reemplaza a `onCobrar`: un cobro contra una sola factura es este mismo
   * pago con una aplicación, así que no hay dos formularios ni dos escrituras.
   */
  onAplicarPago: (datos: DatosPagoAplicado) => Promise<void>;
  /**
   * Tarea 69 · P3 · Los embarques a los que se les puede anticipar dinero,
   * derivados de sus órdenes de pago abiertas. Vacío = no hay ninguna orden
   * esperando dinero, y entonces el anticipo no tiene a qué ligarse.
   */
  embarquesFondeables?: EmbarqueFondeable[];
  /**
   * Registra un anticipo sin factura. Es el formulario que vivía dentro de la
   * ficha de la orden de compra (bloque 1). Ausente = el rol no puede cobrar.
   */
  onRegistrarAnticipo?: (a: {
    embarqueId: string; embarqueFolio: string;
    clienteId: string; clienteNombre: string;
    monto: number; moneda: 'USD' | 'MXN';
    fechaDeposito: string; referencia: string;
  }) => Promise<void>;
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

const SELECT = 'bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-gray-700 outline-none focus:border-primario';

export default function PanelCuentasPorCobrar({
  facturas, pagos, puedeCobrar, onAplicarPago,
  embarquesFondeables = [], onRegistrarAnticipo, hoy,
}: Props) {
  const fecha = hoy ?? new Date().toISOString().slice(0, 10);
  const { user } = useAuth();
  const [filtros, setFiltros] = useState<FiltrosPorCobrar>(FILTROS_POR_COBRAR_VACIOS);
  const set = <K extends keyof FiltrosPorCobrar>(k: K, v: FiltrosPorCobrar[K]) =>
    setFiltros(f => ({ ...f, [k]: v }));
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [cobrando, setCobrando] = useState<FacturaEnCartera | null>(null);
  /* Tarea 70 · P4 · punto 4: qué pagos cubrieron una factura. La vista al
     revés —un pago con todas sus facturas— es P5. */
  const [coberturaAbierta, setCoberturaAbierta] = useState<string | null>(null);
  /** Tarea 69 · P3 · El anticipo sin factura, que antes vivía en la ficha de la OC. */
  const [anticipando, setAnticipando] = useState(false);

  /*
   * Tarea 61 · «Por cliente» sigue siendo el default: es la vista con la que
   * se pregunta «quién me debe», y es la que había. La preferencia se guarda
   * por usuario, como la de Cuentas por pagar (§4.24).
   */
  const { prefs, guardar } = usePreferenciasUsuario();
  const modo: 'cliente' | 'factura' = prefs.vistaCuentasPorCobrar ?? 'cliente';

  // La cartera completa (para los KPIs) y la filtrada (para la lista).
  const items = useMemo(() => cartera(facturas, pagos, fecha), [facturas, pagos, fecha]);
  const resumen = useMemo(() => resumenCartera(items, pagos, fecha), [items, pagos, fecha]);

  const visibles = useMemo(() => aplicarFiltrosPorCobrar(items, filtros), [items, filtros]);
  const grupos = useMemo(() => agruparPorCliente(visibles), [visibles]);
  const activos = filtrosPorCobrarActivos(filtros);

  /** Clientes y meses que existen en la cartera, para no ofrecer opciones vacías. */
  const clientesPresentes = useMemo(() => {
    const m = new Map<string, string>();
    items.forEach(i => { if (i.factura.clienteId) m.set(i.factura.clienteId, i.factura.clienteNombre); });
    return [...m.entries()].map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [items]);
  const meses = useMemo(() => mesesDeVencimiento(items), [items]);

  // ── Vistas guardadas (columnas + filtros) ─────────────────────────────────
  const { vistas, crearVista, actualizarVista, eliminarVista, vistaDefault } = useVistasUsuario('cuentasPorCobrar');
  const [vistaActivaId, setVistaActivaId] = useState<string | null>(null);
  const [vistaTabla, setVistaTabla] = useState<VistaConfig>(VISTA_DEFAULT_POR_COBRAR);

  const aplicarVista = useCallback((v: { columnas: VistaConfig['columnas']; ordenamiento?: VistaConfig['ordenamiento']; filtros?: Record<string, string | null> } | null) => {
    if (!v) {
      setVistaTabla(VISTA_DEFAULT_POR_COBRAR);
      setFiltros(FILTROS_POR_COBRAR_VACIOS);
      return;
    }
    setVistaTabla({ columnas: v.columnas, ordenamiento: v.ordenamiento ?? null });
    setFiltros(filtrosPorCobrarDesdeVista(v.filtros));
  }, []);

  const defaultCargada = useRef(false);
  useEffect(() => {
    if (defaultCargada.current || !vistaDefault || vistaActivaId !== null) return;
    defaultCargada.current = true;
    setVistaActivaId(vistaDefault.id);
    aplicarVista(vistaDefault);
  }, [vistaDefault, vistaActivaId, aplicarVista]);

  const seleccionarVista = (id: string | null) => {
    setVistaActivaId(id);
    aplicarVista(id ? vistas.find(v => v.id === id) ?? null : vistaDefault ?? null);
  };

  /*
   * La columna de acción solo se arma si hay con qué cobrar: un botón
   * «Registrar cobro» que no abre nada es peor que no tenerlo. Es la misma
   * condición con la que la tabla agrupada esconde su columna.
   */
  const columnas = useMemo(
    () => columnasCartera(puedeCobrar ? { onCobrar: setCobrando } : {}),
    [puedeCobrar],
  );

  const exportarCSV = () => {
    descargarCSV('cuentas_por_cobrar', csvDeVista(columnas, vistaTabla, visibles));
  };

  const toggle = (clave: string) => setAbiertos(prev => {
    const n = new Set(prev);
    if (n.has(clave)) n.delete(clave); else n.add(clave);
    return n;
  });

  const conteo = (e: EstadoCobro) => items.filter(i => i.estado === e).length;

  return (
    <div className="space-y-5">
      {/* ── Tarea 69 · P3 · bloque 1: la entrada de dinero vive AQUÍ ─────────
          Hasta aquí había dos formas de capturarla y ninguna en cobranza: el
          cobro contra una factura (en esta pantalla y en el embarque) y el
          «depósito del cliente» DENTRO de la ficha de la orden de compra —la
          cuenta por PAGAR. Gaby: «quien hace la solicitud de pago es
          Operaciones, pero quien recibe el dinero del cliente es
          Administración». El botón de arriba es el anticipo sin factura; el
          cobro contra una factura sigue en su renglón, donde ya estaba. */}
      {onRegistrarAnticipo && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500">
            El dinero que entra del cliente se registra aquí: contra su factura, desde el renglón;
            o como anticipo, cuando todavía no hay factura.
          </p>
          <button
            onClick={() => setAnticipando(true)}
            className="inline-flex items-center gap-1.5 bg-primario hover:bg-primario-hover text-white text-[11px] font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition-colors shadow-sm shrink-0"
          >
            <Banknote className="w-3.5 h-3.5" /> Registrar entrada de dinero
          </button>
        </div>
      )}

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
        ] as [FiltrosPorCobrar['estado'], string, number][]).map(([id, label, n]) => (
          <button
            key={id}
            onClick={() => set('estado', id)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
              filtros.estado === id ? 'bg-[#18181B] text-white border-[#18181B]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
          >
            {label} <span className="opacity-60">{n}</span>
          </button>
        ))}
        <div className="relative ml-auto w-full md:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={filtros.busqueda}
            onChange={e => set('busqueda', e.target.value)}
            placeholder="Factura, cliente o embarque…"
            className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 focus:border-primario rounded-lg text-xs outline-none"
          />
        </div>
      </div>

      {/* Tarea 61 · Los filtros que se guardan con la vista, el toggle de vista
          y el export con las columnas de la vista. */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={filtros.clienteId} onChange={e => set('clienteId', e.target.value)} className={`${SELECT} max-w-[220px]`}>
          <option value="">Cliente: todos</option>
          {clientesPresentes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>

        <select value={filtros.moneda} onChange={e => set('moneda', e.target.value as FiltrosPorCobrar['moneda'])} className={SELECT} title="Moneda de la factura">
          <option value="">Moneda: todas</option>
          <option value="MXN">MXN</option>
          <option value="USD">USD</option>
        </select>

        <select value={filtros.mesVencimiento} onChange={e => set('mesVencimiento', e.target.value)} className={SELECT} title="Mes de vencimiento de la factura">
          <option value="">Vence: cualquier mes</option>
          {meses.map(m => <option key={m} value={m}>Vence: {m}</option>)}
        </select>

        {activos > 0 && (
          <button
            onClick={() => setFiltros(FILTROS_POR_COBRAR_VACIOS)}
            className="text-[11px] font-bold text-gray-400 hover:text-primario flex items-center gap-1 px-2"
          >
            <X className="w-3 h-3" /> Limpiar
          </button>
        )}

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
            {([['cliente', 'Por cliente'], ['factura', 'Por factura']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => guardar('vistaCuentasPorCobrar', id)}
                aria-pressed={modo === id}
                className={`text-[11px] font-bold px-3 py-1.5 transition-colors ${
                  modo === id ? 'bg-primario text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Las columnas se eligen en la tabla; en el agrupado no hay columnas
              que configurar y el selector prometería lo que no puede dar. */}
          {modo === 'factura' && (
            <>
              <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" />
              <VistaSelector
                vistas={vistas}
                vistaActivaId={vistaActivaId}
                currentUserId={user?.uid || user?.id || ''}
                vistaActual={vistaTabla}
                filtrosActuales={filtrosPorCobrarParaVista(filtros)}
                labelDefault="Vista por defecto"
                onSeleccionar={seleccionarVista}
                onGuardar={async (nombre) => {
                  const id = await crearVista(nombre, vistaTabla.columnas, { filtros: filtrosPorCobrarParaVista(filtros) });
                  setVistaActivaId(id);
                }}
                onActualizar={(id, cambios) => actualizarVista(id, cambios)}
                onEliminar={async (id) => {
                  await eliminarVista(id);
                  if (vistaActivaId === id) seleccionarVista(null);
                }}
              />
            </>
          )}

          <button
            onClick={exportarCSV}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg border border-gray-200 shrink-0"
            title="Exporta lo filtrado, con las columnas de la vista"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Por factura: la tabla configurable */}
      {modo === 'factura' && (
        visibles.length === 0 ? (
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
          <div className="pt-8">
            <SpreadsheetTable<FacturaEnCartera>
              data={visibles}
              columns={columnas}
              pinnedColumnIds={['numero']}
              vista={vistaTabla}
              onVistaChange={setVistaTabla}
              maxHeight="calc(100vh - 460px)"
            />
            <p className="text-[10px] text-gray-400 mt-2 px-1">
              {visibles.length} factura{visibles.length !== 1 ? 's' : ''} · los totales por cliente y por moneda están en «Por cliente»
            </p>
          </div>
        )
      )}

      {/* Por cliente */}
      {modo === 'cliente' && (grupos.length === 0 ? (
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
              pagos={pagos}
              coberturaAbierta={coberturaAbierta}
              onToggleCobertura={id => setCoberturaAbierta(prev => (prev === id ? null : id))}
            />
          ))}
        </div>
      ))}

      {cobrando && (
        <ModalAplicarPago
          item={cobrando}
          items={items}
          hoy={fecha}
          por={{ uid: user?.uid || user?.id || '', nombre: user?.nombre || user?.email || '' }}
          onCancelar={() => setCobrando(null)}
          onConfirmar={async (datos) => { await onAplicarPago(datos); setCobrando(null); }}
        />
      )}

      {anticipando && onRegistrarAnticipo && (
        <ModalAnticipo
          embarques={embarquesFondeables}
          hoy={fecha}
          onCancelar={() => setAnticipando(false)}
          onConfirmar={async (a) => { await onRegistrarAnticipo(a); setAnticipando(false); }}
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

function GrupoCliente({ grupo, abierto, onToggle, puedeCobrar, onCobrar, pagos, coberturaAbierta, onToggleCobertura }: {
  grupo: ClienteEnCartera; abierto: boolean; onToggle: () => void; puedeCobrar: boolean;
  onCobrar: (i: FacturaEnCartera) => void;
  pagos: Pago[];
  coberturaAbierta: string | null;
  onToggleCobertura: (facturaId: string) => void;
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
            {grupo.facturas.map(i => {
              /* Tarea 70 · P4 · punto 4: desde la factura se ve qué pagos la
                 cubrieron. Se calcula al pintar el renglón porque el dato ya
                 está en memoria —las dos pantallas bajan `facturas` y los
                 pagos completos— y guardarlo sería una tercera verdad. */
              const cobertura = coberturaDeFactura(i.factura.id, pagos);
              const abiertaCobertura = coberturaAbierta === i.factura.id;
              const parcial = i.cobrado > 0 && i.estado !== 'cobrado';
              return (
              <Fragment key={i.factura.id}>
              <tr className="hover:bg-gray-50/50">
                <td className="px-4 py-2 font-mono font-semibold text-gray-800">{i.factura.numero}</td>
                <td className="px-3 py-2"><EnlaceEntidad tipo="embarque" id={i.factura.embarqueId}>{i.factura.embarqueFolio}</EnlaceEntidad></td>
                <td className="px-3 py-2 tabular-nums text-gray-500">{i.factura.fechaEmision}</td>
                <td className="px-3 py-2 tabular-nums">
                  {i.factura.fechaVencimiento}
                  {i.estado === 'vencido' && <span className="ml-1 text-[10px] font-bold text-red-600">+{i.diasVencido}d</span>}
                  {i.estado === 'por_vencer' && <span className="ml-1 text-[10px] font-bold text-amber-700">en {-i.diasVencido}d</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{i.factura.moneda} {money(i.factura.total)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                  {/* El cobrado es el enlace a los pagos que lo produjeron: es
                      la pregunta que se hace mirando ese número. */}
                  {cobertura.length > 0 ? (
                    <button
                      onClick={() => onToggleCobertura(i.factura.id)}
                      aria-expanded={abiertaCobertura}
                      className="tabular-nums font-semibold text-primario hover:underline"
                      title={`Ver los ${cobertura.length} pago(s) que cubrieron ${i.factura.numero}`}
                    >
                      {money(i.cobrado)}
                      <span className="ml-1 text-[9px] font-bold opacity-70">{cobertura.length} pago{cobertura.length !== 1 ? 's' : ''}</span>
                    </button>
                  ) : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-bold">{i.estado === 'cobrado' ? '—' : money(i.saldo)}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${ESTADO_CLS[i.estado]}`}>{ETIQUETA_ESTADO_COBRO[i.estado]}</span>
                  {/* Punto 3 · por cobrar → parcial → cobrada. «Parcial» va
                      JUNTO al estado y no en su lugar: el estado contesta
                      cuánto falta para el vencimiento, y lo parcial, cuánto
                      falta de dinero. Las dos preguntas se hacen a la vez. */}
                  {parcial && (
                    <span className="ml-1 px-2 py-0.5 rounded border text-[10px] font-bold bg-primario/10 text-primario border-primario/30">Parcial</span>
                  )}
                  {i.avisoMoneda && <span className="block text-[9px] text-amber-700 mt-0.5">{i.avisoMoneda}</span>}
                </td>
                {puedeCobrar && (
                  <td className="px-3 py-2 text-right">
                    {i.estado !== 'cobrado' && (
                      <button
                        onClick={() => onCobrar(i)}
                        className="text-[10px] font-bold uppercase tracking-wider text-primario hover:underline whitespace-nowrap"
                      >
                        Aplicar pago
                      </button>
                    )}
                  </td>
                )}
              </tr>
              {abiertaCobertura && (
                <tr className="bg-gray-50/60">
                  <td colSpan={puedeCobrar ? 9 : 8} className="px-4 py-2">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      Pagos que cubrieron {i.factura.numero}
                    </p>
                    <ul className="space-y-1">
                      {cobertura.map(c => <RenglonCobertura key={c.pagoId} c={c} />)}
                    </ul>
                  </td>
                </tr>
              )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Tarea 69 · P3 · El anticipo del cliente: dinero que entra ANTES de que haya
 * factura, y que es lo que libera el pago al proveedor (1.1).
 *
 * Es el formulario que vivía dentro de `FichaOC.tsx`, con tres diferencias
 * que son el punto de la tarea:
 *
 *  1. **El embarque se ELIGE.** Antes era el de la orden que se estaba
 *     mirando, así que había que entrar a una orden para poder capturar el
 *     dinero: la pantalla del pago al proveedor decidía a dónde entraba el
 *     cobro del cliente.
 *  2. **La moneda se ELIGE.** Antes se heredaba de la orden (`moneda:
 *     oc.moneda`), así que un depósito en pesos contra una orden en dólares
 *     se guardaba como dólares y nadie lo veía (§10.1 del plan).
 *  3. **La referencia es OPCIONAL.** «Aparece después del pago, no antes».
 */
function ModalAnticipo({ embarques, hoy, onCancelar, onConfirmar }: {
  embarques: EmbarqueFondeable[];
  hoy: string;
  onCancelar: () => void;
  onConfirmar: (a: {
    embarqueId: string; embarqueFolio: string;
    clienteId: string; clienteNombre: string;
    monto: number; moneda: 'USD' | 'MXN';
    fechaDeposito: string; referencia: string;
  }) => Promise<void>;
}) {
  const [embarqueId, setEmbarqueId] = useState(embarques.length === 1 ? embarques[0].embarqueId : '');
  const [monto, setMonto] = useState('');
  /* Sin default: elegirla por el usuario es lo que esta pantalla viene a
     arreglar. Un «MXN» precargado se aprieta por reflejo, igual que el botón
     del tipo de cambio de la 56. */
  const [moneda, setMoneda] = useState<'USD' | 'MXN' | ''>('');
  const [fecha, setFecha] = useState(hoy);
  const [referencia, setReferencia] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elegido = embarques.find(e => e.embarqueId === embarqueId) ?? null;
  const n = Number(monto);
  const problema = problemaAnticipo({ embarqueId, monto: n, moneda, fecha });

  const confirmar = async () => {
    if (problema || guardando || !elegido || !moneda) return;
    setGuardando(true); setError(null);
    try {
      await onConfirmar({
        embarqueId: elegido.embarqueId,
        embarqueFolio: elegido.embarqueFolio,
        clienteId: elegido.clienteId,
        clienteNombre: elegido.clienteNombre,
        monto: Math.round(n * 100) / 100,
        moneda,
        fechaDeposito: fecha,
        referencia: referencia.trim(),
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
            <h3 className="text-[14px] font-bold text-[#18181B]">Registrar entrada de dinero</h3>
            <p className="text-[11px] text-gray-500">Anticipo del cliente, sin factura todavía</p>
          </div>
          <button onClick={onCancelar} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-3">
          {embarques.length === 0 ? (
            /* No se ofrece un formulario que no puede guardar: sin una orden
               esperando dinero, el anticipo no tiene a qué ligarse. */
            <p className="text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              Ningún embarque tiene órdenes de pago esperando dinero. Un anticipo se liga al
              embarque y a la orden que fondea, así que primero Operaciones solicita el pago.
              Un cobro contra una factura sí se puede registrar desde su renglón.
            </p>
          ) : (
            <>
              <label className="block">
                <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">A qué embarque entra</span>
                <select value={embarqueId} onChange={e => setEmbarqueId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario bg-white">
                  <option value="">Elige el embarque…</option>
                  {embarques.map(e => (
                    <option key={e.embarqueId} value={e.embarqueId}>
                      {e.embarqueFolio} — {e.clienteNombre || 'sin cliente'} ({e.ordenesAbiertas} orden{e.ordenesAbiertas !== 1 ? 'es' : ''})
                    </option>
                  ))}
                </select>
              </label>

              {elegido && (
                <p className="text-[11px] text-gray-600">
                  Sus órdenes abiertas piden <strong>{formatearPorMoneda(elegido.comprometido, { vacio: '—' })}</strong>.
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Monto</span>
                  <input type="number" min={0} step="0.01" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario tabular-nums" />
                </label>
                <label className="block">
                  <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Moneda</span>
                  <select value={moneda} onChange={e => setMoneda(e.target.value as 'USD' | 'MXN' | '')}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario bg-white">
                    <option value="">Elige…</option>
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Fecha del depósito</span>
                  <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario" />
                </label>
                <label className="block">
                  <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Referencia (opcional)</span>
                  <input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Puede llegar después"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario font-mono" />
                </label>
              </div>

              {/* El modelo del depósito no tiene cuenta (§10.2 del plan): no se
                  ofrece un selector cuyo valor se tiraría al guardar. */}
              <p className="text-[10px] text-gray-400">
                La cuenta de Vermur se pregunta en el cobro contra factura; el anticipo
                todavía no la guarda. Entra al fondeo del embarque y libera sus pagos al proveedor.
              </p>

              {(problema || error) && <p className="text-[11px] text-red-600 font-semibold">{error ?? problema}</p>}
            </>
          )}
        </div>

        <div className="px-5 py-4 bg-gray-50/50 border-t border-gray-150 flex justify-end gap-2">
          <button onClick={onCancelar} className="text-xs font-bold text-gray-500 hover:text-gray-700 uppercase tracking-wider px-4 py-2">
            {embarques.length === 0 ? 'Cerrar' : 'Cancelar'}
          </button>
          {embarques.length > 0 && (
            <button onClick={confirmar} disabled={!!problema || guardando}
              className="bg-primario hover:bg-primario-hover text-white text-xs font-bold uppercase tracking-wider px-5 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">
              {guardando ? 'Guardando…' : 'Registrar entrada'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Un pago que cubrió esta factura (tarea 70 · punto 4).
 *
 * `legacy` marca los movimientos que vienen de `cobros/` o de
 * `depositosCliente/`: no tienen folio de pago ni ficha propia —su folio es
 * su propio id— y por eso se dicen así en vez de enseñarse como un pago
 * nuevo que se puede abrir. La ficha del pago llega en P5.
 */
function RenglonCobertura({ c }: { c: CoberturaDeFactura }) {
  return (
    <li className="text-[11px] text-gray-700 flex flex-wrap items-baseline gap-x-2">
      <span className="font-mono font-bold text-gray-800">{c.folio}</span>
      <span className="tabular-nums text-gray-500">{c.fecha}</span>
      <span className="tabular-nums font-bold">{c.moneda} {money(c.monto)}</span>
      <span className="text-gray-400">{c.banco || 'sin cuenta'}</span>
      {c.referencia
        ? <span className="font-mono text-gray-400">ref {c.referencia}</span>
        : <span className="text-gray-300 italic">sin referencia</span>}
      {c.compartido && (
        <span className="text-[9px] font-bold uppercase tracking-wider text-primario">
          el pago cubrió más facturas
        </span>
      )}
      {c.legacy && (
        <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400" title="Capturado antes de que el pago fuera una entidad; no tiene folio de pago propio.">
          registro anterior
        </span>
      )}
    </li>
  );
}
