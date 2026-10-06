/**
 * useFacturas.ts (2.1 / 2.2 / 2.3)
 *
 * Facturas al cliente y los cobros que las liquidan.
 *
 * ⚠️ Vermur no tiene PAC: aquí se REGISTRA lo que ya se emitió por fuera.
 * Nada de esto timbra ni pretende hacerlo.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import { collection, doc, onSnapshot, setDoc, updateDoc, query, orderBy } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { conAviso } from '../lib/erroresEscritura';
import { idUnico } from '../lib/idUnico';
import type { FacturaCliente, CobroCliente } from '../components/facturas/FacturasData';
import { saldoDeFactura } from '../lib/facturacionEmbarque';
import {
  aplicacionesA, coleccionDelPago, construirPagoDeCobro, pagosDeCliente,
  type DatosCobro, type Pago,
} from '../lib/pagos';
import { usePagos } from './usePagos';
import { anotarBitacora } from './anotarBitacora';

const COL_FACTURAS = 'facturas';
const COL_COBROS = 'cobros';

export function useFacturas(embarqueId?: string) {
  const { user } = useAuth();
  const [facturas, setFacturas] = useState<FacturaCliente[]>([]);
  const [cobros, setCobros] = useState<CobroCliente[]>([]);
  const [loading, setLoading] = useState(true);
  // Tarea 68 · `pagos/` es donde se escribe desde P2; `cobros/` solo se lee.
  const { pagos: pagosNuevos, contextoNuevo, guardarPago, anularPago } = usePagos(embarqueId);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const unsubF = onSnapshot(
      query(collection(db, COL_FACTURAS), orderBy('fechaEmision', 'desc')),
      snap => {
        const data: FacturaCliente[] = [];
        snap.forEach(d => data.push({ id: d.id, ...d.data() } as FacturaCliente));
        setFacturas(embarqueId ? data.filter(f => f.embarqueId === embarqueId) : data);
        setLoading(false);
      },
      () => setLoading(false),
    );

    /*
     * Tarea 68 · `cobros/` es de SOLO LECTURA desde P2. Nada nuevo se
     * escribe aquí; lo que ya está se sigue leyendo y no se migra.
     */
    const unsubC = onSnapshot(
      query(collection(db, COL_COBROS), orderBy('fechaCobro', 'desc')),
      snap => {
        const data: CobroCliente[] = [];
        snap.forEach(d => data.push({ id: d.id, ...d.data() } as CobroCliente));
        setCobros(embarqueId ? data.filter(c => c.embarqueId === embarqueId) : data);
      },
      () => { /* los cobros son secundarios: su fallo no debe tumbar la lista */ },
    );

    return () => { unsubF(); unsubC(); };
  }, [user, embarqueId]);

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
   * Anula un cobro mal capturado. El saldo se recalcula solo.
   *
   * El id puede ser de `pagos/` (lo registrado desde P2) o de un cobro viejo
   * de `cobros/`: lo decide `coleccionDelPago` por el `origen` que puso el
   * adaptador. Si el id no está en la lista **no se escribe nada**: escribir
   * en la colección equivocada crearía un documento nuevo con `activo: false`
   * y el movimiento seguiría vivo en la otra.
   */
  const anularCobro = async (id: string): Promise<void> => {
    exigir(user?.rol as UserRole | undefined, 'cobro.registrar');

    const donde = coleccionDelPago(id, pagos);
    if (donde === 'pagos') { await anularPago(id); return; }
    if (donde === 'cobros') {
      await conAviso('el cobro', () =>
        updateDoc(doc(db, COL_COBROS, id), sanitizarParaFirestore({
          activo: false, updatedAt: new Date().toISOString(),
        }) as Record<string, unknown>));
      return;
    }
    throw new Error(`No se encontró el cobro ${id} para anularlo.`);
  };

  /** Los cobros de una factura, para calcular su saldo. */
  const cobrosDe = useCallback(
    (facturaId: string) => cobros.filter(c => c.facturaId === facturaId && c.activo !== false),
    [cobros],
  );

  return {
    facturas, cobros, pagosNuevos, pagos, loading,
    registrarFactura, cancelarFactura, registrarCobro, anularCobro, cobrosDe,
  };
}
