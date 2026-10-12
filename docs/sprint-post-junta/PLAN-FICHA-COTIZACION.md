# PLAN — La ficha de cotización y las escrituras que pisa el autoguardado (tarea 108)

12-oct-2026 · plan, cero cambios de código · rama `sprint/108-plan-autoguardado`

## 0. Resumen

La ficha trabaja con una **copia local** de la cotización y la reescribe
**entera** en cada guardado. Lo que otro camino escribe mientras la ficha está
abierta no se ve y, en cuanto alguien edita algo, se pierde. Reproducido en el
emulador (§3): una nota externa desaparece cuando la ficha guarda otra.

Recomendación: **patch por lo que ESTA edición tocó, con las listas con `id`
(actividades, chat, pdfs) fusionadas por `id` dentro de una transacción**,
después adoptar del listener lo que la persona no está editando, y al final un
aviso cuando dos personas tocaron lo mismo. Cuatro pasos publicables por
separado (§6). No requiere cambio de modelo, reglas, índices, Functions ni n8n.

## 1. Cómo funciona hoy (verificado en el código)

  - La ficha pinta `quote`, que es la prop del host. Los tres hosts —`Quotes.tsx:1415`,
    `BandejaPricing.tsx:368`, `KanbanCotizaciones.tsx:321`— guardan la cotización
    abierta en su propio `selectedQuote` y, en cada guardado, hacen
    `setSelectedQuote(updated)` (`Quotes.tsx:1431`, `BandejaPricing.tsx:331`,
    `KanbanCotizaciones.tsx:229`).
  - Del listener solo se adopta algo cuando **cambia el número de versión**:
    `alDiaConVersion` (`lib/versionesCotizacion.ts:354`). Todo lo demás que
    llegue del listener se ignora mientras la ficha esté abierta.
  - Cada acción de la ficha manda la cotización entera:
    `onUpdateQuote({ ...quote, actividades: [...], updatedAt })`
    (`FichaCotizacion.tsx:699, 713, 718, 735, 903…1196, 2097…2826`).
  - `updateCotizacion` (`hooks/useCotizaciones.ts:72-119`) hace `updateDoc` con
    ese objeto completo, sin los campos de versión. Un `updateDoc` con claves
    explícitas **reemplaza** el valor de cada clave que viaja: `actividades`,
    `chat`, `pdfs`, `servicios`, `valorTotalConsolidado`… llegan con el valor
    que la copia local tenía al abrirse.
  - Las guardas que existen (`guardadoAtrasado`, `estaCongelada` con
    `cambiosBloqueados`) comparan contra el listener, pero solo cubren la
    **versión** y el **congelado**; no detectan ningún otro campo cambiado.

## 2. Qué escrituras a `cotizaciones/{id}` existen y cuáles se pierden

Las Cloud Functions **no** escriben en `cotizaciones` (grep en `functions/src`:
cero). Todo es del navegador.

