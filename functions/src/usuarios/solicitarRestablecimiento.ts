/**
 * solicitarRestablecimiento.ts — «¿Olvidaste tu contraseña?» (tarea 119).
 *
 * Endpoint SIN sesión: quien olvidó su contraseña no tiene token. Es
 * `invoker: 'public'` en la red y cerrado en el código: la respuesta es la
 * misma exista o no la cuenta, y hay límite por correo. La lógica está en
 * `restablecerContrasena.ts`; aquí solo se conecta con Auth, Firestore y n8n.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { enviarCorreoPorN8n, N8N_WEBHOOK_URL_CORREO, urlWebhookCorreo } from '../correo/correoPorN8n.js';
import {
  aplicarLimite, MENSAJE_NEUTRO, normalizarCorreo, procesarSolicitud, type Dependencias,
} from './restablecerContrasena.js';

/** Ya existe en Secret Manager: lo usan los demás proxies de n8n. */
const VERMUR_N8N_TOKEN = defineSecret('VERMUR_N8N_TOKEN');

/** Misma dirección de regreso que la invitación; override por entorno, sin `defineString` (§3). */
const URL_APP = process.env.VERMUR_URL_APP ?? 'https://vermur-logistics-app.web.app';

function dependencias(): Dependencias {
  const db = getFirestore();
  return {
    urlApp: URL_APP,
    async buscarCuenta(correo) {
      try {
        const u = await getAuth().getUserByEmail(correo);
        return { disabled: u.disabled };
      } catch (err) {
        if ((err as { code?: string }).code === 'auth/user-not-found') return null;
        throw err;
      }
    },
    // `limitesCorreo/{hash}`: solo la Function escribe (el Admin SDK no pasa por reglas;
    // el catch-all de firestore.rules niega todo lo demás). No guarda el correo en claro.
    reservarEnvio(hash, ahora) {
      const ref = db.collection('limitesCorreo').doc(hash);
      return db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const previas = (snap.data()?.envios as number[] | undefined) ?? [];
        const r = aplicarLimite(previas, ahora);
        tx.set(ref, { envios: r.marcas });
        return r.permitido;
      });
    },
    generarEnlace: correo => getAuth().generatePasswordResetLink(correo, { url: URL_APP }),
    enviar: correo => enviarCorreoPorN8n(
      { ...correo, nombreRemitente: 'VermurOps' },
      { url: urlWebhookCorreo(N8N_WEBHOOK_URL_CORREO.value()), token: VERMUR_N8N_TOKEN.value() },
    ),
  };
}

export const solicitarRestablecimiento = onRequest(
  { cors: true, invoker: 'public', secrets: [VERMUR_N8N_TOKEN] },
  async (req, res) => {
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Solo POST.' }); return; }

    const correo = normalizarCorreo((req.body as { email?: unknown } | undefined)?.email);
    if (!correo) {
      res.status(400).json({ ok: false, error: 'Escribe un correo válido, por ejemplo nombre@vermur.com.' });
      return;
    }

    const { desenlace } = await procesarSolicitud(dependencias(), correo, Date.now());
    // Solo el desenlace: ni el correo ni el enlace se registran.
    logger.info('[restablecer] solicitud', { desenlace });
    res.status(200).json({ ok: true, mensaje: MENSAJE_NEUTRO });
  },
);
