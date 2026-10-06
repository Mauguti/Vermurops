/**
 * PanelListaPagos.tsx — tarea 72 · P5, §7.3 del plan de pagos
 *
 * Finanzas → Pagos: cada movimiento de dinero del cliente con su folio
 * `PAG-…`, lo aplicado y lo que queda a favor. `SpreadsheetTable` con vistas
 * guardables y filtros que se guardan con la vista, como Cuentas por cobrar
 * (tarea 61).
 *
 * Lista la lista UNIFICADA de la tarea 67: un cobro o un depósito viejo se ve
 * igual que un pago nuevo, marcado «Registro anterior». Los pagos anulados no
 * se esconden: salen con el filtro «Anulados» (o «Todos»).
 *
 * Tarea 80 · Los dos lados: el cliente que paga y Vermur que paga a un
 * proveedor (P6). Un filtro Cliente / Proveedor los separa, y los totales van
 * por lado: «entrado» y «pagado» no se suman entre sí.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Download, SlidersHorizontal, Banknote } from 'lucide-react';
import type { FacturaCliente } from '../facturas/FacturasData';
import type { AplicacionPago, Pago } from '../../lib/pagos';
import type { OrdenCompra } from '../ordenesCompra/OrdenesCompraData';
import type { RolOC } from '../../lib/stateMachineOC';
import { cartera } from '../../lib/cuentasPorCobrar';
import { claveDeCliente, facturasAplicables } from '../../lib/aplicarPago';
import {
  FILTROS_PAGOS_VACIOS, aplicarFiltrosPagos, estadoDePago, filtrosPagosActivos,
  filtrosPagosDesdeVista, filtrosPagosParaVista, mesesDePagos, totalesDePagos,
  ETIQUETA_ESTADO_PAGO, type FiltrosPagos, type FiltroEstadoPago,
} from '../../lib/reversaPagos';
import { formatearPorMoneda } from '../../lib/sumarPorMoneda';
import { csvDeVista, descargarCSV } from '../../lib/exportarVista';
import SpreadsheetTable, { type VistaConfig } from '../table/SpreadsheetTable';
import VistaSelector from '../table/VistaSelector';
import EstadoVacio from '../ui/EstadoVacio';
import ModalAplicarPago from '../facturas/ModalAplicarPago';
import FichaPago from './FichaPago';
import { columnasPagos, VISTA_DEFAULT_PAGOS } from './pagosColumns';
import { useVistasUsuario } from '../../hooks/useVistasUsuario';
import { useEmbarques } from '../../hooks/useEmbarques';
import { useAuth } from '../../auth/AuthContext';

interface Props {
  facturas: FacturaCliente[];
  /** La lista unificada (tarea 67): nuevos y viejos. */
  pagos: Pago[];
  /** `cobro.registrar`: aplicar saldo, quitar una aplicación y anular. */
  puedeEditar: boolean;
  /** Tarea 80 · Quien registra el pago a proveedor es quien lo anula (Administración, admin). */
  puedeAnularProveedor?: boolean;
  ordenes?: OrdenCompra[];
  rolOC?: RolOC;
  onQuitarAplicacion: (pagoId: string, destinoId: string, motivo: string) => Promise<void>;
  onAnularPago: (pago: Pago, motivo: string) => Promise<void>;
  onAplicarSaldo: (pagoId: string, aplicaciones: AplicacionPago[], embarqueIds: string[]) => Promise<void>;
  hoy?: string;
}

const SELECT = 'bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-gray-700 outline-none focus:border-primario';

