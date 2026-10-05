/**
 * ExpedientePanel — componente compartido para el expediente KYC.
 *
 * Lo usan tanto FichaCliente como FichaProveedor (tarea 54).
 * Muestra la sección de validación del expediente y el checklist de
 * documentos con subida de archivos y marcas manuales.
 */

import React, { useState, useRef } from 'react';
import { Upload, Loader2, AlertTriangle, Check, FileText, ExternalLink } from 'lucide-react';
import type { DocsAlta } from '../clientes/ClientesData';
import type { DocExpedienteConfig } from '../../lib/expedienteProveedor';
import type { EntidadValidable } from '../../lib/estadoValidacion';
import { estadoValidacion, etiquetaValidacion } from '../../lib/estadoValidacion';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface ArchivoExpediente {
  storagePath: string;
  url: string;
  nombre: string;
  subidoPor: string;
  fecha: string;
}

export interface ExpedientePanelProps {
  /** La entidad (cliente o proveedor) para determinar el estado de validación. */
  entidad: EntidadValidable & { id: string };
  /** Documentos que aplican para esta entidad. */
  documentos: DocExpedienteConfig[];
  /** Estado actual del checklist. */
  docsAlta: DocsAlta;
  /** Archivos ya subidos, indexados por campo de DocsAlta. */
  archivos?: Partial<Record<keyof DocsAlta, ArchivoExpediente>>;
  /** Nombre del usuario actual para registrar quién valida/sube. */
  nombreUsuario: string;
  /** ¿Puede validar el expediente? (solo admin y administracion). */
  puedeValidar: boolean;
  /** ¿Puede subir archivos? (solo admin y administracion). */
  puedeEditar: boolean;
  /** Ruta base en Storage para los archivos. */
  storageBasePath: string;
  /** Callback al marcar/desmarcar un documento a mano. */
  onToggleDoc: (campo: keyof DocsAlta, valor: boolean) => void;
  /** Callback al validar el expediente formalmente. */
  onValidar: (datos: { por: string; fecha: string; notas?: string }) => Promise<void>;
  /** Callback al subir un archivo. */
  onArchivoSubido?: (campo: keyof DocsAlta, archivo: ArchivoExpediente) => void;
  /**
   * Tarea 63 · El botón único «Subir documentos», armado por el contexto
   * (trae su catálogo, su flujo de clasificación y su guardado).
   *
   * Cuando viene, reemplaza al botón por casilla: ese obligaba a acertar la
   * casilla ANTES de abrir el archivo, que es de donde salió «puse la
   * constancia en el acta». «Reemplazar» se queda en las casillas que ya
   * tienen archivo, porque ahí el destino no se adivina.
   *
   * Cuando no viene, el panel se comporta como antes.
   */
  botonLote?: React.ReactNode;
  /** Si la entidad es un proveedor extranjero, se muestra un aviso. */
  esExtranjero?: boolean;
  /** Etiqueta para el tipo de entidad: "cliente" o "proveedor". */
  tipoEntidad?: string;
}

// ─── Componente ─────────────────────────────────────────────────────────────

