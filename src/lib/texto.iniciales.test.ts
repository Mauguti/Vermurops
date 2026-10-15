/**
 * `inicialesDe`, y el caso exacto que tiró producción el 15-oct.
 *
 * `usuario.nombre.split(' ')` en la tabla de Usuarios recibió `undefined` y el
 * TypeError, dentro de un render, desmontó el árbol completo: pantalla en
 * blanco. El valor venía de que la Function `gestionarUsuarios` cambió la
 * forma de su respuesta y una pestaña abierta con el bundle viejo metió el
 * SOBRE en la lista de usuarios.
 */
import { describe, expect, it } from 'vitest';
import { inicialesDe } from './texto';

describe('🔴 el caso que tiró producción', () => {
  /*
   * Esto ES el objeto que la pestaña vieja empujó a `usuarios[]`: la respuesta
   * nueva de `invitar`, sin `nombre` en el nivel de arriba.
   */
  const SOBRE = {
    usuario: { uid: 'u1', nombre: 'José Tejeda', email: 'jose.tejeda@vermur.com', rol: 'admin' },
    correoEnviado: false,
    motivoCorreo: 'n8n no contestó',
  } as Record<string, unknown>;

  it('las iniciales de un objeto SIN nombre dan «», no un TypeError', () => {
    expect(() => inicialesDe(SOBRE.nombre)).not.toThrow();
    expect(inicialesDe(SOBRE.nombre)).toBe('');
  });

  it('y con el nombre de verdad siguen saliendo', () => {
    expect(inicialesDe((SOBRE.usuario as { nombre: string }).nombre)).toBe('JT');
  });
});

describe('inicialesDe', () => {
  it.each([
    ['José Tejeda', 'JT'],
    ['Luis Rentería Gómez', 'LR'],
    ['Gabriela', 'G'],
    ['  espacios   de   sobra  ', 'ED'],
  ])('«%s» → «%s»', (v, esperado) => {
    expect(inicialesDe(v)).toBe(esperado);
  });

  /* La familia «no hay dato» da cadena vacía, que es lo que el avatar pinta. */
  it.each([undefined, null, '', '   ', '  ...  '])('«%s» → «»', (v) => {
    expect(inicialesDe(v)).toBe('');
  });

  /*
   * Y lo que NO es un nombre no da vacío —`texto()` convierte números y
   * booleanos a propósito, porque a veces el «nombre» es un id— pero lo que
   * importa es que **no lance**: un TypeError aquí vive dentro de un render.
   */
  it.each([0, 42, false, true, {}, [], Symbol.iterator ? NaN : 0])(
    '«%s» no lanza', (v) => {
      expect(() => inicialesDe(v)).not.toThrow();
      expect(typeof inicialesDe(v)).toBe('string');
    });

  /* Sin nombre, el correo sirve: es lo que hace `listar()` como respaldo. */
  it('parte también por punto y arroba, para un correo', () => {
    expect(inicialesDe('itzel.laurean@vermur.com')).toBe('IL');
    expect(inicialesDe('admin@vermur.com')).toBe('AV');
  });

  it('respeta cuántas se piden', () => {
    expect(inicialesDe('Ana Beatriz Cruz Díaz', 3)).toBe('ABC');
    expect(inicialesDe('Ana Beatriz Cruz Díaz', 1)).toBe('A');
  });

  /* Un número se convierte, no se descarta: a veces el «nombre» es un id. */
  it('un número da su primer carácter', () => {
    expect(inicialesDe(12345)).toBe('1');
  });
});
