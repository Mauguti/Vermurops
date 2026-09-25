/**
 * RevisionDocumentoClasificado.tsx (D-2)
 *
 * La pantalla de revisión entre el clasificador y el guardado — compartida
 * por el expediente KYC (D-2) y los documentos de embarque (D-3).
 *
 * Aquí se cumple el contrato de la arquitectura: n8n PROPUSO (tipo, nombre,
 * datos, avisos) y el usuario DECIDE. Nada llega a Firestore sin pasar por
 * esta pantalla, y el nombre con el que se guarda es el que el usuario dejó,
 * no el que trajo el archivo.
 */

import React, { useMemo, useState } from 'react';
import { X, FileText, AlertTriangle, Loader2, Check, ExternalLink } from 'lucide-react';
import {
  type ClasificacionValidada,
  type CampoAdoptable,
  type EstadoDocumento,
  estadoGuardable,
  traducirAviso,
  resolverTipoEsperado,
} from '../../lib/clasificacionDocumentos';
import {
  reglaDeTipo, advertenciaAlMostrar, ETIQUETA_CLASE,
} from '../../lib/visibilidadDocumentoCliente';

export interface RevisionConfirmada {
  tipoConfirmado: string;
  nombre: string;
  /** Campos de la ficha que el usuario adoptó explícitamente. */
  adoptados: Record<string, string>;
  estado: EstadoDocumento;
  /** Bloque 2 · Solo cuando la pantalla pide la casilla de visibilidad. */
  visibleCliente?: boolean;
}

interface Props {
  clasificacion: ClasificacionValidada;
  /** Lo que el usuario dijo que subía. null = subida sin tipo declarado. */
  tipoEsperado: string | null;
  /** La taxonomía del flujo, para el select de tipo. */
  tipos: { tipo: string; etiqueta: string }[];
  etiqueta: (tipo: string) => string;
  /** D-2: datos extraídos que pueden escribirse en la ficha del cliente. */
  camposAdoptables?: CampoAdoptable[];
  /**
   * Bloque 2 · Enseña la casilla «lo ve el cliente», con el valor que dicta
   * el tipo confirmado. Solo los documentos del embarque la piden; los
   * tarifarios no salen a ningún portal.
   */
  conVisibilidadCliente?: boolean;
  /** Contenido extra del flujo (D-3 meterá aquí el selector de grupo). */
  children?: React.ReactNode;
  guardando: boolean;
  /**
   * Motivo por el que NO se puede guardar desde esta pantalla, decidido por
   * el flujo (una factura en Documentos). Deshabilita Guardar y lo dice.
   */
  bloqueo?: string | null;
  onGuardar: (r: RevisionConfirmada) => void;
  onCancelar: () => void;
}

const CONFIANZA_ESTILO: Record<ClasificacionValidada['confianza'], string> = {
  alta: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  media: 'bg-amber-50 text-amber-800 border-amber-300',
  baja: 'bg-red-50 text-red-700 border-red-200',
};

