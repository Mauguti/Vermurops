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
import { UserRole, isViewAllowed } from './users';

describe('matriz de responsabilidades §4.1', () => {
  // Fila = capacidad, valor = roles que la tienen.
  // 'admin' aparece en todas por ser superusuario técnico, no por ser un área.
  const MATRIZ: Array<[Capacidad, UserRole[]]> = [
    ['lead.crear',           ['ventas', 'admin']],
    ['cotizacion.solicitar', ['ventas', 'pricing', 'admin']],
    ['cotizacion.crear',     ['pricing', 'admin']],
    ['tarifa.gestionar',     ['pricing', 'admin']],
    ['tarifario.cargar',     ['pricing', 'admin']],
    ['cliente.alta',         ['administracion', 'admin']],
    ['proveedor.alta',       ['administracion', 'admin']],
    ['puerto.alta',          ['administracion', 'admin']],
    ['embarque.generar',     ['operaciones', 'admin']],
    ['factura.generar',      ['operaciones', 'administracion', 'admin']],
    ['notaCredito.generar',  ['operaciones', 'administracion', 'admin']],
    ['kanban.ver',           ['ventas', 'admin']],
  ];

  const ROLES: UserRole[] = ['ventas', 'pricing', 'operaciones', 'administracion', 'admin'];

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

  it('Administración es la única ÁREA con las tres altas definitivas', () => {
    // Se excluye 'admin' del conteo a propósito: es superusuario técnico, no un
    // área. Lo que el cliente pidió es que ningún otro ÁREA dé altas.
    const AREAS: UserRole[] = ['ventas', 'pricing', 'operaciones', 'administracion'];
    (['cliente.alta', 'proveedor.alta', 'puerto.alta'] as Capacidad[]).forEach(cap => {
      expect(AREAS.filter(rol => puede(rol, cap))).toEqual(['administracion']);
    });
  });

  it('Operaciones no da altas de catálogo: solo embarque y facturación', () => {
    expect(puede('operaciones', 'cliente.alta')).toBe(false);
    expect(puede('operaciones', 'proveedor.alta')).toBe(false);
    expect(puede('operaciones', 'puerto.alta')).toBe(false);
    expect(puede('operaciones', 'embarque.generar')).toBe(true);
  });

  it('Administración no cotiza ni gestiona tarifas', () => {
    expect(puedeCrearCotizacion('administracion', 'solicitud_cliente')).toBe(false);
    expect(puedeCrearCotizacion('administracion', 'cotizada')).toBe(false);
    expect(puede('administracion', 'tarifa.gestionar')).toBe(false);
  });

  it('«admin» es superusuario técnico, no el área Administración', () => {
    // Si algún día se separan de verdad, este test obliga a revisar el modelo.
    expect(puede('admin', 'cliente.alta')).toBe(true);
    expect(puede('admin', 'cotizacion.crear')).toBe(true);
    expect(puede('admin', 'embarque.generar')).toBe(true);
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
    expect(puedeCrearCotizacion(undefined, 'solicitud_cliente')).toBe(false);
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
  it('todos los roles del sistema están en la matriz de capacidades', () => {
    // Un rol sin entrada aquí se queda sin ninguna capacidad y el síntoma
    // («no me aparece nada») es difícil de rastrear.
    const ROLES_DEL_SISTEMA: UserRole[] = ['ventas', 'pricing', 'operaciones', 'administracion', 'admin'];
    ROLES_DEL_SISTEMA.forEach(rol => {
      expect(CAPACIDADES_POR_ROL[rol]).toBeDefined();
      expect(CAPACIDADES_POR_ROL[rol].length).toBeGreaterThan(0);
    });
  });

  it('admin tiene todas las capacidades declaradas', () => {
    expect([...CAPACIDADES_POR_ROL.admin].sort()).toEqual([...TODAS_LAS_CAPACIDADES].sort());
  });

  it('toda capacidad usada en la matriz está declarada en TODAS_LAS_CAPACIDADES', () => {
    Object.values(CAPACIDADES_POR_ROL).flat().forEach(cap => {
      expect(TODAS_LAS_CAPACIDADES).toContain(cap);
    });
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Ver ≠ dar de alta.
//
// Decisiones tomadas con Mau el 27-ago-2026. Están aquí y no solo en un comentario
// porque un rebase o un refactor de vistas puede borrarlas sin que nadie lo note.
// ─────────────────────────────────────────────────────────────────────────────
describe('vista vs. capacidad de alta', () => {
  it('Pricing VE el catálogo de puertos pero NO puede darlos de alta', () => {
    // La matriz restringe «Alta de puertos», no la consulta. Pricing necesita el
    // catálogo para capturar la ruta de una tarifa marítima.
    expect(isViewAllowed('pricing', 'puertos')).toBe(true);
    expect(puede('pricing', 'puerto.alta')).toBe(false);
  });

  it('Pricing NO tiene sección independiente de Documentos', () => {
    // «Los documentos deberían generarse dentro del embarque o cotización.»
    expect(isViewAllowed('pricing', 'documents')).toBe(false);
  });

  it('Pricing entra al módulo de Tarifas: la matriz le da gestionarlas', () => {
    expect(isViewAllowed('pricing', 'rates')).toBe(true);
    expect(puede('pricing', 'tarifa.gestionar')).toBe(true);
    expect(puede('pricing', 'tarifario.cargar')).toBe(true);
  });

  it('Ventas VE clientes pero NO puede darlos de alta', () => {
    expect(isViewAllowed('ventas', 'clients')).toBe(true);
    expect(puede('ventas', 'cliente.alta')).toBe(false);
  });
});
