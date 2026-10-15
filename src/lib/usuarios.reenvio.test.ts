/**
 * El botón de «Reenviar invitación»: qué dice y cuándo se puede pulsar.
 *
 * Hasta hoy no daba ninguna señal: se pulsaba y no se sabía si había mandado.
 */
import { describe, expect, it } from 'vitest';
import { estadoReenvio, MINUTOS_BLOQUEO_REENVIO } from './usuarios';

const AHORA = new Date('2026-10-15T20:00:00.000Z');
const haceMinutos = (m: number) => new Date(AHORA.getTime() - m * 60_000).toISOString();

describe('sin envío previo', () => {
  it.each([undefined, null, ''])('«%s» → se puede pulsar', (v) => {
    expect(estadoReenvio(v, AHORA)).toEqual({
      bloqueado: false, etiqueta: 'Reenviar invitación', minutos: null,
    });
  });
});

describe('recién enviada', () => {
  it('a los segundos dice «menos de 1 min» y está bloqueada', () => {
    const e = estadoReenvio(haceMinutos(0), AHORA);
    expect(e.bloqueado).toBe(true);
    expect(e.etiqueta).toBe('Enviada hace menos de 1 min');
  });

  it.each([1, 3, 9])('a los %s min dice los minutos y sigue bloqueada', (m) => {
    const e = estadoReenvio(haceMinutos(m), AHORA);
    expect(e.bloqueado).toBe(true);
    expect(e.etiqueta).toBe(`Enviada hace ${m} min`);
    expect(e.minutos).toBe(m);
  });
});

describe('pasados los 10 minutos', () => {
  it.each([10, 11, 60, 1440])('a los %s min se puede volver a enviar', (m) => {
    const e = estadoReenvio(haceMinutos(m), AHORA);
    expect(e.bloqueado).toBe(false);
    expect(e.etiqueta).toBe('Reenviar invitación');
  });

  it('el límite es exactamente el acordado', () => {
    expect(MINUTOS_BLOQUEO_REENVIO).toBe(10);
    expect(estadoReenvio(haceMinutos(MINUTOS_BLOQUEO_REENVIO - 1), AHORA).bloqueado).toBe(true);
    expect(estadoReenvio(haceMinutos(MINUTOS_BLOQUEO_REENVIO), AHORA).bloqueado).toBe(false);
  });
});

describe('lo que no debe dejar a nadie trabado', () => {
  /*
   * Una fecha basura NO bloquea: dejar a alguien sin poder reenviar por un
   * dato mal escrito es peor que permitir un reenvío de más.
   */
  it.each(['no es fecha', '2026-13-45', '{}'])('«%s» no bloquea', (v) => {
    expect(estadoReenvio(v, AHORA).bloqueado).toBe(false);
  });

  /*
   * Un timestamp en el FUTURO —el reloj del servidor adelantado respecto al
   * del navegador— daría minutos negativos y bloquearía un buen rato.
   */
  it('una fecha en el futuro se trata como «ahora mismo», no como negativa', () => {
    const e = estadoReenvio(new Date(AHORA.getTime() + 5 * 60_000).toISOString(), AHORA);
    expect(e.minutos).toBe(0);
    expect(e.etiqueta).toBe('Enviada hace menos de 1 min');
    expect(e.bloqueado).toBe(true);
  });
});
