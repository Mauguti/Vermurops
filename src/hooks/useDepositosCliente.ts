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
 *
 * ── Tarea 68 (P2) ─────────────────────────────────────────────────────────
 * `depositosCliente/` es de SOLO LECTURA: lo que se registra hoy va a
 * `pagos/` como un pago sin aplicaciones (`construirPagoDeDeposito`). Lo que
 * ya está no se migra y se lee con el adaptador de `lib/pagos.ts`.
 */

import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, doc, onSnapshot, updateDoc, query, orderBy } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { conAviso } from '../lib/erroresEscritura';
import type { DepositoCliente } from '../components/ordenesCompra/OrdenesCompraData';
import {
  coleccionDelPago, construirPagoDeDeposito, pagosDeCliente,
  type DatosDeposito, type Pago,
} from '../lib/pagos';
import { usePagos } from './usePagos';
import { anotarBitacora } from './anotarBitacora';
import { problemaMotivo, textoAnulacion } from '../lib/reversaPagos';

const COL = 'depositosCliente';

export function useDepositosCliente(embarqueId?: string) {
  const { user } = useAuth();
  const [depositos, setDepositos] = useState<DepositoCliente[]>([]);
  const [loading, setLoading] = useState(true);
  // Tarea 68 · `pagos/` es donde se escribe; `depositosCliente/` solo se lee.
  const { pagos: pagosNuevos, contextoNuevo, guardarPago, anularPago } = usePagos(embarqueId);

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
   * La lista unificada: los depósitos viejos y los pagos de `pagos/`, en la
   * misma forma. Quien necesite el fondeo del embarque la consume con
   * `entradasDeFondeo` y no tiene que saber de dónde salió cada movimiento.
   */
  const pagos = useMemo<Pago[]>(
    () => pagosDeCliente(pagosNuevos, [], depositos),
    [pagosNuevos, depositos],
  );

  /**
   * Registra un depósito. Es de Administración: quien concilia el banco.
   *
   * ── Qué cambió en P2 ────────────────────────────────────────────────────
   * Escribe UN documento en `pagos/` —un pago con CERO aplicaciones: dinero
   * que entró y todavía no cobra ninguna factura— en vez de un
   * `DepositoCliente`. **La firma no cambia.** `depositosCliente/` queda de
   * solo lectura y no se migra.
   *
   * No se edita ni se borra —solo se da de baja— porque un depósito es
   * evidencia de que entró dinero, igual que un comprobante.
   *
   * Tarea 69 · La capacidad pasa de `ordenCompra.autorizar` a
   * `cobro.registrar`. En la práctica es la misma gente —Administración y
   * admin tienen las dos— pero el motivo cambia: hasta aquí se pedía el
   * permiso de AUTORIZAR UN PAGO porque el formulario vivía dentro de la
   * ficha de la orden de compra. Ahora se pide el de RECIBIR DINERO, que es
   * lo que el acto es. Un permiso que se hereda de la pantalla donde estaba
   * el botón se queda viejo cuando el botón se mueve, que es justo lo que P3
   * acaba de hacer.
   */
  const registrarDeposito = async (datos: DatosDeposito): Promise<Pago> => {
    exigir(user?.rol as UserRole | undefined, 'cobro.registrar');

    const ctx = await contextoNuevo();
    const pago = construirPagoDeDeposito(datos, ctx);
    return guardarPago(pago);
  };

  /**
   * Baja lógica: un depósito mal capturado se anula, no se borra.
   *
   * El id puede ser de `pagos/` o un depósito viejo; lo decide
   * `coleccionDelPago`. Un id que no está en la lista no se escribe en
   * ninguna de las dos: anular en la colección equivocada dejaría el
   * movimiento vivo donde sí está.
   */
  const anularDeposito = async (id: string, motivo: string): Promise<void> => {
    exigir(user?.rol as UserRole | undefined, 'cobro.registrar');
    const problema = problemaMotivo(motivo);
    if (problema) throw new Error(problema);
    const pago = pagos.find(p => p.id === id);

    const donde = coleccionDelPago(id, pagos);
    if (donde === 'pagos') {
      await anularPago(id, {
        motivo: motivo.trim(), por: user?.nombre ?? user?.email ?? '', en: new Date().toISOString(),
      });
    } else if (donde === 'depositosCliente') {
      await conAviso('el depósito', () =>
        updateDoc(doc(db, COL, id), sanitizarParaFirestore({
          activo: false, updatedAt: new Date().toISOString(),
        }) as Record<string, unknown>));
    } else {
      throw new Error(`No se encontró el depósito ${id} para anularlo.`);
    }

    /* Tarea 72 · P5 · Quién, cuándo y por qué, en la bitácora del embarque
       al que el anticipo fondeaba: es donde Operaciones mira por qué una
       orden dejó de estar fondeada. */
    if (pago) {
      const autor = { uid: user?.uid ?? '', nombre: user?.nombre ?? user?.email ?? '' };
      const t = textoAnulacion(pago, autor.nombre, motivo);
      for (const e of new Set(pago.embarqueIds)) await anotarBitacora(e, 'cobro', t.titulo, autor, t.detalle);
    }
  };

  /*
   * `pagos` NO se expone: hoy solo lo usa `anularDeposito` para saber en qué
   * colección anular. Exportar una lista que nadie consume es la «regla sin
   * call site» al revés — superficie que parece una fuente de verdad. Quien
   * necesite el fondeo del embarque la arma con `pagosDeCliente` (Finance).
   */
  return { depositos, loading, registrarDeposito, anularDeposito };
}
