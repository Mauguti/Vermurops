# Plan — Tarifas: modelo de ONE y revisión de las 56 tarifas

Actualización 28-sep-2026. Incorpora la evidencia real del correo de ONE
(tarea 01 del sprint, `sprint/reportes/01.md`) y las decisiones ya tomadas
por Mau. **Sin código.**

---

## 0. Decisiones ya tomadas — no se reabren

1. **Presentación como unión discriminada por tipo.** Impide «40hc» en una
   tarifa aérea.
2. **La inferencia confirmada se guarda** con quién y cuándo. No se
   re-sugiere cada vez.
3. **Terrestre sin catálogo de puntos** no empata por ruta y lo dice.
4. **Aéreo mínimo/normal/rangos** queda pendiente de Nohema.
5. **56 tarifas, 30 tarifarios, 100% sin modalidad ni presentación** (50
   inferibles). No hay mecanismo permanente de «tarifa incompleta»: se usa
   una pantalla de revisión única.
6. **La modalidad del tarifario se confirma de un clic** y la heredan sus
   tarifas; la presentación va por tarifa.
7. **«20 (probable)» NO se preselecciona** (falta tipo de contenedor);
   **«cualquiera» SÍ se puede sugerir** cuando se cobra fijo.
8. **Orden:** pantalla de revisión → sesión con Pricing → activar la llave
   completa. Hasta entonces el panel sigue como hoy.

---

## 1. Evidencia real — el correo de ONE

Correo tal como lo recibe Pricing:

> Rates valid till July 31. Carrier: ONE.
> POL: Shenzhen / Ningbo / Shanghai / Qingdao / Xiamen / Dalian.
> POD: Manzanillo or Lazaro Cardenas.
> USD4300/20'GP, USD4400/40'GP, USD4400/40'HQ.
> Free time 21 days.
> Subject to: AMS USD30/bill, Telex release USD50/bill.

Se fabricaron tres fixtures (txt, xlsx, png) y se pasaron por el extractor
real (6 llamadas a n8n). Respuestas en `docs/fixtures/respuestas-extractor/`.

### Qué sacó n8n

| Dato | xlsx (14 líneas) | png (12 líneas) | txt |
|------|------------------|-----------------|-----|
| Montos 20'/40'/40'HC | ✅ 4300/4400/4400 | ✅ 4300/4400/4400 | ❌ fallo |
| 6 POL × 2 POD = 12 rutas | ✅ una línea por ruta | ✅ una línea por ruta | — |
| Vigencia «July 31» | ✅ fechaFin: 2024-07-31 | ✅ | — |
| Free time 21 días | ⚠️ confunde con tiempoTransito | ✅ freeTime: 21 | — |
| Carrier ONE | ✅ | ✅ «ONE (Ocean Network Express)» | — |
| AMS USD 30/bill | ✅ línea aparte, unidad «servicio» | ❌ solo en condiciones | — |
| Telex USD 50/bill | ✅ línea aparte, unidad «servicio» | ❌ solo en condiciones | — |
| Moneda | ✅ USD | ✅ USD | — |
| Concepto | «Flete marítimo» | «Ocean Freight» | — |
| Fecha de inicio | ❌ no la dice el correo | ❌ | — |

**Hallazgos clave:**

1. **n8n YA produce los tres montos por contenedor** (`monto`, `montoPor40`,
   `montoPor40HC`) en un solo renglón → `PreciosTarifa` los recibe sin
   cambios. No hace falta desglosar en tres tarifas.

2. **n8n YA desglosa las rutas** en combinaciones POL × POD → cada una es
   una `TarifaVermur` independiente. No hay un modelo «N a M» que construir.

3. **Los cargos por bill (AMS, Telex)** solo los extrae el xlsx — el png los
   mete en `condiciones` como texto. Se pierden si el formato no es tabla.

4. **El concepto llega en español o inglés** según el formato. Hay que
   resolverlo contra el catálogo en ambos idiomas.

5. **El txt plano falla** con «Could not process image» — n8n lo trata todo
   como imagen. Defecto del flujo, no de la app.

---

