# Plan — Línea de tiempo de eventos del embarque (vocabulario DCSA)

Tarea 116 del sprint (15-oct-2026). **Solo plan: cero cambios de código.**
Puntos 4 y 5 de Mau. Todo lo marcado «para aprobación» es modelo propuesto;
nada se agregó a `EmbarqueCompleto`.

## 0. Advertencia sobre los códigos DCSA (léela primero)

La sesión que escribió este plan **no tuvo acceso a la web** (WebSearch y
WebFetch fueron denegados). La tarea pide citar de dónde salen los códigos y no
inventarlos. Lo honesto es esto:

- Los códigos de §2.2 vienen **de memoria** del estándar *DCSA Track & Trace*
  (familia 2.x: tres tipos de evento SHIPMENT / TRANSPORT / EQUIPMENT y
  clasificador PLN / EST / ACT). **No están cotejados** contra la fuente.
- **Fuente que hay que consultar antes de aprobar:** repositorio público de DCSA
  en GitHub (organización `dcsaorg`, repos `DCSA-OpenAPI` y
  `DCSA-Information-Model`), documento *Track and Trace* de la versión
  publicada **hoy**, y la página de estándares de dcsa.org. Ahí están las
  tablas de «event type codes» y el OpenAPI.
- **No verificado tampoco:** cuál es la versión vigente (mi recuerdo es 2.2 con
  una 3.0 en camino; podría haber cambiado). El modelo propuesto guarda el
  código **como texto** y la versión del estándar en un campo, así que un
  código mal recordado se corrige sin migrar nada.
- Acción para Mau o la sesión siguiente: abrir esas dos fuentes y marcar cada
  fila de §2.2 como ✔ o corregirla. Hasta entonces, ningún código de aquí es
  fuente de verdad.

## 1. Cómo está hoy

| Qué | Dónde | Quién lo mueve |
|---|---|---|
| Etapas: nuevo · cargado · en tránsito · en destino · entregado | `lib/estadoEmbarque.ts` (`ETAPAS_EMBARQUE`, `estadoDe`) | **Derivada**, con override manual |
| Override de etapa | `etapaOperativa` (`EmbarquesData.ts:445`), escrito por `patchParaEtapa` (`estadoEmbarque.ts`) | Operaciones, selector en la ficha (`FichaEmbarque.tsx:~742`) |
| Regla de derivación | cierre operativo → entregado; override; `requiereCaptura` → nuevo; `enTransito` + ETA ≤ hoy → en destino; `enTransito` → en tránsito; si no, cargado (`estadoEmbarque.ts`, `estadoDe`) | — |
| «En tránsito» | `enTransito` y `fechaEnTransito` (`EmbarquesData.ts:499-500`); botón `handleEnTransito` (`FichaEmbarque.tsx:~460`) | Operaciones, a mano |
| Fechas | `EmbarqueFechas` (`EmbarquesData.ts:80`): `salida` («estimada/real», **un solo campo**), `arribo` (ETA), `ordenGeneral`, `limiteDocumentacion`, `libreDemoras`, `libreAlmacenaje` | Operaciones, edición en la ficha (`FichaEmbarque.tsx:215-255`) |
| Cierres | `EmbarqueCierres` (`:89`): operativo, pago, administrativo; `alternarCierre` y cola en `lib/cierresEmbarque` | Operativo: Operaciones; pago y administrativo: Administración (§4.7) |
| Historial (`eventos`) | `EmbarqueEvento` (`:310`): `id, titulo, descripcion, fecha (texto 'YYYY-MM-DD HH:mm'), tipo: info\|alerta\|exito\|aduana`. Array **dentro** del documento | A mano: `handleAddEvento` (`FichaEmbarque.tsx:~398`); uno automático al nacer (`generacionEmbarque.ts:189`, `Shipments.tsx:159`) |
| Quién lo lee | Pestaña Historial (`FichaEmbarque.tsx:~1711`) y `VistaCliente.tsx:130` (lo que «saldría al portal») | — |
| Bitácora interna | `bitacora` + `conBitacora` (`lib/bitacoraEmbarque.ts`), distinta del historial por diseño (§4.14) | Sistema y notas |
| Fusión por id | `LISTAS_EMBARQUE_POR_ID` incluye `eventos` (`lib/diffEmbarque.ts:18`) | — |
| Contenedor | `DatosContenedor.numeroContenedor` dentro de `productos` (`:323`); buque/viaje en `ruta.origen` (`:47-49`) | Operaciones |
| Reglas | `firestore.rules:252`, `embarques/{id}`: `esDelEquipo()` en read/create/update; `delete: false` | — |

