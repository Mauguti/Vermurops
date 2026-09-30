# PLAN: una sola fuente de verdad para la tarifa elegida

> Fecha: 29-sep-2026
> Tarea: sprint/COLA.md #17
> Estado: propuesta para Mau

---

## 1. El problema

Dos campos deciden cuál tarifa está elegida en un concepto de la cotización:

| Campo | Dónde vive | Quién lo lee | Qué decide |
|---|---|---|---|
| `concepto.proveedoresOficialIds` | `ConceptoCotizacion` (array de IDs) | `getOficialIds` → `getTarifasOficiales` → `getCostoOficial` → `costoDeConcepto` → candado, tabla, Kanban, total, embarque | **El costo**, el proveedor y el candado |
| `tarifa.seleccionada` | cada `CotizacionProveedor` (booleano) | `ComparativaPricing.tsx` (checkbox), `aplanarCotizacion` ruta B, `calcularTotalConsolidado` ruta B | **La marca visual** en la comparativa vieja |

`proveedoresOficialIds` gobierna todo lo que importa: costo, proveedor
oficial, candado, total consolidado (ruta A), mapeo al embarque. `seleccionada`
gobierna la marca visual del checkbox de la comparativa y la ruta B (flat, de
`BandejaPricing`).

Cuando los dos no coinciden, la comparativa dice un proveedor y la tabla otro.
Es lo que pasó en COT-2026-0034: «comparativa 60, tabla 20».

---

## 2. Los caminos de escritura hoy

### Caminos que escriben LOS DOS (sincronizados)

| # | Función | Archivo | Líneas |
|---|---|---|---|
| W1 | `elegirAgente()` | `lib/matrizComparativa.ts` | 514–535 |
| W2 | `elegirCelda()` | `lib/seleccionMatriz.ts` | 47–93 |
| W3 | `elegirColumna()` | `lib/seleccionMatriz.ts` | 105–133 |
| W4 | `capturarTarifaManual()` | `lib/tarifaManual.ts` | 64–119 |
| W5 | `handleTarifasChange()` | `ConceptoSection.tsx` | 112–129 |

W1–W4 son funciones puras en `lib/` y escriben ambos campos en la misma
operación inmutable. W5 lee `seleccionada` de los items que recibe del
componente `ComparativaPricing` y extrae los IDs para `proveedoresOficialIds`.
Funciona porque ambos vienen del mismo toggle, pero la sincronización es
indirecta (depende de que el componente haya tocado `seleccionada` antes).

### Caminos que escriben SOLO UNO (fuente de desincronización)

| # | Código | Archivo | Líneas | Qué escribe | Qué NO escribe | Riesgo |
|---|---|---|---|---|---|---|
| W6 | `applyTarifaToConcepto` | `FichaCotizacion.tsx` | 506–523 | `proveedoresOficialIds: [cpId]` solo si `esPrimera`; `seleccionada: esPrimera` en la nueva | No desmarca `seleccionada` de las existentes | ALTO: la segunda tarifa queda con la primera aún `seleccionada: true` |
| W7 | `handlePanelAplicarSimulacion` | `FichaCotizacion.tsx` | 532–581 | Ambos, pero solo si `esPrimeraYUnica` | Si hay >1 tarifa nueva o ya hay existentes: ninguno | MEDIO: con varias simuladas la selección no cambia |
| W8 | Inline tarifa (sugerencia) | `ConceptoSection.tsx` | 230–252 | `proveedoresOficialIds: [cpId]` si `esPrimera`; `seleccionada: esPrimera` en la nueva | No desmarca existentes | ALTO: idéntico a W6 |
| W9 | `CapturaManualConcepto` callback | `ConceptoSection.tsx` | 257–258 | Solo `tarifas` (agrega la nueva) | Nunca toca `proveedoresOficialIds` | CRITICO: la tarifa nueva no se refleja en el costo |

**W9 es el peor caso:** `onUpdate({ ...concepto, tarifas: [..., cp] })` agrega
la tarifa sin tocar `proveedoresOficialIds`. Si antes no había tarifas
oficiales, el costo sigue en cero y la tarifa nueva no aparece como elegida.
Si había una oficial, la nueva no la reemplaza.

