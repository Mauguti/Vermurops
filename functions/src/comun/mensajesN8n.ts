/**
 * mensajesN8n.ts
 *
 * Qué significa cada respuesta de n8n, en el idioma de quien está trabajando.
 *
 * Vive separado del proxy —y sin un solo import— para poder probarlo: es la
 * capa que decide si alguien tiene que avisar a sistemas, reintentar, o
 * cambiar el documento que subió.
 */

/** Cómo se llama el agente para quien está trabajando. */
export function nombreDelAgente(flujo: string): string {
  if (flujo === 'pdf-cotizacion') return 'El generador de PDF';
  if (flujo === 'documento-general') return 'El generador de documentos';
  return 'El clasificador';
}

/**
 * ¿n8n rechazó el token?
 *
 * ── Por qué son DOS códigos (1-oct-2026) ───────────────────────────────────
 * Antes el flujo validaba el token con un nodo Code que leía
 * `process.env.VERMUR_N8N_TOKEN` y contestaba **401** a mano. Esa variable no
 * le llegaba a n8n, así que respondía 401 a todo —incluso con el token
 * correcto, probado con curl—.
 *
 * Ahora la validación es la de n8n: el webhook usa Header Auth con una
 * credencial guardada cifrada, y n8n rechaza por su cuenta con **403**.
 *
 * Los dos significan lo mismo para quien está trabajando: el agente no acepta
 * nuestra credencial. Se tratan igual, y el log dice cuál fue.
 */
export function esRechazoDeToken(status: number): boolean {
  return status === 401 || status === 403;
}

/**
 * Traduce el estado HTTP del agente a algo accionable. Un «error 404» no le
 * dice nada a quien está trabajando: necesita saber si se arregla solo, si
 * hay que avisarle a alguien, o si el documento es el que está mal.
 */
export function mensajeDeError(status: number, flujo: string): string {
  const agente = nombreDelAgente(flujo);
  const esPdf = flujo === 'pdf-cotizacion';

  if (status === 404) {
    return `${agente} no está publicado: el flujo de n8n no está activo. Avisa a sistemas.`;
  }
  if (esRechazoDeToken(status)) {
    return `${agente} rechazó nuestro token (${status}). Avisa a sistemas: hay que revisar la credencial «Token VermurOps» en n8n y que coincida con el secreto de Firebase.`;
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
