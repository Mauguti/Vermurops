# Estado de VermurOps — 1 de octubre de 2026

Corte tras publicar la cadena 27–34 y cerrar los pendientes de reglas,
invitación y n8n.

---

## 1. Lo que se publicó hoy

**La cadena 27–34 completa**, cada merge su propio punto de regreso:

| # | Tarea | Merge |
|---|---|---|
| 27 | Edición en las dos vistas de la cotización | `42f5848` |
| 28 | Ubicación por concepto, con IVA por fila | `f8f81a9` |
| 29 | Programación de pagos: estado vacío con contexto | `1798455` |
| 30 | Aduana precargada desde el puerto | `dbbd98b` |
| 31 | Pegar correo y vigencias con bloqueo | `40425be` |
| 32 | Scroll de las fichas de cotización y prospecto | `5cb954b` |
| 33 | Inventario de datos de prueba | `1658309` |
| 34 | PLAN-APROBACION | `60701c2` |

Y cinco bloques sueltos: el scroll de la ficha de la orden (`02062a9`),
`tsc` bloqueante (`94d455b`), el correo de las reglas (`74e2f1a` y
`9b7953d`), la invitación que no mandaba correo (`b8336b1`) y el token de
n8n por Header Auth (`1fe761b`).

**1811 tests · tsc 0 · recorrido 6/6.**

### Lo que NO cuadró con el reporte 27

Su reporte daba el recorrido en 2/6 y lo atribuía a un fallo preexistente.
**No se reproduce**: parado en `sprint/27` da 6/6, y en `sprint/28` también.
Así que la 27 no depende de la 28 y su punto de regreso es solo suyo.

---

## 2. Reglas: desplegadas, con una corrección en el camino

`esDelEquipo()` está **vivo en producción** desde hoy: Firestore pasó de
«cualquier autenticado lee y escribe todo» a los siete correos del equipo.

Costó dos despliegues fallidos. El primero subió el archivo con
`info@digsol.com` —el typo del Bloque 9— y dejó a Mau fuera de su propia
base. El segundo no subió nada y lo dijo en una línea que parece éxito:

```
i  firestore: latest version of firestore.rules already up to date, skipping upload...
✔  Deploy complete!
```

Los dos salieron de un worktree que estaba en otra rama. **La regla quedó
escrita en CLAUDE.md §3**: todo `firebase deploy` lleva su `cd` al checkout
principal, y `skipping upload` se lee como fallo.

**Storage NO está desplegado.** Su archivo ya tiene el correo corregido
(`9b7953d`) y espera a que el equipo pueda confirmar que sigue viendo sus
documentos:

```bash
cd /Users/mauriciogutierrezmunoz/antigravity/Vermur-Logistics && npx firebase deploy --only storage
```

**Nada público se rompe al desplegarlo.** La landing no usa el SDK de
Firebase, la pantalla de Usuarios pasa por el Admin SDK, `AuthContext` lee
el rol de los claims, ningún flujo de n8n toca Firestore ni Storage, y los
enlaces de descarga ya repartidos llevan token y saltan las reglas. Lo
único que depende de la lista son las subidas y lecturas que hace la app
como usuario con sesión.

---

## 3. Usuarios y roles

`gestionarUsuarios` está desplegada. **La invitación ya manda el correo**:
la Function llamaba a `generatePasswordResetLink`, que genera el enlace y
no envía nada. Ahora lo manda la app con `sendPasswordResetEmail`, hay
«Reenviar invitación» por renglón, y el e2e invita desde la pantalla —sin
la llamada del Admin SDK, el único oobCode posible es el del envío del
cliente, así que si alguien lo quita, la prueba se cae.

**Mau no puede invitarse a sí mismo**: su correo no está en ninguno de los
dos mapas de roles, así que sin claim cae a `ventas` y la Function lo
rechaza con 403. **La cadena la arranca Gaby o Luis**, que sí son `admin`
en los dos mapas.

---

## 4. n8n

El token ya no se valida con un nodo Code que leía `process.env`: n8n nunca
vio esa variable y respondía **401 a todo**, también con el token correcto.
Ahora es la autenticación propia de n8n —Header Auth con la credencial
**«X-Vermur-Token»**— y rechaza con **403** por su cuenta. El proxy trata
401 y 403 igual y lo marca en el log como `rechazoDeToken`.

Los dos JSON están en `docs/n8n/` y refieren la credencial **solo por
nombre**: al importar hay que elegirla a mano. El flujo general de
documentos (`generar-documento`) y las 13 plantillas de Vermur también
entraron al repo.

---

## 5. Administración

La minuta validada de la sesión 1 está en
`docs/levantamientos/LEVANTAMIENTO-ADMINISTRACION.md` y **desde hoy es la
referencia del área**. Seis diferencias contra PLAN_OPERACION quedaron
anotadas en el plan, sin reescribirlo.

`docs/sprint-post-junta/PREVIA-JUNTA-ADMIN.md` prepara la junta con Julio:
inventario de los siete reportes, Programación contra Cuentas por pagar en
cinco líneas, el modelo de cliente y proveedor contra PLAN-APROBACION, y
los días de crédito.

