# Plan — Tarifas: modalidad, presentación y wizard de carga

Junta 2a + el bloque 10 + el pedido nuevo del cliente. **Sin código.**

---

## 0. Lo que encontré antes de proponer nada

### La búsqueda hoy filtra por menos de lo que parece

`buscarTarifasVigentes` ([TarifasData.ts:191](../../src/components/tarifas/TarifasData.ts))
acepta filtros de vigencia, concepto, proveedor, puerto origen, puerto destino
y tipo. **No conoce modalidad, ni presentación, ni `rutaTexto`.**

Y el panel la llama con **un solo filtro**:

```ts
buscarTarifasVigentes(catalogoTarifas, { conceptoId: matchedConcept.id })
```

O sea: **hoy la única llave real es el concepto.** Ni siquiera la ruta se usa,
aunque el filtro existe. Por eso el Ams de Amacarga trajo la aérea en una
cotización marítima — y por eso traería también la de otro puerto.

Eso cambia el tamaño del problema: no es «agregar modalidad al filtro», es
**construir la llave de búsqueda**, que hoy no existe.

### Las presentaciones YA existen. No hace falta catálogo nuevo

En `QuotesData.ts`, con sus etiquetas en `lib/cargaSolicitud.ts`:

| Tipo | Valores |
|---|---|
| `TipoContenedor` | `20` · `40` · `40hc` · `reefer` · `open_top` · `flat_rack` |
| `TipoUnidadTerrestre` | `caja_seca_53` · `caja_seca_48` · `plataforma` · `refrigerada` · `torton` · `rabon` |

**Se reúsan tal cual.** Lo que NO existe es el equivalente para LCL y aéreo: la
solicitud los modela con `bultos`, `volumenM3`, `piezas` y `pesoVolumetricoKg`
— cantidades, no presentaciones. Ahí sí hay que nombrar valores nuevos, y son
los que pediste: `bulto`, `pallet`, `m3`, `tonelada`, `kilo`, `kilo_volumetrico`.

### La vigencia ya se respeta

`esTarifaVigente` filtra por `fechaInicio` / `fechaFin` contra la fecha de
referencia, y `useTarifas` solo baja `activo == true` con `fechaFin == null` o
`fechaFin >= hoy − 60d`. **La vieja vencida ya no compite con la nueva.** Es la
única pieza de la llave que ya funciona.

### El impuesto del costo no existe como dato

`TarifaVermur` no tiene ningún campo de impuesto. El «60 MXN + IVA» que ve
Operaciones sale de texto libre (`condiciones`) o del rótulo del concepto.

---

## 1. Modalidad y presentación

**Los dos a nivel TARIFARIO, heredables por tarifa.** El tarifario es el
documento que el proveedor manda, y casi siempre es de una sola modalidad y
una sola moneda: preguntarlo una vez es lo que vuelve razonable confirmar 200
renglones.

Campos nuevos, **todos opcionales y aditivos**, en `TarifaVermur`:

```ts
modalidad?: 'maritimo' | 'aereo' | 'terrestre' | 'despacho';
presentacion?: Presentacion;      // ver §2
impuestoCosto?: number | null;    // tasa que cobra el proveedor. Solo se guarda.
```

Y en `documentosTarifario` (el tarifario), los valores que heredan sus tarifas:
`modalidad`, `moneda`, `presentacion` y `impuestoCosto` por omisión.

**La herencia se resuelve al CONFIRMAR, no al leer.** Cada tarifa guarda su
valor propio, copiado del tarifario. Si se resolviera al leer, cambiar el
tarifario reescribiría en silencio tarifas que ya se usaron en cotizaciones
vivas — el mismo pecado que el total guardado del bloque B.

---

## 2. «Aplica a cualquiera» es un valor, no un hueco

```ts
type Presentacion =
  | { tipo: 'cualquiera' }                                  // BL fee, pedimento, documentación
  | { tipo: 'contenedor'; valor: TipoContenedor }            // se reúsa
  | { tipo: 'unidad_terrestre'; valor: TipoUnidadTerrestre } // se reúsa
  | { tipo: 'suelto'; valor: 'bulto' | 'pallet' | 'm3' | 'tonelada' }
  | { tipo: 'aereo'; valor: 'kilo' | 'kilo_volumetrico'; rangoDesdeKg?: number };
```

Tres estados que **no se confunden**:

| Estado | Qué significa | Qué hace la búsqueda |
|---|---|---|
| `presentacion` ausente | **Sin dato.** Nadie la declaró | **No se aplica sola.** Sale como «incompleta» |
| `{ tipo: 'cualquiera' }` | Declarado: aplica a todas | Empata siempre |
| Un valor concreto | Solo esa | Empata solo con esa |

