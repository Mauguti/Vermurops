# Plan — Reciclar cotizaciones y orden de la bandeja de Pricing

Análisis, sin código. Dos temas independientes en un solo plan.

---

## Parte 1: Reciclar cotizaciones

### 0. El problema

Pricing arma muchas cotizaciones con la misma estructura: misma ruta, mismos
conceptos, mismos proveedores, distintos clientes o misma operación repetida
meses después. Hoy cada una se crea desde cero: elegir conceptos del catálogo,
buscar tarifas, capturar costos, asignar proveedores. Es trabajo repetido que
ya se hizo antes.

«Reciclar» es partir de una cotización previa — copiarle la estructura y los
montos — para ajustar en vez de rearmar.

---

### 1. Reciclar vs. Nueva versión — son cosas distintas

|  | Nueva versión | Reciclar |
|---|---|---|
| **Resultado** | Mismo folio, versión n+1 | Folio nuevo, cotización independiente |
| **Relación** | La v1 y la v2 son la misma cotización | La original y la reciclada son DOS cotizaciones sin vínculo operativo |
| **ID** | Se conserva (`cotizaciones/{id}`) | Nuevo (`cotizaciones/{id2}`) |
| **Historial** | Continuo: chat, actividades y etapas siguen | Limpio: nace sin historial |
| **Cliente** | El mismo, siempre | El mismo u otro |
| **Etapa** | Continúa donde estaba (o se reabre si era perdida) | Nace en `solicitud_cliente` o `solicitado_pricing` |
| **Embarque** | Lo hereda si estaba congelada (no se puede versionar) | Nunca: no tiene vínculo |
| **Quién puede** | Pricing y Admin (`cotizacion.crear`) | Pricing, Ventas y Admin (cualquiera que pueda crear) |
| **Cuándo** | Cuando la cotización viva necesita rehacer números | Cuando una operación NUEVA se parece a una que ya se cotizó |

**En resumen:** Nueva versión = editar la misma operación. Reciclar = empezar
una operación nueva con una plantilla que ya se trabajó.

---

### 2. Qué se copia y qué no

**Propuesta de Mau, con ajustes donde el código lo pide:**

#### Se copian

| Campo | Cómo | Nota |
|---|---|---|
| `servicios[].conceptos[]` | Copia profunda | Nombre, `conceptoId`, impuesto elegido |
| `servicios[].conceptos[].tarifas[]` | Copia profunda | Proveedor, monto, moneda, `proveedorId` |
| `servicios[].conceptos[].proveedoresOficialIds` | Copia | La selección de proveedor |
| `servicios[].conceptos[].costo`, `profit`, `venta`, `margen` | Copia | Los montos de la cotización original |
| `servicios[].conceptos[].costoCapturado` | Copia | Si era intencional, se mantiene |
| `servicios[].conceptos[].subconceptos` | Copia profunda | Si existían |
| `servicios[].cotizacionesProveedor[]` | Copia profunda | Para la ruta B (bandeja), si existían |
| `servicios[].trafico`, `ubicacion` | Copia | Determinan el IVA y el folio del embarque |
| `servicios[].tipo` | Copia | Marítimo, aéreo, terrestre, etc. |
| `servicios[].carga` | Copia profunda | La carga tipada (FCL, LCL, etc.) |
| `servicios[].ruta`, `incoterm` | Copia | La ruta con puertos |
| `servicios[].notasOperativas` | Copia | Lo que Pricing anotó |
| `moneda` | Copia | La moneda principal de la cotización |
| `diasLibresDemora`, `diasLibresAlmacenaje` | Copia | Condiciones que suelen repetirse por ruta |
| `prospecto` | Copia, editable | Se puede cambiar el nombre al reciclar |
| `servicios[].conceptosRequeridos` | Copia | Lo que pidió el cliente (puede ser igual) |

#### NO se copian

