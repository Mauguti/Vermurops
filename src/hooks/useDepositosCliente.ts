/**
 * useDepositosCliente.ts (1.1)
 *
 * Los depósitos con los que el cliente fondea las órdenes de compra de su
 * embarque. «Tenemos que esperar el dinero del cliente para pagarle al
 * proveedor»: sin este registro, esa espera no se puede verificar y la regla
 * de que los impuestos no se financian queda en un acuerdo verbal.
 *
 * Mismo patrón que useOrdenesCompra: listener sobre la colección, escrituras
 * con sanitizarParaFirestore y aviso al usuario si fallan.
 */

import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, doc, onSnapshot, setDoc, updateDoc, query, orderBy } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { conAviso } from '../lib/erroresEscritura';
import { idUnico } from '../lib/idUnico';
import type { DepositoCliente } from '../components/ordenesCompra/OrdenesCompraData';

const COL = 'depositosCliente';

export function useDepositosCliente(embarqueId?: string) {
  const { user } = useAuth();
  const [depositos, setDepositos] = useState<DepositoCliente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const unsub = onSnapshot(
      query(collection(db, COL), orderBy('fechaDeposito', 'desc')),
      snap => {
        const data: DepositoCliente[] = [];
        snap.forEach(d => data.push({ id: d.id, ...d.data() } as DepositoCliente));
        setDepositos(embarqueId ? data.filter(x => x.embarqueId === embarqueId) : data);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [user, embarqueId]);

  /**
   * Registra un depósito. Es de Administración: quien concilia el banco.
   *
   * No se edita ni se borra —solo se da de baja— porque un depósito es
   * evidencia de que entró dinero, igual que un comprobante.
   */
  const registrarDeposito = async (
    datos: Omit<DepositoCliente, 'id' | 'registradoPor' | 'activo' | 'fechaAlta' | 'updatedAt'>,
  ): Promise<DepositoCliente> => {
    exigir(user?.rol as UserRole | undefined, 'ordenCompra.autorizar');

    const ahora = new Date().toISOString();
    const deposito: DepositoCliente = {
      ...datos,
      id: idUnico('DEP'),
      registradoPor: { uid: user?.uid ?? '', nombre: user?.nombre ?? user?.email ?? '' },
      activo: true,
      fechaAlta: ahora,
      updatedAt: ahora,
    };

    await conAviso('el depósito del cliente', () =>
      setDoc(doc(db, COL, deposito.id), sanitizarParaFirestore(deposito)));

    return deposito;
  };

  /** Baja lógica: un depósito mal capturado se anula, no se borra. */
  const anularDeposito = async (id: string): Promise<void> => {
    exigir(user?.rol as UserRole | undefined, 'ordenCompra.autorizar');
    await conAviso('el depósito', () =>
      updateDoc(doc(db, COL, id), sanitizarParaFirestore({
        activo: false, updatedAt: new Date().toISOString(),
      }) as Record<string, unknown>));
  };

  return { depositos, loading, registrarDeposito, anularDeposito };
}
