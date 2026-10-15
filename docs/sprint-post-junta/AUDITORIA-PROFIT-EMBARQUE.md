# Auditoría — profit real por embarque: qué hay y qué falta (tarea 117)

15-oct-2026. Solo lectura de código y una corrida de las funciones reales sobre
un caso armado a mano. **Cero cambios de código, de reglas o de modelo.**
Punto 6 de Mau. Todo lo que dice «medido» salió de ejecutar el código del repo
(`npx tsx`, sin Firestore y sin llaves); lo demás es lectura, con archivo y línea.

---

## 0. Resumen en diez líneas

1. **El profit real por embarque ya existe, por moneda, en la ficha**:
   `margenDelEmbarque` (`lib/margenRealConcepto.ts:323`) → Resumen Financiero
   (`FichaEmbarque.tsx:1504`) y, por concepto, `TablaUnificadaCargos`.
2. **Costo y venta no tienen la misma firmeza.** El costo sube de estimado →
   facturado → pagado según la OC; **la venta es siempre `cargo.monto`**, nunca
   «lo facturado» ni «lo cobrado».
3. **No hay un profit en una sola moneda.** El código separa USD y MXN y no
   convierte venta contra costo (solo convierte el costo de la OC a la moneda
   del cargo). Un concepto que se cobra en USD y se paga en MXN produce dos
   filas, una con venta sin costo y otra con costo sin venta (§3.3).
4. **El «pagado» no lee el pago.** Lee `oc.estado === 'pagada'` y usa
   `oc.monto`, que se copió del cargo al crear la orden. No mira `pagos/`, ni la
   factura del proveedor (§2.2).
5. **La cadena cargo → OC → factura proveedor → pago se rompe en cuatro
   sitios**, todos sin modelo nuevo para detectarlos y dos para arreglarlos (§2).
6. **La cadena cargo → factura al cliente → cobro es la más sana**: la marca vive
   en la línea (`facturaId`), el cobro cuelga de la factura y el saldo se deriva.
   Se rompe en una sola cosa: nada une la **venta cobrada** con el profit (§2.4).
7. **Se puede armar HOY, sin modelo nuevo**, un reporte de profit por embarque
   por moneda con tres columnas de firmeza (§4). Lo que falta pide decisiones de
   negocio o campos opcionales (§5).
8. **El seed no sirve para un ejemplo de punta a punta**: 0 de 15 gastos tienen
   proveedor, 0 conceptos en las 8 cotizaciones (§3.1). El ejemplo de §3.2 es
   un caso armado, corrido con las funciones reales y marcado como tal.
9. **Hallazgo de integridad:** un gasto con orden de compra se puede quitar del
   embarque; la orden queda huérfana y sale del profit (§2.3, R-1).
10. **Lo más barato y más valioso:** hacer que «pagado» lea el `Pago` (R-2) y que
    la factura del proveedor llegue a todas las órdenes que cubre (R-3).

---

## 1. De dónde sale cada número hoy

Para un embarque, los seis números que pidió Mau:

| Número | De dónde sale | Archivo:línea | Firmeza |
|---|---|---|---|
| **Venta cotizada** | Línea de venta de la cotización → cargo `tipo: 'ingreso'`, `monto` | `cotizacionAEmbarque.ts:199` (`cargosDeLinea`) | Se hereda al ganar; después editable por Operaciones |
| **Costo cotizado** | Un cargo `tipo: 'gasto'` por COMPONENTE de costo; el importe con el que nació queda en `montoHeredado` la primera vez que se edita | `cotizacionAEmbarque.ts:238`; `cargosEditables.ts:61` (`montoOriginal`), `:198` (`editarMontoCargo`) | Estimado |
| **Costo real — corregido a mano** | `cargo.monto` cuando `montoHeredado` existe | `margenRealConcepto.ts:182` (`corregido`) | «facturado» (nombre engañoso: nadie lo facturó) |
| **Costo real — facturado** | `oc.facturaDatos.subtotal` (antes de IVA) convertido a la moneda del cargo | `margenRealConcepto.ts:211-226` | Facturado |
| **Costo real — pagado** | `oc.monto` si `oc.estado === 'pagada'` | `margenRealConcepto.ts:199-208` | Pagado |
| **Venta facturada** | `FacturaCliente.lineas[].subtotal` por `cargoId`; la marca `cargo.facturaId` | `facturacionEmbarque.ts:50`; `FichaEmbarque.tsx:1633` | **No entra al profit** |
| **Venta cobrada** | `Pago.aplicaciones[]` contra la factura; `saldoDeFactura` | `facturacionEmbarque.ts:257`; `pagos.ts` (`aplicacionesA`) | **No entra al profit** |
| **Profit por tipo de cambio** | `embarque.tipoCambio.valor`, heredado de la cotización al nacer | `generacionEmbarque.ts:176`; `FichaEmbarque.tsx:530` | Solo convierte OC→cargo (§3.3) |

