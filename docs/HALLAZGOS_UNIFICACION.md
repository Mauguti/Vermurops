# Hallazgos de la pasada de unificación

> Cosas que funcionan mal y que NO se tocaron en esta pasada, a propósito.
>
> La regla del trabajo era unificar presentación y navegación sin cambiar
> funcionalidad. Mezclar las dos cosas ya produjo dos veces regresiones
> imposibles de rastrear. Esto queda anotado para atenderlo aparte.

---

## Abiertos

### 1 · Cajas de búsqueda que no filtran nada

`src/components/Finance.tsx:12` y `src/components/Warehouse.tsx:7` declaran
`searchTerm` con su `setSearchTerm`, lo cablean a un input, y **nunca lo leen**.
Escribir en esas cajas no hace nada.

Los dos son módulos placeholder, así que no afecta a nadie hoy. Pero es el
mismo patrón que produjo el bug de los modales que sí llegó a producción: un
estado que se escribe y nunca se lee no lo detecta ni `tsc` ni el build ni los
tests.

**Detectado con:** un scan de estado write-only sobre todos los `.tsx`.
Vale la pena dejarlo como paso fijo antes de cerrar cualquier bloque de UI.

### 2 · Botones que no hacen nada

Encontrados al alinear los encabezados. Ninguno tiene `onClick`:

| Dónde | Botón |
|---|---|
| `proveedores/FichaProveedor.tsx` | «Nueva Solicitud» |
| `finance/FichaFactura.tsx` | «Descargar todo (ZIP)» |

Se conservaron tal cual en el paso 3 para no mezclar. Se atienden en el paso
de nomenclatura, que es donde el plan pide esconder o renombrar lo que promete
algo que no hace.

### 3 · La ficha de orden de compra no existe

El plan la lista entre las fichas a alinear. `components/ordenesCompra/` solo
tiene `BandejaOC.tsx` y `OrdenesCompraData.ts`. La ficha se construye en el
bloque C del plan de operación; cuando exista, nace con `FichaLayout`.

### 4 · La cotización no recuerda de qué prospecto salió

El plan de unificación pide enlazar «prospecto convertido → su cotización» y
«cotización → su prospecto de origen». **No hay campo que lo relacione.**

La conversión (`Quotes.tsx`, `KanbanProspeccion.onConvert`) crea la cotización
con `generateFolio()` y muestra un aviso que dice «Cotización COT-… creada
desde prospecto PRO-…», pero no guarda el vínculo en ningún lado. El texto se
pierde en cuanto se cierra el diálogo.

Enlazar por nombre de empresa sería adivinar: dos prospectos de la misma
empresa apuntarían a la misma cotización. Hace falta `KanbanQuote.prospectoId`,
que es un cambio de modelo y quedó fuera de esta pasada.

Los demás enlaces de la tabla del plan sí se hicieron, porque su FK ya existía.

### 5 · La orden de compra y la factura no tienen a dónde enlazar

- **OC → su embarque:** `BandejaOC` recibe `onSelectOC` y `Finance.tsx` no se
  lo pasa, así que hacer clic en una orden no hace nada. No hay ficha de OC.
  El enlace desde el embarque y desde el proveedor lleva a la bandeja, que es
  lo más cerca que se puede llegar hoy.
- **Factura → su embarque:** el tipo de `invoice` es `any` y los datos son
  mock. No hay `embarqueId`. El modelo real se construye en la fase B.

---

## Resueltos en esta pasada

Se atendieron en el paso 6 (nomenclatura), porque el plan pide ahí esconder o
renombrar lo que promete algo que no hace:

- **«Nueva Solicitud»** en la ficha de proveedor — botón sin `onClick`. Retirado.
- **«Descargar todo (ZIP)»** en la ficha de factura — botón sin `onClick`. Retirado.
- **Las cuatro pestañas de Clientes** (Cuentas · Contactos · Leads ·
  Oportunidades) — solo cambiaban de color; el contenido de abajo no dependía
  de cuál estuviera activa. Además, «Leads» y «Oportunidades» nombraban en
  vocabulario de CRM lo que este sistema llama prospectos y cotizaciones, en
  otro módulo. Retiradas.
