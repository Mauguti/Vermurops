import React, { useMemo } from 'react';
import { Info } from 'lucide-react';
import type { ServicioSolicitado, TraficoServicio, UbicacionServicio } from './QuotesData';
import { INCOTERMS } from './QuotesData';
import type { PuertoVermur } from '../puertos/PuertosData';
import type { ConceptoVermur } from '../conceptos/ConceptosData';
import FormCargaServicio from './FormCargaServicio';
import DetalleCargaSolicitud from './DetalleCargaSolicitud';
import { ETIQUETA_MODALIDAD } from '../../lib/cargaSolicitud';
import { resolverTrafico } from '../../lib/traficoServicio';
import {
  borradorDeServicio, servicioDesdeBorrador, legacySinMapear, modalidadDeTipo,
} from '../../lib/operacionServicio';

/**
 * La sección «Operación» de la pestaña Información (Fase A, 24-sep-2026).
 *
 * Reemplaza al modal «Datos del embarque», que editaba los campos legacy y
 * no leía la carga tipada que captura la solicitud. Aquí va TODO lo que el
 * formulario de solicitud sabe —ruta con puertos, incoterm, la carga por
 * modalidad, la descripción y el detalle de mercancía— con el MISMO
 * componente (`FormCargaServicio`), más lo que solo la operación necesita:
 * tráfico, ubicación, aduanas, embarque propio y notas operativas.
 *
 * En solo lectura pinta el resumen de siempre (`DetalleCargaSolicitud`).
 */

interface Props {
  servicio: ServicioSolicitado;
  editable: boolean;
  puertos: PuertoVermur[];
  conceptos: ConceptoVermur[];
  /** Con varios servicios (cotizaciones viejas), cada bloque dice cuál es. */
  conTitulo: boolean;
  onCambio: (servicio: ServicioSolicitado) => void;
}

const LBL = 'block text-[9px] font-bold text-gray-400 uppercase mb-1.5';
const INP = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48]';
const SEL = INP + ' bg-white cursor-pointer';