| # | Escritura | Archivo:línea | Forma | ¿La pisa la ficha? | ¿Pisa a la ficha? |
|---|---|---|---|---|---|
| 1 | Autoguardado de la ficha (todas las acciones) | `Quotes.tsx:1427` → `useCotizaciones.ts:113` | `updateDoc`, documento entero | — | **Sí**: pisa todo lo que otro escribió en las claves que lleva (casi todas) |
| 2 | Kanban / Bandeja: mover etapa, consolidar, editar | `Quotes.tsx:130`, `KanbanCotizaciones.tsx:220,228`, `BandejaPricing.tsx:330,362` | `updateDoc`, entero, desde la lista del listener | Sí, si la ficha de OTRO usuario está abierta | La ficha propia queda con la etapa vieja y la reescribe al siguiente guardado |
| 3 | Marcar ganada sin embarque automático | `Quotes.tsx:174` | `updateDoc`, entero | Igual que 1 | Igual que 1 |
| 4 | **PDF generado** | `usePdfCotizacion.ts:110` | `updateDoc` con `arrayUnion(pdfs)` | **Sí, y es el caso más probable**: la ficha no adopta `pdfs`, así que ni lo muestra, y el siguiente guardado manda `pdfs` viejo y borra el registro (el archivo queda huérfano en Storage) | n/a |
| 5 | Nueva versión / restaurar | `useVersionesCotizacion.ts:85` | `tx.update(patch)` en transacción | Cubierto por `alDiaConVersion` + `guardadoAtrasado` | Cubierto |
| 6 | Abrir embarque a mano | `Shipments.tsx:302` | `updateCotizacion({ embarqueIds: [...quote.embarqueIds, id] })` — lee-modifica-escribe sobre una copia posiblemente vieja | Dos aperturas casi simultáneas: gana la última, un `embarqueId` se pierde y la cotización se congela mal | La ficha abierta queda sin `embarqueIds`; su siguiente guardado los BORRA (el congelado se pierde) |
| 7 | Ganada con embarque automático | `crearEmbarquesGanada.ts:152` | `tx.set(..., { merge: true })` con `{ ...p.quote, embarqueIds }`: **la cotización entera** que traía el llamador | Sí: reescribe todos los campos con la copia del llamador | Igual que 1 |
| 8 | Contrato, fechas deseadas, notas operativas, vincular cliente | `SeccionContrato`, `FechasDeseadas`, `OperacionServicio` | Todos por `onUpdateQuote` → es el caso 1 | Igual que 1 | Igual que 1 |
| 9 | Alta | `useCotizaciones.ts:56`, `Quotes.tsx:123` | `setDoc` (documento nuevo) | No aplica | No aplica |

Qué se pierde, en concreto, si la ficha está abierta en otra pestaña/usuario:
  - **Notas, actividades y chat** que otra persona agregó (listas completas).
  - **El registro de un PDF** generado desde otra pestaña (o la propia: el caso 4
    ocurre incluso con UNA sola persona, generar PDF y luego escribir una nota).
  - **Cambios de `servicios`** (tarifas, líneas, tipo de cambio) de otro usuario.
  - **`embarqueIds`** (se descongela la cotización).
  - Etapa, responsables, `valorTotalConsolidado`: cualquier campo que la copia
    local tenga distinto del servidor.

## 3. Caso reproducible en el emulador

Reproducido el 12-oct con `./scripts/dev-emuladores.sh` y un spec Playwright
desechable (no se versiona; el cuerpo es lo de abajo). La «otra pestaña» se
simula con un PATCH REST al emulador de Firestore, que es exactamente lo que ve
el listener cuando otro usuario guarda.

Pasos (admin@vermur.com, COT-2026-0002 sembrada):
  1. Entrar, CRM → Cotizaciones → abrir COT-2026-0002 → pestaña «Historial / Notas».
  2. Desde fuera: `PATCH …/cotizaciones/COT-2026-0002?updateMask.fieldPaths=actividades`
     con las actividades actuales + una nota `act-EXTERNA` («Nota de OTRO usuario»).
     Header `Authorization: Bearer owner`.
  3. Esperar 2 s (el listener ya la trajo). **La ficha no la muestra**
     (`getByText('Nota de OTRO usuario')` → 0 coincidencias).
  4. En la ficha escribir «Nota local» y pulsar «Agregar nota».
  5. Leer el documento por REST.

Resultado observado:

```
RESULTADO externaVisibleEnFicha= 0 ids= ["act-002-1","act-note-1791820072675"]
```

`act-EXTERNA` desapareció. (Una primera corrida donde la nota local no se
envió dejó `["act-001-1","act-EXTERNA"]`: confirma que la externa SÍ había
llegado a Firestore antes del guardado.)

No se reprodujo, pero se **deriva del código** (§2 fila 4) el caso del PDF:
generar PDF → escribir una nota → el registro de `pdfs` desaparece. Es la
primera comprobación del paso 1 del plan.

## 4. Opciones

