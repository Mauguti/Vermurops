# VermurOps — Decisiones Arquitectónicas

## 1. Capa de datos: Firestore (operación) + BigQuery a futuro (analítica)

### Diseño actual

VermurOps usa **Firestore** como base de datos principal para la operación diaria:
ventas, pricing, estado de cotizaciones, historial de etapas, chat interno.
Firestore fue elegido por su sincronización en tiempo real (`onSnapshot`), escalabilidad
sin servidor y su integración nativa con Firebase Auth.

### Fase futura: capa analítica BigQuery

Cuando el volumen de datos y la necesidad de reportes lo justifique, se añadirá
**BigQuery** como capa analítica complementaria — no como reemplazo de Firestore.

**Firestore → operación viva.** Consultas por documento y colección, sin JOINs.
**BigQuery → reportes y análisis.** SQL completo, JOINs, agregaciones, exportación
masiva a Excel/Sheets.

#### Por qué BigQuery y no Firestore para reportes

| Capacidad | Firestore | BigQuery |
|---|---|---|
| Sincronización en tiempo real | ✅ | ✗ |
| JOINs entre colecciones | ✗ | ✅ |
| Agregaciones complejas (SUM, GROUP BY) | Limitado | ✅ |
| Export masivo a Excel / Sheets | Lento, manual | ✅ nativo |
| SQL estándar | ✗ | ✅ |
| Costo por lectura masiva | Caro | Barato por GB |

#### Por qué BigQuery es natural para Luis

Luis viene de MySQL (su repo `vermur-cotizaciones` es Laravel + MySQL).
BigQuery habla SQL estándar — puede escribir reportes y vistas sin aprender NoSQL.
Esto le abre la puerta a colaborar en la capa analítica sin pelear con la API de Firestore.

#### Cómo sincronizar cuando llegue el momento

Usar la **extensión oficial `firestore-bigquery-export`** de Firebase Extensions:
- Sincroniza documentos de Firestore a BigQuery automáticamente (CDC en tiempo real o
  backfill histórico).
- Sin código personalizado: se configura desde la consola de Firebase.
- Documentación: https://extensions.dev/extensions/firebase/firestore-bigquery-export

**⚠️ NO instalar BigQuery ahora.** Se implementa cuando haya necesidad real de reportes
que Firestore no pueda servir eficientemente.

---

## 2. Pendiente de escalabilidad: useCotizaciones

El hook `useCotizaciones` (`src/hooks/useCotizaciones.ts`) hoy abre un `onSnapshot`
sobre **toda** la colección `cotizaciones` sin filtros ni paginación. Funciona bien
con el volumen actual (decenas de documentos), pero no escala a cientos o miles.

**Cuando sea necesario:**
- Agregar `limit(N)` + `startAfter(cursor)` para paginación incremental.
- Filtrar por `etapa`, `vendedorId` o rango de `createdAt` para reducir lecturas.
- Considerar índices compuestos en Firestore para los filtros más usados.

**No se implementa ahora.** El trigger es cuando la carga inicial tarde más de ~1 s
o cuando el costo de lecturas de Firestore sea visible en la factura.

---

## 3. Análisis de compatibilidad BigQuery del modelo de datos actual

> Solo lectura — no implica rediseño inmediato.

### 3a. Fechas: formato no estándar ⚠️

Los campos `createdAt`, `updatedAt`, `StageHistory.fecha` y `QuoteActivity.createdAt`
usan el formato `'YYYY-MM-DD HH:MM'` (sin separador `T`, sin zona horaria).

```
Ejemplo actual:  "2026-06-05 10:20"
ISO 8601 real:   "2026-06-05T10:20:00.000Z"
```

BigQuery puede importar ambos formatos, pero el actual requiere
`PARSE_DATETIME('%Y-%m-%d %H:%M', campo)` en lugar de un `TIMESTAMP()` directo,
lo que complica las consultas. El campo `vigencia` de `CotizacionProveedor` y
`fechaLimite` de `QuoteActivity` usan solo `'YYYY-MM-DD'` (fecha sin hora), añadiendo
una tercera variante.

**Nota:** Estandarizar a ISO 8601 completo (`YYYY-MM-DDTHH:MM:SS.sssZ`) antes de
activar la sincronización BigQuery ahorraría trabajo en cada consulta.
No bloquea la operación actual — es un cambio de formato de string.

### 3b. Estados y etapas: limpios ✅

`etapa: PipelineStageId`, `estado` de servicio y `estadoFinal` son string enums
consistentes y descriptivos. BigQuery los indexa bien y son usables directamente
en `WHERE` y `GROUP BY` sin transformación.

### 3c. Anidamiento profundo: complejo para tabular ⚠️

El documento tiene 4 niveles de anidamiento:

```
KanbanQuote
  └── servicios: ServicioSolicitado[]
        ├── cotizacionesProveedor: CotizacionProveedor[]
        └── conceptos: ConceptoCotizacion[]
              ├── subconceptos: Subconcepto[]
              └── tarifas: CotizacionProveedor[]
```

BigQuery almacena estos como `ARRAY<STRUCT<...>>` y permite consultarlos con `UNNEST()`,
pero un reporte de "líneas de costo por cotización" requeriría múltiples `UNNEST` anidados,
haciendo el SQL verboso. Para reportes de alto nivel (pipeline por etapa, revenue total,
conversión por vendedor) solo se necesitan campos del nivel raíz — sin problema.

**Nota:** Cuando se implemente BigQuery, crear **vistas SQL materializadas** que aplasten
la jerarquía en tablas normalizadas (`cotizaciones_flat`, `servicios_flat`,
`conceptos_flat`) para que los usuarios finales no tengan que escribir `UNNEST`.

### 3d. Campo `chat`: potencialmente ilimitado ⚠️

`KanbanQuote.chat: QuoteMessage[]` puede crecer indefinidamente con el tiempo.
Sincronizarlo a BigQuery inflaría el tamaño del documento y cada sync exportaría
el historial completo del chat aunque solo un campo raíz cambiara.

**Nota:** Cuando se active la extensión Firestore→BigQuery, excluir el campo `chat`
del export (la extensión permite field exclusions) o moverlo a una subcolección
separada (`cotizaciones/{id}/mensajes`).
