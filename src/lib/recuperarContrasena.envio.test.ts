import { describe, it, expect, vi } from 'vitest';
import { enviarCorreoDeAcceso } from './recuperarContrasena';

describe('enviar el correo de acceso', () => {
  it('manda con la URL de regreso', async () => {
    const enviar = vi.fn().mockResolvedValue(undefined);
    await enviarCorreoDeAcceso(enviar, {}, ' alguien@vermur.com ', 'https://app.test');
    expect(enviar).toHaveBeenCalledWith({}, 'alguien@vermur.com', { url: 'https://app.test/' });
  });

  it('si el dominio no está autorizado, reintenta SIN la URL', async () => {
    // Mejor un correo sin botón de regreso que ningún correo.
    const enviar = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'auth/unauthorized-continue-uri' }))
      .mockResolvedValue(undefined);
    await enviarCorreoDeAcceso(enviar, {}, 'a@b.com', 'https://app.test');
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(enviar).toHaveBeenLastCalledWith({}, 'a@b.com');
  });

  it('cualquier otro error sí sube: el envío falló y hay que decirlo', async () => {
    const enviar = vi.fn().mockRejectedValue(
      Object.assign(new Error('x'), { code: 'auth/invalid-email' }));
    await expect(enviarCorreoDeAcceso(enviar, {}, 'a@b.com', 'https://app.test'))
      .rejects.toThrow();
    expect(enviar).toHaveBeenCalledTimes(1);
  });
});
