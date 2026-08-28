/**
 * sanitizarFirestore.ts
 *
 * Quita las claves con valor `undefined` antes de escribir en Firestore.
 *
 * ── Por qué ────────────────────────────────────────────────────────────────
 * El SDK rechaza `undefined` con «Unsupported field value: undefined» y aborta
 * la escritura completa. No está activado `ignoreUndefinedProperties` en
 * src/firebase.ts, y activarlo globalmente cambiaría el comportamiento de todas
 * las colecciones de golpe.
 *
 * El caso que lo hace necesario: EmbarqueCompleto tiene siete campos opcionales
 * (nombreEmbarque, productos, enTransito…). Mientras los embarques vivían en
 * memoria, un `undefined` ahí era inofensivo. Al persistirlos, tumba el guardado
 * entero — y el usuario solo ve que su cambio no se guardó.
 *
 * `null` SÍ se conserva: en Firestore es un valor con significado, distinto de
 * la ausencia de la clave. `masterId: null` quiere decir «no tiene master».
 */

/** Recorre objetos y arrays quitando solo las claves cuyo valor es undefined. */
export function sanitizarParaFirestore<T>(valor: T): T {
  if (Array.isArray(valor)) {
    return valor.map(v => sanitizarParaFirestore(v)) as unknown as T;
  }

  // Objetos planos únicamente. Date, Timestamp y demás clases se dejan intactas.
  if (valor !== null && typeof valor === 'object' && esObjetoPlano(valor)) {
    const salida: Record<string, unknown> = {};
    Object.entries(valor as Record<string, unknown>).forEach(([k, v]) => {
      if (v === undefined) return;
      salida[k] = sanitizarParaFirestore(v);
    });
    return salida as unknown as T;
  }

  return valor;
}

function esObjetoPlano(v: object): boolean {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}
