import { describe, it, expect } from 'vitest';
import {
  puedeEditarEnLista, estaActivo, conEstado, soloActivos, paraSelector,
  aplicarCambio, textoCambio, ROL_DEL_AREA, CAMPO_EJECUTIVO,
  type CambioEnLista,
} from './edicionEnLista';

describe('quién edita', () => {
  it('admin y administracion', () => {
    expect(puedeEditarEnLista('admin')).toBe(true);
    expect(puedeEditarEnLista('administracion')).toBe(true);
  });
  it('los demás solo miran', () => {
    expect(puedeEditarEnLista('ventas')).toBe(false);
    expect(puedeEditarEnLista('pricing')).toBe(false);
    expect(puedeEditarEnLista('operaciones')).toBe(false);
    expect(puedeEditarEnLista(undefined)).toBe(false);
    expect(puedeEditarEnLista(null)).toBe(false);
  });
});

describe('el estado vive en dos campos distintos', () => {
  it('el cliente usa statusOperativo', () => {
    expect(estaActivo({ statusOperativo: 'ACTIVO' })).toBe(true);
    expect(estaActivo({ statusOperativo: 'INACTIVO' })).toBe(false);
  });

  it('el proveedor usa activo', () => {
    expect(estaActivo({ activo: true })).toBe(true);
    expect(estaActivo({ activo: false })).toBe(false);
  });

  it('sin marca cuenta como ACTIVO', () => {
    // Los registros viejos son los que se usan todos los días: esconderlos
    // por un campo que nadie escribió sería una baja masiva silenciosa.
    expect(estaActivo({})).toBe(true);
  });

  it('conEstado escribe en el campo que le toca', () => {
    expect(conEstado({ statusOperativo: 'ACTIVO' }, false)).toEqual({ statusOperativo: 'INACTIVO' });
    expect(conEstado({ activo: true }, false)).toEqual({ activo: false });
  });

  it('no muta la entidad que recibe', () => {
    const p = { activo: true };
    conEstado(p, false);
    expect(p.activo).toBe(true);
  });
});

describe('lo que se ofrece al crear algo nuevo', () => {
  const lista = [
    { id: 'A', activo: true },
    { id: 'B', activo: false },
    { id: 'C' },
  ];

  it('solo los activos', () => {
    expect(soloActivos(lista).map(e => e.id)).toEqual(['A', 'C']);
  });

  it('el selector conserva el que YA estaba elegido, aunque esté inactivo', () => {
    // Si no, abrir un registro viejo mostraría el selector en blanco y
    // guardar cualquier otra cosa lo borraría sin que nadie lo pidiera.
    expect(paraSelector(lista, 'B').map(e => e.id)).toEqual(['A', 'B', 'C']);
  });

  it('sin nada elegido se comporta como soloActivos', () => {
    expect(paraSelector(lista).map(e => e.id)).toEqual(['A', 'C']);
    expect(paraSelector(lista, null).map(e => e.id)).toEqual(['A', 'C']);
  });
});

describe('el registro de quién cambió qué', () => {
  const AHORA = '2026-09-28T10:00:00.000Z';

  it('guarda el valor anterior y el nuevo', () => {
    const r = aplicarCambio(
      { responsableVentas: null }, 'responsableVentas',
      'itzel.laurean@vermur.com', 'Luis', AHORA,
    );
    expect(r).not.toBeNull();
    expect(r!.cambio).toEqual({
      campo: 'responsableVentas', antes: '—',
      despues: 'itzel.laurean@vermur.com', por: 'Luis', fecha: AHORA,
    });
    expect(r!.entidad.responsableVentas).toBe('itzel.laurean@vermur.com');
  });

  it('un cambio que no cambia nada NO se registra', () => {
    // «Luis cambió X de A a A» ensucia el historial y hace que el de verdad
    // se pierda entre ruido.
    expect(aplicarCambio({ activo: true }, 'activo', true, 'Luis', AHORA)).toBeNull();
    expect(aplicarCambio({ responsableVentas: null }, 'responsableVentas', '', 'Luis', AHORA)).toBeNull();
  });

  it('acumula sin reescribir los anteriores', () => {
    const uno = aplicarCambio<{ activo: boolean; cambios?: CambioEnLista[] }>(
      { activo: true }, 'activo', false, 'Luis', AHORA)!;
    const dos = aplicarCambio(uno.entidad, 'activo', true, 'Gaby', AHORA)!;
    expect(dos.entidad.cambios).toHaveLength(2);
    expect(dos.entidad.cambios![0].por).toBe('Luis');
    expect(dos.entidad.cambios![1].por).toBe('Gaby');
  });

  it('acepta etiquetas legibles en vez del valor crudo', () => {
    const r = aplicarCambio(
      { activo: true }, 'activo', false, 'Luis', AHORA,
      { antes: 'Activo', despues: 'Inactivo' },
    )!;
    expect(textoCambio(r.cambio, 'Estado')).toBe('Estado: Activo → Inactivo');
  });

  it('no muta la entidad que recibe', () => {
    const e = { activo: true, cambios: [] as never[] };
    aplicarCambio(e, 'activo', false, 'Luis', AHORA);
    expect(e.activo).toBe(true);
    expect(e.cambios).toHaveLength(0);
  });
});

describe('el área y su rol', () => {
  it('«operativo» ofrece usuarios de «operaciones»', () => {
    // El campo se llama distinto que el rol porque viene de Magaya; dejarlo
    // explícito evita derivarlo del nombre, que es donde se cuela el error.
    expect(ROL_DEL_AREA.operativo).toBe('operaciones');
    expect(CAMPO_EJECUTIVO.operativo).toBe('responsableOperativo');
  });

  it('ventas y pricing coinciden con su rol', () => {
    expect(ROL_DEL_AREA.ventas).toBe('ventas');
    expect(ROL_DEL_AREA.pricing).toBe('pricing');
  });
});
