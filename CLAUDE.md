# VermurOps — Contexto del proyecto

> Lee este archivo completo antes de empezar cualquier trabajo.
> Contiene cómo trabajar, qué está construido, y las reglas de negocio que no se pueden romper.

---

## 1. Qué es esto

Plataforma web que reemplaza **Magaya** (software de logística internacional y aduanal) para
**Vermur**, un agente de carga mexicano con operaciones marítimas, aéreas y terrestres.

**Stack:** React + Vite + TypeScript + Firebase (Auth, Firestore, Hosting, Functions)
**Proyecto Firebase:** `vermur-logistics-app` (plan Blaze)
**Producción:** https://vermur-logistics-app.web.app
**Local:** `npm run dev` → localhost:3000
**Identidad:** rojo `#E11D48`, dark `#1F2937`

**El equipo de Vermur ya está usando la plataforma en producción.** Cualquier cambio que se
deploye lo ven ellos.

---

## 2. Cómo trabajamos — la regla de oro

**Nada se cierra hasta que Mau valide en navegador con cero errores en consola.**

"Compila", "tsc pasa" y "los tests pasan" **NO** cuentan como validado. Ha habido casos donde el
build pasa y la app no arranca.

El patrón es estricto:

```
plan → Mau aprueba → implementas UN sub-paso → Mau valida en navegador → siguiente
```

- Divide el trabajo en sub-pasos acotados y validables por separado
- Cuando termines uno, **dime exactamente qué validar** (pasos concretos, no "revisa que funcione")
- No encadenes sub-pasos sin validación entre ellos
- Sin loops automáticos

**Cuando hay decisiones de negocio, pregunta.** Mau conoce la operación de Vermur; tú no. No
adivines cómo funciona el negocio — si una decisión depende de cómo trabaja el cliente,
plantéala con opciones y espera respuesta.

**Cuando encuentres algo que contradice lo que te dijeron, dilo.** Ha pasado varias veces que el
código revela algo distinto a lo que se asumía. Eso es valioso, no un problema.

---

## 3. Lecciones aprendidas (errores que ya cometimos)

Estas ya nos costaron tiempo. No las repitas.

**Cada colección nueva de Firestore necesita su regla publicada.**
Escribir la regla en `firestore.rules` no basta — hay que publicarla con
`firebase deploy --only firestore:rules`. Nos pasó con `proveedores/`, `puertos/` y
`terminosPago/`: la colección simplemente no se creaba y el error se tragaba en silencio.

**Los índices compuestos van en `firestore.indexes.json`, no con el link del error.**
Si el índice solo vive en la consola de Firebase, nadie sabe que hace falta hasta que truena en
otro entorno.

**Avisa antes de publicar reglas o índices.** Muestra el comando exacto y espera confirmación.
Nunca `firebase deploy` a secas — siempre `--only <lo que toca>`.

**Verifica el puerto del dev server.** Si Vite dice "Port 3000 is in use", hay un proceso viejo
y estás viendo código anterior. `lsof -ti:3000 | xargs kill -9`.

**Al cambiar dependencias, borra el caché de Vite.** `rm -rf node_modules/.vite`. El error
`504 (Outdated Optimize Dep)` es eso.

**Nunca inventes datos de catálogo.** Los catálogos (conceptos, clientes, proveedores, puertos,
términos de pago) vienen de archivos reales exportados de Magaya y depurados, en
`src/data/seeds/`. Si no encuentras el archivo, **pregunta** — no lo generes. Un catálogo
ficticio en producción es peor que no tener catálogo.

**Trabajo terminado sin deployar es trabajo que no existe para el cliente.**
Tres commits del 2-sep (el fix de las «desapariciones», la separación
ver/dar-de-alta en Altas y el catálogo de conceptos) se quedaron cuatro días en
un worktree esperando validación. En esos cuatro días el cliente reportó DOS
quejas que esos commits ya resolvían, y el backlog se rearmó con pendientes que
no lo eran. El ciclo se cierra con el deploy, no con el commit: al terminar un
bloque, pedir la validación EXPLÍCITAMENTE como bloqueante y, validado,
mergear y publicar en el momento. Un bloque validado sin publicar no está
terminado, está estacionado.

**Antes de diagnosticar una regresión en local, mira DESDE DÓNDE corre el dev
server.** `lsof -ti:3000` y revisa la ruta del proceso. Si el trabajo está en un
worktree y el server corre desde el checkout principal, se ve otra rama y
parece que el código desapareció. Ya costó tiempo cuatro veces. La causa más
barata siempre es «desde dónde se está sirviendo», no «qué se rompió».

**Un guardado que falla en silencio es peor que uno que no guarda.**
Firestore rechaza `undefined` y tumba la escritura entera; si nadie atrapa la
promesa, el estado de React ya se actualizó y en pantalla parece guardado. «No
guardó nada» se reporta en cinco minutos; «guardó a medias» vive semanas.

**Nunca sumes dinero sin mirar la moneda.**
El mismo bug apareció CUATRO veces en lugares distintos —el resumen del
embarque, la comparativa de agentes, el KPI de cuentas por pagar y el pie de la
bandeja de órdenes— siempre con la misma forma:

```ts
items.reduce((acc, x) => acc + x.monto, 0)   // ← compila, pasa tests, miente
```

2,000 USD y 40,000 MXN dan «42,000». Se ve perfectamente bien y nadie lo atrapa
hasta que ese total llega a una factura o a un pago.

Usa `sumarPorMoneda()` de `lib/sumarPorMoneda.ts`. Devuelve un importe POR
moneda, nunca un escalar. Si de verdad necesitas un solo número, `totalDeUnaMoneda()`
devuelve `null` cuando la lista mezcla, para que el caso tenga que resolverse
en vez de colarse. Una moneda desconocida se descarta en vez de caer en USD:
meter un importe en la moneda equivocada es peor que dejarlo fuera, porque el
total seguiría viéndose correcto.

`npx tsx scripts/auditarSumasDeDinero.ts` marca las sumas nuevas que no miran
la moneda. Córrelo antes de cerrar cualquier bloque que toque dinero. Sale con
código 1 si encuentra alguna sin clasificar.

**Cuando cambies el modelo de datos, maneja el fallback.** Hay datos legacy en producción. El
patrón que usamos: helper que intenta el campo nuevo y cae al viejo (ver `getOficialIds`,
`matchConcept`).

---

