/**
 * useFacturas.ts (2.1 / 2.2 / 2.3)
 *
 * Facturas al cliente y los cobros que las liquidan.
 *
 * ⚠️ Vermur no tiene PAC: aquí se REGISTRA lo que ya se emitió por fuera.
 * Nada de esto timbra ni pretende hacerlo.
 */

import { useCallback, useMemo } from 'react';
import { db } from '../firebase';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { conAviso } from '../lib/erroresEscritura';
import { idUnico } from '../lib/idUnico';
import type { FacturaCliente, CobroCliente } from '../components/facturas/FacturasData';
import { saldoDeFactura } from '../lib/facturacionEmbarque';
import {
  aplicacionesA, coleccionDelPago, construirPagoAplicado, construirPagoDeCobro,
  pagosDeCliente, type DatosCobro, type DatosPagoAplicado, type Pago,
} from '../lib/pagos';
import {
  pagoConAplicaciones, pagoSinAplicacion, problemaMotivo,
  textoAnulacion, textoAplicacionNueva, textoAplicacionQuitada,
} from '../lib/reversaPagos';
import type { AplicacionPago } from '../lib/pagos';
import { usePagos } from './usePagos';
import { useTienda, tiendaFacturas, tiendaCobros } from './tiendasFinanzas';
import { anotarBitacora } from './anotarBitacora';

const COL_FACTURAS = 'facturas';
const COL_COBROS = 'cobros';

