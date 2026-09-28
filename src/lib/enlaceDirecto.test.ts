import { describe, it, expect } from 'vitest';
import {
  urlDeEntidad, leerEntidadDeUrl, esParametroDeEntidad, urlSinEntidad,
} from './enlaceDirecto';

describe('urlDeEntidad', () => {
  it('un parámetro por tipo, legible a simple vista', () => {
    expect(urlDeEntidad('proveedor', 'PRV-0042')).toBe('/?proveedor=PRV-0042');
    expect(urlDeEntidad('cliente', 'CLI-0001')).toBe('/?cliente=CLI-0001');
    expect(urlDeEntidad('cotizacion', 'COT-2026-0035')).toBe('/?cotizacion=COT-2026-0035');
    expect(urlDeEntidad('ordenCompra', 'OC-2026-0007')).toBe('/?orden=OC-2026-0007');
  });

  it('escapa el id: los folios de Magaya traen espacios y barras', () => {
    expect(urlDeEntidad('embarque', 'VL 26/044930')).toBe('/?embarque=VL%2026%2F044930');
  });

  it('acepta otra base, para un canal de preview', () => {
    expect(urlDeEntidad('cliente', 'CLI-1', 'https://x.web.app/')).toBe('https://x.web.app/?cliente=CLI-1');
  });
});

describe('leerEntidadDeUrl', () => {
  it('lee el destino', () => {
    expect(leerEntidadDeUrl('?proveedor=PRV-0042')).toEqual({ tipo: 'proveedor', id: 'PRV-0042' });
  });

  it('des-escapa el id', () => {
    expect(leerEntidadDeUrl('?embarque=VL%2026%2F044930')).toEqual({ tipo: 'embarque', id: 'VL 26/044930' });
  });

  it('sin parámetros no pide nada', () => {
    expect(leerEntidadDeUrl('')).toBeNull();
    expect(leerEntidadDeUrl('?otra=cosa')).toBeNull();
  });

  it('un id vacío o de espacios NO abre una ficha', () => {
    // Abrir una ficha vacía se ve igual que un dato que se perdió.
    expect(leerEntidadDeUrl('?cliente=')).toBeNull();
    expect(leerEntidadDeUrl('?cliente=%20%20')).toBeNull();
  });

  it('con varios gana el orden declarado, no el orden de la cadena', () => {
    // La misma URL abre siempre lo mismo, sin depender de cómo se escribió.
    const a = leerEntidadDeUrl('?proveedor=PRV-1&cotizacion=COT-1');
    const b = leerEntidadDeUrl('?cotizacion=COT-1&proveedor=PRV-1');
    expect(a).toEqual(b);
    expect(a).toEqual({ tipo: 'cotizacion', id: 'COT-1' });
  });

  it('convive con los parámetros del correo de contraseña', () => {
    expect(leerEntidadDeUrl('?mode=resetPassword&oobCode=abc')).toBeNull();
  });
});

describe('limpiar la URL', () => {
  it('quita los nuestros y conserva los demás', () => {
    expect(urlSinEntidad('/', '?cliente=CLI-1&mode=resetPassword&oobCode=abc'))
      .toBe('/?mode=resetPassword&oobCode=abc');
  });

  it('sin nada que conservar queda solo la ruta', () => {
    expect(urlSinEntidad('/', '?proveedor=PRV-1')).toBe('/');
  });

  it('una URL sin parámetros no cambia', () => {
    expect(urlSinEntidad('/', '')).toBe('/');
  });

  it('reconoce cuáles son nuestros', () => {
    expect(esParametroDeEntidad('proveedor')).toBe(true);
    expect(esParametroDeEntidad('orden')).toBe(true);
    expect(esParametroDeEntidad('oobCode')).toBe(false);
  });
});
