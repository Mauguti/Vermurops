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

/** Cómo se llama el agente para quien está trabajando. */
function nombreDelAgente(flujo: string): string {
  return flujo === 'pdf-cotizacion' ? 'El generador de PDF' : 'El clasificador';
}

/**
 * Traduce el estado HTTP del agente a algo accionable. Un «error 404» no le
 * dice nada a quien está trabajando: necesita saber si se arregla solo, si
 * hay que avisarle a alguien, o si el documento es el que está mal.
 *
 * El nombre cambia con el flujo (23-sep-2026): a quien está cotizando, «el
 * clasificador no está disponible» le suena a otra pantalla. Y el 404 de
 * n8n tiene una causa concreta —el flujo no está activado— que se dice.
 */
function mensajeDeError(status: number, flujo: string): string {
  const agente = nombreDelAgente(flujo);
  const esPdf = flujo === 'pdf-cotizacion';
  if (status === 404) {
    return `${agente} no está publicado: el flujo de n8n no está activo. Avisa a sistemas.`;
  }
  if (status === 401 || status === 403) {
    return `${agente} rechazó la conexión. Avisa a sistemas: la credencial no está bien configurada.`;
  }
  if (status === 413) {
    return esPdf
      ? 'La cotización es demasiado grande para el generador de PDF.'
      : 'El documento es demasiado grande para el clasificador.';
  }
  if (status === 429) {
    return `${agente} está saturado. Espera un momento y vuelve a intentarlo.`;
  }
  if (status >= 500) {
    return esPdf
      ? 'El generador de PDF falló al armar el documento. Vuelve a intentarlo; si se repite, avisa a sistemas.'
      : 'El clasificador falló al procesar el documento. Si se repite, avisa a sistemas.';
  }
  return `${agente} respondió con error ${status}.`;
}

/**
 * Hasta cuánto de la respuesta de n8n se guarda en el log cuando falla.
 * Un fallo de n8n trae la causa en el cuerpo («The workflow must be
 * active…», el stack de un nodo); 500 caracteres cortaban justo ahí.
 */
const MAX_LOG_RESPUESTA = 4000;

/** Todo lo que hace falta para depurar un fallo del agente sin volver a reproducirlo. */
function registrarFalloN8n(mensaje: string, flujo: string, url: string, respuesta: globalThis.Response, texto: string): void {
  logger.error(mensaje, {
    flujo,
    url,
    status: respuesta.status,
    statusText: respuesta.statusText,
    contentType: respuesta.headers.get('content-type'),
    bytes: texto.length,
    truncado: texto.length > MAX_LOG_RESPUESTA,
    texto: texto.slice(0, MAX_LOG_RESPUESTA),
  });
}

export interface DestinoProxy {
  /** Nombre del flujo, para los logs. */
  flujo: string;
  /** Capacidad que el usuario debe tener. La del FLUJO, no una genérica. */
  capacidad: string;
  /** URL del webhook de n8n. */
  url: string;
  /**
   * Qué devuelve n8n. 'json' (default) se valida y se reenvía como JSON;
   * 'binario' se reenvía tal cual con su Content-Type — el PDF de la
   * cotización llega así.
   */
  respuesta?: 'json' | 'binario';
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

    if (destino.respuesta === 'binario') {
      if (!respuesta.ok) {
        const texto = await respuesta.text();
        registrarFalloN8n('n8n respondió con error', destino.flujo, destino.url, respuesta, texto);
        res.status(502).json({ ok: false, error: mensajeDeError(respuesta.status, destino.flujo) });
        return;
      }
      // Binario de punta a punta: arrayBuffer → Buffer → send(Buffer). Nunca
      // pasa por text(): decodificar y recodificar un PDF lo corrompe.
      const cuerpo = Buffer.from(await respuesta.arrayBuffer());
      const tipo = respuesta.headers.get('content-type') ?? 'application/octet-stream';
      // Artefacto para depurar sin adivinar (24-sep-2026): qué entregó n8n,
      // tal cual, antes de tocarlo. Un PDF válido empieza con «%PDF-».
      logger.info('n8n devolvió un archivo', {
        flujo: destino.flujo, status: respuesta.status, contentType: tipo, bytes: cuerpo.length,
        primerosBytes: cuerpo.subarray(0, 8).toString('latin1'),
        primerosBytesHex: cuerpo.subarray(0, 8).toString('hex'),
      });
      // Un PDF que llega como JSON de error se vería como archivo corrupto:
      // se rechaza aquí, donde todavía se puede decir qué pasó.
      if (tipo.includes('application/json') || cuerpo.length === 0) {
        registrarFalloN8n('n8n devolvió JSON o vacío donde se esperaba un archivo',
          destino.flujo, destino.url, respuesta, cuerpo.toString('utf8'));
        res.status(502).json({
          ok: false,
          error: `${nombreDelAgente(destino.flujo)} respondió sin el archivo. Avisa a sistemas: el flujo de n8n devolvió datos en vez del PDF.`,
        });
        return;
      }
      if (destino.flujo === 'pdf-cotizacion' && cuerpo.subarray(0, 5).toString('latin1') !== '%PDF-') {
        registrarFalloN8n('n8n devolvió un archivo que no es PDF', destino.flujo, destino.url, respuesta,
          cuerpo.subarray(0, 4000).toString('latin1'));
        res.status(502).json({
          ok: false,
          error: 'El generador devolvió un archivo que no es un PDF. Avisa a sistemas: el flujo de n8n está entregando otra cosa.',
        });
        return;
      }
      res.status(200).set('Content-Type', tipo).set('Content-Length', String(cuerpo.length)).send(cuerpo);
      return;
    }

    const texto = await respuesta.text();

    if (!respuesta.ok) {
      registrarFalloN8n('n8n respondió con error', destino.flujo, destino.url, respuesta, texto);
      res.status(502).json({ ok: false, error: mensajeDeError(respuesta.status, destino.flujo) });
      return;
    }

    // Se devuelve tal cual: la app tiene su propio validador de frontera y no
    // conviene que dos capas interpreten el mismo contrato.
    try {
      res.status(200).json(JSON.parse(texto));
    } catch {
      registrarFalloN8n('n8n devolvió algo que no es JSON', destino.flujo, destino.url, respuesta, texto);
      res.status(502).json({ ok: false, error: 'El clasificador devolvió una respuesta ilegible.' });
    }
  } catch (err) {
    const abortado = (err as Error)?.name === 'AbortError';
    const agente = nombreDelAgente(destino.flujo);
    logger.error('Fallo al llamar al agente de n8n', {
      flujo: destino.flujo, url: destino.url, err: String(err),
      causa: String((err as { cause?: unknown })?.cause ?? ''), abortado,
    });
    res.status(abortado ? 504 : 502).json({
      ok: false,
      error: abortado
        ? (destino.flujo === 'pdf-cotizacion'
          ? 'El generador de PDF tardó demasiado. Vuelve a intentarlo; si se repite, avisa a sistemas.'
          : 'El clasificador tardó demasiado. El documento puede ser muy grande o estar escaneado.')
        : `No se pudo contactar a${agente === 'El clasificador' ? 'l clasificador' : 'l generador de PDF'}. Avisa a sistemas.`,
    });
  } finally {
    clearTimeout(reloj);
  }
}
