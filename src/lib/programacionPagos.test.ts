/**
 * Tests de programacionPagos.ts (1.5).
 *
 * El panel reemplaza el Excel de Julio, así que lo que se fija aquí es que
 * el total del día sea EXACTAMENTE lo que hay que transferir: ni dinero que
 * nadie autorizó, ni el que alguien detuvo, ni el que ya se adelantó.
 */

import { describe, it, expect } from 'vitest';
import {
  ordenesProgramadas, transferenciasDelDia, resumenDelDia, textoComprobante,
} from './programacionPagos';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';

const HOY = '2026-09-15';

const oc = (over: Partial<OrdenCompra> = {}): OrdenCompra => ({
  id: over.id ?? 'oc-1', folio: over.folio ?? 'OC-2026-0001',
  origen: 'embarque', embarqueId: 'EMB-1', embarqueFolio: 'VLIM-0001',
  clienteId: 'CLI-1', clienteNombre: 'Cliente',
  proveedorId: 'PRV-1', proveedorNombre: 'Hapag-Lloyd',
  conceptoId: 'CON-001', conceptoNombre: 'Ocean Freight',
  descripcion: '', monto: 10000, moneda: 'MXN',
  fechaRequerida: '2026-09-01', fechaSugeridaPago: HOY,
  urgencia: 'normal', estado: 'autorizada',
  motivoRechazo: null, historialEstados: [],
  solicitadaPor: null, gestionadaPor: null, autorizadaPor: null, pagadaPor: null,
  cuentaBancariaId: 'cta-1', bancoSalida: 'santander', cuentaSalida: null,
  facturaAsociada: 'F-100', comprobantePago: null,
  esAnticipo: false, anticiposCruzados: [], saldoPendiente: null, montoDisponible: null,
  activo: true, createdAt: '', updatedAt: '',
  ...over,
});

// ─── A · Qué entra al panel ──────────────────────────────────────────────────

describe('ordenesProgramadas', () => {
  it('solo entran las AUTORIZADAS: lo no aprobado no es cuenta por pagar', () => {
    const r = ordenesProgramadas([
      oc({ id: 'a', estado: 'autorizada' }),
      oc({ id: 'b', estado: 'en_gestion' }),
      oc({ id: 'c', estado: 'solicitada' }),
      oc({ id: 'd', estado: 'pagada' }),
    ], HOY);
    expect(r.map(x => x.oc.id)).toEqual(['a']);
  });

  it('clasifica vencido, hoy y próximo', () => {
    const r = ordenesProgramadas([
      oc({ id: 'v', fechaSugeridaPago: '2026-09-10' }),
      oc({ id: 'h', fechaSugeridaPago: HOY }),
      oc({ id: 'p', fechaSugeridaPago: '2026-09-20' }),
    ], HOY);
    const por = Object.fromEntries(r.map(x => [x.oc.id, x.vencimiento]));
    expect(por).toEqual({ v: 'vencido', h: 'hoy', p: 'proximo' });
  });

  it('cuenta los días de atraso', () => {
    const [p] = ordenesProgramadas([oc({ fechaSugeridaPago: '2026-09-10' })], HOY);
    expect(p.dias).toBe(5);
  });

  it('lo vencido va primero y lo sin fecha al final', () => {
    const r = ordenesProgramadas([
      oc({ id: 'sf', fechaSugeridaPago: null }),
      oc({ id: 'pr', fechaSugeridaPago: '2026-09-30' }),
      oc({ id: 've', fechaSugeridaPago: '2026-09-01' }),
    ], HOY);
    expect(r.map(x => x.oc.id)).toEqual(['ve', 'pr', 'sf']);
  });

  it('avisa de lo que hay que revisar antes de pagar', () => {
    const [p] = ordenesProgramadas([oc({
      noPagar: true, cuentaBancariaId: null, facturaAsociada: null,
      conceptoId: 'CON-010', urgencia: 'urgente',
    })], HOY);
    expect(p.avisos).toContain('Marcada «No pagar»');
    expect(p.avisos).toContain('Falta la cuenta del proveedor');
    expect(p.avisos).toContain('Sin factura');
    expect(p.avisos).toContain('Impuestos');
    expect(p.avisos).toContain('Urgente');
  });

  it('lo que se transfiere descuenta los anticipos', () => {
    const [p] = ordenesProgramadas([oc({ monto: 20000, anticiposCruzados: [
      { ocId: 'a', folio: 'OC-50', montoAplicado: 12000, moneda: 'MXN', fechaPago: '' },
    ] })], HOY);
    expect(p.aTransferir).toBe(8000);
  });
});

