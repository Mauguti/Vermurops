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
  'info@digsol.com',       // ⚠️ Debería ser info@digsol.com.mx — ver reporte
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
