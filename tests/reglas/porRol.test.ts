/**
 * Reglas por ROL, sobre las cuatro colecciones que mueven dinero.
 *
 * Qué se fija aquí, y por qué cada cosa:
 *
 *   pagos · cobros · depositosCliente   escribir es de admin/administracion.
 *     Registrar, aplicar y anular un cobro o un pago es decidir que el dinero
 *     se movió. LEER no se restringe: la cartera y los tableros la ven todos.
 *
 *   ordenesCompra                       la base no cambia (Operaciones y
 *     Administración escriben la misma orden) y encima van tres guardas por
 *     CAMPO: marcar pagada, quitar «No pagar» y declarar prefactura.
 *
 * **La convivencia es parte del contrato, no un detalle.** Una cuenta del
 * equipo SIN claim de rol tiene que seguir escribiendo como hoy, o el día del
 * deploy alguien se queda fuera. Hay un bloque entero para eso al final, y es
 * el que más importa el martes 13.
 *
 * Se corre con `npm run test:reglas`, contra las reglas de PRODUCCIÓN.
 */

import { readFileSync } from 'fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;

/** Correos reales del equipo, uno por rol (los de `esDelEquipo`). */
const CORREO = {
  admin: 'info@digsol.com.mx',
  administracion: 'julio.gutierrez@vermur.com',
  operaciones: 'angel.luna@vermur.com',
  pricing: 'nohema.sosa@vermur.com',
  ventas: 'itzel.laurean@vermur.com',
} as const;

type Rol = keyof typeof CORREO;
const ROLES: Rol[] = ['admin', 'administracion', 'operaciones', 'pricing', 'ventas'];

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'vermur-reglas-rol',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 },
  });
});
afterAll(async () => { await env?.cleanup(); });

/** Sesión del equipo CON claim de rol, como la deja `gestionarUsuarios`. */
const como = (rol: Rol) =>
  env.authenticatedContext(`uid-${rol}`, { email: CORREO[rol], rol }).firestore();

/** Del equipo pero SIN claim: la cuenta que todavía no tiene rol asignado. */
const sinRol = (correo: string) =>
  env.authenticatedContext(`uid-sinrol-${correo}`, { email: correo }).firestore();

/** Un rol válido en el claim, pero con un correo que no es del equipo. */
const intrusoConRol = (rol: Rol) =>
  env.authenticatedContext('uid-intruso', { email: 'cualquiera@gmail.com', rol }).firestore();

/** Siembra sin pasar por las reglas, como haría el Admin SDK. */
async function sembrar(ruta: string, datos: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), ruta), datos);
  });
}

const ORDEN = {
  id: 'OC-1', folio: 'OC-2026-0001', estado: 'autorizada',
  proveedorNombre: 'Proveedor', monto: 1000, moneda: 'MXN',
  noPagar: false, activo: true,
};