**Lo que contradice una lectura simple de la tarea:** ya existe algo llamado
`eventos`, pero **no es una línea de tiempo de hechos del transporte**: es un
historial de texto libre con cuatro «tipos» de color, sin código, sin
clasificación plan/estimado/real, sin ubicación y sin fuente. Y no hay
subcolecciones en `embarques/` hoy. Además `salida` y `arribo` mezclan estimado
y real en un solo campo: la ETA «real» sobrescribe a la estimada, así que
**no se puede medir cuánto se atrasó** un embarque.

Otro hallazgo: la etapa «en destino» se deduce de la ETA ya pasada
(`estadoDe`), no de que la carga haya llegado. Un buque retrasado aparece «en
destino» sin haber llegado.

## 2. Propuesta (para aprobación)

### 2.1 Subcolección `embarques/{id}/eventos/{eventoId}`

Subcolección y no array, por lo mismo que las versiones de la cotización
(§4.11): un embarque con rastreo por API recibe decenas de eventos, el array
engorda el documento que baja cada sesión y el Kanban, y dos escritores
(webhook y Operaciones) se pisarían. Cada evento es inmutable.

**Nombre:** `eventos` ya lo ocupa el historial del documento. Dos opciones;
**recomendación: `lineaTiempo`** para no confundir ambos durante la convivencia
(el historial viejo se queda, ver §3).

```ts
// MODELO PARA APROBACIÓN — nada de esto existe aún
interface EventoLineaTiempo {
  id: string;
  tipo: 'shipment' | 'transport' | 'equipment';       // familia DCSA
  codigo: string;                  // texto: 'ARRI', 'DEPA', 'LOAD'… (§2.2)
  clasificador: 'plan' | 'estimado' | 'real';          // PLN / EST / ACT
  fechaEvento: string;             // ISO 8601, con zona
  ubicacion?: {
    unlocode?: string;             // p. ej. 'MXZLO' (Manzanillo, a verificar)
    nombre?: string;               // texto respaldo, como entidades
    instalacion?: string;          // terminal; código SMDG si la fuente lo da
  };
  contenedor?: string;             // equipmentReference (ISO 6346), solo equipo
  transporte?: { buque?: string; viaje?: string; imo?: string; modo?: string };
  fuente: 'manual' | 'api';
  proveedorApi?: string;           // cuál, cuando fuente = 'api'
  idExterno?: string;              // id del evento en el proveedor (dedupe)
  versionEstandar?: string;        // p. ej. '2.2' (a verificar)
  creadoPor: { uid: string; nombre: string } | null;   // null si fue la Function
  creadoEn: string;                // ISO
  nota?: string;
  /** Corrección: apunta al evento que reemplaza. Nunca se edita el original. */
  reemplazaA?: string | null;
  visibleCliente?: boolean;        // ausente = false (ver plan del portal, 118)
}
```

Reglas de modelo: opcionales y aditivas; un evento **no se edita ni se borra**,
se corrige con otro que lo reemplaza (`reemplazaA`), como pide §4.10 de la
evidencia. `fechaEvento` es ISO, no el texto `'YYYY-MM-DD HH:mm'` del historial.

### 2.2 Vocabulario (⚠ de memoria, SIN verificar — ver §0)

