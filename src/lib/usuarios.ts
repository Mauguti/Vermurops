/**
 * usuarios.ts — tipos y helpers para la gestión de usuarios de VermurOps.
 *
 * Lógica pura, sin React ni Firestore. Los datos vienen de la Function
 * `gestionarUsuarios`, que usa el Admin SDK para leer/escribir la colección
 * `usuarios/{uid}` sin necesitar reglas de Firestore para ella.
 */

import type { UserRole } from '../auth/users';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface UsuarioRegistrado {
  uid: string;
  email: string;
  nombre: string;
  rol: UserRole;
  activo: boolean;
  invitadoPor: string;
  creadoEn: string;
  actualizadoEn: string;
  historial?: CambioUsuario[];
  /**
   * Último inicio de sesión, de los metadatos de Auth. NO se guarda: lo
   * calcula `listar()` en cada llamada.
   *
   *   string → entró                 (ISO 8601)
   *   null   → NUNCA ha entrado: su invitación no se usó, o no llegó
   *   ausente→ no se sabe: no se pudo leer su cuenta de Auth
   *
   * Los tres casos son distintos a propósito. Enseñar «pendiente» cuando no
   * se pudo leer la cuenta mandaría a reenviarle una invitación a alguien que
   * ya entró.
   */
  ultimoAcceso?: string | null;
  /**
   * Cuándo salió la última invitación (ISO 8601). Opcional y aditivo.
   *
   * Se GUARDA en `usuarios/{uid}` —no se deriva— para que «Enviada hace X
   * min» sobreviva a una recarga y para que dos personas en la pantalla no
   * se manden el correo dos veces. Solo se escribe cuando el envío SALIÓ:
   * un intento fallido no debe bloquear el botón.
   */
  ultimaInvitacion?: string | null;
  /**
   * La cuenta existe en Auth y NO tiene documento en `usuarios/`: es anterior
   * a este módulo. Se enseña igual —antes era invisible— y al cambiarle el rol
   * el documento se crea.
   */
  sinDocumento?: boolean;
}

export interface CambioUsuario {
  tipo: 'cambioRol' | 'desactivacion';
  por: string;
  fecha: string;
  rolAnterior?: string;
  rolNuevo?: string;
}

// ── Correos en las reglas de producción ──────────────────────────────────────
// Espejo de `esDelEquipo()` en firestore.rules y storage.rules.
// Mientras exista el parche de reglas por lista de correos, un usuario
// invitado que NO esté aquí no podrá acceder a Firestore ni a Storage.
// La pantalla de Usuarios avisa al invitar.

export const CORREOS_EN_REGLAS: string[] = [
  'itzel.laurean@vermur.com',
  'nohema.sosa@vermur.com',
  'julio.gutierrez@vermur.com',
  'angel.luna@vermur.com',
  'gabriela.huerta@vermur.com',
  'luis.renteria@vermur.com',
  'info@digsol.com.mx',
];

export function correoEnReglas(email: string): boolean {
  return CORREOS_EN_REGLAS.includes(email.toLowerCase().trim());
}

// ── Validaciones ────────────────────────────────────────────────────────────

export const ROLES_VALIDOS: UserRole[] = [
  'ventas', 'pricing', 'operaciones', 'administracion', 'admin',
];

export const ETIQUETA_ROL: Record<UserRole, string> = {
  ventas: 'Ventas',
  pricing: 'Pricing',
  operaciones: 'Operaciones',
  administracion: 'Administración',
  admin: 'Admin',
};

export function validarEmailInvitacion(email: string): string | null {
  const limpio = email.toLowerCase().trim();
  if (!limpio) return 'El correo es obligatorio.';
  if (!limpio.includes('@') || !limpio.includes('.')) return 'El correo no es válido.';
  return null;
}

export function validarNombreInvitacion(nombre: string): string | null {
  const limpio = nombre.trim();
  if (!limpio) return 'El nombre es obligatorio.';
  if (limpio.length < 2) return 'El nombre es muy corto.';
  return null;
}

/*
 * ── Pendiente, entró, o no se sabe ───────────────────────────────────────
 * Lo que distingue a las siete cuentas del 13-oct —creadas, con rol y sin
 * usar— de las que ya operan. Sin esto, la lista de Usuarios las enseña
 * exactamente igual que al resto y nadie puede ver a quién le falta.
 */
