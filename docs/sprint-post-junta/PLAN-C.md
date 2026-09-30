# Plan C — Documentos operativos y talonario del HBL

Análisis, sin código. Fechado para el 16 de octubre. Los formatos reales de
Vermur todavía no llegan.

---

## 0. Contexto

Operaciones necesita generar seis documentos desde el embarque con un clic
(A-4 de `PLAN_OPERACION.md`). Los datos ya están en el modelo: entidades,
ruta, contenedores, fechas, mercancía, cargos. Lo que no existe es el motor
que los rellena ni el talonario de folios del HBL.

La pregunta es si los seis documentos comparten un mismo editor por bloques
— el «motor de plantillas» mencionado en §5 — o necesitan algo distinto.

---

## 1. ¿Un editor o seis generadores?

### Lo que tienen en común

Los seis documentos:
- se alimentan de los mismos datos del embarque,
- producen un PDF descargable / imprimible,
- se guardan en Storage como evidencia inmutable,
- se versionan (v1, v2) si se corrige algo y se regenera,
- necesitan configuración visual (logo, dirección, teléfono).

### Lo que los distingue

| Documento | Formato | Diferencia clave |
|---|---|---|
| HBL (House Bill of Lading) | Hoja preimpresa de AMACARGA | Impresión sobre papel físico, coordenadas en mm, folio externo |
| Booking Confirmation | PDF libre | Datos de reserva, naviera, contenedor, ETA |
| Notificación de arribo | PDF libre | Datos de arribo, consignatario, contenedores, aviso |
| Carta de encomienda | PDF con estructura fija | Una POR aduana y patente, firma del importador |
| Carta de porte | PDF regulado por SAT | Complemento Carta Porte CFDI, datos específicos |
| Formato 318 / NOM | PDF regulado por aduanas | Formato oficial, campos tabulados |

### Veredicto

**No es un editor por bloques genérico.** Un editor tipo «arrastrar secciones»
(como Notion o Google Docs) no resuelve los tres problemas duros:

1. **Coordenadas fijas del HBL**: la hoja preimpresa exige posicionar texto en
   coordenadas exactas en milímetros, con calibración por impresora.
2. **Documentos regulados**: la carta de porte y el 318 tienen estructura
   dictada por la autoridad; no son plantillas libres.
3. **Campos calculados**: IVA derivado, peso total, número de piezas, vigencia
   de tarifa, entidades condicionadas por rol.

Lo que sí conviene compartir es la **infraestructura**: el pipeline de
generación (datos → HTML/plantilla → Gotenberg → PDF → Storage), el sistema
de versionado, y la configuración de la empresa. Cada documento tiene su
propia plantilla, pero todos pasan por el mismo tubo.

### Arquitectura propuesta

```
                    ┌──────────────────────────────────┐
                    │  Datos del embarque (Firestore)   │
                    └─────────────┬────────────────────┘
                                  │
                    ┌─────────────▼────────────────────┐
                    │  lib/payloadDocumento.ts          │
                    │  (arma el JSON por tipo)          │
                    └─────────────┬────────────────────┘
                                  │
                    ┌─────────────▼────────────────────┐
                    │  clasificarDocumento              │
                    │  (Cloud Function, proxy a n8n)    │
                    │  X-Vermur-Flujo: generar-{tipo}   │
                    └─────────────┬────────────────────┘
                                  │
                    ┌─────────────▼────────────────────┐
                    │  n8n: plantilla HTML + Gotenberg  │
                    │  (un flujo por tipo de documento) │
                    └─────────────┬────────────────────┘
                                  │
                    ┌─────────────▼────────────────────┐
                    │  PDF binario de vuelta            │
                    │  Storage: embarques/{id}/docs/    │
                    │  Firestore: embarque.documentos[] │
                    └──────────────────────────────────┘
```

Mismo patrón que el PDF de la cotización. La función `clasificarDocumento` ya
despacha por `X-Vermur-Flujo`; cada documento nuevo es un flujo en n8n con
su propio webhook. El proxy (`proxyN8n.ts`) funciona igual: binario de ida y
vuelta, validación de `%PDF-`, error nombrado por tipo.

---

## 2. Documento por documento: qué datos lo alimentan

### 2.1 Booking Confirmation

**Aplica a:** marítimo FCL y LCL.
**Cuándo se genera:** al capturar la reserva (antes del zarpe).

