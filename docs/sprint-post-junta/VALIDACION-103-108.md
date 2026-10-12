# Validación en producción · 103 → 108

**Cuenta:** `info@digsol.com.mx` (admin); `ventas@vermur.com` para la
solicitud y `operaciones@vermur.com` para el embarque. Consola limpia.

Tres tareas de código y un plan. Todo lo que se guarda son **campos
opcionales y aditivos** (`CargaTerrestre.volumenM3`, `TarifaVermur.modalidad`);
nada se migra. **La 106 y la 107 no traen una sola línea** — ver §3.

---

## 1 · Lo que no escribe nada

1. **Abre dos cotizaciones terrestres viejas.** El campo nuevo **«Volumen
   (m³, opcional)»** tiene que estar **vacío**, no en 0. Un 0 guardado donde
   nadie capturó nada es el síntoma a reportar: vacío se guarda `null`.
2. **Abre dos tarifas por kg cobrable de antes** (si hay). **Sin modalidad**
   rige la lógica de la 100 tal cual: la carga decide el aéreo. Si una tarifa
   vieja cambió de total, **para y dime** — eso sería una regresión de precio.
3. **Una cotización CON carga (las nuevas):** en Servicios, las casillas
   viejas **«Estibable» de LCL y de terrestre ya no se pintan**. No se
   borraron ni se migraron: se siguen leyendo, y aparecen solo en las
   cotizaciones que **no** tienen carga tipada. La estiba se edita en
   Información → Operación.
4. **Productos de un embarque:** cada renglón trae un **lápiz** nuevo
   («Editar estiba») junto al bote de basura. Antes de tocarlo, la columna de
   acciones y el resto de la tabla tienen que verse igual.

## 2 · Lo que escribe (sobre una cotización «PRUEBA 103-108»)

5. **Volumen terrestre** (103): en una solicitud **terrestre**, captura
   «Volumen (m³)».
   - Un **negativo se rechaza**; vacío guarda `null`.
   - Se ve en el detalle de la carga y en el resumen.
   - **Y ahora el cálculo por kg cobrable funciona en terrestre:** con volumen
     y con factor en la tarifa, el desglose deja de decir «Sin cálculo».
     Es lo que la 100 dejó anotado como imposible por falta del dato.
   - Sin volumen sigue diciendo «Sin cálculo» — y ahora **dice dónde
     capturarlo** («en la solicitud o en Información → Operación»).
6. **Modalidad en la tarifa** (103): en el formulario de tarifa por kg
   cobrable, el selector de modalidad.
   - **Aéreo:** factor 167 por default y redondeo al medio kilo.
   - **Terrestre:** el **factor es obligatorio** — sin él no guarda, y sin
     redondeo.
   - **Marítimo:** la tarifa por kg cobrable **no se guarda** y el cálculo
     devuelve el motivo («ahí se cobra por contenedor, CBM, TON o WM»).
   - ⚠️ **Con modalidad declarada manda ella**, aunque la carga sea de otro
     tipo. Es a propósito: la tarifa sabe de qué es.
7. **Estiba de un producto ya creado** (105): el lápiz abre el mismo campo con
   los mismos topes. Pon **×3**, guarda; vuelve a abrir y pon **×7** en un
   producto terrestre: lo rechaza (tope 5). Marca **no estibable**: los niveles
   **se borran** y el campo se esconde. Cierra y vuelve a entrar: tiene que
   haber quedado.
8. **Importación con IA** (104): **esto no se puede probar en pantalla hoy** —
   ver §3. Lo que sí se puede mirar es la pantalla de **revisión de tarifas
   extraídas** (Tarifas → Cargar tarifario), que es la que sí está montada:
   una línea con unidad **KG_COBRABLE** pinta el editor de factor, mínimo y
   escalas, y el guardado se **bloquea** con «La tarifa por kg cobrable está
   incompleta» hasta que estén.

## 3 · Lo que NO se publicó, y por qué

- **La 106 no tiene commits:** su rama apunta al mismo commit que la 105. Fue
  un **hallazgo**, no un cambio: Prospectos no lista cotizaciones, así que no
  había dónde poner el filtro «Ganadas sin contrato». **Queda abierta qué
  pantalla querías.**
- **La 107 tampoco tiene commits:** la sesión terminó sin reporte. Era
  justamente la de **aislar los specs y arreglar `capturas-03`** — y
  `capturas-03` volvió a salir flaky en esta corrida, la **segunda seguida**.
  Hay que relanzarla en primer plano.
- **`CargaMasivaTarifas` sigue sin montarse.** Cero importadores, confirmado
  por grep: la pantalla no existe para nadie. Se le agregó la unidad, el editor
  y la modalidad, y **no se puede ver ni probar**. Tu decisión: se queda como
  está hasta que Luis mande un tarifario real.
- **El volumen terrestre en el PDF**: va en la cola.
- **El plan 108 es solo plan**, cero código. Aprobado: **P1 → P2 → P3** en la
  cola siguiente; en conflicto sobre el mismo campo **gana el último con
  aviso**, y el aviso va en **P4**.
- El interruptor de **embarque automático**: apagado.

## 4 · Síntoma → causa

| Síntoma | Causa más probable |
|---|---|
| Una cotización terrestre vieja trae volumen 0 | se escribió un default: **para y dime** |
| Una tarifa por kg cobrable vieja cambió de total | la modalidad se está infiriendo donde no la hay |
| El desglose terrestre sigue en «Sin cálculo» con volumen capturado | falta el factor en la tarifa (es obligatorio, no hay default) |
| Un producto marítimo rechaza ×7 niveles | marítimo no tiene tope: si lo rechaza, es bug |
| Desmarcar «estibable» deja los niveles | `conEstiba` no está borrando la clave |
| Una importación de tarifario deja la unidad vacía | es la 104 y es correcto: «kg» sin contexto no se adivina |

---

## Lo que pediste y lo que encontré

**Los barridos, antes del merge.** La 103, la 104 y la 105 no los habían
corrido. Sobre el código de la cadena: **45-filtros 34/34** y **47-barrido
129/129 con «Sin hallazgos»** (los 95 del barrido más los de filtros en la
misma corrida), con el recorrido **6/6** delante.

**El bug que la 104 arregló estaba vivo en producción.** `normalizarUnidad`
mapeaba `kg` y `peso` a **TON**: un tarifario aéreo por kilo se guardaba por
tonelada, **mil veces mal**, y el renglón se veía perfectamente bien. Ahora
«kg» a secas solo pasa a KG_COBRABLE si el documento parece aéreo o la línea
trae escalas; sin contexto la unidad queda **vacía** y la pantalla bloquea con
«Falta la unidad». Nunca adivina.

### Mutaciones

| Qué rompí | Tests que cayeron |
|---|---|
| La modalidad de la tarifa deja de mandar sobre la carga | 2 |
| «kg» ambiguo vuelve a caer en TON (el bug de arriba) | **8** |
| El factor volumétrico deja de ser obligatorio en terrestre | 4 |
| Una carga terrestre deja de leer su volumen | 1 |

Las cuatro tumbaron su test. Restaurado y árbol limpio.

## Evidencia

- `npx tsc --noEmit` → 0.
- **2,851 tests** unitarios, 128 archivos (eran 2,801 / 126).
- **45-filtros + 47-barrido: 129/129, sin hallazgos**, sobre el código de la
  cadena antes de mergear.
- **`npm run e2e:completo` → 269 passed, 1 flaky (`capturas-03`), código 0.**
- Producción: `index-WWO2Gqy5.js`, verificado por `curl` contra el build local
  (la anterior era `index-Djc7_Emg.js`).
