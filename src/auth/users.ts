// ─────────────────────────────────────────────────────────────────────────────
// Tipos del sistema de autenticación VermurOps
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Roles del sistema.
 *
 * Ojo con los dos últimos, que se parecen y no son lo mismo:
 *  - 'administracion' es el ÁREA: da las altas definitivas, factura y emite
 *    notas de crédito. Es el rol que la matriz de §4.1 llama «Administración».
 *  - 'admin' es superusuario TÉCNICO: no es un área de la operación, tiene
 *    todo para poder soportar y depurar.
 */
export type UserRole = 'ventas' | 'pricing' | 'operaciones' | 'administracion' | 'admin';

export interface AuthUser {
  uid?: string; // Firebase Auth UID
  id: string;   // Backward compat con el MOCK antiguo
  nombre: string;
  email: string;
  rol: UserRole;
  avatar: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rutas/vistas permitidas por rol — a qué MÓDULO entra cada quien.
//
// Qué ACCIONES puede hacer dentro del módulo se decide en permisos.ts.
// Las dos capas son necesarias y la distinción importa: ver un catálogo y
// darlo de alta son cosas distintas. Pricing consulta puertos para capturar la
// ruta de una tarifa marítima; el alta sigue siendo de Administración.
// ─────────────────────────────────────────────────────────────────────────────
export const ALLOWED_VIEWS_BY_ROLE: Record<UserRole, string[]> = {
  ventas: ['dashboard', 'quotes', 'clients', 'settings'],

  // 'documents' se QUITA (cliente, 27-ago-2026): «la sección independiente de
  // Documentos no debería existir dentro de Pricing; los documentos deberían
  // generarse dentro del embarque o cotización».
  pricing: ['dashboard', 'quotes', 'pricing', 'rates', 'clients', 'puertos', 'exchange', 'settings'],

  operaciones: ['dashboard', 'quotes', 'shipments', 'documents', 'clients', 'puertos', 'exchange', 'settings'],

  administracion: ['dashboard', 'clients', 'finance', 'shipments', 'documents', 'exchange', 'puertos', 'reports', 'settings'],

  admin: [
    'dashboard', 'quotes', 'pricing', 'bookings', 'pickups',
    'shipments', 'documents', 'finance', 'exchange', 'clients',
    'puertos', 'rates', 'reports', 'settings',
  ],
};

export function isViewAllowed(rol: UserRole, view: string): boolean {
  return ALLOWED_VIEWS_BY_ROLE[rol]?.includes(view) ?? false;
}

// Mantenido como referencia opcional si hay restos en localStorage antes de que Firebase tome control.
export const STORAGE_KEY = 'vermurops_user';