| Tipo | Códigos que recuerdo | Qué es en Vermur |
|---|---|---|
| `transport` | `ARRI` (arribo), `DEPA` (salida) | Buque/avión/unidad sale o llega a un puerto; es lo que hoy son `fechas.salida` / `fechas.arribo` |
| `equipment` | `LOAD`, `DISC` (carga y descarga del contenedor), `GTIN`/`GTOT` (entra/sale de terminal), `STUF`/`STRP` (llenado y vaciado), `PICK`/`DROP` (recoger/entregar vacío), `INSP`, `RSEA`/`RMVD` (sello) | Movimientos del contenedor; `GTOT`+`PICK` cubren «retiro de puerto» |
| `shipment` | `RECE`, `DRFT`, `PENA`, `PENU`, `REJE`, `APPR`, `ISSU`, `SURR`, `SUBM`, `TRAN`, `CONF` | Ciclo del documento de transporte (instrucciones y BL); mapea a BL emitido / entregado, no a la carga |
| Clasificador | `PLN`, `EST`, `ACT` | plan · estimado · real |

Faltan cosas que **no son DCSA** y Vermur sí vive: pedimento pagado,
modulación (verde/rojo), liberación aduanal, entrega al cliente. **No se
inventa un código DCSA para ellas**: van con `codigo` en un espacio propio con
prefijo (`VERMUR_PEDIMENTO_PAGADO`, etc.), lista cerrada a definir con
Operaciones. Pregunta abierta G-1.

### 2.3 Lo que esto resuelve
- ETD/ETA: plan → estimado → real como **tres eventos**, no un campo
  sobrescrito; se puede medir el atraso.
- «En destino» deja de deducirse de la fecha: puede nacer de un `ARRI` real o
  `DISC` real.
- Es la fuente de la línea de tiempo del portal (tarea 118).

## 3. El riesgo grande: la etapa tiene reglas

Hoy la etapa depende de cierres, `enTransito`, ETA y `requiereCaptura`
(`estadoDe`), y alrededor hay reglas: el cierre operativo fija «entregado» e
impide regresar (`patchParaEtapa`), los tres cierres se evalúan contra OC y
facturas (`cierresEmbarque`), y el freno de cliente/expediente (§4.18) corre al
abrir el embarque, no por la etapa. Si el estatus pasara a derivarse del último
evento, se rompería:

1. **Un evento tardío o fuera de orden cambia la etapa hacia atrás** (un
   `LOAD` estimado llega después de un `ARRI` real). La etapa pasa a ser función
   del orden de llegada y no de la realidad.
2. **El cierre operativo** (decisión de Operaciones con consecuencias) quedaría
   subordinado a un dato externo.
3. **Un proveedor equivocado** (cobertura mala en un puerto) cambiaría el
   Kanban de todos sin que nadie lo decida.
4. El Kanban, los filtros guardados (`etapaOperativa`) y los reportes asumen
   cinco etapas; ningún evento DCSA se mapea 1 a 1 a ellas.
5. Los embarques existentes no tienen eventos: derivar vaciaría su etapa.

**Convivencia propuesta (recomendación: es la única que no rompe nada):**

- **La etapa capturada sigue mandando.** `estadoDe` no cambia en esta fase.
- Los eventos la **alimentan como sugerencia**: si hay un evento real que
  implica una etapa más avanzada que la actual (`DEPA` real → en tránsito;
  `ARRI`/`DISC` real → en destino), la ficha muestra «El rastreo indica: en
  tránsito · [Aplicar]» y Operaciones decide. Función pura
  `etapaSugeridaPorEventos(eventos)`, con tests, sin escribir nada.
- Una sugerencia **nunca retrocede** la etapa y **nunca toca los cierres**.
- Si Mau decide después que derive, es un cambio de una función
  (`estadoDe` lee la sugerencia) detrás de un interruptor, como el de embarque
  automático (§4.31), apagado por omisión.
