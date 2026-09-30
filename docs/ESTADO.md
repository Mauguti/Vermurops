# Estado de VermurOps — 30 de septiembre de 2026 (madrugada)

Corte tras el sprint nocturno. 8 tareas en cadena, sin publicar.

---

## 1. Qué hay en la cadena (sin publicar)

**8 ramas encadenadas desde `main`.** Se mergean en orden; cada una pasa
tests (1792), tsc (0 errores), build limpio y e2e 6/6.

| # | Rama | Qué hace | Despliega |
|---|---|---|---|
| 27 | sprint/27-edicion-dos-vistas | Arregla edición en «Por concepto» y «Por proveedor» para captura sin tarifario. Agrega impuesto, proveedor y concepto en la vista Por proveedor. e2e `captura-manual.spec.ts`. | Hosting |
| 28 | sprint/28-ubicacion-por-concepto | La ubicación (origen/destino) pasa del servicio al concepto. Columna por renglón en ambas tablas. IVA por fila. El embarque hereda ubicación por cargo. Test puerta-a-puerta. | Hosting |
| 29 | sprint/29-programacion-pagos | Diagnóstico: las dos pantallas de Finanzas sirven cosas distintas. Estado vacío con contexto y texto descriptivo por pestaña. | Hosting |
| 30 | sprint/30-aduana-precargada | Aduana precargada desde el puerto mexicano: aduanaRecepcion en impo, aduanaSalida en expo. Indicador derivado. 21 tests. | Hosting |
| 31 | sprint/31-pegar-correo-vigencias | Texto pegado → imagen PNG para n8n. Vigencia vencida bloqueada con confirmación. Free time y tránsito con etiquetas claras. Fechas fluyen al guardado. | Hosting |
| 32 | sprint/32-scroll-fichas | h-full al contenedor en Quotes.tsx: el footer de la cotización y el prospecto ya no queda debajo del pliegue. | Hosting |
| 33 | sprint/33-inventario-prueba | Script `inventarioDatosPrueba.ts` de solo lectura: proveedores Z, duplicados, clasificación prueba/real, cruce de folios sin moneda. | Nada |
| 34 | sprint/34-aprobacion | Plan `PLAN-APROBACION.md`: extender validación de expedientes a proveedores, freno en la OC, modelo unificado, 5 pasos. | Nada |

**Para publicar:** mergear las 8 en orden a main y un solo
`firebase deploy --only hosting`. No hay Functions, reglas ni índices.

---

## 2. Cola restante

La cola del sprint 30-sep quedó **vacía**: las 8 tareas terminaron [x].

Pendientes que arrastran de antes y no entraron a esta cola:

- Barrido de reglas sin quien las llame (4 identificadas)
- Volver tsc bloqueante en el build (ya está en cero)
- Functions pendientes del 28-sep: `extraerTarifas` y `clasificarDocumento`
- Desplegar reglas por rol (borrador en `docs/reglas/`)
- Deshabilitar tres cuentas de prueba en Auth de producción
- Corregir `info@digsol.com` → `.com.mx` en reglas

---

## 3. Decisiones pendientes

### Para Mau (bloquean implementación)

1. **(27)** El recorrido falla en «Administración valida expediente» con un
   placeholder que no encuentra. ¿Regresión anterior? Recomendación: investigar
   por separado.
2. **(29)** ¿Las dos pantallas de Finanzas se quedan? Recomendación: sí, son
   lecturas distintas del mismo dato.
3. **(34)** Las 6 preguntas del PLAN-APROBACION.md. La más importante: ¿el
   freno de proveedor va en la OC o en la ganada? Recomendación: en la OC.
4. **(33)** Correr el inventario contra producción y calibrar con Gaby.
5. Confirmar `VERMUR_N8N_TOKEN` como variable de entorno en n8n (pendiente
   del sprint anterior).

### Para Vermur

- **(Julio)** Qué documentos necesita del proveedor para aprobarlo.
- **(Gaby)** 10 preguntas del PLAN-C sobre documentos y HBL (pendiente del
  sprint anterior).

---

## 4. Deuda crítica que no se movió

- Reglas de Firestore no distinguen roles (borrador listo, sin desplegar)
- `localhost` sin emuladores escribe en producción
- Tres cuentas de prueba en Auth de producción
- `getCostoOficial` suma sin mirar moneda

---

## 5. Entregables nuevos de esta noche

**Código (6 ramas):**
- Edición completa en ambas vistas de la cotización, con e2e
- Ubicación por concepto con IVA por fila y herencia al embarque
- Estado vacío con contexto en Programación de pagos
- Aduana precargada desde el puerto
- Texto → imagen para el extractor de tarifas + vigencias con bloqueo
- Scroll arreglado en fichas de cotización y prospecto

**Script:** `scripts/inventarioDatosPrueba.ts` — inventario de datos de prueba.

**Plan:** `docs/sprint-post-junta/PLAN-APROBACION.md` — aprobación de
clientes y proveedores.

---

## 6. Orden propuesto para la mañana

1. Leer RESUMEN.md y los reportes que tengan preguntas (27, 29, 33, 34).
2. Validar en el preview (cuentas y pasos en cada reporte).
3. Responder las 6 preguntas del PLAN-APROBACION.
4. Mergear la cadena (8 ramas en orden) y desplegar hosting.
5. Correr `inventarioDatosPrueba.ts` contra producción.
6. Las Functions pendientes del 28-sep, cuando haya hueco.