### El patrón del bug

Todos los caminos que fallan comparten la misma forma:

```ts
onUpdate({
  ...concepto,
  tarifas: [...existentes, nueva],
  ...(esPrimera ? { proveedoresOficialIds: [nueva.id] } : {}),
});
```

El `esPrimera` maneja bien el caso trivial (concepto vacío + una tarifa), pero
falla cuando:
- Ya hay tarifas existentes con `seleccionada: true` → no se desmarcan
- Hay varias tarifas nuevas → solo la primera se marca
- El concepto ya tenía un oficial → no se reemplaza

`capturarTarifaManual` (W4) lo resuelve correctamente: desmarca todas las
existentes y marca solo la nueva, en la misma operación.

---

## 3. Los caminos de lectura hoy

### Lectores de `proveedoresOficialIds`

| Función | Archivo | Qué hace |
|---|---|---|
| `getOficialIds()` | `QuotesData.ts:670` | Punto de entrada. Fallback a `proveedorOficialId` legacy |
| `getTarifasOficiales()` | `QuotesData.ts:679` | Filtra `tarifas[]` por IDs oficiales |
| `getCostoOficial()` | `QuotesData.ts:689` | Suma los montos de las oficiales (**sin mirar moneda**) |
| `costoDeConcepto()` | `QuotesData.ts:709` | Punto único: oficiales + subconceptos, fallback a `costo` manual |
| `calcularTotalConsolidado()` ruta A | `QuotesData.ts:740` | Total del Kanban y la ficha |
| `lineaDesdeConcepto()` | `lineasCotizacion.ts:169` | Tabla plana: costo, proveedor, candado, moneda |
| `derivarSeleccion()` | `seleccionMatriz.ts:150` | Marcas visuales de la comparativa por servicio |
| `resumenSeleccion()` | `seleccionMatriz.ts:241` | Resumen del pie de la comparativa |
| `nombreProveedorDeConcepto()` | `lineasCotizacion.ts:148` | Nombre del proveedor en la tabla |
| `clasificarBandeja()` | `clasificarBandeja.ts:33` | Progreso de la bandeja de Pricing |
| `cotizacionAEmbarque` | `cotizacionAEmbarque.ts:145` | Mapeo al embarque — el costo del cargo |
| `tarifaCapturadaAqui()` | `tarifaManual.ts:122` | Texto del candado manual |
| Audit script | `auditarCotizacionesVivas.ts:97` | Detección de la desincronización |

### Lectores de `seleccionada`

| Función | Archivo | Qué hace |
|---|---|---|
| `ComparativaPricing.tsx` | checkbox | El check visual del toggle |
| `calcularTotalConsolidado()` ruta B | `QuotesData.ts:733` | Total cuando el costo viene de `cotizacionesProveedor` flat |
| `lineaDesdeServicio()` | `lineasCotizacion.ts:253` | Línea plana de la ruta B |
| Audit script | `auditarCotizacionesVivas.ts:99` | Comparación contra `proveedoresOficialIds` |

**Hallazgo clave:** la ruta B (`cotizacionesProveedor` a nivel servicio, de
`BandejaPricing`) lee SOLO `seleccionada` y NUNCA `proveedoresOficialIds`,
porque la selección es a nivel servicio, no a nivel concepto. Es un sistema
separado. No tiene el bug de la dualidad porque no tiene `proveedoresOficialIds`.

---

## 4. La propuesta: `proveedoresOficialIds` es la fuente de verdad

### Por qué `proveedoresOficialIds` y no `seleccionada`

1. **Ya es la fuente para todo lo que importa.** Costo, proveedor, candado,
   total, embarque, facturas — todo pasa por `getOficialIds()`.

2. **`seleccionada` es redundante en la ruta A.** `derivarSeleccion()` ya
   reconstruye el estado visual desde `proveedoresOficialIds`. La comparativa
   por servicio (W2, W3) no usa `seleccionada` para pintar.

3. **El nombre del campo es más claro.** «IDs de tarifas oficiales» dice
   exactamente qué es; `seleccionada: true` en una de cinco tarifas no
   dice cuál es la oficial si otra también lo está.