- Mientras convivan, `fechas.salida` y `fechas.arribo` siguen siendo la
  verdad para `diasLibres`, el filtro por mes de cierre (§4.25) y la
  notificación de arribo. Un evento `real` de `DEPA`/`ARRI` puede **proponer**
  actualizarlas, no las escribe solo.

## 4. Rastreo por API (punto 5) — solo el diseño del punto de entrada

Sin elegir proveedor.

- **Function `recibirEventoRastreo`** (`onRequest`, us-central1), pública en la
  red y cerrada en el código, como `extraerTarifas` (§4.10): valida un secreto
  compartido en header (`defineSecret`; **no se crea hasta tener proveedor**:
  una Function con secreto inexistente tumba el deploy de todas, §3), no usa
  token de usuario.
- **Contrato de entrada neutral:** el proveedor no define nuestro modelo. Un
  adaptador por proveedor traduce su payload a `EventoLineaTiempo`; el cuerpo
  de la Function es único. Si el proveedor habla DCSA, el adaptador es casi
  identidad.
- **Cómo encuentra el embarque:** por número de contenedor, BL/booking
  (`numeroGuia`, `numeroReservacion`) o referencia que Vermur registró al
  suscribir. Sin coincidencia única: el evento va a una cola
  `eventosSinEmbarque/` para revisión; **no se adivina**. Dos embarques con el
  mismo contenedor = ambiguo, no se escribe.
- **Idempotencia:** `idExterno` + proveedor forman el id del documento
  (`set` con id determinista): reintentos y duplicados no multiplican eventos.
- **Escritura:** Admin SDK, `fuente: 'api'`, `creadoPor: null`. El navegador
  no escribe eventos de fuente `api` (regla, §5).
- **Respuesta rápida 2xx** y trabajo mínimo; un fallo se registra y se
  reintenta del lado del proveedor. Sin enviar correos ni cambiar etapa.
- Nada de esto se despliega hasta tener proveedor, secreto y la regla.

### Qué preguntarles a los proveedores (Mau, prueba de cobertura)
Prueba en **Manzanillo, Lázaro Cárdenas y Veracruz**, con contenedores reales
de Vermur de los últimos 60 días:
1. ¿Cubren esos tres puertos y sus terminales (cuáles)? ¿Eventos de **terminal**
   (gate-in/out, descarga) o solo del buque?
2. Por embarque probado: ¿qué eventos devolvieron, con qué retraso respecto a
   la realidad, y cuántos faltaron?
3. ¿Rastrean por número de contenedor, BL, booking o los tres? ¿Con qué
   naviera/NVOCC cubren (Maersk, MSC, Hapag, CMA, ONE, etc.)?
4. ¿Entregan por **webhook** (push) o solo consulta (polling)? ¿Reintentos y
   firma del mensaje?
5. ¿Hablan **DCSA T&T** (qué versión) o formato propio? ¿Traen UN/LOCODE y
   código de terminal?
6. ¿Estimados (ETA/ETD) además de reales? ¿Con cuánta anticipación y qué
   tan seguido se revisan?
7. ¿Cubren aéreo (AWB) y terrestre? (Vermur opera los tres.)
8. Precio: ¿por contenedor, por evento, por suscripción? ¿Costo de rastrear un
   embarque que no llega a puerto?
9. ¿Se puede dar de alta/baja el rastreo por API (automático al abrir
   embarque)? ¿Límites de tasa?
10. Datos y contrato: ¿quién conserva el histórico, permiten exportarlo, y qué
    pasa si cancelamos?
11. Evento de **pedimento / aduana mexicana** (modulación): ¿lo traen o no?
    (Probablemente no: seguiría siendo captura manual.)

## 5. Reglas que necesitaría (bloque exacto; NO se editó el archivo)

