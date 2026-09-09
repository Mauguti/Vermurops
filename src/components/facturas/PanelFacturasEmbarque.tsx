/**
 * PanelFacturasEmbarque.tsx (2.1 / 2.3)
 *
 * Registrar la factura del embarque y sus cobros.
 *
 * ⚠️ Vermur timbra por FUERA: aquí no se emite nada. Se captura lo que ya
 * salió del sistema fiscal, para que la operación sepa qué se cobró y cuándo
 * vence — y para que el cobro libere el pago a los proveedores (1.1).
 */

import React, { useMemo, useState } from 'react';
import { Plus, AlertTriangle, Ban, Check } from 'lucide-react';
import type { EmbarqueCompleto } from '../shipments/EmbarquesData';
import { lineasFacturables, gruposDeFacturacion } from '../shipments/EmbarquesData';
import type { FacturaCliente, CobroCliente } from './FacturasData';
import type { ConceptoVermur } from '../conceptos/ConceptosData';
import {
  proponerFactura, diasCreditoDe, vencimientoFactura, saldoDeFactura,
  type CreditoCliente, type ResultadoPropuesta,
} from '../../lib/facturacionEmbarque';
import { BANCOS_VERMUR } from '../../lib/cuentasPago';

const money = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  embarque: EmbarqueCompleto;
  facturas: FacturaCliente[];
  cobros: CobroCliente[];
  conceptos: ConceptoVermur[];
  /** Tráfico del embarque, derivado de su folio. null si no se sabe. */
  trafico: 'impo' | 'expo' | null;
  clienteId: string | null;
  credito: CreditoCliente | null;
  puedeFacturar: boolean;
  onRegistrar: (f: Omit<FacturaCliente, 'id' | 'registradaPor' | 'activo' | 'createdAt' | 'updatedAt'>, cargoIds: string[]) => void;
  onCancelar: (facturaId: string, motivo: string) => void;
  onCobrar: (c: Omit<CobroCliente, 'id' | 'registradoPor' | 'activo' | 'createdAt' | 'updatedAt'>) => void;
  onAnularCobro: (cobroId: string) => void;
}

