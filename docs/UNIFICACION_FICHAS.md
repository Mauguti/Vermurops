# Unificación de fichas y flujo

> Ejecuta, no planees. Trabaja en orden, commit después de cada bloque.
> NO cambies funcionalidad. Si algo funciona mal, anótalo aparte y sigue.

---

## Referencia

`FichaCotizacion` es la ficha modelo. Pantalla completa, componentes extraídos,
footer dinámico, auto-guardado. Todo lo demás se alinea a ella.

---

## 1 · Anatomía única

Todas las fichas comparten la misma estructura:

```
Breadcrumb          ← Módulo / FOLIO
Título              ← folio · nombre · badges de estado
Pestañas            ← ver → hacer → registrar
Contenido
Footer              ← acción principal de la etapa + auto-guardado
```

Fichas a alinear:

| Ficha | Estado hoy | Qué hacer |
|---|---|---|
| Cotización | Pantalla completa | Referencia, no tocar |
| Proveedor | Pantalla completa | Verificar que siga la anatomía |
| **Prospecto** | **Drawer** | **Pasar a pantalla completa** |
| Cliente | Revisar | Alinear |
| Embarque | Revisar | Alinear |
| Orden de compra | Revisar | Alinear |

El cliente pidió explícitamente que el prospecto deje de ser drawer.

Extrae lo compartido: `FichaLayout`, `FichaHeader`, `FichaTabs`, `FichaFooter`.

---

## 2 · Enlaces entre entidades

Los datos ya están relacionados. Falta que la navegación lo refleje.

| Desde | Enlaza a |
|---|---|
| Prospecto convertido | Su cotización |
| Cotización | Su prospecto de origen · sus embarques |
| Embarque | Su cotización · sus facturas · sus órdenes de compra |
| Orden de compra | Su embarque |
| Factura | Su embarque |
| Cliente | Sus cotizaciones · sus embarques |
| Proveedor | Sus tarifas · sus órdenes de compra |

Un clic, sin buscar. Operaciones debe llegar de un embarque a la cotización que lo
originó sin salir a la lista.

---

## 3 · Línea del tiempo consistente

Hoy solo la cotización la tiene bien. Llévala a las demás fichas con el mismo
componente.

Respeta los roles: Ventas ve cinco pasos, Pricing ve las etapas internas. Ya está
resuelto en `visibilidadCotizacion.ts` — aplica el mismo criterio.

---

## 4 · Nomenclatura

Inventaria los términos de la app y unifícalos. El cliente señaló que los nombres
no correspondían a lo que hacían.

Términos del negocio, en singular:

```
solicitud · cotización · embarque · orden de compra
alta · concepto · subconcepto · agente · proveedor · tarifa
```

Si algo se llama distinto en dos lugares, unifícalo. Si un botón promete algo que
no hace, renómbralo o escóndelo.

---

## 5 · Estados vacíos

Cada lista y sección vacía explica qué es y qué hacer. Nunca en blanco.

Ya está resuelto en varios lugares — hazlo consistente en todos.

---

## 6 · Identidad visual

- Rojo `#E11D48` · dark `#1F2937`
- Mismos espaciados, tipografías y radios en todas las fichas
- Badges de estado con el mismo criterio de color
- Tablas con el mismo tratamiento que `SpreadsheetTable`

---

## Reglas de esta pasada

**No cambies funcionalidad.** Es unificación visual y de navegación.

Si encuentras algo que funciona mal, anótalo en un archivo aparte y sigue. Mezclar
unificación con arreglos hace imposible rastrear qué rompió qué.

**Valida entre bloques.** Al terminar cada uno, di qué revisar.

**No deployes sin avisar.**

---

## Orden

1. Extraer los componentes compartidos de layout
2. Prospecto a pantalla completa
3. Alinear las demás fichas
4. Enlaces entre entidades
5. Línea del tiempo
6. Nomenclatura y estados vacíos
7. Pasada de identidad visual

El 1 habilita todo lo demás. El 7 al final, cuando ya no se mueve la estructura.
