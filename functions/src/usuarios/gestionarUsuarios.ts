/**
 * gestionarUsuarios.ts — Cloud Function para la gestión de usuarios de VermurOps.
 *
 * Acciones: listar, invitar, cambiarRol, desactivar.
 *
 * Todas exigen `usuario.gestionar` (solo admin). El Admin SDK bypasses las
 * reglas de Firestore, así que no hace falta regla para `usuarios/{uid}`:
 * la colección vive protegida por la Function.
 *
 * Alta por invitación: la Function crea la cuenta, pone el rol en custom
 * claims, escribe `usuarios/{uid}` y dispara el correo de restablecimiento
 * de contraseña. El invitado recibe el enlace, pone su contraseña y entra.
 *
 * Baja: `activo: false` + `disableUser`. Nunca se borra.
 *
 * Cambio de rol: actualiza claims + `revokeRefreshTokens` + actualiza doc.
 * La sesión abierta del usuario cambia al refrescar el token.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  verificarUsuario,
  exigirCapacidad,
  ErrorAuth,
  ROLES_VALIDOS,
  type UserRole,
} from '../comun/auth.js';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface AccionListar { accion: 'listar' }
interface AccionInvitar {
  accion: 'invitar';
  email: string;
  nombre: string;
  rol: UserRole;
}
interface AccionCambiarRol {
  accion: 'cambiarRol';
  uid: string;
  rol: UserRole;
}
interface AccionDesactivar {
  accion: 'desactivar';
  uid: string;
}

type Payload = AccionListar | AccionInvitar | AccionCambiarRol | AccionDesactivar;

export interface UsuarioRegistrado {
  uid: string;
  email: string;
  nombre: string;
  rol: UserRole;
  activo: boolean;
  invitadoPor: string;
  creadoEn: string;
  actualizadoEn: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const db = () => getFirestore();
const authAdmin = () => getAuth();

function validarEmail(email: string): string {
  const limpio = email.toLowerCase().trim();
  if (!limpio || !limpio.includes('@')) {
    throw new ErrorAuth(400, 'El correo no es válido.');
  }
  return limpio;
}

function validarRol(rol: unknown): UserRole {
  if (!rol || !ROLES_VALIDOS.includes(rol as UserRole)) {
    throw new ErrorAuth(400, `Rol no válido: «${rol}». Opciones: ${ROLES_VALIDOS.join(', ')}.`);
  }
  return rol as UserRole;
}

// ── Acciones ─────────────────────────────────────────────────────────────────

async function listar(): Promise<UsuarioRegistrado[]> {
  const snap = await db().collection('usuarios').orderBy('nombre').get();
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }) as UsuarioRegistrado);
}

async function invitar(
  payload: AccionInvitar,
  invitadoPorEmail: string,
): Promise<UsuarioRegistrado> {
  const email = validarEmail(payload.email);
  const rol = validarRol(payload.rol);
  const nombre = (payload.nombre ?? '').trim();
  if (!nombre) throw new ErrorAuth(400, 'El nombre es obligatorio.');

  // Crear cuenta en Firebase Auth
  let uid: string;
  try {
    const userRecord = await authAdmin().createUser({
      email,
      displayName: nombre,
      disabled: false,
    });
    uid = userRecord.uid;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? '';
    if (code === 'auth/email-already-exists') {
      throw new ErrorAuth(409, `Ya existe una cuenta con el correo «${email}».`);
    }
    throw new ErrorAuth(500, `Error al crear la cuenta: ${code}`);
  }

  // Custom claims con el rol
  await authAdmin().setCustomUserClaims(uid, { rol });

  // Documento en usuarios/{uid}
  const ahora = new Date().toISOString();
  const doc: Omit<UsuarioRegistrado, 'uid'> = {
    email,
    nombre,
    rol,
    activo: true,
    invitadoPor: invitadoPorEmail,
    creadoEn: ahora,
    actualizadoEn: ahora,
  };
  await db().collection('usuarios').doc(uid).set(doc);

  /*
   * El correo lo manda la APP, no esta Function.
   *
   * Aquí había un `generatePasswordResetLink`, con un comentario que decía
   * que «en producción Firebase envía el correo automáticamente». Es falso:
   * ese método GENERA el enlace y no manda nada. El Admin SDK no envía
   * correos. Mau se invitó, la cuenta se creó en Auth y en `usuarios/{uid}`,
   * y no llegó nada.
   *
   * El e2e no lo atrapaba porque el emulador registra el oobCode al generar
   * el enlace, aunque nadie lo mande: el enlace existía y la prueba lo
   * encontraba.
   *
   * Quien sí envía es `sendPasswordResetEmail` del SDK de cliente, que es lo
   * que ya usa la pantalla de recuperar contraseña. Se llama desde la app al
   * volver esta respuesta.
   *
   * Y no se registra el enlace en los logs: es una credencial de un solo uso
   * para entrar a la cuenta de alguien más.
   */

  return { uid, ...doc };
}

