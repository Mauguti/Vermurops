# Estado de VermurOps — 24 de septiembre de 2026

Corte de la mañana, verificado contra el código y contra producción.
Todo lo que dice «verificado» trae el comando que lo comprobó.

---

## 1. Qué pasó anoche con el sprint

**No se produjo nada. Las dos sesiones que arrancaron murieron en diez
segundos, antes de leer una línea de código.**

Bitácora (`../vermurops-sprint/sprint/logs/sprint-20260924-0243.log`):

```
[02:43:47] Línea base en main (19be5c4)
[02:44:02] Tests en verde · tsc: 9 errores en la línea base
[02:44:02] ▶ 01 · Plantilla oficial de cotización · 240 min disponibles
[02:44:11] ✖ 01 bloqueada o incompleta (rc=1, 0 min). Fallas seguidas: 1
[02:44:11]   el CLI salió rápido con error; espero 20 min por si es límite de uso
[03:04:11] ▶ 02 · Cargos, facturas y pagos · 220 min disponibles
[03:04:21] ✖ 02 bloqueada o incompleta (rc=1, 0 min). Fallas seguidas: 2
[03:04:21] ALTO: 2 tareas seguidas sin terminar
[03:05:29] Fin: 0 terminadas de 2 intentadas.
```

**La causa, con evidencia.** `sprint/logs/tarea-01.log` y `tarea-02.log`
tienen una sola línea cada uno, idéntica:

```
Error: Input must be provided either through stdin or as a prompt argument when using --print
```

El CLI no recibió el prompt. **No es el script**: reproduje la construcción
del heredoc de `sprint.sh` (303 caracteres, correcta) y la invocación exacta
—`claude -p "$PROMPT" --permission-mode acceptEdits --allowedTools ... --max-turns 250`—
y funciona. También probé con `CI=1` y `SPRINT_AUTONOMO=1` exportados, y con
stdin vacío: contesta bien en los tres casos.

Lo que queda como explicación es el **entorno que heredó el proceso al
lanzarse**: `caffeinate -dimsu ./sprint/sprint.sh` desde una terminal cuyo
stdin dejó de estar disponible. El CLI, con `--print` y sin stdin legible,
no cae al argumento posicional.

El otro hallazgo de la corrida: el freno de dos fallas seguidas hizo su
trabajo. El sprint se detuvo solo en vez de quemar ocho tareas a diez
segundos cada una.

**Estado de la cola:** 01 y 02 en `[!]`, las siete restantes intactas en
`[ ]`. No hay ramas `sprint/*` más allá de `sprint/base`, ni canales de
preview: `firebase hosting:channel:list` solo devuelve `live`. El único
registro en `bloqueos.log` es el auto-test de la guardia al arrancar
(`firebase deploy --only hosting`), no un intento real.

**Conclusión: la noche no produjo trabajo, y tampoco rompió nada.** La
guardia, los frenos y la línea base funcionaron; lo que falló fue cómo se
le entrega el prompt al CLI cuando la sesión corre desatendida.

**Arreglo recomendado, una línea en `sprint/sprint.sh`:** pasar el prompt por
stdin en vez de como argumento, que elimina la ambigüedad:

```bash
printf '%s' "$PROMPT" | claude -p --permission-mode acceptEdits ...
```

No lo toqué: `sprint.sh` es tuyo y el cambio se prueba lanzándolo.

---

## 2. Qué hay en producción

| | |
|---|---|
| Commit | `74200b45d0648171790e2396d2eb584372df1a58` |
| main == origin/main == producción | sí |
| Bundle | `index-DyMfmBHE.js` (build y `curl` a la URL coinciden) |
| Functions | `clasificarDocumento` y `extraerTarifas`, v2, us-central1, **nodejs22** |
| Reglas de Firestore y Storage | **las viejas**: cualquier autenticado lee y escribe |

El Bloque 10 (Node 22) sí quedó desplegado — `firebase functions:list` lo
confirma. El Bloque 9 (parche de reglas) está **commiteado en main desde
`0f3ec79` y nunca desplegado**.

**Y tiene un correo mal escrito.** `firestore.rules:36` y `storage.rules:51`
dicen `info@digsol.com`; tu cuenta de trabajo es **`info@digsol.com.mx`**.
Si se despliegan así, te quedas fuera de tu propia base.

Lo publicado hoy, antes de este corte:

| Commit | Qué |
|---|---|
| `22eeb8a` | La columna «Cotizado» enseña el costo cotizado en vez de «—»; «Margen USD» → «Profit USD» |
| `20c28ce` | Margen real por concepto, con estado del costo (estimado / facturado / pagado) |

---

## 3. Pendientes, verificados contra el código

### Seguridad y acceso

