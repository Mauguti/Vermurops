import { useCallback, useState } from 'react';
import type { KanbanQuote } from '../components/quotes/QuotesData';
import { abrir, avanzar, recargar, type EstadoAdopcion } from '../lib/adopcionCotizacion';

/**
 * La cotización que pinta una ficha abierta (tarea 122, P4).
 *
 * Reemplazo directo de `alDiaConVersion`: `host` es la copia que guarda la
 * pantalla (cambia al abrir y en cada guardado) y `lista` la del listener.
 * Lo ajeno que la persona no tocó se adopta solo; lo que el mismo campo
 * cambió en las dos copias queda en `conflictos`. La lógica es pura y vive
 * en `lib/adopcionCotizacion.ts`; aquí solo se guarda el estado.
 */
export function useCotizacionAbierta(host: KanbanQuote, lista: readonly KanbanQuote[]) {
  const servidor = lista.find(q => q.id === host.id);
  const [estado, setEstado] = useState<EstadoAdopcion>(() => abrir(host, servidor));

  // Estado derivado durante el render (patrón de React): sin efectos ni parpadeo.
  const actual = host.id !== estado.id ? abrir(host, servidor) : avanzar(estado, host, servidor);
  if (actual !== estado) setEstado(actual);

  const recargarDelServidor = useCallback(
    () => setEstado(prev => recargar(prev, servidor)),
    [servidor],
  );

  return { quote: actual.abierta, conflictos: actual.conflictos, recargar: recargarDelServidor };
}
