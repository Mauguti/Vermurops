/**
 * ModalAplicarPago.tsx — tarea 70 · P4, §7.1 del plan de pagos
 *
 * «Aplicar pago»: UNA entrada de dinero repartida entre VARIAS facturas del
 * mismo cliente y la misma moneda, con parcialidades.
 *
 * Reemplaza a «Registrar cobro», y el caso de siempre no cambia de esfuerzo:
 * se abre desde el renglón de una factura, con el monto y el reparto ya
 * puestos en su saldo, así que cobrar una sola factura sigue siendo abrir y
 * guardar. Lo que se agrega es poder marcar las demás.
 *
 * La lógica —qué facturas se ofrecen, el reparto en cascada, qué cuadra— vive
 * en `lib/aplicarPago.ts` con sus tests. Aquí solo está la pantalla.
 */

import { useMemo, useState } from 'react';
import { X, Clock, Wand2, AlertTriangle } from 'lucide-react';
import type { FacturaEnCartera } from '../../lib/cuentasPorCobrar';
import type { DatosPagoAplicado } from '../../lib/pagos';
import type { Moneda } from '../../lib/sumarPorMoneda';
import { BANCOS_VERMUR, BANCO_COBRO_DEFAULT } from '../../lib/cuentasPago';
import {
  facturasAplicables, avisoDeMoneda, repartirEnCascada, resumenAplicacion,
  restanteDespues, problemaAplicacion, problemaDeLinea, aplicacionesDelReparto,
  embarquesDelReparto, claveDeCliente, type Reparto,
} from '../../lib/aplicarPago';

const money = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  /** La factura desde la que se abrió: queda preseleccionada. */
  item: FacturaEnCartera;
  /** La cartera completa, para ofrecer las demás del mismo cliente. */
  items: FacturaEnCartera[];
  hoy: string;
  onCancelar: () => void;
  onConfirmar: (datos: DatosPagoAplicado) => Promise<void>;
  /** Quién aplica. Se congela en cada aplicación (§1.1). */
  por: { uid: string; nombre: string };
}

