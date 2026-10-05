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
 * **Tarea 66: esto ya no es la bandera, es su valor por omisión.** El
 * interruptor de verdad vive en Firestore —`contadores/configuracionEmbarques`,
 * `embarqueAutomatico`— y se mueve desde Configuración → Consecutivos de folio,
 * solo admin. Esta constante es lo que rige mientras ese documento no exista:
 * **apagado**, que es lo que producción hace hoy.
 *
 * Por qué dejó de ser una constante: encenderlo depende de dos cosas que no
 * están en el código. Los consecutivos reales de Magaya —VLIT iba en 107— y
 * el FORMATO del folio, que la sesión del 2-oct dejó en duda: lo anotado fue
 * «BLIM + año + tres dígitos… para enero va el 27, así que arrancamos en
 * 2701», y la plataforma emite `VLIM-26-001`. Las dos se configuran ahora en
 * esa pantalla, así que encender dejó de necesitar un deploy.
 *
 * Con el interruptor apagado:
 *   - marcar ganada solo marca ganada (el comportamiento de producción hoy);
 *   - el embarque se abre a mano desde Embarques → «Cotizaciones ganadas sin
 *     embarque», eligiendo la serie, que es lo que el equipo usa.
 *
 * Quien lo lee en pantalla: `useEmbarqueAutomatico()`. Nadie debe comparar
 * contra esta constante directamente, o el interruptor no serviría de nada.
 */
export const EMBARQUE_AUTOMATICO_PREDETERMINADO = false;
