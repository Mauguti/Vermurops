# Estado de VermurOps — 29 de septiembre de 2026

Corte de la mañana, verificado contra el código y contra producción.
Todo lo que dice «verificado» trae el comando que lo comprobó.

---

## 1. Qué pasó anoche con el sprint

**Dieciséis tareas terminadas, ninguna bloqueada.** Es el primer sprint
nocturno que produce: los dos anteriores murieron en segundos por la entrega
del prompt.

La cadena se mergeó a `main` en orden, con `--no-ff`, y cada merge es un punto
de regreso independiente:

| # | Tarea | Merge |
|---|---|---|
| 01 | Extractor por formato y el hueco de «4 archivos, 2 llamadas» | `3587077` |
| 02 | Wizard: agregar a mano la línea que el extractor se saltó | `df5ba73` |
| 03 | Freno al enviar con líneas sin tasa | `64d7729` |
| 04 | Renombrar «consolidada» (solo etiquetas) | `2ed75ce` |
| 05 | PLAN de tarifas: modelo de ONE y las 56 existentes | `0b8732d` |
| 06 | PLAN del tipo de cambio de Pricing | `691c7cd` |
| 07 | Tabla única de cargos en el embarque | `e34900d` |
| 08 | Demoras y almacenajes calculados | `a45904b` |
| 09 | Listas de clientes y proveedores en tabla | `06fb741` |
| 10 | Edición en línea de estado y ejecutivos | `9a7702d` |
| 11 | Tipos de proveedor y patentes de agentes aduanales | `38ed940` |
| 12 | «Ver como cliente» y registro de documentos sensibles | `c816172` |
| 13 | Bitácora y Master/Hijo dentro de Información | `cfab42c` |
| 14 | Kanban avisa del freno al arrastrar; key de Puertos | `11dd729` |
| 15 | Script de auditoría de cotizaciones vivas | `4db85fe` |
| 16 | Conceptos sin catálogo desde comparativa y bandeja | `f5d1e33` |

**Verificado después de cada merge:** tests en verde (de 1646 a 1730), `tsc` en
la línea base de 9, `npm run build` limpio. El recorrido completo, al final:
**6/6**.

Los reportes de cada tarea, con su evidencia y sus capturas, están en
`sprint/reportes/`. Van versionados en el repo a propósito: son el registro de
la noche.

**Un commit encima de la cadena** (`d38036d`): se quitaron `.txt` y `.eml` del
selector de archivos de «Cargar tarifario». La tarea 02 los agregó y la 01
demostró contra el n8n real que con un `.txt` el flujo contesta
`ok: false, error: "Could not process image"` — trata todo como imagen.
Ofrecerlos era ofrecer una vía que falla siempre. El correo conserva «Pegar
correo», que no pasa por ese selector.

**Lo que no alcanzó.** Las tareas 17 a 24 siguen en `[ ]`. Las sesiones de 17 y
18 arrancaron y murieron por el límite de uso sin producir nada —la rama
`sprint/17-plan-fuente-tarifa` no tiene un solo commit propio—, y la sesión de
cierre no alcanzó a escribir el resumen ni este archivo.

---

## 2. Qué hay en producción

Un solo despliegue de hosting al cerrar la cadena. **Ninguna de las dieciséis
tareas toca Functions, reglas ni índices.**

El día anterior (28-sep) se publicaron, ya validados: los cuatro bugs del
wizard y del IVA, el candado del seed en los seis hooks, el recorrido e2e
estable, el registro de fallas del extractor y el bloque que permite probarlo
contra emuladores.

**Pendiente de desplegar, en `main` desde el 28-sep:** el cambio de
`functions/src/comun/auth.ts` que mete las cinco cuentas de prueba en el mapa
de roles del servidor **solo** bajo `FUNCTIONS_EMULATOR`. Sin él no se puede
probar el extractor en emuladores. No es urgente: solo afecta al emulador.

```bash
npx firebase deploy --only functions:extraerTarifas,functions:clasificarDocumento
```

---

## 3. Entregables nuevos que no son código

**Planes** (`docs/sprint-post-junta/`):
- `PLAN-TARIFAS.md` — reescrito con el modelo del correo de ONE: varios montos
  por tipo de contenedor, varios POL/POD, cargos por bill (AMS, telex),
  vigencia, free time y carrier, `impuestoCosto`, la confirmación masiva del
  wizard, los 22 tarifarios que hay que volver a subir y la pantalla de
  revisión de las 56 existentes.
- `PLAN-TC.md` — diagnóstico de qué hace hoy la app con el tipo de cambio y
  dónde se rompe, la regla del TC congelado de Pricing, moneda de costo y de
  venta distintas, cliente a facturar en dos niveles, y que la ubicación del
  servicio nazca con el servicio.

