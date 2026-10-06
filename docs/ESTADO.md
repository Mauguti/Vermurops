# Estado de VermurOps — 7 de octubre de 2026 (corte nocturno)

**Corte del sprint nocturno de pagos a proveedor: la cadena 79 → 83 está lista y
SIN PUBLICAR.** Cinco tareas `[x]`, una `[!]` (84, fuera de la cadena), ningún
bloqueo de la guardia.

La cadena 72 → 78 ya está en `main` (`e237219`, merge de `verif/72-78`); esta
sale de ahí. No verifiqué si su hosting ya se publicó: confirmarlo antes.

Punta: `sprint/83-estatus-operativo` — **mergearla trae las cinco**.

En la punta: **2,645 tests en verde** · `tsc --noEmit` 0 errores · build limpio ·
`./scripts/e2e.sh` 6/6.

**La cadena es solo hosting.** No toca reglas, índices, Functions, secretos ni
n8n, y no migra datos. Campos nuevos, opcionales: `Pago.anulacion` y
`Pago.aplicacionesQuitadas`.

Resumen con preguntas redactadas: `sprint/reportes/RESUMEN.md` (no versionado).

---

## 1. La cadena de la noche: 79 → 83, sin publicar

| # | Tarea | Rama | CLAUDE.md |
|---|---|---|---|
| 79 | Motivo de anulación dentro del Pago; fuera el `prompt` | `sprint/79-anulacion-en-pago` | §4.44 |
| 80 | Pagos a proveedor en Pagos; anular revierte sus órdenes | `sprint/80-pagos-proveedor-lista-anular` | §4.45 |
| 81 | Formulario de pago a proveedor | `sprint/81-formulario-pago-proveedor` | §4.46 |
| 82 | Entradas de la orden = cálculo del fondeo; un listener de `pagos/` | `sprint/82-entradas-orden-fondeo` | §4.47 |
| 83 | `clienteOperable`: un criterio de `statusOperativo` | `sprint/83-estatus-operativo` | — |

### Qué trae cada una

- **79.** `anulacion` y `aplicacionesQuitadas` en el Pago (`en` es ISO, no
  Timestamp); la ficha lee del Pago y completa con la bitácora lo anterior.
  Modal de motivo en Facturas del embarque.
- **80.** Pestaña Pagos con los dos lados y totales por lado. Anular un pago a
  proveedor regresa cada orden `pagada → autorizada` por un arco aparte
  (`puedeRevertirPagoOC`), todo o nada.
- **81.** Modal «Registrar pago»: órdenes con casilla, fecha del pago, cuenta,
  referencia y comprobante subido una vez y ligado a todas las órdenes.
- **82.** La ficha de la OC usa `entradasDeFondeo`; `pagos/` pasa de 3
  listeners a 1 (`tiendaCompartida.ts`).
- **83.** Altas, selector de cliente del pallet y mapeo a embarque usan
  `clienteOperable`; los «sin estatus» operan y se etiquetan.

### Lo que hay que hacer antes del hosting

1. Avisar al equipo que anular un cobro pide motivo en un modal.
2. Hosting con `--only hosting` desde el checkout principal
   (`cd /Users/mauriciogutierrezmunoz/antigravity/Vermur-Logistics`), leyendo
   `uploading` y no `skipping upload` (§3); luego merge `--no-ff` y push.
3. Validar en navegador con las tablas de `sprint/reportes/79–83.md`
   (la 83 no tiene capturas).

**Punto de regreso:** `git revert` del merge. Nada que deshacer en datos.

---

## 2. Cola restante

La cola 79–84 terminó a las 11:31. **No hay cola nueva escrita.**

| Qué | Tipo | Bloquea |
|---|---|---|
| **Publicar la cadena 79 → 83** (hosting) | Despliegue | — |
| **84 · Higiene de los e2e** (`[!]`: la sesión salió sin esperar la suite; trabajo a medias en `sprint/84-higiene-e2e`, sin verificar) | Pruebas | Redundancia por mutación de las reglas de dinero de la 73 |
| Reemplazar los `prompt`/`confirm`/`alert` restantes por modal (lista en `79.md`) | Código | Pregunta 5 de Mau |
| Armonizar lectores de `statusOperativo`/`activo` de clientes y proveedores (lista en `83.md`) | Código | — |
| Validar 56–66 y 35–55 en navegador (arrastrado) | Validación | Cerrar sprints anteriores |
| **P8** · flujo de efectivo y `saldosCuenta/` | Código + reglas | Respuesta de Julio |
| Freno del cierre administrativo por prefactura sin factura (J6) | Código | Respuesta de Julio |
| `banco` en `DepositoCliente` (M-F) | Modelo | Respuesta de Julio |
| Reglas por rol (plan 53) | Código + reglas | Después de las capacitaciones del 12 |
| `clasificarDocumento` y `enviarCorreo` | Despliegue | Credenciales / transporte (§5) |
| Flujo `clasificar-documento-oc` en n8n | n8n | Clasificar documentos de la orden |
| Sembrar consecutivos de Magaya y confirmar formato del folio | Dato externo | Embarque automático |
| «Clientes OK» de Luis en CSV y carga en seco | Dato externo | 817 clientes sin RFC |
| Borrar o deshabilitar las tres cuentas de prueba del Auth de producción | Seguridad | — |

