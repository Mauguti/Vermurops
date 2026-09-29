# Cola del sprint nocturno — VermurOps

<!--
sprint.sh toma la primera línea "- [ ]" de arriba abajo.
Estados: [ ] pendiente · [x] terminada · [!] bloqueada o incompleta.
Cada sesión solo marca SU línea. Para reordenar o quitar tareas, edita esta lista antes de arrancar.
Lo que no alcance a correr esta noche se queda en [ ] para la siguiente.
-->

- [x] 01 Extractor de tarifarios: probar por formato y cerrar el hueco de «4 archivos, 2 llamadas»
- [x] 02 Wizard de tarifas: agregar a mano la línea que el extractor se saltó
- [x] 03 Freno al enviar con líneas sin tasa, y precarga en «versión nueva»
- [x] 04 Renombrar «consolidada» (solo etiquetas)
- [x] 05 PLAN de tarifas: modelo de ONE y revisión de las 56 tarifas
- [x] 06 PLAN del tipo de cambio de Pricing, moneda y cliente a facturar
- [x] 07 Tabla única de cargos en el embarque
- [ ] 08 Demoras y almacenajes calculados
- [ ] 09 Listas de clientes y proveedores en tabla
- [ ] 10 Edición en línea de estado y ejecutivos en las listas
- [ ] 11 Tipos de proveedor y patentes de agentes aduanales
- [ ] 12 «Ver como cliente» y registro de documentos sensibles visibles
- [ ] 13 Bitácora y Master/Hijo dentro de Información
- [ ] 14 Kanban avisa del freno al arrastrar, y key duplicada en Puertos
- [ ] 15 Script de auditoría: tarifa elegida, costos sin moneda y conceptos sin catálogo
- [ ] 16 Conceptos sin catálogo desde la comparativa y la bandeja (camino B)
- [ ] 17 PLAN: una sola fuente de verdad para la tarifa elegida
- [ ] 18 PLAN: equipos, la parte mínima para Operaciones
- [ ] 19 PLAN: reciclar cotizaciones y orden de la bandeja de Pricing
- [ ] 20 PLAN C: documentos operativos y talonario del HBL
- [ ] 21 Usuarios y roles, paso 1 (solo emuladores)
- [ ] 22 Token en el webhook del PDF (JSON para importar)
- [ ] 23 Bug en frío: solicitud vacía tras «Enviar a Pricing»
- [ ] 24 Los 9 errores de tsc

---

## 01 — Extractor de tarifarios: probar por formato y cerrar el hueco de «4 archivos, 2 llamadas»

**Tipo:** código y diagnóstico. **Modelo:** no.

**Ya está hecho y publicado en `c05ec6b`, no lo rehagas:** la URL por entorno (`lib/urlFunciones.ts`, los cuatro hooks, `CON_FUNCTIONS=1 ./scripts/dev-emuladores.sh`, la guardia de `FUNCTIONS_EMULATOR` en el mapa de roles del servidor) y la causa encontrada con la debit note de Asia Ship: el proveedor elegido antes de subir se perdía y el pie decía «Falta elegir el proveedor del tarifario» con GUARDAR 0. También están, desde `a16b17b`, los estados «Falló» / «Sin tarifas», «Reintentar» y el aviso de duplicado.

**Lo que falta:**
1. **Probar por formato.** Entre los 22 tarifarios que no guardaron nada hay .xlsx, .png (capturas), .pdf y .txt (correos pegados). Los correos reales de ONE no están en el repo: fabrica los documentos de prueba con este texto de un correo real de ONE, en tres formatos (un .txt como si se pegara el correo, un .xlsx con la tabla y una captura .png hecha con Playwright), y guárdalos en `docs/fixtures/tarifas-sinteticas/`:

   > Rates valid till July 31. Carrier: ONE. POL: Shenzhen / Ningbo / Shanghai / Qingdao / Xiamen / Dalian. POD: Manzanillo or Lazaro Cardenas. USD4300/20'GP, USD4400/40'GP, USD4400/40'HQ. Free time 21 days. Subject to: AMS USD30/bill, Telex release USD50/bill.

