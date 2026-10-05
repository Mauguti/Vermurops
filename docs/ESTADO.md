# Estado de VermurOps — 5 de octubre de 2026

**Corte del sprint nocturno del 5-oct: la cadena 56 → 66 está COMPLETA y SIN
PUBLICAR.** Once tareas cerradas, cero bloqueos de la guardia, cero `[!]`.
Punta: `sprint/66-embarque-automatico-switch`, que sale en línea de las diez
anteriores — mergearla trae las once.

**Producción sigue en la cadena 35 → 55** (main == origin/main, hosting
`index-By7gL9-J.js`). Nada del sprint del 5-oct ha llegado al equipo.

En la punta de la cadena: **103 archivos · 2,369 tests en verde** (línea base
2,317) · `tsc --noEmit` **0 errores** · `npm run build` limpio ·
`./scripts/e2e.sh` **6/6 dos veces** · filtros 34/34 · barrido 95/95.

El resumen de la noche, con la secuencia de publicación y las preguntas
redactadas, está en `sprint/reportes/RESUMEN.md` (no versionado).

---

## 1. La cadena 56 → 66, sin publicar

Cada rama sale de la anterior. En orden:

| # | Tarea | Rama | Despliega |
|---|---|---|---|
| 56 | TC: el de Pricing calcula, Banxico solo referencia | sprint/56-tc-pricing | Hosting |
| 57 | Cuentas bancarias, OneDrive y el folio inventado | sprint/57-cuentas-onedrive-folio | Hosting |
| 58 | Un renglón por factura y COD a la orden | sprint/58-vista-proveedor-factura | Hosting |
| 59 | Importación y exportación visibles en Embarques | sprint/59-trafico-embarques | Hosting |
| 60 | Contactos múltiples en clientes, con tipo | sprint/60-contactos-cliente | Hosting |
| 61 | Vistas guardadas y columnas en Finanzas | sprint/61-vistas-finanzas | Hosting |
| 62 | PLAN: pagos, cobros, flujo de efectivo, prefactura | sprint/62-plan-pagos | Nada (plan) |
| 63 | Un solo botón de Documentos que clasifica el tipo | sprint/63-boton-documentos | Hosting + Functions |
| 64 | Correo saliente por Exchange | sprint/64-correo-exchange | Hosting + Function + 2 secretos |
| 65 | Carga de «Clientes OK» (script en seco) | sprint/65-carga-clientes-ok | Nada (scripts) |
| 66 | Embarque automático: diagnóstico y switch apagado | sprint/66-embarque-automatico-switch | Hosting |

**Ninguna rama toca reglas, índices ni migra datos.** Lo documentado en
CLAUDE.md: §4.23 (57), §4.24 (58), §4.25 (59), §4.26 (60), §4.27 (61),
§4.28 (63), §4.29 (64), §4.30 (65), §4.31 (66); §4.3 ampliada por la 56.

### Lo que hay que hacer antes del hosting

1. **Los dos secretos del correo, PRIMERO** — una Function que declara un
   `defineSecret` inexistente **no despliega**:
   `firebase functions:secrets:set CORREO_SMTP_USUARIO` y `CORREO_SMTP_PASSWORD`.
2. **`functions:clasificarDocumento` antes del hosting** (63): si va después, el
   navegador nuevo pediría el flujo `documento-oc` que la Function vieja no
   conoce y contestaría 400. El deploy **preguntará por
   `N8N_WEBHOOK_URL_DOC_OC`** (`defineString` nuevo, §3): Enter acepta el default.
3. **`functions:enviarCorreo`** (64). Si las credenciales de Exchange no han
   llegado, se puede publicar sin este paso: la tarjeta de Integraciones se ve y
   el botón dice que falta configuración. Nada más depende de ella.
4. Hosting, y `git push origin main`.

Todo con su `cd /Users/mauriciogutierrezmunoz/antigravity/Vermur-Logistics` y
leyendo `uploading`, no `skipping upload` (§3).

### Opcional, aparte — no bloquea la publicación

- **Regla de Storage `ordenesCompra/{id}/documentos/`** (bloque exacto en el
  reporte 63). Sin ella, los documentos de la orden caen en `factura/`, que
  acepta **solo PDF y XML**: un comprobante en PNG se rechaza.
