import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Mail, Send } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useCorreoPrueba } from '../../hooks/useCorreoPrueba';
import { pideEncenderSmtpAuth, resumenDeRespuesta } from '../../lib/correoSaliente';
import { USANDO_EMULADORES } from '../../firebase';

/**
 * Correo saliente por Exchange (Microsoft 365) — tarea 64.
 *
 * Lo que se puede hacer aquí es UNA cosa: mandarse un correo de prueba para
 * saber si el canal quedó armado. No hay nada que configurar en pantalla a
 * propósito: el usuario y la contraseña del buzón son secretos de Secret
 * Manager y no se capturan ni se enseñan desde el navegador.
 *
 * **Ninguna notificación del sistema sale por aquí todavía** (punto 5 de la
 * tarea). Decirlo en la tarjeta evita la lectura de que activar esto ya manda
 * avisos al equipo o a los clientes.
 */
export default function CorreoSaliente() {
  const { user, puede } = useAuth();
  const { enviar, enviando, respuesta } = useCorreoPrueba();
  const [destino, setDestino] = useState('');

  const puedeProbar = puede('correo.probar');
  const resumen = respuesta ? resumenDeRespuesta(respuesta) : null;
  const smtpAuth = pideEncenderSmtpAuth(respuesta);

  const TONO = {
    exito: { bg: 'bg-success-bg/30', borde: 'border-success-bg', texto: 'text-success-text', icono: CheckCircle2 },
    aviso: { bg: 'bg-info-bg/30', borde: 'border-info-bg', texto: 'text-text-primary', icono: Info },
    error: { bg: 'bg-peligro/10', borde: 'border-peligro/40', texto: 'text-peligro', icono: AlertTriangle },
  } as const;

  return (
    <div className="bg-white border border-card-border rounded-[12px] p-[20px] shadow-sm mb-[24px]">
      <div className="flex items-start gap-[16px]">
        <div className="w-[48px] h-[48px] bg-canvas rounded-[12px] border border-card-border flex items-center justify-center shrink-0">
          <Mail className="w-[24px] h-[24px] text-primario" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-[8px] mb-[4px]">
            <h4 className="text-[14px] font-semibold text-text-primary leading-tight">
              Correo saliente · Exchange (Microsoft 365)
            </h4>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-neutral-bg text-text-muted px-[6px] py-[2px] rounded-[4px]">
              Pendiente de credenciales
            </span>
          </div>

          <p className="text-[12px] text-text-secondary leading-relaxed mb-[12px]">
            Canal de notificaciones del sistema por <strong>smtp.office365.com:587</strong> con
            STARTTLS. El usuario y la contraseña del buzón viven como secretos del servidor; no se
            capturan aquí. <strong>Ninguna notificación sale por este canal todavía:</strong> esto
            es la base y su prueba.
          </p>

          {USANDO_EMULADORES && (
            <div className="bg-info-bg/30 border border-info-bg rounded-[8px] p-[10px] mb-[12px] flex gap-[8px]">
              <Info className="w-[14px] h-[14px] text-text-secondary shrink-0 mt-[2px]" />
              <p className="text-[11px] text-text-secondary leading-relaxed">
                Estás contra emuladores: el correo se arma completo y <strong>se captura sin
                enviarse</strong>. Sirve para validar el armado, no la entrega.
              </p>
            </div>
          )}

          {puedeProbar ? (
            <div className="border-t border-divider pt-[12px]">
              <label htmlFor="correo-prueba-destino" className="block text-[12px] font-medium text-text-primary mb-[6px]">
                Destinatario de la prueba
              </label>
              <div className="flex flex-col sm:flex-row gap-[8px]">
                <input
                  id="correo-prueba-destino"
                  type="email"
                  value={destino}
                  onChange={e => setDestino(e.target.value)}
                  placeholder={user?.email ?? 'tu@vermur.com'}
                  disabled={enviando}
                  className="flex-1 min-w-0 bg-canvas border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] focus:outline-none focus:border-primario shadow-sm disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => void enviar(destino.trim())}
                  disabled={enviando}
                  className="shrink-0 inline-flex items-center justify-center gap-[6px] bg-primario text-white px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  <Send className="w-[14px] h-[14px]" />
                  {enviando ? 'Enviando…' : 'Enviar correo de prueba'}
                </button>
              </div>
              <p className="text-[11px] text-text-muted mt-[6px]">
                En blanco se manda a tu propio correo{user?.email ? ` (${user.email})` : ''}.
              </p>
            </div>
          ) : (
            <p className="text-[12px] text-text-muted border-t border-divider pt-[12px]">
              La prueba del correo la hace el superusuario técnico (admin).
            </p>
          )}

          {resumen && (() => {
            const t = TONO[resumen.tono];
            const Icono = t.icono;
            return (
              <div className={`${t.bg} border ${t.borde} rounded-[8px] p-[12px] mt-[12px]`}>
                <div className="flex gap-[8px]">
                  <Icono className={`w-[14px] h-[14px] ${t.texto} shrink-0 mt-[2px]`} />
                  <div className="min-w-0">
                    <p className={`text-[12px] font-semibold ${t.texto}`}>{resumen.titulo}</p>
                    {resumen.detalle && (
                      <p className="text-[11px] text-text-secondary leading-relaxed mt-[4px] break-words">
                        {resumen.detalle}
                      </p>
                    )}
                    {resumen.sugerencia && (
                      <p className="text-[11px] text-text-secondary leading-relaxed mt-[4px]">
                        {resumen.sugerencia}
                      </p>
                    )}
                  </div>
                </div>

                {/*
                  El caso de Microsoft 365 que se lee como «contraseña mala» y no
                  lo es. Va con los pasos exactos porque quien tiene que hacerlo
                  es el administrador de Exchange, no quien está mirando.
                */}
                {smtpAuth && (
                  <div className="mt-[10px] pt-[10px] border-t border-peligro/20">
                    <p className="text-[11px] font-semibold text-text-primary mb-[4px]">
                      Lo tiene que encender el administrador de Microsoft 365:
                    </p>
                    <p className="text-[11px] text-text-secondary leading-relaxed">
                      Centro de administración → Usuarios → usuarios activos → el buzón →
                      Correo → Administrar aplicaciones de correo electrónico → marcar
                      <strong> SMTP autenticado</strong>. Puede tardar hasta una hora en surtir
                      efecto, y si hay directivas de seguridad predeterminadas del tenant, también
                      hay que excluir ese buzón.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
