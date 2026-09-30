# Estado de VermurOps — 29 de septiembre de 2026

Corte del sprint nocturno (segunda sesion). Punta: `sprint/22-token-webhook-pdf`.

---

## 1. Que paso esta noche

**Seis tareas terminadas, una bloqueada, dos sin correr.** Las tareas 17-22
forman una cadena limpia sobre `sprint/base`. La 23 tiene el fix listo pero
el sprint script la marco bloqueada (cambios en stash). La 24 y 25 no
alcanzaron.

### Cadena de esta noche (sin publicar, sin mergear)

| # | Tarea | Rama | Commits |
|---|---|---|---|
| 17 | PLAN: fuente de verdad para tarifa elegida | `sprint/17-plan-fuente-tarifa` | `96519f3` |
| 18 | PLAN: equipos minimos para Operaciones | `sprint/18-plan-equipos-minimo` | `cd4be9b` |
| 19 | PLAN: reciclar cotizaciones y bandeja | `sprint/19-plan-reciclar` | `5e0fb16` |
| 20 | PLAN C: documentos operativos y HBL | `sprint/20-plan-documentos-hbl` | `c94f493` |
| 21 | Usuarios y roles, paso 1 (emuladores) | `sprint/21-usuarios-roles-paso1` | `ae87cf7..71bf9be` |
| 22 | Token en el webhook del PDF | `sprint/22-token-webhook-pdf` | `95deb27` |

**Verificacion de la cadena (en la tarea 22, punta):** 1752 tests, tsc 9
(= linea base), build limpio, recorrido e2e 6/6.

### Fuera de la cadena

| # | Tarea | Estado | Nota |
|---|---|---|---|
| 23 | Bug: solicitud vacia tras «Enviar a Pricing» | [!] | Fix de 1 linea en stash. Causa: `formProspectoOrigenId` no se reseteaba. |
| 24 | Los 9 errores de tsc | [ ] | Trabajo en stash en `sprint/24-fix-tsc`. Reporte completo. |
| 25 | Revision de tarifas: correo como imagen | [ ] | No se intento. |

### Tareas 01-16 (sesion anterior)

Ya mergeadas a `main` con `--no-ff`. Detalle en la seccion 1 del ESTADO.md
anterior. Merge commits: `3587077` a `f5d1e33`.

---

## 2. Que hay en produccion

Sin cambios respecto al corte anterior. Las tareas 17-22 estan en ramas,
no en `main`.

**Sigue pendiente de desplegar** (en `main` desde el 28-sep):
```bash
npx firebase deploy --only functions:extraerTarifas,functions:clasificarDocumento
```

---

## 3. Entregables nuevos (esta noche)

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

## 4. Pendientes

### Cola restante

| # | Que | Tipo | Estado |
|---|---|---|---|
| 23 | Bug: solicitud vacia | codigo | Fix listo en stash, falta committear |
| 24 | Los 9 errores de tsc | codigo | Trabajo en stash, falta committear |
| 25 | Revision de tarifas: correo como imagen | codigo | No se intento |

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

## 5. Orden propuesto

1. **Mergear la cadena 17-22 a `main`** tras revision rapida de los planes.
2. **Recuperar 23 y 24 del stash**, verificar y mergear.
3. **Desplegar Functions** (`gestionarUsuarios` + las pendientes del 28-sep).
4. **Importar JSON de n8n** (token del PDF).
5. **Invitar al equipo** desde la pantalla de Usuarios.
6. **Desplegar reglas por rol** (con `info@digsol.com.mx` corregido, equipo presente).
7. **Deshabilitar cuentas de prueba** en Auth de produccion.
