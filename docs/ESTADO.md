# Estado de VermurOps — 30 de septiembre de 2026

Corte tras cerrar los pendientes de la publicación 17–24.
Todo lo que dice «verificado» trae el comando que lo comprobó.

---

## 1. Lo que cerró hoy

**`tsc` bloquea el build** (`94d455b`, publicado). `npm run build` era
`vite build` a secas y vite no hace typecheck: por eso los nueve errores de
la línea base convivieron meses con builds «limpios». Ahora es
`tsc --noEmit && vite build`, y está comprobado que bloquea: con un error de
tipos metido a propósito el build sale con código 2 y vite no llega a correr.
1752 tests, tsc 0, recorrido 6/6.

**El correo de las reglas, corregido — sin desplegar** (rama
`fix/correo-reglas`, `adc0ca7`). `esDelEquipo()` tenía `info@digsol.com`
desde el Bloque 9. Y `tests/reglas/equipo.test.ts` lo fijaba como correcto:
afirmaba que «INFO@DIGSOL.COM.MX» NO era del equipo. El test protegía el
typo. Ahora el que queda fuera es el dominio equivocado. 13/13 en verde.

**Sigue sin corregir `storage.rules:51`**, con el mismo typo. Ahí vive el
expediente KYC. No se tocó por instrucción explícita.

---

## 2. Reglas: qué está desplegado y qué no

**El parche del Bloque 9 nunca se ha desplegado.** Producción sigue con
`allow read, write: if request.auth != null`: cualquier cuenta autenticada
lee y escribe todo. `firestore.rules` no se toca desde `0f3ec79` (24-sep).

No se puede leer el ruleset desplegado desde esta máquina: el CLI de Firebase
no expone las reglas activas, `gcloud` no está instalado y la API de
Firebase Rules pide un token que no hay. **Confírmalo en la consola** antes
de dar por buena cualquier suposición.

Comando para publicarlas, con el equipo presente:

```bash
npx firebase deploy --only firestore:rules
```

Punto de regreso: `git revert` del commit y volver a desplegar; o desplegar
la versión anterior del archivo (`git show 0f3ec79^:firestore.rules`). El
despliegue de reglas es instantáneo y reversible en el mismo minuto.

---

## 3. Usuarios y roles: el arranque en frío

`gestionarUsuarios` está desplegada y exige `usuario.gestionar`, que **solo
tiene admin**. Tanto el cliente como el servidor leen **primero el custom
claim** y caen al mapa de correos como respaldo.

**Mau no puede invitarse a sí mismo.** Su correo no está en ninguno de los
dos mapas de roles —ni `AuthContext` ni `functions/comun/auth.ts`—, así que
sin claim cae al fallback `ventas` y la Function lo rechaza con 403.

Quien arranca la cadena: **Gabriela Huerta o Luis Rentería**, que sí son
`admin` en los dos mapas. Uno de ellos invita a Mau; a partir de ahí Mau
tiene claim propio y puede invitar al resto.

---

## 4. Usuarios y roles: qué construyó la tarea 21

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

## 5. Qué hay en producción

Las 24 tareas del sprint, el arreglo de la ficha de la orden y la Function
`gestionarUsuarios`. Ver la sección 1 para los hashes y la verificación.

---

## 6. Entregables nuevos que no son código

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

## 7. Pendientes, verificados contra el código

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

## 8. Orden propuesto

0. **La cadena 27–34 del sprint de anoche está sin publicar.** Ocho ramas
   empujadas, ningún merge. Va antes que todo lo demás.
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
7. ~~Volver `tsc` bloqueante~~ — hecho hoy (`94d455b`).
8. Las Functions pendientes del 28-sep, cuando haya hueco:
   `npx firebase deploy --only functions:extraerTarifas,functions:clasificarDocumento`
