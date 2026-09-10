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
  UploadCloud, FileText, Eye, Trash2, AlertCircle, AlertTriangle, Loader2, Link2, Check,
} from 'lucide-react';
import type { EmbarqueCompleto, EmbarqueDocumento } from './EmbarquesData';
import type { OrdenCompra } from '../ordenesCompra/OrdenesCompraData';
import RevisionDocumentoClasificado, { type RevisionConfirmada } from '../documentos/RevisionDocumentoClasificado';
import {
  ETIQUETA_GRUPO, type GrupoDocumentoEmbarque, precargaFacturaProveedor, traducirAviso,
} from '../../lib/clasificacionDocumentos';
import {
  TIPOS_DOC_EMBARQUE, ORDEN_GRUPOS, agruparDocumentos, etiquetaTipoDocumento, grupoPropuesto,
  contenedorNoCoincide, documentoDesdeRevision, proponerParaOC,
  type SubidaClasificada, type PropuestaOC,
} from '../../lib/documentosEmbarque';
import { useDocumentosEmbarque } from '../../hooks/useDocumentosEmbarque';
import { EnlaceEntidad } from '../ui/ficha/EnlaceEntidad';

interface Props {
  embarque: EmbarqueCompleto;
  /** Las OC de ESTE embarque, para asociar una factura de proveedor. */
  ordenes: OrdenCompra[];
  puedeSubir: boolean;
  onAddDocumento: (doc: Omit<EmbarqueDocumento, 'id'>) => string;
  onDeleteDocumento: (id: string) => void;
  /** Precarga confirmada en la OC. Recibe el patch ya armado. */
  onPrecargarOC: (ocId: string, patch: Partial<OrdenCompra>) => Promise<void>;
  onAviso: (mensaje: string, tipo: 'exito' | 'error') => void;
}

