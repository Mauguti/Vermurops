import React, { useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, AlertTriangle, Check, Coins, X } from 'lucide-react';
import ConceptoSelector from '../conceptos/ConceptoSelector';
import type { ConceptoVermur } from '../conceptos/ConceptosData';
import type {
  MatrizComparativa, AgenteColumna, FilaMatriz,
} from '../../lib/matrizComparativa';
import { filaVigencia, agentesIncompletos } from '../../lib/matrizComparativa';
import type { SeleccionMatriz, ResumenSeleccion } from '../../lib/seleccionMatriz';
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
  /**
   * M-2 · La selección DERIVADA de concepto.tarifas — la matriz nunca guarda
   * la suya. Elegir escribe en las líneas al momento: elegir YA es cargar.
   */
  seleccion: SeleccionMatriz;
  /** Agente con mayoría de filas: contra él se pinta la EXCEPCIÓN. */
  dominante: string | null;
  /** El más barato de cada fila — lo que importa en el caso B. */
  menoresPorFila: Record<string, string | null>;
  resumen: ResumenSeleccion;
  /** Clic en una celda: elige (o des-elige) ese agente para esa fila. */
  onElegirCelda: (fila: FilaMatriz, agenteId: string) => void;
  /** Clic en el total: elige la columna completa — el caso A. */
  onElegirAgente: (agenteId: string) => void;
  onEditarCelda: (filaId: string, agente: AgenteColumna, valor: number | null, moneda: MonedaCotizacion) => void;
  onEditarVigencia: (agenteId: string, vigencia: string | null) => void;
  onEditarEtiqueta: (filaId: string, etiqueta: string) => void;
  onQuitarAgente: (agenteId: string) => void;
  onQuitarFila: (filaId: string) => void;
  onAgregarAgente: () => void;
  /** Catálogo para el renglón borrador de «Agregar concepto». */
  conceptosActivos: ConceptoVermur[];
  /**
   * La fila nueva nace YA con concepto del catálogo (Bloque 0, 24-sep-2026):
   * antes nacía vacía y el autoguardado la escribía en ese instante.
   */
  onAgregarFila: (conceptoId: string, nombre: string) => void;
}