Es la misma distinción de `costoCapturado` (§4.9): **un cero declarado no es un
campo vacío.** Sin ella, una tarifa vieja sin información se comportaría como
una tarifa universal, que es justo el bug que se está cerrando.

---

## 3. Unidad de cobro y presentación no se duplican

Responden a preguntas distintas y **conviven sin solaparse**:

| | Pregunta | Ejemplo |
|---|---|---|
| `UnidadTarifa` | **Cómo se cobra** | `CONTENEDOR`: el precio es por contenedor |
| `presentacion` | **A qué aplica** | `40hc`: ese precio es el del 40' High Cube |

Un flete marítimo es `unidad: CONTENEDOR` + `presentacion: 40hc`. Un almacenaje
puede ser `unidad: CBM` + `presentacion: cualquiera`. Y un BL fee es
`unidad: BL` + `presentacion: cualquiera`.

**Se relacionan pero no se derivan**, y por eso no se colapsan: `CONTENEDOR` no
dice cuál contenedor, y `40hc` no dice si se cobra por contenedor o por viaje.

Sí hay **coherencia que el formulario puede exigir**: `unidad: CONTENEDOR`
pide una presentación de contenedor o `cualquiera`; `PEDIMENTO` y `BL` casi
siempre son `cualquiera`. Se sugiere, no se impone.

`PreciosTarifa` ya trae `montoPor40` / `montoPor40HC` para el caso del
contenedor. **Eso se queda**: un renglón con los tres precios es una tarifa con
`presentacion: cualquiera` *dentro de FCL*. Si el tarifario trae un renglón por
tipo, cada uno lleva su presentación. Los dos caminos existen en la vida real.

---

## 4. Ruta: por id sí, por texto no

**Puertos por id** es exacto y ya está: `puertoOrigenId` / `puertoDestinoId`.

**`rutaTexto` no se empata nunca**, y lo propongo explícitamente. Es texto libre
—«Laredo–Querétaro», «LAREDO A QRO», «Nuevo Laredo, Tamps. → Querétaro»— y
cualquier normalización produce empates falsos, que es peor que no empatar: un
falso positivo trae el precio equivocado y nadie lo nota.

Para terrestre, dos salidas y prefiero la primera:

1. **Puntos terrestres como catálogo con id**, igual que los puertos. Ya está
   en la memoria del proyecto como pendiente: *«falta la lista de Vermur; llega
   junto con los consecutivos de Magaya»*. Con ids, terrestre empata igual que
   marítimo.
2. Mientras no exista: una tarifa con `rutaTexto` y sin puertos **no empata por
   ruta**, y el panel la muestra como «ruta sin catalogar — verifica a mano».
   Aparece, pero nunca se aplica sola.

---

## 5. Vigencia

Ya funciona (§0). Lo que falta es **decirlo en la pantalla**: cuando hay una
vigente y una recién vencida del mismo proveedor y concepto, el panel debería
enseñar las dos con la vencida marcada, no esconderla. Hoy `useTarifas` baja
las vencidas hasta 60 días atrás precisamente para eso, y el panel las descarta
sin avisar.

Cuando conviven vieja vencida y nueva: **gana la nueva y se dice** («hay una
anterior, vencida el 30-sep»). Esconder la vieja hace que nadie entienda por
qué el precio cambió.

---

## 6. Aéreo por rango de peso

Contemplado en `Presentacion` con `rangoDesdeKg`: `+45`, `+100`, `+300`. La
llave de búsqueda toma **el rango más alto cuyo umbral no supere el peso de la
carga** — que es como cotizan las aerolíneas.

Queda marcado como **pendiente de confirmar con Nohema**: si los tarifarios
traen además un mínimo (`M`) y un `N` (normal), son dos valores más, no una
estructura distinta.

---

## 7. Las tarifas que ya están cargadas

**Tu recomendación es la correcta y la suscribo:** nunca se aplican solas.

- Una tarifa sin `modalidad` o sin `presentacion` **no empata** con la llave.
- Aparece en el panel como **«incompleta»**, con la sugerencia inferida visible
  —«parece marítima, por sus puertos»; «parece contenedor, por su unidad»— y un
  clic para confirmarla.
- **La inferencia sugiere, nunca filtra.** Es la diferencia entre «no la
  encuentro» y «la escondí por una suposición mía».
- **Sin migración masiva.** Se completan al usarse, que es cuando alguien puede
  juzgar si la sugerencia es correcta.