export default function DocumentosEmbarque({
  embarque, ordenes, puedeSubir, onAddDocumento, onDeleteDocumento, onPrecargarOC, onAviso,
}: Props) {
  const { procesando, subirYClasificar, autor } = useDocumentosEmbarque();
  const [dragActive, setDragActive] = useState(false);
  const [tipoEsperado, setTipoEsperado] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<SubidaClasificada | null>(null);
  const [guardando, setGuardando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado de la revisión (lo que la pantalla compartida no sabe de embarques)
  const [grupo, setGrupo] = useState<GrupoDocumentoEmbarque>('documentos');
  const [ocId, setOcId] = useState<string>('');
  const [precargarOC, setPrecargarOC] = useState(true);

  const documentos = embarque.documentos ?? [];
  const grupos = useMemo(() => agruparDocumentos(documentos), [documentos]);

  const procesar = async (file: File) => {
    setError(null);
    try {
      const subida = await subirYClasificar(file, embarque, tipoEsperado || null);
      const c = subida.clasificacion;
      setGrupo(grupoPropuesto(c.tipo, c.destinoSugerido));
      setOcId('');
      setPrecargarOC(true);
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

  // ── La precarga en la OC, derivada de la revisión ──────────────────────────
  const oc = ordenes.find(o => o.id === ocId) ?? null;
  const precarga = pendiente ? precargaFacturaProveedor(pendiente.clasificacion.datos) : null;
  const propuestaOC: PropuestaOC | null = pendiente && oc && precarga
    ? proponerParaOC(precarga, oc, '(pendiente)')
    : null;

  const guardar = async (r: RevisionConfirmada) => {
    if (!pendiente) return;
    setGuardando(true);
    try {
      const esFacturaProveedor = r.tipoConfirmado === 'factura_proveedor';
      const asociarOC = esFacturaProveedor && precargarOC && oc !== null;

      const nuevoId = onAddDocumento(documentoDesdeRevision(
        pendiente,
        { tipoConfirmado: r.tipoConfirmado, nombre: r.nombre, estado: r.estado, grupo, ocId: asociarOC ? oc!.id : null },
        autor,
        new Date().toISOString(),
      ));

      if (asociarOC && precarga) {
        const p = proponerParaOC(precarga, oc!, nuevoId);
        await onPrecargarOC(oc!.id, {
          facturaAsociada: p.facturaAsociada,
          facturaDatos: p.facturaDatos,
        });
        onAviso(
          p.aviso
            ? `Documento guardado y factura asociada a ${oc!.folio}. ⚠️ ${p.aviso}`
            : `Documento guardado. ${oc!.folio} ya trae la factura ${p.facturaDatos.numero || ''} y el total cuadra.`,
          p.aviso ? 'error' : 'exito',
        );
      } else {
        onAviso(`Documento guardado en «${ETIQUETA_GRUPO[grupo]}».`, 'exito');
      }
      setPendiente(null);
    } catch (err) {
      onAviso(`No se pudo guardar: ${err instanceof Error ? err.message : err}`, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const esFacturaProveedorPendiente = pendiente?.clasificacion.tipo === 'factura_proveedor';
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
                className="w-full text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-2.5 outline-none focus:border-[#E11D48]"
              >
                <option value="">— Que lo detecte el clasificador —</option>
                {TIPOS_DOC_EMBARQUE.map(t => <option key={t.tipo} value={t.tipo}>{t.etiqueta}</option>)}
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
                    : dragActive ? 'border-[#E11D48] bg-[#E11D48]/[0.02]'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'}`}
              >
                {procesando ? (
                  <>
                    <Loader2 className="w-8 h-8 mb-2 text-[#E11D48] animate-spin" />
                    <p className="text-xs font-bold text-gray-600">Subiendo y clasificando…</p>
                    <p className="text-[10px] text-gray-400 mt-1">Puede tardar hasta un minuto con PDFs escaneados.</p>
                  </>
                ) : (
                  <>
                    <UploadCloud className={`w-8 h-8 mb-2 ${dragActive ? 'text-[#E11D48]' : 'text-gray-400'}`} />
                    <p className="text-xs font-bold text-gray-600 text-center">
                      Arrastra el archivo aquí, o <span className="text-[#E11D48] hover:underline">explora</span>
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
                {t.documentos.map(d => <FilaDocumento key={d.id} doc={d} ordenes={ordenes} onDelete={puedeSubir ? onDeleteDocumento : undefined} />)}
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
          tipos={TIPOS_DOC_EMBARQUE}
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

          {/* Dónde cae */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Dónde se guarda
            </label>
            <div className="flex flex-wrap gap-2">
              {ORDEN_GRUPOS.map(gr => (
                <button
                  key={gr}
                  type="button"
                  onClick={() => setGrupo(gr)}
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-md border transition-colors ${
                    grupo === gr ? 'border-[#E11D48] bg-[#E11D48]/5 text-[#E11D48]' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                >
                  {ETIQUETA_GRUPO[gr]}
                </button>
              ))}
            </div>
            {pendiente.clasificacion.destinoSugerido && (
              <p className="text-[10px] text-gray-400 mt-1">
                El clasificador sugiere «{ETIQUETA_GRUPO[pendiente.clasificacion.destinoSugerido]}».
              </p>
            )}
          </div>

          {/* La precarga en la OC: lo más valioso */}
          {esFacturaProveedorPendiente && (
            <div className="border border-gray-200 rounded-lg px-3 py-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <Link2 className="w-3.5 h-3.5 text-[#E11D48]" />
                <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">Factura de proveedor → orden de compra</p>
              </div>
              {ordenes.length === 0 ? (
                <p className="text-[11px] text-gray-500">
                  Este embarque no tiene órdenes de compra. Se guarda como documento; la asociación se hace desde la OC cuando exista.
                </p>
              ) : (
                <>
                  <select
                    value={ocId}
                    onChange={e => setOcId(e.target.value)}
                    className="w-full px-3 py-2 text-[12px] bg-white border border-gray-200 rounded-md focus:outline-none focus:border-[#E11D48]"
                  >
                    <option value="">— Elige la OC a la que pertenece —</option>
                    {ordenes.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.folio} · {o.proveedorNombre} · {o.moneda} {o.monto.toLocaleString('en-US', { minimumFractionDigits: 2 })} · {o.estado}
                      </option>
                    ))}
                  </select>

                  {precarga && oc && propuestaOC && (
                    <div className={`rounded-md px-3 py-2 text-[11px] ${propuestaOC.aviso ? 'bg-amber-50 border border-amber-300 text-amber-900' : 'bg-emerald-50 border border-emerald-200 text-emerald-900'}`}>
                      <p className="font-semibold">Se escribirá en {oc.folio}:</p>
                      <p className="font-mono mt-0.5">{propuestaOC.facturaAsociada}</p>
                      <p className="mt-1 flex items-start gap-1.5">
                        {propuestaOC.aviso
                          ? <><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{propuestaOC.aviso}</>
                          : <><Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />El total de la factura ({precarga.moneda} {precarga.total?.toLocaleString('en-US', { minimumFractionDigits: 2 })}) cuadra con la OC.</>}
                      </p>
                    </div>
                  )}

                  <label className="flex items-center gap-2 text-[11px] text-gray-600">
                    <input type="checkbox" checked={precargarOC} onChange={e => setPrecargarOC(e.target.checked)} />
                    Precargar número, fecha y emisor en la OC al guardar
                  </label>
                </>
              )}
            </div>
          )}
        </RevisionDocumentoClasificado>
      )}
    </div>
  );
}

function FilaDocumento({ doc, ordenes, onDelete }: {
  doc: EmbarqueDocumento;
  ordenes: OrdenCompra[];
  onDelete?: (id: string) => void;
}) {
  // Los anteriores a D-3 tienen una URL de objeto que murió con la sesión.
  const sinArchivo = !doc.storagePath && (doc.url === '#' || doc.url.startsWith('blob:'));
  const oc = doc.ocId ? ordenes.find(o => o.id === doc.ocId) : null;

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
            {oc && <><span>•</span><span className="inline-flex items-center gap-1">OC <EnlaceEntidad tipo="ordenCompra" id={oc.id}>{oc.folio}</EnlaceEntidad></span></>}
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
