# PLAN: reglas de Firestore y Storage por rol

> Fecha: 2-oct-2026
> Tarea: sprint/COLA.md #53
> Estado: propuesta para Mau

---

## 0. El problema en una línea

Las reglas de Firestore y Storage hoy dicen **quién** (solo el equipo) pero no
**qué puede hacer cada quien**. La matriz de permisos de §4.1 existe únicamente
en el código del cliente (`permisos.ts`) y se salta abriendo la consola del
navegador. Es seguridad aparente, no seguridad real.

---

## 1. Estado actual

### 1.1 Firestore

`esDelEquipo()` compara el correo del token contra una lista fija de 7
direcciones. Todas las colecciones usan este predicado para read/create/update.
No hay distinción por rol.

**Colecciones con regla:**

| Colección | read | create | update | delete |
|---|---|---|---|---|
| cotizaciones | equipo | equipo | equipo | prohibido |
| cotizaciones/{id}/versiones/{n} | equipo | equipo | prohibido | prohibido |
| prospectos | equipo | equipo | equipo | prohibido |
| contadores | equipo | equipo | equipo | — |
| clientes | equipo | equipo | equipo | prohibido |
| proveedores | equipo | equipo | equipo | prohibido |
| conceptos | equipo | equipo | equipo | prohibido |
| terminosPago | equipo | equipo | equipo | prohibido |
| puertos | equipo | equipo | equipo | prohibido |
| tarifas | equipo | equipo | equipo | prohibido |
| documentosTarifario | equipo | equipo + uid | equipo | prohibido |
| importacionesTarifas | equipo | equipo + uid | equipo | prohibido |
| embarques | equipo | equipo | equipo | prohibido |
| ordenesCompra | equipo | equipo | equipo | prohibido |
| depositosCliente | equipo | equipo | equipo | prohibido |
| facturas | equipo | equipo | equipo | prohibido |
| cobros | equipo | equipo | equipo | prohibido |
| preferenciasUsuario/{uid} | dueño | dueño | dueño | dueño |
| vistasUsuario | equipo | equipo + uid | dueño | dueño |
| notificaciones | destinatario | equipo | destinatario | prohibido |

**Colecciones SIN regla (caen al `deny all` por defecto):**

| Colección | Quién la lee/escribe | Consecuencia hoy |
|---|---|---|
| `configuracion` (docs: `empresa`, `tipoCambio`) | App (lectura), Functions (escritura) | La app falla en silencio al leer; los hooks (`useTipoCambio`, `useConfiguracionEmpresa`) atrapan el error y caen al default |
| `tiposCambio` | App (lectura), Function `tipoCambio` (escritura) | El historial no se puede leer desde la app; la Function SÍ escribe porque usa Admin SDK |
| `usuarios` | Function `gestionarUsuarios` (lectura y escritura) | La Function SÍ opera (Admin SDK). La app no lee esta colección todavía |

**Nota importante:** las Cloud Functions usan el **Admin SDK**, que ignora las
reglas. Por eso `gestionarUsuarios` escribe en `usuarios` y `tipoCambio`
escribe en `tiposCambio` y `configuracion/tipoCambio` sin problemas. Pero los
hooks del frontend que leen `configuracion/empresa` y `configuracion/tipoCambio`
SÍ pasan por las reglas, y hoy esas lecturas fallan con `permission-denied`
(degradado a silencio en el commit 4b8eb85).

### 1.2 Storage

`esDelEquipo()` con la misma lista. Cuatro rutas cubiertas:

| Ruta | read | create | update/delete |
|---|---|---|---|
| tarifarios/{año}/{mes}/{archivo} | equipo | equipo, <10 MB | prohibido |
| expedientes/{clienteId}/{archivo} | equipo | equipo, <10 MB | prohibido |
| cotizaciones/{cotId}/pdf/{archivo} | equipo | equipo, <10 MB | prohibido |
| embarques/{embId}/docs/{archivo} | equipo | equipo, <10 MB | prohibido |

