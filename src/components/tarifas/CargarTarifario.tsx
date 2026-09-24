import React, { useRef, useState } from 'react';
import {
  X, Upload, FileText, Sparkles, Loader2, ClipboardPaste, AlertTriangle,
} from 'lucide-react';
import { useDocumentosTarifario } from '../../hooks/useDocumentosTarifario';
import { usePuertos } from '../../hooks/usePuertos';
import { useConceptos } from '../../hooks/useConceptos';
import { useProveedores } from '../../hooks/useProveedores';
import { useTarifas } from '../../hooks/useTarifas';
import RevisionTarifasExtraidas from './RevisionTarifasExtraidas';
import SelectorProveedor from '../proveedores/SelectorProveedor';
import type { LineaEnRevision } from '../../lib/importacionTarifas';
import type { DocumentoTarifario } from '../../lib/documentoTarifario';

/**
 * Carga de tarifario con IA — el MISMO componente en los dos puntos de entrada.
 *
 * Gabi: «voy a cargar unos tarifarios que tengo de agosto. Pero realmente no
 * los pude cargar porque no encontré dónde.» Y de la carga masiva anterior:
 * «ahí intenté picar, pero no me apareció nada».
 *
 * Reemplaza a la carga masiva vieja. Dejar las dos confundiría: el cliente ya
 * dijo que la anterior no le sirve.
 *
 * La diferencia entre los dos puntos de entrada es de dónde sale el proveedor:
 *   · desde Tarifas     → se elige de entrada, no hay contexto
 *   · desde la cotización → se resuelve contra lo que trae el documento
 * En ambos casos se puede corregir en la revisión.
 */

interface Props {
  onCerrar: () => void;
  /** Cotización de origen, si se abre desde ahí. */
  cotizacionId?: string | null;
  /** true = el proveedor se elige antes de subir (entrada desde Tarifas). */
  pedirProveedorAntes?: boolean;
  onGuardadas?: (cuantas: number) => void;
}