4. **La ruta B no se toca.** `cotizacionesProveedor[].seleccionada` a nivel
   servicio es un sistema aparte. No tiene `proveedoresOficialIds` y no lo
   necesita: su selección es «cuál de los proveedores cotiza todo el
   servicio», no «cuáles tarifas suman al costo del concepto». La
   unificación de la dualidad (§6b de CLAUDE.md) la resolverá; este plan
   no la adelanta.

### Qué cambia

**`seleccionada` pasa a ser un campo DERIVADO, no una fuente.**

- Se sigue escribiendo (para no romper código que lo lea), pero siempre
  coherente con `proveedoresOficialIds`: `seleccionada = ids.includes(t.id)`.
- Si un lector necesita saber si una tarifa está elegida, puede leer
  `seleccionada` O puede preguntar a `getOficialIds()`. Ambos dicen lo mismo.
- Si algún día se deja de escribir `seleccionada`, nada se rompe: todo
  lo que importa ya lee de `proveedoresOficialIds`.

---

## 5. Paso 1 — `marcarElegidas()`: la función única de selección

### La regla

Toda escritura que cambie qué tarifas están elegidas pasa por una sola función:

```ts
// lib/seleccionTarifa.ts (nombre propuesto)

/**
 * Marca las tarifas indicadas como elegidas.
 * Escribe proveedoresOficialIds Y seleccionada en la misma operación.
 *
 * ids vacío = deseleccionar todo (decisión válida).
 */
export function marcarElegidas(
  concepto: ConceptoCotizacion,
  ids: string[],
): ConceptoCotizacion {
  return {
    ...concepto,
    proveedoresOficialIds: ids,
    tarifas: (concepto.tarifas ?? []).map(t => ({
      ...t,
      seleccionada: ids.includes(t.id),
    })),
  };
}
```

### Quién la llama

| Camino actual | Cambio |
|---|---|
| W1 `elegirAgente` | Reemplazar las líneas 526–530 por `marcarElegidas(c, [suya.id])` |
| W2 `elegirCelda` | Reemplazar las líneas 76–86 por `marcarElegidas(c, yaElegida ? [] : [suya.id])` |
| W3 `elegirColumna` | Reemplazar las líneas 123–127 por `marcarElegidas(c, [suya.id])` |
| W4 `capturarTarifaManual` | Llamar a `marcarElegidas` DESPUÉS de agregar la tarifa nueva al array |
| W5 `handleTarifasChange` | Llamar a `marcarElegidas(concepto, seleccionadaIds)` en vez de escribir los dos campos a mano |
| W6 `applyTarifaToConcepto` | Agregar la tarifa al array, luego `marcarElegidas(updated, [cpId])` |
| W7 `handlePanelAplicarSimulacion` | Agregar las tarifas, luego `marcarElegidas(updated, [newCps[0].id])` si `esPrimeraYUnica` |
| W8 Inline tarifa | Agregar la tarifa, luego `marcarElegidas(updated, [cpId])` si `esPrimera` |
| W9 `CapturaManualConcepto` | **FIX**: agregar la tarifa, luego `marcarElegidas` para elegirla |

### Qué resuelve

- **W6, W8:** Las existentes con `seleccionada: true` se desmarcan
  automáticamente porque `marcarElegidas` recorre todas.
- **W9:** El caso crítico. La tarifa nueva pasa a ser oficial, el costo se
  actualiza y el candado aparece.
- **Futuro:** Cualquier camino nuevo que se escriba tiene que pasar por aquí.
  Si no lo hace, no compila (se puede enforcer con un lint rule o con la
  convención documentada).

### Lo que NO cambia

- El tipo `ConceptoCotizacion` sigue igual: `proveedoresOficialIds` y
  `seleccionada` siguen existiendo. No hay migración.
- Los documentos en Firestore no se tocan.
- La ruta B (`cotizacionesProveedor[]`) no se toca.
- Los readers no cambian: `getOficialIds()`, `getTarifasOficiales()`, etc.
  siguen funcionando exactamente igual.

### Verificación

- Los tests de `seleccionMatriz.test.ts`, `matrizComparativa.test.ts` y
  `tarifaManual.test.ts` deben pasar sin cambios (la semántica no cambia).
