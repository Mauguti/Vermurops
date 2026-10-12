/**
 * useContratoCotizacion.ts (tarea 102)
 *
 * Sube el contrato de una cotización ganada a Storage y devuelve la cotización
 * con el contrato y su entrada de historial. NO escribe en Firestore: la ficha
 * trabaja con una copia local de la cotización (solo adopta la del listener al
 * cambiar de versión), así que quien escribe tiene que ser su `onUpdateQuote`,
 * igual que las notas. Un `updateDoc` directo dejaría la pantalla sin ver el
 * contrato y el siguiente autoguardado lo pisaría con la copia vieja.
 *
 * Un reemplazo deja la versión anterior como entrada en `actividades`; el
 * archivo viejo se queda en Storage (la regla no deja borrar).
 */
import { useState } from 'react';
import { storage } from '../firebase';
import { ref, uploadBytes } from 'firebase/storage';
import { useAuth } from '../auth/AuthContext';
import { puede } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { conAviso } from '../lib/erroresEscritura';
import type { KanbanQuote, QuoteActivity } from '../components/quotes/QuotesData';
import {
  problemaArchivoContrato, rutaStorageContrato, textoReemplazoContrato,
} from '../lib/contratoCotizacion';

/** Quien solicita o cotiza (Ventas, Pricing, admin) maneja el contrato. */
export function puedeManejarContrato(rol: UserRole | undefined | null): boolean {
  return puede(rol, 'cotizacion.solicitar') || puede(rol, 'cotizacion.crear');
}

function entradaHistorial(quote: KanbanQuote, titulo: string, descripcion: string, fecha: string): QuoteActivity {
  return {
    id: `act-contrato-${Date.now()}`,
    titulo, descripcion,
    responsableId: quote.vendedorId,
    fechaLimite: fecha.split(' ')[0],
    estado: 'hecha', tipo: 'nota', createdAt: fecha,
  };
}

export function useContratoCotizacion(onUpdateQuote: (q: KanbanQuote) => void) {
  const { user } = useAuth();
  const [trabajando, setTrabajando] = useState(false);
  const quien = user?.email ?? user?.nombre ?? '';
  const rol = user?.rol as UserRole | undefined;

  const subir = async (quote: KanbanQuote, archivo: File, firmado: boolean) => {
    if (!puedeManejarContrato(rol)) throw new Error('Tu rol no puede subir el contrato.');
    if (quote.etapa !== 'ganada') throw new Error('El contrato se sube cuando la cotización está ganada.');
    const problema = problemaArchivoContrato(archivo);
    if (problema) throw new Error(problema);
    setTrabajando(true);
    try {
      const ahora = new Date().toISOString();
      const fecha = ahora.slice(0, 16).replace('T', ' ');
      const storagePath = rutaStorageContrato(quote.id, archivo.name, ahora);
      await conAviso('el contrato', () =>
        uploadBytes(ref(storage, storagePath), archivo, archivo.type ? { contentType: archivo.type } : undefined));
      const contrato = { storagePath, nombreArchivo: archivo.name, subidoPor: quien, subidoEn: ahora, firmado };
      const anterior = quote.contrato ?? null;
      const entrada = anterior
        ? entradaHistorial(quote, 'Contrato reemplazado', textoReemplazoContrato(anterior, archivo.name), fecha)
        : entradaHistorial(quote, 'Contrato subido', `«${archivo.name}» (${firmado ? 'firmado' : 'sin firmar'}) por ${quien}.`, fecha);
      onUpdateQuote({ ...quote, contrato, actividades: [...quote.actividades, entrada], updatedAt: fecha });
    } finally { setTrabajando(false); }
  };

  const marcarFirmado = async (quote: KanbanQuote, firmado: boolean) => {
    if (!puedeManejarContrato(rol)) throw new Error('Tu rol no puede marcar el contrato.');
    if (!quote.contrato) throw new Error('Primero sube el contrato.');
    const fecha = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const entrada = entradaHistorial(quote, firmado ? 'Contrato marcado como firmado' : 'Contrato marcado como sin firmar',
      `«${quote.contrato.nombreArchivo}» por ${quien}.`, fecha);
    onUpdateQuote({ ...quote, contrato: { ...quote.contrato, firmado }, actividades: [...quote.actividades, entrada], updatedAt: fecha });
  };

  return { trabajando, subir, marcarFirmado };
}
