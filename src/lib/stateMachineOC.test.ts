/**
 * stateMachineOC.test.ts
 *
 * Tests de la máquina de estados pura del pipeline de Órdenes de Compra.
 * Cubre: transiciones permitidas, bloqueos por rol, bloqueos por validación
 * de negocio (rechazo sin motivo, fondeo, comprobante), estados terminales
 * y transicionesDisponiblesOC().
 *
 * Ejecutar: npx vitest run
 */

import { describe, it, expect } from 'vitest';
import { puedeTransicionarOC, transicionesDisponiblesOC } from './stateMachineOC';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import type { FondeoEmbarque } from './fondeoCliente';
import {
  calcularSaldoPendiente,
  calcularMontoDisponible,
  validarAplicacionAnticipo,
} from '../components/ordenesCompra/OrdenesCompraData';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

/** Construye una OrdenCompra mínima para tests. */
function makeOC(opts: Partial<OrdenCompra> = {}): OrdenCompra {
  return {
    id: 'oc-test-001',
    folio: 'OC-2026-0001',
    origen: 'embarque',
    embarqueId: 'emb-001',
    embarqueFolio: 'EMB-2026-0001',
    clienteId: 'cli-001',
    clienteNombre: 'Cliente Test',
    proveedorId: 'prov-001',
    proveedorNombre: 'Proveedor Test',
    conceptoId: 'conc-001',
    conceptoNombre: 'Flete Marítimo',
    descripcion: 'Pago de flete',
    monto: 10000,
    moneda: 'USD',
    fechaRequerida: '2026-09-01',
    fechaSugeridaPago: null,
    urgencia: 'normal',
    estado: 'solicitada',
    motivoRechazo: null,
    historialEstados: [],
    solicitadaPor: { uid: 'u1', nombre: 'Pricing User', fecha: '2026-08-13T10:00:00Z' },
    gestionadaPor: null,
    autorizadaPor: null,
    pagadaPor: null,
    cuentaBancariaId: null,
    bancoSalida: null,
    cuentaSalida: null,
    facturaAsociada: null,
    comprobantePago: null,
    esAnticipo: false,
    anticiposCruzados: [],
    saldoPendiente: null,
    montoDisponible: null,
    activo: true,
    createdAt: '2026-08-13T10:00:00Z',
    updatedAt: '2026-08-13T10:00:00Z',
    ...opts,
  };
}

/**
 * Fondeo del embarque para los tests.
 *
 * Se sigue expresando como «cuánto entró» y «cuánto está comprometido»
 * —así lo piensa Administración— y se traduce a la forma POR MONEDA que usa
 * evaluarFondeo (§4.3).
 *
 * Los importes van en USD porque las OCs de estos tests son en USD: un
 * depósito en la otra moneda NO fondea la orden, que es precisamente lo que
 * §4.3 protege.
 */
function makeFondeo(
  opts: { totalFondeo?: number; totalOCsPendientes?: number } = {},
): FondeoEmbarque {
  const depositado = opts.totalFondeo ?? 50000;
  const comprometido = opts.totalOCsPendientes ?? 10000;
  return {
    depositado: { USD: depositado, MXN: 0 },
    comprometido: { USD: comprometido, MXN: 0 },
    disponible: { USD: depositado - comprometido, MXN: 0 },
  };
}

// ─── A. Transiciones permitidas (happy path) ───────────────────────────────────

describe('A. Transiciones permitidas', () => {
  it('operaciones puede tomar en gestión una OC solicitada', () => {
    const oc = makeOC();
    expect(puedeTransicionarOC('solicitada', 'en_gestion', 'operaciones', oc).ok).toBe(true);
  });

  it('admin puede tomar en gestión una OC solicitada', () => {
    const oc = makeOC();
    expect(puedeTransicionarOC('solicitada', 'en_gestion', 'admin', oc).ok).toBe(true);
  });

  it('admin puede autorizar OC en gestión con fondeo suficiente', () => {
    const oc = makeOC({ estado: 'en_gestion' });
    const fondeo = makeFondeo({ totalFondeo: 50000, totalOCsPendientes: 10000 });
    expect(puedeTransicionarOC('en_gestion', 'autorizada', 'admin', oc, fondeo).ok).toBe(true);
  });

  it('admin puede autorizar OC de oficina sin contexto de fondeo', () => {
    const oc = makeOC({ estado: 'en_gestion', origen: 'oficina', embarqueId: null });
    expect(puedeTransicionarOC('en_gestion', 'autorizada', 'admin', oc).ok).toBe(true);
  });

  it('admin puede pagar OC autorizada con comprobante', () => {
    const oc = makeOC({ estado: 'autorizada', comprobantePago: 'REF-BBVA-12345' });
    expect(puedeTransicionarOC('autorizada', 'pagada', 'admin', oc).ok).toBe(true);
  });

  it('operaciones puede rechazar OC solicitada con motivo', () => {
    const oc = makeOC({ motivoRechazo: 'Monto incorrecto' });
    expect(puedeTransicionarOC('solicitada', 'rechazada', 'operaciones', oc).ok).toBe(true);
  });

  it('admin puede rechazar OC en gestión con motivo', () => {
    const oc = makeOC({ estado: 'en_gestion', motivoRechazo: 'Proveedor equivocado' });
    expect(puedeTransicionarOC('en_gestion', 'rechazada', 'admin', oc).ok).toBe(true);
  });

  it('admin puede rechazar OC autorizada con motivo', () => {
    const oc = makeOC({ estado: 'autorizada', motivoRechazo: 'Cambio de plan' });
    expect(puedeTransicionarOC('autorizada', 'rechazada', 'admin', oc).ok).toBe(true);
  });
});

