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

// ── Tipo de cambio (tarea 51) ───────────────────────────────────────────────
export { tipoCambioProgramado, actualizarTipoCambio } from './tipoCambio/tipoCambio.js';

// ── Correo saliente por Exchange / Microsoft 365 (tarea 64) ─────────────────
// `enviarCorreoInterno` y `SECRETOS_CORREO` NO se exportan aquí: son para que
// otras Functions los importen, no endpoints. Exportarlos haría que Firebase
// intentara desplegarlos como funciones.
/*
 * ⛔ DESACTIVADO A PROPÓSITO — 5-oct-2026. Reactivar DESPUÉS del 12-oct.
 *
 * Por qué está comentado y no borrado: `enviarCorreo` declara
 * `CORREO_SMTP_USUARIO` y `CORREO_SMTP_PASSWORD` con `defineSecret`, y esos
 * secretos no existen en Secret Manager porque todavía no hay credenciales
 * de Exchange. El `--only` del CLI filtra QUÉ se despliega, pero no qué se
 * ANALIZA: Firebase resuelve los parámetros de todo el codebase antes de
 * filtrar, así que mientras esta línea exista y falten los secretos
 * **no se puede desplegar NINGUNA Function**:
 *
 *   Error: In non-interactive mode but have no value for the secret
 *   CORREO_SMTP_USUARIO
 *
 * Eso bloqueó el deploy de `clasificarDocumento` el 5-oct. Comentar el export
 * es lo mínimo que lo destraba; el código de la tarea 64 se queda completo.
 *
 * Para reactivar hacen falta DOS cosas, no una:
 *   1. Las capacitaciones del 12-oct, que es cuando se enciende el correo.
 *   2. Decidir el transporte. El dominio vermur.com está en Microsoft 365
 *      (MX → outlook.com, SPF con `-all`), donde **SMTP AUTH viene apagado
 *      por default** y Microsoft lo está retirando. Si se va por **Graph**,
 *      estos dos secretos de SMTP no aplican y hay que cambiarlos por el
 *      client id / tenant id / client secret de una app registration — o
 *      sea que descomentar esta línea NO basta.
 *
 * Mientras tanto no hay nada en la interfaz que mande correo, así que no se
 * pierde ninguna función: lo que se pierde es el endpoint sin usar.
 */
// export { enviarCorreo } from './correo/enviarCorreo.js';
