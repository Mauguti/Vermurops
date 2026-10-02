/**
 * Tests del motor de plantillas (tarea 40).
 */

import { describe, it, expect } from 'vitest';
import {
  escaparHtml,
  renderizar,
  formatearFecha,
  formatearFechaCorta,
  formatearMonto,
} from './motorPlantillas';

describe('escaparHtml', () => {
  it('escapa los cinco caracteres peligrosos', () => {
    expect(escaparHtml('<script>"alert(\'xss\')&"</script>')).toBe(
      '&lt;script&gt;&quot;alert(&#039;xss&#039;)&amp;&quot;&lt;/script&gt;'
    );
  });

  it('deja texto normal sin cambios', () => {
    expect(escaparHtml('Hola mundo 123')).toBe('Hola mundo 123');
  });
});

describe('renderizar', () => {
  it('reemplaza marcadores simples con escape', () => {
    const html = '<p>{{nombre}}</p>';
    expect(renderizar(html, { nombre: '<b>Vermur</b>' })).toBe(
      '<p>&lt;b&gt;Vermur&lt;/b&gt;</p>'
    );
  });

  it('reemplaza marcadores sin escape con {{!campo}}', () => {
    const html = '<div>{{!tabla}}</div>';
    expect(renderizar(html, { tabla: '<table><tr><td>OK</td></tr></table>' })).toBe(
      '<div><table><tr><td>OK</td></tr></table></div>'
    );
  });

  it('resuelve campos anidados con punto', () => {
    const html = '{{empresa.rfc}} - {{empresa.razonSocial}}';
    const datos = {
      empresa: { rfc: 'ILV190723FN1', razonSocial: 'Vermur' },
    };
    expect(renderizar(html, datos)).toBe('ILV190723FN1 - Vermur');
  });

  it('campo ausente se reemplaza con cadena vacía', () => {
    const html = 'Teléfono: {{telefono}}';
    expect(renderizar(html, {})).toBe('Teléfono: ');
  });

  it('campo null o undefined se reemplaza con cadena vacía', () => {
    const html = '{{a}} - {{b}}';
    expect(renderizar(html, { a: null, b: undefined })).toBe(' - ');
  });

  it('números y booleanos se convierten a texto', () => {
    const html = '{{num}} | {{si}} | {{no}}';
    expect(renderizar(html, { num: 42, si: true, no: false })).toBe('42 | Sí | No');
  });

  it('permite espacios alrededor del nombre del campo', () => {
    const html = '{{ nombre }} - {{! html }}';
    expect(renderizar(html, { nombre: 'test', html: '<b>ok</b>' })).toBe('test - <b>ok</b>');
  });
});

describe('formatearFecha', () => {
  it('formatea una fecha ISO a formato largo', () => {
    expect(formatearFecha('2026-10-01T12:00:00Z')).toMatch(/1 de octubre de 2026/);
  });

  it('devuelve cadena vacía para null/undefined', () => {
    expect(formatearFecha(null)).toBe('');
    expect(formatearFecha(undefined)).toBe('');
  });

  it('devuelve la cadena original si no es fecha válida', () => {
    expect(formatearFecha('no es fecha')).toBe('no es fecha');
  });
});

describe('formatearFechaCorta', () => {
  it('formatea a dd/mm/yyyy', () => {
    // Usar mediodía para evitar cambios de día por zona horaria
    expect(formatearFechaCorta('2026-10-01T12:00:00Z')).toBe('01/10/2026');
  });

  it('devuelve cadena vacía para null', () => {
    expect(formatearFechaCorta(null)).toBe('');
  });
});

describe('formatearMonto', () => {
  it('formatea con dos decimales', () => {
    const resultado = formatearMonto(1500.5);
    expect(resultado).toContain('1');
    expect(resultado).toContain('500.50');
  });

  it('incluye la moneda si se proporciona', () => {
    const resultado = formatearMonto(2000, 'USD');
    expect(resultado).toContain('USD');
    expect(resultado).toContain('2');
  });

  it('devuelve cadena vacía para null', () => {
    expect(formatearMonto(null)).toBe('');
    expect(formatearMonto(undefined)).toBe('');
  });
});
