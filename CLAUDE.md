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
- **Operaciones** genera embarques y factura. NO crea cotizaciones.
- **Administracion** es la unica que da altas definitivas de clientes, proveedores y puertos.

**Citas del cliente:**

> «Todos somos vendedores, pero solo Pricing puede cotizar.»

> «Que Ventas pueda cotizar es un verdadero desastre. No quiero que metan mano.»

> «Ventas no deberia de poder dar de alta clientes ni proveedores, solo deberia de poder crear leads.»

**Matiz sobre Pricing:** Pricing SI puede crear cotizaciones (el cliente manda el requerimiento
por correo y Pricing la abre directamente, sin forzar el paso de solicitud previa). Recibe
solicitudes de clientes directos y agentes de carga, no solo de Ventas.

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
3. Cuándo exactamente se convierte una cotización en embarque
4. Qué tipo de cambio usa la empresa y cuál es la fuente oficial
5. Dónde se generan y administran las notas de crédito
6. Qué documentos pertenecen a la cotización y cuáles al embarque
7. Qué le falta al catálogo de servicios (dicen que está «confuso e incompleto»)

### Otros requerimientos

- Poder subir un tarifario desde la cotización
- Carga automática de tarifarios: subir un documento y que el sistema lea y cargue las tarifas
  (esto es la épica de OCR)
- Separar claramente «Altas» de «Configuración» — hoy hay confusión entre ambas

---

## 5. Estado de los módulos

### Construido y validado

| Módulo | Detalle |
|---|---|
| Clientes y proveedores | CRUD, contactos múltiples, días de crédito por modalidad, alta rápida |
| Puertos | Catálogo con terminales (Lázaro Cárdenas es el caso con varias) |
| Conceptos | 105 conceptos con `calcularIVA` + 21 tests |
| Términos de pago | 25 términos, incluye descuento por pronto pago |
| Tarifas | Catálogo, carga masiva, lookup por concepto y ruta |
| Cotizaciones | Ficha a pantalla completa, máquina de estados con 9 etapas |
| Comparativa de Pricing | A nivel concepto y a nivel servicio, con selección múltiple |
| Panel de tarifas | Filtrado por concepto activo, drag and drop con @dnd-kit |
| Simulador de costo | Marcar tarifas y ver el escenario antes de aplicar |
| Bandeja Pricing | Tres bloques por acción, barra de progreso, badges de tarifas |
| Tabla configurable | `SpreadsheetTable<T>` genérico con vistas guardables |
| Embarques | Estructura base, productos (contenedor → pallets → mercancía) |

### En construcción o pausado

| Módulo | Estado |
|---|---|
| Órdenes de compra | OC-0 hecho (modelo + máquina de estados + 54 tests). Pausado |
| Gestión de usuarios | Plan aprobado, sin implementar. Roles hoy en `getRolByEmail` |
| Finanzas | Placeholders. Cuentas por pagar se vuelve Órdenes de compra |

### Sin empezar

- Motor de plantillas de documentos (BL, booking, arribo, carta de porte, 318/NOM)
- Integraciones: Valida Carga, timbrado CFDI, tracking de navieras, WhatsApp, Outlook
- Exportación de pólizas para el sistema contable del contador
- OCR de tarifarios con IA
- Aplicar `SpreadsheetTable` a Clientes, Proveedores y Embarques

---

## 6. Deuda técnica conocida

**Falta `trafico` y `ubicacion` en `ServicioSolicitado`.**
Sin ellos, `calcularIVA` no se puede aplicar en la cotización, aunque la función ya existe y
está probada. Bloquea el cálculo fiscal correcto. **Prioritario.**

**Dualidad de `CotizacionProveedor`.**
BandejaPricing guarda en `servicio.cotizacionesProveedor` (sin `proveedorId`); FichaCotizacion
guarda en `concepto.tarifas` (con `proveedorId`). Los helpers recorren ambos niveles con
fallback, pero hay que unificar. Estimado: 2-3 días, con riesgo alto en
`calcularTotalConsolidado` y el guard de la máquina de estados.

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
```

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
