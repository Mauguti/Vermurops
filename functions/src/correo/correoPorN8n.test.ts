/**
 * El canal de salida de correo, con `fetch` simulado.
 *
 * Aquí vive el CAMINO BUENO: en el emulador no hay n8n, así que el e2e solo
 * puede comprobar el fallo. Si el 200 no se prueba en algún lado, el día que
 * se rompa nadie se enteraría hasta que una invitación no llegue — que es
 * exactamente lo que pasó el 13-oct.
 *
 * Y los fallos importan igual: el 401 se lee como «no tengo permiso» cuando
 * es la credencial del servidor (la trampa de §4.29 y §4.35).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bloqueadoEnEmulador, detalleDelCuerpo, enviarCorreoPorN8n, mensajeDeFallo,
} from './correoPorN8n.js';

const CORREO = {
  para: 'andrea.guerrero@vermur.com',
  asunto: 'Te invitaron a VermurOps',
  html: '<p>hola</p>',
  texto: 'hola',
};
const OPC = { url: 'https://n8n.vermur.mx/webhook/enviar-correo', token: 'tok' };

const responder = (status: number, cuerpo: unknown) =>
  vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)),
  });

afterEach(() => { vi.unstubAllGlobals(); });

describe('el camino bueno', () => {
  it('un 200 con ok:true es enviado', async () => {
    vi.stubGlobal('fetch', responder(200, { ok: true, id: 'm1', para: CORREO.para }));
    await expect(enviarCorreoPorN8n(CORREO, OPC)).resolves.toEqual({ ok: true });
  });

  it('manda el token en X-Vermur-Token y el cuerpo que el flujo espera', async () => {
    const f = responder(200, { ok: true });
    vi.stubGlobal('fetch', f);
    await enviarCorreoPorN8n(CORREO, OPC);

    const [url, init] = f.mock.calls[0];
    expect(url).toBe(OPC.url);
    expect((init.headers as Record<string, string>)['X-Vermur-Token']).toBe('tok');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      para: CORREO.para, asunto: CORREO.asunto, html: CORREO.html, texto: CORREO.texto,
      nombreRemitente: 'VermurOps',
    });
  });

  it('sin `texto` ni `responderA` esas claves NO viajan: un null rompería la validación del flujo', async () => {
    const f = responder(200, { ok: true });
    vi.stubGlobal('fetch', f);
    await enviarCorreoPorN8n({ para: 'a@vermur.com', asunto: 'x', html: 'y' }, OPC);
    const body = JSON.parse(f.mock.calls[0][1].body as string);
    expect('texto' in body).toBe(false);
    expect('responderA' in body).toBe(false);
  });

  /*
   * El flujo contesta 200 en el camino bueno. Si algún día contestara 200 con
   * `ok: false`, tratarlo como éxito diría «ya salió» de un correo que no
   * salió — el mismo pecado que `sendPasswordResetEmail` resolviendo sin
   * error mientras el mensaje moría.
   */
  it('un 200 con ok:false NO es enviado', async () => {
    vi.stubGlobal('fetch', responder(200, { ok: false, error: 'dominio no permitido: x@gmail.com' }));
    const r = await enviarCorreoPorN8n(CORREO, OPC);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('dominio no permitido');
  });

  it('un 200 sin JSON se toma como enviado: el flujo respondió', async () => {
    vi.stubGlobal('fetch', responder(200, 'OK'));
    await expect(enviarCorreoPorN8n(CORREO, OPC)).resolves.toEqual({ ok: true });
  });
});