**Rutas SIN regla:**

| Ruta | Uso | Consecuencia |
|---|---|---|
| `ordenesCompra/{ocId}/factura/{archivo}` | Tarea 55 la necesita (factura del proveedor en OC de oficina) | Hoy no existe; cuando se implemente, la subida fallará |

### 1.3 El rol en el token

El paso 1 de Usuarios y roles (`gestionarUsuarios`) ya pone custom claims.
`AuthContext.tsx` (línea 128-131) ya los lee:

```typescript
const claimRol = tokenResult.claims.rol as string | undefined;
rol = (claimRol && ROLES_VALIDOS.includes(claimRol as UserRole))
  ? claimRol as UserRole
  : getRolByEmail(firebaseUser.email);
```

Y `functions/src/comun/auth.ts` (línea 136-139) también:

```typescript
const rolClaim = decoded.rol as UserRole | undefined;
const rolEfectivo = (rolClaim && ROLES_VALIDOS.includes(rolClaim))
  ? rolClaim
  : MAPA_EFECTIVO[email] ?? ROL_FALLBACK;
```

**Estado:** las 6 cuentas del equipo ¿tienen ya el claim `rol` puesto?
Depende de si Mau corrió `gestionarUsuarios` para asignarles rol. Si no,
el claim no existe y ambos lados caen al mapa por correo. **[verificar con
Mau]**.

**Si el claim ya está:** las reglas pueden leer `request.auth.token.rol` y
se elimina la lista de correos.

**Si el claim no está:** hay que correr `asignarRol` para las 6 cuentas
antes de cambiar las reglas. Es una operación de un minuto.

---

## 2. Matriz colección × rol

### 2.1 Firestore

La fuente es `permisos.ts` (§4.1 de CLAUDE.md), cruzada con ALLOWED_VIEWS_BY_ROLE
y las reglas de negocio de §4.7–4.18.

**Leyenda:** L = leer, C = crear, E = editar. «—» = sin acceso.

| Colección | ventas | pricing | operaciones | administracion | admin | Notas |
|---|---|---|---|---|---|---|
| **cotizaciones** | L, C (solo solicitud), E | L, C, E | L | L, C, E | L, C, E | Ventas crea en etapas de solicitud; Pricing en cualquier etapa |
| cotizaciones/versiones | L | L, C | L | L, C | L, C | Solo Pricing y Admin versionan |
| **prospectos** | L, C, E | L | L | L | L, C, E | Solo Ventas crea leads (y admin) |
| **contadores** | L | L | L, E | L, E | L, E | Folio al crear embarque (Ops) o al sembrar (Admin/admin) |
| **clientes** | L | L | L | L, C, E | L, C, E | Solo Admin da altas definitivas |
| **proveedores** | L | L, C* | L | L, C, E | L, C, E | *Pricing: alta rápida (sin RFC) |
| **conceptos** | L | L | L | L, E | L, C, E | Solo Admin edita el catálogo |
| **terminosPago** | L | L | L | L | L, C, E | Catálogo de solo lectura para todos excepto admin |
| **puertos** | L | L | L | L, C, E | L, C, E | Solo Admin da altas |
| **tarifas** | L | L, C, E | L | L | L, C, E | Solo Pricing gestiona tarifas |
| **documentosTarifario** | L | L, C, E | L | L | L, C, E | Solo Pricing carga evidencias |
| **importacionesTarifas** | L | L, C, E | L | L | L, C, E | Solo Pricing usa la carga con IA |
| **embarques** | L | L | L, C, E | L, E | L, C, E | Solo Ops crea; Admin edita (cierres) |
| **ordenesCompra** | — | — | L, C, E | L, C, E | L, C, E | Ops solicita/gestiona; Admin autoriza/paga |
| **depositosCliente** | — | — | L | L, C, E | L, C, E | Solo Admin registra depósitos |
| **facturas** | — | — | L, C, E | L, C, E | L, C, E | Ops y Admin facturan |
| **cobros** | — | — | L | L, C, E | L, C, E | Solo Admin registra cobros |
| **notificaciones** | solo propias | solo propias | solo propias | solo propias | solo propias | Sin cambio |
| **preferenciasUsuario** | solo propias | solo propias | solo propias | solo propias | solo propias | Sin cambio |
| **vistasUsuario** | L, dueño E/D | L, dueño E/D | L, dueño E/D | L, dueño E/D | L, dueño E/D | Sin cambio |
| **configuracion** (docs) | L | L | L | L | L, E | Todos leen; solo admin edita empresa |
| **tiposCambio** | L | L | L | L | L | Todos leen; solo la Function escribe (Admin SDK) |
| **usuarios** | — | — | — | — | L, E | Solo la Function escribe (Admin SDK); admin lee para gestión |

