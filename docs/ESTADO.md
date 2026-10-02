# Estado de VermurOps — 2 de octubre de 2026

Corte del sprint nocturno del 1-oct (segunda cola). 6 tareas terminadas
(43–48), cadena lista para publicar encima de la 35–42. Nada se mergeó ni
se desplegó.

---

## 1. Lo que hay en la cadena (sin publicar)

### Cadena 35–42 (sprint anterior, aún sin publicar)

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

### Cadena 43–48 (esta noche, encima de la anterior)

| # | Tarea | Rama | Despliega |
|---|---|---|---|
| 43 | Botón «Regresar» en todas las fichas | sprint/43-boton-regresar | Hosting |
| 44 | Acciones de las fichas arriba | sprint/44-acciones-arriba | Hosting |
| 45 | Barrido de filtros: inventario y prueba | sprint/45-barrido-filtros | Hosting |
| 46 | Barrido de filtros: arreglos | sprint/46-barrido-filtros-arreglos | Hosting |
| 47 | Barrido general: consola y permisos por rol | sprint/47-barrido-consola-roles | Hosting |
| 48 | Textos pendientes y pestaña inicial de Finanzas | sprint/48-textos-finanzas | Hosting |

**1937 tests · tsc 0 · e2e 6/6** en la punta de la cadena (sprint/48).

### Lo nuevo en la cadena 43–48

- **Regresar (43):** todas las fichas con flecha ← en el encabezado.
  NavegacionContext rastrea el origen para regresar a ficha anterior cuando
  se llegó de otra ficha.
- **Acciones arriba (44):** botones de workflow subieron al header fijo.
  AccionesHeader con menú «⋯» en angosto. Footer solo con auto-guardado.
- **Filtros (45–46):** 34 e2e cubren los 43 filtros de la plataforma.
  10 componentes corregidos para buscar con acentos (contiene() de
  lib/texto.ts). «Solo mías» de Bandeja Pricing arreglado.
- **Barrido (47):** 95 e2e por 5 roles × todas las pantallas. Cero errores
  de consola, cero textos rotos, cero permisos violados, cero desbordes.
  Documento BARRIDO-GENERAL.md.
- **Textos y Finanzas (48):** BandejaOC dice «Operaciones» (no «Pricing»).
  Finanzas abre en «Cuentas por pagar».

---

## 2. Lo que hay en producción

Todo lo de la cadena 27–34 (publicada el 1-oct). Hosting en
`index-Cyowerkz.js`; Functions `gestionarUsuarios`, `extraerTarifas` y
`clasificarDocumento`; reglas de Firestore con `esDelEquipo()`.
**Storage NO está desplegado.**

**1811 tests · tsc 0 · recorrido 6/6** en main.

---

## 3. Cola restante

Las colas 35–42 y 43–48 quedaron vacías. Lo que sigue:

| Qué | Tipo | Bloquea |
|---|---|---|
| Publicar cadena 35–42 (reglas de `configuracion`, Functions, hosting) | Deploy | Todo lo de la 43–48 |
| Publicar cadena 43–48 (hosting) | Deploy | — |
| Deploy de `storage.rules` | Reglas | Subidas desde la app |
| Script de carga fiscal fase 1 (minar `numeroEntidadMagaya`) | Script | Timbrado |
| Export de Magaya con datos fiscales (fase 2) | Dato externo | Timbrado |
| Confirmaciones de Julio (3 conceptos IVA) | Decisión | Script 39 |
| Freno de facturación por datos fiscales incompletos | Código | Timbrado |
| Pasos 2 y 3 de aprobación de proveedores | Código | Julio define docs |
| Documentos operativos restantes (BL, booking…) | Código | Preguntas de Gaby |
| Tarea 25: correo como imagen en revisión de tarifas | Código | No se intentó |

Y lo que arrastramos:
- Barrido de reglas sin quien las llame (4 identificadas)
- `tsc` bloqueante en el build
- Deshabilitar cuentas de prueba en Auth de producción

---

## 4. Decisiones pendientes

### Para Mau (del sprint 35–42)

1. ¿Correr la fase 1 del plan fiscal (minar `numeroEntidadMagaya` → `rfc`)?
   Recomendación: sí, inmediato.
2. ¿Freno de facturación por datos fiscales incompletos? Recomendación: sí,
   pero no en este sprint.
3. ¿Tolerancia del IVA configurable? Recomendación: dejar fija.
4. ¿Quién agrega la regla de `configuracion` a `firestore.rules`?

### Para Mau (pendientes anteriores)

5. ¿Correr `auditarCotizacionesVivas.ts` contra producción? (plan 17)
6. ¿Agentes de carga son siempre clientes de oficina? (plan 18)
7. ¿Operaciones ve Bandeja de Pricing o solo la lista? (plan 18)
8. ¿Bloquear envío por tarifas vencidas al reciclar? (plan 19)
9. ¿Gaby y Luis ambos admin? (tarea 21)
10. Confirmar `VERMUR_N8N_TOKEN` como variable de entorno en n8n (tarea 22)

### Para Vermur

**Luis:** export de Magaya con Entity Number, Name, Tax ID, Zip Code,
Country, Address (clientes y proveedores).

**Julio:** 3 confirmaciones del script de IVA (CON-019, CON-022, CON-081).

**Gaby:** 10 preguntas del PLAN-C sobre documentos y HBL. G11 (teléfono
oficial). G18 (cargos en la notificación de arribo).

---

## 5. Deuda crítica que no se movió

- Reglas de Firestore no distinguen roles (el borrador de la 21 es el
  primer paso)
- `localhost` sin emuladores escribe en producción
- Tres cuentas de prueba en Auth de producción
- `getCostoOficial` suma sin mirar moneda

---

## 6. Entregables vigentes que no son código

**Planes** (`docs/sprint-post-junta/`):
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

---

## 7. Orden propuesto para la mañana

1. Leer `sprint/reportes/RESUMEN.md` y los reportes que interesen.
2. Publicar la cadena 35–42 primero (reglas, Functions, hosting).
3. Publicar la cadena 43–48 (solo hosting).
4. Validar en producción: regresar, acciones arriba, búsqueda con acentos,
   Finanzas abre en CxP, texto de OC.
5. Correr el script de IVA en seco contra producción.
6. Mandar las preguntas a Luis (export fiscal) y a Julio (3 conceptos).
7. Desplegar Storage (pendiente del 1-oct).
8. Deshabilitar las tres cuentas de prueba en Auth.