2. Pásalos por el extractor real, a través del emulador de Functions (máximo 15 llamadas). Guarda cada respuesta en `docs/fixtures/respuestas-extractor/`.
3. **Tabla por documento:** formato · qué devolvió n8n (`ok`, cuántas tarifas, qué campos) · qué hizo `validarRespuestaN8N` · qué ve el usuario. Si algún formato se corta en la app, arréglalo con test del caso. Si se corta en n8n, describe el cambio exacto en el reporte (el JSON del flujo no está en el repo).
4. Anota qué sacó y qué no del correo de ONE (varios montos por contenedor, varios POL/POD, vigencia, free time, carrier, cargos por bill): alimenta el plan de la tarea 05.
5. **El hueco de «4 archivos, 2 llamadas».** Gaby subió cuatro archivos a las 5:36 pm y en los logs solo hay dos llamadas. Revisa si la subida a Storage o la escritura del documento pueden fallar antes de llamar al extractor sin que el usuario lo vea. Si pueden, que se vea.

En «Para publicar» di si cambió alguna Function (entonces se despliega functions además de hosting).

---

## 02 — Wizard de tarifas: agregar a mano la línea que el extractor se saltó

**Tipo:** código. **Modelo:** no (usa la forma de línea que ya tiene la revisión).

En «Revisar tarifas extraídas» no hay forma de agregar un renglón que el extractor se saltó; solo se puede editar o descartar lo que vino.
- Botón «Agregar línea» que crea un renglón vacío con la misma forma que los extraídos (concepto, proveedor, monto, moneda, unidad, puertos, vigencia), marcado «agregado a mano». Pasa por las mismas validaciones y la misma confirmación, y se guarda con el resto.
- El selector de archivos acepta también .txt y .eml (hoy solo llegan por «Pegar correo»).
- Tests y capturas.

---

## 03 — Freno al enviar con líneas sin tasa, y precarga en «versión nueva»

**Tipo:** código. **Modelo:** no. **Aprobado por Mau.**

- Al armar la cotización, la advertencia «N líneas sin tasa» ya existe: se queda.
- Nuevo: **freno** en «Enviar al cliente» cuando hay líneas con venta > 0 sin tasa de impuesto resuelta. Faltante nuevo en `prontitudCotizacion`, con el mismo formato que los demás. El mensaje dice qué líneas son y qué hacer (elegir la tasa en la columna Impuesto). Las líneas sin venta no cuentan.
- Cubre todas las rutas de envío: franja, botones y Kanban, si aplica.
- Test de que «Nueva versión» conserva el impuesto elegido a mano y sigue precargando del catálogo lo demás.

---

## 04 — Renombrar «consolidada» (solo etiquetas)

**Tipo:** código. **Modelo:** no.

En logística, «carga consolidada» es LCL, y Operaciones ya se confundió: vio «Consolidada» en una FCL y pensó que era error de captura. La modalidad LCL se queda como está. Cambia lo nuestro:
- Etapa «Consolidada» → «Lista para enviar»
- «Desglose del consolidado» → «Desglose de la cotización»
- «Siguiente: consolidar la cotización» → «armar la cotización»
- Botón «Consolidar cotización» → «Armar cotización»
- «TOTAL VENTA CONSOLIDADO» y el badge «COTIZACIÓN CONSOLIDADA»: propón y aplica algo coherente.

**Solo etiquetas visibles.** El valor guardado de la etapa, los identificadores, las transiciones, el PDF y n8n no se tocan.
Barre consolidar / consolidado / consolidada en toda la UI (Kanban, franja, selector, filtros, notificaciones, Historial, tooltips). El reporte lleva dos listas: lo que cambiaste (archivo:línea, antes → después) y lo que dejaste porque significa LCL o es interno, con la razón.

---

## 05 — PLAN de tarifas: modelo de ONE y revisión de las 56 tarifas

