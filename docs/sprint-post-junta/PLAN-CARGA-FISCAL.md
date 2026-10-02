# Plan de carga de RFC, código postal y régimen fiscal desde Magaya

> Tarea 42 del sprint nocturno · 1-oct-2026
>
> Sin estos tres datos el SAT no deja timbrar. De 822 clientes en
> producción, 5 tienen RFC (campo `rfc`), 327 tienen código postal y 0
> tienen régimen fiscal. De 553 proveedores, 485 no tienen RFC efectivo.

---

## 1. ¿El dato vino de Magaya? — hallazgo del paso 0

**Sí vino, pero quedó en el campo equivocado y mezclado con basura.**

El export de Magaya guardó el Tax ID en `numeroEntidadMagaya`, no en `rfc`.
El inventario del seed (`clientes.json`) confirma:

| Campo | Clientes con valor | Ejemplo |
|---|---|---|
| `rfc` | **0** (no existe en el seed) | — |
| `numeroEntidadMagaya` | **318** de 817 | `AEL571218HP7`, `CEM180528UG7`, `XEXX010101000` |
| `codigoPostal` | **327** de 817 | `54716`, `06030`, `M6H 1C2` (canadiense) |
| `regimenFiscal` | **0** (no existe en el seed) | — |

Los 5 clientes que en producción tienen `rfc` son los **creados manualmente**
después de la importación (822 − 817 = 5).

Para proveedores (`proveedores.json`):

| Campo | Proveedores con valor | Ejemplo |
|---|---|---|
| `numeroEntidadMagaya` | **135** de 544 | `AOHA900516184`, `ATL080130M9A`, `DE253556233` |
| `rfc` | 0 en el seed | — |

### Qué contiene `numeroEntidadMagaya`

No es un campo limpio. Magaya almacena ahí el «Tax ID» de cada entidad sin
distinguir país, así que contiene:

- **RFCs mexicanos válidos** (persona moral 12 chars, física 13 chars):
  `AEL571218HP7`, `CEM180528UG7`, `AOHA900516184`
- **RFC genérico de extranjero**: `XEXX010101000`
- **Tax IDs de otros países**: `DE253556233` (Alemania), `729355719RP0001`,
  `91310106742680295D` (China), `596863853`
- **Otros identificadores**: `00966 12 2317928/30`, `81-3055211` (teléfonos o
  referencias)

### Por qué solo 318 de 817 clientes lo traen

Magaya no exigía Tax ID al dar de alta. El campo estaba vacío para la mayoría.
No es que el export lo perdió — el dato nunca existió en Magaya para esos
clientes.

### Conclusión

El export de Magaya tenía los datos que tenía: ~318 Tax IDs de clientes y ~135
de proveedores, mezclados. Lo que no vino no se puede recuperar de Magaya si
Magaya no lo tiene. **La fuente para completar los ~500 clientes restantes es
la Constancia de Situación Fiscal (CSF) de cada uno**, no un re-export.

---

## 2. Plan de carga: tres fases

### Fase 1 — Minar los datos que ya existen (script, sin export)

Recorrer `numeroEntidadMagaya` de clientes y proveedores en producción y
copiar los RFCs mexicanos válidos al campo `rfc`.

**Criterio de filtrado:**

```
// Patrón del SAT para RFC
Persona moral:  /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/    (12 caracteres)
Persona física: /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/    (13 caracteres)
Más los genéricos: XEXX010101000, XAXX010101000
```

Usar `validarRFC` de `src/lib/validadores.ts`, que ya implementa la
validación completa con dígito verificador del SAT.

**Qué escribe (solo dos campos, aditivos):**

| Campo | Valor | Condición |
|---|---|---|
| `rfc` | el valor de `numeroEntidadMagaya` | si pasa `validarRFC` y `rfc` está vacío |
| `codigoPostal` | el `codigoPostal` existente, limpio | solo si pasa la validación de 5 dígitos y el campo actual está vacío (los CPs extranjeros como `M6H 1C2` se ignoran) |

