/**
 * anotarBitacora.ts
 *
 * Escribe una entrada en la bitácora de un embarque desde fuera de su ficha:
 * los hooks de OC, facturas y cobros, que son el único lugar por donde eso
 * pasa (la lección de §6: la regla y su call site van juntos).
 *
 * `arrayUnion` para no pisar lo que la ficha esté escribiendo al mismo
 * tiempo. Nunca tumba la operación principal: si la bitácora falla, se
 * avisa en consola y la OC/factura/cobro ya quedó escrita.
 */

import { db } from '../firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { entradaSistema, type Autor } from '../lib/bitacoraEmbarque';
import type { EventoBitacora } from '../components/shipments/EmbarquesData';

export async function anotarBitacora(
  embarqueId: string | null | undefined,
  evento: EventoBitacora,
  titulo: string,
  autor: Autor,
  detalle?: string,
): Promise<void> {
  if (!embarqueId) return;
  const entrada = entradaSistema(evento, titulo, autor, new Date().toISOString(), detalle);
  try {
    await updateDoc(doc(db, 'embarques', embarqueId), { bitacora: arrayUnion(sanitizarParaFirestore(entrada)) });
  } catch (err) {
    console.warn(`[bitácora] No se pudo anotar en ${embarqueId}:`, err);
  }
}
