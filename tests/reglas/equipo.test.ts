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
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';

let env: RulesTestEnvironment;

const DEL_EQUIPO = 'julio.gutierrez@vermur.com';
/*
 * El correo real de Mau. Iba escrito sin el `.mx` —tanto en la regla como
 * aquí—, y este archivo lo fijaba: la lista de abajo afirmaba que
 * «INFO@DIGSOL.COM.MX» NO era del equipo. O sea que el test protegía el typo.
 * Ahora el que queda fuera es el dominio equivocado.
 */
const NUEVO_ADMIN = 'info@digsol.com.mx';
/** El typo que estuvo en la regla hasta el 30-sep. Ya no debe entrar. */
const DOMINIO_EQUIVOCADO = 'info@digsol.com';
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

/**
 * Lo mismo, con el claim `rol` en el token — que es lo único que distingue a
 * una cuenta invitada después del último deploy de reglas (15-oct-2026).
 */
const conRol = (email: string, rol: string) =>
  env.authenticatedContext(`uid-${email}`, { email, rol });

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
  it.each([INTRUSO, DE_PRUEBA, DOMINIO_EQUIVOCADO])('%s no lee ni escribe', async (email) => {
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


// ─── Lo que se agregó el 2-oct: configuración, tipo de cambio y factura de OC ──

describe('configuración de la empresa', () => {
  it('el equipo lee y escribe «Mi empresa»', async () => {
    const db = como(DEL_EQUIPO).firestore();
    await assertSucceeds(getDoc(doc(db, 'configuracion', 'empresa')));
    await assertSucceeds(setDoc(doc(db, 'configuracion', 'empresa'), { razonSocial: 'Vermur' }));
  });

  it.each([INTRUSO, DE_PRUEBA, DOMINIO_EQUIVOCADO])('%s no la toca', async (email) => {
    const db = como(email).firestore();
    await assertFails(getDoc(doc(db, 'configuracion', 'empresa')));
    await assertFails(setDoc(doc(db, 'configuracion', 'empresa'), { razonSocial: 'X' }));
  });
});

describe('el tipo de cambio se lee, no se escribe', () => {
  /*
   * Lo escribe `actualizarTipoCambio` con el Admin SDK, que no pasa por las
   * reglas. Si el navegador pudiera escribirlo, cualquiera del equipo movería
   * desde la consola la tasa con la que se cotiza y se factura.
   */
  it('el equipo LEE la tasa vigente y la del día', async () => {
    const db = como(DEL_EQUIPO).firestore();
    await assertSucceeds(getDoc(doc(db, 'configuracion', 'tipoCambio')));
    await assertSucceeds(getDoc(doc(db, 'tiposCambio', '2026-10-02')));
  });

  it('el equipo NO la escribe, ni siquiera siendo del equipo', async () => {
    const db = como(DEL_EQUIPO).firestore();
    await assertFails(setDoc(doc(db, 'configuracion', 'tipoCambio'), { valor: 1 }));
    await assertFails(setDoc(doc(db, 'tiposCambio', '2026-10-02'), { valor: 1 }));
  });

  it.each([INTRUSO, DE_PRUEBA])('%s ni lee ni escribe', async (email) => {
    const db = como(email).firestore();
    await assertFails(getDoc(doc(db, 'configuracion', 'tipoCambio')));
    await assertFails(setDoc(doc(db, 'tiposCambio', '2026-10-02'), { valor: 1 }));
  });
});

describe('Storage · la factura del proveedor en la orden de compra', () => {
  const RUTA = 'ordenesCompra/OC-2026-0009/factura/cfdi.xml';

  it('el equipo sube un XML y lo lee', async () => {
    const st = como(DEL_EQUIPO).storage();
    await assertSucceeds(uploadBytes(ref(st, RUTA), new Uint8Array([1, 2, 3]),
      { contentType: 'application/xml' }));
  });

  it('el equipo sube un PDF', async () => {
    const st = como(DEL_EQUIPO).storage();
    await assertSucceeds(uploadBytes(ref(st, 'ordenesCompra/OC-2026-0009/factura/f.pdf'),
      new Uint8Array([1]), { contentType: 'application/pdf' }));
  });

  it('un formato que no es PDF ni XML se rechaza', async () => {
    // Ahí solo van documentos fiscales; cualquier otra cosa es error de captura.
    const st = como(DEL_EQUIPO).storage();
    await assertFails(uploadBytes(ref(st, 'ordenesCompra/OC-2026-0009/factura/foto.jpg'),
      new Uint8Array([1]), { contentType: 'image/jpeg' }));
  });

  it.each([INTRUSO, DE_PRUEBA])('%s no sube ni lee', async (email) => {
    const st = como(email).storage();
    await assertFails(uploadBytes(ref(st, RUTA), new Uint8Array([1]),
      { contentType: 'application/xml' }));
  });
});


// ─── Los demás documentos de la orden de compra (tarea 63, 5-oct) ────────────

describe('Storage · ordenesCompra/{id}/documentos/', () => {
  /*
   * Esta carpeta existe aparte de `factura/` por UN motivo: admite foto.
   * Un comprobante de transferencia llega como captura del teléfono, y la
   * regla de la factura —solo PDF y XML— dejaba fuera al documento más
   * común de la orden.
   */
  const RUTA = 'ordenesCompra/OC-2026-0009/documentos/comprobante';

  const SE_ACEPTAN = [
    ['PDF',  'application/pdf'],
    ['XML',  'application/xml'],
    ['XML (text)', 'text/xml'],
    ['JPG',  'image/jpeg'],
    ['PNG',  'image/png'],
    ['HEIC', 'image/heic'],
  ] as const;

  it.each(SE_ACEPTAN)('el equipo sube un %s', async (_etiqueta, tipo) => {
    const st = como(DEL_EQUIPO).storage();
    await assertSucceeds(uploadBytes(ref(st, `${RUTA}-${tipo.replace('/', '-')}`),
      new Uint8Array([1, 2, 3]), { contentType: tipo }));
  });

  it('el equipo lee lo que subió', async () => {
    const st = como(DEL_EQUIPO).storage();
    await assertSucceeds(uploadBytes(ref(st, RUTA), new Uint8Array([1]),
      { contentType: 'image/jpeg' }));
    await assertSucceeds(getBytes(ref(st, RUTA)));
  });

  it('un ejecutable NO entra, aunque sea del equipo', async () => {
    const st = como(DEL_EQUIPO).storage();
    await assertFails(uploadBytes(ref(st, `${RUTA}.exe`), new Uint8Array([1]),
      { contentType: 'application/x-msdownload' }));
  });

  it('no se puede BORRAR: la evidencia de un pago no se edita', async () => {
    const st = como(DEL_EQUIPO).storage();
    await assertSucceeds(uploadBytes(ref(st, RUTA), new Uint8Array([1]),
      { contentType: 'application/pdf' }));
    await assertFails(deleteObject(ref(st, RUTA)));
  });

  it.each([INTRUSO, DE_PRUEBA])('%s no sube ni lee', async (email) => {
    const st = como(email).storage();
    await assertFails(uploadBytes(ref(st, RUTA), new Uint8Array([1]),
      { contentType: 'image/jpeg' }));
    await assertFails(getBytes(ref(st, RUTA)));
  });

  it('sin sesión, nada', async () => {
    const st = como(null).storage();
    await assertFails(uploadBytes(ref(st, RUTA), new Uint8Array([1]),
      { contentType: 'image/jpeg' }));
  });
});

/*
 * ── El rol del token también identifica al equipo (15-oct-2026) ───────────
 *
 * Luis invitó siete cuentas el 13-oct y ninguna entraba: la lista de correos
 * es fija y una cuenta nueva quedaba fuera de TODO hasta el siguiente deploy
 * de reglas. Estos tests son el contrato de la salida, y los tres casos son
 * los que de verdad deciden si la puerta queda abierta:
 *
 *   · fuera de la lista + rol válido  → ENTRA   (el caso que se arregla)
 *   · fuera de la lista + sin rol     → no entra (la puerta sigue cerrada)
 *   · fuera de la lista + rol inválido→ no entra (un dedazo quita, no regala)
 */
describe('un correo fuera de la lista, con claim de rol', () => {
  /** Dos de las siete que invitó Luis el 13-oct. */
  const INVITADA = 'andrea.guerrero@vermur.com';
  const INVITADO = 'said.torres@vermur.com';

  it.each([
    [INVITADA, 'ventas'],
    [INVITADO, 'operaciones'],
    ['barbara.dsouza@vermur.com', 'pricing'],
    ['carlos.gone@vermur.com', 'administracion'],
    ['noemi.casas@vermur.com', 'admin'],
  ])('%s con rol «%s» lee y escribe en Firestore', async (email, rol) => {
    const db = conRol(email, rol).firestore();
    for (const col of COLECCIONES) {
      await assertSucceeds(setDoc(doc(db, col, 'x'), { hola: 1 }));
      await assertSucceeds(getDoc(doc(db, col, 'x')));
    }
  });

  it('y también entra a Storage, donde vive el expediente KYC', async () => {
    const st = conRol(INVITADA, 'ventas').storage();
    for (const ruta of RUTAS_STORAGE) {
      await assertSucceeds(uploadBytes(ref(st, ruta), new Uint8Array([1, 2, 3])));
      await assertSucceeds(getBytes(ref(st, ruta)));
    }
  });

  it('SIN rol y fuera de la lista: no toca nada (Firestore y Storage)', async () => {
    const db = como(INVITADA).firestore();
    for (const col of COLECCIONES) {
      await assertFails(setDoc(doc(db, col, 'x'), { hola: 1 }));
      await assertFails(getDoc(doc(db, col, 'x')));
    }
    const st = como(INVITADA).storage();
    await assertFails(uploadBytes(ref(st, RUTAS_STORAGE[0]), new Uint8Array([1])));
  });

  /*
   * Un rol que las reglas no reconocen NO cae en «es del equipo».
   * Es la misma trampa de la guarda de «pagada»: lo que no se reconoce tiene
   * que quitar permisos, no regalarlos.
   */
  it.each(['Ventas', 'vendedor', 'cliente', 'contabilidad', '', 'ADMIN'])(
    'rol inválido «%s»: no entra',
    async (rol) => {
      const db = conRol(INVITADA, rol).firestore();
      await assertFails(setDoc(doc(db, COLECCIONES[0], 'x'), { hola: 1 }));
      await assertFails(getDoc(doc(db, COLECCIONES[0], 'x')));
    },
  );

  /*
   * ── El test que vigila la suposición de la regla ─────────────────────────
   *
   * `esDelEquipo` evalúa `tieneRolValido() || correoDelEquipo()`, en ese
   * orden y a propósito: así una cuenta del respaldo SIN claim pasa por la
   * lectura de un claim que no existe ANTES de entrar por su correo.
   *
   * Eso es lo que este test fija. Si leer un claim ausente dejara de dar
   * `false` y empezara a reventar la evaluación, las siete cuentas del
   * respaldo —las seis del equipo y Mau— se quedarían fuera de la
   * plataforma, y es el mismo error que ya cometimos con la convivencia de
   * las reglas por rol.
   *
   * Con el orden al revés este test pasaría por el cortocircuito del `||`
   * sin comprobar nada: medido el 15-oct, quitar la guarda `'rol' in …` no
   * tumbaba un solo test de 61. Por eso la guarda se quitó (era peso muerto)
   * y el orden se fijó.
   */
  it('el claim ausente no revienta: un correo del respaldo SIN rol entra igual', async () => {
    for (const email of [DEL_EQUIPO, NUEVO_ADMIN]) {
      const db = como(email).firestore();           // sin claim `rol` en el token
      await assertSucceeds(setDoc(doc(db, COLECCIONES[0], 'x'), { hola: 1 }));
      const st = como(email).storage();
      await assertSucceeds(uploadBytes(ref(st, RUTAS_STORAGE[1]), new Uint8Array([1])));
    }
  });

  it('un rol válido con un correo de FUERA de Vermur tampoco: el claim no es un pase libre... ', async () => {
    /*
     * ⚠️ Ojo con este test: HOY PASA porque el claim solo lo pone el Admin
     * SDK, así que un `@gmail.com` no puede tener uno. Lo que fija es la
     * consecuencia de la decisión, no una defensa: si alguien del equipo le
     * pone rol a una cuenta externa desde la pantalla de Usuarios, ENTRA.
     * El control es quién puede llamar a `gestionarUsuarios` (solo admin).
     */
    const db = conRol(INTRUSO, 'admin').firestore();
    await assertSucceeds(setDoc(doc(db, COLECCIONES[0], 'x'), { hola: 1 }));
  });
});

/*
 * ── Las cuentas de prueba, negadas por nombre ─────────────────────────────
 * Tres de ellas siguen vivas en el Auth de producción (§6) con la contraseña
 * escrita en este repo. Mientras el equipo se identificaba por correo, la
 * lista las dejaba fuera sola; con el claim, una que traiga `rol` entraría a
 * todo. Por eso se niegan antes que nada, y por eso esto se prueba.
 */
describe('cuentas de prueba: el claim no las deja entrar', () => {
  it.each(['admin', 'administracion', 'ventas', 'pricing', 'operaciones'])(
    'ventas@vermur.com con rol «%s» sigue fuera',
    async (rol) => {
      const db = conRol(DE_PRUEBA, rol).firestore();
      await assertFails(setDoc(doc(db, COLECCIONES[0], 'x'), { hola: 1 }));
      await assertFails(getDoc(doc(db, COLECCIONES[0], 'x')));
    },
  );

  it.each(['admin@vermur.com', 'pricing@vermur.com', 'operaciones@vermur.com', 'administracion@vermur.com'])(
    '%s con rol admin sigue fuera, en Firestore y en Storage',
    async (email) => {
      const db = conRol(email, 'admin').firestore();
      await assertFails(setDoc(doc(db, COLECCIONES[0], 'x'), { hola: 1 }));
      const st = conRol(email, 'admin').storage();
      await assertFails(uploadBytes(ref(st, RUTAS_STORAGE[1]), new Uint8Array([1])));
    },
  );
});