| Dato | Campo del embarque | Existe hoy |
|---|---|---|
| Shipper | `entidades.expedidor` | Sí |
| Consignee | `entidades.consignatario` | Sí |
| Notify Party | `entidades.notificar` | Sí |
| Booking Number | `numeroReservacion` | Sí |
| Carrier / Naviera | `ruta.origen.transportista` | Sí |
| Vessel / Voyage | `ruta.origen.buque`, `ruta.origen.viaje` | Sí |
| POL | `ruta.origen.puertoCarga` | Sí |
| POD | `ruta.destino.puertoDescarga` | Sí |
| ETD | `fechas.salida` | Sí |
| ETA | `fechas.arribo` | Sí |
| Cargo description | `descripcionCarga` | Sí |
| Container type & qty | `productos[].datosContenedor` | Sí |
| Weight / Volume | `productos[].peso`, `productos[].volumen` | Sí |
| Cut-off dates | `fechas.limiteDocumentacion` | Sí |
| Instrucciones especiales | — | **No** |

**Campo faltante:**
- `instruccionesBooking?: string` — texto libre para instrucciones especiales
  de la reserva (temperatura, mercancía peligrosa, etc.). Opcional.

### 2.2 Notificación de arribo

**Aplica a:** marítimo y aéreo.
**Cuándo se genera:** al confirmar ETA, se envía al cliente.

| Dato | Campo del embarque | Existe hoy |
|---|---|---|
| Consignee (destinatario del aviso) | `entidades.consignatario` | Sí |
| Client (a quien se notifica) | `entidades.clienteCobrar` | Sí |
| BL / AWB number | `numeroGuia` | Sí |
| Vessel / Flight | `ruta.origen.buque` | Sí |
| POL → POD | `ruta.origen.puertoCarga` → `ruta.destino.puertoDescarga` | Sí |
| ETA | `fechas.arribo` | Sí |
| Containers | `productos[].datosContenedor` | Sí |
| Free days demurrage | `diasLibresDemora` | Sí |
| Free days storage | `diasLibresAlmacenaje` | Sí |
| Cargo description | `descripcionCarga` | Sí |
| Weight / Volume / Pieces | `productos[]` | Sí |
| Instrucciones de entrega | — | **No** |

**Campo faltante:**
- `instruccionesEntrega?: string` — texto libre: «entregar a bodega X»,
  «documentos originales requeridos», «certificado fumigación necesario», etc.

