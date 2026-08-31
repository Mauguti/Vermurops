# Plan · De la cotización ganada al cierre administrativo

> Segunda mitad del proceso de Vermur. Continúa desde lo ya construido.
> Referencia: CLAUDE.md secciones 4.7 (los tres cierres) y 4.8 (observaciones del cliente).

---

## De dónde partimos

Ya está construido y en producción:

- Cotización completa con comparativa de agentes, monedas y tipo de cambio
- Carga de tarifarios con IA y evidencias en Storage
- Embarques persistidos con folio por serie
- El mapeo cotización → embarque (E-3), con sus invariantes
- Órdenes de compra: modelo y máquina de estados (OC-0)

Lo que sigue es cerrar el ciclo: que una cotización ganada se convierta en embarque,
que el embarque se pueda facturar, que a los proveedores se les pague, y que el
dinero del cliente se cobre.

---

## Las cuatro fases

```
FASE A · El embarque nace y se opera
FASE B · Se factura al cliente
FASE C · Se paga a proveedores
FASE D · Se cobra y se cierra
```

Cada una se puede validar sola. La D depende de la B, la C es independiente.

---

# FASE A · Embarque

### A-1 · Cablear la creación automática

E-4d, que quedó a medias. Al marcar una cotización como ganada, el embarque nace
solo.

Ya está construido: la transacción, el mapeo, los folios por serie, la agrupación
por modalidad, las advertencias. Falta conectarlo a la transición.

**Recordatorios de lo decidido:**
- Sin paso intermedio: «una cotización ganada se crea un embarque de a huevo»
- La creación no exige `embarque.generar` — ya lo validó la transición
- `origen: 'automatico' | 'manual'`
- Transacción atómica con idempotencia: o las dos cosas o ninguna
- La cotización se congela para edición de conceptos
- Las advertencias viajan con el embarque, no bloquean

**⚠ Bloqueante de producción:** los contadores de serie necesitan los consecutivos
reales de Magaya (VLIM, VLIT, VLIA, VLET, VL). Sin sembrarlos, el primer embarque
duplica un folio histórico. La pantalla de siembra ya existe en Configuración.

### A-2 · La bandeja «Por capturar»

Ya construida. Verificar que liste los embarques recién nacidos y que el Kanban
distinga «Nuevo · En proceso · Finalizado».

### A-3 · La tabla de cargos editable en el embarque

Es 5.4, que quedó pendiente. Operaciones necesita ver y editar los costos heredados:
la tarifa pudo no ser la correcta o pueden aparecer cargos extra.

Textual del cliente: *«el costo lo puede modificar operaciones en algún momento si es
que la tarifa no fue la correcta o hubo cargos extras»*.

Reutilizar `TarjetaModalidad` con un adaptador — los cargos del embarque son
`CargoDetalle`, no `LineaPlana`.

**Regla:** al modificar un costo en el embarque, la cotización NO cambia. Son
documentos distintos: la cotización es lo que se pactó, el embarque es lo que costó.
La diferencia entre ambos ES el dato interesante para el profit real.

### A-4 · Documentos del embarque

Motor de plantillas. Del levantamiento de Operaciones:

| Documento | Aplica a | Obligatorio |
|---|---|---|
| BL (Bill of Lading) | Marítimo | Sí |
| Booking Confirmation | Marítimo FCL y LCL | No |
| Notificación de arribo | Marítimo y aéreo | No |
| Carta de encomienda | Solo navieras, una por aduana y patente | No |
| Carta de porte | Terrestre nacional | No |
| Formato 318 + NOM | Despacho aduanal | No |

Textual: *«lo ideal es que cuando tú ya captures la información, con un solo clic te
descargue el documento ya con la información correcta»*.

Los puertos aparecen con las 3 letras del UN/LOCODE.

---

# FASE B · Facturación al cliente

**Quién factura: Operaciones**, no Administración. Confirmado en el levantamiento.

### B-1 · Modelo de factura

Dentro del embarque, no en un módulo aparte.

Campos: folio, embarqueId, clienteId, conceptos facturados con su IVA derivado,
subtotal por moneda, IVA, retenciones, total, estado, fechas, referencia al
complemento de pago.

**El IVA se deriva, no se captura.** `calcularIVA` ya existe con 21 tests. Requiere
`trafico` y `ubicacion` en el servicio, que ya se agregaron.

### B-2 · Las dos formas de facturar

Del cliente: *«da las 2 opciones al facturar, que sea una general o separada»*.

- **General:** una factura que cubre todo el embarque
- **Separada:** facturas por grupo de conceptos

`grupoFacturacion` ya existe en E-2, cortando por servicio. Confirmar con el cliente
si ese es el corte que quieren o si es más fino.

### B-3 · Solicitar timbrado

Botón que notifica a Administración de que la factura está lista. **No timbra:
avisa.**

Textual: *«administración ya no se va a meter al correo, nada más va a entrar a
VermurOps y va a ver Facturas por timbrar»*.

Estados: borrador → solicitada → timbrada → cancelada.

### B-4 · Pre-factura

Algunos clientes piden un PDF primero, pagan, y después se timbra la definitiva.

### B-5 · Datos fiscales

Se capturan **por cliente**, no por factura: régimen fiscal, uso del CFDI, método de
pago (PUE/PPD), tipo de CFDI. Ya está en las observaciones del cliente como pendiente.

**⚠ El timbrado real requiere PAC contratado.** Vermur no lo tiene. Construir el flujo
completo con el timbrado como interfaz aislada que hoy simula y mañana se conecta.
Que la simulación sea evidente en la UI.

---

# FASE C · Pago a proveedores

Retoma las órdenes de compra desde OC-1.

### C-1 · Hook, Firestore y folios

