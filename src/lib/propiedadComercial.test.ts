/**
 * propiedadComercial.test.ts
 *
 * Lo que protegen: el bug de las «desapariciones» del 2-sep-2026. Un registro
 * cuyo dueño no coincide con el usuario por un detalle de formato —o porque el
 * dueño es un nombre inventado del catálogo mock— se vuelve invisible para
 * quien lo creó, y el reporte que llega es «se perdió mi cotización».
 */

import { describe, it, expect } from 'vitest';
import { perteneceAlUsuario, esDuenoMock, visibleParaVentas } from './propiedadComercial';

const ITZEL = { uid: 'uid-123', nombre: 'Itzel Laurean', email: 'itzel.laurean@vermur.com' };

describe('perteneceAlUsuario — tolerante a las cuatro formas del dato viejo', () => {
  it('por uid', () => expect(perteneceAlUsuario('uid-123', ITZEL)).toBe(true));
  it('por nombre (displayName)', () => expect(perteneceAlUsuario('Itzel Laurean', ITZEL)).toBe(true));
  it('por correo completo', () => expect(perteneceAlUsuario('itzel.laurean@vermur.com', ITZEL)).toBe(true));
  it('por prefijo del correo — el nombre ANTES de configurar displayName', () =>
    expect(perteneceAlUsuario('itzel.laurean', ITZEL)).toBe(true));
  it('sin distinguir mayúsculas ni espacios sobrantes', () =>
    expect(perteneceAlUsuario('  ITZEL LAUREAN ', ITZEL)).toBe(true));

  it('lo de otra persona NO es suyo', () =>
    expect(perteneceAlUsuario('Nohema Sosa', ITZEL)).toBe(false));
  it('vacío o sin usuario no pertenece a nadie', () => {
    expect(perteneceAlUsuario('', ITZEL)).toBe(false);
    expect(perteneceAlUsuario('uid-123', null)).toBe(false);
  });
});

describe('esDuenoMock — el catálogo de vendedores inventados', () => {
  it.each(['ventas', 'María López', 'Carlos Gómez', 'Vendedor'])('%s es mock', v =>
    expect(esDuenoMock(v)).toBe(true));
  it('una persona real no es mock', () => expect(esDuenoMock('Itzel Laurean')).toBe(false));
});

describe('visibleParaVentas — lo suyo más los huérfanos', () => {
  it('lo suyo se ve', () => expect(visibleParaVentas('itzel.laurean', ITZEL)).toBe(true));

  it('el huérfano se ve: es como se recuperan los que ya «desaparecieron»', () => {
    // La cotización que Ventas reportó perdida nació con vendedorId 'ventas',
    // el default del dropdown mock. Antes: invisible para todos menos admin.
    expect(visibleParaVentas('ventas', ITZEL)).toBe(true);
    expect(visibleParaVentas('María López', ITZEL)).toBe(true);
  });

  it('lo de otra persona real NO se ve', () =>
    expect(visibleParaVentas('Nohema Sosa', ITZEL)).toBe(false));
});