**Lo que ese análisis encontró y conviene no perder:**

- **El IVA acreditado no sale.** `ordenesCompra.facturaDatos` guarda `total`
  y `subtotal`, y nada de IVA. Es el mismo hueco que obliga a Julio a
  revisar a mano, todos los días, que el IVA de cada factura coincida.
- **`regimenFiscal` no existe** en el modelo, y el SAT lo exige para
  timbrar.
- **El proveedor no tiene expediente**: `docsAlta` y `expedienteValidado`
  son solo del cliente.
- **`dias` es obligatorio y `diasCreditoPorTipo` opcional**, y el único
  editor captura `dias`. Leer el nuevo sin poder capturarlo deja el campo
  vacío para siempre.

---

## 6. Qué hay en producción

Todo lo de la sección 1. Hosting en `index-Cyowerkz.js`; Functions
`gestionarUsuarios`, `extraerTarifas` y `clasificarDocumento` al día; reglas
de Firestore desplegadas, **Storage no**.

---

## 7. Entregables nuevos que no son código

**Planes** (`docs/sprint-post-junta/`):
- `PLAN-FUENTE-TARIFA.md` — un solo campo para la tarifa elegida, reconciliacion
  silenciosa, 5 pasos publicables.
- `PLAN-EQUIPOS-MINIMO.md` — CRM en solo lectura para Operaciones, equipos
  reales en selectores, cliente de oficina. 3 pasos.
- `PLAN-RECICLAR.md` — copiar cotizacion previa con tarifas vencidas marcadas,
  orden configurable de la bandeja. 5 pasos.
- `PLAN-C.md` — 6 documentos operativos, talonario de HBL con transaccion
  atomica, impresion sobre hoja preimpresa. 800 lineas, 10 preguntas para Gaby.

**Codigo:**
- `gestionarUsuarios` — Cloud Function completa (listar, invitar, cambiarRol,
  desactivar). Custom claims, AuthContext con fallback al mapa viejo. Pantalla
  en Configuracion → Usuarios y roles. 24 tests unitarios + 11 e2e.
- Borrador de reglas por rol en `docs/reglas/borrador-por-rol.rules`.

**JSON de n8n:**
- `docs/n8n/generar-pdf-cotizacion.n8n.json` — nodo de validacion de token
  agregado al inicio del flujo.

---

## 8. Pendientes

### Cola restante

La cola del sprint quedó VACÍA: las 24 tareas están publicadas. Lo que
queda es lo que los planes de esta noche proponen y todavía no se construye.

| # | Qué | Tipo | Estado |
|---|---|---|---|
| 25 | Revisión de tarifas: el correo como imagen | código | No se intentó |

Y lo que arrastramos de antes:

- **Barrido de reglas sin quien las llame.** Van cuatro: `calcularIVA`,
  `camposBloqueados`, `registrarDeposito` y `useImportacionesTarifas` —un hook
  completo, con su colección, que nadie escribe ni lee—. El barrido va en los
  dos sentidos: lógica con tests que nadie invoca, y campos que se escriben y
  nadie lee.
- **`tsc` ya está en cero**: falta volverlo bloqueante en el build, que era la
  razón de la tarea 24.

### Decisiones pendientes (de los planes de esta noche)

**Para Mau (bloquean implementacion):**
1. ¿Correr `auditarCotizacionesVivas.ts` contra produccion? (plan 17)
2. ¿Agentes de carga son siempre clientes de oficina? (plan 18)
3. ¿Operaciones ve Bandeja de Pricing o solo la lista? (plan 18)
4. ¿Bloquear envio por tarifas vencidas al reciclar? (plan 19)
5. ¿Gaby y Luis ambos admin? (tarea 21)
6. Confirmar `VERMUR_N8N_TOKEN` como variable de entorno en n8n (tarea 22)
7. Corregir `info@digsol.com` → `.com.mx` en reglas al desplegar (tarea 21)

**Para Vermur (Gaby):**
- 10 preguntas del PLAN-C sobre documentos y HBL (seccion 9 del plan)
- Las tres criticas: anio del HBL, hoja FBL escaneada, folios de Magaya

### Deuda critica que no se movio

- Reglas de Firestore no distinguen roles (el borrador de la 21 es el primer paso)
- `localhost` sin emuladores escribe en produccion
- Tres cuentas de prueba en Auth de produccion
- `getCostoOficial` suma sin mirar moneda

---

## 9. Orden propuesto

1. **Junta con Julio**, con la minuta y `PREVIA-JUNTA-ADMIN.md`. De ahí salen
   festivos, conciliación del fondeo, anticipos sin factura, complemento de
   pago y pronto pago.
2. **Que Gaby o Luis inviten a Mau** y confirmar el claim en el log.
3. **Correr el inventario** con la llave, para tener los conteos reales de
   expediente antes de decidir el flujo de aprobación.
4. **Desplegar Storage**, con el equipo presente.
5. **Validación del equipo** de la cadena 27–34.
6. **Importar los dos JSON de n8n** y elegir la credencial «X-Vermur-Token».
7. **Deshabilitar las tres cuentas de prueba** en el Auth de producción.
