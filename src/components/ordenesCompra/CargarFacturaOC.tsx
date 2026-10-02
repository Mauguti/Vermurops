/**
 * CargarFacturaOC — subida de factura (PDF y XML) en la ficha de la OC.
 *
 * Tarea 55: en las OC de oficina es la ÚNICA vía para asociar la factura.
 * En las de embarque complementa el flujo del clasificador.
 *
 * Si viene el XML (CFDI 4.0), se lee en la app sin n8n: UUID, RFC del
 * emisor, fecha, moneda, subtotal, IVA, retenciones y total. Se precarga
 * facturaDatos (editable) y se muestran avisos de RFC, total y UUID
 * duplicado.
 */

import React, { useState, useRef } from 'react';
import { Upload, FileText, ExternalLink, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase';
import { parsearCFDI, avisosCFDI, cotejarTotal, type DatosCFDI, type AvisoCFDI } from '../../lib/parsearCFDI';
import type { OrdenCompra, ArchivoFacturaOC } from './OrdenesCompraData';

interface Props {
  oc: OrdenCompra;
  /** RFC del proveedor para validar contra el emisor del CFDI. */
  rfcProveedor: string | null | undefined;
  /** UUIDs de facturas ya asociadas a otras OCs, para detectar duplicados. */
  uuidsExistentes: string[];
  /** ¿Puede cargar archivos? (admin, administracion, operaciones). */
  puedeCargar: boolean;
  /** La OC terminó (pagada/rechazada): no se puede cargar. */
  terminada: boolean;
  /** Callback al completar la carga. */
  onFacturaCargada: (cambios: Partial<OrdenCompra>) => void;
}

export default function CargarFacturaOC({
  oc, rfcProveedor, uuidsExistentes, puedeCargar, terminada, onFacturaCargada,
}: Props) {
  const [subiendo, setSubiendo] = useState<'pdf' | 'xml' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<AvisoCFDI[]>([]);
  const [datosCFDI, setDatosCFDI] = useState<DatosCFDI | null>(null);
  const inputPDF = useRef<HTMLInputElement>(null);
  const inputXML = useRef<HTMLInputElement>(null);

  const archivos = oc.facturaArchivos;

  const subirArchivo = async (
    file: File,
    tipo: 'pdf' | 'xml',
  ) => {
    setSubiendo(tipo);
    setError(null);
    try {
      const nombre = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `ordenesCompra/${oc.id}/factura/${Date.now()}-${nombre}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      const archivo: ArchivoFacturaOC = {
        storagePath: path,
        url,
        nombre: file.name,
        subidoPor: '', // se llena desde el caller
        fecha: new Date().toISOString(),
      };

      const cambios: Partial<OrdenCompra> = {
        facturaArchivos: {
          ...(oc.facturaArchivos ?? {}),
          [tipo]: archivo,
        },
      };

      // Si es XML, parsearlo
      if (tipo === 'xml') {
        const texto = await file.text();
        const resultado = parsearCFDI(texto);
        if (resultado.ok === false) {
          setError(resultado.error);
          // Se sube igual como archivo aunque no se parsee
        } else {
          const datos = resultado.datos;
          setDatosCFDI(datos);

          // Generar avisos
          const avs = avisosCFDI(datos, oc, rfcProveedor, uuidsExistentes);
          setAvisos(avs);

          // Precargar facturaDatos
          cambios.facturaDatos = {
            numero: datos.uuid.slice(0, 8),
            fecha: datos.fecha.slice(0, 10),
            emisor: datos.nombreEmisor || datos.rfcEmisor,
            total: datos.total,
            subtotal: datos.subtotal,
            iva: datos.ivaTrasladado,
            tasaIVA: datos.tasaIVA,
            retencion: datos.retenciones,
            moneda: datos.moneda,
            documentoId: '',
            cotejo: cotejarTotal(datos.total, oc.monto, datos.moneda, oc.moneda),
          };
          cambios.facturaUUID = datos.uuid;
          cambios.facturaRfcEmisor = datos.rfcEmisor;

          // También actualizar facturaAsociada con info legible
          cambios.facturaAsociada = `${datos.uuid.slice(0, 8)} · ${datos.fecha.slice(0, 10)} · ${datos.nombreEmisor || datos.rfcEmisor}`;
        }
      }

      onFacturaCargada(cambios);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir el archivo.');
    } finally {
      setSubiendo(null);
    }
  };

  const handlePDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await subirArchivo(file, 'pdf');
  };

  const handleXML = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await subirArchivo(file, 'xml');
  };

  if (!puedeCargar && !archivos?.pdf && !archivos?.xml) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-[10px] font-bold text-primario uppercase tracking-widest border-b border-gray-100 pb-2">
        Factura del proveedor
      </h4>

      <input ref={inputPDF} type="file" accept=".pdf" className="hidden" onChange={handlePDF} />
      <input ref={inputXML} type="file" accept=".xml" className="hidden" onChange={handleXML} />

      {error && (
        <div className="border border-red-200 bg-red-50 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-600" />
          <p className="text-[11px] text-red-700">{error}</p>
        </div>
      )}

      {/* Avisos (RFC, total, UUID) */}
      {avisos.map((a, i) => (
        <div key={i} className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
          <p className="text-[11px] text-amber-800">{a.mensaje}</p>
        </div>
      ))}

      {/* Datos extraídos del CFDI */}
      {datosCFDI && (
        <div className="border border-emerald-200 bg-emerald-50/40 rounded-lg px-3 py-2.5 space-y-1">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <p className="text-[11px] font-semibold text-emerald-800">Datos extraídos del CFDI</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[11px] text-gray-700 pl-5">
            <span>UUID: <span className="font-mono text-[10px]">{datosCFDI.uuid.slice(0, 8)}…</span></span>
            <span>RFC: {datosCFDI.rfcEmisor}</span>
            <span>Emisor: {datosCFDI.nombreEmisor || '—'}</span>
            <span>Subtotal: {datosCFDI.moneda} {datosCFDI.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            <span>IVA: {datosCFDI.ivaTrasladado != null ? `${datosCFDI.moneda} ${datosCFDI.ivaTrasladado.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}</span>
            <span>Total: {datosCFDI.moneda} {datosCFDI.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            {datosCFDI.retenciones != null && (
              <span>Retenciones: {datosCFDI.moneda} {datosCFDI.retenciones.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            )}
          </div>
        </div>
      )}

      {/* Archivos cargados + botones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* PDF */}
        <div className="border rounded-lg px-3 py-2.5 border-card-border">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">PDF</p>
          {archivos?.pdf ? (
            <div className="space-y-1">
              <a
                href={archivos.pdf.url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-brand hover:underline flex items-center gap-1"
              >
                <FileText className="w-3 h-3" />
                {archivos.pdf.nombre}
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
              <p className="text-[10px] text-gray-400">
                {archivos.pdf.fecha.slice(0, 10)}
              </p>
            </div>
          ) : (
            <p className="text-[10px] text-gray-400">Sin archivo PDF.</p>
          )}
          {puedeCargar && !terminada && (
            <button
              type="button"
              disabled={!!subiendo}
              onClick={() => inputPDF.current?.click()}
              className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-brand hover:text-brand-hover disabled:opacity-50"
            >
              {subiendo === 'pdf'
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Subiendo…</>
                : <><Upload className="w-3 h-3" /> {archivos?.pdf ? 'Reemplazar PDF' : 'Subir PDF'}</>}
            </button>
          )}
        </div>

        {/* XML */}
        <div className="border rounded-lg px-3 py-2.5 border-card-border">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">XML (CFDI)</p>
          {archivos?.xml ? (
            <div className="space-y-1">
              <a
                href={archivos.xml.url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-brand hover:underline flex items-center gap-1"
              >
                <FileText className="w-3 h-3" />
                {archivos.xml.nombre}
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
              <p className="text-[10px] text-gray-400">
                {archivos.xml.fecha.slice(0, 10)}
              </p>
            </div>
          ) : (
            <p className="text-[10px] text-gray-400">Sin archivo XML.</p>
          )}
          {puedeCargar && !terminada && (
            <button
              type="button"
              disabled={!!subiendo}
              onClick={() => inputXML.current?.click()}
              className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-brand hover:text-brand-hover disabled:opacity-50"
            >
              {subiendo === 'xml'
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Subiendo…</>
                : <><Upload className="w-3 h-3" /> {archivos?.xml ? 'Reemplazar XML' : 'Subir XML'}</>}
            </button>
          )}
        </div>
      </div>

      {!archivos?.xml && puedeCargar && !terminada && (
        <p className="text-[10px] text-gray-400">
          Al subir el XML del CFDI se extraen automáticamente los datos fiscales.
          Si solo viene el PDF, los datos se capturan a mano.
        </p>
      )}
    </div>
  );
}
