/**
 * formatoFolioSerie.test.ts — tarea 66.
 *
 * Lo que amarran estos tests: que el folio se arme bien con los formatos que
 * Vermur podría pedir —incluida la lectura literal de «BLIM + año + tres
 * dígitos»—, que el predeterminado siga siendo exactamente el `VLIM-26-001`
 * que ya se imprimió, que el cambio de año solo mueva el segmento del año, y
 * que un valor basura guardado a mano no pueda producir un folio sin número.
 */

import { describe, it, expect } from 'vitest';
import {
  FORMATO_FOLIO_PREDETERMINADO, MAX_DIGITOS, anioDeFolio, armarFolioSerie,
  ejemploFolio, formatoDeSerie, formatoParaGuardar, formatoPersonalizado,
  razonFormatoInvalido, type FormatoFolioSerie,
} from './formatoFolioSerie';

const PRED: FormatoFolioSerie = { prefijo: 'VLIM', ...FORMATO_FOLIO_PREDETERMINADO };

describe('el predeterminado es el formato que ya se imprimió', () => {
  it('sin nada guardado arma VLIM-26-001', () => {
    expect(armarFolioSerie('VLIM', 1, 2026)).toBe('VLIM-26-001');
  });

  it('continúa la serie histórica de Magaya: VLIT iba en 107', () => {
    expect(armarFolioSerie('VLIT', 108, 2026)).toBe('VLIT-26-108');
  });

  it('pasa de tres dígitos sin truncar cuando la serie los rebasa', () => {
    // 1000 embarques en una serie no es realista, pero un folio recortado a
    // «000» sí sería un documento emitido con el número de otro.
    expect(armarFolioSerie('VLIM', 1000, 2026)).toBe('VLIM-26-1000');
  });

  it('el formato guardado igual al default no cuenta como personalizado', () => {
    expect(formatoPersonalizado('VLIM', PRED)).toBe(false);
    expect(formatoParaGuardar('VLIM', PRED)).toBeNull();
  });
});

describe('las dos lecturas del formato que dejó la sesión del 2-oct', () => {
  // «BLIM + año + tres dígitos… para enero va el 27, así que arrancamos en 2701»

  it('lectura A — es VLIM con el formato de hoy: VLIM-27-001', () => {
    expect(armarFolioSerie('VLIM', 1, 2027)).toBe('VLIM-27-001');
  });

  it('lectura B — literal, prefijo BLIM y todo pegado: BLIM27001', () => {
    const f = { prefijo: 'BLIM', separador: '', digitosAnio: 2 as const, digitos: 3 };
    expect(armarFolioSerie('VLIM', 1, 2027, f)).toBe('BLIM27001');
  });

  it('el prefijo impreso no cambia la serie del contador', () => {
    // La identidad del contador es la clave de la serie (contadores/
    // embarques_VLIM), y por eso se sigue pasando aparte del formato.
    const f = { prefijo: 'BLIM' };
    expect(formatoDeSerie('VLIM', f).prefijo).toBe('BLIM');
    expect(armarFolioSerie('VLIM', 5, 2027, f)).toBe('BLIM-27-005');
  });

  it('lectura B2 — «2701» como bloque de cuatro: año de 2 y dos dígitos', () => {
    const f = { prefijo: 'BLIM', separador: '', digitosAnio: 2 as const, digitos: 2 };
    expect(armarFolioSerie('VLIM', 1, 2027, f)).toBe('BLIM2701');
  });
});

describe('cada pieza del formato', () => {
  it('año a cuatro dígitos', () => {
    expect(armarFolioSerie('VLEM', 7, 2026, { digitosAnio: 4 })).toBe('VLEM-2026-007');
  });

  it('sin año', () => {
    expect(armarFolioSerie('VLEM', 7, 2026, { digitosAnio: 0 })).toBe('VLEM-007');
  });

  it('diagonal como separador', () => {
    expect(armarFolioSerie('VLIA', 20, 2026, { separador: '/' })).toBe('VLIA/26/020');
  });

  it('cinco dígitos de consecutivo', () => {
    expect(armarFolioSerie('VLIA', 20, 2026, { digitos: 5 })).toBe('VLIA-26-00020');
  });

  it('un dígito no mete ceros a la izquierda', () => {
    expect(armarFolioSerie('VL', 9, 2026, { digitos: 1 })).toBe('VL-26-9');
  });
});

