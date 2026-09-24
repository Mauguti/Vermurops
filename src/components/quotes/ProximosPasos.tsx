import React from 'react';
import { AlertTriangle, Check, CheckCircle2, Send, X } from 'lucide-react';
import type { PipelineStageId } from './QuotesData';
import type { UserRole } from '../../auth/users';
import {
  lineaDeEtapas, indiceEnLinea, type ProximoPaso,
} from '../../lib/proximosPasos';
import {
  faltantesPorLinea, resumenFaltantes, textoFaltantesLinea, type Prontitud,
} from '../../lib/prontitudCotizacion';

/**
 * La franja de «próximos pasos», arriba de las pestañas de la cotización.
 *
 * ── De dónde sale ──────────────────────────────────────────────────────────
 * Feedback del cliente (23-sep-2026): las acciones estaban hasta abajo y
 * para usarlas había que recorrer toda la ficha. El patrón que piden es el
 * de Salesforce:
 *
 *     ○ Solicitud ─ ● Pricing ─ ○ Enviada ─ ○ Negociación ─ ○ Ganada
 *     Siguiente: consolidar la cotización              [ Consolidar ]
 *     Faltan 2 conceptos por completar: Maniobras (sin proveedor) · …
 *
 * ── Lo que decide y lo que no ──────────────────────────────────────────────
 * Esto solo pinta. Las etapas que ve cada rol salen de `lineaDeEtapas`
 * (Ventas cinco pasos, Pricing las internas); la acción que se ofrece es la
 * que la máquina de estados dio al rol (`proximoPaso`); y si no se puede
 * avanzar, en vez del botón va lo que falta, calculado por
 * `prontitudCotizacion`. Es una franja, no una sección: cabe en dos líneas.
 */

interface Props {
  rol: UserRole;
  etapa: PipelineStageId;
  paso: ProximoPaso;
  prontitud: Prontitud;
  /** La cotización cumple lo que la transición exige. */
  puedeAvanzar: boolean;
  /** Razón fija cuando no es una falta por línea (p. ej. solicitud vacía). */
  porque: string;
  onAvanzar: (hacia: PipelineStageId) => void;
  /** «Marcar ganada» disponible además del botón principal. */
  ganadaSecundaria: boolean;
  onMarcarGanada: () => void;
  /** Viendo una versión pasada: se informa, no se actúa. */
  soloLectura?: boolean;
  /**
   * Un veto de la máquina de estados CON camino (Bloque 2a): «sin cliente
   * vinculado» y los botones que llevan a resolverlo. Se pinta arriba de
   * los faltantes y aunque el botón principal no sea «ganada».
   */
  bloqueo?: { texto: string; acciones: { etiqueta: string; onClick: () => void }[] };
}

