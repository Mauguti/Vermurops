import React, { useState } from 'react';
import { Bell, ArrowRight, CheckCheck, Inbox } from 'lucide-react';
import { useNotifications } from '../notifications/NotificationsContext';
import { tiempoRelativo } from '../notifications/notificationsStore';

type Filtro = 'todas' | 'no_leidas' | 'leidas';

export default function Notificaciones({ onNavigateToCRM }: { onNavigateToCRM?: () => void }) {
  const { notificaciones, marcarLeida, marcarTodasLeidas, conteoNoLeidas } = useNotifications();
  const [filtro, setFiltro] = useState<Filtro>('todas');

  const filtradas = notificaciones.filter(n => {
    if (filtro === 'no_leidas') return !n.leida;
    if (filtro === 'leidas') return n.leida;
    return true;
  });

  const handleClickNotif = (id: string) => {
    marcarLeida(id);
    if (onNavigateToCRM) onNavigateToCRM();
  };

  const tabs: { id: Filtro; label: string }[] = [
    { id: 'todas', label: 'Todas' },
    { id: 'no_leidas', label: 'No leídas' },
    { id: 'leidas', label: 'Leídas' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* ── Page header ── */}
      <div className="mb-[24px] flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-[24px] font-semibold text-text-primary tracking-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-brand" />
            Notificaciones
          </h2>
          <p className="text-[13px] text-text-secondary mt-[4px]">
            Historial completo de alertas del sistema.
          </p>
        </div>

        {conteoNoLeidas > 0 && (
          <button
            onClick={marcarTodasLeidas}
            className="flex items-center gap-2 text-[13px] font-medium text-text-secondary bg-white border border-card-border rounded-[8px] px-[14px] py-[8px] hover:bg-neutral-bg transition-colors shadow-sm shrink-0"
          >
            <CheckCheck className="w-4 h-4" />
            Marcar todas como leídas
          </button>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-0 border-b border-divider mb-[20px]">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFiltro(tab.id)}
            className={`px-[16px] py-[10px] text-[13px] font-medium border-b-[2px] transition-colors ${
              filtro === tab.id
                ? 'border-brand text-brand'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
            {tab.id === 'no_leidas' && conteoNoLeidas > 0 && (
              <span className="ml-[6px] bg-brand text-white text-[10px] font-black px-[6px] py-[1px] rounded-full">
                {conteoNoLeidas > 9 ? '9+' : conteoNoLeidas}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── List ── */}
      {filtradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-[80px] text-center">
          <div className="w-[72px] h-[72px] rounded-full bg-neutral-bg flex items-center justify-center mb-[16px]">
            <Inbox className="w-8 h-8 text-text-muted" />
          </div>
          <p className="text-[16px] font-semibold text-text-primary mb-[8px]">
            {filtro === 'no_leidas' ? 'Estás al día' : 'Sin notificaciones'}
          </p>
          <p className="text-[13px] text-text-secondary max-w-[280px]">
            {filtro === 'no_leidas'
              ? 'No tienes notificaciones pendientes. ¡Excelente trabajo!'
              : 'No hay notificaciones que mostrar con este filtro.'}
          </p>
        </div>
      ) : (
        <div className="space-y-[8px]">
          {filtradas.map(notif => (
            <NotifCard
              key={notif.id}
              notif={notif}
              expanded
              onClick={() => handleClickNotif(notif.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Shared notification card ─────────────────────────────────────────────────

export function NotifCard({
  notif,
  expanded = false,
  onClick,
}: {
  notif: import('../notifications/notificationsStore').Notificacion;
  expanded?: boolean;
  onClick?: () => void;
  key?: React.Key;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-[10px] px-[16px] py-[14px] border transition-colors group ${
        notif.leida
          ? 'bg-white border-card-border hover:bg-neutral-bg'
          : 'bg-[#F4F4F5] border-[#E4E4E7] hover:bg-[#EBEBEB]'
      }`}
    >
      <div className="flex items-start gap-[12px]">
        {/* Icon */}
        <div className="w-[34px] h-[34px] rounded-full bg-[#FEE2E2] flex items-center justify-center shrink-0 mt-[1px]">
          <ArrowRight className="w-[15px] h-[15px] text-[#E11D48]" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-[13px] leading-tight ${notif.leida ? 'font-medium text-text-primary' : 'font-bold text-text-primary'}`}>
              {notif.tipo === 'chat' ? `Nuevo mensaje en ${notif.cotizacionFolio || notif.cotizacionId}` : notif.titulo}
            </p>
            <span className="text-[11px] text-text-muted shrink-0 tabular-nums">
              {tiempoRelativo(notif.fecha || notif.timestamp || '')}
            </span>
          </div>

          <p className={`text-[12px] text-text-secondary mt-[4px] leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
            {notif.tipo === 'chat' ? (
              <><span className="font-semibold text-brand">{notif.remitenteNombre}:</span> {notif.preview}</>
            ) : (
              notif.mensaje
            )}
          </p>

          {!notif.leida && (
            <span className="inline-block mt-[6px] w-[6px] h-[6px] rounded-full bg-brand" />
          )}
        </div>
      </div>
    </button>
  );
}