Cómo se arma el profit que se ve (`margenDelEmbarque`, `:323-363`), por moneda:

    venta  = Σ cargo.monto  de los INGRESOS de esa moneda
    costo  = Σ costoDeCargo(gasto).costo   (estimado | facturado | pagado)
    profit = venta − costo
    margen = profit / venta                (null si venta = 0)
    estado = el MENOS firme de los gastos de esa moneda

Tres reglas del cálculo que conviene tener presentes porque explican números que
parecen raros:

- **El estado es el peor de sus gastos.** Un embarque con cinco gastos pagados y
  uno sin orden se reporta «estimado» (medido, §3.2, paso 3).
- **«Pagado» manda sobre «facturado»** (`:199` antes que `:211`): con la orden
  pagada, la factura del proveedor ya no se consulta.
- **Una corrección al cargo no mueve el costo si la orden ya está pagada**; solo
  se reporta como `desfaseOC` (`:176`, medido en §3.2 paso 4).

Los avisos que el cálculo sabe dar en vez de comparar mal:
`factura_con_iva` (sin subtotal), `factura_compartida` (una factura cubre varias
órdenes) y `sin_tipo_cambio`. `subtotal` ya lo escriben las dos vías de factura
(`documentosEmbarque.ts:241` y `CargarFacturaOC.tsx:89`), así que
`factura_con_iva` hoy solo sale con facturas viejas.

---

## 2. Las cuatro cadenas y dónde se rompen

### 2.1 Cadena de costo: cargo → OC → factura del proveedor → pago

```
cargo.gasto ──ordenCompraId──▶ OC ──facturaDatos / facturaArchivos──▶ factura prov.
     │                          │
     └─facturaProveedorId──▶ documento del embarque      OC ──comprobantePago / Pago.aplicaciones──▶ pago
```

Los eslabones y su dirección:

| Eslabón | Vive en | Dirección | Observación |
|---|---|---|---|
| cargo → OC | `CargoDetalle.ordenCompraId` (`EmbarquesData.ts:143`) | Solo cargo → OC | **La OC no sabe de qué cargo nació.** Ni `cargoId` ni lista de cargos en `OrdenCompra`: `construirOCDesdeCargo` copia concepto, proveedor, monto y moneda y ahí termina el vínculo (`ocDesdeCargo.ts:96`). El vínculo inverso se reconstruye buscando el cargo con `ordenCompraId === oc.id`. |
| cargo → factura prov. | `CargoDetalle.facturaProveedorId` (`:176`) | Cargo → documento | Es el id del **documento** subido al embarque, no de una entidad «factura de proveedor». |
| OC → factura prov. | `OC.facturaDatos` + `facturaAsociada` + `facturaUUID` | OC → datos copiados | Número, total, **subtotal**, IVA, moneda, `documentoId`. |
| OC → pago | `OC.comprobantePago` (texto) y, desde P6, `Pago.aplicaciones[]` (`pagoQueCubrio`) | Pago → OC | Un pago cubre N órdenes; la OC lo averigua por derivación. |

**Dónde se rompe, de más a menos dañino para el profit:**

**R-1 · Un gasto con orden se puede quitar** (medido por lectura, §2.3).
`handleDeleteCargo` (`FichaEmbarque.tsx:386`) filtra el cargo sin mirar
`ordenCompraId` ni `facturaProveedorId`; el botón de la tabla solo se oculta si
`facturaId` (la factura **al cliente**) existe (`TablaUnificadaCargos.tsx:549`,
tomando `facturado = !!cargo.facturaId`, `:517`). Un gasto con OC o con factura
de proveedor se borra sin aviso: la orden sigue viva con `embarqueId`, **sale del
profit** (que se calcula desde los cargos) y entra al cierre administrativo
como «orden sin pagar» (`cierresEmbarque.ts:130`), así que alguien la ve
pendiente sin poder encontrar a qué concepto pertenece.