## 4. Reglas de negocio que no se pueden romper

### 4.1 Quién hace qué

**Matriz definida por el cliente** (documento de observaciones, 27-ago-2026):

| Función | Ventas | Pricing | Administración | Operaciones |
|---|---|---|---|---|
| Crear leads / prospectos | Sí | | | |
| Solicitar cotización | Sí | | | |
| Crear cotización | | Sí | | |
| Gestionar tarifas | | Sí | | |
| Cargar tarifarios | | Sí | | |
| Alta de clientes | | | Sí | |
| Alta de proveedores | | | Sí | |
| Alta de puertos | | | Sí | |
| Generar embarque | | | | Sí |
| Generar factura | | | Sí | Sí |
| Generar nota de crédito | | | Sí | Sí |
| Consultar Kanban | Sí | | | |

**Reglas duras que se derivan:**

- **Ventas** solo crea leads y solicita cotizaciones. NO da de alta clientes ni proveedores.
- **Pricing** cotiza y gestiona tarifas. NO da de alta clientes, proveedores ni puertos.
  NO ve el Kanban. NO tiene seccion independiente de Documentos.
- **Operaciones** genera embarques, factura, y solicita y gestiona las órdenes
  de compra. NO crea cotizaciones.
- **Administracion** es la unica que da altas definitivas de clientes, proveedores y puertos.
  Autoriza y paga las órdenes de compra, y carga los gastos de oficina.

**Citas del cliente:**

> «Todos somos vendedores, pero solo Pricing puede cotizar.»

> «Que Ventas pueda cotizar es un verdadero desastre. No quiero que metan mano.»

> «Ventas no deberia de poder dar de alta clientes ni proveedores, solo deberia de poder crear leads.»

**Matiz sobre Pricing:** Pricing SI puede crear cotizaciones (el cliente manda el requerimiento
por correo y Pricing la abre directamente, sin forzar el paso de solicitud previa). Recibe
solicitudes de clientes directos y agentes de carga, no solo de Ventas.

**Corrección a la matriz (28-ago-2026): Pricing tambien CIERRA sus cotizaciones.**
La maquina de estados restringia `ganada` a Ventas y Admin. Era incoherente con
el matiz de arriba: si Pricing abre cotizaciones directas de clientes y agentes
de carga sin pasar por Ventas, no puede depender de Ventas para cerrarlas.

Pricing quedo agregado a:
  - `ganada` desde `enviada_cliente` y desde `negociacion`
  - `perdida` desde toda etapa en la que ya participa: `solicitado_pricing`,
    `pricing_solicitando`, `cotizaciones_recibidas`, `consolidada`,
    `enviada_cliente` y `negociacion`

NO se agrego a `perdida` desde `solicitud_cliente`: esa es etapa pura de Ventas
y la cotizacion todavia no le llega a Pricing.

Fijado en `stateMachine.test.ts`, bloque G.

**Corrección al plan de operación (31-ago-2026): las órdenes de compra son de
DOS áreas, no de tres.**

    OPERACIONES solicita y gestiona → ADMINISTRACIÓN autoriza y paga

`docs/PLAN_OPERACION.md` decía «PRICING solicita → OPERACIONES gestiona → ADMIN
autoriza y paga». Al aterrizarlo se vio que el primer paso no encaja: Pricing
cotiza y compara proveedores, no gestiona pagos ni ve embarques, así que la
capacidad quedaba asignada sin ninguna pantalla donde ejercerla.

Quien pide pagos es **Operaciones** —anticipos de impuestos, anticipos a agentes
aduanales, transportistas que cobran 50% adelantado, gastos que surgen en la
operación— y **Administración** para los gastos de oficina, que el cliente puso
explícitamente en su área: *«eso también lo cargaría el área de administración»*.

`ordenCompra.solicitar` se quitó de Pricing. Una capacidad que ningún humano
ejerce es ruido, por el mismo criterio con el que no se le dio
`embarque.generar` a Ventas.

Dos consecuencias en el código, ambas fijadas con tests:
  - `RolOC` tenía `admin` pero no `administracion`, así que el ÁREA que lleva
    los pagos no podía autorizarlos y toda OC se quedaba trabada en «en
    gestión». Ver `stateMachineOC.test.ts`, bloque H.
  - Operaciones no tenía acceso al módulo de Finanzas, donde vive la bandeja,
    así que el paso del medio no tenía pantalla. Ver `permisos.test.ts`.

### 4.2 El IVA se deriva, no se captura

Regla espejo: se grava al 16% **únicamente lo que ocurre en territorio nacional**.

| Tráfico | Ubicación | Territorio | IVA |
|---|---|---|---|
| Importación | Destino | México | 16% |
| Importación | Origen | Extranjero | 0% |
| Exportación | Origen | México | 16% |
| Exportación | Destino | Extranjero | 0% |

**Casos especiales:**
- Flete aéreo: tasa efectiva 4%, que el SAT no admite → se divide 25% al 16% + 75% al 0%
- Flete terrestre nacional: retención del 4%
- Seguro de mercancía: siempre 0%
- Flete internacional: sin dimensión origen/destino

La función `calcularIVA` existe con 21 tests. **Está desconectada del flujo** porque
`ServicioSolicitado` no tiene campo `trafico` — ver deuda técnica.

### 4.3 Moneda mixta

Flete internacional en USD, gastos nacionales en MXN con IVA. **Los totales nunca se mezclan** —
se calculan por moneda y se muestran separados. Un total revuelto se ve creíble y es basura.

**Matiz (31-ago-2026): comparar sí exige convertir.** Si un agente cotiza el
flete en USD y las maniobras en MXN, su total no se puede sumar — y sin total
comparable, la comparativa entre agentes pierde sentido.

La salida es convertir **para comparar**, no para cotizar:
  - el desglose original queda siempre visible: «USD 1,500 + MXN 8,000 @ 18.5»
  - los montos guardados conservan su moneda; el PDF sale separado
  - sin tipo de cambio NO se inventa uno: totales separados y sin ✓Menor

El pecado que prohíbe esta regla es el total del que no sabes qué mezcla. Uno
declarado no está revuelto. Ver `lib/monedaComparativa.ts`.

**Tipo de cambio.** Se guarda CON la cotización y no se relee: tomar el vigente
en cada apertura podría reordenar a los agentes y contradecir una decisión ya
tomada. Fuentes: SAT, Banxico, Banamex compra/venta, manual, y el **pricing
rate** — que no es un número suelto sino una REGLA sobre otra tasa, con el
colchón de Pricing: «el de Banamex más cuatro pesos o más un porcentaje».

