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
