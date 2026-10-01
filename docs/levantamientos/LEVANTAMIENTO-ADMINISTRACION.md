# Levantamiento Administración

---

# Levantamiento de Procesos · Área de Administración y Finanzas

> **Entregable 1 de 3** — Proyecto mapeado y parametrizado
> 

> Consolida el proceso levantado con el área, las reglas de negocio confirmadas, la estructura de datos que le corresponde y su esquema de roles y permisos.
> 

---

## Ficha del entregable

| Campo | Detalle |
| --- | --- |
| Área | Administración / Finanzas |
| Proyecto | VermurOps — Plataforma logística (sustituye Magaya) |
| Cliente | Vermur — Importaciones y Logística Vermur, S. de R.L. de C.V. |
| Elaboró | Mauricio Gutiérrez — DigSol |
| Participantes de Vermur | Julio (Administración y Finanzas) · Gabriela Huerta |
| Sesiones | Sesión 1 de 2 — pendiente la segunda (Órdenes de Compra y facturación) |
| Fuentes | Transcripción completa · catálogo de términos de pago · catálogo de conceptos de Magaya |
| Estado | Validado — con alcance pendiente en sesión 2 |
| Etapa | 01 Levantamiento → 02 Mapeo |

---

## 1. Resumen ejecutivo

Administración es responsable de las altas formales de clientes y proveedores, la validación fiscal, la programación y ejecución de pagos, la cobranza y el cierre administrativo de los embarques.

El levantamiento mostró un área que opera con un alto grado de trabajo manual: la información se exporta del sistema a Excel, se procesa con fórmulas propias, y luego se vuelve a capturar en los portales bancarios. La validación del IVA se hace factura por factura a mano, y los errores se detectan después, cuando Contabilidad los observa.

**Lo que resuelve la plataforma:** eliminar la doble captura entre sistema, Excel y banca; automatizar el cálculo de fechas de pago con sus reglas reales; y validar el tratamiento fiscal en el origen, no al final.

---

## 2. Proceso levantado

### 2.1 Proceso diario de pagos

Es el núcleo de la operación del área. Se ejecuta todos los días:

1. Abrir la vista de pagos y filtrar los vencimientos del día
2. Descargar la información a Excel
3. Copiar y pegar en un Excel propio con fórmulas que traducen el formato al que requiere la programación
4. Revisar factura por factura que el IVA esté correctamente aplicado
5. Revisar el estatus, incluidas las marcadas como «no pagar» que esperan fondeo del cliente
6. Agrupar las facturas del mismo proveedor en una suma total
7. Entrar a los portales bancarios y ejecutar el pago, usando la cuenta que corresponde al concepto
8. Regresar al sistema, seleccionar las facturas pagadas y capturar la cuenta de salida y la fecha
9. Adjuntar el comprobante de pago
10. Enviar el comprobante por correo al proveedor, especificando qué folios cubre

**El dolor central:** el paso 2 y 3 existen solo porque el sistema no entrega la información en el formato que la banca requiere. Es doble captura pura.

### 2.2 Reglas de fechas y crédito

> «Naturales. Pero los pagos solo se hacen en días laborales.»
> 

Los días de crédito se cuentan en **días naturales**, pero los pagos solo se ejecutan en **días hábiles**. Si el vencimiento cae en sábado o domingo, el pago se recorre al **lunes siguiente** — antes se adelantaba al viernes, el criterio cambió.

**Origen de la fecha.** Al dar de alta al proveedor se capturan sus días de crédito y su monto de crédito. Al seleccionarlo en el embarque, el sistema calcula la fecha de pago con base en esos días y la fecha de la factura.

**Falla actual:** el sistema respeta los días de crédito de forma intermitente. A veces programa el pago para el día siguiente, y los ejecutivos tienen que deseleccionar y volver a seleccionar el proveedor para que tome el dato correcto.

**Pagos anticipados.** Hay casos donde, pese a tener crédito, el proveedor exige el pago antes: si no se paga, no libera la mercancía ni el BL. También se considera el tiempo de reflejo bancario — a veces hay que pagar una semana antes para que el dinero se vea aplicado el día necesario.

**Reglas de excepción por proveedor:**

| Proveedor | Regla especial |
| --- | --- |
| Oñate (agencia aduanal) | Se paga exclusivamente los viernes, sin ciclo de crédito estándar |
| Aseguranza Peninsular | Todas las facturas del mes se consolidan y se pagan a principios del mes siguiente, sin importar la fecha de emisión |