- **Flujo `clasificar-documento-oc` en n8n** — no existe todavía. El cambio
  exacto (webhook, prompt, tipos, campos del multipart) está escrito en el
  reporte 63. Mientras no exista, los archivos de la orden caen «Sin
  clasificar» y el tipo se elige a mano: la app funciona.

### Lo nuevo en la cadena 56 → 66

- **Tipo de cambio (56):** el **operativo** es el de Pricing (`pricing_rate`) y
  es la fuente por defecto de una cotización nueva. El FIX del DOF queda como
  **referencia informativa** — se quitó el botón «Usar el de Banxico», no
  precarga nada ni entra en ningún cálculo. Las cotizaciones viejas conservan su
  tasa congelada y al reabrir la captura se dice de dónde vino. 16 tests.
- **Cuentas y datos de ejemplo (57):** siete cuentas bancarias con su uso en el
  selector (ids viejos se leen sin migrar); `expedienteDrive` se etiqueta
  **OneDrive** con columna y filtro en Altas; fuera el «Folio siguiente:
  F-2023-088» inventado y la pantalla de facturación inalcanzable que lo rodeaba,
  más el CSV de Cotizaciones que bajaba las cotizaciones de ejemplo de 2023.
- **Cuentas por pagar (58):** la unidad de lo que se debe es la **factura**, no
  la orden. `lib/facturasProveedor.ts`, 21 tests. Resuelve el IDAMEX duplicado
  que vio Julio, reproducido en emulador. El COD va en el renglón, enlazado a la
  ficha de la orden — esconderlo tras la expansión lo tumbó el recorrido e2e.
- **Tráfico del embarque (59):** se **deriva** (folio primero, ruta después),
  sin campo nuevo. Columna y filtro, más filtro por mes de cierre con la fecha
  del lado mexicano de la operación (ETA en impo, ETD en expo). Los dos se
  guardan con la vista. 18 + 6 tests.
- **Contactos del cliente (60):** 169 de los 817 ya traían contactos de Magaya y
  ninguna pantalla los enseñaba. Editor único compartido con el proveedor; cinco
  tipos; se **desactivan**, no se borran, y desactivar al principal lo traspasa.
  26 tests.
- **Finanzas (61):** `SpreadsheetTable` en las dos pantallas, con filtros
  guardados en la vista y **el CSV con las columnas de la vista** — antes
  agregar una columna la dejaba fuera del archivo del cierre. 17 + 9 tests.
- **Plan de pagos (62):** `docs/sprint-post-junta/PLAN-PAGOS.md`, 872 líneas, con
  archivo y línea en cada afirmación. **Es lo que se construye martes y
  miércoles.** Tres hallazgos del Paso 0: el lado del cliente tiene dos formas
  incompatibles y ninguna registra «doce facturas con una transferencia»; el
  lado del proveedor no tiene entidad de pago, solo un string copiado N veces
  (de ahí que pago parcial y reversa no existan); y el bloque 1 de Gaby estaba
  bien diagnosticado hasta el detalle de la moneda heredada.
- **Botón único de documentos (63):** el tipo se propone **después** de leer el
  archivo, en los tres lugares (cliente, proveedor, orden). Clasificación de
  mejor esfuerzo: si el agente falla, «Sin clasificar» y el archivo ya está en
  Storage. La orden estrena `documentos?: DocumentoOC[]` con **complemento de
  pago**. 32 tests.
- **Correo (64):** `enviarCorreo` por `smtp.office365.com:587`, credenciales en
  Secret Manager, modo `captura` en emulador y las cuatro causas de falla
  separadas —incluido el `535 5.7.139` de SMTP AUTH apagado, que se lee como
  contraseña mala y no lo es. **Ninguna notificación está conectada todavía.**
- **Carga de clientes (65):** `clientes-ok.xlsx` no llegó, así que el script
  quedó con mapeo de columnas configurable y probado con un fixture sintético.
  58 tests. En seco por omisión, con respaldo y reversa que distingue «valía
  null» de «no existía». Tres reglas niegan escrituras: lo capturado a mano no
  se pisa, lo ausente no se toca, un empate dudoso no se adivina.
- **Embarque automático (66):** no faltaba código, faltaba el **dato**. Pasó de
  constante a **interruptor en Configuración → Consecutivos de folio, apagado y
  fail-closed**, y el formato del folio se configura por serie. 52 tests.