beforeEach(async () => {
  await env.clearFirestore();
  await sembrar('ordenesCompra/OC-1', ORDEN);
  await sembrar('pagos/PAG-1', { folio: 'PAG-2026-0001', monto: 100, activo: true });
  await sembrar('cobros/COB-1', { monto: 100, activo: true });
  await sembrar('depositosCliente/DEP-1', { monto: 100, activo: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1 · pagos, cobros y depósitos: escribir es de quien autoriza
// ═══════════════════════════════════════════════════════════════════════════

const COLECCIONES_DINERO = [
  ['pagos', 'PAG-1'],
  ['cobros', 'COB-1'],
  ['depositosCliente', 'DEP-1'],
] as const;

describe.each(COLECCIONES_DINERO)('%s · escribir es de admin/administracion', (col, id) => {
  it.each(['admin', 'administracion'] as const)('%s crea y edita', async (rol) => {
    const db = como(rol);
    await assertSucceeds(setDoc(doc(db, col, 'NUEVO'), { monto: 50, activo: true }));
    await assertSucceeds(updateDoc(doc(db, col, id), { monto: 200 }));
  });

  it.each(['operaciones', 'pricing', 'ventas'] as const)('%s NO crea ni edita', async (rol) => {
    const db = como(rol);
    await assertFails(setDoc(doc(db, col, 'NUEVO'), { monto: 50, activo: true }));
    await assertFails(updateDoc(doc(db, col, id), { monto: 200 }));
  });

  /*
   * Leer no se restringe a propósito: Cuentas por cobrar, la pestaña Facturas
   * del embarque y los tableros lo necesitan, y esconder la cartera a
   * Operaciones no estaba en el alcance de este paso.
   */
  it.each(ROLES)('%s SÍ lee', async (rol) => {
    await assertSucceeds(getDoc(doc(como(rol), col, id)));
  });

  it('nadie borra, ni admin', async () => {
    const { deleteDoc } = await import('firebase/firestore');
    await assertFails(deleteDoc(doc(como('admin'), col, id)));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 · ordenesCompra: la base no cambia
// ═══════════════════════════════════════════════════════════════════════════

describe('ordenesCompra · lo que no toca los campos guardados', () => {
  it.each(ROLES)('%s lee', async (rol) => {
    await assertSucceeds(getDoc(doc(como(rol), 'ordenesCompra', 'OC-1')));
  });

  /*
   * Operaciones solicita y gestiona; Administración autoriza y paga. Las dos
   * escriben la MISMA orden, así que un campo cualquiera no se restringe: lo
   * de este paso son los tres campos que mueven dinero.
   */
  it.each(['admin', 'administracion', 'operaciones'] as const)('%s edita un campo normal', async (rol) => {
    await assertSucceeds(updateDoc(doc(como(rol), 'ordenesCompra', 'OC-1'), { concepto: 'Flete' }));
  });

  it('nadie borra una orden', async () => {
    const { deleteDoc } = await import('firebase/firestore');
    await assertFails(deleteDoc(doc(como('admin'), 'ordenesCompra', 'OC-1')));
  });
});

describe('ordenesCompra · marcar PAGADA es registrar un pago', () => {
  it.each(['admin', 'administracion'] as const)('%s la marca pagada', async (rol) => {
    await assertSucceeds(updateDoc(doc(como(rol), 'ordenesCompra', 'OC-1'),
      { estado: 'pagada', comprobantePago: 'SPEI-1' }));
  });

  it.each(['operaciones', 'pricing', 'ventas'] as const)('%s NO la marca pagada', async (rol) => {
    await assertFails(updateDoc(doc(como(rol), 'ordenesCompra', 'OC-1'),
      { estado: 'pagada', comprobantePago: 'SPEI-1' }));
  });

  /** Operaciones sí mueve la orden por su parte del flujo. */
  it('operaciones la deja «en gestión»', async () => {
    await assertSucceeds(updateDoc(doc(como('operaciones'), 'ordenesCompra', 'OC-1'),
      { estado: 'en_gestion' }));
  });
});

describe('ordenesCompra · «No pagar»: marcarlo y quitarlo no son lo mismo', () => {
  it.each(['admin', 'administracion', 'operaciones'] as const)('%s lo MARCA', async (rol) => {
    await assertSucceeds(updateDoc(doc(como(rol), 'ordenesCompra', 'OC-1'),
      { noPagar: true, motivoNoPagar: 'el cliente no fondeó' }));
  });

  it.each(['pricing', 'ventas'] as const)('%s no lo marca', async (rol) => {
    await assertFails(updateDoc(doc(como(rol), 'ordenesCompra', 'OC-1'), { noPagar: true }));
  });

  it.each(['admin', 'administracion'] as const)('%s lo QUITA', async (rol) => {
    await sembrar('ordenesCompra/OC-2', { ...ORDEN, id: 'OC-2', noPagar: true });
    await assertSucceeds(updateDoc(doc(como(rol), 'ordenesCompra', 'OC-2'),
      { noPagar: false, motivoNoPagar: null }));
  });

  /*
   * El corazón del punto: Operaciones MARCA —sabe que el cliente no fondeó—
   * y solo Administración LIBERA, que es decidir que el dinero ya está.
   */
  it('operaciones NO lo quita', async () => {
    await sembrar('ordenesCompra/OC-2', { ...ORDEN, id: 'OC-2', noPagar: true });
    await assertFails(updateDoc(doc(como('operaciones'), 'ordenesCompra', 'OC-2'),
      { noPagar: false, motivoNoPagar: null }));
  });
});

describe('ordenesCompra · prefactura', () => {
  /*
   * «Las navieras cobran antes de facturar.» Lo declara quien habla con el
   * proveedor: `ordenCompra.gestionar`, que en permisos.ts es Operaciones y
   * admin. Administración NO la tiene, y aquí las reglas dicen lo mismo que
   * la app en vez de ser más laxas.
   */
  it.each(['operaciones', 'admin'] as const)('%s la marca', async (rol) => {
    await assertSucceeds(updateDoc(doc(como(rol), 'ordenesCompra', 'OC-1'),
      { esPrefactura: true, motivoPrefactura: 'la naviera cobra antes' }));
  });

  it.each(['administracion', 'pricing', 'ventas'] as const)('%s no la marca', async (rol) => {
    await assertFails(updateDoc(doc(como(rol), 'ordenesCompra', 'OC-1'), { esPrefactura: true }));
  });
});

describe('ordenesCompra · un patch que mezcla campos cumple TODAS las guardas', () => {
  /*
   * El caso que una regla por campo suelta dejaría pasar: Operaciones puede
   * marcar «No pagar» y puede mover el estado, pero no puede colar un
   * `estado: 'pagada'` dentro del mismo patch.
   */
  it('operaciones no cuela «pagada» junto a un noPagar que sí puede', async () => {
    await assertFails(updateDoc(doc(como('operaciones'), 'ordenesCompra', 'OC-1'),
      { noPagar: true, estado: 'pagada' }));
  });

  it('administración no cuela una prefactura junto a un pago que sí puede', async () => {
    await assertFails(updateDoc(doc(como('administracion'), 'ordenesCompra', 'OC-1'),
      { estado: 'pagada', esPrefactura: true }));
  });

  it('admin sí puede las dos a la vez', async () => {
    await assertSucceeds(updateDoc(doc(como('admin'), 'ordenesCompra', 'OC-1'),
      { estado: 'pagada', esPrefactura: true }));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 · Convivencia: el día del deploy nadie se queda fuera
// ═══════════════════════════════════════════════════════════════════════════

describe('convivencia · una cuenta del equipo SIN claim de rol', () => {
  /*
   * Esto es lo que hace publicable el martes 13 sin esperar a que los seis
   * roles estén asignados. Si algún día se quiere cerrar del todo, se quita
   * `sinRolAsignado()` de `rolEntre` y ESTOS tests son los que deben caer —
   * lo cual es la señal de que ya no hay vía de escape, no una regresión.
   */
  const CORREOS_EQUIPO = [
    'julio.gutierrez@vermur.com',
    'angel.luna@vermur.com',
    'itzel.laurean@vermur.com',
    'info@digsol.com.mx',
  ];

  it.each(CORREOS_EQUIPO)('%s escribe un pago como hasta hoy', async (correo) => {
    await assertSucceeds(setDoc(doc(sinRol(correo), 'pagos', 'NUEVO'), { monto: 1, activo: true }));
  });

  it.each(CORREOS_EQUIPO)('%s marca una orden pagada como hasta hoy', async (correo) => {
    await assertSucceeds(updateDoc(doc(sinRol(correo), 'ordenesCompra', 'OC-1'),
      { estado: 'pagada' }));
  });

  it('y también quita «No pagar» y marca prefactura', async () => {
    await sembrar('ordenesCompra/OC-2', { ...ORDEN, id: 'OC-2', noPagar: true });
    const db = sinRol('angel.luna@vermur.com');
    await assertSucceeds(updateDoc(doc(db, 'ordenesCompra', 'OC-2'), { noPagar: false }));
    await assertSucceeds(updateDoc(doc(db, 'ordenesCompra', 'OC-1'), { esPrefactura: true }));
  });
});

describe('convivencia · el claim NO reemplaza a la lista de correos', () => {
  /*
   * Un rol en el token no es una credencial: `rolEntre` exige
   * `esDelEquipo()` ANTES de mirar el rol. Si alguien consiguiera un claim
   * `rol: 'admin'` con un correo de fuera, no entra.
   */
  it.each(ROLES)('un correo de fuera con claim «%s» no escribe nada', async (rol) => {
    const db = intrusoConRol(rol);
    await assertFails(setDoc(doc(db, 'pagos', 'NUEVO'), { monto: 1 }));
    await assertFails(updateDoc(doc(db, 'ordenesCompra', 'OC-1'), { estado: 'pagada' }));
  });

  it('un correo de fuera con claim «admin» tampoco LEE', async () => {
    await assertFails(getDoc(doc(intrusoConRol('admin'), 'pagos', 'PAG-1')));
  });

  it('sin sesión, nada', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'pagos', 'PAG-1')));
    await assertFails(setDoc(doc(db, 'pagos', 'NUEVO'), { monto: 1 }));
  });

  /** Un rol que no existe se trata como rol puesto, no como «sin rol». */
  it('un claim con un rol inventado NO cae en la vía de convivencia', async () => {
    const db = env.authenticatedContext('uid-raro',
      { email: 'angel.luna@vermur.com', rol: 'contabilidad' }).firestore();
    await assertFails(setDoc(doc(db, 'pagos', 'NUEVO'), { monto: 1 }));
  });
});
