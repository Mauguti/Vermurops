/**
 * VistaCliente.tsx
 *
 * Vista de solo lectura del embarque tal como lo vería el cliente.
 *
 * ── Propósito ────────────────────────────────────────────────────────────
 * Sirve para capacitar al equipo y para comprobar que no se fugan
 * documentos sensibles (facturas de proveedor, cartas de encomienda,
 * pedimentos). Es una VISTA PREVIA: no es el portal del cliente, es lo
 * que el equipo interno ve para verificar qué se le enseña.
 *
 * ── Qué no aparece ──────────────────────────────────────────────────────
 * Costos, proveedores, márgenes, bitácora interna, órdenes de compra,
 * datos de facturación interna. Solo lo que el cliente debería ver.
 */

import React from 'react';
import {
  Eye, X, Ship, Plane, Truck, Calendar, FileText, MapPin,
  AlertTriangle, Package,
} from 'lucide-react';
import type { EmbarqueCompleto, EmbarqueDocumento, EmbarqueEvento } from './EmbarquesData';
import { documentosParaCliente, reglaDeTipo } from '../../lib/visibilidadDocumentoCliente';
import { etiquetaTipoDocumento } from '../../lib/documentosEmbarque';
import { estadoDe, ETAPA_MAP } from '../../lib/estadoEmbarque';

interface Props {
  embarque: EmbarqueCompleto;
  onCerrar: () => void;
}

const ICONO_MODALIDAD: Record<string, React.ReactNode> = {
  maritimo: <Ship className="w-4 h-4" />,
  aereo: <Plane className="w-4 h-4" />,
  terrestre: <Truck className="w-4 h-4" />,
};

export default function VistaCliente({ embarque, onCerrar }: Props) {
  const docsVisibles = documentosParaCliente(embarque.documentos ?? []);
  const etapaActual = estadoDe(embarque);
  const etapa = ETAPA_MAP[etapaActual];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-4 overflow-hidden">
        {/* ── Banner de vista previa ─────────────────────────────────── */}
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-amber-800">
            <Eye className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider">
              Vista previa · Así lo vería el cliente
            </span>
          </div>
          <button
            onClick={onCerrar}
            className="p-1.5 hover:bg-amber-100 rounded-lg transition-colors text-amber-700"
            title="Cerrar vista previa"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Encabezado del embarque ────────────────────────────────── */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            {ICONO_MODALIDAD[embarque.modalidad] ?? <Package className="w-4 h-4 text-gray-400" />}
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {embarque.modalidad}
            </span>
            <span className="text-[10px] font-bold text-primario uppercase tracking-wider ml-auto px-2 py-0.5 bg-primario/10 rounded">
              {etapa?.label ?? etapaActual}
            </span>
          </div>
          <h2 className="text-lg font-bold text-[#18181B] tracking-tight">
            {embarque.folio}
          </h2>
          {embarque.entidades?.clienteCobrar && (
            <p className="text-xs text-gray-500 mt-0.5">{embarque.entidades.clienteCobrar}</p>
          )}
        </div>

        {/* ── Ruta ───────────────────────────────────────────────────── */}
        {(embarque.ruta?.origen?.puertoCarga || embarque.ruta?.destino?.puertoDescarga) && (
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-3 text-xs text-gray-600">
              <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="font-semibold">{embarque.ruta?.origen?.puertoCarga || '—'}</span>
              <span className="text-gray-300">→</span>
              <span className="font-semibold">{embarque.ruta?.destino?.puertoDescarga || '—'}</span>
            </div>
          </div>
        )}

        {/* ── Fechas clave ───────────────────────────────────────────── */}
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Fechas
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FechaCampo label="ETD" valor={embarque.fechas?.salida} />
            <FechaCampo label="ETA" valor={embarque.fechas?.arribo} />
            <FechaCampo label="Documentación" valor={embarque.fechas?.limiteDocumentacion} />
            <FechaCampo label="Orden general" valor={embarque.fechas?.ordenGeneral} />
          </div>
        </div>

        {/* ── Documentos visibles ────────────────────────────────────── */}
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Documentos ({docsVisibles.length})
          </h3>
          {docsVisibles.length === 0 ? (
            <p className="text-xs text-gray-400 italic">
              No hay documentos visibles para el cliente en este embarque.
            </p>
          ) : (
            <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
              {docsVisibles.map(doc => (
                <FilaDocCliente key={doc.id} doc={doc} />
              ))}
            </div>
          )}
        </div>

        {/* ── Historial (hitos para el cliente) ──────────────────────── */}
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
            Historial
          </h3>
          {(embarque.eventos ?? []).length === 0 ? (
            <p className="text-xs text-gray-400 italic">
              No hay eventos registrados.
            </p>
          ) : (
            <div className="relative border-l-2 border-gray-150 pl-4 space-y-4">
              {embarque.eventos.map(evt => (
                <EventoCliente key={evt.id} evt={evt} />
              ))}
            </div>
          )}
        </div>

        {/* ── Pie de la vista previa ─────────────────────────────────── */}
        <div className="px-6 py-4 bg-amber-50/50 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 leading-relaxed">
            <span className="font-bold">Esto es una vista previa.</span>{' '}
            Los documentos que se ven aquí son los que pasarían al portal del
            cliente. Hoy las URLs de Storage son accesibles con el enlace
            directo; esta marca es una convención de la interfaz, no un control
            de acceso.
          </p>
        </div>
      </div>
    </div>
  );
}

function FechaCampo({ label, valor }: { label: string; valor?: string }) {
  return (
    <div>
      <span className="block text-[9px] font-bold text-gray-400 uppercase">{label}</span>
      <span className="text-xs font-semibold text-gray-700">{valor || '—'}</span>
    </div>
  );
}

function FilaDocCliente({ doc }: { doc: EmbarqueDocumento }) {
  const sinArchivo = !doc.storagePath && (doc.url === '#' || doc.url.startsWith('blob:'));
  const regla = reglaDeTipo(doc.tipo);

  return (
    <div className="px-4 py-3 flex items-center gap-3 bg-white">
      <FileText className="w-4 h-4 text-gray-400 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-800 truncate">{doc.nombre}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {etiquetaTipoDocumento(doc.tipo)} · {doc.fechaCarga}
          {regla.clase === 'sensible' && (
            <span className="text-amber-600 font-bold ml-1">· sensible</span>
          )}
        </p>
      </div>
      {!sinArchivo && (
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
          title="Ver documento"
        >
          <Eye className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

function EventoCliente({ evt }: { evt: EmbarqueEvento }) {
  return (
    <div className="relative">
      <div className="absolute -left-[22px] top-1.5 w-2.5 h-2.5 rounded-full bg-white border-2 border-primario ring-3 ring-white" />
      <div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <h4 className="text-xs font-bold text-[#18181B]">{evt.titulo}</h4>
          <span className="text-[10px] text-gray-400 font-semibold tabular-nums ml-auto">{evt.fecha}</span>
        </div>
        {evt.descripcion && (
          <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{evt.descripcion}</p>
        )}
      </div>
    </div>
  );
}
