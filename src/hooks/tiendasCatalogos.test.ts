import { describe, it, expect, vi, beforeEach } from 'vitest';

const abiertas: string[] = [];
const cerradas: string[] = [];
const escritas: string[] = [];
/*
 * Lo que el SERVIDOR contesta en la segunda barrera. Era una constante
 * `{ empty: true }`, así que la rama «el servidor ya tiene documentos» no se
 * ejercitaba nunca: quitarla no tumbaba ningún test. Es la última cosa entre
 * un snapshot vacío de caché y escribir los datos de ejemplo encima del
 * catálogo de producción (§6).
 */
let enServidor: { empty: boolean; size: number } = { empty: true, size: 0 };
let oyentes: Record<string, { ok: (s: unknown) => void; err: (e: Error) => void }> = {};
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, nombre: string) => nombre,
  doc: (_db: unknown, col: string, id: string) => `${col}/${id}`,
  setDoc: (ref: string) => { escritas.push(ref); return Promise.resolve(); },
  getDocsFromServer: () => Promise.resolve(enServidor),
  onSnapshot: (c: string, ok: (s: unknown) => void, err: (e: Error) => void) => {
    abiertas.push(c);
    oyentes[c] = { ok, err };
    return () => { cerradas.push(c); };
  },
}));
vi.mock('../lib/folioService', () => ({ initContadorDesdeFolios: () => Promise.resolve() }));
vi.mock('../lib/erroresEscritura', () => ({ conAviso: (_e: string, f: () => Promise<unknown>) => f() }));

import {
  tiendaClientes, tiendaProveedores, tiendaEmbarques, tiendaCotizaciones,
  ordenarPorNombre, ordenarPorCreacion,
} from './tiendasCatalogos';

const snapDe = (docs: Array<{ id: string; [k: string]: unknown }>, fromServer = true) => ({
  empty: docs.length === 0,
  size: docs.length,
  metadata: { fromCache: !fromServer, hasPendingWrites: false },
  forEach: (f: (d: { id: string; data: () => unknown }) => void) =>
    docs.forEach(({ id, ...resto }) => f({ id, data: () => resto })),
});

describe('tiendas de catálogo (tarea 93) · compartir', () => {
  beforeEach(() => { abiertas.length = 0; cerradas.length = 0; escritas.length = 0; oyentes = {}; });

  it('muchos montajes abren UN listener por colección, y se cierra con el último', () => {
    // Embarques: Shipments + EmbarquesList + FichaEmbarque + FichaCliente…
    const bajas = [
      tiendaClientes.suscribir(() => {}), tiendaClientes.suscribir(() => {}), tiendaClientes.suscribir(() => {}),
      tiendaProveedores.suscribir(() => {}), tiendaProveedores.suscribir(() => {}),
      tiendaEmbarques.suscribir(() => {}), tiendaEmbarques.suscribir(() => {}),
      tiendaCotizaciones.suscribir(() => {}), tiendaCotizaciones.suscribir(() => {}),
    ];
    expect(abiertas.sort()).toEqual(['clientes', 'cotizaciones', 'embarques', 'proveedores']);
    bajas.forEach(b => b());
    expect(cerradas.sort()).toEqual(['clientes', 'cotizaciones', 'embarques', 'proveedores']);
  });

  it('un suscriptor tardío recibe la lista que ya llegó, sin abrir otro listener', () => {
    const baja = tiendaEmbarques.suscribir(() => {});
    oyentes.embarques.ok(snapDe([{ id: 'E1', createdAt: '2026-01-01' }]));
    const vistos: string[][] = [];
    const baja2 = tiendaEmbarques.suscribir(e => vistos.push(e.datos.map(d => d.id)));
    expect(vistos).toEqual([['E1']]);
    expect(abiertas).toEqual(['embarques']);
    baja(); baja2();
  });

  it('un error llega con su mensaje y no borra lo que ya había', () => {
    const vistos: Array<{ n: number; error?: string | null; loading: boolean }> = [];
    const baja = tiendaEmbarques.suscribir(e => vistos.push({ n: e.datos.length, error: e.error, loading: e.loading }));
    oyentes.embarques.ok(snapDe([{ id: 'E1' }]));
    oyentes.embarques.err(new Error('permission-denied'));
    expect(vistos.at(-1)).toEqual({ n: 1, error: 'permission-denied', loading: false });
    baja();
  });
});

