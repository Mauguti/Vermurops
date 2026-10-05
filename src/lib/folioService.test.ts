/**
 * folioService.test.ts — tarea 66.
 *
 * Lo que amarran estos tests, los tres en la reserva de folios por serie:
 *
 *   1. que el folio se arme con el FORMATO guardado en el propio contador,
 *      sin una lectura más (está en el mismo documento que `ultimo`);
 *   2. que dos cotizaciones ganadas al mismo tiempo NO reciban el mismo
 *      folio — la propiedad de la que depende todo lo demás, porque un folio
 *      duplicado ya se imprimió cuando alguien lo nota;
 *   3. que el interruptor de la creación automática falle cerrado.
 *
 * Firestore no se monta: `doc()` se sustituye por una llave de texto y la
 * transacción por una simulación con la misma semántica optimista —si el
 * documento cambió entre la lectura y la escritura, el commit se rechaza y la
 * transacción se reintenta entera—. Es justo lo que hace que la reserva sea
 * correcta: los folios se derivan de lo que se leyó DENTRO de la transacción.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, coleccion: string, id: string) => ({ ruta: `${coleccion}/${id}` }),
  runTransaction: vi.fn(),
}));

import {
  DOC_CONFIG_EMBARQUES, formatFolioSerie, leerInterruptorEmbarque,
  reservarFoliosMultiSerie, reservarFoliosSerie,
} from './folioService';

// ─── Firestore simulado ───────────────────────────────────────────────────────

type Documento = { datos: Record<string, unknown>; version: number };
type Ref = { ruta: string };

class BaseSimulada {
  docs = new Map<string, Documento>();

  sembrar(ruta: string, datos: Record<string, unknown>) {
    this.docs.set(ruta, { datos, version: 1 });
  }

  /**
   * Corre una transacción con la semántica de Firestore: se anotan las
   * versiones leídas y, si alguna cambió al momento de confirmar, se descarta
   * todo y se reintenta. `pausar` permite interleavear dos transacciones.
   */
  async transaccion<T>(
    cuerpo: (tx: TxSimulada) => Promise<T>,
    pausar?: () => Promise<void>,
  ): Promise<T> {
    for (let intento = 0; intento < 5; intento++) {
      const tx = new TxSimulada(this);
      const valor = await cuerpo(tx);
      if (pausar && intento === 0) await pausar();
      if (tx.confirmar()) return valor;
    }
    throw new Error('La transacción no pudo confirmarse.');
  }
}

class TxSimulada {
  private leidas = new Map<string, number>();
  private pendientes: { ruta: string; datos: Record<string, unknown>; merge: boolean }[] = [];

  constructor(private base: BaseSimulada) {}

  // `ref` entra como `unknown` para que la simulación encaje donde
  // `folioService` espera un DocumentReference de verdad, sin castear en cada
  // llamada ni arrastrar los tipos del SDK a la prueba.
  async get(ref: unknown) {
    const { ruta } = ref as Ref;
    const d = this.base.docs.get(ruta);
    this.leidas.set(ruta, d?.version ?? 0);
    return {
      exists: () => !!d,
      data: () => (d ? { ...d.datos } : undefined),
    };
  }

  set(ref: unknown, datos: Record<string, unknown>, opts?: { merge: boolean }) {
    this.pendientes.push({ ruta: (ref as Ref).ruta, datos, merge: !!opts?.merge });
  }

  confirmar(): boolean {
    for (const [ruta, version] of this.leidas) {
      if ((this.base.docs.get(ruta)?.version ?? 0) !== version) return false;
    }
    this.pendientes.forEach(({ ruta, datos, merge }) => {
      const previo = this.base.docs.get(ruta);
      this.base.docs.set(ruta, {
        datos: merge && previo ? { ...previo.datos, ...datos } : datos,
        version: (previo?.version ?? 0) + 1,
      });
    });
    return true;
  }
}

let base: BaseSimulada;
beforeEach(() => { base = new BaseSimulada(); });

const RUTA = (serie: string) => `contadores/embarques_${serie}`;

// ─── El formato sale del propio contador ──────────────────────────────────────

