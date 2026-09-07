/**
 * PanelPagos.tsx (1.5)
 *
 * El panel que reemplaza el Excel de Julio: qué se paga hoy, qué se venció,
 * agrupado por proveedor y listo para transferir.
 *
 * ── Por qué no basta la bandeja de OCs ─────────────────────────────────────
 * La bandeja ordena por ESTADO, que sirve para seguir el flujo. Al pagar, el
 * estado ya se sabe —autorizada— y lo que importa es CUÁNDO y A QUIÉN. Esta
 * es esa otra lectura: por fecha, agrupada por proveedor, con el comprobante
 * que detalla los folios para que el proveedor sepa qué se le cubrió.
 */

import React, { useMemo, useState } from 'react';
import { Copy, Check, AlertTriangle, CalendarClock } from 'lucide-react';
import type { OrdenCompra } from './OrdenesCompraData';
import {
  ordenesProgramadas, transferenciasDelDia, resumenDelDia, textoComprobante,
} from '../../lib/programacionPagos';

const money = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  ordenes: OrdenCompra[];
  /** Fecha de trabajo. Inyectable para probar. */
  hoy?: string;
  onAbrirOC: (id: string) => void;
  /** Registra el pago del grupo: marca las órdenes como pagadas. */
  onRegistrarPago?: (ocIds: string[], comprobante: string) => void;
}