- Test nuevo: `marcarElegidas` con concepto con 3 tarifas, marca la segunda →
  solo la segunda tiene `seleccionada: true` y `proveedoresOficialIds = [id2]`.
- Test nuevo: `marcarElegidas` con ids vacío → todo desmarcado.
- El audit script `auditarCotizacionesVivas.ts` debe dar 0 hallazgos de
  desincronización en las cotizaciones que se guarden después de este cambio.

### Estimación

**2–3 horas.** Es mecánico: una función nueva, 9 call sites que la usan, y
tests. El riesgo es bajo porque la semántica no cambia — los caminos que ya
estaban sincronizados siguen igual, y los que no lo estaban pasan a estarlo.

### Punto de regreso

`git revert` del commit. Ningún cambio de modelo, ninguna migración.

---

## 6. Paso 2 — Las cotizaciones hoy desincronizadas

### Diagnóstico actual

`scripts/auditarCotizacionesVivas.ts` ya detecta la desincronización:
compara `getOficialIds(c)` contra `tarifas.filter(t => t.seleccionada)`.
No se ha corrido con llave contra producción (al 29-sep-2026).

### Qué hacer con ellas (sin migración masiva)

**Regla: `proveedoresOficialIds` manda.** Ya es así hoy — el costo, el
proveedor del candado y el mapeo al embarque se calculan desde ahí. Si
`seleccionada` dice otra cosa, el dato visual estaba mal pero el dinero
estaba bien.

**Al abrir una cotización desincronizada, reconciliar en silencio:**

```ts
// En el hook que carga la cotización (useCotizacion o equivalente)
// DESPUÉS de leer de Firestore, ANTES de pintar:

for (const srv of quote.servicios ?? []) {
  for (const c of srv.conceptos ?? []) {
    const ids = new Set(getOficialIds(c));
    const necesitaFix = (c.tarifas ?? []).some(
      t => t.seleccionada !== ids.has(t.id)
    );
    if (necesitaFix) {
      c.tarifas = (c.tarifas ?? []).map(t => ({
        ...t, seleccionada: ids.has(t.id),
      }));
      // El autoguardado persiste el fix. No se necesita acción del usuario.
    }
  }
}
```

**Ventajas:**
- Sin migración masiva, sin script con llave de servicio.
- Se corrige al tocar, no en batch.
- Si nadie vuelve a abrir una cotización desincronizada, no pasa nada — su
  costo ya estaba bien porque lee de `proveedoresOficialIds`.

**Indicador para Mau:** antes de publicar el paso 2, correr el audit script
para saber cuántas cotizaciones vivas están desincronizadas. Si son pocas
(< 10), la reconciliación silenciosa basta. Si fueran muchas, la alternativa
es un script de migración de solo escritura que Mau corre con llave.

### Estimación

**1 hora** (la reconciliación es un bloque en el hook de carga + un test).

### Punto de regreso

Quitar el bloque de reconciliación. Los documentos que ya se reconciliaron
quedan bien; los que no, vuelven a su estado anterior sin consecuencia (el
costo no cambió).

---

## 7. Paso 3 — El candado dice de dónde viene el valor

### Hoy

El candado (Lock icon) aparece cuando `costoDerivado === true`
(`lineasCotizacion.ts:244`), que se calcula como `oficiales.length > 0 ||
costoSubs > 0`. El tooltip dice:

- Si viene de tarifas: «Viene de N tarifa(s) elegida(s). Para cambiarlo,
  cambia las tarifas.»
- Si es tarifa manual (`capturadaEnCotizacion`): «Viene de la tarifa que
  capturaste aquí. Ábrela para cambiar el costo, el proveedor o la moneda.»

### Lo que falta

Cuando el costo es el fallback manual (`concepto.costo > 0` sin tarifas ni
subconceptos), no hay candado y no hay indicación de dónde viene. Y cuando
está en cero sin `costoCapturado`, no se sabe si es un olvido o una decisión.

**Propuesta:**

