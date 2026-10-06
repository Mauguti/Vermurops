# Validación en producción · sprint de pagos (67 → 71)

**Cuenta:** `administracion@vermur.com` para casi todo —la cobranza es de
Administración desde la 69— e `info@digsol.com.mx` (admin) donde se indique.
La consola del navegador debe quedar limpia todo el recorrido.

**Lo que escribe va sobre un cliente «PRUEBA PAGOS» y sus facturas**, nunca
sobre cartera real. Lo real se abre solo para mirar.

> ⚠️ **Esto no se valida hasta que la regla de `pagos/` esté desplegada.**
> Sin ella, «Aplicar pago» y «Registrar entrada de dinero» avisan que la
> regla no está publicada y no guardan. Si ves ese aviso, el deploy de
> `firestore:rules` no entró.

> ⚠️ **La 68 cambió dónde se escribe el dinero.** A partir de ahora un cobro
> y un depósito nacen en `pagos/`; `cobros/` y `depositosCliente/` quedan de
> **solo lectura**. Lo que ya estaba ahí **no se migró** y se sigue leyendo.
> Un movimiento vive en uno o en el otro, nunca en los dos: si ves un cobro
> viejo y su equivalente nuevo juntos, eso sí es un bug.

---

## 1 · Lo que no escribe nada

1. **Finanzas → Cuentas por cobrar.** Debe abrir igual que siempre, con el
   agrupado por cliente de omisión y los totales por moneda. Nada de lo que
   ya estaba capturado puede haber cambiado de número: la 67 unificó la
   **lectura** y el 68 la **escritura**, pero ninguno migró datos.
2. **Un cliente con cobros viejos** (busca uno con cartera parcialmente
   cobrada). El saldo tiene que ser el mismo que antes del deploy. Si un
   saldo cambió, el adaptador de lo viejo está leyendo mal — eso es
   bloqueante, dímelo y revertimos.
3. **Abre una factura cobrada parcialmente** → debe verse **qué pagos la
   cubrieron**, incluidos los cobros anteriores al cambio. Un cobro viejo se
   lee por el adaptador y debe aparecer como registro anterior.
4. **Ficha de una orden de compra.** El panel de depósito del cliente pasó a
   **solo lectura**: enseña lo depositado y lo comprometido con enlace al
   cobro, y donde estaba el formulario hay un aviso de que los cobros los
   registra Administración en Cuentas por cobrar. **El formulario ya no debe
   estar ahí.**
5. **Entra como Operaciones.** No debe ver el formulario de registrar cobro
   en ninguna parte. Sí puede **marcar** «No pagar»; quien lo **quita** es
   Administración.
6. **Expediente de un proveedor** (tarea 71): abre uno que ya tenga archivos
   subidos antes de hoy. Deben leerse igual — `clasificacion` es opcional y
   aditivo, los viejos no lo traen.

## 2 · Lo que escribe — cliente «PRUEBA PAGOS»

7. **Da de alta el cliente** «PRUEBA PAGOS» (Administración, en Altas) y
   créale **tres facturas en pesos** con vencimientos distintos y **una en
   dólares**, desde la pestaña Facturas de un embarque de prueba.

8. **«Aplicar pago»** en el renglón de ese cliente en Cuentas por cobrar.
   El botón dice **«Aplicar pago»**, no «Registrar cobro»:
   - Arriba el dinero que entró: monto, moneda, fecha, cuenta y **referencia
     opcional** — tiene que poder guardarse **sin** referencia (es el punto
     de Gaby: la referencia llega después del pago).
   - Abajo **solo las facturas en pesos**. La de dólares **no debe
     aparecer**; si eliges dólares, la pantalla lo **dice** en vez de
     mostrar una lista vacía.
   - **«Aplicar lo más vencido primero»** reparte en cascada: las primeras
     completas y la última parcial, con «se aplica» y «queda» por renglón y
     un **✓ cuadra**.
   - **Aplicar más de lo que entró no debe poder guardarse.** Tampoco
     aplicarle a una factura más de lo que debe.
   - Guarda. Al recargar, **las facturas liquidadas desaparecen** de la
     cartera «Abiertas» y la parcial se queda con su saldo nuevo.

9. **El caso de siempre sigue siendo de dos clics:** abre una factura suelta
   y cóbrala desde ahí. El monto y el reparto deben llegar ya puestos en su
   saldo.

10. **Un pago que cruza embarques.** Haz que dos de las facturas sean de
    embarques distintos y aplícales un solo pago. Debe quedar **un** pago
    con los dos embarques — es justo lo que el modelo viejo no podía
    representar.

11. **«Registrar entrada de dinero»** (el anticipo sin factura), en Cuentas
    por cobrar, **no** en la ficha de la orden. Lígalo a un embarque y
    comprueba que **la orden de ese embarque se puede autorizar**: el
    anticipo tiene que fondearla igual que antes.

12. **Lo que sobra queda a favor del cliente, a la vista.** Aplica un pago
    mayor que la suma de sus facturas y confirma que el sobrante se enseña,
    no que se pierde.

13. **Documentos de la orden con FOTO** (lo de la regla de Storage, ya
    desplegada): en una OC de prueba sube un **JPG** —una captura de
    transferencia— por «Subir documentos». Antes no entraba porque el código
    apuntaba a `factura/`, que solo acepta PDF y XML. Ahora va a
    `documentos/` y debe subir. Un PDF y un XML deben seguir funcionando.

14. **Corrección del tipo en el expediente del proveedor** (tarea 71): sube
    un documento, **cámbiale el tipo a mano** y guarda. Al reabrir, el
    renglón debe decir **qué leyó el agente y qué decidiste tú** — las
    mismas palabras que ya usan el expediente del cliente y la orden.

## 3 · Lo que NO se toca

- **Programación de pagos, bancos y anticipos**: esperan la junta con Julio.
- **El interruptor de embarque automático**: sigue apagado hasta que Julio
  confirme el folio y sembremos los seis consecutivos.
- **P5 a P8 del plan de pagos**: van en la siguiente cola, cuando la
  detones.
- **`scripts/minarRFCMagaya.ts`**: solo modo seco. No mina genéricos ni pisa
  un `rfc` que ya existe.

## 4 · Síntoma → causa

| Síntoma | Causa más probable |
|---|---|
| «`pagos/` no tiene su regla publicada» al guardar | el deploy de `firestore:rules` no entró |
| Un saldo viejo cambió de número | el adaptador de `cobros/` legado lee mal — **bloqueante** |
| El mismo movimiento aparece dos veces | algo quedó escrito en `pagos/` **y** en lo viejo |
| El JPG de la orden no sube | el código quedó apuntando a `factura/`, o la regla de Storage no está |
| El anticipo no fondea la orden | el pago quedó sin `embarqueIds` |
