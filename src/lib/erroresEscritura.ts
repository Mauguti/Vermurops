/**
 * erroresEscritura.ts
 *
 * Superficie única para los fallos de escritura en Firestore.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * El patrón ya mordió tres veces —prospectos, embarques y los conceptos de la
 * matriz—. En el último, la escritura fallaba, nadie atrapaba la promesa, el
 * estado de React ya se había actualizado y en pantalla parecía guardado. El
 * trabajo se perdía al recargar sin que nada avisara.
 *
 * Sanitizar `undefined` arregla ESE modo de fallo. Atrapar la promesa hace
 * visibles TODOS: permisos, red, reglas, cuota. Por eso esto va primero.
 *
 * Es un pub/sub sin React a propósito: un hook tiene que poder reportar sin
 * depender de dónde esté montado en el árbol de componentes.
 */

export interface ErrorEscritura {
  id: string;
  /** Qué se intentaba guardar, en lenguaje del usuario. */
  contexto: string;
  mensaje: string;
  /** Código de Firestore cuando lo hay: permission-denied, unavailable… */
  codigo?: string;
  fecha: string;
}

type Suscriptor = (e: ErrorEscritura) => void;

const suscriptores = new Set<Suscriptor>();
let contador = 0;

export function suscribirErroresEscritura(fn: Suscriptor): () => void {
  suscriptores.add(fn);
  return () => { suscriptores.delete(fn); };
}

/**
 * Traduce el error a algo accionable.
 *
 * Un «FirebaseError: Missing or insufficient permissions» no le dice nada a
 * quien está cotizando. Lo que necesita saber es que su cambio no se guardó y
 * qué hacer.
 */
export function mensajeLegible(err: unknown): { mensaje: string; codigo?: string } {
  const codigo = (err as { code?: string })?.code;
  const crudo = err instanceof Error ? err.message : String(err);

  if (codigo === 'permission-denied') {
    return { mensaje: 'No tienes permiso para guardar este cambio.', codigo };
  }
  if (codigo === 'unavailable' || codigo === 'deadline-exceeded') {
    return { mensaje: 'Sin conexión con el servidor. El cambio NO se guardó; vuelve a intentarlo.', codigo };
  }
  if (codigo === 'resource-exhausted') {
    return { mensaje: 'El servidor rechazó la escritura por límite de cuota.', codigo };
  }
  if (crudo.includes('Unsupported field value')) {
    return {
      mensaje: 'El cambio tiene un dato en blanco que el servidor no acepta. No se guardó.',
      codigo: 'undefined-field',
    };
  }
  return { mensaje: crudo, codigo };
}

/** Reporta un fallo de escritura. Lo ve el usuario. */
export function reportarErrorEscritura(contexto: string, err: unknown): void {
  const { mensaje, codigo } = mensajeLegible(err);
  const evento: ErrorEscritura = {
    id: `err-${++contador}`,
    contexto,
    mensaje,
    codigo,
    fecha: new Date().toISOString(),
  };

  // Siempre a consola: si la UI no está montada, el rastro no se pierde.
  console.error(`[escritura] ${contexto}: ${mensaje}`, err);
  suscriptores.forEach(fn => fn(evento));
}

/**
 * Envuelve una escritura para que su fallo nunca sea silencioso.
 *
 * Reporta y RELANZA: el call site que quiera manejarlo aparte puede hacerlo,
 * y el que no, ya avisó al usuario. Relanzar además conserva el control de
 * flujo de las guardas de permisos, que dependen de que el error propague.
 *
 *     await conAviso('la cotización', () => updateDoc(ref, datos));
 */
export async function conAviso<T>(contexto: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    reportarErrorEscritura(contexto, err);
    throw err;
  }
}

/**
 * Red de seguridad: cualquier promesa rechazada que se escape.
 *
 * Cubre el caso que de verdad importa — el código que todavía no envuelve sus
 * escrituras, y el que se escriba mañana sin acordarse de hacerlo. Sin esto, el
 * estándar depende de que nadie lo olvide nunca.
 */
export function instalarRedDeSeguridad(): () => void {
  const handler = (ev: PromiseRejectionEvent) => {
    const err = ev.reason;
    const codigo = (err as { code?: string })?.code;
    const crudo = err instanceof Error ? err.message : String(err);

    // Solo lo que huele a Firestore: no secuestrar errores ajenos.
    const esDeFirestore =
      typeof codigo === 'string' ||
      crudo.includes('Firebase') ||
      crudo.includes('Unsupported field value');

    if (esDeFirestore) {
      reportarErrorEscritura('un cambio', err);
    }
  };

  window.addEventListener('unhandledrejection', handler);
  return () => window.removeEventListener('unhandledrejection', handler);
}