**Tipo:** plan, sin código. Actualiza `docs/sprint-post-junta/PLAN-TARIFAS.md`. Si ya corrió la 01, usa su reporte (`sprint/reportes/01.md`).

**Decisiones ya tomadas por Mau. No las reabras:**
- Las cuatro del plan: Presentación como unión discriminada por tipo; la inferencia confirmada se guarda con quién y cuándo; terrestre sin catálogo de puntos no empata por ruta y avisa; aéreo mínimo/normal/rangos queda pendiente de Nohema.
- Auditoría real: 56 tarifas, 30 tarifarios, 100% sin modalidad ni presentación (50 inferibles). Con ese tamaño **no hay mecanismo permanente de «tarifa incompleta»**. En su lugar, una pantalla de revisión única agrupada por tarifario: la modalidad del tarifario se confirma de un clic y la heredan sus tarifas; la presentación va por tarifa. «20 (probable)» **no** se preselecciona («falta tipo de contenedor»); «cualquiera» sí se puede sugerir cuando se cobra fijo.
- Orden: pantalla de revisión → sesión con Pricing → activar la llave completa. Hasta entonces el panel sigue como hoy.
- La llave de búsqueda es modalidad + presentación + ruta + vigencia. Si nada empata con todo eso, el costo queda vacío y lo dice; nunca trae la más parecida.

**Evidencia nueva (correo real de ONE):** USD4300/20'GP, USD4400/40'GP, USD4400/40'HQ; POL Shenzhen, Ningbo, Shanghái, Qingdao, Xiamen y Dalian; POD Manzanillo o Lázaro Cárdenas; vigencia al 31 de julio; free time 21 días; carrier ONE; «Subject to: AMS USD30/bill, Telex release USD50/bill». Luis: «algunas tarifas son de un puerto a otro y no son universales».

**El plan tiene que resolver:**
1. Varios montos por tipo de contenedor en una misma tarifa.
2. Varios POL y POD en una tarifa, no uno a uno.
3. Cargos condicionales por bill (AMS, telex): ¿tarifas propias ligadas a la del flete, o parte de ella?
4. Vigencia, free time y carrier: qué se captura hoy y qué falta. El free time alimenta los días libres de demora de la cotización (tarea 08): propón cómo se hereda de la tarifa elegida.
5. `impuestoCosto` (el IVA que cobra el proveedor): dónde vive y dónde se usa después (orden de compra, comparación contra factura).
6. El wizard: moneda confirmada una vez por tarifario, con la excepción por renglón marcada a mano; modalidad y presentación al cargar; cómo se confirma un tarifario de 200 renglones sin ir uno por uno.
7. Los 22 tarifarios que hay que volver a subir. Ya existen «Reintentar» en Evidencias (baja el archivo de Storage sin volver a buscarlo) y el aviso de duplicado antes de subir (`a16b17b`): parte de ahí y di solo qué falta para que Pricing los recupere en una sesión.
8. Pasos publicables por separado, con estimación y punto de regreso de cada uno.

---

## 06 — PLAN del tipo de cambio de Pricing, moneda y cliente a facturar

**Tipo:** diagnóstico y plan, sin código. Entregable: `docs/sprint-post-junta/PLAN-TC.md`. Parte del Plan A de monedas mezcladas que ya existe en `docs/sprint-post-junta/`.

**Primero el diagnóstico.** Vermur reporta que «el tipo de cambio sigue sin funcionar». Di qué hace hoy la app con el TC en la cotización y en el embarque (este lo hereda desde pj-12), y dónde se rompe, con código y un caso reproducido en emulador.

**Regla de negocio nueva, en palabras de Pricing:** «Las tarifas de proveedores nacionales vienen en pesos. Para cotizar convierten a dólares a mano con el TC de pricing que reciben por correo, le suman el profit, y cargan el costo en pesos, porque en pesos les va a facturar el proveedor.»
1. Un concepto tiene moneda de costo y moneda de venta, y pueden ser distintas. La de costo es la real del proveedor y manda para pagos y contabilidad.
2. El TC de pricing no es el del día ni el del SAT: lo captura Pricing, se guarda **congelado** en la cotización y nunca se recalcula solo.
3. Profit y margen se calculan sobre ese TC congelado.