---

## 2. Lo que está en producción (cadena 35 → 55)

Todo hasta la 55. Hosting `index-By7gL9-J.js` (2-oct). Las 15 reglas de IVA de
la tarea 39 aplicadas el 2-oct; punto de retorno
`docs/datos/respaldo-conceptos-iva-2026-10-02T16-27-38.json`:

```bash
SERVICE_ACCOUNT=/ruta/a/llave.json npx tsx scripts/revertirConceptosIVA.ts \
  docs/datos/respaldo-conceptos-iva-2026-10-02T16-27-38.json
```

**Las 21 ramas publicadas, por cadena:**

| Cadena | Tareas | Despliegues |
|---|---|---|
| 35–42 | datos fiscales, IVA factura proveedor, días de crédito, aprobación de proveedores, script IVA, documentos base, notificación de arribo, plan carga fiscal | Hosting + Functions + Reglas |
| 43–48 | botón Regresar, acciones arriba, barrido de filtros (inventario y arreglos), barrido de consola por rol, textos de Finanzas | Hosting |
| 49–55 | auditoría 35–48, acciones arriba resto, TC Banxico, cartas encomienda, plan reglas por rol, expediente del proveedor, factura en la OC | Hosting + Functions + Reglas Firestore y Storage |

**Functions, las seis, Node 22 en us-central1:** `extraerTarifas`,
`clasificarDocumento`, `gestionarUsuarios`, `generarDocumento`,
`tipoCambioProgramado` (0 8,10,12,14,16,18 L-V, hora de la Ciudad de México) y
`actualizarTipoCambio`. Log sin un solo error.

**La consulta automática de Banxico SÍ funciona** — contra lo que se asumía. El
log real del 5-oct muestra `tiposCambio/2026-10-01` = 18.3688 y `2026-10-02` =
18.1903 escritos, en sus horarios, sin errores. El 3 y 4 fueron fin de semana y
no corrió, que es correcto. Lo que no funcionaba era su **papel**: ese no es el
número con el que Vermur cotiza. Eso es lo que corrige la 56.

Pendiente de la cadena anterior: **validar 35–55 en navegador**
([VALIDACION-35-55.md](sprint-post-junta/VALIDACION-35-55.md)).

---

## 3. Cola restante

La cola 56–66 quedó vacía a las 15:26. Lo que sigue, en orden de urgencia:

| Qué | Tipo | Bloquea |
|---|---|---|
| **Publicar la cadena 56 → 66** (secretos → Functions → hosting) | Despliegue | Todo lo de abajo |
| Validar 56–66 en navegador | Validación | Cerrar el sprint |
| **Construir los bloques 1–4 del plan de pagos** (martes y miércoles) | Código | Aprobar M1–M7 del reporte 62 |
| Sembrar los seis consecutivos reales de Magaya y confirmar el formato del folio | Dato externo | Encender el embarque automático |
| Pedirle a Luis «Clientes OK» en CSV y correr la carga en seco | Dato externo | Los 817 clientes sin RFC |
| Fase 1 del plan 42: minar `numeroEntidadMagaya` → `rfc` (~250–300 clientes) | Script | Timbrado |
| Validar 35–55 en navegador (arrastrado) | Validación | Cerrar el sprint anterior |
| Borrar o deshabilitar las tres cuentas de prueba del Auth de producción | Seguridad | — |
| Regla de Storage `ordenesCompra/{id}/documentos/` | Reglas | Comprobantes en imagen |
| Flujo `clasificar-documento-oc` en n8n | n8n | Clasificar documentos de la orden |
| Credenciales de Exchange + encender SMTP AUTH | Dato externo | El correo saliente |
| Plan de reglas por rol (53) | Código | Decisión: ¿se adelanta? |
| Confirmaciones de Julio (3 conceptos IVA + regla fiscal TC + IVA oficina) | Decisión | Script 39, tareas 51 y 55 |
| Freno de facturación por datos fiscales incompletos | Código | Timbrado |
| Pasos 2 y 3 de aprobación de proveedores | Código | Julio define docs |
| Freno de OC por expediente del proveedor | Código | Decisión de Mau |
| Documentos operativos restantes (BL, booking…) | Código | Preguntas de Gaby |
| Tarea 25: correo como imagen en revisión de tarifas | Código | No se ha intentado |

