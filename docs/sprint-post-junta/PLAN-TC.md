# Plan TC — Tipo de cambio de Pricing, moneda y cliente a facturar

Diagnóstico y plan, sin código. Parte del Plan A de monedas mezcladas.

---

## 1. Diagnóstico: qué hace la app hoy con el tipo de cambio

### 1.1 En la cotización

**El TC existe, está bien diseñado, y funciona para la comparativa.**

`KanbanQuote.tipoCambio?: TipoCambioCotizacion` (`QuotesData.ts:441`)
guarda valor, fuente, fecha y regla aplicada. Se captura en
`CapturaTipoCambio.tsx` con dos modos —valor directo y pricing rate (regla
sobre otra tasa)— y se usa en la comparativa de agentes
(`monedaComparativa.ts`) para totalizar paquetes multi-moneda.

**Quién puede editarlo:** Pricing y Admin. Ventas lo ve en solo lectura.

**Fuentes soportadas:** SAT, Banxico, Banamex compra/venta, pricing rate
(regla: «Banamex venta + 0.50»), capturado a mano.

**Lo que funciona bien:**
- Se guarda CON la cotización y no se relee (§4.3).
- Sin tasa, la comparativa dice «falta tipo de cambio» y no marca menor.
- `aplicarReglaPricingRate` deja escrito de dónde salió el número.
- Se copia al embarque al generarlo (`generacionEmbarque.ts:176`).

### 1.2 Lo que NO funciona: el TC no participa en el cálculo de la línea

**`calcLinea(costo, profit)` ignora la moneda.** Es una suma aritmética:
`venta = costo + profit`, `margen = profit / venta`. Si el costo es MXN y
el profit se capturó pensando en USD, el resultado es basura silenciosa.
Esto es exactamente lo que reporta Pricing: convierten el costo a dólares
**a mano, fuera del sistema**, le suman el profit, y cargan el costo en
pesos «porque en pesos les va a facturar el proveedor».

**`LineaPlana.moneda` es una sola, derivada de la primera tarifa:**
```ts
moneda: oficiales[0]?.moneda ?? 'USD'   // lineasCotizacion.ts:243
```
No hay `monedaCosto` ni `monedaVenta`. La tabla, los totales y el PDF usan
este campo para las dos caras. Si el costo es MXN y la venta USD, solo se
ve una.

**`getCostoOficial` suma sin mirar moneda:** deuda documentada en §6,
`PLAN-A-monedas-costo-venta.md:25`. Una línea con 1,000 USD y 5,000 MXN
da «6,000 de algo».

### 1.3 En el embarque

**El TC llega copiado desde la cotización** (`generacionEmbarque.ts:176`),
pero `margenRealConcepto.ts` solo usa `tipoCambio?.valor` (el número) y
cuando es `null` o `undefined` dice «sin tipo de cambio» sin inventar nada.

**Funciona para lo que tiene:** la conversión se niega a operar sin tasa.
El problema no es el embarque, es que hereda un TC que en la cotización no
participó en el cálculo de profit y venta.

### 1.4 Dónde se rompe — resumen

| Síntoma | Causa raíz | Dónde |
|---|---|---|
| Pricing convierte a mano fuera del sistema | `calcLinea` no sabe de monedas | `cotizacionCalculator.ts:78` |
| Una línea tiene una sola moneda para costo y venta | `LineaPlana.moneda` es un solo campo | `lineasCotizacion.ts:107,243` |
| El profit no refleja la conversión | No hay contexto de TC en el cálculo | `cotizacionCalculator.ts:78` |
| «El tipo de cambio sigue sin funcionar» (reporte Vermur) | El TC existe pero no participa en el flujo de cotización real | — |

---

## 2. La regla de negocio nueva, en palabras de Pricing

> «Las tarifas de proveedores nacionales vienen en pesos. Para cotizar
> convierten a dólares a mano con el TC de pricing que reciben por correo,
> le suman el profit, y cargan el costo en pesos, porque en pesos les va
> a facturar el proveedor.»

**Las tres reglas que se derivan:**

1. **Un concepto tiene moneda de costo y moneda de venta, y pueden ser
   distintas.** La de costo es la real del proveedor (manda para pagos y
   contabilidad). La de venta es la que ve el cliente.

