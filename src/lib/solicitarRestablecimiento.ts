/**
 * solicitarRestablecimiento.ts — pide el enlace de «¿Olvidaste tu contraseña?»
 * a la Function `solicitarRestablecimiento` (tarea 119).
 *
 * Ya no se usa `sendPasswordResetEmail`: el correo de Firebase no llega a
 * vermur.com y resuelve sin error aunque muera (§4.65). La Function genera el
 * enlace y lo manda por n8n; contesta LO MISMO exista o no la cuenta, así que
 * aquí tampoco hay nada que distinguir: un éxito es un éxito.
 */

import { mensajeDeErrorAuth } from './recuperarContrasena';

export const MENSAJE_SOLICITUD_ENVIADA =
  'Si tu correo está registrado, te llegará un enlace en unos minutos. Revisa también la carpeta de spam.';

export type ResultadoSolicitud = { ok: true; mensaje: string } | { ok: false; error: string };

export async function solicitarRestablecimiento(
  url: string,
  email: string,
  llamar: typeof fetch = fetch,
): Promise<ResultadoSolicitud> {
  let res: Response;
  try {
    res = await llamar(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    });
  } catch {
    return { ok: false, error: mensajeDeErrorAuth('auth/network-request-failed', 'solicitar') };
  }
  const datos = await res.json().catch(() => null) as { ok?: boolean; mensaje?: string; error?: string } | null;
  if (res.ok && datos?.ok) return { ok: true, mensaje: datos.mensaje ?? MENSAJE_SOLICITUD_ENVIADA };
  // El 400 trae un texto pensado para pantalla («Escribe un correo válido…»).
  if (res.status === 400 && datos?.error) return { ok: false, error: datos.error };
  return { ok: false, error: mensajeDeErrorAuth(undefined, 'solicitar') };
}