### 2.3 El condicionante de fondeo: flag «No Pagar»

> «Tenemos que esperar el dinero del cliente para pagarle al proveedor. Entonces lo cargan y le ponen no pagar. Hasta que no reciben el dinero del cliente y vemos que está en firme en la cuenta, ya le quitan el no pagar.»
> 

Vermur no financia ciertos pagos con recursos propios. Operaciones marca la factura con «no pagar» y Administración no la programa hasta que el fondeo del cliente esté confirmado en firme.

**Regla dura:** no se financian impuestos. El cliente deposita primero.

### 2.4 Cuentas bancarias

**Especialización de cuentas propias.** Vermur no mezcla flujos:

| Banco | Uso |
| --- | --- |
| Santander | Pago a proveedores en general (cuenta aparte para impuestos) |
| Banorte | Pago de garantías y pagos a la agencia aduanal |
| Monex | Pagos en dólares |
| Partner Pay | Pagos en dólares a agentes que tengan la plataforma (monto mínimo 80 USD) |

**Múltiples cuentas por proveedor:**

> «Una naviera puede tener una cuenta para pago de flete, otra cuenta para pago de demoras y otra cuenta para pago de garantías. Entonces se tiene que hacer el pago a la cuenta correcta porque si no… caos.»
> 

Un mismo proveedor puede tener varias cuentas segmentadas **por concepto de servicio**, en pesos y en dólares. El pago debe dirigirse a la cuenta que corresponde.

**Agrupación de pagos.** Varias facturas pendientes del mismo proveedor se suman y se pagan en una sola transferencia, para evitar comisiones bancarias altas —especialmente en transferencias internacionales— y por practicidad. El comprobante que se envía especifica qué folios cubre.

El sistema actual permite pago parcial y revertir un pago aplicado; ambas capacidades deben conservarse.

### 2.5 Tratamiento fiscal

> «Manejamos IVA 16%, cero y no objeto. De ahí en fuera no podemos facturar de ninguna otra forma por nuestro objeto.»
> 

| Caso | Tasa |
| --- | --- |
| Servicios en territorio nacional | IVA 16% |
| Servicios en aguas o territorio extranjero | Tasa 0% |
| Conceptos no objeto de impuesto | No objeto |

**El caso especial del flete aéreo:**

> «El aéreo lleva tasa del 4%. Siempre. Pero en México no es posible facturar con una tasa del 4%. Entonces a un porcentaje del aéreo se le pone el IVA 16% y a otro porcentaje se le pone cero, que es el 25% y 75%.»
> 

**Flete terrestre nacional:** lleva retención del 4%.

**Validación fiscal en el alta (CFDI 4.0):**

> «El SAT te pide el código postal, régimen, razón social. Si no coincide no te deja timbrar. Tiene que ser exactamente igual al RFC. Por eso en el alta pedimos la Constancia de Situación Fiscal.»
> 

**Regla dura:** no se puede operar ni abrir un embarque si el cliente no está dado de alta y validado.

### 2.6 Auditoría manual de IVA

> «Facturas que vienen con IVA no lo cargan en Magaya y ya al final el contador me dice: oye, este sí viene con IVA pero Magaya no está con el IVA aplicado.»
> 

Julio revisa manualmente, todos los días, que el IVA de cada factura física coincida con el capturado en el sistema. Cuando se escapa, Contabilidad lo detecta después y hay que corregir.

### 2.7 Anticipos y complemento de pago

Los anticipos de **impuestos nunca se timbran**, porque el pedimento va a nombre del cliente. Los anticipos de **almacenaje o maniobras sí se timbran**.

El complemento de pago tiene estados: pendiente, generado o no necesario. Para las navieras se requiere carta de encomienda, una por cada aduana y patente.

### 2.8 Altas de clientes y proveedores

El módulo de altas es responsabilidad de Administración. Checklist del expediente:

- Constancia de Situación Fiscal
- Comprobante de domicilio
- Estado de cuenta bancario
- Actas constitutivas (cuando hay línea de crédito)

**Tipos de entidad.** Cliente y proveedor pueden ser nacionales o extranjeros. El proveedor se subdivide en: naviera, aerolínea, transportista, agente de carga, aduanal, almacén, maniobras, terminal y seguros.

**Caso del agente de carga.** Es simultáneamente cliente y proveedor: Vermur le factura y él factura a Vermur. Hoy se da de alta tres veces en el sistema actual.

