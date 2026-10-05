# Validación en producción · cadena 56 → 66

Pantalla por pantalla, en el orden en que conviene recorrerlas. Primero lo
que **solo lee**, después lo que **escribe** — y lo que escribe va sobre
registros marcados «PRUEBA ADMIN», nunca sobre los reales.

**Cuenta:** `info@digsol.com.mx` (admin). La consola del navegador debe
quedar limpia todo el recorrido.

> ⚠️ **Dos cosas no están desplegadas y cambian qué vas a ver.** Léelas antes
> de empezar, o vas a reportar como bug algo que es esto:
>
> 1. **`clasificarDocumento` no se desplegó** (el deploy está bloqueado por la
>    tarea 64, ver abajo). El botón «Subir documentos» de la orden de compra
>    **sube bien** y el archivo queda en Storage, pero ningún renglón se
>    clasifica solo: todos salen con el aviso «El clasificador respondió con
>    error 400» y el tipo se elige a mano. Es degradado, no roto.
> 2. **`enviarCorreo` no se desplegó** y no hay nada en la interfaz que mande
>    correo. No lo busques.

---

## 1 · Tipo de cambio (tarea 56) — solo lee

Gaby, 2-oct: *«que no se use el TC del SAT o el de Banxico»*.

1. Abre una cotización **sin tasa guardada** y mira el selector de tipo de
   cambio: debe abrir en **Pricing rate**, no en Banxico.
2. El botón **«Usar el de Banxico»** ya no existe. Banxico queda como
   referencia visible, no como opción operativa.
3. Abre `COT-2026-0031` (ya tiene tasa guardada): al reabrirla debe **avisar**
   que la tasa que trae es de referencia.

## 2 · Exportar cotizaciones (tarea 57) — solo lee

El bug: «Exportar» bajaba `QT-1001..QT-1003` de 2023 con Hapag-Lloyd y DHL —
las cuatro de ejemplo del código, no las de la pantalla. El archivo se abre en
Excel y nada en él decía que era ficticio.

4. CRM → filtra por cualquier cosa (etapa, vendedor) → **Exportar**. El CSV
   debe traer **exactamente los renglones que la tabla muestra**, y **Total y
   Moneda en columnas separadas** (§4.3: un solo número que mezcle monedas
   está prohibido).
5. Que **no** aparezca ningún `QT-10xx` ni nada fechado en 2023.

## 3 · Finanzas: el folio inventado (tarea 57) — solo lee

6. Finanzas: ya no debe haber pantallas de ejemplo ni folios inventados. Si
   ves un folio que no reconoces, dímelo.

## 4 · Cuentas por pagar: el COD en el renglón (tarea 58) — solo lee

7. Finanzas → Cuentas por pagar, con la vista **por proveedor** (la de
   omisión). Quien trae un folio en la mano debe **verlo en el renglón**, sin
   abrir nada. Al expandir se agregan concepto, estado y monto.
8. Angosta la ventana a **390 px**: la barra de la bandeja debe **envolver**,
   y «Exportar» no puede salirse del borde.

## 5 · Embarques: tráfico y mes de cierre (tarea 59) — solo lee

El tráfico **se deriva del folio**, y el mes de cierre es el del lado
mexicano: ETA en importación, ETD en exportación.

9. Embarques: hay **columna «Tráfico»** y se puede filtrar por ella.
10. Hay **filtro por mes de cierre**, y el mes elegido se lee
    «**Cierre:** septiembre 2026» — con la palabra, porque un «septiembre
    2026» a secas se leía como ETA.
11. Casos que importan: un folio `VLIM…` debe decir importación; un `VLEM…`,
    exportación; un folio heredado de Magaya con ruta cross-trade debe decir
    **tráfico desconocido** y no inventarlo; y una exportación **sin ETD** no
    cae en ningún mes.
12. Guarda una vista con los dos filtros puestos, recarga, y vuelve a
    abrirla: debe traerse **los filtros, no solo las columnas**.

## 6 · Contactos del cliente (tarea 60)

**169 de los 817 clientes traen contactos de Magaya que ninguna pantalla
enseñaba.** El dato estaba importado y era invisible.

13. *(lee)* Abre un cliente de Magaya con contactos — `CLI-0194` Sava Deck o
    cualquiera — y confirma que **ya se ven**. Un contacto que Magaya marcó
    «general» debe leerse «**sin tipo**», no inventarle uno.