#### Donde la matriz de §4.1 y ALLOWED_VIEWS_BY_ROLE no coinciden

| Punto | §4.1 (CLAUDE.md) | ALLOWED_VIEWS (users.ts) | Recomendación |
|---|---|---|---|
| Ventas → embarques | No aparece en la matriz | No tiene 'shipments' | **Coinciden.** Ventas no ve embarques |
| Pricing → Kanban | «NO ve el Kanban» | No tiene vista propia de Kanban (la bandeja vive dentro de 'quotes') | **Riesgo:** la bandeja de cotizaciones sí la ve. El Kanban drag-and-drop de cotizaciones está dentro de 'quotes'. Validar si esto es correcto |
| Operaciones → OC | «Solicita y gestiona» | Tiene 'finance' (bandeja de OC) | **Coinciden** |
| Operaciones → cotizaciones | «NO crea cotizaciones» | No tiene 'quotes' | **Coinciden** |

### 2.2 Storage

| Ruta | ventas | pricing | operaciones | administracion | admin | Notas |
|---|---|---|---|---|---|---|
| tarifarios/{a}/{m}/{archivo} | L | L, C | L | L | L, C | Pricing sube evidencias |
| expedientes/{clienteId}/{archivo} | L | — | — | L, C | L, C | Solo Admin sube KYC; Ventas consulta |
| expedientes/{proveedorId}/{archivo} | — | — | — | L, C | L, C | Tarea 54: expediente de proveedor |
| cotizaciones/{id}/pdf/{archivo} | L | L, C | — | L, C | L, C | Pricing genera PDF |
| embarques/{id}/docs/{archivo} | — | — | L, C | L, C | L, C | Ops y Admin suben documentos |
| ordenesCompra/{id}/factura/{archivo} | — | — | L, C | L, C | L, C | Tarea 55: factura del proveedor |

**Discrepancia con Ventas y expedientes:** §4.1 no da a Ventas acceso a Altas,
pero sí tiene el módulo 'clients' en lectura. Si Ventas necesita ver el estado
del expediente (para saber si puede ganar), necesita leer expedientes en Storage.
Si solo necesita el campo `expedienteValidado` de Firestore, no necesita acceso
a Storage. **Recomendación:** restringir expedientes en Storage a Admin + admin.
Ventas comprueba el estado leyendo el campo de Firestore.

---

## 3. Cómo pasar de la lista de correos a los claims

### 3.1 Prerrequisito: claims puestos

La Function `gestionarUsuarios` ya pone `request.auth.token.rol` con
`setCustomUserClaims`. Lo que falta es asegurarse de que las 6 cuentas reales
lo tengan.

**Paso 0 — Verificar y poner claims:**

```bash
# Desde la app (con Gaby o Luis como admin):
# Configuración → Usuarios → para cada usuario, verificar que el rol aparece.
# Si no, asignar el rol con el botón "Asignar rol".
```