export default function CargarTarifario({
  onCerrar, cotizacionId, pedirProveedorAntes, onGuardadas,
}: Props) {
  const { subiendo, subirDocumento, registrarExtraccion } = useDocumentosTarifario();
  const { puertos } = usePuertos();
  const { conceptos } = useConceptos();
  const { proveedores } = useProveedores();
  const { createTarifa } = useTarifas();

  const inputRef = useRef<HTMLInputElement>(null);
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  const [modo, setModo] = useState<'archivo' | 'texto'>('archivo');
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] =
    useState<{ documento: DocumentoTarifario; respuesta: unknown } | null>(null);

  const listoParaSubir = !pedirProveedorAntes || Boolean(proveedorId);

  const procesar = async (file: File) => {
    setError(null);
    try {
      const { documento, extraccion, duplicadoDe } = await subirDocumento(file, {
        procesarConIA: true, cotizacionId: cotizacionId ?? null,
      });
      if (duplicadoDe) {
        setError(
          `Este archivo ya se procesó el ${duplicadoDe.fechaSubida.slice(0, 10)} ` +
          `por ${duplicadoDe.subidoPorNombre}. Se guardó de todos modos.`,
        );
      }
      setPendiente({ documento, respuesta: extraccion });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const procesarTexto = async () => {
    if (!texto.trim()) return;
    // El correo pegado se convierte en archivo: mismo camino, misma evidencia.
    const blob = new File(
      [texto],
      `correo-${new Date().toISOString().slice(0, 10)}.txt`,
      { type: 'text/plain' },
    );
    await procesar(blob);
  };

  if (pendiente) {
    return (
      <RevisionTarifasExtraidas
        respuestaCruda={pendiente.respuesta}
        nombreArchivo={pendiente.documento.nombreArchivo}
        conceptos={conceptos.filter(c => c.activo)}
        puertos={puertos.map(p => ({ id: p.id, nombre: p.nombre, codigo: p.codigo }))}
        proveedores={proveedores}
        onCancelar={onCerrar}
        onGuardar={async (lineas, provId) => {
          const n = await guardar(lineas, provId, pendiente.documento, createTarifa);
          await registrarExtraccion(pendiente.documento.id, pendiente.documento.id, n);
          onGuardadas?.(n);
          onCerrar();
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-150 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primario" />
            <h3 className="text-[14px] font-bold text-[#18181B]">Cargar tarifario</h3>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-[12px] text-gray-500 leading-snug">
            Sube el tarifario como te llegó —Excel, PDF, una captura o el correo pegado—
            y el sistema propone las tarifas. Nada se guarda sin que lo revises.
          </p>

          {pedirProveedorAntes && (
            <div>
              <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1.5">
                Proveedor del tarifario *
              </label>
              <SelectorProveedor
                proveedores={proveedores}
                valorId={proveedorId}
                onSelect={p => setProveedorId(p.id)}
                placeholder="Buscar proveedor…"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Se puede corregir en la revisión si el documento dice otro.
              </p>
            </div>
          )}

          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {([['archivo', 'Archivo'], ['texto', 'Pegar correo']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setModo(id)}
                className={`flex-1 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${
                  modo === id ? 'bg-white text-[#18181B] shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {modo === 'archivo' ? (
            <button
              onClick={() => inputRef.current?.click()}
              disabled={!listoParaSubir || subiendo}
              className="w-full py-8 border-2 border-dashed border-gray-200 hover:border-primario/50 hover:bg-primario/5 rounded-xl transition-all flex flex-col items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {subiendo
                ? <Loader2 className="w-6 h-6 text-primario animate-spin" />
                : <Upload className="w-6 h-6 text-gray-400" />}
              <span className="text-[12px] font-semibold text-gray-600">
                {subiendo ? 'Procesando…' : 'Elegir archivo'}
              </span>
              <span className="text-[10px] text-gray-400">
                Excel, CSV, PDF o imagen · máximo 10 MB
              </span>
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                rows={7}
                value={texto}
                onChange={e => setTexto(e.target.value)}
                placeholder="Pega aquí el correo con las tarifas…"
                className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-primario resize-none"
              />
              <button
                onClick={procesarTexto}
                disabled={!texto.trim() || !listoParaSubir || subiendo}
                className="w-full flex items-center justify-center gap-2 bg-primario hover:bg-primario-hover text-white text-[12px] font-bold uppercase tracking-wider py-2.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {subiendo
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <ClipboardPaste className="w-3.5 h-3.5" />}
                {subiendo ? 'Procesando…' : 'Extraer tarifas del texto'}
              </button>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            hidden
            accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.webp,.heic"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) procesar(f);
              e.target.value = '';
            }}
          />

          {!listoParaSubir && (
            <p className="text-[11px] text-amber-700 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-[1px]" />
              Elige el proveedor antes de subir el tarifario.
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-[1px]" />
              <p className="text-[11px] text-amber-800">{error}</p>
            </div>
          )}

          <p className="text-[10px] text-gray-400 flex items-start gap-1.5">
            <FileText className="w-3 h-3 shrink-0 mt-[1px]" />
            El documento queda guardado como evidencia: desde cada tarifa se puede
            ver de dónde salió.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Guardado al catálogo general ─────────────────────────────────────────────

async function guardar(
  lineas: LineaEnRevision[],
  proveedorId: string,
  documento: DocumentoTarifario,
  createTarifa: (t: never) => Promise<void>,
): Promise<number> {
  let creadas = 0;
  for (const l of lineas) {
    try {
      await createTarifa({
        id: `TAR-${Date.now()}-${creadas}`,
        tipo: 'estandar',
        conceptoId: l.conceptoId!,
        proveedorId,
        puertoOrigenId: l.puertoOrigenId,
        puertoDestinoId: l.puertoDestinoId,
        terminalId: null,
        rutaTexto: l.rutaTexto,
        precios: {
          monto: l.monto, unidad: l.unidad!,
          ...(l.montoPor40 ? { montoPor40: l.montoPor40 } : {}),
          ...(l.montoPor40HC ? { montoPor40HC: l.montoPor40HC } : {}),
          ...(l.montoMinimo ? { montoMinimo: l.montoMinimo } : {}),
        },
        moneda: l.moneda!,
        vigenciaTexto: '',
        fechaInicio: new Date().toISOString().slice(0, 10),
        fechaFin: null,
        tiempoTransitoDias: l.extraida.tiempoTransito ?? null,
        freeTimeDias: l.extraida.freeTime ?? null,
        condiciones: l.extraida.condiciones ?? '',
        activo: true,
        origenDatos: 'ocr',
        documentoOrigen: {
          path: documento.path,
          nombreArchivo: documento.nombreArchivo,
          importacionId: documento.id,
        },
        creadoPor: documento.subidoPor,
        fechaAlta: new Date().toISOString().slice(0, 10),
        updatedAt: new Date().toISOString(),
      } as never);
      creadas++;
    } catch {
      // conAviso ya reportó; se sigue con las demás en vez de abortar todo.
    }
  }
  return creadas;
}
