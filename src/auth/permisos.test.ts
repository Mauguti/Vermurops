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
  puedeGuardarEmbarque,
  capacidadParaGuardarEmbarque,
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
    ['catalogo.importarMasivo', ['admin']],
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

  it('la importación masiva de catálogos es exclusiva de admin', () => {
    // Sobrescribe ~817 clientes vivos contra la base en uso. Los datos llevan
    // semanas cargados: el botón ya cumplió su función y hoy solo puede dañar.
    // Ni siquiera Administración, que sí da altas una por una, lo tiene.
    const AREAS: UserRole[] = ['ventas', 'pricing', 'operaciones', 'administracion'];
    AREAS.forEach(rol => {
      expect(puede(rol, 'catalogo.importarMasivo')).toBe(false);
    });
    expect(puede('admin', 'catalogo.importarMasivo')).toBe(true);
  });

  it('dar altas una por una NO implica poder sobrescribir el catálogo', () => {
    expect(puede('administracion', 'cliente.alta')).toBe(true);
    expect(puede('administracion', 'catalogo.importarMasivo')).toBe(false);
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

  it('NINGÚN rol tiene la sección suelta de Documentos', () => {
    // «Los documentos deberían generarse dentro del embarque o cotización»
    // (cliente, 27-ago-2026). Decidido con Mau: desaparece para todos, no solo
    // para Pricing. Vuelve a existir cuando los Bloques 4 y 5 la reubiquen.
    const ROLES: UserRole[] = ['ventas', 'pricing', 'operaciones', 'administracion', 'admin'];
    ROLES.forEach(rol => {
      expect(isViewAllowed(rol, 'documents')).toBe(false);
    });
  });

  it('NINGÚN rol tiene la vista suelta de Pricing', () => {
    // Era una bandeja de RFQs con datos de ejemplo, anterior a que el trabajo
    // de Pricing viviera en la Bandeja del módulo de cotizaciones: dos
    // pantallas para lo mismo y solo una con datos reales.
    //
    // Ojo con la distinción: el ROL 'pricing' sigue existiendo y es quien
    // cotiza. Lo que se retiró es la VISTA del mismo nombre.
    const ROLES: UserRole[] = ['ventas', 'pricing', 'operaciones', 'administracion', 'admin'];
    ROLES.forEach(rol => {
      expect(isViewAllowed(rol, 'pricing')).toBe(false);
    });
    expect(puede('pricing', 'cotizacion.crear')).toBe(true);
  });

  it('Operaciones no entra al módulo de Cotizaciones', () => {
    // «Operaciones: quitar creación de cotizaciones». Decidido con Mau: se
    // retira el módulo completo, no solo el permiso de crear.
    expect(isViewAllowed('operaciones', 'quotes')).toBe(false);
    expect(puedeCrearCotizacion('operaciones', 'solicitud_cliente')).toBe(false);
  });

  it('Administración entra a clientes Y puede darlos de alta', () => {
    expect(isViewAllowed('administracion', 'clients')).toBe(true);
    expect(puede('administracion', 'cliente.alta')).toBe(true);
  });

  it('Pricing entra al módulo de Tarifas: la matriz le da gestionarlas', () => {
    expect(isViewAllowed('pricing', 'rates')).toBe(true);
    expect(puede('pricing', 'tarifa.gestionar')).toBe(true);
    expect(puede('pricing', 'tarifario.cargar')).toBe(true);
  });

  it('Ventas CONSULTA el módulo de Altas pero no da de alta ni edita', () => {
    // Segunda corrección (2-sep-2026). El 30-ago se quitó la vista completa
    // por la queja de Luis; al reportar «sigue el módulo de altas disponible
    // para todos» se aterrizó la distinción de puertos: VER y DAR DE ALTA son
    // cosas distintas. Ventas necesita consultar clientes y proveedores para
    // trabajar; lo que no puede es alterarlos.
    expect(isViewAllowed('ventas', 'clients')).toBe(true);
    expect(puede('ventas', 'cliente.alta')).toBe(false);
    expect(puede('ventas', 'proveedor.alta')).toBe(false);
    expect(puede('ventas', 'proveedor.altaRapida')).toBe(false);
  });

  it('Pricing y Operaciones consultan Altas sin poder dar de alta', () => {
    (['pricing', 'operaciones'] as UserRole[]).forEach(rol => {
      expect(isViewAllowed(rol, 'clients')).toBe(true);
      expect(puede(rol, 'cliente.alta')).toBe(false);
      expect(puede(rol, 'proveedor.alta')).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Guardado de embarques — crear no es lo mismo que editar.
// ─────────────────────────────────────────────────────────────────────────────
describe('permiso para guardar un embarque', () => {
  it('crear un embarque exige la capacidad; editar no', () => {
    expect(capacidadParaGuardarEmbarque(true)).toBe('embarque.generar');
    expect(capacidadParaGuardarEmbarque(false)).toBeNull();
  });

  it('Administración NO crea embarques', () => {
    expect(puedeGuardarEmbarque('administracion', true)).toBe(false);
  });

  it('Administración SÍ edita un embarque existente: le tocan dos de los tres cierres', () => {
    // §4.7: operativo → Operaciones, de pago → Admin, administrativo → Admin.
    // Si esto se pone en false, Julio se queda sin poder cerrar nada.
    expect(puedeGuardarEmbarque('administracion', false)).toBe(true);
  });

  it('Operaciones crea y edita', () => {
    expect(puedeGuardarEmbarque('operaciones', true)).toBe(true);
    expect(puedeGuardarEmbarque('operaciones', false)).toBe(true);
  });

  it('Ventas y Pricing no crean embarques', () => {
    expect(puedeGuardarEmbarque('ventas', true)).toBe(false);
    expect(puedeGuardarEmbarque('pricing', true)).toBe(false);
  });

  it('sin sesión no se guarda nada, ni siquiera una edición', () => {
    expect(puedeGuardarEmbarque(undefined, false)).toBe(false);
    expect(puedeGuardarEmbarque(null, true)).toBe(false);
  });
});

describe('Pricing crea cotizaciones directo (sesión 30-ago-2026)', () => {
  it('puede abrir la cotización directamente en su propia etapa de trabajo', () => {
    // Gabi: «me lo pide el cliente, yo lo trabajo. No me lo pide el cliente, yo
    // me lo pido a mí y después yo lo trabajo. Porque eso es doble tarea».
    expect(puedeCrearCotizacion('pricing', 'pricing_solicitando')).toBe(true);
  });

  it('Ventas NO puede saltarse el paso de solicitud', () => {
    expect(puedeCrearCotizacion('ventas', 'pricing_solicitando')).toBe(false);
  });
});

// ─── Órdenes de compra: el flujo de DOS áreas (C-2) ─────────────────────────
//
//     OPERACIONES solicita y gestiona → ADMINISTRACIÓN autoriza y paga
//
// El plan decía «PRICING solicita» y al aterrizarlo no encajó: Pricing no ve
// embarques ni gestiona pagos, así que la capacidad quedaba asignada y sin
// ninguna pantalla donde ejercerla.
//
// Cada paso necesita DOS cosas: la capacidad y el lugar donde ejercerla.
// Faltó la segunda y el paso del medio se quedó sin lugar: Operaciones podía
// gestionar y no tenía cómo llegar a la bandeja.

describe('Órdenes de compra · capacidad y pantalla', () => {
  it('Pricing NO solicita pagos: cotiza y compara, no gestiona dinero', () => {
    expect(puede('pricing', 'ordenCompra.solicitar')).toBe(false);
    expect(puede('pricing', 'ordenCompra.gestionar')).toBe(false);
    expect(puede('pricing', 'ordenCompra.autorizar')).toBe(false);
  });

  it('Operaciones solicita y gestiona, pero no autoriza el pago', () => {
    expect(puede('operaciones', 'ordenCompra.solicitar')).toBe(true);
    expect(puede('operaciones', 'ordenCompra.gestionar')).toBe(true);
    expect(puede('operaciones', 'ordenCompra.autorizar')).toBe(false);
  });

  it('Administración autoriza y también solicita: carga los gastos de oficina', () => {
    expect(puede('administracion', 'ordenCompra.autorizar')).toBe(true);
    expect(puede('administracion', 'ordenCompra.solicitar')).toBe(true);
  });

  it('Administración NO gestiona: ese paso es de Operaciones', () => {
    expect(puede('administracion', 'ordenCompra.gestionar')).toBe(false);
  });

  it('Ventas no toca las órdenes de compra', () => {
    expect(puede('ventas', 'ordenCompra.solicitar')).toBe(false);
    expect(puede('ventas', 'ordenCompra.gestionar')).toBe(false);
    expect(puede('ventas', 'ordenCompra.autorizar')).toBe(false);
  });

  it('quien gestiona o autoriza llega al módulo donde vive la bandeja', () => {
    expect(isViewAllowed('operaciones', 'finance')).toBe(true);
    expect(isViewAllowed('administracion', 'finance')).toBe(true);
  });

  it('Ventas sigue sin ver Finanzas', () => {
    expect(isViewAllowed('ventas', 'finance')).toBe(false);
  });

  it('Operaciones sigue sin ver Cotizaciones: agregar Finanzas no aflojó lo demás', () => {
    expect(isViewAllowed('operaciones', 'quotes')).toBe(false);
  });
});

