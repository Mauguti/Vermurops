# Previa de la junta con Julio — Administración

Análisis contra el código, sin tocar nada. Referencia: la minuta validada
`docs/levantamientos/LEVANTAMIENTO-ADMINISTRACION.md`.

**No tengo acceso a producción.** Todo lo de aquí sale del modelo y del código.
Donde hace falta el dato real está marcado **[script]**: lo saca
`scripts/inventarioDatosPrueba.ts`, que corre Mau con su llave.

---

## 1. Inventario de reportes

| Reporte | Veredicto | De dónde sale |
|---|---|---|
| Embarques por etapa | **Sale hoy** | `embarques` · `lib/estadoEmbarque.ts` deriva Nuevo/Cargado/En tránsito/En destino/Entregado |
| Cotizaciones ganadas y perdidas con motivo | **Sale hoy** | `cotizaciones.estadoFinal` y `motivoPerdida`, ya capturado en el pie de la ficha |
| IVA **trasladado** (lo que Vermur cobra) | **Sale hoy** | `facturas` — cada línea trae `tasaIVA` y `montoIVA`, y el total `subtotal/iva/retencion/total` por moneda |
| Cuentas por cobrar con **antigüedad de saldos** | **Con un cálculo** | `lib/cuentasPorCobrar.ts` ya deriva de `facturas` + `cobros` y tiene `diasEntre`, pero clasifica en cuatro estados, no en cubetas de 1-30 / 31-60 / 61-90 / +90 |
| Cuentas por pagar y **calendario de la semana** | **Con un cálculo** | `ordenesCompra` + `PanelPagos`. Falta la regla de días hábiles y el recorrido a lunes (§2.2 de la minuta) |
| **Profit** por embarque y por concepto | **Con un cálculo** | `embarques.cargos.detalles` con costo/profit/venta, y `lib/margenRealConcepto.ts` ya distingue estimado / facturado / pagado. Falta sumarlo al nivel embarque y exponerlo |
| **Margen por cliente y por agente** | **Con un cálculo** | Lo mismo, agrupando por `entidades.clienteCobrar` y por proveedor. **Ojo §4.3:** por moneda, nunca un escalar |
| IVA **acreditado** (lo que Vermur paga) | **NO sale** | `ordenesCompra.facturaDatos` guarda `total` y `subtotal?`, **y nada de IVA**. No hay de dónde sacarlo |

### Los dos que piden decisión

**IVA acreditado — el que no sale.** La factura del proveedor no tiene campo de
IVA. Y esto no es un hueco de reporte: es el dolor de §2.6 de la minuta, donde
Julio revisa **a mano, todos los días**, que el IVA de cada factura física
coincida con lo capturado, porque *«Magaya no está con el IVA aplicado»*. Sin el
campo no hay ni reporte ni validación automática.

Lo que haría falta: `facturaDatos.iva`, `facturaDatos.retencion` y
`facturaDatos.tasa`, aditivos y opcionales. El clasificador de documentos ya lee
la factura del proveedor, así que el dato puede venir de ahí en vez de
teclearse. **Es cambio de modelo: no lo toco.**

**Antigüedad de saldos.** Las cubetas no existen porque nadie las pidió hasta
ahora. Es cálculo derivado, sin modelo nuevo. Falta decidir los cortes —30/60/90
es lo habitual— y si la antigüedad se cuenta desde la emisión o desde el
vencimiento. **[script]** cuántas facturas hay y con qué antigüedad real.

---

## 2. Programación de pagos contra Cuentas por pagar — para Julio

1. **No son la misma pantalla y no muestran lo mismo.** «Programación de pagos»
   es lo que se transfiere hoy; «Cuentas por pagar» es todo lo que existe.
2. **Programación** (`PanelPagos`) solo trae las órdenes en estado
   **autorizada**, agrupadas por proveedor y fecha de pago. Es el sustituto del
   Excel.