O con el Admin SDK, invocando `gestionarUsuarios` con `accion: 'asignarRol'`
para cada uno. **El token se refresca solo:** `AuthContext.tsx` fuerza
`getIdToken(true)` al volver a la pestaña.

### 3.2 Convivencia temporal: leer claim o caer a la lista

Durante la transición, las reglas deben aceptar **ambas cosas**: un usuario
con claim y uno sin claim (si el token no se ha refrescado). La función en
reglas sería:

```javascript
function rolDelUsuario() {
  // Primero custom claim (puesto por gestionarUsuarios)
  let r = request.auth.token.rol;
  // Si no tiene claim, no entra. La lista de correos se elimina.
  return r;
}

function tieneRol(rol) {
  return request.auth != null
    && request.auth.token.rol is string
    && request.auth.token.rol == rol;
}

function esDelEquipoConRol() {
  return request.auth != null
    && request.auth.token.rol is string
    && request.auth.token.rol in ['ventas', 'pricing', 'operaciones', 'administracion', 'admin'];
}
```

**Opción conservadora (recomendada):** mantener `esDelEquipo()` como fallback
durante la primera semana. Si el claim existe, se usa; si no, cae a la lista
de correos. Así no se queda nadie fuera:

```javascript
function esDelEquipoConRol() {
  return request.auth != null && (
    // Vía nueva: claim en el token
    (request.auth.token.rol is string
     && request.auth.token.rol in ['ventas', 'pricing', 'operaciones', 'administracion', 'admin'])
    ||
    // Fallback temporal: lista de correos (quitar en 2 semanas)
    (request.auth.token.email != null
     && request.auth.token.email.lower() in [
       'itzel.laurean@vermur.com',
       'nohema.sosa@vermur.com',
       'julio.gutierrez@vermur.com',
       'angel.luna@vermur.com',
       'gabriela.huerta@vermur.com',
       'luis.renteria@vermur.com',
       'info@digsol.com.mx'
     ])
  );
}
```

### 3.3 Prueba del cambio

Antes de desplegar, verificar que:

1. Cada cuenta tiene el claim `rol` → `getIdTokenResult` en la consola del
   navegador para cada sesión, o `firebase auth:export` y verificar.
2. Los tests de reglas (`npm run test:reglas`) pasan con las nuevas reglas.
3. Un token sin claim pero con correo del equipo sigue entrando (fallback).
4. Un token con claim `rol: 'ventas'` no puede crear un embarque.

---

## 4. Reglas de Storage por carpeta

### 4.1 Con claims

```javascript
function tieneRol(rol) {
  return request.auth != null
    && request.auth.token.rol is string
    && request.auth.token.rol == rol;
}

function esAdmin() {
  return tieneRol('admin');
}

function puedeSubirEvidencia() {
  // Pricing y admin
  return tieneRol('pricing') || esAdmin();
}

function puedeSubirDocEmbarque() {
  // Operaciones, Administracion y admin
  return tieneRol('operaciones') || tieneRol('administracion') || esAdmin();
}

function puedeSubirExpediente() {
  // Solo Administracion y admin
  return tieneRol('administracion') || esAdmin();
}

function puedeSubirFacturaOC() {
  // Operaciones, Administracion y admin (tarea 55)
  return tieneRol('operaciones') || tieneRol('administracion') || esAdmin();
}
```

### 4.2 Reglas por ruta