Y lo que arrastramos: barrido de reglas sin quien las llame, `tsc` bloqueante en
el build, y la limpieza de los seis archivos huérfanos de la 57.

---

## 3.1 Lo que espera a Julio y Gaby

Nada de esto se construye hasta tener respuesta. **Las 21 preguntas están
redactadas para copiar en `sprint/reportes/RESUMEN.md` §4.** Las que bloquean:

| Qué | Por qué está trabado |
|---|---|
| **El formato del folio del embarque** | «BLIM + año + tres dígitos… arrancamos en 2701» no cuadra con los `VLIM-26-001` ya impresos. Tres lecturas posibles; recomendamos VLIM. Y: ¿el consecutivo reinicia en enero? ¿En qué número va cada serie? |
| **El saldo de las siete cuentas** | Es lo único que la plataforma no puede saber sola. ¿Captura diaria o se baja del portal? |
| **Monex pesos y BBVA** | Quedaron en el selector sin criterio para sugerirlas |
| **El cierre de mes: arribo o pedimento** | Usamos el arribo; el pedimento no tiene fecha propia en el modelo |
| **La regla del TC de Pricing** | ¿Número diario o regla sobre otra tasa? ¿Igual para todos los clientes? |
| **El TC de la factura** | El CFDI exige el del DOF, no el de Pricing. Conviene que quede dicho antes de facturar |
| **Días festivos** | El vencimiento se recorre al lunes (§4.7), pero la lista tiene que ser suya y configurable |
| **Fondeo, anticipos, complemento de pago, pronto pago** | Cuándo, quién y cómo se reparte |
| **Documentos del proveedor extranjero** | Qué exige su expediente frente al nacional; y si el checklist suma poder notarial e identificación |
| **CON-019, CON-022, CON-081** | Las tres reglas de IVA aplicadas tal como vinieron, sin confirmar |
| **Primer reporte a automatizar** | Cuál de los que hoy hacen a mano |

Material de preparación: [PREVIA-JUNTA-ADMIN.md](sprint-post-junta/PREVIA-JUNTA-ADMIN.md).

---

## 4. Decisiones pendientes para Mau

Las 18 están desarrolladas, con recomendación cada una, en
`sprint/reportes/RESUMEN.md` §3. Las que bloquean trabajo:

### Del sprint del 5-oct

1. **Los siete puntos del plan de pagos (62):** `pagos/` con aplicaciones
   embebidas; los cuatro campos nuevos; ¿Operaciones deja de registrar cobros?;
   ¿Operaciones marca «no pagar» y solo Admin lo libera?; ¿se adelanta el plan
   de reglas por rol?; ¿parar en P3?; ¿correr `auditarPagos.ts` antes de P1?
   **Recomendación en los siete: sí**, y parar en P3.
2. **¿Enciendo la creación automática de embarques?** (66) No de golpe: sembrar
   los consecutivos, confirmar el formato, encenderla con Operaciones mirando.
3. **¿El correo se enciende antes o después de las capacitaciones del lunes 12?**
   Recomendación: después. Hoy no hay notificación conectada.
4. **Campo para el registro de corrección de tipo en el expediente del
   proveedor** (63): `ArchivoExpediente` no tiene dónde. Propuesto
   `clasificacion?: { tipoCrudo?, confianza?, observaciones? }`.
5. **¿El pricing rate se guarda una vez y se hereda?** (56) Toca `firestore.rules`.
6. **¿Borro los seis archivos huérfanos?** (57) ~1,700 líneas con datos
   inventados que nada importa. En commit aparte.
7. **¿Reservas y Recolecciones?** (57) Rutas sin menú: quitarles ruta y permiso.
8. **¿Las siete cuentas pasan a catálogo de Firestore?** (57) No hasta decidir
   el modelo de saldos del bloque 3.
9. **¿El proveedor también desactiva contactos en vez de borrarlos?** (60) Tarea
   aparte: toca los 544.
10. **¿El interruptor se muda a `configuracion/foliosEmbarque`?** (66) No hasta
    que toque publicar reglas por otra razón.

### Arrastrados

