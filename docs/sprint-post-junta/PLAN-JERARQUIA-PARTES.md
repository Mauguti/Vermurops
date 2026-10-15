# Plan — Jerarquía Master / House / Direct y partes del embarque

Tarea 115 del sprint (15-oct-2026). **Solo plan: cero cambios de código.**
Puntos 2 y 3 de Mau. Todo lo marcado «para aprobación» es una propuesta de
modelo; nada se agregó a `EmbarqueCompleto`.

## 0. Lo que contradice la tarea (léelo primero)

La tarea propone `tipoEmbarque?: 'master' | 'house' | 'direct'` y `masterId?`
como si fueran nuevos. **Ya existen los dos conceptos**, con otro nombre y
obligatorios:

- `EmbarquesData.ts:7` → `TipoEmbarque = 'master' | 'hijo'`.
- `EmbarquesData.ts:427-428` → `tipo: TipoEmbarque` y `masterId: string | null`
  (los dos requeridos, no opcionales).
- Ya hay UI: «Crear HBL Hijo» en `FichaEmbarque.tsx:539-590` y la sección
  «Relación y Consolidación» en `FichaEmbarque.tsx:1121-1228`; badge de master
  en `embarqueColumns.tsx:75`.

Y el bloque `partes` que pide el punto 3 **ya existe repartido**: son
`entidades` (`EmbarquesData.ts:32-41`: expedidor, consignatario, notificar,
agenteAduanal, agenteCarga, agenteDestino, importador, clienteCobrar), su
enlace opcional `entidadesRef` (`:30`, por id y colección, con texto de
respaldo) y el carrier en `ruta.origen.transportista` (`:46`). La regla
«enlace por id + texto libre de respaldo» es exactamente la de
`lib/entidadesEmbarque.ts`.

**Consecuencia:** agregar `tipoEmbarque` y `partes` tal como se pidieron crearía
una segunda fuente de verdad (la dualidad de §6). Este plan propone **derivar**
la jerarquía de los campos que ya existen y **reusar** `entidades`; lo realmente
nuevo es la *herencia* master → house y los lugares donde se lee.

Y un hallazgo que cambia la lectura de los viejos: **todo embarque que nace hoy
sale con `tipo: 'hijo'` y `masterId: null`** (`lib/generacionEmbarque.ts:122-123`,
`Shipments.tsx:109-110`). Es decir, «hijo sin master» es el caso común y significa
*direct*, no «huérfano».

## 1. Cómo está hoy

| Qué | Dónde | Estado |
|---|---|---|
| Consolidación por producto | `EmbarqueProducto.tipoConsolidacion?: 'FCL'\|'LCL'` (`EmbarquesData.ts:362`) | Es del **contenedor/producto**, no del embarque. Lo escribe `ProductosEmbarque.tsx:108-119` y `cargaSolicitud.ts:403,415`. No habla de master/house. |
| Master / hijo | `tipo`, `masterId` (`:427-428`) | Existen. Solo el seed (`EmbarquesData.ts:664-1303`) trae masters e hijos enlazados; los reales nacen `hijo`+`null`. |
| BL / MBL / AWB | `numeroGuia` (`:429`), un solo campo | Para un hijo debería ser el HBL y el MBL vive en el master. |
| HBL | `TIPOS_DOCUMENTO.hbl` (documento) y, **inventado**, `numeroGuia: 'HBL-VERM-NNN'` + `nombreEmbarque: 'HAWB-NNNNNNN'` en `handleCrearHijo` (`FichaEmbarque.tsx:557-561`) | Son valores fabricados por el código (y «HAWB» aun siendo marítimo). El HBL real es un folio de talonario AMACARGA (PLAN-C §3). |
| Folio del hijo | `generateFolioEmbarque()` → `SHP-2026-NNNN` (`folioService.ts:147`) | Es el contador **viejo**, no la serie VLIM/VLIA… de la 66. El master y el hijo creados a mano caen en `SHP-`, no en `VL…`. |
| Naviera | `ruta.origen.transportista` (`:46`) | Texto; enlace en `entidadesRef.transportista`. Lo lee `cartasEncomienda.ts:202` por nombre. |
| Agente aduanal / de carga / destino | `entidades.agenteAduanal/agenteCarga/agenteDestino` | Texto + enlace opcional. «agenteCarga» no dice si es de origen (ver pregunta G-J3). |
| Cliente | `entidades.clienteCobrar`, `importador`, `consignatario` | `COLECCION_POR_ROL` manda `consignatario`, `expedidor`, `notificar` a **proveedores** y `clienteCobrar`/`importador` a **clientes** (`entidadesEmbarque.ts:34-44`). |
| Proveedores del gasto | `CargoDetalle.proveedorId` (`:119`) | Por línea de cargo; no hay lista de proveedores en el embarque. |
| Cargos | `EmbarqueCompleto.cargos` (`:481`), por moneda | Un hijo nace con `cargos` vacío (`FichaEmbarque.tsx:~575`): no hereda ni reparte nada del master. |
| OC y facturas | `OrdenCompra.embarqueId` (`OrdenesCompraData.ts:148`), `Factura.embarqueId` (`FacturasData.ts:50`) | Un solo id de embarque. No saben de jerarquía. |
| Aviso de llegada | `notificacionArribo.ts:28-41` | Exige `numeroGuia` y `consignatario` del **propio** embarque. |
| Cartas por naviera | `cartasEncomienda.ts` | Leen la naviera del propio embarque. |