3. **Cuentas por pagar** (`BandejaOC`) trae **todas** las órdenes en cualquier
   estado, con filtros y búsqueda. Es la bandeja de trabajo.
4. **Por eso Programación salía vacía:** las órdenes nacen `solicitada`, pasan
   por `en_gestion` y solo entonces llegan a `autorizada`. Al arrancar no había
   ninguna, y la pantalla no explicaba por qué. Ahora dice qué va a aparecer ahí
   y cuántas órdenes hay en curso que todavía no llegan.
5. **Las dos se quedan** (decisión de Mau, 1-oct).

### Qué cambia con la minuta

El paso diario de §2.1 tiene **diez pasos** y la pantalla hoy cubre el 1 y el 5.
Los que faltan son los que duelen: descargar a Excel (2 y 3) existe **solo
porque el sistema no entrega el formato de la banca**; agrupar por proveedor (6)
sí está; capturar cuenta de salida y fecha (8), adjuntar comprobante (9) y
mandarlo por correo detallando folios (10) **no**.

Y la minuta agrega tres cosas que el panel todavía no contempla:

- **Tres orígenes**, no uno: pagos fijos, pagos capturados a mano por los
  ejecutivos, y lo que baja del sistema. El horizonte llega a **febrero de 2027**.
- **Reglas por proveedor**: Oñate solo viernes; Aseguranza Peninsular consolidado
  a principios del mes siguiente.
- **La fecha calculada es una sugerencia**: hay pagos anticipados pese a tener
  crédito —el proveedor no libera el BL— y hay que contar el reflejo bancario.

---

## 3. Modelo de cliente y proveedor

### Lo que existe hoy

| | Cliente | Proveedor |
|---|---|---|
| Identificación | `rfc?`, `razonSocial`, `codigoPostal?` | `nombre`, RFC en `rfc` o en `numeroEntidadMagaya` |
| **Régimen fiscal** | **no existe** | **no existe** |
| Clasificación | `statusOperativo: ACTIVO/INACTIVO` | `tipos[]`: proveedor · transportista · agente_carga · agente_aduanal |
| Crédito | `dias` (número único) · `diasCreditoPorTipo?` · `limiteCreditoMXN?` | `diasCredito` por modalidad |
| Expediente | `docsAlta` (acta, poder, identificación, CSF, comprobante, bancaria) · `expedienteValidado?` · `origenDatos` | — |
| Dualidad | — | `esTambienCliente` |

### Lo que falta para el flujo de aprobación

1. **Régimen fiscal y código postal validados.** La minuta es tajante: *«el SAT
   te pide código postal, régimen, razón social; si no coincide no te deja
   timbrar»*. `codigoPostal` existe y **`regimenFiscal` no**. Sin él no se puede
   validar el alta contra la Constancia. **[script]** cuántos clientes tienen CP.
2. **El proveedor no tiene expediente.** `docsAlta` y `expedienteValidado` son
   solo del cliente. La minuta pone el alta formal de proveedor en
   Administración, con el mismo checklist.
3. **Los subtipos de proveedor se quedan cortos.** La minuta lista nueve
   —naviera, aerolínea, transportista, agente de carga, aduanal, almacén,
   maniobras, terminal y seguros— y `TipoProveedor` tiene cuatro.
   **[script]** cuántos proveedores no tienen ningún tipo asignado.
4. **«Probable proveedor» no está modelado.** La minuta lo define —Pricing lo
   registra con solo el nombre, Administración completa el expediente— y
   PLAN-APROBACION lo retoma. Hoy no hay estado que lo distinga; el prefijo «Z»
   del nombre es el apaño que usa Vermur. **[script]** cuántos lo traen.

### Cruce con PLAN-APROBACION

La regla que me diste —**todos dan de alta, solo Administración y admin validan
el expediente**— coincide con la minuta (§5) y con lo que ya existe para el
cliente: `exigirExpediente` y el salto de admin con justificación obligatoria
(§4.18). **Lo que el plan agrega y hoy no existe** es que esa misma regla valga
para el proveedor, y el freno en la **autorización de la OC** —no en ganar ni en
generarla— que ya quedó aprobado en las recomendaciones 1 a 5.

