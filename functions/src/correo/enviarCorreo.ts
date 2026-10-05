/**
 * enviarCorreo.ts — el correo saliente de VermurOps por Exchange (Microsoft 365).
 *
 * Tarea 64. Dos puertas a la MISMA lógica, como `tipoCambio.ts`:
 *
 *   1. `enviarCorreoInterno(correo)` — para que otras Functions manden avisos.
 *      Quien lo importe tiene que declarar `SECRETOS_CORREO` en sus `secrets`:
 *      un secreto que la función no declara no llega a su `process.env`.
 *
 *   2. `enviarCorreo` — HTTP, para el botón «Enviar correo de prueba» de
 *      Configuración → Integraciones. Solo `admin` (capacidad `correo.probar`).
 *      Pública en la RED, cerrada en el CÓDIGO, igual que las otras.
 *
 * ── Nada está conectado todavía ─────────────────────────────────────────────
 * Punto 5 de la tarea: esto es la base y la prueba. **Ninguna notificación
 * real pasa por aquí.** Las de rol siguen sin llegar a nadie (CLAUDE.md §6) y
 * conectarlas es otra tarea, con su decisión de qué se avisa por correo.
 *
 * ── Credenciales ────────────────────────────────────────────────────────────
 * Usuario y contraseña son secretos de Secret Manager. El sprint no los crea
 * ni los lee: el comando que los pone está en el reporte de la tarea.
 *
 * Sin credenciales en PRODUCCIÓN el envío falla con etapa «configuración». No
 * cae a un transporte de prueba: un envío que se ve exitoso y nunca sale es
 * peor que uno que falla (CLAUDE.md §3).
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import nodemailer from 'nodemailer';

import { verificarUsuario, exigirCapacidad, ErrorAuth, EN_EMULADOR } from '../comun/auth.js';
import {
  armarMensaje,
  correoDePrueba,
  diagnosticoDeFalla,
  ErrorCorreo,
  esCorreoValido,
  type CorreoPorEnviar,
  type DiagnosticoCorreo,
  type MensajeArmado,
} from './mensajeCorreo.js';
import { configuracionSmtp, modoDeEnvio, type ModoEnvio } from './configuracionSmtp.js';

// ── Secretos ────────────────────────────────────────────────────────────────

export const CORREO_SMTP_USUARIO = defineSecret('CORREO_SMTP_USUARIO');
export const CORREO_SMTP_PASSWORD = defineSecret('CORREO_SMTP_PASSWORD');

/**
 * Para que otra Function pueda mandar correo:
 *
 *     export const miFuncion = onRequest({ secrets: [...SECRETOS_CORREO] }, …)
 */
export const SECRETOS_CORREO = [CORREO_SMTP_USUARIO, CORREO_SMTP_PASSWORD];

// ── Resultado ───────────────────────────────────────────────────────────────

export interface ResultadoEnvio {
  ok: boolean;
  /** `captura` = se armó y no se envió (emulador sin credenciales). */
  modo: ModoEnvio;
  mensaje: string;
  /** Lo que Exchange devolvió como id del mensaje. */
  mensajeId?: string;
  aceptados?: string[];
  rechazados?: string[];
  /** Solo en modo `captura`: el mensaje que se habría enviado. */
  capturado?: MensajeArmado;
  diagnostico?: DiagnosticoCorreo;
}

// ── Envío ───────────────────────────────────────────────────────────────────

function credenciales(): { usuario: string; password: string } {
  return {
    usuario: CORREO_SMTP_USUARIO.value().trim(),
    password: CORREO_SMTP_PASSWORD.value(),
  };
}

/**
 * Manda un correo. **No lanza por una falla de envío**: devuelve `ok: false`
 * con el diagnóstico.
 *
 * Es a propósito. El primer consumidor real va a ser una notificación dentro
 * de otro flujo —una orden autorizada, una cotización enviada— y que ese flujo
 * se caiga porque el servidor de correo está mal sería peor que el aviso que
 * no llegó. Quien quiera tratarlo como error, mira `ok`.
 */