### PLAN-C sobre el HBL (resumen)

- §3.6: `embarque.hbls?: HBLEmbarque[]` (`folioId`, `numeroHBL`, `asignadoPor`,
  `fechaAsignacion`); la verdad del folio vive en `foliosHBL/{folio}`.
- Relación master/hijo según PLAN-C: master puede tener cero HBL (usa el MBL
  en `numeroGuia`); hijo, típicamente uno; **«standalone» puede tener uno o
  varios**. Este plan lo corrige: un *direct* tiene **un** HBL propio; varios
  HBL implican un master. Pendiente de confirmar con Gaby.
- C-4 (talonario) y C-5 (impresión) **no están construidos**.

### Las preguntas «G1–G8» de Gaby

**No encontré ese documento.** Busqué `G1…G8` en `docs/` y `sprint/` y solo
aparecen G11 y G18 (`AUDITORIA-35-48.md:219`). No puedo decir cuáles de G1–G8
siguen abiertas sin inventarlo. Lo que **sí consta** y sigue sin respuesta,
porque ningún reporte las cierra: las 7 preguntas bloqueantes de PLAN-C §3.11
(año del número HBL, tamaño de bloques de AMACARGA, folios 044925–044927, hoja
dañada, reinicio en 2027, impresoras, folios usados en Magaya) y las de §9
(notificación de arribo al cliente, quién llena el 318). Las de arriba que
tocan este plan: año del HBL y reinicio en 2027 (folio de cada nivel). **Mau:
si G1–G8 es un documento aparte, pásalo y lo cruzo.**

## 2. Jerarquía

### 2.1 Propuesta: derivar, no agregar un campo

```ts
type NivelEmbarque = 'master' | 'house' | 'direct';

// lib/jerarquiaEmbarque.ts (puro, con tests)
nivelDe(e, todos): NivelEmbarque
  e.tipo === 'master'                         → 'master'
  e.masterId && existe master con ese id      → 'house'
  e.tipo === 'hijo' && !e.masterId            → 'direct'   // el caso real de hoy
  e.masterId && master NO existe              → 'house' con aviso «master no encontrado»
                                                 (la ficha ya lo avisa, FichaEmbarque.tsx:1216)
```

Los hijos de un master se **consultan** (`todos.filter(x => x.masterId === m.id)`,
igual que `FichaEmbarque.tsx:536`), no se guardan como `hijoIds[]` en el master:
guardar la lista sería la segunda fuente que se desincroniza, y obligaría a
escribir el master cada vez que nace un hijo (con la escritura por campos de la
123 no se pisan, pero sigue siendo dos escrituras sin transacción). Sin índice
nuevo: la lista de embarques ya está completa en memoria (`tiendasCatalogos`).

**Alternativa (para aprobación):** campo explícito
`tipoEmbarque?: 'master'|'house'|'direct'`. Ventaja: «direct» deja de ser una
inferencia. Costo: dos campos que pueden contradecirse (`tipo` y `tipoEmbarque`)
y que escribir el valor nuevo exige tocar `generacionEmbarque.ts`,
`Shipments.tsx` y `handleCrearHijo`. **Recomendación: derivada.** Si más
adelante se quiere explícito, entra como paso aparte que lee con respaldo.

### 2.2 Cómo se leen los viejos (sin escribir nada)

