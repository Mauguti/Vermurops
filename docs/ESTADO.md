# Estado de VermurOps — 5 de octubre de 2026 (corte nocturno)

**Corte del sprint nocturno sobre pagos: la cadena 67 → 69 → 71 está lista y
SIN PUBLICAR.** Cinco tareas corridas, **cero bloqueos de la guardia**, dos
`[!]` por **una sola causa compartida**: `pagos/` no tiene regla en
`firestore.rules` y el sprint no puede editar ese archivo (límite 4 del
contrato).

Punta: `sprint/71-correccion-tipo-proveedor`, que sale en línea de la 69 y la
67 — **mergearla trae las tres**.

En la punta: **106 archivos · 2,467 tests en verde** (línea base 2,369) ·
`tsc --noEmit` **0 errores** · `npm run build` limpio · `./scripts/e2e.sh`
**6/6** · filtros 34/34 · barrido 95/95.

**La cadena no toca reglas, ni índices, ni Functions, ni n8n, ni secretos, y no
migra un solo dato.** Es un deploy de hosting y nada más — precisamente porque
las dos ramas que sí necesitaban la regla de `pagos/` quedaron fuera.

El resumen de la noche, con la secuencia de publicación y las preguntas
redactadas para copiar, está en `sprint/reportes/RESUMEN.md` (no versionado).

---

## 1. La cadena de la noche: 67 → 69 → 71, sin publicar

Cada rama sale de la anterior (verificado con `git merge-base`;
`sprint/base` = `main` = `origin/main` = `6c98000`):

| # | Tarea | Rama | Despliega |
|---|---|---|---|
| 67 | P1 · Modelo de pagos y lectura unificada | `sprint/67-modelo-pagos` | Hosting |
| 69 | P3 · El cobro se registra en Cuentas por cobrar | `sprint/69-cobro-en-cuentas-por-cobrar` | Hosting |
| 71 | Corrección de tipo en el expediente del proveedor | `sprint/71-correccion-tipo-proveedor` | Hosting |

Documentado en CLAUDE.md: §4.32 (67), §4.33 (69), §4.34 (71).

### Qué trae cada una

- **67 · El pago es la entidad y lo aplicado se deriva.** `lib/pagos.ts` (42
  tests) con el modelo de `PLAN-PAGOS` §1.1 y los **tres adaptadores de lo
  viejo** (`CobroCliente`, `DepositoCliente`, las órdenes que comparten
  `comprobantePago`). Los diez call sites del §2.2 pasan a **una sola lista**;
  `pagos.equivalencia.test.ts` fija los números que el código viejo daba.
  **Cero cambios de pantalla: lo que hay que validar es que nada se movió.**
  `calcularFondeo` recibía depósitos Y cobros —la dualidad de §6 en miniatura—
  y ahora recibe una lista. Nada se escribe en `pagos/`.
- **69 · El cobro se registra en cobranza, y cobrar ya no es facturar.** El
  formulario del depósito vivía dentro de `FichaOC` —la ficha del pago AL
  PROVEEDOR— y era la única pantalla que llamaba a `registrarDeposito`. Ahora
  «Registrar entrada de dinero» está en Finanzas → Cuentas por cobrar, con
  **embarque y moneda elegidos** (la moneda se heredaba de la orden: ese era el
  bug) y **referencia bancaria opcional** («aparece después del pago, no
  antes»). La ficha de la orden queda en solo lectura con el dato y el aviso.
  Capacidad nueva `cobro.registrar`. 30 tests.
- **71 · El tercer destino guarda quién corrigió el tipo.** `ArchivoExpediente`
  estrena `clasificacion?: { tipoCrudo?, confianza?, observaciones? }`, opcional
  y aditivo. El texto no se duplica: `clasificacionDeLinea` empaca lo que ya
  redactaba la 63, así que los tres destinos dicen lo mismo con las mismas
  palabras. La casilla **lo enseña**. 8 tests (`loteDocumentos` 32 → 40).

### Lo que hay que hacer antes del hosting

1. **Avisarle al grupo que Operaciones deja de registrar cobros.** Es lo único
   que la cadena **quita**, y está en producción hoy.
2. Hosting, y `git push origin main`, con su
   `cd /Users/mauriciogutierrezmunoz/antigravity/Vermur-Logistics` y leyendo
   `uploading`, no `skipping upload` (§3).

