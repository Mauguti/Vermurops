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
**Local contra producción:** `npm run dev` → localhost:3000 (escribe en la base real, ver §6)
**Local contra emuladores (validar sin tocar producción):**

```bash
./scripts/dev-emuladores.sh
```

Levanta Auth + Firestore + Storage, siembra las cuentas y sirve la app en
**http://localhost:3100**. Siempre arranca limpio (apaga lo que haya en los
puertos). Cuentas: `ventas@vermur.com`, `pricing@vermur.com`,
`operaciones@vermur.com`, `administracion@vermur.com`, `admin@vermur.com`;
contraseña `123456`. Los datos de ejemplo (COT-2026-0001…0008) los siembra
la app sola al entrar por primera vez. Ctrl+C apaga todo. Si el trabajo
está en un worktree, correrlo DESDE el worktree: sirve ese checkout.
**Identidad:** morado `#4B2A8C` (acento de la interfaz), rojo `#DC2626` SOLO para peligro

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

**Todo `firebase deploy` lleva su `cd` al checkout principal, y «skipping
upload» se lee como FALLO.**
El 1-oct costó dos despliegues de reglas: el primero subió el archivo
equivocado y el segundo no subió nada. En los dos casos el comando se corrió
desde un worktree que estaba en otra rama, con la versión vieja de
`firestore.rules`. El CLI no avisa: compara el archivo local contra el
desplegado y, si coinciden, informa

```
i  firestore: latest version of firestore.rules already up to date, skipping upload...
✔  firestore: released rules firestore.rules to cloud.firestore
```

que termina en un ✔ verde y en «Deploy complete». Parece éxito y es
«no hice nada». Lo que confirma que sí subió es:

```
i  firestore: uploading rules firestore.rules...
```

Por eso el comando se escribe siempre completo:

```bash
cd /Users/mauriciogutierrezmunoz/antigravity/Vermur-Logistics && npx firebase deploy --only <lo que toca>
```

Es la misma lección que la de abajo —«mira desde dónde corre»— en su versión
de despliegue, y la primera vez dejó a Mau fuera de su propia base de datos.

**Un `defineSecret` sin secreto detiene el deploy de TODAS las Functions.**
Es el hermano mayor de la lección de abajo, y muerde más fuerte. El `--only`
del CLI filtra **qué se despliega, no qué se analiza**: Firebase resuelve los
parámetros de todo el codebase antes de filtrar. El 5-oct, `enviarCorreo`
(tarea 64) declaraba dos `defineSecret` que no existían en Secret Manager —no
había credenciales de Exchange todavía— y eso tumbó el deploy de
`clasificarDocumento`, que no tiene nada que ver:

```
Error: In non-interactive mode but have no value for the secret CORREO_SMTP_USUARIO
```

Interactivamente no se arregla: pide teclear la credencial, y no existía.
La salida fue **comentar el export en `functions/src/index.ts`** con el
porqué y la fecha de reactivación. La regla que queda: **una Function cuyo
secreto todavía no existe no se exporta**. Se escribe, se prueba por el
emulador, y el export entra el día que entra el secreto.

**Un `defineString` nuevo detiene el deploy de Functions preguntando.**
Las tareas 40 y 51 declararon `N8N_WEBHOOK_URL_GENERAR_DOC` y
`N8N_WEBHOOK_URL_TIPO_CAMBIO` con `defineString`. `functions/.env` está en
.gitignore, así que una sesión automática NO puede escribirlos — y el deploy
se queda esperando a que alguien teclee el valor, con el default correcto
mostrado entre paréntesis. Firebase los guarda al terminar en
`functions/.env.vermur-logistics-app` y no vuelve a preguntar.
Al agregar un parámetro, decirlo en el reporte: el deploy deja de ser
desatendido.

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

**Hay DOS tipos de cambio y no compiten (tarea 56, 5-oct-2026).** Gaby: «que
no se use el TC del SAT o de Banamex, que se use el de pricing».
  - **El OPERATIVO es el de Pricing.** Con él se cotiza y se mide el profit.
    Es la fuente **por defecto** de una cotización nueva (`pricing_rate`, en
    sus dos formas: valor directo o regla sobre otra tasa). Se captura en la
    cotización, se congela ahí y el embarque lo hereda.
  - **El FISCAL es el FIX del DOF de Banxico**, y será el de la **factura**
    cuando exista el timbrado: el CFDI exige el publicado en el DOF, no el de
    Pricing. Hoy solo se **muestra como referencia** al lado de la captura
    («FIX Banxico del 2 oct 2026: 18.1903») y en el módulo Tipo de cambio.
    **No precarga ningún campo ni entra en ningún cálculo**; quien lo quiera,
    lo teclea. Un botón que precarga se aprieta por reflejo, y 18.19 se ve
    idéntico a 20.50 en el renglón del total: la diferencia aparece en el
    margen, semanas después.
  - La consulta automática **sí funciona** —el log del 2-oct guardó 18.3688
    (1-oct) y 18.1903 (2-oct)—; lo que no funcionaba era su PAPEL.
  - **Las cotizaciones viejas no se tocan**: una capturada con fuente Banxico
    o SAT conserva su tasa congelada, y al abrir la captura se dice.
  - Ver `lib/tipoCambioPricing.ts`.

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
· Documentos · Facturas · Historial. Información fusiona lo que eran General,
Entidades y Ruta —las tres secciones del encabezado del BL—, más Master/hijo
y la Bitácora al final (tarea 13, 29-sep-2026: Vermur pidió no brincar entre
pestañas). Plantillas se monta cuando exista el módulo; no se monta una
pestaña vacía.

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

## 4.16 Próximos pasos y ancho de página (feedback del cliente, 23-sep-2026)

**La franja de «próximos pasos»** va arriba de las pestañas de la cotización
(`components/quotes/ProximosPasos.tsx`, lógica en `lib/proximosPasos.ts`):
las etapas en línea con la actual resaltada, «Siguiente: …», el botón
principal a la derecha y, si no se puede avanzar, en una línea qué falta.
  - Las etapas visibles dependen del rol: Ventas sus cinco pasos
    (`LINEA_TIEMPO_VENTAS`), los demás las ocho internas
    (`LINEA_TIEMPO_INTERNA`).
  - El botón es la transición hacia adelante que la máquina de estados le
    dio a ESE rol (`HACIA_ADELANTE` + `transicionesDisponibles`). Si le toca
    a otra área, se dice: «le toca a Ventas». Si le toca a quien mira pero
    la máquina vetó por negocio, se explica qué falta —nunca «le toca a
    Pricing» a Pricing (`esDeEsteRol` vs `disponible`).
  - **El botón principal es siempre rojo de marca.** Los colores por etapa
    (azul, cian, violeta…) se retiraron; «Marcar ganada» como secundario va
    en verde contorneado.
  - El footer se quedó con lo secundario: PDF, perdida y el guardado
    automático. La línea del tiempo de Ventas en Información se retiró: la
    franja la reemplaza.

**Sin tope de ancho.** `App.tsx` ya no envuelve el contenido en
`max-w-[1100px]`: desktop ~1 cm de aire lateral (`md:px-[40px]`), móvil
16 px. Los formularios que quieren estar centrados lo dicen ellos
(`max-w-3xl mx-auto` en Información).

**Bloque 0 (24-sep-2026): ninguna línea nace vacía.** «Agregar concepto» en
la tabla y en la comparativa abría una línea sin nombre que el autoguardado
escribía al instante; abandonarla dejaba un «(sin nombre)» que bloquea
«Marcar ganada». Ahora el renglón es un borrador local del componente y la
línea existe solo al elegir el concepto del catálogo (`autoAbrir` en
`ConceptoSelector`). Las vacías que ya existan en producción las lista
`scripts/auditarServiciosPorCotizacion.ts`; borrarlas es decisión de Mau.

**Fase A (24-sep-2026): la operación se edita en Información, sin modal.**
El modal «Datos del embarque» editaba los campos legacy E4 y no leía la
carga tipada que captura la solicitud: lo que Ventas capturó no se podía
corregir en ninguna parte. Ahora Información tiene la sección «Operación»
(`components/quotes/OperacionServicio.tsx`, lógica en
`lib/operacionServicio.ts`): tráfico, ubicación, aduanas, embarque propio,
el MISMO `FormCargaServicio` de la solicitud editando `servicio.carga`
(ruta con puertos, incoterm, carga por modalidad, descripción y detalle de
mercancía), y `notasOperativas` (campo nuevo, texto libre).
  - Legacy: se lee con `cargaDesdeLegacy`; lo que la carga tipada no
    representa (`fcl_reqs`, food grade, FTL/LTL, medidas…) se enseña como
    «Del registro anterior», sin editor. Nada se reescribe hasta editar.
  - Quién edita (`puedeEditarOperacion`): Ventas en `solicitud_cliente`;
    Pricing y Admin hasta que se congele. Los demás leen.
  - Toda edición después de «A Pricing» deja UNA entrada en Historial /
    Notas («Datos de la operación modificados: se cambió la carga y la
    ruta»), acumulando las del mismo autor en diez minutos.
  - Los requeridos de Ventas no se editan en la ficha: ya son líneas.
  - En Servicios queda «Lo que pidió el cliente» en lectura.

**Errores del generador de PDF.** El proxy (`functions/src/comun/proxyN8n.ts`)
nombra al agente según el flujo —«el generador de PDF» o «el clasificador»—
y guarda hasta 4,000 caracteres de la respuesta de n8n con url, status y
content-type. El 404 de n8n significa **flujo no activado** y el mensaje lo
dice; fue la causa del 502 del 24-sep (`generar-pdf-cotizacion` inactivo).
El binario va de punta a punta sin pasar por `text()`; el proxy registra
los primeros bytes de lo que n8n entregó y rechaza con 502 lo que no
empiece con `%PDF-`.

**El PDF «roto» (24-sep-2026) era el flujo de n8n, no el proxy.** El nodo
«HTML a archivo» decodificaba el HTML como base64: 14 bytes de basura, PDF
de 7,883 bytes con una línea ilegible. Diagnóstico, reproducción con
Gotenberg local y el JSON corregido en `docs/n8n/`. **Los flujos de n8n se
versionan ahí**; el que manda es el de n8n.vermur.mx y lo importa Mau.

## 4.17 Restablecer contraseña (24-sep-2026)

«¿Olvidaste tu contraseña?» en el login → pantalla que pide el correo y
dispara `sendPasswordResetEmail` (`components/RecuperarContrasena.tsx`,
mensajes en `lib/recuperarContrasena.ts`, nunca un código crudo). El correo
es el de Firebase por defecto; `auth.languageCode = 'es'` lo manda en
español. La URL de regreso es el origen de la página (producción está
autorizada por Hosting); si Firebase la rechazara, se reintenta sin ella.
  - El enlace del correo lo atiende la página de Firebase (en español) por
    defecto. Si en la consola se apunta la URL de acción de la plantilla a
    la app, `?mode=resetPassword&oobCode=…` abre la pantalla propia:
    verifica el código (vencido / ya usado, en español), pide la
    contraseña nueva y regresa al login con el correo precargado.
  - El éxito es neutro («si ese correo tiene cuenta…»): Firebase puede
    tener activa la protección contra enumeración de correos.
  - Contra emuladores, el «correo» se lee en
    `GET 127.0.0.1:9099/emulator/v1/projects/vermur-logistics-app/oobCodes`.