2. **El TC de Pricing no es el del día ni el del SAT**: lo captura Pricing,
   se guarda **congelado** en la cotización y nunca se recalcula solo.

3. **Profit y margen se calculan sobre ese TC congelado.** Si el costo es
   MXN 8,000 y el TC es 20.50, el costo equivalente es USD 390.24; el
   profit y la venta se expresan en la moneda de venta (USD).

---

## 3. Cómo encaja con el Plan A y qué cambia

El Plan A (`PLAN-A-monedas-costo-venta.md`) ya resolvió el análisis:

| Lo que el Plan A propuso | Estado | Qué cambia con esta regla |
|---|---|---|
| `monedaCosto` y `monedaVenta` como campos nuevos opcionales | Sigue vigente | Se confirma: son los dos campos que faltan |
| `calcLinea` con contexto de conversión | Sigue vigente | El contexto es el TC congelado de la cotización |
| Opción (c) híbrida para profit y margen | Se confirma | Con TC: profit en moneda de venta; sin TC: «sin tipo de cambio» |
| Totales por moneda, no revueltos | Sigue vigente | Los totales de venta van en moneda de venta; los de costo en la suya |
| Cerrar `getCostoOficial` primero | Sigue vigente | Es prerrequisito |

**Lo nuevo que el Plan A no cubría:**

1. **Cuándo se pide el TC** (propuesta de Mau, §3.1 abajo).
2. **Moneda de venta de la cotización** — campo que no existe.
3. **Cliente a facturar** — campo que no existe.
4. **Ubicación del servicio al nacer** — no se captura hasta Operación.

---

## 3.1 Cuándo se pide el TC

**Propuesta de Mau, que recomiendo adoptar:**

| Momento | Qué pasa |
|---|---|
| Al meter el primer concepto con costo en otra moneda que la venta | La franja dice «Falta el tipo de cambio para calcular el margen» y ofrece el botón de captura |
| Editable | Hasta «Enviar al cliente» (etapa `enviada_cliente`) |
| Congelado | Al enviar. El TC que se usó para cotizar es el que defiende la cotización |
| Versión nueva | Puede cambiarlo **solo de forma explícita**, con registro en Historial |

**Implementación:** `CapturaTipoCambio.tsx` ya existe y soporta todo esto.
El cambio es que la franja de próximos pasos (`ProximosPasos.tsx`) lo
detecte como faltante cuando hay líneas con monedas cruzadas, igual que
hoy detecta líneas sin tasa de impuesto.

**Congelado al enviar:** ya existe `estaCongelada` para el embarque, pero
no hay un mecanismo equivalente para el TC solo. Propuesta: el TC se
añade a `CAMPOS_EDITABLES_CONGELADA` (que es lista blanca), pero con
una validación adicional: si la cotización ya fue enviada, el TC solo
se cambia con una nueva versión. Esto va en `prontitudCotizacion.ts` y
en la validación de `updateCotizacion`.

---

## 4. El TC que ya guarda la cotización: ¿flota o está congelado?

**Está congelado por diseño.** El código y la documentación son explícitos:

> «Se guarda CON la cotización y no se relee: si se tomara el vigente en
> cada apertura, reabrir el documento el mes que viene podría reordenar
> a los agentes de la comparativa y contradecir una decisión ya tomada.»
> — `monedaComparativa.ts:24`, `QuotesData.ts:443`

**Cómo entra `pricing_rate` como fuente:**

Ya está implementado. `CapturaTipoCambio.tsx` tiene el modo «Pricing
rate»: se captura la tasa base (e.g. Banamex venta = 20.00), el tipo
de colchón (pesos o porcentaje), y el valor (e.g. +0.50). El resultado
(20.50) se guarda con `fuente: 'pricing_rate'` y
`reglaAplicada: 'Banamex venta + 0.50'`.

**Lo que falta:** que Pricing pueda GUARDAR la regla como default para
no recargarla en cada cotización. Esto es una preferencia del usuario,
no de la cotización. Propuesta: `preferenciasUsuario/{uid}.reglaTCDefault`
con `baseFuente`, `tipo` y `valor`. Al abrir una cotización sin TC, se
precarga la regla con la tasa base del día (capturada a mano — no hay
API todavía). Pricing confirma o ajusta.