Para saber cuántas son, dejé un script de solo lectura:

```bash
SERVICE_ACCOUNT=/ruta/serviceAccountKey.json \
  npx vite-node scripts/auditarTarifasIncompletas.ts
```

Cuenta tarifas y tarifarios sin modalidad, sin presentación, sin ruta
catalogable, y con qué inferencia quedarían. **No escribe nada.**

---

## 8. El wizard

El problema real no es capturar: es **confirmar 200 renglones sin ir uno por
uno**. La forma que propongo:

**Paso 1 — el tarifario, una vez.** Proveedor, **moneda**, **modalidad**,
presentación por omisión, `impuestoCosto` por omisión, vigencia. Cinco campos
para todo el documento.

**Paso 2 — la tabla, con lo heredado ya puesto.** Cada renglón llega con la
moneda, la modalidad y la presentación del paso 1. La columna de moneda
**existe pero viene llena**: cambiarla es marcar la excepción, no capturar el
caso normal.

**Paso 3 — confirmar en bloque, con las excepciones arriba.** La pantalla
separa «N renglones listos» de «M necesitan atención» —sin concepto resuelto,
sin proveedor, moneda distinta a la del tarifario, presentación que no encaja
con la unidad— y solo esos piden mirada. El botón dice **«Guardar los N
listos»** y deja los otros pendientes.

Lo que **no** cambia: sin `conceptoId` ni `proveedorId` resueltos no se guarda
(§4.10). Eso se queda tal cual.

**La moneda por tarifario es SOLO del tarifario.** La cotización sigue
aceptando conceptos en monedas distintas —está confirmado con un caso real, el
AMS con costo en MXN y venta en USD— y no se toca.

---

## 9. `impuestoCosto`

Entra en el mismo cambio de forma: se captura junto a la modalidad en el paso 1
del wizard, se hereda por tarifa, **se guarda y se muestra en el panel**, y
**nada lo usa en cálculos** por ahora.

Dónde debería usarse después, para el plan 2b:

1. **La orden de compra.** Hoy `oc.monto` es el costo pelón; lo que se le paga
   al proveedor incluye su IVA. Con el dato, la OC puede proponer el total con
   impuesto y el acreditable por separado.
2. **El cotejo contra la factura del proveedor.** `facturaDatos.subtotal` ya
   llega (bloque 11a). Con `impuestoCosto` se puede verificar que
   `subtotal × (1 + tasa) = total`, y avisar cuando no cuadra — hoy se compara
   contra `oc.monto` sin saber si lleva IVA dentro.
3. **El margen real.** `margenRealConcepto` compara antes de IVA; saber la tasa
   del costo evita que una factura con IVA se lea como un excedente.

---

## 10. Qué se publica, en qué orden

Cada paso se publica solo y se revierte solo.

| # | Qué | Riesgo | Punto de regreso |
|---|---|---|---|
| 1 | **Los campos**: `modalidad?`, `presentacion?`, `impuestoCosto?` en `TarifaVermur` y en el tarifario. Nadie los lee todavía | ninguno: son tipos | revert del commit |
| 2 | **La llave de búsqueda** (`lib/llaveTarifa.ts`), función pura con tests. Sin conectar | ninguno | revert |
| 3 | **El panel usa la llave**, y enseña «incompleta» con su sugerencia. **Aquí cambia lo que ve Pricing** | medio: tarifas que antes aparecían dejan de empatar — que es el arreglo | revert |
| 4 | **El wizard**: moneda/modalidad/presentación una vez, y confirmar en bloque | medio | revert |
| 5 | **Vigencia visible**: enseñar la vencida marcada en vez de esconderla | bajo | revert |
| 6 | **Puntos terrestres con id** — depende de la lista de Vermur | bloqueado | — |

**El 3 es el que resuelve el bug del Ams** y no necesita el 4. Si hay prisa,
1 → 2 → 3 y el wizard después.

---

## Lo que necesito de ti

1. **¿`Presentacion` como unión con `tipo`**, o un solo campo de texto con
   valores acordados? *Recomiendo la unión: impide «40hc» en una tarifa aérea.*
2. **¿La inferencia se guarda al confirmarla, o solo se sugiere cada vez?**
   *Recomiendo guardarla al confirmar: si no, alguien la confirma veinte veces.*
3. **Terrestre sin catálogo de puntos**: ¿va la salida 2 (no empata por ruta y
   se avisa) mientras llega la lista? *Recomiendo que sí.*
4. **Aéreo**: confirmar con Nohema si hay mínimo y normal además de los rangos.
