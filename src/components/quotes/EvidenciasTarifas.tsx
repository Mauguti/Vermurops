import React, { useRef, useState } from 'react';
import {
  Paperclip, Upload, FileText, FileSpreadsheet, Image as ImageIcon,
  Mail, X, Sparkles, ExternalLink,
} from 'lucide-react';
import {
  formatoTamano, admitePrevisualizacion, resumenDocumento,
  type DocumentoTarifario, type TipoDocumento,
} from '../../lib/documentoTarifario';

/**
 * Evidencias de la cotización: de dónde salió cada costo.
 *
 * Gabi: «tiene que haber una trazabilidad de ¿de dónde saqué este costo? Ah,
 * ok, Juan Pérez me lo mandó ayer. Y luego Abril Hernández me lo mandó hasta
 * hoy.»
 *
 * NO es un sistema de adjuntos aparte: es la vista de lectura de los mismos
 * documentos que suben los tarifarios. El que se procesó con IA muestra
 * cuántas tarifas produjo; el que se subió solo como respaldo lo dice.
 *
 * Solo pricing y admin: son los costos de proveedor.
 */

const ICONO: Record<TipoDocumento, React.ReactNode> = {
  excel:  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />,
  pdf:    <FileText className="w-4 h-4 text-red-500" />,
  imagen: <ImageIcon className="w-4 h-4 text-blue-500" />,
  correo: <Mail className="w-4 h-4 text-amber-600" />,
  otro:   <Paperclip className="w-4 h-4 text-gray-400" />,
};

interface Props {
  documentos: DocumentoTarifario[];
  editable: boolean;
  subiendo: boolean;
  /** Sube el documento como respaldo, sin pasar por el extractor. */
  onSubir: (file: File, procesarConIA: boolean) => void;
  /** Abre la carga de tarifario con IA — el mismo componente que en Tarifas. */
  onCargarTarifario: () => void;
}

export default function EvidenciasTarifas({
  documentos, editable, subiendo, onSubir, onCargarTarifario,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<DocumentoTarifario | null>(null);

  const elegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onSubir(f, false);
    e.target.value = '';
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60">
        <div className="flex items-center gap-2 min-w-0">
          <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className="text-[13px] font-bold text-[#18181B]">Evidencias</span>
          <span className="text-[11px] text-gray-400">
            {documentos.length === 0
              ? 'de dónde salió cada costo'
              : `${documentos.length} documento${documentos.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {editable && (
          <div className="flex items-center gap-2 shrink-0">
            {/* Dos acciones distintas, no una con casilla: subir un respaldo y
                cargar un tarifario son intenciones diferentes, y la casilla
                obligaba a leerla antes de cada subida. */}
            <button
              onClick={() => inputRef.current?.click()}
              disabled={subiendo}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              {subiendo ? 'Subiendo…' : 'Solo respaldo'}
            </button>
            <button
              onClick={onCargarTarifario}
              className="flex items-center gap-1.5 text-[11px] font-bold text-[#E11D48] hover:bg-[#E11D48]/5 px-2.5 py-1 rounded-lg transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Cargar tarifario
            </button>
            <input
              ref={inputRef}
              type="file"
              hidden
              accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.webp,.heic,.eml,.txt"
              onChange={elegir}
            />
          </div>
        )}
      </div>

      {documentos.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12px] text-gray-400">
          Sin evidencias. Sube el correo, la captura o el PDF del proveedor para
          dejar registro de dónde salieron los costos.
        </p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {documentos.map(d => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/60">
              <span className="shrink-0">{ICONO[d.tipo]}</span>

              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-gray-800 truncate">{d.nombreArchivo}</p>
                <p className="text-[10px] text-gray-400">
                  {d.subidoPorNombre} · {d.fechaSubida.slice(0, 10)} · {formatoTamano(d.tamanoBytes)}
                </p>
              </div>

              <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                d.procesadoConIA && d.tarifasExtraidas > 0
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {d.procesadoConIA && d.tarifasExtraidas > 0 && (
                  <Sparkles className="w-2.5 h-2.5 inline mr-0.5" />
                )}
                {resumenDocumento(d)}
              </span>

              <div className="flex items-center gap-1 shrink-0">
                {admitePrevisualizacion(d.tipo) && (
                  <button
                    onClick={() => setPreview(d)}
                    className="text-[10px] font-semibold text-gray-500 hover:text-[#E11D48] px-1.5 py-1"
                  >
                    Ver
                  </button>
                )}
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 text-gray-300 hover:text-gray-600"
                  title="Abrir en pestaña nueva"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Vista previa sin salir de la ficha */}
      {preview && (
        <div
          className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-6"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-150 bg-gray-50/50 shrink-0">
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-[#18181B] truncate">{preview.nombreArchivo}</p>
                <p className="text-[10px] text-gray-400">
                  {preview.subidoPorNombre} · {preview.fechaSubida.slice(0, 10)}
                </p>
              </div>
              <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center">
              {preview.tipo === 'imagen' ? (
                <img src={preview.url} alt={preview.nombreArchivo} className="max-w-full max-h-full object-contain" />
              ) : (
                <iframe src={preview.url} title={preview.nombreArchivo} className="w-full h-[70vh] border-0" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
