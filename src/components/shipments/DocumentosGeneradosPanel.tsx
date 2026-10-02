/**
 * DocumentosGeneradosPanel.tsx — panel de documentos operativos generados.
 *
 * Se monta en la pestaña Documentos del embarque, arriba de la zona de
 * subida. Muestra los botones de generación de documentos (notificación de
 * arribo, carta de encomienda) con validación y el historial de versiones.
 */

import React, { useMemo, useState, useEffect } from 'react';
import { FileText, Download, Loader2, AlertCircle, Clock, ChevronDown, ChevronUp, Anchor } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import type { EmbarqueCompleto } from './EmbarquesData';
import type { DocumentoGenerado, TipoDocEmbarque } from '../../lib/documentosOperativos';
import { ETIQUETAS_DOC } from '../../lib/documentosOperativos';
import { validarParaArribo } from '../../lib/notificacionArribo';
import {
  validarParaEncomienda,
  buscarNavieraPlantilla,
  etiquetaCartaNaviera,
} from '../../lib/cartasEncomienda';
import { useGenerarDocumento } from '../../hooks/useGenerarDocumento';
import type { PatenteAduanal } from '../proveedores/ProveedoresData';

interface Props {
  embarque: EmbarqueCompleto;
  puedeGenerar: boolean;
  onDocumentoGenerado: (doc: DocumentoGenerado) => void;
  onAviso: (mensaje: string, tipo: 'exito' | 'error') => void;
}