```javascript
// Tarifarios y evidencias
match /tarifarios/{anio}/{mes}/{archivo} {
  allow read: if esDelEquipoConRol();
  allow create: if puedeSubirEvidencia()
                && request.resource.size < 10 * 1024 * 1024;
  allow update, delete: if false;
}

// Expediente KYC del cliente
match /expedientes/{entidadId}/{archivo} {
  allow read: if puedeSubirExpediente() || esAdmin();
  allow create: if puedeSubirExpediente()
                && request.resource.size < 10 * 1024 * 1024;
  allow update, delete: if false;
}

// PDF de la cotización
match /cotizaciones/{cotizacionId}/pdf/{archivo} {
  allow read: if esDelEquipoConRol();
  allow create: if (tieneRol('pricing') || tieneRol('administracion') || esAdmin())
                && request.resource.size < 10 * 1024 * 1024;
  allow update, delete: if false;
}

// Documentos del embarque
match /embarques/{embarqueId}/docs/{archivo} {
  allow read: if puedeSubirDocEmbarque() || esAdmin();
  allow create: if puedeSubirDocEmbarque()
                && request.resource.size < 10 * 1024 * 1024;
  allow update, delete: if false;
}

// Factura del proveedor en la orden de compra (tarea 55)
match /ordenesCompra/{ordenId}/factura/{archivo} {
  allow read: if puedeSubirFacturaOC() || esAdmin();
  allow create: if puedeSubirFacturaOC()
                && request.resource.size < 10 * 1024 * 1024
                && (request.resource.contentType == 'application/pdf'
                    || request.resource.contentType == 'text/xml'
                    || request.resource.contentType == 'application/xml');
  allow update, delete: if false;
}
```

---

## 5. Tests de reglas que harían falta (`npm run test:reglas`)

### 5.1 Tests nuevos por rol

Los tests actuales (13 en `tests/reglas/equipo.test.ts`) solo prueban el
predicado binario equipo/no-equipo. Con roles, hay que probar la **matriz**:

```
describe('Firestore · permisos por rol')

  Ventas:
    ✓ lee cotizaciones, clientes, proveedores, conceptos, tarifas, embarques
    ✓ crea prospectos
    ✓ crea cotización con datos de solicitud (etapa solicitud_cliente)
    ✗ NO crea cotización en etapa pricing
    ✗ NO crea clientes, proveedores, puertos
    ✗ NO crea embarques
    ✗ NO crea ordenesCompra, facturas, cobros
    ✗ NO lee ordenesCompra (no tiene el módulo)

  Pricing:
    ✓ lee y crea cotizaciones en cualquier etapa
    ✓ crea y edita tarifas
    ✓ crea documentosTarifario (con uid match)
    ✓ crea proveedores (alta rápida)
    ✗ NO crea clientes, puertos, embarques
    ✗ NO crea facturas, cobros, depositosCliente, ordenesCompra

  Operaciones:
    ✓ lee embarques, cotizaciones (cross-ref), clientes, proveedores
    ✓ crea embarques
    ✓ crea y edita ordenesCompra
    ✓ crea facturas
    ✗ NO crea cotizaciones, clientes, proveedores, tarifas
    ✗ NO crea depositosCliente, cobros

  Administracion:
    ✓ crea y edita clientes, proveedores, puertos
    ✓ crea y edita ordenesCompra
    ✓ crea facturas, cobros, depositosCliente
    ✓ edita embarques (cierres)
    ✗ NO crea embarques
    ✗ NO crea tarifas, documentosTarifario

  Admin:
    ✓ todo lo de arriba

describe('Storage · permisos por rol')

  Pricing:
    ✓ sube en tarifarios/
    ✓ sube en cotizaciones/*/pdf/
    ✗ NO sube en expedientes/
    ✗ NO sube en embarques/*/docs/

  Operaciones:
    ✓ sube en embarques/*/docs/
    ✗ NO sube en tarifarios/
    ✗ NO sube en expedientes/

  Administracion:
    ✓ sube en expedientes/
    ✓ sube en embarques/*/docs/
    ✗ NO sube en tarifarios/

  Nadie:
    ✗ NO borra ni sobrescribe en ninguna ruta
    ✗ NO sube archivo > 10 MB

describe('Fallback · claims + lista de correos')
    ✓ equipo sin claim sigue entrando (fallback temporal)
    ✓ claim válido entra sin estar en la lista
    ✓ claim inválido no entra
```

