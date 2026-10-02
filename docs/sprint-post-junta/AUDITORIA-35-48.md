# Auditoría independiente de las cadenas 35–48

Fecha: 2 de octubre de 2026
Auditor: sesión independiente (tarea 49)
Punta auditada: `sprint/base` (commit `c1f932b`)

---

## 1. Tabla de veredictos

| # | Rama | Veredicto | Motivo | Qué validar Mau en producción |
|---|---|---|---|---|
| 35 | sprint/35-datos-fiscales | Publicar | 28 tests verificados, mutación detectada. Un dato incorrecto en el reporte (ver §3.4). | Altas → cliente → sección Datos fiscales + Crédito por modalidad |
| 36 | sprint/36-iva-factura-proveedor | Publicar | 28 tests (23 `it` + 1 `it.each` ×5). Mutación detectada en 15/28. | Finanzas → OC → bloque IVA, bandeja con badge y filtro |
| 37 | sprint/37-dias-credito-modalidad | Publicar | 21 tests verificados. Mutación detectada en 9/21. | CRM → cotización con conceptos → resumen financiero |
| 38 | sprint/38-aprobacion-proveedores | Publicar | 15 tests verificados. Mutación detectada en 4/15. | Altas → Proveedores badge, Alta rápida sin RFC en `numeroEntidadMagaya` |
| 39 | sprint/39-conceptos-iva | Publicar | Script puro, 0 cambios en src/. Lo corre Mau. | Correr en seco contra producción |
| 40 | sprint/40-documentos-base | Publicar con nota | Falta regla de `configuracion` (conocido). Deploy: usar `--only functions:generarDocumento`, NO `--only functions`. | Config → Mi empresa (fallará sin la regla) |
| 41 | sprint/41-notificacion-arribo | Publicar | 11 tests verificados. Depende de la regla de la 40. | Embarque → Documentos → Generar notificación |
| 42 | sprint/42-plan-carga-fiscal | Publicar | Plan, 0 código. Hallazgo correcto sobre `numeroEntidadMagaya`. | Leer el plan |
| 43 | sprint/43-boton-regresar | Publicar | NavegacionContext con `registrarAbierta`, flecha ← en 8 fichas. | Todas las fichas: flecha ← funciona |
| 44 | sprint/44-acciones-arriba | Publicar con nota | Solo 3 fichas migradas. Lista de pendientes en §3.1. | Cotización, OC, Prospecto: acciones arriba |
| 45 | sprint/45-barrido-filtros | Publicar | 34 e2e verificados. Limitaciones en §3.2. | — (solo tests y documento) |
| 46 | sprint/46-barrido-filtros-arreglos | Publicar | 12 archivos con `contiene()`, pricingId fix. Mutación detectada. | Buscar «garcia» en CRM y «alvarez» en Altas |
| 47 | sprint/47-barrido-consola-roles | Publicar con nota | 95 e2e verificados. Limitaciones en §3.3. | — (solo tests y documento) |
| 48 | sprint/48-textos-finanzas | Publicar | Textos corregidos, pestaña default verificada. | Finanzas abre en CxP, texto de OC dice Operaciones |

---

## 2. Verificación de evidencia

### 2.1 Tests unitarios

| Rama | Claim | Real | Método |
|---|---|---|---|
| 35 | 28 tests en datosFiscales.test.ts | 28 `it()` | `vitest run` → 28 passed. Mutación: 2/28 fallan al romper `estadoFiscal`. |
| 36 | 28 tests en ivaOrdenCompra.test.ts | 23 `it()` + 1 `it.each(5)` = 28 ejecuciones | `vitest run` → 28 passed. Mutación: 15/28 fallan al romper `ivaEsperadoDeOC`. |
| 37 | 21 tests en diasCreditoServicio.test.ts | 21 `it()` | `vitest run` → 21 passed. Mutación: 9/21 fallan al romper `diasCreditoDeModalidad`. |
| 38 | 15 tests en estadoValidacion.test.ts | 15 `it()` | `vitest run` → 15 passed. Mutación: 4/15 fallan al romper `estadoValidacion`. |
| 40 | 17 + 5 tests | 17 en motorPlantillas + 5 en documentosOperativos | `vitest run` → 22 passed. |
| 41 | 11 tests en notificacionArribo.test.ts | 11 `it()` | `vitest run` → 11 passed. |
| 46 | 7 tests de acentos en texto.test.ts | 5 `it()` blocks (con assertions múltiples) | `vitest run` → 5 passed. Mutación: 2/5 fallan al invertir `contiene()`. El claim «7» posiblemente cuenta assertions en vez de bloques. |

