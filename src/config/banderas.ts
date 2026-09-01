/**
 * banderas.ts
 *
 * Funcionalidad construida y validada que NO debe estar activa en producción
 * todavía. El mismo criterio que PDF_DISPONIBLE en la ficha: un botón (o un
 * automatismo) que promete algo que aún no puede cumplirse bien es peor que
 * su ausencia.
 */

/**
 * A-1 · El embarque nace solo al marcar la cotización como ganada.
 *
 * Construido, probado (22 tests del planificador + transacción idempotente) y
 * validado en local. APAGADO en producción porque los contadores de serie
 * siguen sin sembrar con los consecutivos reales de Magaya: el primer
 * VLIT-26-001 duplicaría un folio histórico, y ese folio va impreso en
 * documentos (BL, cartas de encomienda).
 *
 * Se enciende cuando Vermur entregue los consecutivos y se siembren en
 * Configuración → Contadores de folio. Nada más que hacer: la bandera es lo
 * único que lo separa de operar.
 *
 * Con la bandera apagada:
 *   - marcar ganada solo marca ganada (el comportamiento de producción hoy);
 *   - el embarque se abre a mano desde Embarques → «Cotizaciones ganadas sin
 *     embarque», con folio SHP- del contador que sí está sembrado.
 */
export const EMBARQUE_AUTOMATICO_DISPONIBLE = false;