**Pregunta para Vermur (RESUMEN.md #2, sin respuesta):**
> ¿La notificación de arribo y el booking se le mandan al cliente? Hoy
> nacen como documentos internos.

Si se mandan, deben llevar el logo y datos de contacto de Vermur, y la
visibilidad del documento en el embarque es `visibleCliente: true`.

### 2.3 Carta de encomienda

**Aplica a:** solo navieras, una POR aduana y POR patente de agente aduanal.
**Cuándo se genera:** antes del despacho aduanal.

| Dato | Campo del embarque | Existe hoy |
|---|---|---|
| Importador / Exportador | `entidades.importador` / `entidades.expedidor` | Sí |
| RFC del importador | `entidadesRef.importador` → `clientes/{id}.rfc` | Sí (vía ref) |
| Agente aduanal | `entidades.agenteAduanal` | Sí |
| Patente del agente | — | **No en el embarque** |
| Número de patente | — | **No en el embarque** |
| Aduana de despacho | — | **No directamente** |
| BL number | `numeroGuia` | Sí |
| Containers | `productos[].datosContenedor` | Sí |
| Cargo description | `descripcionCarga` | Sí |
| Valor declarado | `valorDeclarado` | Sí |
| Firma del importador | — | **No** |

**Campos faltantes — varios:**

1. **Patente del agente aduanal en el embarque.** La patente es propiedad del
   proveedor (tarea 11 ya agregó `patentes[]` al modelo de proveedor), pero
   un agente aduanal puede tener varias patentes y hay que elegir CUÁL aplica
   a ESTE embarque.
   - **Propuesta:** `aduanalPatente?: { nombre: string; numero: string }` en el
     embarque (elegida del catálogo de patentes del proveedor vinculado, o
     tecleada). Una por embarque, porque un mismo embarque pasa por una sola
     aduana.

2. **Aduana de despacho.** Hoy `ruta.aduana` solo tiene `pedimento` y
   `pedimentos[]`. La aduana (por nombre y código) no está como campo.
   - **Propuesta:** `ruta.aduana.nombre?: string` y `ruta.aduana.codigo?: string`.
     Se elige del catálogo de puertos (los puertos con aduana) o se teclea. No
     confundir con `ruta.destino.puertoDescarga`: el puerto de descarga puede
     ser Manzanillo, pero la aduana de despacho puede ser la del aeropuerto si
     se trasladó.

3. **Firma digital del importador.** No es un campo del modelo; es un tema de
   workflow (el importador firma un PDF) o un campo de imagen. Por ahora se
   imprime y se firma a mano. Queda fuera de esta iteración.

**Regla especial:** se genera UNA carta por combinación aduana + patente. Si
un embarque pasa por dos aduanas (un transbordo con despacho en cada punto)
o usa dos patentes distintas, son dos cartas de encomienda. Esto implica que
la carta de encomienda NO es un campo del embarque sino una generación
parametrizada. El payload dice: «genera la carta de encomienda para este
embarque con esta aduana y esta patente».

### 2.4 Carta de porte

**Aplica a:** terrestre nacional.
**Cuándo se genera:** antes del transporte (la transportista la necesita).

El Complemento Carta Porte (CCP) del SAT es un CFDI. En su versión completa
requiere timbrado (UUID fiscal), lo cual depende del PAC que Vermur todavía
no tiene contratado (bloqueante B-5 de `PLAN_OPERACION.md`).

Lo que sí se puede hacer sin PAC: generar el **pre-llenado** — el PDF con
todos los datos que irían en el CCP, para que la transportista lo valide
antes de que se timbre.

| Dato | Campo del embarque | Existe hoy |
|---|---|---|
| Remitente | `entidades.expedidor` | Sí |
| Destinatario | `entidades.consignatario` | Sí |
| RFC remitente / destinatario | `entidadesRef` → catálogo | Sí (vía ref) |
| Origen (dirección completa) | — | **No** |
| Destino (dirección completa) | — | **No** |
| Transportista (RFC, permiso SCT) | `ruta.origen.transportista` (nombre) | **Solo nombre** |
| Vehículo (placa, año, config.) | `ruta.origen.numeroVehiculo` | Parcial |
| Operador (CURP, licencia) | `ruta.origen.nombreChofer` (solo nombre) | **Solo nombre** |
| Mercancía (claves SAT, pesos) | `productos[]`, `descripcionCarga` | Parcial |
| Clave producto SAT | — | **No** |
| Unidad de peso SAT | — | **No** |
| Peso bruto / neto | `productos[].peso` | Solo bruto |
| Valor de la mercancía | `valorDeclarado` | Sí |
| Seguro | — | **No** |
| Distancia recorrida (km) | — | **No** |

**Campos faltantes — muchos, y regulados por el SAT:**

La carta de porte necesita claves del catálogo del SAT para:
- tipo de mercancía (`ClaveProdServCP`)
- unidad de peso (`ClaveUnidadPeso`)
- tipo de permiso SCT del transportista
- configuración vehicular
- tipo de remolque

Esto no se improvisa: cada campo tiene un catálogo del SAT que hay que
incorporar. **Recomendación: la carta de porte se construye DESPUÉS de que
se contrate el PAC**, porque sin timbrado el documento no tiene valor fiscal
y Vermur seguirá usando el de su transportista.

**Mientras tanto:** se puede generar un PDF informativo con los datos que sí
existen, etiquetado como «borrador — sin validez fiscal», útil para revisar
la información antes de que se timbre en el sistema del PAC.

### 2.5 Formato 318 / NOM

**Aplica a:** despacho aduanal (importación).
**Cuándo se genera:** como parte del paquete de documentación aduanal.

El formato 318 es un documento aduanal regulado. Su estructura la define el
SAT y es específica para la verificación de cumplimiento de NOMs. Es
tabulado, con campos muy específicos.

| Dato | Campo del embarque | Existe hoy |
|---|---|---|
| Importador | `entidades.importador` | Sí |
| Agente aduanal / Patente | `entidades.agenteAduanal` + patente | Parcial |
| Pedimento | `ruta.aduana.pedimento` / `pedimentos[]` | Sí |
| Descripción mercancía | `productos[]` | Sí |
| Fracción arancelaria | — | **No** |
| NOM aplicable | — | **No** |
| País de origen | — | **No** |
| Marca y modelo | — | **No** |
| Datos del laboratorio | — | **No** |
| Resultado de la verificación | — | **No** |

**Campos faltantes — los más específicos.**

Aplica lo mismo que con la carta de porte: es un documento con campos
regulados que requieren catálogos del SAT (fracciones arancelarias, NOMs).
Además, involucra datos del laboratorio de verificación que no son del
embarque ni del catálogo de Vermur.

**Recomendación: el 318 es el último de los seis.** Requiere: (a) el
catálogo de fracciones arancelarias, (b) integración con el agente aduanal
que llena la mayor parte, y (c) datos que no se capturan hoy. Se deja para
después de que el agente aduanal entregue sus formatos reales.

### 2.6 HBL (House Bill of Lading)

El más complejo de los seis. Tiene sección propia (§3).

---

## 3. El HBL y su talonario

### 3.1 El papel: FBL de AMACARGA

El FBL (FIATA Bill of Lading) es papel preimpreso de AMACARGA (Asociación
Mexicana de Agentes de Carga). Viene en talonarios numerados. El folio
(044903, 044930…) ya está impreso en rojo en la hoja. **El sistema no genera
el folio; registra cuál hoja se usó.**

Es un documento negociable: un HBL perdido o mal anulado tiene consecuencias
legales. Por eso los huecos no se borran y las cancelaciones llevan motivo.

### 3.2 Modelo propuesto: colecciones y campos

#### Colección `talonarios`

Un talonario es un bloque de hojas de AMACARGA. Registra de dónde a dónde
van los folios y quién los recibió.

```
talonarios/{talonarioId}
├── folioInicio: number          // 044900
├── folioFin: number             // 044949  (típicamente bloques de 50)
├── fechaRecepcion: string       // ISO — cuándo se recibió de AMACARGA
├── recibidoPor: string          // uid del usuario
├── recibidoPorNombre: string    // nombre legible
├── notas?: string               // "Talonario enviado por AMACARGA, guía X"
├── activo: boolean              // false = talonario agotado o retirado
├── createdAt: string
└── updatedAt: string
```

#### Colección `foliosHBL`

Cada folio individual. Se crea al registrar el talonario (batch de N
documentos) o al cargar folios históricos de Magaya.

```
foliosHBL/{folio}                // El documento ID es el folio: "044903"
├── talonarioId: string          // Ref al talonario que lo contiene
├── folio: number                // 44903 (numérico, para ordenar)
├── estado: EstadoFolioHBL       // ver abajo
├── embarqueId?: string | null   // El embarque que lo usó
├── numeroHBL?: string | null    // El número armado: "VL26044903"
├── asignadoPor?: string         // uid
├── asignadoPorNombre?: string
├── fechaAsignacion?: string     // ISO
├── canceladoPor?: string        // uid
├── canceladoPorNombre?: string
├── fechaCancelacion?: string
├── motivoCancelacion?: string   // Obligatorio al cancelar
├── fotoAdjunta?: string         // Storage path de la hoja dañada (opcional)
├── origenDatos?: 'manual' | 'magaya'  // Carga inicial
├── createdAt: string
└── updatedAt: string
```

#### Estados del folio

```
EstadoFolioHBL:
  'disponible'       → Hoja lista para usarse
  'usado'            → Asignado a un embarque, HBL emitido
  'cancelado'        → Hoja dañada, reimpresión o anulación
  'sin_expediente'   → Folio de Magaya cargado sin datos (se sabe que se usó, no a qué)
```

#### Transiciones

```
disponible     → usado           (confirmarFolio)
disponible     → cancelado       (cancelarFolio — hoja dañada antes de usar)
usado          → cancelado       (cancelarFolio — reimpresión o anulación)
sin_expediente → usado           (vincularFolioHistorico — si aparece la info)
sin_expediente → cancelado       (cancelarFolio — confirmado como perdido)
```

`cancelado` es terminal: un folio cancelado no se reasigna.

### 3.3 El número del HBL

```
VL + año a 2 dígitos + folio a 6 dígitos → VL26044930
```

**Pregunta pendiente de Gaby:** ¿el año es el de emisión del HBL o el del
embarque? Recomendación: el de emisión (la fecha en que se imprime). Es más
simple y no cambia si el embarque cruza de un año a otro.

Con el año de emisión:
```ts
function armarNumeroHBL(folio: number, anioEmision = new Date().getFullYear()): string {
  const yy = String(anioEmision).slice(-2);
  return `VL${yy}${String(folio).padStart(6, '0')}`;
}
```

### 3.4 El flujo de asignación

**Propone el siguiente disponible; el operador confirma cuál hoja tiene.**

```
1. Operaciones abre "Asignar HBL" en el embarque
2. El sistema lee foliosHBL donde estado = 'disponible', ordenados por folio ASC
3. Propone el primero como sugerencia: "Siguiente disponible: 044931"
4. El operador puede:
   a) Confirmar el sugerido → normal
   b) Elegir otro folio disponible → saltó uno (el sistema pregunta por qué)
   c) Teclear un folio que no está en el sistema → error: "Este folio no está
      registrado. Si es de un talonario nuevo, regístralo primero."
5. Al confirmar → transacción atómica (ver §3.5)
```

### 3.5 La transacción atómica

Dos operadores no se quedan con el mismo folio. La asignación corre dentro
de un `runTransaction` de Firestore:

```ts
async function confirmarFolio(
  folioId: string,
  embarqueId: string,
  operadorUid: string,
  operadorNombre: string,
): Promise<ResultadoConfirmacion> {
  return runTransaction(db, async (tx) => {
    // 1. Lee el folio DENTRO de la transacción
    const snap = await tx.get(doc(db, 'foliosHBL', folioId));
    if (!snap.exists()) return { ok: false, error: 'Folio no registrado.' };

    const data = snap.data();

    // 2. Verifica que sigue disponible
    if (data.estado !== 'disponible') {
      return {
        ok: false,
        error: data.estado === 'usado'
          ? `Este folio ya lo usó ${data.asignadoPorNombre} en ${data.embarqueId}.`
          : `Este folio está ${data.estado}.`,
      };
    }

    // 3. Arma el número
    const numeroHBL = armarNumeroHBL(data.folio);

    // 4. Escribe el folio como usado
    tx.update(doc(db, 'foliosHBL', folioId), {
      estado: 'usado',
      embarqueId,
      numeroHBL,
      asignadoPor: operadorUid,
      asignadoPorNombre: operadorNombre,
      fechaAsignacion: new Date().toISOString(),
    });

    // 5. Escribe el HBL en el embarque
    // (ver §3.6 sobre dónde vive en el embarque)

    return { ok: true, numeroHBL };
  });
}
```

La transacción garantiza que si dos personas confirman el mismo folio al
mismo tiempo, solo una gana. La otra recibe "ya lo usó X".

**`cancelarFolio` también es transaccional:** lee el estado actual y rechaza
si ya está cancelado. Motivo obligatorio; nunca vacío ni solo espacios.

### 3.6 El HBL en el embarque

Un embarque puede tener varios HBL (consolidados). Cada HBL es una
referencia al folio usado:

```ts
interface HBLEmbarque {
  folioId: string;         // "044903" — la key en foliosHBL
  numeroHBL: string;       // "VL26044903"
  asignadoPor: string;     // uid
  fechaAsignacion: string; // ISO
}
```

**Dónde vive:**
- `embarque.hbls?: HBLEmbarque[]` — array en el documento del embarque.
- Cada entrada es una referencia al folio confirmado. La fuente de verdad
  del estado del folio es `foliosHBL/{folio}`, no el embarque.

**Relación con Master/Hijo:**
- Un embarque tipo `'master'` puede tener cero HBL propios (usa el MBL de
  la naviera, `numeroGuia`).
- Un embarque tipo `'hijo'` típicamente tiene UN HBL (el que se emite).
- Un embarque standalone (no master, no hijo) puede tener uno o varios HBL
  si consolida cargas de varios clientes sin usar la estructura master/hijo.

### 3.7 Los huecos

«Marca los huecos sin borrarlos: son documentos negociables.»

Un hueco es un folio que debería haberse usado secuencialmente y no se usó.
No requiere un estado especial: un folio en `disponible` después de uno en
`usado` ya ES un hueco. La UI lo muestra:

```
044928  ✓ Usado    VLIM-26-045  →  VL26044928
044929  ⚠ Disponible  (hueco)
044930  ✓ Usado    VLIM-26-047  →  VL26044930
044931  ○ Disponible
```

Un hueco viejo (> 30 días sin usar, por ejemplo) se puede marcar
`cancelado` con motivo «Hoja no localizada».

### 3.8 La cancelación

```
Motivo obligatorio. Nunca vacío ni solo espacios.
Opción de adjuntar foto (Storage: foliosHBL/{folio}/evidencia).
El folio pasa a 'cancelado'; no vuelve a 'disponible' jamás.
Si era 'usado', el HBL del embarque se marca como cancelado
(no se borra: queda como registro).
```

**Reimpresión:** consume un folio nuevo. El anterior queda cancelado con
motivo «Reimpresión — ahora es VL26044935». El nuevo HBL queda como
activo en el embarque y se anota en la bitácora.

### 3.9 Carga inicial de folios de Magaya

Vermur trae hojas usadas de Magaya. Sin cargarlas, el sistema propone folios
ya gastados.

**Propuesta:**
- Pantalla en Configuración → Talonarios HBL.
- «Cargar folios históricos»: rango de inicio a fin, todos marcados
  `sin_expediente` (`origenDatos: 'magaya'`).
- Si se conoce a qué embarque corresponden (por migración o registro manual),
  se vinculan después uno por uno.
- Los folios históricos NO se proponen como disponibles.

### 3.10 Reglas de Firestore necesarias

```
talonarios/{talonarioId}:
  read:  esDelEquipo()
  write: esDelEquipo() && [futuro: tiene 'talonario.gestionar']

foliosHBL/{folioId}:
  read:  esDelEquipo()
  create: esDelEquipo()
  update: esDelEquipo()
  // No se permite delete: un folio cancelado NO se borra.
```

Con el parche actual (Bloque 9), `esDelEquipo()` es suficiente. Cuando
existan los custom claims (tarea 21), se restringe a Operaciones y Admin.

**Regla específica anti-doble-uso:** la transacción de Firestore ya lo
previene del lado del cliente, pero la regla podría reforzarlo:

```
// Un folio en 'usado' no se puede volver a 'usado' con otro embarque
allow update: if
  !(resource.data.estado == 'usado' &&
    request.resource.data.estado == 'usado' &&
    request.resource.data.embarqueId != resource.data.embarqueId);
```

### 3.11 Preguntas bloqueantes para Gaby

Estas preguntas DEBEN contestarse antes de construir:

| # | Pregunta | Recomendación |
|---|---|---|
| 1 | ¿El año del número HBL es el de emisión o el del embarque? | Emisión: más simple, no cambia si el embarque cruza año |
| 2 | ¿Cómo llegan los bloques de AMACARGA? ¿Siempre de 50? ¿Hay bloques de otro tamaño? | Aceptar cualquier rango; 50 como sugerencia |
| 3 | ¿Qué pasó con 044925–044927? ¿Son huecos normales o hay una historia? | Ayuda a diseñar la vista de huecos |
| 4 | ¿Qué hacen hoy con una hoja dañada en Magaya? | Validar que nuestro flujo de cancelación lo cubre |
| 5 | ¿El folio se reinicia en 2027? | Si sí, el talonario necesita un campo «serie» o «año» |
| 6 | ¿Qué impresoras usan? ¿Todas imprimen igual? | Define si la calibración es global o por impresora |
| 7 | ¿Cuántos folios usados vienen de Magaya? ¿Hay un export? | Define el esfuerzo de la carga inicial |

---

## 4. Imprimir sobre la hoja preimpresa

Sección separada, con su propia estimación.

### 4.1 El problema

El FBL de AMACARGA es una hoja con campos preimpresos en color. El sistema
tiene que imprimir ENCIMA, posicionando cada campo exactamente donde cae en
la hoja. Un desplazamiento de 2 mm convierte un BL legible en uno ilegible.

### 4.2 Cómo lo hacía Magaya

Magaya usaba impresión directa con coordenadas en puntos (1 pt = 1/72"). El
usuario calibraba con un offset X/Y por impresora, e imprimía una hoja de
prueba sobre una fotocopia del FBL.

### 4.3 Propuesta: PDF al tamaño exacto con coordenadas absolutas

```
1. El PDF se genera en el tamaño exacto del papel FBL (probablemente
   carta: 8.5" × 11", o A4 — hay que verificar con una hoja real).

2. Cada campo se posiciona con coordenadas absolutas en mm desde la
   esquina superior izquierda:
   - Shipper:      x=15mm, y=42mm, w=85mm, h=25mm
   - Consignee:    x=15mm, y=70mm, w=85mm, h=25mm
   - ... etc.

3. Las coordenadas se mapean de una hoja real escaneada a 300 DPI.
   Un grid de referencia superpuesto al escáner da las posiciones.

4. El PDF NO tiene fondo: solo los textos. Es lo que se imprime
   encima de la hoja preimpresa.

5. Offset X/Y por impresora, guardado en Firestore:
   configuracion/impresoras/{id}.offsetX, .offsetY (en mm).
   Default: 0,0. Se ajusta con la hoja de prueba.
```

### 4.4 Evitar el escalado del navegador

El problema más común: el navegador al imprimir agrega márgenes y escala.

```
@media print {
  @page {
    size: letter;     /* o el tamaño real del FBL */
    margin: 0;
  }
  body {
    margin: 0;
    transform-origin: top left;
    /* El offset de la impresora se aplica aquí */
    transform: translate(var(--offset-x), var(--offset-y));
  }
}
```

**Alternativa más robusta:** generar el PDF con Gotenberg desde n8n (como ya
se hace con la cotización) y que el usuario descargue e imprima el PDF. Los
visores de PDF respetan mejor el tamaño que el `window.print()` del
navegador. La instrucción en la UI: «Imprime al 100%, sin ajustar a la
página».

### 4.5 Protocolo de calibración

```
1. Escanear una hoja FBL en blanco a 300 DPI → referencia.
2. Mapear las coordenadas de cada campo en mm.
3. Generar un PDF de calibración: los textos en rojo sobre fondo
   transparente, con el nombre del campo en cada posición.
4. Imprimir sobre una FOTOCOPIA del FBL (no gastar hojas reales).
5. Superponer a contraluz: cada texto debe caer dentro de su campo.
6. Si no: ajustar offset, reimprimir sobre otra fotocopia.
7. Una vez calibrada, guardar el offset para esa impresora.
8. Si cambian de impresora: repetir pasos 4-7.
```

### 4.6 Lo que hace falta para empezar

| # | Qué | De quién depende |
|---|---|---|
| 1 | Una hoja FBL escaneada en alta resolución | Gaby |
| 2 | El tamaño exacto del papel (carta, A4, otro) | Gaby |
| 3 | Una fotocopia para pruebas (no gastar hojas) | Gaby |
| 4 | El modelo de impresora | Gaby |
| 5 | Un ejemplo de BL impreso por Magaya para comparar | Gaby |

---

## 5. Versionado y almacenamiento de documentos generados

Cada documento generado se guarda como los PDFs de cotización:

```
embarques/{embarqueId}/docs/{tipo}-v{N}-{timestamp}.pdf
```

En el documento del embarque:

```ts
interface DocumentoGenerado {
  tipo: TipoDocEmbarque;           // 'booking', 'notificacion_arribo', etc.
  version: number;                 // 1, 2, 3...
  storagePath: string;
  url: string;
  generadoPor: string;             // uid
  generadoPorNombre: string;
  fechaGeneracion: string;         // ISO
  parametros?: Record<string, unknown>;  // Para carta de encomienda: {aduana, patente}
}
```

Se acumula en `embarque.documentosGenerados?: DocumentoGenerado[]` (nuevo
campo, separado de `embarque.documentos[]` que son los subidos/clasificados).
Con `arrayUnion`, como los PDFs de la cotización: inmutable una vez escrito.

**Regla:** un documento generado no se borra. Si hay error, se genera uno
nuevo (versión siguiente). El anterior queda como registro.

---

## 6. Configuración de la empresa

Todos los documentos necesitan:
- Logo de Vermur
- Razón social completa
- Dirección fiscal
- Teléfono y correo de contacto
- RFC

Hoy esos datos están hardcodeados en el HTML del PDF de cotización (en n8n).
Para N documentos conviene moverlos a un documento de Firestore:

```
configuracion/empresa
├── razonSocial: string
├── rfc: string
├── direccion: string
├── telefono: string
├── email: string
├── logoUrl: string          // Storage: configuracion/logo.png
└── updatedAt: string
```

El payload de cada documento incluye estos datos, y el flujo de n8n los
consume. Cambiar el logo o la dirección es un cambio en Firestore, no en
el flujo de n8n.

---

## 7. Pasos publicables

| # | Paso | Qué incluye | Estimación | Dependencia |
|---|---|---|---|---|
| **C-0** | Infraestructura | `configuracion/empresa`, el flujo base en n8n, el despacho por tipo en `clasificarDocumento` | 1 día | Ninguna |
| **C-1** | Booking Confirmation | Payload + flujo n8n + botón en la ficha + Storage | 1-2 días | C-0 |
| **C-2** | Notificación de arribo | Payload + flujo n8n + botón + respuesta a pregunta de Vermur | 1-2 días | C-0 |
| **C-3** | Carta de encomienda | Campo de patente en el embarque, selector, payload con parámetros aduana/patente, flujo n8n | 2-3 días | C-0, tarea 11 (patentes) |
| **C-4** | HBL — modelo y talonario | Colecciones, transacción, pantalla de gestión, carga histórica | 3-4 días | Respuestas de Gaby (§3.11) |
| **C-5** | HBL — impresión sobre hoja | Coordenadas, calibración, PDF sin fondo, offset | 2-3 días | C-4, hoja escaneada de Gaby |
| **C-6** | Carta de porte (borrador) | Payload informativo, etiquetado sin validez fiscal | 2 días | C-0, decisión sobre PAC |
| **C-7** | Formato 318 / NOM | Catálogo de fracciones, datos del laboratorio | 3-5 días | Formatos reales del agente aduanal |

**Punto de regreso de cada paso:** `git revert` del merge. Cada paso es un
flujo nuevo en n8n + su payload + su botón; revertir el código deja el flujo
huérfano pero inofensivo, y quitarlo de n8n es borrar el webhook.

**Orden recomendado:** C-0 → C-1 → C-2 → C-3 → C-4 → C-5. La carta de
porte (C-6) y el 318 (C-7) van al final porque dependen de decisiones
externas (PAC, catálogos del SAT, formatos del agente aduanal).

---

## 8. Resumen de campos faltantes en el modelo

| Campo | Dónde | Para qué documento | Tipo |
|---|---|---|---|
| `instruccionesBooking` | `EmbarqueCompleto` | Booking | `string` opcional |
| `instruccionesEntrega` | `EmbarqueCompleto` | Notificación de arribo | `string` opcional |
| `aduanalPatente` | `EmbarqueCompleto` | Carta de encomienda | `{ nombre, numero }` opcional |
| `ruta.aduana.nombre` | `EmbarqueRuta.aduana` | Carta de encomienda | `string` opcional |
| `ruta.aduana.codigo` | `EmbarqueRuta.aduana` | Carta de encomienda | `string` opcional |
| `hbls` | `EmbarqueCompleto` | HBL | `HBLEmbarque[]` opcional |
| `documentosGenerados` | `EmbarqueCompleto` | Todos | `DocumentoGenerado[]` opcional |

Todos opcionales, sin romper nada que exista. Los embarques actuales no los
tienen y se leen con fallback normal (`campo ?? defaultValue`).

---

## 9. Preguntas

### Para Mau

1. **¿El booking y el arribo se le mandan al cliente?** Cambia la visibilidad
   por defecto y si llevan datos de contacto de Vermur. Recomendación: sí,
   ambos.
2. **¿La carta de porte (borrador sin validez fiscal) tiene valor para
   Operaciones hoy?** Si no, se pospone hasta el PAC. Recomendación:
   posponerla.
3. **¿El 318 lo genera Vermur o el agente aduanal?** Si lo genera el agente
   y Vermur solo lo archiva, no hay que generarlo. Recomendación: preguntar
   a Gaby.
4. **¿La configuración de la empresa va en Firestore o alcanza con que esté
   en n8n?** Recomendación: Firestore, para que Administración la edite sin
   tocar flujos.

### Para Vermur (Gaby)

1. ¿El año del número HBL es el de emisión o el del embarque?
2. ¿Los talonarios de AMACARGA siempre vienen en bloques de 50? ¿Hay otros
   tamaños?
3. ¿Qué pasó con los folios 044925 a 044927? (Ayuda a entender el manejo de
   huecos)
4. ¿Qué hacen hoy cuando se daña una hoja del FBL?
5. ¿El folio se reinicia al cambiar de año (2027)?
6. ¿Qué modelo de impresora usan para el FBL?
7. ¿Pueden mandar una hoja FBL escaneada en alta resolución y una copia de un
   BL impreso por Magaya?
8. ¿Cuántos folios usados vienen de Magaya? ¿Hay un archivo de export?
9. ¿La notificación de arribo se manda al cliente o es solo interna?
10. ¿El formato 318 lo llena Vermur o el agente aduanal?
