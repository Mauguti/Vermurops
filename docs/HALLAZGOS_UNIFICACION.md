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