describe('tiendas de catálogo (tarea 93) · orden y datos', () => {
  beforeEach(() => { abiertas.length = 0; escritas.length = 0; oyentes = {}; });

  it('clientes salen alfabéticos y un documento sin nombre no tira la lista', () => {
    let datos: Array<{ id: string }> = [];
    const baja = tiendaClientes.suscribir(e => { datos = e.datos; });
    oyentes.clientes.ok(snapDe([{ id: 'c2', nombre: 'Zeta' }, { id: 'c3' }, { id: 'c1', nombre: 'Alfa' }]));
    expect(datos).toHaveLength(3);
    expect(datos.map(d => d.id).indexOf('c1')).toBeLessThan(datos.map(d => d.id).indexOf('c2'));
    baja();
  });

  it('ordenarPorNombre no muta la entrada y ordena', () => {
    const e = [{ nombre: 'b' }, { nombre: 'a' }];
    expect(ordenarPorNombre(e).map(x => x.nombre)).toEqual(['a', 'b']);
    expect(e.map(x => x.nombre)).toEqual(['b', 'a']);
  });

  it('ordenarPorCreacion: recientes primero, sin fecha al final', () => {
    const l = [{ id: 'x' }, { id: 'a', createdAt: '2026-01-01' }, { id: 'b', createdAt: '2026-03-01' }];
    expect(ordenarPorCreacion(l).map(x => x.id)).toEqual(['b', 'a', 'x']);
  });
});

describe('tiendas de catálogo (tarea 93) · seed', () => {
  beforeEach(() => {
    abiertas.length = 0; cerradas.length = 0; escritas.length = 0; oyentes = {};
    enServidor = { empty: true, size: 0 };
  });

  it('con el servidor vacío siembra UNA vez aunque haya varios suscriptores', async () => {
    const bajas = [tiendaProveedores.suscribir(() => {}), tiendaProveedores.suscribir(() => {})];
    oyentes.proveedores.ok(snapDe([], true));
    await new Promise(r => setTimeout(r, 0));
    const primera = escritas.length;
    expect(primera).toBeGreaterThan(0);
    expect(escritas.every(e => e.startsWith('proveedores/'))).toBe(true);
    oyentes.proveedores.ok(snapDe([], true));      // otro snapshot vacío: el candado frena
    await new Promise(r => setTimeout(r, 0));
    expect(escritas.length).toBe(primera);
    bajas.forEach(b => b());
  });

  it('un snapshot vacío de CACHÉ no siembra', async () => {
    const baja = tiendaCotizaciones.suscribir(() => {});
    oyentes.cotizaciones.ok(snapDe([], false));
    await new Promise(r => setTimeout(r, 0));
    expect(escritas).toEqual([]);
    baja();
  });

  /*
   * La SEGUNDA barrera. `evaluarSeed` ya descartó los snapshots de caché,
   * pero puede dejar pasar uno del servidor que llegó vacío por una lectura
   * a medias. Antes de escribir se vuelve a preguntar AL SERVIDOR, y si ahí
   * hay algo no se siembra.
   *
   * Es lo último entre un snapshot vacío y los datos de ejemplo escritos
   * encima del catálogo vivo (§6: localhost escribe en producción). Quitarla
   * no tumbaba ningún test porque el mock contestaba siempre «vacío».
   */
  it('si el SERVIDOR ya tiene documentos no se siembra, aunque el snapshot venga vacío', async () => {
    enServidor = { empty: false, size: 544 };
    const avisos: unknown[] = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation((...a) => { avisos.push(a); });

    /*
     * `clientes` y no `proveedores`: el candado por módulo es de módulo, y
     * el test de arriba ya lo cerró para proveedores. Con esa tienda el
     * `escritas: []` saldría por el candado, no por la barrera — pasaría
     * por la razón equivocada. El aviso es lo que lo distingue.
     */
    const baja = tiendaClientes.suscribir(() => {});
    oyentes.clientes.ok(snapDe([], true));
    await new Promise(r => setTimeout(r, 0));

    expect(escritas).toEqual([]);
    expect(String(avisos[0])).toContain('544');
    warn.mockRestore();
    baja();
  });

  it('embarques NUNCA se siembra', async () => {
    const baja = tiendaEmbarques.suscribir(() => {});
    oyentes.embarques.ok(snapDe([], true));
    await new Promise(r => setTimeout(r, 0));
    expect(escritas).toEqual([]);
    baja();
  });
});
