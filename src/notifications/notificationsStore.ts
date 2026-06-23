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
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60000).toISOString();

export const INITIAL_NOTIFICATIONS: Notificacion[] = [
  {
    id: 'notif-mock-001',
    tipo: 'cambio_etapa',
    titulo: 'CRM · Nueva etapa asignada',
    mensaje: "Distribuidora Nacional (COT-2026-0002) pasó de 'Solicitud del cliente' a 'Solicitado a Pricing'",
    cotizacionId: 'COT-2026-0002',
    etapaAnterior: 'solicitud_cliente',
    etapaNueva: 'solicitado_pricing',
    destinatarios: ['pricing'],
    leida: false,
    fecha: ago(12),
  },
  {
    id: 'notif-mock-002',
    tipo: 'cambio_etapa',
    titulo: 'CRM · Nueva etapa asignada',
    mensaje: "Importadora del Golfo (COT-2026-0005) pasó de 'Cotizaciones de proveedor recibidas' a 'Cotización consolidada'",
    cotizacionId: 'COT-2026-0005',
    etapaAnterior: 'cotizaciones_recibidas',
    etapaNueva: 'consolidada',
    destinatarios: ['ventas'],
    leida: false,
    fecha: ago(45),
  },
  {
    id: 'notif-mock-003',
    tipo: 'cambio_etapa',
    titulo: 'CRM · Nueva etapa asignada',
    mensaje: "Industrias Metalúrgicas (COT-2026-0003) pasó de 'Solicitado a Pricing' a 'Pricing — Solicitando proveedores'",
    cotizacionId: 'COT-2026-0003',
    etapaAnterior: 'solicitado_pricing',
    etapaNueva: 'pricing_solicitando',
    destinatarios: ['pricing'],
    leida: true,
    fecha: ago(130),
  },
  {
    id: 'notif-mock-004',
    tipo: 'cambio_etapa',
    titulo: 'CRM · Nueva etapa asignada',
    mensaje: "Electrodomésticos Premium (COT-2026-0007) pasó de 'Enviada al cliente' a 'En negociación'",
    cotizacionId: 'COT-2026-0007',
    etapaAnterior: 'enviada_cliente',
    etapaNueva: 'negociacion',
    destinatarios: ['ventas'],
    leida: false,
    fecha: ago(60 * 6),
  },
];