**Punto de regreso:** `git revert` del merge. Nada que deshacer en datos: no se
migró nada, no se borró nada, el único campo nuevo es opcional. Si solo se
quiere devolverle a Operaciones la capacidad de cobrar sin revertir la
pantalla, es agregarle `'cobro.registrar'` al rol `operaciones` en
`src/auth/permisos.ts`.

### Lo que cambia para el equipo

**Operaciones deja de poder registrar y anular cobros**: `cobro.registrar` es de
`administracion` y `admin`. Donde veían el formulario —Cuentas por cobrar y la
pestaña Facturas del embarque— ahora leen a dónde ir (`AVISO_COBRO_EN_COBRANZA`,
una constante única para que los dos lugares digan lo mismo). Lo que ganan:
pueden **marcar** «No pagar»; solo Administración la **quita**. Es la minuta §5.

Facturar sigue siendo de las dos áreas (§4.1). Lo que se partió es el booleano:
`PanelFacturasEmbarque` recibía un solo `puedeFacturar` para las dos cosas.

---

## 2. Las dos tareas `[!]`: 68 y 70, y la regla que las destraba

**El código de las dos está completo y verificado.** Lo que falta no es código:
es un despliegue de reglas.

| Tarea | Rama | Qué quedó hecho |
|---|---|---|
| **68 · P2** | `sprint/68-escribir-pagos` | `registrarCobro` y `registrarDeposito` crean un `Pago` en `pagos/` (un cobro es un pago con UNA aplicación; un depósito, con cero). `usePagos`, `folioServicePago` (`PAG-2026-0001` atómico), 27 tests, el caso espejo contra `cobros/`. La firma de los hooks no cambia y ninguna pantalla cambió |
| **70 · P4** | `sprint/70-aplicar-pago-cliente` | `lib/aplicarPago.ts` (36 tests), `ModalAplicarPago` con reparto en cascada editable, sobrante a favor, bloqueo de sobrepago y filtro por moneda con aviso; desde la factura se ve qué pagos la cubrieron. 9 casos e2e propios en verde. **Trae los tres commits de la 68** |

El síntoma es idéntico y es un diagnóstico, no una hipótesis: el paso 6 de
`./scripts/e2e.sh` cae en la primera línea que toca `pagos/` con «No se guardó
el pago · Firestore rechazó la escritura en «pagos»…», y `grep pagos
firestore.rules` no devuelve nada. Los cinco pasos anteriores pasan.

**No se podía poner la regla solo para el emulador:** `firestore.emulador.rules`
se DERIVA de las de producción (`scripts/reglasEmulador.sh`, §4.21), y
divergirlas a mano es el error que ese script existe para evitar.

### Para destrabarlas

1. Pegar el bloque de `pagos/` en `firestore.rules` —está completo en
   `docs/sprint-post-junta/REGLA-PAGOS.md`, **que vive en la rama 68 (y en la
   70), no en la cadena**— después del bloque de `cobros/{id}`.
2. `cd /Users/mauriciogutierrezmunoz/antigravity/Vermur-Logistics && npx firebase deploy --only firestore:rules`
3. `./scripts/e2e.sh` → 6/6 · `npm run test:reglas` → los 13 en verde.
4. Mergear **la 70, no la 68**: la 70 trae sus tres commits por cherry-pick, y
   mergear las dos solo repite el diff.

**Dos cosas que conviene saber:**

- **Reglas primero, hosting después, y no es opcional.** Al revés,
  Administración se queda sin poder registrar un cobro durante la ventana entre
  los dos despliegues. El resto de la aplicación aguanta: el barrido de 95 casos
  pasa en verde sin la regla.
- **El listener sin regla degrada en silencio y la escritura no.** `onSnapshot`
  tiene su callback de error y la pantalla dice «no hay pagos», que es la
  verdad. Si un día la regla se quitara por error, las pantallas dejarían de ver
  pagos **sin avisar a nadie**, y solo el primer intento de cobrar lo delataría.
- **Al mergear la 70 encima de la cadena hay un conflicto previsible en
  CLAUDE.md**: la 70 usa §4.34 para la 68 y §4.35 para sí misma, y la 71 ya
  ocupó §4.34. Renumerar: 68 → §4.35, 70 → §4.36.
- **El caso 9 del e2e de la 70 afirma que el guardado falla.** Al publicar la
  regla se cae, correctamente: hay que descomentar la versión en verde que ya
  está escrita dentro del mismo spec.

---

