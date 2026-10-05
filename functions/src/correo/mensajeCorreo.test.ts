import { describe, it, expect } from 'vitest';
import {
  armarMensaje,
  correoDePrueba,
  destinatariosInvalidos,
  diagnosticoDeFalla,
  ErrorCorreo,
  esCorreoValido,
  normalizarDestinatarios,
  remitenteDe,
  textoDesdeHtml,
} from './mensajeCorreo';

const BUZON = { usuario: 'notificaciones@vermur.com', nombre: 'VermurOps' };

describe('destinatarios', () => {
  it('una cadena pegada se parte por comas, puntos y comas y saltos', () => {
    expect(normalizarDestinatarios('julio@vermur.com, gaby@vermur.com; luis@vermur.com\nangel@vermur.com'))
      .toEqual(['julio@vermur.com', 'gaby@vermur.com', 'luis@vermur.com', 'angel@vermur.com']);
  });

  it('recorta, baja a minúsculas y quita repetidos', () => {
    // El mismo correo dos veces llega dos veces: el repetido no es cosmético.
    expect(normalizarDestinatarios(['  Julio@Vermur.com ', 'julio@vermur.com']))
      .toEqual(['julio@vermur.com']);
  });

  it('una lista vacía o indefinida no produce direcciones vacías', () => {
    expect(normalizarDestinatarios(undefined)).toEqual([]);
    expect(normalizarDestinatarios('')).toEqual([]);
    expect(normalizarDestinatarios(',, ;')).toEqual([]);
  });

  it.each([
    'julio@vermur.com',
    'julio.gutierrez@vermur.com.mx',
    'a+etiqueta@sub.dominio.mx',
  ])('%s tiene forma de correo', (dir) => {
    expect(esCorreoValido(dir)).toBe(true);
  });

  it.each(['julio', 'julio@vermur', '@vermur.com', 'julio@@vermur.com', 'julio vermur@x.com'])(
    '%s no la tiene',
    (dir) => {
      expect(esCorreoValido(dir)).toBe(false);
    },
  );

  it('dice CUÁLES fallan, no que «hay un error»', () => {
    expect(destinatariosInvalidos(['ok@vermur.com', 'mal', 'otro@mal']))
      .toEqual(['mal', 'otro@mal']);
  });
});

describe('remitente', () => {
  it('nombre y dirección', () => {
    expect(remitenteDe(BUZON)).toBe('"VermurOps" <notificaciones@vermur.com>');
  });

  it('sin nombre, la dirección sola', () => {
    expect(remitenteDe({ usuario: 'notificaciones@vermur.com' })).toBe('notificaciones@vermur.com');
    expect(remitenteDe({ usuario: 'notificaciones@vermur.com', nombre: '  ' }))
      .toBe('notificaciones@vermur.com');
  });

  it('un nombre con coma queda entre comillas y no se parte en dos direcciones', () => {
    const salida = remitenteDe({ usuario: 'x@vermur.com', nombre: 'Vermur, S.A. de C.V.' });
    expect(salida).toBe('"Vermur, S.A. de C.V." <x@vermur.com>');
  });

  it('las comillas dentro del nombre se quitan: romperían el encabezado', () => {
    expect(remitenteDe({ usuario: 'x@vermur.com', nombre: 'Ver"mur' }))
      .toBe('"Vermur" <x@vermur.com>');
  });
});

describe('texto plano desde el HTML', () => {
  it('párrafos y saltos se vuelven renglones', () => {
    expect(textoDesdeHtml('<p>Hola</p><p>Mundo<br>otra línea</p>'))
      .toBe('Hola\nMundo\notra línea');
  });

  it('las entidades vuelven a su carácter', () => {
    expect(textoDesdeHtml('<p>Cu&amp;Co &lt;USD 1,500&gt;&nbsp;MXN</p>'))
      .toBe('Cu&Co <USD 1,500> MXN');
  });

  it('el estilo y el script no entran al cuerpo', () => {
    expect(textoDesdeHtml('<style>p{color:red}</style><p>Aviso</p>')).toBe('Aviso');
  });

  it('una tabla simple se lee por renglones', () => {
    const html = '<table><tr><td>Flete</td><td>USD 1,500</td></tr><tr><td>Maniobras</td><td>MXN 8,000</td></tr></table>';
    expect(textoDesdeHtml(html)).toBe('Flete\tUSD 1,500\nManiobras\tMXN 8,000');
  });
});