## 4.18 Cliente vinculado y expediente validado (Bloques 2a y 2b, 25-sep-2026)

**Sin cliente vinculado no se gana ni se abre embarque.** Una regla
(`lib/frenoCliente.ts`) en tres call sites: la máquina de estados (`validar`
de toda transición a ganada: franja, selector, Kanban), la ruta automática
(`crearEmbarquesDeCotizacionGanada`) y la ruta manual de «Abrir embarque».
Sin salto para nadie. La franja ofrece «Vincular cliente →», que enfoca el
buscador de Información; el selector muestra «Ganada — sin cliente
vinculado» deshabilitada. El formulario de solicitud escribe `clienteId` al
elegir un cliente existente (antes nunca lo hacía: de ahí los huérfanos).

**El expediente del cliente** (`lib/frenoExpediente.ts`, junto al otro):
  - **Los importados de Magaya cuentan como validados de origen**:
    `origenDatos === 'magaya' || numeroEntidadMagaya`. Se LEE así, sin
    migración. Ficha: «Validado · heredado de Magaya». Administración puede
    validarlos formalmente si quiere.
  - **Los creados en VermurOps pasan por validación**: `expedienteValidado:
    { por, fecha, notas }` lo escribe quien tiene `cliente.alta`
    (Administración y admin) en Altas → ficha → Expediente, con el
    checklist de `docsAlta` completo o notas obligatorias. El modal de alta
    escribe `origenDatos: 'manual'`.
  - **Salto de admin, con justificación obligatoria** (ni vacía ni solo
    espacios). Queda como registro PERMANENTE: `saltoExpediente: { por,
    fecha, justificacion }` en la cotización (para que la ruta manual, con
    la bandera automática apagada, lo herede) y en cada embarque; nota en
    `actividades` y entrada en la bitácora. Nunca se pone en null.
  - **«Expediente pendiente» se calcula** (`expedientePendiente`): hay salto
    Y el cliente sigue sin validar. Al validar al cliente el aviso
    desaparece solo; el registro se queda.
  - Los puntos que ESCRIBEN exigen el expediente con `exigirExpediente`
    (fail closed); la máquina de estados lo evalúa solo si recibe el
    contexto `{ cliente }`, para explicar antes de intentar. El Kanban no
    tiene clientes en scope: su arrastre se detiene en el handler de ganada
    con la razón y manda a la ficha a justificar.
  - Reglas: `clientes` y `embarques` ya permitían `update` a cualquier
    autenticado; no hubo cambio de reglas. Las de rol siguen siendo deuda (§6).
  - El recorrido e2e tiene un paso nuevo: Administración valida el
    expediente del cliente antes de que Ventas marque ganada. Los clientes
    de desarrollo del emulador no vienen de Magaya.

## 4.19 La pestaña Información y el filtro de proveedores (Bloques 5 y 6, 25-sep-2026)

**Las pestañas de proveedores en Altas nunca filtraron.** Se pintaban desde
el checkpoint inicial como botones sin `onClick` y con el resaltado fijo en
«Todos». Y sus etiquetas —Navieras, Aerolíneas, Aduanales— no existen como
dato: el modelo tiene `tipos[] = proveedor | transportista | agente_carga`
y `modalidades[]` está vacío en los 544. Ahora las pestañas son esos tipos,
con su conteo (`lib/filtrarProveedores.ts`). Navieras y Aerolíneas vuelven
cuando `TipoProveedor` crezca (deuda §4.12). `SelectorProveedor` y
`ModalAgregarAgente` ORDENAN por modalidad sin excluir: no es el mismo bug.

**Información, sin selector de etapa y a dos columnas.** La barra de arriba
ya dice en qué etapa va. Lo único que solo se podía hacer desde el selector
era **regresar una etapa** (seis transiciones, una por etapa): ahora es el
botón «Regresar a …» de la franja, derivado de `salidasPara` —no de una
segunda tabla— con `pasoAtras` en `lib/proximosPasos.ts`. Respeta los
frenos de cliente y expediente. El motivo de pérdida y su captura se
quedan; «Marcar perdida» sigue en el pie.
  - Izquierda: Prospecto / Cliente. Derecha: Responsables y el consolidado.
    **Operación a todo el ancho**, porque su formulario de carga ya trae
    rejillas de tres y cuatro campos. Una sola columna por debajo de `lg`.

**El pie del consolidado mentía de dos maneras** (COT-2026-0031: «Basado en
0 servicios con proveedor» junto a $6,100):
  1. contaba solo la ruta B (`cotizacionesProveedor` seleccionada) mientras
     el total recorre las dos y cae a `conceptos` — la dualidad de §6
     asomando en la interfaz;
  2. **el total puede no venir de los servicios**: la ficha usa
     `quote.valorTotalConsolidado` —un campo GUARDADO— cuando es mayor que
     cero, y solo si no, calcula. Tres de las ocho cotizaciones de ejemplo
     están así.
  `lib/serviciosDelTotal.ts` dice de dónde sale el número: «Suma de N de M
  servicios con montos capturados» o «Total guardado en la cotización: sus
  M servicios no tienen montos capturados». Un test amarra que si el total
  derivado es mayor que cero, el conteo no puede ser cero.

**La campanita ya no trae notificaciones de ejemplo.** Eran cuatro
`notif-mock-*` de cotizaciones de demostración que todo Vermur veía en
producción. Queda vacía hasta que las de rol persistan (§6).

## 4.20 La paleta: el acento es morado, el rojo es peligro (Bloque 7, 25-sep-2026)

El rojo `#E11D48` estaba en TODO —540 ocurrencias en 71 archivos, casi
siempre hex pegado— y la aplicación se leía como si todo fuera una alerta.

**El color vive en tokens de `@theme` (`src/index.css`); el próximo cambio
es una línea.** `--color-primario: #4B2A8C`, el morado que la marca ya usaba
en la landing y en el badge de rol. Contraste 10.45:1 sobre blanco y blanco
sobre él: AA y AAA en texto normal. `--color-brand` se conserva como alias
porque hay clases `bg-brand` repartidas.
  - Acento (botones principales, pestaña activa, pasos de la barra, enlaces,
    item activo del menú, badges de estado, focos): `primario`.
  - **Rojo `--color-peligro` SOLO para**: errores, campos inválidos, frenos
    (cliente sin vincular, expediente sin validar), toasts de error y
    acciones destructivas (Marcar perdida, borrar). Nada más.
  - Armazón: menú lateral y encabezado en blanco (`--color-shell`), texto e
    iconos negros, item activo en morado, separados del contenido por un
    borde. El logo ya no lleva la caja blanca que lo resaltaba sobre el
    fondo oscuro. El login conserva su fondo oscuro.
  - El badge de rol «admin» era rojo y se confundía con peligro: pasa a
    morado.

**NO se tocan el PDF de la cotización ni la plantilla de n8n**: son
documentos de cara al cliente con la identidad de Vermur.

«Portal del Cliente» sale del encabezado, y con él su estado y su ruta, que
quedaban inalcanzables. Vuelve como ROL cuando exista Usuarios y roles.

## 4.21 Parche de reglas: solo el equipo (Bloque 9, 26-sep-2026)

Mientras el rol no viaja en el token, el acceso pasa de «cualquier
autenticado» a «un correo del equipo». Una función `esDelEquipo()` en
`firestore.rules` (57 condiciones) y en `storage.rules` (8), no la lista
repetida. Storage importa especialmente: ahí vive el expediente KYC con
actas y RFC.
  - **No condiciona a `email_verified`**: las seis cuentas del equipo lo
    tienen en false y quedarían fuera.
  - Se compara en minúsculas (`.lower()`), para que una sesión con el
    correo capitalizado no se quede afuera.
  - **Las cuentas de prueba NO están en las reglas de producción.** El
    recorrido las necesita, así que `scripts/reglasEmulador.sh` DERIVA
    `firestore.emulador.rules` y `storage.emulador.rules` de las de
    producción, inyectando las cinco cuentas entre los marcadores
    EQUIPO:INICIO / EQUIPO:FIN; los emuladores arrancan con
    `firebase.emulador.json`. Una sola fuente de verdad: mantener dos
    archivos a mano los deja divergir, y el recorrido pasaría con unas
    reglas mientras producción corre con otras. Los derivados están en
    .gitignore.
  - `npm run test:reglas` levanta emuladores efímeros en 8085/9195 —para no
    chocar con los del recorrido— y corre 13 tests contra las reglas de
    PRODUCCIÓN: el equipo lee y escribe; un autenticado fuera de la lista
    no toca nada, ni una cuenta de prueba; sin sesión, nada; y lo que el
    parche no cambia (no se borran cotizaciones, una notificación solo la
    lee su destinatario).
  - **Una cuenta recién invitada que no esté en la lista no entra.** Hasta
    que existan los claims, invitar a alguien implica agregar su correo
    aquí y desplegar las reglas.

## 4.22 Lo que agregó la cadena 35 → 55 (2-oct-2026)

Publicada completa: reglas de Firestore y Storage, tres Functions nuevas y
hosting. Lo que cambia de cómo se trabaja:

**El tipo de cambio ya no se inventa.** `tipoCambioProgramado` consulta el
SIE de Banxico por n8n seis veces al día en días hábiles (8, 10, 12, 14, 16
y 18, hora de la Ciudad de México) y guarda `tiposCambio/{YYYY-MM-DD}` más
`configuracion/tipoCambio` con la vigente. `actualizarTipoCambio` es la
misma lógica a mano desde la pantalla.
  - **El navegador LEE, no escribe.** Las dos rutas tienen `allow write: if
    false`: lo escribe el Admin SDK, que no pasa por reglas, y la captura
    manual va por la Function. Abierto al cliente, cualquiera del equipo
    movería desde la consola la tasa con la que se cotiza y se factura.
  - Responde el pendiente 4 de §4.8 en su parte de fuente; falta confirmar
    si Pricing le carga un diferencial.

**Documentos operativos (40 y 41).** `configuracion/empresa` guarda lo que
encabeza cada documento (razón social, RFC, domicilio, logo), editable en
Configuración → Mi empresa. `generarDocumento` llena una plantilla HTML,
la manda al flujo `generar-documento` de n8n (Gotenberg) y guarda el PDF en
Storage. El primero es la **notificación de arribo**, con los cargos
separados por moneda (§4.3). Es el arranque del motor de plantillas.

**La factura del proveedor se lee en el navegador (55).** `parsearCFDI` usa
`DOMParser` para sacar UUID, RFC, montos e IVA de un CFDI 4.0 o 3.3, sin
n8n y sin servidor. Tres avisos: RFC que no coincide, total que difiere de
la OC, UUID duplicado. Storage acepta en
`ordenesCompra/{id}/factura/` **solo PDF y XML**, máximo 10 MB, sin update
ni delete: ahí solo van documentos fiscales y una factura corregida es una
factura nueva.