### 4.4 Un concepto, no cuatro

Magaya duplica el mismo servicio por impo/expo × origen/destino (hasta 8 registros por servicio).
Aquí es **un concepto con atributos**: `aplicaImpo`, `aplicaExpo`, `aplicaOrigen`, `aplicaDestino`,
`tieneVenta`, `tieneCosto`. El catálogo pasó de 229 registros a 105 conceptos.

### 4.5 Entidades unificadas

Proveedores, transportistas y agentes de carga viven en **una sola colección** con array `tipos[]`.
Un agente de carga es **cliente Y proveedor a la vez** (`esTambienCliente`). Al depurar se
encontraron 162 entidades que estaban en más de una lista de Magaya.

### 4.6 Días de crédito por modalidad

No es un número por cliente: varían por tipo de operación. Un mismo cliente puede tener 45 días
en marítimo, 20 en aéreo y 15 en terrestre.

### 4.7 Otras reglas del negocio

- **Maniobras:** se cargan al costo más caro por terminal (no se sabe a qué terminal llega la
  naviera). Contenedor especial lleva recargo.
- **Vigencia de tarifa:** campo abierto (texto como lo dice el proveedor) + fechas para filtrar.
  Debe verse destacada en el PDF — hoy genera reclamos porque pasa desapercibida.
- **Pagos:** crédito en días naturales, pago solo en días hábiles. Vencimiento en fin de semana
  se recorre al **lunes**.
- **No se financian impuestos:** el cliente deposita primero. Existe flag «No Pagar» que bloquea
  la programación hasta confirmar fondeo.
- **Free time:** solo aplica a FCL marítimo.
- **Los tres cierres del embarque:** operativo (Operaciones) → de pago (Admin) → administrativo
  (Admin).

---

## 4.8 Observaciones del cliente — 27 de agosto de 2026

Documento formal entregado por Luis Rentería tras las primeras pruebas del equipo en producción.
**Es la fuente de verdad para el trabajo pendiente.**

### Prioridad crítica

**Conversión cotización → embarque.** Textual del cliente: *«uno de los puntos más importantes»*.
Al aprobarse una cotización debe poder generarse el embarque directamente desde ella,
conservando los conceptos a cobrar y a pagar, para poder facturar y pagar a proveedores.
Hoy no existe.

**Facturación dentro del embarque.** El embarque no tiene módulo de facturas. La factura debe
generarse ahí y quedar asociada a la operación, sin salir del embarque.

**Permisos mal asignados.** Ver matriz en 4.1. Ventas y Pricing pueden dar altas que no les
corresponden; Operaciones puede crear cotizaciones.

### Bugs reportados

- Al crear un prospecto no aparece confirmación de que se registró
- **El prospecto recién creado no aparece disponible al solicitar cotización**
- El dashboard de Finanzas no funciona y no permite cambiar de vista
- El tipo de cambio usa valores o criterios distintos a los de la empresa

### Nomenclatura

- Botón «Cotizar ahora» → confuso, hay que renombrarlo. Y no debe estar en la página de clientes
- Módulo «Cotizaciones» → el nombre no representa el proceso. Opciones que dan: Solicitud de
  cotización, Ventas, CRM, Leads
- Módulo «Clientes» → renombrar a «Altas» (ahí se ven clientes y proveedores)

### Limpieza por área

- **Ventas** ve embarques activos y cotizaciones pendientes que no le aportan
- **Pricing** no debe ver Kanban ni la sección independiente de Documentos
- Los reportes sugeridos en el dashboard no se usan; deben estar los que hoy se generan a mano

### Pendientes de definición del cliente

Estos requieren respuesta antes de implementar. Cuando toques algo relacionado, **propón una
opción y espera validación**:

1. Qué pasa cuando un cliente existente pide una nueva cotización (evitar repetir el alta)
2. Cómo debe llamarse el módulo de cotizaciones
3. ~~Cuándo exactamente se convierte una cotización en embarque~~ → **RESUELTO
   28-ago-2026:** automático al marcarla ganada. Ver «Respuestas del cliente».
4. Qué tipo de cambio usa la empresa y cuál es la fuente oficial
   → **Propuesta pendiente de confirmar (28-ago-2026):** el FIX del DOF del día
   hábil anterior a la operación, que es el que el SAT exige para CFDI, leído
   de la API del SIE de Banxico (serie SF43718) y guardado con su fecha en
   Firestore, para que una cotización vieja conserve la tasa con la que se
   calculó. Falta confirmar si Pricing cotiza con esa misma tasa o le carga un
   diferencial, y quién puede capturarla a mano cuando la API no responda.
   El módulo quedó en estado «en desarrollo» hasta tener respuesta: mostraba
   tasas fijas en el código e historial de octubre de 2023.
5. Dónde se generan y administran las notas de crédito
6. Qué documentos pertenecen a la cotización y cuáles al embarque
7. Qué le falta al catálogo de servicios (dicen que está «confuso e incompleto»)

### Respuestas del cliente — 28 de agosto de 2026

Resuelven tres de los pendientes anteriores. **Son decisiones firmes.**

**Disparador cotización → embarque: automático, sin paso intermedio.**
Textual: *«una cotización ganada se crea un embarque de a huevo, no hay paso
intermedio»*. Al marcar la cotización como ganada, el embarque se crea solo,
heredando los conceptos a cobrar y a pagar. No hay bandeja de «por convertir»
ni botón de generar.

**La cotización se congela al generar embarque.**
Textual: *«no, una vez que pasa a embarques ya así se queda»*. Los conceptos
quedan bloqueados para edición. No puede haber divergencia entre cotización y
embarque, así que no hace falta detectarla.

**Facturación: dos modalidades, a elección al facturar.**
Textual: *«da las 2 opciones al facturar, que sea una general o separada»*.
  - **General:** una sola factura que cubre todo el embarque.
  - **Separada:** facturas independientes por concepto o por grupo de conceptos.
El modelo de cargos debe soportar ambas desde el inicio: cada línea de cargo
necesita saber a qué factura pertenece (y una línea no puede estar en dos), o
después hay que rehacerlo. Se construye en el Bloque 5.

### Otros requerimientos

