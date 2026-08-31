/**
 * extraerTarifas.ts
 *
 * Proxy entre la app y el agente de n8n que interpreta tarifarios (TA-3).
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * El webhook de n8n está expuesto públicamente. Si el navegador lo llamara
 * directo, la URL quedaría en el bundle sin autenticación de por medio:
 * cualquiera podría disparar ejecuciones y consumo de IA a costa de Vermur, y
 * el permiso `tarifario.cargar` sería decorativo porque el endpoint no lo
 * verifica.
 *
 * Esta función hace tres cosas y nada más:
 *   1. valida el token de Firebase Auth
 *   2. comprueba `tarifario.cargar`
 *   3. reenvía a n8n con el secreto, que vive del lado del servidor
 *
 * NO escribe en Firestore. El agente extrae y propone; la app decide y
 * escribe, con sus permisos y su pantalla de revisión. La IA se equivoca y una
 * tarifa mal cargada se propaga a cotizaciones reales.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { verificarUsuario, exigirCapacidad, ErrorAuth } from '../comun/auth.js';

/** Secreto compartido con n8n. Se manda en X-Vermur-Token. */
const VERMUR_N8N_TOKEN = defineSecret('VERMUR_N8N_TOKEN');

const ENDPOINT_N8N = 'https://n8n.vermur.mx/webhook/extraer-tarifas';

/** La IA sobre un PDF escaneado puede tardar. Más allá, algo se atoró. */
const TIMEOUT_MS = 120_000;

export const extraerTarifas = onRequest(
  {
    region: 'us-central1',
    secrets: [VERMUR_N8N_TOKEN],
    timeoutSeconds: 180,
    memory: '512MiB',
    cors: true,
    maxInstances: 10,
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
      exigirCapacidad(usuario, 'tarifario.cargar');
    } catch (err) {
      const e = err as ErrorAuth;
      const status = e.status ?? 401;
      logger.warn('Acceso rechazado a extraerTarifas', { status, mensaje: e.message });
      res.status(status).json({ ok: false, error: e.message });
      return;
    }

    const secreto = VERMUR_N8N_TOKEN.value();
    if (!secreto) {
      // Mejor fallar claro que llamar sin el header y que n8n rechace con un
      // error que no dice nada.
      logger.error('VERMUR_N8N_TOKEN no está configurado');
      res.status(500).json({
        ok: false,
        error: 'El servidor no tiene configurado el acceso al extractor.',
      });
      return;
    }

    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), TIMEOUT_MS);

    try {
      logger.info('Extrayendo tarifas', { uid: usuario.uid, rol: usuario.rol });

      const respuesta = await fetch(ENDPOINT_N8N, {
        method: 'POST',
        headers: {
          'Content-Type': req.get('content-type') ?? 'application/json',
          'X-Vermur-Token': secreto,
        },
        // rawBody conserva el multipart tal cual llegó, con sus fronteras:
        // reserializarlo rompería la subida del archivo.
        body: req.rawBody
          ? new Uint8Array(req.rawBody)
          : JSON.stringify(req.body ?? {}),
        signal: control.signal,
      });

      const texto = await respuesta.text();

      if (!respuesta.ok) {
        logger.error('n8n respondió con error', { status: respuesta.status, texto: texto.slice(0, 500) });
        res.status(502).json({
          ok: false,
          error: `El extractor respondió con error ${respuesta.status}.`,
        });
        return;
      }

      // Se devuelve tal cual: la app tiene su propio validador de frontera y
      // no conviene que dos capas interpreten el mismo contrato.
      try {
        res.status(200).json(JSON.parse(texto));
      } catch {
        logger.error('n8n devolvió algo que no es JSON', { texto: texto.slice(0, 500) });
        res.status(502).json({ ok: false, error: 'El extractor devolvió una respuesta ilegible.' });
      }
    } catch (err) {
      const abortado = (err as Error)?.name === 'AbortError';
      logger.error('Fallo al llamar al extractor', { err: String(err), abortado });
      res.status(abortado ? 504 : 502).json({
        ok: false,
        error: abortado
          ? 'El extractor tardó demasiado. El documento puede ser muy grande o estar escaneado.'
          : 'No se pudo contactar al extractor.',
      });
    } finally {
      clearTimeout(reloj);
    }
  },
);