// ─── B. Bloqueos por arco inexistente ─────────────────────────────────────────

describe('B. Transiciones no permitidas (arco inexistente)', () => {
  it('no se puede saltar de solicitada a autorizada', () => {
    const oc = makeOC();
    const r = puedeTransicionarOC('solicitada', 'autorizada', 'admin', oc);
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/no está permitida/i);
  });

  it('no se puede saltar de solicitada a pagada', () => {
    const oc = makeOC();
    expect(puedeTransicionarOC('solicitada', 'pagada', 'admin', oc).ok).toBe(false);
  });

  it('no se puede saltar de en_gestion a pagada', () => {
    const oc = makeOC({ estado: 'en_gestion' });
    expect(puedeTransicionarOC('en_gestion', 'pagada', 'admin', oc).ok).toBe(false);
  });

  it('estado terminal pagada no tiene salidas — ni para admin', () => {
    const oc = makeOC({ estado: 'pagada' });
    expect(puedeTransicionarOC('pagada', 'solicitada', 'admin', oc).ok).toBe(false);
    expect(puedeTransicionarOC('pagada', 'rechazada', 'admin', oc).ok).toBe(false);
  });

  it('estado terminal rechazada no tiene salidas — ni para admin', () => {
    const oc = makeOC({ estado: 'rechazada' });
    expect(puedeTransicionarOC('rechazada', 'solicitada', 'admin', oc).ok).toBe(false);
    expect(puedeTransicionarOC('rechazada', 'en_gestion', 'admin', oc).ok).toBe(false);
  });
});

// ─── C. Bloqueos por rol ──────────────────────────────────────────────────────

describe('C. Bloqueos por rol incorrecto', () => {
  it('ventas NO puede tomar en gestión', () => {
    const oc = makeOC();
    const r = puedeTransicionarOC('solicitada', 'en_gestion', 'ventas', oc);
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/rol/i);
  });

  it('pricing NO puede tomar en gestión', () => {
    const oc = makeOC();
    expect(puedeTransicionarOC('solicitada', 'en_gestion', 'pricing', oc).ok).toBe(false);
  });

  it('operaciones NO puede autorizar', () => {
    const oc = makeOC({ estado: 'en_gestion' });
    expect(puedeTransicionarOC('en_gestion', 'autorizada', 'operaciones', oc).ok).toBe(false);
  });

  it('operaciones NO puede pagar', () => {
    const oc = makeOC({ estado: 'autorizada', comprobantePago: 'REF-123' });
    expect(puedeTransicionarOC('autorizada', 'pagada', 'operaciones', oc).ok).toBe(false);
  });

  it('ventas NO puede rechazar', () => {
    const oc = makeOC({ motivoRechazo: 'Motivo' });
    expect(puedeTransicionarOC('solicitada', 'rechazada', 'ventas', oc).ok).toBe(false);
  });

  it('pricing NO puede rechazar', () => {
    const oc = makeOC({ motivoRechazo: 'Motivo' });
    expect(puedeTransicionarOC('solicitada', 'rechazada', 'pricing', oc).ok).toBe(false);
  });
});

// ─── D. Bloqueos por validación de negocio ────────────────────────────────────

