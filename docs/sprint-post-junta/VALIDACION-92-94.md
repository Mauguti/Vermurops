# Validación en producción · 92 → 94

**Cuenta:** `administracion@vermur.com` para pagos, `info@digsol.com.mx`
(admin) para catálogos. Consola limpia todo el recorrido.

Lo que escribe va sobre órdenes de prueba. **Nada sobre una orden real.**

> **Lo que hay que mirar primero no es una pantalla nueva: es que nada
> cambió.** La 93 reemplazó los listeners de `clientes`, `proveedores`,
> `embarques` y `cotizaciones` por una tienda compartida. Cuatro de las
> colecciones más usadas de la app cambiaron de plomería a la vez, sin
> cambiar lo que se ve. Si algo se ve distinto, es regresión.

---

## 1 · Lo que no escribe nada — el bloque que importa

1. **Entra y recorre las cinco listas:** Altas → Clientes, Altas →
   Proveedores, Embarques, CRM y Finanzas. Todas tienen que cargar con los
   mismos registros y en el **mismo orden** que ayer: clientes y proveedores
   alfabéticos, cotizaciones y embarques los recientes primero.
2. **Abre dos pantallas que usen la misma colección** —CRM y el Kanban, o
   Altas y el selector de cliente de una cotización— y comprueba que las dos
   ven lo mismo. Comparten un listener: si una se queda vieja, es la tienda.
3. **Cuenta los registros.** Clientes **817**, proveedores **544**. Si alguno
   bajó, para todo y dime: el seed tiene dos barreras y la segunda es lo
   último que impide escribir datos de ejemplo encima del catálogo (§6).
4. **Puertos** (tarea 94): la lista, su contador y el badge usan el mismo
   criterio que clientes y proveedores — fuera solo el inactivo **explícito**.
   Un puerto sin el campo ahora aparece. **No se escribió nada**: si ves uno
   que antes no estaba, es esto.
5. **Selector de conceptos, ficha y bandeja de cotización, formulario y carga
   masiva de tarifas** (tarea 94): mismo criterio. Un concepto sin el campo
   ya no se esconde.

## 2 · Lo que escribe

6. **Pagar UNA orden desde su ficha** (tarea 92) — lo que la 86 dejó fuera.
   La ficha ahora trae **«Fecha del pago»** (hoy por default, editable):
   - La orden debe guardar **ese día**, no el de captura.
   - Una fecha **futura** no se acepta.
   - Una fecha **anterior a la autorización** tampoco, y el botón se
     deshabilita **diciendo por qué**.
   - Es la misma regla que el pago de grupo: compáralas, deben coincidir.

## 3 · Lo que NO se publicó

- **La 91** no tiene commits propios: su punta era el mismo `main`. Queda
  fuera sola, no hubo nada que dejar fuera.
- **La 95** (suite con emulador de Functions) y su **commit wip** quedaron
  fuera; se rehace en la siguiente cola. Comprobado: no es ancestro de la 94.
- **El interruptor de embarque automático**: apagado.

## 4 · Síntoma → causa

| Síntoma | Causa más probable |
|---|---|
| Una lista sale desordenada | `ordenarPorNombre` / `ordenarPorCreacion` de la tienda |
| Dos pantallas de la misma colección no coinciden | la tienda compartida no está emitiendo a todos |
| **Bajó el conteo de clientes o proveedores** | el seed escribió encima — **para todo y dime** |
| Un puerto o concepto «nuevo» en una lista | es la 94: estaba escondido por no tener el campo |
| La fecha de pago guardada es la de captura | la 92 no está pasando la fecha a `transicionarEstado` |

---

## La mutación que pediste, y lo que encontró

Corrí las cinco mutaciones de la 93 **sobre las transformaciones, no sobre el
compartir**, que es donde estuvo la trampa de la 89:

| Mutación | Tests que caen |
|---|---|
| `ordenarPorNombre` no ordena | 2 de 9 |
| `ordenarPorCreacion` al revés | 1 de 9 |
| el candado por módulo deja de cerrar | 1 de 9 |
| se ignora el guard de caché (un snapshot de caché siembra) | 1 de 9 |
| **la segunda barrera (`getDocsFromServer`) deja de proteger** | **0 de 9** |

**La quinta sobrevivía, y es la peor.** El mock contestaba siempre
`{ empty: true }`, así que la rama «el servidor ya tiene documentos» no se
ejercitaba nunca. Esa barrera es lo último entre un snapshot que llegó vacío
y los datos de ejemplo escritos encima de 817 clientes y 544 proveedores.
`enServidor` pasa a ser configurable y el test nuevo lo pone en 544; con la
mutación, cae.

**Dos cosas que el test destapó al escribirlo**, y que vale la pena saber
porque son la clase de error que deja un test pasando por la razón
equivocada:

1. La primera versión usaba `tiendaProveedores` y **pasaba sin probar nada**:
   el candado por módulo ya estaba cerrado por el test de arriba, así que
   `escritas: []` salía por el candado, no por la barrera. Lo delató la
   aserción del aviso con el conteo — sin ella, habría quedado un test verde
   que no probaba la barrera, que es exactamente lo que estábamos arreglando.
2. El `beforeEach` del bloque de seed no reseteaba la respuesta del servidor,
   así que el caso se habría filtrado a los tests siguientes.

Las otras cuatro mordían desde el principio: a diferencia de la 89, la 93 sí
trajo tests de orden y de seed, no solo de compartir.
