// ─────────────────────────────────────────────────────────────────────────────
// notificationsStore.ts — Modelo de datos del centro de notificaciones
// ─────────────────────────────────────────────────────────────────────────────

import { UserRole } from '../auth/users';

export type NotificacionTipo = 'cambio_etapa' | 'chat';

export interface Notificacion {
  id: string;
  tipo: NotificacionTipo;
  titulo?: string; // Para cambio de etapa
  mensaje?: string; // Para cambio de etapa
  cotizacionId: string;
  cotizacionFolio?: string; // Para chat
  etapaAnterior?: string;
  etapaNueva?: string;
  destinatarios: UserRole[]; // Legacy, o para roles genéricos
  destinatarioId?: string; // Específico para chat (uid)
  remitenteNombre?: string; // Para chat
  preview?: string; // Para chat
  leida: boolean;
  fecha?: string; // ISO timestamp
  timestamp?: string; // Para chat
}

// ─── Reglas de destinatarios por etapa nueva ─────────────────────────────────

export const DESTINATARIOS_POR_ETAPA: Record<string, UserRole[]> = {
  solicitado_pricing:       ['pricing'],
  pricing_solicitando:      ['pricing'],
  cotizaciones_recibidas:   ['pricing'],
  consolidada:              ['ventas'],
  enviada_cliente:          ['ventas'],
  negociacion:              ['ventas'],
  ganada:                   ['ventas', 'admin'],
  perdida:                  ['ventas', 'admin'],
};

// ─── Helper para crear notificación de cambio de etapa ───────────────────────

export function crearNotificacionEtapa(
  cotizacionId: string,
  empresa: string,
  etapaAnterior: string,
  etapaNueva: string,
  etapaAnteriorLabel: string,
  etapaNuevaLabel: string
): Notificacion | null {
  const destinatarios = DESTINATARIOS_POR_ETAPA[etapaNueva];
  if (!destinatarios) return null;

  return {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tipo: 'cambio_etapa',
    titulo: 'CRM · Nueva etapa asignada',
    mensaje: `${empresa} (${cotizacionId}) pasó de '${etapaAnteriorLabel}' a '${etapaNuevaLabel}'`,
    cotizacionId,
    etapaAnterior,
    etapaNueva,
    destinatarios,
    leida: false,
    fecha: new Date().toISOString(),
  };
}

// ─── Helper de tiempo relativo ────────────────────────────────────────────────

export function tiempoRelativo(fecha: string): string {
  const diff = Date.now() - new Date(fecha).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} ${hr === 1 ? 'hora' : 'horas'}`;
  const days = Math.floor(hr / 24);
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

// ─── Notificaciones mock iniciales ────────────────────────────────────────────

const now = new Date();

/**
 * Sin notificaciones de ejemplo (Bloque 6, 25-sep-2026).
 *
 * Eran cuatro `notif-mock-*` de cotizaciones de demostración y TODO el
 * equipo de Vermur las veía en la campanita, en producción, desde el primer
 * día. La lista local arranca vacía: lo que se vea en la campanita ocurrió
 * de verdad.
 *
 * ⚠️ Las notificaciones por ROL siguen viviendo solo en memoria del
 * navegador que las crea (§6): con la lista vacía, la campanita queda en
 * blanco hasta que persistan. Es lo correcto —mejor vacía que mintiendo— y
 * se resuelve con Usuarios y roles.
 */
export const INITIAL_NOTIFICATIONS: Notificacion[] = [];