| Caso | Indicador visual | Tooltip |
|---|---|---|
| Tarifas oficiales | Candado cerrado | «Viene de N tarifa(s) elegida(s)…» (hoy) |
| Tarifa manual | Candado cerrado | «Viene de la tarifa que capturaste…» (hoy) |
| Solo subconceptos | Candado cerrado | «Viene de N subconcepto(s).» |
| `costo` manual > 0 sin tarifas | Sin candado, texto normal | Sin cambio (el campo es editable) |
| `costo` = 0, `costoCapturado = true` | Texto «$0.00» normal | «Costo en cero declarado.» |
| `costo` = 0, sin `costoCapturado` | Texto gris «—» | «Sin costo. Elige un proveedor o captura el costo.» |

**No es cambio de modelo.** Es solo lógica de presentación en `TablaConceptos.tsx`.

### Estimación

**1 hora.** Es UI pura con los datos que ya existen.

### Punto de regreso

Revertir los cambios de tooltip. No toca datos.

---

## 8. Paso 4 — `getCostoOficial` sumando monedas distintas

### El bug

```ts
// QuotesData.ts:692-694
return (concepto.tarifas ?? [])
  .filter(t => ids.includes(t.id))
  .reduce((acc, t) => acc + t.monto, 0);  // ← no mira t.moneda
```

Un concepto con dos tarifas oficiales — una de 1,000 USD y otra de 5,000 MXN —
da «6,000» sin moneda. El total es creíble y es basura (§4.3).

### Por qué no se ha corregido

Cambiaría el costo y el margen de cotizaciones vivas. Sin medir cuántas están
en ese caso, el riesgo de «arreglar» es mayor que el de «dejar».

### La propuesta

**Fase A: medir.** Correr `auditarCotizacionesVivas.ts` con llave (Mau).
El script ya tiene el detector de costos sin moneda, pero no el de
multi-moneda en tarifas oficiales. Agregar un caso:

```ts
function esMultiMoneda(c: ConceptoCotizacion): boolean {
  const oficiales = getTarifasOficiales(c);
  if (oficiales.length < 2) return false;
  return new Set(oficiales.map(t => t.moneda)).size > 1;
}
```

**Fase B: advertir sin romper.** `getCostoOficial` sigue sumando (para no
cambiar totales), pero una nueva función `getCostoOficialPorMoneda` devuelve
`Record<'USD' | 'MXN', number>`. `lineaDesdeConcepto` la usa para emitir una
advertencia `monedas_mezcladas` en la línea plana (como ya hace
`cotizacionAEmbarque`). La tabla pinta el candado en ámbar y el tooltip dice
«Costo mezclado: USD X + MXN Y. Revisa las tarifas.»

**Fase C: resolver.** Con el PLAN-TC implementado (tipo de cambio congelado),
`getCostoOficial` puede convertir a una sola moneda usando el TC de la
cotización. Hasta entonces, la advertencia es suficiente.

### Relación con PLAN-A (monedas costo-venta)

PLAN-A propone `monedaCosto` y `monedaVenta` por línea, y el cálculo de
profit/margen entre monedas. Este paso 4 es un subconjunto: el costo de
las tarifas oficiales. PLAN-A lo subsume, pero este paso se puede publicar
antes porque no necesita el TC congelado para la advertencia.

### Estimación

- Fase A: 30 minutos (agregar caso al audit script).
- Fase B: 2 horas (nueva función + advertencia visual).
- Fase C: depende de PLAN-TC.

### Punto de regreso

Fase A: borrar el caso del script. Fase B: `git revert`, los totales no
cambiaron.

---

## 9. Paso 5 — Costos manuales rotulados USD

### El bug

```ts
// lineasCotizacion.ts:214-216
if (costos.length === 0 && costo > 0) {
  costos.push({
    ...
    moneda: 'USD',    // ← asume USD cuando no hay tarifas
  });
}
```

Y en la línea 243:
```ts
moneda: oficiales[0]?.moneda ?? 'USD',  // ← fallback a USD
```

Un concepto con costo manual de 5,000 MXN aparece como 5,000 USD.

### Relación con la fuente de verdad

Este bug NO depende de la dualidad de campos. Existe porque
`ConceptoCotizacion` no tiene campo `moneda` propio — la moneda se hereda
de la primera tarifa oficial, y sin tarifas se cae a USD.

### La propuesta

**No agregar campo `moneda` al concepto todavía** — el PLAN-TC lo aborda
como parte de `monedaCosto` y `monedaVenta`. Lo que sí se puede hacer ya:

