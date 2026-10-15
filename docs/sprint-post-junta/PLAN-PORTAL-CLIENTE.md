# PLAN: portal del cliente como rol (tarea 118)

Solo plan, cero código. Punto 8 de Mau. Todo lo que dice «hoy» se verificó en
el código de la rama `sprint/118-portal-cliente-rol` (sale de la 117).
Lo que depende de datos de producción lo marco **[medir]**: lo corre Mau con su
llave, no esta sesión.

> **Resumen de una línea.** El portal no es una pantalla: es una frontera de
> seguridad. Hoy esa frontera no existe para un cliente externo, y la parte
> más peligrosa no es la que parece (las reglas), sino que **el documento
> `embarques/{id}` mezcla lo del cliente con costos, márgenes y bitácora**, y
> las reglas de Firestore no ocultan campos. Hay que construir una proyección
> aparte antes de abrir una sola cuenta.

---

## 1. Qué existe hoy

### 1.1 «Ver como cliente»

- Botón en el encabezado de la ficha del embarque
  (`FichaEmbarque.tsx:666-669`, `id: 'ver-cliente'`) que abre `VistaCliente`
  (`FichaEmbarque.tsx:1816-1822`).
- `VistaCliente.tsx` (214 líneas) es un modal **de solo lectura para el
  equipo**. Su propio encabezado lo dice: «es una VISTA PREVIA: no es el portal
  del cliente». Enseña etapa (`estadoDe`, `ETAPA_MAP`), datos del embarque,
  eventos y `documentosParaCliente(embarque.documentos)`.
- No hay sesión de cliente, ni ruta, ni consulta propia: recibe el embarque ya
  cargado por un usuario del equipo. **No prueba nada sobre seguridad**; solo
  sobre qué se pinta.

### 1.2 Visibilidad de documentos al cliente

`lib/visibilidadDocumentoCliente.ts` (Bloque 2). Regla **por tipo**, no
palomita: `visible` (factura al cliente), `sensible` (factura de proveedor,
carta de encomienda, pedimento: nunca salen solas) e `interno` (todo lo demás,
nace oculto). `EmbarqueDocumento.visibleCliente?: boolean` es la excepción
declarada; sin él se lee la regla del tipo (legado primero, nada se reescribe).

El propio archivo dice, en su cabecera, la salvedad que manda en este plan:

> «Hoy los archivos se guardan con `getDownloadURL()`, que devuelve una URL con
> token: abre el archivo SIN sesión y sin pasar por las reglas. […] esta marca
> es una convención de la interfaz, no un control de acceso.»

Verificado: `getDownloadURL` se llama en 9 lugares de `src/` (documentos del
embarque `hooks/useDocumentosEmbarque.ts:52`, expediente
`hooks/useExpedienteCliente.ts:69` y `ExpedientePanel.tsx:126`, PDF de la
cotización `usePdfCotizacion.ts:96`, tarifarios, subida clasificada,
factura de OC…) y la URL **se guarda en el documento** (`EmbarqueDocumento.url`).

### 1.3 Por qué se borró `ClientPortal.tsx` (tarea 78)

Commit `90a8236`. No lo importaba nadie (cero importadores) y era **maqueta con
datos inventados**: `trackingResult` simulado con un embarque de Qingdao de
2023, `myShipments` y `invoices` escritos en el código (`F-2023-086`…) e
inventario de bodega ficticio. No leía Firestore, no tenía sesión. Su borrado
no quitó nada funcional; lo que quedó de «portal» en la interfaz es
`VistaCliente` (arriba). Además, en el Bloque 7 se retiró el botón «Portal del
Cliente» del encabezado (CLAUDE.md §4.20) con la nota «vuelve como ROL cuando
exista Usuarios y roles». Existen ya Usuarios y roles (§4.65). Este plan es
ese «cuando».

---

## 2. Seguridad primero

