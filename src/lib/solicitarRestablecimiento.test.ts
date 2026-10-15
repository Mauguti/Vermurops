import { describe, expect, it, vi } from 'vitest';
import { solicitarRestablecimiento, MENSAJE_SOLICITUD_ENVIADA } from './solicitarRestablecimiento';

const resp = (status: number, cuerpo: unknown) =>
  vi.fn().mockResolvedValue({ ok: status < 300, status, json: async () => cuerpo }) as unknown as typeof fetch;

describe('solicitarRestablecimiento', () => {
  it('manda el correo recortado por POST y regresa el mensaje del servidor', async () => {
    const f = resp(200, { ok: true, mensaje: 'neutro' });
    const r = await solicitarRestablecimiento('http://x/f', ' a@vermur.com ', f);
    expect(r).toEqual({ ok: true, mensaje: 'neutro' });
    const [, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ email: 'a@vermur.com' });
  });

  it('sin mensaje del servidor, usa el neutro', async () => {
    expect(await solicitarRestablecimiento('u', 'a@b.com', resp(200, { ok: true })))
      .toEqual({ ok: true, mensaje: MENSAJE_SOLICITUD_ENVIADA });
  });

  it('un 400 enseña el texto del servidor', async () => {
    const r = await solicitarRestablecimiento('u', 'x', resp(400, { ok: false, error: 'Escribe un correo válido.' }));
    expect(r).toEqual({ ok: false, error: 'Escribe un correo válido.' });
  });

  it('un 500 o una respuesta rara dan el mensaje genérico, nunca un código', async () => {
    const r = await solicitarRestablecimiento('u', 'a@b.com', resp(500, null));
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/No se pudo enviar/) });
  });

  it('sin red lo dice', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('fail')) as unknown as typeof fetch;
    const r = await solicitarRestablecimiento('u', 'a@b.com', f);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Sin conexión/) });
  });
});
