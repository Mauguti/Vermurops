import { describe, it, expect } from 'vitest';
import {
  ETIQUETA_ETAPA,
  pideEncenderSmtpAuth,
  resumenDeRespuesta,
  type RespuestaCorreo,
} from './correoSaliente';

describe('cuando salió bien', () => {
  it('dice a dónde se mandó', () => {
    const r = resumenDeRespuesta({ ok: true, modo: 'smtp', destino: 'gaby@vermur.com' });
    expect(r.tono).toBe('exito');
    expect(r.titulo).toContain('gaby@vermur.com');
  });

  it('el id del mensaje va como detalle, no como título', () => {
    const r = resumenDeRespuesta({
      ok: true, modo: 'smtp', destino: 'x@vermur.com', mensajeId: '<abc@vermur.com>',
    });
    expect(r.detalle).toContain('<abc@vermur.com>');
  });
});

describe('el modo captura del emulador', () => {
  it('NO se pinta como éxito: el correo no salió a ningún lado', () => {
    // Verde aquí haría creer que llegó. Es el bug que esta pantalla evita.
    const r = resumenDeRespuesta({ ok: true, modo: 'captura' });
    expect(r.tono).toBe('aviso');
    expect(r.titulo).toContain('no enviado');
  });

  it('explica que hace falta producción con los secretos', () => {
    expect(resumenDeRespuesta({ ok: true, modo: 'captura' }).sugerencia)
      .toContain('secretos');
  });
});

describe('cuando Exchange aceptó y rechazó destinatarios', () => {
  it('es aviso y los nombra', () => {
    const r = resumenDeRespuesta({
      ok: true, modo: 'smtp', destino: 'a@vermur.com', rechazados: ['nadie@vermur.com'],
    });
    expect(r.tono).toBe('aviso');
    expect(r.detalle).toContain('nadie@vermur.com');
  });
});

describe('las cuatro causas se distinguen', () => {
  it.each([
    ['configuracion', 'Falta configuración'],
    ['conexion', 'Falló la conexión'],
    ['autenticacion', 'Falló la autenticación'],
    ['envio', 'Falló el envío'],
  ] as const)('etapa %s se titula «%s»', (etapa, titulo) => {
    const r = resumenDeRespuesta({
      ok: false,
      diagnostico: { etapa, mensaje: 'detalle del servidor', sugerencia: 'qué hacer' },
    });
    expect(r.tono).toBe('error');
    expect(r.titulo).toBe(titulo);
    expect(r.detalle).toBe('detalle del servidor');
    expect(r.sugerencia).toBe('qué hacer');
  });

  it('toda etapa tiene etiqueta', () => {
    Object.values(ETIQUETA_ETAPA).forEach(e => expect(e.length).toBeGreaterThan(0));
  });
});

describe('respuestas que no traen diagnóstico', () => {
  it('el 403 del permiso se muestra tal cual', () => {
    const r = resumenDeRespuesta({ ok: false, error: 'El rol «ventas» no puede «correo.probar».' });
    expect(r.tono).toBe('error');
    expect(r.titulo).toContain('correo.probar');
  });

  it('sin respuesta no deja la pantalla muda', () => {
    expect(resumenDeRespuesta(null).tono).toBe('error');
    expect(resumenDeRespuesta(undefined).titulo).toContain('No hubo respuesta');
  });

  it('un ok falso y vacío sigue siendo un error legible', () => {
    expect(resumenDeRespuesta({ ok: false } as RespuestaCorreo).titulo).toBe('El envío falló.');
  });
});

describe('SMTP AUTH apagado', () => {
  it('se señala aparte, porque la acción no es nuestra', () => {
    const respuesta: RespuestaCorreo = {
      ok: false,
      diagnostico: {
        etapa: 'autenticacion',
        mensaje: 'Exchange rechazó la sesión: el envío por SMTP está apagado para este buzón.',
        smtpAuthApagado: true,
      },
    };
    expect(pideEncenderSmtpAuth(respuesta)).toBe(true);
    expect(resumenDeRespuesta(respuesta).titulo).toBe('Falló la autenticación');
  });

  it('una credencial mala de verdad no dispara ese aviso', () => {
    expect(pideEncenderSmtpAuth({ ok: false, diagnostico: { etapa: 'autenticacion' } })).toBe(false);
    expect(pideEncenderSmtpAuth({ ok: true, modo: 'smtp' })).toBe(false);
    expect(pideEncenderSmtpAuth(null)).toBe(false);
  });
});