1. Cambiar el fallback de `'USD'` a `null` en la línea plana.
2. La tabla muestra «—» en vez de «USD» cuando la moneda es null.
3. Un concepto sin moneda declarada no se incluye en los totales por moneda
   (no contamina ni USD ni MXN).

**Alternativa más agresiva (depende de PLAN-TC):** `capturarTarifaManual`
ya exige la moneda. Extender esa exigencia a todo costo manual: si alguien
teclea un costo, tiene que elegir la moneda. Es la ruta correcta pero
requiere que la tabla tenga un selector de moneda por línea.

### Estimación

Opción conservadora (fallback a null): 1 hora.
Con selector de moneda: 3 horas (depende de PLAN-TC).

---

## 10. Resumen de pasos publicables

| Paso | Qué | Depende de | Estimación | Riesgo | Regresable |
|---|---|---|---|---|---|
| 1 | `marcarElegidas()` + arreglar 9 call sites | Nada | 2–3 h | Bajo | `git revert` |
| 2 | Reconciliación silenciosa al abrir | Paso 1 | 1 h | Bajo | Quitar bloque |
| 3 | Candado con tooltip mejorado | Nada (independiente) | 1 h | Nulo | `git revert` |
| 4A | Agregar multi-moneda al audit script | Nada | 30 min | Nulo | Borrar caso |
| 4B | Advertencia de monedas mezcladas | 4A corrido | 2 h | Bajo | `git revert` |
| 4C | Resolver con TC congelado | PLAN-TC | TBD | Medio | — |
| 5 | Fallback de moneda a null | Nada | 1 h | Bajo | `git revert` |

**Orden recomendado:** 1 → 2 → 3 → 4A → 5 → 4B → (PLAN-TC) → 4C.

Los pasos 1–3 y 5 son independientes del PLAN-TC y se pueden publicar en un
solo bloque. 4A es el diagnóstico que debe correr Mau antes de 4B.

---

## 11. Lo que este plan NO resuelve (y dónde vive)

| Problema | Dónde se resuelve |
|---|---|
| Unificar la dualidad `cotizacionesProveedor` / `concepto.tarifas` (§6b) | Trabajo aparte, estimado 2–3 días |
| `monedaCosto` y `monedaVenta` por línea | PLAN-TC + PLAN-A |
| `proveedorOficialId` (singular, deprecated) | Se puede borrar después del paso 1 si no hay documentos legacy que lo usen exclusivamente. El audit script lo mide. |
| Los agentes sin precio que no se persisten | Campo `agentesComparativa` en la cotización (30 min, documentado en §6) |
| `getCostoOficial` sumando sin moneda con resolución real | Paso 4C, requiere TC congelado |

---

## 12. Preguntas para Mau

1. **¿Corremos el audit script contra producción?** Es el paso previo a todo
   lo demás: mide cuántas cotizaciones vivas tienen la desincronización y
   cuántas mezclan monedas. Sin eso, los pasos 2 y 4B son a ciegas.
   *Recomendación: sí, antes de publicar nada.*

2. **¿La reconciliación silenciosa del paso 2 es aceptable?** La alternativa
   es avisar al usuario («esta cotización tenía datos inconsistentes, se
   corrigió»), pero Pricing no sabe qué significa eso y solo genera ruido.
   *Recomendación: silenciosa, con un log en consola para diagnóstico.*

3. **¿El paso 5 (fallback a null en vez de USD) puede publicarse antes de
   tener el selector de moneda?** Significa que los costos manuales sin
   moneda se verán como «—» en la tabla en vez de «USD». Es más honesto,
   pero puede confundir si Pricing espera ver una moneda.
   *Recomendación: publicar con el selector de moneda del PLAN-TC, no antes.
   Mientras tanto, dejar el fallback USD con la advertencia del audit script.*

4. **W9 (`CapturaManualConcepto`): ¿es un bug que ya esté en producción?**
   El callback de línea 257–258 de `ConceptoSection.tsx` agrega la tarifa sin
   marcarla oficial. Si alguien lo usa, la tarifa no se refleja en el costo.
   *Recomendación: corregirlo en el paso 1. Es un fix, no un cambio de
   comportamiento.*