export function useFacturas(embarqueId?: string) {
  const { user } = useAuth();
  // Tarea 68 · `pagos/` es donde se escribe desde P2; `cobros/` solo se lee.
  const { pagos: pagosNuevos, contextoNuevo, guardarPago, anularPago, actualizarAplicaciones } = usePagos(embarqueId);

  /*
   * Tarea 89 · una suscripción compartida por colección. `cobros/` es de SOLO
   * LECTURA desde P2 (tarea 68) y es secundaria: su fallo no tumba la lista.
   */
  const { datos: facturas, loading } = useTienda(tiendaFacturas, !!user, embarqueId);
  const { datos: cobros } = useTienda(tiendaCobros, !!user, embarqueId);

  /**
   * Registra una factura ya emitida. Es de Administración y de Operaciones:
   * la matriz §4.1 les da «Generar factura» a las dos.
   */
  const registrarFactura = async (
    datos: Omit<FacturaCliente, 'id' | 'registradaPor' | 'activo' | 'createdAt' | 'updatedAt'>,
  ): Promise<FacturaCliente> => {
    exigir(user?.rol as UserRole | undefined, 'factura.generar');

    const ahora = new Date().toISOString();
    const factura: FacturaCliente = {
      ...datos,
      id: idUnico('FAC'),
      registradaPor: { uid: user?.uid ?? '', nombre: user?.nombre ?? user?.email ?? '' },
      activo: true,
      createdAt: ahora,
      updatedAt: ahora,
    };

    await conAviso('la factura', () =>
      setDoc(doc(db, COL_FACTURAS, factura.id), sanitizarParaFirestore(factura)));

    await anotarBitacora(factura.embarqueId, 'factura',
      `${factura.registradaPor.nombre} registró la factura ${factura.numero} a ${factura.clienteNombre}`,
      factura.registradaPor,
      `${factura.moneda} ${factura.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })} · vence ${factura.fechaVencimiento}`);

    return factura;
  };

  /**
   * Cancela una factura. No se borra: una factura emitida existió, y borrarla
   * dejaría las líneas del embarque marcadas contra un documento fantasma.
   * Quien la cancele debe liberar las líneas (lo hace la ficha).
   */
  const cancelarFactura = async (id: string, motivo: string): Promise<void> => {
    exigir(user?.rol as UserRole | undefined, 'factura.generar');
    await conAviso('la factura', () =>
      updateDoc(doc(db, COL_FACTURAS, id), sanitizarParaFirestore({
        estado: 'cancelada', motivoCancelacion: motivo, updatedAt: new Date().toISOString(),
      }) as Record<string, unknown>));
  };

  /**
   * Tarea 67 · La lista unificada de pagos del lado cliente.
   *
   * `cobros` es la lectura cruda de lo viejo; `pagosNuevos`, la de `pagos/`.
   * `pagos` es la lente con la que se lee todo: un cobro es un pago con una
   * sola aplicación. No son dos verdades —una se deriva de la otra— y es lo
   * que consumen las pantallas, para que cambiar la escritura no obligue a
   * recorrer diez call sites otra vez.
   *
   * Los depósitos del cliente NO están aquí: los lee `useDepositosCliente` y
   * los suma quien necesite el fondeo (Finance), con `pagosDeCliente`.
   */
  const pagos = useMemo<Pago[]>(
    () => pagosDeCliente(pagosNuevos, cobros, []),
    [pagosNuevos, cobros],
  );

  /**
   * Registra un cobro. Puede ser parcial.
   *
   * ── Qué cambió en P2 ────────────────────────────────────────────────────
   * Escribe UN documento en `pagos/` —un pago con una sola aplicación a la
   * factura— en vez de un `CobroCliente` en `cobros/`. **La firma no cambia**:
   * lo que entra es lo mismo que entraba, y `construirPagoDeCobro` lo
   * convierte. `cobros/` queda de solo lectura y no se migra.
   *
   * ── La conexión con el pago a proveedores (1.1) ──────────────────────────
   * Cobrar al cliente es lo que libera el pago al proveedor: este dinero
   * entra al fondeo del embarque. Por eso el pago hereda `embarqueIds` — sin
   * ellos, el dinero entraría a la contabilidad pero no desbloquearía nada.
   *
   * ── Tarea 69 · Quién cobra ───────────────────────────────────────────────
   * `cobro.registrar`, no `factura.generar`: emitir la factura es de las dos
   * áreas (§4.1) y recibir el dinero es solo de Administración. Es lo único
   * que P3 QUITA de lo que hoy funciona, y es lo que dice la minuta §5.
   */
  const registrarCobro = async (datos: DatosCobro): Promise<Pago> => {
    exigir(user?.rol as UserRole | undefined, 'cobro.registrar');

    const ctx = await contextoNuevo();
    const pago = construirPagoDeCobro(datos, ctx);
    await guardarPago(pago);

    if (datos.embarqueId) {
      await anotarBitacora(datos.embarqueId, 'cobro',
        `${pago.registradoPor.nombre} registró un cobro de ${pago.terceroNombre} contra ${datos.facturaNumero}`,
        pago.registradoPor,
        `${pago.moneda} ${pago.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} · ${pago.banco ?? 'sin cuenta'} · ${pago.referencia ?? 'sin referencia'} · ${pago.folio}`);
    }

    /*
     * El estado de la factura se guarda además de derivarse, porque los
     * paneles filtran por él y filtrar en Firestore exige el campo. La
     * fuente de verdad sigue siendo saldoDeFactura sobre las aplicaciones
     * vivas: si los dos discrepan, gana el cálculo.
     */
    const factura = facturas.find(f => f.id === datos.facturaId);
    if (factura) {
      const aplicaciones = [...aplicacionesA(factura.id, pagos), ...pago.aplicaciones];
      const { estado } = saldoDeFactura(factura, aplicaciones);
      if (estado !== factura.estado) {
        await conAviso('el estado de la factura', () =>
          updateDoc(doc(db, COL_FACTURAS, factura.id), sanitizarParaFirestore({
            estado, updatedAt: ctx.ahora,
          }) as Record<string, unknown>));
      }
    }

    return pago;
  };

  /**
   * Tarea 70 · P4 · Un pago repartido entre VARIAS facturas (§7.1).
   *
   * Es el mismo documento que `registrarCobro` escribe —`construirPagoAplicado`
   * es la forma general y el cobro es su caso de una aplicación— así que no
   * hay dos caminos de escritura que puedan divergir. Lo que esta función
   * agrega es lo que pasa DESPUÉS de guardar, y que un cobro contra una sola
   * factura ya hacía: la bitácora del embarque y el estado de la factura, en
   * plural.
   *
   * **El pago se escribe primero y una sola vez.** Si la bitácora o un estado
   * fallaran después, el dinero ya quedó registrado y los saldos se siguen
   * derivando de las aplicaciones: el estado guardado es un índice para
   * filtrar, no la verdad (§1.4). Al revés —derivar antes de guardar— sí
   * dejaría facturas marcadas como cobradas por un pago que no existe.
   */
  const registrarPagoAplicado = async (datos: DatosPagoAplicado): Promise<Pago> => {
    exigir(user?.rol as UserRole | undefined, 'cobro.registrar');

    const ctx = await contextoNuevo();
    const pago = construirPagoAplicado(datos, ctx);
    await guardarPago(pago);

    /*
     * Una entrada por embarque, diciendo qué facturas de ESE embarque cubrió.
     * Un pago que cruza dos embarques deja una entrada en cada bitácora con
     * lo que le toca: anotar el total en los dos haría parecer que entró el
     * doble (§4.3 en su versión de bitácora).
     */
    for (const embarqueId of pago.embarqueIds) {
      const suyas = pago.aplicaciones.filter(a =>
        facturas.some(f => f.id === a.destinoId && f.embarqueId === embarqueId));
      if (suyas.length === 0) continue;
      const total = Math.round(suyas.reduce((acc, a) => acc + a.monto, 0) * 100) / 100;
      await anotarBitacora(embarqueId, 'cobro',
        `${pago.registradoPor.nombre} registró un cobro de ${pago.terceroNombre} contra `
        + `${suyas.map(a => a.destinoNumero).join(', ')}`,
        pago.registradoPor,
        `${pago.moneda} ${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })} · `
        + `${pago.banco ?? 'sin cuenta'} · ${pago.referencia ?? 'sin referencia'} · ${pago.folio}`
        + (pago.aplicaciones.length > suyas.length ? ` · el pago cubrió ${pago.aplicaciones.length} facturas en total` : ''));
    }

    /*
     * El estado de cada factura tocada, por el motivo de siempre: los paneles
     * filtran por él y filtrar en Firestore exige el campo. La fuente de
     * verdad sigue siendo `saldoDeFactura` sobre las aplicaciones vivas — si
     * los dos discrepan, gana el cálculo.
     */
    for (const a of pago.aplicaciones) {
      const factura = facturas.find(f => f.id === a.destinoId);
      if (!factura) continue;
      const aplicaciones = [...aplicacionesA(factura.id, pagos), a];
      const { estado } = saldoDeFactura(factura, aplicaciones);
      if (estado === factura.estado) continue;
      await conAviso('el estado de la factura', () =>
        updateDoc(doc(db, COL_FACTURAS, factura.id), sanitizarParaFirestore({
          estado, updatedAt: ctx.ahora,
        }) as Record<string, unknown>));
    }

    return pago;
  };

  /**
   * El estado guardado de cada factura tocada, recalculado sobre la lista de
   * pagos COMO QUEDÓ (no sobre el snapshot, que todavía no se refresca).
   *
   * Es un índice para filtrar, no la verdad (§1.4): si falla, los saldos se
   * siguen derivando de las aplicaciones vivas.
   */
  const sincronizarEstados = async (destinoIds: readonly string[], pagosDespues: readonly Pago[]) => {
    const ahora = new Date().toISOString();
    for (const id of new Set(destinoIds)) {
      const factura = facturas.find(f => f.id === id);
      if (!factura) continue;
      const { estado } = saldoDeFactura(factura, aplicacionesA(factura.id, pagosDespues));
      if (estado === factura.estado) continue;
      await conAviso('el estado de la factura', () =>
        updateDoc(doc(db, COL_FACTURAS, factura.id), sanitizarParaFirestore({
          estado, updatedAt: ahora,
        }) as Record<string, unknown>));
    }
  };

  /** Una entrada por embarque que el pago tocó: quién, cuándo y por qué. */
  const anotarEnEmbarques = async (
    embarqueIds: readonly string[], titulo: string, detalle: string,
  ) => {
    const autor = { uid: user?.uid ?? '', nombre: user?.nombre ?? user?.email ?? '' };
    for (const e of new Set(embarqueIds)) await anotarBitacora(e, 'cobro', titulo, autor, detalle);
  };

  const quienSoy = () => user?.nombre ?? user?.email ?? '';

  /**
   * Anula un cobro mal capturado. El saldo se recalcula solo.
   *
   * Tarea 72 · P5 · **El motivo es obligatorio** y queda con quién y cuándo
   * en la bitácora de cada embarque que el pago tocó. El pago no se borra: su
   * folio sigue en la lista, filtrable como «Anulado».
   *
   * El id puede ser de `pagos/` (lo registrado desde P2) o de un cobro viejo
   * de `cobros/`: lo decide `coleccionDelPago` por el `origen` que puso el
   * adaptador. Si el id no está en la lista **no se escribe nada**: escribir
   * en la colección equivocada crearía un documento nuevo con `activo: false`
   * y el movimiento seguiría vivo en la otra.
   */
  const anularCobro = async (id: string, motivo: string): Promise<void> => {
    exigir(user?.rol as UserRole | undefined, 'cobro.registrar');
    const problema = problemaMotivo(motivo);
    if (problema) throw new Error(problema);

    const pago = pagos.find(p => p.id === id);
    const donde = coleccionDelPago(id, pagos);
    if (donde === 'pagos') {
      await anularPago(id, { motivo: motivo.trim(), por: quienSoy(), en: new Date().toISOString() });
    } else if (donde === 'cobros') {
      await conAviso('el cobro', () =>
        updateDoc(doc(db, COL_COBROS, id), sanitizarParaFirestore({
          activo: false, updatedAt: new Date().toISOString(),
        }) as Record<string, unknown>));
    } else {
      throw new Error(`No se encontró el cobro ${id} para anularlo.`);
    }

    if (pago) {
      const t = textoAnulacion(pago, quienSoy(), motivo);
      await anotarEnEmbarques(pago.embarqueIds, t.titulo, t.detalle);
      await sincronizarEstados(
        pago.destinoIds ?? [],
        pagos.map(p => p.id === id ? { ...p, activo: false } : p),
      );
    }
  };

  /**
   * Tarea 72 · P5 · Quita UNA aplicación de un pago: el dinero vuelve a estar
   * «sin aplicar» y la factura recupera su saldo. Pide motivo.
   *
   * Solo un pago de `pagos/`: lo viejo es de solo lectura (`motivoNoEditable`).
   */
  const quitarAplicacion = async (pagoId: string, destinoId: string, motivo: string): Promise<void> => {
    exigir(user?.rol as UserRole | undefined, 'cobro.registrar');
    const problema = problemaMotivo(motivo);
    if (problema) throw new Error(problema);

    const pago = pagos.find(p => p.id === pagoId);
    if (!pago) throw new Error(`No se encontró el pago ${pagoId}.`);
    const embarqueDe = (fid: string) => facturas.find(f => f.id === fid)?.embarqueId;
    const patch = pagoSinAplicacion(pago, destinoId, embarqueDe);

    const { quitadas, ...cambios } = patch;
    const rastro = { motivo: motivo.trim(), por: quienSoy(), en: new Date().toISOString() };
    await actualizarAplicaciones(pagoId, cambios, quitadas.map(q => ({ ...q, ...rastro })));

    for (const q of patch.quitadas) {
      const t = textoAplicacionQuitada(pago, q, quienSoy(), motivo);
      await anotarEnEmbarques(pago.embarqueIds, t.titulo, t.detalle);
    }
    await sincronizarEstados([destinoId], pagos.map(p => p.id === pagoId ? { ...p, ...patch } : p));
  };

  /**
   * Tarea 72 · P5 · Aplica el saldo a favor de un pago a otras facturas del
   * mismo cliente y moneda. Es el MISMO reparto que «Aplicar pago» —las
   * aplicaciones las arma `aplicacionesDelReparto`— sobre un pago que ya
   * existe, así que no se crea otro ni se copia lógica.
   */
  const aplicarSaldoAFavor = async (
    pagoId: string, nuevas: AplicacionPago[], embarqueIdsNuevos: string[],
  ): Promise<Pago> => {
    exigir(user?.rol as UserRole | undefined, 'cobro.registrar');

    const pago = pagos.find(p => p.id === pagoId);
    if (!pago) throw new Error(`No se encontró el pago ${pagoId}.`);
    const patch = pagoConAplicaciones(pago, nuevas, embarqueIdsNuevos);

    await actualizarAplicaciones(pagoId, patch);

    const despues: Pago = { ...pago, ...patch };
    const t = textoAplicacionNueva(pago, nuevas, quienSoy());
    await anotarEnEmbarques(despues.embarqueIds, t.titulo, t.detalle);
    await sincronizarEstados(nuevas.map(a => a.destinoId), pagos.map(p => p.id === pagoId ? despues : p));
    return despues;
  };

  /** Los cobros de una factura, para calcular su saldo. */
  const cobrosDe = useCallback(
    (facturaId: string) => cobros.filter(c => c.facturaId === facturaId && c.activo !== false),
    [cobros],
  );

  return {
    facturas, cobros, pagosNuevos, pagos, loading,
    registrarFactura, cancelarFactura, registrarCobro, registrarPagoAplicado,
    anularCobro, quitarAplicacion, aplicarSaldoAFavor, cobrosDe,
  };
}
