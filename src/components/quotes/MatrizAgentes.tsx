import React, { useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, AlertTriangle, Check, Download } from 'lucide-react';
import type {
  MatrizComparativa, AgenteColumna, FilaMatriz,
} from '../../lib/matrizComparativa';
import { filaVigencia, agentesIncompletos } from '../../lib/matrizComparativa';

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

export interface MatrizAgentesProps {
  matriz: MatrizComparativa;
  titulo: string;
  editable: boolean;
  /** Agente preseleccionado para cargar. Por defecto, el menor. */
  agenteElegidoId: string | null;
  onElegirAgente: (agenteId: string) => void;
  onEditarCelda: (filaId: string, agente: AgenteColumna, valor: number | null) => void;
  onEditarVigencia: (agenteId: string, vigencia: string | null) => void;
  onEditarEtiqueta: (filaId: string, etiqueta: string) => void;
  onQuitarAgente: (agenteId: string) => void;
  onQuitarFila: (filaId: string) => void;
  onAgregarAgente: () => void;
  onAgregarFila: () => void;
  onCargarEnLineas: () => void;
}

export default function MatrizAgentes({
  matriz, titulo, editable, agenteElegidoId,
  onElegirAgente, onEditarCelda, onEditarVigencia, onEditarEtiqueta,
  onQuitarAgente, onQuitarFila, onAgregarAgente, onAgregarFila, onCargarEnLineas,
}: MatrizAgentesProps) {
  const [abierta, setAbierta] = useState(true);

  const { agentes, filas, totales, agenteMenorId } = matriz;
  const incompletos = agentesIncompletos(matriz);
  const idsIncompletos = new Set(incompletos.map(i => i.agenteId));
  const elegido = agenteElegidoId ?? agenteMenorId;

  const resumenPlegado = agenteMenorId
    ? `${agentes.length} agente${agentes.length !== 1 ? 's' : ''} · menor: ${
        agentes.find(a => a.id === agenteMenorId)?.nombre} $${money(totales[agenteMenorId] ?? 0)}`
    : `${agentes.length} agente${agentes.length !== 1 ? 's' : ''}`;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Encabezado */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60">
        <button onClick={() => setAbierta(v => !v)} className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-bold text-[#18181B]">Comparativa · {titulo}</span>
          <span className="text-[11px] text-gray-400 truncate">{resumenPlegado}</span>
          {abierta ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
        </button>

        {editable && abierta && (
          <button
            onClick={onAgregarAgente}
            className="flex items-center gap-1.5 text-[11px] font-bold text-[#E11D48] hover:bg-[#E11D48]/5 px-2 py-1 rounded-lg transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar agente
          </button>
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
                        const esMenor = a.id === agenteMenorId;
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
                              <span className={`block font-mono text-[13px] font-bold tabular-nums ${
                                esMenor ? 'text-emerald-700' : 'text-[#18181B]'}`}>
                                ${money(totales[a.id] ?? 0)}
                              </span>
                              {esMenor && (
                                <span className="block text-[9px] font-bold text-emerald-600">✓ Menor</span>
                              )}
                              {esElegido && !esMenor && (
                                <span className="block text-[9px] font-bold text-[#E11D48]">Elegido</span>
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
  onEditarEtiqueta: (filaId: string, etiqueta: string) => void;
  onQuitar: (filaId: string) => void;
}

function Renglon({ fila, agentes, editable, onEditarCelda, onEditarEtiqueta, onQuitar }: RenglonProps) {
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
        return (
          <td key={a.id} className="px-3 py-1.5 text-center">
            {editable ? (
              <input
                type="number"
                value={v ?? ''}
                placeholder="—"
                onChange={e => onEditarCelda(
                  fila.id, a,
                  e.target.value === '' ? null : Number(e.target.value),
                )}
                className="w-full px-1.5 py-1 text-[12px] text-right tabular-nums border border-transparent hover:border-gray-200 focus:border-[#E11D48] focus:bg-white bg-transparent rounded outline-none"
              />
            ) : (
              <span className="tabular-nums text-gray-700">
                {v === null || v === undefined ? '—' : money(v)}
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