### 5.2 Estimación

~50-60 tests nuevos. Los actuales 13 se conservan como subset (verifican el
caso base de equipo/no-equipo).

---

## 6. Colecciones sin regla: qué agregar

### 6.1 `configuracion/{docId}`

```javascript
// Los documentos sueltos de configuración: empresa, tipoCambio.
// Todos leen (el tipo de cambio se muestra en toda la app).
// Solo admin edita empresa. tipoCambio lo escribe la Function (Admin SDK).
match /configuracion/{docId} {
  allow read: if esDelEquipoConRol();
  allow create: if esAdmin();
  allow update: if esAdmin()
                || (docId == 'tipoCambio' && false);  // solo la Function
  allow delete: if false;
}
```

**Nota:** la Function `tipoCambio` escribe con Admin SDK, así que la regla
`update: if false` para `tipoCambio` NO la afecta. El `if esAdmin()` para
update cubre que alguien edite `empresa` desde la app.

### 6.2 `tiposCambio/{fecha}`

```javascript
// Historial de tipos de cambio por fecha de determinación.
// Todos leen. Solo la Function escribe (Admin SDK, ignora reglas).
match /tiposCambio/{fecha} {
  allow read: if esDelEquipoConRol();
  allow write: if false;  // solo la Function con Admin SDK
}
```

### 6.3 `usuarios/{uid}`

```javascript
// Directorio de usuarios, creado por gestionarUsuarios (Admin SDK).
// Solo admin lee (pantalla de gestión de usuarios).
// Nadie escribe desde la app: la Function es la única vía.
match /usuarios/{uid} {
  allow read: if esAdmin();
  allow write: if false;  // solo la Function con Admin SDK
}
```

---

## 7. Pasos publicables por separado

Cada paso se despliega solo y deja el sistema en un estado coherente. El
punto de regreso de cada uno es volver a las reglas del paso anterior.

### Paso 0 — Verificar y asignar claims (sin deploy)

**Prerrequisito de todo lo demás.**

1. Verificar que las 6 cuentas tienen el claim `rol` con el valor correcto.
2. Si no, usar la pantalla de Usuarios (o la Function directamente) para
   asignar: Itzel=ventas, Nohema=pricing, Julio=administracion, Angel=operaciones,
   Gaby=admin, Luis=admin, Mau(info@digsol.com.mx)=admin.
3. Pedir a cada usuario que cierre sesión y vuelva a entrar, o esperar a que
   el token se refresque solo (al cambiar de pestaña, `visibilitychange`).
4. Verificar en la consola del navegador: `(await firebase.auth().currentUser.getIdTokenResult()).claims.rol`.

**Riesgo:** cero. Los claims son aditivos; no cambian el comportamiento
actual de nada. Solo agregan un dato al token que nadie lee todavía.

**Punto de regreso:** no hay. Los claims no se leen hasta el paso 1.

### Paso 1 — Colecciones sin regla + lectura de todos (solo Firestore)

Agregar las reglas de `configuracion`, `tiposCambio` y `usuarios`. Son
colecciones que hoy caen al `deny all`. El cambio es solo de abrir lectura
donde ya se necesita.

**Deploy:** `cd /ruta/principal && npx firebase deploy --only firestore:rules`

**Riesgo:** bajo. Abre lectura a lo que ya se lee (y falla en silencio). No
quita nada a nadie.

**Punto de regreso:** quitar las tres reglas nuevas y redesplegar.

**Validación:** el hook `useTipoCambio` deja de reportar `permission-denied`
en consola. `useConfiguracionEmpresa` deja de caer al default.

### Paso 2 — Reglas por rol en Firestore (el cambio grande)

Reemplazar `esDelEquipo()` por `esDelEquipoConRol()` con fallback, y agregar
las funciones `tieneRol()`, `esAdmin()`, etc. Cambiar cada `match` para usar
los roles según la matriz de §2.1.

