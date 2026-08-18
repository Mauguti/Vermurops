import React, { useState } from 'react';
import { X, Plus, BarChart2, ChevronRight } from 'lucide-react';
import {
  ConceptoCotizacion, CotizacionProveedor,
  getCostoOficial, getTarifasOficiales,
} from './QuotesData';
import { calcLinea } from '../../lib/cotizacionCalculator';
import ComparativaPricing from './ComparativaPricing';
import type { ProveedorComparativa } from './ComparativaPricing';
import type { TarifaVermur } from '../tarifas/TarifasData';
import TarifaSuggestions, { resolverMonto } from '../tarifas/TarifaSuggestions';
import CapturaManualConcepto from '../tarifas/CapturaManualConcepto';
import { useDroppable } from '@dnd-kit/core';

export interface ConceptoSectionProps {
  key?: React.Key;
  concepto: ConceptoCotizacion;
  rolActivo: string;
  onUpdate: (c: ConceptoCotizacion) => void;
  onDelete: () => void;
  moneda?: 'USD' | 'MXN';
  ruta?: string;
  clientePreferidos?: string[];
  clienteVetados?: string[];
  diasCredito?: number;
  catalogoTarifas?: TarifaVermur[];
  contenedorTipo?: string;
  onCrearTarifaSpot?: (t: TarifaVermur) => Promise<void>;
  /** FC-2: ¿este concepto es el activo en el panel de tarifas? */
  isActive?: boolean;
  /** FC-2: callback para activar este concepto en el panel lateral. */
  onActivate?: () => void;
  /** FC-2: true si el panel lateral está visible (oculta TarifaSuggestions inline en desktop). */
  panelVisible?: boolean;
  /** FC-2: callback cuando se abre/cierra la comparativa (D2: expandir a full width). */
  onComparativaToggle?: (open: boolean) => void;
  /** FC-3: ID del servicio padre (para droppable). */
  servicioId?: string;
}