describe('el cambio de año', () => {
  it('cambia el segmento del año y el consecutivo SIGUE', () => {
    // El contador es un entero que no se reinicia: 2026 cierra en 014 y enero
    // de 2027 abre en 015. Que deba abrir en 001 es la pregunta de negocio del
    // reporte 66; hoy el sistema hace esto, y el test lo deja escrito.
    expect(armarFolioSerie('VLIM', 14, 2026)).toBe('VLIM-26-014');
    expect(armarFolioSerie('VLIM', 15, 2027)).toBe('VLIM-27-015');
  });

  it('el año de dos dígitos sale del año completo, no de un recorte a mano', () => {
    expect(armarFolioSerie('VLIM', 1, 2030)).toBe('VLIM-30-001');
    expect(armarFolioSerie('VLIM', 1, 2100)).toBe('VLIM-00-001');
  });

  it('anioDeFolio lee el año del folio emitido', () => {
    expect(anioDeFolio('VLIM-27-015', 'VLIM')).toBe(2027);
    expect(anioDeFolio('VLEM-2026-007', 'VLEM', { digitosAnio: 4 })).toBe(2026);
    expect(anioDeFolio('BLIM27001', 'VLIM', { prefijo: 'BLIM', separador: '' })).toBe(2027);
  });

  it('anioDeFolio devuelve null en vez de adivinar', () => {
    // Un folio de Magaya, uno sin año y uno de otra serie: ninguno lo dice.
    expect(anioDeFolio('BOL 9016543', 'VLIM')).toBeNull();
    expect(anioDeFolio('VLIM-001', 'VLIM', { digitosAnio: 0 })).toBeNull();
    expect(anioDeFolio('VLIT-26-001', 'VLIM')).toBeNull();
  });
});

describe('ejemploFolio es el siguiente, no el último', () => {
  it('con el contador en 107 muestra el 108', () => {
    expect(ejemploFolio('VLIT', 107, 2026)).toBe('VLIT-26-108');
  });

  it('con el contador sin sembrar muestra el 001', () => {
    expect(ejemploFolio('VLIM', 0, 2026)).toBe('VLIM-26-001');
  });
});

describe('lo guardado se lee con respaldo', () => {
  // Las reglas de hoy dejan a cualquiera del equipo escribir en `contadores`
  // desde la consola del navegador (§6). Un valor basura no puede dejar la
  // pantalla en blanco ni producir un folio sin número.

  it('un separador desconocido cae al guion', () => {
    expect(armarFolioSerie('VLIM', 1, 2026, { separador: '¬' })).toBe('VLIM-26-001');
  });

  it('dígitos no entero, negativo o absurdo caen al default', () => {
    expect(armarFolioSerie('VLIM', 1, 2026, { digitos: 2.5 })).toBe('VLIM-26-001');
    expect(armarFolioSerie('VLIM', 1, 2026, { digitos: -3 })).toBe('VLIM-26-001');
    expect(armarFolioSerie('VLIM', 1, 2026, { digitos: 99 })).toBe('VLIM-26-001');
  });

  it('un año de 3 dígitos cae a 2', () => {
    expect(formatoDeSerie('VLIM', { digitosAnio: 3 as unknown as 2 }).digitosAnio).toBe(2);
  });

  it('un prefijo vacío o con espacios cae a la clave de la serie', () => {
    expect(formatoDeSerie('VLIM', { prefijo: '   ' }).prefijo).toBe('VLIM');
    expect(formatoDeSerie('VLIM', { prefijo: ' BLIM ' }).prefijo).toBe('BLIM');
  });

  it('un formato nulo o basura entero no revienta', () => {
    expect(armarFolioSerie('VLIM', 1, 2026, null)).toBe('VLIM-26-001');
    expect(armarFolioSerie('VLIM', 1, 2026, {} as FormatoFolioSerie)).toBe('VLIM-26-001');
  });

  it('un consecutivo negativo o fraccionario no produce un folio raro', () => {
    expect(armarFolioSerie('VLIM', -4, 2026)).toBe('VLIM-26-000');
    expect(armarFolioSerie('VLIM', 7.9, 2026)).toBe('VLIM-26-007');
  });
});

describe('qué no se puede guardar', () => {
  it('prefijo vacío', () => {
    expect(razonFormatoInvalido({ ...PRED, prefijo: '' })).toMatch(/prefijo/i);
  });

  it('prefijo con caracteres que no van en un documento oficial', () => {
    expect(razonFormatoInvalido({ ...PRED, prefijo: 'VL IM' })).toMatch(/letras y números/i);
    expect(razonFormatoInvalido({ ...PRED, prefijo: 'VL-IM' })).toMatch(/letras y números/i);
  });

  it('dígitos fuera de rango', () => {
    expect(razonFormatoInvalido({ ...PRED, digitos: 0 })).toMatch(/1 a 8/);
    expect(razonFormatoInvalido({ ...PRED, digitos: MAX_DIGITOS + 1 })).toMatch(/1 a 8/);
  });

  it('año distinto de 0, 2 o 4', () => {
    expect(razonFormatoInvalido({ ...PRED, digitosAnio: 3 as unknown as 2 })).toMatch(/año/i);
  });

  it('el predeterminado y una variante válida sí se pueden guardar', () => {
    expect(razonFormatoInvalido(PRED)).toBeNull();
    expect(razonFormatoInvalido({ prefijo: 'BLIM', separador: '', digitosAnio: 2, digitos: 3 })).toBeNull();
  });

  it('formatoParaGuardar devuelve el formato completo cuando sí cambia', () => {
    const f = formatoParaGuardar('VLIM', { prefijo: 'BLIM', separador: '', digitosAnio: 2, digitos: 3 });
    expect(f).toEqual({ prefijo: 'BLIM', separador: '', digitosAnio: 2, digitos: 3 });
  });
});