describe('la reserva usa el formato guardado en la serie', () => {
  it('sin formato guardado emite el predeterminado', async () => {
    base.sembrar(RUTA('VLIM'), { ultimo: 107, sembrado: true });
    const r = await base.transaccion(tx => reservarFoliosSerie(tx, 'VLIM', 2, 2026));
    expect(r.folios).toEqual(['VLIM-26-108', 'VLIM-26-109']);
    expect(r.sembrado).toBe(true);
  });

  it('con formato guardado emite ese, sin leer otro documento', async () => {
    base.sembrar(RUTA('VLIM'), {
      ultimo: 0, sembrado: true,
      formato: { prefijo: 'BLIM', separador: '', digitosAnio: 2, digitos: 3 },
    });
    const r = await base.transaccion(tx => reservarFoliosSerie(tx, 'VLIM', 1, 2027));
    expect(r.folios).toEqual(['BLIM27001']);
  });

  it('la serie sin documento arranca en 001 y se reporta sin sembrar', async () => {
    const r = await base.transaccion(tx => reservarFoliosSerie(tx, 'VLET', 1, 2026));
    expect(r.folios).toEqual(['VLET-26-001']);
    expect(r.sembrado).toBe(false);
  });

  it('fijar el consecutivo no borra el formato (merge)', async () => {
    base.sembrar(RUTA('VLIA'), { ultimo: 19, sembrado: true, formato: { digitosAnio: 4 } });
    await base.transaccion(tx => reservarFoliosSerie(tx, 'VLIA', 1, 2026));
    expect(base.docs.get(RUTA('VLIA'))?.datos).toMatchObject({
      ultimo: 20, sembrado: true, formato: { digitosAnio: 4 },
    });
  });

  it('multi-serie respeta el formato de cada una', async () => {
    base.sembrar(RUTA('VLIM'), { ultimo: 3, sembrado: true });
    base.sembrar(RUTA('VLIT'), { ultimo: 106, sembrado: true, formato: { separador: '/' } });
    const r = await base.transaccion(tx => reservarFoliosMultiSerie(
      tx, [{ prefijo: 'VLIM', cuantos: 1 }, { prefijo: 'VLIT', cuantos: 1 }], 2026,
    ));
    expect(r.get('VLIM')?.folios).toEqual(['VLIM-26-004']);
    expect(r.get('VLIT')?.folios).toEqual(['VLIT/26/107']);
  });

  it('dos grupos de la misma serie en una transacción no repiten folio', async () => {
    // Una cotización marítima con un terrestre que se opera aparte, los dos de
    // importación terrestre: dos embarques, dos folios consecutivos.
    base.sembrar(RUTA('VLIT'), { ultimo: 10, sembrado: true });
    const r = await base.transaccion(tx => reservarFoliosMultiSerie(
      tx, [{ prefijo: 'VLIT', cuantos: 1 }, { prefijo: 'VLIT', cuantos: 1 }], 2026,
    ));
    expect(r.get('VLIT')?.folios).toEqual(['VLIT-26-011', 'VLIT-26-012']);
    expect(base.docs.get(RUTA('VLIT'))?.datos.ultimo).toBe(12);
  });
});

// ─── Dos cotizaciones ganadas al mismo tiempo ─────────────────────────────────

describe('dos cotizaciones ganadas a la vez', () => {
  it('no reciben el mismo folio: la segunda transacción se reintenta', async () => {
    base.sembrar(RUTA('VLIM'), { ultimo: 40, sembrado: true });

    let reintentos = -1;
    // La primera transacción lee, y ANTES de confirmar corre la segunda
    // completa. Al confirmar, la versión del contador ya cambió: se descarta y
    // se reintenta sobre el valor nuevo.
    const primera = base.transaccion(
      tx => { reintentos++; return reservarFoliosSerie(tx, 'VLIM', 1, 2026); },
      async () => {
        await base.transaccion(tx => reservarFoliosSerie(tx, 'VLIM', 1, 2026));
      },
    );

    const r1 = await primera;
    expect(reintentos).toBe(1);               // hubo exactamente un reintento
    expect(r1.folios).toEqual(['VLIM-26-042']); // la otra se quedó con el 041
    expect(base.docs.get(RUTA('VLIM'))?.datos.ultimo).toBe(42);
  });

  it('veinte reservas seguidas no repiten ni se saltan un número', async () => {
    base.sembrar(RUTA('VLEA'), { ultimo: 0, sembrado: true });
    const emitidos: string[] = [];
    for (let i = 0; i < 20; i++) {
      const r = await base.transaccion(tx => reservarFoliosSerie(tx, 'VLEA', 1, 2026));
      emitidos.push(r.folios[0]);
    }
    expect(new Set(emitidos).size).toBe(20);
    expect(emitidos[0]).toBe('VLEA-26-001');
    expect(emitidos[19]).toBe('VLEA-26-020');
  });

  it('pedir cero folios no mueve el contador', async () => {
    base.sembrar(RUTA('VLIM'), { ultimo: 5, sembrado: true });
    const r = await base.transaccion(tx => reservarFoliosSerie(tx, 'VLIM', 0, 2026));
    expect(r.folios).toEqual([]);
    expect(base.docs.get(RUTA('VLIM'))?.datos.ultimo).toBe(5);
  });
});