14. *(escribe)* En un cliente **«PRUEBA ADMIN»**: agrega un contacto con
    puesto y tipo, guarda, **recarga** y confirma que quedó.
15. *(escribe)* Desactiva el contacto **principal** de ese mismo cliente: el
    relevo debe pasar solo a otro.
16. Entra como **Ventas**: debe ver los contactos en **solo consulta**.

## 7 · Finanzas con tabla configurable (tarea 61) — mezcla

17. *(lee)* Cuentas por cobrar y por pagar: las dos corren sobre la tabla
    configurable. El **agrupado por cliente** sigue intacto.
18. *(escribe, pero solo tu vista)* Quita una columna, guarda la vista con
    nombre, recarga: debe devolver **columnas y filtros**.
19. Exporta el CSV con esa vista activa: debe salir **sin la columna que
    quitaste**.

## 8 · Documentos de la orden de compra (tarea 63) — escribe

El complemento de pago del proveedor no tenía dónde cargarse: se quedaba en
el correo de Administración.

20. Abre una OC (`OC-2026-0009` sirve) → pestaña de documentos. Debe haber
    **un solo botón** «Subir documentos», con las cuatro casillas: factura,
    complemento de pago, comprobante y cotización del proveedor.
21. Sube **un PDF**. Recuerda el aviso del principio: **va a decir que el
    clasificador falló** y vas a elegir el tipo a mano. Lo que hay que
    comprobar es que **el archivo sí se guardó** y que al confirmar queda
    listado.
22. **Intenta subir un JPG.** Va a fallar, y es lo esperado: los archivos caen
    en `ordenesCompra/{id}/factura/`, la única ruta de la orden con regla
    publicada, y **esa ruta acepta solo PDF y XML**. Ver el punto abierto al
    final.
23. El mismo botón único debe estar en el **expediente del proveedor** y en el
    **expediente del cliente**; por casilla solo queda «Reemplazar».

## 9 · Formato de folio y el interruptor (tarea 66) — cuidado aquí

24. *(lee)* Configuración → Consecutivos de folio. El **interruptor de
    creación automática de embarques debe estar APAGADO**. Verificado en
    código: el valor por omisión es `false` y el camino de error también cae
    en `false`. **No lo prendas** — espera a que Julio confirme el folio y a
    que sembremos los seis consecutivos.
25. *(lee)* El editor de formato: si pones un prefijo **fuera de la familia
    VL**, debe **avisarte antes de guardar** que ese folio no va a decir el
    tráfico. Ese aviso existe porque, sin él, el problema aparecería hasta un
    cierre de mes.
26. *(lee)* Un folio **sin guion** (`VLIM26001`) tiene que seguir diciendo
    importación. Con el separador configurable, antes se partía por guion y
    dejaba el tráfico en `null` — y con él el IVA de la factura y la columna
    Tráfico.

## 10 · Carga de «Clientes OK» (tarea 65) — no se corre todavía

27. Nada que validar en pantalla: es un script y **la lista de Luis no ha
    llegado**. Cuando llegue, corre el modo seco y revisa que el CSV de
    resultado marque los **repetidos dentro de la lista** como
    `repetido_en_la_lista` — antes se leían como «empatado», que se entendía
    como que sí se habían escrito.

---

## Lo que NO se toca

- **El interruptor de embarque automático** (punto 24).
- **Programación de pagos, bancos y anticipos**: esperan la junta con Julio.
- **`scripts/minarRFCMagaya.ts`**: solo modo seco hasta que decidas. Escribe
  únicamente donde `rfc` está vacío; nunca pisa uno que ya existe.

## Un punto abierto, para ti

**La regla de Storage de la tarea 63 nunca se escribió.** El reporte la
propone y CLAUDE.md §4.28 lo dice: los archivos van a `factura/` «que es la
única ruta de la orden con regla publicada». No hay diff que revisar porque
`storage.rules` no cambió en toda la cadena.

Consecuencia práctica: **en la orden de compra solo se pueden subir PDF y
XML.** Un comprobante de pago fotografiado con el teléfono —que es como
llegan— no entra. Si quieres, escribo el bloque de regla para
`ordenesCompra/{id}/documentos/` con sus tests, te muestro el diff y tú lo
despliegas.
