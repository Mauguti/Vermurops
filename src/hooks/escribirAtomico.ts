/**
 * escribirAtomico.ts (tarea 85)
 *
 * Ejecuta un `PlanEscritura` (lib/escrituraPagoProveedor.ts) en UNA
 * transacción de Firestore: el pago, todas sus órdenes y la bitácora de cada
 * embarque se escriben juntos o no se escribe nada.
 *
 * Lo que garantiza la transacción, y lo que no:
 *  - Todo o nada: si cualquier lectura, verificación o escritura falla, no
 *    queda nada escrito. Probado en `escribirAtomico.test.ts`.
 *  - Antes de escribir se LEE cada orden y se comprueba que siga en el estado
 *    sobre el que se calculó el plan. Dos personas anulando el mismo pago, o
 *    una pantalla vieja, se detienen en vez de pisarse.
 *  - La bitácora entra en la misma escritura. Un embarque que ya no existe se
 *    omite (como hacía `anotarBitacora`): no tumba el pago.
 *  - El folio del pago NO entra: se reserva en su propia transacción
 *    (`generateFolioPago`) ANTES. Si lo de aquí falla, ese folio se pierde
 *    como hueco; es preferible a repetirlo.
 */

import { db } from '../firebase';
import { doc, runTransaction, arrayUnion } from 'firebase/firestore';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { conAviso } from '../lib/erroresEscritura';
import type { PlanEscritura } from '../lib/escrituraPagoProveedor';

export async function escribirAtomico(plan: PlanEscritura, contexto: string): Promise<void> {
  await conAviso(contexto, () => runTransaction(db, async tx => {
    // 1 · Lecturas (Firestore exige todas antes de la primera escritura).
    for (const d of plan.documentos) {
      if (!d.esperaEstado) continue;
      const snap = await tx.get(doc(db, d.coleccion, d.id));
      if (!snap.exists()) throw new Error(`La orden ${d.id} ya no existe. No se escribió nada.`);
      const actual = (snap.data() as { estado?: string }).estado;
      if (actual !== d.esperaEstado) {
        throw new Error(`La orden ${d.id} cambió mientras tanto (ahora está «${actual}», se esperaba «${d.esperaEstado}»). No se escribió nada: recarga y reintenta.`);
      }
    }
    const porEmbarque = new Map<string, unknown[]>();
    for (const b of plan.bitacora) {
      porEmbarque.set(b.embarqueId, [...(porEmbarque.get(b.embarqueId) ?? []), sanitizarParaFirestore(b.entrada)]);
    }
    const embarquesVivos: Array<[string, unknown[]]> = [];
    for (const [id, entradas] of porEmbarque) {
      if ((await tx.get(doc(db, 'embarques', id))).exists()) embarquesVivos.push([id, entradas]);
    }

    // 2 · Escrituras.
    for (const d of plan.documentos) {
      const ref = doc(db, d.coleccion, d.id);
      const datos = sanitizarParaFirestore(d.datos) as Record<string, unknown>;
      if (d.tipo === 'crear') tx.set(ref, datos); else tx.update(ref, datos);
    }
    for (const [id, entradas] of embarquesVivos) {
      tx.update(doc(db, 'embarques', id), { bitacora: arrayUnion(...entradas) });
    }
  }));
}