export type EstadoAcceso = 'entro' | 'pendiente' | 'desconocido';

export function estadoDeAcceso(u: Pick<UsuarioRegistrado, 'ultimoAcceso'>): EstadoAcceso {
  if (u.ultimoAcceso === undefined) return 'desconocido';
  return u.ultimoAcceso === null ? 'pendiente' : 'entro';
}

/**
 * ¿Se le ofrece «Reenviar invitación»?
 *
 * A quien **nunca ha entrado**, tenga rol o no: tener rol no significa haber
 * recibido el correo — las siete del 13-oct tenían su rol puesto. Y a una
 * cuenta desactivada no, porque el enlace prometería un acceso que no da (la
 * Function también lo niega, con 409).
 */
export function puedeReenviarse(u: Pick<UsuarioRegistrado, 'ultimoAcceso' | 'activo'>): boolean {
  return u.activo && estadoDeAcceso(u) === 'pendiente';
}

/** Lo que se pinta en la columna Estado. */
export function etiquetaDeAcceso(u: UsuarioRegistrado): { texto: string; detalle: string } {
  if (!u.activo) return { texto: 'Inactivo', detalle: 'La cuenta está desactivada: no puede entrar.' };
  switch (estadoDeAcceso(u)) {
    case 'pendiente':
      return {
        texto: 'Pendiente',
        detalle: 'Nunca ha iniciado sesión: no ha puesto su contraseña. Usa «Reenviar invitación».',
      };
    case 'desconocido':
      return { texto: 'Activa', detalle: 'No se pudo leer su último acceso en Auth.' };
    default:
      return { texto: 'Entró', detalle: `Último acceso: ${fechaCorta(u.ultimoAcceso as string)}.` };
  }
}

export function fechaCorta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ═══════════════════════════════════════════════════════════════════════════
// El botón de «Reenviar invitación»
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cuánto se bloquea el botón después de un envío.
 *
 * Diez minutos es el acuerdo con Mau, y tiene razón de ser: cada reenvío
 * genera un enlace NUEVO de un solo uso, y aunque el anterior siga sirviendo
 * (medido en el emulador, §4.73), mandar cuatro correos seguidos a la misma
 * persona se lee como un error del sistema.
 */
export const MINUTOS_BLOQUEO_REENVIO = 10;

export interface EstadoReenvio {
  /** El botón no se puede pulsar. */
  bloqueado: boolean;
  /** Lo que dice el botón. */
  etiqueta: string;
  /** Minutos desde el último envío, o null si nunca se mandó. */
  minutos: number | null;
}

/**
 * Qué dice y si se puede pulsar, a partir de `ultimaInvitacion`.
 *
 * `ahora` se inyecta para poder probarlo sin reloj de verdad.
 */
export function estadoReenvio(
  ultimaInvitacion: string | null | undefined,
  ahora: Date = new Date(),
): EstadoReenvio {
  if (!ultimaInvitacion) {
    return { bloqueado: false, etiqueta: 'Reenviar invitación', minutos: null };
  }
  const t = new Date(ultimaInvitacion).getTime();
  if (Number.isNaN(t)) {
    // Una fecha basura no bloquea: dejar a alguien sin poder reenviar por un
    // dato mal escrito es peor que permitir un reenvío de más.
    return { bloqueado: false, etiqueta: 'Reenviar invitación', minutos: null };
  }
  /*
   * Un `ultimaInvitacion` en el FUTURO (reloj desfasado entre el servidor y
   * el navegador) daría minutos negativos y bloquearía el botón un rato
   * largo. Se trata como «ahora mismo».
   */
  const minutos = Math.max(0, Math.floor((ahora.getTime() - t) / 60_000));
  if (minutos >= MINUTOS_BLOQUEO_REENVIO) {
    return { bloqueado: false, etiqueta: 'Reenviar invitación', minutos };
  }
  return {
    bloqueado: true,
    etiqueta: minutos < 1 ? 'Enviada hace menos de 1 min' : `Enviada hace ${minutos} min`,
    minutos,
  };
}
