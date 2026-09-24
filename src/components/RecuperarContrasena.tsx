import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
  sendPasswordResetEmail, verifyPasswordResetCode, confirmPasswordReset,
} from 'firebase/auth';
import { auth } from '../firebase';
import {
  mensajeDeErrorAuth, validarNuevaContrasena, MENSAJE_CORREO_ENVIADO,
} from '../lib/recuperarContrasena';

/**
 * Restablecer la contraseña (24-sep-2026).
 *
 * Dos pantallas con la misma tarjeta del login:
 *   - «solicitar»: pide el correo y dispara sendPasswordResetEmail. El
 *     correo es el que Firebase manda por defecto (no se personaliza hoy);
 *     `auth.languageCode = 'es'` lo pone en español.
 *   - «restablecer»: llega desde el enlace del correo cuando la URL de
 *     acción del proyecto apunta a la app (?mode=resetPassword&oobCode=…).
 *     Verifica el código, pide la contraseña nueva y la confirma. Si el
 *     proyecto usa la página de Firebase, esta pantalla no se abre nunca.
 *
 * Los mensajes salen de lib/recuperarContrasena.ts: nunca un código crudo.
 */

const INP = 'w-full rounded-[8px] px-[12px] py-[11px] text-[14px] text-[#18181B] outline-none';
const BORDE = { background: '#fff', border: '1.5px solid #E4E4E7' } as const;
const LBL = 'block text-[11px] font-semibold text-[#18181B] uppercase tracking-[0.06em] mb-[6px]';

function Tarjeta({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 login-texture" style={{ background: '#18181B' }}>
      <div className="w-full max-w-[400px] rounded-[12px] p-[32px] shadow-2xl" style={{ background: '#FAFAF9', border: '1px solid #E4E4E7' }}>
        {children}
      </div>
    </div>
  );
}

