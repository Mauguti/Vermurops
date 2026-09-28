# A y B — El freno mudo y los dos totales (COT-2026-0034)

Estado: **terminados**
Rama: `sprint/pj-A` (sale de `sprint/pj-14`)

## A · El freno dice cuánto es el costo

El mensaje era «Inland Freight Coordination (sin proveedor)» y no decía nada
más. Como la regla depende de un costo que el mensaje no enseñaba, quien lo
leía **no podía saber si el freno tenía razón**. Ahora dice:

```
Falta 1 concepto por completar: Inland Freight Coordination
  (sin proveedor · costo 110.00 USD)
```

`Faltante` gana un `detalle?` opcional que solo se llena en `sin_proveedor`, y
**el detalle va pegado a SU faltante, no al final**: con dos faltantes en la
misma línea, un número suelto al cierre no diría a cuál pertenece.

No cambió ninguna regla: el freno sigue siendo «hay costo → hace falta
proveedor». Solo dejó de ser mudo.

## B · Un solo total, por moneda

**De dónde salía cada número.**

| | Cómo se calculaba | Resultado |
|---|---|---|
| Encabezado | `sumarPorMoneda(lineasPlanas, l => l.venta, l => l.moneda)` | «USD 26,550.00 + MXN 70.00» |
| Desglose | `quote.valorTotalConsolidado > 0 ? ese : calcularTotalConsolidado(...)`, rotulado `{quote.moneda}` | «$26,660 USD» |

**Dos defectos encadenados:**

1. **El desglose podía no calcular nada.** `valorTotalConsolidado` es un campo
   **guardado** que ganaba sobre el cálculo. Un total escrito cuando la
   cotización tenía otras líneas se quedaba ahí para siempre.
2. **Cuando sí calculaba, sumaba divisas.** `calcularTotalConsolidado` hace
   `total += calcLinea(...).venta` sin mirar `moneda`, y lo rotulaba con
   `quote.moneda`. Los 70 pesos entraban como 70 dólares.

**Por qué la diferencia era 110 y no 70:** si solo fuera el defecto 2 daría
26,620. Da 26,660, cuarenta más. Eso confirma que el número de abajo **era el
campo guardado**, no un cálculo — y por eso no cuadraba con nada.

**Cómo quedó** (`lib/totalCotizacion.ts`):

- **Los dos lugares llaman a la misma función.** El encabezado y el desglose
  salen de `totalDeCotizacion(lineasPlanas, quote.valorTotalConsolidado)`.
- **Siempre manda lo calculado, por moneda.** Ningún total suma divisas.
- **El guardado no se toca ni se migra**, pero deja de mandar: cuando difiere
  se declara aparte, «Total guardado anteriormente: $26,660». Un número viejo
  declarado no engaña; uno disfrazado de actual, sí.
- **Con dos divisas el pie lo dice**: «Hay montos en dos divisas: no se suman
  entre sí. Para compararlos hace falta un tipo de cambio.»

**Cuándo se avisa del guardado**, que tiene un matiz: con UNA moneda se compara
contra lo calculado y solo se avisa si difiere (tolerancia de un centavo). Con
VARIAS se avisa siempre que exista, porque ese escalar por fuerza mezcló
divisas y compararlo exigiría inventar la tasa que §4.3 prohíbe.

**De paso:** el escalar `totalConsolidado` que quedaba para las condiciones
también sumaba monedas. Lo reemplacé por `tieneTotal(total)`, un booleano.

## Evidencia

```
CI=1 npm test                       1574 passed (14 nuevos)
npx tsc --noEmit                    9 errores, los mismos de la línea base
npm run build                       limpio
./scripts/e2e.sh                    6/6 passed (34.7s), emuladores limpios
auditarSumasDeDinero.ts             «Sin hallazgos nuevos»
```

Los tests de B corren sobre los números exactos de COT-2026-0034: 26,550 USD +
70 MXN con 26,660 guardado. Amarran que los dos lugares dan lo mismo, que los
70 pesos **no** se suman a los dólares, que el guardado se declara aparte y
que con dos divisas el pie lo dice.

**Una anotación del auditor de sumas:** marcó `impuestoLinea.ts:115`, que suma
**porcentajes** del split aéreo (25% al 16% + 75% al 0%) para la tasa efectiva,
no dinero. Quedó registrada en `LEGITIMOS` con su motivo, para que el auditor
siga siendo útil.

## Qué validar, con la cuenta de Gaby

| Pantalla | Qué hacer | Qué debe ver |
|---|---|---|
| COT-2026-0034 → la franja de arriba | Mirar | «(sin proveedor · costo 110.00 USD)» — y con eso decidir si asigna proveedor o corrige el costo |
| La misma → Servicios, arriba y abajo | Comparar los dos totales | **El mismo texto**: «USD 26,550.00 + MXN 70.00» en los dos |
| El pie del desglose | Mirar | La nota de dos divisas, y «Total guardado anteriormente: $26,660» |
| Una cotización de una sola moneda cuyo guardado coincide | Mirar | **Sin** nota de guardado: no hay nada que declarar |

## Para publicar

`src/lib/prontitudCotizacion.ts`, `src/lib/totalCotizacion.ts` (nuevo),
`src/components/quotes/ProximosPasos.tsx`,
`src/components/quotes/FichaCotizacion.tsx`, sus tests y
`scripts/auditarSumasDeDinero.ts`. Solo hosting.