## 2. Varios montos por tipo de contenedor

**Ya resuelto en el modelo.** `PreciosTarifa` tiene los tres campos:

```ts
interface PreciosTarifa {
  monto: number;          // precio del 20'
  montoPor40?: number;    // precio del 40'
  montoPor40HC?: number;  // precio del 40' High Cube
  montoMinimo?: number;
  unidad: UnidadTarifa;
}
```

`resolverMonto(tarifa, contenedorTipo)` en `tarifaMatching.ts` elige el
correcto según el tipo de contenedor de la cotización. n8n ya devuelve los
tres valores en un solo renglón.

**Cómo encaja con `Presentacion`:** un renglón que trae los tres precios es
una tarifa con `presentacion: { tipo: 'cualquiera' }` *dentro de FCL*. La
llave empata con cualquier tipo de contenedor y `resolverMonto` elige el
precio. Si un tarifario trae un renglón POR tipo (solo 40'HC a un precio
distinto), ese lleva `presentacion: { tipo: 'contenedor', valor: '40hc' }` y
empata solo con ese.

**No hay cambio de modelo.** Los dos caminos ya coexisten.

---

## 3. Varios POL y POD en una tarifa

**Ya resuelto por n8n.** El extractor genera una línea por cada combinación
POL × POD. El correo de ONE tiene 6 POL × 2 POD = 12 líneas, y eso es
exactamente lo que devuelve.

Cada línea se guarda como una `TarifaVermur` independiente con su
`puertoOrigenId` y `puertoDestinoId`. La llave de búsqueda empata por ruta
exacta.

**Lo que sí falta: que los puertos chinos estén en el catálogo.** Hoy el
catálogo tiene 21 puertos mexicanos. Shenzhen, Ningbo, Shanghai, Qingdao,
Xiamen y Dalian NO están. `resolverPuerto` los deja como `sin_match` y la
tarifa queda con `puertoOrigenId: null` + `rutaTexto: "Shenzhen"`.

**Consecuencia:** esas tarifas no empatan por ruta hasta que se cataloguen
los puertos de origen. Es la salida correcta por §4 del plan anterior (no
empatar es mejor que empatar mal), pero hay que decirlo en la revisión:
«Puerto no catalogado — la tarifa se guarda pero no empata por ruta».

**Acción para Mau:** ampliar el catálogo de puertos con los de origen más
frecuentes (China, Corea, USA, etc.). Es dato de catálogo, no código. Puede
hacerse en cualquier momento y las tarifas que ya se cargaron empiezan a
empatar sin tocarlas.

---

## 4. Cargos condicionales por bill (AMS, Telex)

**Son tarifas propias, no parte del flete.** Razones:

1. **Se facturan por separado.** AMS y Telex Release son conceptos con su
   propia línea en la factura del proveedor.
2. **Aplican por BL, no por contenedor.** Un BL puede cubrir varios
   contenedores; el cargo es uno solo.
3. **No siempre aplican.** AMS es obligatorio para USA; Telex Release es
   opcional (si no hay original). Son condicionales.
4. **Tienen su propio concepto en el catálogo.** `CON-005` = «AMS at
   Destination», etc.

**Cómo se modelan:**

```
Tarifa AMS:
  conceptoId: 'CON-005'     ← AMS at Destination
  proveedorId: 'PRV-ONE'
  unidad: BL               ← por Bill of Lading
  monto: 30
  moneda: USD
  presentacion: { tipo: 'cualquiera' }
  modalidad: 'maritimo'
  puertoOrigenId: null      ← aplica a todas las rutas del proveedor
  puertoDestinoId: null
  condiciones: 'por bill'
```

**Relación con el flete:** no es estructural, es contextual. El flete y el
AMS se cargan por el mismo proveedor, para la misma cotización. La
comparativa los agrupa por proveedor y el total del paquete los suma. No
necesitan un campo que los vincule.

**Problema con el extractor (png).** El png los pone en `condiciones` como
texto y no los extrae como líneas. No se puede arreglar desde la app: es el
flujo de n8n. La solución es «Agregar línea» (tarea 02, ya hecha) para que
Pricing las meta a mano cuando el extractor se las salte. A mediano plazo,
mejorar el prompt de n8n para que extraiga cargos del pie de la tabla.