// ─── B · Las transferencias del día ──────────────────────────────────────────

describe('transferenciasDelDia', () => {
  it('agrupa por proveedor y suma lo que se transfiere', () => {
    const p = ordenesProgramadas([
      oc({ id: 'a', folio: 'OC-1', monto: 5000 }),
      oc({ id: 'b', folio: 'OC-2', monto: 3000 }),
    ], HOY);
    const g = transferenciasDelDia(p, HOY);
    expect(g).toHaveLength(1);
    expect(g[0].total).toBe(8000);
    expect(g[0].folios).toEqual(['OC-1', 'OC-2']);
  });

  it('las marcadas «No pagar» quedan FUERA del total', () => {
    const p = ordenesProgramadas([
      oc({ id: 'a', monto: 5000 }),
      oc({ id: 'b', monto: 3000, noPagar: true }),
    ], HOY);
    const g = transferenciasDelDia(p, HOY);
    expect(g[0].total).toBe(5000);
  });

  it('lo vencido también se paga hoy: entra al grupo', () => {
    const p = ordenesProgramadas([oc({ fechaSugeridaPago: '2026-09-01', monto: 1000 })], HOY);
    expect(transferenciasDelDia(p, HOY)).toHaveLength(1);
  });

  it('lo que vence después no entra todavía', () => {
    const p = ordenesProgramadas([oc({ fechaSugeridaPago: '2026-09-30' })], HOY);
    expect(transferenciasDelDia(p, HOY)).toEqual([]);
  });

  it('lo SIN fecha no se cuela a una transferencia', () => {
    const p = ordenesProgramadas([oc({ fechaSugeridaPago: null })], HOY);
    expect(transferenciasDelDia(p, HOY)).toEqual([]);
  });

  it('el grupo transfiere el neto de anticipos, no el monto de la orden', () => {
    const p = ordenesProgramadas([oc({ monto: 20000, anticiposCruzados: [
      { ocId: 'a', folio: 'OC-50', montoAplicado: 15000, moneda: 'MXN', fechaPago: '' },
    ] })], HOY);
    expect(transferenciasDelDia(p, HOY)[0].total).toBe(5000);
  });
});

// ─── C · Resumen y comprobante ───────────────────────────────────────────────

describe('resumen y comprobante', () => {
  it('el resumen cuenta cada grupo', () => {
    const p = ordenesProgramadas([
      oc({ id: 'a', fechaSugeridaPago: '2026-09-01' }),
      oc({ id: 'b', fechaSugeridaPago: HOY }),
      oc({ id: 'c', fechaSugeridaPago: '2026-09-30' }),
      oc({ id: 'd', fechaSugeridaPago: null }),
      oc({ id: 'e', noPagar: true }),
    ], HOY);
    const r = resumenDelDia(p);
    expect(r).toMatchObject({ vencidas: 1, hoy: 2, proximas: 1, sinFecha: 1, bloqueadas: 1 });
  });

  it('el comprobante detalla los folios: sin eso el proveedor llama a preguntar', () => {
    const p = ordenesProgramadas([
      oc({ id: 'a', folio: 'OC-1', monto: 5000, conceptoNombre: 'Ocean Freight', facturaAsociada: 'F-100' }),
      oc({ id: 'b', folio: 'OC-2', monto: 3000, conceptoNombre: 'Demurrages', facturaAsociada: null }),
    ], HOY);
    const texto = textoComprobante(transferenciasDelDia(p, HOY)[0]);
    expect(texto).toContain('Hapag-Lloyd');
    expect(texto).toContain('OC-1');
    expect(texto).toContain('factura F-100');
    expect(texto).toContain('OC-2');
    expect(texto).toContain('8,000.00');
  });
});
