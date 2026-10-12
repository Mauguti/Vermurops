# Validación en producción · 98 → 102

**Cuenta:** `info@digsol.com.mx` (admin) para casi todo; `operaciones@vermur.com`
para el embarque y `ventas@vermur.com` para la solicitud. Consola limpia todo
el recorrido.

Todo lo que escribe esta cadena son **campos opcionales y aditivos**: sin valor
se lee «Sin indicar», que no es «no». Nada se migra ni se reescribe. Por eso el
primer bloque es el que importa: **una cotización o una tarifa de antes tiene
que verse exactamente igual que ayer.**

Lo que se publicó aparte: la regla de Storage de
`cotizaciones/{id}/contrato/` (la 102 no sube nada sin ella).

---

## 1 · Lo que no escribe nada

1. **Abre tres cotizaciones viejas** (de las que ya estaban antes del 9-oct).
   Ni «Servicio aéreo», ni «Estibable», ni las fechas deseadas deben traer
   valor: **«Sin indicar»**. Un «No estibable» donde nadie dijo nada es el
   síntoma a reportar.
2. **Lista de Embarques:** la columna nueva **«Servicio aéreo»** entra a la
   vista por defecto. Los embarques de antes la traen en «—». Si ya tenías una
   vista guardada, conserva sus columnas y la puedes agregar a mano.
3. **Lista de Tarifas:** columna y filtro de servicio aéreo. Una tarifa vieja
   sale en «Sin indicar» y **el filtro del otro tipo no la muestra**.
4. **Una cotización ganada SIN contrato** enseña el aviso ámbar **«Sin contrato
   firmado»** en su ficha y en la del embarque (Hitos). **No bloquea nada** —
   decisión tuya: el contrato sigue siendo aviso. Si te impide avanzar, es bug.
5. **Lista de cotizaciones → Filtros → «Ganadas sin contrato»**: tiene que
   traer justo las ganadas sin contrato firmado (ausente, o subido sin marcar
   «Firmado por el cliente»), no todas las ganadas.

## 2 · Lo que escribe (sobre una cotización «PRUEBA 98-102»)

6. **Servicio aéreo, de punta a punta** (98): con Ventas, una solicitud
   **aérea** → dos botones **Expeditado / Regular**. Elige uno; vuelve a
   pulsar el mismo y **se quita** (borra la clave, no guarda un `''`).
   Pricing lo ve en el detalle y en el resumen de la carga.
   - Marca ganada, abre el embarque: el **producto aéreo lo heredó**.
   - En Productos del embarque, cambiar el servicio **lo pone en TODOS** los
     productos: es del embarque, no del renglón. Si los productos no coinciden,
     la pantalla lo dice y **no elige uno por ti**.
   - En la cotización, «Usar» una tarifa: te ofrece las del **mismo** tipo; si
     no hay, las «sin indicar» **con aviso ámbar**; las del otro tipo nunca.
     ⚠️ Con tarifas del mismo tipo disponibles, las «sin indicar» NO se ven.
7. **Estiba** (99): en la carga, «Estibable» y los niveles. El tope es por
   modalidad: **terrestre 5, aéreo 3, marítimo sin tope** (tu respuesta: sin
   tope hasta que Vermur conteste). Teclea **6 en terrestre**: el campo lo
   rechaza con su aviso y la carga **conserva el último valor válido** — el
   autoguardado no debe escribir el 6. Marcar «no estibable» **borra** los
   niveles y esconde el campo.
   - En el PDF, la estiba va **dentro de `carga.tipo`** («LCL · estibable ×3»),
     como pediste: no toca el flujo de n8n.
