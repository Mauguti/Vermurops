/**
 * DocumentosOC.tsx — Tarea 63
 *
 * Los documentos de la orden de compra, con un solo botón que los clasifica.
 *
 * Es donde por fin caben los COMPLEMENTOS DE PAGO del proveedor: el CFDI que
 * emite después de cobrar y que hoy se quedaba en el correo de
 * Administración, sin lugar en la plataforma. Junto a ellos viven la factura,
 * el comprobante de pago y la cotización del proveedor.
 *
 * `facturaArchivos` (tarea 55) NO se toca: ahí sigue el PDF y el XML con
 * parseo de CFDI y cotejo contra el monto. Esto es la lista de todo lo demás,
 * y de los que llegan de a varios.
 */

import React, { useState } from 'react';
import { FileText, ExternalLink, AlertTriangle } from 'lucide-react';
import SubirDocumentosLote from '../documentos/SubirDocumentosLote';
import { useSubidaClasificada } from '../../hooks/useSubidaClasificada';
import { useAuth } from '../../auth/AuthContext';
import {
  DOCUMENTOS_OC, etiquetaDocOC, textoCorreccionTipo, observacionesConCorreccion,
  type LineaLote,
} from '../../lib/loteDocumentos';
import { traducirAviso } from '../../lib/clasificacionDocumentos';
import type { OrdenCompra, DocumentoOC } from './OrdenesCompraData';

interface Props {
  oc: OrdenCompra;
  /** admin, administracion y operaciones. */
  puedeCargar: boolean;
  /** La OC terminó (pagada o rechazada): no se suben más documentos. */
  terminada: boolean;
  onActualizar: (cambios: Partial<OrdenCompra>) => void;
}

export default function DocumentosOC({
  oc, puedeCargar, terminada, onActualizar,
}: Props) {
  const { subirYClasificar } = useSubidaClasificada();
  const { user } = useAuth();
  const usuario = user?.email ?? user?.nombre ?? '';
  const [error, setError] = useState<string | null>(null);

  const documentos = oc.documentos ?? [];

  const guardar = async (lineas: LineaLote[]) => {
    const ahora = new Date().toISOString();
    const nuevos: DocumentoOC[] = lineas.map((l, i) => {
      const correccion = l.corregidoAMano
        ? textoCorreccionTipo({
            tipoCrudo: l.tipoCrudo,
            tipoFinal: l.tipoElegido!,
            por: usuario,
            fecha: ahora,
            etiqueta: etiquetaDocOC,
          })
        : null;
      return {
        id: `doc-${Date.now()}-${i}`,
        tipo: l.tipoElegido!,
        nombre: l.nombre || l.nombreArchivo,
        storagePath: l.storagePath,
        url: l.url,
        tipoCrudo: l.tipoCrudo || undefined,
        confianza: l.confianza,
        avisos: l.avisos.length > 0 ? l.avisos : undefined,
        observaciones: observacionesConCorreccion(l.observaciones, correccion),
        subidoPor: usuario,
        fecha: ahora,
      };
    });
    // Aditivo: la lista se concatena. Un documento subido no se reemplaza —
    // la evidencia de un pago no se edita.
    onActualizar({ documentos: [...documentos, ...nuevos] });
  };

  if (!puedeCargar && documentos.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
      <h4 className="text-[10px] font-bold text-primario uppercase tracking-widest border-b border-gray-100 pb-2">
        Documentos de la orden
      </h4>

      {error && (
        <div className="border border-red-200 bg-red-50 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-600" />
          <p className="text-[11px] text-red-700">{error}</p>
        </div>
      )}

      {documentos.length === 0 ? (
        <p className="text-[11px] text-gray-400">
          Sin documentos. Aquí van el complemento de pago, el comprobante de la
          transferencia y la cotización del proveedor.
        </p>
      ) : (
        <div className="space-y-2">
          {documentos.map(d => (
            <div key={d.id} className="border border-card-border rounded-lg px-3 py-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-brand hover:underline flex items-center gap-1"
                  >
                    <FileText className="w-3 h-3 shrink-0" />
                    {d.nombre}
                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  </a>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    {d.fecha.slice(0, 10)}
                    {d.subidoPor && ` · ${d.subidoPor}`}
                  </p>
                  {d.observaciones && (
                    <p className="text-[10px] text-text-muted mt-0.5">{d.observaciones}</p>
                  )}
                  {(d.avisos ?? []).map(a => (
                    <p key={a} className="text-[10px] text-amber-700 flex items-start gap-1 mt-0.5">
                      <AlertTriangle className="w-3 h-3 mt-px shrink-0" />
                      {traducirAviso(a)}
                    </p>
                  ))}
                </div>
                <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primario/10 text-primario">
                  {etiquetaDocOC(d.tipo)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {puedeCargar && !terminada && (
        <SubirDocumentosLote
          catalogo={DOCUMENTOS_OC}
          etiqueta={etiquetaDocOC}
          procesar={async file => {
            setError(null);
            return subirYClasificar(file, {
              flujo: 'documento-oc',
              capacidad: 'ordenCompra.solicitar',
              // La regla de Storage que existe para la orden es la de
              // `factura/`, y acepta solo PDF y XML (documentos fiscales,
              // sin update ni delete). Una carpeta `documentos/` necesita su
              // propia regla: el bloque exacto está en el reporte de la 63.
              storageBasePath: `ordenesCompra/${oc.id}/factura`,
              campos: {
                proveedorNombre: oc.proveedorNombre,
                folioOC: oc.folio,
                montoOC: String(oc.monto),
                monedaOC: oc.moneda,
              },
            });
          }}
          puedeSubir
          onGuardar={guardar}
          accept=".pdf,.xml"
          ayuda="Varios a la vez (PDF o XML). El agente propone el tipo de cada uno y tú confirmas."
        />
      )}
    </div>
  );
}