**R-2 · «Pagado» no lee el pago.** `costoDeCargo` pregunta por
`oc.estado === 'pagada'` y usa `oc.monto` (`:199-200`). Tres consecuencias:
(a) lo que muestra como costo pagado es el **monto del cargo al pedir la orden**,
no lo que salió del banco ni lo que dice la factura; (b) si la factura del
proveedor difiere del monto de la OC —el motivo mismo de conciliar—, el costo
sigue siendo el de la OC cuando se paga; (c) `pagos/` (con folio `PAG-…`, fecha
real, cuenta y referencia) existe pero **no entra al margen**. El estado
«pagado» es cierto; el número que lo acompaña no es el pagado.

**R-3 · Una factura de proveedor llega solo a UNA orden.** La conciliación marca
**todos** los cargos del proveedor con `facturaProveedorId` pero precarga la
factura en **una** OC: `ocParaPrecargar` devuelve la primera sin `facturaDatos`
(`conciliacionFactura.ts:213`). Con dos órdenes del mismo proveedor y una factura
(el caso normal, §4.14 «un proveedor emite UNA factura»), una orden trae el
`subtotal` y el `total` de **toda** la factura y la otra no trae nada. El cálculo
lo detecta con `factura_compartida` (medido: §3.2, paso 2) y **se rinde**: no
compara. Es correcto y deja al embarque sin costo facturado hasta que se pague.

**R-4 · Una orden sin cargo no se ve; un cargo sin orden, sí.** Hoy no hay forma
de crear una OC con `embarqueId` sin pasar por un cargo
(`createOrden` se llama solo desde `FichaEmbarque.tsx:363` y `Finance.tsx:558`;
esta última es `NuevaOCOficina`, origen oficina, sin embarque). La huérfana solo
nace por R-1. En sentido contrario, un gasto sin orden se reporta
(`cierresEmbarque.ts:151`: «N gastos sin orden de compra»), pero solo en el
cierre administrativo; el profit no lo marca, simplemente lo deja «estimado».

También en esta cadena, dos hallazgos menores:

- **OC.monto no es lo cobrado por el proveedor si cambia el cargo después.** El
  desfase se reporta (`desfaseOC`) pero solo en la tabla de cargos; el Resumen
  Financiero no lo menciona.
- **Gasto sin proveedor** no puede volverse orden (`puedeConvertirse` →
  `sin_proveedor`, `ocDesdeCargo.ts:49`) y se queda estimado para siempre. En el
  seed son **15 de 15** (§3.1); en producción depende de que la tarifa traiga
  `proveedorId`.

### 2.2 Qué dice «pagado» y qué dice el banco

```
margen.pagado   = oc.monto            (copia del cargo, pre-IVA)
factura.subtotal= lo que cobró el proveedor antes de IVA
Pago.monto      = lo que salió del banco (puede incluir IVA y anticipos cruzados)
```

Tres cifras distintas para «lo que costó». El margen usa la primera. La segunda
es la correcta para el profit; la tercera lo es para flujo de efectivo (P8). Hoy
no hay ninguna alarma cuando la primera y la segunda divergen **después de
pagar**, que es cuando ya no se puede negociar.

### 2.3 Cadena de venta: cargo → línea de factura al cliente → cobro

```
cargo.ingreso ──facturaId──▶ FacturaCliente.lineas[cargoId] ──aplicaciones──▶ Pago (lado: cliente)
```

Esta es la cadena sana, y por la misma razón que la de costo está bien pensada en
el código y mal en el vínculo inverso:

- **La marca vive en la línea** (`facturaId`, `EmbarquesData.ts:168`): una línea no
  puede estar en dos facturas. La UI bloquea editar y quitar un ingreso
  facturado (`TablaUnificadaCargos.tsx:464`, `:549`).
- **`LineaFactura.cargoId`** (`FacturasData.ts:17`) da el camino de regreso:
  de la factura al cargo. Esto es lo que a la OC le falta.
- **Cancelar una factura libera sus líneas** (`FichaEmbarque.tsx:1650`).
- **El saldo se deriva** (`saldoDeFactura`, `facturacionEmbarque.ts:257`), con
  solo cobros de la moneda de la factura y tolerancia de un peso.
