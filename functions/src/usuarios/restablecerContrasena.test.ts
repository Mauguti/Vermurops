/**
 * Las cuatro reglas de «¿Olvidaste tu contraseña?» (tarea 119), con
 * dependencias simuladas. Cada una se verificó rompiéndola a propósito.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  aplicarLimite, hashCorreo, htmlRestablecer, MAX_ENVIOS_POR_HORA, normalizarCorreo,
  procesarSolicitud, textoRestablecer, VENTANA_MS, type Dependencias,
} from './restablecerContrasena.js';

const T0 = 1_800_000_000_000;

/** Un almacén en memoria con la misma regla de límite que usa la Function. */
function armar(opciones: { cuentas?: Record<string, { disabled: boolean }>; n8nOk?: boolean } = {}) {
  const cuentas = opciones.cuentas ?? { 'ana@vermur.com': { disabled: false } };
  const marcas = new Map<string, number[]>();
  const enviar = vi.fn(async () => ({ ok: opciones.n8nOk ?? true }));
  const generarEnlace = vi.fn(async (c: string) => `https://app/?oobCode=${c}`);
  const deps: Dependencias = {
    urlApp: 'https://app',
    buscarCuenta: async c => cuentas[c] ?? null,
    reservarEnvio: async (hash, ahora) => {
      const r = aplicarLimite(marcas.get(hash) ?? [], ahora);
      marcas.set(hash, r.marcas);
      return r.permitido;
    },
    generarEnlace,
    enviar,
  };
  return { deps, enviar, generarEnlace, marcas };
}

describe('regla 1: si existe, se genera el enlace y se manda', () => {
  it('manda el correo al destinatario con el enlace y el texto de restablecer', async () => {
    const { deps, enviar, generarEnlace } = armar();
    const r = await procesarSolicitud(deps, 'Ana@Vermur.com ', T0);
    expect(r.desenlace).toBe('enviado');
    expect(generarEnlace).toHaveBeenCalledWith('ana@vermur.com');
    const c = (enviar.mock.calls[0] as unknown as [{ para: string; asunto: string; html: string; texto: string }])[0];
    expect(c.para).toBe('ana@vermur.com');
    expect(c.asunto).toMatch(/Restablecer contraseña/);
    expect(c.html).toContain('oobCode=ana@vermur.com');
    expect(c.texto).toContain('oobCode=ana@vermur.com');
  });

  it('si n8n no acepta el envío, lo dice el desenlace (para el log), no lanza', async () => {
    const { deps } = armar({ n8nOk: false });
    expect((await procesarSolicitud(deps, 'ana@vermur.com', T0)).desenlace).toBe('fallo');
  });
});

describe('regla 2: no revela si el correo existe', () => {
  it('un correo sin cuenta NO genera enlace ni manda nada, y no lanza', async () => {
    const { deps, enviar, generarEnlace } = armar();
    const r = await procesarSolicitud(deps, 'nadie@vermur.com', T0);
    expect(r.desenlace).toBe('sin_cuenta');
    expect(generarEnlace).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
  });

  it('con y sin cuenta, la solicitud deja el MISMO rastro en el límite (cuenta toda solicitud)', async () => {
    const a = armar();
    await procesarSolicitud(a.deps, 'ana@vermur.com', T0);
    const b = armar();
    await procesarSolicitud(b.deps, 'nadie@vermur.com', T0);
    expect([...a.marcas.values()][0]).toHaveLength(1);
    expect([...b.marcas.values()][0]).toHaveLength(1);
  });

  it('un fallo al consultar Auth tampoco sale hacia afuera', async () => {
    const { deps } = armar();
    deps.buscarCuenta = async () => { throw new Error('auth caído'); };
    expect((await procesarSolicitud(deps, 'ana@vermur.com', T0)).desenlace).toBe('fallo');
  });

  it('el correo malformado no consulta nada', async () => {
    const { deps, generarEnlace } = armar();
    const buscar = vi.spyOn(deps, 'buscarCuenta');
    await procesarSolicitud(deps, 'no-es-correo', T0);
    expect(buscar).not.toHaveBeenCalled();
    expect(generarEnlace).not.toHaveBeenCalled();
  });
});

describe('regla 3: máximo 3 envíos por correo por hora', () => {
  it('el 4º en la misma hora no manda y no genera enlace', async () => {
    const { deps, enviar, generarEnlace } = armar();
    for (let i = 0; i < MAX_ENVIOS_POR_HORA; i++) {
      expect((await procesarSolicitud(deps, 'ana@vermur.com', T0 + i * 1000)).desenlace).toBe('enviado');
    }
    const cuarto = await procesarSolicitud(deps, 'ana@vermur.com', T0 + 4000);
    expect(cuarto.desenlace).toBe('limite');
    expect(enviar).toHaveBeenCalledTimes(3);
    expect(generarEnlace).toHaveBeenCalledTimes(3);
  });

  it('pasada la hora vuelve a mandar', async () => {
    const { deps, enviar } = armar();
    for (let i = 0; i < 3; i++) await procesarSolicitud(deps, 'ana@vermur.com', T0 + i);
    expect((await procesarSolicitud(deps, 'ana@vermur.com', T0 + VENTANA_MS + 10)).desenlace).toBe('enviado');
    expect(enviar).toHaveBeenCalledTimes(4);
  });

  it('el límite es por correo: otro correo no se ve afectado', async () => {
    const { deps } = armar({ cuentas: { 'ana@vermur.com': { disabled: false }, 'luis@vermur.com': { disabled: false } } });
    for (let i = 0; i < 4; i++) await procesarSolicitud(deps, 'ana@vermur.com', T0 + i);
    expect((await procesarSolicitud(deps, 'luis@vermur.com', T0 + 5)).desenlace).toBe('enviado');
  });

  it('aplicarLimite: una solicitud rechazada no extiende la ventana', () => {
    const llenas = [T0, T0 + 1, T0 + 2];
    const r = aplicarLimite(llenas, T0 + 3);
    expect(r.permitido).toBe(false);
    expect(r.marcas).toEqual(llenas);
  });
});

describe('regla 4: las cuentas deshabilitadas no reciben enlace', () => {
  it('no genera enlace ni manda', async () => {
    const { deps, enviar, generarEnlace } = armar({ cuentas: { 'baja@vermur.com': { disabled: true } } });
    const r = await procesarSolicitud(deps, 'baja@vermur.com', T0);
    expect(r.desenlace).toBe('deshabilitada');
    expect(generarEnlace).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
  });
});

describe('piezas', () => {
  it('el hash no contiene el correo y es estable entre mayúsculas ya normalizadas', () => {
    const h = hashCorreo(normalizarCorreo(' ANA@vermur.com')!);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('ana');
    expect(h).toBe(hashCorreo('ana@vermur.com'));
  });

  it('normalizarCorreo rechaza lo que no es un correo', () => {
    for (const malo of ['', 'a', 'a@b', 'a b@c.com', 5, null, undefined]) {
      expect(normalizarCorreo(malo)).toBeNull();
    }
  });

  it('el enlace va escapado en el HTML y crudo en el texto', () => {
    const enlace = 'https://app/?a=1&b="2"';
    expect(htmlRestablecer({ enlace, urlApp: 'https://app' })).toContain('a=1&amp;b=&quot;2&quot;');
    expect(textoRestablecer({ enlace, urlApp: 'https://app' })).toContain(enlace);
  });
});
