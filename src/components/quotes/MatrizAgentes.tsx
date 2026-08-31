import React, { useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, AlertTriangle, Download, Coins } from 'lucide-react';
import type {
  MatrizComparativa, AgenteColumna, FilaMatriz,
} from '../../lib/matrizComparativa';
import { filaVigencia, agentesIncompletos } from '../../lib/matrizComparativa';
import type {
  TotalComparable, ResultadoComparacion, MonedaCotizacion,
} from '../../lib/monedaComparativa';

/**
 * Comparativa de agentes: conceptos en filas, agentes en columnas, total del
 * paquete al pie.
 *
 * ── Qué compara ────────────────────────────────────────────────────────────
 * PAQUETES COMPLETOS, no tarifas sueltas. Gabi: «son cuatro agentes
 * diferentes... el más barato es el de Sunway con Hapag-Lloyd por 2200, en
 * total. Que eso incluye cuatro conceptos.»
 *
 * Es la pantalla donde se decide el margen, así que se lee de un vistazo: el
 * menor marcado en verde, los paquetes incompletos en ámbar, y nada más.
 */

const money = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** El total comparable, o el aviso de que falta la tasa para calcularlo. */
function fmtEquivalente(t: TotalComparable | undefined): string {
  if (!t) return '—';
  if (t.equivalente === null) return 'sin comparar';
  return `${money(t.equivalente)} ${t.monedaReferencia}`;
}

export interface MatrizAgentesProps {
  matriz: MatrizComparativa;
  /** Servicio activo, para el encabezado. */
  titulo: string;
  /** Concepto activo cuando la matriz está enfocada en uno. */
  subtitulo?: string;
  /** Servicios entre los que se puede cambiar. Una sola matriz, contextual. */
  servicios: { id: string; etiqueta: string }[];
  servicioActivoId: string;
  onCambiarServicio: (id: string) => void;
  /** Totales que respetan la moneda. */
  totalesComparables: Record<string, TotalComparable>;
  comparacion: ResultadoComparacion;
  tipoCambio: React.ReactNode;
  onEditarMoneda: (filaId: string, agente: AgenteColumna, moneda: MonedaCotizacion) => void;
  editable: boolean;
  /** Agente preseleccionado para cargar. Por defecto, el menor. */
  agenteElegidoId: string | null;
  onElegirAgente: (agenteId: string) => void;
  onEditarCelda: (filaId: string, agente: AgenteColumna, valor: number | null, moneda: MonedaCotizacion) => void;
  onEditarVigencia: (agenteId: string, vigencia: string | null) => void;
  onEditarEtiqueta: (filaId: string, etiqueta: string) => void;
  onQuitarAgente: (agenteId: string) => void;
  onQuitarFila: (filaId: string) => void;
  onAgregarAgente: () => void;
  onAgregarFila: () => void;
  onCargarEnLineas: () => void;
}