**Lo que NO escribe:**
- No toca `rfc` si el cliente ya tiene uno capturado a mano (los 5 de
  producción).
- No toca `regimenFiscal`: Magaya no lo tiene. No se puede inventar.
- No toca `numeroEntidadMagaya`: se conserva para trazabilidad.
- No borra ni modifica ningún otro campo.

**Estimado de alcance:** de los 318 clientes con `numeroEntidadMagaya`, los
que tengan un RFC mexicano válido pasan (probablemente ~250-300). El resto
son Tax IDs extranjeros que se quedan sin `rfc` — correcto, porque el
extranjero usa `XEXX010101000`.

**Para proveedores:** el mismo criterio. De los 135 con `numeroEntidadMagaya`,
los que pasen `validarRFC` se copian a `rfc`. Los proveedores extranjeros
(como `DE253556233`) quedan sin RFC mexicano, que es lo correcto.

### Fase 2 — Export de Luis para los que no tienen Tax ID en Magaya

~500 clientes y ~400 proveedores no tienen `numeroEntidadMagaya` en Magaya.
Para ellos hay que pedirle a Luis un export.

**Lo que hay que pedirle:**

Un archivo CSV o Excel con estas columnas, de las dos colecciones (Clientes y
Agentes/Vendors) de Magaya:

| Columna | Para qué |
|---|---|
| **Entity Number** (el identificador interno de Magaya) | Empatar con `referenciaMagaya` del seed |
| **Name** | Verificación cruzada |
| **Tax ID** | El RFC / identificador fiscal |
| **Zip Code** | Código postal |
| **Country** | Para saber si es nacional o extranjero |
| **Address** | Domicilio fiscal (si lo tiene) |

**Llave de empate: `referenciaMagaya`**, no el nombre.

En clientes, `referenciaMagaya` tiene valor en los **817 de 817** registros
(es un número de secuencia como `"924"`, `"923"`, etc.). Es la llave más
confiable porque es el ID interno de Magaya y no tiene problemas de
normalización de nombres.

En proveedores, `referenciaMagaya` solo tiene valor en **2 de 544**. La
llave alternativa para proveedores es `idSemantico` (que viene del nombre
normalizado como `PRV-SIMEX`) o el nombre exacto `nombre`. Mejor pedir los
dos para empate cruzado: nombre exacto como viene en Magaya + Tax ID.

**El script de empate para la fase 2:**
- Lee el CSV/Excel de Luis.
- Empata por `referenciaMagaya` (clientes) o por nombre normalizado
  (proveedores).
- Solo escribe `rfc` si el valor del export pasa `validarRFC` y el campo
  está vacío.
- Reporta: empatados, no empatados, conflictos (ya tiene un RFC distinto).

### Fase 3 — Régimen fiscal y CP: captura manual asistida

El régimen fiscal **no existe en Magaya**. No se puede importar de ningún
lado. Sale de la Constancia de Situación Fiscal (CSF) que cada cliente le
entrega a Vermur.

**Opciones para capturarlo:**

1. **Manual, asistido por la pantalla.** La sección «Datos fiscales» de la
   ficha del cliente (tarea 35) ya muestra qué falta y tiene el selector de
   régimen. Administración captura uno por uno.

2. **Carga masiva desde Excel.** Luis o Julio preparan un Excel con RFC →
   régimen y CP (si lo tienen en sus archivos), y un script lo carga. El
   formato sería:

   | RFC | Régimen (clave SAT) | Código postal |
   |---|---|---|
   | AEL571218HP7 | 601 | 54716 |

   La llave de empate aquí es el **RFC** (después de que las fases 1 y 2 lo
   hayan poblado). El script valida que la clave de régimen exista en el
   catálogo SAT y que el CP tenga 5 dígitos.

3. **OCR de la CSF** (a futuro). La Constancia tiene un formato estándar del
   SAT; un flujo de n8n podría extraer RFC, régimen y CP automáticamente.
   No es para este sprint.