**El plan cubre:**
- Cómo encaja con el Plan A y qué cambia.
- Si el TC que ya guarda la cotización hoy flota o está congelado, y cómo entra «pricing» como fuente.
- Cuándo se pide. Propuesta de Mau: al meter el primer concepto con costo en otra moneda que la venta; editable hasta «Enviar al cliente»; congelado al enviar; una versión nueva puede cambiarlo solo de forma explícita, con registro en Historial.
- Los campos que faltan en la cotización: la moneda (¿de venta?) y el cliente a facturar en dos niveles (el de la cotización por defecto, y la excepción por concepto). Cómo viajan al embarque y a la factura.
- Que la ubicación del servicio nazca con el servicio (formulario de solicitud, «Agregar servicio», alta rápida del Kanban), para que los conceptos que dependen de origen/destino no esperen a que alguien abra Operación.
- Qué pasa con lo existente (nada se migra) y los pasos publicables.

---

## 07 — Tabla única de cargos en el embarque

**Tipo:** código. **Modelo:** no (es una vista).

Luis confirma que la vista «Por concepto» de Cargos no tiene sentido porque todo sale separado (un renglón de ingreso y otro de gasto por concepto, al estilo Magaya). Reemplázala por **un renglón por concepto**. La vista «Por proveedor» se queda.
- Columnas que pidió Luis: Concepto · Proveedor · Costo · Moneda · Profit · Impuesto · Cliente a facturar.
- Agrega también Venta, Margen y Estado (estimado / facturado / pagado, con el excedente en rojo). Mau se inclina por dejarlos y lo confirma en la mañana: márcalo en el reporte.
- Los títulos de las columnas viven en un solo lugar (una constante) para cambiarlos fácil.
- Si un concepto tiene varios proveedores: el renglón del concepto con subrenglones por proveedor; profit y margen a nivel concepto; la venta no se prorratea.
- Reusa `lib/margenRealConcepto.ts` sin duplicar lógica, y la tabla de Servicios de la cotización si es viable.
- «Cliente a facturar»: si no existe por concepto, muestra el cliente a cobrar del embarque, en solo lectura. La excepción por concepto es parte del PLAN-TC.
- Las acciones que hoy viven en los renglones (Solicitar pago, Orden generada, corregir importe, borrar) se conservan.
- Capturas de un embarque con varios conceptos, uno con varios proveedores y uno con excedente.

---

## 08 — Demoras y almacenajes calculados

**Tipo:** código. **Modelo aprobado:** días libres de demora y de almacenaje como campos numéricos opcionales en la cotización, heredados al embarque al abrirlo (nombres a tu criterio, consistentes con el modelo).

- Hoy son fechas a mano. Pricing captura los días libres en la cotización; Operaciones ve la fecha límite = ETA + días, calculada, no guardada.
- Almacenaje: 7 días sugeridos para todos. Demoras: varían por cotización, típicamente hasta 21.
- Si la cotización no trae días libres, el embarque lo dice («la cotización no trae días libres») en vez de inventar la fecha, y Operaciones puede capturarlos ahí.
- **No confundir con los días de crédito del cliente:** son cosas distintas y ya hubo confusión en la sesión con Vermur. Que las etiquetas no lo permitan.
- El free time que viene en la tarifa queda fuera: va en el plan de tarifas (tarea 05).

---

## 09 — Listas de clientes y proveedores en tabla

**Tipo:** código. **Modelo:** no.