**El expediente KYC ahora es de los dos lados (38 y 54).**
`lib/estadoValidacion.ts` es la función compartida (validado /
heredado_magaya / sin_validar) y `frenoExpediente.ts` delega en ella. El
proveedor tiene su pestaña Expediente con el mismo `ExpedientePanel` que el
cliente.

**Días de crédito por modalidad, de punta a punta (35 y 37).** En una
cotización multimodal el financiamiento se calcula **por servicio**, con los
días de la modalidad de ese servicio, y se suma; el resumen dice de dónde
salieron (`lib/diasCreditoServicio.ts`). Es §4.6 aterrizado. El cliente
suma `regimenFiscal` (catálogo del SAT) y la columna «Fiscal» en Altas.

**Las acciones de las fichas viven arriba (44 y 50).** PDF, Marcar perdida,
Autorizar, Pagar, Guardar — todo lo que estaba en el pie subió al
`FichaHeader`; en angosto las secundarias se colapsan. El pie se quedó con
el auto-guardado.

**Barridos como red (43, 45, 47).** 34 tests e2e de los 43 filtros de las 14
pantallas con listas, y 95 que entran con cada rol a cada pantalla buscando
errores de consola, peticiones fallidas, textos rotos, permisos fuera de
§4.1 y desbordes a 390 px. Los dos en verde. Si tocas una lista o una
pantalla, córrelos:
```bash
npx playwright test tests/e2e/45-filtros.spec.ts tests/e2e/47-barrido-general.spec.ts --workers=1
```

**Una sesión del sprint hizo el trabajo de tres tareas.** La de la 52
produjo también 53, 54 y 55, sin pasar por el lanzador: hay commits y no hay
logs. Por eso esa cadena se verificó **mutando el código** —romper una regla
y contar cuántos tests se caen— en vez de confiar en el reporte. Está en §7
de `docs/sprint-post-junta/AUDITORIA-35-48.md`. Un sprint autónomo puede
entregar código correcto sin entregar evidencia; son cosas distintas.

## 4.23 Cuentas bancarias, OneDrive y el dato de ejemplo (tarea 57, 5-oct-2026)

**Son SIETE cuentas, no cuatro** (`BANCOS_VERMUR` en `lib/cuentasPago.ts`):
Santander gastos, Santander impuestos, BBVA, Banorte, Monex pesos, Monex
dólares y PartnerPay (USD, mínimo 80). Cada una con su uso en una línea, que
el selector muestra. Antes «Santander» cubría gastos e impuestos en un solo
renglón, «Monex» solo existía en dólares y BBVA no aparecía — y Julio concilia
el mes **por cuenta**, así que juntarlas lo obliga a separarlas a mano.
  - **Los ids viejos se LEEN, no se migran.** `resolverBancoVermur` mapea
    `santander` → gastos (el caso común; cuál era no se puede adivinar) y
    `monex` → dólares (era la única que había). `opcionesBanco(valorGuardado)`
    agrega el valor guardado al selector cuando ya no está en la lista: un
    `<select>` cuyo value no existe entre sus opciones se pinta en la primera
    y parece que alguien eligió esa. El renglón lo dice y se puede corregir.
  - **BBVA y Monex pesos nunca se SUGIEREN.** BBVA es de entrada —y por eso
    es el default al registrar un cobro (`BANCO_COBRO_DEFAULT`)— y de Monex
    pesos nadie dijo qué sale por ahí. Se eligen a mano; inventarles un
    criterio pondría pagos en la cuenta equivocada con cara de sugerencia.
  - La lista vive en código, no en Firestore. Abrir otra cuenta sigue siendo
    un commit; pasarla a catálogo es decisión pendiente.

**El expediente del cliente está en OneDrive, no en Google Drive.** Cambió la
etiqueta («Carpeta en OneDrive» en la ficha, columna «OneDrive» en Altas con
su filtro Con carpeta / Sin carpeta); **el campo de la base sigue siendo
`expedienteDrive`**, porque 817 clientes ya lo traen y renombrarlo solo
cambiaría una etiqueta interna. El filtro vive en la barra y no en la tabla:
`SpreadsheetTable` todavía no tiene filtros por columna — el `filterFn` de la
columna «Fiscal» existe y nadie lo llama (otra regla sin call site).

**Un folio de ejemplo se copia a un correo.** Finanzas → «Nueva Factura
(CFDI 4.0)» anunciaba «Folio siguiente: F-2023-088» escrito en el código y
timbraba con un `alert()`; alrededor vivían cuatro facturas con RFC, UUID y
montos a mano, y `FichaFactura` fabricaba un XML CFDI 4.0 completo con el RFC
de Vermur, PAC y certificado falsos. Nada estaba conectado y el botón que
abría la pantalla ya se había retirado: **la pantalla era inalcanzable y el
código seguía ahí**, listo para volver con un `setShowForm(true)`. Se quitó
completo; la pestaña dice lo que pasa con `ModuloEnDesarrollo`.
  - El barrido pedido por la tarea encontró lo mismo en «Exportar» de
    Cotizaciones, que bajaba `cotizaciones_export.csv` con las cuatro
    cotizaciones de ejemplo de `src/data.ts` (QT-1001…, fechadas en 2023) en
    vez de las de la pantalla. Ahora exporta los renglones visibles, con
    total y moneda en columnas separadas (§4.3).
  - **Reservas (`Bookings`) y Recolecciones (`Pickups`) son rutas
    huérfanas**: `App.tsx` las rutea y `users.ts` se las da a admin, pero el
    menú lateral no tiene entrada para ellas ni con admin, y nadie llama a
    `safeNavigate('bookings')`. Traían `BKG-2023-014` y `PK-2023-110` con
    contactos y teléfonos inventados; quedaron en `ModuloEnDesarrollo` porque
    una entrada de menú los hubiera vuelto visibles de golpe.
  - Lo que **queda con datos de ejemplo, sin tocar**: `Customs.tsx`,
    `Documents.tsx`, `ClientPortal.tsx`, `Warehouse.tsx`, `Pricing.tsx` y
    `pricing/PricingData.ts` — ninguno está importado por nada, son archivos
    huérfanos— y los seeds de `src/data.ts`, que sí alimentan los prospectos
    y el Kanban de demostración.

## 4.24 Cuentas por pagar: un renglón por factura (tarea 58, 5-oct-2026)

Julio vio IDAMEX dos veces en la vista por proveedor. **No eran datos
duplicados:** las dos pantallas de Cuentas por pagar cuentan ÓRDENES, y un
proveedor emite UNA factura por todo lo que prestó (§4.14). Reproducido en
emulador: tres órdenes de IDAMEX, dos de ellas cubiertas por la misma
F-IDA-1201, se veían como tres renglones. Quien ve tres renglones programa
tres pagos.

**La unidad de lo que se debe es la FACTURA, no la orden**
(`lib/facturasProveedor.ts`, 21 tests). Qué la identifica, en orden de
confianza: `facturaUUID` (el folio fiscal del CFDI) → `facturaDatos.numero`
(lo que leyó el clasificador) → `facturaAsociada` (lo tecleado), siempre
**dentro del mismo proveedor**: el «A-001» de dos proveedores son dos
facturas. El número se compara sin guiones, espacios ni mayúsculas.
  - **Una orden sin factura NO se agrupa con las otras sueltas**: es su
    propio renglón y lo dice. Juntarlas afirmaría que existe una factura que
    nadie ha visto.
  - Totales **por moneda** (§4.3), estado el **menos avanzado** de sus
    órdenes, y la fecha de pago **más próxima** — con aviso «fechas
    distintas» cuando no coinciden, porque una factura se paga de una vez.
  - Una orden rechazada no suma ni decide el estado: no existió.

**En pantalla:** toggle «Por proveedor | Por orden» en Cuentas por pagar,
**default proveedor**, preferencia por usuario en `preferenciasUsuario/{uid}`
(`vistaCuentasPorPagar`), como la de cargos. El proveedor aparece una vez,
con sus facturas dentro; abrir una enseña concepto, estado y monto de cada
orden. «Por orden» conserva la tabla de siempre con sus filtros.

**El COD va en el renglón, no escondido tras la expansión.** El folio de cada
orden es un enlace a su ficha, que ya regresa a Cuentas por pagar. Esconderlo
rompió el recorrido: quien trae un folio en la mano lo busca a la vista.
Lo atrapó `./scripts/e2e.sh` en el paso 5, no los tests unitarios.

**Programación de pagos NO cambia de agrupado.** Una transferencia es por
proveedor, fecha y moneda, y eso es correcto: dos monedas son dos
transferencias (§4.3). Lo que cambia es que cada tarjeta **dice qué factura
cubre**, para que el mismo proveedor en dos tarjetas se entienda en vez de
parecer un duplicado.
  - Pendiente anotado: una factura repartida en órdenes con fechas de pago
    distintas sigue produciendo DOS transferencias. Decisión de negocio
    (¿se adelanta todo a la fecha más próxima?), no de interfaz.

## 4.25 El tráfico del embarque se deriva, y con él el mes de cierre (tarea 59, 5-oct-2026)

Julio cierra el mes por importación / exportación y por modalidad, y desde la
lista de Embarques el tráfico **no se veía en ninguna parte**: vive en el
prefijo del folio (VLIM, VLEM…), que hay que saber leer, y en los embarques
cuyo folio viene de Magaya —`BOL 9016543`, `EASHA2406487`, `SHP-26-0001`— no
está ni ahí.

**No se agregó campo `trafico` al embarque: se DERIVA** (`lib/traficoEmbarque.ts`,
18 tests, más 6 de los filtros), por la misma razón por la que `traficoDeFolio` ya existía en vez de
duplicarlo — un dato duplicado es un dato que se desincroniza. Dos fuentes, en
este orden:
  1. **El folio** (`traficoDeFolio`): es lo que reservó la serie al abrir el
     embarque (§4.15) y lo que se imprime. **Manda sobre la ruta.**
  2. **La ruta** (`resolverTrafico`): destino en México es importación, origen
     en México es exportación (§4.2). Es la MISMA derivación que ya usan la
     cotización y el IVA; `resolverTrafico` pasó a un parámetro estructural
     (`EntradaTrafico`) para que el embarque le pase sus puertos en vez de
     copiar las listas de pistas.
  3. Si ninguna alcanza —nacional, cross-trade, ruta vacía—, `null`. La
     columna pinta «—» con el motivo en el tooltip. Un embarque marcado así se
     corrige; uno clasificado mal se cuenta en el mes equivocado.

**El mes de cierre usa la fecha del lado mexicano de la operación**, que es la
misma dimensión de la regla espejo del IVA (§4.2):

    Importación → la mercancía LLEGA a México → fecha de ARRIBO (ETA)
    Exportación → la mercancía SALE de México → fecha de SALIDA (ETD)