export default function MatrizAgentes({
  matriz, titulo, subtitulo, servicios, servicioActivoId, onCambiarServicio,
  totalesComparables, comparacion, tipoCambio, onEditarMoneda,
  editable, agenteElegidoId,
  onElegirAgente, onEditarCelda, onEditarVigencia, onEditarEtiqueta,
  onQuitarAgente, onQuitarFila, onAgregarAgente, onAgregarFila, onCargarEnLineas,
}: MatrizAgentesProps) {
  const [abierta, setAbierta] = useState(true);

  const { agentes, filas } = matriz;
  const incompletos = agentesIncompletos(matriz);
  const idsIncompletos = new Set(incompletos.map(i => i.agenteId));
  const menorId = comparacion.menorId;
  const elegido = agenteElegidoId ?? menorId;

  const resumenPlegado = menorId
    ? `${agentes.length} agente${agentes.length !== 1 ? 's' : ''} · menor: ${
        agentes.find(a => a.id === menorId)?.nombre} ${
        fmtEquivalente(totalesComparables[menorId])}`
    : `${agentes.length} agente${agentes.length !== 1 ? 's' : ''}`;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Encabezado: de qué es esta comparativa, y con qué tasa */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setAbierta(v => !v)} className="flex items-center gap-2 min-w-0">
            {abierta ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
            <span className="text-[13px] font-bold text-[#18181B] shrink-0">Comparativa de agentes</span>
            {!abierta && <span className="text-[11px] text-gray-400 truncate">{resumenPlegado}</span>}
          </button>

          {editable && abierta && (
            <button
              onClick={onAgregarAgente}
              className="flex items-center gap-1.5 text-[11px] font-bold text-[#E11D48] hover:bg-[#E11D48]/5 px-2.5 py-1 rounded-lg transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar proveedor
            </button>
          )}
        </div>

        {abierta && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Una sola matriz que cambia de contenido: se elige el servicio.
                Mismo patrón que el panel lateral de tarifas. */}
            <div className="flex items-center gap-1.5 min-w-0">
              {servicios.length > 1 ? (
                <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
                  {servicios.map(sv => (
                    <button
                      key={sv.id}
                      onClick={() => onCambiarServicio(sv.id)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize transition-all ${
                        sv.id === servicioActivoId
                          ? 'bg-white text-[#18181B] shadow-sm'
                          : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      {sv.etiqueta}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-[11px] font-semibold text-gray-500 capitalize">{titulo}</span>
              )}
              {subtitulo && (
                <span className="text-[11px] text-gray-400 truncate">· {subtitulo}</span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-gray-400">Montos antes de IVA</span>
              {tipoCambio}
            </div>
          </div>
        )}
      </div>

      {abierta && (
        <>
          {agentes.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[12px] text-gray-400">
                Sin agentes todavía. Agrega el primero para empezar a comparar.
              </p>
            </div>
          ) : (
            <>
              {/* Sin tasa no se compara: totales separados y sin ✓Menor. */}
              {comparacion.bloqueadaPorTipoCambio && (
                <div className="mx-4 mt-3 flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50/60">
                  <Coins className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-[1px]" />
                  <p className="text-[11px] text-amber-800 leading-snug">{comparacion.motivo}</p>
                </div>
              )}

              {/* Aviso de paquetes incompletos */}
              {incompletos.length > 0 && (
                <div className="mx-4 mt-3 flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50/60">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-[1px]" />
                  <p className="text-[11px] text-amber-800 leading-snug">
                    {incompletos.map(i => i.nombre).join(', ')}
                    {incompletos.length === 1 ? ' no cotizó' : ' no cotizaron'} todos los conceptos.
                    Su total sale más bajo por eso, no por ser más barato.
                  </p>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-left text-[9px] font-bold text-gray-400 uppercase tracking-wider sticky left-0 bg-white z-10 min-w-[180px]">
                        Concepto
                      </th>
                      {agentes.map(a => (
                        <th key={a.id} className="px-3 py-2 text-center min-w-[120px]">
                          <div className="flex items-center justify-center gap-1">
                            <span className={`text-[11px] font-bold truncate ${
                              a.id === elegido ? 'text-[#E11D48]' : 'text-gray-700'}`}>
                              {a.nombre}
                            </span>
                            {editable && (
                              <button
                                onClick={() => onQuitarAgente(a.id)}
                                className="text-gray-300 hover:text-red-500 shrink-0"
                                title={`Quitar ${a.nombre}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          {idsIncompletos.has(a.id) && (
                            <span className="block text-[8px] font-bold uppercase text-amber-600">
                              incompleto
                            </span>
                          )}
                        </th>
                      ))}
                      {editable && <th className="w-[36px]" />}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-50">
                    {filas.map(f => (
                      <Renglon
                        key={f.id}
                        fila={f}
                        agentes={agentes}
                        editable={editable}
                        onEditarCelda={onEditarCelda}
                        onEditarMoneda={onEditarMoneda}
                        onEditarEtiqueta={onEditarEtiqueta}
                        onQuitar={onQuitarFila}
                      />
                    ))}

                    {/* Vigencia: propiedad de la COLUMNA, pintada como fila.
                        Nunca suma — es de donde salía el total inflado del
                        sistema anterior. */}
                    <tr className="bg-gray-50/40">
                      <td className="px-3 py-1.5 sticky left-0 bg-gray-50/40 z-10">
                        <span className="px-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                          {filaVigencia(agentes).etiqueta}
                        </span>
                      </td>
                      {agentes.map(a => (
                        <td key={a.id} className="px-3 py-1.5 text-center">
                          {editable ? (
                            <input
                              type="date"
                              value={a.vigencia ?? ''}
                              onChange={e => onEditarVigencia(a.id, e.target.value || null)}
                              className="w-full px-1 py-1 text-[11px] text-center border border-transparent hover:border-gray-200 focus:border-[#E11D48] focus:bg-white bg-transparent rounded outline-none"
                            />
                          ) : (
                            <span className="text-[11px] text-gray-500">{a.vigencia ?? '—'}</span>
                          )}
                        </td>
                      ))}
                      {editable && <td />}
                    </tr>
                  </tbody>

                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50/60">
                      <td className="px-3 py-2.5 sticky left-0 bg-gray-50/60 z-10 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                        Total
                      </td>
                      {agentes.map(a => {
                        const t = totalesComparables[a.id];
                        const esMenor = a.id === menorId;
                        const esElegido = a.id === elegido;
                        return (
                          <td key={a.id} className="px-3 py-2.5 text-center">
                            <button
                              onClick={() => editable && onElegirAgente(a.id)}
                              disabled={!editable}
                              className={`w-full rounded-lg px-1.5 py-1 transition-colors ${
                                esElegido ? 'ring-2 ring-[#E11D48]/40 bg-[#E11D48]/5' : editable ? 'hover:bg-gray-100' : ''
                              }`}
                              title={editable ? `Elegir a ${a.nombre}` : undefined}
                            >
                              {/* El equivalente manda; el desglose original
                                  queda debajo, siempre visible (§4.3). */}
                              <span className={`block font-mono text-[13px] font-bold tabular-nums ${
                                t?.requiereTipoCambio ? 'text-amber-600'
                                : esMenor ? 'text-emerald-700' : 'text-[#18181B]'}`}>
                                {fmtEquivalente(t)}
                              </span>
                              {t && t.monedasPresentes.length > 1 && (
                                <span className="block text-[9px] text-gray-400 font-mono leading-tight mt-0.5">
                                  {t.monedasPresentes.map(m => `${m} ${money(t.porMoneda[m])}`).join(' + ')}
                                </span>
                              )}
                              {esMenor && (
                                <span className="block text-[9px] font-bold text-emerald-600 mt-0.5">✓ Menor</span>
                              )}
                              {esElegido && !esMenor && (
                                <span className="block text-[9px] font-bold text-[#E11D48] mt-0.5">Elegido</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                      {editable && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>

              {editable && (
                <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100">
                  <button
                    onClick={onAgregarFila}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 hover:text-[#E11D48] hover:bg-[#E11D48]/5 px-2 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar concepto
                  </button>

                  <button
                    onClick={onCargarEnLineas}
                    disabled={!elegido}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Cargar en líneas
                    {elegido && (
                      <span className="font-normal normal-case">
                        · {agentes.find(a => a.id === elegido)?.nombre}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Un renglón de concepto ───────────────────────────────────────────────────

interface RenglonProps {
  fila: FilaMatriz;
  agentes: AgenteColumna[];
  editable: boolean;
  onEditarCelda: MatrizAgentesProps['onEditarCelda'];
  onEditarMoneda: MatrizAgentesProps['onEditarMoneda'];
  onEditarEtiqueta: (filaId: string, etiqueta: string) => void;
  onQuitar: (filaId: string) => void;
}

function Renglon({ fila, agentes, editable, onEditarCelda, onEditarMoneda, onEditarEtiqueta, onQuitar }: RenglonProps) {
  const esDato = fila.tipo === 'dato';

  return (
    <tr className="hover:bg-gray-50/60 group">
      <td className="px-3 py-1.5 sticky left-0 bg-white group-hover:bg-gray-50/60 z-10">
        {editable ? (
          <input
            value={fila.etiqueta}
            onChange={e => onEditarEtiqueta(fila.id, e.target.value)}
            className="w-full px-2 py-1 text-[12px] font-medium text-gray-800 border border-transparent hover:border-gray-200 focus:border-[#E11D48] focus:bg-white bg-transparent rounded outline-none"
          />
        ) : (
          <span className="px-2 font-medium text-gray-800">{fila.etiqueta}</span>
        )}
        {esDato && (
          <span className="ml-2 text-[8px] font-bold uppercase text-gray-400">no suma</span>
        )}
      </td>

      {agentes.map(a => {
        const v = fila.celdas[a.id];
        const moneda = fila.monedas?.[a.id] ?? 'USD';
        const hayValor = v !== null && v !== undefined;
        return (
          <td key={a.id} className="px-2 py-1.5">
            {editable ? (
              <div className="flex items-center gap-0.5">
                <input
                  type="number"
                  value={v ?? ''}
                  placeholder="—"
                  onChange={e => onEditarCelda(
                    fila.id, a,
                    e.target.value === '' ? null : Number(e.target.value),
                    moneda,
                  )}
                  className="w-full min-w-0 px-1.5 py-1 text-[12px] text-right tabular-nums bg-white border border-gray-150 rounded hover:border-gray-300 focus:border-[#E11D48] focus:ring-1 focus:ring-[#E11D48]/20 outline-none"
                />
                {/* La moneda va por celda: el mismo concepto puede llegar en
                    USD de un agente y en MXN de otro (§4.3). */}
                <select
                  value={moneda}
                  onChange={e => onEditarMoneda(fila.id, a, e.target.value as MonedaCotizacion)}
                  disabled={!hayValor}
                  className={`shrink-0 text-[9px] font-bold rounded px-0.5 py-1 outline-none cursor-pointer transition-colors ${
                    hayValor
                      ? moneda === 'MXN'
                        ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                        : 'text-gray-500 bg-gray-50 hover:bg-gray-100'
                      : 'text-gray-300 bg-transparent'
                  }`}
                >
                  <option value="USD">USD</option>
                  <option value="MXN">MXN</option>
                </select>
              </div>
            ) : (
              <span className="block text-right tabular-nums text-gray-700">
                {hayValor ? `${money(v!)} ${moneda}` : '—'}
              </span>
            )}
          </td>
        );
      })}

      {editable && (
        <td className="px-1 py-1.5">
          <button
            onClick={() => onQuitar(fila.id)}
            className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Quitar concepto"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </td>
      )}
    </tr>
  );
}