```
// dentro de match /embarques/{id} { ... }
match /lineaTiempo/{eventoId} {
  allow read:   if esDelEquipo();
  // Captura manual: solo fuente 'manual', inmutable después.
  allow create: if esDelEquipo()
                && request.resource.data.fuente == 'manual'
                && request.resource.data.creadoPor.uid == request.auth.uid;
  allow update: if false;   // se corrige con otro evento (reemplazaA)
  allow delete: if false;
}
```
Los eventos `api` los escribe el Admin SDK, que no pasa por reglas. Una
`lineaTiempo` bajo `embarques/{id}` **no** hereda las reglas del padre;
sin este bloque el catch-all la niega (§3: regla escrita ≠ regla publicada).
Hay que probarla en `tests/reglas/` (manual sí, `api` desde el cliente no,
update y delete no) y publicar **reglas antes que hosting**. Cuando existan
roles en reglas (plan 53) la captura manual debe pedir `embarque.generar`.
`eventosSinEmbarque/` solo lee el equipo y escribe el Admin SDK. Índice:
`collectionGroup` no hace falta; consulta por `fechaEvento` ordenada en una sola
subcolección usa índice simple automático.

## 6. Pasos publicables

| # | Paso | Despliega | Depende de |
|---|---|---|---|
| E1 | Cotejar códigos de §2.2 contra DCSA y fijar la lista | nada (docs) | Mau / sesión con red |
| E2 | Modelo `EventoLineaTiempo` + lib pura (`etapaSugeridaPorEventos`, validación, orden) con tests | nada | Aprobar modelo |
| E3 | Regla `lineaTiempo` + tests de reglas | reglas | E2; aprobar |
| E4 | Hook + pestaña «Línea de tiempo» en la ficha, captura manual (reusa el formulario de «Registrar hito») | hosting | E3 publicada |
| E5 | Sugerencia de etapa con botón «Aplicar»; propuesta de actualizar ETD/ETA | hosting | E4 |
| E6 | Bitácora: cada evento manual anota en la bitácora interna | hosting | E4 |
| E7 | `recibirEventoRastreo` + adaptador del proveedor elegido + `eventosSinEmbarque` | Functions (+ `defineSecret` ya creado) | Prueba de cobertura, elección de proveedor, regla |
| E8 | Alta automática del rastreo al abrir embarque | Functions/hosting | E7 |
| — | Que la etapa derive de eventos | — | **Decisión de Mau**, después de usar E5 un tiempo |

Cada paso es reversible por separado; E2-E6 no tocan Functions. Punto de
regreso: `git revert` del merge; los documentos de `lineaTiempo` creados
quedan sin leer (no estorban).

## 7. Preguntas

**Para Mau**
1. ¿Apruebas el modelo y el nombre `lineaTiempo`? *Rec.: sí.*
2. ¿Convivencia (etapa capturada manda, eventos sugieren)? *Rec.: sí; derivar
   solo tras un periodo de uso.*
3. ¿Qué hacemos con el historial viejo (`eventos`)? *Rec.: se queda para los
   hitos redactados al cliente; la línea de tiempo es otra cosa. Unirlos es
   decisión posterior (y de la 118).*
4. ¿Quién cotejará los códigos DCSA (E1)? Es prerrequisito de E2.

**Para Vermur (Operaciones)**
- Para cada embarque, ¿qué hitos anotan hoy y dónde (correo, Excel,
  WhatsApp)? ¿Cuáles querrían ver en una línea de tiempo?
- ¿Pedimento pagado, modulación, liberación y entrega al cliente son hitos que
  quieren registrar? ¿Alguno más (inspección, retención)?
- ¿Cuánto retraso aceptan en un evento «real» del proveedor antes de dejar de
  confiar en él?

## 8. Hallazgos fuera de la tarea
- `fechas.salida` y `fechas.arribo` mezclan estimado y real (no se mide atraso).
- «En destino» se deduce de ETA ≤ hoy, no de la llegada real.
- `EmbarqueEvento.fecha` es texto sin zona; `EmbarqueEvento.id` usa `Date.now()`.
- El historial acepta `tipo: 'aduana'` pero ningún flujo lo emite.
