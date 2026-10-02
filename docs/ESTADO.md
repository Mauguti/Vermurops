# Estado de VermurOps — 2 de octubre de 2026

**La cadena 35 → 55 está PUBLICADA.** 21 ramas mergeadas con `--no-ff` en
orden, main == origin/main == `e411298`, y los cuatro despliegues hechos:
reglas de Firestore, Storage, las tres Functions nuevas y hosting.

Producción corre `index-By7gL9-J.js`, el mismo hash que el build local.

**2028 tests · 90 archivos · tsc 0 · recorrido 6/6 (dos veces) ·
45-filtros 34/34 · 47-barrido 95/95 sin hallazgos · reglas 26/26.**

Lo que sigue es la **validación en navegador**:
[VALIDACION-35-55.md](sprint-post-junta/VALIDACION-35-55.md).

---

## 1. Lo que se publicó

### Cadena 35–42

| # | Tarea | Rama | Despliega |
|---|---|---|---|
| 35 | Datos fiscales del cliente | sprint/35-datos-fiscales | Hosting |
| 36 | IVA de la factura del proveedor y alerta | sprint/36-iva-factura-proveedor | Hosting |
| 37 | Cotización usa días de crédito por modalidad | sprint/37-dias-credito-modalidad | Hosting |
| 38 | Aprobación de proveedores (pasos 1, 4, 5A) | sprint/38-aprobacion-proveedores | Hosting |
| 39 | Script conceptos IVA de Vermur | sprint/39-conceptos-iva | Nada (script) |
| 40 | Documentos operativos: config empresa + Function | sprint/40-documentos-base | Hosting + Functions + Reglas |
| 41 | Notificación de arribo desde el embarque | sprint/41-notificacion-arribo | Hosting + Functions |
| 42 | PLAN: carga fiscal desde Magaya | sprint/42-plan-carga-fiscal | Nada (plan) |

### Cadena 43–48 (sprint del 1-oct, encima de la anterior)

| # | Tarea | Rama | Despliega |
|---|---|---|---|
| 43 | Botón «Regresar» en todas las fichas | sprint/43-boton-regresar | Hosting |
| 44 | Acciones de las fichas arriba | sprint/44-acciones-arriba | Hosting |
| 45 | Barrido de filtros: inventario y prueba | sprint/45-barrido-filtros | Hosting |
| 46 | Barrido de filtros: arreglos | sprint/46-barrido-filtros-arreglos | Hosting |
| 47 | Barrido general: consola y permisos por rol | sprint/47-barrido-consola-roles | Hosting |
| 48 | Textos pendientes y pestaña inicial de Finanzas | sprint/48-textos-finanzas | Hosting |

### Cadena 49–55 (sprint del 1-oct noche, encima de la anterior)

| # | Tarea | Rama | Despliega |
|---|---|---|---|
| 49 | Auditoría independiente de las cadenas 35–48 | sprint/49-auditoria-cadenas | Nada (documento) |
| 50 | Acciones arriba en fichas restantes (RFQ, cliente, embarque) | sprint/50-acciones-arriba-resto | Hosting |
| 51 | Tipo de cambio automático desde Banxico | sprint/51-tipo-cambio-banxico | Hosting + Functions + Reglas Firestore |
| 52 | Cartas encomienda y garantía por naviera | sprint/52-cartas-encomienda | Hosting + Functions |
| 53 | PLAN: reglas de Firestore y Storage por rol | sprint/53-plan-reglas-por-rol | Nada (plan) |
| 54 | Expediente del proveedor | sprint/54-expediente-proveedor | Hosting |
| 55 | Factura del proveedor en la OC | sprint/55-factura-oc-oficina | Hosting + Regla Storage |

**2028 tests · tsc 0 · e2e 6/6** en la punta de la cadena (sprint/55).

### Lo nuevo en la cadena 49–55

- **Auditoría (49):** revisión independiente de las 14 tareas previas. Todas
  publicables. Documento en `docs/sprint-post-junta/AUDITORIA-35-48.md`.
- **Acciones arriba (50):** «Guardar cambios» de cliente, «Guardar Cambios»
  de embarque y «Enviar a Ventas» del RFQ subieron al header. Fix: el
  SaveBar de Información del cliente no guardaba los 3 responsables.
- **Tipo de cambio (51):** Function programada que consulta Banxico (FIX del
  DOF) cada 2h en días hábiles. Módulo completo con historial, badge de
  actualización y botón «Actualizar ahora» (admin/administracion/pricing).
  Precarga en la cotización cuando la fuente es Banxico o SAT. 24 tests.
