import { describe, it, expect } from 'vitest';
import {
  configuracionSmtp,
  HOST_POR_OMISION,
  modoDeEnvio,
  NOMBRE_REMITENTE_POR_OMISION,
  PUERTO_POR_OMISION,
} from './configuracionSmtp';

describe('configuración por omisión', () => {
  it('es Microsoft 365 con STARTTLS en el 587', () => {
    const c = configuracionSmtp({});
    expect(c.host).toBe(HOST_POR_OMISION);
    expect(c.host).toBe('smtp.office365.com');
    expect(c.puerto).toBe(PUERTO_POR_OMISION);
    expect(c.puerto).toBe(587);
    // STARTTLS: la conexión arranca en claro y se eleva. `secure` es solo 465.
    expect(c.seguro).toBe(false);
    expect(c.exigirTls).toBe(true);
    expect(c.nombreRemitente).toBe(NOMBRE_REMITENTE_POR_OMISION);
  });

  it('el host y el nombre se pueden cambiar sin tocar código', () => {
    const c = configuracionSmtp({
      CORREO_SMTP_HOST: 'smtp.otro.mx',
      CORREO_REMITENTE_NOMBRE: 'Vermur Logística',
    });
    expect(c.host).toBe('smtp.otro.mx');
    expect(c.nombreRemitente).toBe('Vermur Logística');
  });

  it('el 465 sí es TLS implícito y entonces no exige STARTTLS', () => {
    const c = configuracionSmtp({ CORREO_SMTP_PUERTO: '465' });
    expect(c.puerto).toBe(465);
    expect(c.seguro).toBe(true);
    expect(c.exigirTls).toBe(false);
  });

  it.each(['', '  ', 'quinientos', '0', '-1', '70000', '587.5'])(
    'un puerto basura («%s») cae al 587 en vez de llegar como NaN al socket',
    (valor) => {
      // Un NaN fallaría como «conexión» y mandaría a revisar la red.
      expect(configuracionSmtp({ CORREO_SMTP_PUERTO: valor }).puerto).toBe(587);
    },
  );

  it('un valor en blanco no borra el default', () => {
    const c = configuracionSmtp({ CORREO_SMTP_HOST: '   ', CORREO_REMITENTE_NOMBRE: '' });
    expect(c.host).toBe(HOST_POR_OMISION);
    expect(c.nombreRemitente).toBe(NOMBRE_REMITENTE_POR_OMISION);
  });
});

describe('modo de envío', () => {
  it('producción SIEMPRE es smtp, aun sin credenciales', () => {
    // Sin credenciales falla con etapa «configuración»; nunca finge enviar.
    expect(modoDeEnvio({ enEmulador: false, hayCredenciales: false })).toBe('smtp');
    expect(modoDeEnvio({ enEmulador: false, hayCredenciales: false, modoPedido: 'captura' }))
      .toBe('smtp');
  });

  it('el emulador sin credenciales captura', () => {
    expect(modoDeEnvio({ enEmulador: true, hayCredenciales: false })).toBe('captura');
  });

  it('el emulador con credenciales envía de verdad', () => {
    expect(modoDeEnvio({ enEmulador: true, hayCredenciales: true })).toBe('smtp');
  });

  it('en el emulador se puede forzar cualquiera de los dos', () => {
    expect(modoDeEnvio({ enEmulador: true, hayCredenciales: true, modoPedido: 'CAPTURA' }))
      .toBe('captura');
    expect(modoDeEnvio({ enEmulador: true, hayCredenciales: false, modoPedido: 'smtp' }))
      .toBe('smtp');
  });

  it('un CORREO_MODO que no se entiende no cambia nada', () => {
    expect(modoDeEnvio({ enEmulador: true, hayCredenciales: false, modoPedido: 'ja' }))
      .toBe('captura');
  });
});
