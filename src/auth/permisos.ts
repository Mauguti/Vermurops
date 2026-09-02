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
  // Solo superusuario
  | 'catalogo.importarMasivo' // Sobrescribir un catálogo completo desde los seeds
  // Administración
  | 'cliente.alta'            // Alta definitiva de cliente
  | 'concepto.editar'         // Editar el catálogo de conceptos (reglas de IVA, claves SAT)
  | 'proveedor.alta'          // Alta definitiva de proveedor
  | 'puerto.alta'             // Alta de puerto
  // Operaciones
  | 'embarque.generar'        // Generar el embarque desde la cotización
  | 'factura.generar'         // Generar factura dentro del embarque
  | 'notaCredito.generar'     // Generar nota de crédito
  // Órdenes de compra (C-2): tres áreas, tres capacidades
  | 'ordenCompra.solicitar'   // Pedir que se le pague a un proveedor
  | 'ordenCompra.gestionar'   // Revisar la solicitud y prepararla para autorizar
  | 'ordenCompra.autorizar';  // Autorizar el pago y registrarlo

export const TODAS_LAS_CAPACIDADES: Capacidad[] = [
  'lead.crear',
  'cotizacion.solicitar',
  'kanban.ver',
  'cotizacion.crear',
  'tarifa.gestionar',
  'tarifario.cargar',
  'proveedor.altaRapida',
  'catalogo.importarMasivo',
  'cliente.alta',
  'concepto.editar',
  'proveedor.alta',
  'puerto.alta',
  'embarque.generar',
  'factura.generar',
  'notaCredito.generar',
  'ordenCompra.solicitar',
  'ordenCompra.gestionar',
  'ordenCompra.autorizar',
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
 *
 *  - Las órdenes de compra son de DOS áreas, no de tres:
 *
 *        OPERACIONES solicita y gestiona → ADMINISTRACIÓN autoriza y paga
 *
 *    El plan de operación decía «PRICING solicita», y al aterrizarlo se vio
 *    que no encaja: Pricing cotiza y compara proveedores, no gestiona pagos ni
 *    ve embarques. Quien pide pagos es Operaciones —anticipos de impuestos, de
 *    agentes aduanales, transportistas que cobran adelantado— y Administración
 *    para los gastos de oficina, que el cliente puso explícitamente en su área.
 *
 *    Por eso Pricing NO tiene `ordenCompra.solicitar`: una capacidad que
 *    ningún humano ejerce es ruido, igual que lo sería `embarque.generar` en
 *    Ventas.
 *
 *    `ordenCompra.autorizar` es de 'administracion', el ÁREA, no solo del
 *    superusuario técnico. En el levantamiento «Admin» es Julio, que lleva los
 *    pagos.
 *
 *  - `catalogo.importarMasivo` NO está en la matriz del cliente: es una
 *    herramienta de mantenimiento, no una función del negocio. Sobrescribe
 *    catálogos completos (~817 clientes) contra la base que el equipo está
 *    usando. Los datos ya están cargados desde hace semanas, así que hoy solo
 *    puede hacer daño. Queda exclusiva de 'admin'.
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
    'ordenCompra.solicitar',
    'ordenCompra.gestionar',
  ],
  // El área: concentra las tres altas definitivas y la facturación.
  // OJO: sin 'catalogo.importarMasivo' — ver la nota de arriba.
  administracion: [
    'cliente.alta',
    'concepto.editar',
    'proveedor.alta',
    'puerto.alta',
    'factura.generar',
    'notaCredito.generar',
    'ordenCompra.solicitar',
    'ordenCompra.autorizar',
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

// ─── Guardado de embarques ────────────────────────────────────────────────────

/**
 * Qué capacidad hace falta para guardar un embarque.
 *
 * Crear uno es de Operaciones (y Admin). EDITAR uno existente no exige
 * capacidad: Administración no tiene 'embarque.generar' pero sí debe poder
 * registrar el cierre de pago y el administrativo, que son suyos por §4.7
 * («operativo → Operaciones, de pago → Admin, administrativo → Admin»).
 *
 * Exigir 'embarque.generar' para toda escritura dejaría a Administración sin
 * poder cerrar nada. La regla vive aquí, y no dentro del hook, para que la
 * distinción quede fijada por un test y no dependa de un `if` que alguien
 * pueda endurecer sin darse cuenta.
 *
 * Afinar el permiso por cierre —que Operaciones no marque el de pago, por
 * ejemplo— es trabajo aparte y necesita decisión del cliente.
 */
export function capacidadParaGuardarEmbarque(esNuevo: boolean): Capacidad | null {
  return esNuevo ? 'embarque.generar' : null;
}

/** ¿Este rol puede guardar este embarque? */
export function puedeGuardarEmbarque(
  rol: UserRole | undefined | null,
  esNuevo: boolean,
): boolean {
  const cap = capacidadParaGuardarEmbarque(esNuevo);
  if (cap === null) return !!rol; // basta con tener sesión
  return puede(rol, cap);
}