**Probable proveedor.** Pricing puede registrar uno con solo el nombre, sin RFC. Administración recibe la notificación al concretarse la cotización y carga el expediente formal.

### 2.9 Horizonte de programación

La programación de pagos llega hasta febrero de 2027. Incluye pagos fijos, pagos capturados manualmente por los ejecutivos, y lo que se descarga diariamente del sistema.

---

## 3. Reglas de negocio confirmadas

**Crédito en días naturales, pago en días hábiles.** Vencimiento en fin de semana se recorre al lunes.

**No se financian impuestos.** El cliente deposita primero; el flag «no pagar» bloquea la programación hasta confirmar el fondeo.

**Cada cuenta bancaria tiene un uso específico.** No se mezclan flujos entre bancos ni entre conceptos.

**El pago va a la cuenta del proveedor que corresponde al concepto.** Flete, demoras y garantías pueden tener cuentas distintas.

**Se agrupan facturas del mismo proveedor en un solo pago.** Para reducir comisiones, con el comprobante detallando los folios.

**Solo tres tasas de IVA.** 16%, 0% y no objeto. El aéreo se divide 25/75; el terrestre nacional lleva retención del 4%.

**Sin validación fiscal no hay operación.** Los datos deben coincidir exactamente con la Constancia de Situación Fiscal o el SAT rechaza el timbrado.

**Los anticipos de impuestos no se timbran.** Los de almacenaje y maniobras sí.

---

## 4. Estructura de datos del área

| Entidad | Rol del área |
| --- | --- |
| Clientes | Alta formal y validación fiscal |
| Proveedores | Alta formal · validación del «probable proveedor» |
| Cuentas bancarias de proveedor | Crea y mantiene (segmentadas por concepto) |
| Términos de pago | Mantiene el catálogo |
| Conceptos | Define la cuenta contable y el tratamiento fiscal |
| Facturas de proveedor | Valida y programa a pago |
| Pagos | Crea y ejecuta |
| Cobranza | Da seguimiento a cuentas por cobrar |
| Embarques | Consulta · cierra de pago y administrativamente |

### Campos que Administración define en el ALTA

**Identificación fiscal:** razón social · RFC · código postal · régimen fiscal · tipo (nacional o extranjero)

**Clasificación:** tipo de entidad (cliente, proveedor) · subtipo de proveedor · si es entidad dual

**Condiciones comerciales:** días de crédito por modalidad · límite de crédito · término de pago

**Contactos:** múltiples, con tipo (dueño, quien pide la unidad, quien manda la factura, quien monitorea)

**Cuentas bancarias:** banco · CLABE · moneda · concepto al que aplica

**Expediente:** Constancia de Situación Fiscal · comprobante de domicilio · estado de cuenta · actas constitutivas

### Campos que Administración define en el PAGO

Proveedor · facturas que cubre · monto · moneda · banco de salida · cuenta de salida · fecha programada · fecha de ejecución · comprobante · estado del complemento de pago

### Catálogo de términos de pago

Descripción · días para pagar (0 a 120) · porcentaje de descuento por pronto pago · días para obtener el descuento

---

## 5. Roles y permisos

| Acción | Ventas | Pricing | Administración | Operaciones |
| --- | --- | --- | --- | --- |
| Alta formal de cliente | No | No | Sí | No |
| Alta formal de proveedor | No | No | Sí | No |
| Registrar probable proveedor | No | Sí | Sí | No |
| Validar datos fiscales | No | No | Sí | No |
| Mantener catálogo de conceptos | No | No | Sí | No |
| Definir cuenta contable de conceptos | No | No | Sí | No |
| Mantener términos de pago | No | No | Sí | No |
| Registrar cuentas bancarias de proveedor | No | No | Sí | No |
| Cargar facturas de proveedor | No | No | Sí | Sí |
| Validar facturas de proveedor | No | No | Sí | No |
| Programar pagos | No | No | Sí | No |
| Ejecutar pagos | No | No | Sí | No |
| Marcar o liberar el flag «no pagar» | No | No | Sí | Sí |
| Facturar al cliente | No | No | No | Sí |
| Cobranza y estados de cuenta | No | No | Sí | No |
| Cierre de pago y administrativo | No | No | Sí | No |
| Ver notas internas | No | Sí | Sí | Sí |

**Reglas complementarias:**