// ─── El cambio de año ─────────────────────────────────────────────────────────

describe('el cambio de año en la reserva', () => {
  it('cambia el año del folio y el consecutivo continúa', async () => {
    base.sembrar(RUTA('VLIM'), { ultimo: 14, sembrado: true });
    const dic = await base.transaccion(tx => reservarFoliosSerie(tx, 'VLIM', 1, 2026));
    const ene = await base.transaccion(tx => reservarFoliosSerie(tx, 'VLIM', 1, 2027));
    expect(dic.folios).toEqual(['VLIM-26-015']);
    expect(ene.folios).toEqual(['VLIM-27-016']);
  });

  it('reiniciar en enero exige volver a fijar el consecutivo en 0', async () => {
    // Lo que hoy habría que hacer a mano si Vermur quiere VLIM-27-001: es la
    // pregunta del reporte 66. Un contador por año sería otra tarea.
    base.sembrar(RUTA('VLIM'), { ultimo: 0, sembrado: true });
    const r = await base.transaccion(tx => reservarFoliosSerie(tx, 'VLIM', 1, 2027));
    expect(r.folios).toEqual(['VLIM-27-001']);
  });
});

// ─── El interruptor ───────────────────────────────────────────────────────────

describe('el interruptor de la creación automática falla cerrado', () => {
  it('sin documento, apagado', () => {
    expect(leerInterruptorEmbarque(undefined).activo).toBe(false);
    expect(leerInterruptorEmbarque(null).activo).toBe(false);
    expect(leerInterruptorEmbarque({}).activo).toBe(false);
  });

  it('solo `true` exacto lo enciende', () => {
    expect(leerInterruptorEmbarque({ embarqueAutomatico: true }).activo).toBe(true);
    expect(leerInterruptorEmbarque({ embarqueAutomatico: 'true' }).activo).toBe(false);
    expect(leerInterruptorEmbarque({ embarqueAutomatico: 1 }).activo).toBe(false);
    expect(leerInterruptorEmbarque({ embarqueAutomatico: 'sí' }).activo).toBe(false);
  });

  it('guarda quién y cuándo, y descarta lo que no sea texto', () => {
    const i = leerInterruptorEmbarque({
      embarqueAutomatico: true, fechaCambio: '2026-10-05T03:00:00.000Z',
      cambiadoPor: 'admin@vermur.com',
    });
    expect(i.fecha).toBe('2026-10-05T03:00:00.000Z');
    expect(i.por).toBe('admin@vermur.com');
    expect(leerInterruptorEmbarque({ cambiadoPor: 42 }).por).toBeUndefined();
  });

  it('su documento no se confunde con una serie', () => {
    // `useContadoresSerie` separa por id; el del interruptor no empieza por
    // `embarques_`, así que no aparecería como una serie más en la tabla.
    expect(DOC_CONFIG_EMBARQUES.startsWith('embarques_')).toBe(false);
  });
});

describe('formatFolioSerie sigue sirviendo a quien ya lo llamaba', () => {
  it('con tres argumentos da lo mismo que antes de la tarea 66', () => {
    expect(formatFolioSerie('VLIT', 108, 2026)).toBe('VLIT-26-108');
  });
});