describe('armado del mensaje', () => {
  it('remitente, destinatarios, asunto, HTML y texto plano', () => {
    const m = armarMensaje(
      { para: 'julio@vermur.com', asunto: 'Arribo VLIM-0001', html: '<p>Llegó</p>' },
      BUZON,
    );
    expect(m.from).toBe('"VermurOps" <notificaciones@vermur.com>');
    expect(m.to).toEqual(['julio@vermur.com']);
    expect(m.subject).toBe('Arribo VLIM-0001');
    expect(m.html).toBe('<p>Llegó</p>');
    expect(m.text).toBe('Llegó');
  });

  it('el texto plano se deriva solo cuando no lo mandaron', () => {
    const m = armarMensaje(
      { para: 'x@vermur.com', asunto: 'A', html: '<p>Uno</p>', texto: 'Dos' },
      BUZON,
    );
    expect(m.text).toBe('Dos');
  });

  it('cc y cco solo aparecen si traen algo', () => {
    const sin = armarMensaje({ para: 'x@vermur.com', asunto: 'A', texto: 'B' }, BUZON);
    expect(sin.cc).toBeUndefined();
    expect(sin.bcc).toBeUndefined();

    const con = armarMensaje(
      { para: 'x@vermur.com', cc: 'y@vermur.com', cco: ['z@vermur.com'], asunto: 'A', texto: 'B' },
      BUZON,
    );
    expect(con.cc).toEqual(['y@vermur.com']);
    expect(con.bcc).toEqual(['z@vermur.com']);
  });

  it('sin buzón remitente es falla de CONFIGURACIÓN, no de envío', () => {
    // La diferencia importa: configuración la arregla quien pone los secretos.
    try {
      armarMensaje({ para: 'x@vermur.com', asunto: 'A', texto: 'B' }, { usuario: '' });
      expect.unreachable('debió lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(ErrorCorreo);
      expect((err as ErrorCorreo).diagnostico.etapa).toBe('configuracion');
    }
  });

  it.each([
    ['sin destinatarios', { para: '', asunto: 'A', texto: 'B' }, 'destinatarios'],
    ['sin asunto', { para: 'x@vermur.com', asunto: '   ', texto: 'B' }, 'asunto'],
    ['sin cuerpo', { para: 'x@vermur.com', asunto: 'A' }, 'cuerpo'],
  ])('%s se rechaza ANTES de abrir la conexión', (_caso, correo, palabra) => {
    try {
      armarMensaje(correo, BUZON);
      expect.unreachable('debió lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(ErrorCorreo);
      const d = (err as ErrorCorreo).diagnostico;
      expect(d.etapa).toBe('envio');
      expect(d.mensaje).toContain(palabra);
    }
  });

  it('una dirección mal escrita se nombra en el mensaje', () => {
    try {
      armarMensaje({ para: ['ok@vermur.com', 'juilo@'], asunto: 'A', texto: 'B' }, BUZON);
      expect.unreachable('debió lanzar');
    } catch (err) {
      expect((err as ErrorCorreo).diagnostico.mensaje).toContain('juilo@');
    }
  });

  it('la dirección de respuesta también se valida', () => {
    expect(() => armarMensaje(
      { para: 'x@vermur.com', asunto: 'A', texto: 'B', responderA: 'no-es-correo' },
      BUZON,
    )).toThrow(ErrorCorreo);

    const m = armarMensaje(
      { para: 'x@vermur.com', asunto: 'A', texto: 'B', responderA: 'Gaby@Vermur.com' },
      BUZON,
    );
    expect(m.replyTo).toBe('gaby@vermur.com');
  });
});

describe('diagnóstico de la falla', () => {
  it('SMTP AUTH apagado NO se confunde con contraseña mala', () => {
    // El caso de Microsoft 365: la credencial está bien y el envío se rechaza.
    const d = diagnosticoDeFalla({
      code: 'EAUTH',
      responseCode: 535,
      response: '535 5.7.139 Authentication unsuccessful, SmtpClientAuthentication is disabled for this mailbox',
    });
    expect(d.etapa).toBe('autenticacion');
    expect(d.smtpAuthApagado).toBe(true);
    expect(d.mensaje).toContain('apagado');
    expect(d.sugerencia).toContain('No es la contraseña');
  });

  it('una credencial de verdad mala sí dice que es la credencial', () => {
    const d = diagnosticoDeFalla({
      code: 'EAUTH',
      responseCode: 535,
      response: '535 5.7.3 Authentication unsuccessful',
    });
    expect(d.etapa).toBe('autenticacion');
    expect(d.smtpAuthApagado).toBeUndefined();
    expect(d.sugerencia).toContain('CORREO_SMTP_PASSWORD');
  });

  it.each(['ECONNECTION', 'ESOCKET', 'ETIMEDOUT', 'ECONNREFUSED', 'EDNS', 'ENOTFOUND'])(
    '%s es la CONEXIÓN y manda a revisar host y puerto',
    (code) => {
      const d = diagnosticoDeFalla({ code, message: 'connect ETIMEDOUT' });
      expect(d.etapa).toBe('conexion');
      expect(d.sugerencia).toContain('587');
    },
  );

  it('un remitente sin permiso es ENVÍO, no autenticación: la sesión abrió bien', () => {
    const d = diagnosticoDeFalla({
      code: 'EENVELOPE',
      responseCode: 550,
      response: '550 5.7.60 SMTP; Client does not have permissions to send as this sender',
    });
    expect(d.etapa).toBe('envio');
    expect(d.sugerencia).toContain('Enviar como');
  });

  it('un destinatario rechazado es ENVÍO', () => {
    const d = diagnosticoDeFalla({ code: 'EENVELOPE', response: '550 5.1.1 User unknown' });
    expect(d.etapa).toBe('envio');
  });

  it('lo que no se reconoce se dice como desconocido, sin inventar causa', () => {
    const d = diagnosticoDeFalla({ message: 'algo raro pasó' });
    expect(d.etapa).toBe('desconocida');
    expect(d.mensaje).toBe('algo raro pasó');
  });

  it('un error sin mensaje tampoco deja la pantalla en blanco', () => {
    expect(diagnosticoDeFalla({}).mensaje).toContain('sin un motivo reconocible');
  });
});

describe('el correo de prueba', () => {
  const ahora = new Date('2026-10-05T23:40:00.000Z');

  it('se arma completo y dice quién lo pidió', () => {
    const correo = correoDePrueba('gaby@vermur.com', 'luis.renteria@vermur.com', ahora);
    const m = armarMensaje(correo, BUZON);
    expect(m.to).toEqual(['gaby@vermur.com']);
    expect(m.subject).toContain('correo de prueba');
    expect(m.subject).toContain('2026-10-05 23:40');
    expect(m.html).toContain('luis.renteria@vermur.com');
    expect(m.text).toContain('correo de prueba');
    expect(m.replyTo).toBe('luis.renteria@vermur.com');
  });

  it('un solicitante sin correo válido no produce un replyTo roto', () => {
    const correo = correoDePrueba('gaby@vermur.com', 'sistema', ahora);
    expect(correo.responderA).toBeUndefined();
    expect(armarMensaje(correo, BUZON).replyTo).toBeUndefined();
  });
});