- **Cartas encomienda (52):** 11 plantillas HTML fieles a los originales de
  cada naviera (COSCO, Hamburg Süd, CMA CGM, Evergreen, Sealand, Agunsa,
  ONE, PIL, Maersk, HMM garantía, MSC encomienda+garantía). Botón en la
  ficha del embarque, validación de datos, selector de patente. 31 tests.
- **Plan de reglas (53):** matriz de 20 colecciones × 5 roles, plan de
  migración de lista de correos a custom claims en 5 pasos publicables.
  Documento en `docs/sprint-post-junta/PLAN-REGLAS-POR-ROL.md`.
- **Expediente proveedor (54):** checklist KYC con subida a Storage,
  validación formal por Admin, soporte de proveedor extranjero. Componente
  compartido `ExpedientePanel` reutilizable. 15 tests.
- **Factura en OC (55):** parser de XML CFDI 4.0/3.3 en el navegador (sin
  n8n), subida de PDF y XML, 3 avisos (RFC, total, duplicada), campo legacy
  preservado. 21 tests.

---

## 2. Lo que hay en producción

Todo hasta la 55. Hosting en `index-By7gL9-J.js` (2-oct, 16:2x).

**Functions, las seis, Node 22 en us-central1:** `extraerTarifas`,
`clasificarDocumento`, `gestionarUsuarios`, y las tres del 2-oct —
`generarDocumento`, `tipoCambioProgramado` (0 8,10,12,14,16,18 L-V,
hora de la Ciudad de México) y `actualizarTipoCambio` (401 sin token:
pública en la red, cerrada en el código). Log sin un solo error.

**Reglas de Firestore Y de Storage desplegadas**, las dos con
`uploading rules` —no `skipping upload`— incluyendo las tres rutas que
el sprint usaba y que estaban denegadas: `configuracion/empresa`,
`configuracion/tipoCambio` + `tiposCambio/{fecha}` (solo lectura desde
el navegador) y `ordenesCompra/{id}/factura/` en Storage.

El deploy de Functions pidió dos parámetros nuevos
(`N8N_WEBHOOK_URL_GENERAR_DOC` y `N8N_WEBHOOK_URL_TIPO_CAMBIO`): las
tareas 40 y 51 los declararon con `defineString` y `functions/.env` está
en .gitignore, así que el sprint no podía escribirlos. Quedaron en
`functions/.env.vermur-logistics-app` y ya no vuelve a preguntar.

**2028 tests · 90 archivos · tsc 0 · recorrido 6/6** en main.

---

## 3. Cola restante

Las colas 35–42, 43–48 y 49–55 quedaron vacías. Lo que sigue:

| Qué | Tipo | Bloquea |
|---|---|---|
| Validar 35–55 en navegador (VALIDACION-35-55.md) | Validación | Cerrar el sprint |
| Correr `actualizarTipoCambio` una vez desde la app y ver qué documento cae en `tiposCambio` | Validación | Confirmar la tasa |
| Aplicar las 15 reglas de IVA (tarea 39) | Script | Confirmar CON-019, CON-022 y CON-081 con Julio |
| Borrar o deshabilitar las tres cuentas de prueba del Auth de producción | Seguridad | — |
| Deploy de `storage.rules` (expedientes + facturas OC) | Reglas | Subidas desde la app |
| Script de carga fiscal fase 1 (minar `numeroEntidadMagaya`) | Script | Timbrado |
| Export de Magaya con datos fiscales (fase 2) | Dato externo | Timbrado |
| Confirmaciones de Julio (3 conceptos IVA + regla fiscal TC + IVA oficina) | Decisión | Script 39, tarea 51, tarea 55 |
| Freno de facturación por datos fiscales incompletos | Código | Timbrado |
| Pasos 2 y 3 de aprobación de proveedores | Código | Julio define docs |
| Freno de OC por expediente del proveedor (paso 2 del plan) | Código | Decisión de Mau |
| Documentos operativos restantes (BL, booking…) | Código | Preguntas de Gaby |
| Tarea 25: correo como imagen en revisión de tarifas | Código | No se intentó |

Y lo que arrastramos:
- Barrido de reglas sin quien las llame (4 identificadas)
- `tsc` bloqueante en el build
- Deshabilitar cuentas de prueba en Auth de producción

---

## 4. Decisiones pendientes

### Para Mau (de la cadena 49–55)

1. **Regla de `configuracion` y `tiposCambio`:** bloqueante para «Mi empresa»
   y tipo de cambio. El bloque exacto está en el reporte 51.
2. **¿Las 6 cuentas ya tienen el custom claim `rol`?** Prerrequisito del plan
   de reglas por rol (tarea 53).
