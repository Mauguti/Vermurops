/**
 * extraerTarifas.ts
 *
 * Proxy autenticado hacia el agente de n8n que extrae tarifas (§4.10).
 *
 * ── Estado (4-sep-2026) ────────────────────────────────────────────────────
 * El núcleo del proxy se generalizó a `comun/proxyN8n.ts` cuando llegaron los
 * flujos de expediente KYC y documentos de embarque; el enrutado por flujo
 * vive en `clasificarDocumento`. Esta función queda como envoltorio delgado
 * porque el frontend YA DESPLEGADO la llama por nombre: se retira cuando la
 * pantalla de carga de tarifarios migre a `clasificarDocumento` con
 * `X-Vermur-Flujo: tarifas`.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { manejarProxyN8n } from '../comun/proxyN8n.js';

const VERMUR_N8N_TOKEN = defineSecret('VERMUR_N8N_TOKEN');

/**
 * ⚠️ El default es PRODUCCIÓN a propósito: la ruta /webhook-test/ de n8n solo
 * responde mientras alguien tiene el editor abierto, así que como default
 * funcionaría en pruebas y fallaría en uso real — el peor comportamiento
 * posible. Para probar contra el editor, sobreescribir en functions/.env.
 */
const N8N_WEBHOOK_URL = defineString('N8N_WEBHOOK_URL', {
  default: 'https://n8n.vermur.mx/webhook/extraer-tarifas',
  description: 'Webhook de n8n que recibe el documento y devuelve tarifas propuestas.',
});

export const extraerTarifas = onRequest(
  {
    region: 'us-central1',
    secrets: [VERMUR_N8N_TOKEN],
    timeoutSeconds: 180,
    memory: '512MiB',
    cors: true,
    maxInstances: 10,
    // Pública en la RED, cerrada en el CÓDIGO: la auth la hace el proxy.
    invoker: 'public',
  },
  async (req, res) => {
    await manejarProxyN8n(
      req,
      res,
      { flujo: 'tarifas', capacidad: 'tarifario.cargar', url: N8N_WEBHOOK_URL.value() },
      VERMUR_N8N_TOKEN.value(),
    );
  },
);