**Principio:** un cliente externo ve solo lo suyo, y eso lo garantizan **solo**
las reglas de Firestore y Storage, más las Functions. Esconder botones no
cuenta. Cada punto de abajo es una condición para **abrir la primera cuenta
cliente**, no para escribir la pantalla.

### 2.1 Lo que ya protege (y hay que conservar)

- `esDelEquipo()` (`firestore.rules`, función junto a `tieneRolValido`) exige
  `tieneRolValido() || correoDelEquipo()`. `tieneRolValido` solo acepta los
  cinco roles internos. Un token con `rol: 'cliente'` **no entra a nada** hoy:
  todas las colecciones usan `esDelEquipo()` y el catch-all niega el resto.
  Es decir, el valor por defecto ya es «cerrado». Cualquier regla nueva para
  clientes se **suma** y no debe tocar `esDelEquipo()`.
- Las cuentas de prueba se niegan por nombre (`esCuentaDePrueba`). Se conserva.

### 2.2 Lista exacta de lo que tiene que existir antes

**P-1. Claim `clienteId` junto al claim `rol: 'cliente'`.**
`setCustomUserClaims` reemplaza el objeto completo (el código ya lo sabe,
`gestionarUsuarios.ts:431-436`): al ligar un cliente hay que conservar los
claims previos. El claim es lo que las reglas leen
(`request.auth.token.clienteId`): leer `usuarios/{uid}` desde las reglas con
`get()` costaría una lectura por evaluación y se puede desincronizar. Un claim
solo lo pone el Admin SDK desde `gestionarUsuarios` (exige `usuario.gestionar`,
solo admin): el navegador no puede mandar el suyo.
Un solo cliente por cuenta en esta fase (ver pregunta Q2).

**P-2. Un rol que las dos listas de roles no deben tragarse.**
Hallazgo verificado, y es el riesgo más fácil de pasar por alto:
- `AuthContext.tsx:128-132`: si el claim `rol` no está en `ROLES_VALIDOS`,
  **cae a `getRolByEmail`**, y para un correo fuera del mapa devuelve
  `ROL_FALLBACK = 'ventas'` (`AuthContext.tsx:72`).
- `functions/src/comun/auth.ts:144-146`: lo mismo. Un token `rol: 'cliente'`
  se evalúa como **ventas**, con `CAPACIDADES.ventas = lead.crear,
  cotizacion.solicitar, kanban.ver` (`auth.ts:88`). Es decir, un cliente
  podría llamar a `clasificarDocumento` con el flujo de cotización/lead y
  **gastar IA a cuenta de Vermur**, y su interfaz pintaría el menú de Ventas
  (vacío de datos, porque las reglas lo niegan, pero visible).
- Arreglo: «un claim `rol` presente y desconocido **no** cae al mapa ni al
  fallback; se trata como sin permisos». `cliente` es un valor de `UserRole`
  aparte, con `CAPACIDADES.cliente = []` y `ALLOWED_VIEWS_BY_ROLE.cliente`
  acotado al portal. Con test en las dos mitades (cliente y Functions).
- `gestionarUsuarios.invitar` hoy valida contra `ROLES_VALIDOS`. **No** se
  agrega `cliente` ahí hasta tener P-1…P-6; si no, quedaría invitable una
  cuenta cuyo modelo de seguridad no existe.

**P-3. Proyección para el cliente: `portalEmbarques/{embarqueId}`
(modelo para aprobación, §6).**
Este es el punto que decide el diseño. Las reglas de Firestore autorizan por
**documento**, no por campo. El documento `embarques/{id}` contiene (verificado
en `EmbarquesData.ts`): `cargos` (costos por proveedor, venta, margen,
desviaciones; líneas 145-220, 481), `bitacora` (lo interno, línea ~488),
`entidades` (todos los proveedores, agentes, shipper), `cierres`, el cotejo
con OC, etc. Si el cliente pudiera leer `embarques/{id}` por tener
`clienteId == suyo`, **leería el margen de Vermur**, que es exactamente lo que
`visibilidadDocumentoCliente` dice proteger.

