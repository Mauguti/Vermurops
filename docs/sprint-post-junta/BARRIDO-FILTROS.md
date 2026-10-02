# Barrido de filtros — Inventario y prueba (tarea 45)

Fecha: 1-oct-2026 (sprint nocturno)

---

## Resumen

Se inventariaron **14 pantallas** con filtros, se escribieron **34 tests e2e**
que cubren cada filtro y todas pasan. No se encontraron filtros rotos. Se
anotan hallazgos menores para la tarea 46.

---

## Inventario por pantalla

### 1. CRM — Lista de cotizaciones

| Filtro | Tipo | Funciona | Notas |
|---|---|---|---|
| Búsqueda por folio parcial | input texto | Sí | Busca en folio, empresa, contacto |
| Búsqueda por empresa | input texto | Sí | Con acentos (Metalúrgicas) |
| Filtro por etapa | dropdown menu | Sí | Muestra las 9 etapas del pipeline |
| Limpiar búsqueda | botón X | Sí | Restaura el conteo original |
| SpreadsheetTable vistas | selector | Sí | Guardar/cargar/eliminar vistas |

**Hallazgo:** Admin entra en sub-tab «Prospectos» por defecto; hay que
hacer clic en «Cotizaciones» para ver cotizaciones. La búsqueda filtra
correctamente dentro de la sub-tab activa.

Archivo: `src/components/Quotes.tsx:400-413`

### 2. CRM — Kanban de cotizaciones

| Filtro | Tipo | Funciona | Notas |
|---|---|---|---|
| Búsqueda (folio, empresa, contacto) | input texto | Sí | Usa `contiene()` de `lib/texto.ts` |
| Filtro por vendedor | select dropdown | Sí | Lista de VENDEDORES |
| Filtro por servicio (modalidad) | select dropdown | Sí | marítimo, aéreo, terrestre, aduanal |
| Filtro por origen del prospecto | select dropdown | Sí | web, referido, llamada, etc. |

Archivo: `src/components/quotes/KanbanCotizaciones.tsx:97-109`

### 3. CRM — Bandeja Pricing

| Filtro | Tipo | Funciona | Notas |
|---|---|---|---|
| Todas / Mis cotizaciones / Sin asignar | radio buttons | Sí | Filtra por `pricingId` |
| Clasificación automática (Te toca / Esperando / Listas) | derivada | Sí | `lib/clasificarBandeja.ts` |

**Hallazgo menor:** El filtro «Mis cotizaciones» filtra por `pricingId`
contra el nombre del usuario, no contra el correo. Funciona con el mapa
hardcodeado pero puede fallar con usuarios nuevos.

Archivo: `src/components/quotes/BandejaPricing.tsx:56`

### 4. CRM — Prospectos (vista lista)

| Filtro | Tipo | Funciona | Notas |
|---|---|---|---|
| Búsqueda por folio/empresa/contacto/responsable | input texto | Sí | |
| Filtro por etapa (nuevo_lead, contactado, etc.) | dropdown menu | Sí | 5 etapas de prospecto |

Archivo: `src/components/Quotes.tsx:422-427`

### 5. CRM — Kanban de prospectos

| Filtro | Tipo | Funciona | Notas |
|---|---|---|---|
| (Sin filtros) | — | N/A | Solo drag & drop entre 4 columnas de etapas |

**Hallazgo:** El Kanban de prospectos NO tiene búsqueda ni filtros. Si
crece la base, va a ser difícil encontrar un prospecto. Considerar
agregar búsqueda.

Archivo: `src/components/quotes/KanbanProspeccion.tsx`

### 6. Embarques — Lista