Las listas de Altas (clientes y proveedores) son rejillas de tarjetas; Operaciones necesita ver veinte renglones y corregir el que está mal. Pásalas a `SpreadsheetTable` (el componente de Embarques y Cotizaciones), **sin edición todavía**.
- Mismas acciones (Ver ficha, etc.), búsqueda y filtros que hoy, incluidas las pestañas por tipo de proveedor con conteos.
- Columnas nuevas: Estado y, en clientes, los tres ejecutivos (`responsableVentas`, `responsablePricing`, `responsableOperativo`).
- Son 817 clientes y 544 proveedores: mide que la tabla no se arrastre. Si hace falta, virtualiza.
- Capturas.

---

## 10 — Edición en línea de estado y ejecutivos en las listas

**Tipo:** código. **Modelo aprobado:** lo de la rama `sprint/pj-14` (commit `8d41806`): en el proveedor, `responsablePricing` y `responsableOperativo` (correo); en los dos, `cambios[]` para el registro.

1. Trae la lógica de `sprint/pj-14` (cherry-pick o merge) y resuelve conflictos. Ahí ya están: solo admin y administracion editan; inactivo sale de los selectores al crear cotizaciones y embarques nuevos; el selector conserva lo ya elegido aunque esté inactivo; un cambio que no cambia nada no se registra.
2. Edición en línea en la tabla de la tarea 09: estado y ejecutivos. Los demás roles ven las columnas en solo lectura.
3. Cada cambio: confirmación visual de guardado; si falla, error visible y la celda vuelve a su valor; registro de quién cambió qué y cuándo.
4. `statusOperativo` (cliente) y `activo` (proveedor) no se unifican: cada uno se lee y escribe en su forma.
5. El selector de ejecutivo ofrece los usuarios del rol correspondiente, sacados del mapa de roles actual. Anota que cambia al directorio con Usuarios y roles.
6. Nada de edición masiva.

---

## 11 — Tipos de proveedor y patentes de agentes aduanales

**Tipo:** código. **Modelo aprobado:** `'agente_aduanal'` como valor nuevo de `TipoProveedor`; `patentes?: { nombre, numero }[]` en el proveedor.

La agencia aduanal es la razón social a la que se paga; el agente es la persona con su patente, que es lo que va en las cartas de encomienda. Una agencia tiene varios agentes.
1. Primero el selector de tipos (múltiple) en `ProveedorFormModal`: hoy `setTipos` nunca se llama y no hay forma de elegirlos.
2. `agente_aduanal` en los dos switch de etiqueta (`Clients.tsx`, `FichaProveedor.tsx`) y como pestaña en `filtrarProveedores`.
3. Sección de patentes (agregar, editar, quitar) cuando los tipos incluyen `agente_aduanal`.
4. Si la tabla de la tarea 09 ya existe, que el tipo se vea ahí.
5. Tests y capturas.

---

## 12 — «Ver como cliente» y registro de documentos sensibles visibles

**Tipo:** código. **Modelo:** no.

**No crees ninguna cuenta de cliente ni pongas credenciales en ningún lado.**
1. En la ficha del embarque, un botón «Ver como cliente» para usuarios internos: vista de solo lectura del embarque tal como lo vería el cliente, con los documentos filtrados por la regla de visibilidad que ya existe. Marcada claramente como vista previa. Sin costos, proveedores ni márgenes. Sirve para capacitar y para comprobar que no se fugan facturas de proveedor, cartas de encomienda ni pedimentos.
2. Cuando alguien marca visible un documento sensible, entrada en la Bitácora del embarque con quién y cuándo (`anotarBitacora`).

---

## 13 — Bitácora y Master/Hijo dentro de Información

**Tipo:** código. **Modelo:** no.

Vermur pidió tener todo en una sola pestaña del embarque para no brincar. Lleva la Bitácora y la sección Master/Hijo dentro de Información. Es mover, no rediseñar; que no se duplique la lógica. Propón el acomodo (a dos columnas, como la cotización, si cabe) y dilo. Capturas en escritorio y angosto.

---

## 14 — Kanban avisa del freno al arrastrar, y key duplicada en Puertos

**Tipo:** código. **Modelo:** no.