**Deploy:** `cd /ruta/principal && npx firebase deploy --only firestore:rules`

**Riesgo:** medio-alto. Una regla mal puesta puede dejar a un área sin poder
trabajar. Mitigación:

1. Los tests de reglas nuevos cubren los 5 roles × las colecciones principales.
2. El fallback temporal a la lista de correos asegura que si el claim falta,
   el equipo sigue entrando.
3. El deploy se hace cuando el equipo NO está trabajando (mañana del sábado,
   por ejemplo) y Mau prueba los 4 roles principales en 5 minutos.

**Punto de regreso:** redesplegar las reglas del paso 1 (sin roles).

**Validación de Mau (5 minutos):**

| Cuenta | Intenta | Espera |
|---|---|---|
| Itzel (ventas) | Crear un lead | Funciona |
| Itzel (ventas) | Crear un cliente en Altas | Falla (permiso denegado en reglas) |
| Nohema (pricing) | Crear cotización | Funciona |
| Nohema (pricing) | Crear embarque | Falla |
| Angel (operaciones) | Crear embarque | Funciona |
| Angel (operaciones) | Crear cotización | Falla |
| Julio (administracion) | Crear cliente | Funciona |
| Julio (administracion) | Crear cotización | Falla (Admin da altas, no cotiza) |

### Paso 3 — Reglas por rol en Storage

Igual que el paso 2 pero para `storage.rules`. Se agregan las rutas que faltan
(`ordenesCompra/*/factura/`) y se restringe por rol.

**Deploy:** `cd /ruta/principal && npx firebase deploy --only storage`

**Riesgo:** bajo-medio. Storage se usa menos que Firestore. La mitigación es
la misma.

**Punto de regreso:** redesplegar las reglas de Storage del Bloque 9.

### Paso 4 — Quitar el fallback de la lista de correos

Después de verificar que todos tienen claim y que todo funciona durante al
menos una semana:

1. Quitar la rama del `||` con la lista de correos de `esDelEquipoConRol()`.
2. Quitar `esDelEquipo()` por completo.
3. Los tests de reglas se actualizan para no probar el fallback.

**Deploy:** firestore:rules + storage

**Riesgo:** bajo (si el paso 2 funciona bien durante una semana, el fallback
no se está usando).

**Punto de regreso:** redesplegar con el fallback.

### Paso 5 — Eliminar los mapas de correo del código

Una vez que las reglas por claim funcionan:

1. `src/auth/AuthContext.tsx`: eliminar `_ROL_POR_EMAIL_RAW`, `ROL_CUENTAS_PRUEBA`
   y `getRolByEmail`. El rol viene siempre del claim.
2. `functions/src/comun/auth.ts`: eliminar `ROL_POR_EMAIL`, `ROL_CUENTAS_PRUEBA`
   y el mapa. El rol viene del claim.
3. `scripts/reglasEmulador.sh`: ya no necesita inyectar correos de prueba; las
   reglas del emulador usan los mismos claims que producción.

**Riesgo:** medio. Si un usuario no tiene claim, se queda sin rol. Validar
primero que todos lo tengan. Punto de regreso: git revert.

---

## 8. Diagrama del orden

```
  Paso 0: Claims (sin deploy)
    │
    ▼
  Paso 1: Reglas para configuracion, tiposCambio, usuarios
    │
    ▼
  Paso 2: Firestore por rol (con fallback)
    │
    ▼
  Paso 3: Storage por rol
    │
    ├── (1 semana de convivencia)
    ▼
  Paso 4: Quitar fallback de lista de correos
    │
    ▼
  Paso 5: Limpiar código (mapas de correo)
```

**Dependencias cruzadas:**
- La tarea 54 (expediente del proveedor) agrega `expedientes/{proveedorId}/`.
  La regla de Storage ya cubre `expedientes/{entidadId}/` — funciona para
  ambos con la misma ruta.
