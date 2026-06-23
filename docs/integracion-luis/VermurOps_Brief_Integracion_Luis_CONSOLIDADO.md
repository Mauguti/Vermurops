# VermurOps · Brief de Integración CONSOLIDADO — Repos de Luis

**Repos analizados:**
- `luis-vermur/kyc_vermur` — KYC + Control de Contratos/Pagarés (Python/FastAPI + JSON)
- `luis-vermur/vermur-cotizaciones` — Sistema de cotizaciones (Laravel + Filament + Livewire + MySQL)

**Fecha:** 22 jun 2026 · **Autor:** PM técnico (DigSol)
**Propósito:** Brief único de integración a VermurOps (React + Firestore). Sirve como handoff para Claude Code.

---

## 0. TL;DR — qué nos da cada repo

| Repo | Lo valioso | Acción en VermurOps |
|---|---|---|
| **kyc_vermur** | Modelo de cliente con crédito + tracking contrato/pagaré + checklist docs; validadores RFC/CLABE; 70 clientes reales | Modelar entidad `Cliente` + portar validadores |
| **vermur-cotizaciones** | **Fórmula profit→margen→precio**; esquema completo Solicitud→Cotización→Líneas; modelo de tarifas; flujo de estados | **Adoptar el modelo de datos y la calculadora tal cual** |

> El `vermur-cotizaciones` es el más alineado con lo que estás construyendo. Su esquema es prácticamente el target de tu rediseño de Pricing. **No copiar su UI** (Filament/Laravel), sí adoptar su **modelo de datos y lógica de cálculo**.

---

## 1. ⭐ FÓRMULA PROFIT → MARGEN → PRECIO (cierra el pendiente)

Extraída textual de `app/Services/CotizacionCalculator.php`. **Profit es input; margen es resultado.**

### Por línea (concepto)
```
venta  = costo + profit
margen = profit / venta          (margen sobre VENTA, no markup sobre costo)
```

### Totales de la cotización
```
costo_total   = Σ costo de líneas
profit_total  = Σ profit de líneas
venta_total   = costo_total + profit_total
margen_real   = profit_total / venta_total

financiamiento_pct   = dias_credito / 2000      # 0.05% por día
financiamiento_monto = venta_total * financiamiento_pct
   # 30d→1.5%  45d→2.25%  60d→3%  90d→4.5%  120d→6%

comision_pct   = 0.10                            # 10% fijo
comision_monto = profit_total * comision_pct

profit_real_monto = profit_total - comision_monto - financiamiento_monto
profit_real_pct   = profit_real_monto / venta_total

ganancia_real = profit_real_monto - costo_ope    # costo_ope default = $1,500
```

### Profit faltante para un margen deseado
```
venta_objetivo = costo_total / (1 - margen_deseado)
profit_faltante = venta_objetivo - venta_total
```

### Folios
```
Solicitud:  VRM-{numero:0000}{AÑO}      ej. VRM-00422026
Cotización: COTI-{solicitud_id}-V{version}   ej. COTI-87-V2
```

> ⚠️ **A validar con Vermur (son parámetros de negocio, no técnicos):**
> - ¿Financiamiento sigue siendo 0.05%/día? ¿Comisión 10% fija? ¿Costo de operación $1,500?
> - Confirmar que el margen es **sobre venta** (no sobre costo). Cambia bastante el número.

---

## 2. ESQUEMA DE DATOS (target para Firestore)

Mapeo directo del esquema MySQL de Luis a colecciones/documentos de Firestore.

### `solicitudes` (la petición de cotización — tu "Prospecto/Solicitud")
Campos clave:
- **Cliente:** `cliente_id`, `cliente_nombre`, `dias_credito`
- **Usuarios:** `creado_por`, `asignado_a`
- **Operación:** `tipo_operacion`, `tipo_transporte`, `tipo_mercancia`, `incoterm`, `pol_aol` (origen), `pod_asd` (destino)
- **Servicios adicionales (bool):** `recoleccion` (+`dir_recoleccion`), `entrega` (+`dir_entrega`), `seguro_mercancia`, `financiamiento` (+`dias_financiamiento`), `requiere_despacho`, `target`, `embalaje`
- **Comerciales:** `volumen_operacion`, `valor_factura`, `margen_profit`
- **Embarque:** `tipo_embarque` (`FCL`|`LCL`|`ninguno`)
  - **FCL:** `fcl_contenedor`, `fcl_peso`(+unidad), `fcl_reqs`, flags `food_grade`/`reforzado`/`sobredimension`/`enlonado`/`atmos_controlada`
  - **LCL:** `lcl_num_pallets`, `lcl_estibable`, `lcl_cubicaje_total`
  - **Terrestre:** `ter_tipo` (FTL|LTL), `ter_unidad`, `ter_mercancia`, `ter_num_pallets`, `ter_peso`(+unidad), `ter_medidas`, `ter_volumen`, `ter_estibable`
- **Meta:** `nota_interna`, `estado`

> Confirma tu observación previa: los **campos condicionales por contenedor** (FCL/LCL/terrestre) son justo los que ya querías en "Embarques con campos condicionales".

