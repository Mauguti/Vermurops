/**
 * usePdfCotizacion.ts (Bloque 1)
 *
 * Genera el PDF de la cotización: arma el payload, lo manda al generador
 * por la Cloud Function (el webhook de n8n nunca se llama desde el
 * navegador), descarga el archivo con su nombre, y lo guarda en Storage
 * como evidencia ligada a la versión de la cotización.
 *
 * Una generación, dos usos: lo que se descargó es exactamente lo que quedó
 * guardado. Si mañana el cliente reclama «me cotizaron otra cosa», el PDF
 * de esa versión está.
 */

import { useState } from 'react';
import { db, storage } from '../firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { conAviso } from '../lib/erroresEscritura';
import type { KanbanQuote, PdfCotizacion } from '../components/quotes/QuotesData';
import {
  armarPayloadPdf, nombreArchivoPdf, rutaStoragePdf, type OpcionesPdf,
} from '../lib/pdfCotizacion';
import { numeroVersionActual } from '../lib/versionesCotizacion';
import { idUnico } from '../lib/idUnico';

const URL_CLASIFICADOR =
  'https://us-central1-vermur-logistics-app.cloudfunctions.net/clasificarDocumento';

export function usePdfCotizacion() {
  const { user } = useAuth();
  const [generando, setGenerando] = useState(false);

  const generar = async (
    quote: KanbanQuote,
    opciones: Omit<OpcionesPdf, 'hoy' | 'contacto'>,
  ): Promise<PdfCotizacion> => {
    exigir(user?.rol as UserRole | undefined, 'cotizacion.crear');
    setGenerando(true);
    try {
      const ahora = new Date().toISOString();
      const payload = armarPayloadPdf(quote, {
        ...opciones,
        hoy: ahora.slice(0, 10),
        contacto: [user?.nombre, user?.email].filter(Boolean).join(' · '),
      });

      const token = await getAuth().currentUser?.getIdToken();
      if (!token) throw new Error('No hay sesión activa.');

      const res = await fetch(URL_CLASIFICADOR, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Vermur-Flujo': 'pdf-cotizacion',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const cuerpo = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(cuerpo?.error ?? `El generador respondió con error ${res.status}.`);
      }
      const blob = await res.blob();
      if (blob.size === 0) throw new Error('El generador devolvió un archivo vacío.');

      // 1 · Descarga con el nombre que el cliente va a ver.
      const nombreArchivo = nombreArchivoPdf(quote, opciones.idioma);
      const urlLocal = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = urlLocal; a.download = nombreArchivo; a.click();
      setTimeout(() => URL.revokeObjectURL(urlLocal), 10_000);

      // 2 · Evidencia en Storage, ligada a la versión.
      const storagePath = rutaStoragePdf(quote, opciones.idioma, ahora);
      const refStorage = ref(storage, storagePath);
      await uploadBytes(refStorage, blob, { contentType: 'application/pdf' });
      const url = await getDownloadURL(refStorage);

      const registro: PdfCotizacion = {
        id: idUnico('PDF'),
        version: numeroVersionActual(quote),
        idioma: opciones.idioma,
        nombreArchivo, storagePath, url,
        generadoPor: { uid: user?.uid ?? '', nombre: user?.nombre ?? user?.email ?? '' },
        fecha: ahora,
        plantillaVersionId: null,
      };
      // arrayUnion y no la cotización entera: una ganada está congelada y
      // el PDF es evidencia, no edición.
      await conAviso('el registro del PDF', () =>
        updateDoc(doc(db, 'cotizaciones', quote.id), { pdfs: arrayUnion(sanitizarParaFirestore(registro)) }));

      return registro;
    } finally {
      setGenerando(false);
    }
  };

  return { generando, generar };
}