| Pendiente | Estado | Qué lo destraba |
|---|---|---|
| Parche de reglas «solo el equipo» | **decisión de Mau** | Corregir `info@digsol.com` → `info@digsol.com.mx` en los dos archivos y desplegar con `--only firestore:rules,storage:rules`. Necesita al equipo presente por si alguien queda fuera |
| Tu correo en el mapa de roles de la UI | **sin empezar** | `src/auth/AuthContext.tsx:31` no lo tiene. Verificado: tu cuenta caería al fallback `ventas` |
| Tu correo en el mapa de las Functions | **sin empezar** | `functions/src/comun/auth.ts:39` tampoco. Exige deploy de Functions |
| Tres cuentas de prueba en el Auth de producción | **decisión de Mau** | Borrarlas o deshabilitarlas en la consola: `admin@`, `pricing@`, `ventas@vermur.com`, con contraseña `123456` |
| Reglas por rol (no solo por correo) | **plan aprobado sin empezar** | Depende de Usuarios y roles: el rol tiene que viajar en el token |

### Usuarios y roles

| Pendiente | Estado | Qué lo destraba |
|---|---|---|
| Paso 1 · Function `asignarRol`, directorio `usuarios/{uid}`, pantalla Configuración → Usuarios | **plan aprobado sin empezar** | Es la tarea 04 del sprint. Decisiones ya tomadas: tú admin, Gaby y Luis admin, Chema sin acceso |
| Paso 2 · Custom claims y reglas que leen la capacidad | **plan por aprobar** | Depende del paso 1 |
| Paso 3 · Portal del cliente como ROL | **plan por aprobar** | Depende del paso 2. Hoy sería un agujero: un usuario cliente leería los márgenes de todos |

### Notificaciones

| Pendiente | Estado | Qué lo destraba |
|---|---|---|
| Notificaciones por ROL | **sin empezar** | Verificado en `src/notifications/NotificationsContext.tsx:74`: solo se persisten las que traen `destinatarioId`. Las de `destinatarios: [rol]` viven en la memoria del navegador que las crea. Exige documentos por uid (no hay directorio) o consulta por rol con cambio de reglas — o sea, depende de Usuarios y roles |
| Sonido de la campanita | **sin empezar** | No existe ningún `Audio` ni `.play()` en `src/`. Verificado |
| Correos del sistema por n8n | **decisión de Mau** | Arquitectura acordada: n8n solo para lo que sale por correo; campanita y contador en Firestore |

### PDF y plantillas

| Pendiente | Estado | Qué lo destraba |
|---|---|---|
| PDF con preliminar de validación e historial, contra la plantilla VL-13732026 | **plan por aprobar** | Es la tarea 01 del sprint, que no corrió. El PDF real está en Storage; falta el análisis |
| Token `X-Vermur-Token` en `generar-pdf-cotizacion` | **sin empezar** | Tarea 05. Verificado: el proxy YA manda el header a todos los flujos (`proxyN8n.ts:156`); solo falta el nodo de validación en el JSON de n8n |
| Motor de plantillas de documentos (BL, booking, carta de porte) | **sin empezar** | — |

### Operaciones: cargos, facturas y pagos

| Pendiente | Estado | Qué lo destraba |
|---|---|---|
| Margen real por concepto | **publicado** hoy (`20c28ce`) | — |
| Subtotal de la factura del proveedor | **sin empezar** | Hoy el clasificador devuelve solo el total, así que toda factura cae en «sin comparar, incluye IVA». Es un campo en el flujo de n8n y en la pantalla de conciliación |
| Facturas consolidadas (una factura, varias OC) y pagos consolidados | **sin empezar** | Tarea 02. El cálculo ya las detecta y se niega a repartir; repartir es decisión de negocio |
| Precargados de Pricing vs. lo que se paga | **plan por aprobar** | Tarea 02: el requisito central del levantamiento con Gaby |
| Anticipos sin factura (release de naviera, garantías) | **sin empezar** | Existe `registrarDeposito` y el panel de fondeo; falta el caso «pago sin factura, la factura llega después» |
| Estatus por cargo (solicitada / en gestión / autorizada / pagada) | **parcial** | El estado vive en la OC y se deriva por proveedor. Falta verlo por cargo en la pestaña Cargos |
| Una factura al cliente por moneda | **sin empezar** | — |
| Tipo de cambio en el embarque | **sin empezar** | El embarque no guarda uno, así que un costo en otra moneda nunca se compara. Es el freno de `sin_tipo_cambio` |

### Cotizaciones