## 3. La cadena 56 → 66 ya está en `main`

Se mergeó durante el día del 5-oct (17:49) y `main` == `origin/main` ==
`6c98000`. La guía de validación en producción está en
[VALIDACION-56-66.md](sprint-post-junta/VALIDACION-56-66.md) y **deja dicho que
dos Functions NO se desplegaron**, bloqueadas por el secreto del correo (§4):

- **`clasificarDocumento`**: «Subir documentos» de la orden de compra sube bien
  y el archivo queda en Storage, pero ningún renglón se clasifica solo — todos
  salen con «El clasificador respondió con error 400» y el tipo se elige a mano.
  Es degradado, no roto.
- **`enviarCorreo`**: no hay nada en la interfaz que mande correo. No buscarlo.

**Antes de dar la cadena por publicada, confirmar el hash del bundle en
producción** (`main` == `origin/main` == producción, protocolo del repo).

Pendiente, arrastrado: **validar 56–66 en navegador**, y **validar 35–55**
([VALIDACION-35-55.md](sprint-post-junta/VALIDACION-35-55.md)).

**Functions, las seis, Node 22 en us-central1:** `extraerTarifas`,
`clasificarDocumento`, `gestionarUsuarios`, `generarDocumento`,
`tipoCambioProgramado` (0 8,10,12,14,16,18 L-V, hora de la Ciudad de México) y
`actualizarTipoCambio`.

Lo que la 56 → 66 trajo está en CLAUDE.md §4.23 (57), §4.24 (58), §4.25 (59),
§4.26 (60), §4.27 (61), §4.28 (63), §4.29 (64), §4.30 (65), §4.31 (66); §4.3
ampliada por la 56.

**La regla de Storage de `ordenesCompra/{id}/documentos/` ya se escribió** —
existe en `storage.rules:121` con sus tests (commit `9cd74ac`). Falta confirmar
que esté **desplegada**; sin ella, un comprobante fotografiado se rechaza porque
los archivos caen en `factura/`, que acepta solo PDF y XML.

---

## 4. ⛔ PENDIENTE BLOQUEANTE · reactivar el correo después del 12-oct

**`enviarCorreo` está comentado en `functions/src/index.ts`** (5-oct). No es un
olvido: mientras esa línea exista y falten sus secretos, **no se puede desplegar
NINGUNA Cloud Function**.

`defineSecret('CORREO_SMTP_USUARIO')` y `…PASSWORD` no existen en Secret Manager
porque no hay credenciales de Exchange, y el `--only` del CLI filtra qué se
despliega pero no qué se **analiza**: Firebase resuelve los parámetros de todo
el codebase antes de filtrar. Eso bloqueó el deploy de `clasificarDocumento` el
5-oct con `Error: In non-interactive mode but have no value for the secret
CORREO_SMTP_USUARIO`.

**Descomentar la línea NO basta.** Hacen falta dos cosas:

1. Las capacitaciones del **12-oct**, que es cuando se enciende el correo.
2. **Decidir el transporte.** `vermur.com` está en Microsoft 365 (MX →
   `outlook.com`, SPF con `-all`), donde SMTP AUTH viene apagado por default y
   Microsoft lo está retirando. Si se va por **Graph**, los dos secretos de SMTP
   no aplican: hay que cambiarlos por el client id / tenant id / client secret
   de una app registration.

---

## 5. Cola restante

La cola de pagos (67–71) quedó vacía a las 20:44. Lo que sigue, en orden de
urgencia:

