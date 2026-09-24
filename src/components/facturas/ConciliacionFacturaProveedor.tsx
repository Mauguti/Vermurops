/**
 * ConciliacionFacturaProveedor.tsx (Bloque 2, versión mínima)
 *
 * «Cargar factura de proveedor» en la pestaña Facturas del embarque:
 * se sube, se clasifica, se elige a qué proveedor del consolidado
 * corresponde, y se concilia contra sus cargos pendientes — conceptos de la
 * factura a la izquierda, cargos a la derecha, emparejamiento propuesto por
 * nombre y monto. O se aplica completa al total del proveedor.
 *
 * Al confirmar: los cargos quedan con `facturaProveedorId`, el grupo pasa a
 * «Facturado», y la OC del proveedor se precarga con número, fecha y total
 * (cotejo incluido). Nada se guarda sin confirmar.
 */

import React, { useMemo, useRef, useState } from 'react';
import { UploadCloud, Loader2, AlertTriangle, Check, X, FileText, Receipt } from 'lucide-react';
import type { EmbarqueCompleto, EmbarqueDocumento, CargoDetalle } from '../shipments/EmbarquesData';
import type { OrdenCompra } from '../ordenesCompra/OrdenesCompraData';
import { useDocumentosEmbarque } from '../../hooks/useDocumentosEmbarque';
import { documentoDesdeRevision, type SubidaClasificada } from '../../lib/documentosEmbarque';
import { traducirAviso } from '../../lib/clasificacionDocumentos';
import {
  conceptosDeFactura, proponerEmparejamiento, resolverConciliacion, cargosPendientesDe, ocParaPrecargar,
  precargaFacturaProveedor, proponerParaOC, type ConceptoFactura, type Emparejamiento, type ModoAplicacion,
} from '../../lib/conciliacionFactura';
import { esTipoFactura } from '../../lib/documentosEmbarque';

export interface ConciliacionConfirmada {
  documento: Omit<EmbarqueDocumento, 'id'>;
  cargoIds: string[];
  /** OC a precargar y con qué. Null si no hay OC del proveedor sin factura. */
  oc: { id: string; patch: Partial<OrdenCompra> } | null;
}