- La facturación al cliente es de Operaciones; Administración conserva la cobranza, la validación fiscal y el pago a proveedores.
- Operaciones puede marcar el flag «no pagar»; Administración es quien lo libera al confirmar el fondeo.
- Se propuso que Administración reciba y valide las facturas de proveedor antes de que se suban, para controlar la liberación de pagos.

---

## 6. Requerimientos para la plataforma

1. Panel de programación de pagos que sustituya el Excel: vencimientos, agrupación, registro de pago y comprobante sin salir del sistema
2. Cálculo automático de la fecha de pago con la regla de días hábiles
3. Reglas de pago especiales por proveedor (día fijo, consolidación mensual)
4. Flag «no pagar» vinculado al fondeo del cliente, que bloquee la programación
5. Múltiples cuentas bancarias por proveedor, etiquetadas por concepto y moneda
6. Sugerencia automática de la cuenta correcta según el concepto del pago
7. Pago consolidado de varias facturas con envío automático del comprobante detallando folios
8. Pago parcial y reversa de pago aplicado
9. Validación automática del IVA contra el concepto y su tasa configurada
10. División automática 25/75 para el flete aéreo y retención del 4% para terrestre nacional
11. Validación estricta de datos fiscales en el alta, idealmente con lectura de la Constancia
12. Bloqueo de operación con clientes no validados
13. Panel de cuentas por pagar y por cobrar
14. Estados de cuenta semanales al cliente
15. Programación de pagos con horizonte amplio, distinguiendo el origen de cada pago

---

## 7. Puntos de dolor del sistema actual

| Problema | Impacto |
| --- | --- |
| Doble captura entre sistema, Excel y portales bancarios | Tiempo perdido y errores de transcripción |
| Los días de crédito no se respetan de forma consistente | Hay que deseleccionar y reseleccionar el proveedor |
| El IVA no se aplica y lo detecta Contabilidad después | Discrepancias contables y retrabajo |
| Revisión manual de IVA factura por factura | Carga diaria de trabajo evitable |
| Corregir un pago mal aplicado es engorroso | Hay que eliminar, anular y volver a subir |
| Conceptos duplicados sin filtro por tipo de operación | Riesgo de facturar con tasa incorrecta |
| Registros duplicados de la misma entidad | Información dispersa e inconsistente |

---

## 8. Referencias

### Citas del equipo

> «Naturales. Pero los pagos solo se hacen en días laborales.»
> 

> «Tenemos que esperar el dinero del cliente para pagarle al proveedor. Entonces lo cargan y le ponen no pagar.»
> 

> «Una naviera puede tener una cuenta para pago de flete, otra cuenta para pago de demoras y otra cuenta para pago de garantías. Entonces se tiene que hacer el pago a la cuenta correcta porque si no… caos.»
> 

> «Manejamos IVA 16%, cero y no objeto. De ahí en fuera no podemos facturar de ninguna otra forma por nuestro objeto.»
> 

> «El aéreo lleva tasa del 4%. Siempre. Pero en México no es posible facturar con una tasa del 4%.»
> 

> «El SAT te pide el código postal, régimen, razón social. Si no coincide no te deja timbrar.»
> 

> «Facturas que vienen con IVA no lo cargan en Magaya y ya al final el contador me dice: oye, este sí viene con IVA.»
> 

> «Para dividir, para que no se vaya a mezclar todo en una sola cuenta.» — sobre la especialización de cuentas bancarias
> 

### Documentos fuente

- Transcripción completa de la sesión de levantamiento
- Catálogo de términos de pago exportado de Magaya (25 registros)
- Catálogo de conceptos y servicios exportado de Magaya (229 registros)
- Archivo de programación de pagos en Drive

### Entregables relacionados

- Documento de levantamiento de Administración (Word)
- Diagrama de flujo maestro del proceso
- Documento de arquitectura y esquema de datos
- Consolidado de levantamiento

---

## 9. Pendientes y sesión 2

Esta fue la primera de dos sesiones. Queda pendiente:

| Tema | Detalle |
| --- | --- |
| **Sesión 2** | Órdenes de Compra y proceso de facturación a clientes |
| Complemento de pago (REP) | Mecanismo para dar seguimiento a proveedores que no lo emiten |
| Conciliación del fondeo | Cómo se confirma el depósito del cliente para liberar el flag «no pagar» |
| Días festivos | Tratamiento en el cálculo de vencimientos |
| Descuento por pronto pago | Si se aprovecha hoy y si debe reflejarse en la rentabilidad |
| Órdenes de compra | A veces Operaciones compra servicios sin avisar a Finanzas |

---

