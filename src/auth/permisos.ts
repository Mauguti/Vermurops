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
  // Cobranza (P3 del plan de pagos): la entrada de dinero del cliente
  | 'cobro.registrar'         // Registrar y anular la entrada de dinero del cliente
  // Órdenes de compra (C-2): tres áreas, tres capacidades
  | 'ordenCompra.solicitar'   // Pedir que se le pague a un proveedor
  | 'ordenCompra.gestionar'   // Revisar la solicitud y prepararla para autorizar
  | 'ordenCompra.autorizar'   // Autorizar el pago y registrarlo
  // Gestión de usuarios (GU): solo admin
  | 'usuario.gestionar'       // Invitar, cambiar rol, desactivar
  // Tipo de cambio (tarea 51)
  | 'tipoCambio.actualizar'   // Forzar consulta a Banxico desde la app
  // Correo saliente (tarea 64)
  | 'correo.probar';          // Mandar el correo de prueba por Exchange

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
  'cobro.registrar',
  'ordenCompra.solicitar',
  'ordenCompra.gestionar',
  'ordenCompra.autorizar',
  'usuario.gestionar',
  'tipoCambio.actualizar',
  'correo.probar',
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
 *  - `cobro.registrar` NO la comparten, y eso QUITA algo que hoy funciona.
 *    Hasta la tarea 69, registrar un cobro exigía `factura.generar`, así que
 *    Operaciones podía hacerlo. Gaby: «quien hace la solicitud de pago es
 *    Operaciones, pero quien recibe el dinero del cliente es Administración»,
 *    y la minuta §5 pone la cobranza y los estados de cuenta en Administración.
 *    Facturar sigue siendo de las dos áreas; COBRAR es de una sola.
 *
 *    Por eso es una capacidad nueva y no un rol más en `factura.generar`:
 *    emitir la factura y recibir el dinero son dos actos distintos y a partir
 *    de aquí los hace gente distinta. Donde Operaciones veía el formulario
 *    ahora lee a dónde ir (§4.33).
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
 *
 *  - `correo.probar` tampoco está en la matriz, por lo mismo: es la prueba de
 *    instalación del correo saliente por Exchange (tarea 64) y manda un correo
 *    DE VERDAD desde el buzón de notificaciones de Vermur. Exclusiva de
 *    'admin'. Cuando las notificaciones por correo existan, quien las recibe
 *    no necesita esta capacidad: las dispara el sistema.
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
    'tipoCambio.actualizar',
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
    'cobro.registrar',
    'ordenCompra.solicitar',
    'ordenCompra.autorizar',
    'tipoCambio.actualizar',
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

// ─── «No pagar»: marcar y liberar no son el mismo acto ───────────────────────

/*
 * Tarea 69 · La asimetría es textual de la minuta §5: «marcar / liberar no
 * pagar → Admin y Operaciones», con la cobranza en Administración.
 *
 * Marcar es AVISAR —Operaciones es quien sabe que el cliente no ha fondeado y
 * que la orden no debe salir— y liberar es DECIDIR que el dinero ya está, que
 * es de quien concilia el banco. Hasta aquí las dos eran de Administración, y
 * eso dejaba a Operaciones sin forma de detener un pago que sabía descubierto:
 * tenía que rechazar la orden entera o mandar un correo.
 *
 * Viven aquí y no como un `if` en `FichaOC.tsx` para que la asimetría quede
 * fijada por un test. Un `if` en la pantalla se endurece sin que nadie lo note.
 */

/** ¿Este rol puede DETENER un pago con la marca «No pagar»? */
export function puedeMarcarNoPagar(rol: UserRole | undefined | null): boolean {
  return puede(rol, 'ordenCompra.gestionar') || puede(rol, 'ordenCompra.autorizar');
}

/**
 * Tarea 74 · Marcar una orden como prefactura es de quien habla con la naviera
 * (`ordenCompra.gestionar`: Operaciones, y admin). Pagarla sigue siendo de
 * Administración. PLAN-PAGOS §6.
 */
export function puedeMarcarPrefactura(rol: UserRole | undefined | null): boolean {
  return puede(rol, 'ordenCompra.gestionar');
}

/**
 * ¿Este rol puede escribir el COMPROBANTE del pago y `pagadaPor`?
 *
 * El comprobante es la prueba de que el dinero salió del banco, y quien la
 * tiene es quien pagó: `ordenCompra.autorizar` (Administración y admin).
 * Operaciones prepara la orden —factura del proveedor, «No pagar»,
 * prefactura— pero no registra el movimiento.
 *
 * Es el espejo en la app de la guarda de `firestore.rules`: tocar
 * `comprobantePago` o `pagadaPor` pide `autorizaDinero()`. Sin esto, la
 * pantalla ofrecería un campo que la base rechaza.
 */
export function puedeRegistrarComprobante(rol: UserRole | undefined | null): boolean {
  return puede(rol, 'ordenCompra.autorizar');
}

/** ¿Este rol puede QUITAR la marca y dejar que el pago salga? */
export function puedeLiberarNoPagar(rol: UserRole | undefined | null): boolean {
  return puede(rol, 'ordenCompra.autorizar');
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
