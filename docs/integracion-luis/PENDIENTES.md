# VermurOps — Pendientes antes de Producción

## Formato de folio Magaya

**Estado:** ⚠️ Sin verificar
**Bloquea:** Deploy de E3 a producción
**Archivo:** `src/lib/folioService.ts` → constante `FOLIO_CONFIG`

### Qué verificar en Magaya de Vermur

Abrir Magaya → módulo de cotizaciones → ver el folio de la última cotización real.

| Campo | Valor actual (placeholder) | Valor real de Magaya |
|---|---|---|
| `prefijo` | `'COT'` | ??? |
| `incluirAnio` | `true` (→ `COT-2026-XXXX`) | ??? |
| `separador` | `'-'` | ??? |
| `padding` | `4` (→ `0001`) | ??? |
| `inicial` | `1` | último folio Magaya + 1 |

### Qué actualizar una vez verificado

1. Editar `FOLIO_CONFIG` en `src/lib/folioService.ts` con los valores reales.
2. Editar el documento `contadores/cotizaciones` en Firestore Console con `{ ultimo: N }` donde N = último folio real de Magaya.
3. Marcar este pendiente como resuelto.

---

## Parámetros de negocio del calculador (cotizacionCalculator.ts)

**Estado:** ⚠️ Sin confirmar con Vermur
**Archivo:** `src/lib/cotizacionCalculator.ts`

- Financiamiento: 0.05%/día (días / 2000) — ¿confirmado?
- Comisión: 10% fijo sobre profit_total — ¿confirmado?
- Costo de operación: $1,500 MXN — ¿confirmado?