- Poder subir un tarifario desde la cotización
- Carga automática de tarifarios: subir un documento y que el sistema lea y cargue las tarifas
  (esto es la épica de OCR)
- Separar claramente «Altas» de «Configuración» — hoy hay confusión entre ambas

---

## 4.9 La ficha de cotización — cómo quedó (31-ago-2026)

El cliente dijo que la ficha anterior «no se entiende». Se rehízo siguiendo la
vista que Luis ya tenía en su sistema.

### La comparativa es de PAQUETES, no de tarifas sueltas

Nuestra comparativa comparaba tarifas individuales por concepto. La del cliente
compara paquetes completos por agente, y por eso no le encontraban sentido.

Textual de Gabi: *«son cuatro agentes diferentes... el más barato es el de
Sunway con Hapag-Lloyd por 2200, en total. Que eso incluye cuatro conceptos.»*

    Concepto              │ Sunway │ BrandNew │ BoardCargo │
    Flete internacional   │  1,500 │   1,600  │    1,450   │
    Maniobras origen      │    200 │     180  │      220   │
    VALIDEZ               │ 15/sep │  20/sep  │   10/sep   │
    TOTAL                 │  1,700 │   1,780  │  1,670 ✓Menor

**La matriz se DERIVA, no se guarda.** `concepto.tarifas[]` ya es la matriz,
girada: filas = conceptos, columnas = proveedores, celda = monto. Guardarla
aparte sería una tercera fuente de verdad para los costos, después de la
dualidad de §6. Derivada, la matriz y la tabla de líneas no pueden
desincronizarse.

**Una matriz por SERVICIO**, no por cotización: se pide la misma ruta a varios
proveedores, y un agente marítimo no compite contra un transportista terrestre.
En pantalla es UNA sola tabla que cambia de contenido según el servicio activo.

**Reglas que la sostienen** (`lib/matrizComparativa.ts`):
  - Las filas tienen TIPO: solo las de `importe` suman. Una fecha o unos días
    de tránsito no son dinero.
  - La vigencia es propiedad de la COLUMNA, pintada como fila. Meterla como
    concepto falso es lo que inflaba el total en el sistema de referencia.
  - Las columnas se indexan por id de agente, nunca por posición.
  - Un agente en cero NO gana: no cotizar no es ser barato.
  - Se avisa de los **paquetes incompletos**: comparar uno de 3 conceptos
    contra uno de 1 premia al que contesta a medias.
  - NO se carga el más barato solo: se preselecciona y se puede cambiar.
    *«Aunque sea la más barata no siempre la tomamos, por los detalles: tiempo
    de tránsito, free time, o el cliente que no quiere cierto proveedor.»*

### El resto de la ficha

  - **Tarjetas por modalidad** (marítimo, aéreo, terrestre, despacho aduanal y
    cargos locales), con tabla editable: concepto, proveedor, costo, profit,
    venta, margen. La capa de «servicios» con categorías inventadas se retiró.
  - **El concepto se ELIGE del catálogo, nunca se teclea.** Sin `conceptoId` la
    tarifa no hace match y dos renglones escritos distinto son conceptos
    distintos.
  - **Resumen financiero dentro de la ficha**: «mientras cotizan no lo pueden
    ver, se tendrían que salir de lo que están haciendo».
  - **Costo cero declarado ≠ campo vacío.** `costoCapturado` distingue una
    decisión —cortesía, cargo absorbido, pérdida deliberada— de un olvido.
  - **Botones que cumplen su promesa**: cada acción declara qué necesita, y
    donde no aparece se explica qué falta (`lib/prontitudCotizacion.ts`).

**PENDIENTE — los subconceptos no se ven en la tabla (4-sep-2026).**
Existen en el modelo y suman al costo, pero solo se editan desde el modal de
«Datos del embarque», donde nadie los busca. Ventas los pidió explícitamente en
su Excel: un almacén cobra IN, OUT, pick & pack y etiquetado, y cada uno se
factura por separado. Deben anidarse bajo su concepto en la tabla de la ficha.
No se toma hasta cerrar lo pendiente de salir (decisión de Mau).

## 4.10 Carga de tarifarios con IA (31-ago-2026)

*«Un almacén me cobra el IN, el OUT, el PICK... si son 10 conceptos, tendría
que subir 10 veces la tarifa.»* Y: *«voy a cargar unos tarifarios que tengo de
agosto, pero no los pude cargar porque no encontré dónde.»*

### El flujo

    Documento (Excel, PDF, imagen o correo pegado)
       ├─ Storage           → es la EVIDENCIA
       └─ Cloud Function    → n8n → IA → tarifas propuestas
                                          ↓
                            pantalla de REVISIÓN editable
                                          ↓
                            catálogo general de tarifas

**Una subida, dos usos.** El documento del que se extrajo una tarifa ES la
evidencia: no hay dos sistemas de adjuntos. Responde a *«tiene que haber una
trazabilidad de ¿de dónde saqué este costo? Ah, ok, Juan Pérez me lo mandó
ayer.»*

**n8n EXTRAE Y PROPONE; la app DECIDE Y ESCRIBE.** El agente no toca Firestore.
La IA se equivoca, y una tarifa mal cargada se propaga a cotizaciones reales y
de ahí a facturas.

### Lo que bloquea el guardado

  - **Sin `conceptoId` resuelto**, no se guarda: la tarifa existiría y sería
    invisible para el panel.
  - **Sin `proveedorId` resuelto**, tampoco: no haría match en la comparativa.
  - **Moneda y unidad exigen confirmación explícita**, no basta con que sean
    editables. Un 1,200 que era MXN cargado como USD se ve perfectamente bien
    en la pantalla de revisión y nadie lo atrapa hasta que llega la factura.

### La infraestructura

  - `functions/` en **us-central1** (equivalente a nam5, donde vive Firestore),
    con estructura para varias funciones: `comun/auth.ts` lo compartirá la de
    Gestión de Usuarios.
  - `extraerTarifas` valida el token de Firebase Auth, comprueba
    `tarifario.cargar`, y reenvía a n8n con el secreto del lado del servidor.
    `invoker: 'public'` — público en la RED, cerrado en el CÓDIGO.
  - Secreto en Secret Manager: `firebase functions:secrets:set VERMUR_N8N_TOKEN`.
    n8n lo valida como header `X-Vermur-Token`.
  - `N8N_WEBHOOK_URL` en `functions/.env`. **El default es producción a
    propósito**: `/webhook-test/` solo responde mientras alguien tiene n8n
    abierto, así que como default funcionaría en pruebas y fallaría en uso real.
  - Evidencias en Storage bajo `tarifarios/{año}/{mes}/`, máximo 10 MB, sin
    sobrescribir ni borrar: la evidencia de un costo no se edita.