async function cambiarRol(
  payload: AccionCambiarRol,
  modificadoPorEmail: string,
): Promise<UsuarioRegistrado> {
  const { uid } = payload;
  const rol = validarRol(payload.rol);
  if (!uid) throw new ErrorAuth(400, 'Falta el uid del usuario.');

  // Verificar que el usuario existe
  let userRecord;
  try {
    userRecord = await authAdmin().getUser(uid);
  } catch {
    throw new ErrorAuth(404, `No se encontró el usuario con uid «${uid}».`);
  }

  // Actualizar claims
  await authAdmin().setCustomUserClaims(uid, { rol });

  // Revocar refresh tokens para forzar re-autenticación con los nuevos claims
  await authAdmin().revokeRefreshTokens(uid);

  // Actualizar documento
  const ahora = new Date().toISOString();
  await db().collection('usuarios').doc(uid).update({
    rol,
    actualizadoEn: ahora,
    historial: FieldValue.arrayUnion({
      tipo: 'cambioRol',
      rolAnterior: (userRecord.customClaims as { rol?: string })?.rol ?? 'sin claims',
      rolNuevo: rol,
      por: modificadoPorEmail,
      fecha: ahora,
    }),
  });

  const snap = await db().collection('usuarios').doc(uid).get();
  return { uid, ...snap.data() } as UsuarioRegistrado;
}

async function desactivar(
  payload: AccionDesactivar,
  desactivadoPorEmail: string,
): Promise<UsuarioRegistrado> {
  const { uid } = payload;
  if (!uid) throw new ErrorAuth(400, 'Falta el uid del usuario.');

  // Verificar que existe
  try {
    await authAdmin().getUser(uid);
  } catch {
    throw new ErrorAuth(404, `No se encontró el usuario con uid «${uid}».`);
  }

  // Deshabilitar en Auth
  await authAdmin().updateUser(uid, { disabled: true });

  // Revocar tokens
  await authAdmin().revokeRefreshTokens(uid);

  // Actualizar documento
  const ahora = new Date().toISOString();
  await db().collection('usuarios').doc(uid).update({
    activo: false,
    actualizadoEn: ahora,
    historial: FieldValue.arrayUnion({
      tipo: 'desactivacion',
      por: desactivadoPorEmail,
      fecha: ahora,
    }),
  });

  const snap = await db().collection('usuarios').doc(uid).get();
  return { uid, ...snap.data() } as UsuarioRegistrado;
}

// ── Handler principal ────────────────────────────────────────────────────────

export const gestionarUsuarios = onRequest(
  { cors: true, invoker: 'public' },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Solo POST.' });
      return;
    }

    try {
      const usuario = await verificarUsuario(req);
      exigirCapacidad(usuario, 'usuario.gestionar');

      const payload = req.body as Payload;
      if (!payload?.accion) {
        throw new ErrorAuth(400, 'Falta el campo «accion».');
      }

      let resultado: unknown;
      switch (payload.accion) {
        case 'listar':
          resultado = await listar();
          break;
        case 'invitar':
          resultado = await invitar(payload, usuario.email);
          break;
        case 'cambiarRol':
          resultado = await cambiarRol(payload, usuario.email);
          break;
        case 'desactivar':
          resultado = await desactivar(payload, usuario.email);
          break;
        default:
          throw new ErrorAuth(400, `Acción desconocida: «${(payload as { accion: string }).accion}».`);
      }

      res.status(200).json({ ok: true, datos: resultado });
    } catch (err) {
      if (err instanceof ErrorAuth) {
        res.status(err.status).json({ ok: false, error: err.message });
        return;
      }
      console.error('[gestionarUsuarios] Error inesperado:', err);
      res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
    }
  },
);