interface Props {
  embarque: EmbarqueCompleto;
  ordenes: OrdenCompra[];
  nombreProveedor: (id: string | undefined) => string;
  puedeCargar: boolean;
  onConfirmar: (c: ConciliacionConfirmada) => Promise<void>;
  onAviso: (mensaje: string, tipo: 'exito' | 'error') => void;
}

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ConciliacionFacturaProveedor({
  embarque, ordenes, nombreProveedor, puedeCargar, onConfirmar, onAviso,
}: Props) {
  const { procesando, subirYClasificar, autor } = useDocumentosEmbarque();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<SubidaClasificada | null>(null);

  const detalles = embarque.cargos?.detalles ?? [];
  const facturasCargadas = (embarque.documentos ?? []).filter(d => d.tipo === 'factura_proveedor' || d.grupo === 'facturas_proveedor');

  const procesar = async (file: File) => {
    setError(null);
    try {
      const subida = await subirYClasificar(file, embarque, 'factura_proveedor');
      setPendiente(subida);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="px-6 pt-6 space-y-4">
      {puedeCargar && (
        <div className="border border-card-border rounded-xl bg-white overflow-hidden">
          <div className="px-4 py-2.5 bg-neutral-bg border-b border-divider flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-bold text-text-primary">Cargar factura de proveedor</p>
              <p className="text-[11px] text-text-muted">Se clasifica, se concilia contra los cargos del proveedor y se precarga su orden de compra.</p>
            </div>
          </div>
          <div className="p-4">
            <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.xml"
              onChange={e => { const f = e.target.files?.[0]; if (f) void procesar(f); e.target.value = ''; }} />
            <button
              type="button"
              onClick={() => !procesando && inputRef.current?.click()}
              disabled={procesando}
              className="w-full py-4 px-4 border-2 border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-50/50 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-gray-600 disabled:cursor-wait"
            >
              {procesando
                ? <><Loader2 className="w-4 h-4 animate-spin text-primario" /> Subiendo y clasificando…</>
                : <><UploadCloud className="w-4 h-4 text-gray-400" /> Elegir la factura (PDF o imagen)</>}
            </button>
            {error && <p className="mt-2 text-xs font-semibold text-red-600 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />{error}</p>}
          </div>
        </div>
      )}

      {facturasCargadas.length > 0 && (
        <div className="border border-card-border rounded-xl bg-white overflow-hidden">
          <div className="px-4 py-2 bg-neutral-bg border-b border-divider text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            Facturas de proveedor conciliadas ({facturasCargadas.length})
          </div>
          <div className="divide-y divide-gray-100">
            {facturasCargadas.map(d => {
              const suyos = detalles.filter(c => c.facturaProveedorId === d.id);
              const p = precargaFacturaProveedor(d.datos ?? {});
              return (
                <div key={d.id} className="px-4 py-2.5 flex items-center gap-3 text-[12px]">
                  <Receipt className="w-4 h-4 text-gray-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-800 truncate">{d.nombre}</p>
                    <p className="text-[10px] text-gray-400">
                      {p.emisor || 'emisor sin leer'}{p.numeroDocumento ? ` · ${p.numeroDocumento}` : ''}{p.total !== null ? ` · ${p.moneda} ${money(p.total)}` : ''}
                      {' · '}{suyos.length} cargo{suyos.length !== 1 ? 's' : ''} facturado{suyos.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-primario hover:underline">ver</a>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pendiente && (
        <ModalConciliar
          subida={pendiente}
          embarque={embarque}
          ordenes={ordenes}
          nombreProveedor={nombreProveedor}
          autor={autor}
          onCancelar={() => setPendiente(null)}
          onConfirmar={async c => {
            await onConfirmar(c);
            setPendiente(null);
            onAviso(
              c.oc
                ? `Factura conciliada: ${c.cargoIds.length} cargo(s) facturados y ${ordenes.find(o => o.id === c.oc!.id)?.folio ?? 'la OC'} precargada.`
                : `Factura conciliada: ${c.cargoIds.length} cargo(s) facturados. Sin OC del proveedor que precargar.`,
              'exito',
            );
          }}
        />
      )}
    </div>
  );
}

// ─── El modal de conciliación ────────────────────────────────────────────────

function ModalConciliar({ subida, embarque, ordenes, nombreProveedor, autor, onCancelar, onConfirmar }: {
  subida: SubidaClasificada;
  embarque: EmbarqueCompleto;
  ordenes: OrdenCompra[];
  nombreProveedor: (id: string | undefined) => string;
  autor: string;
  onCancelar: () => void;
  onConfirmar: (c: ConciliacionConfirmada) => Promise<void>;
}) {
  const c = subida.clasificacion;
  const detalles = embarque.cargos?.detalles ?? [];
  const precarga = useMemo(() => precargaFacturaProveedor(c.datos), [c.datos]);
  const conceptos = useMemo<ConceptoFactura[]>(() => conceptosDeFactura(c.datos), [c.datos]);

  /** Proveedores con gasto pendiente en el embarque; el emisor de la factura se preselecciona por nombre. */
  const proveedoresPendientes = useMemo(() => {
    const ids = [...new Set(detalles.filter(g => g.tipo === 'gasto' && g.proveedorId && !g.facturaProveedorId).map(g => g.proveedorId!))];
    return ids.map(id => ({ id, nombre: nombreProveedor(id) || id }));
  }, [detalles, nombreProveedor]);

  const sugerido = useMemo(() => {
    const emisor = precarga.emisor.toLowerCase();
    return proveedoresPendientes.find(p => emisor && (p.nombre.toLowerCase().includes(emisor) || emisor.includes(p.nombre.toLowerCase())))?.id
      ?? (proveedoresPendientes.length === 1 ? proveedoresPendientes[0].id : '');
  }, [precarga.emisor, proveedoresPendientes]);

  const [proveedorId, setProveedorId] = useState(sugerido);
  const [modo, setModo] = useState<ModoAplicacion>('por_concepto');
  const pendientes = useMemo(() => proveedorId ? cargosPendientesDe(detalles, proveedorId) : [], [detalles, proveedorId]);
  const [emparejamiento, setEmparejamiento] = useState<Emparejamiento[]>(() => proponerEmparejamiento(conceptos, cargosPendientesDe(detalles, sugerido)));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cambiarProveedor = (id: string) => {
    setProveedorId(id);
    setEmparejamiento(proponerEmparejamiento(conceptos, cargosPendientesDe(detalles, id)));
  };
  const asignar = (conceptoId: string, cargoId: string | null) =>
    setEmparejamiento(prev => prev.map(e =>
      e.conceptoId === conceptoId ? { ...e, cargoId, motivo: null }
      : e.cargoId === cargoId && cargoId ? { ...e, cargoId: null, motivo: null } : e));

  const resultado = useMemo(
    () => resolverConciliacion(modo, conceptos, emparejamiento, pendientes, precarga),
    [modo, conceptos, emparejamiento, pendientes, precarga],
  );
  const oc = proveedorId ? ocParaPrecargar(ordenes, embarque.id, proveedorId) : null;
  const propuestaOC = oc ? proponerParaOC(precarga, oc, '(pendiente)') : null;
  const esFactura = esTipoFactura(c.tipo) || c.destinoSugerido === 'facturas_proveedor';

  const confirmar = async () => {
    if (!proveedorId || guardando) return;
    setGuardando(true); setError(null);
    try {
      const documento = documentoDesdeRevision(
        subida,
        { tipoConfirmado: 'factura_proveedor', nombre: c.nombrePropuesto || subida.nombreOriginal, estado: c.avisos.length ? 'con_observaciones' : 'cargado', grupo: 'facturas_proveedor', ocId: oc?.id ?? null },
        autor, new Date().toISOString(),
      );
      await onConfirmar({
        documento,
        cargoIds: resultado.cargoIds,
        oc: oc && propuestaOC ? { id: oc.id, patch: { facturaAsociada: propuestaOC.facturaAsociada, facturaDatos: propuestaOC.facturaDatos } } : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-150 flex items-center justify-between bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-gray-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-[14px] font-bold text-[#18181B] truncate">Conciliar factura de proveedor</h3>
              <p className="text-[11px] text-gray-500 truncate">
                {precarga.emisor || 'Emisor sin leer'}{precarga.numeroDocumento ? ` · ${precarga.numeroDocumento}` : ''}{precarga.fecha ? ` · ${precarga.fecha}` : ''}
                {precarga.total !== null ? ` · total ${precarga.moneda} ${money(precarga.total)}` : ' · sin total legible'}
              </p>
            </div>
          </div>
          <button onClick={onCancelar} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {!esFactura && (
            <p className="text-[12px] text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              El clasificador lo lee como «{c.tipo}», no como factura de proveedor. Puedes conciliarla igual si estás seguro de que lo es.
            </p>
          )}
          {c.avisos.map(a => (
            <p key={a} className="text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{traducirAviso(a)}
            </p>
          ))}

          {/* Proveedor */}
          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-[260px]">
              <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">¿De qué proveedor es?</span>
              <select value={proveedorId} onChange={e => cambiarProveedor(e.target.value)}
                className={`w-full px-3 py-2 text-[12px] bg-white border rounded-md outline-none focus:border-primario ${proveedorId ? 'border-gray-200' : 'border-amber-400'}`}>
                <option value="">— Elige el proveedor —</option>
                {proveedoresPendientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              {proveedoresPendientes.length === 0 && (
                <span className="block text-[10px] text-amber-700 mt-1">Este embarque no tiene cargos de gasto pendientes de facturar.</span>
              )}
            </label>
            <div className="inline-flex bg-gray-100 p-0.5 rounded-lg" role="tablist">
              {([['por_concepto', 'Emparejar por concepto'], ['completa', 'Aplicar completa al proveedor']] as [ModoAplicacion, string][]).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={modo === id} onClick={() => setModo(id)}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-bold ${modo === id ? 'bg-white text-[#18181B] shadow-2xs' : 'text-gray-500 hover:text-gray-700'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Dos columnas */}
          {proveedorId && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-3 py-1.5 bg-gray-50 text-[9px] font-bold text-gray-500 uppercase tracking-wider">Conceptos de la factura ({conceptos.length})</div>
                {conceptos.length === 0 ? (
                  <p className="px-3 py-4 text-[11px] text-gray-400">El clasificador no desglosó conceptos. Usa «Aplicar completa al proveedor».</p>
                ) : (
                  <table className="w-full text-[12px]">
                    <tbody className="divide-y divide-gray-100">
                      {conceptos.map(cf => {
                        const e = emparejamiento.find(x => x.conceptoId === cf.id);
                        return (
                          <tr key={cf.id} className={modo === 'completa' ? 'opacity-50' : ''}>
                            <td className="px-3 py-1.5">
                              <p className="text-gray-800">{cf.descripcion}</p>
                              <p className="text-[10px] text-gray-400 tabular-nums">{cf.monto !== null ? `${cf.moneda} ${money(cf.monto)}` : 'sin monto'}</p>
                            </td>
                            <td className="px-2 py-1.5 w-[220px]">
                              <select value={e?.cargoId ?? ''} disabled={modo === 'completa'} onChange={ev => asignar(cf.id, ev.target.value || null)}
                                className={`w-full px-2 py-1 text-[11px] bg-white border rounded-md outline-none focus:border-primario ${e?.cargoId ? (e.motivo === 'monto_y_nombre' ? 'border-emerald-300' : 'border-amber-300') : 'border-gray-200'}`}>
                                <option value="">— sin cargo —</option>
                                {pendientes.map(g => <option key={g.id} value={g.id}>{g.concepto} · {g.moneda} {money(g.monto)}</option>)}
                              </select>
                              {e?.motivo && e.motivo !== 'monto_y_nombre' && (
                                <span className="block text-[9px] text-amber-700 mt-0.5">propuesto por {e.motivo === 'nombre' ? 'nombre' : 'monto'}: revísalo</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-3 py-1.5 bg-gray-50 text-[9px] font-bold text-gray-500 uppercase tracking-wider">Cargos pendientes de {nombreProveedor(proveedorId) || proveedorId} ({pendientes.length})</div>
                <table className="w-full text-[12px]">
                  <tbody className="divide-y divide-gray-100">
                    {pendientes.map(g => {
                      const ligado = modo === 'completa' || emparejamiento.some(e => e.cargoId === g.id);
                      return (
                        <tr key={g.id} className={ligado ? 'bg-emerald-50/40' : ''}>
                          <td className="px-3 py-1.5 text-gray-800">{g.concepto}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{g.moneda} {money(g.monto)}</td>
                          <td className="px-2 py-1.5 w-6">{ligado && <Check className="w-3.5 h-3.5 text-emerald-600" />}</td>
                        </tr>
                      );
                    })}
                    {pendientes.length === 0 && <tr><td className="px-3 py-4 text-[11px] text-gray-400">Sin cargos pendientes.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Resultado */}
          {proveedorId && (
            <div className={`rounded-lg border px-3 py-2.5 text-[12px] ${resultado.avisos.length ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
              <p className="font-semibold">
                Se marcan {resultado.cargoIds.length} cargo(s) como facturados · {resultado.moneda} {money(resultado.aplicado)}
                {resultado.totalFactura !== null ? ` de ${money(resultado.totalFactura)} en la factura` : ''}
              </p>
              {resultado.avisos.map(a => <p key={a} className="flex items-start gap-1.5 mt-1"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{a}</p>)}
              {resultado.conceptosSinCargo.length > 0 && (
                <p className="mt-1 text-[11px]">Sin cargo: {resultado.conceptosSinCargo.map(x => x.descripcion).join(', ')}.</p>
              )}
              <p className="mt-1.5 text-[11px]">
                {oc && propuestaOC
                  ? <>Se precarga <strong>{oc.folio}</strong> con «{propuestaOC.facturaAsociada}».{propuestaOC.aviso ? ` ⚠️ ${propuestaOC.aviso}` : ' El total cuadra con la OC.'}</>
                  : 'Sin orden de compra del proveedor que precargar: se precarga al generarla.'}
              </p>
            </div>
          )}

          {error && <p className="text-[11px] text-red-600 font-semibold">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-gray-150 bg-gray-50/50 flex justify-end gap-2 shrink-0">
          <button onClick={onCancelar} className="text-[12px] px-3 py-2 text-gray-500 hover:text-gray-700">Cancelar</button>
          <button onClick={confirmar} disabled={!proveedorId || guardando}
            className="flex items-center gap-2 bg-primario text-white px-4 py-2 rounded-md text-[12px] font-bold hover:bg-primario-hover disabled:opacity-50">
            {guardando ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando…</> : 'Confirmar conciliación'}
          </button>
        </div>
      </div>
    </div>
  );
}
