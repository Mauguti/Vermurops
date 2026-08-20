# VermurOps — Estado de Tarifas/Pricing (Pausa documentada)

> Última actualización: 20 agosto 2026
> Estado: **EN PAUSA** — Sprints FC, CC, SP cerrados. E10 pendiente de sesión de diseño con Mau.

---

## Épicas completadas

| Épica | Descripción | Commits | Validado |
|-------|-------------|---------|----------|
| E1–E3 | Calculadora de cotización, líneas, conceptos, folio atómico | `a6207f9` y anteriores | Sí |
| E4 | Campos condicionales FCL/LCL/terrestre | `4dce4ad` | Sí |
| E5 | Máquina de estados (stateMachine.ts + 34 tests + cableado UI) | `946c8c1`–`93477be` | Sí |
| E6 | Entidad Cliente + crédito/contrato/pagaré + Firestore | `f43e80d`–`d69a5ff` | Sí |
| E7 | Validadores RFC/CLABE (68 tests) + cableado en UI | `0948784`, `74200c8` | Sí |
| E8 | Migración 70 clientes reales | — | **BLOQUEADA** (falta `seed_clientes.json` de Luis) |
| E9 | Proveedores en Firestore (modelo, hook, CRUD, alta rápida) | `56134d3`–`99c86a9` | Sí |

---

## Sprint FC — Ficha de Cotización + Drag & Drop (cerrado 18 ago 2026)

| Paso | Descripción | Archivos clave |
|------|-------------|----------------|
| **FC-1** | FichaCotizacion a pantalla completa + extracción de componentes | `ConceptoSection.tsx`, `ServicioSection.tsx`, `FormProveedorFicha.tsx` (muerto) |
| **FC-2** | Panel lateral de tarifas por concepto activo (dos columnas en tab Servicios) | `TarifaPanel.tsx`, `tarifaMatching.ts` |
| **FC-3** | Drag and drop con @dnd-kit (drag desde panel, drop en concepto) | `DraggableTarifaCard` en TarifaPanel, `useDroppable` en ConceptoSection |

**Decisiones implementadas:**
- D1: Pantalla completa con early-return en BandejaPricing, KanbanCotizaciones, Quotes
- D2: Comparativa expande a ancho completo (panel se oculta), controlado por `comparativaCount`
- D3: Mobile (<768px) oculta panel lateral, mantiene TarifaSuggestions inline
- D4: `applyTarifaToConcepto()` compartida entre botón "Usar" y drag & drop

**Lógica de matching extraída:** `tarifaMatching.ts` contiene funciones puras reutilizables:
`normalize`, `resolverMonto`, `fmtPrecio`, `etiquetaContenedor`, `matchConceptByName`,
`buildTarifaRuta`, `groupManobrasByTerminal`. TarifaSuggestions re-exporta para backward compat.

---

## Sprint CC — Dropdown de conceptos del catálogo (cerrado 20 ago 2026)

| Paso | Descripción | Archivos clave |
|------|-------------|----------------|
| **CC-1** | `conceptoId` en ConceptoCotizacion + `matchConcept()` ID-first O(1) con fallback a nombre | `QuotesData.ts`, `tarifaMatching.ts`, `TarifaPanel.tsx`, `TarifaSuggestions.tsx` |
| **CC-2** | ConceptoSelector: dropdown con buscador, agrupado por categoría, badges Impo/Expo, readOnly para ventas | `ConceptoSelector.tsx`, `ConceptoSection.tsx`, `ServicioSection.tsx` |
| **CC-3** | _(pendiente)_ Alta rápida de concepto modal | — |
| **CC-4** | _(pendiente)_ "Agregar concepto" abre selector en vez de crear vacío | — |

**Decisiones implementadas:**
- `conceptoId` es opcional (backward compat con conceptos legacy de texto libre)
- Matching: ID primero (O(1) Map), fallback a nombre (includes bidireccional)
- 23 tests en `tarifaMatching.test.ts` (normalize, matchConceptByName, buildConceptoMap, matchConcept)
- Mensajes contextuales en TarifaPanel: "no está en el catálogo" (amber) vs "sin tarifas vigentes" (gris)