### 2.2 Suites completas

```
CI=1 npm test          → 1937 passed, 0 failed (86 archivos)
npx tsc --noEmit       → 0 errores
npm run build          → limpio (1.89s)
./scripts/e2e.sh       → 6/6 (corrida 1: 9.6s, corrida 2: 9.1s)
45-filtros.spec.ts     → 34/34 (1.4m)
47-barrido-general     → 95/95 (4.7m)
```

### 2.3 Stashes

| Stash | Rama | Contenido | Falta algo en la rama? |
|---|---|---|---|
| `stash@{0}` | sprint/47-barrido-consola-roles | `test-results/.last-run.json` (artefacto de Playwright) | No |
| `stash@{1}` | sprint/44-acciones-arriba | `scripts/capturas-44.mjs` (159 líneas, script de capturas) | No — es un script auxiliar, no código de la app |
| `stash@{2}` | sprint/37-dias-credito-modalidad | `test-results/.last-run.json` (artefacto de Playwright) | No |

Ningún stash contiene código de producción ni cambios que deberían estar en la rama.

---

## 3. Puntos dudosos (lo que la tarea pide resolver)

### 3.1 Tarea 44 — fichas que siguen con acciones abajo

La tarea 44 migró tres fichas: **FichaCotizacion**, **FichaOC** y **FichaProspecto**. Fichas con acciones o botones de guardado que siguen al fondo:

| Ficha | Qué tiene abajo | Tipo de acción | Aplica subir al header? |
|---|---|---|---|
| **FichaEmbarque** | Botones «Guardar Cambios» dentro de cada sección de pestaña | Guardado por sección | Discutible — son guardados de formulario, no workflow |
| **FichaCliente** | `SaveBar` con «Guardar cambios» en cada pestaña (Info, Comercial, Expediente, Crédito) | Guardado por pestaña | Discutible — mismo caso |
| **FichaRFQ** | «Enviar a Ventas» al fondo del sidebar oscuro de Pricing | Acción de workflow | Sí — es una transición de etapa |
| **FichaProveedor** | Ninguna — «Editar» ya está en el header | — | N/A |
| **FichaFactura** | Ninguna — es solo visualización | — | N/A |

**FichaRFQ** es la única que tiene una acción de workflow abajo que claramente debería subir. Los «Guardar cambios» de FichaEmbarque y FichaCliente son guardados de formulario, no transiciones; la decisión de subirlos es de interfaz, no de workflow.

### 3.2 Tarea 45 — qué tan fuertes son los 34 tests

Los 34 tests verifican:
- Que cada filtro/búsqueda **carga sin error** y **muestra resultados** (o los oculta).
- Que los filtros por rol no muestran módulos prohibidos (3 tests de permisos).

**Qué NO prueban:**
- **Búsquedas con acentos.** La tarea 45 no usa `contiene()` en sus tests; no teclea «garcia» para buscar «García». Eso lo encontró y arregló la tarea 46.
- **Datos de producción.** Los tests corren contra semilla del emulador: 3 clientes, 8 cotizaciones, 544 proveedores (heredados de Magaya), 0 embarques/OC/facturas propios. Un filtro que falle con 817 clientes o con datos complejos no se detecta aquí.
- **Filtros combinados.** Cada test aplica un solo filtro. Un bug que aparezca al combinar búsqueda + filtro de etapa + filtro de estado no se atrapa.
- **Filtro de la columna Fiscal** (agregada por la 35) — no tiene ni selector dedicado ni test.
- **Rendimiento.** No hay timeout de carga ni medición de latencia con volúmenes reales.