Opciones:
  1. **Proyección escrita por el servidor** (recomendada): una Function
     (disparador `onDocumentWritten` de `embarques/{id}`) deriva y escribe
     `portalEmbarques/{id}` con **solo** lo permitido: `clienteId`, folio,
     modalidad, tráfico, ruta (origen/destino), etapa, ETD/ETA, contenedores,
     la línea de tiempo visible (§3), y los documentos marcados visibles
     (id, nombre, tipo, `storagePath`, sin `url`). Las reglas dicen
     `allow read: if esCliente() && resource.data.clienteId == request.auth.token.clienteId`
     y `allow write: if false`. Una lista blanca en código: un campo nuevo del
     embarque **no** llega al portal salvo que alguien lo agregue a propósito.
     Es la misma lógica del documento de versiones: la foto separada de la viva.
  2. Rechazada: reglas sobre `embarques/{id}` con filtro por campo. Las reglas
     no pueden recortar campos; solo permitir o negar el documento entero.
  3. Rechazada: mover cargos y bitácora a subcolecciones del embarque. Es una
     migración de datos vivos (§CLAUDE.md «datos legacy») y toca todos los
     lectores de cargos. Mucho más riesgo para el mismo resultado.

**P-4. Cómo se sabe que un embarque es de ese cliente.**
Verificado: el embarque **no tiene `clienteId` de primer nivel**. El enlace
vive en `entidadesRef.clienteCobrar.id` (opcional, `entidadesEmbarque.ts:138`,
y `refsDesdeCotizacion` solo lo escribe si la cotización tenía `clienteId`);
el resto es texto (`entidades.clienteCobrar`, p. ej. «Alfa Corporativo S.A.»).
Los embarques de Magaya y los abiertos antes de §4.18 pueden no tenerlo.
**Regla del plan:** la proyección **solo se escribe si el cliente está
vinculado por id**; nunca por coincidencia de nombre (un nombre parecido
mostraría el embarque de otro cliente a un tercero, que es la fuga más cara
posible). **[medir]** cuántos de los embarques activos tienen
`entidadesRef.clienteCobrar.id` — script de solo lectura, el patrón de
`scripts/auditarServiciosPorCotizacion.ts`; lo corre Mau. Los que no
lo tengan se listan para vincularlos antes del arranque.
Pregunta abierta: ¿ve el cliente solo los embarques donde es «cliente a
cobrar» o también donde es `importador`/`consignatario`? (Q3, y se cruza con
el plan 115, §5.)

**P-5. Facturas del cliente: lo mismo, proyección.**
`facturas/{id}` (modelo `FacturaCliente`, `FacturasData.ts:39`) trae
`clienteId`, pero también `lineas` ligadas a cargos y a `grupoFacturacion`
con datos internos, y los cobros viven en `pagos/`. Proyección
`portalFacturas/{id}` con número, fecha, moneda, total, saldo y estado,
más el PDF/XML. **Una factura cancelada se retira** (no solo se oculta). Saldo
y estado se **derivan en el servidor** con la misma lógica de
`lib/cuentasPorCobrar.ts`; el cliente no recalcula (y los totales por moneda,
§4.3).

**P-6. Storage: que el archivo deje de abrirse sin sesión.**
Es el segundo agujero y no se cierra con reglas solas, por lo de §1.2:
- El token de `getDownloadURL` hace que el archivo abra **sin sesión y sin
  reglas**. Mientras `EmbarqueDocumento.url` guarde ese enlace, «visible para
  el cliente» no es control de acceso y un documento sensible ya compartido
  por un enlace sigue abierto para quien lo tenga.
- Se necesita: (a) rutas de Storage para el cliente
  (`portal/{clienteId}/…` o lectura condicionada en `embarques/{id}/docs/…`
  por un metadato; ver abajo); (b) que el portal **no use `url`** sino
  `storagePath` y pida el archivo con una **URL firmada de vida corta**
  generada por una Function que comprueba `clienteId` y que el documento
  sigue siendo visible; (c) **revocar los tokens existentes** de los
  documentos ya subidos (borrar `firebaseStorageDownloadTokens` del
  metadato con el Admin SDK, script en seco primero); (d) que **el equipo**
  también deje de guardar `url` y pida la firmada o la lea con sesión, o
  la revocación rompe sus propios enlaces.