**Recomendación:** empezar con la opción 1 (ya funciona) y preparar la 2 si
Julio tiene los datos en un archivo.

---

## 3. Diseño del script de carga (fases 1 y 2)

### Interfaz

```bash
# Fase 1: minar datos existentes
SERVICE_ACCOUNT=… npx tsx scripts/cargarDatosFiscales.ts --fase1
SERVICE_ACCOUNT=… npx tsx scripts/cargarDatosFiscales.ts --fase1 --aplicar

# Fase 2: cargar desde export de Luis
SERVICE_ACCOUNT=… npx tsx scripts/cargarDatosFiscales.ts --fase2 --archivo datos-luis.csv
SERVICE_ACCOUNT=… npx tsx scripts/cargarDatosFiscales.ts --fase2 --archivo datos-luis.csv --aplicar
```

### Comportamiento

**Sin `--aplicar` (default): solo lectura.**
- Lee de producción (Firestore).
- Aplica las reglas de filtrado.
- Imprime una tabla: entidad, campo, valor actual, valor propuesto, acción.
- Cuenta: cuántos se actualizarían, cuántos se saltean (ya tienen valor),
  cuántos no empatan, cuántos tienen RFC inválido.
- Sale con código 0.

**Con `--aplicar`: escribe.**
- Primero genera un JSON de respaldo en `scripts/respaldos/fiscal-YYYY-MM-DD-HHmmss.json`
  con los valores actuales de cada documento que va a tocar.
- Escribe con `updateDoc` y solo los campos que cambian (`rfc` y/o
  `codigoPostal`), nunca el documento entero.
- Usa batches de 500 (límite de Firestore).
- Imprime el resumen y el comando para revertir.

### Respaldo y reversa

```bash
# Revertir
SERVICE_ACCOUNT=… npx tsx scripts/cargarDatosFiscales.ts --revertir scripts/respaldos/fiscal-2026-10-03-1430.json
```

El JSON de respaldo tiene la forma:

```json
[
  { "coleccion": "clientes", "id": "CLI-0015", "antes": { "rfc": null } },
  { "coleccion": "proveedores", "id": "PRV-0042", "antes": { "rfc": null } }
]
```

La reversa aplica `updateDoc` con los valores de `antes`, devolviendo cada
campo a su estado previo.

### Reglas de conflicto (nunca pisar lo manual)

| Situación | Acción |
|---|---|
| `rfc` vacío + `numeroEntidadMagaya` es RFC válido | Copiar → `rfc` |
| `rfc` vacío + `numeroEntidadMagaya` es Tax ID extranjero | No copiar. Marcar como «extranjero sin RFC mexicano» |
| `rfc` ya tiene valor | **No tocar.** Reportar si difiere de `numeroEntidadMagaya` |
| `codigoPostal` vacío + CP en seed/export pasa validación 5 dígitos | Copiar → `codigoPostal` |
| `codigoPostal` ya tiene valor | **No tocar.** |
| El export de Luis trae un nombre que no empata | Reportar como «sin empate» |
| El export trae un RFC distinto al que ya tiene | **No tocar.** Listar como conflicto para revisión manual |

### Lo que no hace el script

- No toca `regimenFiscal` (no hay fuente automatizable).
- No toca `numeroEntidadMagaya` (se conserva para trazabilidad).
- No toca `expedienteValidado` ni `origenDatos`.
- No borra documentos, campos ni colecciones.
- No crea documentos nuevos.

---

## 4. Convivencia con la validación de expediente

### ¿Los de Magaya siguen contando como validados si les falta el RFC?

**Sí, y la razón importa.**

`estadoValidacion.ts` evalúa el estado del EXPEDIENTE (alta formal), no los
datos fiscales. Son dos cosas distintas:

| Validación | Qué mide | Quién la usa |
|---|---|---|
| **Expediente** (`estadoValidacion`) | ¿Administración aprobó el alta? | Freno para ganar cotización y abrir embarque |
| **Fiscal** (`estadoFiscal`) | ¿Tiene RFC + CP + régimen? | Indicador en la ficha y en la tabla de Altas |