---

## Fix: Proveedor oficial al usar/arrastrar tarifa (20 ago 2026)

**Bug:** "Proveedor Oficial: Por definir en Bandeja Pricing" persistía tras asignar tarifa.
**Causa:** `applyTarifaToConcepto` y `onUsarTarifa` inline creaban CotizacionProveedor con
`seleccionada: false` y nunca escribían `proveedoresOficialIds`.
**Fix:** Primera/única tarifa → auto-oficial (`seleccionada: true` + `proveedoresOficialIds: [cpId]`).
Múltiples → candidata. Label cambiado a "Sin proveedor asignado".

---

## Sprint SP — Simulador de costo en panel de tarifas (cerrado 20 ago 2026)

| Paso | Descripción | Archivos clave |
|------|-------------|----------------|
| **SP-1** | Estado `simulatedIds` + toggle click en tarjeta + visual dashed indigo | `TarifaPanel.tsx` (DraggableTarifaCard) |
| **SP-2** | Footer de simulación: costo actual / simulado / delta por moneda. Siempre visible. | `TarifaPanel.tsx` (SimuladorFooter), `FichaCotizacion.tsx` (costoBaseByMoneda) |
| **SP-3** | "Aplicar selección" bulk + "Limpiar". Confirm si >1. Multi-apply: ninguna auto-oficial. | `TarifaPanel.tsx`, `FichaCotizacion.tsx` (handlePanelAplicarSimulacion) |
| **SP-4** | Reset simulación al cambiar de concepto (ya hecho en SP-1) | — |

**Decisiones implementadas:**
- Click en cuerpo = toggle simulación. `stopPropagation` en grip (drag) y botón "Usar" → sin conflicto.
- Tarjetas aplicadas (`yaUsada`) ignoran click — no se pueden simular.
- `costoBaseByMoneda` excluye concepto activo + incluye subconceptos del activo (no cambian en simulación).
- Delta positivo en rojo, negativo en verde. Separado por moneda (USD/MXN en líneas independientes).
- Single apply a concepto vacío → auto-oficial. Multi apply → ninguna oficial, usuario decide en comparativa.
- `window.confirm` para confirmar multi-apply — **provisional**, candidato a reemplazar por modal propio.

---

## Épicas PENDIENTES (plan Tarifas/Pricing)

| Épica | Descripción | Prerequisitos | Notas |
|-------|-------------|---------------|-------|
| **E10** | Modelo de Tarifas en Firestore | **Sesión de diseño con Mau** | Estructura de rutas, vigencia, maniobras por terminal. NO empezar sin esa sesión. |
| E11 | UI Bandeja de Tarifas | E10 | CRUD de tarifas, filtros, búsqueda |
| E12 | Conceptos maestros (catálogo de conceptos reutilizables) | E10 | Tipos de cargo, unidades, categorías |
| E13 | Comparativa Pricing (vista lado a lado de proveedores) | E10, E11 | Tabla comparativa, selección asistida |
| E14 | Profit real + moneda mixta | E10 | Cálculo con tipo de cambio, financiamiento real |
| E15 | Trazabilidad / versionado de cotizaciones | E10 | Historial de cambios, auditoría |
| E16 | OCR / IA para extracción de tarifas | E10, E11 | Lectura de PDFs de proveedores |
| E17 | SMTP (envío de cotizaciones por correo) | E13 | Plantillas, attachments |
| E18 | Estados finales (ganada/perdida/cancelada) | E5 | Extensión de la máquina de estados |

### E10 — Siguiente paso (BLOQUEADO por sesión de diseño)

E10 requiere decisiones de diseño que NO se pueden tomar sin una sesión con Mau:

1. **Estructura de rutas:** ¿plano (origen→destino) o jerárquico (país→puerto→terminal)?
2. **Vigencia de tarifas:** ¿por fecha, por volumen, por contrato?
3. **Maniobras por terminal:** ¿campo libre o catálogo cerrado?
4. **Relación tarifa↔proveedor↔modalidad:** ¿1:1 o N:M?
5. **Moneda de la tarifa:** ¿siempre USD o multi-moneda?

