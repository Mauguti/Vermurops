/**
 * correoPorN8n.ts — el canal de salida de correo de VermurOps.
 *
 * ── Por qué no es `enviarCorreo` ──────────────────────────────────────────
 * Ese nombre ya es de `correo/enviarCorreo.ts`, la Function de SMTP por
 * Exchange (tarea 64) que está **comentada en index.ts** porque declara dos
 * `defineSecret` que no existen en Secret Manager, y un secreto inexistente
 * detiene el deploy de TODAS las Functions (§3). Este módulo NO importa nada
 * de ahí a propósito: tocarlo volvería a traer esos parámetros al análisis
 * del deploy.
 *
 * ── Por qué n8n y no SMTP ─────────────────────────────────────────────────
 * El correo de restablecimiento de Firebase **no llega a vermur.com**: el
 * dominio está en Microsoft 365 con SPF `-all`, sin DKIM ni DMARC propios.
 * Por eso las siete invitaciones del 13-oct nunca llegaron. n8n manda por
 * una cuenta de Gmail real, que sí entrega, y el flujo
 * `docs/n8n/enviar-correo.n8n.json` valida destinatarios y dominios del lado
 * del servidor.
 *
 * ── Contrato del flujo ────────────────────────────────────────────────────
 *   POST  { para, asunto, html, texto?, responderA?, nombreRemitente? }
 *   200   { ok: true,  id, para }
 *   400   { ok: false, error }   el flujo rechazó el cuerpo
 *   502   { ok: false, error, detalle }   Gmail no aceptó el envío
 *
 * **No lanza.** Devuelve `{ ok: false, error }` con el motivo, igual que
 * `enviarCorreoInterno` de la tarea 64: que una invitación se caiga por un
 * fallo de correo sería peor que el aviso que no llegó — la cuenta ya existe
 * y hay un botón para reintentar.
 */

import { defineString } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';

/**
 * ⚠️ `defineString` NUEVO: el deploy de Functions deja de ser desatendido y
 * pide el valor con el default entre paréntesis (§3). El default es
 * PRODUCCIÓN, como el resto: `/webhook-test/` solo responde mientras alguien
 * tiene n8n abierto, así que serviría en pruebas y fallaría en uso real.
 */
export const N8N_WEBHOOK_URL_CORREO = defineString('N8N_WEBHOOK_URL_CORREO', {
  default: 'https://n8n.vermur.mx/webhook/enviar-correo',
  description: 'Webhook de n8n que manda el correo saliente (flujo «enviar-correo»).',
});

/** Más allá de esto, algo se atoró: un correo no tarda medio minuto. */
const TIMEOUT_MS = 30_000;

/**
 * ⛔ El emulador NO le pega al webhook de producción.
 *
 * El default de `N8N_WEBHOOK_URL_CORREO` es producción a propósito, y el
 * emulador de Functions lee los mismos parámetros. Resultado: un
 * `CON_FUNCTIONS=1 ./scripts/e2e.sh` le pegaba a `n8n.vermur.mx` de verdad —y
 * el flujo acepta cualquier destinatario `@vermur.com`, así que una corrida
 * de pruebas podía **mandar invitaciones reales** al equipo. Lo delató que el
 * paso 1 del e2e tardara 31 segundos: estaba esperando a que la petición a
 * producción se rindiera.
 *
 * Así que aquí se corta, no en un `.env` —`.env.local` no se versiona, y una
 * máquina sin ese archivo volvería a pegarle a producción—. Es el mismo
 * criterio del modo `captura` de la tarea 64: en el emulador el mensaje se
 * arma completo, NO sale, y se dice con claridad en vez de fingir un envío.
 *
 * Para probar el envío de verdad contra un n8n local, se apunta la URL a
 * 127.0.0.1 en `functions/.env.local`.
 */
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/;

export function bloqueadoEnEmulador(url: string, enEmulador: boolean): string | null {
  if (!enEmulador || LOCAL.test(url)) return null;
  return `En emulador no se manda correo de verdad: el webhook apunta a producción (${url}). Si quieres probar el envío, apúntalo a 127.0.0.1 en functions/.env.local.`;
}

