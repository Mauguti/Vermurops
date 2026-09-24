import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

interface LoginPageProps {
  onLoginSuccess: () => void;
  onBack?: () => void;
  /** «¿Olvidaste tu contraseña?» — recibe el correo tecleado, si hay. */
  onOlvideContrasena?: (correo: string) => void;
  /** Correo con el que llenar el campo (p. ej. tras restablecerla). */
  correoInicial?: string;
  /** Aviso arriba del formulario (p. ej. «tu contraseña cambió»). */
  aviso?: string;
}

export default function LoginPage({ onLoginSuccess, onBack, onOlvideContrasena, correoInicial = '', aviso }: LoginPageProps) {
  const [email, setEmail] = useState(correoInicial);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      setLoading(false);
      onLoginSuccess();
    } catch (err: any) {
      setLoading(false);
      const code = err.code;
      if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
        setError('Email o contraseña incorrectos');
      } else if (code === 'auth/too-many-requests') {
        setError('Demasiados intentos. Espera un momento');
      } else if (code === 'auth/network-request-failed') {
        setError('Sin conexión. Verifica tu internet');
      } else {
        setError('Error al iniciar sesión. Intenta de nuevo');
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 login-texture"
      style={{ background: '#18181B' }}
    >
      {/* Card */}
      <div
        className="w-full max-w-[400px] rounded-[12px] p-[32px] shadow-2xl"
        style={{ background: '#FAFAF9', border: '1px solid #E4E4E7' }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-[28px]">
          <div
            className="flex items-center justify-center rounded-[8px] px-6 py-3 mb-[16px] shadow-sm"
            style={{ background: '#fff', border: '1px solid #E4E4E7' }}
          >
            <img
              src="https://firebasestorage.googleapis.com/v0/b/digsol-academy.firebasestorage.app/o/LOGOTIPO%20(1).png?alt=media&token=702db209-5869-4471-acb6-ac7740e5453b"
              alt="Vermur Logo"
              className="h-[36px] object-contain"
            />
          </div>
          <p className="text-[13px] text-[#71717A] font-medium text-center">
            Accede a tu plataforma operativa
          </p>
        </div>

        {aviso && (
          <p className="mb-[16px] text-[12px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-[8px] px-3 py-2 text-center">{aviso}</p>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-[18px]">
          {/* Email */}
          <div>
            <label
              htmlFor="login-email"
              className="block text-[11px] font-semibold text-[#18181B] uppercase tracking-[0.06em] mb-[6px]"
            >
              Correo Electrónico
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="username"
              className="w-full rounded-[8px] px-[12px] py-[11px] text-[14px] text-[#18181B] transition-colors outline-none"
              style={{
                background: '#fff',
                border: '1.5px solid #E4E4E7',
              }}
              placeholder="usuario@vermur.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              onFocus={(e) => (e.target.style.borderColor = '#E11D48')}
              onBlur={(e) => (e.target.style.borderColor = '#E4E4E7')}
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="login-password"
              className="block text-[11px] font-semibold text-[#18181B] uppercase tracking-[0.06em] mb-[6px]"
            >
              Contraseña
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                className="w-full rounded-[8px] px-[12px] py-[11px] pr-[44px] text-[14px] text-[#18181B] transition-colors outline-none"
                style={{
                  background: '#fff',
                  border: '1.5px solid #E4E4E7',
                }}
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                onFocus={(e) => (e.target.style.borderColor = '#E11D48')}
                onBlur={(e) => (e.target.style.borderColor = '#E4E4E7')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-[12px] top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-[#18181B] transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? (
                  <EyeOff className="w-[16px] h-[16px]" />
                ) : (
                  <Eye className="w-[16px] h-[16px]" />
                )}
              </button>
            </div>
          </div>

          {onOlvideContrasena && (
            <div className="-mt-[8px] text-right">
              <button
                type="button"
                onClick={() => onOlvideContrasena(email)}
                className="text-[12px] font-medium text-[#71717A] hover:text-[#E11D48] transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}

          {/* Error message */}
          {error && (
            <p className="text-[12px] font-medium text-[#E11D48] text-center -mt-[4px]">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            id="login-submit"
            type="submit"
            disabled={loading}
            className="w-full py-[12px] rounded-[8px] text-[14px] font-semibold text-white tracking-tight transition-all"
            style={{
              background: loading ? '#F43F5E' : '#E11D48',
              opacity: loading ? 0.85 : 1,
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin w-4 h-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                Verificando...
              </span>
            ) : (
              'Iniciar sesión'
            )}
          </button>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-full py-[10px] rounded-[8px] text-[13px] font-medium text-[#52525B] transition-colors hover:bg-[#F4F4F5]"
              style={{ border: '1px solid #E4E4E7' }}
            >
              Volver al inicio
            </button>
          )}
        </form>

        {/* Footer */}
        <p className="mt-[24px] text-center text-[11px] text-[#A1A1AA] font-medium">
          VermurOps v2.4 · Digital Solutions
        </p>
      </div>
    </div>
  );
}
