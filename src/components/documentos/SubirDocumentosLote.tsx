/**
 * SubirDocumentosLote.tsx — Tarea 63
 *
 * UN botón «Subir documentos» que acepta varios archivos, los clasifica y
 * enseña la lista para confirmar de un jalón.
 *
 * Reemplaza al botón por casilla. Gaby: «se vuelven 15 documentos… me
 * equivoqué, puse la constancia en el acta». Con un botón por casilla hay que
 * acertar la casilla ANTES de abrir el archivo; aquí el tipo lo propone el
 * clasificador después de leerlo, y se corrige en esta misma lista antes de
 * que nada se guarde.
 *
 * La lista ES la pantalla de revisión (§4.10). Lo mismo que hace
 * RevisionDocumentoClasificado para un documento, en plural y sin modal: con
 * 15 archivos, 15 modales encadenados son peores que el problema.
 */

import React, { useRef, useState } from 'react';
import { Upload, Loader2, AlertTriangle, X, FileText, Check } from 'lucide-react';
import {
  resumenLote, conflictosDeTipo, normalizarTipoClasificado,
  type LineaLote, type TipoDocLote,
} from '../../lib/loteDocumentos';
import { traducirAviso } from '../../lib/clasificacionDocumentos';
import type { ResultadoSubida } from '../../hooks/useSubidaClasificada';

interface Props {
  /** Los tipos válidos en este contexto. */
  catalogo: TipoDocLote[];
  etiqueta: (tipo: string) => string;
  /** Sube a Storage y clasifica. Lo trae el contexto (useSubidaClasificada). */
  procesar: (file: File) => Promise<ResultadoSubida>;
  /**
   * El destino guarda UN documento por tipo (los expedientes son mapas
   * indexados por tipo). Entonces dos archivos con el mismo tipo en el mismo
   * lote se pisan, y hay que avisar. La orden de compra guarda una lista: no
   * aplica.
   */
  unoPorTipo?: boolean;
  /**
   * Qué pasa al confirmar. Recibe solo los renglones guardables; el contexto
   * sabe quién es el usuario y escribe el registro de la corrección.
   */
  onGuardar: (lineas: LineaLote[]) => Promise<void>;
  /** Sin permiso de edición no se pinta el botón. */
  puedeSubir: boolean;
  /** Texto del botón; por defecto «Subir documentos». */
  textoBoton?: string;
  /** Formatos aceptados por el input. */
  accept?: string;
  /** Explicación corta debajo del botón. */
  ayuda?: string;
}

/** Cuántos archivos se aceptan de un jalón. Más es un arrastre por error. */
const MAX_ARCHIVOS = 15;

const ESTILO_CONFIANZA: Record<string, string> = {
  alta: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  media: 'bg-amber-50 text-amber-800 border-amber-300',
  baja: 'bg-red-50 text-red-700 border-red-200',
};