export default function DocumentosGeneradosPanel({
  embarque, puedeGenerar, onDocumentoGenerado, onAviso,
}: Props) {
  const { generando, generar } = useGenerarDocumento();
  const [expandido, setExpandido] = useState(true);

  // ── Patentes del agente aduanal vinculado ─────────────────────
  const [patentes, setPatentes] = useState<PatenteAduanal[]>([]);
  const [patenteElegida, setPatenteElegida] = useState('');

  const agenteRef = embarque.entidadesRef?.agenteAduanal;

  useEffect(() => {
    if (!agenteRef?.id) { setPatentes([]); return; }
    let cancelado = false;
    getDoc(doc(db, 'proveedores', agenteRef.id)).then(snap => {
      if (cancelado) return;
      const data = snap.data();
      const pats = (data?.patentes ?? []) as PatenteAduanal[];
      setPatentes(pats);
      if (pats.length === 1) setPatenteElegida(pats[0].numero);
    }).catch(() => { /* silencio */ });
    return () => { cancelado = true; };
  }, [agenteRef?.id]);

  // ── Versiones generadas (todos los tipos) ─────────────────────
  const todosLosDocs = useMemo(() => {
    return (embarque.documentosGenerados ?? [])
      .sort((a, b) => b.version - a.version);
  }, [embarque.documentosGenerados]);

  const versionesArribo = useMemo(() =>
    todosLosDocs.filter(d => d.tipo === 'notificacion_arribo'),
    [todosLosDocs],
  );

  const versionesEncomienda = useMemo(() =>
    todosLosDocs.filter(d => d.tipo === 'carta_encomienda'),
    [todosLosDocs],
  );

  const totalDocs = versionesArribo.length + versionesEncomienda.length;

  // ── Validación: arribo ────────────────────────────────────────
  const faltantesArribo = useMemo(() => validarParaArribo(embarque), [embarque]);
  const puedeGenerarArribo = puedeGenerar && faltantesArribo.length === 0;

  // ── Validación: carta encomienda ──────────────────────────────
  const naviera = useMemo(
    () => buscarNavieraPlantilla(embarque.ruta?.origen?.transportista ?? ''),
    [embarque.ruta?.origen?.transportista],
  );

  const faltantesEncomienda = useMemo(
    () => validarParaEncomienda(embarque),
    [embarque],
  );

  const sinPatente = patenteElegida === '' && patentes.length === 0;
  const puedeGenerarEncomienda =
    puedeGenerar && faltantesEncomienda.length === 0 && !sinPatente;

  const etiquetaEncomienda = naviera
    ? `Generar ${etiquetaCartaNaviera(naviera).toLowerCase()}`
    : 'Generar carta encomienda';

  // ── Handlers ──────────────────────────────────────────────────
  const handleGenerar = async (tipo: TipoDocEmbarque, parametros?: Record<string, unknown>) => {
    try {
      const doc = await generar(embarque.id, tipo, parametros);
      onDocumentoGenerado(doc);
      const etiqueta = tipo === 'carta_encomienda' && naviera
        ? etiquetaCartaNaviera(naviera)
        : ETIQUETAS_DOC[tipo];
      onAviso(`${etiqueta} v${doc.version} generada`, 'exito');
    } catch (err) {
      onAviso(err instanceof Error ? err.message : 'Error al generar el documento', 'error');
    }
  };

  const handleGenerarEncomienda = () => {
    const patente = patenteElegida || (patentes.length === 1 ? patentes[0].numero : '');
    handleGenerar('carta_encomienda', { patente, aduana: '' });
  };

  /** Etiqueta para un documento en el historial. */
  const etiquetaDoc = (d: DocumentoGenerado): string => {
    if (d.tipo === 'carta_encomienda') return 'Carta encomienda';
    return ETIQUETAS_DOC[d.tipo] ?? d.tipo;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-150 shadow-2xs mb-4">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpandido(!expandido)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-primario" />
          <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider">
            Documentos operativos
          </h3>
          {totalDocs > 0 && (
            <span className="text-[10px] bg-primario/10 text-primario font-semibold px-1.5 py-0.5 rounded">
              {totalDocs}
            </span>
          )}
        </div>
        {expandido ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {expandido && (
        <div className="px-5 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {/* ── Notificación de arribo ─────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <button
              type="button"
              disabled={!puedeGenerarArribo || generando}
              onClick={() => handleGenerar('notificacion_arribo')}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors
                bg-primario text-white hover:bg-primario/90
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generando ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileText size={14} />
              )}
              Generar notificación de arribo
            </button>

            {faltantesArribo.length > 0 && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <span>Falta: {faltantesArribo.map(f => f.etiqueta).join(', ')}</span>
              </div>
            )}
          </div>

          {/* ── Carta de encomienda / garantía ────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!puedeGenerarEncomienda || generando}
                onClick={handleGenerarEncomienda}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors
                  bg-primario text-white hover:bg-primario/90
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generando ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Anchor size={14} />
                )}
                {etiquetaEncomienda}
              </button>

              {/* Selector de patente si hay más de una */}
              {patentes.length > 1 && (
                <select
                  value={patenteElegida}
                  onChange={(e) => setPatenteElegida(e.target.value)}
                  className="text-xs border border-gray-200 rounded px-2 py-1.5 bg-white"
                >
                  <option value="">Elegir patente...</option>
                  {patentes.map(p => (
                    <option key={p.numero} value={p.numero}>
                      {p.nombre} — Pat. {p.numero}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Faltantes de encomienda */}
            {faltantesEncomienda.length > 0 && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <span>Falta: {faltantesEncomienda.map(f => f.etiqueta).join(', ')}</span>
              </div>
            )}
            {faltantesEncomienda.length === 0 && sinPatente && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <span>Falta: Patente del agente aduanal (vincular agente con patente en Altas)</span>
              </div>
            )}
          </div>

          {/* ── Historial de versiones ─────────────────────────── */}
          {totalDocs > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Versiones generadas
              </p>
              {todosLosDocs
                .filter(d => d.tipo === 'notificacion_arribo' || d.tipo === 'carta_encomienda')
                .map(d => (
                <div
                  key={`${d.tipo}-v${d.version}-${d.fechaGeneracion}`}
                  className="flex items-center gap-3 text-xs bg-gray-50 rounded px-3 py-2"
                >
                  <FileText size={14} className="text-primario shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-[#18181B]">
                      {etiquetaDoc(d)} v{d.version}
                    </span>
                    <span className="text-gray-400 ml-2 inline-flex items-center gap-1">
                      <Clock size={10} />
                      {formatearFechaDoc(d.fechaGeneracion)}
                    </span>
                    <span className="text-gray-400 ml-2">
                      {d.generadoPorNombre}
                    </span>
                  </div>
                  {d.url && (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primario hover:text-primario/80 font-semibold shrink-0"
                    >
                      <Download size={13} />
                      Descargar
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Formatea ISO a algo legible: "01/10/2026 14:30". */
function formatearFechaDoc(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${min}`;
}
