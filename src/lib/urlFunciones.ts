/**
 * urlFunciones.ts
 *
 * Dónde viven las Cloud Functions, según contra qué entorno corre la app.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * La URL estaba escrita a mano en CUATRO hooks —el extractor de tarifarios, el
 * clasificador de documentos del embarque, el del expediente y el generador de
 * PDF— y las cuatro apuntaban duro a producción. Consecuencia: contra
 * emuladores la app seguía llamando a la Function de producción, que rechaza
 * un token del emulador. O sea que un tarifario no se podía reproducir sin ir
 * a producción, que es justo lo que los emuladores existen para evitar.
 *
 * ── El orden de precedencia ────────────────────────────────────────────────
 *   1. VITE_FUNCTIONS_URL   — base explícita. Para apuntar a un despliegue de
 *                             prueba sin tocar el código.
 *   2. USANDO_EMULADORES    — el emulador de Functions, en :5001.
 *   3. producción.
 *
 * Producción es el último caso y NO el default silencioso de un `if (DEV)`:
 * la misma razón por la que `VITE_USAR_EMULADORES` es opt-in explícito. Quien
 * no declara nada, sigue hablándole a producción, que es lo que hacía antes.
 *
 * Lógica pura salvo por la bandera: se puede probar pasándola.
 */

import { USANDO_EMULADORES } from '../firebase';

export const REGION = 'us-central1';
export const PROYECTO = 'vermur-logistics-app';

/** El emulador de Functions, el mismo puerto que usa firebase.emulador.json. */
export const PUERTO_FUNCTIONS = 5001;

export interface EntornoFunciones {
  /** Valor de VITE_FUNCTIONS_URL, si se declaró. */
  base?: string;
  emuladores: boolean;
}

/**
 * Base sin la barra final.
 *
 * Se separa de `urlFuncion` para poder probarla sin `import.meta.env`.
 */
export function baseDeFunciones(entorno: EntornoFunciones): string {
  const explicita = entorno.base?.trim();
  if (explicita) return explicita.replace(/\/+$/, '');

  if (entorno.emuladores) {
    return `http://127.0.0.1:${PUERTO_FUNCTIONS}/${PROYECTO}/${REGION}`;
  }
  return `https://${REGION}-${PROYECTO}.cloudfunctions.net`;
}

/** URL completa de una Function por nombre. */
export function urlDeFuncion(nombre: string, entorno: EntornoFunciones): string {
  return `${baseDeFunciones(entorno)}/${nombre}`;
}

/** El entorno de ESTA carga de la app. */
export function entornoActual(): EntornoFunciones {
  return {
    base: import.meta.env.VITE_FUNCTIONS_URL as string | undefined,
    emuladores: USANDO_EMULADORES,
  };
}

/**
 * Lo que usan los hooks: `urlFuncion('extraerTarifas')`.
 *
 * Se resuelve en cada llamada y no en una constante de módulo, para que un
 * test pueda cambiar el entorno sin recargar el módulo.
 */
export function urlFuncion(nombre: string): string {
  return urlDeFuncion(nombre, entornoActual());
}