| Campo | Por qué |
|---|---|
| `id` (folio) | Nace nuevo con `generateFolio()` |
| `createdAt`, `updatedAt` | Nuevas fechas |
| `etapa` | Nace al inicio del flujo |
| `estadoFinal`, `motivoPerdida` | No es terminal: es nueva |
| `tipoCambio` | Debe recapturarse: el TC cambia y la regla del congelado dice que cada cotización tiene el suyo |
| `vigencia` (si existiera) | La vigencia de las tarifas puede haber cambiado |
| `historialEtapas` | Limpio |
| `actividades` | Limpio (se agrega una: «Reciclada de COT-2026-XXXX») |
| `chat` | Limpio |
| `embarqueIds` | Nunca: no hay embarque |
| `versionActual`, `origenVersion`, `versiones` | Es la v1 de una cotización nueva |
| `pdfs` | No tiene PDFs propios |
| `saltoExpediente` | No hereda saltos: el expediente se valida por separado |
| `clienteId` | Opcional: el mismo u otro. Default: el mismo si se elige |
| `vendedorId`, `pricingId` | Se asignan según el usuario que recicla |

#### Se marcan al copiar

| Campo | Qué se marca | Cómo |
|---|---|---|
| `tarifas[].vigencia` | Si la vigencia ya venció, la tarifa se marca visualmente como **vencida** | Compararla contra la fecha actual al copiar; el dato se copia tal cual, pero la UI muestra un badge ámbar «Vigencia vencida — verificar» |
| `tarifas[]` sin `proveedorId` | Tarifas incompletas | Badge «Sin proveedor» — ya existe en la bandeja |
| Conceptos sin `conceptoId` | Fuera de catálogo | Badge «Concepto fuera del catálogo» — ya existe desde tarea 16 |
| Costo manual sin moneda explícita | El bug de §6 | Badge «Sin moneda» — ya existe en el script de auditoría |

**Decisión de diseño: no filtrar tarifas vencidas al copiar.** La estructura
vencida sigue siendo la plantilla correcta; el costo es el último conocido.
Pricing revisa y actualiza, que es más rápido que rearmar desde cero. Filtrar
las borraría, y entonces reciclar pierde su valor.

---

### 3. En qué se distingue de la propuesta de Mau

La propuesta es sólida. Dos ajustes menores:

1. **Las notas SÍ se copian** (las de `notasOperativas` por servicio, no las de
   `actividades`). `notasOperativas` son instrucciones de Pricing sobre la
   operación — «el cliente no acepta transbordo», «siempre pide seguro» — que
   aplican al reciclaje. `actividades` son la conversación de la cotización
   original y esas no se copian.

2. **El TC NO se copia**, como dice la propuesta, pero conviene dejar una
   **referencia visible**: «La cotización original usaba TC $18.50 del
   28-ago-2026». Es un ancla para Pricing, no un valor activo.

---

### 4. Dónde vive en la UI

#### 4.1 Punto de entrada: la ficha de la cotización original

Un botón «Reciclar como nueva cotización» en el menú de acciones (los tres
puntos del encabezado de la ficha), visible para cualquiera con
`cotizacion.crear` o `cotizacion.solicitar`. Se puede reciclar una cotización
en CUALQUIER etapa, incluida ganada, perdida y congelada — es una copia, no
una modificación.

**Por qué no en la bandeja ni en el Kanban:** reciclar es una acción poco
frecuente y deliberada. No necesita un botón prominente; necesita acceso
desde la cotización que se quiere copiar.

#### 4.2 Modal de confirmación

Al hacer clic:

```
┌───────────────────────────────────────────────┐
│  Reciclar COT-2026-0031 como nueva cotización │
│                                               │
│  Prospecto: [Acme Corp         ] (editable)   │
│  Cliente:   [El mismo ▾ | Otro ▾ | Ninguno]   │
│                                               │
│  Se copian:                                   │
│  · 3 servicios con 12 conceptos               │
│  · 8 tarifas de proveedor (2 con vigencia     │
│    vencida)                                   │
│  · Moneda: USD                                │
│                                               │
│  NO se copian: folio, fechas, tipo de cambio, │
│  historial ni vínculo a embarque.             │
│                                               │
│  [Cancelar]                [Crear cotización]  │
└───────────────────────────────────────────────┘
```

**«Crear cotización»** genera el folio, escribe el documento y abre la ficha
de la nueva cotización. Pricing empieza a trabajar sobre ella.

#### 4.3 Registro de origen

La nueva cotización recibe UNA actividad al nacer:

```
Reciclada de COT-2026-0031 (v2)
Conceptos, tarifas y configuración copiados. 2 tarifas con vigencia vencida.
```

Un campo `recicladaDe` queda en la raíz para trazabilidad:

```ts
recicladaDe?: {
  cotizacionId: string;   // 'COT-2026-0031'
  version: number;        // De qué versión se copió
  fecha: string;          // Cuándo se recicló
  por: string;            // Quién
}
```