- **Dónde se rompe:** (a) el profit usa `cargo.monto` aunque la línea facturada
  haya salido con otro subtotal por redondeo o retención —hoy no se compara—; (b)
  una línea con `avisoIVA` (sin ubicación derivable) se registra con IVA 0 y la
  factura sale «sin IVA derivado»: no cambia el subtotal, pero sí el total que
  el cliente debe; (c) el ingreso facturado en una moneda y cobrado en otra
  queda como «cobro en otra moneda» y **no cuenta** (§4.3, correcto), así que el
  profit en caja de ese embarque nunca se cierra.
- **Lo que falta no es la cadena, es el último eslabón:** «cobrado» no se
  traduce a un estado del ingreso en el margen. Un embarque con toda la venta
  facturada y nada cobrado se ve igual que uno cobrado entero.

### 2.4 Tabla resumen de eslabones

| Eslabón | Existe | Se rompe cuando | Se detecta hoy |
|---|---|---|---|
| gasto sin orden | sí | nadie pide el pago | Cierre administrativo (`:151`) |
| orden sin cargo | no nace sola | se quita el cargo (R-1) | No |
| orden con monto ≠ cargo | sí | se corrige el cargo después | `desfaseOC` en tabla |
| orden sin factura prov. | sí | el proveedor no ha facturado | Estado «estimado»; prefactura (74) si está marcada |
| factura con varias órdenes | sí | 2 OCs del mismo proveedor (R-3) | `factura_compartida` |
| orden pagada con otro monto que la factura | sí | siempre que difieran | **No** (R-2) |
| factura al cliente sin cargo | no nace sola | cargo sin `facturaId` tras cancelar | Cierre de pago (`:106`) |
| cargo facturado sin cobro | sí | cliente no paga | Cierre de pago (`:117`) |
| cobro sin factura (anticipo) | sí | anticipo a cuenta | Sí: fondea, no cobra |

---

## 3. Con números: el seed y un caso de punta a punta

### 3.1 Qué da el seed (medido)

`initialEmbarquesCompletos` (`EmbarquesData.ts:657`) y `initialKanbanQuotes`
(`QuotesData.ts:808`), contados con un script que no toca Firestore:

| | Cuenta |
|---|---|
| Embarques de ejemplo | 9 |
| Cargos de gasto / de ingreso | 15 / 11 |
| Gastos con `proveedorId` | **0** |
| Gastos con `ordenCompraId` o `facturaProveedorId` | 0 |
| Ingresos con `facturaId` | 0 |
| Embarques con `tipoCambio` | 0 |
| Cotizaciones de ejemplo / servicios | 8 / 13 |
| Conceptos dentro de esos servicios | **0** |

Y **la colección de embarques no se siembra** (`useEmbarques.ts` lo dice, §3):
esos nueve nunca llegan a Firestore. Dos conclusiones, y la segunda es una
contradicción con lo que se pudiera asumir:

- Con el seed no se puede recorrer la cadena: no hay proveedor, no hay conceptos
  ni orden que seguir. Un ejemplo de punta a punta exige **armar** los datos.
- «Cuenta de verdad contra el seed» no es posible sin inventar un catálogo, y
  §3 de CLAUDE.md lo prohíbe. El ejemplo de abajo es un **caso armado a mano con
  las funciones reales**, con proveedores `A` y `B` sin nombre, para ver cómo se
  comporta el cálculo, no para decir cuánto gana un embarque.

### 3.2 Un embarque armado, corrido por las funciones reales

Cargos: ingresos USD 1,700 (flete) y MXN 3,000 (maniobras); gastos USD 1,500
(flete, prov. A), USD 150 (origen, prov. A), MXN 2,000 (maniobras, prov. B) y
USD 100 (seguro, **sin proveedor**). Órdenes creadas de los tres con proveedor.
Corrida de `margenDelEmbarque` en cuatro momentos:

| Paso | USD venta / costo / **profit** / estado | MXN venta / costo / **profit** / estado | Avisos |
|---|---|---|---|
| 1 · recién nacido | 1,700 / 1,750 / **−50** / estimado | 3,000 / 2,000 / **1,000** / estimado | — |
| 2 · factura de A conciliada (la recibe solo oc1: subtotal 1,650, total 1,914) | 1,700 / 1,750 / **−50** / estimado | 3,000 / 2,000 / **1,000** / estimado | `factura_compartida` |
| 3 · las tres órdenes pagadas | 1,700 / 1,750 / **−50** / **estimado** | 3,000 / 2,000 / **1,000** / **pagado** | — |
| 4 · se corrige maniobras 2,000 → 2,300 con la orden ya pagada | igual | 3,000 / **2,000** / 1,000 / pagado | 1 desfase |

