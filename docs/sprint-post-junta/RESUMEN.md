# Sprint post-junta — resumen

Cinco bloques cerrados, dos planes escritos, seis bloques sin empezar.
**Nada se publicó**: main sigue en `2b3527d`, el commit que ya estaba en
producción antes de empezar.

## El estado que pediste al final

- **PASO 1 del margen real: publicado**, en el commit `20c28ce` (merge
  `74200b4`). Bundle `index-DyMfmBHE.js`, verificado contra la URL de
  producción. Es el que el bloque 5 debía reusar.
- **Corte de estado de `docs/ESTADO.md`: hecho**, commit `efebee4` (merge
  `2b3527d`), empujado y sin deploy. Le agregué el pendiente de seguridad de
  las URLs de Storage, como pediste.

## Tabla

| Bloque | Estado | Rama | Commit |
|---|---|---|---|
| 1 · Dos bloqueos de Pricing (1a, 1b) | **cerrado** | `sprint/pj-01` | `fc01d10` |
| 2 · Visibilidad de documentos | **cerrado** | `sprint/pj-02` | `731e5fa` |
| 3 · Impuesto por concepto | **cerrado** | `sprint/pj-03` | `7281a51` |
| 4 · Reordenar la ficha | **cerrado** | `sprint/pj-04` | `d27e7c1` |
| 5 · Cargos en horizontal | sin empezar | — | — |
| 6 · Tres ajustes del embarque | **cerrado** | `sprint/pj-06` | `cbabdfe` |
| 7 · Bitácora y Master/Hijo en Información | sin empezar | — | — |
| 8 · Patentes de agentes aduanales | sin empezar | — | — |
| 9 · Demoras y almacenajes calculados | sin empezar | — | — |
| 10 · Revisión de tarifarios en lote | sin empezar | — | — |
| 11 · Probar los agentes con documentos reales | **bloqueado** | — | — |
| Plan A · Monedas distintas | **escrito** | `sprint/pj-planes` | — |
| Plan B · Equipos como responsable | **escrito** | `sprint/pj-planes` | — |

Las ramas están encadenadas en orden: `pj-01` sale de `main`, `pj-02` de
`pj-01`, `pj-03` de `pj-02`, `pj-04` de `pj-03`, `pj-06` de `pj-04`, y
`pj-planes` de `pj-06`. Cada una se puede publicar sola y en ese orden.

## Orden en que te sugiero autorizar los merges

1. **`sprint/pj-01`** — Es lo único que desbloquea a Gaby *hoy*. Los dos
   bloqueos son de producción y ya le costaron una cotización trabada.
2. **`sprint/pj-04`** — Reordenar la ficha. Cero riesgo, se nota de inmediato
   y no depende de nada.
3. **`sprint/pj-06`** — Los tres ajustes del embarque. También barato, y quita
   los campos que confunden en importación.
4. **`sprint/pj-03`** — Impuesto por concepto. El más pedido, y el que más
   conviene que Pricing pruebe con calma antes de que llegue a un PDF.
5. **`sprint/pj-02`** — Visibilidad de documentos. Es preparación: hoy no sale
   a ningún lado, así que no corre prisa.
6. **`sprint/pj-planes`** — Solo documentos.

Si prefieres publicar en bloque, el orden de las ramas ya es correcto y un
merge de `sprint/pj-planes` arrastra todo lo anterior.

## Decisiones que necesito de ti