**Recomendación para n8n (no bloquea):** cuando el texto del documento
mencione cargos con monto y unidad («USD30/bill»), extraerlos como líneas
separadas con `concepto: "AMS"`, `unidad: "servicio"`, `condiciones: "por
bill"`. El xlsx ya lo hace; el png no.

---

## 5. Vigencia, free time y carrier

### Vigencia

**Ya funciona en el modelo.** `fechaInicio` / `fechaFin` + `vigenciaTexto`.
El correo de ONE solo dice «till July 31»; n8n lo interpreta como
`fechaFin: 2024-07-31` sin fecha de inicio.

**Lo que falta:**
- La fecha de inicio no viene en el correo. El wizard debe pedirla si n8n
  no la trae, o dejarla como «fecha del tarifario» por omisión.
- El año se asume (n8n pone 2024 porque no sabe). La pantalla de revisión
  lo deja editable → ya está.
- Mostrar la vencida junto a la vigente, marcada (§5 del plan anterior) →
  pendiente de código.

### Free time

**El campo `freeTimeDias` ya existe en `TarifaVermur`.** n8n lo devuelve
(21 en el png; confundido con tránsito en el xlsx — bug de n8n).

**Cómo se hereda a la cotización y al embarque (tarea 08):**

```
TarifaVermur.freeTimeDias
  ↓ al elegir la tarifa en la comparativa
CotizacionProveedor.freeTimeDias     ← ya existe
  ↓ al elegir el agente (proveedoresOficialIds)
Cotización.diasLibresDemora          ← campo NUEVO (tarea 08)
  ↓ al abrir embarque (cotizacionAEmbarque)
Embarque.diasLibresDemora            ← campo NUEVO (tarea 08)
  ↓ cálculo derivado (no guardado)
Fecha límite = ETA + diasLibresDemora
```

**Reglas:**
- Solo aplica a FCL marítimo (§4.7).
- Si la cotización tiene varios servicios, cada uno puede tener su free
  time (viene de la tarifa elegida de cada servicio).
- Si la tarifa no trae free time, el embarque lo dice: «la cotización no
  trae días libres de demora».
- Operaciones puede capturarlo en el embarque si falta.
- **No se confunde con días de crédito.** Etiquetas distintas:
  «Días libres de demora» vs. «Días de crédito». Son cosas completamente
  diferentes.

**Bug de n8n a reportar:** el xlsx pone el free time en `tiempoTransito` y
deja `freeTime` en 0. Es un error de mapeo en el flujo. El png lo hace
bien. No bloquea: la pantalla de revisión permite corregirlo, y el paso del
wizard (§8) puede advertir «¿el tránsito de 21 días viene del free time?»
cuando los valores crucen.

### Carrier (naviera / línea)

**No existe como campo en `TarifaVermur`.** El proveedor (`proveedorId`)
puede ser el agente de carga, no la naviera. En el correo de ONE, ONE es la
naviera, pero quien cotiza podría ser Sunway usando la tarifa de ONE.

**Propuesta:** campo opcional `carrier?: string` en `TarifaVermur`, texto
libre. No se indexa ni se busca — es informativo para la comparativa y el
PDF. Se llena desde la respuesta de n8n (ya viene `proveedor: "ONE"`).

Es un campo aditivo, opcional, sin impacto en la llave de búsqueda. Se
puede agregar en cualquier momento. **No bloquea nada.**

**Pregunta para Mau:** ¿el carrier debería ser un campo del catálogo de
proveedores (con id), o texto libre basta por ahora? Recomiendo texto libre
hasta que haya casos donde se necesite filtrar por carrier.

---

## 6. `impuestoCosto` — dónde vive y dónde se usa

### Dónde vive

```ts
// En TarifaVermur (campo nuevo, opcional)
impuestoCosto?: number | null;  // tasa decimal: 0.16 = 16%

// En documentosTarifario (valor por omisión del tarifario)
impuestoCosto?: number | null;
```

