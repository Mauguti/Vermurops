/**
 * useFacturas.ts (2.1 / 2.2 / 2.3)
 *
 * Facturas al cliente y los cobros que las liquidan.
 *
 * ⚠️ Vermur no tiene PAC: aquí se REGISTRA lo que ya se emitió por fuera.
 * Nada de esto timbra ni pretende hacerlo.
 */

import { useState, useEffect, useCallback } from 'react';
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
import { anotarBitacora } from './anotarBitacora';

const COL_FACTURAS = 'facturas';
const COL_COBROS = 'cobros';

export function useFacturas(embarqueId?: string) {
  const { user } = useAuth();
  const [facturas, setFacturas] = useState<FacturaCliente[]>([]);
  const [cobros, setCobros] = useState<CobroCliente[]>([]);
  const [loading, setLoading] = useState(true);

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
   * Registra un cobro. Puede ser parcial.
   *
   * ── La conexión con el pago a proveedores (1.1) ──────────────────────────
   * Cobrar al cliente es lo que libera el pago al proveedor: este cobro entra
   * al fondeo del embarque. Por eso el cobro guarda `embarqueId` — sin él, el
   * dinero entraría a la contabilidad pero no desbloquearía nada.
   */
  const registrarCobro = async (
    datos: Omit<CobroCliente, 'id' | 'registradoPor' | 'activo' | 'createdAt' | 'updatedAt'>,
  ): Promise<CobroCliente> => {
    exigir(user?.rol as UserRole | undefined, 'factura.generar');

    const ahora = new Date().toISOString();
    const cobro: CobroCliente = {
      ...datos,
      id: idUnico('COB'),
      registradoPor: { uid: user?.uid ?? '', nombre: user?.nombre ?? user?.email ?? '' },
      activo: true,
      createdAt: ahora,
      updatedAt: ahora,
    };

    await conAviso('el cobro', () =>
      setDoc(doc(db, COL_COBROS, cobro.id), sanitizarParaFirestore(cobro)));

    await anotarBitacora(cobro.embarqueId, 'cobro',
      `${cobro.registradoPor.nombre} registró un cobro de ${cobro.clienteNombre} contra ${cobro.facturaNumero}`,
      cobro.registradoPor,
      `${cobro.moneda} ${cobro.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} · ${cobro.banco} · ${cobro.referencia}`);

    /*
     * El estado de la factura se guarda además de derivarse, porque los
     * paneles filtran por él y filtrar en Firestore exige el campo. La
     * fuente de verdad sigue siendo saldoDeFactura sobre los cobros vivos:
     * si los dos discrepan, gana el cálculo.
     */
    const factura = facturas.find(f => f.id === datos.facturaId);
    if (factura) {
      const cobrosDeLaFactura = [...cobros.filter(c => c.facturaId === factura.id), cobro];
      const { estado } = saldoDeFactura(factura, cobrosDeLaFactura);
      if (estado !== factura.estado) {
        await conAviso('el estado de la factura', () =>
          updateDoc(doc(db, COL_FACTURAS, factura.id), sanitizarParaFirestore({
            estado, updatedAt: ahora,
          }) as Record<string, unknown>));
      }
    }

    return cobro;
  };

  /** Anula un cobro mal capturado. El saldo se recalcula solo. */
  const anularCobro = async (id: string): Promise<void> => {
    exigir(user?.rol as UserRole | undefined, 'factura.generar');
    await conAviso('el cobro', () =>
      updateDoc(doc(db, COL_COBROS, id), sanitizarParaFirestore({
        activo: false, updatedAt: new Date().toISOString(),
      }) as Record<string, unknown>));
  };

  /** Los cobros de una factura, para calcular su saldo. */
  const cobrosDe = useCallback(
    (facturaId: string) => cobros.filter(c => c.facturaId === facturaId && c.activo !== false),
    [cobros],
  );

  return {
    facturas, cobros, loading,
    registrarFactura, cancelarFactura, registrarCobro, anularCobro, cobrosDe,
  };
}