Es informativo y de solo lectura. La cotización reciclada NO depende de la
original: si la original se marca perdida o se borra lógicamente, la reciclada
sigue viva.

---

### 5. Cómo se construye

#### Función pura: `planearReciclaje`

```ts
// lib/reciclarCotizacion.ts — sin React, sin Firestore

function planearReciclaje(
  original: KanbanQuote,
  opciones: {
    nuevoFolio: string;
    prospecto: Prospecto;
    clienteId: string | null;
    vendedorId: string | null;
    pricingId: string | null;
    autor: { uid: string; nombre: string };
    ahora: string;
  }
): KanbanQuote {
  // 1. Copia profunda de servicios
  // 2. Limpia los campos que no viajan
  // 3. Marca tarifas vencidas (sin borrarlas)
  // 4. Genera la actividad de origen
  // 5. Devuelve el documento listo para setDoc
}
```

Sigue el mismo patrón que `planearNuevaVersion`: función pura que devuelve
el documento; el hook lo escribe. Sin transacción compleja: es un `setDoc` de
un documento nuevo más el `generateFolio` que ya usa transacción.

#### En qué etapa nace

| Quién recicla | Etapa inicial | Por qué |
|---|---|---|
| Ventas | `solicitud_cliente` | Es una solicitud nueva |
| Pricing | `solicitado_pricing` | Pricing ya tiene el contenido; no necesita que Ventas la mande |
| Admin | `solicitado_pricing` | Igual que Pricing |

Esto ya es el patrón normal de creación: `Quotes.tsx:684` pone la etapa según
el rol. `planearReciclaje` usa el mismo criterio.

---

### 6. Tarifas vencidas al reciclar

El marcado visual es suficiente, pero conviene que el plan incluya cómo se
resuelve operativamente:

1. **Al abrir la ficha reciclada**, las tarifas vencidas se ven en ámbar en la
   tabla de conceptos, con un tooltip: «Vigencia vencida (31-jul-2026).
   Actualiza el costo antes de enviar.»

2. **El freno de «Enviar al cliente»** (`prontitudCotizacion`) ya bloquea
   líneas sin tasa de impuesto resuelta (tarea 03). Se puede agregar otro
   faltante: «N tarifas con vigencia vencida». O no — Pricing puede decidir
   que el precio sigue vigente aunque la tarifa formal haya expirado.

   **Recomendación:** NO bloquear por vigencia vencida. Marcar visualmente
   y dejar que Pricing decida. El freno es para campos que hacen falta, no
   para juicios de negocio.

3. **Si Pricing quiere actualizar**, abre la comparativa del concepto y elige
   una tarifa nueva del catálogo, o captura el costo a mano. El flujo ya
   existe.

---

### 7. Convivencia con lo existente

| Sistema | Impacto |
|---|---|
| Versiones | Cero. La reciclada es una cotización nueva; versionarla crea su propia cadena v1, v2… |
| Embarques | Cero. La reciclada no hereda `embarqueIds` |
| Kanban | Cero. Aparece como cualquier cotización nueva |
| Bandeja | Cero. Entra por etapa, no por origen |
| Máquina de estados | Cero. Nace en la etapa que le toca según el rol |
| `updateCotizacion` / congelado | Cero. Es un documento nuevo sin restricciones |
| Auditoría (`auditarCotizacionesVivas.ts`) | Se beneficia: una reciclada hereda `conceptoId` y `proveedorId` resueltos |

---

### 8. Modelo aprobado

Un solo campo nuevo, opcional, informativo:

```ts
// En KanbanQuote
recicladaDe?: {
  cotizacionId: string;
  version: number;
  fecha: string;
  por: string;
}
```

Leído con fallback a `undefined` (no existe en cotizaciones actuales). No
requiere migración. No afecta reglas de Firestore (las actuales permiten
cualquier campo a autenticados del equipo).

---

### 9. Pasos publicables

#### Paso 1 — La función pura y tests (1 h)

- `lib/reciclarCotizacion.ts`: `planearReciclaje`, testeable sin Firestore.
- Tests:
  - Copia profunda de servicios con conceptos, tarifas y subconceptos.
  - NO copia: folio, fechas, TC, historial, embarqueIds, versiones, PDFs.
  - Marca tarifas vencidas sin borrarlas.
  - Actividad de origen con folio y versión de la original.
  - Etapa correcta según rol (ventas → solicitud_cliente, pricing → solicitado_pricing).
  - `recicladaDe` apunta a la original.
  - `clienteId` es opcional.

