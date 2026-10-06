/**
 * De punta a punta: el cobro al cliente libera el pago al proveedor
 * (tarea 68 · punto 2 de la cola · PLAN-PAGOS 1.1).
 *
 * Es la cadena completa de la regla de negocio, con el pago nuevo en medio:
 *
 *   factura al cliente
 *     → `registrarCobro` arma el pago   (construirPagoDeCobro)
 *       → el pago entra al fondeo       (entradasDeFondeo)
 *         → el fondeo se calcula        (calcularFondeo, por moneda)
 *           → la máquina de la OC deja autorizar  (puedeTransicionarOC)
 *             → y el saldo de la factura baja     (saldoDeFactura)
 *
 * Lo que fija: que cambiar DÓNDE se escribe no cambió NADA de la cadena. El
 * caso espejo —el mismo cobro leído de `cobros/` como antes— se corre al
 * lado y tiene que dar lo mismo. Si un día dan distinto, el cobro dejó de
 * liberar el pago, y eso es dinero que se queda sin salir.
 */

import { describe, it, expect } from 'vitest';
import {
  construirPagoDeCobro, construirPagoDeDeposito, entradasDeFondeo,
  pagoDesdeCobro, pagosDeCliente, aplicacionesA,
  type DatosCobro, type DatosDeposito, type Pago,
} from './pagos';
import { calcularFondeo, evaluarFondeo } from './fondeoCliente';
import { puedeTransicionarOC } from './stateMachineOC';
import { saldoDeFactura } from './facturacionEmbarque';
import type { FacturaCliente, CobroCliente } from '../components/facturas/FacturasData';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';

const CTX = {
  id: 'PAG-1', folio: 'PAG-2026-0001',
  por: { uid: 'u-admin', nombre: 'Julio' },
  ahora: '2026-10-05T18:00:00.000Z',
};

const FACTURA: FacturaCliente = {
  id: 'F-E2E', numero: 'A-9001', fechaEmision: '2026-10-01',
  embarqueId: 'E-E2E', embarqueFolio: 'VLIM-26-041',
  clienteId: 'CLI-1', clienteNombre: 'Grupo Fibremex', grupoFacturacion: null, lineas: [],
  moneda: 'MXN', subtotal: 50000, iva: 8000, retencion: 0, total: 58000,
  fechaVencimiento: '2026-10-31', diasCredito: 30, estado: 'emitida',
  registradaPor: { uid: 'u', nombre: 'n' }, activo: true, createdAt: '', updatedAt: '',
} as FacturaCliente;

/** La orden del proveedor que espera el dinero del cliente. */
const ORDEN: OrdenCompra = {
  id: 'oc-e2e', folio: 'OC-2026-0500',
  origen: 'embarque', embarqueId: 'E-E2E', embarqueFolio: 'VLIM-26-041',
  clienteId: 'CLI-1', clienteNombre: 'Grupo Fibremex',
  proveedorId: 'PRV-1', proveedorNombre: 'IDAMEX',
  conceptoId: 'CON-001', conceptoNombre: 'Maniobras destino',
  descripcion: '', monto: 40000, moneda: 'MXN',
  fechaRequerida: '2026-10-20', fechaSugeridaPago: null,
  urgencia: 'normal', estado: 'en_gestion',
  motivoRechazo: null, historialEstados: [],
  solicitadaPor: null, gestionadaPor: null, autorizadaPor: null, pagadaPor: null,
  cuentaBancariaId: null, bancoSalida: null, cuentaSalida: null,
  facturaAsociada: null, comprobantePago: null,
  esAnticipo: false, anticiposCruzados: [], saldoPendiente: null, montoDisponible: null,
  activo: true, createdAt: '', updatedAt: '',
} as OrdenCompra;

const DATOS_COBRO: DatosCobro = {
  facturaId: FACTURA.id, facturaNumero: FACTURA.numero,
  embarqueId: 'E-E2E', embarqueFolio: 'VLIM-26-041',
  clienteId: 'CLI-1', clienteNombre: 'Grupo Fibremex',
  monto: 58000, moneda: 'MXN',
  fechaCobro: '2026-10-05', banco: 'bbva', referencia: 'SPEI-7788',
};

/** El cobro viejo equivalente, para el caso espejo. */
const COBRO_VIEJO: CobroCliente = {
  ...DATOS_COBRO,
  id: 'COB-viejo',
  registradoPor: CTX.por,
  activo: true, createdAt: CTX.ahora, updatedAt: CTX.ahora,
};

/** La cadena entera, desde una lista de pagos. */
function autorizarCon(pagos: Pago[]) {
  const fondeo = calcularFondeo(entradasDeFondeo(pagos, 'E-E2E'), [ORDEN]);
  return {
    fondeo,
    veredicto: evaluarFondeo(ORDEN, fondeo),
    transicion: puedeTransicionarOC('en_gestion', 'autorizada', 'administracion', ORDEN, fondeo),
    saldo: saldoDeFactura(FACTURA, aplicacionesA(FACTURA.id, pagos)),
  };
}