Un cliente de Magaya cuenta como `heredado_magaya` porque su alta fue formal
en el sistema anterior. Que le falte el RFC para timbrar es un problema
OPERATIVO (no puede facturarse), no un problema de EXPEDIENTE (su alta es
legítima).

Si se condicionara `heredado_magaya` a tener RFC, los 499 clientes sin Tax ID
pasarían a `sin_validar` y el freno de expediente bloquearía ganar sus
cotizaciones. No se puede: están en operación.

**Lo que sí debe pasar:** antes de timbrar la factura de un embarque, el
sistema debe exigir que el cliente tenga datos fiscales completos. Eso es
un freno nuevo en el flujo de facturación, no en el de expediente. No entra
en este sprint.

---

## 5. Qué pedir a Vermur

### Pregunta para Luis (redactada para copiar y mandar)

> Luis, necesitamos completar los datos fiscales de clientes y proveedores
> para poder timbrar. De 822 clientes en el sistema, solo 318 trajeron el
> Tax ID de Magaya y muchos son de entidades extranjeras. De 544
> proveedores, solo 135 trajeron Tax ID.
>
> ¿Podrías exportarnos de Magaya un CSV con estas columnas?
>
> **Para clientes (Shippers/Consignees):**
> - Entity Number (el número interno de Magaya)
> - Name
> - Tax ID / RFC
> - Zip Code
> - Country
> - Address
>
> **Para proveedores (Agents/Vendors):**
> - Name (exacto como aparece en Magaya)
> - Tax ID / RFC
> - Zip Code
> - Country
> - Address
>
> Con eso podemos cruzar contra lo que ya tenemos y llenar los huecos. Los
> que no tengan Tax ID en Magaya los completamos después con las
> Constancias de Situación Fiscal.
>
> Si los datos fiscales (RFC, CP, régimen) los tiene el contador o Julio en
> un archivo aparte, también nos sirve un Excel con: RFC → Régimen fiscal
> (clave del SAT, como 601 o 612) → Código postal. Lo cruzamos por RFC.

### Pregunta para Mau

1. **¿Corremos primero la fase 1 (minar `numeroEntidadMagaya`)?** Es
   inmediato, no necesita nada de Luis y llevaría ~250-300 clientes de 5
   a ~300 con RFC. Recomendación: sí, es ganancia rápida.

2. **¿El régimen fiscal lo tiene alguien en un archivo?** Si Julio o el
   contador tienen un Excel con los RFCs y sus regímenes, podemos cargarlo
   masivamente (fase 3, opción 2). Si no, Administración los captura uno
   por uno con la pantalla de la tarea 35.

3. **¿Qué tan urgente es el freno de facturación por datos fiscales
   incompletos?** Hoy se puede facturar un embarque cuyo cliente no tiene
   RFC. El freno es operativo (el timbrado falla en el PAC), no sistémico.
   Si quieres que el sistema bloquee antes, es un freno nuevo que se puede
   agregar en el flujo de facturación.

---

## 6. Resumen de entregables

| Fase | Qué | Depende de | Estimado |
|---|---|---|---|
| 1 | Script: minar `numeroEntidadMagaya` → `rfc` | Nada (los datos ya están) | 2-3 horas |
| 2 | Script: cargar RFC desde export de Luis | El CSV de Luis | 2-3 horas |
| 3a | Captura manual de régimen fiscal | La pantalla de la tarea 35 (ya hecha) | Trabajo de Administración |
| 3b | Script: carga masiva de régimen desde Excel | Que alguien tenga los datos | 1-2 horas |
| — | Freno de facturación por datos fiscales | Decisión de Mau | 3-4 horas |

La fase 1 no tiene dependencia: se puede hacer hoy. La fase 2 espera el
export de Luis. La fase 3 espera saber si el dato existe en algún archivo
o hay que capturarlo a mano.
