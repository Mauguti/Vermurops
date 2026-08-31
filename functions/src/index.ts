/**
 * index.ts — punto de entrada de las Cloud Functions de VermurOps.
 *
 * Solo exporta. Cada función vive en su carpeta con sus dependencias, para que
 * agregar la de Gestión de Usuarios —que necesita el Admin SDK para crear
 * cuentas— no obligue a tocar nada de lo que ya está.
 *
 * Región: us-central1, la equivalente a nam5 donde vive Firestore. Ponerlas en
 * otra región costaría latencia en cada lectura.
 */

import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';

initializeApp();
setGlobalOptions({ region: 'us-central1' });

// ── Tarifas ──────────────────────────────────────────────────────────────────
export { extraerTarifas } from './tarifas/extraerTarifas.js';

// ── Gestión de usuarios (pendiente) ─────────────────────────────────────────
// export { crearUsuario } from './usuarios/crearUsuario.js';