- Regla de Storage para clientes: la lectura directa por regla necesita leer
  un dato del documento de Firestore, y las reglas de Storage pueden hacer
  `firestore.get()` pero cuesta una lectura por archivo y las reglas de
  Storage tienen límite de llamadas; por eso (b), la URL firmada, es lo
  recomendado. Si Mau prefiere regla directa, el patrón es copiar a
  `portal/{clienteId}/{embarqueId}/` al marcar visible (copia, no enlace),
  con `allow read: if request.auth.token.clienteId == clienteId`.
- La interfaz de documentos hoy pinta enlaces a `doc.url`. Ese cambio toca
  `DocumentosEmbarque.tsx`, `useDocumentosEmbarque.ts` y los 8 sitios
  restantes; es un paso propio (§5, paso 4), no «un detalle».

**P-7. Cerrar la convivencia de reglas por rol.**
`PLAN-REGLAS-POR-ROL.md` (687 líneas) ya planea el cierre; no se repite aquí.
Lo que importa para el portal:
- Mientras `esDelEquipo()` conserve el **respaldo de lista de correos**, hay
  dos caminos de identidad. Una regla de cliente nueva no puede heredar
  ninguno de los dos: debe ser `request.auth.token.rol == 'cliente' &&
  request.auth.token.clienteId != null`, sin tocar `esDelEquipo()`.
- El paso 4 de ese plan (quitar la lista de correos) **no bloquea** el
  portal, pero la mitad de lo que ese plan arregla —que el equipo no pueda
  escribir pagos desde la consola— **sí** es lo que un auditor pregunta
  antes de poner clientes externos en el mismo proyecto. Recomendación: no
  lanzar el portal sin al menos el Paso 2 (reglas por rol en Firestore)
  publicado. Es decisión de Mau (Q4).
- Test de reglas obligatorio (`npm run test:reglas`, que hoy corre 61): un
  cliente A **no lee** el `portalEmbarques` de B; **no lee ni lista**
  `embarques`, `cotizaciones`, `clientes`, `proveedores`, `ordenesCompra`,
  `pagos`, `facturas`; no escribe nada; sin claim `clienteId` no lee nada;
  un `rol` desconocido no entra. Mutar cada regla y contar los que se caen,
  como se hizo en la 65/§4.22.

**P-8. Las Functions que hoy aceptan cualquier token con correo.**
`verificarUsuario` (`functions/src/comun/auth.ts:130-148`) acepta cualquier ID
token de Firebase del proyecto. Con P-2 el cliente tendría `CAPACIDADES = []`,
pero hay que **auditar cada Function pública** (`invoker: 'public'`):
`clasificarDocumento`, `extraerTarifas`, `gestionarUsuarios`,
`actualizarTipoCambio`, `generarDocumento`, `solicitarRestablecimiento`. Cada
una exige una capacidad; ninguna debe abrirse al rol cliente. Test que recorre
todas con un token `rol: 'cliente'` y espera 403.

**P-9. Sin registro abierto.** Ya está cerrado (`ADMIN_ONLY_OPERATION`,
CLAUDE.md §6). Es condición de este plan: si volviera a abrirse, cualquiera
podría crearse una cuenta sin claims. Con claims, esa cuenta no ve nada; pero
conviene volver a verificarlo con el `curl` de §6 antes del arranque.

**P-10. Las cuentas de prueba vivas en producción** (§6, crítico, sigue
abierto). Un portal con clientes externos hace que mantener `admin@`,
`pricing@` y `ventas@` con contraseña conocida sea peor. Prerrequisito
operativo: borrarlas o deshabilitarlas (lo hace Mau en la consola).

---

## 3. Alcance mínimo