describe('D. Bloqueos por validación de negocio', () => {
  it('no se puede rechazar sin motivo desde solicitada', () => {
    const oc = makeOC({ motivoRechazo: null });
    const r = puedeTransicionarOC('solicitada', 'rechazada', 'operaciones', oc);
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/motivo/i);
  });

  it('no se puede rechazar con motivo vacío desde solicitada', () => {
    const oc = makeOC({ motivoRechazo: '' });
    const r = puedeTransicionarOC('solicitada', 'rechazada', 'operaciones', oc);
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/motivo/i);
  });

  it('no se puede rechazar sin motivo desde en_gestion', () => {
    const oc = makeOC({ estado: 'en_gestion', motivoRechazo: null });
    const r = puedeTransicionarOC('en_gestion', 'rechazada', 'admin', oc);
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/motivo/i);
  });

  it('no se puede rechazar sin motivo desde autorizada', () => {
    const oc = makeOC({ estado: 'autorizada', motivoRechazo: null });
    const r = puedeTransicionarOC('autorizada', 'rechazada', 'admin', oc);
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/motivo/i);
  });

  it('no se puede pagar sin comprobante', () => {
    const oc = makeOC({ estado: 'autorizada', comprobantePago: null });
    const r = puedeTransicionarOC('autorizada', 'pagada', 'admin', oc);
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/comprobante/i);
  });

  it('no se puede pagar con comprobante vacío', () => {
    const oc = makeOC({ estado: 'autorizada', comprobantePago: '' });
    const r = puedeTransicionarOC('autorizada', 'pagada', 'admin', oc);
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/comprobante/i);
  });
});

// ─── E. Fondeo ────────────────────────────────────────────────────────────────

describe('E. Validación de fondeo', () => {
  it('bloquea autorización si fondeo insuficiente (embarque)', () => {
    const oc = makeOC({ estado: 'en_gestion', origen: 'embarque' });
    const fondeo = makeFondeo({ totalFondeo: 5000, totalOCsPendientes: 10000 });
    const r = puedeTransicionarOC('en_gestion', 'autorizada', 'admin', oc, fondeo);
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/sobregirado/i);
  });

  it('permite autorización si fondeo justo (embarque)', () => {
    const oc = makeOC({ estado: 'en_gestion', origen: 'embarque' });
    const fondeo = makeFondeo({ totalFondeo: 10000, totalOCsPendientes: 10000 });
    expect(puedeTransicionarOC('en_gestion', 'autorizada', 'admin', oc, fondeo).ok).toBe(true);
  });

  it('permite autorización si fondeo sobrado (embarque)', () => {
    const oc = makeOC({ estado: 'en_gestion', origen: 'embarque' });
    const fondeo = makeFondeo({ totalFondeo: 100000, totalOCsPendientes: 10000 });
    expect(puedeTransicionarOC('en_gestion', 'autorizada', 'admin', oc, fondeo).ok).toBe(true);
  });

  it('OC de oficina NO requiere fondeo — pasa sin contexto', () => {
    const oc = makeOC({ estado: 'en_gestion', origen: 'oficina', embarqueId: null });
    expect(puedeTransicionarOC('en_gestion', 'autorizada', 'admin', oc).ok).toBe(true);
  });

  it('OC de oficina pasa incluso con fondeo insuficiente (no se evalúa)', () => {
    const oc = makeOC({ estado: 'en_gestion', origen: 'oficina', embarqueId: null });
    const fondeo = makeFondeo({ totalFondeo: 0, totalOCsPendientes: 10000 });
    expect(puedeTransicionarOC('en_gestion', 'autorizada', 'admin', oc, fondeo).ok).toBe(true);
  });

  /*
   * ── Cambio deliberado (1.1, 7-sep-2026) ────────────────────────────────
   * Antes, una OC de embarque sin contexto de fondeo PASABA: se asumía que
   * el fondeo «no se había calculado todavía». Eso convertía un fallo de
   * carga —o una llamada que se olvidó de pasar los datos— en una
   * autorización de pago.
   *
   * En una regla que protege dinero, la ausencia de datos no es una
   * aprobación. Ahora se detiene y se pide reintentar.
   */
  it('OC de embarque SIN contexto de fondeo se detiene: no saber no es autorizar', () => {
    const oc = makeOC({ estado: 'en_gestion', origen: 'embarque' });
    const r = puedeTransicionarOC('en_gestion', 'autorizada', 'admin', oc);
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/no se pudo verificar el fondeo/i);
  });
});

// ─── F. transicionesDisponiblesOC ─────────────────────────────────────────────

