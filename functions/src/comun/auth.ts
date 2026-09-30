/**
 * auth.ts — verificación de identidad y capacidad para las Functions.
 *
 * Vive en `comun/` porque lo van a usar varias funciones: la de extracción de
 * tarifas y, cuando llegue, la de Gestión de Usuarios que crea cuentas con el
 * Admin SDK.
 *
 * ⚠️ El rol se deriva del correo, igual que en el cliente (§6). Cuando GU
 * implemente custom claims, esto pasa a leerlos del token y este mapa
 * desaparece. Mientras tanto se duplica a propósito: dejar que el cliente
 * mande su propio rol haría inútil la verificación.
 */

import { getAuth } from 'firebase-admin/auth';
import type { Request } from 'firebase-functions/v2/https';

export type UserRole = 'ventas' | 'pricing' | 'operaciones' | 'administracion' | 'admin';

export const ROLES_VALIDOS: UserRole[] = ['ventas', 'pricing', 'operaciones', 'administracion', 'admin'];

/**
 * ⚠️ SOLO el equipo real de Vermur (Bloque 8, 25-sep-2026).
 *
 * Aquí estaban también las cuentas de prueba —admin@, pricing@, ventas@,
 * operaciones@— que el cliente mete SOLO cuando corre contra emuladores
 * (`USANDO_EMULADORES` en src/auth/AuthContext.tsx). Estas Functions corren
 * siempre contra producción, así que valían ahí: quien pudiera crear
 * `admin@vermur.com` en el Auth de producción obtenía capacidad `admin` en
 * el clasificador y el extractor. Y el registro público estaba ABIERTO, así
 * que crear esa cuenta no requería acceso a la consola.
 *
 * Desde el 29-sep-2026 las Functions SÍ se emulan, y las cuentas de prueba
 * entran bajo la guardia de entorno que ese comentario pedía: ver
 * `ROL_CUENTAS_PRUEBA` abajo. Nunca sueltas en el mapa.
 *
 * Un correo fuera de este mapa cae al fallback de MENOR alcance, igual que
 * en el cliente: un correo desconocido no puede convertirse en un ascenso.
 * Todo esto desaparece cuando Usuarios y roles ponga el rol en el token.
 */
const ROL_POR_EMAIL: Record<string, UserRole> = {
  'itzel.laurean@vermur.com': 'ventas',
  'nohema.sosa@vermur.com': 'pricing',
  'julio.gutierrez@vermur.com': 'administracion',
  'angel.luna@vermur.com': 'operaciones',
  'gabriela.huerta@vermur.com': 'admin',
  'luis.renteria@vermur.com': 'admin',
};

/**
 * Cuentas de prueba — SOLO con el emulador de Functions.
 *
 * `FUNCTIONS_EMULATOR` lo pone el emulador de Firebase y NO existe en el
 * entorno desplegado: no hay forma de que estas entradas lleguen a producción
 * aunque alguien cree esas cuentas en el Auth real.
 *
 * Por qué hacen falta: sin ellas, probar el extractor contra emuladores era
 * imposible. `pricing@vermur.com` caía al fallback —'ventas'— y el proxy
 * contestaba «El rol «ventas» no puede «tarifario.cargar»» antes de llamar a
 * n8n. El cliente ya hace lo mismo con `USANDO_EMULADORES`, y las reglas de
 * Firestore con `reglasEmulador.sh`: esta es la tercera cara de la misma
 * decisión.
 */
const ROL_CUENTAS_PRUEBA: Record<string, UserRole> = {
  'admin@vermur.com': 'admin',
  'pricing@vermur.com': 'pricing',
  'ventas@vermur.com': 'ventas',
  'operaciones@vermur.com': 'operaciones',
  'administracion@vermur.com': 'administracion',
};

/** ¿Corriendo dentro del emulador de Functions? Nunca cierto en producción. */
export const EN_EMULADOR = process.env.FUNCTIONS_EMULATOR === 'true';

const MAPA_EFECTIVO: Record<string, UserRole> = {
  ...ROL_POR_EMAIL,
  ...(EN_EMULADOR ? ROL_CUENTAS_PRUEBA : {}),
};

/**
 * Rol de un correo que no está en el mapa: el de MENOR alcance. Ninguna de
 * sus capacidades habilita un flujo de n8n, así que un desconocido no puede
 * disparar consumo de IA a costa de Vermur.
 */
const ROL_FALLBACK: UserRole = 'ventas';

/** Capacidades por rol. Espejo reducido de src/auth/permisos.ts. */
const CAPACIDADES: Record<UserRole, string[]> = {
  ventas: ['lead.crear', 'cotizacion.solicitar', 'kanban.ver'],
  pricing: ['cotizacion.crear', 'cotizacion.solicitar', 'tarifa.gestionar', 'tarifario.cargar', 'proveedor.altaRapida'],
  operaciones: ['embarque.generar', 'factura.generar', 'notaCredito.generar'],
  administracion: ['cliente.alta', 'proveedor.alta', 'puerto.alta', 'factura.generar', 'notaCredito.generar'],
  admin: ['lead.crear', 'cotizacion.solicitar', 'kanban.ver', 'cotizacion.crear',
          'tarifa.gestionar', 'tarifario.cargar', 'proveedor.altaRapida',
          'catalogo.importarMasivo', 'cliente.alta', 'proveedor.alta', 'puerto.alta',
          'embarque.generar', 'factura.generar', 'notaCredito.generar',
          'usuario.gestionar'],
};

export interface UsuarioVerificado {
  uid: string;
  email: string;
  rol: UserRole;
}

export class ErrorAuth extends Error {
  constructor(readonly status: number, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorAuth';
  }
}

/**
 * Verifica el token de Firebase Auth del encabezado Authorization.
 *
 * Se usa `Authorization` para la identidad del usuario y `X-Vermur-Token`
 * hacia n8n: son cosas distintas y mezclarlas invita a mandar el token
 * equivocado.
 */
export async function verificarUsuario(req: Request): Promise<UsuarioVerificado> {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) {
    throw new ErrorAuth(401, 'Falta el token de sesión.');
  }

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(header.slice(7));
  } catch {
    throw new ErrorAuth(401, 'La sesión no es válida o expiró.');
  }

  const email = (decoded.email ?? '').toLowerCase().trim();
  if (!email) throw new ErrorAuth(401, 'El token no trae correo.');

  // Custom claims primero (puestos por asignarRol), mapa viejo como respaldo.
  const rolClaim = decoded.rol as UserRole | undefined;
  const rolEfectivo = (rolClaim && ROLES_VALIDOS.includes(rolClaim))
    ? rolClaim
    : MAPA_EFECTIVO[email] ?? ROL_FALLBACK;

  return { uid: decoded.uid, email, rol: rolEfectivo };
}

/** Lanza si el usuario no tiene la capacidad. */
export function exigirCapacidad(usuario: UsuarioVerificado, capacidad: string): void {
  if (!CAPACIDADES[usuario.rol]?.includes(capacidad)) {
    throw new ErrorAuth(403, `El rol «${usuario.rol}» no puede «${capacidad}».`);
  }
}