| # | Decisión | Mi recomendación |
|---|---|---|
| 1 | ¿Pricing puede marcar **perdida** una solicitud desde `solicitud_cliente`? Hoy no, por §4.11 | **Sí.** Si Pricing la abre y la avanza, también debería poder cerrarla. Es una línea |
| 2 | ¿Los documentos **sensibles** (factura de proveedor, carta de encomienda, pedimento) deben poder marcarse visibles? Hoy sí, con advertencia | **Dejarlo como está.** Prohibirlo obligaría a mandarlos por fuera, donde no queda rastro |
| 3 | Los **18 conceptos marcados «revisar»** salen «Sin determinar» siempre | Sesión con Administración para cerrarlos. Es catálogo, no código |
| 4 | El **subtotal de la factura de proveedor** no lo entrega el clasificador, así que el excedente nunca se dispara por factura | Agregarlo al flujo de n8n y a la conciliación. Es un campo |
| 5 | El **embarque no guarda tipo de cambio**, así que un costo en otra moneda nunca se compara | Heredarlo de la cotización al abrir el embarque |
| 6 | Divisa de referencia del profit consolidado (Plan A) | MXN, elegida una sola vez en Configuración |
| 7 | ¿El embarque de un **equipo** se queda en el equipo o se asigna al abrirlo? (Plan B) | Nace con el equipo; la primera persona que lo toca se lo queda |

## Preguntas para Vermur, para copiar y mandar

1. Cuando a un agente se le cotiza «con IVA incluido», ¿el renglón lleva la
   venta con IVA dentro y tasa 0%, o la venta antes de IVA y tasa 16%?
2. ¿La notificación de arribo y el booking se le mandan al cliente? Hoy nacen
   como documentos internos.
3. En el caso de AMS —costo en pesos, venta en dólares— ¿el tipo de cambio con
   el que deciden el precio es el mismo de la comparativa (el pricing rate con
   el colchón) o uno distinto?

## Lo que salté y por qué

**Bloque 11 — bloqueado.** Los tres archivos no están en `docs/`: ni la
factura de Asia Ship, ni la cotización VL-13712026, ni el COT-2026-0035 v1 EN.
Busqué por nombre y por patrón. **Pásame las rutas** y es lo primero que
retomo: es el único bloque que valida los agentes contra documentos reales.

**Bloques 5, 7, 8, 9 y 10 — sin empezar, por tiempo.** Dijiste que preferías
cinco cerrados y dos anotados a siete a medias, así que cerré los que cabían
completos —con tests, recorrido y reporte— en vez de dejar cinco a medio
camino. Notas de lo que ya sé de cada uno:

- **5 (cargos en horizontal)** es el más grande de los que faltan, y el que
  más valor tiene: reusa `lib/margenRealConcepto.ts`, que ya está publicado
  con los tres estados y el excedente. El mapeo que pediste —abierto =
  estimado, procesado = facturado, pagado = pagado— corresponde uno a uno con
  lo que ya calcula. La tabla a reusar es `TablaConceptos.tsx`, que el bloque
  3 acaba de tocar, así que conviene que salga después de `pj-03`.
- **8 (patentes)** es puramente aditivo y barato: una sección en la ficha del
  proveedor cuando el tipo es aduanal. Ojo con la deuda de §4.12: `TipoProveedor`
  no tiene `agente_aduanal`, así que «cuando el tipo es aduanal» hoy no se
  puede preguntar. Eso hay que resolverlo primero y toca los 544 proveedores.
- **9 (demoras y almacenajes)** necesita un campo de días libres en la
  cotización y el cálculo ETA + días en el embarque. El embarque ya tiene
  «Libre de Demoras» como fecha a mano, que es justo lo que se reemplaza.

## Verificación de los cinco bloques cerrados

Cada uno con el recorrido completo en emuladores limpios, tsc en la misma
línea base de 9 errores y build limpio.

| Bloque | Tests | Recorrido |
|---|---|---|
| 1 | 1464 | 6/6 |
| 2 | 1482 | 6/6 |
| 3 | 1506 | 6/6 |
| 4 | 1506 | 6/6 |
| 6 | 1520 | 6/6 |

De 1433 al empezar a 1520: **87 tests nuevos**, todos de lógica pura en
`src/lib/`.

El detalle de cada bloque —qué hice, qué decidí, qué validar y con qué
cuenta— está en `docs/sprint-post-junta/NN.md`.