### A. Guardar solo lo que esta edición tocó (patch)
La ficha ya sabe qué cambió: la prop antes del cambio (`quote`) contra el objeto
nuevo que manda a `onUpdateQuote`. Se calcula el diff por clave de primer nivel
y solo esas claves viajan. Las listas con `id` (`actividades`, `chat`, `pdfs`)
se fusionan **por id** en una transacción sobre el documento del servidor:
agregar = agregar si no está, editar/quitar = por id. Así una nota ajena nunca
se pierde aunque la lista local esté vieja.
  - **Arregla:** casos 1, 3, 4, 8 (la repro y el PDF) y, con los demás
    escritores migrados al mismo camino, 2, 6 y 7.
  - **No arregla:** que la ficha *muestre* lo ajeno, ni dos personas que editen
    el mismo campo (`servicios` entero es un campo; sigue ganando el último).
  - **Costo:** medio. Una función pura de diff + merge con tests, una
    transacción en `updateCotizacion`, y pasar `anterior` desde los tres hosts.
    Riesgo: las guardas de congelado y versión tienen que seguir comparando
    contra el servidor; `sanitizarParaFirestore` en cada valor del patch; un
    `serverTimestamp`/`updatedAt` mal puesto marca todo como tocado.

### B. Adoptar del listener lo que no está en edición
Mantener un `base` (último servidor visto) y, en cada snapshot, fusionar por
campo: si local == base se toma el del servidor; si local != base (la persona lo
tocó) se conserva el local.
  - **Arregla:** que la ficha muestre lo ajeno (notas, PDF, etapa nueva) y evita
    reescribir valores viejos de campos que nadie tocó.
  - **No arregla** por sí sola los casos 6 y 7 (escritores que no son la ficha) y
    deja una ventana: lo que llega entre el snapshot y el clic.
  - **Costo:** medio-alto. Hay que mover la copia local de los hosts a la ficha
    (o a un hook compartido con `tiendaCotizaciones`), porque hoy tres lugares
    guardan `selectedQuote`. Más riesgo de regresión visual: el texto que la
    persona está tecleando no debe resetearse al llegar un snapshot.

### C. Aviso «esta cotización cambió»
Comparar el documento del listener contra el `base`; si difiere en algo que la
ficha no tiene, mostrar una franja ámbar: «Otra persona modificó esta
cotización (notas, PDF…). [Ver cambios] [Recargar]». Sin cambiar cómo se guarda.
  - **Arregla:** que nadie pise a ciegas; deja la decisión a la persona.
  - **No arregla** la pérdida si la persona ignora la franja, ni el caso del PDF
    propio (no hay «otro» que avisar).
  - **Costo:** bajo (una comparación y un componente), pero es un paliativo.

### Recomendación
**A primero, B después, C como red de seguridad del conflicto genuino** (dos
personas en `servicios`). A es lo que detiene la pérdida de datos, que es el
daño real; B hace que la pantalla diga la verdad; C cubre lo que ninguna
fusión automática puede decidir. Hacer solo C dejaría la pérdida y le pondría
un cartel; hacer solo B exige el refactor grande antes de ganar nada.

## 5. Decisiones de negocio y de modelo

  - **Modelo: ninguno.** No se propone `revision` ni campo nuevo. (Un contador
    de revisión haría más fuerte el control optimista, pero requiere
    «Modelo aprobado»; se anota como alternativa en §8.)
  - **Reglas/índices/Functions/n8n: ninguno.**
  - Sin decisión de negocio abierta. Sí una de producto: ¿en un conflicto sobre
    `servicios` gana el último (como hoy, con aviso) o se bloquea el guardado
    hasta recargar? Recomendación: último gana **con aviso** en el paso 4; el
    bloqueo estorba a Pricing mientras captura precios.

## 6. Pasos publicables por separado

Cada uno con `CI=1 npm test`, `tsc`, build y `./scripts/e2e.sh`; validación de
Mau antes del siguiente (regla de oro). Ningún paso exige reglas ni deploy de
Functions: es **hosting** en todos.

**P1 · Diff y fusión puros, sin cambiar comportamiento.**
`lib/diffCotizacion.ts`: `tocados(anterior, nuevo)` por clave de primer nivel;
`fusionarListaPorId(servidor, anterior, nuevo)` para actividades/chat/pdfs. Tests
que codifican la repro (nota externa + nota local → quedan las dos) y el PDF.
Nadie lo llama aún. *Punto de regreso:* borrar el archivo. *Valida Mau:* nada
visible; los tests son la evidencia.