| Qué | Tipo | Bloquea |
|---|---|---|
| **Publicar la cadena 67 → 69 → 71** (hosting; avisar antes del cambio de permiso) | Despliegue | Lo de abajo |
| **Publicar la regla de `pagos/`** y mergear la 70 | Reglas | P2 y P4 completos |
| Validar 56–66 en navegador (y confirmar el hash del bundle) | Validación | Cerrar el sprint anterior |
| **P5 del plan de pagos**: pestaña Pagos, ficha del pago, quitar una aplicación, anular | Código | Corregir un pago mal aplicado |
| P6 a P8 del plan de pagos (lado proveedor, flujo de efectivo, prefactura) | Código | Aprobar la cola siguiente |
| Desplegar la regla de Storage de `ordenesCompra/{id}/documentos/` | Reglas | Comprobantes en imagen |
| `clasificarDocumento` y `enviarCorreo` (dependen del §4) | Despliegue | Clasificar en la orden, correo |
| Sembrar los seis consecutivos reales de Magaya y confirmar el formato del folio | Dato externo | Encender el embarque automático |
| Pedirle a Luis «Clientes OK» en CSV y correr la carga en seco | Dato externo | Los 817 clientes sin RFC |
| Fase 1 del plan 42: minar `numeroEntidadMagaya` → `rfc` (~250–300 clientes) | Script | Timbrado |
| Validar 35–55 en navegador (arrastrado) | Validación | — |
| Borrar o deshabilitar las tres cuentas de prueba del Auth de producción | Seguridad | — |
| Flujo `clasificar-documento-oc` en n8n | n8n | Clasificar documentos de la orden |
| Credenciales de Exchange + encender SMTP AUTH | Dato externo | El correo saliente |
| Plan de reglas por rol (53) | Código | Decisión: ¿se adelanta? (ver §7) |
| Confirmaciones de Julio (3 conceptos IVA + regla fiscal TC + IVA oficina) | Decisión | Script 39, tareas 51 y 55 |
| Freno de facturación por datos fiscales incompletos | Código | Timbrado |
| Pasos 2 y 3 de aprobación de proveedores | Código | Julio define docs |
| Freno de OC por expediente del proveedor | Código | Decisión de Mau |
| Documentos operativos restantes (BL, booking…) | Código | Preguntas de Gaby |
| Tarea 25: correo como imagen en revisión de tarifas | Código | No se ha intentado |

Y lo que arrastramos: barrido de reglas sin quien las llame, y la limpieza de
los seis archivos huérfanos de la 57.

**Dos arrastrados que la noche cerró:** el `tsc` bloqueante en el build **ya
está** (`"build": "tsc --noEmit && vite build"`, línea base 0 errores — la nota
que decía «vite sin typecheck, ~10 errores pendientes» dejó de ser cierta), y el
flaky del paso 3 del recorrido era consecuencia del paso 6 fallando, no un
problema propio (desapareció en la 69, con 6/6).

---

## 6. Lo que espera a Julio y Gaby

Las preguntas de la noche están **redactadas para copiar** en
`sprint/reportes/RESUMEN.md` §4. Las nuevas, todas de cobranza:

| Qué | Por qué está trabado |
|---|---|
| **La fecha del mes** | ¿La del movimiento bancario o la de la aplicación a cada factura? Hoy usamos la del banco |
| **Los anticipos en el «cobrado del mes»** | Los dejamos fuera: es dinero que entró y no cobró ninguna factura |
| **El embarque del anticipo** | Hoy el anticipo exige elegir embarque, y eso es lo que fondea las órdenes. ¿Siempre lo saben? |
| **La cuenta del anticipo** | No pregunta a qué banco de Vermur entró, así que no se concilia por cuenta |
| **El sobrante de un pago** | Lo dejamos «a favor del cliente» dentro del mismo pago. ¿O sale como anticipo aparte? |
| **El orden del reparto** | Proponemos «lo más vencido primero», editable. ¿Es su regla o manda el cliente? |
| **Pago en una moneda, facturas en otra** | Por ahora no se aplica y la pantalla lo dice. ¿Les pasa seguido? |
| **El folio del pago** (`PAG-2026-0001`) | ¿Les sirve, o buscan siempre por referencia bancaria? |
| **Quién cobra** | Operaciones deja de registrar cobros, y sí puede marcar «No pagar». ¿Está bien así? |

Más las once arrastradas de la cadena anterior (formato del folio, saldo de las
siete cuentas, Monex pesos y BBVA, cierre de mes arribo o pedimento, la regla
del TC de Pricing, el TC de la factura, días festivos, fondeo y complemento de
pago, documentos del proveedor extranjero, CON-019/022/081, primer reporte a
automatizar). Material de preparación:
[PREVIA-JUNTA-ADMIN.md](sprint-post-junta/PREVIA-JUNTA-ADMIN.md).

---

## 7. Decisiones pendientes para Mau

Las doce de la noche están desarrolladas, con recomendación cada una, en
`sprint/reportes/RESUMEN.md` §3. Las que bloquean trabajo:

### De la noche del 5-oct

1. **¿Publicas la regla de `pagos/`?** Es lo único que separa a la 68 y la 70 de
   estar cerradas. Bloque listo en `docs/sprint-post-junta/REGLA-PAGOS.md`
   (rama 68). **Recomendación: sí.**
