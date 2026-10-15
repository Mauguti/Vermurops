/**
 * invitacion.ts — el texto del correo de invitación. Funciones PURAS.
 *
 * Separado de `gestionarUsuarios` para poder probar el cuerpo sin Admin SDK
 * ni n8n: el asunto y el HTML son lo que lee una persona que todavía no
 * entra a la plataforma, y una liga mal armada se ve perfectamente bien.
 */

import type { UserRole } from '../comun/auth.js';

/** Cómo se le dice a cada rol en el correo. «admin» no se dice «admin». */
export const ETIQUETA_ROL: Record<UserRole, string> = {
  ventas: 'Ventas',
  pricing: 'Pricing',
  operaciones: 'Operaciones',
  administracion: 'Administración',
  admin: 'Administrador de la plataforma',
};

export function etiquetaDeRol(rol: string): string {
  return (ETIQUETA_ROL as Record<string, string>)[rol] ?? rol;
}

export function asuntoInvitacion(esReenvio: boolean): string {
  return esReenvio
    ? 'Recordatorio: crea tu contraseña de VermurOps'
    : 'Te invitaron a VermurOps: crea tu contraseña';
}

export interface DatosInvitacion {
  nombre: string;
  rol: string;
  /** Correo de quien invitó. Se dice QUIÉN: un correo sin remitente humano se borra. */
  invitadoPor: string;
  /** El enlace de un solo uso de `generatePasswordResetLink`. */
  enlace: string;
  /** La dirección de la plataforma, para después de poner la contraseña. */
  urlApp: string;
  esReenvio?: boolean;
}

/** Escapa lo que viene de un formulario: un nombre con `<` rompería el HTML. */
export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/*
 * El morado de la marca, escrito aquí a propósito: un correo no carga el CSS
 * de la app, y los clientes de correo tiran las hojas de estilo. Todo va en
 * línea. `--color-primario` es #4B2A8C (§4.20).
 */
const MORADO = '#4B2A8C';

export function htmlInvitacion(d: DatosInvitacion): string {
  const nombre = escaparHtml(d.nombre.trim().split(/\s+/)[0] || d.nombre);
  const rol = escaparHtml(etiquetaDeRol(d.rol));
  const invitadoPor = escaparHtml(d.invitadoPor);
  const saludo = d.esReenvio
    ? `Hola ${nombre}: tu invitación a <strong>VermurOps</strong> sigue pendiente.`
    : `Hola ${nombre}: <strong>${invitadoPor}</strong> te dio acceso a <strong>VermurOps</strong>, la plataforma de Vermur.`;

  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;padding:32px">
        <tr><td style="font-size:20px;font-weight:700;color:${MORADO};padding-bottom:16px">VermurOps</td></tr>
        <tr><td style="font-size:15px;line-height:1.6;padding-bottom:8px">${saludo}</td></tr>
        <tr><td style="font-size:15px;line-height:1.6;padding-bottom:24px">
          Tu perfil es <strong>${rol}</strong>.${d.esReenvio ? ` Te invitó ${invitadoPor}.` : ''}
          Para entrar solo falta que pongas tu contraseña:
        </td></tr>
        <tr><td align="center" style="padding-bottom:24px">
          <a href="${d.enlace}" style="display:inline-block;background:${MORADO};color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 28px;border-radius:8px">Crear mi contraseña</a>
        </td></tr>
        <tr><td style="font-size:13px;line-height:1.6;color:#555;padding-bottom:24px">
          El enlace es de un solo uso y caduca. Si ya venció, pídele a ${invitadoPor} que te reenvíe la invitación.
        </td></tr>
        <tr><td style="font-size:13px;line-height:1.6;color:#555;border-top:1px solid #e5e5e5;padding-top:16px">
          Después entras siempre por <a href="${d.urlApp}" style="color:${MORADO}">${d.urlApp}</a>.
        </td></tr>
        <tr><td style="font-size:12px;color:#888;padding-top:16px">
          Si no esperabas este correo, ignóralo: sin poner contraseña, la cuenta no se puede usar.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * La versión en texto plano.
 *
 * No se deriva del HTML: aquí el HTML es una tabla de maquetado y el texto
 * que saldría sería ilegible. Un correo que solo trae HTML cae más seguido
 * en correo no deseado (§4.29).
 */
export function textoInvitacion(d: DatosInvitacion): string {
  const nombre = d.nombre.trim().split(/\s+/)[0] || d.nombre;
  return [
    d.esReenvio
      ? `Hola ${nombre}: tu invitación a VermurOps sigue pendiente.`
      : `Hola ${nombre}: ${d.invitadoPor} te dio acceso a VermurOps, la plataforma de Vermur.`,
    '',
    `Tu perfil es ${etiquetaDeRol(d.rol)}.`,
    '',
    'Crea tu contraseña aquí:',
    d.enlace,
    '',
    'El enlace es de un solo uso y caduca. Si ya venció, pide que te reenvíen la invitación.',
    '',
    `Después entras siempre por ${d.urlApp}`,
  ].join('\n');
}