11. **Regla de `configuracion` y `tiposCambio`** — bloque exacto en el reporte 51.
12. **¿Las 6 cuentas ya tienen el custom claim `rol`?** Prerrequisito del plan 53.
13. ¿Administración necesita la vista `quotes`? Tiene `cotizacion.crear` pero no
    `quotes` en `ALLOWED_VIEWS_BY_ROLE`.
14. ¿`info@digsol.com.mx` sigue como admin?
15. ¿El despliegue de las reglas por rol se hace un sábado?
16. ¿Freno de facturación por datos fiscales incompletos? ¿Tolerancia del IVA
    configurable?
17. ¿Correr `auditarCotizacionesVivas.ts` contra producción? (plan 17)
18. ¿Agentes de carga son siempre clientes de oficina? ¿Operaciones ve la Bandeja
    de Pricing o solo la lista? (plan 18) ¿Bloquear envío por tarifas vencidas al
    reciclar? (plan 19) ¿Gaby y Luis ambos admin? (tarea 21)
19. Confirmar `VERMUR_N8N_TOKEN` como variable de entorno en n8n (tarea 22).

---

## 5. Deuda crítica que no se movió

- Reglas de Firestore no distinguen roles (plan escrito en la tarea 53; la 62
  recomienda adelantarlo: un pago escrito desde la consola es dinero que nadie
  autorizó)
- `localhost` sin emuladores escribe en producción
- Tres cuentas de prueba en el Auth de producción
- `getCostoOficial` suma sin mirar moneda
- Las notificaciones por ROL no llegan a nadie (el correo de la 64 existe pero
  no está conectado a ninguna notificación)

---

## 6. Entregables vigentes que no son código

**Planes** (`docs/sprint-post-junta/`):
- `PLAN-PAGOS.md` — **nuevo (62)**: pagos y aplicaciones, flujo de efectivo,
  prefactura. Ocho pasos publicables; es lo de martes y miércoles.
- `PLAN-CARGA-FISCAL.md` — minar Tax IDs, pedir export, script de carga.
  **§7 corregido por la 65**: el consecutivo vive en `referenciaMagaya` y el Tax
  ID en `numeroEntidadMagaya`, no en `rfc`.
- `AUDITORIA-35-48.md` — veredictos de publicación de las 14 tareas previas.
- `PLAN-REGLAS-POR-ROL.md` — matriz colección × rol, migración a claims.
- `PLAN-FUENTE-TARIFA.md`, `PLAN-EQUIPOS-MINIMO.md`, `PLAN-RECICLAR.md`,
  `PLAN-C.md`, `PLAN-APROBACION.md`.

**Diagnósticos:** `BARRIDO-FILTROS.md` (43 filtros), `BARRIDO-GENERAL.md`
(95 pantallas × 5 roles, limpio).

**JSON de n8n** (`docs/n8n/`): `generar-pdf-cotizacion.n8n.json`,
`tipo-cambio-banxico.n8n.json`. **Falta por escribir:** `clasificar-documento-oc`
— el cambio exacto está descrito en el reporte 63, sin inventar el flujo.

---

## 7. Orden propuesto para la mañana

1. Leer `sprint/reportes/RESUMEN.md` y los reportes que interesen.
2. **Publicar la cadena 56 → 66**: secretos del correo → `clasificarDocumento`
   → `enviarCorreo` → hosting → `git push origin main`. Si las credenciales de
   Exchange no llegaron, saltar los pasos del correo y publicar el resto.
3. Validar en navegador lo de la noche: Cuentas por pagar por factura (que
   IDAMEX salga una vez), la columna Tráfico y el mes de cierre en Embarques,
   los contactos del cliente, las vistas guardadas de Finanzas, el botón único
   de documentos y el interruptor de folio **apagado**.
4. Mandar las 21 preguntas de §4 del resumen: el formato del folio y los
   consecutivos a Julio (bloquean encender el embarque automático), el TC a
   Gaby, el CSV a Luis.
5. Aprobar o ajustar los siete puntos del plan de pagos, para poder construir
   martes y miércoles.
6. Pedir las credenciales de Exchange **junto con** encender «SMTP autenticado»
   para ese buzón — viene apagado por omisión y el error se lee como contraseña
   mala.
7. Cerrar lo arrastrado: validar 35–55, deshabilitar las tres cuentas de prueba
   del Auth, publicar la regla de Storage de los documentos de la orden.