export default function PanelListaPagos({
  facturas, pagos, puedeEditar, puedeAnularProveedor = false, ordenes = [], rolOC, onQuitarAplicacion, onAnularPago, onAplicarSaldo, hoy,
}: Props) {
  const fecha = hoy ?? new Date().toISOString().slice(0, 10);
  const { user } = useAuth();
  const { embarques } = useEmbarques();
  const [filtros, setFiltros] = useState<FiltrosPagos>(FILTROS_PAGOS_VACIOS);
  const set = <K extends keyof FiltrosPagos>(k: K, v: FiltrosPagos[K]) => setFiltros(f => ({ ...f, [k]: v }));
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [aplicandoId, setAplicandoId] = useState<string | null>(null);

  // La ficha se DERIVA del listener, no se guarda: al quitar una aplicación
  // la pantalla muestra el pago nuevo sin recargar.
  const abierto = abiertoId ? pagos.find(p => p.id === abiertoId) ?? null : null;
  const aplicando = aplicandoId ? pagos.find(p => p.id === aplicandoId) ?? null : null;

  const visibles = useMemo(() => aplicarFiltrosPagos(pagos, filtros), [pagos, filtros]);
  const totalesCliente = useMemo(() => totalesDePagos(visibles.filter(p => p.lado !== 'proveedor')), [visibles]);
  const totalesProveedor = useMemo(() => totalesDePagos(visibles.filter(p => p.lado === 'proveedor')), [visibles]);
  const hayCliente = visibles.some(p => p.lado !== 'proveedor');
  const hayProveedor = visibles.some(p => p.lado === 'proveedor');
  const activos = filtrosPagosActivos(filtros);
  const conteo = (e: FiltroEstadoPago) => aplicarFiltrosPagos(pagos, { ...FILTROS_PAGOS_VACIOS, estado: e }).length;

  const clientesPresentes = useMemo(() => {
    const m = new Map<string, string>();
    pagos.forEach(p => { if (p.terceroId && (!filtros.lado || p.lado === filtros.lado)) m.set(p.terceroId, p.terceroNombre); });
    return [...m.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [pagos, filtros.lado]);
  const meses = useMemo(() => mesesDePagos(pagos), [pagos]);

  // La cartera con los pagos ya aplicados: las facturas con saldo a las que se puede aplicar.
  const items = useMemo(() => cartera(facturas, pagos, fecha), [facturas, pagos, fecha]);
  const hayFacturasPara = (p: Pago) =>
    facturasAplicables(items, { clienteClave: claveDeCliente({ clienteId: p.terceroId, clienteNombre: p.terceroNombre }), moneda: p.moneda }).length > 0;

  const bitacorasDe = (p: Pago) =>
    (p.embarqueIds ?? []).map(id => embarques.find(e => e.id === id)?.bitacora);

  // ── Vistas guardadas (columnas + filtros) ─────────────────────────────────
  const { vistas, crearVista, actualizarVista, eliminarVista, vistaDefault } = useVistasUsuario('pagos');
  const [vistaActivaId, setVistaActivaId] = useState<string | null>(null);
  const [vistaTabla, setVistaTabla] = useState<VistaConfig>(VISTA_DEFAULT_PAGOS);

  const aplicarVista = useCallback((v: { columnas: VistaConfig['columnas']; ordenamiento?: VistaConfig['ordenamiento']; filtros?: Record<string, string | null> } | null) => {
    if (!v) { setVistaTabla(VISTA_DEFAULT_PAGOS); setFiltros(FILTROS_PAGOS_VACIOS); return; }
    setVistaTabla({ columnas: v.columnas, ordenamiento: v.ordenamiento ?? null });
    setFiltros(filtrosPagosDesdeVista(v.filtros));
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

  const columnas = useMemo(() => columnasPagos({ onAbrir: p => setAbiertoId(p.id) }), []);
  const exportarCSV = () => descargarCSV('pagos', csvDeVista(columnas, vistaTabla, visibles));

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-gray-500">
        Cada movimiento de dinero, con su folio: lo que el cliente pagó y lo que Vermur pagó a sus proveedores.
        Ahí se ve a qué facturas u órdenes se aplicó, y desde la ficha se corrige: aplicar el saldo, quitar una
        aplicación o anular el pago (uno a proveedor devuelve sus órdenes a «autorizada»).
      </p>

      {/* Totales por moneda (§4.3): nunca un total mezclado. */}
      {(hayCliente || !hayProveedor) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]" data-testid="totales-pagos">
          <Total t="Entrado" v={formatearPorMoneda(totalesCliente.entrado)} />
          <Total t="Aplicado a facturas" v={formatearPorMoneda(totalesCliente.aplicado)} />
          <Total t="A favor del cliente" v={formatearPorMoneda(totalesCliente.aFavor)} destacado />
        </div>
      )}
      {hayProveedor && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]" data-testid="totales-pagos-proveedor">
          <Total t="Pagado a proveedores" v={formatearPorMoneda(totalesProveedor.entrado)} />
          <Total t="Aplicado a órdenes" v={formatearPorMoneda(totalesProveedor.aplicado)} />
          <Total t="Sin aplicar" v={formatearPorMoneda(totalesProveedor.aFavor)} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {([
          ['vigentes', 'Vigentes'],
          ['sin_aplicar', ETIQUETA_ESTADO_PAGO.sin_aplicar],
          ['parcial', ETIQUETA_ESTADO_PAGO.parcial],
          ['aplicado', ETIQUETA_ESTADO_PAGO.aplicado],
          ['anulado', 'Anulados'],
          ['todos', 'Todos'],
        ] as [FiltroEstadoPago, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => set('estado', id)}
            aria-pressed={filtros.estado === id}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
              filtros.estado === id ? 'bg-[#18181B] text-white border-[#18181B]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
          >
            {label} <span className="opacity-60">{conteo(id)}</span>
          </button>
        ))}
        <div className="relative ml-auto w-full md:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={filtros.busqueda} onChange={e => set('busqueda', e.target.value)}
            placeholder="Folio, cliente, referencia o factura…"
            className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 focus:border-primario rounded-lg text-xs outline-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={filtros.lado} onChange={e => set('lado', e.target.value as FiltrosPagos['lado'])} className={SELECT} title="Quién movió el dinero" data-testid="filtro-lado-pago">
          <option value="">Cliente y proveedor</option>
          <option value="cliente">Cliente (entradas)</option>
          <option value="proveedor">Proveedor (salidas)</option>
        </select>
        <select value={filtros.clienteId} onChange={e => set('clienteId', e.target.value)} className={`${SELECT} max-w-[220px]`}>
          <option value="">Cliente / proveedor: todos</option>
          {clientesPresentes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select value={filtros.moneda} onChange={e => set('moneda', e.target.value as FiltrosPagos['moneda'])} className={SELECT} title="Moneda del pago">
          <option value="">Moneda: todas</option>
          <option value="MXN">MXN</option>
          <option value="USD">USD</option>
        </select>
        <select value={filtros.mes} onChange={e => set('mes', e.target.value)} className={SELECT} title="Mes en que se movió el dinero">
          <option value="">Fecha: cualquier mes</option>
          {meses.map(m => <option key={m} value={m}>Fecha: {m}</option>)}
        </select>
        {activos > 0 && (
          <button onClick={() => setFiltros(FILTROS_PAGOS_VACIOS)} className="text-[11px] font-bold text-gray-400 hover:text-primario flex items-center gap-1 px-2">
            <X className="w-3 h-3" /> Limpiar
          </button>
        )}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" />
          <VistaSelector
            vistas={vistas}
            vistaActivaId={vistaActivaId}
            currentUserId={user?.uid || user?.id || ''}
            vistaActual={vistaTabla}
            filtrosActuales={filtrosPagosParaVista(filtros)}
            labelDefault="Vista por defecto"
            onSeleccionar={seleccionarVista}
            onGuardar={async (nombre) => {
              const id = await crearVista(nombre, vistaTabla.columnas, { filtros: filtrosPagosParaVista(filtros) });
              setVistaActivaId(id);
            }}
            onActualizar={(id, cambios) => actualizarVista(id, cambios)}
            onEliminar={async (id) => {
              await eliminarVista(id);
              if (vistaActivaId === id) seleccionarVista(null);
            }}
          />
          <button onClick={exportarCSV} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg border border-gray-200 shrink-0" title="Exporta lo filtrado, con las columnas de la vista">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-150">
          <EstadoVacio
            variante="plano"
            icono={<Banknote className="w-5 h-5" />}
            titulo={pagos.length === 0 ? 'Todavía no hay pagos registrados' : 'Nada con ese filtro'}
            detalle={pagos.length === 0
              ? 'Los pagos de clientes se registran en Cuentas por cobrar y los de proveedores en Programación de pagos. En Cuentas por cobrar: «Aplicar pago» contra una factura o «Registrar entrada de dinero» para un anticipo.'
              : filtros.estado === 'vigentes' && conteo('anulado') > 0
                ? 'Hay pagos anulados: se ven con el filtro «Anulados».'
                : 'Prueba con otro estado u otra búsqueda.'}
          />
        </div>
      ) : (
        <div className="pt-2">
          <SpreadsheetTable<Pago>
            data={visibles}
            columns={columnas}
            pinnedColumnIds={['folio']}
            vista={vistaTabla}
            onVistaChange={setVistaTabla}
            maxHeight="calc(100vh - 460px)"
          />
          <p className="text-[10px] text-gray-400 mt-2 px-1">
            {visibles.length} pago{visibles.length !== 1 ? 's' : ''} · {visibles.filter(p => estadoDePago(p) === 'anulado').length} anulado(s) en la lista
          </p>
        </div>
      )}

      {abierto && !aplicando && (
        <FichaPago
          pago={abierto}
          puedeEditar={abierto.lado === 'proveedor' ? puedeAnularProveedor : puedeEditar}
          ordenes={ordenes}
          rolOC={rolOC}
          hayFacturasParaAplicar={hayFacturasPara(abierto)}
          bitacoras={bitacorasDe(abierto)}
          onCerrar={() => setAbiertoId(null)}
          onAplicarSaldo={() => setAplicandoId(abierto.id)}
          onQuitar={onQuitarAplicacion}
          onAnular={onAnularPago}
        />
      )}

      {aplicando && (
        <ModalAplicarPago
          saldoDe={aplicando}
          items={items}
          hoy={fecha}
          por={{ uid: user?.uid ?? '', nombre: user?.nombre ?? user?.email ?? '' }}
          onCancelar={() => setAplicandoId(null)}
          onAplicarSaldo={async (aplicaciones, embarqueIds) => {
            await onAplicarSaldo(aplicando.id, aplicaciones, embarqueIds);
            setAplicandoId(null);
          }}
        />
      )}
    </div>
  );
}

function Total({ t, v, destacado }: { t: string; v: string; destacado?: boolean }) {
  return (
    <div className="bg-white border border-gray-150 rounded-xl px-4 py-3">
      <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">{t}</span>
      <span className={`font-bold tabular-nums ${destacado ? 'text-primario' : 'text-gray-900'}`}>{v}</span>
    </div>
  );
}