**NO empezar E10 sin esa sesión.** El riesgo de rehacer el modelo es alto.

---

## Deudas técnicas anotadas

### Para E14: `ClienteVermur.dias` debe desglosarse por tipo
- Hoy `ClienteVermur` tiene un solo campo `dias: number` (días de crédito del cliente).
- En E14 se desglosará a `diasCreditoPorTipo: { maritimo: number, terrestre: number, aereo: number }`,
  misma forma que `ProveedorVermur.diasCredito`.
- **NO tocar hasta E14** — backward compat con todo lo que usa `dias` hoy.

### Seguridad: colección `proveedores/` abierta
- La regla Firestore para `proveedores/` quedó con la misma apertura que el resto:
  cualquier usuario autenticado puede leer y escribir.
- **Endurecer por rol** cuando se haga la épica de seguridad (fuera de E9–E18).
- Aplica también a `clientes/`, `cotizaciones/`, `contadores/`.

### FormProveedorFicha.tsx — código muerto (candidato a eliminar)
- `src/components/quotes/FormProveedorFicha.tsx` fue extraído mecánicamente en FC-1.
- Estaba definido pero nunca invocado en el original FichaCotizacion.
- **No borrar ahora** — eliminar en una limpieza dedicada, no mezclarlo con sprints activos.

### Campo `trafico` + `ubicacion` en ServicioSolicitado — PENDIENTE PRIORITARIO

**Problema:** `ServicioSolicitado` no tiene campo `trafico` (importacion/exportacion) ni
`ubicacion` (origen/destino). Sin ellos no se puede aplicar `calcularIVA` en la cotización,
aunque la función ya existe y está probada (21 tests en Conceptos-1.1).

**Impacto:**
- La regla espejo del IVA (`espejo`) depende del tráfico y la ubicación:
  Impo + Destino = 16% · Impo + Origen = 0% · Expo + Origen = 16% · Expo + Destino = 0%
- Sin estos campos, el cálculo fiscal es imposible en el flujo de cotización.
- El dropdown de conceptos del catálogo no puede filtrar por `aplicaImpo`/`aplicaExpo`.
- Tenemos la lógica fiscal lista pero desconectada del flujo real.

**Solución:** Agregar `trafico?: 'importacion' | 'exportacion'` a `ServicioSolicitado` y capturarlo
en el formulario de creación de servicio. `ubicacion` se puede derivar de la posición del concepto
en la cadena (antes o después de la aduana). Requiere épica propia — toca el formulario de servicio
y la calculadora de totales.

**Estado:** Pendiente. Bloquea el cálculo fiscal correcto.

### Alta rápida inline — CUMPLIDO
- El compromiso de E9.2 (alta rápida de proveedor desde BandejaPricing y FichaCotizacion)
  **ya está implementado y validado**. Si aparece en notas viejas como pendiente, ignorar.

### Dualidad de CotizacionProveedor (requiere épica propia)

**Problema:** BandejaPricing guarda cotizaciones de proveedor en
`servicio.cotizacionesProveedor` (sin `proveedorId`); FichaCotizacion guarda en
`concepto.tarifas` (con `proveedorId`). Son dos estructuras paralelas que no se hablan.

**Impacto actual:**
- La comparativa es **aditiva** (ambos niveles se muestran si tienen datos): si
  `servicio.cotizacionesProveedor` tiene 2+, se muestra "Comparativa del servicio"; si algún
  concepto tiene 2+ tarifas, se muestra "Comparativa · [nombre]". Esto resuelve el bug donde
  cotizaciones a nivel servicio quedaban invisibles cuando existían conceptos (fix 13 ago 2026).
- **Deuda pendiente (Opción C):** migrar los datos de `cotizacionesProveedor` a `concepto.tarifas`
  para eliminar la dualidad de raíz. Requiere script de migración de Firestore + refactor de
  BandejaPricing. NO hacer sin sesión de planeación dedicada.
