/**
 * useContratoCotizacion.ts (tarea 102)
 *
 * Sube el contrato de una cotización ganada a Storage y lo registra en la
 * cotización. Como el PDF, se escribe con updateDoc por campos y no con la
 * cotización entera: una ganada está congelada y el contrato es evidencia.
 * Un reemplazo deja la versión anterior como entrada en `actividades`; el
 * archivo viejo se queda en Storage (la regla no deja borrar).
 */
import { useState } from 'react';
import { db, storage } from '../firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { useAuth } from '../auth/AuthContext';
import { puede } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { conAviso } from '../lib/erroresEscritura';
import type { KanbanQuote, QuoteActivity } from '../components/quotes/QuotesData';
import {
  problemaArchivoContrato, rutaStorageContrato, textoReemplazoContrato,
} from '../lib/contratoCotizacion';

/** Quien solicita o cotiza (Ventas, Pricing, admin) maneja el contrato. */
export function puedeManejarContrato(rol: UserRole | undefined | null): boolean {
  return puede(rol, 'cotizacion.solicitar') || puede(rol, 'cotizacion.crear');
}

function entradaHistorial(quote: KanbanQuote, titulo: string, descripcion: string, ahora: string): QuoteActivity {
  const fecha = ahora.slice(0, 16).replace('T', ' ');
  return {
    id: `act-contrato-${Date.now()}`,
    titulo, descripcion,
    responsableId: quote.vendedorId,
    fechaLimite: fecha.split(' ')[0],
    estado: 'hecha', tipo: 'nota', createdAt: fecha,
  };
}

export function useContratoCotizacion() {
  const { user } = useAuth();
  const [trabajando, setTrabajando] = useState(false);
  const quien = user?.email ?? user?.nombre ?? '';

  const guardar = async (quote: KanbanQuote, campos: Record<string, unknown>) =>
    updateDoc(doc(db, 'cotizaciones', quote.id), campos);

  const subir = async (quote: KanbanQuote, archivo: File, firmado: boolean) => {
    if (!puedeManejarContrato(user?.rol as UserRole | undefined)) throw new Error('Tu rol no puede subir el contrato.');
    if (quote.etapa !== 'ganada') throw new Error('El contrato se sube cuando la cotización está ganada.');
    const problema = problemaArchivoContrato(archivo);
    if (problema) throw new Error(problema);
    setTrabajando(true);
    try {
      const ahora = new Date().toISOString();
      const storagePath = rutaStorageContrato(quote.id, archivo.name, ahora);
      await uploadBytes(ref(storage, storagePath), archivo, archivo.type ? { contentType: archivo.type } : undefined);
      const contrato = { storagePath, nombreArchivo: archivo.name, subidoPor: quien, subidoEn: ahora, firmado };
      const anterior = quote.contrato ?? null;
      const entrada = anterior
        ? entradaHistorial(quote, 'Contrato reemplazado', textoReemplazoContrato(anterior, archivo.name), ahora)
        : entradaHistorial(quote, 'Contrato subido', `«${archivo.name}» (${firmado ? 'firmado' : 'sin firmar'}) por ${quien}.`, ahora);
      await conAviso('el contrato', () => guardar(quote, {
        contrato: sanitizarParaFirestore(contrato), actividades: arrayUnion(sanitizarParaFirestore(entrada)), updatedAt: ahora,
      }));
    } finally { setTrabajando(false); }
  };

  const marcarFirmado = async (quote: KanbanQuote, firmado: boolean) => {
    if (!puedeManejarContrato(user?.rol as UserRole | undefined)) throw new Error('Tu rol no puede marcar el contrato.');
    if (!quote.contrato) throw new Error('Primero sube el contrato.');
    setTrabajando(true);
    try {
      const ahora = new Date().toISOString();
      const entrada = entradaHistorial(quote, firmado ? 'Contrato marcado como firmado' : 'Contrato marcado como sin firmar',
        `«${quote.contrato.nombreArchivo}» por ${quien}.`, ahora);
      await conAviso('el contrato', () => guardar(quote, {
        contrato: sanitizarParaFirestore({ ...quote.contrato, firmado }), actividades: arrayUnion(sanitizarParaFirestore(entrada)), updatedAt: ahora,
      }));
    } finally { setTrabajando(false); }
  };

  return { trabajando, subir, marcarFirmado };
}
