# Validación en producción de la cadena 35 → 55

**Una sola sesión, con la cuenta `info@digsol.com.mx` (admin).** Es la única
que ve todas las pantallas; donde una tarea sea de un área, se indica y se
valida igual desde admin, porque la matriz §4.1 se verificó por test en la
tarea 47 y aquí lo que se mira es que la pantalla funcione.

**Todo lo que ESCRIBE va sobre registros marcados «PRUEBA ADMIN»**, nunca
sobre los reales. Los reales se abren en modo lectura, para comprobar que
los datos que ya existen se siguen viendo bien.

Registros reales que se usan **solo para mirar**:

| Qué | Cuál |
|---|---|
| Cliente | `CLI-0194` · Sava Deck Bicicletas (origen Magaya) |
| Cotización ganada | `COT-2026-0031` · Sava Deck, con embarque |
| Embarque | `VLIA-26-001` (de la 0031) |
| Orden de compra | `OC-2026-0009` (la del reporte de Luis) |
| Cotización con OC | `COT-2026-0025` · Sava Deck |

---

## 1 · Primero lo que no escribe nada (10 min)

1. **Entrar y abrir la consola del navegador.** Debe quedar limpia durante
   todo el recorrido. Si aparece `permission-denied` de `tipoCambio`, las
   reglas no se desplegaron.
2. **Configuración → Mi empresa** (tarea 40). Debe traer precargados los
   datos reales de Vermur. *No guardes todavía.*
3. **Configuración → Tipo de cambio** (tarea 51). Debe mostrar una tasa y su
   fecha, no «sin definir». El historial lista los últimos días hábiles. El
   botón de actualizar manual **sí** se puede usar: escribe por la Function,
   no por el navegador.
4. **Altas → Clientes → `CLI-0194`**. Pestaña Información: existe la sección
   «Datos fiscales» con RFC, CP y régimen fiscal (tarea 35). Pestaña Crédito:
   los días aparecen por modalidad (general, marítimo, aéreo, terrestre) y el
   valor que ya había quedó en «general».
5. **Altas → Clientes, la tabla.** Hay columna «Fiscal» con completo /
   incompleto y se puede filtrar por ella.
6. **Altas → Proveedores.** Las pestañas por tipo (Proveedor, Transportista,
   Agente de carga) filtran de verdad y traen su conteo. Abrir cualquiera:
   hay pestaña **Expediente** con el checklist de 4 documentos (tarea 54).
   *No subas nada aún.*
7. **`COT-2026-0031`**. El pie del consolidado y el resumen financiero: los
   días de crédito que usa el financiamiento dicen de qué modalidad salieron
   (tarea 37).
8. **`VLIA-26-001`**. El botón «Guardar cambios» está **arriba**, en el
   encabezado, no en el pie (tarea 50). Lo mismo en la ficha del cliente y
   en la de la solicitud (RFQ).
9. **`OC-2026-0009`** — el bug de Luis. La tarjeta «Avance de la orden» cabe
   dentro de su contenedor y la página hace scroll completo. Probar también
   con la ventana baja.
10. **Finanzas → Cuentas por pagar.** Hay columna **IVA** con badge
    (OK / No cuadra / Pendiente) y se puede filtrar por ella (tarea 36).
11. **En las seis fichas** (cotización, embarque, cliente, proveedor,
    prospecto, OC) el botón **←** regresa a su lista (tarea 43), y las
    acciones (PDF, Marcar perdida, Autorizar, Pagar…) están arriba (tarea 44).

## 2 · Lo que escribe — todo sobre «PRUEBA ADMIN»

12. **Configuración → Mi empresa:** cambiar un campo menor, guardar, recargar
    y confirmar que persistió. Devolverlo a su valor. *Esto es lo que
    comprueba la regla nueva de `configuracion/empresa`.*
13. **Alta de cliente «PRUEBA ADMIN — fiscal»**: capturar RFC, CP de 5
    dígitos y régimen fiscal. El CP con 4 dígitos debe avisar sin bloquear.
    Guardar y ver que la columna «Fiscal» lo marca completo.
14. **En ese mismo cliente, Crédito:** poner 45 marítimo / 20 aéreo / 15
    terrestre y guardar.
15. **Alta de proveedor «PRUEBA ADMIN — expediente»**, pestaña Expediente:
    subir un PDF cualquiera al checklist y **validar** el expediente. Debe
    quedar «Validado · por info@digsol.com.mx» con la fecha (tarea 54).
    *Esto comprueba la regla de Storage de expedientes.*
16. **Una OC de prueba** (la que genere un embarque «PRUEBA ADMIN», o
    `OC-2026-0009` si prefieres no crear nada: **solo subir, no autorizar**):
    cargar un **XML de CFDI** real de un proveedor. Debe leer UUID, RFC,
    subtotal, IVA y total, y avisar si el RFC no coincide con el proveedor o
    si el total difiere del de la OC (tarea 55). Subir el mismo XML otra vez
    debe avisar **UUID duplicado**.
    *Esto comprueba la regla nueva de `ordenesCompra/{id}/factura/`.*
    Probar también que un **JPG se rechaza**: ahí solo van PDF y XML.
17. **Embarque «PRUEBA ADMIN»** (o `VLIA-26-001` sin guardar): botón de
    **notificación de arribo** (tarea 41). Debe descargar un PDF con el
    encabezado de Vermur, las entidades, los contenedores con peso y volumen
    y los cargos **separados por moneda**. Si da 502, el flujo
    `generar-documento` no está activo en n8n.

## 3 · Lo que NO se toca

- **Programación de pagos, bancos y anticipos**: esperan la junta.
- **La casilla «Se opera como embarque aparte»**.
- **`scripts/aplicarConceptosIVA.ts`** (tarea 39): el modo seco es seguro y
  solo lee, pero **las 15 reglas no se aplican** hasta confirmar CON-019,
  CON-022 y CON-081 con Julio.

## 4 · Qué significa que algo falle

| Síntoma | Causa más probable |
|---|---|
| `permission-denied` en consola al abrir Tipo de cambio | las reglas no se desplegaron |
| «Mi empresa» no guarda | idem, `configuracion/empresa` |
| La factura de la OC no sube | idem, regla de Storage |
| La notificación de arribo da 502 | flujo `generar-documento` inactivo en n8n |
| La tasa del día no aparece | `tipoCambioProgramado` no ha corrido, o Banxico no respondió |
