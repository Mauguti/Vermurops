import { describe, it, expect } from 'vitest';
import {
  mensajeDeErrorAuth, leerAccionDeUrl, validarNuevaContrasena, MENSAJE_CORREO_ENVIADO,
} from './recuperarContrasena';

describe('mensajeDeErrorAuth', () => {
  it('cada caso real tiene mensaje en español y sin código crudo', () => {
    for (const c of ['auth/user-not-found', 'auth/invalid-email', 'auth/too-many-requests', 'auth/network-request-failed',
      'auth/expired-action-code', 'auth/invalid-action-code', 'auth/user-disabled', 'auth/weak-password']) {
      const m = mensajeDeErrorAuth(c, 'solicitar');
      expect(m).not.toContain('auth/');
      expect(m.length).toBeGreaterThan(20);
    }
  });
  it('el enlace vencido y el usado se distinguen y mandan a pedir otro', () => {
    expect(mensajeDeErrorAuth('auth/expired-action-code', 'verificar')).toMatch(/venció/);
    expect(mensajeDeErrorAuth('auth/invalid-action-code', 'verificar')).toMatch(/ya se usó/);
  });
  it('un código desconocido cae en un mensaje genérico según el paso', () => {
    expect(mensajeDeErrorAuth('auth/lo-que-sea', 'solicitar')).toMatch(/enviar el correo/);
    expect(mensajeDeErrorAuth(undefined, 'confirmar')).toMatch(/restablecer/);
  });
  it('el éxito no revela si el correo existe', () => {
    expect(MENSAJE_CORREO_ENVIADO).toMatch(/Si ese correo tiene cuenta/);
  });
});

describe('leerAccionDeUrl', () => {
  it('lee el enlace de Firebase', () => {
    expect(leerAccionDeUrl('?mode=resetPassword&oobCode=ABC123&apiKey=x&lang=es')).toEqual({ modo: 'resetPassword', oobCode: 'ABC123' });
  });
  it('ignora otras acciones y URLs sin código', () => {
    expect(leerAccionDeUrl('?mode=verifyEmail&oobCode=ABC')).toBeNull();
    expect(leerAccionDeUrl('?mode=resetPassword')).toBeNull();
    expect(leerAccionDeUrl('')).toBeNull();
  });
});

describe('validarNuevaContrasena', () => {
  it('exige 6 caracteres y que coincidan', () => {
    expect(validarNuevaContrasena('12345', '12345')).toMatch(/6 caracteres/);
    expect(validarNuevaContrasena('123456', '123457')).toMatch(/no coinciden/);
    expect(validarNuevaContrasena('123456', '123456')).toBeNull();
  });
});
