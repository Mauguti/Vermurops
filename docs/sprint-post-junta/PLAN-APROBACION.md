# PLAN: aprobación de clientes y proveedores

> Fecha: 30-sep-2026
> Tarea: sprint/COLA.md #34
> Estado: propuesta para Mau

---

## 1. El problema

Hoy el sistema tiene dos mundos distintos para validar entidades:

| Aspecto | Clientes | Proveedores |
|---|---|---|
| Mecanismo de validación | Existe (`expedienteValidado`, `frenoExpediente.ts`) | No existe |
| UI de aprobación | Sí (Altas → ficha → Expediente) | No |
| Magaya como validado | Sí (`origenDatos === 'magaya'` o `numeroEntidadMagaya`) | Campo existe, pero nadie lo lee como «aprobado» |
| Alta rápida | No aplica | Sí (`proveedor.altaRapida`, solo Pricing) |
| Estado «en revisión» | No hace falta: solo Admin da altas | Falta: Pricing crea proveedores que nacen `activo: true` |
| Notificación a Admin | No: las notificaciones por rol no persisten (§6) | No |
| Freno al avanzar | Sí: no se gana ni se abre embarque sin expediente | No: un proveedor sin RFC puede llegar a una OC pagada |
| Tests | 88 líneas (`frenoExpediente.test.ts`) | Cero |

El resultado: un proveedor inventado a mano por Pricing durante la cotización
nace como `activo: true` con `origenDatos: 'manual'` y sin RFC, y nada lo
distingue de uno formal. Puede entrar en una cotización, generar una OC y
recibir un pago sin que Administración lo valide nunca. La deuda técnica de §6
ya lo dice: «El alta rápida de proveedor debe quitar el RFC, marcarlo como "en
revisión" y avisar a Administración al concretar la cotización.»

Del lado de clientes, el mecanismo está completo (§4.18) y funciona: sin
cliente vinculado no se gana, sin expediente validado solo admin puede saltar
con justificación. Lo que falta es **extenderlo a proveedores con el mismo
patrón**, sin duplicar código.

---

## 2. Los estados y sus transiciones

### 2.1 Modelo unificado

El patrón ya probado en clientes sirve para los dos. El estado se CALCULA a
partir de los campos, no se guarda como string:

```
Estado              │ Cómo se determina
────────────────────┼──────────────────────────────────────────────────
aprobado_formal     │ expedienteValidado !== null
heredado_magaya     │ !expedienteValidado && (origenDatos === 'magaya' || !!numeroEntidadMagaya)
en_revision         │ !expedienteValidado && !esDeMagaya && origenDatos === 'manual'
```

Para clientes, `en_revision` es lo que hoy se llama `sin_validar`. Para
proveedores, es el estado nuevo donde nacen los de alta rápida.

### 2.2 Transiciones

```
                   ┌─────────────┐
  Alta rápida ────→│ en_revision  │
  (Pricing)        └──────┬──────┘
                          │ Administración valida
                          ▼
                   ┌─────────────────┐
                   │ aprobado_formal  │
                   └─────────────────┘

  Importación ────→┌──────────────────┐
  de Magaya        │ heredado_magaya   │──→ Administración puede validar
                   └──────────────────┘    formalmente (opcional)

  Alta definitiva ─→ aprobado_formal (nace validado)
  (Administración)
```

No hay transición de `aprobado` a `en_revision`: una validación no se revoca.
Si hay que corregir un error, se anota, no se deshace.

### 2.3 Para clientes: sin cambios

El mecanismo actual (`frenoExpediente.ts`) ya implementa exactamente este
modelo con los nombres `validado`, `heredado_magaya` y `sin_validar`. No se
toca.

### 2.4 Para proveedores: campos nuevos

| Campo | Tipo | Default | Quién escribe |
|---|---|---|---|
| `expedienteValidado` | `{ por: string; fecha: string; notas?: string } \| null` | `null` | Admin con `proveedor.alta` |