function Boton({ children, cargando, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { cargando?: boolean }) {
  return (
    <button
      {...props}
      disabled={cargando || props.disabled}
      className="w-full py-[12px] rounded-[8px] text-[14px] font-semibold text-white tracking-tight transition-all"
      style={{ background: cargando ? '#F43F5E' : '#E11D48', opacity: cargando ? 0.85 : 1 }}
    >
      {children}
    </button>
  );
}

// ─── Pedir el enlace ──────────────────────────────────────────────────────────

export function SolicitarRecuperacion({ correoInicial = '', onVolver }: { correoInicial?: string; onVolver: () => void }) {
  const [email, setEmail] = useState(correoInicial);
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [cargando, setCargando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    // La URL de regreso lleva al usuario de vuelta a la app después de
    // cambiarla. Si el dominio no estuviera autorizado en Firebase, se
    // reintenta sin ella: mejor un correo sin botón de regreso que ninguno.
    const opciones = { url: `${window.location.origin}/` };
    try {
      try {
        await sendPasswordResetEmail(auth, email.trim(), opciones);
      } catch (err) {
        if ((err as { code?: string }).code !== 'auth/unauthorized-continue-uri') throw err;
        await sendPasswordResetEmail(auth, email.trim());
      }
      setEnviado(true);
    } catch (err) {
      setError(mensajeDeErrorAuth((err as { code?: string }).code, 'solicitar'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Tarjeta>
      <h2 className="text-[18px] font-bold text-[#18181B] tracking-tight mb-[6px]">Restablecer contraseña</h2>
      {enviado ? (
        <div className="space-y-[18px]">
          <p className="text-[13px] text-[#3F3F46] leading-relaxed">{MENSAJE_CORREO_ENVIADO}</p>
          <p className="text-[12px] text-[#71717A]">El enlace del correo te pide la contraseña nueva; después entras con ella como siempre.</p>
          <Boton type="button" onClick={onVolver}>Volver al inicio de sesión</Boton>
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-[18px]">
          <p className="text-[13px] text-[#71717A]">Escribe tu correo y te mandamos un enlace para elegir una contraseña nueva.</p>
          <div>
            <label htmlFor="rec-email" className={LBL}>Correo electrónico</label>
            <input
              id="rec-email" type="email" required autoComplete="username" autoFocus
              className={INP} style={BORDE} placeholder="usuario@vermur.com"
              value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
            />
          </div>
          {error && <p className="text-[12px] font-medium text-[#E11D48] text-center -mt-[4px]">{error}</p>}
          <Boton id="rec-submit" type="submit" cargando={cargando}>{cargando ? 'Enviando…' : 'Enviar enlace'}</Boton>
          <button type="button" onClick={onVolver}
            className="w-full py-[10px] rounded-[8px] text-[13px] font-medium text-[#52525B] transition-colors hover:bg-[#F4F4F5]"
            style={{ border: '1px solid #E4E4E7' }}>
            Volver al inicio de sesión
          </button>
        </form>
      )}
    </Tarjeta>
  );
}

// ─── Elegir la contraseña nueva (desde el enlace) ─────────────────────────────

export function RestablecerContrasena({ oobCode, onTerminado }: { oobCode: string; onTerminado: (correo: string) => void }) {
  const [correo, setCorreo] = useState<string | null>(null);
  const [errorEnlace, setErrorEnlace] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(false);

  // Primero se verifica el código: un enlace vencido o ya usado se dice
  // antes de pedir nada.
  useEffect(() => {
    let vivo = true;
    verifyPasswordResetCode(auth, oobCode)
      .then(c => { if (vivo) setCorreo(c); })
      .catch(err => { if (vivo) setErrorEnlace(mensajeDeErrorAuth((err as { code?: string }).code, 'verificar')); });
    return () => { vivo = false; };
  }, [oobCode]);

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalida = validarNuevaContrasena(p1, p2);
    if (invalida) { setError(invalida); return; }
    setError('');
    setCargando(true);
    try {
      await confirmPasswordReset(auth, oobCode, p1);
      setListo(true);
    } catch (err) {
      setError(mensajeDeErrorAuth((err as { code?: string }).code, 'confirmar'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Tarjeta>
      <h2 className="text-[18px] font-bold text-[#18181B] tracking-tight mb-[6px]">Contraseña nueva</h2>
      {errorEnlace ? (
        <div className="space-y-[18px]">
          <p className="text-[13px] font-medium text-[#E11D48]">{errorEnlace}</p>
          <Boton type="button" onClick={() => onTerminado('')}>Ir al inicio de sesión</Boton>
        </div>
      ) : listo ? (
        <div className="space-y-[18px]">
          <p className="text-[13px] text-[#3F3F46]">Listo. Tu contraseña cambió; entra con ella.</p>
          <Boton id="rec-entrar" type="button" onClick={() => onTerminado(correo ?? '')}>Iniciar sesión</Boton>
        </div>
      ) : !correo ? (
        <p className="text-[13px] text-[#71717A]">Verificando el enlace…</p>
      ) : (
        <form onSubmit={confirmar} className="space-y-[18px]">
          <p className="text-[13px] text-[#71717A]">Para <span className="font-semibold text-[#18181B]">{correo}</span>. Mínimo 6 caracteres.</p>
          <div>
            <label htmlFor="rec-p1" className={LBL}>Contraseña nueva</label>
            <div className="relative">
              <input id="rec-p1" type={ver ? 'text' : 'password'} required autoComplete="new-password" autoFocus
                className={INP + ' pr-[44px]'} style={BORDE} value={p1} onChange={e => { setP1(e.target.value); setError(''); }} />
              <button type="button" onClick={() => setVer(v => !v)} tabIndex={-1}
                className="absolute right-[12px] top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-[#18181B]"
                aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {ver ? <EyeOff className="w-[16px] h-[16px]" /> : <Eye className="w-[16px] h-[16px]" />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="rec-p2" className={LBL}>Repite la contraseña</label>
            <input id="rec-p2" type={ver ? 'text' : 'password'} required autoComplete="new-password"
              className={INP} style={BORDE} value={p2} onChange={e => { setP2(e.target.value); setError(''); }} />
          </div>
          {error && <p className="text-[12px] font-medium text-[#E11D48] text-center -mt-[4px]">{error}</p>}
          <Boton id="rec-confirmar" type="submit" cargando={cargando}>{cargando ? 'Guardando…' : 'Guardar contraseña'}</Boton>
        </form>
      )}
    </Tarjeta>
  );
}