Es **una** fecha por embarque, no las dos: si uno cayera en el cierre de dos
meses, los totales de Julio no cuadrarían con ninguno. Un embarque sin la
fecha que su tráfico exige no cae en ningún mes —mismo criterio que el rango
de fechas que ya existía— y el encabezado de la lista **dice cuántos quedaron
fuera**, para que un cierre incompleto no pase inadvertido. Tráfico
desconocido usa el arribo, que es la fecha por omisión de la lista.

**Los dos filtros se guardan con la vista** (`VistaUsuario.filtros`) y se
combinan con el de modalidad: «mis importaciones aéreas de septiembre» son
tres filtros juntos. Un valor basura guardado en una vista se descarta al
leerla en vez de dejar la lista vacía sin explicación.
  - La columna «Tráfico» entra a la vista por defecto; las vistas ya guardadas
    conservan sus columnas y pueden agregarla a mano.
  - El CSV de la lista suma «Tráfico» y «Mes de cierre».

## 4.26 Contactos del cliente: varios, con tipo, y se desactivan (tarea 60, 5-oct-2026)

**169 de los 817 clientes ya traían contactos de Magaya y ninguna pantalla
los enseñaba.** El dato estaba importado (`contactos[]`, con `id: 'cnt-1'` y
`tipo: 'general'`, los 169 iguales) y la ficha del cliente no tenía dónde
verlo: solo el PDF de la cotización lo leía, para sacar el correo del
principal. Es una variante de «regla sin call site»: el dato existe y nadie
lo mira.

**El editor es UNO solo** (`components/ui/EditorContactos.tsx`), con las
reglas en `lib/contactos.ts` (26 tests). Vivía pegado dentro de
`ProveedorFormModal` —estado, altas, bajas y el radio de «principal»— así que
el cliente no podía reusarlo. Ahora lo usan los dos, y las dos diferencias
legítimas son props:
  - **`tipos`:** el cliente clasifica a sus contactos con los cinco que pidió
    Vermur —dueño, quien pide la unidad, quien manda la factura, quien
    monitorea, otro—; el proveedor no.
  - **`modoBaja`:** el cliente **desactiva**, el proveedor conserva el
    borrado que ya tenía. Cambiarlo también en proveedores es otra tarea.

**Se desactiva, no se borra.** Una persona que dejó la empresa del cliente
sigue siendo quien firmó el correo de hace seis meses; borrarla deja ese
correo sin autor. `activo` ausente = activo, y solo se escribe al desactivar.
  - **Desactivar al principal TRASPASA el principal** al primer activo que
    quede. Si no, `contactoParaAvisos` —que usa el PDF de la cotización—
    seguiría apuntando a quien ya no trabaja ahí, y el PDF se vería
    perfectamente bien.
  - Si no queda ninguno activo no se sugiere a nadie: mandarle la cotización
    a alguien dado de baja es peor que no sugerir contacto.

**El `tipo: 'general'` de Magaya se LEE como «sin tipo» y se conserva tal
cual.** `tipoContactoConocido` devuelve null para cualquier valor que no sea
de los cinco, el renglón lo enseña como «Magaya: general» y el selector queda
en «Sin tipo». Nada se reescribe hasta que alguien lo cambie a mano:
reescribir 169 contactos para que digan lo mismo con otra palabra no es un
arreglo, es ruido en la bitácora.

**Lo que se guarda** (`contactosParaGuardar`): recorta, convierte '' en null,
**descarta las líneas sin nombre** —la misma trampa del Bloque 0 en la tabla
de la cotización— y, si al descartarlas se fue el principal, lo toma el
primer activo. `vaciosComoNull: false` para el proveedor, cuyo modelo declara
`email: string`.

**Quién edita:** `cliente.alta`, igual que el resto de la ficha
(Administración y admin). Los demás leen, con el fieldset deshabilitado que
ya tenía la ficha. La pestaña dice cuántos ACTIVOS hay: «Contactos (3)».

## 4.27 Finanzas con vistas guardadas, y el CSV que sale de la vista (tarea 61, 5-oct-2026)

Julio opera Cuentas por pagar con filtros y arma el cierre con columnas
distintas a las de la bandeja. `SpreadsheetTable` —el de Altas y Embarques—
entra a las dos pantallas de Finanzas, con el mismo selector de vistas:
columnas que se eligen, reordenan y ajustan, vistas con nombre, una
predeterminada y compartibles.

**Los filtros se guardan CON la vista** (`VistaUsuario.filtros`, como §4.12),
en `lib/filtrosFinanzas.ts`. «Lo autorizado en pesos que todavía no se paga»
deja de ser tres clics cada mañana. Un valor basura guardado se **descarta al
leer la vista** en vez de dejar la lista vacía sin explicación — misma regla
que los filtros de Embarques (§4.25).
  - Módulos nuevos de `vistasUsuario`: `cuentasPorPagar` y `cuentasPorCobrar`.
    Son ids NUEVOS: ninguna vista ya guardada cambia de módulo.
  - En Cuentas por cobrar **«Abiertas» es el default, no «vacío»**: si contara
    como filtro puesto, la pantalla diría «1 filtro» al entrar sin que nadie
    tocara nada.

**El CSV sale con las columnas DE LA VISTA** (`lib/exportarVista.ts`, 9
tests). Antes cada pantalla llevaba su lista de encabezados escrita a mano al
lado de la tabla, así que **agregar una columna la dejaba fuera del archivo**
— y el cierre de mes se arma con ese archivo. Ahora el catálogo de columnas es
la única fuente. Una columna que pinta badges, enlaces o iconos declara su
valor plano en `meta.csv`; sin eso se usa el accessor. Una columna que la
vista nombra y el catálogo ya no tiene se ignora, igual que hace la tabla: el
export no puede tronar justo para quien tiene la vista más vieja.

**Lo que había no se perdió.** Filtros por estado con su conteo, badge de IVA
(36), enlaces a la orden y al embarque, el pie por moneda. **«No pagar» sube
de badge a columna Y filtro**: es la razón por la que una orden autorizada no
aparece en Programación de pagos, y poder aislarla es poder destrabarla.
  - **Monto y moneda son DOS columnas** (§4.3). Una sola «$12,000» ordenada de
    mayor a menor pone 900 USD debajo de 12,000 MXN, y el renglón se lee como
    si fuera menos dinero.

**Lo que NO cabe en la tabla genérica se dejó como está**, dicho:
  - **El agrupado por cliente de Cuentas por cobrar**, con su total por cliente
    y por moneda: una tabla plana no tiene encabezado de grupo. Se conserva tal
    cual y **sigue siendo el default**; la tabla es la otra mitad del toggle
    «Por cliente | Por factura».
  - **La vista por proveedor de Cuentas por pagar** (§4.24), por lo mismo.
  - Las dos preferencias de toggle viven en `preferenciasUsuario/{uid}`
    (`vistaCuentasPorPagar`, `vistaCuentasPorCobrar`), como la de cargos.
  - El selector de vistas **solo aparece en el modo tabla**: en el agrupado no
    hay columnas que elegir y ofrecerlo prometería lo que esa vista no cumple.

## 4.28 Un solo botón de documentos, y el tipo lo propone el agente (tarea 63, 5-oct-2026)

Gaby: «se vuelven 15 documentos… me equivoqué, puse la constancia en el acta».
Un botón por casilla obliga a acertar la casilla **antes** de abrir el
archivo, y el error queda guardado con cara de correcto: la constancia
aparece como acta y el checklist afirma que el acta está.

**Ahora el tipo se propone DESPUÉS de leer el documento**
(`lib/loteDocumentos.ts`, 32 tests; `components/documentos/SubirDocumentosLote.tsx`).
Un botón «Subir documentos» acepta hasta 15 archivos, cada uno sube a Storage
y pasa por `clasificarDocumento`, y la **lista del lote ES la pantalla de
revisión** (§4.10): nada toca Firestore hasta confirmarla. Lo que
`RevisionDocumentoClasificado` hace con un documento, en plural y sin modal —
con 15 archivos, 15 modales encadenados son peores que el problema.

Está en los tres lugares que pidió la tarea: expediente del cliente,
expediente del proveedor (vía `botonLote` de `ExpedientePanel`) y la ficha de
la orden de compra.

**La clasificación es de MEJOR ESFUERZO.** Si el agente no contesta, se
equivoca o devuelve un tipo que este contexto no tiene, el renglón queda
«Sin clasificar» y lo resuelve la persona; el archivo ya está en Storage y no
se pierde. Tirarlo porque la IA no contestó castigaría al usuario por una
falla de infraestructura, y en un lote de 15 uno así tiraría los 15.
  - **Un tipo desconocido NO se fuerza al más parecido.** Un BL en el
    expediente del cliente queda sin clasificar, no como «acta». Adivinar la
    casilla es el error de Gaby escrito en código.
  - Los nombres equivalentes viven en **grupos**, no en un mapa dirigido: el
    expediente del cliente indexa `constancia_situacion_fiscal` y el del
    proveedor `csf` (su clave en `DocsAlta`), y los dos resuelven con el mismo
    grupo. Lo ambiguo se deja fuera a propósito: «comprobante» a secas es de
    domicilio en el expediente y de pago en la orden.
  - **Dos archivos del mismo tipo se avisan** cuando el destino guarda uno por
    tipo (los dos expedientes son mapas): el segundo pisa al primero y hay que
    saberlo antes de guardar. La orden guarda una LISTA, así que ahí conviven
    —dos transferencias son dos comprobantes— y no se avisa de lo que no es un
    problema.
  - **La casilla no es la validación.** Que el documento esté y el agente lo
    reconozca marca su casilla de `docsAlta`; validar el expediente sigue
    siendo de Administración con su botón (§4.18). Lo único que cambió es cómo
    llega el archivo.
  - Por casilla solo queda **«Reemplazar»**, y solo donde ya hay archivo: ahí
    el destino no se adivina. En el cliente pasa por la revisión de uno, que
    es la que ofrece adoptar RFC y domicilio (D-2); en el lote esos datos se
    ofrecen **después de guardar**, con el mismo criterio de confirmación
    explícita.
  - **Quién corrigió el tipo queda escrito** (`textoCorreccionTipo`) con las
    dos cosas: qué leyó el agente y qué decidió la persona. Guardar solo lo
    segundo esconde que el clasificador se equivocó, que es justo lo que hay
    que ver para arreglar el flujo de n8n. Vive en `observaciones`, el campo
    que ya existía. El expediente del proveedor no lo persistía —
    `ArchivoExpediente` no tenía dónde—; **lo cierra la tarea 71** (§4.34).

**Los complementos de pago del proveedor ya tienen dónde ir** (§4.24): la
orden de compra tiene `documentos?: DocumentoOC[]`, lista **opcional y
aditiva**, con factura, complemento de pago, comprobante de pago y cotización
del proveedor. `facturaArchivos` (tarea 55) no se toca: ahí sigue el PDF y el
XML con parseo de CFDI y cotejo contra el monto.
  - El flujo nuevo es `documento-oc`, con capacidad **`ordenCompra.solicitar`**
    — la tienen las tres áreas que tocan una orden; `gestionar` dejaría fuera a
    Administración y `autorizar` a Operaciones. El espejo de capacidades de
    `functions/src/comun/auth.ts` no traía NINGUNA de `ordenCompra`.
  - **El webhook `clasificar-documento-oc` todavía no existe en n8n**: hasta
    que se importe, los archivos de la orden caen como «Sin clasificar» y el
    tipo se elige a mano. Y `N8N_WEBHOOK_URL_DOC_OC` es un `defineString`
    nuevo: el deploy de Functions deja de ser desatendido.
  - Los archivos van a `ordenesCompra/{id}/factura/`, que es la única ruta de
    la orden con regla publicada, y **acepta solo PDF y XML**. Una carpeta
    `documentos/` que acepte imágenes necesita su propia regla de Storage.

