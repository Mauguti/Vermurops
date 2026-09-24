/**
 * recuperarContrasena.ts
 *
 * Restablecer la contraseña (24-sep-2026, bloque urgente antes de la
 * prueba): «si alguien del equipo se queda fuera durante la prueba, ahí se
 * acabó la demo». Aquí vive lo que se puede fijar con tests: los mensajes
 * en español para cada caso real, la lectura del enlace del correo y la
 * validación de la contraseña nueva. Sin React ni Firebase.
 */

// ─── Mensajes ─────────────────────────────────────────────────────────────────

export type PasoRecuperacion = 'solicitar' | 'verificar' | 'confirmar';

/**
 * Traduce el código de Firebase Auth a algo que quien está afuera de la
 * plataforma entienda. Nunca se enseña el código crudo.
 *
 * `auth/user-not-found` solo llega cuando el proyecto NO tiene protección
 * contra enumeración de correos; con la protección activa, Firebase responde
 * éxito aunque el correo no exista, y por eso el mensaje de éxito es neutro.
 */
export function mensajeDeErrorAuth(codigo: string | undefined, paso: PasoRecuperacion): string {
  switch (codigo) {
    case 'auth/user-not-found':
      return 'No hay ninguna cuenta con ese correo. Revisa que esté bien escrito o pide a Administración que te dé de alta.';
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return 'Escribe un correo válido, por ejemplo nombre@vermur.com.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.';
    case 'auth/network-request-failed':
      return 'Sin conexión. Verifica tu internet y vuelve a intentarlo.';
    case 'auth/expired-action-code':
      return 'El enlace ya venció. Pide uno nuevo desde «¿Olvidaste tu contraseña?».';
    case 'auth/invalid-action-code':
      return 'El enlace ya se usó o no es válido. Pide uno nuevo desde «¿Olvidaste tu contraseña?».';
    case 'auth/user-disabled':
      return 'Esta cuenta está deshabilitada. Avisa a Administración.';
    case 'auth/weak-password':
      return 'La contraseña es muy corta: usa al menos 6 caracteres.';
    case 'auth/unauthorized-continue-uri':
      return 'El dominio de esta página no está autorizado en Firebase. Avisa a sistemas.';
    default:
      return paso === 'solicitar'
        ? 'No se pudo enviar el correo. Intenta de nuevo; si sigue igual, avisa a sistemas.'
        : 'No se pudo restablecer la contraseña. Pide un enlace nuevo; si sigue igual, avisa a sistemas.';
  }
}

/** Mensaje de éxito neutro: no revela si el correo existe. */
export const MENSAJE_CORREO_ENVIADO =
  'Si ese correo tiene cuenta, te llegará un enlace en unos minutos. Revisa también la carpeta de spam.';

// ─── El enlace del correo ─────────────────────────────────────────────────────

export interface AccionDeCorreo {
  modo: 'resetPassword';
  oobCode: string;
}

/**
 * Lee `?mode=resetPassword&oobCode=…` de la URL. Es lo que Firebase pone en
 * el enlace del correo cuando la acción se maneja en la app (Plantillas →
 * URL de acción). Si el proyecto usa la página de Firebase, la app nunca
 * recibe esto y no pasa nada.
 */
export function leerAccionDeUrl(search: string): AccionDeCorreo | null {
  const p = new URLSearchParams(search);
  const modo = p.get('mode');
  const oobCode = p.get('oobCode');
  if (modo === 'resetPassword' && oobCode) return { modo, oobCode };
  return null;
}

// ─── La contraseña nueva ──────────────────────────────────────────────────────

/** Firebase exige 6; se dice antes de mandar, no después. */
export function validarNuevaContrasena(a: string, b: string): string | null {
  if (a.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
  if (a !== b) return 'Las dos contraseñas no coinciden.';
  return null;
}