**Dentro (v1):**
1. **Mis embarques**: lista y ficha de solo lectura desde `portalEmbarques`:
   folio, modalidad, ruta, etapa, ETD/ETA, contenedores, referencia del
   cliente.
2. **Línea de tiempo.** Depende de la **tarea 116**
   (`PLAN-EVENTOS-EMBARQUE.md`, rama `sprint/116-plan-eventos-embarque`, aún
   sin publicar y con `[!]` por códigos DCSA sin verificar). Plan:
   - **v1 sin 116**: la línea de `EmbarqueEvento` que ya existe (`eventos`, el
     historial «redactado para el cliente», CLAUDE.md §4.14) más la etapa
     derivada. Es lo que `VistaCliente` ya pinta.
   - **v2 con 116**: la proyección copia los eventos de `lineaTiempo` cuya
     clasificación sea real y marcados visibles. Si la 116 llega después, el
     portal no cambia de forma: solo cambia de dónde lee la Function.
3. **Sus documentos visibles**: lo que `esVisibleParaCliente` deja pasar,
   descargados con URL firmada (P-6). **Nunca** `factura_proveedor`,
   `pedimento` ni `carta_encomienda` salvo marca manual y con el aviso que ya
   existe (`advertenciaAlMostrar`). La proyección vuelve a filtrar en el
   servidor: no se confía en que la pantalla lo haga.
4. **Sus facturas** (P-5): lista, estado (por cobrar / por vencer /
   vencido / pagada), saldo por moneda, PDF y XML.

**Fuera (y por qué):**
- **Cotizar / solicitar cotización desde el portal.** Es un flujo de negocio
  con reglas (§4.1: «solo Pricing puede cotizar») y crearía documentos
  escritos por externos. Fase aparte.
- **Costos, márgenes, proveedores, órdenes de compra, bitácora, pagos a
  proveedor**: nunca. No hay proyección para ellos.
- **Pagar en línea / registrar cobros**: Administración los registra
  (§4.33). El cliente ve el saldo, no lo mueve.
- **Expediente KYC y contratos** del cliente: lo suben ellos hoy a OneDrive y
  son del equipo. Fase aparte, con su propia regla.
- **Rastreo en vivo por API**: depende de la 116 §4 y de la prueba de cobertura
  de Mau.
- **Varios clientes por usuario / usuarios agentes de carga que ven varios
  clientes**: no en v1 (Q2).
- **Notificaciones por correo al cliente**: espera el canal de §4.29/§4.65.
- **«Ver como cliente» deja de ser la prueba**: pasa a mostrar la **misma
  proyección** que lee el portal (no el embarque crudo), así lo que el equipo
  ve en la vista previa es literalmente lo que sale. Hoy `VistaCliente` puede
  enseñar de más y nadie lo notaría.

---

## 4. Alta y baja de usuarios del cliente

- **Quién invita:** solo `usuario.gestionar` (admin), con la misma
  Function `gestionarUsuarios`. Propuesta: Administración también, porque es
  quien da de alta a los clientes (§4.1); eso requiere agregar la capacidad
  `usuario.gestionarClientes` (solo para `rol: cliente`) y **no** darle
  `usuario.gestionar` completo (podría crear admins). Decisión de Mau (Q1).
- **Cómo se liga a su cliente:** desde la **ficha del cliente** (Altas →
  cliente → pestaña «Portal»), no desde la pantalla de Usuarios. La acción
  `invitarCliente` recibe `clienteId` y `email` y la Function:
  1. verifica que el cliente exista y no esté inactivo (`clienteOperable`);
  2. verifica que el cliente tenga el **expediente validado** (§4.18): no se
     da portal a quien Administración no validó;
  3. crea la cuenta (o recupera la existente **solo si ya es cliente de
     este mismo `clienteId`**: nunca convertir una cuenta del equipo);
  4. pone `{ rol: 'cliente', clienteId }`, escribe `usuarios/{uid}` con
     `clienteId` y `invitadoPor`;
  5. manda la invitación por `correoPorN8n` con el texto del portal.