---

## 5. Campos que faltan en la cotización

### 5.1 Moneda de venta de la cotización

Hoy `KanbanQuote.moneda: 'MXN' | 'USD'` está hardcodeado a `'USD'` en
la alta rápida del Kanban (`KanbanCotizaciones.tsx:249`). Nadie lo
captura. Y `LineaPlana.moneda` (la de cada línea) se deriva de la
primera tarifa elegida.

**Propuesta:**

- `KanbanQuote.moneda` pasa a significar **moneda de venta** (la que ve
  el cliente). Se renombra mentalmente, no físicamente: evita migración.
- Se captura en la solicitud (Ventas elige «USD» o «MXN») y se puede
  cambiar en la ficha hasta enviar.
- Cada línea hereda `monedaVenta` de `quote.moneda` por defecto, con
  excepción por línea para los casos raros (un concepto que se cobra en
  la moneda del proveedor).
- `monedaCosto` sigue siendo por línea, derivada de la tarifa
  (`CostoLinea.moneda`), como hoy.

**Modelo aprobado necesario (campo nuevo, opcional, con respaldo):**

```ts
// En LineaPlana (lineasCotizacion.ts)
monedaCosto: 'MXN' | 'USD';     // derivada de la tarifa (ya existe como CostoLinea.moneda)
monedaVenta: 'MXN' | 'USD';     // heredada de quote.moneda, con excepción por línea

// En ConceptoCotizacion (QuotesData.ts) — persistido
monedaVenta?: 'MXN' | 'USD';    // null/undefined = hereda de quote.moneda
```

`LineaPlana.moneda` se mantiene como alias de `monedaVenta` hasta
limpiar los consumidores.

### 5.2 Cliente a facturar

Hoy NO existe en ningún nivel:
- La cotización tiene `clienteId` (el cliente vinculado).
- El embarque tiene `entidades.clienteCobrar` (texto libre + ref).
- La factura tiene `clienteId` y `clienteNombre`.

**La regla de negocio:** casi siempre se factura al `clienteId` de la
cotización. Pero hay excepciones: un concepto se factura a un tercero
(el agente aduanal, el consignatario, una filial). Luis lo pidió como
columna en la tabla de cargos del embarque (tarea 07).

**Propuesta en dos niveles:**

```ts
// Cotización — el default
KanbanQuote.clienteFacturaId?: string;       // FK a clientes/
KanbanQuote.clienteFacturaNombre?: string;   // para pintar sin lookup

// Concepto — la excepción
ConceptoCotizacion.clienteFacturaId?: string;
ConceptoCotizacion.clienteFacturaNombre?: string;
```

- Si el concepto no tiene `clienteFacturaId`, hereda el de la cotización.
- Si la cotización no tiene `clienteFacturaId`, hereda `clienteId`.
- El embarque hereda ambos niveles al generarse.
- La factura agrupa por `clienteFacturaId` resuelto: dos conceptos con
  distinto cliente a facturar no van en la misma factura.

**Cuándo se captura:** Pricing lo declara en la ficha; Operaciones lo
confirma o corrige en el embarque. No se captura en la solicitud.

### 5.3 Cómo viajan al embarque y a la factura

| Campo | Cotización → Embarque | Embarque → Factura |
|---|---|---|
| `tipoCambio` | Ya se copia (Bloque 12) | Se hereda al crear la factura |
| `moneda` (venta) | Se copia como `monedaVenta` del cargo | Ya es campo del cargo |
| `clienteFacturaId` por concepto | Se copia al cargo como `clienteFacturaId` | Agrupa las facturas |
| `clienteFacturaId` de la cotización | Se copia como default de `entidades.clienteCobrar` | Default si el cargo no lo tiene |

---

## 6. Ubicación del servicio al nacer

**Problema:** `ServicioSolicitado.ubicacion` y `.trafico` son opcionales y
**no se capturan al crear la cotización**. El Kanban quick-add
(`KanbanCotizaciones.tsx:234`) crea servicios sin ellos. Se capturan
después, en la sección Operación de la ficha (`OperacionServicio.tsx`).

**Consecuencia:** los conceptos que dependen de origen/destino para el IVA
(regla espejo, §4.2) quedan sin tasa hasta que alguien abra Operación.
Esto alimenta el freno del Bloque 3 («líneas sin tasa de impuesto»).

