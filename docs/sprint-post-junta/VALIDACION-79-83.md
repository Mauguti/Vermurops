# Validación en producción · 79 → 83

**Cuenta:** `administracion@vermur.com` para pagos y cobranza,
`operaciones@vermur.com` donde se indique. Consola limpia todo el recorrido.

Lo que escribe va sobre **«PRUEBA PAGOS»**, sus facturas y órdenes de prueba.
**Nunca sobre una orden real**: este bloque mueve estados de órdenes de compra.

> ⚠️ **Lo más delicado de este bloque: anular un pago a proveedor DEVUELVE
> sus órdenes a «autorizada»** y vuelven a aparecer en Programación de pagos.
> Es tu decisión 1 y **está pendiente de confirmar con Julio**: no la des por
> definitiva hasta que él la vea. Si cambia, cambia el comportamiento, no solo
> un texto.

---

## 1 · Lo que no escribe nada

1. **Finanzas → Pagos.** El filtro **«Cliente y proveedor / Cliente /
   Proveedor»** (tarea 80). Los totales van en **dos tarjetas separadas** —
   «Entrado» y «Pagado a proveedores»— y **nunca sumadas**: son lados
   distintos del dinero (§4.3). Si ves una sola cifra que los junta, es
   regresión.
2. **Guarda una vista con el filtro de lado puesto**, recarga y vuelve a
   abrirla: el lado tiene que volver con la vista.
3. **Un pago a proveedor de los de ayer** debe aparecer en la lista. También
   los **heredados** —las órdenes pagadas antes de P6, que no tienen
   documento en `pagos/`—; se distinguen porque **no se pueden anular** y la
   pantalla dice por qué: «es un registro anterior… no tiene documento propio
   que anular». Esa es tu decisión 2, y está puesta como imposibilidad, no
   como advertencia.
4. **Ficha de una orden de compra** (tarea 82): el panel de entradas debe
   mostrar **el aporte a ESTE embarque**, no el total del pago. Un pago de
   100,000 repartido 60,000 / 40,000 entre dos embarques tiene que decir
   60,000 en el primero, con «de 100,000.00 del pago» aparte. **Si ves el
   total del pago en los dos embarques, el mismo dinero se está contando
   dos veces** — bloqueante, dímelo.
5. **Altas → Clientes** (tarea 83): los «Sin estatus» siguen visibles con su
   etiqueta y su contador. **Dime el número**, como la vez pasada.

## 2 · Lo que escribe

6. **Registrar pago a proveedor con el formulario nuevo** (tarea 81). En
   Programación de pagos, un grupo de **dos órdenes del mismo proveedor y
   moneda**. Ya no es el `window.prompt`: es un modal con las órdenes en
   casillas (todas marcadas), fecha, cuenta de salida, referencia y
   comprobante opcional.
   - **Desmarca una orden**: el total debe bajar a lo que sí sale del banco y
     esa orden **se queda en «autorizada»**.
   - **La fecha no puede ser futura.**
   - **Sin referencia no debe dejar guardar.**
   - La **cuenta de salida sí se puede dejar en «Sin indicar»** — es tu
     decisión 4. Ver la nota al final.

7. **Anular ese pago** (tarea 80) — *el paso que más cuidado merece*:
   - Pide **motivo** y no guarda vacío.
   - Las **dos órdenes regresan a «autorizada»** y reaparecen en Programación
     de pagos.
   - El pago queda **anulado, no borrado**, con su motivo visible (tarea 79:
     `anulacion` vive en el propio Pago, así que un pago sin embarque ya no
     pierde el motivo).
   - **Intenta anular un pago heredado**: tiene que negarse.

8. **Quitar una sola aplicación** de un pago de cliente (tarea 79): la
   factura vuelve a tener saldo, el pago queda con dinero a favor, y **la
   aplicación quitada se conserva con su motivo** (`aplicacionesQuitadas`).
   No debe desaparecer sin rastro.

9. **Un cliente «Sin estatus» es operable** (tarea 83, tu decisión 3):
   toma uno, pídele una cotización y llévala a ganada. Debe poder abrir
   embarque. Solo el **inactivo explícito** se excluye.

## 3 · Lo que NO se toca

- **La 84 (higiene de e2e) NO se publicó**: no está verificada y quedó fuera
  del merge a propósito.
- **El anticipo cruzado de una orden revertida**: queda para Julio, sin
  resolver (tu punto 7).
- **Los `prompt` / `confirm` / `alert` que quedan**: van en la siguiente cola.
- **El interruptor de embarque automático**: apagado.

## 4 · Síntoma → causa

| Síntoma | Causa más probable |
|---|---|
| Una sola cifra que suma cliente y proveedor | los totales dejaron de ir por lado (§4.3) |
| El total del pago aparece en dos embarques | `entradasDelEmbarque` volvió a leer `p.monto` — **bloqueante** |
| Un pago heredado se deja anular | el guard de `origen !== 'app'` no está llegando |
| Al anular, las órdenes no vuelven a Programación | la máquina de estados rechazó el arco; el toast dice cuál |
| «Sin estatus» en más de cero | **no es un bug**: son clientes que estaban invisibles |

---

## Dos cosas que te debo de este bloque

**1 · La «cuenta de salida con aviso si va vacía» no se construyó.** Tu
decisión 4 tenía dos mitades: *opcional* y *con aviso*. La primera está —el
selector trae «Sin indicar» y `problemasDelFormulario` no la exige—, la
segunda no: si la dejas vacía, el pago se guarda sin decir nada. Es un
renglón de interfaz. No lo agregué después del deploy por no meter un cambio
sin que lo vieras; dime y entra en el próximo tren.

**2 · El «TODO O NADA» de la anulación no es del todo cierto.** El comentario
de `Finance.anularPagoDeProveedor` dice que si una orden no puede regresar no
se anula el pago ni se toca ninguna. Lo que hace el código:
`planAnulacionProveedor` **sí** valida el arco de **todas** las órdenes antes
de escribir —y eso cubre lo predecible: rol, estado, orden que ya no existe,
pago heredado—, pero después el pago se anula **primero** y las órdenes se
revierten en un bucle. Si una falla ahí (red, alguien editando a la vez), el
pago ya quedó anulado y las anteriores ya regresaron.

No es silencioso: el toast nombra cuáles no pudieron regresar, así que cae
del lado bueno de «un guardado que falla en silencio es peor» (§3). Pero la
promesa del comentario es más fuerte que la garantía real, y si esto se
convierte en una transacción algún día, ese comentario es el que hay que
creerle. Lo dejo anotado, sin tocar.