export default function ExpedientePanel({
  entidad,
  documentos,
  docsAlta,
  archivos,
  nombreUsuario,
  puedeValidar,
  puedeEditar,
  storageBasePath,
  onToggleDoc,
  onValidar,
  onArchivoSubido,
  esExtranjero,
  tipoEntidad = 'proveedor',
  botonLote,
}: ExpedientePanelProps) {
  const estadoExp = estadoValidacion(entidad);
  const [notasValidacion, setNotasValidacion] = useState('');
  const [validando, setValidando] = useState(false);
  const [subiendo, setSubiendo] = useState<keyof DocsAlta | null>(null);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  const inputArchivo = useRef<HTMLInputElement>(null);
  const campoSubiendo = useRef<keyof DocsAlta | null>(null);

  const checklistCompleto = documentos.every(d => docsAlta[d.campo]);

  const pedirArchivo = (campo: keyof DocsAlta) => {
    campoSubiendo.current = campo;
    inputArchivo.current?.click();
  };

  const handleArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const campo = campoSubiendo.current;
    if (!file || !campo || !onArchivoSubido) return;
    e.target.value = '';

    setSubiendo(campo);
    setErrorSubida(null);
    try {
      const nombre = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${storageBasePath}/${Date.now()}-${nombre}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      const archivo: ArchivoExpediente = {
        storagePath: path,
        url,
        nombre: file.name,
        subidoPor: nombreUsuario,
        fecha: new Date().toISOString(),
      };
      onArchivoSubido(campo, archivo);
    } catch (err) {
      setErrorSubida(err instanceof Error ? err.message : 'Error al subir el archivo.');
    } finally {
      setSubiendo(null);
    }
  };

  return (
    <div>
      <input
        ref={inputArchivo}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls"
        className="hidden"
        onChange={handleArchivo}
      />

      {errorSubida && (
        <div className="mb-4 border border-red-200 bg-red-50 rounded-lg px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-600" />
          <p className="text-[12px] text-red-700">{errorSubida}</p>
        </div>
      )}

      {esExtranjero && (
        <div className="mb-4 border border-blue-200 bg-blue-50 rounded-lg px-3 py-2.5">
          <p className="text-[12px] text-blue-700">
            Proveedor extranjero: la Constancia de Situación Fiscal del SAT no aplica.
            En su lugar se pide el documento fiscal de su país.
          </p>
        </div>
      )}

      {/* ── Validación del expediente ────────────────────────────────── */}
      <div className={`mb-5 rounded-xl border px-4 py-3 ${estadoExp === 'sin_validar' ? 'border-amber-200 bg-amber-50/60' : 'border-emerald-200 bg-emerald-50/60'}`}>
        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
          Validación del expediente
        </p>
        <p className={`text-[12px] font-semibold mt-1 ${estadoExp === 'sin_validar' ? 'text-amber-800' : 'text-emerald-800'}`}>
          {etiquetaValidacion(entidad)}
          {estadoExp === 'validado' && entidad.expedienteValidado?.notas && (
            <span className="block font-normal text-gray-600 mt-0.5">{entidad.expedienteValidado.notas}</span>
          )}
        </p>
        {puedeValidar && estadoExp !== 'validado' && (
          <div className="mt-2 space-y-2">
            <textarea
              rows={2}
              value={notasValidacion}
              onChange={e => setNotasValidacion(e.target.value)}
              placeholder={checklistCompleto
                ? 'Notas (opcional)'
                : `Con el checklist incompleto, las notas son obligatorias: qué falta y por qué se valida igual.`}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[12px] outline-none focus:border-primario bg-white"
            />
            {!checklistCompleto && (
              <p className="text-[10px] text-amber-700">
                Faltan: {documentos.filter(d => !docsAlta[d.campo]).map(d => d.etiqueta).join(', ')}.
              </p>
            )}
            <button
              type="button"
              disabled={validando || (!checklistCompleto && !notasValidacion.trim())}
              onClick={async () => {
                setValidando(true);
                try {
                  await onValidar({
                    por: nombreUsuario,
                    fecha: new Date().toISOString(),
                    ...(notasValidacion.trim() ? { notas: notasValidacion.trim() } : {}),
                  });
                  setNotasValidacion('');
                } finally {
                  setValidando(false);
                }
              }}
              className="px-4 py-2 bg-primario hover:bg-primario-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-bold uppercase tracking-wider rounded-lg"
            >
              {validando
                ? 'Validando…'
                : estadoExp === 'heredado_magaya'
                  ? 'Validar formalmente'
                  : `Validar expediente`}
            </button>
          </div>
        )}
      </div>

      {/* ── Tarea 63 · Un solo botón, varios archivos ────────────────── */}
      {puedeEditar && botonLote && <div className="mb-5">{botonLote}</div>}

      {/* ── Checklist de documentos ──────────────────────────────────── */}
      <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
        Documentos de alta
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
        {documentos.map(({ campo, etiqueta }) => {
          const marcado = docsAlta[campo];
          const archivo = archivos?.[campo];
          const subiendoEste = subiendo === campo;
          return (
            <div
              key={campo}
              className={`border rounded-lg px-3.5 py-3 ${
                marcado
                  ? 'border-emerald-200 bg-emerald-50/30'
                  : 'border-card-border'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-text-primary">{etiqueta}</p>
                  {archivo ? (
                    <div className="mt-1 space-y-0.5">
                      <a
                        href={archivo.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-brand hover:underline flex items-center gap-1"
                      >
                        <FileText className="w-3 h-3" />
                        {archivo.nombre}
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                      <p className="text-[10px] text-text-muted">
                        {archivo.fecha.slice(0, 10)}
                        {archivo.subidoPor && ` · ${archivo.subidoPor}`}
                      </p>
                    </div>
                  ) : marcado ? (
                    <p className="text-[10px] text-text-muted mt-1">
                      Marcado como entregado (sin archivo digital).
                    </p>
                  ) : (
                    <p className="text-[10px] text-text-muted mt-1">Pendiente</p>
                  )}
                </div>
                <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  marcado
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {archivo ? 'Cargado' : marcado ? 'En físico' : 'Pendiente'}
                </span>
              </div>

              {puedeEditar && (
                <div className="mt-2.5 flex items-center gap-3">
                  {/* Con el botón único arriba, por casilla solo queda
                      «Reemplazar»: ahí el destino ya no se adivina. */}
                  {(!botonLote || archivo) && (
                    <button
                      type="button"
                      disabled={!!subiendo}
                      onClick={() => pedirArchivo(campo)}
                      className="flex items-center gap-1.5 text-[11px] font-bold text-brand hover:text-brand-hover disabled:opacity-50"
                    >
                      {subiendoEste
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Upload className="w-3 h-3" />}
                      {subiendoEste ? 'Subiendo…' : archivo ? 'Reemplazar' : 'Subir documento'}
                    </button>
                  )}
                  {!archivo && (
                    <button
                      type="button"
                      onClick={() => onToggleDoc(campo, !marcado)}
                      className="text-[10px] text-text-muted hover:text-text-secondary"
                    >
                      {marcado ? 'Quitar marca manual' : 'Marcar en físico'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