export default function SubirDocumentosLote({
  catalogo, etiqueta, procesar, unoPorTipo = false, onGuardar,
  puedeSubir, textoBoton = 'Subir documentos',
  accept = '.pdf,.jpg,.jpeg,.png,.xlsx,.xls,.csv,.xml,.eml,.msg',
  ayuda,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [lineas, setLineas] = useState<LineaLote[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const resumen = resumenLote(lineas);
  const conflictos = unoPorTipo ? conflictosDeTipo(lineas) : [];

  const actualizar = (id: string, cambio: Partial<LineaLote>) =>
    setLineas(prev => prev.map(l => (l.id === id ? { ...l, ...cambio } : l)));

  const handleArchivos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const elegidos = Array.from(e.target.files ?? []);
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (elegidos.length === 0) return;

    setErrorGeneral(null);
    const archivos = elegidos.slice(0, MAX_ARCHIVOS);
    if (elegidos.length > MAX_ARCHIVOS) {
      setErrorGeneral(
        `Se tomaron los primeros ${MAX_ARCHIVOS} archivos de ${elegidos.length}. Sube el resto en otro lote.`,
      );
    }

    // Los renglones aparecen de inmediato, en 'procesando': con 15 archivos,
    // una barra que no dice cuál va es una barra que no informa.
    const base = Date.now();
    const nuevas: LineaLote[] = archivos.map((f, i) => ({
      id: `${base}-${i}`,
      nombreArchivo: f.name,
      estado: 'procesando',
      tipoCrudo: '',
      tipoPropuesto: null,
      tipoElegido: null,
      corregidoAMano: false,
      avisos: [],
      storagePath: '',
      url: '',
      nombre: f.name,
    }));
    setLineas(prev => [...prev, ...nuevas]);

    // En serie, no en paralelo: 15 llamadas simultáneas al clasificador son
    // 15 instancias de la Function y un pico de consumo de IA.
    for (let i = 0; i < archivos.length; i++) {
      const id = nuevas[i].id;
      try {
        const r = await procesar(archivos[i]);
        const propuesto = normalizarTipoClasificado(r.tipoCrudo, catalogo);
        actualizar(id, {
          estado: 'listo',
          storagePath: r.storagePath,
          url: r.url,
          tipoCrudo: r.tipoCrudo,
          tipoPropuesto: propuesto,
          tipoElegido: propuesto,
          confianza: r.confianza,
          avisos: r.avisos,
          observaciones: r.avisoClasificador
            ? [r.observaciones, r.avisoClasificador].filter(Boolean).join(' · ')
            : r.observaciones,
          datos: r.datos,
          rfc: r.rfc,
          razonSocial: r.razonSocial,
          nombre: r.nombrePropuesto,
        });
      } catch (err) {
        actualizar(id, {
          estado: 'error',
          error: err instanceof Error ? err.message : 'No se pudo subir el archivo.',
        });
      }
    }
  };

  const guardar = async () => {
    const guardables = lineas.filter(l => l.estado === 'listo' && l.tipoElegido);
    if (guardables.length === 0) return;
    setGuardando(true);
    setErrorGeneral(null);
    try {
      await onGuardar(guardables);
      setLineas([]);
    } catch (err) {
      setErrorGeneral(err instanceof Error ? err.message : 'No se pudieron guardar los documentos.');
    } finally {
      setGuardando(false);
    }
  };

  if (!puedeSubir) return null;

  return (
    <div>
      <input
        ref={input}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={handleArchivos}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={resumen.procesando > 0 || guardando}
          onClick={() => input.current?.click()}
          className="flex items-center gap-2 px-4 py-2 bg-primario hover:bg-primario-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-bold uppercase tracking-wider rounded-lg"
        >
          {resumen.procesando > 0
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Upload className="w-3.5 h-3.5" />}
          {resumen.procesando > 0 ? 'Clasificando…' : textoBoton}
        </button>
        <p className="text-[11px] text-text-muted">
          {ayuda ?? 'Varios a la vez. El agente propone el tipo de cada uno y tú confirmas.'}
        </p>
      </div>

      {errorGeneral && (
        <div className="mt-3 border border-red-200 bg-red-50 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-600" />
          <p className="text-[11px] text-red-700">{errorGeneral}</p>
        </div>
      )}

      {lineas.length > 0 && (
        <div className="mt-3 border border-card-border rounded-xl overflow-hidden">
          <div className="px-3.5 py-2 bg-gray-50/70 border-b border-card-border flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {lineas.length === 1 ? '1 archivo por confirmar' : `${lineas.length} archivos por confirmar`}
            </p>
            <p className="text-[10px] text-text-muted">
              {resumen.conTipo} con tipo · {resumen.sinClasificar} sin clasificar
              {resumen.conError > 0 && ` · ${resumen.conError} con error`}
            </p>
          </div>

          <div className="divide-y divide-gray-100">
            {lineas.map(l => (
              <div key={l.id} className="px-3.5 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex items-start gap-2">
                    {l.estado === 'procesando'
                      ? <Loader2 className="w-3.5 h-3.5 mt-0.5 shrink-0 animate-spin text-gray-400" />
                      : l.estado === 'error'
                        ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-500" />
                        : <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />}
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-text-primary truncate">
                        {l.nombreArchivo}
                      </p>
                      {l.estado === 'error' && (
                        <p className="text-[10px] text-red-600 mt-0.5">{l.error}</p>
                      )}
                      {l.estado === 'procesando' && (
                        <p className="text-[10px] text-text-muted mt-0.5">Subiendo y clasificando…</p>
                      )}
                      {l.estado === 'listo' && (
                        <>
                          <p className="text-[10px] text-text-muted mt-0.5">
                            {l.tipoPropuesto
                              ? <>El agente lo leyó como «{etiqueta(l.tipoPropuesto)}»</>
                              : l.tipoCrudo
                                ? <>El agente lo leyó como «{etiqueta(l.tipoCrudo)}», que no es un documento de esta lista</>
                                : <>El agente no determinó el tipo</>}
                            {l.corregidoAMano && ' · corregido a mano'}
                          </p>
                          {l.observaciones && (
                            <p className="text-[10px] text-text-muted mt-0.5">{l.observaciones}</p>
                          )}
                          {l.avisos.map(a => (
                            <p key={a} className="text-[10px] text-amber-700 flex items-start gap-1 mt-0.5">
                              <AlertTriangle className="w-3 h-3 mt-px shrink-0" />
                              {traducirAviso(a)}
                            </p>
                          ))}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {l.estado === 'listo' && l.confianza && (
                      <span className={`hidden sm:inline text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${ESTILO_CONFIANZA[l.confianza]}`}>
                        {l.confianza}
                      </span>
                    )}
                    {l.estado === 'listo' && (
                      <select
                        value={l.tipoElegido ?? ''}
                        onChange={e => {
                          const valor = e.target.value || null;
                          actualizar(l.id, {
                            tipoElegido: valor,
                            corregidoAMano: valor !== l.tipoPropuesto,
                          });
                        }}
                        className={`px-2 py-1.5 border rounded-lg text-[11px] outline-none focus:border-primario bg-white max-w-[190px] ${
                          l.tipoElegido ? 'border-gray-200' : 'border-peligro text-peligro'
                        }`}
                      >
                        <option value="">Sin clasificar — elige el tipo</option>
                        {catalogo.map(c => (
                          <option key={c.tipo} value={c.tipo}>{c.etiqueta}</option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      title="Quitar del lote"
                      onClick={() => setLineas(prev => prev.filter(x => x.id !== l.id))}
                      className="p-1 text-gray-400 hover:text-peligro"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {conflictos.length > 0 && (
            <div className="px-3.5 py-2 border-t border-card-border bg-amber-50/60 space-y-1">
              {conflictos.map(c => (
                <p key={c.tipo} className="text-[10px] text-amber-800 flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 mt-px shrink-0" />
                  Dos archivos quedaron como «{etiqueta(c.tipo)}» ({c.archivos.join(', ')}):
                  solo se guarda uno por tipo, así que el último pisa al anterior.
                </p>
              ))}
            </div>
          )}

          <div className="px-3.5 py-2.5 border-t border-card-border bg-gray-50/70 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-text-muted">
              {resumen.faltante || `Listo para guardar ${resumen.conTipo === 1 ? '1 documento' : `${resumen.conTipo} documentos`}.`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={guardando}
                onClick={() => { setLineas([]); setErrorGeneral(null); }}
                className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary hover:text-text-primary disabled:opacity-40"
              >
                Descartar
              </button>
              <button
                type="button"
                disabled={!resumen.puedeGuardar || guardando}
                onClick={guardar}
                className="flex items-center gap-1.5 px-4 py-2 bg-primario hover:bg-primario-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-bold uppercase tracking-wider rounded-lg"
              >
                {guardando
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando…</>
                  : <><Check className="w-3.5 h-3.5" /> Guardar {resumen.conTipo > 0 ? resumen.conTipo : ''}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