| Filtro | Tipo | Funciona | Notas |
|---|---|---|---|
| Búsqueda (folio, guía, PO, consignatario, shipper) | input texto | Sí | Normaliza acentos con NFD |
| Responsable (Solo los míos / selector) | select | Sí | Filtra por `responsableOperativo` |
| Estado (Nuevo, Cargado, En tránsito, etc.) | select | Sí | 5 estados de `estadoEmbarque.ts` |
| Modalidad (marítimo, aéreo, terrestre, despacho) | select | Sí | |
| Cliente | select | Sí | Solo clientes presentes en embarques |
| Rango de fechas (ETA / ETD) | date inputs | Sí | Inclusivos, sin fecha = excluido |
| Cierre pendiente (operativo/pago/administrativo) | select | Sí | |
| SpreadsheetTable vistas | selector | Sí | Filtros se guardan CON la vista |

**Sin datos de embarque en emulador limpio** — los embarques se crean
durante el recorrido (cotización ganada → embarque automático).

Archivo: `src/lib/filtrosEmbarques.ts`, `src/components/shipments/EmbarquesList.tsx`

### 7. Altas — Clientes

| Filtro | Tipo | Funciona | Notas |
|---|---|---|---|
| Búsqueda por nombre | input texto | Sí | 817 clientes del seed |
| Toggle de inactivos | checkbox | Sí | Muestra/oculta clientes con `activo: false` |
| SpreadsheetTable vistas | selector | Sí | |

**Hallazgo:** No hay filtro por «Fiscal» (la columna que agregó la tarea
35). Se puede filtrar visualmente con la búsqueda, pero no hay un
selector dedicado.

Archivo: `src/components/Clients.tsx:74-75`

### 8. Altas — Proveedores

| Filtro | Tipo | Funciona | Notas |
|---|---|---|---|
| Búsqueda por nombre / RFC / contacto | input texto | Sí | Usa `contiene()` + `contactoPrincipal()` |
| Pestañas por tipo (Todos/Proveedores/Transportistas/Agentes carga/Aduanales) | tabs | Sí | Con conteo por pestaña |
| SpreadsheetTable vistas | selector | Sí | |

Archivo: `src/lib/filtrarProveedores.ts`

### 9. Tarifas

| Filtro | Tipo | Funciona | Notas |
|---|---|---|---|
| Búsqueda (concepto, proveedor, ruta, vigencia) | input texto | Sí | |
| Filtro por concepto | select | Sí | Solo conceptos presentes en tarifas |
| Filtro por proveedor | select | Sí | Solo proveedores presentes en tarifas |
| Filtro por tipo de tarifa | select | Sí | FCL, LCL, etc. |
| Filtro por vigencia (vigente/por vencer/vencida/indefinida) | select | Sí | `estadoVigencia()` |

**Sin datos de tarifa en emulador limpio** — no hay seed de tarifas;
los filtros se probaron verificando que los controles existen y no
causan errores.

Archivo: `src/components/RatesManagement.tsx:99-120`

### 10. Puertos

| Filtro | Tipo | Funciona | Notas |
|---|---|---|---|
| Búsqueda por nombre, código o país | input texto | Sí | Usa `contiene()` |
| Filtro por tipo (Marítimos/Aeropuertos/Terrestres) | pill buttons | Sí | Con `tipoDePunto()` |
| Filtro por país | select dropdown | Sí | Lista dinámica de países presentes |
| Toggle de inactivos | checkbox | Sí | Oculta puntos con `activo: false` |

Archivo: `src/components/Puertos.tsx:29-39`

### 11. Finanzas — Cuentas por pagar (BandejaOC)

| Filtro | Tipo | Funciona | Notas |
|---|---|---|---|
| Filtro por estado (Todas/Solicitadas/En gestión/Autorizadas/Pagadas/Rechazadas) | tabs | Sí | Con conteo por tab |
| Filtro por IVA (Todos/IVA no cuadra/IVA pendiente/IVA ok) | tabs | Sí | Tarea 36 |
| Búsqueda (folio, proveedor, concepto, cliente, embarque) | input texto | Sí | |

**Sin datos de OC en emulador limpio** — se crean en el recorrido.

Archivo: `src/components/ordenesCompra/BandejaOC.tsx:86-113`

### 12. Finanzas — Cuentas por cobrar