2. **¿Se mergea la 70 o la 68?** **La 70, en lugar de la 68** — trae sus tres
   commits. Y encima de la cadena, renumerando §4.34/§4.35 de CLAUDE.md.
3. **¿Se adelanta el plan de reglas por rol (53)?** Con `esDelEquipo()`,
   cualquiera del equipo puede escribir un pago desde la consola de Firebase. Ya
   pasa con las órdenes, pero esto es la entrada de dinero del cliente.
   **Recomendación: sí, es el momento.**
4. **¿`confianza` con las dos escalas?** (71) El modelo aprobado decía `number`
   y el clasificador contesta `'alta' | 'media' | 'baja'`: con `number` a secas
   el campo nunca se habría escrito. **Recomendación: dejarlo ampliado.**
5. **¿`banco` en `DepositoCliente`?** Sin él el anticipo no se concilia contra
   el estado de cuenta, que es lo que Julio hace cada mes. **Recomendación: sí,
   en su propia tarea** (la 69 decía «Modelo: no»).
6. **¿Los cuatro campos de §1.4 del plan** (`esPrefactura`, `motivoPrefactura`,
   `FacturaCliente.aplicado`, `OrdenCompra.pagado`)? Ninguno se escribió.
   **Recomendación: cuando haya pantalla que filtre por ellos.**
7. **¿P5 enseguida?** Sin ella un pago mal repartido solo se anula entero, y
   `anularDeposito` existe **sin un solo call site**: hoy un anticipo mal
   capturado no se corrige desde ninguna pantalla. **Recomendación: sí.**
8. **¿Se quita el `{ incluirAnulados: true }`** de `PanelFacturasEmbarque.tsx:267`?
   La pestaña Facturas del embarque lista los cobros **anulados** con su botón
   «Anular»; el saldo sí los descarta. Lo reportaron las tres tareas de pagos y
   ninguna lo tocó (es hallazgo, no instrucción), y ahora es inconsistente con
   el panel nuevo de la orden, que sí los esconde. **Recomendación: sí, una
   línea.**
9. **¿El registro de corrección de tipo en el expediente del CLIENTE?** Se
   guarda en `DocExpediente.observaciones` y la casilla no lo pinta. Es el mismo
   arreglo que se hizo en el proveedor. **Recomendación: sí, tarea de una línea.**
10. **¿Se unifica `ExpedientePanel`?** Se documenta como compartido y solo lo
    usa el proveedor. **Recomendación: no esta semana** — dos modelos distintos
    y toca el freno de expediente (§4.18).

### Arrastradas

11. **¿Enciendo la creación automática de embarques?** (66) No de golpe: sembrar
    los consecutivos, confirmar el formato, encenderla con Operaciones mirando.
12. **¿El correo se enciende antes o después de las capacitaciones del 12?**
    Recomendación: después.
13. **Regla de `configuracion` y `tiposCambio`** — bloque exacto en el reporte 51.
14. **¿El pricing rate se guarda una vez y se hereda?** (56) Toca reglas.
15. **¿Las 6 cuentas ya tienen el custom claim `rol`?** Prerrequisito del plan 53.
16. **¿Borro los seis archivos huérfanos?** (57) ~1,700 líneas con datos
    inventados que nada importa. En commit aparte.
17. **¿Reservas y Recolecciones?** (57) Rutas sin menú: quitarles ruta y permiso.
18. **¿Las siete cuentas pasan a catálogo de Firestore?** (57) No hasta decidir
    el modelo de saldos del bloque 3.
19. **¿El proveedor también desactiva contactos en vez de borrarlos?** (60)
    Tarea aparte: toca los 544.
20. **¿El interruptor de embarque automático se muda a
    `configuracion/foliosEmbarque`?** (66) No hasta que toque publicar reglas
    por otra razón.
21. ¿Administración necesita la vista `quotes`? ¿`info@digsol.com.mx` sigue como
    admin? ¿El despliegue de las reglas por rol se hace un sábado? ¿Freno de
    facturación por datos fiscales incompletos? ¿Correr
    `auditarCotizacionesVivas.ts` contra producción? (plan 17) ¿Agentes de carga
    son siempre clientes de oficina? (plan 18) ¿Bloquear envío por tarifas
    vencidas al reciclar? (plan 19) ¿Gaby y Luis ambos admin? (tarea 21)
    Confirmar `VERMUR_N8N_TOKEN` en n8n (tarea 22).

---