describe('el cobro registrado como pago libera el pago al proveedor', () => {
  it('sin nada cobrado, el embarque está sobregirado y la OC NO se autoriza', () => {
    const r = autorizarCon([]);
    expect(r.fondeo.depositado.MXN).toBe(0);
    expect(r.fondeo.disponible.MXN).toBe(-40000);
    expect(r.veredicto.puedeAutorizar).toBe(false);
    expect(r.transicion.ok).toBe(false);
    expect(r.transicion.razon).toMatch(/sobregirado/);
  });

  it('con el cobro escrito en pagos/, el fondeo lo ve y la OC se autoriza', () => {
    const pago = construirPagoDeCobro(DATOS_COBRO, CTX);
    const r = autorizarCon([pago]);
    expect(r.fondeo.depositado.MXN).toBe(58000);
    expect(r.fondeo.comprometido.MXN).toBe(40000);
    expect(r.fondeo.disponible.MXN).toBe(18000);
    expect(r.veredicto.puedeAutorizar).toBe(true);
    expect(r.transicion.ok).toBe(true);
  });

  it('y la factura queda cobrada: el saldo baja por el mismo monto', () => {
    const pago = construirPagoDeCobro(DATOS_COBRO, CTX);
    const r = autorizarCon([pago]);
    expect(r.saldo.cobrado).toBe(58000);
    expect(r.saldo.saldo).toBe(0);
    expect(r.saldo.estado).toBe('cobrada');
  });

  it('un cobro PARCIAL deja la factura parcial y fondea solo lo que entró', () => {
    const pago = construirPagoDeCobro({ ...DATOS_COBRO, monto: 20000 }, CTX);
    const r = autorizarCon([pago]);
    expect(r.saldo.cobrado).toBe(20000);
    expect(r.saldo.saldo).toBe(38000);
    expect(r.saldo.estado).toBe('cobrada_parcial');
    expect(r.fondeo.depositado.MXN).toBe(20000);
    // 20,000 no alcanzan para una orden de 40,000: sigue sobregirado.
    expect(r.transicion.ok).toBe(false);
  });

  it('da EXACTAMENTE lo mismo que el cobro viejo leído de cobros/', () => {
    const conNuevo = autorizarCon([construirPagoDeCobro(DATOS_COBRO, CTX)]);
    const conViejo = autorizarCon([pagoDesdeCobro(COBRO_VIEJO)]);
    expect(conNuevo.fondeo).toEqual(conViejo.fondeo);
    expect(conNuevo.veredicto).toEqual(conViejo.veredicto);
    expect(conNuevo.transicion).toEqual(conViejo.transicion);
    expect(conNuevo.saldo).toEqual(conViejo.saldo);
  });

  it('un pago anulado deja de liberar: la OC vuelve a quedar sin fondeo', () => {
    const pago = { ...construirPagoDeCobro(DATOS_COBRO, CTX), activo: false };
    const r = autorizarCon([pago]);
    expect(r.fondeo.depositado.MXN).toBe(0);
    expect(r.transicion.ok).toBe(false);
    expect(r.saldo.cobrado).toBe(0);
  });

  it('un cobro en USD no fondea una orden en MXN (§4.3)', () => {
    const pago = construirPagoDeCobro({ ...DATOS_COBRO, moneda: 'USD', monto: 3000 }, CTX);
    const r = autorizarCon([pago]);
    expect(r.fondeo.depositado.USD).toBe(3000);
    expect(r.fondeo.depositado.MXN).toBe(0);
    expect(r.transicion.ok).toBe(false);
  });
});

describe('el depósito registrado como pago fondea igual que antes', () => {
  const DATOS_DEPOSITO: DatosDeposito = {
    embarqueId: 'E-E2E', embarqueFolio: 'VLIM-26-041',
    clienteId: 'CLI-1', clienteNombre: 'Grupo Fibremex',
    monto: 45000, moneda: 'MXN', fechaDeposito: '2026-10-04',
    referencia: '', comprobante: null,
  };

  it('un depósito sin factura todavía libera la orden', () => {
    const pago = construirPagoDeDeposito(DATOS_DEPOSITO, CTX);
    const r = autorizarCon([pago]);
    expect(r.fondeo.depositado.MXN).toBe(45000);
    expect(r.transicion.ok).toBe(true);
    // Y no cobra ninguna factura: el saldo sigue completo.
    expect(r.saldo.cobrado).toBe(0);
  });

  it('una orden de IMPUESTOS exige que el depósito cubra su monto (§4.7)', () => {
    const impuestos = { ...ORDEN, esPagoImpuestos: true } as OrdenCompra;
    const corto = construirPagoDeDeposito({ ...DATOS_DEPOSITO, monto: 30000 }, CTX);
    const fondeoCorto = calcularFondeo(entradasDeFondeo([corto], 'E-E2E'), [impuestos]);
    expect(evaluarFondeo(impuestos, fondeoCorto).esperandoDepositoImpuestos).toBe(true);

    const completo = construirPagoDeDeposito(DATOS_DEPOSITO, CTX);
    const fondeoOk = calcularFondeo(entradasDeFondeo([completo], 'E-E2E'), [impuestos]);
    expect(evaluarFondeo(impuestos, fondeoOk).puedeAutorizar).toBe(true);
  });

  it('lo nuevo y lo viejo conviven en la misma lista y suman una sola vez', () => {
    const lista = pagosDeCliente(
      [construirPagoDeDeposito(DATOS_DEPOSITO, CTX)],   // pagos/
      [COBRO_VIEJO],                                    // cobros/ (legado)
      [],
    );
    const r = autorizarCon(lista);
    expect(r.fondeo.depositado.MXN).toBe(45000 + 58000);
    expect(r.saldo.cobrado).toBe(58000);
    expect(r.transicion.ok).toBe(true);
  });
});