1. Al arrastrar a «Ganada» una tarjeta que el freno no deja pasar, la razón se ve durante el arrastre (columna marcada como no permitida y el motivo visible), no solo al soltar. Usa `frenoCliente` y `frenoExpediente`, sin duplicar lógica.
2. Puertos: quita el aviso de React por key duplicada en el filtro de país cuando hay puertos sin país.

---

## 15 — Script de auditoría: tarifa elegida, costos sin moneda y conceptos sin catálogo

**Tipo:** script de solo lectura (solo `get()`). No lo corras: lo corre Mau con `SERVICE_ACCOUNT=… npx tsx scripts/<nombre>.ts`. Pruébalo sin llave: debe fallar limpio.

Sobre las cotizaciones vivas (ni ganadas ni perdidas), lista con folio y concepto:
- `proveedoresOficialIds` desincronizado de `tarifas[].seleccionada`;
- líneas con costo capturado a mano sin moneda explícita (hoy se rotulan USD por defecto);
- líneas sin `conceptoId` (llegaron desde la comparativa o la bandeja con un nombre que no está en el catálogo);
- tarifa oficial cuya modalidad inferida no coincide con la del servicio.

Al final, totales por categoría.

---

## 16 — Conceptos sin catálogo desde la comparativa y la bandeja (camino B)

**Tipo:** código. **Modelo:** no.

Una línea que llega desde la comparativa o la bandeja toma su `conceptoId` por nombre exacto. Si el nombre del proveedor no coincide con el del catálogo, la línea queda sin concepto y su impuesto sale «Sin determinar».
1. Diagnóstico con los caminos exactos.
2. Arreglo permitido: empate por nombre **normalizado** exacto (mayúsculas, acentos, espacios y puntuación) contra el nombre del catálogo y sus alias, si existen. Nada de parecidos.
3. Si no empata, la línea lo dice («concepto fuera del catálogo») y ofrece elegirlo del catálogo con un selector.
4. Tests con nombres reales: «TERMINAI HANDLING CHARGE» (typo), «Ams» contra «AMS AT DESTINATION», mayúsculas y acentos.

---

## 17 — PLAN: una sola fuente de verdad para la tarifa elegida

**Tipo:** plan, sin código. Entregable: `docs/sprint-post-junta/PLAN-FUENTE-TARIFA.md`.

Hoy dos campos deciden la tarifa elegida: `concepto.proveedoresOficialIds` (lo lee el costo de la tabla y el candado) y `tarifas[].seleccionada` (lo lee la comparativa). Unos caminos escriben uno y otros el otro (`ComparativaPricing.tsx`, `FichaCotizacion.tsx`, `ConceptoSection.tsx`); `elegirAgente` escribe los dos. Así nació «comparativa 60, tabla 20» en COT-2026-0034.
El plan cubre: un solo campo que decida; qué pasa con las cotizaciones hoy desincronizadas (sin migración masiva: cómo se muestran y se corrigen); el candado que dice de dónde viene el valor; `getCostoOficial` sumando monedas distintas; y los costos manuales viejos rotulados USD. Pasos publicables.

---

## 18 — PLAN: equipos, la parte mínima para Operaciones

**Tipo:** plan, sin código. Entregable: `docs/sprint-post-junta/PLAN-EQUIPOS-MINIMO.md`. Parte del Plan B que ya existe (con el botón «Tomar», que ya quedó decidido en lugar de «el primero que lo toca»).

Operaciones está replicando en la plataforma cotizaciones y embarques de Magaya, sobre todo de clientes de oficina y agentes de carga: justo los que no tienen vendedor. Define la parte mínima que les desbloquea: esos clientes con «equipo Pricing» como responsable, que aparezcan en las vistas de Pricing, «Tomar» y «Soltar», y que la solicitud de un cliente de oficina vaya directo a Pricing. Revisa qué les estorba hoy exactamente en el código (vistas por rol, filtros por `vendedorId`, franja). Qué campos aditivos necesita, y cómo convive con Usuarios y roles (tarea 21). Pasos publicables.

