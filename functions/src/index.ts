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

// ── Clasificación de documentos (tarifas + expediente KYC + embarque) ────────
export { clasificarDocumento } from './documentos/clasificarDocumento.js';

// ── Generación de documentos operativos (tarea 40) ──────────────────────────
export { generarDocumento } from './documentos/generarDocumento.js';

// ── Gestión de usuarios ─────────────────────────────────────────────────────
export { gestionarUsuarios } from './usuarios/gestionarUsuarios.js';