- **Contraseña / entrada:** la misma invitación con enlace de un solo uso
  (§4.65) y «¿Olvidaste tu contraseña?» (§4.67). El correo de Firebase no
  llega a dominios en M365 con SPF estricto; **el correo del cliente es
  externo**, así que el canal por n8n sí sirve, pero conviene probarlo con
  un correo de cada tipo (Gmail, Outlook, dominio propio). **[medir]**.
- **Baja:** `desactivar` (ya existe) pone `disabled` en Auth, y **además**
  `revokeRefreshTokens`; un claim no se retira de un token ya emitido
  (vive hasta una hora), por eso la baja debe revocar. Las reglas **no** miran
  `usuarios/{uid}.activo`, así que la baja efectiva depende de Auth: un test lo
  fija (token anterior a la revocación, rechazado por `verifyIdToken(token,
  true)` en Functions; en reglas, la ventana de hasta una hora es una
  limitación de Firebase que hay que decir en voz alta, ver §9 de
  `PLAN-REGLAS-POR-ROL.md`).
- **Cambio de cliente / de rol:** `cambiarRol` **no** puede convertir una
  cuenta interna en cliente ni al revés. Se prohíbe en el código de la
  Function (cruce de fronteras).
- **Bitácora:** cada alta, baja y reenvío deja entrada en la ficha del
  cliente, con quién y cuándo.
- **Pantalla de Usuarios:** los clientes **no** aparecen mezclados con el
  equipo; filtro propio. El estado «Pendiente / Entró» (§4.65) se reutiliza.

---

## 5. Pasos publicables

Cada paso se publica y se valida solo. **Nada abre cuentas de cliente hasta
el paso 6.** Dependencias marcadas.

| # | Paso | Despliega | Depende de |
|---|---|---|---|
| **0** | **[medir]** Script de solo lectura: embarques activos con/sin `entidadesRef.clienteCobrar.id`; cuántos documentos tienen `url` con token; facturas sin `clienteId`. Verificar registro cerrado (curl §6). Borrar cuentas de prueba (Mau). | nada | — |
| **1** | **Roles**: `UserRole` suma `cliente`; claim presente y desconocido ya no cae a mapa/fallback (cliente y Functions); `CAPACIDADES.cliente = []`; test que recorre todas las Functions con token cliente → 403. `invitar` aún **no** acepta `cliente`. | hosting + functions | — |
| **2** | **Reglas** (aviso antes, comando exacto, §3): helper `esCliente()`; colecciones `portalEmbarques` y `portalFacturas` con lectura por `clienteId` y `write: false`; tests de reglas con mutación. Sin datos todavía. | firestore:rules | 1; PLAN-REGLAS-POR-ROL paso 2 recomendado |
| **3** | **Proyección**: Function `onDocumentWritten` que escribe `portalEmbarques` y `portalFacturas` (lista blanca, sin escribir si no hay `clienteId` por id, retira lo cancelado/oculto), y script de **relleno** de los existentes (en seco, lo corre Mau). Tests de la derivación pura en `lib/` (campo nuevo del embarque **no** se filtra). | functions | 2; **115** (qué lee de `partes`/consignatario, si Mau aprueba) |
| **4** | **Storage**: documentos por `storagePath` + URL firmada (Function `urlDocumentoCliente`); los 9 sitios de `getDownloadURL` dejan de guardar `url` (escritura nueva; lo viejo se lee); reglas de `portal/` si se elige la copia; luego **revocación de tokens** de documentos existentes (script en seco; rompe enlaces viejos, avisar). | functions + storage:rules + hosting | 3 |
| **5** | **Línea de tiempo** en la proyección: v1 con `eventos`; v2 con `lineaTiempo` cuando exista. «Ver como cliente» pasa a leer la proyección. | functions + hosting | 3; **116** para v2 |
| **6** | **Interfaz del portal** (rol `cliente`: menú propio con Mis embarques, Facturas; sin Kanban ni nada interno) y `invitarCliente` / baja desde la ficha del cliente. **Primera cuenta real**: la de un cliente amigo, validada por Mau y por el cliente. | functions + hosting | 1–5 |
| **7** | Endurecimiento: Paso 4 y 5 de `PLAN-REGLAS-POR-ROL` (quitar lista de correos y mapas) — sin esto el portal funciona, pero hay dos caminos de identidad. | firestore:rules + storage + hosting | 6 |