---

## 19 — PLAN: reciclar cotizaciones y orden de la bandeja de Pricing

**Tipo:** plan, sin código. Entregable: `docs/sprint-post-junta/PLAN-RECICLAR.md`.

**Reciclar:** partir de una cotización previa en vez de armar desde cero. Propuesta de Mau:
- **Sí se copian:** conceptos, proveedores, montos, impuesto elegido y notas.
- **No se copian:** folio (nace nuevo), fechas, vigencia, TC (se recaptura por la regla del congelado), etapa (nace al inicio), Historial, PDFs ni el vínculo a embarque.
- El cliente es opcional: el mismo u otro. Las tarifas vencidas o incompletas se marcan al copiar.
- Di en qué se distingue de «Nueva versión» y qué cambiarías de la propuesta.

**Bandeja de Pricing:** que cada usuario personalice el orden. Prioridad baja: solo di dónde guardarías la preferencia mientras no exista el directorio de usuarios.

---

## 20 — PLAN C: documentos operativos y talonario del HBL

**Tipo:** plan, sin código. Entregable: `docs/sprint-post-junta/PLAN-C.md`.

Confirmación de booking, notificación de arribo, HBL, carta de encomienda, carta porte y el 318 están fechados para el 16 de octubre. Los formatos reales de Vermur todavía no llegan.
- ¿Es el mismo editor por bloques del módulo de plantillas con distintas plantillas, o los documentos operativos necesitan algo distinto (campos calculados, tablas de contenedores, firmas)?
- Por documento: qué datos del embarque lo alimentan (origen, destino, contenedores, ETA/ETD, entidades, mercancía, pesos) y cuáles no están hoy en el modelo.
- Cómo se versiona y se guarda cada documento generado.

**HBL — el folio no lo genera el sistema.** El FBL es papel preimpreso de AMACARGA; el folio (044903, 044930…) viene impreso en rojo en la hoja. Lo determina la hoja que el operador mete a la impresora. El sistema:
- Registra el talonario por **bloque** (rango de inicio y fin, fecha de recepción, quién lo recibió) y el estatus de cada folio: disponible / usado / cancelado / sin expediente.
- Propone el siguiente disponible; el operador **confirma** cuál hoja trae en mano, que puede no ser la que sigue.
- La confirmación es atómica (transacción): dos operadores no se quedan con el mismo folio.
- Con el folio confirmado arma el número y lo imprime: VL + año a 2 dígitos + folio a 6 → VL26044930. Pendiente de Gaby: si el año es el de emisión o el del embarque.
- Marca los huecos sin borrarlos: son documentos negociables.
- Hoja dañada o reimpresión: consume folio. El anterior queda cancelado con motivo obligatorio y opción de adjuntar foto.
- Registro de quién confirmó, canceló o marcó cada folio, y cuándo.
- Varios HBL por embarque (consolidados), amarrado a Master/Hijo.
- Carga inicial de los folios ya usados en Magaya, para no proponer hojas gastadas.

Entrega: modelo propuesto (colecciones, campos, estados y transiciones), dónde vive la transacción y qué reglas de Firestore necesitaría.
**Aparte, con su propia estimación:** imprimir sobre la hoja preimpresa reproduciendo la calibración de Magaya. PDF al tamaño exacto del papel con coordenadas en mm, desplazamiento X/Y guardado por impresora, cómo evitar el escalado del navegador, y pruebas con fotocopias antes de gastar hojas reales.
Nada se construye hasta que Gaby conteste: cómo llegan los bloques de AMACARGA, qué pasó con 044925–044927, qué hacen hoy con una hoja dañada, si el folio se reinicia en 2027, qué impresoras usan y si el año es de emisión o del embarque.

---

## 21 — Usuarios y roles, paso 1 (solo emuladores)

**Tipo:** código, todo en emuladores (Auth, Functions, Firestore). Sin deploy, sin migración, sin tocar reglas. **Modelo aprobado:** directorio `usuarios/{uid}` y rol en custom claims.