**Scripts de solo lectura**, para correr con llave fuera del repo:
- `scripts/auditarCotizacionesVivas.ts` — tarifa elegida desincronizada, costos
  sin moneda explícita, líneas sin `conceptoId`, modalidad que no coincide.
- `scripts/auditarTarifasIncompletas.ts` — el de siempre, ampliado.

**Fixtures del extractor** (`docs/fixtures/`): el correo de ONE en `.txt`,
`.xlsx` y `.png`, y las respuestas crudas de n8n para cada uno, en
`respuestas-extractor/`. Es el material para reproducir sin volver a gastar
llamadas al agente.

---

## 4. Pendientes, verificados contra el código

**La cola que sigue** (tareas 17 a 24 del sprint, en `sprint/COLA.md`):

| # | Qué | Tipo |
|---|---|---|
| 17 | PLAN: una sola fuente de verdad para la tarifa elegida | plan |
| 18 | PLAN: equipos, la parte mínima para Operaciones | plan |
| 19 | PLAN: reciclar cotizaciones y orden de la bandeja | plan |
| 20 | PLAN C: documentos operativos y talonario del HBL | plan |
| 21 | Usuarios y roles, paso 1 (solo emuladores) | código |
| 22 | Token en el webhook del PDF (JSON para importar) | JSON de n8n |
| 23 | Bug en frío: solicitud vacía tras «Enviar a Pricing» | diagnóstico |
| 24 | Los 9 errores de tsc | código |

**Barrido pendiente: reglas sin quien las llame.** Lógica con tests que ningún
código de producción invoca, y campos que se escriben y nadie lee. Van cuatro
encontradas, cada una costó tiempo: `calcularIVA` (§4.2), `camposBloqueados`
(§6), `registrarDeposito` (§4.15) y `useImportacionesTarifas` — un hook
completo, con su colección `importacionesTarifas`, que nadie escribe ni lee: el
wizard guarda el id del documento como `importacionId`. El barrido va en los
dos sentidos.

**Deuda crítica que no se movió** (§6 de CLAUDE.md): las reglas de Firestore no
distinguen roles; `localhost` sin `VITE_USAR_EMULADORES` escribe en producción;
hay tres cuentas de prueba en el Auth de producción con contraseña `123456`.

**Anotado el 28-sep, sin arreglar:** `useCotizaciones` ya usa `evaluarSeed`,
pero el camino B —el `conceptoId` por nombre— se cerró en la tarea 16 con
empate normalizado; queda ver si aparecen nombres que ni así empatan.

---

## 5. Decisiones que te tocan

Las preguntas completas, con su recomendación, están en cada reporte. Las que
bloquean algo:

1. **El `.txt` falla en n8n con «Could not process image».** El flujo trata
   todo como imagen. *Recomiendo: corregirlo en el flujo de n8n para que acepte
   texto plano; mientras tanto, la vía es el `.xlsx` o la captura.*
2. **El `.xlsx` confunde free time con tiempo de tránsito.** Es del flujo, no de
   la app. *Recomiendo: corregirlo en el mismo pase que lo anterior.*
3. **Venta, Margen y Estado en la tabla de cargos.** Se dejaron. *Recomiendo:
   confirmarlos; son el mismo dato que la tarjeta vieja enseñaba, ahora en
   línea.*
4. **Los seis puertos chinos de ONE no están en el catálogo.** *Recomiendo:
   darlos de alta ya, sin esperar la lista completa de Vermur.*
5. **El correo de las reglas** sigue diciendo `info@digsol.com` en
   `firestore.rules:36` y `storage.rules:51`. *Recomiendo: corregirlo a
   `info@digsol.com.mx` y desplegar con el equipo presente.*
6. **Las tres cuentas de prueba en producción.** *Recomiendo: deshabilitarlas en
   la consola; son credenciales válidas.*
7. **`getCostoOficial` y la moneda.** *Recomiendo: correr
   `scripts/auditarCotizacionesVivas.ts` para medir el alcance antes de
   tocarlo.*

---

## 6. Orden propuesto

1. **Validación del equipo** con la lista consolidada de esta mañana. Es lo
   único que convierte «publicado» en «terminado».
2. **Reglas + tu cuenta + cuentas de prueba** *(equipo presente)*.
3. **Los 9 errores de tsc** (tarea 24): deja `tsc` en cero y permite volverlo
   bloqueante.
4. **Token del webhook del PDF** (tarea 22): JSON de n8n, sin desplegar la app.
5. **Usuarios y roles, paso 1** (tarea 21): el bloque grande, y el camino a
   reglas por rol.
6. Los cuatro planes que faltan (17 a 20), que se pueden volver a dar al sprint.