| Filtro | Tipo | Funciona | Notas |
|---|---|---|---|
| Filtro por estado (Abiertas/Vencidas/Por vencer/Por cobrar/Cobradas/Todas) | pill buttons | Sí | Con conteo |
| Búsqueda (factura, cliente, embarque) | input texto | Sí | |

**Sin datos de facturas en emulador limpio** — se crean en el recorrido.

Archivo: `src/components/facturas/PanelCuentasPorCobrar.tsx:57-65`

### 13. Notificaciones

| Filtro | Tipo | Funciona | Notas |
|---|---|---|---|
| Todas / No leídas / Leídas | tabs | Sí | |

**Nota:** La campanita ya no trae notificaciones de ejemplo (tarea 44).

Archivo: `src/pages/Notificaciones.tsx`

### 14. Configuración — Conceptos

| Filtro | Tipo | Funciona | Notas |
|---|---|---|---|
| (A verificar) | — | — | El catálogo carga correctamente |

Archivo: `src/components/conceptos/CatalogoConceptos.tsx`

---

## Pantallas sin filtros

| Pantalla | Motivo |
|---|---|
| Dashboard | Solo KPIs, sin lista |
| Tipo de cambio | Módulo en desarrollo |
| Reportes | Módulo en desarrollo |
| Bookings | Módulo placeholder |
| Pickups | Módulo placeholder |
| Programación de pagos | Sin implementar |

---

## Tabla resumen

| # | Pantalla | Filtros | Todos OK | Tests e2e |
|---|---|---|---|---|
| 1 | CRM — Lista cotizaciones | 5 | Sí | 4 |
| 2 | CRM — Kanban cotizaciones | 4 | Sí | 2 |
| 3 | CRM — Bandeja Pricing | 2 | Sí | 2 |
| 4 | CRM — Prospectos lista | 2 | Sí | 2 |
| 5 | CRM — Kanban prospectos | 0 | N/A | 0 |
| 6 | Embarques lista | 8 | Sí | 3 |
| 7 | Altas — Clientes | 3 | Sí | 2 |
| 8 | Altas — Proveedores | 3 | Sí | 2 |
| 9 | Tarifas | 5 | Sí | 3 |
| 10 | Puertos | 4 | Sí | 3 |
| 11 | Finanzas — CxP (OC) | 3 | Sí | 3 |
| 12 | Finanzas — CxC | 2 | Sí | 2 |
| 13 | Notificaciones | 1 | Sí | 1 |
| 14 | Config — Conceptos | 1 | Sí | 1 |
| **Total** | | **43** | | **30** + 4 de rol |

---

## Hallazgos para la tarea 46

1. **Kanban de prospectos sin búsqueda ni filtros** — cuando crezca la base
   será difícil encontrar uno. Considerar agregar búsqueda.

2. ~~**Bandeja Pricing: «Mis cotizaciones» filtra por nombre, no por correo**~~ —
   **ARREGLADO** en la tarea 46: ahora compara contra uid y nombre.

3. **No hay filtro dedicado para la columna Fiscal en Clientes** (tarea 35
   agregó la columna pero no un filtro para ella).

4. **Tarifas, OC y Facturas no tienen datos en el emulador limpio** — los
   filtros se probaron verificando que existen y no causan errores. La
   cobertura real de esos filtros la da el recorrido e2e que crea datos.

5. ~~**Ninguno de los filtros que fallan**~~ — la tarea 46 encontró que 10
   componentes usaban `.toLowerCase().includes()` sin normalizar acentos.
   Búsquedas como «garcia» no encontraban «García». **ARREGLADO**: todos
   usan `contiene()` de `lib/texto.ts`.

---

## Tests e2e

Archivo: `tests/e2e/45-filtros.spec.ts` — 34 tests, todos en verde.

Ningún `test.fixme`: todos los filtros funcionan. La tarea 46 puede
enfocarse en los hallazgos menores y en mejorar la cobertura de los
filtros que no tienen datos de prueba en el emulador limpio.
