/**
 * tipoCambio.ts — consulta programada y bajo demanda del tipo de cambio.
 *
 * ── Dos funciones, una lógica ────────────────────────────────────────────────
 *
 * 1. `tipoCambioProgramado` — se ejecuta cada 2 horas de 8:00 a 18:00 en días
 *    hábiles (lun-vie, America/Mexico_City). Consulta el webhook de n8n
 *    `/tipo-cambio`, que a su vez consulta el SIE de Banxico, y persiste el
 *    resultado en Firestore:
 *      - `tiposCambio/{YYYY-MM-DD}` con el FIX por fecha de determinación
 *      - `configuracion/tipoCambio` con el último valor conocido
 *
 * 2. `actualizarTipoCambio` — misma lógica, invocable desde la app con auth.
 *    Solo admin, administracion y pricing.
 *
 * ── n8n INTERPRETA; la Function DECIDE Y ESCRIBE ────────────────────────────
 * El webhook de n8n consulta Banxico y normaliza. Esta función valida, compara
 * contra lo guardado, y solo escribe cuando el dato cambió.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { verificarUsuario, exigirCapacidad, ErrorAuth } from '../comun/auth.js';

// ── Params ──────────────────────────────────────────────────────────────────

const VERMUR_N8N_TOKEN = defineSecret('VERMUR_N8N_TOKEN');

const N8N_WEBHOOK_URL_TIPO_CAMBIO = defineString('N8N_WEBHOOK_URL_TIPO_CAMBIO', {
  default: 'https://n8n.vermur.mx/webhook/tipo-cambio',
  description: 'Webhook de n8n que consulta el SIE de Banxico.',
});

// ── Tipos (espejo de src/lib/tipoCambioBanxico.ts, sin compartir módulo) ────

interface SerieBanxico {
  serie: string;
  titulo: string;
  fecha: string | null;
  valor: number | null;
}

interface RespuestaN8n {
  ok: boolean;
  fuente?: string;
  consultado?: string;
  series?: SerieBanxico[];
  error?: string;
}

const SERIE_FIX = 'SF43718';
const SERIE_FIX_LIQUIDACION = 'SF60653';

// ── Lógica compartida ───────────────────────────────────────────────────────

async function consultarYGuardar(secreto: string, origen: string): Promise<{ ok: boolean; mensaje: string; valor?: number }> {
  const url = N8N_WEBHOOK_URL_TIPO_CAMBIO.value();
  const ahora = new Date().toISOString();

  // 1. Llamar a n8n
  let respuesta: globalThis.Response;
  try {
    respuesta = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Vermur-Token': secreto,
      },
      body: JSON.stringify({ series: [SERIE_FIX, SERIE_FIX_LIQUIDACION] }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const msg = `No se pudo contactar a n8n: ${String(err)}`;
    logger.error(msg, { origen, url });
    return { ok: false, mensaje: msg };
  }

  if (!respuesta.ok) {
    const texto = await respuesta.text().catch(() => '');
    logger.error('n8n respondió con error', {
      origen, url, status: respuesta.status, texto: texto.slice(0, 2000),
    });
    return { ok: false, mensaje: `n8n respondió ${respuesta.status}` };
  }

  let datos: RespuestaN8n;
  try {
    datos = await respuesta.json() as RespuestaN8n;
  } catch {
    logger.error('n8n devolvió algo que no es JSON', { origen });
    return { ok: false, mensaje: 'Respuesta ilegible de n8n.' };
  }

  if (!datos.ok || !Array.isArray(datos.series)) {
    logger.warn('n8n respondió sin datos', { origen, error: datos.error });
    return { ok: false, mensaje: datos.error ?? 'Banxico no devolvió datos.' };
  }

  // 2. Extraer SF43718 (FIX por fecha de determinación)
  const fix = datos.series.find(s => s.serie === SERIE_FIX);
  if (!fix || fix.valor == null || !fix.fecha) {
    const msg = `Serie ${SERIE_FIX} sin dato (puede ser N/E en día inhábil).`;
    logger.warn(msg, { origen, series: datos.series });
    // Aun sin dato nuevo, actualizar la hora de la última consulta
    const db = getFirestore();
    await db.doc('configuracion/tipoCambio').set(
      { ultimaConsulta: ahora },
      { merge: true },
    );
    return { ok: false, mensaje: msg };
  }

  const fixLiq = datos.series.find(s => s.serie === SERIE_FIX_LIQUIDACION);

  // 3. Comparar contra lo guardado
  const db = getFirestore();
  const docRef = db.doc(`tiposCambio/${fix.fecha}`);
  const snap = await docRef.get();

  const yaExiste = snap.exists;
  const anterior = snap.data();
  const mismoValor = yaExiste && anterior?.valor === fix.valor;

  // 4. Escribir solo si cambió la fecha o el valor
  const registro = {
    valor: fix.valor,
    fechaDeterminacion: fix.fecha,
    fechaLiquidacion: fixLiq?.fecha ?? null,
    consultado: datos.consultado ?? ahora,
    fuente: 'banxico' as const,
    serie: SERIE_FIX,
  };

  if (!mismoValor) {
    await docRef.set(registro);
    logger.info('Tipo de cambio guardado', {
      origen, valor: fix.valor, fecha: fix.fecha,
      nuevo: !yaExiste,
    });
  }

  // 5. Actualizar configuracion/tipoCambio siempre (al menos la hora)
  const config = {
    valor: fix.valor,
    fechaDeterminacion: fix.fecha,
    fechaLiquidacion: fixLiq?.fecha ?? null,
    consultado: datos.consultado ?? ahora,
    fuente: 'banxico' as const,
    ultimaConsulta: ahora,
  };
  await db.doc('configuracion/tipoCambio').set(config);

  const accion = mismoValor ? 'Sin cambio' : (yaExiste ? 'Actualizado' : 'Nuevo');
  logger.info(`${accion}: ${fix.valor} MXN/USD (${fix.fecha})`, { origen });

  return { ok: true, mensaje: `${accion}: ${fix.valor} MXN/USD del ${fix.fecha}`, valor: fix.valor };
}

// ── Function programada ─────────────────────────────────────────────────────

/**
 * Cada 2 horas de 8:00 a 18:00, lunes a viernes, hora de la Cd. de México.
 * 6 consultas al día como máximo.
 *
 * No filtra días festivos de México (Banxico no publica en festivos y la
 * función simplemente no encontrará dato nuevo). Es tolerante: no pisa nada
 * cuando no hay dato y actualiza la hora de la última consulta.
 */