Es el MISMO tipo que ya usa `ClienteVermur.expedienteValidado`. Un solo campo,
el mismo nombre, la misma semántica.

**No hace falta `estadoAprobacion` como campo**: se calcula con la misma
función `estadoValidacion()` que ya existe para clientes, parametrizada para
aceptar ambos tipos. `origenDatos` y `numeroEntidadMagaya` ya existen en el
modelo de proveedores.

---

## 3. Quién aprueba

| Entidad | Quién da de alta | Quién aprueba | Capacidad |
|---|---|---|---|
| Cliente | Administración (`cliente.alta`) | Administración (`cliente.alta`) | Ya existe |
| Proveedor definitivo | Administración (`proveedor.alta`) | Nace aprobado (Admin lo crea completo) | Ya existe |
| Proveedor rápido | Pricing (`proveedor.altaRapida`) | Administración (`proveedor.alta`) | Ya existe |

No se necesitan capacidades nuevas. `proveedor.alta` ya cubre tanto el alta
definitiva como la validación del expediente: es la misma persona haciendo la
misma verificación (RFC, datos fiscales, cuenta bancaria).

---

## 4. Qué se puede hacer con uno no aprobado

### 4.1 Clientes

Ya resuelto (§4.18):

| Acción | Sin vincular | En revisión (sin validar) | Heredado Magaya | Aprobado |
|---|---|---|---|---|
| Cotizarle | No (sin cliente no hay cotización formal) | Sí | Sí | Sí |
| Marcar ganada | **No** | Solo admin con salto justificado | Sí | Sí |
| Abrir embarque | **No** | Solo admin con salto justificado | Sí | Sí |
| Facturarle | — | — | Sí | Sí |

### 4.2 Proveedores — propuesta

La propuesta de Mau a evaluar: «cotizarle sí, ganarle no».

| Acción | En revisión | Heredado Magaya | Aprobado |
|---|---|---|---|
| Incluirlo en la cotización (comparativa) | **Sí** | Sí | Sí |
| Elegirlo como proveedor oficial del concepto | **Sí** | Sí | Sí |
| Marcar ganada con él elegido | **Pregunta 1** | Sí | Sí |
| Generar OC con él | **Pregunta 2** | Sí | Sí |
| Pagarle (OC → autorizada → pagada) | **No** | Sí | Sí |

Los puntos seguros:

- **Cotizar sí**: Pricing necesita poder capturar el costo de un proveedor
  nuevo para comparar. El alta rápida existe exactamente para esto. Bloquear
  aquí haría inútil el alta rápida.

- **Pagarle no**: la OC no debería poder autorizarse si el proveedor no está
  aprobado. Es el equivalente al freno del expediente del cliente, pero en la
  máquina de estados de la OC. Administración no puede girar un pago a alguien
  que no tiene RFC validado ni cuenta bancaria verificada.

Los puntos que necesitan decisión de Mau:

> **Pregunta 1 para Mau: ¿Se puede marcar ganada una cotización que tiene un
> proveedor en revisión como elegido?**
>
> Recomendación: **sí**, por dos razones:
> 1. El freno del expediente del CLIENTE ya cubre el punto de «no abrir un
>    embarque con datos incompletos». Sumar un segundo freno por proveedor en
>    el mismo punto haría que Pricing necesitara a Administración para dos
>    cosas distintas antes de poder ganar, y ganar es de Ventas.
> 2. El proveedor se puede aprobar entre la ganada y la generación de la OC:
>    Operaciones abre el embarque, prepara la OC, y para entonces Admin ya
>    tuvo tiempo de validar al proveedor. El freno natural es la OC, no la
>    ganada.
>
> Si la respuesta es NO, el freno se agrega en la máquina de estados de
> cotizaciones junto al de expediente, con el mismo patrón: «Hay N proveedores
> sin aprobar. Administración los valida en Altas.»