export default function ModalAplicarPago({ item, items, hoy, onCancelar, onConfirmar, por }: Props) {
  const f = item.factura;
  const clienteClave = claveDeCliente(f);

  /* La moneda sale de la factura desde la que se abrió: no se adivina, se
     hereda del destino que la persona ya eligió. Se puede cambiar, y al
     cambiarla la lista de facturas cambia con ella (§4). */
  const [moneda, setMoneda] = useState<Moneda>(f.moneda);
  const [monto, setMonto] = useState(String(item.saldo));
  const [fecha, setFecha] = useState(hoy);
  const [banco, setBanco] = useState(BANCO_COBRO_DEFAULT.nombre);
  const [referencia, setReferencia] = useState('');
  const [reparto, setReparto] = useState<Reparto>({ [f.id]: item.saldo });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aplicables = useMemo(
    () => facturasAplicables(items, { clienteClave, moneda }),
    [items, clienteClave, moneda],
  );
  const aviso = useMemo(
    () => avisoDeMoneda(items, { clienteClave, moneda }),
    [items, clienteClave, moneda],
  );

  const n = Number(monto);
  const resumen = resumenAplicacion(n, reparto, aplicables);
  const problemasLinea = aplicables
    .map(i => problemaDeLinea(i, reparto[i.factura.id] ?? 0))
    .filter((p): p is string => !!p);
  const problema = problemasLinea[0] ?? problemaAplicacion({ monto: n, moneda, fecha, banco }, resumen);

  const cambiarMoneda = (m: Moneda) => {
    setMoneda(m);
    /* El reparto apuntaba a facturas que ya no se ofrecen: conservarlo dejaría
       un «aplicado» sumando renglones invisibles. */
    setReparto({});
  };

  const marcar = (id: string, elegida: boolean, saldo: number) => setReparto(r => {
    const copia = { ...r };
    if (!elegida) { delete copia[id]; return copia; }
    // Al marcarla se propone lo que falta del pago, hasta su saldo.
    const libre = Math.max(0, resumen.sinAplicar);
    copia[id] = Math.round(Math.min(libre > 0 ? libre : saldo, saldo) * 100) / 100;
    return copia;
  });

  const cambiarLinea = (id: string, valor: string) => setReparto(r => {
    const copia = { ...r };
    const v = Number(valor);
    if (valor === '' || !Number.isFinite(v) || v <= 0) delete copia[id];
    else copia[id] = Math.round(v * 100) / 100;
    return copia;
  });

  const confirmar = async () => {
    if (problema || guardando) return;
    setGuardando(true); setError(null);
    try {
      await onConfirmar({
        terceroId: f.clienteId ?? null,
        terceroNombre: f.clienteNombre,
        monto: Math.round(n * 100) / 100,
        moneda,
        fecha,
        banco,
        referencia: referencia.trim() || null,
        aplicaciones: aplicacionesDelReparto(reparto, aplicables, { moneda, por, fecha }),
        embarqueIds: embarquesDelReparto(reparto, aplicables),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-gray-150 flex items-center justify-between bg-gray-50/50 shrink-0">
          <div>
            <h3 className="text-[14px] font-bold text-[#18181B]">Aplicar pago · {f.clienteNombre}</h3>
            <p className="text-[11px] text-gray-500">
              El dinero que entró, repartido entre sus facturas pendientes en {moneda}
            </p>
          </div>
          <button onClick={onCancelar} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* ── El dinero que entró ─────────────────────────────────────── */}
          <section>
            <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-2">El dinero que entró</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label className="block">
                <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Monto</span>
                <input
                  type="number" min={0} step="0.01" value={monto} onChange={e => setMonto(e.target.value)}
                  aria-label="Monto del pago"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario tabular-nums"
                />
              </label>
              <label className="block">
                <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Moneda</span>
                <select
                  value={moneda} onChange={e => cambiarMoneda(e.target.value as Moneda)}
                  aria-label="Moneda del pago"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario bg-white"
                >
                  <option value="MXN">MXN</option>
                  <option value="USD">USD</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Fecha del pago</span>
                <input
                  type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                  aria-label="Fecha del pago"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario"
                />
              </label>
              <label className="block">
                <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Cuenta de Vermur</span>
                <select
                  value={banco} onChange={e => setBanco(e.target.value)}
                  aria-label="Cuenta de Vermur"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario bg-white"
                >
                  {BANCOS_VERMUR.map(b => (
                    <option key={b.id} value={b.nombre} title={b.usoHabitual}>{b.nombre} — {b.usoHabitual}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block mt-3 max-w-xs">
              <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Referencia (opcional)</span>
              <input
                value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Puede llegar después"
                aria-label="Referencia bancaria"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario font-mono"
              />
            </label>
          </section>

          {/* ── A qué se aplica ─────────────────────────────────────────── */}
          <section>
            <div className="flex items-end justify-between gap-3 mb-2">
              <div>
                <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">A qué se aplica</h4>
                <p className="text-[10px] text-gray-500">
                  Pendientes de {f.clienteNombre} en {moneda}, lo más vencido primero.
                  Un pago no se aplica a facturas de otra moneda.
                </p>
              </div>
              {aplicables.length > 0 && (
                <button
                  onClick={() => setReparto(repartirEnCascada(n, aplicables))}
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primario border border-primario/40 hover:bg-primario/5 px-3 py-1.5 rounded-lg shrink-0"
                >
                  <Wand2 className="w-3 h-3" /> Aplicar lo más vencido primero
                </button>
              )}
            </div>

            {aviso && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{aviso}
              </p>
            )}

            {aplicables.length === 0 ? (
              !aviso && (
                <p className="text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  Este cliente no tiene facturas abiertas en {moneda}. El dinero que entra sin cubrir
                  ninguna factura se registra con «Registrar entrada de dinero», que lo liga al
                  embarque y fondea sus pagos.
                </p>
              )
            ) : (
              <div className="border border-gray-150 rounded-lg overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-gray-50/70 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                      <th className="px-3 py-2 w-8" />
                      <th className="px-3 py-2 text-left">Factura</th>
                      <th className="px-3 py-2 text-left">Vence</th>
                      <th className="px-3 py-2 text-right">Saldo</th>
                      <th className="px-3 py-2 text-right">Se aplica</th>
                      <th className="px-3 py-2 text-right">Queda</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {aplicables.map(i => {
                      const aplica = reparto[i.factura.id] ?? 0;
                      const elegida = aplica > 0;
                      const malLinea = problemaDeLinea(i, aplica);
                      return (
                        <tr key={i.factura.id} className={elegida ? 'bg-primario/[0.03]' : ''}>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox" checked={elegida}
                              onChange={e => marcar(i.factura.id, e.target.checked, i.saldo)}
                              aria-label={`Aplicar a ${i.factura.numero}`}
                              className="accent-[#4B2A8C]"
                            />
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-gray-800">{i.factura.numero}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {i.factura.fechaVencimiento}
                            {i.diasVencido > 0 && <span className="ml-1 text-[10px] font-bold text-red-600">+{i.diasVencido}d</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(i.saldo)}</td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number" min={0} step="0.01"
                              value={aplica > 0 ? String(aplica) : ''}
                              onChange={e => cambiarLinea(i.factura.id, e.target.value)}
                              placeholder="—"
                              aria-label={`Monto aplicado a ${i.factura.numero}`}
                              className={`w-28 px-2 py-1 border rounded-lg text-xs outline-none text-right tabular-nums ${
                                malLinea ? 'border-red-300 focus:border-red-500' : 'border-gray-200 focus:border-primario'}`}
                            />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-bold">
                            {elegida ? money(restanteDespues(i, aplica)) : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* El pie del reparto: aplicado, sin aplicar y si cuadra. */}
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2 px-1">
              <p className="text-[11px] text-gray-600 tabular-nums">
                Aplicado <strong>{moneda} {money(resumen.aplicado)}</strong>
                {' · '}
                Sin aplicar <strong className={resumen.sobreAplicado ? 'text-red-600' : ''}>{moneda} {money(resumen.sinAplicar)}</strong>
                {resumen.lineas > 0 && (
                  <span className="text-gray-400">
                    {' · '}{resumen.lineas} factura{resumen.lineas !== 1 ? 's' : ''}
                    {resumen.liquidadas > 0 && `, ${resumen.liquidadas} queda${resumen.liquidadas !== 1 ? 'n' : ''} cobrada${resumen.liquidadas !== 1 ? 's' : ''}`}
                    {resumen.parciales > 0 && `, ${resumen.parciales} parcial${resumen.parciales !== 1 ? 'es' : ''}`}
                  </span>
                )}
              </p>
              {!resumen.sobreAplicado && resumen.lineas > 0 && (
                resumen.sinAplicar <= 1 ? (
                  <span className="text-[11px] font-bold text-emerald-700">✓ cuadra</span>
                ) : (
                  <span className="text-[11px] font-bold text-amber-800 inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    quedan {moneda} {money(resumen.sinAplicar)} a favor del cliente
                  </span>
                )
              )}
            </div>

            {resumen.sinAplicar > 1 && !resumen.sobreAplicado && resumen.lineas > 0 && (
              <p className="text-[10px] text-gray-500 mt-1 px-1">
                El excedente se guarda con el pago, sin aplicar, y se puede aplicar después a una
                factura nueva. No se pierde y no liquida nada todavía.
              </p>
            )}
          </section>

          {(problema || error) && (
            <p className="text-[11px] text-red-600 font-semibold">{error ?? problema}</p>
          )}
        </div>

        <div className="px-5 py-4 bg-gray-50/50 border-t border-gray-150 flex justify-end gap-2 shrink-0">
          <button onClick={onCancelar} className="text-xs font-bold text-gray-500 hover:text-gray-700 uppercase tracking-wider px-4 py-2">Cancelar</button>
          <button
            onClick={confirmar} disabled={!!problema || guardando}
            className="bg-primario hover:bg-primario-hover text-white text-xs font-bold uppercase tracking-wider px-5 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {guardando ? 'Guardando…' : 'Registrar pago'}
          </button>
        </div>
      </div>
    </div>
  );
}
