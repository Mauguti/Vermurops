# CONTRATO DE OPERACIÓN NOCTURNA — VermurOps

Eres un agente autónomo trabajando de noche en VermurOps sin supervisión humana.
Mau duerme. No puedes preguntarle nada. Si algo requiere una decisión de negocio,
búscala primero en CLAUDE.md y en docs/; si no está, NO la tomes: anótala en
.noche/BLOQUEOS.md y sigue con otra cosa.

## Contexto del proyecto
- Plataforma web que reemplaza Magaya para Vermur (freight forwarder mexicano).
- Stack: React + Vite + Firebase (Auth, Firestore, Storage) + Cloud Functions.
- Identidad visual: rojo #E11D48, dark #1F2937.
- Fuente de verdad del proyecto: **CLAUDE.md** en la raíz — LÉELO COMPLETO antes
  del primer lote. Módulos cerrados, en construcción y decisiones abiertas.
  (No existe ningún ESTADO_VERMUROPS.md; es CLAUDE.md.)
- La app de la noche corre en **localhost:3100** (la levanta noche.sh). El 3000
  puede estar ocupado por la sesión diurna de Mau: NO lo toques.
- Usuarios de prueba — los CINCO roles, password 123456:
  admin@ · ventas@ · pricing@ · operaciones@ · administracion@vermur.com
  Solo existen en el emulador de Auth (scripts/sembrarEmuladores.sh los crea).

## VERIFICACIÓN OBLIGATORIA antes de abrir el navegador
La deuda crítica de §6 del CLAUDE.md: localhost SIN configurar escribe en la
base de PRODUCCIÓN que el equipo de Vermur usa a diario. Antes de cualquier
interacción con la app:
1. Confirma que el server de :3100 arrancó con `VITE_USAR_EMULADORES=1`.
2. Confirma que la página muestra el badge «Emuladores · producción intacta»
   (esquina inferior izquierda) y que la consola dice
   `[firebase] Conectado a EMULADORES locales`.
3. Confirma que `curl http://127.0.0.1:8080` responde (emulador de Firestore).
Si CUALQUIERA de las tres falla: aborta el lote, escribe el motivo en
BLOQUEOS.md y NO toques el navegador. Un clic contra producción es un registro
real que el cliente ve.

## PROHIBIDO (violación = abortar el lote y registrarlo en BLOQUEOS.md)
1. NUNCA `firebase deploy` de nada: ni hosting, ni functions, ni firestore:rules.
2. NUNCA hacer commit, merge ni push a `main`. Solo la rama `noche/<fecha>`.
3. NUNCA escribir, modificar ni borrar datos en el Firestore de PRODUCCIÓN.
   Todas las pruebas van contra los emuladores (ver verificación de arriba).
4. NUNCA tocar ni leer archivos `*firebase-adminsdk*.json` ni `serviceAccountKey.json`.
5. NUNCA cambiar el modelo de datos: nada de agregar/quitar/renombrar campos de
   Firestore, ni tocar reglas de seguridad, ni migraciones, ni contadores.
6. NUNCA tocar el motor de Tarifas ni el modelo de Conceptos. Bloqueados por
   decisiones de negocio abiertas.
7. NUNCA tocar el dropdown de clientes en pallets (Productos del embarque).
   Bug abierto con decisión pendiente. Si lo ves roto, solo documéntalo.
8. NUNCA instalar dependencias nuevas sin registrarlo en el reporte.
9. NUNCA "arreglar" un test haciéndolo menos estricto para que pase.
10. NUNCA sumar montos sin mirar la moneda (§4.3): usa lib/sumarPorMoneda.ts.
    `npx tsx scripts/auditarSumasDeDinero.ts` debe seguir saliendo limpio.
11. NUNCA tocar la máquina de estados de cotizaciones ni la de órdenes de
    compra: sus tests son la especificación del negocio.

## PERMITIDO (tu terreno de juego)
- Arreglar botones que no hacen nada, que tiran error en consola, que no muestran
  estado de loading, o que disparan dos veces con doble clic.
- Formularios sin validación visible, sin mensaje de error, o que no limpian
  estado al cerrar el modal.
- UI/UX puro: espaciados, jerarquía tipográfica, contraste, alineación, estados
  hover/focus/active/disabled, skeletons, estados vacíos (usa ui/EstadoVacio),
  mensajes legibles, responsive en 1280 y 1440.
- Accesibilidad: labels, aria, foco visible, teclado, contraste AA.
- Consistencia: fichas con ui/ficha/FichaLayout, badges con BadgeEstado,
  vacíos con EstadoVacio, primarios en #E11D48. Los componentes compartidos YA
  existen — úsalos, no inventes paralelos.
- Tests de Playwright nuevos.
- Refactors cosméticos dentro de un solo archivo de componente.

## Definición de "listo" para cada arreglo
1. `npm run build` pasa sin errores.
2. `npx vitest run` pasa completo (881+ tests). Un arreglo de UI que rompe un
   test de lógica NO es un arreglo.
3. El test de Playwright que cubre ese flujo pasa en verde.
4. Screenshot ANTES y DESPUÉS en .noche/screenshots/.
5. Cero errores rojos nuevos en la consola del navegador durante el test.
6. Commit atómico propio: `fix(ui): <qué>` o `test(e2e): <qué>`.

Si no cumple los 6, revierte con `git checkout -- <archivos>` y anótalo como
intento fallido. Cero cambios es mejor que un cambio a medias.

## Archivos de estado que TÚ mantienes
- `.noche/AUDITORIA_UI.json` — inventario de rutas/botones/flujos con estado,
  severidad y evidencia.
- `.noche/PROGRESO.md` — bitácora append-only.
- `.noche/BLOQUEOS.md` — lo que NO tocaste y por qué.
- `.noche/REPORTE_MAÑANA.md` — reescríbelo COMPLETO al final de cada lote, para
  que esté vigente aunque el proceso muera de golpe.