> **Pregunta 2 para Mau: ¿Se puede GENERAR la OC con un proveedor en revisión,
> o se bloquea desde la solicitud?**
>
> Recomendación: **permitir generar, bloquear autorizar**. Razón:
> - Operaciones necesita poder solicitar el pago para que el flujo avance y
>   Administración vea que hay un pendiente.
> - El punto de control natural es la autorización: es donde Administración
>   revisa y aprueba. Si el proveedor no está validado, el motivo del bloqueo
>   aparece ahí: «Proveedor X no está aprobado. Valídalo en Altas antes de
>   autorizar.»
> - Bloquear la solicitud dejaría la necesidad invisible: Operaciones no podría
>   ni pedir, y Administración no sabría que hay algo pendiente.

### 4.3 Resumen de frenos propuestos

```
COTIZACIÓN
  marcar ganada ──→ frenoCliente (ya existe)
                    frenoExpediente del CLIENTE (ya existe)
                    frenoProveedor: NO (recomendación; Pregunta 1)

ORDEN DE COMPRA
  solicitar    ──→ sin freno de proveedor (recomendación; Pregunta 2)
  autorizar    ──→ frenoProveedorOC: el proveedor no está aprobado
  pagar        ──→ ya cubierto: si no se autoriza, no se paga
```

---

## 5. Los 544 proveedores que ya existen

### 5.1 Los de Magaya

De los 544 proveedores importados, **todos** tienen `origenDatos` presente
(la importación lo puso). Los que vinieron de Magaya tienen
`numeroEntidadMagaya` con su RFC o número de entidad.

**Propuesta: aprobados de origen, igual que los clientes.** La misma lógica:
`esProveedorDeMagaya(p)` → `origenDatos === 'magaya' || !!numeroEntidadMagaya`.
Es un dato que ya existe y no necesita migración.

Esto es consistente con clientes (§4.18): «Los importados de Magaya cuentan
como validados de origen.» Si el criterio cambia para unos, debería cambiar
para los otros.

Administración puede validarlos formalmente en cualquier momento: el checklist
completa lo que Magaya no traía (acta, poder, CLABE…). Mientras tanto, operan
normal.

### 5.2 Los que empiezan con «Z»

El inventario de la tarea 33 los clasifica. Hay dos grupos:

1. **«Z » con espacio** (como «Z PROVEEDOR VIEJO»): son proveedores que
   Vermur marcó como inactivos en Magaya con el prefijo «Z ». Vinieron de
   Magaya → heredados, pero con `activo: false` la mayoría. Estos no necesitan
   aprobación: ya están inactivos y el flujo no los ofrece.

2. **«Z» natural** (ZIM, ZHEJIANG…): son proveedores reales que empiezan con
   Z. Mismo tratamiento que los demás de Magaya.

**No necesitan tratamiento especial en el plan de aprobación.** El inventario
de la tarea 33 sirve para decidir si se borran o se dejan inactivos, que es
una decisión de limpieza, no de aprobación.

### 5.3 Los creados en VermurOps

Todos los creados en la plataforma tienen `origenDatos: 'manual'` y NO tienen
`expedienteValidado` (el campo no existe hoy en proveedores). Al agregar el
campo, estos quedan automáticamente en `en_revision`.

**Consecuencia**: si hay proveedores creados manualmente que ya están en uso
en OCs pagadas, al activar el freno en la OC no se ven afectados (las OCs ya
pagadas no vuelven a pasar por autorización). Solo afecta OCs futuras.

> **Pregunta 3 para Mau: ¿Quieres que Administración reciba una lista de los
> proveedores manuales que ya existen para validarlos proactivamente?**
>
> Recomendación: sí, como parte del paso 2 (ver §7). El script de inventario
> (tarea 33) ya los puede listar.

---

## 6. Cómo convive con el freno de expediente de clientes

### 6.1 Son complementarios, no redundantes

| Freno | Qué protege | Dónde actúa | Cuándo se revisa |
|---|---|---|---|
| `frenoCliente` | No ganar sin cliente vinculado | Máquina de estados de cotización | Al intentar ganada |
| `frenoExpediente` | No abrir embarque con cliente sin validar | Máquina de estados + rutas de embarque | Al intentar ganada o abrir embarque |
| `frenoProveedor` (nuevo) | No pagar a proveedor sin aprobar | Máquina de estados de la OC | Al intentar autorizar la OC |

