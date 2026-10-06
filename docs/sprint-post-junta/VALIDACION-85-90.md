# Validación en producción · 85 → 90

**Cuenta:** `administracion@vermur.com` para pagos, `operaciones@vermur.com`
donde se indique. Consola limpia todo el recorrido.

Lo que escribe va sobre **«PRUEBA PAGOS»** y órdenes de prueba. Este bloque
mueve estados de órdenes de compra: **nada sobre una orden real**.

> **El renglón que más importa de todo el bloque:** en Programación de pagos,
> el **total del modal de «Registrar pago»** tiene que ser el mismo que la
> tarjeta del grupo. Hasta ayer restaba el anticipo dos veces —13,500 se veía
> **11,000**— mientras el sistema registraba 13,500. Autorizabas creyendo que
> transferías menos de lo que se iba a registrar. Punto 6.

---

## 1 · Lo que no escribe nada

1. **Finanzas y la ficha de un embarque abiertas a la vez** (tarea 89). Todo
   debe verse igual que antes: la misma cartera, las mismas facturas en la
   pestaña del embarque. El cambio es interno —un listener por colección en
   vez de uno por pantalla— y **lo que hay que comprobar es que no cambió
   nada**. Si la pestaña Facturas de un embarque muestra facturas de OTRO
   embarque, es el filtro: bloqueante, dímelo.
2. **Altas → Clientes y el selector de proveedores** (tarea 88): un proveedor
   **sin** campo `activo` ahora aparece. Antes los selectores lo escondían
   mientras su ficha decía «Activo». **No se escribió ningún campo**: si un
   proveedor aparece que antes no estaba, es esto, no un alta nueva.
3. **Ninguna pantalla debe sacar un cuadro gris del navegador** (tarea 87).
   Borrar, desactivar, importar: todos piden confirmación en un modal de la
   plataforma. Lo destructivo en **rojo**, el resto en **morado**. Si ves un
   `alert` del navegador, se escapó uno.

## 2 · Lo que escribe

4. **Registrar un pago a proveedor** con dos órdenes del mismo proveedor y
   moneda (tareas 81, 85, 86, 87).
5. **La fecha del pago** (tarea 86): elige una fecha **anterior** a la
   autorización de alguna de las órdenes. Debe rechazarla **diciendo cuál y
   con qué fecha**. Con una fecha válida, la orden guarda **ese día** como
   fecha de pago, no el de captura.
6. **El total, contra la tarjeta** — *el punto de arriba*. Con una orden que
   tenga **anticipo cruzado**: la tarjeta del grupo y el total del modal
   tienen que decir **lo mismo**. Desmarca una orden y el total baja a lo que
   sí sale del banco.
7. **Deja la cuenta de salida en «Sin indicar»** (tarea 87): debe salir el
   aviso ámbar «Sin cuenta: Julio no podrá conciliarlo por cuenta» y **dejar
   guardar igual**. Es tu decisión 4, ahora completa.
8. **Anular ese pago** (tarea 85): las órdenes regresan a «autorizada» y
   reaparecen en Programación de pagos. Ahora es **una transacción**: o se
   anula el pago y regresan todas, o no pasa nada. Si alguien movió una orden
   desde otra sesión, no debe escribirse nada y decirlo.
9. **Un cliente sin `statusOperativo`** sigue siendo operable: cotización →
   ganada → embarque (tarea 88). **El seed no escribe `ACTIVO`** — tu
   decisión: no se inventan datos.

## 3 · Lo que NO se publicó

- **La 84** sigue fuera. La **90 no es su descendiente**: su base común es la
  83, o sea que la 90 rehízo ese trabajo sobre base limpia. La WIP sin
  verificar de la 84 no entró — comprobado antes y después del merge.
- **El emulador de Functions en la suite completa**: va en la siguiente cola
  (tu respuesta a la 90).
- **El interruptor de embarque automático**: apagado.

## 4 · Síntoma → causa

| Síntoma | Causa más probable |
|---|---|
| Facturas de otro embarque en la pestaña de uno | el filtro de `filtrarPorEmbarque` — **bloqueante** |
| El total del modal ≠ la tarjeta del grupo | volvió el anticipo restado dos veces |
| Un cuadro gris del navegador | se escapó un `alert`/`confirm` de la 87 |
| Al anular quedan órdenes en «pagada» | la transacción de la 85 no está entrando |
| Un proveedor «nuevo» en el selector | es la 88: estaba escondido por no tener el campo |

---

## Lo que encontré al revisar este bloque

**La 90 toca una línea de producción, y la revisé como si fuera de otro.**
`transferenciasDelDia` devolvía copias con el `monto` ya neto pero
conservando `anticiposCruzados`, y el modal volvía a aplicar
`montoATransferir` encima: el anticipo se restaba dos veces. La corrección
—limpiar `anticiposCruzados` en la copia— es correcta y segura, y lo
verifiqué por el camino que importa: **esas copias nunca se persisten**.
`registrarPagoDelGrupo` re-resuelve las órdenes reales por id antes de
escribir, así que el array vacío no puede borrar los anticipos de nadie.

Lo que sí conviene saber: el error era de **visualización**, pero del tipo
peligroso. Lo que se registraba era 13,500 y lo que se mostraba 11,000 — el
sistema estaba bien y la pantalla mentía hacia abajo.

**La 89 tenía un hueco de cobertura, y la mutación lo encontró.** Romper el
filtro por embarque de `useTienda` **no tumbaba ningún test**: los dos de la
tarea cubren la mitad de rendimiento —un listener por colección— y ninguno la
de corrección. Con el filtro roto, la pestaña Facturas de cada embarque
mostraría las de todos, y la suite seguía en verde. Se extrajo
`filtrarPorEmbarque` como función pura con cuatro tests; con la mutación
caen 3 de 6.

De paso quedó fijado un caso que el `embarqueId ? …` original resolvía al
revés: con **cadena vacía** caía en «sin filtro» y devolvía TODO.

**Las mutaciones que sí mordían desde el principio:**

| Mutación | Tests que caen |
|---|---|
| 89 · la tienda deja de compartir el listener | 4 de 10 |
| 90 · la copia vuelve a conservar los anticipos | 1 de 18 |
| 89 · el filtro por embarque deja de filtrar | **0 de 2** → ahora 3 de 6 |
