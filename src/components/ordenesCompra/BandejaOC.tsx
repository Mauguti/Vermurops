/**
 * BandejaOC.tsx
 *
 * Bandeja de Órdenes de Compra integrada en Finanzas → Cuentas por pagar.
 *
 * Dos vistas sobre los mismos datos filtrados (§4.24): «Por proveedor», un
 * renglón por factura, y «Por orden», la tabla orden por orden — que desde la
 * tarea 61 es `SpreadsheetTable`, con columnas configurables y vistas
 * guardadas, igual que Altas y Embarques. Los filtros se guardan CON la
 * vista: «lo autorizado en pesos que todavía no se paga» es un nombre, no
 * tres clics cada mañana.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Download, CheckCircle, FileText, SlidersHorizontal, X } from 'lucide-react';
import type { OrdenCompra, EstadoOC } from './OrdenesCompraData';
import EstadoVacio from '../ui/EstadoVacio';
import { sumarPorMoneda, formatearPorMoneda } from '../../lib/sumarPorMoneda';
import type { ConceptoVermur } from '../conceptos/ConceptosData';
import { compararIVAFactura, etiquetaIVA, type EtiquetaIVA } from '../../lib/ivaOrdenCompra';
import VistaFacturasProveedor from './VistaFacturasProveedor';
import { usePreferenciasUsuario } from '../../hooks/usePreferenciasUsuario';
import SpreadsheetTable, { type VistaConfig } from '../table/SpreadsheetTable';
import VistaSelector from '../table/VistaSelector';
import { useVistasUsuario } from '../../hooks/useVistasUsuario';
import { useAuth } from '../../auth/AuthContext';
import { columnasOC, VISTA_DEFAULT_POR_PAGAR } from './ocColumns';
import { csvDeVista, descargarCSV } from '../../lib/exportarVista';
import {
  FILTROS_POR_PAGAR_VACIOS, aplicarFiltrosPorPagar, filtrosPorPagarActivos,
  filtrosPorPagarDesdeVista, filtrosPorPagarParaVista, type FiltrosPorPagar,
} from '../../lib/filtrosFinanzas';

// ─── Props ──────────────────────────────────────────────────────────────────

interface BandejaOCProps {
  ordenes: OrdenCompra[];
  loading: boolean;
  conteosPorEstado: Record<EstadoOC, number>;
  onSelectOC?: (oc: OrdenCompra) => void;
  /** Tarea 36 · Catálogo de conceptos para resolver la regla IVA de cada OC. */
  conceptos?: ConceptoVermur[];
}

// ─── Filtros de estado ──────────────────────────────────────────────────────

const FILTROS: { id: EstadoOC | ''; label: string }[] = [
  { id: '', label: 'Todas' },
  { id: 'solicitada', label: 'Solicitadas' },
  { id: 'en_gestion', label: 'En gestión' },
  { id: 'autorizada', label: 'Autorizadas' },
  { id: 'pagada', label: 'Pagadas' },
  { id: 'rechazada', label: 'Rechazadas' },
];

const FILTROS_IVA: { id: NonNullable<EtiquetaIVA> | ''; label: string }[] = [
  { id: '', label: 'Todos' },
  { id: 'alerta', label: 'IVA no cuadra' },
  { id: 'pendiente', label: 'IVA pendiente' },
  { id: 'ok', label: 'IVA ok' },
];

const SELECT = 'bg-white border border-card-border rounded-[8px] px-2 py-[7px] text-[11px] font-semibold text-text-secondary outline-none focus:border-primario';

