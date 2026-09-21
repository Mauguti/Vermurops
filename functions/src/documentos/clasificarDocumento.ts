/**
 * clasificarDocumento.ts
 *
 * UNA función para los tres clasificadores de n8n, enrutada por header.
 *
 * ── Por qué una y no tres ──────────────────────────────────────────────────
 * Los flujos son idénticos salvo dos cosas: a qué webhook van y qué capacidad
 * exigen. Tres funciones serían tres copias del mismo proxy divergiendo en
 * silencio. El header `X-Vermur-Flujo` elige el destino:
 *
 *   tarifas             → extractor de tarifarios     → tarifario.cargar
 *   expediente          → KYC del cliente             → cliente.alta
 *   documento-embarque  → documentos del embarque     → embarque.generar
 *   pdf-cotizacion      → PDF de la cotización (binario) → cotizacion.crear
 *
 * La capacidad es LA DEL FLUJO: el expediente es del alta (Administración) y
 * los documentos del embarque son de Operaciones. Un flujo desconocido se
 * rechaza con 400, nunca cae en un default — mandar un documento al
 * clasificador equivocado produce una respuesta con forma válida y contenido
 * absurdo, que es el peor modo de fallo.
 *
 * `extraerTarifas` (la función original) sigue desplegada para el frontend ya
 * publicado; se retira cuando la pantalla de tarifas migre a esta.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { manejarProxyN8n, DestinoProxy } from '../comun/proxyN8n.js';

const VERMUR_N8N_TOKEN = defineSecret('VERMUR_N8N_TOKEN');

/**
 * ⚠️ Los defaults son PRODUCCIÓN a propósito (confirmados activos por Mau,
 * 4-sep-2026). La ruta /webhook-test/ solo responde mientras alguien tiene
 * n8n abierto: como default funcionaría en pruebas y fallaría en uso real.
 */
const N8N_WEBHOOK_URL = defineString('N8N_WEBHOOK_URL', {
  default: 'https://n8n.vermur.mx/webhook/extraer-tarifas',
  description: 'Webhook de n8n que extrae tarifas.',
});
const N8N_WEBHOOK_URL_EXPEDIENTE = defineString('N8N_WEBHOOK_URL_EXPEDIENTE', {
  default: 'https://n8n.vermur.mx/webhook/clasificar-expediente',
  description: 'Webhook de n8n que clasifica documentos del expediente KYC.',
});
const N8N_WEBHOOK_URL_DOC_EMBARQUE = defineString('N8N_WEBHOOK_URL_DOC_EMBARQUE', {
  default: 'https://n8n.vermur.mx/webhook/clasificar-documento-embarque',
  description: 'Webhook de n8n que clasifica documentos del embarque.',
});
const N8N_WEBHOOK_URL_PDF_COTIZACION = defineString('N8N_WEBHOOK_URL_PDF_COTIZACION', {
  default: 'https://n8n.vermur.mx/webhook/generar-pdf-cotizacion',
  description: 'Webhook de n8n que genera el PDF de la cotización (devuelve application/pdf).',
});

export const clasificarDocumento = onRequest(
  {
    region: 'us-central1',
    secrets: [VERMUR_N8N_TOKEN],
    timeoutSeconds: 180,
    memory: '512MiB',
    cors: true,
    maxInstances: 10,
    // Público en la red, cerrado en el código: la auth la hace el proxy
    // verificando el token de Firebase y la capacidad del flujo.
    invoker: 'public',
  },
  async (req, res) => {
    const flujo = (req.get('x-vermur-flujo') ?? '').trim();

    const destinos: Record<string, Omit<DestinoProxy, 'flujo'>> = {
      'tarifas': { capacidad: 'tarifario.cargar', url: N8N_WEBHOOK_URL.value() },
      'expediente': { capacidad: 'cliente.alta', url: N8N_WEBHOOK_URL_EXPEDIENTE.value() },
      'documento-embarque': { capacidad: 'embarque.generar', url: N8N_WEBHOOK_URL_DOC_EMBARQUE.value() },
      // No clasifica: GENERA. Va por aquí porque el webhook no se llama desde
      // el navegador y el proxy ya resuelve auth, capacidad y secreto.
      'pdf-cotizacion': { capacidad: 'cotizacion.crear', url: N8N_WEBHOOK_URL_PDF_COTIZACION.value(), respuesta: 'binario' },
    };

    const destino = destinos[flujo];
    if (!destino) {
      // Antes de rechazar, dejar pasar el preflight: el navegador manda
      // OPTIONS sin headers propios.
      if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
      res.status(400).json({
        ok: false,
        error: `Flujo desconocido: «${flujo || '(vacío)'}». Manda X-Vermur-Flujo con: ${Object.keys(destinos).join(', ')}.`,
      });
      return;
    }

    await manejarProxyN8n(req, res, { flujo, ...destino }, VERMUR_N8N_TOKEN.value());
  },
);