export default function OperacionServicio({
  servicio, editable, puertos, conceptos, conTitulo, onCambio,
}: Props) {
  const draft = useMemo(() => borradorDeServicio(servicio), [servicio]);
  const legacy = useMemo(() => legacySinMapear(servicio), [servicio]);
  const modalidad = ETIQUETA_MODALIDAD[modalidadDeTipo(servicio.tipo)];

  // Si la ruta permite deducir el tráfico, se propone y se confirma; no se
  // guarda solo: lo sugerido y lo declarado no son lo mismo, y el folio del
  // embarque depende de este dato.
  const traficoSugerido = useMemo(() => {
    const r = resolverTrafico(servicio);
    return r.fuente === 'derivado' ? r.trafico : null;
  }, [servicio]);

  const set = (patch: Partial<ServicioSolicitado>) => onCambio({ ...servicio, ...patch });
  const setRuta = (patch: Partial<ServicioSolicitado['ruta']>) => onCambio({ ...servicio, ruta: { ...servicio.ruta, ...patch } });

  return (
    <div className="space-y-4">
      {conTitulo && (
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{modalidad}</p>
      )}

      {/* ── Lo que solo la operación necesita ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={LBL}>
            Tráfico
            {traficoSugerido && !servicio.trafico && editable && (
              <span className="ml-1 normal-case font-semibold text-amber-600">· sugerido por la ruta</span>
            )}
          </label>
          {editable ? (
            <select
              value={servicio.trafico ?? traficoSugerido ?? ''}
              onChange={e => set({ trafico: (e.target.value || undefined) as TraficoServicio | undefined })}
              className={SEL}
            >
              <option value="">— Definir —</option>
              <option value="importacion">Importación</option>
              <option value="exportacion">Exportación</option>
            </select>
          ) : (
            <Valor>
              {servicio.trafico === 'importacion' ? 'Importación'
                : servicio.trafico === 'exportacion' ? 'Exportación'
                : traficoSugerido
                  ? <>{traficoSugerido === 'importacion' ? 'Importación' : 'Exportación'} <span className="text-amber-600 font-normal">· sugerido, sin confirmar</span></>
                  : '—'}
            </Valor>
          )}
        </div>
        <div>
          <label className={LBL}>Ubicación</label>
          {editable ? (
            <select
              value={servicio.ubicacion ?? ''}
              onChange={e => set({ ubicacion: (e.target.value || undefined) as UbicacionServicio | undefined })}
              className={SEL}
            >
              <option value="">— Definir —</option>
              <option value="origen">Origen</option>
              <option value="destino">Destino</option>
            </select>
          ) : (
            <Valor>{servicio.ubicacion === 'origen' ? 'Origen' : servicio.ubicacion === 'destino' ? 'Destino' : '—'}</Valor>
          )}
        </div>
        <div>
          <label className={LBL}>Aduana de salida</label>
          {editable
            ? <input type="text" value={servicio.ruta?.aduanaSalida ?? ''} onChange={e => setRuta({ aduanaSalida: e.target.value })} className={INP} />
            : <Valor>{servicio.ruta?.aduanaSalida || '—'}</Valor>}
        </div>
        <div>
          <label className={LBL}>Aduana de recepción</label>
          {editable
            ? <input type="text" value={servicio.ruta?.aduanaRecepcion ?? ''} onChange={e => setRuta({ aduanaRecepcion: e.target.value })} className={INP} />
            : <Valor>{servicio.ruta?.aduanaRecepcion || '—'}</Valor>}
        </div>
      </div>

      <label className={`flex items-start gap-2 w-fit ${editable ? 'cursor-pointer' : ''}`}>
        <input
          type="checkbox"
          checked={!!servicio.generaEmbarquePropio}
          disabled={!editable}
          onChange={e => set({ generaEmbarquePropio: e.target.checked })}
          className="mt-0.5 accent-[#E11D48]"
        />
        <span className="text-[11px] text-gray-600">
          <span className="font-semibold text-gray-700">Se opera como embarque aparte.</span>{' '}
          Al ganar, este tramo nace con su propio folio en vez de ir al embarque de la cotización.
        </span>
      </label>

      {/* ── Ruta, incoterm, carga por modalidad, mercancía y su detalle ── */}
      {editable ? (
        <FormCargaServicio
          draft={draft}
          puertos={puertos}
          conceptos={conceptos}
          incoterms={INCOTERMS}
          sinRequeridos
          onCambio={d => onCambio(servicioDesdeBorrador(servicio, d))}
          onTraficoDerivado={t => { if (!servicio.trafico) set({ trafico: t }); }}
        />
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-600">
            <span className="font-bold text-gray-700">Ruta:</span> {servicio.ruta?.origen || '—'} → {servicio.ruta?.destino || '—'}
            <span className="text-gray-400"> · {servicio.incoterm || '—'}</span>
          </p>
          <DetalleCargaSolicitud servicio={servicio} />
        </div>
      )}

      {/* ── Notas operativas ── */}
      <div>
        <label className={LBL}>Notas operativas</label>
        {editable ? (
          <textarea
            value={servicio.notasOperativas ?? ''}
            onChange={e => set({ notasOperativas: e.target.value })}
            rows={2}
            placeholder="Ej. temperatura controlada, humedad < 60 %, FTL, no estibable…"
            className={INP + ' resize-y'}
          />
        ) : (
          <Valor>{servicio.notasOperativas?.trim() || '—'}</Valor>
        )}
      </div>

      {/* ── Lo que capturó el modal anterior y la carga tipada no representa ── */}
      {legacy.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2">
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
            <Info className="w-3 h-3" /> Del registro anterior
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
            {legacy.map(l => (
              <li key={l.etiqueta} className="text-[11px] text-gray-600">
                <span className="font-semibold text-gray-700">{l.etiqueta}:</span> {l.valor}
              </li>
            ))}
          </ul>
          {editable && (
            <p className="mt-1 text-[10px] text-gray-400">Estos campos ya no se editan; si siguen vigentes, pásalos a Notas operativas.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Valor({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-gray-700 px-1 py-2">{children}</p>;
}
