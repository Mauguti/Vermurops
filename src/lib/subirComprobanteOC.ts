/**
 * subirComprobanteOC.ts — tarea 81
 *
 * Sube UN comprobante de pago a `ordenesCompra/{id}/documentos/`, la única
 * carpeta de la orden que acepta foto además de PDF (storage.rules, tarea 63).
 * No escribe en Firestore: quien llama decide a qué órdenes se liga.
 */
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

const TIPOS: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  heic: 'image/heic', heif: 'image/heif',
};

export async function subirComprobante(
  file: File,
  ordenId: string,
): Promise<{ storagePath: string; url: string; nombre: string }> {
  const limpio = file.name.replace(/[^\w.\-]/g, '_');
  const storagePath = `ordenesCompra/${ordenId}/documentos/${Date.now()}-${limpio}`;
  const r = ref(storage, storagePath);
  // Algunos navegadores no informan el tipo de un HEIC: se deduce de la extensión.
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  await uploadBytes(r, file, { contentType: file.type || TIPOS[ext] });
  return { storagePath, url: await getDownloadURL(r), nombre: file.name };
}
