/**
 * FichaPago.tsx — tarea 72 · P5, §7.3 del plan de pagos
 *
 * La ficha de UN pago: el movimiento arriba, sus aplicaciones con enlace a
 * cada factura, el saldo a favor, y lo que se le puede hacer —aplicar el
 * saldo, quitar una aplicación, anular— con motivo obligatorio.
 *
 * Nada de lo que hace borra: una aplicación quitada y un pago anulado dejan
 * su rastro (quién, cuándo, por qué) en la bitácora del embarque, y el pago
 * anulado sigue en la lista, filtrable.
 *
 * Las reglas —qué se puede, qué valida el motivo, qué queda de `embarqueIds`—
 * viven en `lib/reversaPagos.ts` con sus tests. Aquí solo está la pantalla.
 */

import { useMemo, useState } from 'react';
import { X, Banknote, AlertTriangle, History } from 'lucide-react';
import { aplicado, planAnulacionProveedor, type Pago } from '../../lib/pagos';
import type { OrdenCompra } from '../ordenesCompra/OrdenesCompraData';
import type { RolOC } from '../../lib/stateMachineOC';
import {
  aFavorDe, correccionesDelPago, estadoDePago, ETIQUETA_ESTADO_PAGO, motivoNoEditable,
} from '../../lib/reversaPagos';
import type { EntradaBitacora } from '../shipments/EmbarquesData';
import { ESTADO_PAGO_CLS } from './pagosColumns';
import MotivoCorreccion from './MotivoCorreccion';

const money = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Lo que está esperando un motivo. */
type Pendiente = { tipo: 'anular' } | { tipo: 'quitar'; destinoId: string; numero: string };

interface Props {
  pago: Pago;
  /** `cobro.registrar`. Sin él la ficha se lee y no se toca. */
  puedeEditar: boolean;
  /** Hay facturas del mismo cliente y moneda con saldo: sin ellas no se ofrece aplicar. */
  hayFacturasParaAplicar: boolean;
  /** Las bitácoras de los embarques que el pago tocó, para el rastro de correcciones. */
  bitacoras: (EntradaBitacora[] | undefined)[];
  /** Tarea 80 · Las órdenes de compra, para el pago a proveedor: su estado y si pueden regresar. */
  ordenes?: OrdenCompra[];
  rolOC?: RolOC;
  onCerrar: () => void;
  onAplicarSaldo: () => void;
  onQuitar: (pagoId: string, destinoId: string, motivo: string) => Promise<void>;
  onAnular: (pago: Pago, motivo: string) => Promise<void>;
}

