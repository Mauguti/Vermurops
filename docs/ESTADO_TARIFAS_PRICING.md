# VermurOps — Estado de Tarifas/Pricing (Pausa documentada)

> Última actualización: 1 julio 2026
> Estado: **EN PAUSA** — E9 cerrada, E10 pendiente de sesión de diseño con Mau.

---

## Épicas completadas

| Épica | Descripción | Commits | Validado |
|-------|-------------|---------|----------|
| E1–E3 | Calculadora de cotización, líneas, conceptos, folio atómico | `a6207f9` y anteriores | Sí |
| E4 | Campos condicionales FCL/LCL/terrestre | `4dce4ad` | Sí |
| E5 | Máquina de estados (stateMachine.ts + 34 tests + cableado UI) | `946c8c1`–`93477be` | Sí |
| E6 | Entidad Cliente + crédito/contrato/pagaré + Firestore | `f43e80d`–`d69a5ff` | Sí |
| E7 | Validadores RFC/CLABE (68 tests) + cableado en UI | `0948784`, `74200c8` | Sí |
| E8 | Migración 70 clientes reales | — | **BLOQUEADA** (falta `seed_clientes.json` de Luis) |
| E9 | Proveedores en Firestore (modelo, hook, CRUD, alta rápida) | `56134d3`–`99c86a9` | Sí |

---

## Épicas PENDIENTES (plan Tarifas/Pricing)

| Épica | Descripción | Prerequisitos | Notas |
|-------|-------------|---------------|-------|
| **E10** | Modelo de Tarifas en Firestore | **Sesión de diseño con Mau** | Estructura de rutas, vigencia, maniobras por terminal. NO empezar sin esa sesión. |
| E11 | UI Bandeja de Tarifas | E10 | CRUD de tarifas, filtros, búsqueda |
| E12 | Conceptos maestros (catálogo de conceptos reutilizables) | E10 | Tipos de cargo, unidades, categorías |
| E13 | Comparativa Pricing (vista lado a lado de proveedores) | E10, E11 | Tabla comparativa, selección asistida |
| E14 | Profit real + moneda mixta | E10 | Cálculo con tipo de cambio, financiamiento real |
| E15 | Trazabilidad / versionado de cotizaciones | E10 | Historial de cambios, auditoría |
| E16 | OCR / IA para extracción de tarifas | E10, E11 | Lectura de PDFs de proveedores |
| E17 | SMTP (envío de cotizaciones por correo) | E13 | Plantillas, attachments |
| E18 | Estados finales (ganada/perdida/cancelada) | E5 | Extensión de la máquina de estados |

### E10 — Siguiente paso (BLOQUEADO por sesión de diseño)

E10 requiere decisiones de diseño que NO se pueden tomar sin una sesión con Mau:

1. **Estructura de rutas:** ¿plano (origen→destino) o jerárquico (país→puerto→terminal)?
2. **Vigencia de tarifas:** ¿por fecha, por volumen, por contrato?
3. **Maniobras por terminal:** ¿campo libre o catálogo cerrado?
4. **Relación tarifa↔proveedor↔modalidad:** ¿1:1 o N:M?
5. **Moneda de la tarifa:** ¿siempre USD o multi-moneda?

**NO empezar E10 sin esa sesión.** El riesgo de rehacer el modelo es alto.

---

## Deudas técnicas anotadas

### Para E14: `ClienteVermur.dias` debe desglosarse por tipo
- Hoy `ClienteVermur` tiene un solo campo `dias: number` (días de crédito del cliente).
- En E14 se desglosará a `diasCreditoPorTipo: { maritimo: number, terrestre: number, aereo: number }`,
  misma forma que `ProveedorVermur.diasCredito`.
- **NO tocar hasta E14** — backward compat con todo lo que usa `dias` hoy.

### Seguridad: colección `proveedores/` abierta
- La regla Firestore para `proveedores/` quedó con la misma apertura que el resto:
  cualquier usuario autenticado puede leer y escribir.
- **Endurecer por rol** cuando se haga la épica de seguridad (fuera de E9–E18).
- Aplica también a `clientes/`, `cotizaciones/`, `contadores/`.

### Alta rápida inline — CUMPLIDO
- El compromiso de E9.2 (alta rápida de proveedor desde BandejaPricing y FichaCotizacion)
  **ya está implementado y validado**. Si aparece en notas viejas como pendiente, ignorar.

---

## Archivos clave para retomar

| Área | Archivos |
|------|----------|
| Modelo proveedor | `src/components/proveedores/ProveedoresData.ts` |
| Hook proveedores | `src/hooks/useProveedores.ts` |
| CRUD proveedor | `src/components/proveedores/ProveedorFormModal.tsx` |
| Alta rápida | `src/components/proveedores/AltaRapidaProveedorModal.tsx` |
| Directorio (Clients) | `src/components/Clients.tsx` |
| Dropdowns proveedor | `BandejaPricing.tsx`, `FichaCotizacion.tsx`, `FichaRFQ.tsx` |
| Validadores | `src/lib/validadores.ts` |
| Calculadora | `src/lib/cotizacionCalculator.ts` |
| Máquina de estados | `src/lib/stateMachine.ts` |
| Modelo cliente | `src/components/clientes/ClientesData.ts` |

---

## Commits de E9 (referencia rápida)

```
56134d3 feat(E9.0): modelo ProveedorVermur + useProveedores hook + seed Firestore
ed5981a fix(E9.0): agregar regla Firestore para colección proveedores/
bd10330 feat(E9.1): reconectar Clients, FichaCotizacion y FichaRFQ a useProveedores
afe6698 feat(E9.3): BandejaPricing FormProveedor → dropdown del catálogo
99c86a9 feat(E9.2): CRUD proveedor + alta rápida inline
```