- La tarea 55 (factura del proveedor en OC) necesita la ruta
  `ordenesCompra/{id}/factura/` en Storage. Si se hace antes del paso 3,
  la regla se escribe en el reporte de la 55 (como ya se hizo con la 51).

---

## 9. Limitaciones de las reglas de Firestore

Las reglas de Firestore pueden leer `request.auth.token.rol` y validar contra
la operación (read/create/update/delete), pero **NO** pueden:

- Validar el contenido del documento contra reglas de negocio complejas
  (máquina de estados de cotizaciones, frenos de expediente, etc.). Eso
  requeriría `get()` para leer otros documentos y la lógica sería frágil.
- Distinguir entre "editar cargos" y "editar etapa" dentro del mismo
  `update` a cotizaciones. Es el mismo `update` a Firestore.
- Replicar la lógica de `permisos.ts` completa (capacidades por acción).

**Lo que SÍ se puede hacer con confianza:**

- Bloquear operaciones CRUD por rol (Ventas no crea clientes).
- Impedir deletes en toda colección.
- Asegurar que la subida de documentos solo la hagan los roles correctos.
- Asegurar que nadie fuera del equipo (sin claim válido) acceda a nada.

**Lo que sigue viviendo en la UI/hooks:**

- La máquina de estados de cotizaciones y embarques.
- Los frenos de expediente y de proveedor.
- Las capacidades granulares (solicitar OC vs. autorizarla).

Esto no es ideal, pero es el punto de equilibrio: las reglas de Firestore
cierran el agujero grande (Ventas creando clientes saltándose la app) sin
intentar replicar lógica que cambiaría con cada sprint.

---

## 10. Preguntas

### Para Mau (bloquean implementación)

| # | Pregunta | Recomendación |
|---|---|---|
| 1 | ¿Las 6 cuentas ya tienen el claim `rol` puesto? | Verificar en la pantalla de Usuarios. Si no, asignar antes de empezar |
| 2 | ¿Se despliega primero el paso 1 (colecciones sin regla) solo? Esto arregla el `permission-denied` de tipo de cambio | Sí, es inmediato y sin riesgo |
| 3 | ¿El paso 2 se despliega un sábado para minimizar impacto? | Sí, con Mau disponible para validar los 4 roles en 5 minutos |
| 4 | ¿Ventas necesita poder leer documentos del expediente en Storage, o le basta con el campo `expedienteValidado` en Firestore? | Solo Firestore. No darle acceso a Storage de expedientes |
| 5 | ¿`info@digsol.com.mx` (Mau) sigue como admin o cambia a otro rol? | Admin: es el superusuario técnico |
| 6 | ¿Administracion necesita leer cotizaciones? Hoy no tiene 'quotes' en ALLOWED_VIEWS pero sí tiene capacidades de cotización (crear, versionear) | Sí: Admin crea cotizaciones (§4.1 "abre en cualquier etapa"). Agregar 'quotes' a ALLOWED_VIEWS de administracion o verificar que no se necesita la vista |

### Para Vermur

Ninguna. Este plan es interno y no cambia la operación visible del equipo.

---

## 11. Estimación

| Paso | Descripción | Esfuerzo |
|---|---|---|
| 0 | Verificar y asignar claims | 15 minutos (Mau) |
| 1 | Reglas para colecciones sin regla | 30 minutos de código + deploy |
| 2 | Firestore por rol + tests | ~6 horas (el grueso es la batería de tests) |
| 3 | Storage por rol + tests | ~2 horas |
| 4 | Quitar fallback | 30 minutos + deploy |
| 5 | Limpiar mapas de correo | ~2 horas |

Total: **~11 horas**, repartidas en 2-3 sesiones. El paso 2 es el más largo
y el más sensible; el resto es incremental.