## 4.29 Correo saliente por Exchange, listo para credenciales (tarea 64, 5-oct-2026)

**Vermur usa Exchange de Microsoft 365, no Gmail.** El canal es
`smtp.office365.com:587` con STARTTLS, y es de **notificaciones del sistema**:
un buzón, no el correo personal de quien aprieta un botón. Microsoft 365
rechaza con 5.7.60 (SendAsDenied) un `From` que no sea el buzón autenticado,
así que dejar que cada quien ponga el suyo daría un rechazo distinto por
persona.

**Nada está conectado todavía.** `enviarCorreo` existe, se prueba y no la
llama ninguna notificación. Las de rol siguen sin llegar a nadie (§6);
conectarlas es otra tarea, con su decisión de qué se avisa por correo.

**Las credenciales son secretos de Secret Manager** (`defineSecret`):
`CORREO_SMTP_USUARIO` y `CORREO_SMTP_PASSWORD`. **Hay que crearlos ANTES de
desplegar**: una Function que declara un secreto inexistente no despliega.
Host, puerto y nombre del remitente, en cambio, NO son `defineString`: tienen
default en el código y override por variable de entorno, porque cada
`defineString` nuevo detiene el deploy preguntando (§3) y las tareas 40 y 51
ya pusieron dos. Ver `functions/src/correo/configuracionSmtp.ts`.

**Dos puertas a la misma lógica**, como `tipoCambio.ts`:
  - `enviarCorreoInterno(correo)` para otras Functions. Quien lo importe tiene
    que declarar `SECRETOS_CORREO` en sus `secrets`: un secreto que la función
    no declara no llega a su `process.env`. **No lanza cuando el envío falla**,
    devuelve `ok: false` con el diagnóstico — que el flujo de una orden
    autorizada se caiga porque el correo está mal sería peor que el aviso que
    no llegó.
  - `enviarCorreo` HTTP para el botón de Configuración → Integraciones, con
    capacidad **`correo.probar`, solo admin**. Solo manda el correo de prueba:
    el cuerpo libre no se acepta desde el navegador, o el buzón de Vermur
    sería un relay para quien tenga sesión.

**El modo `captura` es lo que hace probable el armado sin credenciales.** En el
emulador el mensaje se construye completo y **no sale**; la pantalla lo pinta
en AZUL y no en verde, porque verde haría creer que llegó.
**Producción es siempre `smtp`**: sin credenciales falla con etapa
«configuración» en vez de fingir un envío (§3). Se verifica con
`npx tsx scripts/probarCorreo.ts` (con `CON_FUNCTIONS=1 ./scripts/dev-emuladores.sh`),
que además comprueba los 403/401/400.

**Las cuatro causas se distinguen, y una no la arreglamos nosotros.**
`diagnosticoDeFalla` separa configuración · conexión · autenticación · envío.
El caso que más va a aparecer la primera vez es **SMTP AUTH apagado**: en
Microsoft 365 el envío por SMTP con usuario y contraseña viene APAGADO por
omisión, contesta `535 5.7.139 … SmtpClientAuthentication is disabled for this
mailbox`, **se lee como contraseña mala y no lo es**, y lo enciende el
administrador de Exchange para ESE buzón. Se detecta antes que cualquier otro
error de autenticación y la pantalla enseña los pasos del centro de
administración. Un fallo genérico mandaría a cambiar una contraseña que está
perfecta.

**El texto plano se deriva del HTML** (`textoDesdeHtml`): un correo que solo
trae HTML cae más seguido en correo no deseado. El `&rarr;` de «Configuración
→ Integraciones» llegaba crudo al cuerpo, y lo atrapó el envío por el
emulador, no un test — las entidades se resuelven con `&amp;` al final, para
no decodificar dos veces.

**Las otras cinco tarjetas de Integraciones decían «Conectado»** con el estado
escrito en el código, y ninguna lo está. Es lo mismo que el folio inventado de
la 57. Un «Gmail Workspace · Conectado» junto a la tarjeta nueva se lee como
que el correo ya salía por Gmail. Quedan como catálogo de lo pedido, con
estado «Sin construir» y sin botón que prometa un flujo inexistente.

## 4.30 Carga de «Clientes OK»: en seco, sin pisar y sin adivinar (tarea 65, 5-oct-2026)

La base no trae RFC ni días de crédito y Magaya sí los tiene; Luis entregó la
lista buena, «Clientes OK». **La lista todavía no está en el repo**, así que lo
que se construyó es el script y su mapeo configurable, probado con un archivo
sintético (`scripts/fixtures/clientes-ok-sintetico.csv`) con los casos
difíciles. Lógica en `lib/cargaClientesOk.ts` (58 tests), el script en
`scripts/cargarClientesOk.ts` y la reversa en `scripts/revertirCargaClientes.ts`.

**Lo corre Mau, no el script solo.** En seco por omisión: sin `--aplicar` no
escribe un campo. `--columnas` inventaría los encabezados sin pedir
credenciales. Sin `SERVICE_ACCOUNT` ni `FIRESTORE_EMULATOR_HOST` falla limpio.

**El dato está donde el export lo dejó, no donde debería.** El consecutivo de
Magaya vive en `referenciaMagaya` (817 de 817) y el Tax ID en
`numeroEntidadMagaya` (318 de 817, `rfc` en 0) — lo levantó la tarea 42. Por
eso el empate mira los dos campos en cada llave: **número de entidad → RFC →
nombre normalizado**, y `rfcEfectivo` cae al Tax ID de Magaya cuando pasa
`validarRFC`. Empatar solo contra `rfc` fallaría justo en los clientes que SÍ
tienen RFC.

**Tres reglas, y las tres niegan una escritura:**
  - **Lo capturado a mano no se pisa.** Un valor distinto en VermurOps es
    CONFLICTO: se lista con los dos valores y se queda como está. Quien lo
    resuelve es Julio.
  - **Lo que no viene en la lista no se toca.** «Reemplazar la base» no es
    borrar: los ausentes se listan. Nada se borra, nada se desactiva, no se
    crean clientes — un renglón sin empate se reporta como «nuevo» para que
    Julio decida el alta.
  - **Un empate dudoso no se adivina.** Dos clientes con el mismo nombre
    normalizado («UNO RETAIL» y «UNORETAIL», que existen) es AMBIGUO y no se
    escribe nada; y **dos renglones que reclaman al mismo cliente tampoco se
    escriben** (`clientesConVariosRenglones`), porque escribir los dos deja el
    valor del último renglón del archivo y nadie sabría que hubo otro. Es el
    duplicado del que Luis avisó, «FIBREMEX SA de CV» contra «FIBREMEX».
  - Cuando una llave fuerte empata y los nombres no se parecen, el empate se
    respeta **y se dice**: un RFC tecleado en el renglón equivocado le
    escribiría su régimen y su responsable a otro cliente.

**El cero de Magaya cuenta como vacío.** 742 de los 817 traen los cuatro
plazos en cero porque Magaya no los tenía. Tratarlo como «capturado» pondría
la lista entera en conflicto y la carga no serviría de nada. Un plazo mayor
que cero sí es un dato. El escalar legacy `dias` sigue al general para que no
divergan (la ficha lee `diasCreditoPorTipo.general ?? dias`).

**La marca «Heredado de Magaya» solo se completa en quien ya se lee así.** Un
cliente con `origenDatos: 'manual'` NO se marca: marcarlo lo movería de
`sin_validar` a `heredado_magaya` y con eso levantaría el freno de expediente
(§4.18) de alguien que Administración no validó. Que un nombre aparezca en la
lista de Magaya no es la validación del expediente. Por lo mismo **no se
escribe `numeroEntidadMagaya`**, aunque el renglón lo traiga: ese campo decide
el mismo freno. El enlace se sugiere en la salida.

**Lo inválido se reporta, no se carga:** un RFC que no pasa estructura y
dígito verificador del SAT, un Tax ID extranjero (`DE253556233`), un CP que no
es de cinco dígitos (`M6H 1C2`), un régimen fuera de `c_RegimenFiscal`,
«contado» en la columna de días, y un responsable de ventas que no empata con
ningún usuario de la plataforma — ese se lee de `usuarios/{uid}` con el mapa
del equipo como respaldo, y si no empata **no se inventa el correo**: los
filtros de «Solo los míos» apuntarían a una cuenta que no existe.

**El respaldo distingue «valía null» de «no existía».** `presente: false` en
el respaldo hace que la reversa BORRE el campo (`FieldValue.delete()`) en vez
de dejarlo en null: un `rfc: null` escrito donde no había nada se ve igual en
pantalla y no es el mismo documento — `estadoFiscal` y los filtros de Altas
leen la ausencia. El respaldo se arma con el documento del servidor en el
momento de escribir, no con lo que se leyó al empezar, e incluye `updatedAt`.
Vive en `scripts/respaldos/`, ignorado por git: es una foto de datos reales.

**Mapeo de columnas en UN lugar.** `ALIAS_COLUMNA` acepta encabezados en
español e inglés, con acentos y puntuación (se comparan normalizados), y el
delimitador se detecta solo fuera de comillas — Excel en es-MX exporta con
`;` y una razón social con coma haría ganar a la coma. Un Excel se convierte a
CSV antes: el script lee texto delimitado y lo dice con los pasos.

## 4.31 La creación automática de embarques: interruptor, apagado (tarea 66, 5-oct-2026)

**La ruta automática está completa desde A-1 y nunca ha corrido en
producción.** Lo que faltaba no era código: era el DATO. Se verificó en
emulador encendiéndola a propósito — con VLIM sembrado en 40, marcar
COT-2026-0009 como ganada creó **VLIM-26-041** sola, con `origen:
'automatico'`, `requiereCaptura: true`, el contador en 41 y `embarqueIds` de
vuelta en la cotización, que con eso queda congelada (§4.8). Se apagó después.

**Lo que la separaba de operar era una constante** —
`EMBARQUE_AUTOMATICO_DISPONIBLE` en `config/banderas.ts`— y encenderla pedía un
deploy. Ahora es un **interruptor en Configuración → Consecutivos de folio,
solo admin y apagado**, en `contadores/configuracionEmbarques`
(`embarqueAutomatico`). Lo lee `useEmbarqueAutomatico()`.
  - **Falla cerrado.** Sin documento, mientras carga y si la lectura falla:
    apagado. Marcar ganada solo marca ganada, que es lo que producción hace
    hoy, y el embarque se abre a mano desde Embarques eligiendo la serie
    (§4.15). Encendido por un parpadeo de carga emitiría folios que van
    impresos en el BL y en el pedimento y que no se pueden recoger.
  - Vive en `contadores/` y no en `configuracion/` **por las reglas**: el
    catch-all de `firestore.rules` niega todo lo que no esté nombrado, y
    `contadores/{id}` ya tiene escritura publicada. Mudarlo a
    `configuracion/foliosEmbarque` cuesta tres líneas de reglas y un deploy.
  - `banderas.ts` conserva el valor por omisión
    (`EMBARQUE_AUTOMATICO_PREDETERMINADO`), que nadie debe comparar
    directamente o el interruptor no serviría de nada.