| Documento guardado | Se lee como |
|---|---|
| `tipo:'hijo'`, `masterId:null` (todos los creados por A-1 y por «Abrir embarque») | **direct** |
| `tipo:'master'` con hijos apuntándole | **master** |
| `tipo:'master'` sin hijos | **master** sin hijos (hoy solo el seed y los creados a mano); la ficha ya dice «No hay hijos» |
| `tipo:'hijo'`, `masterId` con master existente | **house** |
| `tipo:'hijo'`, `masterId` sin master | **house** con aviso (integridad) |

Antes de construir: `scripts/auditarJerarquiaEmbarques.ts` (solo lectura, sin
llave en el repo; lo corre Mau) cuenta cuántos de cada caso hay en producción.
No sé hoy cuántos `master` reales existen; el plan no depende de ese número,
pero sí el tamaño del paso J2.

### 2.3 Reglas de integridad (en la lib y en la UI; las reglas de Firestore no cambian)

- Un house apunta a un master **de la misma modalidad** y el master no apunta a
  nadie (un nivel, sin anidar).
- Un master no se borra ni cambia a direct mientras tenga houses. (Los
  embarques ya no se borran por regla: baja lógica.)
- Quitar un house de su master = poner `masterId: null` → pasa a direct. No se
  pierde nada.
- Un direct puede **adoptarse** como house de un master existente («Vincular a
  master»). Hoy no existe: solo se crea el hijo *desde* el master. Es el caso
  real: la cotización ganada abre un embarque (direct) y Operaciones lo mete
  después a un consolidado.

### 2.4 Qué pasa con cargos, órdenes de compra, facturas y folio

Principio: **cada documento sigue colgado del embarque donde nació** (su
`embarqueId` no cambia). La jerarquía no mueve dinero; solo agrega una vista.

| Cosa | En el house | En el master | Vista consolidada |
|---|---|---|---|
| Venta al cliente (ingresos, facturas, cobros) | Sí: es el que tiene cliente y cotización | No | Suma de los houses, **por moneda** (§4.3) |
| Costo de la naviera/aerolínea (OC al carrier) | No | Sí: un MBL, una factura del carrier (§4.14) | El del master |
| Costos propios de una carga (maniobras, despacho, flete terrestre) | Sí | — | Suma por moneda |
| Profit | Venta propia − costos directos | Costos del master sin vender | Venta de houses − costos de houses − costos del master |

**Reparto del costo del master entre houses: NO se hace en este plan.** Es
decisión de negocio (por CBM, por peso, por contenedor, a mano) y mueve el
margen de cada cliente; se propone mostrar el profit **solo a nivel consolidado**
y, por house, «venta y costos directos» sin prorrateo. Queda como pregunta.

La vista del consolidado completo es una pantalla de lectura (master + houses +
totales por moneda con `sumarPorMoneda`, nunca un escalar; se corre
`npx tsx scripts/auditarSumasDeDinero.ts` al cerrar el paso).

**Folio de cada nivel.** Hoy el hijo toma un `SHP-…` del contador viejo
(`folioService.ts:147`). Propuesta: **house y master toman folio de serie** al
crearse (`reservarFoliosSerie`, VLIM/VLEM/…, §4.15) igual que cualquier
embarque, y se distinguen por el nivel derivado, no por el folio. El **número
de HBL** es otro dato (talonario, PLAN-C), en `hbls[]`; el de MBL, en
`numeroGuia` del master. Así el folio interno no se confunde con el documento
negociable. Con el interruptor de la 66 apagado, el house nuevo se abre con la
serie que Operaciones elija, como el flujo manual de `Shipments.tsx:212-262`.

## 3. Partes

### 3.1 Reusar `entidades`, no crear `partes`

Mapa pedido → campo existente:

| Parte | Hoy | Vínculo por id |
|---|---|---|
| Shipper | `entidades.expedidor` | `entidadesRef.expedidor` → proveedores |
| Consignee | `entidades.consignatario` | `entidadesRef.consignatario` → **proveedores** |
| Notify | `entidades.notificar` | `entidadesRef.notificar` → proveedores |
| Carrier | `ruta.origen.transportista` | `entidadesRef.transportista` → proveedores |
| Agente de origen | **no existe con ese nombre**; `agenteCarga` es ambiguo | — |
| Agente de destino | `entidades.agenteDestino` | `entidadesRef.agenteDestino` |
| Aduanal / cliente a cobrar / importador | existentes | aduanal → proveedores; cliente e importador → clientes |