---

## 3. Decisiones de Mau y pendientes de esta cadena

Ya tomadas (7-oct): `anulacion` y `aplicacionesQuitadas` aprobados; no se
aplican anticipos viejos; prefactura vive en la orden de compra; Administración
no marca prefactura y se permite retroactiva; los «Sin estatus» no se corrigen
en lote; FichaRFQ se borró, Bookings y Pickups se conservan.

Pendientes (recomendación entre paréntesis, detalle en `RESUMEN.md`):
- ¿Anular un pago a proveedor regresa a `autorizada` o `en_gestion`? (autorizada)
- ¿Anular un pago heredado revierte sus órdenes? (no, hasta que se pida)
- ¿Un cliente «sin estatus» opera o solo se ve? (opera)
- ¿Cuenta de salida obligatoria en el pago a proveedor? (sí, cuando Julio concilie por cuenta)
- ¿Modal de motivo para los `prompt` restantes? (sí, tarea chica)
- ¿Pago repartido sin resolvedor: omitir o listar con aviso? (omitir)
- ¿Se libera el anticipo cruzado de una orden revertida? (revisar con Julio)
- Para Julio: ¿los días de una prefactura cuentan desde la fecha del pago o de la captura?

---

## 4. La cadena 56 → 66 ya está en `main`

Se mergeó durante el día del 5-oct (17:49) y `main` == `origin/main` ==
`6c98000`. La guía de validación en producción está en
[VALIDACION-56-66.md](sprint-post-junta/VALIDACION-56-66.md) y **deja dicho que
dos Functions NO se desplegaron**, bloqueadas por el secreto del correo (§4):

- **`clasificarDocumento`**: «Subir documentos» de la orden de compra sube bien
  y el archivo queda en Storage, pero ningún renglón se clasifica solo — todos
  salen con «El clasificador respondió con error 400» y el tipo se elige a mano.
  Es degradado, no roto.
- **`enviarCorreo`**: no hay nada en la interfaz que mande correo. No buscarlo.

**Antes de dar la cadena por publicada, confirmar el hash del bundle en
producción** (`main` == `origin/main` == producción, protocolo del repo).

Pendiente, arrastrado: **validar 56–66 en navegador**, y **validar 35–55**
([VALIDACION-35-55.md](sprint-post-junta/VALIDACION-35-55.md)).

**Functions, las seis, Node 22 en us-central1:** `extraerTarifas`,
`clasificarDocumento`, `gestionarUsuarios`, `generarDocumento`,
`tipoCambioProgramado` (0 8,10,12,14,16,18 L-V, hora de la Ciudad de México) y
`actualizarTipoCambio`.

Lo que la 56 → 66 trajo está en CLAUDE.md §4.23 (57), §4.24 (58), §4.25 (59),
§4.26 (60), §4.27 (61), §4.28 (63), §4.29 (64), §4.30 (65), §4.31 (66); §4.3
ampliada por la 56.

**La regla de Storage de `ordenesCompra/{id}/documentos/` ya se escribió** —
existe en `storage.rules:121` con sus tests (commit `9cd74ac`). Falta confirmar
que esté **desplegada**; sin ella, un comprobante fotografiado se rechaza porque
los archivos caen en `factura/`, que acepta solo PDF y XML.

---

## 5. ⛔ PENDIENTE BLOQUEANTE · reactivar el correo después del 12-oct

**`enviarCorreo` está comentado en `functions/src/index.ts`** (5-oct). No es un
olvido: mientras esa línea exista y falten sus secretos, **no se puede desplegar
NINGUNA Cloud Function**.

`defineSecret('CORREO_SMTP_USUARIO')` y `…PASSWORD` no existen en Secret Manager
porque no hay credenciales de Exchange, y el `--only` del CLI filtra qué se
despliega pero no qué se **analiza**: Firebase resuelve los parámetros de todo
el codebase antes de filtrar. Eso bloqueó el deploy de `clasificarDocumento` el
5-oct con `Error: In non-interactive mode but have no value for the secret
CORREO_SMTP_USUARIO`.

