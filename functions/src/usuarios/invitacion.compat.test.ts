/**
 * 🔴 La respuesta de `invitar` tiene que servirle a DOS clientes.
 *
 * El 15-oct esto tiró producción a pantalla en blanco. Se cambió `datos` de
 * «el usuario» a «{ usuario, correoEnviado }» y se desplegaron Function y
 * hosting juntos — pero una Function recién desplegada le sirve también a las
 * pestañas que ya estaban abiertas, y el hook viejo metía `datos` completo en
 * la lista de usuarios. `FilaUsuario` le pedía `.nombre`, era `undefined`, y
 * el `.split(' ')` dentro del render desmontó el árbol.
 *
 * Estos tests son el contrato de la compatibilidad: si alguien la quita, aquí
 * se cae, y el comentario dice qué hay que comprobar antes (que ya nadie
 * traiga el bundle viejo).
 */
import { describe, expect, it } from 'vitest';
import { respuestaInvitacion } from './invitacion.js';

const USUARIO = {
  uid: 'u-jose', email: 'jose.tejeda@vermur.com', nombre: 'José Tejeda',
  rol: 'admin', activo: true, invitadoPor: 'info@digsol.com.mx',
  creadoEn: '2026-10-15T20:00:00.000Z', actualizadoEn: '2026-10-15T20:00:00.000Z',
  ultimoAcceso: null,
};

/** Lo que hace el hook VIEJO: empuja `datos` tal cual a `usuarios[]`. */
const comoElClienteViejo = (datos: Record<string, unknown>) => datos;
/** Lo que hace el hook NUEVO. */
const comoElClienteNuevo = (datos: Record<string, unknown>) => datos.usuario;

describe('el cliente VIEJO sigue funcionando', () => {
  const datos = respuestaInvitacion(USUARIO, false, 'n8n no contestó');
  const fila = comoElClienteViejo(datos) as Record<string, unknown>;

  it('tiene `nombre`: es lo único que faltaba para la pantalla en blanco', () => {
    expect(fila.nombre).toBe('José Tejeda');
  });

  it('y todo lo demás que el renglón pinta', () => {
    expect(fila.uid).toBe('u-jose');
    expect(fila.email).toBe('jose.tejeda@vermur.com');
    expect(fila.rol).toBe('admin');
    expect(fila.activo).toBe(true);
  });
});

describe('el cliente NUEVO sigue funcionando', () => {
  it('lee el usuario de `usuario`', () => {
    const datos = respuestaInvitacion(USUARIO, true);
    expect(comoElClienteNuevo(datos)).toEqual(USUARIO);
    expect(datos.correoEnviado).toBe(true);
  });

  it('el motivo solo viaja cuando el correo NO salió', () => {
    expect('motivoCorreo' in respuestaInvitacion(USUARIO, true)).toBe(false);
    expect(respuestaInvitacion(USUARIO, false, 'x').motivoCorreo).toBe('x');
  });
});

describe('reenviar a una cuenta sin documento', () => {
  /*
   * `reenviar` puede no tener documento en `usuarios/`. Entonces `usuario` es
   * null y arriba no hay campos — pero NO debe reventar al armarse, y el
   * cliente nuevo tiene que poder leer `correoEnviado`.
   */
  it('con usuario null no lanza y conserva el estado del correo', () => {
    const datos = respuestaInvitacion(null, false, 'cuenta sin documento');
    expect(datos.usuario).toBeNull();
    expect(datos.correoEnviado).toBe(false);
    expect(datos.nombre).toBeUndefined();
  });
});
