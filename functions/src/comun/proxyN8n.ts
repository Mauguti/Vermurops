/**
 * proxyN8n.ts
 *
 * El núcleo compartido de todo proxy hacia un agente de n8n.
 *
 * ── El contrato de la arquitectura ─────────────────────────────────────────
 * n8n INTERPRETA Y PROPONE; la app VALIDA Y ESCRIBE. Este proxy existe porque
 * el webhook de n8n es público: si el navegador lo llamara directo, la URL
 * quedaría en el bundle sin autenticación y cualquiera dispararía consumo de
 * IA a costa de Vermur. Aquí se verifica el token de Firebase, se exige la
 * capacidad del flujo, y se reenvía con el secreto del lado del servidor.
 *
 * NO escribe en Firestore, en ningún flujo. La IA se equivoca, y un dato mal
 * clasificado se propaga: una tarifa a cotizaciones reales, un RFC mal leído
 * al expediente que bloquea el timbrado.
 */

import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import * as logger from 'firebase-functions/logger';
import { verificarUsuario, exigirCapacidad, ErrorAuth } from './auth.js';

/** La IA sobre un PDF escaneado puede tardar. Más allá, algo se atoró. */
const TIMEOUT_MS = 120_000;

/**
 * Traduce el estado HTTP del agente a algo accionable. Un «error 404» no le
 * dice nada a quien está trabajando: necesita saber si se arregla solo, si
 * hay que avisarle a alguien, o si el documento es el que está mal.
 */
function mensajeDeError(status: number): string {
  if (status === 404) {
    return 'El clasificador no está disponible. Avisa a sistemas.';
  }
  if (status === 401 || status === 403) {
    return 'El clasificador rechazó la conexión. Avisa a sistemas: la credencial no está bien configurada.';
  }
  if (status === 413) {
    return 'El documento es demasiado grande para el clasificador.';
  }
  if (status === 429) {
    return 'El clasificador está saturado. Espera un momento y vuelve a intentarlo.';
  }
  if (status >= 500) {
    return 'El clasificador falló al procesar el documento. Si se repite, avisa a sistemas.';
  }
  return `El clasificador respondió con error ${status}.`;
}

export interface DestinoProxy {
  /** Nombre del flujo, para los logs. */
  flujo: string;
  /** Capacidad que el usuario debe tener. La del FLUJO, no una genérica. */
  capacidad: string;
  /** URL del webhook de n8n. */
  url: string;
}

/**
 * Maneja una petición completa contra un destino ya resuelto.
 *
 * Quien llama decide el destino (función fija o enrutada por header); esto
 * hace el resto: método, auth, capacidad, reenvío con secreto, timeout y
 * traducción de errores. Idéntico para todos los flujos a propósito — un solo
 * lugar que depurar cuando el agente no conteste.
 */
export async function manejarProxyN8n(
  req: Request,
  res: Response,
  destino: DestinoProxy,
  secreto: string,
): Promise<void> {
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Solo se acepta POST.' });
    return;
  }

  let usuario;
  try {
    usuario = await verificarUsuario(req);
    exigirCapacidad(usuario, destino.capacidad);
  } catch (err) {
    const e = err as ErrorAuth;
    const status = e.status ?? 401;
    logger.warn('Acceso rechazado', { flujo: destino.flujo, status, mensaje: e.message });
    res.status(status).json({ ok: false, error: e.message });
    return;
  }

  if (!secreto) {
    // Mejor fallar claro que llamar sin el header y que n8n rechace con un
    // error que no dice nada.
    logger.error('VERMUR_N8N_TOKEN no está configurado');
    res.status(500).json({
      ok: false,
      error: 'El servidor no tiene configurado el acceso al clasificador.',
    });
    return;
  }

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIMEOUT_MS);

  try {
    logger.info('Clasificando documento', {
      flujo: destino.flujo, uid: usuario.uid, rol: usuario.rol,
    });

    const respuesta = await fetch(destino.url, {
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
      logger.error('n8n respondió con error', {
        flujo: destino.flujo, status: respuesta.status, texto: texto.slice(0, 500),
      });
      res.status(502).json({ ok: false, error: mensajeDeError(respuesta.status) });
      return;
    }

    // Se devuelve tal cual: la app tiene su propio validador de frontera y no
    // conviene que dos capas interpreten el mismo contrato.
    try {
      res.status(200).json(JSON.parse(texto));
    } catch {
      logger.error('n8n devolvió algo que no es JSON', {
        flujo: destino.flujo, texto: texto.slice(0, 500),
      });
      res.status(502).json({ ok: false, error: 'El clasificador devolvió una respuesta ilegible.' });
    }
  } catch (err) {
    const abortado = (err as Error)?.name === 'AbortError';
    logger.error('Fallo al llamar al clasificador', {
      flujo: destino.flujo, err: String(err), abortado,
    });
    res.status(abortado ? 504 : 502).json({
      ok: false,
      error: abortado
        ? 'El clasificador tardó demasiado. El documento puede ser muy grande o estar escaneado.'
        : 'No se pudo contactar al clasificador.',
    });
  } finally {
    clearTimeout(reloj);
  }
}