**Descomentar la línea NO basta.** Hacen falta dos cosas:

1. Las capacitaciones del **12-oct**, que es cuando se enciende el correo.
2. **Decidir el transporte.** `vermur.com` está en Microsoft 365 (MX →
   `outlook.com`, SPF con `-all`), donde SMTP AUTH viene apagado por default y
   Microsoft lo está retirando. Si se va por **Graph**, los dos secretos de SMTP
   no aplican: hay que cambiarlos por el client id / tenant id / client secret
   de una app registration.

---

## 6. Lo que espera a Julio y Gaby

Las preguntas de la noche están **redactadas para copiar** en
`sprint/reportes/RESUMEN.md` §4. Las nuevas, todas de cobranza:

| Qué | Por qué está trabado |
|---|---|
| **La fecha del mes** | ¿La del movimiento bancario o la de la aplicación a cada factura? Hoy usamos la del banco |
| **Los anticipos en el «cobrado del mes»** | Los dejamos fuera: es dinero que entró y no cobró ninguna factura |
| **El embarque del anticipo** | Hoy el anticipo exige elegir embarque, y eso es lo que fondea las órdenes. ¿Siempre lo saben? |
| **La cuenta del anticipo** | No pregunta a qué banco de Vermur entró, así que no se concilia por cuenta |
| **El sobrante de un pago** | Lo dejamos «a favor del cliente» dentro del mismo pago. ¿O sale como anticipo aparte? |
| **El orden del reparto** | Proponemos «lo más vencido primero», editable. ¿Es su regla o manda el cliente? |
| **Pago en una moneda, facturas en otra** | Por ahora no se aplica y la pantalla lo dice. ¿Les pasa seguido? |
| **El folio del pago** (`PAG-2026-0001`) | ¿Les sirve, o buscan siempre por referencia bancaria? |
| **Quién cobra** | Operaciones deja de registrar cobros, y sí puede marcar «No pagar». ¿Está bien así? |

Más las once arrastradas de la cadena anterior (formato del folio, saldo de las
siete cuentas, Monex pesos y BBVA, cierre de mes arribo o pedimento, la regla
del TC de Pricing, el TC de la factura, días festivos, fondeo y complemento de
pago, documentos del proveedor extranjero, CON-019/022/081, primer reporte a
automatizar). Material de preparación:
[PREVIA-JUNTA-ADMIN.md](sprint-post-junta/PREVIA-JUNTA-ADMIN.md).

---

## 7. Decisiones pendientes para Mau

Desarrolladas en `sprint/reportes/RESUMEN.md` §3. Las de esta noche:

1. **¿`Pago.anulacion?` y `Pago.aplicacionesQuitadas?`?** (72) Hoy el motivo
   vive en la bitácora del embarque y un pago anulado sin embarque no lo deja
   en ningún lado. **Recomendación: sí.**
2. **¿Los anticipos viejos de `depositosCliente/` deben poder aplicarse?** (72)
   **Recomendación:** tarea aparte con script en seco, si Julio los usa así.
3. **¿El formulario de §7.2 va en otra tarea?** (73) La fecha del pago hoy es
   la de captura. **Recomendación: sí.**
4. **¿Lista y ficha de pagos a proveedor?** (73) **Recomendación:** tarea propia.
5. **¿Administración marca prefactura? ¿Retroactiva en una orden pagada?** (74)
   **Recomendación:** no a lo primero, sí a lo segundo.
6. **¿Confirmas que la marca vive en la orden de compra** y no en la factura al
   cliente, como pedía la tarea? (74) **Recomendación: sí.**
7. **¿Administración fija el estatus de los «sin estatus» en lote?** (76)
   **Recomendación:** no hasta ver cuántos hay en producción.
8. **¿Bookings.tsx y Pickups.tsx?** (78) **Recomendación:** conservarlos hasta
   decidir el módulo. La baja de FichaRFQ se hizo fuera de lista: revertible.

### Arrastradas

9. **¿Enciendo la creación automática de embarques?** (66) No de golpe:
   sembrar consecutivos, confirmar formato, encenderla con Operaciones mirando.
10. **¿El correo se enciende antes o después del 12?** Recomendación: después.
11. **Regla de `configuracion` y `tiposCambio`** — bloque exacto en el reporte 51.
12. **¿El pricing rate se guarda una vez y se hereda?** (56) Toca reglas.
13. **¿Las 6 cuentas ya tienen el custom claim `rol`?** Prerrequisito del plan 53.
14. **¿Las siete cuentas pasan a catálogo de Firestore?** (57)
15. **¿El proveedor también desactiva contactos en vez de borrarlos?** (60)
16. **¿El interruptor de embarque automático se muda a
    `configuracion/foliosEmbarque`?** (66)