**P2 · `updateCotizacion` escribe solo lo tocado.**
Parámetro opcional `anterior`; con él, transacción: leer servidor, aplicar solo
las claves tocadas y fusionar las listas por id; sin él, comportamiento de hoy.
La ficha pasa `quoteViva` como `anterior`; los tres hosts lo propagan. El
congelado y `guardadoAtrasado` se evalúan contra el documento leído en la
transacción. *Punto de regreso:* los hosts dejan de pasar `anterior` (una línea
por host) o `git revert` del paso. *Valida Mau:* repetir §3 en dos pestañas
reales: la nota de la otra pestaña sobrevive; generar un PDF y luego escribir
una nota: el PDF sigue en «PDF generados».

**P3 · Los otros escritores salen del documento entero.**
`crearEmbarquesGanada.ts:152` escribe solo `etapa`/campos de ganada y
`embarqueIds`; `Shipments.tsx:302` usa `arrayUnion` para `embarqueIds`;
`Quotes.tsx:174` y la Bandeja/Kanban pasan `anterior`. *Punto de regreso:*
revert del paso. *Valida Mau:* marcar ganada (con el interruptor apagado y
encendido en emulador) deja los mismos campos que antes y no borra notas
agregadas durante la operación; abrir dos embarques seguidos conserva los dos ids.

**P4 · La ficha adopta lo ajeno y avisa del conflicto.**
`base` + fusión por campo del listener (opción B) en un hook que sustituye a
`alDiaConVersion`, con la regla de no tocar lo que la persona está tecleando; y
la franja ámbar (opción C) cuando el mismo campo cambió en las dos copias.
Este es el único paso con riesgo visual: se hace con capturas antes/después.
*Punto de regreso:* volver a `alDiaConVersion` (el hook es un reemplazo directo).
*Valida Mau:* con dos pestañas, la nota/PDF/etapa de la otra aparece sola en la
primera sin recargar y sin perder lo que se estaba escribiendo; si ambas
editan una tarifa, sale la franja.

Orden recomendado: P1 → P2 → (publicar y validar) → P3 → P4. P2 solo ya
elimina la pérdida de datos; P3 y P4 pueden esperar.

## 7. Riesgos de romper lo existente

  - `servicios` sigue siendo un campo atómico: no se fusiona por dentro.
    Comportamiento de hoy, ahora explícito.
  - `updatedAt` cambia en cada guardado; no debe contar como «tocado» por sí
    solo (el diff lo ignora si es la única diferencia).
  - Versiones (§4.11) y congelado (§4.8): sus guardas ya viven en
    `updateCotizacion`; la transacción debe correrlas sobre el documento leído.
    Hay tests de ambas que deben seguir en verde sin cambios.
  - El recorrido e2e (`./scripts/e2e.sh`) toca la ficha en todos los roles; es
    la red de P2 y P3.
  - `KanbanCotizaciones`/`BandejaPricing` reciben listas del listener y buscan
    «el primero que cambió por referencia» (`Quotes.tsx:124`): con `anterior`
    ese heurístico se puede retirar, pero eso es un cambio aparte.

## 8. Hallazgos fuera de la tarea (anotados, sin tocar)

  - Un contador `revision` en la cotización permitiría control optimista
    estricto (rechazar si el servidor avanzó). Pide «Modelo aprobado».
  - `updatedAt` tiene resolución de minuto y es texto local del navegador; no
    sirve como marca de concurrencia.
  - El mismo patrón (copia local + documento entero) probablemente existe en la
    ficha de embarque y la de orden de compra; no se revisó.
  - El registro de PDF que no se ve tras generarlo (la ficha no adopta `pdfs`)
    puede estar detrás de la nota de §6 de CLAUDE.md «PDF generados repite el
    mismo nombre»: dos generaciones que la persona cree no hechas.