## 4.11 Versiones de la cotización (10-sep-2026)

«Ventas regresa la cotización, Pricing hace la v2, y la v1 queda como
registro.» Ver `lib/versionesCotizacion.ts` y `hooks/useVersionesCotizacion.ts`.

  - **La raíz ES la versión viva.** `cotizaciones/{id}` se sigue editando
    igual; el Kanban, la bandeja y el embarque no saben que hay versiones.
  - **Las fotos viven en `cotizaciones/{id}/versiones/{n}`**, inmutables
    (la regla prohíbe update y delete). En la raíz solo queda `versiones[]`
    con el resumen —motivo, autor, etapa, total POR MONEDA— para pintar el
    selector sin bajar las fotos. Embebidas, cada sesión del Kanban bajaría
    todas las fotos de todas las cotizaciones.
  - **La foto NO lleva chat, actividades ni historial de etapas**: son la
    conversación, no el contenido, y siguen corriendo en la viva.
  - **Solo Pricing y Admin versionan** (`cotizacion.crear`). Ventas regresa
    la cotización; no la reescribe (§4.1). Ventas sí ve el historial.
  - **Una congelada no se versiona** (§4.8): la v2 divergiría del embarque.
  - **Una perdida sí**: la nueva versión la REABRE en `cotizaciones_recibidas`
    y el selector lo dice: «v3 · creada tras rechazo». ⚠️ Decisión marcada:
    se eligió esa etapa por ser la de trabajo de Pricing.
  - **Restaurar = versión nueva con el contenido de la vieja.** Restaura
    servicios, tipo de cambio y moneda; NO la etapa, el cliente ni los
    responsables: eso es el estado actual de la operación.
  - **Foto y resumen se escriben en UNA transacción**, calculada sobre el
    documento del servidor: dos personas versionando a la vez no producen
    dos v2. Y un guardado de una pantalla que se quedó en la v1 se rechaza
    en `updateCotizacion` en vez de pisar la bitácora.
  - `plantillaVersionId` queda reservado en null: el PDF de cada versión
    llegará con el módulo de Plantillas, que arranca por la de cotización.

## 4.12 La ficha de embarque (10-sep-2026)

**Pestañas, en el orden en que se trabaja:** Información · Cargos · Productos
· Documentos · Facturas · Historial · Master/hijo. Información fusiona lo que
eran General, Entidades y Ruta —las tres secciones del encabezado del BL—.
Plantillas se monta cuando exista el módulo; no se monta una pestaña vacía.

**Las entidades salen del catálogo y enlazan a su ficha.** El nombre
(`entidades.consignatario`…) sigue siendo texto: es lo que se imprime en el
BL y un shipper extranjero no tiene por qué estar en el catálogo. El enlace
va aparte, en `entidadesRef`, y es opcional: elegir del catálogo escribe
nombre y enlace; teclear un nombre distinto suelta el enlace y queda «sin
validar». Cliente a cobrar e importador → `clientes`; el resto y la naviera
(`ruta.origen.transportista`) → `proveedores`. Ver `lib/entidadesEmbarque.ts`.
  - Deuda: `TipoProveedor` no tiene `agente_aduanal` ni `naviera`; el
    selector ORDENA por modalidad, no filtra. Agregarlos toca los 544
    proveedores.

**Documentos con clasificador (D-3).** La pestaña anterior «guardaba» con
`URL.createObjectURL`: el archivo nunca llegaba a Storage y moría al recargar
— todo documento subido ahí antes del 10-sep se perdió, y la lista lo dice.
Ahora: Storage (`embarques/{id}/docs/`) → `clasificarDocumento` con
`X-Vermur-Flujo: documento-embarque` (capacidad `embarque.generar`) →
`RevisionDocumentoClasificado` → se guarda solo lo confirmado, agrupado por
destino (documentos, facturas de proveedor, facturas al cliente) y por tipo.
  - **Una factura de proveedor precarga la OC del embarque**: número, fecha y
    emisor en `facturaAsociada`, el desglose en `facturaDatos`, y el cotejo
    del total contra `oc.monto` (§4.3: monedas distintas no se comparan). Es
    lo del levantamiento: «sustituir el folio interno por el número real,
    cuadrar montos y adjuntar el respaldo».
  - `contenedor_no_coincide` se pinta en rojo y aparte: un BL de OTRO
    embarque se ve idéntico; el contenedor es lo único que lo delata.
  - Los contenedores se mandan a n8n como JSON en un solo campo del
    multipart (`contenedores`). Si n8n espera otra forma, se ajusta aquí.

**Filtros de la lista, con responsable (10-sep-2026).** La lista de Embarques
corre sobre `SpreadsheetTable` con vistas guardables; los filtros
(responsable, estado, modalidad, cliente, rango ETA/ETD, cierre pendiente)
se guardan CON la vista (`VistaUsuario.filtros`). «Solo los míos» filtra por
`embarque.responsableOperativo`, que se hereda de
`cliente.responsableOperativo` al nacer y se cambia en la ficha. El cliente
tiene los tres responsables (ventas, pricing, operativo) por CORREO: no hay
directorio de usuarios, así que `usuariosPorRol` (AuthContext) los saca del
mapa de correos; cuando exista `usuarios/{uid}` lee de ahí.

## 4.13 Cuentas por cobrar (10-sep-2026)

Finanzas → Cuentas por cobrar es la contraparte de Cuentas por pagar. Todo
se DERIVA de `facturas` y `cobros` (Bloque 2): `lib/cuentasPorCobrar.ts`.
  - Estado por vencimiento: por cobrar · por vencer (≤ 7 días) · vencido ·
    cobrado. El saldo sale de `saldoDeFactura`; nada se guarda.
  - KPIs y totales por cliente POR MONEDA (§4.3). El único lugar que mezcla
    monedas es el ORDEN de los clientes (los más atrasados primero), y no se
    muestra.
  - Registrar cobro desde el panel escribe el mismo `CobroCliente` que la
    pestaña Facturas del embarque, así que fondea las OC igual (1.1).
  - La ficha del cliente (Crédito) resume su cartera: «tiene X por cobrar,
    Y vencido». El estado de cuenta semanal sale de aquí; va después.