describe('F. transicionesDisponiblesOC()', () => {
  it('operaciones ve [en_gestion] desde solicitada (sin motivo no ve rechazada)', () => {
    const oc = makeOC();
    const disp = transicionesDisponiblesOC('solicitada', 'operaciones', oc);
    expect(disp).toEqual(['en_gestion']);
  });

  it('operaciones ve [en_gestion, rechazada] si hay motivo', () => {
    const oc = makeOC({ motivoRechazo: 'Incorrecto' });
    const disp = transicionesDisponiblesOC('solicitada', 'operaciones', oc);
    expect(disp).toContain('en_gestion');
    expect(disp).toContain('rechazada');
  });

  it('admin ve [en_gestion] desde solicitada sin motivo', () => {
    const oc = makeOC();
    const disp = transicionesDisponiblesOC('solicitada', 'admin', oc);
    expect(disp).toEqual(['en_gestion']);
  });

  it('admin ve [autorizada] desde en_gestion con fondeo ok, sin motivo', () => {
    const oc = makeOC({ estado: 'en_gestion' });
    const fondeo = makeFondeo();
    const disp = transicionesDisponiblesOC('en_gestion', 'admin', oc, fondeo);
    expect(disp).toContain('autorizada');
    expect(disp).not.toContain('rechazada');
  });

  it('admin ve [pagada] desde autorizada con comprobante, sin motivo', () => {
    const oc = makeOC({ estado: 'autorizada', comprobantePago: 'REF-123' });
    const disp = transicionesDisponiblesOC('autorizada', 'admin', oc);
    expect(disp).toContain('pagada');
    expect(disp).not.toContain('rechazada');
  });

  it('ventas no ve nada desde solicitada (no tiene permisos)', () => {
    const oc = makeOC();
    expect(transicionesDisponiblesOC('solicitada', 'ventas', oc)).toHaveLength(0);
  });

  it('pricing no ve nada desde solicitada (no tiene permisos)', () => {
    const oc = makeOC();
    expect(transicionesDisponiblesOC('solicitada', 'pricing', oc)).toHaveLength(0);
  });

  it('estados terminales no tienen transiciones para ningún rol', () => {
    const oc = makeOC({ estado: 'pagada' });
    expect(transicionesDisponiblesOC('pagada', 'admin', oc)).toHaveLength(0);
    expect(transicionesDisponiblesOC('rechazada', 'admin', oc)).toHaveLength(0);
  });

  it('admin sin fondeo ve [] desde en_gestion cuando fondeo insuficiente', () => {
    const oc = makeOC({ estado: 'en_gestion', origen: 'embarque' });
    const fondeo = makeFondeo({ totalFondeo: 100, totalOCsPendientes: 10000 });
    const disp = transicionesDisponiblesOC('en_gestion', 'admin', oc, fondeo);
    expect(disp).not.toContain('autorizada');
  });
});

// ─── G. Anticipos parciales (helpers de OrdenesCompraData) ────────────────────

describe('G. Anticipos parciales', () => {
  // ── calcularSaldoPendiente ─────────────────────────────────────────────────

  it('saldo pendiente = monto si no hay anticipos cruzados', () => {
    expect(calcularSaldoPendiente(10000, [])).toBe(10000);
  });

  it('saldo pendiente descuenta montoAplicado de cada anticipo', () => {
    const anticipos = [
      { ocId: 'a1', folio: 'OC-2026-0010', montoAplicado: 3000, moneda: 'USD' as const, fechaPago: '2026-08-01' },
      { ocId: 'a2', folio: 'OC-2026-0011', montoAplicado: 2000, moneda: 'USD' as const, fechaPago: '2026-08-05' },
    ];
    expect(calcularSaldoPendiente(10000, anticipos)).toBe(5000);
  });

  it('saldo pendiente puede ser cero si anticipos cubren todo', () => {
    const anticipos = [
      { ocId: 'a1', folio: 'OC-2026-0010', montoAplicado: 10000, moneda: 'USD' as const, fechaPago: '2026-08-01' },
    ];
    expect(calcularSaldoPendiente(10000, anticipos)).toBe(0);
  });

  it('saldo pendiente redondea a 2 decimales', () => {
    const anticipos = [
      { ocId: 'a1', folio: 'OC-2026-0010', montoAplicado: 3333.33, moneda: 'USD' as const, fechaPago: '2026-08-01' },
    ];
    expect(calcularSaldoPendiente(10000, anticipos)).toBe(6666.67);
  });

  // ── calcularMontoDisponible ────────────────────────────────────────────────

  it('disponible = monto del anticipo si no se ha aplicado nada', () => {
    expect(calcularMontoDisponible(5000, [])).toBe(5000);
  });

  it('disponible descuenta lo ya aplicado a otras OCs', () => {
    expect(calcularMontoDisponible(5000, [3000])).toBe(2000);
  });

  it('disponible descuenta múltiples aplicaciones parciales', () => {
    expect(calcularMontoDisponible(5000, [2000, 1500])).toBe(1500);
  });

  it('disponible = 0 si se aplicó todo', () => {
    expect(calcularMontoDisponible(5000, [3000, 2000])).toBe(0);
  });

  it('disponible redondea a 2 decimales', () => {
    expect(calcularMontoDisponible(5000, [1666.67, 1666.67])).toBe(1666.66);
  });

  // ── validarAplicacionAnticipo ──────────────────────────────────────────────

  it('aplicar monto válido retorna null (ok)', () => {
    expect(validarAplicacionAnticipo(5000, 3000)).toBeNull();
  });

  it('aplicar exactamente lo disponible retorna null (ok)', () => {
    expect(validarAplicacionAnticipo(2000, 2000)).toBeNull();
  });

  it('aplicar más de lo disponible retorna error', () => {
    const r = validarAplicacionAnticipo(2000, 3000);
    expect(r).not.toBeNull();
    expect(r).toMatch(/excede/i);
  });

  it('aplicar monto cero retorna error', () => {
    const r = validarAplicacionAnticipo(5000, 0);
    expect(r).not.toBeNull();
    expect(r).toMatch(/mayor a cero/i);
  });

  it('aplicar monto negativo retorna error', () => {
    const r = validarAplicacionAnticipo(5000, -100);
    expect(r).not.toBeNull();
    expect(r).toMatch(/mayor a cero/i);
  });
});

