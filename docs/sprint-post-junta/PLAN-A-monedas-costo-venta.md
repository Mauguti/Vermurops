# Plan A — Monedas distintas en costo y venta

Análisis, sin código. Caso real: AMS y flete terrestre con **costo en MXN y
venta en USD**.

## 1. Qué hay hoy

**El costo ya es multi-moneda; la línea no.**

`CostoLinea` —cada componente del costo de una línea— **ya trae su propia
`moneda`** ([lineasCotizacion.ts:65](../../src/lib/lineasCotizacion.ts)). Una
línea puede tener una tarifa en USD y un subconcepto en MXN y el desglose lo
representa bien.

Lo que colapsa es `LineaPlana.moneda`: **una sola divisa por línea**, que sirve
al mismo tiempo de moneda del costo y de la venta. Se deriva así:

```ts
moneda: oficiales[0]?.moneda ?? 'USD'   // lineasCotizacion.ts:243
```

O sea: **la moneda de la primera tarifa elegida**, y si no hay ninguna, USD por
omisión. Nadie la captura.

**Y hay una deuda encima.** `getCostoOficial` suma las tarifas sin mirar la
moneda (§6): una línea con 1,000 USD y 5,000 MXN da un costo de «6,000 de
algo», y sobre esa suma se calcularon venta y margen. `calcLinea(costo, profit)`
hereda la mezcla.

Así que hoy el caso de AMS **no da error: da un número equivocado que se ve
bien**, que es el pecado que §4.3 prohíbe.

## 2. Qué se rompe al separarlas

Ordenado por lo que costaría arreglar, no por dónde aparece.

| Qué | Dónde | Por qué se rompe |
|---|---|---|
| `LineaPlana.moneda` deja de tener sentido | `lineasCotizacion.ts` | Es un campo; pasa a ser dos (`monedaCosto`, `monedaVenta`). Todo lo que lo lee asume que aplica a las dos caras |
| `calcLinea(costo, profit)` | `cotizacionCalculator.ts` | `venta = costo + profit` deja de ser una suma válida si costo y venta están en divisas distintas. **Este es el corazón del problema** |
| `margen = profit / venta` | ídem | Dividir dos divisas no da un porcentaje |
| Totales de la tabla | `TablaConceptos.tsx` | Agrupa por `l.moneda`. Con dos monedas por línea, ¿en cuál cae? |
| Comparativa de agentes | `matrizComparativa.ts` | Compara paquetes por proveedor. Es **costo puro**, así que sobrevive: ya sabe convertir para comparar (§4.3) |
| `mapearCotizacionAEmbarque` | `cotizacionAEmbarque.ts` | Ya resuelve bien: el ingreso lleva `linea.moneda` y cada gasto la suya. Solo hay que cambiar la del ingreso por `monedaVenta` |
| `margenRealConcepto.ts` | el del bloque del margen | **Ya está preparado**: agrupa por la moneda del CARGO y se niega a comparar sin tipo de cambio |
| PDF | `pdfCotizacion.ts` | Solo lleva concepto y venta, así que solo le importa `monedaVenta`. Casi no se entera |

**Lo que NO se rompe y conviene subrayar:** todo lo que ya trabaja por moneda
—`sumarPorMoneda`, la comparativa, el margen real, los totales del embarque—
está construido para esto. El trabajo está concentrado en la línea y en
`calcLinea`.

## 3. Cómo se calculan profit y margen con divisas mezcladas

Tres opciones. La diferencia real es **qué se hace cuando no hay tipo de
cambio**, que es el estado normal hoy.

### (a) Profit en la moneda de VENTA, convirtiendo el costo

```
profit = venta − (costo × tipoDeCambio)
margen = profit / venta
```

Un solo número, comparable con el resto de la cotización. Es lo que Pricing
necesita para decidir.

**El riesgo:** el margen se vuelve una función del tipo de cambio, y si el tipo
de cambio se relee, el margen de una cotización vieja cambia solo. §4.3 ya lo
resolvió para la comparativa: **el tipo de cambio se guarda CON la cotización y
no se relee**. La misma regla aplica aquí.