### El comando del inventario

Le agregué una sección de expediente: clientes con RFC, con código postal, de
Magaya, validados y con días por modalidad; y proveedores sin tipo, por tipo y
sin RFC. Escribe además `inventario-5-expediente.csv`. Sigue siendo solo
lectura: seis `.get()`, ni un `set`, `update`, `delete` ni `batch`.

```bash
cd /Users/mauriciogutierrezmunoz/antigravity/Vermur-Logistics && SERVICE_ACCOUNT=/ruta/a/tu/serviceAccountKey.json npx tsx scripts/inventarioDatosPrueba.ts
```

Los CSV se escriben en la carpeta donde se corre.

---

## 4. Días de crédito: dos campos, dos lecturas

### Dónde se usa cada uno

| Dónde | Campo | Para qué |
|---|---|---|
| `FichaCotizacion.tsx:2081` | **`dias`** | **El costo de financiamiento.** Es el que importa |
| `FichaEmbarque.tsx:1546` | **`diasCreditoPorTipo`**, con respaldo `{ general: dias }` | Plazos del embarque |
| `FichaCotizacion.tsx:2200` y `:2277` | `dias` | Mostrar «Crédito N días» |
| `SelectorCliente.tsx:126` | `dias` | Lo mismo, en el buscador |
| `clienteColumns.tsx:76` | `dias` | La columna «Crédito» de la tabla de Altas |
| `FichaCliente.tsx:494` y `:529` | `dias` | **El único editor**: lo que Administración captura |

### Qué se rompe si `dias` deja de ser la fuente

**`dias` es obligatorio en el tipo** (`dias: number`, sin `?`), mientras
`diasCreditoPorTipo` es opcional. Quitarlo rompe, en orden de gravedad:

1. **El alta.** `FichaCliente` es el único lugar donde se captura. Sin editor
   para la versión por modalidad, nadie puede poner el dato nuevo.
2. **El costo de financiamiento de la cotización**, que es el cálculo real.
3. Tres lugares de solo lectura: la columna de Altas, el selector y la ficha.
4. **Los 817 clientes de producción.** `diasCreditoPorTipo` es opcional y
   seguramente casi nadie lo trae — **[script]** cuántos.

Por eso el embarque lo leyó con respaldo desde el principio, y ese patrón es el
correcto: `diasCreditoPorTipo ?? { general: dias }`.

### Qué hace falta para que la cotización tome el de su modalidad

1. **Leer igual que el embarque**: `diasCreditoPorTipo` primero, `dias` de
   respaldo. Nada se migra.
2. **Un editor por modalidad** en la ficha del cliente, que conserve `dias` como
   el valor general. Si solo se lee y no se puede capturar, el campo nunca se
   llena.
3. **Decidir qué modalidad manda en una cotización multimodal.** Y aquí me
   detengo: una cotización puede traer marítimo, terrestre y despacho a la vez,
   cada uno con días distintos (45 / 15 / 20 según §4.6). El financiamiento es
   **uno** por cotización.

> **Pregunta para Julio.** En una cotización con varias modalidades, ¿qué días
> de crédito aplican para el costo de financiamiento: los de la modalidad del
> servicio de mayor venta, los del flete internacional, o el financiamiento se
> calcula por servicio y se suma?
>
> *Mi recomendación:* por servicio y sumado. Es lo que refleja la realidad —cada
> tramo se cobra y se financia distinto— y evita una regla arbitraria. Cuesta
> más que las otras dos y conviene decidirlo antes de construir.

---

## 5. Lo que NO se toca hasta tener respuestas

Festivos, conciliación del fondeo, cruce de anticipos sin factura, complemento
de pago de proveedores y pronto pago. Nada de programación de pagos, bancos,
agrupación ni anticipos.
