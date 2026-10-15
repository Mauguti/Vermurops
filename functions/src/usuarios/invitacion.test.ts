/**
 * El correo de invitación: lo que lee alguien que todavía no entra.
 *
 * Las siete invitaciones del 13-oct nunca llegaron, así que este cuerpo no se
 * ha probado con nadie. Lo que estos tests fijan es lo que no se puede
 * revisar a ojo en cada envío: que la liga viaje entera, que el rol se diga
 * en español y que un nombre con HTML no rompa el correo.
 */
import { describe, expect, it } from 'vitest';
import {
  asuntoInvitacion, etiquetaDeRol, escaparHtml, htmlInvitacion, textoInvitacion,
  type DatosInvitacion,
} from './invitacion.js';

const BASE: DatosInvitacion = {
  nombre: 'Andrea Guerrero',
  rol: 'ventas',
  invitadoPor: 'luis.renteria@vermur.com',
  enlace: 'https://vermur-logistics-app.web.app/?mode=resetPassword&oobCode=ABC-123_xyz',
  urlApp: 'https://vermur-logistics-app.web.app',
};

describe('el asunto', () => {
  it('distingue invitación de recordatorio', () => {
    expect(asuntoInvitacion(false)).toContain('Te invitaron');
    expect(asuntoInvitacion(true)).toContain('Recordatorio');
  });
});

describe('el rol se dice en español', () => {
  it.each([
    ['ventas', 'Ventas'],
    ['pricing', 'Pricing'],
    ['operaciones', 'Operaciones'],
    ['administracion', 'Administración'],
    ['admin', 'Administrador de la plataforma'],
  ])('%s → %s', (rol, etiqueta) => {
    expect(etiquetaDeRol(rol)).toBe(etiqueta);
  });

  it('un rol desconocido se enseña tal cual, no se traduce al parecido', () => {
    expect(etiquetaDeRol('vendedor')).toBe('vendedor');
  });
});

describe('el HTML', () => {
  it('lleva la liga COMPLETA, con sus parámetros', () => {
    const html = htmlInvitacion(BASE);
    expect(html).toContain(`href="${BASE.enlace}"`);
    // El oobCode es la credencial: si se corta, el botón no sirve.
    expect(html).toContain('oobCode=ABC-123_xyz');
  });

  it('dice quién invitó, el rol y la dirección de la plataforma', () => {
    const html = htmlInvitacion(BASE);
    expect(html).toContain('luis.renteria@vermur.com');
    expect(html).toContain('Ventas');
    expect(html).toContain('Crear mi contraseña');
    expect(html).toContain(BASE.urlApp);
  });

  it('saluda por el nombre de pila', () => {
    expect(htmlInvitacion(BASE)).toContain('Hola Andrea');
  });

  it('el reenvío no afirma que acaban de invitarte, y sí dice quién fue', () => {
    const html = htmlInvitacion({ ...BASE, esReenvio: true });
    expect(html).toContain('sigue pendiente');
    expect(html).toContain('luis.renteria@vermur.com');
  });

  /*
   * El nombre viene de un formulario. Sin escapar, un `<` corta el correo a
   * la mitad y queda ilegible — y nadie lo ve antes de que salga.
   */
  it('escapa el nombre: un `<` no rompe el cuerpo', () => {
    const html = htmlInvitacion({ ...BASE, nombre: '<script>x</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escaparHtml cubre los cinco caracteres', () => {
    expect(escaparHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});

describe('el texto plano', () => {
  /*
   * No se deriva del HTML a propósito: el HTML es una tabla de maquetado y
   * su texto saldría ilegible. Lo que importa es que la liga esté.
   */
  it('trae la liga y el rol, sin etiquetas', () => {
    const txt = textoInvitacion(BASE);
    expect(txt).toContain(BASE.enlace);
    expect(txt).toContain('Ventas');
    expect(txt).not.toContain('<');
  });
});
