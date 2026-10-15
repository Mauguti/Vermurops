/**
 * useGestionUsuarios.ts — hook para gestionar usuarios desde la UI.
 *
 * Toda operación pasa por la Function `gestionarUsuarios`, que usa el Admin
 * SDK y no necesita reglas de Firestore para `usuarios/{uid}`.
 */

import { useState, useCallback } from 'react';
import { auth } from '../firebase';
import { urlFuncion } from '../lib/urlFunciones';
import type { UserRole } from '../auth/users';
import type { UsuarioRegistrado } from '../lib/usuarios';

/** Lo que contesta la Function en «invitar» y en «reenviar». */
interface ResultadoInvitacion {
  usuario: UsuarioRegistrado | null;
  correoEnviado: boolean;
  motivoCorreo?: string;
}

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
   * Manda (o remanda) el correo para poner la contraseña.
   *
   * ── Por qué ya NO lo manda la app ────────────────────────────────────────
   * Aquí vivía `sendPasswordResetEmail`, el correo de Firebase. **Ese correo
   * no llega a vermur.com**: el dominio está en Microsoft 365 con SPF `-all`
   * y sin DKIM ni DMARC propios. Las siete invitaciones del 13-oct se
   * crearon bien y no llegó ninguna — y la pantalla decía «enviado», porque
   * el SDK resuelve sin error aunque el mensaje muera después.
   *
   * Ahora lo manda el servidor por n8n, con una cuenta de Gmail real, y SÍ
   * se sabe si salió: si no salió, esto LANZA con el motivo para que la
   * pantalla lo diga. Un «reenviado» que no reenvió es peor que un error.
   */
  const enviarInvitacion = useCallback(async (email: string): Promise<void> => {
    const r = await llamarFuncion({ accion: 'reenviar', email }) as ResultadoInvitacion;
    if (!r.correoEnviado) {
      throw new Error(r.motivoCorreo ?? 'El correo no salió y n8n no dijo por qué.');
    }
  }, [llamarFuncion]);

  /**
   * Invitar = crear la cuenta Y mandar el correo, en UNA llamada.
   *
   * Las dos cosas pasan en el servidor, así que ya no hay una ventana en la
   * que la cuenta exista y el navegador todavía no haya intentado el correo.
   *
   * Si el correo falla, la cuenta YA está creada: no se deshace nada —borrar
   * una cuenta por un fallo de envío sería peor— y el motivo vuelve para que
   * la pantalla lo diga y ofrezca «Reenviar invitación».
   */
  const invitar = useCallback(async (
    email: string,
    nombre: string,
    rol: UserRole,
  ): Promise<{ usuario: UsuarioRegistrado | null; correoEnviado: boolean; motivo?: string }> => {
    setEstado(e => ({ ...e, error: null }));
    const r = await llamarFuncion({ accion: 'invitar', email, nombre, rol }) as ResultadoInvitacion;
    if (r.usuario) {
      const nuevo = r.usuario;
      setEstado(e => ({ ...e, usuarios: [...e.usuarios, nuevo] }));
    }
    return { usuario: r.usuario, correoEnviado: r.correoEnviado, motivo: r.motivoCorreo };
  }, [llamarFuncion]);

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
