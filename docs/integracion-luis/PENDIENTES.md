# VermurOps — Pendientes antes de Producción

## Estado del plan de integración de los repos de Luis

> Plan completo en `VermurOps_Brief_Integracion_Luis_CONSOLIDADO.md` §4 (8 pasos).
> Mapeados a las épicas E1–E8. Última actualización: 26 jun 2026.

| # | Paso del plan | Épica | Estado |
|---|---|---|---|
| 1 | Calculadora de cotización (`CotizacionCalculator` → TS puro) | E1/E3 | ✅ Hecho |
| 2 | Líneas de cotización (conceptos, profit input) | — | ✅ Hecho |
| 3 | Bandeja Pricing / `tarifas` | — | ⛔ **Diferido a levantamiento** (no se construye aquí) |
| 4 | Campos condicionales de embarque FCL/LCL/terrestre | E4 | ✅ Hecho |
| 5 | Máquina de estados | E5 | ✅ Hecho |
| 6 | Entidad Cliente + crédito/contrato/pagaré (KYC) | E6 | ✅ Hecho |
| 7 | Validadores RFC / CLABE | E7 | ✅ **Hecho y validado en navegador** |
| 8 | Migración 70 clientes reales (`seed_clientes.json`) | E8 | ⏳ **Pendiente — BLOQUEADO** |

### E7 — Validadores RFC / CLABE → HECHO Y VALIDADO

- **RFC:** cableado en captura nueva (`NuevoClienteModal`) y edición (`FichaCliente`).
  Bloquea el guardado si el formato es inválido. Whitelist de genéricos del SAT
  (`XAXX010101000`, `XEXX010101000`) aceptados sin pasar por dígito verificador.
  Guard de backward compat: en edición solo valida si el RFC fue modificado —
  RFCs heredados intactos nunca bloquean.
- **CLABE:** `validarCLABE` + `BANCOS_CLABE` quedan **listos en el módulo**
  (`src/lib/validadores.ts`) pero **sin cablear**: el modelo `ClienteVermur` no
  tiene aún campo de número de cuenta/CLABE (solo el bool `docsAlta.bancaria`).
  Se cablea cuando se agregue ese campo (alcance futuro, no inventar ahora).
- **Validado en navegador (26 jun 2026):** RFC válido se crea · RFC basura se
  bloquea con mensaje rojo · genéricos `XEXX`/`XAXX` pasan · seed con solo el
  teléfono cambiado guarda sin bloquear · consola cero rojos + Firebase Data OK.
- Commits: `0948784` (E7.0 módulo + tests), `74200c8` (E7.1 cableado UI). Tests 68/68.

### E8 — Migración de los 70 clientes reales → PENDIENTE Y BLOQUEADO

- **Bloqueado por dependencia externa:** requiere el `seed_clientes.json` real de
  Luis (repo `kyc_vermur`). Ese archivo **no está en este repo** — solo hay 3
  clientes seed ficticios en `ClientesData.ts`.
- **No se puede ejecutar sin ese archivo.** Al recibirlo: transformar los 70
  registros al modelo `ClienteVermur` y sembrarlos en la colección `clientes/`.
- Dato sensible (RFC, montos, condiciones de crédito) → tratar como confidencial.

### Resumen

De los 8 pasos de integración de Luis: **6 cerrados** (pasos 1, 2, 4, 5, 6, 7),
**E8 (paso 8) bloqueado** por el `seed_clientes.json` de Luis, y el **paso 3
(Tarifas) diferido a levantamiento**. Todo lo demás cerrado.

---

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