export function ConceptoSection({ concepto, rolActivo, onUpdate, onDelete, moneda = 'USD', ruta = '', clientePreferidos, clienteVetados, diasCredito = 30, catalogoTarifas, contenedorTipo, onCrearTarifaSpot, isActive, onActivate, panelVisible, onComparativaToggle, servicioId }: ConceptoSectionProps) {
  const [newSubNombre, setNewSubNombre] = useState('');
  const [newSubCosto, setNewSubCosto] = useState('');
  const [comparativaOpen, setComparativaOpen] = useState(false);

  const openComparativa = () => {
    setComparativaOpen(true);
    onComparativaToggle?.(true);
  };
  const closeComparativa = () => {
    setComparativaOpen(false);
    onComparativaToggle?.(false);
  };

  // ── FC-3: Droppable zone ──────────────────────────────────────────────────
  const { setNodeRef: setDropRef, isOver, active: dndActive } = useDroppable({
    id: `drop-${servicioId ?? 'x'}-${concepto.id}`,
    data: { type: 'concepto', conceptoId: concepto.id, servicioId },
  });

  // Check if dragged tarifa is already applied → reject visual
  const dragTarifaId = dndActive?.data?.current?.type === 'tarifa'
    ? (dndActive.data.current as { tarifa: TarifaVermur }).tarifa?.id
    : undefined;
  const isDragActive = !!dndActive && dndActive.data?.current?.type === 'tarifa';
  const isRejected = isOver && !!dragTarifaId && (concepto.tarifas || []).some(t => t.tarifaOrigenId === dragTarifaId);

  const costoOficial = getCostoOficial(concepto);
  const costoSubconceptos = (concepto.subconceptos || []).reduce((acc, sub) => acc + sub.costo, 0);
  const costoTotalConcepto = costoOficial + costoSubconceptos;
  // Usa calcLinea para mantener consistencia con la calculadora de E1
  const lineaCalc = calcLinea(costoTotalConcepto, concepto.profit || 0);
  const precioVenta = lineaCalc.venta;
  const margenRealPct = lineaCalc.margen * 100;

  // Persistir costo/venta/margen calculados cada vez que cambian subconceptos
  const updateConSubs = (newSubs: typeof concepto.subconceptos) => {
    const newCosto = costoOficial + newSubs.reduce((acc, s) => acc + s.costo, 0);
    const { venta, margen } = calcLinea(newCosto, concepto.profit || 0);
    onUpdate({ ...concepto, subconceptos: newSubs, costo: newCosto, venta, margen });
  };

  const handleAddSub = () => {
    if (!newSubNombre || !newSubCosto) return;
    const sub = { id: `sub-${Date.now()}`, nombre: newSubNombre, costo: Number(newSubCosto), moneda: 'USD' as const };
    updateConSubs([...(concepto.subconceptos || []), sub]);
    setNewSubNombre(''); setNewSubCosto('');
  };

  const handleRemoveSub = (subId: string) => {
    updateConSubs((concepto.subconceptos || []).filter(s => s.id !== subId));
  };

  // ── CP-4: Comparativa de pricing ────────────────────────────────────────────

  const tieneComparativa = (concepto.tarifas || []).length >= 2;

  // Enriquecer tarifas con preferencias del cliente
  const enrichedTarifas: ProveedorComparativa[] = (concepto.tarifas || []).map(t => ({
    ...t,
    esPreferido: !!(t.proveedorId && clientePreferidos?.includes(t.proveedorId)),
    esVetado: !!(t.proveedorId && clienteVetados?.includes(t.proveedorId)),
  }));

  // Persistir cambios de tarifas (candidata/seleccionada) a Firestore
  const handleTarifasChange = (updatedItems: ProveedorComparativa[]) => {
    const seleccionadaIds = updatedItems.filter(i => i.seleccionada).map(i => i.id);
    // Strip enrichment fields before persisting
    const nuevasTarifas: CotizacionProveedor[] = updatedItems.map(
      ({ esPreferido, esVetado, tiempoTransitoDias, ...tarifa }) => tarifa
    );
    const costoOficialNuevo = updatedItems.filter(i => i.seleccionada).reduce((acc, i) => acc + i.monto, 0);
    const costoTotal = costoOficialNuevo + costoSubconceptos;
    const { venta, margen } = calcLinea(costoTotal, concepto.profit || 0);
    onUpdate({
      ...concepto,
      tarifas: nuevasTarifas,
      proveedoresOficialIds: seleccionadaIds,
      costo: costoTotal,
      venta,
      margen,
    });
  };

  // Persistir cambios de profit desde la comparativa
  const handleComparativaProfitChange = (newProfit: number) => {
    const { venta, margen } = calcLinea(costoTotalConcepto, newProfit);
    onUpdate({ ...concepto, profit: newProfit, costo: costoTotalConcepto, venta, margen });
  };

  // ── Vista comparativa ──────────────────────────────────────────────────────
  if (comparativaOpen) {
    return (
      <div className="border border-gray-200 rounded-lg bg-gray-50/50 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={closeComparativa}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5 rotate-180" />
            Volver al concepto
          </button>
          <span className="text-[11px] font-bold text-[#18181B]">Comparativa · {concepto.nombre}</span>
        </div>
        <ComparativaPricing
          concepto={concepto.nombre}
          ruta={ruta}
          moneda={moneda}
          cotizaciones={enrichedTarifas}
          sinRespuesta={[]}
          totalSolicitados={enrichedTarifas.length}
          profitInicial={concepto.profit || 0}
          diasCredito={diasCredito}
          onTarifasChange={handleTarifasChange}
          onProfitChange={handleComparativaProfitChange}
        />
      </div>
    );
  }

  // ── Vista normal del concepto ──────────────────────────────────────────────
  return (
    <div
      ref={setDropRef}
      className={`border rounded-lg p-3 space-y-3 transition-colors cursor-pointer ${
        isOver
          ? isRejected
            ? 'ring-2 ring-red-200 border-red-300 bg-red-50/30'
            : 'ring-2 ring-green-200 border-green-400 bg-green-50/30'
          : isActive
            ? 'border-indigo-400 ring-2 ring-indigo-100 bg-gray-50/50'
            : isDragActive
              ? 'border-dashed border-indigo-300 bg-indigo-50/20'
              : 'border-gray-200 hover:border-gray-300 bg-gray-50/50'
      }`}
      onClick={onActivate}
    >
      <div className="flex items-center justify-between">
        <input
          type="text"
          value={concepto.nombre}
          onChange={e => onUpdate({ ...concepto, nombre: e.target.value })}
          className="text-xs font-bold text-[#18181B] bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#E11D48] outline-none px-1 py-0.5"
          placeholder="Nombre del concepto"
          readOnly={rolActivo === 'ventas'}
        />
        <div className="flex items-center gap-2">
          {tieneComparativa && rolActivo !== 'ventas' && (
            <button
              onClick={openComparativa}
              className="flex items-center gap-1 text-[9px] font-bold text-[#E11D48] hover:text-[#BE123C] uppercase tracking-wide hover:bg-[#E11D48]/5 px-2 py-1 rounded-lg transition-colors"
            >
              <BarChart2 className="w-3 h-3" />
              Comparar ({concepto.tarifas.length})
            </button>
          )}
          {rolActivo !== 'ventas' && (
            <button onClick={onDelete} className="text-gray-300 hover:text-red-500"><X className="w-4 h-4" /></button>
          )}
        </div>
      </div>

      {/* TA-4/TA-5: Sugerencias del catálogo + "Usar" + captura manual con spot inverso */}
      {/* En desktop con panel lateral, se ocultan (el panel las reemplaza). En mobile se muestran. */}
      {rolActivo !== 'ventas' && catalogoTarifas && (
        <div className={panelVisible ? 'md:hidden' : ''} onClick={e => e.stopPropagation()}>
          <TarifaSuggestions
            conceptoNombre={concepto.nombre}
            rutaTexto={ruta}
            catalogoTarifas={catalogoTarifas}
            contenedorTipo={contenedorTipo}
            tarifasYaUsadas={(concepto.tarifas || []).map(t => t.tarifaOrigenId).filter((id): id is string => !!id)}
            onUsarTarifa={(tarifa, provNombre, contactoNombre) => {
              // Duplicate check
              if ((concepto.tarifas || []).some(t => t.tarifaOrigenId === tarifa.id)) return;
              const cp: CotizacionProveedor = {
                id: `cp-${Date.now()}`,
                proveedor: provNombre,
                contacto: contactoNombre,
                monto: resolverMonto(tarifa, contenedorTipo),
                moneda: tarifa.moneda,
                tiempoTransito: tarifa.tiempoTransitoDias ? `${tarifa.tiempoTransitoDias} días` : undefined,
                vigencia: tarifa.fechaFin ?? undefined,
                condiciones: tarifa.condiciones || undefined,
                adjuntoUrl: null,
                archivoNombre: null,
                seleccionada: false,
                estadoRespuesta: 'recibida',
                freeTimeDias: tarifa.freeTimeDias,
                proveedorId: tarifa.proveedorId,
                conceptoId: tarifa.conceptoId,
                tarifaOrigenId: tarifa.id,
              };
              onUpdate({ ...concepto, tarifas: [...(concepto.tarifas || []), cp] });
            }}
          />
          <CapturaManualConcepto
            conceptoNombre={concepto.nombre}
            onGuardar={(cp) => {
              onUpdate({ ...concepto, tarifas: [...(concepto.tarifas || []), cp] });
            }}
            onCrearSpot={onCrearTarifaSpot}
          />
        </div>
      )}

      {/* Proveedor(es) Oficial(es) */}
      <div className="bg-white border border-gray-150 rounded p-2 text-xs flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-500">Proveedor Oficial:</span>{' '}
          {(() => {
            const oficiales = getTarifasOficiales(concepto);
            if (oficiales.length === 0) return <span className="text-gray-400 italic">Por definir en Bandeja Pricing</span>;
            return oficiales.map((t, i) => (
              <span key={t.id}>
                {i > 0 && <span className="text-gray-300 mx-1">+</span>}
                <span className="font-bold text-indigo-700">{t.proveedor}</span>
              </span>
            ));
          })()}
        </div>
        <div className="font-black text-indigo-900 tabular-nums bg-indigo-50 px-2 py-0.5 rounded">
          ${costoOficial.toLocaleString()} {getTarifasOficiales(concepto)[0]?.moneda || 'USD'}
        </div>
      </div>

      {/* Subconceptos */}
      {concepto.subconceptos && concepto.subconceptos.length > 0 && (
        <div className="pl-4 space-y-1.5 border-l-2 border-gray-200">
          <p className="text-[9px] font-bold text-gray-400 uppercase">Subconceptos (Costos Adicionales)</p>
          {concepto.subconceptos.map(sub => (
            <div key={sub.id} className="flex justify-between items-center text-[11px] bg-white border border-gray-100 rounded px-2 py-1 shadow-sm">
              <span className="text-gray-600 font-medium">{sub.nombre}</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-700 tabular-nums">${sub.costo.toLocaleString()} {sub.moneda}</span>
                {rolActivo !== 'ventas' && <button onClick={() => handleRemoveSub(sub.id)} className="text-gray-300 hover:text-red-500"><X className="w-3 h-3" /></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add subconcepto */}
      {rolActivo !== 'ventas' && (
        <div className="flex gap-2 items-center pl-4 mt-2">
          <input type="text" placeholder="Nuevo subconcepto..." value={newSubNombre} onChange={e => setNewSubNombre(e.target.value)} className="flex-1 text-[10px] border border-gray-200 rounded px-2 py-1 outline-none focus:border-[#E11D48]" />
          <input type="number" placeholder="Costo" value={newSubCosto} onChange={e => setNewSubCosto(e.target.value)} className="w-20 text-[10px] border border-gray-200 rounded px-2 py-1 outline-none focus:border-[#E11D48]" />
          <button onClick={handleAddSub} className="text-[10px] bg-white border border-gray-200 hover:border-[#E11D48] hover:text-[#E11D48] px-2 py-1 rounded font-bold text-gray-600 transition-colors">Añadir</button>
        </div>
      )}

      {/* Financieros */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-indigo-50 p-2.5 rounded border border-indigo-100 mt-3 shadow-sm">
        <div className="text-[10px] text-gray-500 font-semibold uppercase flex flex-col">
          <span>Costo Total Concepto:</span>
          <span className="text-xs font-bold text-gray-700">${costoTotalConcepto.toLocaleString()}</span>
        </div>

        {rolActivo !== 'ventas' ? (
          <div className="flex items-center gap-2 border-l border-indigo-200 pl-3">
            <span className="text-[10px] text-indigo-600 font-bold uppercase">Profit: $</span>
            <input
              type="number"
              value={concepto.profit === 0 && !concepto.profit ? '' : concepto.profit}
              onChange={e => {
                const newProfit = Number(e.target.value) || 0;
                const { venta, margen } = calcLinea(costoTotalConcepto, newProfit);
                onUpdate({ ...concepto, profit: newProfit, costo: costoTotalConcepto, venta, margen });
              }}
              className="w-20 text-xs font-bold text-indigo-700 border border-indigo-200 focus:border-indigo-400 rounded px-1.5 py-1 outline-none text-right shadow-sm"
              placeholder="0"
            />
          </div>
        ) : (
          <div className="text-[10px] text-gray-500 font-semibold uppercase flex flex-col text-right border-l border-indigo-200 pl-3">
            <span>Margen:</span>
            <span className="text-xs font-bold text-gray-700">{margenRealPct.toFixed(1)}%</span>
          </div>
        )}

        <div className="text-right border-l border-indigo-200 pl-3">
          <span className="text-[10px] text-gray-500 font-semibold uppercase">Venta:</span>
          <p className="text-sm font-black text-indigo-900 tabular-nums">${precioVenta.toLocaleString()}</p>
          {rolActivo !== 'ventas' && (
            <p className="text-[9px] text-indigo-500/70 font-bold mt-0.5">{margenRealPct.toFixed(1)}% Margen</p>
          )}
        </div>
      </div>
    </div>
  );
}
