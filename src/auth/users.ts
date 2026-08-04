// ─────────────────────────────────────────────────────────────────────────────
// Tipos del sistema de autenticación VermurOps
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole = 'ventas' | 'pricing' | 'admin';

export interface AuthUser {
  uid?: string; // Firebase Auth UID
  id: string;   // Backward compat con el MOCK antiguo
  nombre: string;
  email: string;
  rol: UserRole;
  avatar: string;
}

// Rutas/vistas permitidas por rol
export const ALLOWED_VIEWS_BY_ROLE: Record<UserRole, string[]> = {
  ventas: ['dashboard', 'quotes', 'clients', 'settings'],
  pricing: ['dashboard', 'quotes', 'pricing', 'documents', 'puertos', 'comparativa', 'settings'],
  admin: [
    'dashboard', 'quotes', 'pricing', 'bookings', 'pickups',
    'shipments', 'documents', 'finance', 'exchange', 'clients',
    'puertos', 'rates', 'reports', 'comparativa', 'settings',
  ],
};

export function isViewAllowed(rol: UserRole, view: string): boolean {
  return ALLOWED_VIEWS_BY_ROLE[rol]?.includes(view) ?? false;
}

// Mantenido como referencia opcional si hay restos en localStorage antes de que Firebase tome control.
export const STORAGE_KEY = 'vermurops_user';