**El formato del folio también se configura, por serie** (`prefijo`,
`separador`, `digitosAnio` 0/2/4, `digitos`), en `lib/formatoFolioSerie.ts`.
Vive en el MISMO documento que el consecutivo, así que la transacción que
reserva el folio ya lo tiene en la mano: ni una lectura más ni una colección
nueva. Sin nada guardado rige `VLIM-26-001`, que es lo que ya se imprimió, y el
campo se BORRA cuando el formato vuelve a ser el predeterminado.
  - **Por qué configurable:** la sesión del 2-oct dejó anotado «BLIM + año +
    tres dígitos… para enero va el 27, así que arrancamos en 2701», y la
    plataforma emite `VLIM-26-001`. Las dos lecturas están en los tests y la
    pregunta, en el reporte 66. Un folio mal formado no truena: se imprime.
  - **El consecutivo NO reinicia en enero.** Es un entero por serie que no se
    toca al cambiar de año: 2026 cierra en `VLIM-26-014` y enero de 2027 abre
    en `VLIM-27-015`. Si Vermur quiere `VLIM-27-001` hay que volver a fijarlo en
    cero a mano, y hacerlo solo exigiría un contador por año y serie. Es
    decisión de negocio, no de interfaz.
  - **Cambiar el formato no renumera lo emitido**: afecta a los siguientes, así
    que a media serie deja dos formatos en el mismo año. La pantalla lo dice.

**`traficoDeFolio` ya no supone que el prefijo es el primer segmento partido
por guion.** Con el separador configurable, un folio `VLIM26001` dejaba el
tráfico en null —y con él el IVA (§4.2) y la columna Tráfico (§4.25)—; ahora se
busca el prefijo al principio, con `(?![A-Za-z])` para no casar `VLIMEX`.
  - **Un prefijo fuera de la familia VL sigue sin decir el tráfico**, y por eso
    el editor avisa antes de guardar: con `BLIM`, los embarques nuevos caerían
    a la ruta. No se prohíbe —si Vermur confirma BLIM, el prefijo es el
    correcto—; lo que tiene que aprenderlo es `traficoDeFolio`, y eso es otra
    tarea. Adivinarlo sería clasificar un embarque en el mes equivocado.

## 4.32 El pago es la entidad, y lo aplicado se deriva (tarea 67, 5-oct-2026)

Paso **P1** de `docs/sprint-post-junta/PLAN-PAGOS.md`. Es el principio de
`anticipos.ts` subido un nivel: **el dinero que se movió es un hecho; a qué se
aplicó es una decisión reversible.** `lib/pagos.ts` (42 tests) tiene el modelo
—`Pago` con sus `AplicacionPago[]`— y las derivaciones: `aplicado`,
`sinAplicar`, `aplicacionesA`, `avanceDeDestino`. Ninguna se guarda.

Lo que resolvía que hoy no se podía: `CobroCliente` apunta a UNA factura y
`DepositoCliente` a NINGUNA, y las dos exigen `embarqueId`. «Un cliente paga
doce facturas con una transferencia» eran doce documentos con la misma
referencia copiada a mano, y ninguno sabía de los otros.

**P1 no escribe nada en `pagos/`: unifica la LECTURA.** Los diez call sites
del §2.2 del plan —`cuentasPorCobrar`, `fondeoCliente`, `cierresEmbarque`,
`Finance`, `PanelCuentasPorCobrar`, `PanelFacturasEmbarque`, `FichaEmbarque`,
`FichaCliente`— consumen una sola lista. **Cero cambios de pantalla**, y
`pagos.equivalencia.test.ts` lo fija con los números que el código viejo daba.
  - **Tres adaptadores, nada se migra.** Un `CobroCliente` es un pago con UNA
    aplicación; un `DepositoCliente`, uno con CERO; las órdenes que comparten
    `comprobantePago` —dentro del mismo proveedor y la misma moneda— son el
    pago consolidado que nunca existió como entidad (`pagosDesdeOrdenes`, su
    call site llega en P6). **No hay doble conteo por construcción:** un
    movimiento vive en `pagos` **o** en lo viejo, nunca en los dos. Esa es
    toda la regla, y es la razón para no migrar.
  - **`saldoDeFactura` no se tocó.** Recibe `{monto, moneda, activo}` y ahora
    le llegan las aplicaciones en vez de los cobros. Cambió quien le pasa la
    lista, no la regla.
  - **`calcularFondeo` recibía depósitos Y cobros** —«el mismo dinero por dos
    puertas»— y ahora recibe UNA lista de entradas, armada con
    `entradasDeFondeo`. Era la dualidad de §6 en miniatura.
  - **Un pago repartido entre dos embarques fondea cada uno por lo que le
    toca**, y es la primera vez que el caso se puede representar. Sin el
    resolvedor de embarque por destino **no se cuenta** en vez de contarse
    entero en los dos: inflar el fondeo autoriza un pago descubierto.
  - **«Cobrado del mes» suma APLICACIONES, no montos de pago.** Un depósito a
    cuenta es dinero que entró y todavía no cobra ninguna factura; sumarlo
    pondría en el KPI un número del que nadie podría decir de dónde salió. El
    mes se mira sobre la fecha del PAGO, que para un cobro viejo es su
    `fechaCobro`.
  - `avanceDeDestino` da «se le abonaron 20,000 de 50,000» para la orden de
    compra, que hoy solo salta a `pagada`, entera. **No agrega
    `pagada_parcial` a la máquina**: tiene 54 tests y `pagada` es terminal.
    Lo parcial es un avance; el estado entra si Julio lo pide para filtrar.

## 4.33 El cobro se registra en cobranza, y cobrar ya no es facturar (tarea 69, 5-oct-2026)

Paso **P3** de `docs/sprint-post-junta/PLAN-PAGOS.md`, el bloque 1 de Gaby:
*«quien hace la solicitud de pago es Operaciones, pero quien recibe el dinero
del cliente es Administración»*. `lib/entradaDinero.ts` (30 tests).

**El formulario del depósito vivía en la cuenta por PAGAR.** «Registrar
depósito del cliente» estaba dentro de `FichaOC.tsx` —la ficha de la orden de
pago a un proveedor— y era la **única** pantalla que llamaba a
`registrarDeposito`. Para capturar el dinero que entró había que entrar a una
orden. Ahora «Registrar entrada de dinero» vive en **Finanzas → Cuentas por
cobrar**, junto al cobro contra factura, que ya estaba ahí.

**Tres cosas se ELIGEN donde antes se heredaban o se exigían:**
  - **El embarque.** El anticipo se liga al embarque y con eso fondea sus
    órdenes (1.1). El selector sale de `embarquesFondeables(ordenes)`: solo
    los que tienen alguna orden esperando dinero, con lo que piden **por
    moneda** (§4.3). Un embarque sin orden abierta no es un destino.
  - **La moneda.** Antes era `moneda: oc.moneda`: un depósito en pesos contra
    una orden en dólares se guardaba como dólares y se veía perfectamente
    bien. No hay default — un «MXN» precargado se aprieta por reflejo, como
    el botón del TC de Banxico de §4.3.
  - **La referencia bancaria deja de ser obligatoria**, en los dos
    formularios. «Aparece después del pago, no antes». Una referencia
    inventada se ve igual que una real y descuadra la conciliación de Julio
    sin que nadie se entere; vacía es verdad.

**La ficha de la orden se queda con el dato, en solo lectura**
(`entradasDelEmbarque`): qué entró, cuándo, contra qué factura —o «anticipo a
cuenta» si todavía no cobra ninguna—, el enlace a Cuentas por cobrar y el
aviso de quién lo registra ahora. Quitar el formulario sin dejar el dato
convertiría «no hay fondeo» en un misterio justo donde se autoriza el pago. Un
pago anulado no se lista: el panel contesta «cuánto hay», no «qué se capturó».

**`cobro.registrar`: cobrar deja de ser facturar.** Capacidad nueva, de
**administracion y admin**. Reemplaza a `factura.generar` en `registrarCobro`
y `anularCobro`, y a `ordenCompra.autorizar` en `registrarDeposito` —el
permiso que esa escritura pedía era el de la PANTALLA donde estaba el botón, y
se queda viejo cuando el botón se mueve.
  - **Esto QUITA algo que hoy funciona: Operaciones deja de poder cobrar.** Es
    lo que dice la minuta §5 y lo decidió Mau en la cola. Donde Operaciones
    veía el formulario —Cuentas por cobrar y la pestaña Facturas del
    embarque— ahora lee `AVISO_COBRO_EN_COBRANZA`, una constante única para
    que los dos lugares digan lo mismo. Un «ya no está aquí» sin el «está
    allá» manda a buscar.
  - **Facturar sigue siendo de las dos áreas** (§4.1). Lo que se partió es el
    booleano: `PanelFacturasEmbarque` recibía un solo `puedeFacturar` para las
    dos cosas. Anular un cobro también es cobranza.

**«No pagar» se parte, y la asimetría es textual de la minuta §5:**
**Operaciones MARCA, solo Administración LIBERA.** Marcar es avisar —es quien
sabe que el cliente no ha fondeado—; liberar es decidir que el dinero está.
Hasta aquí las dos eran de Administración, así que Operaciones tenía que
rechazar la orden entera o mandar un correo. Las dos reglas viven en
`permisos.ts` (`puedeMarcarNoPagar`, `puedeLiberarNoPagar`) y no como un `if`
en la ficha: un `if` en la pantalla se endurece sin que nadie lo note. Donde
el botón de quitar no aparece, se dice por qué.

**Lo que NO cambió, a propósito:** el anticipo **no pregunta el banco**, porque
`DepositoCliente` no tiene dónde guardarlo (§10.2 del plan) y el modelo no se
toca en este paso. El cobro contra factura sí lo pregunta, como siempre. No se
ofrece un selector cuyo valor se tiraría al guardar.
## 4.34 El tercer destino también guarda quién corrigió el tipo (tarea 71, 5-oct-2026)

La 63 dejó el registro de la corrección del tipo en dos de sus tres destinos.
En el del proveedor se perdía, y no por descuido: `ArchivoExpediente` solo
guardaba `storagePath`, `url`, `nombre`, `subidoPor` y `fecha`, y agregarle un
campo no estaba en el modelo aprobado de esa tarea. Ahora tiene
`clasificacion?: { tipoCrudo?, confianza?, observaciones? }`, **opcional y
aditivo**: los archivos que ya existen no lo traen y se leen igual.