**Punto de regreso:** borrar el archivo.

**Qué despliega:** nada (no hay UI todavía).

#### Paso 2 — Modal y botón en la ficha (1.5 h)

- Botón «Reciclar» en el menú de acciones del encabezado.
- Modal con prospecto editable, selector de cliente y resumen de lo que se copia.
- `handleReciclar` genera folio, llama a `planearReciclaje`, escribe con
  `setDoc` y abre la ficha de la nueva cotización.
- Capturas en escritorio y angosto.

**Punto de regreso:** quitar el botón y el modal.

**Qué despliega:** hosting.

#### Paso 3 — Marcas de vigencia en la ficha (30 min)

- En la tabla de conceptos de la cotización, badge ámbar en las tarifas con
  vigencia vencida (la lógica de `esTarifaVigente` ya existe).
- Tooltip con la fecha de vencimiento.
- NO bloquea el envío: solo marca visualmente.

**Punto de regreso:** quitar el badge.

**Qué despliega:** hosting. Se puede publicar con el paso 2 o por separado.

---

## Parte 2: Orden de la bandeja de Pricing

### 0. Estado actual

La bandeja de Pricing (`BandejaPricing.tsx`) muestra tres bloques con orden
fijo: **más antigua primero**, hardcodeado en `clasificarBandeja.ts:106`:

```ts
const byAge = (a: KanbanQuote, b: KanbanQuote) =>
  a.createdAt.localeCompare(b.createdAt);
```

Tres filtros hardcodeados: «Todas», «Solo mías», «Sin asignar». No hay
preferencia guardada: recargar vuelve a «Todas» y «más antigua primero».

---

### 1. Qué debería poder ordenar Pricing

| Criterio | Campo | Dirección natural | Utilidad |
|---|---|---|---|
| Antigüedad | `createdAt` | Más antigua primero (actual) | FIFO: lo que lleva más tiempo esperando |
| Días esperando | `diasEsperando()` | Más días primero | Similar al anterior, pero mide desde que entró a Pricing |
| Tarifas disponibles | `contarTarifasDisponibles()` | Más tarifas primero | Priorizar las que se pueden avanzar ya |
| Progreso | `calcularProgreso()` | Menor progreso primero | Atacar primero las que no se han tocado |
| Cliente | `prospecto.empresa` | Alfabético | Agrupar por cliente para trabajarlas juntas |

**Recomendación:** empezar con los dos primeros (antigüedad y días esperando)
y agregar los demás si Pricing los pide. El costo de cada criterio adicional
es una línea en un switch.

---

### 2. Dónde guardar la preferencia

La infraestructura ya existe en dos niveles:

#### Opción A: `PreferenciasUsuario` (recomendada)

`preferenciasUsuario/{uid}` es un documento simple de preferencias por usuario.
Hoy tiene una sola llave (`vistaCargos`). Agregar dos más:

```ts
export interface PreferenciasUsuario {
  vistaCargos?: 'proveedor' | 'concepto';
  // Nuevas:
  bandejaPricingOrden?: 'antiguedad' | 'dias_esperando';
  bandejaPricingFiltro?: 'todas' | 'mias' | 'sin_asignar';
}
```

**A favor:** ya existe, ya tiene hook (`usePreferenciasUsuario`), escritura
optimista con merge, y la regla de Firestore ya lo permite.

**En contra:** nada. Es exactamente para esto.

#### Opción B: `VistasUsuario` con módulo `'bandeja_pricing'`

Las vistas guardables (`vistasUsuario/{id}`) tienen `modulo`, `ordenamiento`,
`filtros` y soporte para compartirlas. Es infraestructura completa.

**A favor:** si la bandeja algún día necesita vistas con nombre («Mi vista de
urgentes», «Solo marítimo»), esto lo soporta.

**En contra:** la bandeja no es una tabla. No tiene columnas configurables, no
tiene `SpreadsheetTable`, y agregar un módulo nuevo requiere índice compuesto.
Sobreingenería para un orden y un filtro.

#### Recomendación: Opción A

Dos llaves en `PreferenciasUsuario`, un `useEffect` que las lea al montar, un
par de botones o un dropdown en la bandeja. Cuando exista `usuarios/{uid}`,
las preferencias se pueden mover ahí o quedarse donde están.