Lo que **sí falta**, en orden de importancia:

1. **Herencia house ← master** para las partes que son del *transporte* y no de
   la carga: carrier, agente de origen, agente de destino, buque/viaje, puertos y
   fechas. Hoy `handleCrearHijo` copia `entidades` y `ruta` **una vez** y luego
   divergen; si Operaciones corrige la naviera en el master, los houses quedan
   con la vieja. Propuesta: lectura con respaldo — el house usa el valor del
   master mientras el suyo esté vacío (`partesDeEmbarque(e, todos)` puro). No se
   copia ni se escribe.
2. **Partes propias del house**: shipper, consignee, notify y cliente a cobrar
   son de cada carga; el hijo hoy nace con `consignatario: 'Por Definir'`.
3. **Agente de origen vs destino**: un campo más (`agenteOrigen`) o aclarar que
   `agenteCarga` es el de origen. Es **modelo** → solo propuesta (§5).
4. **Consignee a clientes o proveedores**: `COLECCION_POR_ROL` lo manda a
   proveedores (decisión de Mau del 10-sep), pero en una importación el
   consignatario suele ser el cliente de Vermur. Un tipo de entidad de dos
   colecciones cambia `RefEntidad`/`vincular`. Pregunta, no se toca.

### 3.2 Qué documentos lo leen

| Documento | Lee hoy | Con jerarquía |
|---|---|---|
| HBL (PLAN-C §3, no construido) | — | Del **house**: shipper, consignee, notify propios; carrier/buque/viaje/puertos heredados del master; MBL = `numeroGuia` del master |
| Aviso de llegada (`notificacionArribo.ts`) | `numeroGuia`, `consignatario` propios | Del **house** al cliente, con HBL y MBL; si no es house, igual que hoy |
| Cartas por naviera (`cartasEncomienda.ts`) | naviera del propio embarque | Del **master** (la carta es del MBL ante la naviera); en un house se genera con la naviera heredada. A confirmar con Gaby: ¿una carta por MBL o por HBL? |
| Manifiesto (no existe) | — | Del **master**, con la lista de houses; fuera de alcance, solo se deja el punto de lectura |
| Booking | `numeroReservacion` | Del master (un booking, varios houses) |

Los tres que existen o van a existir pasan a leer por `partesDeEmbarque`,
no por `embarque.entidades` directo: ahí vive la herencia, una vez.

## 4. Relación con el folio automático (66) y el talonario de HBL

- La 66 crea, al marcar ganada, un **direct** con folio de serie
  (`construirEmbarqueDesdeCotizacion`, `generacionEmbarque.ts:122`). No cambia:
  nace direct y puede adoptarse como house después. Con el interruptor apagado
  (estado de hoy) lo abre Operaciones por la ruta manual; igual.
- El master **no tiene cotización** (`cotizacionId` es `string` requerido; el
  flujo manual guarda `''`). Se mantiene: el master no se genera de una venta.
- Reinicio de folio por año (121): aplica a master y house por igual (misma
  serie).
- Talonario HBL (PLAN-C C-4): el `numeroHBL` se asigna al **house o al direct**,
  nunca al master. «Asignar HBL» en el master se oculta. Pregunta abierta de
  PLAN-C (año del número y reinicio en 2027) sigue bloqueando C-4; este plan no
  la resuelve.
- **Mientras C-4 no exista**, `handleCrearHijo` debe dejar de inventar
  `HBL-VERM-NNN` y `HAWB-…` (valores fabricados que se ven reales). Paso J3.

## 5. Modelo propuesto — PARA APROBACIÓN DE MAU

Nada de esto está escrito. Todo opcional y aditivo, con lectura de respaldo.

```ts
// Sin campo nuevo para la jerarquía (se deriva de tipo + masterId existentes).
// Solo si Mau prefiere explícito:
tipoEmbarque?: 'master' | 'house' | 'direct';        // alternativa, no recomendada

// Para el agente de origen (el único hueco real de partes):
entidades.agenteOrigen?: string;                     // texto, igual que los demás
entidadesRef.agenteOrigen?: RefEntidad;              // RolEnlazable crece un valor

// PLAN-C, ya propuesto, depende de C-4:
hbls?: HBLEmbarque[];
```

Sin cambios en `firestore.rules` (embarques ya admite al equipo), sin índices
(los hijos se filtran en memoria), sin Functions, sin n8n.

## 6. Preguntas

### Para Mau