### (b) Dos bloques, sin convertir

Costo MXN por un lado, venta USD por el otro, y **no hay margen**: se dice «no
se puede calcular sin tipo de cambio».

Honesto y useless: Pricing no puede cotizar sin saber si gana.

### (c) Híbrida — **la que recomiendo**

Como la comparativa del §4.3, que ya resolvió este problema:

- El **desglose original siempre visible**: «costo MXN 8,000 · venta USD 1,500
  @ 18.50».
- **Con tipo de cambio declarado**: profit y margen se calculan como en (a),
  en la moneda de venta, y la pantalla dice con qué tasa y de qué fecha.
- **Sin tipo de cambio**: los dos montos se muestran separados, y donde iría el
  margen va «Sin tipo de cambio», igual que ya hace `margenRealConcepto`. No se
  inventa uno.
- Lo guardado conserva su moneda. La conversión es **para comparar y decidir**,
  nunca para cotizar.

Es la regla que el equipo ya conoce de dos pantallas, no una cuarta forma de
tratar monedas.

## 4. ¿En qué divisa totaliza la cotización? ¿Sirve el profit en pesos de Magaya?

**Magaya totaliza el profit en pesos. No nos sirve como está, y sí sirve como
opción.**

Por qué no como está: convierte todo a MXN con una tasa que el usuario no ve, y
el resultado es exactamente el total revuelto que §4.3 prohíbe. Vermur cobra en
USD la mayor parte del flete internacional; un total en pesos no se puede
cotejar contra la factura que se emite.

Lo que propongo:

1. **La cotización totaliza POR MONEDA**, como hoy. Es lo que sale al cliente y
   lo que se factura (una factura por moneda, según el levantamiento).
2. **Además**, un «profit consolidado» en **una divisa de referencia elegida
   por Vermur** —probablemente MXN, porque es la moneda de sus gastos y de su
   contabilidad— calculado con el tipo de cambio guardado, claramente
   etiquetado como derivado y con la tasa a la vista.
3. Ese consolidado sirve para **comparar cotizaciones entre sí y para el
   reporte de fin de mes**, no para cotizar ni para facturar.

O sea: el número de Magaya, pero **declarado** —con su tasa, su fecha y su
etiqueta— en vez de anónimo. «El pecado que la regla prohíbe es el total del
que no sabes qué mezcla. Uno declarado no está revuelto.»

## 5. Orden propuesto, en bloques publicables

1. **Medir primero.** Correr `scripts/auditarMonedasMezcladas.ts` (solo
   lectura, lleva sin correrse desde agosto). Cuántas líneas vivas mezclan
   monedas en el costo decide si esto es una corrección o una migración.
2. **Cerrar la deuda de `getCostoOficial`** antes de tocar nada más. Mientras
   sume sin mirar la moneda, separar costo y venta apila un problema sobre
   otro. Toca cotizaciones vivas: necesita tu aprobación.
3. **`monedaCosto` y `monedaVenta` como campos nuevos opcionales**, leyendo
   `moneda` como respaldo para las dos. Sin migración, igual que los demás
   bloques de este sprint.
4. **`calcLinea` con contexto de conversión**, devolviendo el margen o el
   motivo por el que no lo hay. Función pura, con tests de los seis casos.
5. **La tabla y los totales**, con el desglose visible y «Sin tipo de cambio»
   donde corresponda.
6. **Tipo de cambio de la cotización al embarque**: hoy el embarque no guarda
   ninguno, y por eso `margenRealConcepto` nunca compara entre monedas. Este
   bloque lo destraba de paso.

## 6. Preguntas

**Para ti:** ¿la divisa de referencia del profit consolidado es MXN? *Recomiendo
que sí, y que se elija una sola vez en Configuración, no por cotización.*

**Para Vermur:** en el caso de AMS —costo MXN, venta USD— ¿el tipo de cambio
que usan para decidir el precio es el mismo que el de la comparativa (el
pricing rate con el colchón), o uno distinto? Si es el mismo, esto sale casi
gratis.