export default function PanelFacturasEmbarque({
  embarque, facturas, cobros, conceptos, trafico, clienteId, credito,
  puedeFacturar, onRegistrar, onCancelar, onCobrar, onAnularCobro,
}: Props) {
  const detalles = embarque.cargos?.detalles ?? [];
  const grupos = useMemo(() => gruposDeFacturacion(detalles), [detalles]);

  /** null = factura GENERAL del embarque; string = solo ese grupo (§4.8). */
  const [grupo, setGrupo] = useState<string | null>(null);
  const [numero, setNumero] = useState('');
  const [fechaEmision, setFechaEmision] = useState(new Date().toISOString().slice(0, 10));

  const pendientes = useMemo(
    () => lineasFacturables(detalles, grupo ?? undefined),
    [detalles, grupo],
  );
  // El genérico va explícito: al inferirlo, useMemo colapsa la unión
  // discriminada y `propuesta.error` deja de existir para TypeScript.
  const propuesta = useMemo<ResultadoPropuesta>(
    () => proponerFactura(pendientes, { trafico, conceptos }),
    [pendientes, trafico, conceptos],
  );

  // Se extraen fuera del JSX: el estrechamiento de la unión es fiable en una
  // expresión simple y evita repetir el guard en cada rama del render.
  const errorPropuesta = 'error' in propuesta ? propuesta.error : null;
  const detalle = 'propuesta' in propuesta ? propuesta.propuesta : null;

  const dias = diasCreditoDe(credito, embarque.modalidad);
  const vencimiento = vencimientoFactura(fechaEmision, dias);

  const registrar = () => {
    if (!propuesta.ok) return;
    if (!numero.trim()) { window.alert('Captura el número de la factura que emitiste.'); return; }
    const p = propuesta.propuesta;
    onRegistrar({
      numero: numero.trim(),
      fechaEmision,
      embarqueId: embarque.id,
      embarqueFolio: embarque.folio,
      clienteId,
      clienteNombre: embarque.entidades?.clienteCobrar ?? '',
      grupoFacturacion: grupo,
      lineas: p.lineas,
      moneda: p.moneda,
      subtotal: p.subtotal,
      iva: p.iva,
      retencion: p.retencion,
      total: p.total,
      fechaVencimiento: vencimiento,
      diasCredito: dias,
      estado: 'emitida',
      motivoCancelacion: null,
    }, pendientes.map(c => c.id));
    setNumero('');
  };

  return (
    <div className="p-6 space-y-5">
      {/* ── Registrar ────────────────────────────────────────────────────── */}
      {puedeFacturar && (
        <div className="border border-card-border rounded-xl bg-white overflow-hidden">
          <div className="px-4 py-2.5 bg-neutral-bg border-b border-divider">
            <p className="text-[13px] font-bold text-text-primary">Registrar factura emitida</p>
            <p className="text-[11px] text-text-muted">
              Captura la factura que ya emitiste. El sistema no timbra: deriva el IVA y calcula el vencimiento.
            </p>
          </div>

          <div className="p-4 space-y-4">
            {/* §4.8 · general o separada por grupo */}
            {grupos.length > 0 && (
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Qué cubre</label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setGrupo(null)}
                    className={`text-[11px] font-bold px-3 py-1.5 rounded-full border transition-colors ${
                      grupo === null ? 'bg-brand border-brand text-white' : 'border-card-border text-text-secondary hover:border-brand'
                    }`}
                  >
                    Todo el embarque
                  </button>
                  {grupos.map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGrupo(g)}
                      className={`text-[11px] font-bold px-3 py-1.5 rounded-full border capitalize transition-colors ${
                        grupo === g ? 'bg-brand border-brand text-white' : 'border-card-border text-text-secondary hover:border-brand'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {errorPropuesta ? (
              <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                {errorPropuesta}
              </p>
            ) : detalle ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Número de factura *</label>
                    <input
                      type="text" value={numero} onChange={e => setNumero(e.target.value)}
                      placeholder="A-1234"
                      className="w-full px-3 py-2 text-[13px] bg-white border border-card-border rounded-md outline-none focus:border-brand"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Fecha de emisión</label>
                    <input
                      type="date" value={fechaEmision} onChange={e => setFechaEmision(e.target.value)}
                      className="w-full px-3 py-2 text-[13px] bg-white border border-card-border rounded-md outline-none focus:border-brand"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Vence</label>
                    <p className="px-3 py-2 text-[13px] text-text-primary">
                      {vencimiento}
                      <span className="text-[11px] text-text-muted ml-1.5">
                        ({dias} día{dias !== 1 ? 's' : ''} de crédito)
                      </span>
                    </p>
                  </div>
                </div>

                {/* El desglose derivado */}
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-neutral-bg border-b border-divider">
                        <th className="px-3 py-1.5 text-[9px] font-bold text-gray-400 uppercase">Concepto</th>
                        <th className="px-3 py-1.5 text-[9px] font-bold text-gray-400 uppercase text-right">Subtotal</th>
                        <th className="px-3 py-1.5 text-[9px] font-bold text-gray-400 uppercase text-right">IVA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.lineas.map(l => (
                        <tr key={l.cargoId} className="border-b border-gray-50 last:border-b-0">
                          <td className="px-3 py-1.5 text-[12px] text-gray-700">
                            {l.concepto}
                            {l.avisoIVA && (
                              <span className="ml-1.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800" title={l.avisoIVA}>
                                IVA sin derivar
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-[12px] text-right tabular-nums">{money(l.subtotal)}</td>
                          <td className="px-3 py-1.5 text-[12px] text-right tabular-nums text-gray-500">
                            {l.tasaIVA}% · {money(l.montoIVA)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-neutral-bg border-t border-divider">
                        <td className="px-3 py-2 text-[11px] font-bold text-gray-600 uppercase">
                          Total {detalle.moneda}
                          {detalle.retencion > 0 && (
                            <span className="font-normal normal-case text-gray-400 ml-1.5">
                              (menos {money(detalle.retencion)} de retención)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-right tabular-nums text-gray-500">
                          {money(detalle.subtotal)}
                        </td>
                        <td className="px-3 py-2 text-[13px] font-bold text-right tabular-nums">
                          {money(detalle.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {detalle.avisos.map(a => (
                  <p key={a} className="text-[11px] text-amber-800 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                    {a}
                  </p>
                ))}

                <button
                  type="button"
                  onClick={registrar}
                  className="flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-brand-hover"
                >
                  <Plus className="w-4 h-4" />
                  Registrar factura
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* ── Facturas registradas ─────────────────────────────────────────── */}
      <div>
        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
          Facturas de este embarque
        </h4>

        {facturas.length === 0 ? (
          <p className="text-[12px] text-text-muted border border-card-border rounded-lg py-8 text-center bg-white">
            Todavía no se ha registrado ninguna factura.
          </p>
        ) : (
          <div className="space-y-3">
            {facturas.map(f => {
              const suyos = cobros.filter(c => c.facturaId === f.id);
              const saldo = saldoDeFactura(f, suyos);
              return (
                <FilaFactura
                  key={f.id}
                  factura={f} cobros={suyos} saldo={saldo}
                  embarque={embarque} clienteId={clienteId}
                  puedeFacturar={puedeFacturar}
                  onCancelar={onCancelar} onCobrar={onCobrar} onAnularCobro={onAnularCobro}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Una factura con sus cobros ──────────────────────────────────────────────

function FilaFactura({
  factura, cobros, saldo, embarque, clienteId, puedeFacturar,
  onCancelar, onCobrar, onAnularCobro,
}: {
  factura: FacturaCliente;
  cobros: CobroCliente[];
  saldo: ReturnType<typeof saldoDeFactura>;
  embarque: EmbarqueCompleto;
  clienteId: string | null;
  puedeFacturar: boolean;
  onCancelar: (id: string, motivo: string) => void;
  onCobrar: Props['onCobrar'];
  onAnularCobro: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState('');
  const [fechaCobro, setFechaCobro] = useState(new Date().toISOString().slice(0, 10));
  const [banco, setBanco] = useState(BANCOS_VERMUR[0].nombre);
  const [referencia, setReferencia] = useState('');

  const cancelada = factura.estado === 'cancelada';
  const vencida = !cancelada && saldo.saldo > 1 && factura.fechaVencimiento < new Date().toISOString().slice(0, 10);

  const registrarCobro = () => {
    const n = Number(monto);
    if (!(n > 0)) { window.alert('Captura el monto cobrado.'); return; }
    if (n > saldo.saldo + 1) {
      window.alert(`La factura solo debe ${factura.moneda} ${money(saldo.saldo)}. Cobrar de más deja un saldo a favor que nadie rastrea.`);
      return;
    }
    if (!referencia.trim()) { window.alert('Captura la referencia bancaria.'); return; }
    onCobrar({
      facturaId: factura.id, facturaNumero: factura.numero,
      embarqueId: embarque.id, embarqueFolio: embarque.folio,
      clienteId, clienteNombre: factura.clienteNombre,
      monto: n, moneda: factura.moneda,
      fechaCobro, banco, referencia: referencia.trim(),
    });
    setMonto(''); setReferencia(''); setAbierto(false);
  };

  return (
    <div className={`border rounded-lg bg-white overflow-hidden ${
      cancelada ? 'border-gray-200 opacity-60'
      : saldo.estado === 'cobrada' ? 'border-emerald-200'
      : vencida ? 'border-red-200' : 'border-card-border'
    }`}>
      <div className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-text-primary">
            {factura.numero}
            {factura.grupoFacturacion && (
              <span className="ml-2 text-[10px] font-semibold text-text-muted capitalize">
                · {factura.grupoFacturacion}
              </span>
            )}
          </p>
          <p className="text-[11px] text-text-muted">
            Emitida {factura.fechaEmision} · vence {factura.fechaVencimiento}
            {vencida && <span className="text-red-600 font-semibold"> · vencida</span>}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-[14px] font-bold text-text-primary tabular-nums">
              {factura.moneda} {money(factura.total)}
            </p>
            {!cancelada && saldo.saldo > 1 && (
              <p className="text-[11px] text-text-muted">
                Debe {factura.moneda} {money(saldo.saldo)}
              </p>
            )}
            {!cancelada && saldo.estado === 'cobrada' && (
              <p className="text-[11px] text-emerald-700 flex items-center gap-1 justify-end">
                <Check className="w-3 h-3" /> Cobrada
              </p>
            )}
          </div>

          {puedeFacturar && !cancelada && saldo.saldo > 1 && (
            <button
              type="button"
              onClick={() => setAbierto(v => !v)}
              className="text-[11px] font-bold text-white bg-brand hover:bg-brand-hover rounded-md px-3 py-1.5"
            >
              Registrar cobro
            </button>
          )}
          {puedeFacturar && !cancelada && cobros.length === 0 && (
            <button
              type="button"
              onClick={() => {
                const m = window.prompt('¿Por qué se cancela esta factura?');
                if (m?.trim()) onCancelar(factura.id, m.trim());
              }}
              className="text-gray-300 hover:text-red-600 p-1"
              title="Cancelar la factura"
            >
              <Ban className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {saldo.avisoMoneda && (
        <p className="px-4 pb-2 text-[11px] text-amber-800">{saldo.avisoMoneda}</p>
      )}
      {cancelada && factura.motivoCancelacion && (
        <p className="px-4 pb-2 text-[11px] text-text-muted">Cancelada: {factura.motivoCancelacion}</p>
      )}

      {/* Cobros recibidos */}
      {cobros.length > 0 && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {cobros.map(c => (
            <div key={c.id} className="px-4 py-1.5 flex items-center justify-between gap-3 text-[12px]">
              <span className="text-gray-600">
                {c.fechaCobro} · {c.banco} · <span className="font-mono text-[11px]">{c.referencia}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="font-semibold tabular-nums">{c.moneda} {money(c.monto)}</span>
                {puedeFacturar && (
                  <button
                    type="button"
                    onClick={() => { if (window.confirm('¿Anular este cobro?')) onAnularCobro(c.id); }}
                    className="text-[10px] font-bold text-gray-400 hover:text-red-600"
                  >
                    Anular
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Alta de cobro */}
      {abierto && (
        <div className="border-t border-gray-100 bg-neutral-bg/40 px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Monto</label>
            <input
              type="number" min={0} value={monto} onChange={e => setMonto(e.target.value)}
              placeholder={money(saldo.saldo)}
              className="w-full px-2.5 py-1.5 text-[12px] bg-white border border-card-border rounded-md outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Fecha</label>
            <input
              type="date" value={fechaCobro} onChange={e => setFechaCobro(e.target.value)}
              className="w-full px-2.5 py-1.5 text-[12px] bg-white border border-card-border rounded-md outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Banco</label>
            <select
              value={banco} onChange={e => setBanco(e.target.value)}
              className="w-full px-2.5 py-1.5 text-[12px] bg-white border border-card-border rounded-md outline-none focus:border-brand"
            >
              {BANCOS_VERMUR.map(b => <option key={b.id} value={b.nombre}>{b.nombre}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <input
              type="text" value={referencia} onChange={e => setReferencia(e.target.value)}
              placeholder="Referencia"
              className="flex-1 min-w-0 px-2.5 py-1.5 text-[12px] bg-white border border-card-border rounded-md outline-none focus:border-brand"
            />
            <button
              type="button" onClick={registrarCobro}
              className="text-[11px] font-bold text-white bg-brand hover:bg-brand-hover rounded-md px-3 shrink-0"
            >
              Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