export default function BandejaOC({ ordenes, loading, conteosPorEstado, onSelectOC, conceptos = [] }: BandejaOCProps) {
  const { user } = useAuth();
  const [filtros, setFiltros] = useState<FiltrosPorPagar>(FILTROS_POR_PAGAR_VACIOS);
  const set = <K extends keyof FiltrosPorPagar>(k: K, v: FiltrosPorPagar[K]) =>
    setFiltros(f => ({ ...f, [k]: v }));

  /*
   * Tarea 58 · Cómo se ve lo que se debe. Por proveedor es el default: es
   * como Julio lo lee, y es la vista donde una factura repartida en varias
   * órdenes deja de contarse dos veces. La preferencia se guarda por usuario
   * (preferenciasUsuario/{uid}) como la de cargos (§4.14): quien prefiera el
   * detalle orden por orden no lo vuelve a elegir cada vez.
   */
  const { prefs, guardar } = usePreferenciasUsuario();
  const vista: 'proveedor' | 'orden' = prefs.vistaCuentasPorPagar ?? 'proveedor';

  /** Mapa de conceptoId → reglaIVA para resolución rápida. */
  const reglasPorConcepto = useMemo(() => {
    const m = new Map<string, ConceptoVermur['reglaIVA']>();
    conceptos.forEach(c => { if (c.reglaIVA) m.set(c.id, c.reglaIVA); });
    return m;
  }, [conceptos]);

  /** Calcula la etiqueta IVA de una OC. */
  const etiquetaIVADeOC = useCallback((oc: OrdenCompra): EtiquetaIVA => {
    if (!oc.facturaDatos) return null;
    const regla = reglasPorConcepto.get(oc.conceptoId);
    return etiquetaIVA(compararIVAFactura(oc, regla).estado);
  }, [reglasPorConcepto]);

  // ── Tarea 61 · Vistas guardadas (columnas + filtros) ──────────────────────
  const { vistas, crearVista, actualizarVista, eliminarVista, vistaDefault } = useVistasUsuario('cuentasPorPagar');
  const [vistaActivaId, setVistaActivaId] = useState<string | null>(null);
  const [vistaTabla, setVistaTabla] = useState<VistaConfig>(VISTA_DEFAULT_POR_PAGAR);

  const aplicarVista = useCallback((v: { columnas: VistaConfig['columnas']; ordenamiento?: VistaConfig['ordenamiento']; filtros?: Record<string, string | null> } | null) => {
    if (!v) {
      setVistaTabla(VISTA_DEFAULT_POR_PAGAR);
      setFiltros(FILTROS_POR_PAGAR_VACIOS);
      return;
    }
    setVistaTabla({ columnas: v.columnas, ordenamiento: v.ordenamiento ?? null });
    setFiltros(filtrosPorPagarDesdeVista(v.filtros));
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
   * El catálogo se ata a `etiquetaIVADeOC`, así que el badge de la columna y
   * el valor del CSV salen de la misma función: no hay forma de que la hoja
   * diga «OK» donde la pantalla dice «No cuadra».
   */
  const columnas = useMemo(() => columnasOC({ etiquetaIVA: etiquetaIVADeOC }), [etiquetaIVADeOC]);

  /** Para que el estado vacío diga cuál de los dos vacíos es. */
  const activos = filtrosPorPagarActivos(filtros);
  const hayFiltro = activos > 0;

  const ordenesFiltradas = useMemo(
    () => aplicarFiltrosPorPagar(ordenes, filtros, { etiquetaIVA: etiquetaIVADeOC }),
    [ordenes, filtros, etiquetaIVADeOC],
  );

  const totalFiltrado = ordenesFiltradas.length;

  // Conteo para badges de filtro
  const getConteo = (filtro: EstadoOC | ''): number => {
    if (filtro === '') return ordenes.length;
    return conteosPorEstado[filtro] || 0;
  };

  /*
   * Tarea 61 · El CSV sale con las columnas DE LA VISTA, en su orden. Antes
   * la lista de encabezados vivía escrita a mano aquí al lado, así que una
   * columna nueva no llegaba al archivo con el que Julio cierra el mes.
   *
   * En la vista por proveedor se exporta igual la tabla por orden: el archivo
   * es para trabajar en Excel, donde el agrupado se hace con un filtro.
   */
  const handleExportCSV = () => {
    descargarCSV('cuentas_por_pagar', csvDeVista(columnas, vistaTabla, ordenesFiltradas));
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center p-[60px]">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-brand border-t-transparent" />
        <span className="ml-3 text-[13px] text-text-secondary">Cargando órdenes de compra...</span>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (ordenes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-[60px] border border-dashed border-card-border rounded-[8px] bg-white">
        <CheckCircle className="w-[32px] h-[32px] text-text-muted mb-[16px]" />
        <p className="text-[14px] font-medium text-text-primary mb-[4px]">Sin órdenes de compra</p>
        <p className="text-[13px] text-text-secondary text-center max-w-[300px]">
          Las órdenes de compra aparecerán aquí cuando Operaciones las solicite desde un embarque o Administración cargue un gasto de oficina.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-[20px]">
      {/* Filtros por estado */}
      <div className="flex flex-wrap gap-[8px]">
        {FILTROS.map(f => {
          const count = getConteo(f.id);
          const isActive = filtros.estado === f.id;
          return (
            <button
              key={f.id || 'todos'}
              onClick={() => set('estado', f.id)}
              className={`px-[12px] py-[6px] rounded-[6px] text-[12px] font-medium transition-colors border ${
                isActive
                  ? 'bg-brand text-white border-brand'
                  : 'bg-white text-text-secondary border-card-border hover:bg-neutral-bg'
              }`}
            >
              {f.label}
              {count > 0 && (
                <span className={`ml-[6px] px-[6px] py-[1px] rounded-full text-[10px] font-bold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-neutral-bg text-text-muted'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tarea 36 · Filtro de IVA · Tarea 61 · y los que se guardan con la vista */}
      <div className="flex flex-wrap gap-[6px] items-center">
        {FILTROS_IVA.map(f => (
          <button
            key={f.id || 'todos'}
            onClick={() => set('iva', f.id)}
            className={`px-[10px] py-[4px] rounded-[5px] text-[11px] font-medium transition-colors border ${
              filtros.iva === f.id
                ? f.id === 'alerta' ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-brand text-white border-brand'
                : 'bg-white text-text-secondary border-card-border hover:bg-neutral-bg'
            }`}
          >
            {f.label}
          </button>
        ))}

        <span className="w-px h-5 bg-divider mx-1" />

        <select value={filtros.moneda} onChange={e => set('moneda', e.target.value as FiltrosPorPagar['moneda'])} className={SELECT} title="Moneda de la orden">
          <option value="">Moneda: todas</option>
          <option value="MXN">MXN</option>
          <option value="USD">USD</option>
        </select>

        <select value={filtros.origen} onChange={e => set('origen', e.target.value as FiltrosPorPagar['origen'])} className={SELECT} title="De dónde nació la orden">
          <option value="">Origen: todos</option>
          <option value="embarque">De embarque</option>
          <option value="oficina">De oficina</option>
        </select>

        {/* §4.7 · «No pagar» es la razón por la que una autorizada no aparece
            en Programación de pagos. Poder aislarlas es poder destrabarlas. */}
        <select value={filtros.noPagar} onChange={e => set('noPagar', e.target.value as FiltrosPorPagar['noPagar'])} className={SELECT} title="Flag «No pagar»">
          <option value="">No pagar: indistinto</option>
          <option value="si">Solo las detenidas</option>
          <option value="no">Sin «No pagar»</option>
        </select>

        {activos > 0 && (
          <button
            onClick={() => setFiltros(FILTROS_POR_PAGAR_VACIOS)}
            className="text-[11px] font-bold text-text-muted hover:text-primario flex items-center gap-1 px-2"
          >
            <X className="w-3 h-3" /> Limpiar
          </button>
        )}
      </div>

      {/* Barra de búsqueda y acciones */}
      {/* Tarea 58 · `flex-wrap`: con el toggle nuevo, a 390 px la barra ya no
          cabe en un renglón y «Exportar» se salía del borde. */}
      <div className="flex gap-[12px] items-center flex-wrap">
        <div className="relative max-w-[400px] flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Buscar folio, proveedor, concepto, cliente, factura..."
            value={filtros.busqueda}
            onChange={e => set('busqueda', e.target.value)}
            className="w-full pl-[36px] bg-white border border-card-border rounded-[8px] p-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm text-text-primary"
          />
        </div>
        {/* Tarea 58 · Por proveedor | Por orden */}
        <div className="flex rounded-[8px] border border-card-border overflow-hidden shrink-0">
          {([['proveedor', 'Por proveedor'], ['orden', 'Por orden']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => guardar('vistaCuentasPorPagar', id)}
              aria-pressed={vista === id}
              className={`text-[12px] font-medium px-[12px] py-[8px] transition-colors ${
                vista === id
                  ? 'bg-primario text-white'
                  : 'bg-white text-text-secondary hover:bg-neutral-bg'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tarea 61 · Las vistas guardadas son de la tabla: en «Por proveedor»
            no hay columnas que elegir, y ofrecer el selector ahí prometería
            algo que esa vista no puede cumplir. Los filtros sí se conservan
            al cambiar de vista. */}
        {vista === 'orden' && (
          <div className="flex items-center gap-2 shrink-0">
            <SlidersHorizontal className="w-3.5 h-3.5 text-text-muted" />
            <VistaSelector
              vistas={vistas}
              vistaActivaId={vistaActivaId}
              currentUserId={user?.uid || user?.id || ''}
              vistaActual={vistaTabla}
              filtrosActuales={filtrosPorPagarParaVista(filtros)}
              labelDefault="Vista por defecto"
              onSeleccionar={seleccionarVista}
              onGuardar={async (nombre) => {
                const id = await crearVista(nombre, vistaTabla.columnas, { filtros: filtrosPorPagarParaVista(filtros) });
                setVistaActivaId(id);
              }}
              onActualizar={(id, cambios) => actualizarVista(id, cambios)}
              onEliminar={async (id) => {
                await eliminarVista(id);
                if (vistaActivaId === id) seleccionarVista(null);
              }}
            />
          </div>
        )}

        <button
          onClick={handleExportCSV}
          className="flex items-center text-[13px] font-medium text-text-secondary bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] hover:bg-neutral-bg transition-colors shadow-sm shrink-0"
          title="Exporta lo filtrado, con las columnas de la vista"
        >
          <Download className="w-4 h-4 mr-2" /> Exportar
        </button>
      </div>

      {/* Tarea 58 · Un renglón por factura del proveedor. El agrupado y el
          caso del duplicado viven en lib/facturasProveedor.ts. */}
      {vista === 'proveedor' && (
        <VistaFacturasProveedor
          ordenes={ordenesFiltradas}
          onSelectOC={onSelectOC}
          hayFiltro={hayFiltro}
        />
      )}

      {/* Tarea 61 · La tabla orden por orden, configurable. */}
      {vista === 'orden' && (
        ordenesFiltradas.length === 0 ? (
          <div className="border border-divider rounded-[8px] bg-white">
            {/* U-6 · El vacío explica cuál de los dos es: no hay ninguna, o el
                filtro las escondió. Antes decía siempre lo segundo. */}
            <EstadoVacio
              variante="plano"
              icono={<FileText className="w-5 h-5" />}
              titulo={hayFiltro
                ? 'Ninguna orden coincide con los filtros'
                : 'Todavía no hay órdenes de compra'}
              detalle={hayFiltro
                ? 'Quita los filtros para ver todas las órdenes.'
                : 'Nacen del embarque cuando hay que pagarle a un proveedor, o se capturan sueltas para los gastos de oficina.'}
            />
          </div>
        ) : (
          <div className="pt-8">
            <SpreadsheetTable<OrdenCompra>
              data={ordenesFiltradas}
              columns={columnas}
              pinnedColumnIds={['folio']}
              vista={vistaTabla}
              onVistaChange={setVistaTabla}
              onRowClick={onSelectOC}
              maxHeight="calc(100vh - 420px)"
            />
          </div>
        )
      )}

      {/* Footer con total. En la vista por proveedor no va: ahí el pie lo
          pone VistaFacturasProveedor, que cuenta renglones y no órdenes. */}
      {vista === 'orden' && (
      <div className="flex justify-between items-center text-[12px] text-text-muted px-[4px]">
        <span>{totalFiltrado} {totalFiltrado === 1 ? 'orden' : 'órdenes'} de compra</span>
        {/* §4.3 · Por moneda. Este pie era la CUARTA aparición del mismo bug:
            un reduce sobre `monto` sin mirar `moneda`, con el resultado
            rotulado como si fuera una sola. */}
        {filtros.estado === 'autorizada' && (
          <span className="font-medium text-text-primary">
            Total por pagar: {formatearPorMoneda(
              sumarPorMoneda(ordenesFiltradas, oc => oc.monto, oc => oc.moneda),
              { vacio: 'sin órdenes autorizadas' },
            )}
          </span>
        )}
      </div>
      )}
    </div>
  );
}