3. **¿Administración necesita la vista 'quotes'?** Tiene `cotizacion.crear`
   pero no `quotes` en `ALLOWED_VIEWS_BY_ROLE`.
4. **¿`info@digsol.com.mx` sigue como admin?**
5. **¿El despliegue de las reglas por rol se hace un sábado?**
6. **Regla de Storage para `ordenesCompra/*/factura/`:** bloque exacto en
   reporte 55.

### Para Mau (pendientes anteriores)

7. ¿Correr la fase 1 del plan fiscal (minar `numeroEntidadMagaya` → `rfc`)?
8. ¿Freno de facturación por datos fiscales incompletos?
9. ¿Tolerancia del IVA configurable?
10. ¿Correr `auditarCotizacionesVivas.ts` contra producción? (plan 17)
11. ¿Agentes de carga son siempre clientes de oficina? (plan 18)
12. ¿Operaciones ve Bandeja de Pricing o solo la lista? (plan 18)
13. ¿Bloquear envío por tarifas vencidas al reciclar? (plan 19)
14. ¿Gaby y Luis ambos admin? (tarea 21)
15. Confirmar `VERMUR_N8N_TOKEN` como variable de entorno en n8n (tarea 22)

### Para Vermur

**Julio:**
- Regla fiscal del tipo de cambio (determinación vs liquidación).
- IVA para gastos de oficina sin embarque (¿siempre 16%?).
- 3 confirmaciones del script de IVA (CON-019, CON-022, CON-081).

**Gaby / Luis:**
- G11: teléfono oficial para las cartas encomienda.
- G12: firma como texto o imagen.
- G16: cargo USD $174 de MSC vigente.
- ¿Pricing cotiza con el FIX o le carga un diferencial?
- 10 preguntas de PLAN-C sobre documentos y HBL.

**Luis:**
- Export de Magaya con Entity Number, Name, Tax ID, Zip Code, Country,
  Address (clientes y proveedores).

---

## 5. Deuda crítica que no se movió

- Reglas de Firestore no distinguen roles (plan escrito en tarea 53)
- `localhost` sin emuladores escribe en producción
- Tres cuentas de prueba en Auth de producción
- `getCostoOficial` suma sin mirar moneda

---

## 6. Entregables vigentes que no son código

**Planes** (`docs/sprint-post-junta/`):
- `AUDITORIA-35-48.md` — veredictos de publicación de las 14 tareas previas.
- `PLAN-REGLAS-POR-ROL.md` — matriz colección × rol, migración a claims.
- `PLAN-CARGA-FISCAL.md` — minar Tax IDs, pedir export, script de carga.
- `PLAN-FUENTE-TARIFA.md` — tarifa elegida, reconciliación silenciosa.
- `PLAN-EQUIPOS-MINIMO.md` — CRM readonly para Ops, equipos reales.
- `PLAN-RECICLAR.md` — copiar cotización previa, tarifas vencidas.
- `PLAN-C.md` — 6 documentos operativos, talonario de HBL.
- `PLAN-APROBACION.md` — expediente de proveedores.

**Diagnósticos** (`docs/sprint-post-junta/`):
- `BARRIDO-FILTROS.md` — inventario de 43 filtros, estado de cada uno.
- `BARRIDO-GENERAL.md` — recorrido de 95 pantallas × 5 roles, limpio.

**JSON de n8n** (`docs/n8n/`):
- `generar-pdf-cotizacion.n8n.json` — con nodo de validación de token.
- `tipo-cambio-banxico.n8n.json` — flujo de consulta al SIE de Banxico.

---

## 7. Orden propuesto para la mañana

1. Leer `sprint/reportes/RESUMEN.md` y los reportes que interesen.
2. Publicar la cadena 35–42 primero (reglas de `configuracion`, Functions,
   hosting).
3. Publicar la cadena 43–48 (solo hosting).
4. Publicar la cadena 49–55: reglas Firestore (`configuracion`, `tiposCambio`)
   → Functions (`tipoCambioProgramado`, `actualizarTipoCambio`,
   `generarDocumento`) → Storage (`ordenesCompra/*/factura/`) → hosting.
5. Validar en producción: tipo de cambio (clic «Actualizar ahora»), cartas
   encomienda (generar una de Maersk), expediente de proveedor, factura en OC.
6. Mandar las preguntas a Julio (TC + IVA oficina + 3 conceptos) y a
   Gaby/Luis (teléfono, firma, MSC, diferencial).
7. Desplegar Storage pendiente del sprint anterior.
8. Deshabilitar las tres cuentas de prueba en Auth.