Lo que enseña, en ese orden:

- **Paso 2:** con la factura de A en el sistema, el costo de A **no** pasó a
  «facturado» y el profit no se movió: R-3. La factura trae 1,650 y la
  cotización decía 1,650 (1,500 + 150); no hay nada que comparar, pero el
  sistema tampoco lo puede decir porque una orden lleva el subtotal total y la
  otra nada.
- **Paso 3:** USD queda «estimado» aunque dos de sus tres gastos están
  pagados; el tercero es el seguro sin proveedor. El estado dice la verdad; la
  ficha no dice **cuál** concepto lo está deteniendo.
- **Paso 4:** la corrección de 300 pesos **no mueve el profit** porque la orden
  ya está pagada en 2,000. La ficha lo dice (desfase), el Resumen no.
- **Siempre:** USD −50 y MXN +1,000 son dos profits, no uno. No hay renglón que
  diga «el embarque ganó X». Ver §3.3.
- **Factura al cliente (control):** una factura USD de 1,700 con cobros de 1,000
  y 700 da `{ cobrado: 1700, saldo: 0, estado: 'cobrada' }`: la cadena de venta
  funciona, pero ese «cobrada» no se refleja en el profit.

### 3.3 Por qué no hay «un profit»: monedas y tipo de cambio

`margenDelEmbarque` agrupa por la moneda **del cargo**. El tipo de cambio del
embarque (`embarque.tipoCambio`, heredado de la cotización, corregible en
`FichaEmbarque.tsx:1556`) solo se usa para convertir **el importe de la OC o de
la factura a la moneda del cargo** (`aMonedaDelCargo`, `:136`). No se usa para
poner venta y costo en una misma moneda.

El caso real que motivó el Plan A (AMS y flete terrestre con costo en MXN y
venta en USD) produce, en el embarque, un ingreso USD y un gasto MXN en el mismo
concepto: **dos filas**, una con venta y sin costo (margen 100 %) y otra con costo
y sin venta (profit negativo). Sumado por moneda es correcto (§4.3) y ninguna de
las dos filas es el resultado del concepto.

Además, hay **tres tipos de cambio** en juego y el sistema solo conoce uno:

| TC | Para qué | Dónde está |
|---|---|---|
| Operativo (Pricing) | cotizar y medir profit | `embarque.tipoCambio` (heredado, §4.3) |
| Fiscal (DOF) | la factura al cliente | Solo en el módulo Tipo de cambio; **no se guarda en `FacturaCliente`** |
| De la fecha de pago/cobro | utilidad cambiaria realizada | **No existe** |

No hay profit «por tipo de cambio» en el sentido de ganancia/pérdida
cambiaria. Lo que hay es el costo convertido con el TC operativo para poder
compararlo con lo cotizado.

---

## 4. Qué se puede armar HOY sin modelo nuevo

**Reporte «Profit por embarque»**, una fila por embarque y moneda, calculado al
vuelo desde `embarques`, `ordenesCompra`, `facturas` y `pagos` (todo ya se lee en
la tienda compartida de Finanzas, §4.52):

| Columna | Fuente existente |
|---|---|
| Embarque, cliente, tráfico, mes de cierre | `traficoEmbarque.ts`, `clienteCobrar` |
| Venta cotizada | Σ ingresos con `montoOriginal` |
| Venta facturada | Σ `FacturaCliente.lineas[].subtotal` vivas, por moneda |
| Venta cobrada | Σ aplicaciones de `Pago` a esas facturas (`aplicacionesA`) |
| Costo cotizado | `margenDelEmbarque().cotizado` |
| Costo real y su firmeza | `margenDelEmbarque().costo`, `.estado`, `.avisos` |
| Excedente sobre lo cotizado | `.excedente` |
| Profit y margen | `.profit`, `.margen` |
| Qué lo detiene | derivable: el cargo menos firme y su motivo |
| Desfases | `.desfases` |