Orden de publicación: **reglas y Functions primero, hosting después**, para
que ninguna pestaña abierta quede con un bundle que espera una forma que el
servidor aún no entrega (§4.73). Los pasos 1–5 son invisibles para el equipo;
el 6 es el primero que alguien externo ve.

**Punto de regreso:** cada paso es revertible con `git revert` del merge; la
proyección es derivable, así que borrar `portalEmbarques`/`portalFacturas` no
pierde datos. La revocación de tokens del paso 4 **no** es reversible (los
tokens viejos no se pueden restaurar): ese sub-paso va con aprobación
explícita.

**Estimación gruesa:** pasos 1–3: ~3 días; paso 4: ~2–3 días (es el que toca
más archivos); 5: 1 día (v1); 6: 3 días; 7: según el plan de reglas por rol.

---

## 6. Modelo propuesto — PARA APROBACIÓN DE MAU

Nada se escribe hasta que Mau lo apruebe.

```ts
// Claims (Auth), no es documento
{ rol: 'cliente', clienteId: string }

// usuarios/{uid}  — campo opcional nuevo
clienteId?: string | null

// portalEmbarques/{embarqueId}  — escrito SOLO por la Function; lectura por clienteId
{
  clienteId: string,
  folio: string, modalidad: 'maritimo'|'aereo'|'terrestre', trafico: 'importacion'|'exportacion'|null,
  origen: string|null, destino: string|null,
  etapa: 'nuevo'|'cargado'|'en_transito'|'en_destino'|'entregado',
  etd: string|null, eta: string|null, arriboReal?: string|null,
  contenedores: string[], referenciaCliente?: string|null,
  eventos: { id, titulo, fecha, tipo }[],
  documentos: { id, nombre, tipo, storagePath, fecha }[],   // sin `url`
  actualizadoEn: string  // ISO 8601
}

// portalFacturas/{facturaId}
{
  clienteId: string, embarqueId: string, embarqueFolio: string,
  numero: string, fechaEmision: string, vencimiento?: string|null,
  moneda: 'USD'|'MXN', total: number, saldo: number,
  estado: 'por_cobrar'|'por_vencer'|'vencida'|'pagada',
  pdfPath?: string|null, xmlPath?: string|null
}
```

Reglas (bloque exacto, **no se editó el archivo**):

```
function esCliente() {
  return request.auth != null
    && request.auth.token.rol == 'cliente'
    && request.auth.token.clienteId is string;
}
match /portalEmbarques/{id} {
  allow read:  if esCliente() && resource.data.clienteId == request.auth.token.clienteId;
  allow write: if false;
}
match /portalFacturas/{id} {
  allow read:  if esCliente() && resource.data.clienteId == request.auth.token.clienteId;
  allow write: if false;
}
```

`esDelEquipo()` **no se toca**: sigue sin dejar entrar a `rol: 'cliente'`. El
equipo, además, necesita `allow read: if esDelEquipo()` en las dos colecciones
para «Ver como cliente». Leer un claim ausente dentro de comparaciones da
`false` y no un error (medido en la 15-oct, §4.65), pero se vuelve a vigilar
con un test.

**Qué no se agrega:** campo `clienteId` de primer nivel en `embarques`. Se
considera (es más claro) pero requiere escribirlo en documentos vivos; la
proyección lo resuelve sin migrar. Si el plan 115 lo agrega, mejor.

---

## 7. Preguntas

### Para Mau (bloquean implementación)