// ─── H · El ÁREA de Administración, no solo el superusuario ──────────────────
//
// La máquina nació con roles: ['admin'] en autorizar y pagar. En esta app
// 'admin' es el superusuario TÉCNICO y 'administracion' es el área que lleva
// los pagos (§4.1). Con la definición original, Julio no podía autorizar nada
// y toda OC se quedaba trabada en «en gestión».

describe('H · administracion autoriza y paga', () => {
  it('autoriza desde en gestión, con el fondeo a la vista', () => {
    const oc = makeOC({ estado: 'en_gestion' });
    expect(puedeTransicionarOC('en_gestion', 'autorizada', 'administracion', oc, makeFondeo()).ok).toBe(true);
  });

  it('paga desde autorizada, con comprobante', () => {
    const oc = makeOC({ estado: 'autorizada', comprobantePago: 'https://.../pago.pdf' });
    expect(puedeTransicionarOC('autorizada', 'pagada', 'administracion', oc).ok).toBe(true);
  });

  it('sin comprobante NO puede pagar: la validación sigue mandando', () => {
    const oc = makeOC({ estado: 'autorizada', comprobantePago: null });
    const r = puedeTransicionarOC('autorizada', 'pagada', 'administracion', oc);
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/comprobante/i);
  });

  it('rechaza desde autorizada con motivo', () => {
    const oc = makeOC({ estado: 'autorizada', motivoRechazo: 'Duplicada' });
    expect(puedeTransicionarOC('autorizada', 'rechazada', 'administracion', oc).ok).toBe(true);
  });

  it('el fondeo insuficiente la sigue frenando', () => {
    const oc = makeOC({ estado: 'en_gestion', origen: 'embarque' });
    const r = puedeTransicionarOC('en_gestion', 'autorizada', 'administracion', oc,
      makeFondeo({ totalFondeo: 1000, totalOCsPendientes: 10000 }));
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/sobregirado/i);
  });

  it('NO gestiona: gestionar es de Operaciones', () => {
    const oc = makeOC({ estado: 'solicitada' });
    expect(puedeTransicionarOC('solicitada', 'en_gestion', 'administracion', oc).ok).toBe(false);
  });

  it('Operaciones NO autoriza: autorizar el pago es de Administración', () => {
    const oc = makeOC({ estado: 'en_gestion' });
    expect(puedeTransicionarOC('en_gestion', 'autorizada', 'operaciones', oc).ok).toBe(false);
  });

  it('Pricing no mueve órdenes de compra: no es su flujo', () => {
    // El plan decía «PRICING solicita». Al aterrizarlo no encajó: Pricing
    // cotiza y compara proveedores, y ni ve embarques ni gestiona pagos.
    // Tampoco tiene ya `ordenCompra.solicitar` (ver permisos.ts).
    expect(puedeTransicionarOC('solicitada', 'en_gestion', 'pricing', makeOC()).ok).toBe(false);
    expect(puedeTransicionarOC('en_gestion', 'autorizada', 'pricing', makeOC({ estado: 'en_gestion' })).ok).toBe(false);
    expect(puedeTransicionarOC('autorizada', 'pagada', 'pricing', makeOC({ estado: 'autorizada', comprobantePago: 'x' })).ok).toBe(false);
  });
});

