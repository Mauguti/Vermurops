/**
 * Pendiente, entró, o no se sabe (15-oct-2026).
 *
 * Las siete cuentas que invitó Luis el 13-oct estaban creadas, con su rol, y
 * sin usar — y la lista de Usuarios las enseñaba IGUAL que al resto, con
 * «Activo» en verde. Esto es lo que las separa.
 */
import { describe, expect, it } from 'vitest';
import {
  estadoDeAcceso, etiquetaDeAcceso, puedeReenviarse, fechaCorta,
  type UsuarioRegistrado,
} from './usuarios';

const base = (p: Partial<UsuarioRegistrado> = {}): UsuarioRegistrado => ({
  uid: 'u1', email: 'andrea.guerrero@vermur.com', nombre: 'Andrea Guerrero',
  rol: 'ventas', activo: true, invitadoPor: 'luis.renteria@vermur.com',
  creadoEn: '2026-10-13T10:00:00.000Z', actualizadoEn: '2026-10-13T10:00:00.000Z',
  ...p,
});

describe('los tres estados son tres, no dos', () => {
  it('null = nunca entró → pendiente', () => {
    expect(estadoDeAcceso(base({ ultimoAcceso: null }))).toBe('pendiente');
  });
  it('una fecha = entró', () => {
    expect(estadoDeAcceso(base({ ultimoAcceso: '2026-10-14T18:00:00.000Z' }))).toBe('entro');
  });
  /*
   * Ausente NO es «nunca entró»: es «no se pudo leer su cuenta de Auth».
   * Confundirlos mandaría a reenviarle una invitación a alguien que ya opera
   * —y el enlace de restablecimiento le invalidaría su contraseña—.
   */
  it('ausente = no se sabe, y NO se trata como pendiente', () => {
    expect(estadoDeAcceso(base())).toBe('desconocido');
    expect(puedeReenviarse(base())).toBe(false);
  });
});

describe('a quién se le ofrece reenviar', () => {
  it('a quien nunca ha entrado', () => {
    expect(puedeReenviarse(base({ ultimoAcceso: null }))).toBe(true);
  });

  /*
   * El caso que pidió Mau: tener rol no significa haber recibido el correo.
   * Las siete del 13-oct tenían su rol puesto.
   */
  it.each(['ventas', 'pricing', 'operaciones', 'administracion', 'admin'] as const)(
    'también con rol «%s» puesto',
    (rol) => {
      expect(puedeReenviarse(base({ rol, ultimoAcceso: null }))).toBe(true);
    },
  );

  it('a quien YA entró, no: el enlace le invalidaría su contraseña', () => {
    expect(puedeReenviarse(base({ ultimoAcceso: '2026-10-14T18:00:00.000Z' }))).toBe(false);
  });

  it('a una cuenta desactivada, no: prometería un acceso que no da', () => {
    expect(puedeReenviarse(base({ ultimoAcceso: null, activo: false }))).toBe(false);
  });
});

describe('lo que dice la columna Estado', () => {
  it('pendiente lo dice, y dice qué hacer', () => {
    const e = etiquetaDeAcceso(base({ ultimoAcceso: null }));
    expect(e.texto).toBe('Pendiente');
    expect(e.detalle).toContain('Reenviar invitación');
  });

  it('quien entró trae su fecha, para distinguirlo de un pendiente', () => {
    const e = etiquetaDeAcceso(base({ ultimoAcceso: '2026-10-14T18:00:00.000Z' }));
    expect(e.texto).toBe('Entró');
    expect(e.detalle).toMatch(/Último acceso/);
    expect(e.detalle).toMatch(/2026/);
  });

  it('inactivo gana sobre todo lo demás', () => {
    expect(etiquetaDeAcceso(base({ ultimoAcceso: null, activo: false })).texto).toBe('Inactivo');
  });

  it('cuando no se sabe, NO dice «pendiente»', () => {
    const e = etiquetaDeAcceso(base());
    expect(e.texto).not.toBe('Pendiente');
    expect(e.detalle).toContain('No se pudo leer');
  });
});

describe('fechaCorta', () => {
  it('una fecha basura se enseña tal cual en vez de «Invalid Date»', () => {
    expect(fechaCorta('no es fecha')).toBe('no es fecha');
  });
});
