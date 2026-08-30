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
//
// 'documents' NO aparece en ningún rol. El cliente pidió que la sección suelta
// desaparezca: «los documentos deberían generarse dentro del embarque o
// cotización» (27-ago-2026). El componente Documents.tsx se conserva en el
// repo —queda inalcanzable, no borrado— hasta que los Bloques 4 y 5 definan
// dónde vive cada documento (pendiente §4.8 nº 6).
export const ALLOWED_VIEWS_BY_ROLE: Record<UserRole, string[]> = {
  // 'clients' se QUITA (sesión 30-ago-2026). Textual de Luis: «ellos no
  // deberían de tener este módulo de altas, solo con el de prospectos». Y de
  // Gabi: «veo un sistema para todo Vermur, menos para mí».
  ventas: ['dashboard', 'quotes', 'settings'],

  // Pricing: cotiza y gestiona tarifas.
  //  - 'rates': la matriz le asigna «Gestionar tarifas» y «Cargar tarifarios».
  //  - 'puertos' se CONSERVA: la matriz restringe el ALTA de puertos, no su
  //    consulta. Pricing necesita el catálogo para capturar la ruta (puerto
  //    origen/destino) de una tarifa marítima. El botón de alta se oculta con
  //    la capacidad 'puerto.alta' — misma distinción que en proveedores.
  pricing: ['dashboard', 'quotes', 'pricing', 'rates', 'clients', 'puertos', 'exchange', 'settings'],

  // Operaciones: genera embarques y factura.
  //  - 'quotes' se QUITA (cliente, 27-ago-2026): «Operaciones no debe crear
  //    cotizaciones». Se retira el módulo completo, no solo el permiso.
  //    Consecuencia para el Bloque 4: la conversión cotización → embarque
  //    tendrá que arrancar desde Embarques, no desde la ficha de cotización.
  operaciones: ['dashboard', 'shipments', 'clients', 'puertos', 'exchange', 'settings'],

  // Administración: altas definitivas, finanzas y facturación.
  administracion: ['dashboard', 'clients', 'finance', 'shipments', 'exchange', 'puertos', 'reports', 'settings'],

  admin: [
    'dashboard', 'quotes', 'pricing', 'bookings', 'pickups',
    'shipments', 'finance', 'exchange', 'clients',
    'puertos', 'rates', 'reports', 'settings',
  ],
};

export function isViewAllowed(rol: UserRole, view: string): boolean {
  return ALLOWED_VIEWS_BY_ROLE[rol]?.includes(view) ?? false;
}

// Mantenido como referencia opcional si hay restos en localStorage antes de que Firebase tome control.
export const STORAGE_KEY = 'vermurops_user';
