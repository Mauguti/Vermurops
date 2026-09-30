# Estado de VermurOps — 29 de septiembre de 2026 (tarde)

Corte tras publicar la segunda mitad del sprint nocturno.
Todo lo que dice «verificado» trae el comando que lo comprobó.

---

## 1. Qué se publicó hoy

**Las 24 tareas del sprint están en producción.** Por la mañana las 16
primeras (`0a38100`); esta tarde las ocho restantes.

| # | Tarea | Merge |
|---|---|---|
| 17 | PLAN: una sola fuente de verdad para la tarifa elegida | `8e0fd9a` |
| 18 | PLAN: equipos, la parte mínima para Operaciones | `49631e6` |
| 19 | PLAN: reciclar cotizaciones y orden de la bandeja | `32ed131` |
| 20 | PLAN C: documentos operativos y talonario del HBL | `23616df` |
| 21 | Usuarios y roles, paso 1 | `ac6c0f2` |
| 22 | Token en el webhook del PDF (JSON de n8n) | `0cf0de7` |
| 23 | Bug en frío: solicitud vacía tras «Enviar a Pricing» | `de28464` |
| 24 | Los 9 errores de tsc | `0257a96` |

Antes, dos cosas sueltas: el arreglo del scroll de la ficha de la orden
(`02062a9`), que salió por la mañana sin recorrido y **quedó validado con
6/6** antes de empezar; y un commit sobre la 22 (`9b0d238`) que saca de git
los diez archivos de `sprint/` que las sesiones 17 a 22 forzaron con
`git add -f`, por la misma contradicción de la noche anterior: corrieron
antes de que SPRINT.md dejara de pedir el reporte commiteado.

**`tsc` quedó en CERO por primera vez.** Los nueve errores de la línea base
—`Quotes.tsx`, `FichaCotizacion.tsx`, `RightChatPanel.tsx`— se cerraron en
la tarea 24. Ya se puede volver bloqueante.

**Verificado:** tests de 1730 a 1752, `tsc` 9 → 0, build limpio después de
cada merge, y el recorrido completo **6/6** al final.

### Lo que se desplegó

- **Hosting:** `index-gMdkU_nb.js`, verificado contra producción.
- **Functions: `gestionarUsuarios`** (nueva). Sin sesión responde
  `401 {"ok":false,"error":"Falta el token de sesión."}`, comprobado.
  Punto de regreso: `firebase functions:delete gestionarUsuarios`; la
  pantalla queda sin backend y avisa, nada más se rompe.
- **Reglas e índices:** nada.

**Pendiente de desplegar, en `main` desde el 28-sep:** el cambio de
`functions/src/comun/auth.ts` que mete las cinco cuentas de prueba en el
mapa de roles del servidor **solo** bajo `FUNCTIONS_EMULATOR`. Afecta solo
al emulador.

```bash
npx firebase deploy --only functions:extraerTarifas,functions:clasificarDocumento
```

---

## 2. Usuarios y roles: qué hay y qué falta

La tarea 21 dejó el **paso 1**, y conviene saber qué es y qué no:

- `usuarios/{uid}` con correo, nombre, rol, activo e invitadoPor.
- El rol también en **custom claims**, puestos solo por `gestionarUsuarios`,
  que exige `usuario.gestionar` — capacidad que **solo tiene admin**, tanto
  en el mapa del cliente como en el del servidor.
- Alta por invitación: crea la cuenta y dispara el correo de restablecimiento
  que ya existía. Baja: `activo: false` + `disableUser`, nunca se borra.
- Pantalla **Configuración → Usuarios y roles**, que un no-admin **no ve en
  el menú**.
- `AuthContext` lee **primero el claim** y cae al mapa de correos como
  respaldo, así que nadie pierde acceso mientras no tenga claim.

**Lo que NO cambia todavía:** las reglas de Firestore siguen siendo el parche
por correo del Bloque 9. El borrador por rol está en `docs/reglas/`, sin
desplegar. Hasta que se despliegue, los claims no protegen la base: solo
alimentan la UI.

---

## 3. Qué hay en producción

Las 24 tareas del sprint, el arreglo de la ficha de la orden y la Function
`gestionarUsuarios`. Ver la sección 1 para los hashes y la verificación.

---

## 4. Entregables nuevos que no son código

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

## 5. Pendientes, verificados contra el código

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

## 6. Orden propuesto

1. **Validación del equipo** con la lista consolidada. Es lo único que
   convierte «publicado» en «terminado».
2. **Importar el JSON de n8n** del PDF y poner `VERMUR_N8N_TOKEN` como variable
   de entorno en n8n, con el mismo valor que Secret Manager.
3. **Invitar al equipo** desde Configuración → Usuarios y roles, empezando por
   `info@digsol.com.mx`. Cada invitación dispara el correo de restablecimiento.
4. **Corregir `info@digsol.com` → `.com.mx`** en `firestore.rules:36` y
   `storage.rules:51`, y desplegar las reglas con el equipo presente.
5. **Desplegar las reglas por rol** (borrador en `docs/reglas/`), que es lo que
   convierte los claims en protección real.
6. **Deshabilitar las tres cuentas de prueba** en el Auth de producción.
7. **Volver `tsc` bloqueante** en el build, ahora que está en cero.
8. Las Functions pendientes del 28-sep, cuando haya hueco:
   `npx firebase deploy --only functions:extraerTarifas,functions:clasificarDocumento`
