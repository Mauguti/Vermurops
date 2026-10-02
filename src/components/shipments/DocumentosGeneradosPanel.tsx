/**
 * DocumentosGeneradosPanel.tsx — panel de documentos operativos generados.
 *
 * Se monta en la pestaña Documentos del embarque, arriba de la zona de
 * subida. Muestra el botón «Generar notificación de arribo» (y en el futuro
 * los demás documentos del PLAN-C) con la validación de datos obligatorios y
 * el historial de versiones generadas.
 */

import React, { useMemo, useState } from 'react';
import { FileText, Download, Loader2, AlertCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import type { EmbarqueCompleto } from './EmbarquesData';
import type { DocumentoGenerado, TipoDocEmbarque } from '../../lib/documentosOperativos';
import { ETIQUETAS_DOC } from '../../lib/documentosOperativos';
import { validarParaArribo } from '../../lib/notificacionArribo';
import { useGenerarDocumento } from '../../hooks/useGenerarDocumento';

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

  // Versiones de la notificación de arribo, ordenadas de la más reciente a la más vieja
  const versionesArribo = useMemo(() => {
    const docs = (embarque.documentosGenerados ?? [])
      .filter(d => d.tipo === 'notificacion_arribo');
    return docs.sort((a, b) => b.version - a.version);
  }, [embarque.documentosGenerados]);

  // Validación
  const faltantes = useMemo(() => validarParaArribo(embarque), [embarque]);
  const puedeGenerarArribo = puedeGenerar && faltantes.length === 0;

  const handleGenerar = async (tipo: TipoDocEmbarque) => {
    try {
      const doc = await generar(embarque.id, tipo);
      onDocumentoGenerado(doc);
      onAviso(`${ETIQUETAS_DOC[tipo]} v${doc.version} generada`, 'exito');
    } catch (err) {
      onAviso(err instanceof Error ? err.message : 'Error al generar el documento', 'error');
    }
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
          {versionesArribo.length > 0 && (
            <span className="text-[10px] bg-primario/10 text-primario font-semibold px-1.5 py-0.5 rounded">
              {versionesArribo.length}
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

            {/* Faltantes */}
            {faltantes.length > 0 && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <span>
                  Falta: {faltantes.map(f => f.etiqueta).join(', ')}
                </span>
              </div>
            )}
          </div>

          {/* ── Historial de versiones ─────────────────────────── */}
          {versionesArribo.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Versiones generadas
              </p>
              {versionesArribo.map(doc => (
                <div
                  key={`${doc.tipo}-v${doc.version}-${doc.fechaGeneracion}`}
                  className="flex items-center gap-3 text-xs bg-gray-50 rounded px-3 py-2"
                >
                  <FileText size={14} className="text-primario shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-[#18181B]">
                      {ETIQUETAS_DOC[doc.tipo]} v{doc.version}
                    </span>
                    <span className="text-gray-400 ml-2 inline-flex items-center gap-1">
                      <Clock size={10} />
                      {formatearFechaDoc(doc.fechaGeneracion)}
                    </span>
                    <span className="text-gray-400 ml-2">
                      {doc.generadoPorNombre}
                    </span>
                  </div>
                  {doc.url && (
                    <a
                      href={doc.url}
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
