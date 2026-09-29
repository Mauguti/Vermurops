import { describe, it, expect } from 'vitest';
import { baseDeFunciones, urlDeFuncion, PROYECTO, REGION } from './urlFunciones';

/*
 * La URL de las Cloud Functions estaba escrita a mano en cuatro hooks, las
 * cuatro apuntando a producción. Contra emuladores la app seguía llamando a
 * producción —que rechaza un token de emulador—, así que un tarifario no se
 * podía reproducir sin ir a producción, que es lo que los emuladores existen
 * para evitar.
 */

describe('a dónde le habla la app', () => {
  it('sin nada declarado, a producción: es lo que hacía antes', () => {
    expect(baseDeFunciones({ emuladores: false }))
      .toBe(`https://${REGION}-${PROYECTO}.cloudfunctions.net`);
  });

  it('con emuladores, al emulador de Functions en :5001', () => {
    expect(baseDeFunciones({ emuladores: true }))
      .toBe(`http://127.0.0.1:5001/${PROYECTO}/${REGION}`);
  });

  it('VITE_FUNCTIONS_URL manda sobre los dos', () => {
    // Para apuntar a un despliegue de prueba sin tocar el código.
    const base = 'https://pruebas.example.com/fn';
    expect(baseDeFunciones({ base, emuladores: true })).toBe(base);
    expect(baseDeFunciones({ base, emuladores: false })).toBe(base);
  });

  it('una base con barra al final no produce una doble', () => {
    expect(urlDeFuncion('extraerTarifas', { base: 'https://x.test/fn/', emuladores: false }))
      .toBe('https://x.test/fn/extraerTarifas');
  });

  it('una base vacía o de puros espacios no cuenta como declarada', () => {
    // Una variable de entorno sin valor es exactamente este caso.
    expect(baseDeFunciones({ base: '   ', emuladores: true }))
      .toBe(`http://127.0.0.1:5001/${PROYECTO}/${REGION}`);
  });

  it('las cuatro Functions salen de la misma base', () => {
    const e = { emuladores: true };
    ['extraerTarifas', 'clasificarDocumento'].forEach(fn => {
      expect(urlDeFuncion(fn, e)).toBe(`http://127.0.0.1:5001/${PROYECTO}/${REGION}/${fn}`);
    });
  });
});
