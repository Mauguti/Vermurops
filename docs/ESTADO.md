# Estado de VermurOps — 2 de octubre de 2026

Corte del sprint nocturno del 1-oct. 8 tareas terminadas (35–42), cadena
lista para publicar. Nada se mergeó ni se desplegó.

---

## 1. Lo que hay en la cadena (sin publicar)

**Cadena sprint/35 → 42**, cada rama sale de la anterior. Todas [x].

| # | Tarea | Rama | Despliega |
|---|---|---|---|
| 35 | Datos fiscales del cliente (RFC, CP, régimen, días crédito) | sprint/35-datos-fiscales | Hosting |
| 36 | IVA de la factura del proveedor y alerta | sprint/36-iva-factura-proveedor | Hosting |
| 37 | Cotización usa días de crédito por modalidad | sprint/37-dias-credito-modalidad | Hosting |
| 38 | Aprobación de proveedores (pasos 1, 4, 5A) | sprint/38-aprobacion-proveedores | Hosting |
| 39 | Script conceptos IVA de Vermur | sprint/39-conceptos-iva | Nada (script) |
| 40 | Documentos operativos: config empresa + Function | sprint/40-documentos-base | Hosting + Functions + Reglas |
| 41 | Notificación de arribo desde el embarque | sprint/41-notificacion-arribo | Hosting + Functions |
| 42 | PLAN: carga fiscal desde Magaya | sprint/42-plan-carga-fiscal | Nada (plan) |

**1936 tests · tsc 0 · e2e 6/6** en la punta de la cadena.

### Lo nuevo en la cadena

- **Datos fiscales (35):** sección fiscal en la ficha del cliente (RFC, CP,
  régimen SAT), columna «Fiscal» filtrable en la tabla, 28 tests. Hallazgo:
  el RFC no vino de Magaya — el seed tiene 0 con `rfc`; los Tax IDs están en
  `numeroEntidadMagaya`.
- **IVA de factura del proveedor (36):** desglose fiscal editable en la
  conciliación, alerta en la OC y badge + filtro en la bandeja. 28 tests.
  Hallazgo: `facturaDatos.iva` ya existía (la previa lo negaba).
- **Días de crédito por modalidad (37):** función compartida con cadena de
  respaldo, financiamiento por servicio en el resumen. 21 tests.
- **Aprobación de proveedores (38):** `estadoValidacion()` compartido, fix
  del alta rápida (RFC no va en `numeroEntidadMagaya`), badge en Altas.
  15 tests.
- **Script de IVA (39):** aplica los 15 conceptos de Vermur del 30-sep. Seco
  por defecto, con respaldo y reversa. 3 conceptos pendientes de Julio.
- **Documentos operativos (40):** pantalla «Mi empresa», Function
  `generarDocumento`, motor de plantillas HTML. 22 tests. **Necesita regla
  de `configuracion` en `firestore.rules`.**
- **Notificación de arribo (41):** plantilla HTML fiel a la original, botón
  con validación, panel de versiones. 11 tests.
- **Plan de carga fiscal (42):** hallazgo de 318 Tax IDs en
  `numeroEntidadMagaya`, plan de 3 fases, pregunta para Luis redactada.

---

## 2. Lo que hay en producción

Todo lo de la cadena 27–34 (publicada el 1-oct). Hosting en
`index-Cyowerkz.js`; Functions `gestionarUsuarios`, `extraerTarifas` y
`clasificarDocumento`; reglas de Firestore con `esDelEquipo()`.
**Storage NO está desplegado.**

**1811 tests · tsc 0 · recorrido 6/6** en main.

---

## 3. Cola restante

La cola del sprint 35–42 quedó vacía. Lo que sigue:

| Qué | Tipo | Bloquea |
|---|---|---|
| Regla de `configuracion` en `firestore.rules` | Reglas | Tarea 40 en prod |
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

### Para Mau (del sprint de esta noche)

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
  **Nuevo esta noche.**
- `PLAN-FUENTE-TARIFA.md` — tarifa elegida, reconciliación silenciosa.
- `PLAN-EQUIPOS-MINIMO.md` — CRM readonly para Ops, equipos reales.
- `PLAN-RECICLAR.md` — copiar cotización previa, tarifas vencidas.
- `PLAN-C.md` — 6 documentos operativos, talonario de HBL.
- `PLAN-APROBACION.md` — expediente de proveedores.

**JSON de n8n** (`docs/n8n/`):
- `generar-pdf-cotizacion.n8n.json` — con nodo de validación de token.

---

## 7. Orden propuesto para la mañana

1. Leer `sprint/reportes/RESUMEN.md` y los reportes que interesen.
2. Validar la cadena en el preview o en el emulador.
3. Mergear y desplegar en orden: hosting hasta la 38, reglas de
   `configuracion`, Functions, hosting final.
4. Correr el script de IVA en seco contra producción.
5. Mandar las preguntas a Luis (export fiscal) y a Julio (3 conceptos).
6. Leer el plan de carga fiscal y decidir la fase 1.
7. Desplegar Storage (pendiente del 1-oct).
8. Deshabilitar las tres cuentas de prueba en Auth.