Los 34 tests son un inventario funcional válido, no una suite de regresión exhaustiva. Su valor principal es que documentan los 43 filtros y confirman que todos cargan.

### 3.3 Tarea 47 — qué no puede detectar el barrido

El barrido de 95 tests abre cada pantalla con datos del emulador y busca errores de consola, textos rotos, permisos violados y desbordes. **Lo que no puede detectar:**

- **Errores que solo se manifiestan con datos de producción:** cotizaciones con servicios mixtos, embarques con múltiples contenedores, clientes con contactos duplicados, proveedores con tipos múltiples. El emulador tiene semilla estática; muchos módulos cargan vacíos.
- **Errores de escritura:** el barrido solo abre pantallas. No llena formularios, no guarda, no avanza etapas (excepto el recorrido principal). Un `undefined` que solo aparece al guardar no se ve.
- **Latencia de red y errores intermitentes:** todo corre en localhost contra emuladores locales.
- **Concurrencia:** un solo usuario por rol, nunca dos personas editando la misma cotización.
- **Cloud Functions reales:** el emulador no levanta Functions. Todo lo que pasa por `generarDocumento`, `clasificarDocumento` o `extraerTarifas` no se ejecuta.
- **Reglas de Firestore:** los emuladores usan reglas derivadas que incluyen cuentas de prueba. Un error de reglas en producción (como la falta de `configuracion`) no se manifiesta aquí.

### 3.4 Contradicción `numeroEntidadMagaya` (tareas 42 vs 35)

**Resuelto.** El seed `src/data/seeds/clientes.json` tiene:

- 817 clientes totales
- **318** con `numeroEntidadMagaya` no vacío (valores como `AEL571218HP7`, `PRO1201302L7`)
- 499 con `numeroEntidadMagaya` null

La tarea 42 dice correctamente «318 de 817 clientes lo traen». La tarea 35 dice «`numeroEntidadMagaya` es null para los 817» — **eso es incorrecto**. Lo que es cierto es que el campo `rfc` no existe en el seed (0 ocurrencias). La confusión es entre `rfc` (inexistente) y `numeroEntidadMagaya` (318 con valor).

**Consecuencia:** la fase 1 del plan fiscal (minar RFC de `numeroEntidadMagaya`) SÍ tiene datos con los que trabajar. Los 318 valores son en su mayoría RFC mexicanos válidos (formato de 12-13 caracteres alfanuméricos), mezclados con Tax IDs extranjeros que el script debe filtrar.

### 3.5 Tarea 40 — regla de `configuracion` y pantallas que fallarían

`firestore.rules` no tiene regla para la colección `configuracion`. En producción, con la regla default `deny all`, fallarían:

1. **Configuración → Mi empresa** (`ConfiguracionEmpresa.tsx`): la lectura de `configuracion/empresa` se tragará en silencio (el hook muestra los defaults precargados de Vermur), pero el guardado fallará con error de permisos.
2. **La Cloud Function `generarDocumento`**: lee `configuracion/empresa` con el Admin SDK, que **NO** pasa por reglas. Funciona sin la regla.
3. **`useConfiguracionEmpresa`**: en modo lectura, si el documento no existe, el hook precarga datos fijos. No falla, pero no refleja cambios guardados.

**En resumen:** la pantalla «Mi empresa» se ve bien pero no guarda hasta que se agregue la regla. La Function no se afecta.

### 3.6 Tarea 40 — comando de deploy

El reporte dice:

```bash
npx firebase deploy --only functions
```

El correcto es:

```bash
npx firebase deploy --only functions:generarDocumento
```

`--only functions` desplegaría las 4 funciones (`extraerTarifas`, `clasificarDocumento`, `generarDocumento`, `gestionarUsuarios`). Si alguna tiene un cambio no probado, se publica sin querer. Usar `--only functions:generarDocumento` despliega solo la nueva.

