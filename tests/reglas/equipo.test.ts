/**
 * Reglas: solo el equipo entra (Bloque 9, 25-sep-2026).
 *
 * El parche cambió «cualquier autenticado» por «un correo del equipo», en
 * Firestore Y en Storage. Estos tests fijan las tres situaciones que
 * importan, porque un error aquí no truena: deja la puerta abierta o deja
 * fuera a alguien del equipo en producción.
 *
 * Se corren contra los emuladores con `npm run test:reglas`, que los levanta
 * y los apaga solo. Usan las reglas de PRODUCCIÓN, no las derivadas del
 * emulador: lo que se prueba es lo que se despliega.
 */

import { readFileSync } from 'fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

let env: RulesTestEnvironment;

const DEL_EQUIPO = 'julio.gutierrez@vermur.com';
const NUEVO_ADMIN = 'info@digsol.com';
const INTRUSO = 'cualquiera@gmail.com';
/** Una cuenta de prueba del emulador NO debe valer contra las reglas reales. */
const DE_PRUEBA = 'ventas@vermur.com';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'vermur-reglas-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9195 },
  });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

/** Contexto autenticado con un correo dado, como lo ve una regla. */
const como = (email: string | null) =>
  email === null ? env.unauthenticatedContext() : env.authenticatedContext(`uid-${email}`, { email });

/** Colecciones con la regla común. `notificaciones` va aparte: solo las propias. */
const COLECCIONES = ['cotizaciones', 'clientes', 'embarques', 'proveedores', 'tarifas'];
const RUTAS_STORAGE = [
  'tarifarios/2026/09/evidencia.pdf',
  'expedientes/CLI-1/acta.pdf',           // el KYC: actas y RFC
  'embarques/EMB-1/docs/bl.pdf',
  'cotizaciones/COT-1/pdf/cot.pdf',
];

describe('Firestore · un correo del equipo', () => {
  it.each([DEL_EQUIPO, NUEVO_ADMIN])('%s lee y escribe', async (email) => {
    const db = como(email).firestore();
    for (const col of COLECCIONES) {
      await assertSucceeds(setDoc(doc(db, col, 'x'), { hola: 1 }));
      await assertSucceeds(getDoc(doc(db, col, 'x')));
    }
  });
});

describe('Firestore · quien no es del equipo no toca nada', () => {
  it.each([INTRUSO, DE_PRUEBA, 'INFO@DIGSOL.COM.MX'])('%s no lee ni escribe', async (email) => {
    const db = como(email).firestore();
    for (const col of COLECCIONES) {
      await assertFails(getDoc(doc(db, col, 'x')));
      await assertFails(setDoc(doc(db, col, 'x'), { hola: 1 }));
    }
  });

  it('sin sesión, nada', async () => {
    const db = como(null).firestore();
    for (const col of COLECCIONES) {
      await assertFails(getDoc(doc(db, col, 'x')));
      await assertFails(setDoc(doc(db, col, 'x'), { hola: 1 }));
    }
  });

  it('el correo se compara en minúsculas: la misma cuenta en mayúsculas entra', async () => {
    const db = como(DEL_EQUIPO.toUpperCase()).firestore();
    await assertSucceeds(getDoc(doc(db, 'clientes', 'x')));
  });
});

describe('Storage · el expediente KYC y las demás evidencias', () => {
  it('el equipo sube y lee', async () => {
    const st = como(DEL_EQUIPO).storage();
    for (const ruta of RUTAS_STORAGE) {
      await assertSucceeds(uploadBytes(ref(st, ruta), new Uint8Array([1, 2, 3])));
      await assertSucceeds(getBytes(ref(st, ruta)));
    }
  });

  it.each([INTRUSO, DE_PRUEBA])('%s no sube ni lee', async (email) => {
    const st = como(email).storage();
    for (const ruta of RUTAS_STORAGE) {
      await assertFails(uploadBytes(ref(st, ruta), new Uint8Array([1, 2, 3])));
      await assertFails(getBytes(ref(st, ruta)));
    }
  });

  it('sin sesión, nada', async () => {
    const st = como(null).storage();
    for (const ruta of RUTAS_STORAGE) {
      await assertFails(uploadBytes(ref(st, ruta), new Uint8Array([1, 2, 3])));
      await assertFails(getBytes(ref(st, ruta)));
    }
  });
});

describe('Lo que el parche NO cambia', () => {
  it('nadie borra una cotización, ni siendo del equipo', async () => {
    const db = como(DEL_EQUIPO).firestore();
    await assertSucceeds(setDoc(doc(db, 'cotizaciones', 'x'), { a: 1 }));
    const { deleteDoc } = await import('firebase/firestore');
    await assertFails(deleteDoc(doc(db, 'cotizaciones', 'x')));
  });

  it('una notificación solo la lee su destinatario, aunque quien pregunte sea del equipo', async () => {
    const ctx = como(DEL_EQUIPO);
    const db = ctx.firestore();
    // Crear sí puede cualquiera del equipo: es el aviso que manda.
    await assertSucceeds(setDoc(doc(db, 'notificaciones', 'n1'), { destinatarioId: 'otro-uid' }));
    // Leerla, no: no es suya.
    await assertFails(getDoc(doc(db, 'notificaciones', 'n1')));
    await assertSucceeds(setDoc(doc(db, 'notificaciones', 'n2'), { destinatarioId: `uid-${DEL_EQUIPO}` }));
    await assertSucceeds(getDoc(doc(db, 'notificaciones', 'n2')));
  });
});