| # | Pregunta | Mi recomendación |
|---|---|---|
| Q1 | ¿Quién invita a los usuarios cliente: solo admin, o también Administración con una capacidad acotada a `rol: cliente`? | Administración con capacidad acotada; ya da las altas de clientes. |
| Q2 | ¿Un usuario = un cliente? ¿Y el caso del agente de carga (cliente **y** proveedor, §4.5) que ve varios clientes? | Un usuario = un cliente en v1. Varios clientes por usuario es otro modelo (`clienteIds[]`): no ahora. |
| Q3 | ¿El cliente ve embarques donde es «cliente a cobrar», o también donde es importador/consignatario? | Solo «cliente a cobrar» en v1; lo demás espera a la 115. |
| Q4 | ¿Se exige el Paso 2 de `PLAN-REGLAS-POR-ROL` (reglas por rol del equipo) antes de abrir el portal? | Sí. Con clientes externos en el mismo proyecto, que cualquiera del equipo escriba pagos desde la consola ya no es solo deuda interna. |
| Q5 | ¿Proyección escrita por Function (recomendada) o, si prefieres evitarla, copia al marcar visible? | Proyección: es la única que no filtra campos por descuido. |
| Q6 | ¿Apruebas la **revocación de los tokens** de los documentos existentes (rompe enlaces ya mandados, p. ej. correos viejos)? | Sí, pero después de avisar y solo de los tipos sensibles primero. |
| Q7 | ¿Apruebas el modelo de §6? | Sí. |
| Q8 | ¿Se borran las 3 cuentas de prueba de producción antes del arranque? | Sí, es prerrequisito. |

### Para Vermur (Luis, Gaby)

1. ¿Qué clientes quieren como primeros usuarios del portal? (uno o dos, con
   quien sepan que van a abrirlo).
2. ¿Qué debe ver el cliente de la factura: solo estado y saldo, o también el
   desglose por concepto? (hoy el plan enseña solo totales).
3. ¿El cliente puede ver el **pedimento** una vez liberado? (hoy es
   «sensible» y no sale solo, `visibilidadDocumentoCliente.ts`).
4. ¿Qué hitos le interesa ver al cliente? (cruza con la pregunta a Vermur de
   la 116).
5. ¿El portal se ofrece a todos los clientes o a un subconjunto? ¿Con costo
   o parte del servicio?
6. ¿Aceptan que el aviso de llegada y las facturas sigan saliendo también por
   correo mientras el portal arranca?

---

## 8. Hallazgos fuera de la tarea (anotados, sin tocar)

- `VistaCliente` lee el embarque entero del equipo: hoy no puede fugar nada
  porque lo ve solo el equipo, pero **tampoco prueba** lo que saldría; ver §3.
- El mapa de roles del cliente web (`AuthContext`) y el de Functions
  (`comun/auth.ts`) son dos copias; cualquier rol nuevo debe tocarse en las dos
  (ya anotado en §6 de CLAUDE.md).
- `ROL_FALLBACK = 'ventas'` en las dos copias contradice su propio comentario
  («siempre el de menor alcance»): ventas tiene `cotizacion.solicitar` en
  Functions. Un correo desconocido con token válido puede llamar a
  `clasificarDocumento` con flujos de ventas. Preexistente; se vuelve urgente
  con clientes externos (P-2). Se arregla en el paso 1.
- 9 sitios guardan la `url` con token en el documento; no solo los de
  embarque. Los PDF de cotización (`usePdfCotizacion.ts:96`) y el expediente
  KYC (`useExpedienteCliente.ts:69`) tienen el mismo agujero y afectan datos
  más sensibles que un BL. El paso 4 debe decidir si los incluye.
- **No pude verificar contra producción** cuántos embarques traen
  `entidadesRef.clienteCobrar.id`, ni cuántas URLs con token existen: el
  límite del sprint prohíbe leer producción. Quedan en el paso 0.
- El plan 116 está en `[!]` por los códigos DCSA sin verificar; la v2 de la
  línea de tiempo (§3) depende de que alguien los cotejara.