export default function RevisionDocumentoClasificado({
  clasificacion, tipoEsperado, tipos, etiqueta, camposAdoptables = [],
  conVisibilidadCliente = false,
  children, guardando, bloqueo = null, onGuardar, onCancelar,
}: Props) {
  /*
   * El tipo arranca SIN confirmar cuando el detectado contradice al esperado:
   * a veces el usuario se equivocó de archivo, a veces la IA se equivocó de
   * tipo, y precargar cualquiera de los dos escondería la discrepancia.
   */
  const discrepancia = resolverTipoEsperado(tipoEsperado, clasificacion.tipo, etiqueta);
  const [tipo, setTipo] = useState<string | null>(
    discrepancia.coincide ? (tipoEsperado ?? clasificacion.tipo) : null,
  );
  const [nombre, setNombre] = useState(clasificacion.nombrePropuesto);
  const [adoptados, setAdoptados] = useState<Record<string, string>>({});

  /*
   * Bloque 2 · `null` = el usuario no ha tocado la casilla y manda la regla
   * del tipo. Se guarda como null y no como el booleano ya resuelto para que
   * cambiar el tipo mueva la casilla con él: corregir «otro» a «pedimento»
   * tiene que ocultarlo, no dejarlo visible porque así nació.
   */
  const [visibleManual, setVisibleManual] = useState<boolean | null>(null);
  const reglaVis = reglaDeTipo(tipo ?? '');
  const visible = visibleManual ?? reglaVis.porDefecto;
  const advertencia = visible ? advertenciaAlMostrar(tipo ?? '') : null;

  const veredicto = useMemo(() => estadoGuardable({
    tipoConfirmado: tipo,
    nombre,
    legible: clasificacion.legible,
    vencido: clasificacion.vencido,
    avisos: clasificacion.avisos,
  }), [tipo, nombre, clasificacion]);

  const toggleAdoptar = (campo: string, valor: string) =>
    setAdoptados(prev => {
      const next = { ...prev };
      if (campo in next) delete next[campo];
      else next[campo] = valor;
      return next;
    });

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[88vh] overflow-hidden">
        {/* Encabezado */}
        <div className="px-5 py-4 border-b border-gray-150 flex items-center justify-between bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-gray-400 shrink-0" />
            <h3 className="text-[14px] font-bold text-[#18181B] truncate">
              Revisar documento clasificado
            </h3>
          </div>
          <button onClick={onCancelar} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Qué detectó */}
          <div className="flex items-start gap-3">
            <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded border shrink-0 ${CONFIANZA_ESTILO[clasificacion.confianza]}`}>
              Confianza {clasificacion.confianza}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] text-gray-800">
                El clasificador lo lee como <strong>{etiqueta(clasificacion.tipo)}</strong>.
              </p>
              {clasificacion.razonTipo && (
                <p className="text-[11px] text-gray-500 mt-0.5">{clasificacion.razonTipo}</p>
              )}
              <p className="text-[11px] text-gray-400 mt-0.5 font-mono truncate">
                {clasificacion.nombreOriginal}
              </p>
            </div>
          </div>

          {bloqueo && (
            <div className="border border-red-300 bg-red-50 rounded-lg px-3 py-2.5">
              <p className="text-[12px] text-red-900 font-semibold flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {bloqueo}
              </p>
            </div>
          )}

          {/* Discrepancia esperado vs detectado */}
          {!discrepancia.coincide && (
            <div className="border border-amber-300 bg-amber-50 rounded-lg px-3 py-2.5">
              <p className="text-[12px] text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {discrepancia.mensaje}
              </p>
            </div>
          )}

          {/* Tipo confirmado */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Tipo de documento
            </label>
            <select
              value={tipo ?? ''}
              onChange={e => setTipo(e.target.value || null)}
              className={`w-full px-3 py-2 text-[13px] bg-white border rounded-md focus:outline-none focus:border-primario ${
                tipo ? 'border-gray-200' : 'border-amber-400'
              }`}
            >
              <option value="">— Confirma el tipo —</option>
              {tipos.map(t => (
                <option key={t.tipo} value={t.tipo}>{t.etiqueta}</option>
              ))}
            </select>
          </div>

          {/* Nombre editable */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Nombre del documento
            </label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              className="w-full px-3 py-2 text-[13px] bg-white border border-gray-200 rounded-md focus:outline-none focus:border-primario"
              placeholder="Nombre con el que se guardará"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Se guarda con este nombre, no con el del archivo.
            </p>
          </div>

          {/* Avisos, traducidos y nunca ocultos */}
          {(clasificacion.avisos.length > 0 || !clasificacion.legible || clasificacion.vencido) && (
            <div className="border border-amber-300 bg-amber-50 rounded-lg px-3 py-2.5 space-y-1.5">
              {!clasificacion.legible && (
                <p className="text-[12px] text-amber-900">{traducirAviso('ilegible')}</p>
              )}
              {clasificacion.vencido && !clasificacion.avisos.includes('vencido') && (
                <p className="text-[12px] text-amber-900">{traducirAviso('vencido')}</p>
              )}
              {clasificacion.avisos.map(a => (
                <p key={a} className="text-[12px] text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {traducirAviso(a)}
                </p>
              ))}
              <p className="text-[10px] text-amber-700 pt-0.5">
                Se puede guardar, pero quedará marcado «con observaciones».
              </p>
            </div>
          )}

          {clasificacion.observaciones && (
            <p className="text-[11px] text-gray-500 italic">{clasificacion.observaciones}</p>
          )}

          {/* Adopción de datos: confirmación explícita por campo */}
          {camposAdoptables.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Datos del documento para la ficha
              </label>
              <div className="space-y-2">
                {camposAdoptables.map(c => {
                  const adoptado = c.campo in adoptados;
                  return (
                    <div
                      key={c.campo}
                      className={`border rounded-lg px-3 py-2 ${adoptado ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-gray-600">{c.etiqueta}</p>
                          {c.enConflicto ? (
                            /* La ficha ya dice otra cosa: lado a lado, que el
                               usuario vea AMBOS antes de decidir. */
                            <div className="grid grid-cols-2 gap-3 mt-1">
                              <div>
                                <p className="text-[9px] uppercase tracking-wider text-gray-400">Ficha actual</p>
                                <p className={`text-[12px] ${adoptado ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{c.valorActual}</p>
                              </div>
                              <div>
                                <p className="text-[9px] uppercase tracking-wider text-gray-400">Documento</p>
                                <p className={`text-[12px] ${adoptado ? 'text-emerald-800 font-medium' : 'text-gray-800'}`}>{c.valorDocumento}</p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[12px] text-gray-800 mt-0.5">{c.valorDocumento}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleAdoptar(c.campo, c.valorDocumento)}
                          className={`shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-md border transition-colors ${
                            adoptado
                              ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                              : 'border-gray-200 text-gray-500 hover:border-primario hover:text-primario'
                          }`}
                        >
                          {adoptado ? <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Usar</span> : 'Usar en la ficha'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">
                Nada se escribe en la ficha sin marcarlo aquí.
              </p>
            </div>
          )}

          {/* ── Bloque 2 · Qué ve el cliente ── */}
          {conVisibilidadCliente && tipo && (
            <div className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400 font-bold">
                    Portal del cliente
                  </p>
                  <p className="text-[12px] text-gray-800 mt-0.5 font-semibold">
                    {visible ? 'El cliente lo verá' : 'Solo para el equipo'}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{reglaVis.razon}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setVisibleManual(!visible)}
                  className={`shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-md border transition-colors ${
                    visible
                      ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                      : 'border-gray-200 text-gray-500 hover:border-primario hover:text-primario'
                  }`}
                >
                  {visible ? 'Ocultar al cliente' : 'Mostrar al cliente'}
                </button>
              </div>

              {/* Los sensibles no se bloquean, se explican: un aviso sin
                  motivo se vuelve un paso que la gente aprende a saltarse. */}
              {advertencia && (
                <p className="text-[11px] text-peligro flex items-start gap-1.5 mt-2 border-t border-gray-100 pt-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  <span>{advertencia}</span>
                </p>
              )}

              <p className="text-[9px] text-gray-400 mt-2">
                {ETIQUETA_CLASE[reglaVis.clase]} · el tipo decide el valor inicial, para que
                nadie tenga que acordarse de palomear nada.
              </p>
            </div>
          )}

          {children}
        </div>

        {/* Pie */}
        <div className="px-5 py-3 border-t border-gray-150 bg-gray-50/50 flex items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-gray-500 min-w-0">
            {veredicto.faltantes.length > 0
              ? <span className="text-amber-700">{veredicto.faltantes[0]}</span>
              : veredicto.estadoResultante === 'con_observaciones'
                ? 'Se guardará marcado «con observaciones».'
                : 'Listo para guardar.'}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onCancelar}
              className="text-[12px] px-3 py-2 text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
            <button
              disabled={!veredicto.puedeGuardar || guardando || !!bloqueo}
              onClick={() => tipo && onGuardar({
                tipoConfirmado: tipo,
                nombre: nombre.trim(),
                adoptados,
                estado: veredicto.estadoResultante,
                ...(conVisibilidadCliente ? { visibleCliente: visible } : {}),
              })}
              className="flex items-center gap-2 bg-primario text-white px-4 py-2 rounded-md text-[12px] font-bold hover:bg-primario-hover disabled:opacity-50 transition-colors"
            >
              {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Guardar documento
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Enlace discreto para abrir el archivo original en otra pestaña. */
export function EnlaceArchivo({ url, nombre }: { url: string; nombre: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-primario truncate"
      title={nombre}
    >
      <ExternalLink className="w-3 h-3 shrink-0" />
      <span className="truncate">{nombre}</span>
    </a>
  );
}