17. ¿Administración necesita la vista `quotes`? ¿`info@digsol.com.mx` sigue como
    admin? ¿Reglas por rol un sábado? ¿Freno de facturación por datos fiscales
    incompletos? ¿Correr `auditarCotizacionesVivas.ts` contra producción?
    ¿Agentes de carga siempre clientes de oficina? ¿Bloquear envío por tarifas
    vencidas al reciclar? ¿Gaby y Luis ambos admin? Confirmar `VERMUR_N8N_TOKEN`.

---

## 8. Deuda crítica que no se movió

- **Reglas de Firestore no distinguen roles** (plan 53). Con dinero en `pagos/`
  y la prefactura protegida solo por la UI (`updateOrden` no verifica
  capacidad), sube de severidad
- `localhost` sin emuladores escribe en producción
- Tres cuentas de prueba en el Auth de producción
- `getCostoOficial` suma sin mirar moneda
- Las notificaciones por ROL no llegan a nadie

**Cerradas esta noche:** las dos sumas sin clasificar de `TablaUnificadaCargos`
(75), los clientes invisibles por `statusOperativo` (76), `DepositoCliente.referencia`
nullable (75), la aserción de ausencia vacía (77) y los archivos huérfanos (78).

### Hallazgos nuevos, anotados sin tocar

- Los `capturas-*` y 45/47 no corren en `e2e.sh`.
- Cuentas por cobrar guarda «Por factura» como preferencia por usuario y
  contamina specs posteriores.
- `FichaOC` lee entradas sin resolvedor de embarque: con pagos repartidos puede
  mostrar cifras distintas al fondeo.
- `usePagos` abre tres listeners a `pagos/`.
- Editar archivos del repo mientras `e2e.sh` calienta tumba la siembra.

---

## 9. Entregables vigentes que no son código

**Planes** (`docs/sprint-post-junta/`):
- `PLAN-PAGOS.md` — la fuente de la cola de pagos. **P1 a P7 hechos (P5 a P7
  sin publicar), P8 sin empezar.**
- `REGLA-PAGOS.md` — el bloque de `pagos/` (ya publicado el 5-oct).
- `PLAN-CARGA-FISCAL.md` — minar Tax IDs, pedir export, script de carga.
- `AUDITORIA-35-48.md`, `PLAN-REGLAS-POR-ROL.md`, `PLAN-FUENTE-TARIFA.md`,
  `PLAN-EQUIPOS-MINIMO.md`, `PLAN-RECICLAR.md`, `PLAN-C.md`,
  `PLAN-APROBACION.md`.

**Guías de validación:** `VALIDACION-56-66.md`, `VALIDACION-35-55.md`.

**Diagnósticos:** `BARRIDO-FILTROS.md` (43 filtros), `BARRIDO-GENERAL.md`
(95 pantallas × 5 roles, limpio).

**JSON de n8n** (`docs/n8n/`): `generar-pdf-cotizacion.n8n.json`,
`tipo-cambio-banxico.n8n.json`. **Falta por escribir:** `clasificar-documento-oc`
— el cambio exacto está descrito en el reporte 63, sin inventar el flujo.

---


## 10. Orden propuesto para la mañana

1. Leer `sprint/reportes/RESUMEN.md` y los reportes que interesen.
2. **Publicar la cadena 72 → 78** (hosting). Antes, avisarle al grupo que anular
   un cobro pide motivo.
3. Validar en navegador: Finanzas → Pagos (lista, ficha, aplicar saldo, quitar,
   anular; la factura vuelve a su saldo), Programación de pagos con un grupo
   (un solo PAG-…, y la orden dice «Cubierta por el pago»), prefactura
   (Operaciones marca, Administración ve contador y filtro), Altas con
   «Sin estatus», Facturas del embarque sin cobros anulados, el concepto
   multi-proveedor y multi-moneda sin total revuelto, menú del admin sin
   cambios y consola limpia.
4. Mandar las preguntas a Julio (anulación, prefactura, excedente) —redactadas
   en el resumen— y decidir las de §7.
5. Cerrar lo arrastrado: validar 56–66 y 35–55, deshabilitar las tres cuentas
   de prueba del Auth, regla de Storage de documentos de la orden, y pedir las
   credenciales de Exchange junto con encender «SMTP autenticado».
