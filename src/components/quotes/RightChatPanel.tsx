import React, { useMemo } from 'react';
import { KanbanQuote } from './QuotesData';
import { useNotifications } from '../../notifications/NotificationsContext';
import { MessageSquare, Clock } from 'lucide-react';
import { AuthUser } from '../../auth/users';
import { tiempoRelativo } from '../../notifications/notificationsStore';

interface RightChatPanelProps {
  quotes: KanbanQuote[];
  onSelectQuote: (quote: KanbanQuote) => void;
  user: AuthUser | null;
}

export default function RightChatPanel({ quotes, onSelectQuote, user }: RightChatPanelProps) {
  const { notificaciones } = useNotifications();

  // Filtrar cotizaciones que tienen chat
  const activeChats = useMemo(() => {
    return quotes
      .filter(q => q.chat && q.chat.length > 0)
      .map(quote => {
        const lastMessage = quote.chat[quote.chat.length - 1];
        const unreadCount = notificaciones.filter(
          n => n.tipo === 'chat' && n.cotizacionId === quote.id && !n.leida
        ).length;
        
        return {
          quote,
          lastMessage,
          unreadCount
        };
      })
      .sort((a, b) => {
        // Ordenar por el timestamp del último mensaje (más reciente primero)
        return b.lastMessage.timestamp.localeCompare(a.lastMessage.timestamp);
      });
  }, [quotes, notificaciones]);

  return (
    <div className="fixed right-0 top-[64px] bottom-0 w-[320px] bg-[#FAFAF9] border-l border-gray-200 shadow-sm z-30 hidden xl:flex flex-col">
      <div className="px-5 py-4 border-b border-gray-200 bg-white shrink-0">
        <h3 className="text-[14px] font-bold text-[#18181B] flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#E11D48]" />
          Conversaciones
        </h3>
        <p className="text-[11px] text-gray-500 font-medium mt-1">Actividad reciente en tus cotizaciones</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {activeChats.length === 0 ? (
          <div className="text-center py-10">
            <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-[12px] text-gray-500">No tienes conversaciones activas</p>
          </div>
        ) : (
          activeChats.map(({ quote, lastMessage, unreadCount }) => (
            <div 
              key={quote.id}
              onClick={() => onSelectQuote(quote)}
              className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm hover:border-[#E11D48] hover:shadow transition-all cursor-pointer group relative"
            >
              {unreadCount > 0 && (
                <div className="absolute -top-2 -right-2 bg-[#E11D48] text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-sm">
                  {unreadCount}
                </div>
              )}
              <div className="flex justify-between items-start mb-1.5">
                <div>
                  <span className="text-[10px] font-bold text-[#E11D48] tracking-wider uppercase block mb-0.5">{quote.folio}</span>
                  <h4 className="text-[12px] font-bold text-[#18181B] truncate max-w-[180px]" title={quote.empresa}>
                    {quote.empresa}
                  </h4>
                </div>
                <div className="flex items-center text-[10px] text-gray-400 font-medium whitespace-nowrap">
                  <Clock className="w-3 h-3 mr-1" />
                  {lastMessage.timestamp.split(' ')[1] || '00:00'}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                <p className="text-[10px] font-bold text-[#4B2A8C] mb-0.5">{lastMessage.autorNombre}:</p>
                <p className="text-[11px] text-gray-600 line-clamp-2 leading-relaxed">
                  {lastMessage.texto}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