### `cotizaciones` (cabecera + totales calculados)
- `solicitud_id`, `creado_por`, `folio_coti`, `tipo_plantilla` (`MXN`|`USD`|`LCL`|`terrestre`), `version`
- `tc` (tipo de cambio), `margen_deseado`, `costo_ope` (default 1500)
- **Totales (todos calculados por la fórmula §1):** `costo_total`, `profit_total`, `venta_total`, `margen_real`, `comision_pct/monto`, `financiamiento_pct/monto`, `profit_real_pct/monto`, `ganancia_real`
- `notas`, `validez`

### `lineas_cotizacion` (⭐ tus CONCEPTOS)
- `cotizacion_id`, `proveedor_id`, `proveedor_nombre` (snapshot)
- `concepto`, `costo`, `profit` (input), `venta` (calc), `margen` (calc), `target`, `orden`

> Esto **es** tu jerarquía nueva: cada línea = un concepto cotizado a un proveedor, con profit como input. En Firestore: subcolección `lineas` dentro de cada doc `cotizacion`.

### `tarifas_solicitud` (⭐ tu Bandeja Pricing)
- `solicitud_id` (único), `datos_json` (blob con `{ tarifas: [...], ... }`), `actualizado_por`
- Un registro por solicitud; varias personas de Pricing lo consultan/editan. En Firestore: un doc `tarifas/{solicitudId}` con un campo `tarifas` (array de mapas).

### `proveedores`
- `nombre`, `terminos_pago` (default 30), `correo`, `activo`

### `pallets` (detalle físico LCL)
- `solicitud_id`, `numero`, `largo_cm`, `ancho_cm`, `alto_cm`, `peso`(+unidad), `cubicaje_m3`

### `cotizacion_lcl_detalle` (desglose tarifa LCL)
- `pol`, `pod`, `incoterm`, `piezas`, `peso_tons`, `medidas_cbm`, y cargos: `pickup`, `despacho_mxn`, `maniobras_mxn`, `desconsolidacion`, `transfer_fee`, `revalidacion`, `transmision`, `admon_fee`, `recargo_imo`, `total_local`, `iva`, `total_iva`

### `clientes` (del repo cotizaciones — versión lean)
- `nombre` (único), `dias_credito`

> ⚠️ Aquí hay **dos modelos de cliente distintos** entre los repos:
> - `vermur-cotizaciones` → cliente lean (solo nombre + días crédito).
> - `kyc_vermur` → cliente RICO (crédito, divisa, Atradius, contrato, pagaré, docsAlta).
> **Decisión a tomar:** unificar en UNA entidad `Cliente` en VermurOps que tome lo rico del KYC y se referencie desde la solicitud. (Ver §4.)

---

## 3. FLUJO DE ESTADOS (de `Solicitud::TRANSICIONES`)

```
nueva        → en_revision | rechazada
en_revision  → cotizada    | rechazada
cotizada     → enviada     | rechazada | en_revision
enviada      → cotizada
rechazada    → (terminal)
```

Etiquetas: Nueva · En revisión · Cotizada · Enviada · Rechazada.
Adoptar esta máquina de estados tal cual en VermurOps (con guard `puedeTransicionarA`).

---

## 4. PLAN DE INTEGRACIÓN A VERMUROPS

**Entidad `Cliente` unificada** (rico, del KYC) + **modelo Solicitud/Cotización/Líneas/Tarifas** (del cotizaciones). Orden sugerido:

1. **Calculadora de cotización** — portar `CotizacionCalculator` a JS/TS (función pura). Es la pieza central y la más reutilizable. *(Validar parámetros de negocio antes — §1.)*
2. **Líneas de cotización (conceptos)** — alinear tu módulo de Pricing al modelo `lineas_cotizacion` (concepto + profit input + venta/margen calculados).
3. **Bandeja Pricing (tarifas)** — modelar `tarifas/{solicitudId}` como doc con array de tarifas, consultable por Pricing.
4. **Campos condicionales de embarque** — adoptar el set FCL/LCL/terrestre de `solicitudes`.
5. **Máquina de estados** — implementar transiciones del §3.
6. **Entidad Cliente + crédito/contrato/pagaré** — del KYC (§2 del brief anterior).
7. **Validadores RFC/CLABE** — portar `validaciones.py` a Cloud Function/JS.
8. **Migración de datos** — 70 clientes del seed KYC + clientes/proveedores del cotizaciones.

---

## 5. SEGURIDAD / DATOS SENSIBLES

- El repo `vermur-cotizaciones` incluye **`backup_20260428.sql`** — un dump de BD que probablemente trae **datos reales de clientes** (nombres, RFC, montos). Tratar como confidencial. NO subir a ningún lado público; usar solo como referencia de esquema/data de migración en entorno controlado.
- Ambos repos traen `.env.example` con referencias a credenciales (Banxico token, SMTP, DB). Si Luis comparte `.env` reales, que sea por canal seguro — nunca por chat ni commit.
- No replicar esquemas de auth de Luis; VermurOps ya usa Firebase Auth con roles (ventas/pricing/admin).

---

## 6. PENDIENTES PARA CERRAR CONTIGO

- [ ] Validar parámetros de la fórmula (financiamiento 0.05%/día, comisión 10%, costo_ope $1,500, margen sobre venta).
- [ ] Decidir modelo de Cliente unificado (rico KYC) vs lean.
- [ ] ¿Adoptamos `tipo_plantilla` (MXN/USD/LCL/terrestre) como en Luis, o lo manejamos distinto?
- [ ] ¿El control de contratos/pagarés entra al alcance de VermurOps o se queda aparte?
- [ ] Orden de implementación con Claude Code (sugerido en §4).