---

## 4. Orden de publicación

### Paso 1: Regla de `configuracion` (previo a la cadena)

```bash
# Agregar a firestore.rules, dentro de la función match /databases/{db}/documents:
#   match /configuracion/{doc} {
#     allow read: if esDelEquipo();
#     allow write: if esDelEquipo();
#   }
# Luego:
cd /Users/mauriciogutierrezmunoz/antigravity/Vermur-Logistics && npx firebase deploy --only firestore:rules
```

Verificar que dice `uploading rules`, no `skipping upload`.

### Paso 2: Cadena 35–42

| Paso | Qué | Comando | Nota |
|---|---|---|---|
| 2a | Merge 35→36→37→38→39→40→41→42 a main | `git merge` en orden | — |
| 2b | Deploy Function nueva | `cd … && npx firebase deploy --only functions:generarDocumento` | Solo la nueva |
| 2c | Deploy hosting | `cd … && npx firebase deploy --only hosting` | — |

### Paso 3: Cadena 43–48

| Paso | Qué | Comando | Nota |
|---|---|---|---|
| 3a | Merge 43→44→45→46→47→48 a main | `git merge` en orden | — |
| 3b | Deploy hosting | `cd … && npx firebase deploy --only hosting` | — |

### Punto de regreso

Si hay que revertir:
- **Hosting:** `firebase hosting:rollback` o deploy del hash anterior.
- **Function `generarDocumento`:** es nueva, no reemplaza nada. Borrarla de `index.ts` y redesplegar.
- **Regla de `configuracion`:** quitarla de `firestore.rules` y redesplegar reglas.

---

## 5. Validación que Mau debe hacer en producción

| Prioridad | Cuenta | Pantalla | Acción | Resultado esperado |
|---|---|---|---|---|
| Alta | administracion | Config → Mi empresa | Editar teléfono y guardar | Persiste tras recargar (requiere regla desplegada) |
| Alta | admin | CRM → cotización con conceptos | Ver resumen financiero | Días de crédito por modalidad si el cliente tiene desglose |
| Alta | admin | Altas → Clientes | Buscar «garcia» | Encuentra clientes con «García» (acentos normalizados) |
| Alta | pricing | Bandeja Pricing → Solo mías | Clic | Filtra correctamente (antes no filtraba) |
| Alta | administracion | Finanzas | Abrir | Pestaña activa: «Cuentas por pagar», no «Facturas (CFDI)» |
| Alta | administracion | Finanzas → CxP vacía | Leer texto vacío | «Operaciones las solicite…», no «Pricing» |
| Media | cualquiera | Cualquier ficha | Flecha ← arriba | Regresa a la lista, no pierde filtros |
| Media | pricing | Cotización → header | Ver acciones | «Nueva versión» y «Marcar perdida» arriba, no en footer |
| Media | administracion | Altas → cliente → Información | Sección fiscal | RFC, CP, régimen. Badge cambia al completar. |
| Media | administracion | Altas → cliente → Crédito | Días por modalidad | 4 selectores: General, Marítimo, Aéreo, Terrestre |
| Media | operaciones | Embarque → Documentos | Panel documentos operativos | Botón «Generar notificación de arribo» |
| Baja | admin | Altas → Proveedores | Badges de validación | Magaya: gris, manuales sin validar: ámbar |

---

## 6. Preguntas abiertas (heredadas de los reportes)

### Para Mau

1. ¿Correr la fase 1 del plan fiscal ya? (tarea 42) — Recomendación: sí.
2. ¿Tolerancia de IVA configurable? (tarea 36) — Recomendación: dejar fija.
3. ¿Agregar la regla de `configuracion` ahora? — **Bloqueante para «Mi empresa».**

### Para Vermur

1. **Julio:** 3 confirmaciones del script de IVA (CON-019, CON-022, CON-081).
2. **Gaby:** G11 (teléfono oficial), G18 (cargos en la notificación de arribo).

