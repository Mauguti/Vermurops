/**
 * useDocumentosTarifario.ts
 *
 * Sube el documento y —opcionalmente— lo manda al extractor (TA-3 / MC-6).
 *
 * Una sola subida, dos usos: el archivo queda en Storage como EVIDENCIA y su
 * contenido va al agente para extraer las TARIFAS. No son dos sistemas de
 * adjuntos.
 */

import { useState, useEffect } from 'react';
import { db, storage } from '../firebase';
import { collection, doc, onSnapshot, setDoc, updateDoc, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import {
  DocumentoTarifario, validarArchivo, rutaStorage, tipoDeArchivo,
} from '../lib/documentoTarifario';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { conAviso, reportarErrorEscritura } from '../lib/erroresEscritura';

const COL = 'documentosTarifario';

/** Endpoint de la Cloud Function que hace de proxy hacia n8n. */
const URL_EXTRACTOR =
  'https://us-central1-vermur-logistics-app.cloudfunctions.net/extraerTarifas';

/** SHA-256 del contenido, para detectar que el mismo archivo ya se procesó. */
async function hashArchivo(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface ResultadoSubida {
  documento: DocumentoTarifario;
  /** Respuesta cruda del extractor. null si no se procesó con IA. */
  extraccion: unknown | null;
  /** Documento con el mismo hash que ya se había subido. */
  duplicadoDe?: DocumentoTarifario;
}

export function useDocumentosTarifario(cotizacionId?: string) {
  const { user } = useAuth();
  const [documentos, setDocumentos] = useState<DocumentoTarifario[]>([]);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const unsub = onSnapshot(
      query(collection(db, COL), orderBy('fechaSubida', 'desc')),
      snap => {
        const data: DocumentoTarifario[] = [];
        snap.forEach(d => data.push({ id: d.id, ...d.data() } as DocumentoTarifario));
        setDocumentos(cotizacionId ? data.filter(x => x.cotizacionId === cotizacionId) : data);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [user, cotizacionId]);

  /**
   * Sube el documento.
   *
   * `procesarConIA` en false lo deja como respaldo: no todo documento es un
   * tarifario, a veces es solo la evidencia de dónde salió un costo.
   */
  const subirDocumento = async (
    file: File,
    opciones: { procesarConIA: boolean; cotizacionId?: string | null } = { procesarConIA: true },
  ): Promise<ResultadoSubida> => {
    exigir(user?.rol as UserRole | undefined, 'tarifario.cargar');

    const v = validarArchivo(file.name, file.type, file.size);
    if (!v.valido) throw new Error(v.motivo);

    setSubiendo(true);
    try {
      const hash = await hashArchivo(file);
      const duplicadoDe = documentos.find(d => d.hash === hash);

      const id = `doc-${Date.now()}-${hash.slice(0, 8)}`;
      const path = rutaStorage(id, file.name);

      const refStorage = ref(storage, path);
      await uploadBytes(refStorage, file, { contentType: file.type || undefined });
      const url = await getDownloadURL(refStorage);

      const documento: DocumentoTarifario = {
        id, path, url, hash,
        nombreArchivo: file.name,
        tipo: tipoDeArchivo(file.type, file.name),
        tipoMime: file.type || 'application/octet-stream',
        tamanoBytes: file.size,
        subidoPor: user?.uid ?? '',
        subidoPorNombre: user?.nombre ?? user?.email ?? '',
        fechaSubida: new Date().toISOString(),
        cotizacionId: opciones.cotizacionId ?? null,
        importacionId: null,
        tarifasExtraidas: 0,
        procesadoConIA: opciones.procesarConIA,
      };

      await conAviso('el documento', () =>
        setDoc(doc(db, COL, id), sanitizarParaFirestore(documento)));

      if (!opciones.procesarConIA) {
        return { documento, extraccion: null, duplicadoDe };
      }

      const extraccion = await extraer(file);
      return { documento, extraccion, duplicadoDe };
    } finally {
      setSubiendo(false);
    }
  };

  /** Llama a la Function, que valida la sesión y reenvía a n8n con el secreto. */
  const extraer = async (file: File): Promise<unknown> => {
    const token = await getAuth().currentUser?.getIdToken();
    if (!token) throw new Error('No hay sesión activa.');

    const form = new FormData();
    form.append('archivo', file, file.name);

    const res = await fetch(URL_EXTRACTOR, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (cuerpo as { error?: string })?.error
        ?? `El extractor respondió con error ${res.status}.`;
      reportarErrorEscritura('la extracción de tarifas', new Error(msg));
      throw new Error(msg);
    }
    return cuerpo;
  };

  /** Enlaza el documento con la importación y cuántas tarifas produjo. */
  const registrarExtraccion = async (
    documentoId: string, importacionId: string, tarifas: number,
  ): Promise<void> => {
    await conAviso('el documento', () =>
      updateDoc(doc(db, COL, documentoId), sanitizarParaFirestore({
        importacionId, tarifasExtraidas: tarifas,
      }) as Record<string, unknown>));
  };

  return { documentos, loading, subiendo, subirDocumento, registrarExtraccion };
}
