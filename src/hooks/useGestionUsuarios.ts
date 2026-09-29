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

  const invitar = useCallback(async (
    email: string,
    nombre: string,
    rol: UserRole,
  ): Promise<UsuarioRegistrado> => {
    setEstado(e => ({ ...e, error: null }));
    const nuevo = await llamarFuncion({ accion: 'invitar', email, nombre, rol });
    setEstado(e => ({ ...e, usuarios: [...e.usuarios, nuevo] }));
    return nuevo;
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
    ...estado,
    listar,
    invitar,
    cambiarRol,
    desactivar,
  };
}
