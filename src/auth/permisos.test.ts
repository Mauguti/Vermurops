/**
 * permisos.test.ts
 *
 * La matriz de §4.1 del CLAUDE.md, codificada. Si alguien cambia
 * CAPACIDADES_POR_ROL sin que el cliente lo pida, esto truena.
 */

import { describe, it, expect } from 'vitest';
import {
  puede,
  puedeCrearCotizacion,
  exigir,
  PermisoDenegadoError,
  CAPACIDADES_POR_ROL,
  TODAS_LAS_CAPACIDADES,
  Capacidad,
} from './permisos';
import { UserRole } from './users';

describe('matriz de responsabilidades §4.1', () => {
  // Fila = capacidad, columnas = [ventas, pricing, admin, operaciones]
  const MATRIZ: Array<[Capacidad, UserRole[]]> = [
    ['lead.crear',           ['ventas', 'admin']],
    ['cotizacion.solicitar', ['ventas', 'pricing', 'admin']],
    ['cotizacion.crear',     ['pricing', 'admin']],
    ['tarifa.gestionar',     ['pricing', 'admin']],
    ['tarifario.cargar',     ['pricing', 'admin']],
    ['cliente.alta',         ['admin']],
    ['proveedor.alta',       ['admin']],
    ['puerto.alta',          ['admin']],
    ['embarque.generar',     ['operaciones', 'admin']],
    ['factura.generar',      ['operaciones', 'admin']],
    ['notaCredito.generar',  ['operaciones', 'admin']],
    ['kanban.ver',           ['ventas', 'admin']],
  ];

  const ROLES: UserRole[] = ['ventas', 'pricing', 'operaciones', 'admin'];

  MATRIZ.forEach(([cap, rolesConPermiso]) => {
    ROLES.forEach(rol => {
      const esperado = rolesConPermiso.includes(rol);
      it(`${rol} ${esperado ? 'SÍ' : 'NO'} puede «${cap}»`, () => {
        expect(puede(rol, cap)).toBe(esperado);
      });
    });
  });
});

describe('reglas duras que el cliente subrayó', () => {
  it('Ventas no da de alta clientes ni proveedores', () => {
    expect(puede('ventas', 'cliente.alta')).toBe(false);
    expect(puede('ventas', 'proveedor.alta')).toBe(false);
  });

  it('Pricing no da de alta clientes, proveedores ni puertos', () => {
    expect(puede('pricing', 'cliente.alta')).toBe(false);
    expect(puede('pricing', 'proveedor.alta')).toBe(false);
    expect(puede('pricing', 'puerto.alta')).toBe(false);
  });

  it('Pricing no ve el Kanban', () => {
    expect(puede('pricing', 'kanban.ver')).toBe(false);
  });

  it('Operaciones no crea cotizaciones en ninguna etapa', () => {
    expect(puedeCrearCotizacion('operaciones', 'solicitud_cliente')).toBe(false);
    expect(puedeCrearCotizacion('operaciones', 'solicitado_pricing')).toBe(false);
    expect(puedeCrearCotizacion('operaciones', 'cotizada')).toBe(false);
  });

  it('Administración es la única con las tres altas definitivas', () => {
    (['cliente.alta', 'proveedor.alta', 'puerto.alta'] as Capacidad[]).forEach(cap => {
      const conPermiso = (['ventas', 'pricing', 'operaciones', 'admin'] as UserRole[])
        .filter(rol => puede(rol, cap));
      expect(conPermiso).toEqual(['admin']);
    });
  });

  it('el alta rápida de proveedor (probable proveedor) sí es de Pricing', () => {
    expect(puede('pricing', 'proveedor.altaRapida')).toBe(true);
    expect(puede('ventas', 'proveedor.altaRapida')).toBe(false);
  });
});

describe('puedeCrearCotizacion', () => {
  it('Ventas solo puede crear cotizaciones en etapa de solicitud', () => {
    expect(puedeCrearCotizacion('ventas', 'solicitud_cliente')).toBe(true);
    expect(puedeCrearCotizacion('ventas', 'solicitado_pricing')).toBe(true);
    expect(puedeCrearCotizacion('ventas', 'cotizada')).toBe(false);
    expect(puedeCrearCotizacion('ventas', 'consolidada')).toBe(false);
  });

  it('Pricing puede abrir la cotización directamente en cualquier etapa', () => {
    expect(puedeCrearCotizacion('pricing', 'solicitud_cliente')).toBe(true);
    expect(puedeCrearCotizacion('pricing', 'cotizada')).toBe(true);
  });

  it('Admin puede en cualquier etapa', () => {
    expect(puedeCrearCotizacion('admin', 'cotizada')).toBe(true);
  });
});

describe('guardas', () => {
  it('sin sesión no se puede nada', () => {
    TODAS_LAS_CAPACIDADES.forEach(cap => {
      expect(puede(undefined, cap)).toBe(false);
      expect(puede(null, cap)).toBe(false);
    });
  });

  it('exigir() lanza PermisoDenegadoError con el rol y la capacidad', () => {
    expect(() => exigir('ventas', 'cliente.alta')).toThrow(PermisoDenegadoError);
    try {
      exigir('ventas', 'cliente.alta');
    } catch (e) {
      const err = e as PermisoDenegadoError;
      expect(err.rol).toBe('ventas');
      expect(err.capacidad).toBe('cliente.alta');
      expect(err.message).toContain('cliente.alta');
    }
  });

  it('exigir() no lanza cuando el rol sí tiene la capacidad', () => {
    expect(() => exigir('admin', 'cliente.alta')).not.toThrow();
  });
});

describe('integridad de la matriz', () => {
  it('admin tiene todas las capacidades declaradas', () => {
    expect([...CAPACIDADES_POR_ROL.admin].sort()).toEqual([...TODAS_LAS_CAPACIDADES].sort());
  });

  it('toda capacidad usada en la matriz está declarada en TODAS_LAS_CAPACIDADES', () => {
    Object.values(CAPACIDADES_POR_ROL).flat().forEach(cap => {
      expect(TODAS_LAS_CAPACIDADES).toContain(cap);
    });
  });
});