**El texto no se duplica: se empaca.** `clasificacionDeLinea` (en
`lib/loteDocumentos.ts`, junto a `textoCorreccionTipo` y
`observacionesConCorreccion`, que es quien lo redacta) devuelve el objeto que
el expediente guarda. Los tres destinos dicen lo mismo con las mismas
palabras; una tercera copia habría divergido en el primer ajuste de redacción.
  - **Omite las claves vacías y devuelve `undefined` cuando no hay nada que
    registrar.** Firestore rechaza `undefined` y tumba la escritura entera
    (§3): aquí eso sería el lote de 15 archivos perdido con cara de guardado.
  - **La casilla lo ENSEÑA**: la confianza del clasificador junto a la fecha y
    el autor, y la nota de corrección debajo. Guardarlo sin mostrarlo sería
    otro dato que nadie mira —la variante de «regla sin call site» de §4.26—, y
    es justo lo que hay que leer para arreglar el flujo de n8n.
  - **`confianza` acepta la escala de texto y un número.** El modelo aprobado
    la declaró `number`; el clasificador de esta plataforma contesta
    `'alta' | 'media' | 'baja'` (`NivelConfianza`), que es lo que de verdad
    llega. Aceptar las dos escribe lo que hay sin dejar de leer la forma
    aprobada. **La escala de un número no se interpreta**: se enseña tal cual,
    porque «80%» donde el agente quiso decir 0.8 de otra cosa es una
    afirmación que nadie hizo.
  - El «Reemplazar» por casilla sigue sin clasificar —es un archivo dirigido a
    un destino que ya se sabe— y al reemplazar, la clasificación del anterior
    se va con él: el registro describe al archivo que está, no al que estuvo.
  - **El expediente del cliente guarda el registro y tampoco lo enseña**
    (`DocExpediente.observaciones`, que la casilla no pinta). Es el mismo
    arreglo de una línea y está anotado, sin tocar: la tarea era el proveedor.

## 4.35 El cobro y el depósito se escriben en `pagos/` (tarea 68, 5-oct-2026)

Paso **P2** del plan. La 67 unificó la LECTURA; esta cambia la ESCRITURA.
`registrarCobro` y `registrarDeposito` dejan de escribir en `cobros/` y
`depositosCliente/` y crean **un documento en `pagos/`**: un cobro es un pago
con una sola aplicación, un depósito uno con cero.

**La firma de los dos hooks no cambia.** Lo que entra es exactamente lo que
entraba, y `construirPagoDeCobro` / `construirPagoDeDeposito` lo convierten
—funciones puras en `lib/pagos.ts`, no lógica dentro del hook, para que la
conversión se pruebe sin Firestore. Ninguna pantalla cambió.

**Lo viejo queda de SOLO LECTURA.** Deja de escribirse, no se migra y no se
borra. Un movimiento vive en `pagos` **o** en lo viejo, nunca en los dos: esa
es toda la defensa contra el doble conteo, y es la razón para no migrar.
  - `pagos.liberaPago.test.ts` recorre la cadena completa —cobro → fondeo →
    autorización de la OC → saldo de la factura— y corre **el caso espejo al
    lado**: el mismo cobro leído de `cobros/` como antes tiene que dar
    exactamente lo mismo. Si un día difieren, el cobro dejó de liberar el
    pago al proveedor, y eso es dinero que se queda sin salir.
  - **El folio es atómico**: `PAG-2026-0001` en `contadores/pagos`
    (`folioServicePago.ts`), y se reserva ANTES de armar el documento: si
    falla, no se escribe un pago sin folio. No reinicia en enero, igual que
    los folios de embarque (§4.31).
  - **`coleccionDelPago` decide dónde se anula**, por el `origen` que puso el
    adaptador y nunca por la forma del id. Un id que no está en la lista **no
    se escribe en ninguna de las dos**: anular en la colección equivocada
    crearía un documento nuevo con `activo: false` y el movimiento seguiría
    vivo en la otra.
  - **Un monto que no es mayor que cero lanza antes de escribir.** Firestore
    acepta un cero y guarda un `NaN` tal cual, y un pago de cero se ve igual
    que uno de verdad en la lista.
  - La referencia vacía se guarda como `null`, no como `''`: puede llegar
    DESPUÉS del pago y nunca es obligatoria (§0.3 del plan).

**🔴 `pagos/` NECESITA su regla publicada, y el sprint no la pudo escribir.**
El bloque exacto, dónde va y cómo se verifica están en
`docs/sprint-post-junta/REGLA-PAGOS.md`. Es la lección de §3 en su forma más
directa: **la regla escrita no basta, hay que publicarla** — con la diferencia
de que aquí no se traga en silencio. La escritura falla con un aviso rojo que
dice qué pasó, y el mensaje genérico de `permission-denied` («no tienes
permiso») se traduce a propósito: quien lo lea pensaría que es su rol, y no lo
es. Es la misma trampa del SMTP AUTH de §4.29.
  - **Orden de publicación: reglas PRIMERO, hosting después.** Al revés deja a
    Administración sin poder registrar un cobro durante la ventana entre los
    dos despliegues.
  - Mientras no esté, `./scripts/e2e.sh` falla en el paso 6 —el de
    Administración— justo en el primer `pagos/`. Los cinco pasos anteriores
    pasan: es el único punto que toca la colección nueva.
  - Nace con `esDelEquipo()` como todo lo demás, así que **cualquiera del
    equipo puede escribir un pago desde la consola**. Con dinero de verdad en
    esa colección, la deuda de §6 sube de prioridad.

## 4.36 Un pago, varias facturas: «Aplicar pago» (tarea 70, 5-oct-2026)

Paso **P4** de `docs/sprint-post-junta/PLAN-PAGOS.md` (§7.1), el flujo de
Magaya que describió Julio. `lib/aplicarPago.ts` (36 tests) y
`components/facturas/ModalAplicarPago.tsx`.

El renglón de Cuentas por cobrar dice **«Aplicar pago»** donde decía
«Registrar cobro», y abre el reparto: arriba el dinero que entró —monto,
moneda, fecha, cuenta, referencia opcional— y abajo las facturas pendientes
**del mismo cliente y en la misma moneda**, con «se aplica» y «queda» por
renglón. El caso de siempre no cambia de esfuerzo: se abre desde la factura
con el monto y el reparto ya puestos en su saldo, así que cobrar una sola
sigue siendo abrir y guardar. `ModalCobro` se retiró: era ese mismo caso con
un formulario aparte.

**Lo que sobra es saldo a favor, y se ve.** «Aplicar lo más vencido primero»
reparte en cascada —propuesta editable, como la comparativa preselecciona el
paquete más barato (§4.9)— y **no mete el excedente a la fuerza en la última
factura**: queda como `sinAplicar` del pago, el pie lo dice («quedan MXN
65,000.00 a favor del cliente») y se aplica después. Rellenar para cuadrar
dejaría una factura sobrecobrada, que hoy es invisible (§10.5 del plan).
  - **Lo que FALTA no se guarda.** El botón lo explica con los dos números:
    «estás aplicando 143,000.00 de un pago de 120,000.00».
  - **La regla se valida dos veces, y la segunda es la que importa.**
    `construirPagoAplicado` lanza antes de escribir si lo aplicado pasa del
    monto o si una aplicación trae otra moneda. El botón se puede esquivar
    —otra pestaña, un reparto que quedó viejo— y un pago que liquida 130,000
    con 120,000 se ve perfectamente bien en la lista.
  - `construirPagoAplicado` es la forma GENERAL y `construirPagoDeCobro` pasó
    a ser su caso de UNA aplicación. Un solo constructor: escritos aparte, el
    pago de doce facturas podría nacer con un campo de menos.

**La moneda no se convierte, y se dice.** §4 del plan, salida (a): el dinero
que entró al banco está en una sola moneda y es la que Julio concilia.
Cambiar la moneda del pago cambia la lista; cuando el cliente solo debe en la
otra, la pantalla lo EXPLICA («lo que debe está en USD 3,000.00…») en vez de
dejar la lista vacía, que se leería como «no debe nada». La conversión
declarada es la salida (b) y espera la respuesta de Julio (J3).

**Un pago cruza embarques, y cada bitácora anota lo suyo.** `embarqueIds` se
deriva de las facturas aplicadas, así que una transferencia que cubre dos
embarques fondea los dos por lo que les toca (`entradasDeFondeo`, caso 3) —
el caso que `CobroCliente.embarqueId`, un solo string, no podía representar.
`registrarPagoAplicado` deja UNA entrada por embarque con el total de ESE
embarque: anotar el total en los dos haría parecer que entró el doble.

**Desde la factura se ve qué pagos la cubrieron** (`coberturaDeFactura`): el
«Cobrado» del renglón es el enlace, y abajo salen folio, fecha, monto, cuenta
y referencia. Un cobro viejo de `cobros/` sale igual, marcado **«registro
anterior»** porque no tiene folio de pago ni ficha propia. Dos aplicaciones
del mismo pago a la misma factura son UN renglón: son un movimiento.
**La vista al revés —un pago con todas sus facturas, quitar una aplicación,
anular— es P5 y no se hizo.**
  - **«Parcial» se pinta JUNTO al estado, no en su lugar.** El estado
    contesta cuánto falta para el vencimiento y lo parcial, cuánto falta de
    dinero: las dos preguntas se hacen a la vez. `EstadoCobro` no creció, así
    que los filtros y las vistas guardadas de la 61 no cambian.

**Un pago sin ninguna aplicación no se guarda desde aquí**, y es decisión de
interfaz: el dinero que no cubre factura es el anticipo, y su formulario ya
existe —«Registrar entrada de dinero» (§4.33)— donde además se elige el
embarque, que es lo que lo hace fondear. Un pago nacido aquí sin aplicaciones
no tendría embarque y no fondearía nada, aunque se vería igual en la lista.

⚠️ **Esta pantalla NO guarda hasta que `pagos/` tenga su regla publicada**
(§4.35). `tests/e2e/70-aplicar-pago.spec.ts` recorre los nueve casos contra
emuladores y el último FIJA el aviso del bloqueo, con la versión en verde
escrita y comentada para el día que la regla entre.

## 4.37 La ficha del pago: aplicar el saldo, quitar una aplicación y anular (tarea 72, 6-oct-2026)