describe('los fallos se distinguen, y dicen a quién avisar', () => {
  it('401: es NUESTRO token, no el permiso de quien aprieta el botón', async () => {
    vi.stubGlobal('fetch', responder(401, 'no autorizado'));
    const r = await enviarCorreoPorN8n(CORREO, OPC);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('X-Vermur-Token');
    // Lo que NO debe decir, porque mandaría a la persona equivocada:
    expect(r.error).not.toMatch(/no tienes permiso/i);
  });

  it('404: el flujo no está activado en n8n', async () => {
    vi.stubGlobal('fetch', responder(404, ''));
    const r = await enviarCorreoPorN8n(CORREO, OPC);
    expect(r.error).toContain('no está activado');
  });

  it('400: el flujo rechazó el cuerpo, y se dice por qué', async () => {
    vi.stubGlobal('fetch', responder(400, { ok: false, error: 'falta «asunto»' }));
    const r = await enviarCorreoPorN8n(CORREO, OPC);
    expect(r.error).toContain('falta «asunto»');
  });

  it('502: Gmail no aceptó el envío, con su detalle', async () => {
    vi.stubGlobal('fetch', responder(502, { ok: false, error: 'Gmail no aceptó el envío', detalle: 'quota' }));
    const r = await enviarCorreoPorN8n(CORREO, OPC);
    expect(r.error).toContain('Gmail');
    expect(r.error).toContain('quota');
  });

  it('n8n inalcanzable: no lanza, devuelve el motivo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const r = await enviarCorreoPorN8n(CORREO, OPC);
    expect(r).toEqual({ ok: false, error: expect.stringContaining('No se pudo contactar a n8n') });
  });

  it('timeout: lo dice y sugiere reenviar', async () => {
    const abort = Object.assign(new Error('abort'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
    const r = await enviarCorreoPorN8n(CORREO, OPC);
    expect(r.error).toContain('30 segundos');
    expect(r.error).toContain('Reenviar invitación');
  });

  /*
   * Sin token no se intenta el envío: pegarle a n8n sin credencial solo
   * produce un 401 que se ve igual que una credencial equivocada.
   */
  it('sin token no se llama a n8n', async () => {
    const f = responder(200, { ok: true });
    vi.stubGlobal('fetch', f);
    const r = await enviarCorreoPorN8n(CORREO, { ...OPC, token: '' });
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('detalleDelCuerpo', () => {
  it('saca error y detalle del JSON del flujo', () => {
    expect(detalleDelCuerpo('{"error":"a","detalle":"b"}')).toBe('a · b');
  });
  it('un cuerpo que no es JSON se recorta y se enseña tal cual', () => {
    expect(detalleDelCuerpo('<html>502 Bad Gateway</html>')).toContain('502 Bad Gateway');
  });
  it('mensajeDeFallo no se queda sin texto cuando el cuerpo viene vacío', () => {
    expect(mensajeDeFallo(500, '')).toContain('sin detalle');
  });
});

describe('el emulador no le pega a producción', () => {
  /*
   * Lo delató el e2e: el paso 1 tardaba 31 segundos esperando a que la
   * petición a `n8n.vermur.mx` se rindiera. Y el flujo acepta cualquier
   * destinatario `@vermur.com`, así que una corrida de pruebas podía mandar
   * invitaciones REALES al equipo.
   */
  it('bloquea una URL de producción cuando corre en el emulador', () => {
    const m = bloqueadoEnEmulador('https://n8n.vermur.mx/webhook/enviar-correo', true);
    expect(m).toContain('En emulador no se manda correo de verdad');
    expect(m).toContain('n8n.vermur.mx');
  });

  it.each([
    'http://127.0.0.1:5678/webhook/enviar-correo',
    'http://localhost:5678/webhook/enviar-correo',
    'http://[::1]:5678/webhook/enviar-correo',
  ])('deja pasar %s: es un n8n local', (url) => {
    expect(bloqueadoEnEmulador(url, true)).toBeNull();
  });

  it('en producción no bloquea nada', () => {
    expect(bloqueadoEnEmulador('https://n8n.vermur.mx/webhook/enviar-correo', false)).toBeNull();
  });

  /*
   * El dominio no se compara con `includes`: `https://127.0.0.1.evil.com`
   * contiene «127.0.0.1» y no es local.
   */
  it('un dominio que solo CONTIENE 127.0.0.1 no cuenta como local', () => {
    expect(bloqueadoEnEmulador('https://127.0.0.1.malo.com/webhook', true)).not.toBeNull();
  });

  it('y no se llama a fetch: el mensaje no sale ni a medias', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const previo = process.env.FUNCTIONS_EMULATOR;
    process.env.FUNCTIONS_EMULATOR = 'true';
    try {
      const r = await enviarCorreoPorN8n(CORREO, OPC);
      expect(r.ok).toBe(false);
      expect(f).not.toHaveBeenCalled();
    } finally {
      if (previo === undefined) delete process.env.FUNCTIONS_EMULATOR;
      else process.env.FUNCTIONS_EMULATOR = previo;
    }
  });
});
