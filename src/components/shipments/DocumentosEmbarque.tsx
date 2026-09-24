/**
 * DocumentosEmbarque.tsx (D-3)
 *
 * La pestaña Documentos del embarque: subir → Storage → clasificar →
 * revisar → guardar. Nada se guarda sin que el usuario confirme.
 *
 * La versión anterior «guardaba» con URL.createObjectURL: el archivo nunca
 * llegaba a Storage y moría al recargar. Los documentos de esa época siguen
 * listados —con su nombre y tipo— pero sin archivo detrás, y se dice.
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  UploadCloud, FileText, Eye, Trash2, AlertCircle, AlertTriangle, Loader2,
} from 'lucide-react';
import type { EmbarqueCompleto, EmbarqueDocumento } from './EmbarquesData';
import RevisionDocumentoClasificado, { type RevisionConfirmada } from '../documentos/RevisionDocumentoClasificado';
import {
  ETIQUETA_GRUPO, type GrupoDocumentoEmbarque, traducirAviso,
} from '../../lib/clasificacionDocumentos';
import {
  TIPOS_DOC_OPERATIVOS, agruparDocumentos, etiquetaTipoDocumento,
  contenedorNoCoincide, documentoDesdeRevision, esDocumentoFactura, bloqueoEnDocumentos,
  type SubidaClasificada,
} from '../../lib/documentosEmbarque';
import { useDocumentosEmbarque } from '../../hooks/useDocumentosEmbarque';

interface Props {
  embarque: EmbarqueCompleto;
  puedeSubir: boolean;
  onAddDocumento: (doc: Omit<EmbarqueDocumento, 'id'>) => string;
  onDeleteDocumento: (id: string) => void;
  onAviso: (mensaje: string, tipo: 'exito' | 'error') => void;
}

export default function DocumentosEmbarque({
  embarque, puedeSubir, onAddDocumento, onDeleteDocumento, onAviso,
}: Props) {
  const { procesando, subirYClasificar, autor } = useDocumentosEmbarque();
  const [dragActive, setDragActive] = useState(false);
  const [tipoEsperado, setTipoEsperado] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<SubidaClasificada | null>(null);
  const [guardando, setGuardando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Aquí solo caen operativos; las facturas van a la pestaña Facturas. */
  const grupo: GrupoDocumentoEmbarque = 'documentos';

  // Solo los operativos: las facturas viven en la pestaña Facturas.
  const documentos = useMemo(() => (embarque.documentos ?? []).filter(d => !esDocumentoFactura(d)), [embarque.documentos]);
  const grupos = useMemo(() => agruparDocumentos(documentos), [documentos]);

  const procesar = async (file: File) => {
    setError(null);
    try {
      const subida = await subirYClasificar(file, embarque, tipoEsperado || null);
      setPendiente(subida);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f && puedeSubir && !procesando) void procesar(f);
  };

  const guardar = async (r: RevisionConfirmada) => {
    if (!pendiente) return;
    setGuardando(true);
    try {
      onAddDocumento(documentoDesdeRevision(
        pendiente,
        { tipoConfirmado: r.tipoConfirmado, nombre: r.nombre, estado: r.estado, grupo, ocId: null },
        autor,
        new Date().toISOString(),
      ));
      onAviso(`Documento guardado en «${ETIQUETA_GRUPO[grupo]}».`, 'exito');
      setPendiente(null);
    } catch (err) {
      onAviso(`No se pudo guardar: ${err instanceof Error ? err.message : err}`, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const avisoContenedor = pendiente ? contenedorNoCoincide(pendiente.clasificacion.avisos) : false;

  return (
    <div className="space-y-6">
      {/* ── Subir ──────────────────────────────────────────────────────────── */}
      {puedeSubir && (
        <div className="bg-white p-6 rounded-xl border border-gray-150 shadow-2xs">
          <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider mb-1">
            Cargar documento
          </h3>
          <p className="text-[10px] text-gray-400 mb-4">
            Se guarda en Storage, se clasifica con IA y lo revisas antes de que quede en el embarque. El tipo es opcional: si lo declaras, se coteja contra lo que detecte.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Tipo esperado (opcional)</label>
              <select
                value={tipoEsperado}
                onChange={e => setTipoEsperado(e.target.value)}
                disabled={procesando}
                className="w-full text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-2.5 outline-none focus:border-primario"
              >
                <option value="">— Que lo detecte el clasificador —</option>
                {TIPOS_DOC_OPERATIVOS.map(t => <option key={t.tipo} value={t.tipo}>{t.etiqueta}</option>)}
              </select>
            </div>

            <div className="md:col-span-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void procesar(f); e.target.value = ''; }}
                accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx"
              />
              <div
                onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
                onClick={() => !procesando && fileInputRef.current?.click()}
                className={`w-full py-6 px-4 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all
                  ${procesando ? 'border-gray-200 bg-gray-50 cursor-wait'
                    : dragActive ? 'border-primario bg-primario/[0.02]'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'}`}
              >
                {procesando ? (
                  <>
                    <Loader2 className="w-8 h-8 mb-2 text-primario animate-spin" />
                    <p className="text-xs font-bold text-gray-600">Subiendo y clasificando…</p>
                    <p className="text-[10px] text-gray-400 mt-1">Puede tardar hasta un minuto con PDFs escaneados.</p>
                  </>
                ) : (
                  <>
                    <UploadCloud className={`w-8 h-8 mb-2 ${dragActive ? 'text-primario' : 'text-gray-400'}`} />
                    <p className="text-xs font-bold text-gray-600 text-center">
                      Arrastra el archivo aquí, o <span className="text-primario hover:underline">explora</span>
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1 text-center">PDF, imagen, Excel o Word · máx. 10 MB</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-red-600">
              <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Lista agrupada ─────────────────────────────────────────────────── */}
      {grupos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-150 shadow-2xs p-8 text-center text-xs text-gray-400 italic">
          No hay documentos en este embarque.
        </div>
      ) : grupos.map(g => (
        <div key={g.grupo} className="bg-white rounded-xl border border-gray-150 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider">{g.etiqueta} ({g.total})</h3>
          </div>
          {g.tipos.map(t => (
            <div key={t.tipo}>
              <div className="px-4 py-1.5 bg-gray-50 text-[9px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                {t.etiqueta}
              </div>
              <div className="divide-y divide-gray-100">
                {t.documentos.map(d => <FilaDocumento key={d.id} doc={d} onDelete={puedeSubir ? onDeleteDocumento : undefined} />)}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* ── Revisión ───────────────────────────────────────────────────────── */}
      {pendiente && (
        <RevisionDocumentoClasificado
          clasificacion={pendiente.clasificacion}
          tipoEsperado={tipoEsperado || null}
          tipos={TIPOS_DOC_OPERATIVOS}
          bloqueo={bloqueoEnDocumentos(pendiente.clasificacion)}
          etiqueta={etiquetaTipoDocumento}
          guardando={guardando}
          onGuardar={guardar}
          onCancelar={() => setPendiente(null)}
        >
          {/* El error que hoy nadie cacha: un BL de OTRO embarque. Se pinta
              aparte del resto de avisos, en rojo y arriba. */}
          {avisoContenedor && (
            <div className="border border-red-300 bg-red-50 rounded-lg px-3 py-2.5 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <div className="text-[12px] text-red-900">
                <p className="font-bold">{traducirAviso('contenedor_no_coincide')}</p>
                <p className="text-[11px] mt-0.5">
                  Documento: {String((pendiente.clasificacion.datos.contenedores as unknown[] | undefined ?? []).join(', ') || '—')}.
                  {' '}Embarque: {embarque.productos?.map(p => p.datosContenedor?.numeroContenedor).filter(Boolean).join(', ') || 'sin contenedores capturados'}.
                </p>
              </div>
            </div>
          )}

        </RevisionDocumentoClasificado>
      )}
    </div>
  );
}

function FilaDocumento({ doc, onDelete }: {
  doc: EmbarqueDocumento;
  onDelete?: (id: string) => void;
}) {
  // Los anteriores a D-3 tienen una URL de objeto que murió con la sesión.
  const sinArchivo = !doc.storagePath && (doc.url === '#' || doc.url.startsWith('blob:'));

  return (
    <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/50 transition-colors">
      <div className="flex items-start gap-3 min-w-0">
        <div className={`p-2 rounded-lg shrink-0 ${doc.estado === 'con_observaciones' ? 'text-amber-600 bg-amber-50' : 'text-gray-500 bg-gray-50'}`}>
          <FileText className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-800 break-all leading-tight">{doc.nombre}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[10px] text-gray-400 font-semibold">
            <span>Subido: {doc.fechaCarga}</span>
            <span>•</span>
            <span>Por: {doc.cargadoPor}</span>
            {doc.confianza && <><span>•</span><span>Confianza {doc.confianza}</span></>}
          </div>
          {doc.estado === 'con_observaciones' && (doc.avisos?.length ?? 0) > 0 && (
            <p className="text-[10px] text-amber-700 mt-1">{doc.avisos!.map(traducirAviso).join(' ')}</p>
          )}
          {sinArchivo && (
            <p className="text-[10px] text-red-600 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Sin archivo: se subió antes de que los documentos se guardaran en Storage. Vuelve a subirlo.
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
        {!sinArchivo && (
          <a href={doc.url} target="_blank" rel="noopener noreferrer" title="Ver"
            className="p-2 text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
            <Eye className="w-4 h-4" />
          </a>
        )}
        {onDelete && (
          <button onClick={() => onDelete(doc.id)} title="Quitar del embarque"
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