---

## 7. Forense de 53–55 y verificación por mutación (2-oct-2026)

### 7.1 Una sola sesión produjo tres tareas

El log del sprint cierra con `Fin: 4 terminadas de 4 intentadas` y solo
existen `tarea-49.log` … `tarea-52.log`. No hay log de 53, 54 ni 55. Pero sí
hay commits:

| Tarea | Commit | Hora |
|---|---|---|
| 53 · plan de reglas por rol | `63961c0` | 02:01:48 |
| 54 · expediente del proveedor | `d547647` | 02:16:07 |
| 55 · factura PDF/XML en la OC | `dda3884` | 02:28:00 |

Las tres caen dentro de la ventana de la sesión de la **tarea 52**
(01:32 → 02:32), y el `docs(estado)` de la rama 52 aterriza a las **02:36:36**,
después de los tres. Conclusión: la sesión de la 52 siguió de largo y trabajó
53, 54 y 55 por su cuenta, sin pasar por el lanzador. Por eso 54 y 55 aparecen
con «—» minutos y nunca cruzaron la compuerta por tarea del script.

Consecuencia práctica: **el código está, la evidencia por tarea no**. De ahí
que la verificación de abajo no se apoye en los reportes sino en mutar el
código y ver qué test se cae.

El `stash@{0}` que quedó pendiente contiene **únicamente**
`.noche/REPORTE_MAÑANA.md` (102 líneas, sin trackear). No falta código de
ninguna rama.

### 7.2 Verificación por mutación

Se rompió a propósito una regla de cada módulo y se contó cuántos tests se
caen. Un módulo cuyos tests pasan igual con la regla rota no está verificado,
está acompañado.

| Tarea | Módulo | Tests | Fallan al mutar | Mutación aplicada |
|---|---|---|---|---|
| 51 | `tipoCambioBanxico` | 24 | **5** | se quita el corte de fin de semana en `esDiaHabil` |
| 52 | `cartasEncomienda` | 31 | **17** | — |
| 54 | `expedienteProveedor` | 15 | **3** | — |
| 55 | `parsearCFDI` | 21 | **6** | — |
| 50 | movimiento de UI | **0** | — | no tiene tests propios |

**La tarea 50 no tiene red.** Es un movimiento de interfaz repartido en
`FichaCliente.tsx`, `FichaRFQ.tsx` y `FichaEmbarque.tsx`: no hay lógica que
aislar, así que se valida a mano (§5 de la lista de validación).

`parsearCFDI.test.ts` no arrancaba en este worktree por falta de `jsdom`
—vitest sale con código 1, no en silencio—. Con `npm install`, la suite
completa son **90 archivos / 2 028 tests**, que es lo que reportó la noche.

Recorrido Playwright en la punta (`dda3884`): **6/6 en 9.5 s**.

### 7.3 Reglas que faltaban

El reporte de la noche lo dejó anotado como bloqueo: *«Storage rules para
factura OC: la ruta `ordenesCompra/{ordenId}/factura/` NO tiene regla»*. Es
decir, la tarea 55 subía archivos a una ruta que Storage deniega. Lo mismo
con `configuracion/empresa` (tarea 40) y con el tipo de cambio (tarea 51).

Se agregaron tres bloques en `firestore.rules` y uno en `storage.rules`, con
sus tests (`tests/reglas/equipo.test.ts`: de 13 a **26**). Verificado por
mutación: con las reglas de `HEAD`, **4 de los 26 fallan**; con las nuevas,
pasan los 26.

El tipo de cambio quedó **de solo lectura para el navegador**: lo escribe
`actualizarTipoCambio` con el Admin SDK, que no pasa por las reglas, y la
captura manual de la pantalla va por esa misma función (`useTipoCambio.ts`
solo hace `onSnapshot` y `getDocs`). Dejarlo abierto permitiría mover desde
la consola la tasa con la que se cotiza y se factura.
