import { describe, it, expect } from 'vitest';
import { mensajeDeError, esRechazoDeToken, nombreDelAgente } from './mensajesN8n';

describe('cuándo n8n rechazó el token', () => {
  /*
   * El 401 venía del nodo Code que validaba `process.env.VERMUR_N8N_TOKEN` a
   * mano; el 403 lo pone n8n por su cuenta con Header Auth. Son el mismo
   * problema para quien está trabajando.
   */
  it('401 y 403 son el mismo caso', () => {
    expect(esRechazoDeToken(401)).toBe(true);
    expect(esRechazoDeToken(403)).toBe(true);
  });

  it('y nada más lo es', () => {
    [200, 404, 413, 429, 500, 502, 504].forEach(s =>
      expect(esRechazoDeToken(s)).toBe(false));
  });

  it.each([401, 403])('el mensaje de %s manda a revisar la credencial', (status) => {
    const m = mensajeDeError(status, 'documento-general');
    expect(m).toContain('rechazó nuestro token');
    expect(m).toContain(String(status));
    expect(m).toContain('Token VermurOps');
  });

  it('no se confunde con el flujo inactivo', () => {
    // 404 de n8n significa que el flujo no está activado: otra causa, otro arreglo.
    expect(mensajeDeError(404, 'pdf-cotizacion')).toContain('no está activo');
    expect(mensajeDeError(404, 'pdf-cotizacion')).not.toContain('token');
  });
});

describe('cada flujo se llama por su nombre', () => {
  it.each([
    ['pdf-cotizacion', 'El generador de PDF'],
    ['documento-general', 'El generador de documentos'],
    ['tarifas', 'El clasificador'],
    ['documento-embarque', 'El clasificador'],
  ])('%s → %s', (flujo, nombre) => {
    expect(nombreDelAgente(flujo)).toBe(nombre);
  });
});

describe('el resto de los códigos', () => {
  it('413 habla del tamaño, y distingue PDF de documento', () => {
    expect(mensajeDeError(413, 'pdf-cotizacion')).toContain('cotización es demasiado grande');
    expect(mensajeDeError(413, 'tarifas')).toContain('documento es demasiado grande');
  });

  it('429 pide esperar, no avisar a sistemas', () => {
    expect(mensajeDeError(429, 'tarifas')).toContain('saturado');
  });

  it('5xx pide reintentar', () => {
    expect(mensajeDeError(500, 'tarifas')).toContain('Si se repite');
    expect(mensajeDeError(503, 'pdf-cotizacion')).toContain('Vuelve a intentarlo');
  });
});