export async function enviarCorreoInterno(correo: CorreoPorEnviar): Promise<ResultadoEnvio> {
  const config = configuracionSmtp(process.env);
  const { usuario, password } = credenciales();
  const modo = modoDeEnvio({
    enEmulador: EN_EMULADOR,
    hayCredenciales: Boolean(usuario && password),
    modoPedido: process.env.CORREO_MODO,
  });

  // El buzón remitente sale del secreto. En modo captura no hay secreto, así
  // que se usa un buzón de utilería para poder probar el armado completo.
  const buzon = usuario || (modo === 'captura' ? 'notificaciones@vermur.local' : '');

  // 1. Armar y validar antes de abrir conexión.
  let mensaje: MensajeArmado;
  try {
    mensaje = armarMensaje(correo, { usuario: buzon, nombre: config.nombreRemitente });
  } catch (err) {
    const diagnostico = err instanceof ErrorCorreo
      ? err.diagnostico
      : { etapa: 'desconocida' as const, mensaje: String(err) };
    logger.warn('Correo no armado', { etapa: diagnostico.etapa, mensaje: diagnostico.mensaje });
    return { ok: false, modo, mensaje: diagnostico.mensaje, diagnostico };
  }

  // 2. Modo captura: se devuelve el mensaje y no se envía nada.
  if (modo === 'captura') {
    logger.info('Correo CAPTURADO (no se envió)', {
      de: mensaje.from, para: mensaje.to, asunto: mensaje.subject,
    });
    return {
      ok: true,
      modo,
      mensaje: 'Correo armado y capturado: el emulador no envía nada afuera.',
      capturado: mensaje,
    };
  }

  // 3. Producción sin credenciales: error de configuración, no un falso éxito.
  if (!usuario || !password) {
    const diagnostico: DiagnosticoCorreo = {
      etapa: 'configuracion',
      mensaje: 'Faltan las credenciales del correo saliente.',
      sugerencia: 'Hay que crear los secretos CORREO_SMTP_USUARIO y CORREO_SMTP_PASSWORD y volver a desplegar la Function.',
    };
    logger.error(diagnostico.mensaje, { host: config.host, puerto: config.puerto });
    return { ok: false, modo, mensaje: diagnostico.mensaje, diagnostico };
  }

  // 4. Enviar.
  const transporte = nodemailer.createTransport({
    host: config.host,
    port: config.puerto,
    secure: config.seguro,
    requireTLS: config.exigirTls,
    auth: { user: usuario, pass: password },
    connectionTimeout: config.timeoutMs,
    greetingTimeout: config.timeoutMs,
    socketTimeout: config.timeoutMs,
  });

  try {
    const info = await transporte.sendMail(mensaje);
    logger.info('Correo enviado', {
      para: mensaje.to, asunto: mensaje.subject,
      mensajeId: info.messageId, aceptados: info.accepted?.length ?? 0,
    });
    return {
      ok: true,
      modo,
      mensaje: `Correo entregado al servidor (${config.host}).`,
      mensajeId: info.messageId,
      aceptados: (info.accepted ?? []).map(String),
      rechazados: (info.rejected ?? []).map(String),
    };
  } catch (err) {
    const falla = err as { code?: string; responseCode?: number; response?: string; message?: string };
    const diagnostico = diagnosticoDeFalla(falla);
    // La respuesta completa del servidor SOLO al log: puede traer detalle del
    // tenant que no hace falta en la pantalla.
    logger.error(`Correo no enviado (${diagnostico.etapa})`, {
      etapa: diagnostico.etapa,
      code: falla.code,
      responseCode: falla.responseCode,
      respuesta: (falla.response ?? '').slice(0, 2000),
      host: config.host,
      puerto: config.puerto,
    });
    return { ok: false, modo, mensaje: diagnostico.mensaje, diagnostico };
  } finally {
    transporte.close();
  }
}

// ── Function HTTP ───────────────────────────────────────────────────────────

/**
 * `POST /enviarCorreo` con `{ destino }`.
 *
 * Hoy solo manda el correo de prueba: el cuerpo libre no se acepta desde el
 * navegador a propósito. Una Function pública que mande el HTML que le pasen
 * convierte el buzón de Vermur en un relay para quien tenga una sesión.
 */
export const enviarCorreo = onRequest(
  {
    region: 'us-central1',
    secrets: SECRETOS_CORREO,
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Solo se acepta POST.' });
      return;
    }

    let usuario;
    try {
      usuario = await verificarUsuario(req);
      exigirCapacidad(usuario, 'correo.probar');
    } catch (err) {
      const e = err as ErrorAuth;
      res.status(e.status ?? 401).json({ ok: false, error: e.message });
      return;
    }

    // Sin destino explícito, a quien lo pidió: es lo que quiere ver quien
    // aprieta el botón, y no deja mandar correo a terceros por descuido.
    const pedido = (req.body?.destino ?? '').toString().trim().toLowerCase();
    const destino = pedido || usuario.email;
    if (!esCorreoValido(destino)) {
      res.status(400).json({
        ok: false,
        mensaje: `«${destino}» no tiene forma de correo.`,
        diagnostico: { etapa: 'envio', mensaje: 'El destino no es una dirección válida.' },
      });
      return;
    }

    logger.info('Correo de prueba', { uid: usuario.uid, rol: usuario.rol, destino });

    const resultado = await enviarCorreoInterno(
      correoDePrueba(destino, usuario.email, new Date()),
    );

    res.status(resultado.ok ? 200 : 502).json({ ...resultado, destino });
  },
);