Cada freno actúa en un punto distinto del flujo y protege una entidad
distinta. No se estorban.

### 6.2 El salto de admin

Para clientes, admin puede saltar el freno del expediente con justificación
obligatoria. ¿Se necesita lo mismo para proveedores?

> **Pregunta 4 para Mau: ¿Admin puede autorizar una OC con proveedor no
> aprobado, con justificación?**
>
> Recomendación: **sí, con el mismo patrón**. Caso de uso: un anticipo
> urgente a un transportista nuevo que aún no tiene RFC validado. El salto
> queda registrado en la OC (`saltoProveedorOC: { por, fecha, justificacion }`)
> y en la bitácora del embarque. Al aprobar al proveedor, el aviso desaparece;
> el registro se queda.
>
> Sin salto, la única opción ante una urgencia es inventar datos para que el
> proveedor pase. Eso es peor.

### 6.3 Reutilización de código

La función `estadoValidacion()` de `frenoExpediente.ts` hoy recibe un
`ClienteVermur`. Se puede generalizar a una interfaz mínima:

```typescript
interface EntidadValidable {
  origenDatos?: string;
  numeroEntidadMagaya?: string | null;
  expedienteValidado?: { por: string; fecha: string; notas?: string } | null;
}
```

Tanto `ClienteVermur` como `ProveedorVermur` cumplen esta interfaz (el
proveedor ya tiene `origenDatos` y `numeroEntidadMagaya`; falta agregarle
`expedienteValidado`). La función `estadoValidacion` se mueve a
`lib/estadoValidacion.ts` y la usan ambos frenos. `frenoExpediente.ts` la
importa sin cambiar su API.

---

## 7. Pasos publicables por separado

Cada paso se despliega solo y deja el sistema en un estado coherente.

### Paso 1 — La función y los tests (solo lib, sin UI)

**Archivos:**
- `lib/estadoValidacion.ts` — interfaz `EntidadValidable`, `estadoValidacion()`,
  `esEntidadDeMagaya()`, `etiquetaValidacion()`. Reutiliza la lógica que hoy
  vive en `frenoExpediente.ts`.
- `lib/frenoProveedor.ts` — `razonProveedorNoAprobado(proveedor)`,
  `exigirProveedorAprobado(proveedor, ctx)`. Mismo patrón que `frenoExpediente`.
- `lib/frenoProveedor.test.ts` — Tests análogos a `frenoExpediente.test.ts`:
  proveedor de Magaya → pasa; manual con `expedienteValidado` → pasa; manual
  sin → falla; admin con justificación → pasa con salto.
- Refactor: `frenoExpediente.ts` importa de `estadoValidacion.ts` en vez de
  tener su propia `estadoValidacion()`. Los tests existentes siguen pasando.

**Modelo:** agregar `expedienteValidado?: { por: string; fecha: string;
notas?: string } | null` a `ProveedorVermur` en `ProveedoresData.ts`. Campo
opcional, default `undefined` (los existentes no lo tienen y leen como
`sin_validar` o `heredado_magaya` según su origen).

**No toca UI, no toca Firestore, no toca reglas.** Publicable sin riesgo.

### Paso 2 — Freno en la OC

**Archivos:**
- `stateMachineOC.ts` — en la transición `en_gestion → autorizada`, agregar
  validación: si el `proveedorId` de la OC apunta a un proveedor en `en_revision`,
  bloquear con «Proveedor X no está aprobado. Valídalo en Altas.»
- La validación necesita el proveedor como contexto, igual que el fondeo del
  cliente. Se agrega `proveedorCtx?: EntidadValidable` al parámetro de
  `puedeTransicionarOC`.
- Si se decide el salto de admin (Pregunta 4): `saltoProveedorOC` en la OC,
  con el mismo tipo `SaltoExpediente`.