## 4.14 Cargos por proveedor, etapas y documentos (reunión con el cliente, 10-sep-2026)

**Un proveedor emite UNA factura por todo lo que prestó.** Los cargos se
AGRUPAN por proveedor al mostrarse —cotización y embarque— con las columnas
de Pricing: concepto · costo · profit · venta · margen %, total por proveedor
y total general, por moneda. Es una VISTA: el dato sigue siendo por concepto
(la comparativa compara concepto contra concepto). No repetir la dualidad de
§6: `lib/cargosPorProveedor.ts` deriva, no guarda.
  - Carga dividida (dos terminales en un concepto): la venta se reparte
    proporcional al costo y el renglón se marca «compartido» con el cálculo
    en el tooltip. Asignarla al primero inflaría su margen y pondría al otro
    en pérdida.
  - Toggle «Por proveedor | Por concepto», default proveedor, preferencia por
    usuario en `preferenciasUsuario/{uid}`. Elegir concepto, comparar y
    arrastrar tarifas viven en la vista por concepto.
  - **Ventas NO ve proveedores**: conserva su vista por concepto con solo
    venta. Textual: «que vean la coti y el margen. Eso es todo».
  - Estado por proveedor en el embarque: sin factura · facturado · en orden
    de compra · pagado — el MENOS avanzado de sus cargos.

**Etapas del embarque:** Nuevo · Cargado · En tránsito · En destino ·
Entregado (`lib/estadoEmbarque.ts`). Derivadas, con override manual
(`etapaOperativa`); el cierre operativo siempre es entregado.

**Las facturas no viven en Documentos.** Documentos acepta solo operativos;
si el clasificador detecta factura, la revisión se bloquea y manda a la
pestaña Facturas. La factura comercial (documento aduanal) sí es operativo.

**Bitácora del embarque (10-sep-2026).** Dos registros con públicos distintos,
que NO se mezclan:
  - **Historial** (`eventos`): los hitos redactados para el cliente —«En
    arribo», «Liberado»—; es lo que saldrá a su portal.
  - **Bitácora** (`bitacora`): lo interno. Lo que el sistema registra solo
    (etapa, cierres, costos con el valor anterior, OC, facturas, cobros,
    entidades, responsable, documentos — con quién y cuándo) y las notas de
    Operaciones. Las entradas del sistema no se editan ni se borran; una nota
    la edita solo su autor y queda lo que decía.
  Cómo se registra solo: `conBitacora` COMPARA el embarque antes y después de
  cada guardado de la ficha (`lib/bitacoraEmbarque.ts`), así un cambio que
  llegue por un camino nuevo también queda. Lo que pasa en otras colecciones
  lo anotan sus hooks con `anotarBitacora` (OC generada/autorizada/pagada,
  factura, cobro) — la regla y su call site juntos.
  Master/hijo dejó de ser pestaña: es estructura, vive al final de Información.

## 4.15 Sprint de la prueba con el cliente (21-sep-2026 → jueves 24)

**El recorrido Playwright ES la definición de terminado.**
`./scripts/e2e.sh` (o `npm run e2e`) levanta emuladores + app en :3100 y
corre `tests/e2e/recorrido-jueves.spec.ts`: los cuatro roles de punta a
punta — Ventas solicita, Pricing cotiza/versiona/PDF, Ventas envía y gana,
Operaciones abre con serie/captura/concilia factura/pide pago/gestiona,
Administración deposita/autoriza/paga/factura/cobra/cierra. n8n se simula
por ruta (`clasificarDocumento`): el PDF y el clasificador no aceptan un
token del emulador. Si cambias una pantalla del recorrido, corre esto.
  - Pricing NO envía al cliente: `consolidada → enviada_cliente` es de
    Ventas/Admin (§4.1). Pricing consolida y genera el PDF; Ventas envía y
    marca ganada.

**PDF de la cotización (B1).** `clasificarDocumento` con
`X-Vermur-Flujo: pdf-cotizacion` (capacidad `cotizacion.crear`) reenvía al
webhook `generar-pdf-cotizacion` y devuelve el binario (proxy `respuesta:
'binario'`). `lib/pdfCotizacion.ts` arma el payload: líneas SOLO con
concepto y venta; carga tipada → bloque de carga; vigencia sugerida = la
tarifa elegida más corta. Se descarga «COT-2026-0014 v2.pdf» y queda en
Storage `cotizaciones/{id}/pdf/` ligado a la versión (`quote.pdfs[]`,
escrito con arrayUnion: una ganada está congelada y el PDF es evidencia).
`functions/.env` está en .gitignore; la URL tiene default en el código.

**Factura de proveedor, versión mínima (B2).** En Facturas del embarque:
se sube, se clasifica, se elige el proveedor del consolidado, y se
concilia contra sus cargos pendientes (`lib/conciliacionFactura.ts`:
emparejamiento por nombre y monto, o aplicar completa). Al confirmar:
cargos con `facturaProveedorId` (grupo «Facturado»), documento en
`facturas_proveedor`, y la OC del proveedor precargada con número, fecha
y total + cotejo. `conceptos[]` del clasificador puede venir como strings
o como objetos; se aceptan los dos. Parcial y notas de crédito: después.

**Serie al abrir el embarque (B3).** La ruta manual reserva el folio de la
serie elegida (VLIM, VLEM, VLIT, VLET, VLIA, VLEA) con `reservarFoliosSerie`;
`traficoDeFolio` lo lee y el IVA se deriva. Contador sin sembrar =
advertencia en el embarque, no bloqueo. La bandera automática sigue apagada.

**Depósito del cliente.** `registrarDeposito` existía sin pantalla (otra
regla sin call site). Ahora se captura en la ficha de la OC, panel de
fondeo, solo con `ordenCompra.autorizar`.

## 5. Estado de los módulos

### Construido y validado