1. **¿Jerarquía derivada (recomendada) o `tipoEmbarque` explícito?** §2.1.
2. **¿Reusar `entidades` en vez de crear `partes`?** Recomendación: sí; el
   bloque nuevo sería una segunda copia de los mismos roles.
3. **¿Cambiamos `RefEntidad` para que consignee/notify puedan ser cliente?**
   Hoy van a proveedores por decisión tuya del 10-sep. Toca `vincular` y 15
   lectores de `entidades.consignatario`.
4. **¿Dónde está el documento G1–G8?** No está en el repo.
5. **¿Corro el script de auditoría contra producción** para saber cuántos
   masters reales hay antes de J2? Recomendación: sí, es solo lectura y lo corres tú.

### Para Gaby / Julio (para copiar)

1. ¿Cuándo se arma un master: antes de recibir las cargas de los clientes o
   cuando ya hay varias? ¿Puede un embarque que ya se abrió como directo pasar a
   ser parte de un master después?
2. La factura de la naviera es una por MBL. ¿Se carga toda al master? ¿Cómo
   reparten ese costo entre los clientes del consolidado: por CBM, por peso, por
   contenedor o a mano? *(Julio; define el profit por cliente.)*
3. ¿«Agente de carga» en el embarque es el de origen? ¿Siempre hay uno de origen
   y uno de destino, o a veces uno solo?
4. En un consolidado, ¿quién es el consignatario del MBL: Vermur (su agente de
   destino) y el del HBL el cliente? ¿Y el notify?
5. La carta de encomienda/garantía por naviera: ¿una por MBL o una por cada HBL?
6. ¿Un embarque directo puede llevar varios HBL, o varios HBL siempre implican
   un master? *(PLAN-C lo permitía; este plan lo cierra.)*
7. ¿Los houses de un consolidado se cierran (operativo/pago/administrativo) uno
   por uno, o el master no cierra hasta que cierren todos?
8. De PLAN-C §3.11, aún sin respuesta: ¿el año del número HBL es el de emisión o
   el del embarque, y se reinicia en 2027?

## 7. Pasos publicables (hosting; ninguno toca reglas, índices ni Functions)

Cada uno: se valida en navegador antes del siguiente.

| # | Paso | Qué entrega | Depende de |
|---|---|---|---|
| J0 | `scripts/auditarJerarquiaEmbarques.ts` en seco | Cuántos master/house/direct/huérfanos hay | Mau lo corre |
| J1 | `lib/jerarquiaEmbarque.ts`: `nivelDe`, `hijosDe`, `consolidadoDe` (totales por moneda), `puedeVincular` + tests | Lógica pura, **cero cambio de pantalla** | — |
| J2 | Columna y filtro «Nivel» en Embarques (Master/House/Direct, se guarda con la vista), badge en la ficha, vista del consolidado en el master | Se ve la jerarquía | J1 |
| J3 | «Vincular a master» (desde un direct) y rehacer «Crear house»: folio de serie, **sin** `HBL-VERM-…` ni `HAWB-…` inventados, hereda sin copiar | Se arma un consolidado | J1, respuesta 1 y 6 |
| J4 | `partesDeEmbarque` con herencia; aviso de llegada y cartas leen por ahí | Corregir la naviera en el master llega a los houses | J1 |
| J5 | `agenteOrigen` (modelo aprobado) | Hueco de partes | Aprobación de Mau, pregunta 3 de Gaby |
| J6 | `hbls[]` + número HBL por house | HBL propio | C-4 de PLAN-C y sus preguntas |

Punto de regreso de cada paso: `git revert` del merge; ninguno escribe datos
nuevos hasta J3 (que solo escribe `masterId` y `tipo` de un embarque, campos que
ya existen).

## 8. Hallazgos fuera de la tarea (anotados, sin tocar)

- `handleCrearHijo` fabrica `numeroGuia: 'HBL-VERM-NNN'`, `referenciaCliente:
  '<ref>-HIJO'` y `nombreEmbarque: 'HAWB-…'`; y usa el folio `SHP-` viejo.
- `Shipments.tsx:109-120` crea embarques con `consignatario: 'Nuevo Cliente
  S.A.'` y guía `MBL-POR-DEFINIR` como datos reales.
- `handleCrearHijo` usa `guardar(nuevoHijo)` sin pasar `anterior` (alta: correcto) pero
  no escribe bitácora de la relación; vincular/desvincular no deja rastro en la
  bitácora del master.