export default function FichaPago({
  pago, puedeEditar, hayFacturasParaAplicar, bitacoras, ordenes = [], rolOC = 'ventas',
  onCerrar, onAplicarSaldo, onQuitar, onAnular,
}: Props) {
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const estado = estadoDePago(pago);
  const anulado = estado === 'anulado';
  const aFavor = aFavorDe(pago);
  const noEditable = motivoNoEditable(pago);
  const esProveedor = pago.lado === 'proveedor';
  // Tarea 80 · Qué pasaría con cada orden si se anula. Se calcula ANTES de
  // abrir el motivo: si una no puede regresar, el botón dice cuál y por qué.
  const plan = useMemo(
    () => esProveedor ? planAnulacionProveedor(pago, ordenes, rolOC) : null,
    [esProveedor, pago, ordenes, rolOC],
  );
  const rastro = useMemo(() => correccionesDelPago(pago, bitacoras), [pago, bitacoras]);

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" data-testid="ficha-pago">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-gray-150 flex items-center justify-between bg-gray-50/50 shrink-0">
          <div className="min-w-0">
            <h3 className="text-[14px] font-bold text-[#18181B] flex items-center gap-2 flex-wrap">
              <span className="font-mono">{pago.folio}</span>
              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${ESTADO_PAGO_CLS[estado]}`}>
                {ETIQUETA_ESTADO_PAGO[estado]}
              </span>
            </h3>
            <p className="text-[11px] text-gray-500 truncate">{pago.terceroNombre}</p>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {/* ── El movimiento ──────────────────────────────────────────── */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            <Dato t="Monto" v={`${pago.moneda} ${money(pago.monto)}`} fuerte />
            <Dato t="Fecha" v={pago.fecha || '—'} />
            <Dato t={esProveedor ? 'Cuenta de salida' : 'Cuenta de Vermur'} v={pago.banco || 'Sin cuenta registrada'} />
            <Dato t="Referencia" v={pago.referencia || 'Sin referencia'} mono />
            <Dato t="Aplicado" v={`${pago.moneda} ${money(anulado ? 0 : aplicado(pago))}`} />
            <Dato t={esProveedor ? 'Sin aplicar' : 'A favor del cliente'} v={`${pago.moneda} ${money(aFavor)}`} />
            <Dato t="Registró" v={pago.registradoPor?.nombre || '—'} />
            <Dato t="Origen" v={pago.origen && pago.origen !== 'app' ? 'Registro anterior' : 'Pago'} />
          </section>

          {anulado && (
            <p className="text-[11px] text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              Este pago está <strong>anulado</strong>: no mueve ningún saldo y no fondea nada. Sigue en la
              lista —con el filtro «Anulados»— porque el movimiento existió.
              {pago.anulacion
                ? <> Se anuló el {pago.anulacion.en.slice(0, 10)} por {pago.anulacion.por}. <span data-testid="motivo-anulacion">Motivo: {pago.anulacion.motivo}</span></>
                : pago.updatedAt && <> Se anuló el {pago.updatedAt.slice(0, 10)}.</>}
            </p>
          )}

          {/* ── Sus aplicaciones ───────────────────────────────────────── */}
          <section>
            <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-2">{esProveedor ? 'Órdenes que cubrió' : 'A qué se aplicó'}</h4>
            {(pago.aplicaciones ?? []).length === 0 ? (
              <p className="text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                Este pago no cubre ninguna factura todavía: es dinero a cuenta del cliente.
              </p>
            ) : (
              <div className="border border-gray-150 rounded-lg overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-gray-50/70 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                      <th className="px-3 py-2 text-left">{esProveedor ? 'Orden' : 'Factura'}</th>
                      <th className="px-3 py-2 text-right">Monto</th>
                      <th className="px-3 py-2 text-left">Aplicó</th>
                      {esProveedor && <th className="px-3 py-2 text-left">Estado hoy</th>}
                      <th className="px-3 py-2 w-28" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pago.aplicaciones.map((a, i) => (
                      <tr key={`${a.destinoId}-${i}`} data-testid="aplicacion-pago">
                        <td className="px-3 py-2 font-mono font-semibold text-gray-800">{a.destinoNumero || a.destinoId}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{a.moneda} {money(a.monto)}</td>
                        <td className="px-3 py-2 text-gray-500">
                          {a.aplicadaPor?.nombre || '—'}{a.aplicadaPor?.fecha ? ` · ${a.aplicadaPor.fecha.slice(0, 10)}` : ''}
                        </td>
                        {esProveedor && (
                          <td className="px-3 py-2 text-gray-700" data-testid="estado-orden-pago">
                            {ordenes.find(o => o.id === a.destinoId)?.estado ?? 'no encontrada'}
                          </td>
                        )}
                        <td className="px-3 py-2 text-right">
                          {puedeEditar && !noEditable && !esProveedor && (
                            <button
                              onClick={() => { setPendiente({ tipo: 'quitar', destinoId: a.destinoId, numero: a.destinoNumero }); }}
                              className="text-[10px] font-bold uppercase tracking-wider text-primario hover:underline whitespace-nowrap"
                            >
                              Quitar aplicación
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Lo que se le puede hacer ───────────────────────────────── */}
          {puedeEditar && !anulado && (
            <section className="flex flex-wrap items-center gap-2">
              {!noEditable && aFavor > 0 && (
                <button
                  onClick={onAplicarSaldo} disabled={!hayFacturasParaAplicar}
                  title={hayFacturasParaAplicar ? undefined : `Este cliente no tiene facturas abiertas en ${pago.moneda}`}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white bg-primario hover:bg-primario-hover px-3 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Banknote className="w-3.5 h-3.5" /> Aplicar saldo a favor
                </button>
              )}
              <button
                onClick={() => { setPendiente({ tipo: 'anular' }); }}
                disabled={!!plan && plan.problemas.length > 0}
                data-testid="anular-pago"
                className="disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-bold uppercase tracking-wider text-peligro border border-peligro/40 hover:bg-peligro/5 px-3 py-2 rounded-lg"
              >
                Anular pago
              </button>
              {!hayFacturasParaAplicar && !noEditable && aFavor > 0 && (
                <span className="text-[10px] text-gray-500">
                  El cliente no tiene facturas abiertas en {pago.moneda}: el saldo queda a su favor.
                </span>
              )}
            </section>
          )}
          {puedeEditar && !anulado && noEditable && !esProveedor && (
            <p className="text-[10px] text-gray-500 flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-amber-600" />{noEditable}
            </p>
          )}
          {esProveedor && !anulado && plan && plan.problemas.length > 0 && (
            <div className="text-[11px] text-gray-800 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2" data-testid="problemas-anulacion">
              <p className="font-bold mb-1 flex items-center gap-1.5"><AlertTriangle className="w-3 h-3 text-amber-600" /> No se puede anular este pago:</p>
              <ul className="list-disc pl-5 space-y-0.5">{plan.problemas.map(x => <li key={x}>{x}</li>)}</ul>
              <p className="mt-1 text-gray-600">No se anula nada a medias: o regresan todas las órdenes o ninguna.</p>
            </div>
          )}
          {!puedeEditar && (
            <p className="text-[10px] text-gray-500">
              Solo Administración corrige pagos. Aquí se lee, con su historia.
            </p>
          )}

          {/* ── El motivo ──────────────────────────────────────────────── */}
          {pendiente && (
            <MotivoCorreccion
              descripcion={pendiente.tipo === 'anular' && esProveedor
                ? `Anular ${pago.folio}: ${pago.moneda} ${money(pago.monto)} dejan de contar. ${plan?.ordenes.length ?? 0} orden(es) regresan a «autorizada» y vuelven a Programación de pagos.`
                : pendiente.tipo === 'anular'
                ? `Anular ${pago.folio}: ${pago.moneda} ${money(pago.monto)} dejan de contar. Las facturas que cubría recuperan su saldo.`
                : `Quitar la aplicación a ${pendiente.numero}: ese dinero vuelve a quedar sin aplicar y la factura recupera su saldo.`}
              confirmar={pendiente.tipo === 'anular' ? 'Anular pago' : 'Quitar aplicación'}
              onCancelar={() => setPendiente(null)}
              onConfirmar={async (m) => {
                if (pendiente.tipo === 'anular') await onAnular(pago, m);
                else await onQuitar(pago.id, pendiente.destinoId, m);
                setPendiente(null);
              }}
            />
          )}

          {/* ── El rastro: quién, cuándo y por qué ─────────────────────── */}
          <section>
            <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <History className="w-3 h-3" /> Correcciones
            </h4>
            {rastro.length === 0 ? (
              <p className="text-[11px] text-gray-500">Ninguna: el pago está como se registró.</p>
            ) : (
              <ul className="space-y-1.5" data-testid="correcciones-pago">
                {rastro.map(e => (
                  <li key={e.id} className="text-[11px] text-gray-700 border-l-2 border-gray-200 pl-3">
                    <span className="font-semibold">{e.titulo}</span>
                    <span className="text-gray-400"> · {e.fecha.slice(0, 16).replace('T', ' ')}</span>
                    {e.detalle && <span className="block text-gray-500">{e.detalle}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Dato({ t, v, fuerte, mono }: { t: string; v: string; fuerte?: boolean; mono?: boolean }) {
  return (
    <div>
      <span className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">{t}</span>
      <span className={`${fuerte ? 'font-bold text-gray-900' : 'text-gray-700'} ${mono ? 'font-mono text-[11px]' : ''}`}>{v}</span>
    </div>
  );
}