- `stateMachineOC.test.ts` — tests del nuevo freno.
- `FichaOC.tsx` — mostrar el aviso cuando el proveedor no está aprobado, con
  enlace a la ficha del proveedor en Altas.

**Dependencia:** paso 1.

### Paso 3 — UI de validación del proveedor

**Archivos:**
- `FichaProveedor.tsx` — pestaña «Expediente» (o sección dentro de la ficha
  existente), análoga a la del cliente:
  - Badge de estado: «Aprobado», «Heredado de Magaya», «En revisión».
  - Checklist de documentos (`docsAlta` para proveedores: RFC/CSF, acta,
    cuenta bancaria, contrato marco). **Pregunta 5.**
  - Botón «Aprobar proveedor» (solo con `proveedor.alta`).
  - Si ya está aprobado: quién, cuándo, notas.

**Modelo:** agregar `docsAltaProveedor?: DocsAltaProveedor` a `ProveedorVermur`.
Opcional, no bloquea lo existente.

**Dependencia:** paso 1.

### Paso 4 — Alta rápida mejorada

**Archivos:**
- `AltaRapidaProveedorModal.tsx` — quitar el campo de RFC (hoy es opcional y
  pone `validadoFiscalmente: !!rfcVal`; el RFC NO es señal de aprobación
  formal, solo de que Pricing lo capturó). Agregar una línea visible: «Este
  proveedor queda en revisión. Administración lo aprueba en Altas.»
- `useProveedores.ts` — al crear con modo `'rapida'`, forzar
  `expedienteValidado: null` (explícito).

**Dependencia:** paso 1.

### Paso 5 — Aviso a Administración

Hoy las notificaciones por rol no persisten (§6 de CLAUDE.md): «se quedan en
memoria del navegador que las crea». Mientras no se resuelva eso, hay dos
caminos para avisar:

**Opción A (sin resolver notificaciones):** un badge en la sección de Altas →
Proveedores que cuente los proveedores en revisión: «3 por aprobar». Es una
consulta derivada (filtro por `!expedienteValidado && !esDeMagaya`), no una
notificación. Administración lo ve cada vez que entra a Altas. No depende del
sistema de notificaciones.

**Opción B (con notificaciones por rol, paso 1 de GU ya publicado):** el paso
1 de Usuarios y roles (tarea 21) creó `usuarios/{uid}` con el rol de cada
persona. Ahora `agregarNotificacion` puede resolver `destinatarios: ['administracion']`
buscando los uids con ese rol y escribiendo un documento por cada uno. Esto
destraba las notificaciones por rol sin esperar custom claims en reglas.

> **Pregunta 5 para Mau: ¿Opción A, Opción B, o las dos?**
>
> Recomendación: las dos. La A es inmediata (una línea de UI) y no depende de
> nada. La B resuelve un problema que va más allá de proveedores (todo «avisar
> a un área» está roto) y ahora es factible gracias al paso 1 de GU. Pero la B
> es más trabajo y tiene más riesgo (tocar notificaciones toca el bell de
> todos).

**Dependencia:** ninguna para A; paso 1 de GU (ya publicado) para B.

---

## 8. Campos aditivos que necesita

Todos opcionales, todos leídos con fallback del valor viejo (que es
`undefined`, interpretado como «sin validar» o «heredado» según el origen).

### En `ProveedorVermur` (ProveedoresData.ts)

| Campo | Tipo | Default | Paso |
|---|---|---|---|
| `expedienteValidado` | `{ por: string; fecha: string; notas?: string } \| null` | `null` / `undefined` | 1 |
| `docsAltaProveedor` | `DocsAltaProveedor` (ver abajo) | `undefined` | 3 |

```typescript
interface DocsAltaProveedor {
  csf: boolean;        // Constancia de Situación Fiscal
  acta: boolean;       // Acta constitutiva
  cuentaBancaria: boolean; // Cuenta bancaria verificada
  contrato: boolean;   // Contrato marco (si aplica)
}
```