export const tipoCambioProgramado = onSchedule(
  {
    schedule: '0 8,10,12,14,16,18 * * 1-5',
    timeZone: 'America/Mexico_City',
    region: 'us-central1',
    secrets: [VERMUR_N8N_TOKEN],
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async () => {
    await consultarYGuardar(VERMUR_N8N_TOKEN.value(), 'programado');
  },
);

// ── Function bajo demanda ───────────────────────────────────────────────────

/**
 * «Actualizar ahora» desde la app.
 * Solo admin, administracion y pricing (capacidad `tipoCambio.actualizar`).
 */
export const actualizarTipoCambio = onRequest(
  {
    region: 'us-central1',
    secrets: [VERMUR_N8N_TOKEN],
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

    // Auth
    let usuario;
    try {
      usuario = await verificarUsuario(req);
      exigirCapacidad(usuario, 'tipoCambio.actualizar');
    } catch (err) {
      const e = err as ErrorAuth;
      res.status(e.status ?? 401).json({ ok: false, error: e.message });
      return;
    }

    logger.info('Actualización manual de tipo de cambio', {
      uid: usuario.uid, rol: usuario.rol,
    });

    const resultado = await consultarYGuardar(VERMUR_N8N_TOKEN.value(), `manual:${usuario.email}`);
    res.status(resultado.ok ? 200 : 502).json(resultado);
  },
);