export default function PanelPagos({ ordenes, hoy, onAbrirOC, onRegistrarPago }: Props) {
  const fechaHoy = hoy ?? new Date().toISOString().slice(0, 10);
  const [copiado, setCopiado] = useState<string | null>(null);

  const programadas = useMemo(() => ordenesProgramadas(ordenes, fechaHoy), [ordenes, fechaHoy]);
  const resumen = useMemo(() => resumenDelDia(programadas), [programadas]);
  const grupos = useMemo(() => transferenciasDelDia(programadas, fechaHoy), [programadas, fechaHoy]);

  const copiar = async (grupo: Parameters<typeof textoComprobante>[0]) => {
    const texto = textoComprobante(grupo);
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(grupo.proveedorId + grupo.fechaPago);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      // Sin permiso de portapapeles: se muestra para copiar a mano antes que
      // dejar a Julio sin el detalle.
      window.prompt('Copia el detalle del pago:', texto);
    }
  };

  return (
    <div className="space-y-4">
      {/* Resumen del día */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { n: resumen.vencidas, l: 'Vencidas', tono: 'text-red-700 border-red-200 bg-red-50/50' },
          { n: resumen.hoy, l: 'Se pagan hoy', tono: 'text-emerald-700 border-emerald-200 bg-emerald-50/50' },
          { n: resumen.proximas, l: 'Próximas', tono: 'text-gray-600 border-card-border bg-white' },
          { n: resumen.sinFecha, l: 'Sin programar', tono: 'text-amber-700 border-amber-200 bg-amber-50/50' },
        ].map(k => (
          <div key={k.l} className={`border rounded-lg px-4 py-3 ${k.tono}`}>
            <p className="text-[22px] font-bold leading-none">{k.n}</p>
            <p className="text-[11px] mt-1.5 opacity-80">{k.l}</p>
          </div>
        ))}
      </div>

      {resumen.bloqueadas > 0 && (
        <p className="text-[12px] text-red-700 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {resumen.bloqueadas} orden{resumen.bloqueadas !== 1 ? 'es' : ''} marcada{resumen.bloqueadas !== 1 ? 's' : ''} «No pagar»: no entra{resumen.bloqueadas !== 1 ? 'n' : ''} a las transferencias.
        </p>
      )}

      {/* Transferencias por proveedor */}
      <div>
        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
          Transferencias a hacer — al {fechaHoy}
        </h4>

        {grupos.length === 0 ? (
          <div className="border border-card-border rounded-lg py-10 text-center bg-white">
            <CalendarClock className="w-7 h-7 text-gray-300 mx-auto mb-2" />
            <p className="text-[13px] text-gray-500">Nada por pagar hoy.</p>
            <p className="text-[11px] text-gray-400 mt-1">
              Aquí aparecen las órdenes autorizadas cuya fecha de pago ya llegó.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {grupos.map(g => {
              const clave = g.proveedorId + g.fechaPago;
              return (
                <div key={clave + g.moneda} className="border border-card-border rounded-lg bg-white overflow-hidden">
                  <div className="px-4 py-2.5 bg-neutral-bg border-b border-divider flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-text-primary truncate">{g.proveedorNombre}</p>
                      <p className="text-[11px] text-text-muted">
                        {g.items.length} concepto{g.items.length !== 1 ? 's' : ''} · programado {g.fechaPago}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <p className="text-[15px] font-bold text-text-primary tabular-nums">
                        {g.moneda} {money(g.total)}
                      </p>
                      <button
                        type="button"
                        onClick={() => copiar(g)}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 hover:text-brand border border-card-border rounded-md px-2.5 py-1.5"
                        title="Copiar el detalle con los folios, para mandárselo al proveedor"
                      >
                        {copiado === clave ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiado === clave ? 'Copiado' : 'Copiar detalle'}
                      </button>
                      {onRegistrarPago && (
                        <button
                          type="button"
                          onClick={() => {
                            const ref = window.prompt(
                              `Referencia del pago a ${g.proveedorNombre} por ${g.moneda} ${money(g.total)}:`,
                            );
                            if (!ref?.trim()) return;
                            onRegistrarPago(g.items.map(o => o.id), ref.trim());
                          }}
                          className="text-[11px] font-bold text-white bg-brand hover:bg-brand-hover rounded-md px-3 py-1.5"
                        >
                          Registrar pago
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="divide-y divide-gray-50">
                    {g.items.map(o => {
                      const prog = programadas.find(p => p.oc.id === o.id);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => onAbrirOC(o.id)}
                          className="w-full px-4 py-2 flex items-center justify-between gap-3 text-left hover:bg-neutral-bg/60 transition-colors"
                        >
                          <span className="min-w-0 flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[11px] text-gray-400">{o.folio}</span>
                            <span className="text-[12px] text-gray-700 truncate">{o.conceptoNombre}</span>
                            {prog?.vencimiento === 'vencido' && (
                              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                                {prog.dias} día{prog.dias !== 1 ? 's' : ''} de atraso
                              </span>
                            )}
                            {prog?.avisos
                              .filter(a => a !== 'Marcada «No pagar»')
                              .map(a => (
                                <span key={a} className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                  {a}
                                </span>
                              ))}
                          </span>
                          <span className="text-[12px] font-semibold text-gray-800 tabular-nums shrink-0">
                            {o.moneda} {money(o.monto)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lo que aún no se puede pagar */}
      {(resumen.sinFecha > 0 || resumen.proximas > 0) && (
        <div>
          <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
            Todavía no
          </h4>
          <div className="border border-card-border rounded-lg bg-white divide-y divide-gray-50">
            {programadas
              .filter(p => p.vencimiento === 'proximo' || p.vencimiento === 'sin_fecha')
              .map(p => (
                <button
                  key={p.oc.id}
                  type="button"
                  onClick={() => onAbrirOC(p.oc.id)}
                  className="w-full px-4 py-2 flex items-center justify-between gap-3 text-left hover:bg-neutral-bg/60 transition-colors"
                >
                  <span className="min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[11px] text-gray-400">{p.oc.folio}</span>
                    <span className="text-[12px] text-gray-700 truncate">{p.oc.proveedorNombre}</span>
                    <span className="text-[11px] text-gray-400">
                      {p.fechaPago ? `paga el ${p.fechaPago}` : 'sin fecha de pago'}
                    </span>
                  </span>
                  <span className="text-[12px] text-gray-600 tabular-nums shrink-0">
                    {p.oc.moneda} {money(p.aTransferir)}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