Se arma con `margenDelEmbarque` sin modificarlo, `sumarPorMoneda` para los
totales y el patrón de `SpreadsheetTable` con vistas guardables que ya usan
Embarques y Finanzas (§4.27). **No necesita campo nuevo**, y no mezcla monedas:
una fila por moneda, como hoy. Se puede exportar a CSV con
`lib/exportarVista.ts`.

Lo que **no** puede dar sin trabajo adicional: un profit consolidado en una sola
moneda (§5, C-1), el profit en caja (cobrado − pagado, §5, C-2) y la utilidad
cambiaria (§5, M-3).

---

## 5. Lo que falta, en pasos publicables

Cada paso es independiente y revierte quitando su commit. Los marcados **(M)**
piden modelo y van **para aprobación de Mau**; el resto no.

### Sin modelo

| Paso | Qué | Por qué | Toca |
|---|---|---|---|
| **A-1** | **Guarda en «quitar cargo»:** no se quita un gasto con `ordenCompraId` ni con `facturaProveedorId`; se dice cuál orden o factura lo ancla. | R-1: evita huérfanos. | Hosting |
| **A-2** | **«Pagado» lee el `Pago`.** El costo pagado sale de la aplicación del pago a la OC (monto y fecha), con `oc.monto` como respaldo para las órdenes anteriores a P6. Se reporta si pagado ≠ factura.subtotal. | R-2. Es el cambio de mayor valor. | Hosting |
| **A-3** | **La factura llega a todas las órdenes que cubre**, repartiendo el subtotal entre ellas, o se reconoce la factura compartida con su total y se compara contra la SUMA de las órdenes del proveedor. | R-3. | Hosting |
| **A-4** | **El Resumen Financiero dice qué lo detiene:** «Estimado por: Seguro (sin proveedor)» y los desfases. | §3.2 paso 3 y 4. | Hosting |
| **A-5** | **Reporte «Profit por embarque»** en Finanzas (§4). | Lo pedido. | Hosting |
| **A-6** | **Aviso de venta distinta:** si el subtotal de la línea facturada ≠ `cargo.monto`, marca el cargo. | §2.3 (a). | Hosting |

### Con modelo — **para aprobación**

| Paso | Qué | Campos (todos opcionales y aditivos) |
|---|---|---|
| **M-1** | La OC sabe de qué cargo nació. | `OrdenCompra.cargoId?: string \| null`. Se lee con respaldo: si falta, se busca el cargo con `ordenCompraId === oc.id`. No se migra nada. Cierra R-1 y R-4 de raíz y permite detectar huérfanas con un script en seco. |
| **M-2** | Moneda de reporte del embarque para el profit consolidado. | `EmbarqueCompleto.monedaReporte?: 'MXN' \| 'USD'`. Con el TC operativo ya heredado, `margenDelEmbarque` ganaría una fila «Consolidado» **declarada** (con el TC a la vista, §4.3 «convertir para comparar»). Sin TC, no hay fila. |
| **M-3** | El TC fiscal de la factura y el de la fecha de cobro. | `FacturaCliente.tipoCambio?: { valor, fecha, fuente }` (el DOF del día anterior, §4.3) y `Pago.tipoCambio?` para la utilidad cambiaria realizada. Hoy el TC fiscal se muestra pero no se guarda. |
| **M-4** | Venta cobrada como estado del ingreso en el profit. | Ninguno: se deriva. Va aquí porque pide decisión de negocio (C-2). |

---

## 6. Preguntas

**Para Mau**

1. **¿A-1 va antes que el reporte?** Es la única que protege dato real hoy: cada
   gasto con orden que alguien quite deja una orden sin concepto y un profit que
   cambió sin aviso. Recomendación: sí, primero A-1.
2. **¿A-2 reemplaza el costo pagado o lo acompaña?** Si el `Pago` y la OC
   difieren, ¿manda el pago? Recomendación: manda el pago, y la ficha dice «la
   orden decía X».
3. **¿Se aprueba M-1 (`cargoId` en la OC)?** Recomendación: sí; es un campo
   opcional y permite cerrar R-4 con un script en seco antes de tocar nada.
4. **¿Se aprueba M-2 (profit consolidado con TC declarado)?** Es lo que más
   cambia cómo se lee el embarque y toca §4.3. Recomendación: sí, siempre con la
   fila por moneda al lado y el TC visible.