export interface CorreoSaliente {
  /** Uno o varios destinatarios. El flujo rechaza dominios fuera de Vermur. */
  para: string | string[];
  asunto: string;
  html: string;
  /** Si no viene, el flujo manda solo HTML. */
  texto?: string;
  responderA?: string;
  /** Lo que ve el destinatario como remitente. Default «VermurOps». */
  nombreRemitente?: string;
}

export interface ResultadoCorreo {
  ok: boolean;
  /** Listo para enseñarse en pantalla: dice qué pasó y a quién avisar. */
  error?: string;
}

/**
 * Traduce el fallo a algo que quien lo lea pueda accionar.
 *
 * El 401/403 es la trampa de siempre (§4.29, §4.35): se lee como «mi usuario
 * no tiene permiso» y es la credencial del servidor contra n8n.
 */
export function mensajeDeFallo(status: number, cuerpo: string): string {
  if (status === 401 || status === 403) {
    return 'n8n rechazó nuestro token. Avisa a sistemas: hay que revisar la credencial «X-Vermur-Token» del flujo «enviar-correo» y que coincida con el secreto de Firebase.';
  }
  if (status === 404) {
    return 'El flujo «enviar-correo» de n8n no está activado. Hay que activarlo en n8n.vermur.mx.';
  }
  if (status === 400) {
    return `n8n rechazó el correo: ${cuerpo || 'sin detalle'}.`;
  }
  if (status === 502) {
    return `Gmail no aceptó el envío: ${cuerpo || 'sin detalle'}.`;
  }
  return `n8n contestó ${status}: ${cuerpo || 'sin detalle'}.`;
}

/** Saca el texto accionable del JSON del flujo, sin tragarse un cuerpo raro. */
export function detalleDelCuerpo(texto: string): string {
  try {
    const j = JSON.parse(texto) as { error?: string; detalle?: string };
    return [j.error, j.detalle].filter(Boolean).join(' · ');
  } catch {
    return texto.slice(0, 300);
  }
}

export async function enviarCorreoPorN8n(
  correo: CorreoSaliente,
  opciones: { url: string; token: string },
): Promise<ResultadoCorreo> {
  const bloqueo = bloqueadoEnEmulador(opciones.url, process.env.FUNCTIONS_EMULATOR === 'true');
  if (bloqueo) {
    logger.warn('[correo] envío bloqueado en emulador', { url: opciones.url });
    return { ok: false, error: bloqueo };
  }

  if (!opciones.token) {
    logger.error('[correo] VERMUR_N8N_TOKEN no está configurado');
    return { ok: false, error: 'Falta el token de n8n del lado del servidor. Avisa a sistemas.' };
  }

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(opciones.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Vermur-Token': opciones.token },
      body: JSON.stringify({
        para: correo.para,
        asunto: correo.asunto,
        html: correo.html,
        ...(correo.texto ? { texto: correo.texto } : {}),
        ...(correo.responderA ? { responderA: correo.responderA } : {}),
        nombreRemitente: correo.nombreRemitente ?? 'VermurOps',
      }),
      signal: control.signal,
    });

    const texto = await res.text();
    if (!res.ok) {
      const detalle = detalleDelCuerpo(texto);
      // El cuerpo NO se registra entero: lleva el correo del destinatario.
      logger.error('[correo] n8n no aceptó el envío', { status: res.status, detalle });
      return { ok: false, error: mensajeDeFallo(res.status, detalle) };
    }

    /*
     * Un 200 con `ok: false` existe: el flujo contesta 200 en el camino
     * bueno, pero si algún día cambia y manda 200 con error, tratarlo como
     * éxito diría «ya salió» de un correo que no salió.
     */
    try {
      const j = JSON.parse(texto) as { ok?: boolean; error?: string };
      if (j.ok === false) {
        return { ok: false, error: mensajeDeFallo(200, detalleDelCuerpo(texto)) };
      }
    } catch { /* un 200 sin JSON se toma como enviado: el flujo respondió. */ }

    return { ok: true };
  } catch (err) {
    const esTimeout = (err as { name?: string }).name === 'AbortError';
    logger.error('[correo] no se pudo contactar a n8n', { esTimeout });
    return {
      ok: false,
      error: esTimeout
        ? 'n8n no contestó en 30 segundos. Vuelve a intentar con «Reenviar invitación».'
        : 'No se pudo contactar a n8n para mandar el correo. Avisa a sistemas.',
    };
  } finally {
    clearTimeout(reloj);
  }
}