> **Pregunta 6 para Mau: ¿Qué documentos pide Administración para aprobar un
> proveedor? ¿Son los mismos que para un cliente, o menos?**
>
> Para clientes son: acta, poder, identificación, CSF, comprobante de
> domicilio, CLABE. Para proveedores probablemente basta con CSF + cuenta
> bancaria + acta. Pero esto lo define Julio (Administración).

### En `OrdenCompra` (OrdenesCompraData.ts) — si se acepta el salto

| Campo | Tipo | Default | Paso |
|---|---|---|---|
| `saltoProveedorOC` | `{ por: string; fecha: string; justificacion: string } \| null` | `null` | 2 |

### Sin cambios en clientes

El modelo de clientes no cambia. La refactorización de `estadoValidacion` a
un archivo compartido es interna al código; la interfaz pública de
`frenoExpediente` no cambia.

---

## 9. Preguntas consolidadas

### Para Mau (bloquean implementación)

| # | Pregunta | Recomendación | Paso que bloquea |
|---|---|---|---|
| 1 | ¿Se puede marcar ganada con proveedor en revisión? | Sí: el freno natural es la OC | 2 |
| 2 | ¿Se puede generar la OC con proveedor en revisión? | Sí, bloquear solo la autorización | 2 |
| 3 | ¿Listar proveedores manuales para que Admin los valide proactivamente? | Sí, con el script del inventario | 2 |
| 4 | ¿Admin puede saltar el freno de proveedor en la OC con justificación? | Sí, mismo patrón que expediente | 2 |
| 5 | ¿Avisar a Admin con badge (A), notificación por rol (B), o ambas? | Ambas | 5 |
| 6 | ¿Qué documentos exige Admin para aprobar un proveedor? | CSF + cuenta bancaria + acta (confirmar con Julio) | 3 |

### Para Vermur (Julio / Administración)

1. Cuando Pricing crea un proveedor rápido durante la cotización, hoy queda
   como uno más. ¿Qué necesitas ver en Altas para saber que hay proveedores
   pendientes de validar?
2. ¿Qué documentos necesitas del proveedor para considerarlo aprobado?
   (CSF, acta constitutiva, comprobante de domicilio, cuenta bancaria, contrato,
   otro)
3. ¿Hay proveedores que deberían poder operar sin el expediente completo?
   Por ejemplo: un transportista local de una sola corrida.

---

## 10. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Activar el freno en la OC bloquea OCs que hoy pasan | OC trabada hasta aprobar al proveedor | Los de Magaya pasan solos; los manuales se listan y se validan antes de activar el freno (paso 2 después de paso 3) |
| Refactorizar `estadoValidacion` rompe `frenoExpediente` | Se pierden los frenos del cliente | La refactorización es rename + import; los tests existentes lo cubren |
| El alta rápida sin RFC confunde a Pricing | «¿Por qué ya no puedo poner el RFC?» | Se puede SEGUIR capturando RFC opcionalmente — lo que cambia es que su presencia no implica aprobación |
| Notificaciones por rol (opción B) abre una caja grande | Tocar el bell podría romper algo | Separar en su propio paso; la opción A cubre mientras tanto |

---

## 11. Estimación

| Paso | Descripción | Esfuerzo |
|---|---|---|
| 1 | Función, interfaz, tests, refactor de `estadoValidacion` | ~3 horas |
| 2 | Freno en la OC + tests + UI del aviso | ~4 horas |
| 3 | UI de validación en ficha del proveedor | ~4 horas |
| 4 | Mejora del alta rápida | ~1 hora |
| 5A | Badge en Altas | ~1 hora |
| 5B | Notificaciones por rol con `usuarios/{uid}` | ~6 horas (más riesgo) |

Total sin 5B: **~13 horas** (2 noches de sprint o 2 días con validación).
Con 5B: **~19 horas**.

Orden recomendado: 1 → 3 → 4 → 5A → 2. El paso 3 antes del 2 para que Admin
pueda aprobar proveedores ANTES de que el freno los bloquee. 5B se puede hacer
en cualquier momento después del 1.