Se captura en el paso 1 del wizard como valor por omisión del tarifario, se
hereda por tarifa al confirmar. Valores comunes: `0.16` (nacional con IVA),
`0` (exento o internacional), `null` (no declarado).

### Dónde se usa (hoy: en ningún lado — solo se guarda)

La activación es incremental, sin romper lo existente:

| Uso | Dónde | Qué cambia | Cuándo |
|-----|-------|------------|--------|
| **Mostrar en el panel** | Panel de tarifas | El precio dice «USD 4,300 + IVA» o «USD 4,300 exento» | Con el paso 1 (los campos) |
| **OC con impuesto** | `lib/ordenCompra.ts` | `oc.montoConImpuesto = oc.monto × (1 + impuestoCosto)`. La OC propone el total con IVA y el acreditable separado | Plan 2b |
| **Cotejo de factura** | `lib/conciliacionFactura.ts` | Verifica `subtotal × (1 + tasa) ≈ total`. Avisa cuando no cuadra | Plan 2b |
| **Margen real** | `lib/margenRealConcepto.ts` | Distingue un excedente real de una factura con IVA que se lee mayor que el costo estimado | Plan 2b |

**Nada calcula con `impuestoCosto` hasta el plan 2b.** Se guarda, se
muestra, y se hereda. El único riesgo de meterlo es que alguien lo capture
mal y no se note hasta que se conecte — pero eso pasa igual si no se
captura: hoy el dato no existe.

---

## 7. El wizard — confirmación masiva

### El problema

Un tarifario de ONE tiene 14 líneas. Uno de un almacén puede tener 200. Ir
renglón por renglón pidiendo moneda, modalidad y presentación es inviable.

### La solución (ya aprobada, con detalle)

**Paso 1 — encabezado del tarifario (una vez):**

| Campo | Fuente | Editable |
|-------|--------|----------|
| Proveedor | elegido antes de subir | sí, pero ya viene |
| Moneda | n8n la infiere; Pricing la confirma **una vez** | sí |
| Modalidad | inferida de los conceptos/puertos; Pricing confirma | sí |
| Presentación por omisión | sugerida: `cualquiera` si la unidad es FIJO/BL/PEDIMENTO; vacía si es CONTENEDOR (falta el tipo) | sí |
| Impuesto del costo | `null` por omisión; Pricing captura si aplica | sí |
| Vigencia | de n8n o captura manual | sí |

**Regla de la moneda:** si n8n la infiere igual en todas las líneas, se
preselecciona. Si hay mezcla (ej. flete USD + AMS MXN), se pide una por
omisión y las excepciones se marcan por renglón.

**Regla de la presentación:** «20 (probable)» **NO se preselecciona** porque
falta confirmar el tipo de contenedor. «cualquiera» **SÍ se sugiere** cuando
la unidad es FIJO, BL o PEDIMENTO — un BL fee no cambia por el tipo de
contenedor.

**Paso 2 — la tabla con lo heredado:**

Cada renglón llega con moneda, modalidad y presentación del paso 1.
Columnas visibles:

| Concepto | POL | POD | Monto 20' | 40' | 40'HC | Moneda | Unidad | Presentación | Free time | Estado |
|----------|-----|-----|-----------|-----|-------|--------|--------|--------------|-----------|--------|

- «Estado» dice: ✓ Listo | ⚠ Revisar (con el motivo).
- La columna «Moneda» viene llena; cambiarla es marcar la excepción.
- La columna «Presentación» viene llena o dice «falta tipo de contenedor»
  si la unidad es CONTENEDOR y no se eligió en el paso 1.

**Paso 3 — confirmar en bloque:**

La pantalla separa:
- **«N renglones listos»** — concepto resuelto, moneda confirmada, todo ok.
- **«M necesitan atención»** — sin concepto (`sin_match`), moneda distinta
  a la del tarifario, presentación que no encaja, puerto no catalogado.

El botón dice **«Guardar los N listos»** y deja los otros pendientes.
Los pendientes se pueden editar en la misma sesión o en otra (ya tienen
`importacionId` en Firestore).