| Pendiente | Estado | Qué lo destraba |
|---|---|---|
| Fase B · agrupación de conceptos y comparativa por cotización | **plan aprobado sin empezar** | Tú validaste la Fase A y salió a producción; el freno se levantó |
| Aviso de profit 0 antes de «Enviar al cliente» | **sin empezar** | Advertencia, no freno. Sale del diagnóstico de hoy: una cotización con `profit = 0` produce venta = costo, y el margen real del embarque nace en cero por más bien que calcule la pantalla |
| Subconceptos visibles en la tabla de la ficha | **sin empezar** | Ventas los pidió en su Excel |
| «PDF generados» repite el mismo nombre de archivo | **sin empezar** | Entra con el bloque de PDF |

### Deuda técnica

| Pendiente | Estado | Qué lo destraba |
|---|---|---|
| Los 9 errores de tsc | **sin empezar** | Tarea 08. Verificado hoy: 1 en `Quotes.tsx`, 5 en `FichaCotizacion.tsx`, 3 en `RightChatPanel.tsx` |
| Kanban avisa del freno al soltar, no antes de mover | **sin empezar** | Tarea 07. Verificado en `KanbanCotizaciones.tsx:130` |
| Key duplicada en el filtro de país de Puertos | **sin empezar** | Tarea 07. Verificado en `Puertos.tsx:112` |
| Bug en frío: solicitud vacía tras «Enviar a Pricing» | **sin empezar** | Tarea 06. Visto dos veces, nunca reproducido con método |
| Code splitting | **sin empezar** | Tarea 09. El bundle pesa 3.08 MB (645 KB gzip) |
| Router | **sin empezar** | Verificado: no hay `react-router` en `package.json`. Es prerrequisito cómodo del code splitting |
| `getCostoOficial` suma tarifas sin mirar la moneda | **decisión de Mau** | Corregirlo cambia el costo y el margen de cotizaciones VIVAS |
| Dualidad de `CotizacionProveedor` | **sin empezar** | 2-3 días, riesgo alto |
| `serviciosStore` en localStorage | **sin empezar** | Retiro gradual: quedan Settings, Shipments y FichaRFQ |
| La ficha guarda el documento entero; dos ediciones se pisan | **sin empezar** | `arrayUnion` para `actividades` y `updateDoc` por campos |

### Base de datos

| Pendiente | Estado | Qué lo destraba |
|---|---|---|
| Base limpia para el arranque real | **plan por aprobar** | Inventario de qué se borra y qué se conserva, en qué número queda cada consecutivo, y **respaldo antes del primer borrado**. Ni un `delete` sin tu aprobación por escrito |
| No hay entorno de desarrollo: localhost escribe en producción | **decisión de Mau** | Los emuladores por opt-in ya cubren el día a día; el proyecto de staging cuesta plan Blaze aparte |

### Seguridad — anotado el 24-sep-2026, fuera del sprint

| Pendiente | Estado | Qué lo destraba |
|---|---|---|
| **Las URLs de Storage son públicas para quien tenga el enlace** | **sin empezar** | Los documentos se guardan con `getDownloadURL()` ([useDocumentosEmbarque.ts:52](../src/hooks/useDocumentosEmbarque.ts)), que devuelve una URL con `?alt=media&token=…`. Esa URL abre el archivo **sin sesión y sin pasar por las reglas**. Hoy solo viven dentro de la app, pero en cuanto alguien pegue una en un correo o un WhatsApp, el documento queda accesible de forma permanente hasta que se revoque el token. Implica que cualquier marca de «visible para el cliente» es una convención de la interfaz, no un control de acceso. Se cierra con URLs firmadas con vencimiento, generadas por una Function |

### Para Vermur — anotado el 25-sep-2026

**Los 27 conceptos del catálogo con `reglaIVA: 'revisar'`.** Mientras
sigan así, el impuesto de esas líneas sale «Sin determinar» en la cotización
(Bloque 3) y hay que capturarlo a mano una por una. Administración tiene que
cerrarlos: es catálogo, no código.

**Corrección:** en el corte anterior dije «18». Son **27**. El conteo
viejo salió de un `grep` sobre `"reglaIVA":"revisar"` sin espacios, que solo
encontró las líneas compactas de `conceptos.json` y se saltó las que están
formateadas. El número real sale de leer el JSON.

