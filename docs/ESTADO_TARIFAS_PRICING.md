# VermurOps — Estado de Tarifas/Pricing (Pausa documentada)

> Última actualización: 18 agosto 2026
> Estado: **EN PAUSA** — Sprint FC cerrado, E10 pendiente de sesión de diseño con Mau.

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