---

### 3. Cambios en la bandeja

#### En `clasificarBandeja.ts`

La función `clasificarBandeja` hoy ORDENA internamente. Para soportar
criterios distintos, el orden sale afuera:

```ts
// Antes: clasificarBandeja ordena por createdAt
// Después: clasificarBandeja NO ordena; el componente aplica el criterio

export function clasificarBandeja(quotes: KanbanQuote[]): BandejaClasificada {
  // ... clasificar en bloques, SIN ordenar
  return result;
}

// Nueva función exportada:
export function ordenarBloque(
  bloque: KanbanQuote[],
  criterio: 'antiguedad' | 'dias_esperando',
): KanbanQuote[] {
  const sorted = [...bloque];
  switch (criterio) {
    case 'dias_esperando':
      sorted.sort((a, b) => diasEsperando(b) - diasEsperando(a));
      break;
    case 'antiguedad':
    default:
      sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return sorted;
}
```

#### En `BandejaPricing.tsx`

Donde hoy dice el texto estático «Ordenadas por antigüedad», poner un
dropdown o radio buttons:

```
Ordenar por: [Antigüedad ▾]  Filtrar: (Todas) (Mías) (Sin asignar)
```

El filtro ya existe pero no se persiste. Ambos valores se leen de
`usePreferenciasUsuario` al montar y se guardan con `guardar()` al cambiar.

---

### 4. Convivencia con lo existente

| Sistema | Impacto |
|---|---|
| `clasificarBandeja` | Se refactoriza para sacar el sort: cambio menor, mismos tests |
| `BandejaPricing` | Se agrega el dropdown y la llamada a `ordenarBloque` |
| `PreferenciasUsuario` | Dos llaves nuevas, sin romper las existentes (merge) |
| Reglas de Firestore | La colección `preferenciasUsuario` ya está cubierta |
| Usuarios y roles | Sin impacto: las preferencias son por `uid`, no por rol |

---

### 5. Pasos publicables

#### Paso 1 — Persistir el filtro (30 min)

- Guardar `bandejaPricingFiltro` en `PreferenciasUsuario`.
- Leerlo al montar `BandejaPricing`.
- El cambio de filtro llama a `guardar()`.

**Punto de regreso:** quitar la lectura; el default `'todas'` se queda.

**Qué despliega:** hosting.

#### Paso 2 — Orden configurable (45 min)

- `ordenarBloque` en `clasificarBandeja.ts` con tests.
- Dropdown en `BandejaPricing`.
- `bandejaPricingOrden` en `PreferenciasUsuario`.

**Punto de regreso:** quitar el dropdown y restaurar el sort interno.

**Qué despliega:** hosting.

---

## Preguntas

### Para Mau

1. **¿Reciclar nace en `solicitud_cliente` para Ventas y en `solicitado_pricing`
   para Pricing?** Propongo que sí, siguiendo el patrón de creación normal. Si
   Pricing recicla, ya tiene el contenido y no necesita que Ventas la reenvíe.
   Si Ventas recicla, es una solicitud nueva que pasa por el flujo normal.

2. **¿La referencia al TC original es útil o es ruido?** Propongo mostrar «La
   cotización original usaba TC $X.XX del DD-MMM-YYYY» como texto informativo
   en la sección de tipo de cambio, sin precargarlo.

3. **¿Bloquear el envío por tarifas vencidas?** Recomendación: no. Marcar
   visualmente y que Pricing decida. Una tarifa «vencida» puede seguir vigente
   por acuerdo verbal con el proveedor.

4. **¿`recicladaDe` es suficiente como modelo, o hace falta algo más?** Es un
   campo informativo de solo lectura. No afecta ninguna regla ni cálculo. Si
   en el futuro se quiere saber «cuántas veces se recicló esta cotización»,
   se busca por `recicladaDe.cotizacionId` — no necesita índice porque es una
   consulta infrecuente.

5. **¿El orden de la bandeja es prioridad o puede esperar?** Es cambio
   pequeño (1–2 horas), pero Pricing hoy tiene pocas cotizaciones activas y
   el orden por antigüedad puede ser suficiente. Recomendación: hacerlo
   después de las tareas de código que desbloquean al equipo.

### Para Vermur

Ninguna. Ambos temas son internos y las decisiones de negocio están tomadas.