Paso **P5** de `docs/sprint-post-junta/PLAN-PAGOS.md` (§1.5 y §7.3).
Finanzas estrena la pestaña **Pagos**: cada movimiento de dinero del cliente
con su folio `PAG-…`, lo aplicado, lo que queda a favor y su estado, sobre
`SpreadsheetTable` con vistas guardables y filtros que se guardan con la vista
(módulo `pagos`), igual que Cuentas por cobrar (§4.27). Las reglas viven en
`lib/reversaPagos.ts` (29 tests); la pantalla en `components/pagos/`.

  - **Estado y «a favor» se DERIVAN** (`estadoDePago`, `aFavorDe`): aplicado ·
    parcial · sin aplicar · anulado. Un peso de redondeo no es saldo a favor.
    Los totales de arriba van por moneda (§4.3).
  - **Los anulados no se esconden:** salen de «Vigentes» (el default) y se ven
    con el filtro «Anulados» o «Todos».
  - **Aplicar el saldo a favor** reusa `ModalAplicarPago` en un MODO nuevo
    (`saldoDe`): el dinero se muestra y no se edita, y el reparto, las facturas
    ofrecidas (mismo cliente y moneda, con saldo) y las validaciones son las
    mismas. Se agregan aplicaciones al pago que ya existe; no se crea otro.
  - **Quitar una aplicación** y **anular** piden MOTIVO (`problemaMotivo`) y el
    hook lo vuelve a exigir. Nada se borra: el pago anulado queda en la lista.
  - **`embarqueIds` falla cerrado.** Al quitar la última aplicación, un pago de
    UN embarque lo sigue fondeando; uno de VARIOS queda en `[]` (a favor sin
    embarque), porque dejarlo en los dos contaría el monto completo en cada
    uno y autorizaría un pago descubierto. Aplicar saldo a una factura de otro
    embarque deja el pago repartido; Finance le pasa a `entradasDeFondeo` el
    resolvedor factura → embarque para que cada uno cuente lo que le toca.
  - **`anularDeposito` ya tiene call site:** el botón «Anular pago» de un pago
    sin aplicaciones. `anularCobro` y `anularDeposito` reciben el motivo; la
    pestaña Facturas del embarque lo pide con `window.prompt` (provisional,
    como el `confirm` que reemplaza).
  - **Permisos:** `cobro.registrar` (administracion y admin). Operaciones lee
    la ficha y no ve los botones, y la ficha lo dice.
  - **⚠️ Dónde queda el motivo:** el contrato de la tarea fue «Modelo: no» y
    `Pago` no tiene campos de anulación, así que quién, cuándo y por qué viajan
    a la **bitácora de cada embarque** que el pago tocó (`anotarBitacora`,
    evento `cobro`) y la ficha los lee de ahí, uniéndolos por el folio. Una
    aplicación quitada SÍ sale de `aplicaciones[]`; su rastro es esa entrada.
    Un pago anulado que no toca ningún embarque no deja rastro con motivo. Si se
    aprueban `anulacion` y `aplicacionesQuitadas` en `Pago`, la ficha deja de
    depender de la bitácora (pregunta en el reporte).
  - **Lo viejo no se reaplica:** un cobro o depósito leído de `cobros/` o
    `depositosCliente/` se lee y se anula, pero no se le aplica saldo ni se le
    quita una aplicación: esas colecciones ya no se escriben (§4.35).

## 4.38 Un pago a proveedor cubre varias órdenes (tarea 73, 6-oct-2026)

Paso **P6** de `docs/sprint-post-junta/PLAN-PAGOS.md` (§7.2). «Registrar pago»
en Programación de pagos escribe **UN** `Pago` (`lado: 'proveedor'`) con una
aplicación por orden, en vez del loop de N escrituras con la misma cadena
copiada. `construirPagoDeGrupo`, `problemasDelGrupo`, `pagosDeProveedor` y
`pagoQueCubrio` viven en `lib/pagos.ts`; el call site, en
`Finance.registrarPagoDelGrupo`.

  - **Se valida TODO el grupo antes de escribir.** Mezcla de proveedores o de
    monedas (§4.3), una orden sin monto o una que la máquina de estados no deja
    pasar a `pagada` detienen el pago completo: no se guarda ni el pago ni
    ninguna orden. Antes, si fallaba a la mitad, unas quedaban pagadas y otras no.
  - **El monto es lo que SALE del banco:** monto menos anticipos cruzados
    (`montoATransferir`), el mismo total que enseña la tarjeta del grupo.
  - **Las órdenes siguen pasando a `pagada` con `comprobantePago` = referencia**
    (la máquina lo exige y los paneles lo leen). Lo que cambia es que además
    existe el pago, con folio `PAG-…`, y la ficha de la orden dice «Cubierta por
    el pago PAG-… · una sola transferencia que cubrió N órdenes»
    (`pagoQueCubrio`, derivado: no se agregó campo a la orden).
  - **Nada se migra, sin doble conteo.** `pagosDeProveedor` lee `pagos/` y le
    quita a `pagosDesdeOrdenes` las órdenes que un pago vivo ya cubre; las
    pagadas antes de P6 siguen leyéndose por el adaptador de la 67. Un pago
    anulado deja de cubrir y sus órdenes vuelven a leerse por lo viejo.
  - **Una orden sin factura del proveedor entra igual**: se paga lo autorizado
    y la factura puede llegar después.
  - ⚠️ Si falla el paso de las órdenes DESPUÉS de guardar el pago, el aviso lo
    dice con el folio («PAG-… quedó registrado, pero no se pudieron marcar…»).
    Sigue sin ser una transacción de Firestore; la validación previa es lo que
    hace raro ese caso.
  - Depende de la regla de `pagos/` publicada (§4.35), igual que P2.
  - **Fuera de alcance, anotado:** el formulario de §7.2 con checkboxes por
    factura, la fecha elegida por quien paga y el comprobante adjunto. Hoy la
    fecha del pago es la del día de captura. La lista de la pestaña Pagos
    sigue siendo solo del lado cliente.

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

**La ficha guarda el documento entero y `actividades[]` vive dentro.**
`updateCotizacion` hace `updateDoc` con la cotización completa, y el
historial (notas, cambios de etapa, cambios de operación) es un array del
mismo documento. Dos ediciones simultáneas —dos pantallas, dos personas—
no se funden: la última pisa a la primera y se pueden perder entradas de
Historial / Notas. Candidato: `arrayUnion` para `actividades` y `updateDoc`
por campos en vez del documento entero. Anotado 25-sep-2026, sin arreglar.

**`firestore.rules` permite `update` en `cotizaciones` a cualquier
autenticado.** Los permisos por rol y por etapa —quién edita la operación,
quién avanza de etapa, el congelado— existen solo en la UI y en los hooks.
Es el mismo agujero de «las reglas no distinguen roles» de arriba, en su
caso más concreto. Hay que llevarlos a reglas antes de abrir más usuarios.
Anotado 25-sep-2026, sin arreglar.

**Las notificaciones por ROL no llegan a nadie más.** `agregarNotificacion`
solo escribe en Firestore las que traen `destinatarioId` (chat, por uid);
las de `destinatarios: [rol]` —cambio de etapa, y cualquier «avisar a
Administración»— se quedan en memoria del navegador que las crea, y las
reglas de `notificaciones` solo dejan leer las propias por uid. Avisar a un
área exige documentos por uid (no hay directorio de usuarios) o una consulta
por rol con cambio de reglas. Por eso «Pedir alta a Administración» quedó
fuera del Bloque 2a. Anotado 25-sep-2026, sin arreglar.

**Portal del cliente: debe ser un ROL, no un botón del header.**
Hoy «Portal del Cliente» es un botón que solo ve admin y que abre una vista
dentro de la misma sesión. Lo correcto es un rol `cliente` con su propio
acceso. **Depende de Usuarios y roles** (rol en custom claims) y de reglas
por rol: con las reglas de hoy —cualquier autenticado lee todo— un usuario
cliente podría leer las cotizaciones, los costos y los márgenes de TODOS
los clientes. El botón se queda como está hasta ese bloque. Anotado
25-sep-2026 por decisión de Mau.

**«PDF generados» repite el mismo nombre de archivo.** En COT-2026-0031
aparece dos veces «COT-2026-0031 v1.pdf»: dos generaciones de la misma
versión, con el mismo nombre y sin hora visible. Entra al bloque de PDF con
historial de versiones. Anotado 25-sep-2026.

**El Kanban avisa del freno al soltar, no antes de mover.** `handleDrop`
valida con `puedeTransicionarA` y muestra la razón cuando la tarjeta ya se
arrastró; las columnas a las que no se puede mover deberían verse
inalcanzables antes. Anotado 25-sep-2026.

**~~El registro público de Firebase Auth está ABIERTO~~ — CERRADO el
26-sep-2026.** Mau desactivó «Enable create (sign-up)» en la consola;
verificado contra producción con la API key del bundle: `accounts:signUp`
responde `ADMIN_ONLY_OPERATION` y no crea nada. Estuvo abierto al menos
hasta el 25-sep, con reglas que solo pedían `request.auth != null`: durante
ese tiempo, cualquiera que leyera el bundle podía registrarse y leer y
escribir toda la base. Comprobarlo de nuevo cuando se toque Auth:

```bash
curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=<API_KEY>" \
  -H 'Content-Type: application/json' \
  -d '{"email":"prueba@example.com","password":"Prueba-123!","returnSecureToken":true}'
```
Cerrado responde `ADMIN_ONLY_OPERATION`; abierto devuelve un `idToken`.

**🔴 CRÍTICO — Hay tres cuentas de PRUEBA en el Auth de producción.**
`admin@vermur.com`, `pricing@vermur.com` y `ventas@vermur.com` existen en
producción (inventario del 26-sep-2026 con `firebase auth:export`). Son las
del emulador, donde su contraseña es `123456`. Hasta el Bloque 8,
`admin@vermur.com` tenía rol **admin** en el mapa de las Functions. El
parche de reglas del Bloque 9 las deja fuera de Firestore y Storage, pero
**hay que borrarlas o deshabilitarlas en la consola**: mientras existan,
son credenciales válidas del proyecto. Las cinco cuentas de prueba viven
solo en emuladores (`scripts/sembrarEmuladores.sh`); en producción no
deberían existir.

**El equipo tiene `email_verified` en false.** Las seis cuentas reales.
Por eso el parche del Bloque 9 identifica por correo y **no** condiciona a
`email_verified`: hacerlo dejaría fuera a todo el equipo.

**~~Las cuentas de prueba tienen rol en el mapa de las Functions~~ — CERRADO
el 25-sep-2026 (Bloque 8).** Se quitaron del mapa de producción de
`functions/comun/auth.ts`; un correo fuera del mapa cae al fallback de menor
alcance, que no tiene ninguna capacidad de flujo. Queda como referencia de
qué buscar: `src/auth/AuthContext.tsx` mete `admin@vermur.com`,
`pricing@vermur.com`, etc. SOLO cuando `USANDO_EMULADORES`, y lo explica:
«en producción, si estas cuentas existieran, caen al fallback de menor
alcance». `functions/src/comun/auth.ts` las tiene en el mapa **sin esa
condición**, y las Functions corren siempre contra producción. Si alguien
crea `admin@vermur.com` en el Auth de producción, obtiene capacidad `admin`
en `clasificarDocumento` y `extraerTarifas`. Los dos mapas están duplicados
a propósito (el cliente no puede mandar su propio rol), pero divergieron.
Se cierra con Usuarios y roles, que borra los dos mapas; mientras tanto,
**no crear esas cuentas en producción**. Hallado 25-sep-2026 en el
inventario de roles.

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

**Cloud Functions** (`functions/`, us-central1, **Node 22**,
firebase-functions 7 / firebase-admin 14 desde el 26-sep-2026):
`extraerTarifas` es el proxy hacia n8n. Estructurada para varias — Gestión de Usuarios reutilizará
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
