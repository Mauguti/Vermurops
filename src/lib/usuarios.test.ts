/**
 * usuarios.test.ts — tests de la lógica pura de gestión de usuarios.
 *
 * Cubre: validaciones, correos en reglas, etiquetas de rol.
 */

import { describe, it, expect } from 'vitest';
import {
  validarEmailInvitacion,
  validarNombreInvitacion,
  correoEnReglas,
  CORREOS_EN_REGLAS,
  ROLES_VALIDOS,
  ETIQUETA_ROL,
} from './usuarios';

describe('validarEmailInvitacion', () => {
  it('rechaza email vacío', () => {
    expect(validarEmailInvitacion('')).toBe('El correo es obligatorio.');
    expect(validarEmailInvitacion('   ')).toBe('El correo es obligatorio.');
  });

  it('rechaza email sin @', () => {
    expect(validarEmailInvitacion('foo')).toBe('El correo no es válido.');
  });

  it('rechaza email sin punto', () => {
    expect(validarEmailInvitacion('foo@bar')).toBe('El correo no es válido.');
  });

  it('acepta email válido', () => {
    expect(validarEmailInvitacion('luis@vermur.com')).toBeNull();
  });

  it('acepta email con mayúsculas y espacios (se normaliza afuera)', () => {
    expect(validarEmailInvitacion(' Luis@Vermur.com ')).toBeNull();
  });
});

describe('validarNombreInvitacion', () => {
  it('rechaza nombre vacío', () => {
    expect(validarNombreInvitacion('')).toBe('El nombre es obligatorio.');
    expect(validarNombreInvitacion('   ')).toBe('El nombre es obligatorio.');
  });

  it('rechaza nombre de un carácter', () => {
    expect(validarNombreInvitacion('A')).toBe('El nombre es muy corto.');
  });

  it('acepta nombre de dos o más caracteres', () => {
    expect(validarNombreInvitacion('Lu')).toBeNull();
    expect(validarNombreInvitacion('Luis Rentería')).toBeNull();
  });
});

describe('correoEnReglas', () => {
  it('encuentra correos del equipo', () => {
    expect(correoEnReglas('gabriela.huerta@vermur.com')).toBe(true);
    expect(correoEnReglas('luis.renteria@vermur.com')).toBe(true);
  });

  it('normaliza mayúsculas', () => {
    expect(correoEnReglas('GABRIELA.HUERTA@VERMUR.COM')).toBe(true);
  });

  it('detecta correos que NO están en las reglas', () => {
    expect(correoEnReglas('chema@vermur.com')).toBe(false);
    expect(correoEnReglas('random@gmail.com')).toBe(false);
  });

  it('la lista tiene los 7 correos del parche de reglas', () => {
    // Si cambia la lista en firestore.rules, hay que actualizar CORREOS_EN_REGLAS.
    expect(CORREOS_EN_REGLAS).toHaveLength(7);
  });
});

describe('constantes de rol', () => {
  it('ROLES_VALIDOS tiene los 5 roles', () => {
    expect(ROLES_VALIDOS).toEqual([
      'ventas', 'pricing', 'operaciones', 'administracion', 'admin',
    ]);
  });

  it('ETIQUETA_ROL cubre todos los roles', () => {
    for (const rol of ROLES_VALIDOS) {
      expect(ETIQUETA_ROL[rol]).toBeTruthy();
    }
  });

  it('admin se etiqueta "Admin", no "Administración"', () => {
    expect(ETIQUETA_ROL.admin).toBe('Admin');
    expect(ETIQUETA_ROL.administracion).toBe('Administración');
  });
});