- El historial de proveedor necesita fallback por nombre normalizado para encontrar registros legacy.
- `calcularTotalConsolidado()` tiene lógica dual (flat vs conceptos).

**Solución propuesta: concepto default oculto en BandejaPricing.**
BandejaPricing crearía automáticamente un concepto ("Servicio general") al agregar la primera
cotización de proveedor. El usuario no ve conceptos — la interfaz se mantiene simple. Pero por
debajo, los datos viven en `concepto.tarifas`, unificando la estructura.

**Alcance estimado: 2–3 días (12–15 horas).**

**Puntos de riesgo alto:**
1. **Refactor de BandejaPricing** (~150 líneas) — cambiar todas las lecturas/escrituras de
   `servicio.cotizacionesProveedor` a `servicio.conceptos[0].tarifas`.
2. **`calcularTotalConsolidado()`** — reescribir la lógica dual a una sola ruta por conceptos.
   Es la función más crítica: se llama en cada actualización de cotización.
3. **Guard de la state machine** (`stateMachine.ts`) — la transición
   `cotizaciones_recibidas → consolidada` valida `servicio.cotizacionesProveedor.some(cp => cp.seleccionada)`.
   Debe cambiar a `servicio.conceptos.some(c => c.tarifas.some(t => t.seleccionada))`.
4. **Migración de datos en Firestore** — cotizaciones existentes con `cotizacionesProveedor`
   no vacío necesitan un script que mueva esos datos a un concepto default.

**Requisitos:** Plan propio, validación paso a paso, estrategia de rollback.
**NO ejecutar sin sesión de planeación dedicada.**

### Migración de `proveedorId` en CotizacionProveedor legacy

**Problema:** CotizacionProveedor creadas por BandejaPricing solo tienen `proveedor` (nombre
libre) pero no `proveedorId` (FK al catálogo). El historial de proveedor usa un fallback por
nombre normalizado, pero los datos quedan sucios.

**Solución:** Script de migración que recorra todas las cotizaciones en Firestore, busque cada
`CotizacionProveedor` sin `proveedorId`, haga match por nombre contra el catálogo de proveedores,
y escriba el `proveedorId` correspondiente.

**Riesgo:** Las CotizacionProveedor son arrays anidados dentro de KanbanQuote (no documentos
propios). Tocar arrays anidados en producción requiere cuidado.

**Estado:** Pendiente. El fallback por nombre funciona como workaround — la migración es
opcional pero recomendable para limpieza de datos.

---

## Archivos clave para retomar

| Área | Archivos |
|------|----------|
| Modelo proveedor | `src/components/proveedores/ProveedoresData.ts` |
| Hook proveedores | `src/hooks/useProveedores.ts` |
| CRUD proveedor | `src/components/proveedores/ProveedorFormModal.tsx` |
| Alta rápida | `src/components/proveedores/AltaRapidaProveedorModal.tsx` |
| Directorio (Clients) | `src/components/Clients.tsx` |
| Dropdowns proveedor | `BandejaPricing.tsx`, `FichaCotizacion.tsx`, `FichaRFQ.tsx` |
| Selector conceptos | `src/components/conceptos/ConceptoSelector.tsx` |
| Matching tarifas | `src/components/tarifas/tarifaMatching.ts` (+tests en `src/lib/tarifaMatching.test.ts`) |
| Validadores | `src/lib/validadores.ts` |
| Calculadora | `src/lib/cotizacionCalculator.ts` |
| Máquina de estados | `src/lib/stateMachine.ts` |
| Modelo cliente | `src/components/clientes/ClientesData.ts` |

---

## Commits de E9 (referencia rápida)

```
56134d3 feat(E9.0): modelo ProveedorVermur + useProveedores hook + seed Firestore
ed5981a fix(E9.0): agregar regla Firestore para colección proveedores/
bd10330 feat(E9.1): reconectar Clients, FichaCotizacion y FichaRFQ a useProveedores
afe6698 feat(E9.3): BandejaPricing FormProveedor → dropdown del catálogo
99c86a9 feat(E9.2): CRUD proveedor + alta rápida inline
```