**Propuesta:** que la ubicación nazca con el servicio en los tres puntos
de creación:

| Punto de creación | Qué se captura | Cómo |
|---|---|---|
| Alta rápida del Kanban | Tráfico (impo/expo) | Selector debajo de los checkboxes de modalidad |
| «Agregar servicio» en la ficha | Tráfico y ubicación | Dos selectores en el modal de tipo |
| Formulario de solicitud | Tráfico y ubicación | Junto a la selección de modalidad |

**Tráfico es suficiente para arrancar.** Con tráfico + modalidad, la
mayoría de los conceptos ya resuelven su IVA:
- Importación → destino está en México → IVA 16% sobre destino
- Exportación → origen está en México → IVA 16% sobre origen
- Flete internacional → sin dimensión origen/destino

Ubicación (origen/destino del servicio) se puede derivar del tráfico
para los servicios de transporte: en una importación, el flete está en
origen (extranjero) y las maniobras en destino (México). Capturar
tráfico basta para los dos.

**Modelo:** no se agrega campo nuevo. `trafico` y `ubicacion` ya existen
en `ServicioSolicitado` como opcionales. El cambio es que se escriban
al crear, no después.

---

## 7. Qué pasa con lo existente

**Nada se migra.** Todas las cotizaciones y embarques existentes siguen
funcionando con los campos que tienen:

| Caso | Qué pasa |
|---|---|
| Cotización sin `monedaVenta` por línea | Hereda de `quote.moneda` → hereda de `'USD'` (el default que ya tienen) |
| Cotización sin `clienteFacturaId` | Hereda de `clienteId` |
| Embarque sin `tipoCambio` | Ya dice «sin tipo de cambio» y no compara |
| Servicio sin `trafico` | IVA queda «sin determinar» como hoy; se resuelve en Operación |
| `LineaPlana.moneda` vieja | Se lee como `monedaVenta` |

**La auditoría de `getCostoOficial`** (`scripts/auditarMonedasMezcladas.ts`)
sigue sin correrse. Mau debe correrla antes del Paso 2 para medir el
alcance del cambio.

---

## 8. Pasos publicables, en orden

### Paso 0 — Auditoría (sin deploy)
**Qué:** Correr `scripts/auditarMonedasMezcladas.ts` contra producción.
**Quién:** Mau con la llave de servicio.
**Para qué:** Saber cuántas líneas vivas mezclan monedas en el costo.
Decide si el Paso 2 es una corrección quirúrgica o una migración.
**Estimación:** 15 minutos.
**Punto de regreso:** N/A, solo lectura.

### Paso 1 — Tráfico al crear la cotización
**Qué:** Agregar el selector de tráfico (impo/expo) al Kanban quick-add,
a «Agregar servicio» y al formulario de solicitud. Escribir
`ServicioSolicitado.trafico` al crear. No hay campo nuevo: ya existe.
**Estimación:** 2-3 horas.
**Punto de regreso:** Quitar los selectores. Los servicios sin tráfico
siguen funcionando como hoy.
**Riesgo:** Bajo. No toca datos existentes.

### Paso 2 — Cerrar `getCostoOficial` (deuda crítica)
**Qué:** Que `getCostoOficial` sume por moneda, no a ciegas. Devuelve
`Record<MonedaCotizacion, number>` en vez de `number`. Los consumidores
se adaptan: la tabla muestra un costo por moneda, el cálculo de venta
y margen exige TC cuando las monedas difieren.
**Estimación:** 1 día. Alto riesgo: cambia el costo visible de
cotizaciones vivas. **Requiere aprobación de Mau.**
**Punto de regreso:** Revertir el commit. Los costos vuelven a su valor
anterior (incorrecto, pero el que el equipo ya conoce).

### Paso 3 — `monedaCosto` y `monedaVenta` en la línea
**Qué:** Campos nuevos opcionales en `ConceptoCotizacion` y `LineaPlana`.
Leer `moneda` como respaldo para los dos (sin migración). `quote.moneda`
pasa a significar moneda de venta por defecto.
**Estimación:** 3-4 horas.
**Punto de regreso:** Quitar los campos nuevos; `moneda` sigue
funcionando como antes.

