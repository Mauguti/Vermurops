/**
 * GestionUsuarios.tsx — pantalla de gestión de usuarios dentro de Configuración.
 *
 * Visible solo para admin (usuario.gestionar). Lista, invitar, cambiar rol, desactivar.
 * Toda operación pasa por la Function `gestionarUsuarios`.
 */

import React, { useState, useEffect } from 'react';
import {
  UserPlus, AlertTriangle, CheckCircle2, XCircle,
  Shield, ChevronDown, Loader2,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useGestionUsuarios } from '../../hooks/useGestionUsuarios';
import {
  ROLES_VALIDOS,
  ETIQUETA_ROL,
  correoEnReglas,
  validarEmailInvitacion,
  validarNombreInvitacion,
  type UsuarioRegistrado,
} from '../../lib/usuarios';
import type { UserRole } from '../../auth/users';

// ── Estilos de badge por rol ─────────────────────────────────────────────────

const BADGE_ROL: Record<UserRole, { bg: string; color: string }> = {
  ventas:         { bg: '#FFF7ED', color: '#C2410C' },
  pricing:        { bg: '#EFF6FF', color: '#1D4ED8' },
  operaciones:    { bg: '#ECFDF5', color: '#047857' },
  administracion: { bg: '#F0FDF4', color: '#15803D' },
  admin:          { bg: 'var(--color-primario-10, #EDE9F3)', color: 'var(--color-primario, #4B2A8C)' },
};

// ── Componente principal ─────────────────────────────────────────────────────