**Para un tarifario de 200 renglones:**
1. Paso 1: 5 campos, 10 segundos.
2. Paso 2: scroll rápido buscando los ⚠. Si todos son ✓, directo al 3.
3. Paso 3: un clic.
Total: ~30 segundos si n8n resolvió bien. 2-3 minutos si hay excepciones.

---

## 8. Los 22 tarifarios que hay que volver a subir

### Estado actual

De 30 tarifarios subidos, 22 no guardaron ninguna tarifa. Causas
diagnosticadas:

| Causa | Tarifarios | Estado |
|-------|-----------|--------|
| El proveedor se perdía antes de subir (bug del hash) | ~2-4 | **Arreglado** en tarea 01 |
| n8n no pudo procesarlos (formato no soportado, imagen borrosa) | ~10-12 | Necesitan resubida o cambio en n8n |
| Tarifas extraídas pero nunca confirmadas (abandonaron la revisión) | ~6-8 | Pendientes en `importacionesTarifas` |

### Lo que ya existe

- **«Reintentar»** en Evidencias: baja el archivo de Storage sin volver a
  subirlo y lo reenvía al extractor (`a16b17b`).
- **Aviso de duplicado** antes de subir: si el hash ya existe, pregunta en
  vez de crear un documento doble (`a16b17b`).
- **«Agregar línea»** en la revisión: para lo que n8n se saltó (tarea 02).
- **Estados de extracción**: `ok`, `sin_tarifas`, `fallo` con la razón.

### Lo que falta para que Pricing los recupere en una sesión

1. **Un filtro «Sin tarifas guardadas» en Evidencias.** Hoy los 22 están
   mezclados con los 8 buenos. Un toggle o pestaña que muestre solo
   `tarifasExtraidas === 0` o `estadoExtraccion !== 'ok'` los agrupa.

2. **El paso 1 del wizard (encabezado del tarifario) al reintentar.** Hoy
   «Reintentar» vuelve a extraer pero no pide modalidad ni moneda.
   Esos campos se capturan antes de mandar a n8n para que se hereden.

3. **Una vista de «pendientes de confirmar»** para los que sí extrajeron
   pero se abandonaron. `importacionesTarifas` con estado no-final,
   agrupados por tarifario, con un enlace «Continuar revisión».

4. **Nada más.** No hay que volver a subir los archivos (siguen en Storage),
   no hay que migrar nada, y los que fallaron por formato siguen siendo los
   mismos: o n8n mejora su procesamiento, o se capturan a mano.

### El protocolo para la sesión con Pricing

1. Abrir Evidencias → filtro «Sin tarifas guardadas».
2. Cada tarifario: Reintentar → confirmar encabezado → revisión → guardar.
3. Los que n8n no puede leer: «Agregar línea» manual o «captura directa».
4. Al final: pantalla de revisión de las 56 tarifas (§9).

Estimación: ~45 min con Pricing, si n8n resuelve la mayoría. Los que fallen
se anotan para mejorar el flujo.

---

## 9. La pantalla de revisión de las 56 tarifas existentes

### Qué es

Una pantalla única, accesible desde el panel de tarifas, que muestra las 56
tarifas agrupadas por tarifario. Para cada grupo:

- **Modalidad del tarifario** (un clic para confirmarla; la heredan todas).
- **Cada tarifa**: presentación sugerida con el motivo de la inferencia, un
  clic para confirmar o un selector para cambiar.
- Las ya confirmadas se marcan ✓ y no se vuelven a mostrar.

### Flujo

```
Panel de tarifas
  └── Aviso: «56 tarifas sin modalidad. Completar →»
        └── Pantalla de revisión (agrupada por tarifario)
              └── Clic: confirma modalidad del grupo
              └── Clic: confirma presentación por tarifa
              └── Guardar
```

### Inferencia

Para las 50 inferibles (de 56):

