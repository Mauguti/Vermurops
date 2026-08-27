/**
 * permisos.ts
 *
 * Modelo de permisos por capacidad para VermurOps.
 *
 * Origen: matriz de responsabilidades definida por el cliente
 * (documento de observaciones, 27-ago-2026 — ver CLAUDE.md §4.1).
 *
 * Por qué capacidades y no vistas:
 *   `ALLOWED_VIEWS_BY_ROLE` (users.ts) controla a qué MÓDULO entra cada rol.
 *   Eso no alcanza: Ventas y Pricing entran a módulos donde solo pueden hacer
 *   una parte de las acciones. Aquí se declara la ACCIÓN, no la pantalla.
 *
 * Este módulo es lógica pura: sin React, sin Firestore. Testeable aislado.
 */

import { UserRole } from './users';

// ─── Capacidades ──────────────────────────────────────────────────────────────

export type Capacidad =
  // Ventas
  | 'lead.crear'              // Crear leads / prospectos
  | 'cotizacion.solicitar'    // Solicitar cotización (nace como solicitud)
  | 'kanban.ver'              // Consultar el tablero Kanban
  // Pricing
  | 'cotizacion.crear'        // Abrir una cotización en cualquier etapa
  | 'tarifa.gestionar'        // Alta/edición del catálogo de tarifas
  | 'tarifario.cargar'        // Carga masiva de tarifarios
  | 'proveedor.altaRapida'    // «Probable proveedor» sin RFC, queda en revisión
  // Administración
  | 'cliente.alta'            // Alta definitiva de cliente
  | 'proveedor.alta'          // Alta definitiva de proveedor
  | 'puerto.alta'             // Alta de puerto
  // Operaciones
  | 'embarque.generar'        // Generar el embarque desde la cotización
  | 'factura.generar'         // Generar factura dentro del embarque
  | 'notaCredito.generar';    // Generar nota de crédito

export const TODAS_LAS_CAPACIDADES: Capacidad[] = [
  'lead.crear',
  'cotizacion.solicitar',
  'kanban.ver',
  'cotizacion.crear',
  'tarifa.gestionar',
  'tarifario.cargar',
  'proveedor.altaRapida',
  'cliente.alta',
  'proveedor.alta',
  'puerto.alta',
  'embarque.generar',
  'factura.generar',
  'notaCredito.generar',
];

// ─── Matriz rol → capacidades ────────────────────────────────────────────────

/**
 * Traducción de la matriz de §4.1 a capacidades.
 *
 * Ojo con la última fila: 'administracion' es el ÁREA de la matriz (la que da
 * las altas definitivas y factura); 'admin' es el superusuario TÉCNICO, que
 * tiene todo para soporte y depuración y no representa un área de la operación.
 *
 * Notas donde el código se aparta de la lectura ingenua de la tabla:
 *
 *  - `cotizacion.solicitar` para Pricing: el cliente aclaró que Pricing recibe
 *    requerimientos por correo de clientes directos y agentes de carga, y abre
 *    la cotización sin el paso previo de solicitud (matiz de §4.1).
 *
 *  - `proveedor.altaRapida` para Pricing NO es «alta de proveedor». Es el
 *    «probable proveedor» sin RFC que documenta la deuda técnica de §6: queda
 *    marcado en revisión y Administración lo valida al concretar la cotización.
 *    El alta definitiva (`proveedor.alta`) es de Administración.
 *
 *  - `factura.generar` la comparten Administración y Operaciones: es la única
 *    celda de la matriz con dos áreas marcadas.
 */
export const CAPACIDADES_POR_ROL: Record<UserRole, Capacidad[]> = {
  ventas: [
    'lead.crear',
    'cotizacion.solicitar',
    'kanban.ver',
  ],
  pricing: [
    'cotizacion.crear',
    'cotizacion.solicitar',
    'tarifa.gestionar',
    'tarifario.cargar',
    'proveedor.altaRapida',
  ],
  operaciones: [
    'embarque.generar',
    'factura.generar',
    'notaCredito.generar',
  ],
  // El área: concentra las tres altas definitivas y la facturación.
  administracion: [
    'cliente.alta',
    'proveedor.alta',
    'puerto.alta',
    'factura.generar',
    'notaCredito.generar',
  ],
  // Superusuario técnico: todo, para poder dar soporte.
  admin: TODAS_LAS_CAPACIDADES,
};

// ─── API ──────────────────────────────────────────────────────────────────────

/** ¿El rol tiene la capacidad? Un rol desconocido no puede nada. */
export function puede(rol: UserRole | undefined | null, cap: Capacidad): boolean {
  if (!rol) return false;
  return CAPACIDADES_POR_ROL[rol]?.includes(cap) ?? false;
}

/**
 * Etapas en las que una cotización puede NACER como simple solicitud.
 * Fuera de estas, crear una cotización requiere `cotizacion.crear`.
 */
export const ETAPAS_DE_SOLICITUD = ['solicitud_cliente', 'solicitado_pricing'] as const;

/**
 * Regla de creación de cotizaciones.
 *
 * Ventas solicita (la cotización nace en etapa de solicitud); Pricing y Admin
 * pueden abrirla en cualquier etapa; Operaciones no crea cotizaciones.
 */
export function puedeCrearCotizacion(
  rol: UserRole | undefined | null,
  etapa: string,
): boolean {
  if (puede(rol, 'cotizacion.crear')) return true;
  if (!puede(rol, 'cotizacion.solicitar')) return false;
  return (ETAPAS_DE_SOLICITUD as readonly string[]).includes(etapa);
}

// ─── Error de permiso ─────────────────────────────────────────────────────────

/**
 * Se lanza cuando una escritura se intenta sin la capacidad requerida.
 * Vive en la capa de datos (hooks), no en la UI: esconder el botón no basta.
 */
export class PermisoDenegadoError extends Error {
  readonly capacidad: Capacidad | 'cotizacion.crear';
  readonly rol: UserRole | undefined | null;

  constructor(rol: UserRole | undefined | null, capacidad: Capacidad, detalle?: string) {
    super(
      detalle ??
        `El rol «${rol ?? 'sin sesión'}» no tiene permiso para «${capacidad}».`,
    );
    this.name = 'PermisoDenegadoError';
    this.rol = rol;
    this.capacidad = capacidad;
  }
}

/** Guarda para usar en la capa de datos. Lanza si el rol no tiene la capacidad. */
export function exigir(rol: UserRole | undefined | null, cap: Capacidad): void {
  if (!puede(rol, cap)) throw new PermisoDenegadoError(rol, cap);
}