### Paso 4 — `calcLinea` con contexto de conversión
**Qué:** `calcLinea(costo, profit, monedaCosto, monedaVenta, tc)` →
devuelve venta y margen en moneda de venta, o motivo de por qué no.
Función pura, con tests de los seis casos:
1. Misma moneda, sin TC
2. Misma moneda, con TC (ignorado)
3. Monedas distintas, con TC → conversión
4. Monedas distintas, sin TC → `null` + motivo
5. TC en cero → `null` + motivo
6. Costo cero con profit → venta = profit
**Estimación:** 3-4 horas.
**Punto de regreso:** Revertir a `calcLinea(costo, profit)`.

### Paso 5 — Tabla y totales con desglose visible
**Qué:** La tabla muestra dos columnas de moneda (costo y venta) cuando
difieren. Los totales se agrupan por moneda de venta. El margen dice
«Sin TC» cuando no se puede calcular. El desglose visible:
«costo MXN 8,000 · venta USD 1,500 @ 20.50».
**Estimación:** 1 día.
**Punto de regreso:** Volver a `moneda` única en la tabla.

### Paso 6 — Cliente a facturar
**Qué:** `clienteFacturaId` y `clienteFacturaNombre` en cotización y
concepto. Selector en la tabla de la ficha. Herencia al embarque.
Agrupación de facturas por cliente.
**Estimación:** 1 día.
**Punto de regreso:** Quitar los campos; todo se factura al `clienteId`.
**Dependencia:** Tarea 07 (tabla única de cargos en el embarque) lo
consume como columna.

### Paso 7 — Moneda de venta en la solicitud
**Qué:** Selector de moneda (USD/MXN) en la solicitud y en el quick-add
del Kanban. Reemplaza el `moneda: 'USD'` hardcodeado.
**Estimación:** 1-2 horas.
**Punto de regreso:** Volver al default USD.

### Paso 8 — TC congelado al enviar
**Qué:** Al pasar a `enviada_cliente`, el TC deja de ser editable (la
franja lo dice). Una versión nueva puede cambiarlo con registro en
Historial. `prontitudCotizacion` valida que el TC exista cuando hay
líneas con monedas cruzadas.
**Estimación:** 2-3 horas.
**Punto de regreso:** Quitar la validación; el TC sigue siendo editable
siempre (como hoy).

---

## 9. Preguntas

### Para Mau

1. **¿Aprobar la auditoría de `getCostoOficial`?** Recomiendo correrla
   antes de cualquier otro paso, para medir el alcance.

2. **¿Moneda de venta default de la cotización = USD?** Hoy está
   hardcodeada a USD. Recomiendo que siga siendo el default pero que se
   pueda cambiar, porque hay operaciones domésticas que se cotizan en MXN.

3. **¿La regla de pricing rate se guarda como preferencia del usuario?**
   Recomiendo que sí: evita que Pricing recargue «Banamex venta + 0.50»
   en cada cotización. Va en `preferenciasUsuario/{uid}`.

4. **¿El orden de los pasos te parece correcto?** Los dos primeros (tráfico
   y auditoría) no se bloquean entre sí y se pueden hacer en paralelo. El
   2 (getCostoOficial) es el que necesita tu aprobación explícita porque
   cambia costos visibles.

### Para Vermur

1. **¿El TC de Pricing es siempre una regla sobre Banamex, o a veces usan
   otra base (SAT, Banxico)?** El sistema ya soporta las cuatro, pero
   conviene saber cuál es la más frecuente para precargarla.

2. **¿Hay conceptos que se cobran al cliente en una moneda distinta a la
   del resto de la cotización?** (e.g., un concepto nacional que se cobra
   en MXN dentro de una cotización en USD). Recomiendo que sí se soporte,
   con excepción por línea.

3. **¿El cliente a facturar por concepto es un caso frecuente o
   excepcional?** Define si se captura siempre o solo cuando hay excepción.
   Recomiendo: solo cuando hay excepción, con herencia del default.

4. **¿La conversión del costo se muestra como columna en la tabla de
   Pricing, o solo el costo en su moneda original?** Recomiendo mostrar
   las dos: «MXN 8,000 (USD 390 @ 20.50)» para que Pricing vea la
   equivalencia sin salir del sistema.