| Id | Concepto | Categoría |
|---|---|---|
| `CON-019` | Agent Profit Share | financiero |
| `CON-020` | Agent Profit Share - Expense | financiero |
| `CON-022` | All In Destination Expenses | otros |
| `CON-024` | All In Origin Expenses | otros |
| `CON-029` | Consulting And Forwarding Fees | otros |
| `CON-033` | Container Repair | otros |
| `CON-038` | Courier Fee | otros |
| `CON-043` | Demurrages | demoras |
| `CON-044` | Discount | financiero |
| `CON-061` | Labels | otros |
| `CON-065` | Notas | otros |
| `CON-067` | Opening Balance Expense | financiero |
| `CON-068` | Opening Balance Income | financiero |
| `CON-069` | Other Charges | otros |
| `CON-073` | Other Charges 4 | otros |
| `CON-078` | Overweight Surcharge For International Freight | flete |
| `CON-081` | Pat - Other Charges | otros |
| `CON-089` | Retencion Isr | financiero |
| `CON-090` | Retencion Isr Resico | financiero |
| `CON-091` | Retencion Iva | financiero |
| `CON-092` | Sales Comission | otros |
| `CON-095` | Shipping And Handling Fee | maniobras |
| `CON-099` | Transfer Fee | financiero |
| `CON-102` | Warehouse | almacenaje |
| `CON-103` | Warehouse Pallet In | almacenaje |
| `CON-104` | Warehouse Pallet Out | almacenaje |
| `CON-105` | Wrapping | otros |

**Captura pendiente del Bloque 4.** El reordenamiento de la ficha de
cotización se publicó sin captura: el script de Playwright se colgó dos veces
contra los emuladores. Mau lo valida en el canal de preview.

### Esperando a Vermur

| Pendiente | Estado |
|---|---|
| Consecutivos de Magaya para los folios | **esperando a Vermur** |
| Lista de puntos terrestres | **esperando a Vermur** |
| Qué tipo de cambio usa la empresa y cuál es la fuente oficial | **esperando a Vermur** |
| Qué le falta al catálogo de servicios | **esperando a Vermur** |
| Dónde se generan las notas de crédito | **esperando a Vermur** |
| Qué documentos son de la cotización y cuáles del embarque | **esperando a Vermur** |
| Términos y condiciones por modalidad, logos en buena resolución, qué significa «PO» | **esperando a Vermur** |

---

## 4. Decisiones que te tocan

1. **El correo de las reglas.** Confirmo `info@digsol.com.mx` y corrijo los dos
   archivos antes de desplegar. *Recomiendo: sí, y desplegar con el equipo
   presente.*
2. **Las tres cuentas de prueba en producción.** *Recomiendo: deshabilitarlas
   hoy en la consola; son credenciales válidas con contraseña `123456`.*
3. **Tu cuenta.** *Recomiendo: crearla en la consola y meter tu correo en los
   dos mapas de roles, en el mismo bloque que las reglas.*
4. **El sprint.** *Recomiendo: arreglar la entrega del prompt por stdin y
   volver a lanzarlo esta noche; las nueve tareas siguen vigentes.*
5. **Subtotal de la factura del proveedor.** *Recomiendo: agregarlo al flujo de
   n8n y a la conciliación; sin él, el excedente nunca se dispara por factura,
   solo por corrección manual.*
6. **Tipo de cambio del embarque.** *Recomiendo: heredarlo de la cotización al
   abrir el embarque, que ya lo guarda con su fuente y su fecha.*
7. **Aviso de profit 0.** *Recomiendo: advertencia en la franja de próximos
   pasos, nunca freno; Pricing a veces cotiza a costo a propósito.*
8. **`getCostoOficial` y la moneda.** *Recomiendo: correr primero
   `scripts/auditarMonedasMezcladas.ts` para medir el alcance; sigue sin
   correrse desde que se anotó.*

---

## 5. Orden propuesto para la tarde

Bloques chicos, publicables uno por uno. Primero lo que necesita al equipo
presente.

1. **Reglas + tu cuenta + cuentas de prueba** *(equipo presente)*
   Corregir el correo, desplegar reglas de Firestore y Storage, crear tu
   cuenta, meterla en los dos mapas, deshabilitar las tres de prueba.
   Que cada área entre y confirme que ve lo suyo. Punto de regreso: revertir
   el despliegue de reglas es un `firebase deploy` del archivo anterior.
2. **Los 9 errores de tsc** *(sin riesgo)*
   Deja `tsc` en cero y permite volverlo bloqueante. Tarea 08.
3. **Kanban y Puertos** *(sin riesgo, se nota)*
   Dos molestias visibles que se arreglan juntas. Tarea 07.
4. **Token del webhook del PDF** *(JSON de n8n, sin deploy de la app)*
   El proxy ya manda el header; solo falta el nodo de validación. Tarea 05.
5. **Subtotal de la factura + tipo de cambio del embarque**
   Enciende las dos ramas del margen real que hoy caen al fallback.
6. **Usuarios y roles, paso 1** *(el bloque grande)*
   Con las reglas ya puestas, es el camino a reglas por rol.

Fuera de este orden, cuando haya hueco: Fase B, el análisis de Operaciones
(tarea 02) y el diseño del PDF contra la plantilla real (tarea 01) — los
tres son reportes o planes, no código, y se pueden volver a dar al sprint.