| Módulo | Detalle |
|---|---|
| Clientes y proveedores | CRUD, contactos múltiples, días de crédito por modalidad, alta rápida |
| Puertos | Catálogo con terminales (Lázaro Cárdenas es el caso con varias) |
| Conceptos | 105 conceptos con `calcularIVA` + 21 tests |
| Términos de pago | 25 términos, incluye descuento por pronto pago |
| Tarifas | Catálogo, carga masiva, lookup por concepto y ruta |
| Cotizaciones | Ficha por modalidad con tabla editable, máquina de estados con 9 etapas |
| Comparativa por agente | Matriz de paquetes: conceptos en filas, proveedores en columnas (§4.9) |
| Monedas | Conversión declarada para comparar, tipo de cambio con pricing rate |
| Carga de tarifarios con IA | Cloud Function + n8n + pantalla de revisión (§4.10) |
| Evidencias | Documentos en Storage, ligados a las tarifas que produjeron |
| Panel de tarifas | Filtrado por concepto activo, drag and drop con @dnd-kit |
| Simulador de costo | Marcar tarifas y ver el escenario antes de aplicar |
| Bandeja Pricing | Tres bloques por acción, barra de progreso, badges de tarifas |
| Tabla configurable | `SpreadsheetTable<T>` genérico con vistas guardables |
| Embarques | Persistidos en Firestore, cargos por moneda, Kanban por estado |

### En construcción o pausado

| Módulo | Estado |
|---|---|
| Órdenes de compra | C-1 a C-3 hechos: bandeja, ficha, flujo de dos áreas y los dos orígenes |
| Gestión de usuarios | Plan aprobado, sin implementar. Roles hoy en `getRolByEmail` |
| Finanzas | «Cuentas por pagar» ES la bandeja de OC. Cobranza y estados de cuenta pendientes |

### Sin empezar

- Motor de plantillas de documentos (BL, booking, arribo, carta de porte, 318/NOM)
- Integraciones: Valida Carga, timbrado CFDI, tracking de navieras, WhatsApp, Outlook
- Exportación de pólizas para el sistema contable del contador
- OCR de tarifarios con IA
- Aplicar `SpreadsheetTable` a Clientes, Proveedores y Embarques

---

## 6. Deuda técnica conocida

**🔴 CRÍTICO — No hay entorno de desarrollo: localhost escribe en producción.**
`src/firebase.ts` apunta a `vermur-logistics-app` sin condicionar por entorno.
`npm run dev` en localhost lee y escribe la MISMA base que el equipo de Vermur
está usando. No hay staging, ni emuladores, ni proyecto de pruebas.

Consecuencias diarias: cualquier prueba de un alta crea un registro real;
cualquier prueba de la máquina de estados mueve una cotización real; y una
importación masiva lanzada «para ver qué hace» sobrescribe el catálogo vivo.

**Primera salida construida (1-sep-2026): emuladores por OPT-IN.**
`VITE_USAR_EMULADORES=1` conecta Auth, Firestore y Storage a los emuladores
locales (`src/firebase.ts`), con un badge fijo «Emuladores · producción
intacta» para que nunca quede la duda de contra qué base miras datos. Es
opt-in y NO `import.meta.env.DEV` a propósito: la validación diaria de Mau
corre contra producción a sabiendas, y condicionar por DEV la cambiaría en
silencio. La operación nocturna (`noche.sh`) lo usa; los emuladores arrancan
vacíos y la app siembra los catálogos sola (seedGuard).
`scripts/sembrarEmuladores.sh` crea las cinco cuentas de prueba en Auth.

Pendiente la salida completa:
  2. Segundo proyecto Firebase de staging con una copia de los datos, elegido
     por variable de entorno. Es lo correcto a mediano plazo; cuesta plan Blaze
     aparte y mantener la copia.

Mientras tanto, `npm run dev` a secas SIGUE escribiendo en producción:
**avisar antes de cualquier prueba que escriba**, y tratar toda acción
destructiva como si fuera en producción, porque lo es.

**🔴 CRÍTICO — Las reglas de Firestore no distinguen roles.**
Hoy toda colección se protege con `allow read, write: if request.auth != null`.
Cualquier usuario autenticado —da igual su rol— puede leer y escribir cualquier
documento saltándose la app: desde la consola de Firebase, desde el SDK, o desde
la consola del navegador con la sesión abierta.

Esto significa que la matriz de permisos de §4.1 **protege la aplicación, no la
base de datos**. `src/auth/permisos.ts` esconde botones y bloquea las escrituras
que pasan por los hooks; no bloquea nada que le hable a Firestore directamente.
Es seguridad aparente, no seguridad real.

Por qué sigue abierto: las reglas no pueden leer el rol, porque el rol se deriva
en el cliente con `getRolByEmail` (mapa de correos en `AuthContext.tsx`).
Resolverlo requiere que el rol viva en el token:

  1. Custom claims por usuario (épica de Gestión de Usuarios), o
  2. Colección `usuarios/{uid}` con el rol, leída desde las reglas con `get()`
     — más simple, pero cuesta una lectura por evaluación.

Con cualquiera de las dos, las reglas pasan a verificar la capacidad y no solo
la autenticación. **Toca producción: hay que avisar y publicar con
`firebase deploy --only firestore:rules`.** Mientras no se cierre, asumir que
todo dato en Firestore es escribible por cualquier miembro del equipo.

**Resueltas** (se conservan como referencia de dónde buscar):
  - `trafico` y `ubicacion` en `ServicioSolicitado` — 30-ago. Desbloqueó el
    IVA (`lib/ivaCotizacion.ts`) y el folio del embarque.
  - Escrituras que fallaban en silencio — 31-ago. Ver el estándar más abajo.
  - «Nuevo Concepto» sin `conceptoId` — cerrada en CC-1..CC-4 y **reintroducida
    y vuelta a cerrar el 31-ago** al rehacer la ficha en tabla. Si algún día se
    cambia la celda de concepto, el `ConceptoSelector` no es negociable.

**🔴 BUG RESUELTO (9-sep-2026) — el congelado de §4.8 era solo visual.**
`estaCongelada` mira `embarqueIds`, pero la ruta manual de apertura de
embarques —la que se usa hoy con la bandera apagada— nunca lo escribía de
vuelta en la cotización. Y `camposBloqueados` existía sin que NINGÚN código de
producción lo llamara. Resultado: se podía editar la cotización de un embarque
ya abierto, y cotización y embarque divergían sin que nadie se enterara.

Es el mismo patrón que apareció dos veces en Finance.tsx: la lógica existe y
el call site no la usa. **Al escribir una regla, verificar que alguien la
llame** — un helper con tests y sin llamadas es documentación, no protección.