export default function ProximosPasos({
  rol, etapa, paso, prontitud, puedeAvanzar, porque,
  onAvanzar, ganadaSecundaria, onMarcarGanada, soloLectura = false, bloqueo,
}: Props) {
  const linea = lineaDeEtapas(rol);
  const actual = indiceEnLinea(linea, etapa);
  const perdida = etapa === 'perdida';
  const ganada = etapa === 'ganada';

  const muestraBoton = !soloLectura && paso.esDeEsteRol && paso.hacia && paso.disponible && puedeAvanzar;
  const muestraFaltantes = !soloLectura && paso.esDeEsteRol && paso.hacia && !muestraBoton;

  return (
    <div className="px-6 py-3 border-b border-gray-100 bg-white shrink-0 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* ── Las etapas en línea ── */}
        <ol className="flex items-center overflow-x-auto" aria-label="Avance de la cotización">
          {linea.map((p, i) => {
            const hecho = i < actual || (ganada && i === actual);
            const esActual = i === actual && !ganada && !perdida;
            const enRojo = perdida && i === actual;
            const ultimo = i === linea.length - 1;
            const label = enRojo && p.cubre.includes('perdida') && p.label === 'Ganada' ? 'Perdida' : p.label;
            return (
              <li key={p.id} className={`flex items-center ${ultimo ? '' : 'flex-1 min-w-fit'}`}>
                <span
                  aria-current={esActual ? 'step' : undefined}
                  className={`flex items-center gap-1.5 whitespace-nowrap text-[11px] ${
                    esActual ? 'font-bold text-[#18181B]'
                    : enRojo ? 'font-bold text-red-700'
                    : hecho ? 'text-gray-600'
                    : 'text-gray-400'}`}
                >
                  <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    enRojo ? 'bg-red-500 border-red-500 text-white'
                    : hecho ? 'bg-[#E11D48] border-[#E11D48] text-white'
                    : esActual ? 'bg-white border-[#E11D48] ring-2 ring-[#E11D48]/20'
                    : 'bg-white border-gray-300'}`}
                  >
                    {enRojo ? <X className="w-2.5 h-2.5" strokeWidth={3} />
                      : hecho ? <Check className="w-2.5 h-2.5" strokeWidth={3} />
                      : esActual ? <span className="w-1.5 h-1.5 rounded-full bg-[#E11D48]" />
                      : null}
                  </span>
                  {label}
                </span>
                {!ultimo && (
                  <span className={`flex-1 h-px mx-2 min-w-[12px] ${i < actual ? 'bg-[#E11D48]' : 'bg-gray-200'}`} />
                )}
              </li>
            );
          })}
        </ol>

        {/* ── Qué sigue ── */}
        <p className="text-[11px] text-gray-500 truncate">
          <span className="font-bold text-gray-700">Siguiente:</span> {paso.siguiente}
          {/* Si quien mira puede marcar ganada, «le toca a Ventas» (negociar)
              contradice el botón que tiene enfrente. */}
          {paso.leTocaA && !ganadaSecundaria && <span className="text-gray-400"> · le toca a {paso.leTocaA}</span>}
        </p>

        {/* ── Un veto con camino: qué frena y a dónde ir ── */}
        {bloqueo && !soloLectura && (
          <p className="text-[11px] text-red-700 flex flex-wrap items-center gap-x-2 gap-y-1">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <span>{bloqueo.texto}</span>
            {bloqueo.acciones.map(a => (
              <button key={a.etiqueta} type="button" onClick={a.onClick}
                className="text-[10px] font-bold uppercase tracking-wider text-[#E11D48] hover:underline">
                {a.etiqueta} →
              </button>
            ))}
          </p>
        )}

        {/* ── En vez del botón, lo que falta ── */}
        {muestraFaltantes && !bloqueo && (
          <LineaFaltantes prontitud={prontitud} porque={porque} accion={paso.boton ?? ''} />
        )}
      </div>

      {/* ── La acción que sigue ── */}
      {(muestraBoton || (!soloLectura && ganadaSecundaria)) && (
        <div className="shrink-0 flex items-center gap-2">
          {muestraBoton && paso.hacia && (
            <button
              onClick={() => onAvanzar(paso.hacia!)}
              className="flex-1 md:flex-none justify-center px-4 py-2 bg-[#E11D48] hover:bg-[#BE123C] text-white text-[11px] font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-2 shadow-xs"
            >
              {paso.hacia === 'ganada' ? <CheckCircle2 className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              {paso.boton}
            </button>
          )}
          {!soloLectura && ganadaSecundaria && (
            <button
              onClick={onMarcarGanada}
              className="flex-1 md:flex-none justify-center px-4 py-2 border border-green-600 bg-white hover:bg-green-50 text-green-700 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" /> Marcar ganada
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Lo que falta, en UNA línea: «Faltan 2 conceptos por completar: Maniobras
 * (sin proveedor) · Almacenaje (sin costo capturado)». La lista completa va
 * en el tooltip; la franja no crece.
 */
function LineaFaltantes({ prontitud, porque, accion }: { prontitud: Prontitud; porque: string; accion: string }) {
  const grupos = faltantesPorLinea(prontitud);
  const resumen = resumenFaltantes(prontitud);
  const detalle = grupos.map(g => `${g.concepto || '(sin nombre)'} (${textoFaltantesLinea(g.tipos)})`);
  const visibles = detalle.slice(0, 3).join(' · ');
  const resto = detalle.length - 3;

  const texto = grupos.length > 0
    ? `${resumen}: ${visibles}${resto > 0 ? ` · y ${resto} más` : ''}`
    : (resumen || porque || `Falta información para «${accion}»`);

  return (
    <p className="text-[11px] text-amber-800 flex items-center gap-1.5 min-w-0" title={detalle.join('\n') || porque}>
      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
      <span className="truncate">{texto}</span>
      <span className="text-amber-600 shrink-0 hidden xl:inline">· «{accion}» aparecerá cuando esté completo</span>
    </p>
  );
}
