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
  type EstadoExtraccion,
} from '../lib/documentoTarifario';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { conAviso, reportarErrorEscritura } from '../lib/erroresEscritura';
import { medirTarifarioCargado } from '../lib/analitica';

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

/** Lo que se sabe de un archivo ANTES de subirlo. */
export interface Duplicado {
  /** Mismo contenido: el hash coincide. No hay duda. */
  porHash?: DocumentoTarifario;
  /** Mismo nombre y tamaño: casi seguro el mismo, pero pudo editarse. */
  porNombre?: DocumentoTarifario;
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
   * ¿Este archivo ya está? Se pregunta ANTES de subir.
   *
   * Antes el aviso llegaba DESPUÉS de haber subido y llamado al extractor —que
   * cuesta dinero y tiempo—, y decía «se guardó de todos modos». En la
   * auditoría hay la misma captura cinco veces y el mismo PDF cuatro: gente
   * reintentando sin saber si había servido. Avisar antes es la diferencia
   * entre prevenir el duplicado y contarlo.
   */
  const buscarDuplicado = async (file: File): Promise<Duplicado> => {
    const hash = await hashArchivo(file);
    return {
      porHash: documentos.find(d => d.hash === hash),
      porNombre: documentos.find(d =>
        d.hash !== hash && d.nombreArchivo === file.name && d.tamanoBytes === file.size),
    };
  };

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

      // Cuántos tarifarios pasan por la IA y cuántas tarifas propuso. Del
      // documento no viaja nada: ni nombre, ni proveedor, ni montos.
      try {
        const extraccion = await extraer(file);
        const propuestas = (extraccion as { tarifas?: unknown[] } | null)?.tarifas;
        const cuantas = Array.isArray(propuestas) ? propuestas.length : 0;
        medirTarifarioCargado('exito', cuantas);

        /*
         * Contestar no es lo mismo que traer tarifas. n8n puede devolver 200
         * con cero líneas —un documento que no es tarifario, una factura— y
         * eso hay que decirlo y dejarlo escrito, no dejar el documento en
         * cero como si nadie lo hubiera tocado.
         */
        const ok = (extraccion as { ok?: boolean } | null)?.ok === true && cuantas > 0;
        await marcarExtraccion(id, ok ? 'ok' : 'sin_tarifas', ok ? undefined
          : razonSinTarifas(extraccion));

        return {
          documento: { ...documento, estadoExtraccion: ok ? 'ok' : 'sin_tarifas' },
          extraccion,
          duplicadoDe,
        };
      } catch (err) {
        medirTarifarioCargado('error');
        // Lo que NO pasaba antes: que el fallo quedara escrito. Un tarifario
        // que falla se veía idéntico a uno que nadie guardó.
        const motivo = err instanceof Error ? err.message : String(err);
        await marcarExtraccion(id, 'fallo', motivo);
        throw err;
      }
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

  /**
   * Deja escrito cómo terminó la extracción.
   *
   * No usa `conAviso`: si esta escritura falla, lo que importa es el error
   * original, no un segundo aviso encima. Se registra en consola y ya.
   */
  const marcarExtraccion = async (
    documentoId: string, estado: EstadoExtraccion, motivo?: string,
  ): Promise<void> => {
    try {
      await updateDoc(doc(db, COL, documentoId), sanitizarParaFirestore({
        estadoExtraccion: estado,
        fechaExtraccion: new Date().toISOString(),
        ...(motivo ? { motivoExtraccion: motivo.slice(0, 500) } : {}),
      }) as Record<string, unknown>);
    } catch (e) {
      console.warn('[tarifario] no se pudo registrar el estado de la extracción', e);
    }
  };

  /**
   * Vuelve a intentar la extracción de un documento que ya está en Storage.
   *
   * No hace falta volver a buscar el archivo en la computadora: la evidencia
   * ya está guardada, que es justo para lo que sirve. Se baja de Storage y se
   * manda otra vez al extractor.
   */
  const reintentarExtraccion = async (d: DocumentoTarifario): Promise<unknown> => {
    exigir(user?.rol as UserRole | undefined, 'tarifario.cargar');
    setSubiendo(true);
    try {
      const r = await fetch(d.url);
      if (!r.ok) throw new Error('No se pudo recuperar el archivo guardado.');
      const file = new File([await r.blob()], d.nombreArchivo, { type: d.tipoMime });

      try {
        const extraccion = await extraer(file);
        const propuestas = (extraccion as { tarifas?: unknown[] } | null)?.tarifas;
        const cuantas = Array.isArray(propuestas) ? propuestas.length : 0;
        const ok = (extraccion as { ok?: boolean } | null)?.ok === true && cuantas > 0;
        medirTarifarioCargado('exito', cuantas);
        await marcarExtraccion(d.id, ok ? 'ok' : 'sin_tarifas',
          ok ? undefined : razonSinTarifas(extraccion));
        return extraccion;
      } catch (err) {
        medirTarifarioCargado('error');
        await marcarExtraccion(d.id, 'fallo', err instanceof Error ? err.message : String(err));
        throw err;
      }
    } finally {
      setSubiendo(false);
    }
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

  return {
    documentos, loading, subiendo,
    buscarDuplicado, subirDocumento, reintentarExtraccion, registrarExtraccion,
  };
}

/**
 * Por qué una respuesta válida no trajo tarifas.
 *
 * El extractor contesta 200 aunque el documento no sea un tarifario. Decirlo
 * es la diferencia entre «reintenta» y «esto es una factura, va en otro lado».
 */
function razonSinTarifas(extraccion: unknown): string {
  const r = extraccion as { ok?: boolean; error?: string; tarifas?: unknown[] } | null;
  if (r?.ok === false) {
    return r.error?.trim()
      ? `El extractor no pudo procesarlo: ${r.error}`
      : 'El extractor no pudo procesar el archivo.';
  }
  if (Array.isArray(r?.tarifas) && r.tarifas.length === 0) {
    return 'El extractor no encontró ninguna tarifa. Puede que el documento no sea un tarifario —una factura, por ejemplo— o que la imagen no se lea.';
  }
  return 'El extractor contestó sin la lista de tarifas.';
}