**Diseño aprobado por Mau:**
- `usuarios/{uid}` con correo, nombre, rol, activo, invitadoPor y fechas; el rol también en custom claims, puesto **solo** por la Function `asignarRol`, que exige `usuario.gestionar` del llamante.
- Alta por invitación: la Function crea la cuenta y dispara el correo de restablecimiento que ya existe.
- Baja: `activo: false` y `disableUser`. Nunca se borra.
- Cambio de rol: `revokeRefreshTokens` más escucha del documento propio con `getIdToken(true)`, para que la sesión abierta cambie en segundos.
- Roles: ventas, pricing, operaciones, administracion, admin. «cliente» queda reservado para el portal, sin implementar.
- Pantalla Configuración → Usuarios, visible solo para admin: lista, invitar, cambiar rol, desactivar.
- La UI sigue leyendo el mapa viejo como respaldo mientras no haya claims.
- Mientras exista el parche de reglas por lista de correos (sin desplegar), al invitar la pantalla avisa si el correo no está en `esDelEquipo()`.

**Personas:** Mau (`info@digsol.com.mx`, admin). Ojo: el parche de reglas sin desplegar dice `info@digsol.com`. No edites las reglas: anótalo en el reporte. Gaby y Luis: admin. Chema: sin acceso por ahora (admin cuando se invite).

**Pruebas:** unitarias de la Function y de la lógica, y un e2e en emuladores: admin invita → la cuenta aparece en Auth → con el enlace del emulador (oobCodes) la persona pone su contraseña → entra con su rol → admin le cambia el rol y la sesión cambia en segundos → admin la desactiva y ya no entra. Capturas de cada paso.

Además, borrador de reglas por rol en `docs/reglas/borrador-por-rol.rules` (no en `firestore.rules`), con la lista de qué se rompe al desplegarlas (incluida la siembra desde el navegador).

---

## 22 — Token en el webhook del PDF (JSON para importar)

**Tipo:** JSON de n8n. Prohibido llamar a n8n.

El flujo `generar-pdf-cotizacion` no valida `X-Vermur-Token`; cualquiera con la URL genera PDFs. El proxy ya manda el header a todos los flujos (`functions/src/comun/proxyN8n.ts`).
1. Entrega `docs/n8n/generar-pdf-cotizacion.n8n.json` con un nodo de validación al inicio: 401 sin token o con token incorrecto, y solo entonces sigue el flujo actual, sin cambiarlo.
2. En el reporte: dónde debe estar configurado el valor del token en n8n (variable o credencial), para que Mau lo confirme al importar, y cómo regresar al flujo anterior si el PDF falla.

---

## 23 — Bug en frío: solicitud vacía tras «Enviar a Pricing»

**Tipo:** diagnóstico en bucle. Arreglo solo con causa demostrada. **Caja de tiempo:** 90 minutos.

Dos veces se vio que el formulario de solicitud aparece vacío justo después de «Enviar a Pricing», con emuladores recién arrancados.
1. Script de Playwright: login ventas → nueva solicitud → llenar → «Enviar a Pricing» → capturar DOM, consola, red y el documento en el emulador.
2. Diez corridas, cada una con emuladores limpios y caché de Vite borrada. Anota la tasa de reproducción.
3. Si se reproduce: la cadena con evidencia, el arreglo, y otra vez el bucle, que debe dar 0 de 10.
4. Si da 0 de 10: prueba variantes (primer arranque sin caché, red lenta, un segundo usuario con la misma cotización). Reporta la tabla. No inventes un arreglo.

---

## 24 — Los 9 errores de tsc

**Tipo:** código. **Modelo:** no.

Están en `Quotes.tsx`, `FichaCotizacion.tsx` y `RightChatPanel.tsx`. Corrige los tipos sin cambiar comportamiento. Si alguno solo se arregla cambiando comportamiento, no lo toques y explícalo. Meta: tsc en 0 y recorrido completo.
