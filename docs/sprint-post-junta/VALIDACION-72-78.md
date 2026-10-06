# Validación en producción · 72 → 78

**Cuenta:** `administracion@vermur.com` para pagos y cobranza,
`operaciones@vermur.com` donde se indique, `info@digsol.com.mx` (admin) para
lo demás. Consola del navegador limpia todo el recorrido.

Lo que escribe va sobre **«PRUEBA PAGOS»** y sus facturas y órdenes, nunca
sobre cartera real.

> **Dos avisos antes de empezar.**
>
> 1. **Anular un cobro ahora pide motivo.** Avísale al equipo: quien ya lo
>    hacía va a encontrarse un campo obligatorio nuevo.
> 2. **La 78 borró siete archivos huérfanos** y quitó las rutas de Reservas y
>    Recolecciones. Nada los importaba y el build lo confirma, pero si alguien
>    tenía una URL guardada a `#/bookings` o `#/pickups`, ya no responde. Eso
>    es lo esperado, no un bug.

---

## 1 · Lo que no escribe nada

1. **Finanzas → pestaña Pagos** (nueva, tarea 72). Cada movimiento con su
   folio `PAG-…`, lo aplicado, lo que queda a favor y su estado. Debe traer
   los pagos que se hayan registrado desde ayer. Prueba el selector de
   vistas: quita una columna, guarda la vista con nombre, recarga — tienen
   que volver **columnas y filtros**.
2. **Abre un pago** con varias aplicaciones: debe verse a qué facturas fue y
   cuánto a cada una.
3. **Pestaña Facturas de un embarque** que tenga un cobro **anulado**
   (tarea 75): el anulado **ya no se lista** ahí, y su botón «Anular» no
   debe aparecer. Sigue viéndose en la ficha del pago con el filtro
   «Anulados». Si ves un cobro anulado en Facturas, es regresión.
4. **Cargos de un embarque con conceptos en dos monedas** (tarea 75): el
   concepto mezclado **no debe mostrar un total único ni un margen %**. Un
   solo número ahí mezclaría monedas (§4.3). Con una sola moneda, sí.
5. **Altas → Clientes** (tarea 76). Debe aparecer el contador de **«Sin
   estatus»** junto al de la lista, y esos clientes se ven con etiqueta
   ámbar en vez de esconderse. **Es el punto que más importa de este bloque:
   si el contador sale en más de cero, son clientes que el equipo no veía.**
   Dime el número.
6. **Cuentas por pagar** (tarea 74): hay badge y **filtro de prefactura**, y
   un contador. Sin órdenes marcadas, debe decir cero, no romperse.
7. **El menú lateral** no debe tener Reservas ni Recolecciones (tarea 78), ni
   siquiera con admin.

## 2 · Lo que escribe

8. **Pago a proveedor que cubre varias órdenes** (tarea 73) — *el que más
   cuidado merece, porque mueve dinero real*. En Programación de pagos,
   agrupa **dos órdenes del mismo proveedor y la misma moneda** y registra el
   pago. Debe quedar **UN** `PAG-…` con una aplicación por orden, no dos
   pagos. Comprueba en la pestaña Pagos que el monto es la suma y que las dos
   órdenes quedan pagadas.
   - **Intenta agrupar dos órdenes de proveedores distintos**: tiene que
     negarse y decir por qué.
   - **Intenta agrupar dos monedas distintas**: lo mismo (§4.3).
   - Si una orden trae **anticipo cruzado**, lo que sale del banco es el
     monto **menos el anticipo**, no el monto entero. Verifícalo contra la
     tarjeta de Programación de pagos.
9. **Quitar una aplicación** de un pago (tarea 72): la factura vuelve a
   quedar con saldo y el pago, con dinero a favor. Nada se borra.
10. **Anular un pago** (tarea 72): pide **motivo** y no deja guardarlo vacío.
    Al anular, lo aplicado desaparece solo —se deriva— y la factura vuelve a
    su saldo. El pago anulado sigue existiendo, con su motivo.
11. **Marcar una orden como prefactura** (tarea 74), como **Operaciones**:
    casilla con motivo. El badge y el contador de Cuentas por pagar tienen
    que moverse. Pendiente, días y recibida **se derivan**: no busques campos
    guardados.
12. **Expediente del CLIENTE** (tarea 75, M-J): sube un documento, cámbiale
    el tipo a mano, guarda. La casilla debe decir **qué leyó el agente y qué
    decidiste tú**, igual que ya lo hace la del proveedor.

## 3 · Lo que NO se toca

- **Programación de pagos, bancos y anticipos** como política: esperan la
  junta con Julio. Aquí solo se valida que el pago agrupado escriba bien.
- **El interruptor de embarque automático**: apagado.
- **P8 y la 79** (anulación con `aplicacionesQuitadas`): van en la siguiente
  cola, cuando la detones.

## 4 · Síntoma → causa

| Síntoma | Causa más probable |
|---|---|
| Un cobro anulado aparece en Facturas del embarque | el filtro de `aplicacionesConPago` no está llegando |
| Dos pagos en vez de uno al pagar un grupo | el call site quedó en el loop viejo, no en `construirPagoDeGrupo` |
| Un total único en un concepto con dos monedas | `totalesDelConcepto` devolvió fila con lista de dos |
| El pago agrupado sale por el monto entero | no está restando el anticipo cruzado (`montoATransferir`) |
| «Sin estatus» en más de cero | **no es un bug**: son los clientes que estaban invisibles |

---

## Nota sobre la verificación de este bloque

La 73 y la 75 tardaron 5 y 2 minutos de reloj contra las estimaciones de ~35
y ~25 de sus reportes, y las dos tocan dinero. Se verificaron **por
mutación** —romper la regla, confirmar que un test se cae, regresarla— en vez
de confiar en el reporte:

| Mutación | Tests que caen |
|---|---|
| 73 · `problemasDelGrupo` deja pasar monedas mezcladas | 1 de 14 |
| 73 · `problemasDelGrupo` deja pasar proveedores distintos | 1 de 14 |
| 73 · `construirPagoDeGrupo` ignora el anticipo cruzado | 1 de 14 |
| 75 · `aplicacionesConPago` deja de filtrar anulados | 3 de 60 |
| 75 · `totalesDelConcepto` da total con varias monedas | 1 de 32 |
| 75 · `totalesDelConcepto` divide entre venta cero | 1 de 32 |

Las seis muerden, así que una regresión se atrapa. **Lo que no hay es
redundancia:** cada regla de la 73 la sostiene UNA sola aserción. Si alguien
borrara la regla y su test en el mismo cambio, la suite seguiría en verde.
Por eso los puntos 8, 3 y 4 de arriba se validan a mano aunque haya tests.