## 8. Deuda crítica que no se movió

- **Reglas de Firestore no distinguen roles** (plan en la tarea 53). Con dinero
  en `pagos/` sube de severidad: un pago escrito desde la consola es un cobro
  que nadie recibió
- `localhost` sin emuladores escribe en producción
- Tres cuentas de prueba en el Auth de producción
- `getCostoOficial` suma sin mirar moneda
- Las notificaciones por ROL no llegan a nadie (el correo de la 64 existe y no
  está conectado a ninguna notificación)
- **Dos sumas de dinero sin clasificar** en `TablaUnificadaCargos.tsx` (líneas
  175 y 344), que el auditor de §4.3 marca y nadie ha revisado

### Hallazgos nuevos de la noche, anotados sin tocar

- **Una aserción de ausencia que pasaba sin comprobar nada**: un
  `toHaveCount(0)` contra un nombre de botón que había cambiado. La forma del
  error es general — **toda aserción de ausencia por nombre se vuelve vacía
  cuando el nombre cambia**. Vale un barrido de los `toHaveCount(0)` del e2e.
- **La lista de Altas filtra por `statusOperativo === 'ACTIVO'`, no por
  `activo`.** Un cliente escrito sin ese campo existe en Firestore y es
  invisible en la pantalla, sin aviso. Trampa real para un alta por script.
- **`DepositoCliente.referencia` es `string` obligatorio**, así que un anticipo
  sin referencia se guarda como `''`. Debería ser `string | null`, como en
  `Pago`.
- **Editar cualquier archivo del repo mientras `./scripts/e2e.sh` calienta tumba
  la siembra** (vite recarga la página y corta el sembrado a medias).

---

## 9. Entregables vigentes que no son código

**Planes** (`docs/sprint-post-junta/`):
- `PLAN-PAGOS.md` — la fuente de esta cola. **P1 y P3 hechos, P2 y P4 esperando
  la regla, P5 a P8 sin empezar.**
- `REGLA-PAGOS.md` — **nuevo (68)**: el bloque de `firestore.rules` para
  `pagos/`, dónde va y cómo se verifica. **Vive en la rama 68, no en la cadena.**
- `PLAN-CARGA-FISCAL.md` — minar Tax IDs, pedir export, script de carga.
- `AUDITORIA-35-48.md`, `PLAN-REGLAS-POR-ROL.md`, `PLAN-FUENTE-TARIFA.md`,
  `PLAN-EQUIPOS-MINIMO.md`, `PLAN-RECICLAR.md`, `PLAN-C.md`,
  `PLAN-APROBACION.md`.

**Guías de validación:** `VALIDACION-56-66.md`, `VALIDACION-35-55.md`.

**Diagnósticos:** `BARRIDO-FILTROS.md` (43 filtros), `BARRIDO-GENERAL.md`
(95 pantallas × 5 roles, limpio).

**JSON de n8n** (`docs/n8n/`): `generar-pdf-cotizacion.n8n.json`,
`tipo-cambio-banxico.n8n.json`. **Falta por escribir:** `clasificar-documento-oc`
— el cambio exacto está descrito en el reporte 63, sin inventar el flujo.

---

## 10. Orden propuesto para la mañana

1. Leer `sprint/reportes/RESUMEN.md` y los reportes que interesen.
2. **Publicar la cadena 67 → 69 → 71** (hosting). Antes, avisarle al grupo que
   Operaciones deja de registrar cobros.
3. **Decidir la regla de `pagos/`.** Si va: pegar el bloque, desplegar reglas,
   `./scripts/e2e.sh` → 6/6, `npm run test:reglas` → 13, mergear la 70
   renumerando CLAUDE.md, hosting.
4. Validar en navegador lo de la noche: que los números de Cuentas por cobrar y
   del fondeo **no se movieron**, la entrada de dinero en cobranza, la ficha de
   la orden en solo lectura, Operaciones sin botón de cobrar, y la casilla del
   expediente del proveedor con la nota de corrección.
5. Mandar las preguntas de cobranza a Julio y la del tipo de documento a Gaby
   (§6, redactadas en el resumen).
6. Cerrar lo arrastrado: validar 56–66 y 35–55, deshabilitar las tres cuentas de
   prueba del Auth, confirmar el despliegue de la regla de Storage de los
   documentos de la orden, y pedir las credenciales de Exchange **junto con**
   encender «SMTP autenticado» para ese buzón.
