/**
 * restablecerContrasena.ts — la lógica de «¿Olvidaste tu contraseña?». PURA.
 *
 * Sin Firebase ni n8n adentro: todo lo de afuera entra por `Dependencias`,
 * para fijar con tests las cuatro reglas de la tarea 119:
 *
 *   1. Si el correo existe en Auth, se genera el enlace y se manda por n8n.
 *   2. LA MISMA respuesta siempre, exista o no: no sirve para averiguar
 *      quién tiene cuenta.
 *   3. Máximo 3 envíos por correo por hora; pasado eso, misma respuesta y
 *      no se manda.
 *   4. Una cuenta deshabilitada no recibe enlace.
 *
 * ── Por qué ya no es el correo de Firebase ────────────────────────────────
 * `sendPasswordResetEmail` no llega a vermur.com (SPF `-all`, sin DKIM ni
 * DMARC) y resuelve sin error aunque el mensaje muera después (§4.65).
 *
 * ── Qué cuenta para el límite ─────────────────────────────────────────────
 * TODA solicitud con un correo bien formado, exista o no la cuenta. Contar
 * solo los envíos reales dejaría un rastro distinto para los correos que
 * existen, y el límite mismo serviría para averiguarlo.
 */

import { createHash } from 'node:crypto';
import { escaparHtml } from './invitacion.js';

export const MAX_ENVIOS_POR_HORA = 3;
export const VENTANA_MS = 60 * 60 * 1000;

/** La única respuesta que sale hacia afuera cuando el correo es válido. */
export const MENSAJE_NEUTRO =
  'Si tu correo está registrado, te llegará un enlace en unos minutos. Revisa también la carpeta de spam.';

/** Minúsculas y sin espacios; `null` si no parece un correo. */
export function normalizarCorreo(crudo: unknown): string | null {
  if (typeof crudo !== 'string') return null;
  const limpio = crudo.trim().toLowerCase();
  if (limpio.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) return null;
  return limpio;
}

/**
 * El id del documento de `limitesCorreo`: el correo nunca se guarda en claro.
 * Es un resumen, no un secreto: sirve para contar, no para proteger.
 */
export function hashCorreo(correoNormalizado: string): string {
  return createHash('sha256').update(correoNormalizado).digest('hex');
}

/**
 * Ventana deslizante: se descartan las marcas de más de una hora y, si quedan
 * menos de 3, esta solicitud se anota. Devuelve la lista que hay que guardar
 * (con la marca nueva solo si se permitió).
 */
export function aplicarLimite(
  marcas: readonly number[],
  ahora: number,
): { permitido: boolean; marcas: number[] } {
  const vigentes = marcas.filter(t => ahora - t < VENTANA_MS);
  if (vigentes.length >= MAX_ENVIOS_POR_HORA) return { permitido: false, marcas: vigentes };
  return { permitido: true, marcas: [...vigentes, ahora] };
}

export type Desenlace = 'enviado' | 'sin_cuenta' | 'deshabilitada' | 'limite' | 'fallo';

export interface Dependencias {
  /** `null` si no hay cuenta con ese correo. */
  buscarCuenta(correo: string): Promise<{ disabled: boolean } | null>;
  /** Anota la solicitud; `false` si ya se pasó del límite. */
  reservarEnvio(hash: string, ahora: number): Promise<boolean>;
  generarEnlace(correo: string): Promise<string>;
  enviar(correo: { para: string; asunto: string; html: string; texto: string }): Promise<{ ok: boolean }>;
  urlApp: string;
}

/**
 * Nunca lanza y no dice nada distinto hacia afuera: el `desenlace` es para el
 * registro del servidor, no para quien llamó.
 */
export async function procesarSolicitud(
  deps: Dependencias,
  correoCrudo: string,
  ahora: number,
): Promise<{ desenlace: Desenlace }> {
  const correo = normalizarCorreo(correoCrudo);
  if (!correo) return { desenlace: 'sin_cuenta' };

  try {
    if (!(await deps.reservarEnvio(hashCorreo(correo), ahora))) return { desenlace: 'limite' };

    const cuenta = await deps.buscarCuenta(correo);
    if (!cuenta) return { desenlace: 'sin_cuenta' };
    if (cuenta.disabled) return { desenlace: 'deshabilitada' };

    const enlace = await deps.generarEnlace(correo);
    const r = await deps.enviar({
      para: correo,
      asunto: ASUNTO_RESTABLECER,
      html: htmlRestablecer({ enlace, urlApp: deps.urlApp }),
      texto: textoRestablecer({ enlace, urlApp: deps.urlApp }),
    });
    return { desenlace: r.ok ? 'enviado' : 'fallo' };
  } catch {
    return { desenlace: 'fallo' };
  }
}

// ── El correo ────────────────────────────────────────────────────────────────

export const ASUNTO_RESTABLECER = 'Restablecer contraseña de VermurOps';

export interface DatosRestablecer { enlace: string; urlApp: string }

// El morado de la marca va en línea: un correo no carga el CSS de la app (§4.20).
const MORADO = '#4B2A8C';

export function htmlRestablecer(d: DatosRestablecer): string {
  const urlApp = escaparHtml(d.urlApp);
  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;padding:32px">
        <tr><td style="font-size:20px;font-weight:700;color:${MORADO};padding-bottom:16px">VermurOps</td></tr>
        <tr><td style="font-size:15px;line-height:1.6;padding-bottom:24px">
          Pediste restablecer tu contraseña de <strong>VermurOps</strong>. Para elegir una nueva:
        </td></tr>
        <tr><td align="center" style="padding-bottom:24px">
          <a href="${escaparHtml(d.enlace)}" style="display:inline-block;background:${MORADO};color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 28px;border-radius:8px">Restablecer contraseña</a>
        </td></tr>
        <tr><td style="font-size:13px;line-height:1.6;color:#555;padding-bottom:24px">
          El enlace es de un solo uso y caduca. Si ya venció, vuelve a pedirlo desde «¿Olvidaste tu contraseña?».
        </td></tr>
        <tr><td style="font-size:13px;line-height:1.6;color:#555;border-top:1px solid #e5e5e5;padding-top:16px">
          Después entras por <a href="${urlApp}" style="color:${MORADO}">${urlApp}</a>.
        </td></tr>
        <tr><td style="font-size:12px;color:#888;padding-top:16px">
          Si no lo pediste, ignora este correo: tu contraseña actual sigue igual.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function textoRestablecer(d: DatosRestablecer): string {
  return [
    'Pediste restablecer tu contraseña de VermurOps.',
    '',
    'Elige una nueva aquí:',
    d.enlace,
    '',
    'El enlace es de un solo uso y caduca. Si ya venció, vuelve a pedirlo desde «¿Olvidaste tu contraseña?».',
    '',
    `Después entras por ${d.urlApp}`,
    '',
    'Si no lo pediste, ignora este correo: tu contraseña actual sigue igual.',
  ].join('\n');
}
