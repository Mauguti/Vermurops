/**
 * seedGuard.test.ts
 *
 * El escenario que motivó este módulo: un snapshot vacío llegado de caché
 * reescribía el catálogo completo encima de datos vivos. Estos tests fijan
 * que eso no puede volver a pasar.
 */

import { describe, it, expect } from 'vitest';
import { evaluarSeed, EXPLICACION, SnapshotLike, RazonNoSembrar } from './seedGuard';

const snap = (
  empty: boolean,
  fromCache: boolean,
  hasPendingWrites = false,
): SnapshotLike => ({ empty, metadata: { fromCache, hasPendingWrites } });

describe('evaluarSeed — el único caso que autoriza sembrar', () => {
  it('siembra solo con snapshot vacío, del servidor y sin escrituras pendientes', () => {
    expect(evaluarSeed(snap(true, false, false), false)).toEqual({ sembrar: true });
  });

  it('el caso feliz deja de serlo si ya se intentó en esta sesión', () => {
    expect(evaluarSeed(snap(true, false, false), true).sembrar).toBe(false);
  });
});

describe('el bug: snapshot vacío desde caché', () => {
  it('NO siembra con un snapshot vacío que viene de caché', () => {
    // Primera carga antes de que responda el servidor, reconexión, o pestaña
    // que estuvo offline. La colección puede tener 544 documentos allá afuera.
    const d = evaluarSeed(snap(true, true), false);
    expect(d.sembrar).toBe(false);
    expect(d.razon).toBe('snapshot-de-cache');
  });

  it('NO siembra estando offline, aunque la caché esté vacía', () => {
    expect(evaluarSeed(snap(true, true), false).sembrar).toBe(false);
  });

  it('NO siembra con escrituras locales sin confirmar', () => {
    const d = evaluarSeed(snap(true, false, true), false);
    expect(d.sembrar).toBe(false);
    expect(d.razon).toBe('escrituras-pendientes');
  });

  it('el snapshot de servidor posterior al de caché sí siembra', () => {
    // Secuencia real de Firestore en una colección vacía de verdad:
    // primero un snapshot de caché, luego el del servidor.
    expect(evaluarSeed(snap(true, true), false).sembrar).toBe(false);
    expect(evaluarSeed(snap(true, false), false).sembrar).toBe(true);
  });
});

describe('colección con datos', () => {
  it('NO siembra si la colección tiene documentos, venga de donde venga', () => {
    [true, false].forEach(fromCache => {
      const d = evaluarSeed(snap(false, fromCache), false);
      expect(d.sembrar).toBe(false);
      expect(d.razon).toBe('coleccion-con-datos');
    });
  });
});

describe('exhaustividad', () => {
  it('de las 8 combinaciones posibles, exactamente una autoriza sembrar', () => {
    const combos: boolean[][] = [];
    for (const empty of [true, false])
      for (const fromCache of [true, false])
        for (const pending of [true, false])
          combos.push([empty, fromCache, pending]);

    const autorizadas = combos.filter(
      ([e, c, p]) => evaluarSeed(snap(e, c, p), false).sembrar,
    );
    expect(autorizadas).toEqual([[true, false, false]]);
  });

  it('toda razón declarada tiene explicación para el log', () => {
    const razones: RazonNoSembrar[] = [
      'ya-intentado', 'coleccion-con-datos', 'snapshot-de-cache', 'escrituras-pendientes',
    ];
    razones.forEach(r => expect(EXPLICACION[r]).toBeTruthy());
  });
});