El fix: la ruta manual escribe `embarqueIds`, y `updateCotizacion` valida con
`cambiosBloqueados`, que COMPARA contra lo guardado en vez de mirar las claves
del patch. Esa comparación es lo que hacía imposible cablearlo antes: los
componentes mandan la cotización entera, así que `servicios` viene siempre.

**🔴 BUG — `serviciosStore` vive en localStorage: cada navegador tiene su copia.**
Los 10 «servicios» del selector viejo no están en Firestore: lo que
Administración edita en Configuración solo cambia SU navegador y nadie más lo
ve. Además `ServicioSolicitado.tipo` guarda a veces `'maritimo'` y a veces
`'srv-def-1'` según de dónde se marcó. El rediseño de la solicitud (sep-2026)
lo retiró del formulario; siguen leyéndolo Settings, Shipments y FichaRFQ —
retiro gradual pendiente. No agregar consumidores nuevos.

**`getCostoOficial` suma tarifas sin mirar la moneda.**
Con multi-selección de tarifas, `getCostoOficial` hace `reduce((a, t) => a + t.monto)`
sin comparar `t.moneda`. Un concepto con una tarifa de 1,000 USD y otra de
5,000 MXN da un costo de 6,000 «de algo», y sobre esa suma se calcularon la
venta y el margen. Viola §4.3: un total revuelto se ve creíble y es basura.

No se corrige todavía porque cambiaría el costo —y por tanto el margen— de
cotizaciones vivas. El mapeo a embarques (`lib/cotizacionAEmbarque.ts`) ya lo
detecta y emite la advertencia `monedas_mezcladas` cuando ocurre, así que el
caso no pasa desapercibido aunque el dato viejo siga mal.

Para medir el alcance antes de arreglarlo: `scripts/auditarMonedasMezcladas.ts`
(solo lectura). Al 30-ago-2026 no se había corrido.

**Dualidad de `CotizacionProveedor`.**
BandejaPricing guarda en `servicio.cotizacionesProveedor` (sin `proveedorId`); FichaCotizacion
guarda en `concepto.tarifas` (con `proveedorId`). Los helpers recorren ambos niveles con
fallback, pero hay que unificar. Estimado: 2-3 días, con riesgo alto en
`calcularTotalConsolidado` y el guard de la máquina de estados.

Sube de severidad desde E-4: el mapeo cotización → embarque corre en automático
al marcar ganada, así que un costo que se pierda por leer un solo nivel produce
un embarque mal nacido sin que nadie lo note. `lib/cotizacionAEmbarque.ts` tiene
tests explícitos para los tres casos (FichaCotizacion, BandejaPricing y mixta).

**Los agentes sin precio no se persisten.**
En la comparativa, un agente agregado como columna vacía vive en estado de
React: si Pricing agrega tres y recarga antes de capturar precios, se pierden.
Los que ya tienen precio se recuperan solos porque se derivan de las tarifas.
Falta `KanbanQuote.agentesComparativa?: Record<servicioId, AgenteColumna[]>`.
Media hora de trabajo.

**Ajuste «Probable Proveedor».**
El alta rápida de proveedor debe quitar el RFC (la ausencia de RFC es la señal de que no está
validado), marcarlo como «en revisión» y avisar a Administración al concretar la cotización.

**`proveedorOficialId` (singular) deprecado.**
Coexiste con `proveedoresOficialIds` (array). Hay que migrar y eliminar el viejo.

**`FormProveedorFicha` es código muerto.**
Definido pero nunca invocado. Candidato a eliminar.

**`window.confirm` provisional.**
En el simulador de costo. Reemplazar por modal propio.

**Roles hardcodeados.**
`getRolByEmail` en `AuthContext.tsx` tiene los correos del equipo. Se elimina cuando GU
implemente custom claims.

---

## 7. Estructura de datos

Colecciones en Firestore:

```
clientes         817 registros · diasCredito por modalidad · preferencias y vetos de proveedor
proveedores      544 unificados · tipos[] · cuentasBancarias por concepto
conceptos        105 · reglaIVA derivada · claves SAT · codigosMagaya para trazabilidad
puertos          21 · terminales[] dentro del documento
terminosPago     25 · con descuento por pronto pago
tarifas          proveedor + concepto + ruta + vigencia + precio por unidad
cotizaciones     servicios → conceptos → cotizacionesProveedor (anidado)
embarques        contenedores → pallets (por cliente) → mercancía
vistasUsuario    configuración de columnas por usuario y módulo
contadores       folios consecutivos
notificaciones   avisos entre áreas
embarques        heredan los cargos de la cotización ganada · cierres · Kanban
documentosTarifario  evidencias en Storage · hash · cuántas tarifas produjeron
importacionesTarifas borradores de la carga con IA · respuesta cruda de n8n
```

**Storage:** `tarifarios/{año}/{mes}/` — los documentos de los que salen las
tarifas. Máximo 10 MB, sin sobrescribir ni borrar.

**Cloud Functions** (`functions/`, us-central1): `extraerTarifas` es el proxy
hacia n8n. Estructurada para varias — Gestión de Usuarios reutilizará
`comun/auth.ts`.

**Convenciones:**
- camelCase en español
- IDs con prefijo: `CLI-`, `PRV-`, `PTO-`, `CON-`, `TRM-`, `TAR-`
- Fechas en ISO 8601
- Bajas lógicas (`activo: false`), nunca delete físico
- Se conservan referencias a Magaya para trazabilidad

---

## 8. Qué espero de ti

**Antes de construir algo con decisiones abiertas:** dame el plan, no el código. Incluye las
decisiones que necesitas de mí, los riesgos de romper lo existente, y los sub-pasos propuestos.

**Al implementar:** un sub-paso a la vez. Commit antes y después. Dime qué validar con pasos
concretos.

**Cuando encuentres un problema:** diagnostica antes de arreglar. Dime la causa raíz y las
opciones, no parches el síntoma. Si mi hipótesis está equivocada, dilo.

**Cuando algo toque producción:** avísame antes. El equipo de Vermur ya está usando la
plataforma.

**Sobre los tests:** la lógica de negocio pura (cálculos de IVA, matching, clasificación,
resolución de montos) va en `src/lib/` con tests. Un error en un cálculo no truena, solo da
números equivocados — y eso es peor.

**Sobre el alcance:** si al hacer un cambio ves algo que "se podría mejorar", anótalo pero no lo
toques. Prefiero poder distinguir un bug de layout de un bug de refactor.
