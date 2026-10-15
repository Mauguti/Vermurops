/**
 * Qué cotización persistir cuando un host (Kanban, Bandeja) devuelve la lista
 * completa. Antes se tomaba «la primera que cambió por referencia»: con la
 * lista entera como contrato, cualquier copia nueva de otra cotización la
 * habría escrito en lugar de la editada. Desde la 111 el host dice CUÁL
 * cambió (`anterior`) y aquí solo se busca por id.
 */
export interface ConId { id: string }

export type CambioDeLista<T extends ConId> =
  | { tipo: 'alta'; quote: T }
  | { tipo: 'cambio'; quote: T; anterior: T }
  | { tipo: 'sin_anterior' }
  | { tipo: 'nada' };

export function cambioDeLista<T extends ConId>(existentes: T[], nuevas: T[], anterior?: T): CambioDeLista<T> {
  const ids = new Set(existentes.map(q => q.id));
  const alta = nuevas.find(q => !ids.has(q.id));
  if (alta) return { tipo: 'alta', quote: alta };
  if (!anterior) return { tipo: 'sin_anterior' };
  const quote = nuevas.find(q => q.id === anterior.id);
  if (!quote || quote === anterior) return { tipo: 'nada' };
  return { tipo: 'cambio', quote, anterior };
}
