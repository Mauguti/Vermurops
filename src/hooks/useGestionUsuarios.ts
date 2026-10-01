/**
 * useGestionUsuarios.ts — hook para gestionar usuarios desde la UI.
 *
 * Toda operación pasa por la Function `gestionarUsuarios`, que usa el Admin
 * SDK y no necesita reglas de Firestore para `usuarios/{uid}`.
 */

import { useState, useCallback } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { urlFuncion } from '../lib/urlFunciones';
import { enviarCorreoDeAcceso } from '../lib/recuperarContrasena';
import type { UserRole } from '../auth/users';
import type { UsuarioRegistrado } from '../lib/usuarios';

interface EstadoGestion {
  usuarios: UsuarioRegistrado[];
  cargando: boolean;
  error: string | null;
}

export function useGestionUsuarios() {
  const [estado, setEstado] = useState<EstadoGestion>({
    usuarios: [],
    cargando: false,
    error: null,
  });

  const llamarFuncion = useCallback(async (body: Record<string, unknown>) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Sin sesión activa.');
    const token = await user.getIdToken();
    const url = urlFuncion('gestionarUsuarios');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error ?? 'Error desconocido.');
    return data.datos;
  }, []);

  const listar = useCallback(async () => {
    setEstado(e => ({ ...e, cargando: true, error: null }));
    try {
      const usuarios = await llamarFuncion({ accion: 'listar' });
      setEstado({ usuarios, cargando: false, error: null });
    } catch (err) {
      setEstado(e => ({
        ...e,
        cargando: false,
        error: err instanceof Error ? err.message : 'Error al listar usuarios.',
      }));
    }
  }, [llamarFuncion]);

  /**
   * Manda el correo para poner la contraseña.
   *
   * Lo hace la APP, no la Function: el Admin SDK no envía correos, y creer
   * que sí costó que Mau se invitara, se le creara la cuenta y no le llegara
   * nada. Ver `enviarCorreoDeAcceso`.
   */
  const enviarInvitacion = useCallback(async (email: string): Promise<void> => {
    await enviarCorreoDeAcceso(
      sendPasswordResetEmail as never, auth, email, window.location.origin,
    );
  }, []);

  /**
   * Invitar = crear la cuenta Y mandar el correo.
   *
   * Si el correo falla, la cuenta YA está creada: no se deshace nada —sería
   * borrar una cuenta por un fallo de envío— y se devuelve el aviso para que
   * la pantalla lo diga y ofrezca reenviar.
   */
  const invitar = useCallback(async (
    email: string,
    nombre: string,
    rol: UserRole,
  ): Promise<{ usuario: UsuarioRegistrado; correoEnviado: boolean; motivo?: string }> => {
    setEstado(e => ({ ...e, error: null }));
    const nuevo = await llamarFuncion({ accion: 'invitar', email, nombre, rol });
    setEstado(e => ({ ...e, usuarios: [...e.usuarios, nuevo] }));
    try {
      await enviarInvitacion(email);
      return { usuario: nuevo, correoEnviado: true };
    } catch (err) {
      return {
        usuario: nuevo,
        correoEnviado: false,
        motivo: err instanceof Error ? err.message : String(err),
      };
    }
  }, [llamarFuncion, enviarInvitacion]);

  const cambiarRol = useCallback(async (
    uid: string,
    rol: UserRole,
  ): Promise<UsuarioRegistrado> => {
    setEstado(e => ({ ...e, error: null }));
    const actualizado = await llamarFuncion({ accion: 'cambiarRol', uid, rol });
    setEstado(e => ({
      ...e,
      usuarios: e.usuarios.map(u => u.uid === uid ? actualizado : u),
    }));
    return actualizado;
  }, [llamarFuncion]);

  const desactivar = useCallback(async (uid: string): Promise<UsuarioRegistrado> => {
    setEstado(e => ({ ...e, error: null }));
    const actualizado = await llamarFuncion({ accion: 'desactivar', uid });
    setEstado(e => ({
      ...e,
      usuarios: e.usuarios.map(u => u.uid === uid ? actualizado : u),
    }));
    return actualizado;
  }, [llamarFuncion]);

  return {
    enviarInvitacion,
    ...estado,
    listar,
    invitar,
    cambiarRol,
    desactivar,
  };
}