8. **Peso cobrable** (100): una tarifa con unidad **KG_COBRABLE**. En la
   cotización, `DesgloseCobrable` enseña bruto, volumétrico, **cuál se cobró**
   y la fórmula.
   - **Aéreo:** sin factor en la tarifa rige **167 kg/m³** y el cobrable sube
     al **medio kilo** (101.2 → 101.5); la escala se decide con el cobrable ya
     redondeado.
   - **Terrestre:** no hay default. Una tarifa por kg cobrable **sin factor no
     se guarda**. Y ojo: hoy la carga terrestre no captura volumen, así que esas
     tarifas dicen **«Sin cálculo»** con el motivo — no un total inventado.
   - Sin peso, sin volumen o sin factor, **«Usar» avisa** en vez de meter el
     precio por kg como si fuera el monto. Eso es lo que hay que ver.
9. **Fechas deseadas** (101): recolección y entrega en la solicitud y en
   Información → Operación.
   - **Entrega antes de recolección bloquea.**
   - Una fecha **pasada solo avisa** («Se guarda igual»): hay cotizaciones que
     se capturan tarde.
   - En el embarque **se LEEN de la cotización**, no se copian: salen como
     «Solicitadas por el cliente (no son ETD/ETA)» en Hitos y **no tocan**
     `fechas.salida` ni `fechas.arribo`. Si cambian la ETA, es bug.
10. **Contrato de la ganada** (102): con la cotización en `ganada`, sube un PDF
    y marca «Firmado por el cliente» → el aviso ámbar desaparece.
    - **«Generar contrato» está deshabilitado**: «Falta la plantilla de Vermur».
    - **Reemplazar** deja entrada en Historial / Notas con el archivo anterior;
      el anterior **se conserva** en Storage.
    - Quien lo maneja: Ventas, Pricing o admin.

## 3 · Lo que NO se publicó

- **Volumen en la carga terrestre** y **campo de modalidad en la tarifa**: son
  las preguntas 3 y 4 de la cadena y quedaron para la siguiente cola.
- **Tope de estiba marítimo**: sin tope hasta que Vermur conteste.
- **Servicio aéreo obligatorio**: sigue opcional, por tu respuesta 7.
- El interruptor de **embarque automático**: apagado.

## 4 · Síntoma → causa

| Síntoma | Causa más probable |
|---|---|
| Una cotización vieja dice «No estibable» | se escribió un default: **para y dime** |
| El total de una tarifa por kg sale redondo donde debería decir «Sin cálculo» | falta el factor y se asumió el 167 fuera del aéreo |
| «Usar» mete el precio por kg como monto | `montoDeTarifa` no devolvió `null` |
| El embarque cambió su ETA al capturar fechas deseadas | la 101 está copiando en vez de leer |
| Subir el contrato falla con permiso | la regla de Storage del contrato no está publicada |
| El filtro de servicio aéreo esconde tarifas «sin indicar» | es la decisión ⚠️ de la 98, no un bug |
| Un embarque aéreo con productos de servicios distintos no deja elegir | es el aviso de la 98: lo resuelve la persona |

---

## Lo que encontró la suite completa, y no los tests unitarios

**Dos specs del mismo sprint se pisaban.** `100-peso-cobrable` sembraba una
tarifa con la **misma ruta «MEX → GDL»** que `98-servicio-aereo` usa para
contar filas: cada spec pasaba solo y, juntos, la 98 veía 4 donde esperaba 3.
La 100 pasó a «MEX → MTY», que no usa nadie.

Es la misma clase que la 90 cazó con las preferencias: dos specs que comparten
un dato sin saberlo. Queda como criterio para la cola siguiente — **cada spec
con su propio dato, incluidas las etiquetas que parecen inocentes.**

`capturas-03` salió **flaky** (timeout esperando una fila; pasa al reintento).
No lo causa esta cadena; quedó anotado.

## Evidencia

- `npx tsc --noEmit` → 0.
- **2,801 tests** unitarios (126 archivos).
- **45-filtros 34/34** y **47-barrido 95/95, sin hallazgos**, corridos sobre el
  código de la cadena ANTES de mergear (la 98 no los había corrido).
- **`npm run e2e:completo` → 264/264, código 0.**
- Producción: `index-Djc7_Emg.js`, verificado por `curl` contra el build local.