5. **El estado «facturado» de un cargo corregido a mano** (`margenRealConcepto.ts:182`)
   significa «corregido», no «facturado». Recomendación: renombrar el estado en la
   etiqueta (tarea aparte).

**Para Vermur (Julio / Gaby)**

6. «Costo real» de un concepto, ¿es el **subtotal de la factura del proveedor**
   (antes de IVA) o **lo que se pagó**? Si el proveedor factura 1,650 y pagan 1,914
   con IVA, ¿cuál es el costo del embarque? (Recomendación: el subtotal; el IVA se
   acredita.)
7. ¿El profit del mes se mide **al facturar** (venta facturada − costo
   facturado) o **al cobrar** (cobrado − pagado)? Hoy el sistema mide al cotizar
   y ajusta cuando hay factura o pago.
8. Cuando una operación se cobra en USD y se paga en MXN, ¿qué tipo de cambio
   cuenta para su utilidad: el de Pricing al cotizar, el del DOF de la factura o
   el del día del cobro? ¿Quieren ver la utilidad cambiaria por separado?
9. ¿Un embarque puede cerrarse con gastos «estimados» (sin orden)? Hoy el cierre
   administrativo lo bloquea; el profit no.

---

## 7. Hallazgos fuera de la tarea, sin tocar

- `handleDeleteCargo` no valida el cargo que recibe (R-1); el botón de la
  fila sí oculta «quitar» en ingresos facturados, y `FichaEmbarque.tsx:1321`
  (tabla vieja) muestra «quitar» sin ninguna condición.
- `ocParaPrecargar` toma «la primera sin factura», no la que corresponde al
  monto: con dos órdenes del mismo proveedor, la factura puede caer en la
  equivocada (`conciliacionFactura.ts:213`).
- El número que se guarda en `facturaDatos` desde un XML es `uuid.slice(0, 8)`
  (`CargarFacturaOC.tsx:92`), no el folio del CFDI; `facturasProveedor.ts` lo
  usa para agrupar facturas y dos CFDI con el mismo prefijo de 8 caracteres
  se leerían como la misma factura dentro de un proveedor (improbable, no
  imposible).
- La nota de §4.40 sobre `getCostoOficial` (suma sin mirar moneda) sigue en
  pie; el mapeo emite `monedas_mezcladas` pero el costo guardado en cotizaciones
  viejas no se corrigió.
- Los embarques de `initialEmbarquesCompletos` quedan como dato muerto de
  demostración con `SHP-26-…`; ningún test los usa para el margen.

---

## 8. Cómo se midió (reproducible, sin llaves)

Ambos scripts son desechables y **no se versionan**; corren con `npx tsx` desde
la raíz y solo importan funciones puras del repo.

- Conteo del seed: importa `initialEmbarquesCompletos` e `initialKanbanQuotes` y
  cuenta cargos, proveedores, órdenes, facturas y conceptos.
- Caso de §3.2: arma seis cargos a mano, los pasa por `puedeConvertirse`,
  `marcarCargoConOrden`, `editarMontoCargo`, `margenDelEmbarque` y
  `saldoDeFactura`, con el mapa de órdenes que correspondería a cada paso.

Salida de §3.2, copiada tal cual:

```
## 1  {"m":"USD","venta":1700,"cot":1750,"costo":1750,"profit":-50,"estado":"estimado"}
      {"m":"MXN","venta":3000,"cot":2000,"costo":2000,"profit":1000,"estado":"estimado"}
## 2  {"m":"USD",…,"profit":-50,"estado":"estimado","avisos":["factura_compartida"]}
## 3  {"m":"USD",…,"profit":-50,"estado":"estimado"}  {"m":"MXN",…,"estado":"pagado"}
## 4  {"m":"MXN","venta":3000,"cot":2000,"costo":2000,"profit":1000,"estado":"pagado","desf":1}
## factura al cliente  { cobrado: 1700, saldo: 0, estado: 'cobrada' }
```

Límite honesto de esta auditoría: no se ejecutó nada contra Firestore, así que
**cuántos gastos reales tienen proveedor, orden o factura en producción** no se
sabe. Un script de solo lectura (`scripts/auditarProfitEmbarques.ts`, en seco, lo
corre Mau con su llave) que cuente los eslabones rotos de §2.4 sobre los
embarques vivos es el primer paso de A-1 y A-2, y no está escrito.