OC-1 del plan original. Colección `ordenesCompra`, regla, contador `OC-2026-0001`.

### C-2 · El flujo de tres áreas

```
PRICING solicita → OPERACIONES gestiona → ADMIN autoriza y paga
```

Estados: solicitada → en gestión → autorizada → pagada, con rechazada como salida.
Ya está en `stateMachineOC.ts` con 54 tests.

### C-3 · Dos orígenes

- **Desde un embarque:** hereda cliente, proveedor, folio y concepto. Casos: anticipos
  de impuestos, anticipos a agentes aduanales, transportistas que cobran 50% adelantado
- **Suelta:** gastos de oficina sin embarque — luz, nómina, servicios

Del cliente: *«habíamos mencionado cargar todo lo que es gastos de oficina aquí en el
sistema... eso también lo cargaría el área de administración»*.

### C-4 · El flag «No Pagar»

Vinculado al fondeo del cliente. La OC no se autoriza hasta confirmar el depósito.

Textual: *«tenemos que esperar el dinero del cliente para pagarle al proveedor»*.

**Regla dura:** no se financian impuestos.

Requiere la colección `depositosCliente` para registrar los fondeos.

### C-5 · Cuentas bancarias por concepto

Un proveedor puede tener varias cuentas según el servicio: flete, demoras, garantías.
Al autorizar, sugerir la que corresponde al concepto.

Textual: *«una naviera puede tener una cuenta para pago de flete, otra para demoras y
otra para garantías. Se tiene que hacer el pago a la cuenta correcta porque si no…
caos»*.

Los bancos de Vermur también están segmentados:

| Banco | Uso |
|---|---|
| Santander | Proveedores en general, cuenta aparte para impuestos |
| Banorte | Garantías y agencia aduanal |
| Monex | Pagos en dólares |
| PartnerPay | USD a agentes con la plataforma, mínimo 80 USD |

### C-6 · Cruce de anticipos

Anticipo parcial: un anticipo de $5,000 puede aplicarse $3,000 a una OC y $2,000 a
otra. Ya está en el modelo de OC-0 con `montoAplicado` y `montoDisponible`.

### C-7 · Programación de pagos

- Crédito en días naturales, pago en días hábiles
- Vencimiento en fin de semana → **lunes siguiente**
- Excepciones por proveedor: Oñate solo viernes, Aseguranza Peninsular consolidado
  mensual
- Agrupar facturas del mismo proveedor en un solo pago, con el comprobante detallando
  folios

### C-8 · Panel de Administración

Reemplaza el Excel de Julio. Vencimientos del día, agrupación, registro de pago,
comprobante, y envío al proveedor sin salir del sistema.

---

# FASE D · Cobranza y cierre

### D-1 · Cuentas por cobrar

Facturas emitidas con su vencimiento según los días de crédito del cliente por
modalidad.

### D-2 · Registro de cobros

Manual por ahora. La lectura de estados de cuenta bancarios con IA queda para después
— ya se habló con el cliente de hacerlo con n8n leyendo el PDF.

Textual: *«si podemos evitar conectarnos a bancos, mejor, porque la bronca de las APIs
bancarias es un tema para la ciberseguridad»*.

### D-3 · Estado de cuenta semanal al cliente

Del levantamiento de Administración.

### D-4 · Los tres cierres

| Cierre | Cuándo | Quién |
|---|---|---|
| Operativo | Entregado, sin facturas por recibir ni gastos por facturar | Operaciones |
| De pago | El cliente pagó | Administración |
| Administrativo | Todos los proveedores pagados | Administración |

Ya existe `estadoEmbarque.ts` derivando el estado. Falta conectar el cierre de pago y
el administrativo a los datos reales de facturación y OC.

### D-5 · El profit real del embarque

El cierre del círculo: comparar lo cotizado contra lo que realmente costó y se cobró.

```
Venta facturada − costo real de proveedores − comisión − financiamiento − costo de operación
```

Es lo que revisa dirección. Y es donde la diferencia entre cotización y embarque se
vuelve visible.

---

## Orden sugerido

| # | Fase | Por qué en ese lugar |
|---|---|---|
| 1 | A-1, A-3 | Sin embarque con cargos, no hay nada que facturar ni pagar |
| 2 | C-1 a C-3 | Las OC son la mitad del dinero y no dependen de facturación |
| 3 | B-1 a B-3 | Facturación, ya con cargos que facturar |
| 4 | C-4 a C-8 | El resto del pago, que sí depende de la facturación al cliente |
| 5 | D | Cobranza y cierre, que necesita facturas emitidas |
| 6 | A-4 | Documentos del embarque, independiente y grande |

---

## Bloqueantes que no dependen de código

| Qué | Para qué | Estado |
|---|---|---|
| Consecutivos de Magaya | Sembrar contadores de folio | Pendiente de Vermur |
| Tipo de cambio: fuente | Conversión y pricing rate | Pendiente de Vermur |
| Dónde viven las notas de crédito | Modelo de facturación | Pendiente de Vermur |
| PAC para timbrado | Facturación real | Sin contratar |
| Catálogo de cuentas contables | Exportar pólizas al contador | Pendiente de Vermur |
| Corte de factura separada | B-2 | Confirmar con el cliente |

---

## Cómo trabajarlo

Autonomía por nivel de riesgo, como quedó acordado:

- **UI, textos, permisos, layout** → implementar y reportar
- **Bugs con causa clara** → diagnosticar, arreglar, reportar
- **Modelo de datos nuevo** → plan corto: el modelo y los riesgos
- **Migración o borrado de datos** → plan completo, siempre
- **Producción** → avisar antes del deploy

Y en todos los casos: decir qué validar al terminar.