| Señal | Inferencia | Ejemplo |
|-------|------------|---------|
| Tiene `puertoOrigenId` + `puertoDestinoId` y unidad CONTENEDOR | marítimo, contenedor | Flete ONE |
| Unidad CBM o WM, puertos marítimos | marítimo LCL, suelto | — |
| Unidad VIAJE, `rutaTexto` con ciudades | terrestre | — |
| Concepto «Pedimento» o «Despacho aduanal» | despacho, cualquiera | — |
| Unidad FIJO, sin ruta | no se infiere | Se pide |

**«20 (probable)» NO se preselecciona.** Si la unidad es CONTENEDOR, la
presentación se deja vacía con el aviso «falta tipo de contenedor». El
operador elige: `20`, `40`, `40hc`, o `cualquiera` (si el precio cubre
todos y ya tiene `montoPor40` / `montoPor40HC`).

**«Cualquiera» SÍ se sugiere** cuando la unidad es BL, PEDIMENTO o FIJO.
Un BL fee no varía por tipo de contenedor.

### Quién y cuándo

La confirma quien tiene `tarifario.cargar` (Pricing y admin). Se hace en la
sesión con Pricing, antes de activar la llave de búsqueda.

### Qué se guarda

```ts
// En cada TarifaVermur confirmada:
modalidad: 'maritimo';                              // heredada del tarifario
presentacion: { tipo: 'contenedor', valor: '40hc' }; // o { tipo: 'cualquiera' }
modalidadConfirmadaPor?: string;   // uid
modalidadConfirmadaEn?: string;    // ISO timestamp
```

Los campos `*ConfirmadaPor/En` distinguen una confirmación humana de un dato
que venía de antes. **No se infiere al leer; se escribe al confirmar.**

---

## 10. La llave de búsqueda completa

Hoy la única llave real es `conceptoId`. La búsqueda propuesta:

```
modalidad + presentación + puertoOrigenId + puertoDestinoId + conceptoId + vigencia
```

### Reglas de empate

| Campo | Cómo empata |
|-------|-------------|
| `modalidad` | exacto. Sin modalidad → no empata (tarifa incompleta) |
| `presentacion` | exacto, O `{ tipo: 'cualquiera' }` empata con todo. Sin dato → no empata |
| `puertoOrigenId` | exacto. `null` en la tarifa → empata con cualquier origen (cargo sin ruta, como AMS) |
| `puertoDestinoId` | ídem |
| `conceptoId` | exacto (ya funciona) |
| vigencia | dentro de rango (ya funciona) |

**Si nada empata, el costo queda vacío y lo dice.** Nunca trae «la más
parecida». Un falso positivo trae el precio equivocado; un vacío se nota.

### Ejemplo con ONE

Cotización marítima FCL 40'HC, Shenzhen → Manzanillo, concepto «Flete
marítimo»:

```
Llave: maritimo + contenedor:40hc + PTO-shenzhen + PTO-manzanillo + CON-037 + 2026-09-28
```

Empata con la tarifa ONE que tiene:
- `modalidad: 'maritimo'` ✓
- `presentacion: { tipo: 'cualquiera' }` ✓ (empata con cualquier contenedor)
- `puertoOrigenId: PTO-shenzhen` ✓
- `puertoDestinoId: PTO-manzanillo` ✓
- `conceptoId: CON-037` ✓
- vigencia: dentro de rango ✓

Y `resolverMonto(tarifa, '40hc')` devuelve `montoPor40HC` = 4400.

El AMS empata por separado:
- `modalidad: 'maritimo'` ✓
- `presentacion: { tipo: 'cualquiera' }` ✓
- `puertoOrigenId: null` ✓ (sin ruta = aplica a cualquiera)
- `conceptoId: CON-005` ✓
- vigencia ✓

---

## 11. Pasos publicables

Cada paso se publica solo, se revierte solo, y tiene su punto de regreso.