export default function MatrizAgentes({
  matriz, titulo, subtitulo, servicios, servicioActivoId, onCambiarServicio,
  totalesComparables, comparacion, tipoCambio, onEditarMoneda,
  editable, seleccion, dominante, menoresPorFila, resumen,
  onElegirCelda, onElegirAgente, onEditarCelda, onEditarVigencia, onEditarEtiqueta,
  onQuitarAgente, onQuitarFila, onAgregarAgente, onAgregarFila, conceptosActivos,
}: MatrizAgentesProps) {
  const [agregandoFila, setAgregandoFila] = useState(false);
  const [abierta, setAbierta] = useState(true);

  const { agentes, filas } = matriz;
  const incompletos = agentesIncompletos(matriz);
  const idsIncompletos = new Set(incompletos.map(i => i.agenteId));
  const menorId = comparacion.menorId;
  /*
   * La columna se pinta «elegida» solo cuando TODA la selección es suya (el
   * caso A puro). Con selección mixta manda el resumen y las marcas por
   * celda; el ✓Menor sigue siendo sugerencia visual, nunca selección.
   */
  const columnaElegida = resumen.etiqueta?.tipo === 'unico' && resumen.sinElegir === 0
    ? resumen.etiqueta.agenteId
    : null;

  /** «Sunway · $1,850» / «3 proveedores · 2 sin elegir · USD…». */
  const textoResumen = (() => {
    if (!resumen.etiqueta) return null;
    const quien = resumen.etiqueta.tipo === 'unico'
      ? agentes.find(a => a.id === (resumen.etiqueta as { agenteId: string }).agenteId)?.nombre ?? 'Un proveedor'
      : `${resumen.etiqueta.cuantos} proveedores`;
    const faltan = resumen.sinElegir > 0
      ? ` · ${resumen.sinElegir} concepto${resumen.sinElegir !== 1 ? 's' : ''} sin elegir`
      : '';
    const monto = resumen.total.equivalente !== null
      ? fmtEquivalente(resumen.total)
      : resumen.total.monedasPresentes.map(m => `${m} ${money(resumen.total.porMoneda[m])}`).join(' + ');
    return `${quien}${faltan} · ${monto}`;
  })();

  const resumenPlegado = textoResumen ?? (menorId
    ? `${agentes.length} agente${agentes.length !== 1 ? 's' : ''} · menor: ${
        agentes.find(a => a.id === menorId)?.nombre} ${
        fmtEquivalente(totalesComparables[menorId])}`
    : `${agentes.length} agente${agentes.length !== 1 ? 's' : ''}`);

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
              className="flex items-center gap-1.5 text-[11px] font-bold text-primario hover:bg-primario/5 px-2.5 py-1 rounded-lg transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar proveedor
            </button>
          )}
        </div>

        {abierta && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* UNA comparativa, sin pestañas (7-sep-2026). Desde que la
                solicitud lleva una sola modalidad, elegir servicio dejó de
                tener sentido: el caso normal es una matriz y ya.

                El selector sobrevive SOLO como fallback para las cotizaciones
                viejas que sí tienen varios servicios — discreto, un select,
                no una fila de pestañas que sugiera que hay que navegarlas. */}
            <div className="flex items-center gap-1.5 min-w-0">
              {servicios.length > 1 ? (
                <select
                  value={servicioActivoId}
                  onChange={e => onCambiarServicio(e.target.value)}
                  className="text-[11px] font-semibold text-gray-600 capitalize bg-transparent border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-primario cursor-pointer"
                  title="Esta cotización tiene varios servicios"
                >
                  {servicios.map(sv => (
                    <option key={sv.id} value={sv.id}>{sv.etiqueta}</option>
                  ))}
                </select>
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
                              a.id === columnaElegida ? 'text-primario' : 'text-gray-700'}`}>
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
                        seleccionFila={seleccion.porFila[f.id] ?? null}
                        dominante={dominante}
                        menorDeFila={menoresPorFila[f.id] ?? null}
                        onElegirCelda={onElegirCelda}
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
                              className="w-full px-1 py-1 text-[11px] text-center border border-transparent hover:border-gray-200 focus:border-primario focus:bg-white bg-transparent rounded outline-none"
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
                        const esElegido = a.id === columnaElegida;
                        return (
                          <td key={a.id} className="px-3 py-2.5 text-center">
                            <button
                              onClick={() => editable && onElegirAgente(a.id)}
                              disabled={!editable}
                              className={`w-full rounded-lg px-1.5 py-1 transition-colors ${
                                esElegido ? 'ring-2 ring-primario/40 bg-primario/5' : editable ? 'hover:bg-gray-100' : ''
                              }`}
                              title={editable ? `Elegir a ${a.nombre} para TODAS las filas (el paquete completo)` : undefined}
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
                                <span className="block text-[9px] font-bold text-primario mt-0.5">Elegido</span>
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
                <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-gray-100">
                  {agregandoFila ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-64">
                        <ConceptoSelector
                          compacto
                          autoAbrir
                          selectedNombre={null}
                          conceptos={conceptosActivos}
                          onSelect={(conceptoId, nombre) => { onAgregarFila(conceptoId, nombre); setAgregandoFila(false); }}
                        />
                      </div>
                      <span className="text-[10px] text-amber-700 truncate">La fila se crea al elegir el concepto.</span>
                      <button onClick={() => setAgregandoFila(false)} className="p-1 text-gray-300 hover:text-red-500" title="Cancelar">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                  <button
                    onClick={() => setAgregandoFila(true)}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 hover:text-primario hover:bg-primario/5 px-2 py-1.5 rounded-lg transition-colors shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar concepto
                  </button>
                  )}

                  {/* «Cargar en líneas» ya no existe: ELEGIR ES CARGAR. El
                      resumen dice qué quedó elegido y qué falta. */}
                  {textoResumen ? (
                    <span className="text-[11px] font-semibold text-gray-600 truncate" title={textoResumen}>
                      {textoResumen}
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-400">
                      Elige el total de un agente (paquete completo) o celda por celda.
                    </span>
                  )}
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
  /** Agente elegido para esta fila. null = sin elegir o combinada. */
  seleccionFila: string | null;
  dominante: string | null;
  menorDeFila: string | null;
  onElegirCelda: MatrizAgentesProps['onElegirCelda'];
  onEditarCelda: MatrizAgentesProps['onEditarCelda'];
  onEditarMoneda: MatrizAgentesProps['onEditarMoneda'];
  onEditarEtiqueta: (filaId: string, etiqueta: string) => void;
  onQuitar: (filaId: string) => void;
}

function Renglon({
  fila, agentes, editable, seleccionFila, dominante, menorDeFila,
  onElegirCelda, onEditarCelda, onEditarMoneda, onEditarEtiqueta, onQuitar,
}: RenglonProps) {
  const esDato = fila.tipo === 'dato';

  return (
    <tr className="hover:bg-gray-50/60 group">
      <td className="px-3 py-1.5 sticky left-0 bg-white group-hover:bg-gray-50/60 z-10">
        {editable ? (
          <input
            value={fila.etiqueta}
            onChange={e => onEditarEtiqueta(fila.id, e.target.value)}
            className="w-full px-2 py-1 text-[12px] font-medium text-gray-800 border border-transparent hover:border-gray-200 focus:border-primario focus:bg-white bg-transparent rounded outline-none"
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
        /*
         * Marcas de la celda:
         *   elegida  → check sólido y fondo rojo tenue
         *   EXCEPCIÓN → además borde ámbar: hay un agente dominante (el
         *              «paquete») y esta fila se salió de él
         *   menor    → punto esmeralda discreto: el más barato de la FILA,
         *              que es lo que importa cuando se elige concepto a
         *              concepto (caso B)
         */
        const elegida = seleccionFila === a.id;
        const esExcepcion = elegida && dominante !== null && a.id !== dominante;
        const esMenorFila = menorDeFila === a.id;
        const elegible = editable && (v ?? 0) > 0;
        return (
          <td key={a.id} className={`px-2 py-1.5 transition-colors ${
            esExcepcion ? 'bg-amber-50/70 ring-1 ring-inset ring-amber-300'
            : elegida ? 'bg-primario/5'
            : ''}`}>
            {editable ? (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => elegible && onElegirCelda(fila, a.id)}
                  disabled={!elegible}
                  className={`shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                    elegida
                      ? 'bg-primario border-primario text-white'
                      : elegible
                      ? 'border-gray-300 text-transparent hover:border-primario'
                      : 'border-gray-100 text-transparent cursor-default'}`}
                  title={!elegible ? undefined
                    : elegida ? 'Quitar la elección de esta fila'
                    : esExcepcion ? 'Fuera del paquete: esta fila se eligió con otro proveedor'
                    : `Elegir a ${a.nombre} para «${fila.etiqueta}»`}
                >
                  <Check className="w-2.5 h-2.5" />
                </button>
                {esMenorFila && (
                  <span
                    className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500"
                    title="El más barato de esta fila"
                  />
                )}
                <input
                  type="number"
                  value={v ?? ''}
                  placeholder="—"
                  onChange={e => onEditarCelda(
                    fila.id, a,
                    e.target.value === '' ? null : Number(e.target.value),
                    moneda,
                  )}
                  className="w-full min-w-0 px-1.5 py-1 text-[12px] text-right tabular-nums bg-white border border-gray-150 rounded hover:border-gray-300 focus:border-primario focus:ring-1 focus:ring-primario/20 outline-none"
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
              <span className={`block text-right tabular-nums ${elegida ? 'font-bold text-[#18181B]' : 'text-gray-700'}`}>
                {elegida && <Check className="inline w-3 h-3 text-primario mr-1" />}
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