export default function GestionUsuarios() {
  const { user } = useAuth();
  const { usuarios, cargando, error, listar, invitar, cambiarRol, desactivar } = useGestionUsuarios();
  const [mostrarInvitar, setMostrarInvitar] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'error'; msg: string } | null>(null);

  useEffect(() => { listar(); }, [listar]);

  // Limpiar feedback tras 5 segundos
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 5000);
    return () => clearTimeout(t);
  }, [feedback]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-[18px] font-semibold text-text-primary">Usuarios y Roles</h3>
          <p className="text-[13px] text-text-secondary mt-1">
            Invita al equipo, asigna roles y controla el acceso.
          </p>
        </div>
        <button
          onClick={() => setMostrarInvitar(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold text-white shadow-sm transition-colors"
          style={{ background: 'var(--color-primario)' }}
        >
          <UserPlus className="w-4 h-4" />
          Invitar usuario
        </button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`mb-4 px-4 py-3 rounded-lg flex items-center gap-2 text-[13px] font-medium ${
          feedback.tipo === 'ok'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {feedback.tipo === 'ok'
            ? <CheckCircle2 className="w-4 h-4 shrink-0" />
            : <XCircle className="w-4 h-4 shrink-0" />}
          {feedback.msg}
        </div>
      )}

      {error && !feedback && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-800 border border-red-200 text-[13px]">
          {error}
        </div>
      )}

      {/* Tabla */}
      {cargando && usuarios.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-text-muted text-[13px]">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Cargando usuarios…
        </div>
      ) : usuarios.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-[60px] border border-dashed border-card-border rounded-lg bg-white">
          <Shield className="w-8 h-8 text-text-muted mb-4" />
          <p className="text-[14px] font-medium text-text-primary mb-1">Sin usuarios registrados</p>
          <p className="text-[13px] text-text-secondary text-center max-w-sm">
            Invita al primer usuario para empezar a gestionar el acceso.
          </p>
        </div>
      ) : (
        <TablaUsuarios
          usuarios={usuarios}
          usuarioActual={user?.uid}
          onCambiarRol={async (uid, rol) => {
            try {
              await cambiarRol(uid, rol);
              setFeedback({ tipo: 'ok', msg: `Rol actualizado. El usuario verá el cambio al volver a su pestaña.` });
            } catch (err) {
              setFeedback({ tipo: 'error', msg: err instanceof Error ? err.message : 'Error al cambiar rol.' });
            }
          }}
          onDesactivar={async (uid) => {
            try {
              await desactivar(uid);
              setFeedback({ tipo: 'ok', msg: 'Usuario desactivado.' });
            } catch (err) {
              setFeedback({ tipo: 'error', msg: err instanceof Error ? err.message : 'Error al desactivar.' });
            }
          }}
        />
      )}

      {/* Modal de invitación */}
      {mostrarInvitar && (
        <ModalInvitar
          onCerrar={() => setMostrarInvitar(false)}
          onInvitar={async (email, nombre, rol) => {
            try {
              await invitar(email, nombre, rol);
              setMostrarInvitar(false);
              setFeedback({ tipo: 'ok', msg: `Se invitó a ${nombre} (${email}). Recibirá un correo para poner su contraseña.` });
            } catch (err) {
              throw err; // El modal lo muestra
            }
          }}
        />
      )}
    </div>
  );
}

// ── Tabla ─────────────────────────────────────────────────────────────────────

function TablaUsuarios({
  usuarios,
  usuarioActual,
  onCambiarRol,
  onDesactivar,
}: {
  usuarios: UsuarioRegistrado[];
  usuarioActual?: string;
  onCambiarRol: (uid: string, rol: UserRole) => Promise<void>;
  onDesactivar: (uid: string) => Promise<void>;
}) {
  return (
    <div className="border border-card-border rounded-xl overflow-hidden bg-white">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr>
            <th className="bg-canvas border-b border-card-border py-3 px-4 text-[11px] font-medium text-text-muted uppercase tracking-wide">Nombre</th>
            <th className="bg-canvas border-b border-card-border py-3 px-4 text-[11px] font-medium text-text-muted uppercase tracking-wide">Correo</th>
            <th className="bg-canvas border-b border-card-border py-3 px-4 text-[11px] font-medium text-text-muted uppercase tracking-wide">Rol</th>
            <th className="bg-canvas border-b border-card-border py-3 px-4 text-[11px] font-medium text-text-muted uppercase tracking-wide text-center">Estado</th>
            <th className="bg-canvas border-b border-card-border py-3 px-4 text-[11px] font-medium text-text-muted uppercase tracking-wide text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-divider">
          {usuarios.map(u => (
            <FilaUsuario
              key={u.uid}
              usuario={u}
              esMismoUsuario={u.uid === usuarioActual}
              onCambiarRol={onCambiarRol}
              onDesactivar={onDesactivar}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilaUsuario({
  usuario,
  esMismoUsuario,
  onCambiarRol,
  onDesactivar,
}: {
  usuario: UsuarioRegistrado;
  esMismoUsuario: boolean;
  onCambiarRol: (uid: string, rol: UserRole) => Promise<void>;
  onDesactivar: (uid: string) => Promise<void>;
}) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const badge = BADGE_ROL[usuario.rol];

  const avatar = usuario.nombre
    .split(' ')
    .map(p => p.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');

  return (
    <tr className={`hover:bg-neutral-bg transition-colors ${!usuario.activo ? 'opacity-50' : ''}`}>
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
            style={{ background: badge.color }}
          >
            {avatar}
          </div>
          <div>
            <p className="text-[13px] font-semibold text-text-primary leading-tight">
              {usuario.nombre}
              {esMismoUsuario && <span className="text-text-muted font-normal ml-1">(tú)</span>}
            </p>
          </div>
        </div>
      </td>
      <td className="py-3 px-4 text-[13px] text-text-secondary">{usuario.email}</td>
      <td className="py-3 px-4">
        <div className="relative inline-block">
          <button
            onClick={() => !esMismoUsuario && usuario.activo && setMenuAbierto(v => !v)}
            disabled={esMismoUsuario || !usuario.activo}
            className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${
              esMismoUsuario || !usuario.activo ? 'cursor-default' : 'cursor-pointer hover:ring-1 hover:ring-offset-1'
            }`}
            style={{ background: badge.bg, color: badge.color }}
          >
            {ETIQUETA_ROL[usuario.rol]}
            {!esMismoUsuario && usuario.activo && <ChevronDown className="w-3 h-3" />}
          </button>
          {menuAbierto && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuAbierto(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-card-border rounded-lg shadow-lg py-1 min-w-[160px]">
                {ROLES_VALIDOS.map(r => (
                  <button
                    key={r}
                    disabled={r === usuario.rol || cambiando}
                    onClick={async () => {
                      setCambiando(true);
                      setMenuAbierto(false);
                      try {
                        await onCambiarRol(usuario.uid, r);
                      } finally {
                        setCambiando(false);
                      }
                    }}
                    className={`w-full text-left px-3 py-2 text-[12px] transition-colors ${
                      r === usuario.rol
                        ? 'font-bold text-text-primary bg-canvas'
                        : 'text-text-secondary hover:bg-neutral-bg hover:text-text-primary'
                    }`}
                  >
                    {ETIQUETA_ROL[r]}
                    {r === usuario.rol && ' ✓'}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </td>
      <td className="py-3 px-4 text-center">
        <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
          usuario.activo
            ? 'bg-green-50 text-green-700'
            : 'bg-red-50 text-red-700'
        }`}>
          {usuario.activo ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td className="py-3 px-4 text-right">
        {!esMismoUsuario && usuario.activo && (
          <button
            onClick={() => {
              if (window.confirm(`¿Desactivar a ${usuario.nombre}? Ya no podrá entrar al sistema.`)) {
                onDesactivar(usuario.uid);
              }
            }}
            className="text-[12px] font-medium text-text-muted hover:text-red-600 transition-colors"
          >
            Desactivar
          </button>
        )}
      </td>
    </tr>
  );
}

// ── Modal de invitación ──────────────────────────────────────────────────────

function ModalInvitar({
  onCerrar,
  onInvitar,
}: {
  onCerrar: () => void;
  onInvitar: (email: string, nombre: string, rol: UserRole) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<UserRole>('ventas');
  const [enviando, setEnviando] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const emailFueraDeReglas = email.trim() && !correoEnReglas(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorLocal(null);

    const errEmail = validarEmailInvitacion(email);
    if (errEmail) { setErrorLocal(errEmail); return; }
    const errNombre = validarNombreInvitacion(nombre);
    if (errNombre) { setErrorLocal(errNombre); return; }

    setEnviando(true);
    try {
      await onInvitar(email.trim(), nombre.trim(), rol);
    } catch (err) {
      setErrorLocal(err instanceof Error ? err.message : 'Error al invitar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-divider bg-canvas flex items-center justify-between">
          <h3 className="text-[14px] font-bold text-text-primary">Invitar usuario</h3>
          <button type="button" onClick={onCerrar} className="text-text-muted hover:text-text-primary text-lg leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
              Correo electrónico *
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="nombre@vermur.com"
              className="w-full border border-card-border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-brand"
              autoFocus
            />
            {emailFueraDeReglas && (
              <div className="mt-2 flex items-start gap-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Este correo no está en las reglas de producción.</p>
                  <p className="mt-0.5">Mientras exista el parche de reglas por lista de correos,
                  este usuario no podrá acceder a la base de datos en producción.
                  Hay que agregarlo a <code className="text-xs">esDelEquipo()</code> en{' '}
                  <code className="text-xs">firestore.rules</code> y desplegar.</p>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
              Nombre completo *
            </label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Luis Rentería"
              className="w-full border border-card-border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
              Rol *
            </label>
            <select
              value={rol}
              onChange={e => setRol(e.target.value as UserRole)}
              className="w-full border border-card-border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-brand bg-white"
            >
              {ROLES_VALIDOS.map(r => (
                <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>
              ))}
            </select>
          </div>

          {errorLocal && (
            <div className="px-3 py-2 rounded-lg bg-red-50 text-red-800 border border-red-200 text-[12px] flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" />
              {errorLocal}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-canvas border-t border-divider flex justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="px-4 py-2 text-[13px] font-semibold text-text-secondary hover:text-text-primary"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white shadow-sm transition-colors disabled:opacity-60"
            style={{ background: 'var(--color-primario)' }}
          >
            {enviando ? 'Invitando…' : 'Invitar'}
          </button>
        </div>
      </form>
    </div>
  );
}