| # | Qué | Estimación | Riesgo | Punto de regreso |
|---|-----|-----------|--------|------------------|
| **P1** | **Los campos.** `modalidad?`, `presentacion?`, `impuestoCosto?`, `carrier?` en `TarifaVermur`. `modalidad`, `moneda`, `presentacion`, `impuestoCosto` en `documentosTarifario`. Tipos y validación en `lib/`. Tests. Nadie los lee todavía | 1 día | Ninguno: son tipos opcionales | Revert del commit |
| **P2** | **La llave de búsqueda.** `lib/llaveTarifa.ts`, función pura con tests. Empate por modalidad + presentación + ruta + concepto + vigencia. Sin conectar a la UI | ½ día | Ninguno | Revert |
| **P3** | **Pantalla de revisión de las 56.** Agrupada por tarifario. Confirma modalidad de un clic, presentación por tarifa. Escribe los campos de P1 | 2 días | Bajo: solo escribe en tarifas que se confirmen | Revert |
| **P4** | **Sesión con Pricing.** Completar las 56 + los 22 tarifarios pendientes. Filtro «sin tarifas» en Evidencias, «continuar revisión» para los abandonados | ½ día (con Pricing) | Humano: Pricing confirma, no el código | — |
| **P5** | **El panel usa la llave.** Reemplaza `buscarTarifasVigentes(…, { conceptoId })` por la llave completa. Las incompletas se marcan «sin modalidad» en vez de empatar con todo. **Aquí cambia lo que ve Pricing** | 1 día | Medio: tarifas que antes aparecían dejan de empatar — que es el arreglo | Revert |
| **P6** | **El wizard con encabezado.** Paso 1 (moneda/modalidad/presentación una vez), herencia a la tabla, confirmar en bloque | 2 días | Medio | Revert |
| **P7** | **Vigencia visible.** Mostrar la vencida junto a la vigente, marcada | ½ día | Bajo | Revert |
| **P8** | **Free time → demoras (tarea 08).** Herencia desde la tarifa a la cotización al embarque. Cálculo de fecha límite | 1 día | Bajo | Revert |
| **P9** | **Puntos terrestres con id** | Bloqueado: espera la lista de Vermur | — | — |

### Orden recomendado

**Bloque A (antes de Pricing):** P1 → P2 → P3.
Deja los campos, la llave y la pantalla de revisión listas para la sesión.

**Bloque B (con Pricing):** P4.
Sesión de ~45 min para completar las 56 + los 22.

**Bloque C (después de Pricing):** P5 → P6 → P7.
La llave se activa, el wizard mejora, la vigencia se ve.

**Independiente:** P8 (free time → demoras) puede ir en paralelo con
cualquier bloque.

**El P5 es el que resuelve el bug del AMS** (la aérea que aparecía en una
marítima). No necesita el P6. Si hay prisa: P1 → P2 → P3 → P4 → P5.

---

## 12. Lo que no cambia

- El modelo de `PreciosTarifa` con los tres montos por contenedor.
- La vigencia dual (`vigenciaTexto` + `fechaInicio`/`fechaFin`).
- La regla de «sin `conceptoId` ni `proveedorId` no se guarda».
- La comparativa por paquetes de agente.
- El tipo de cambio (es del plan PLAN-TC, no de este).
- `CotizacionProveedor.freeTimeDias` (ya existe; este plan agrega la
  herencia hacia el embarque).

---

## Preguntas

### Para Mau

1. **Carrier como texto libre o con id.** ¿Basta texto libre por ahora?
   *Recomiendo texto libre: no hay caso de búsqueda por carrier todavía.*

2. **Puertos de origen.** Los 6 puertos chinos de ONE no están en el
   catálogo. ¿Los agrego como tarea de datos, o espero a que Vermur mande
   su lista completa? *Recomiendo: agregar los más frecuentes ya, y
   ampliar cuando llegue la lista.*

3. **El txt que falla en n8n.** ¿Lo anoto como mejora del flujo, o lo
   priorizo? *Recomiendo: mejora del flujo, no urgente. La vía correcta
   para correos es el xlsx o la captura.*

### Para Vermur

1. **Los puertos de origen más frecuentes.** Para que las tarifas de
   proveedores internacionales empaten por ruta, necesitamos los puertos de
   origen que usan. ¿Pueden mandarnos la lista de los que operan?

2. **El free time siempre es de demora (contenedor), o también hay de
   almacenaje?** El correo de ONE dice «Free time 21 days» — ¿eso aplica
   solo al contenedor en puerto, o también al almacén?
