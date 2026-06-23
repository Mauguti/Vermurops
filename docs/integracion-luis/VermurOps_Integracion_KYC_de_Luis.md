# VermurOps · Integración del sistema KYC de Luis — Análisis de campos

**Repo:** `luis-vermur/kyc_vermur` (privado)
**Fecha de análisis:** 22 jun 2026
**Autor:** PM técnico (DigSol)

---

## 1. Qué es realmente este sistema (corrige el contexto previo)

No es el "sistema de contratos/expedientes en SQL Azure" que teníamos documentado. Es una app independiente:

| | Lo que creíamos | Lo que es |
|---|---|---|
| **Stack** | SQL Azure + algo | **Python / FastAPI** + frontend JS vanilla |
| **Persistencia** | Base SQL Azure | **Archivo JSON** (`clientes.json`), sin base SQL |
| **Despliegue** | — | Render.com (free tier, disco persistente en `/var/data`) |
| **IA** | — | Gemini (default, gratis) o Claude, vía variable `PROVEEDOR_IA` |

> **Implicación:** no hay esquema SQL que "copiar". El modelo de datos vive en el JSON y en el código. La integración a VermurOps es **a nivel de campos y lógica**, no de base de datos.

El sistema tiene **dos módulos**:

1. **Alta KYC** — verificación de documentos con IA + validaciones determinísticas (RFC, CLABE, antigüedad, vigencia) → semáforo Aprobar / Revisar / Rechazar.
2. **Control de Contratos y Pagarés** — dashboard de seguimiento con **70 clientes reales ya migrados**.

---

## 2. Modelo de datos del CLIENTE / EXPEDIENTE

Este es el modelo completo (extraído de `seed_clientes.json`, 70 registros, y `contratos_store.py`). Es un objeto **plano con 3 sub-objetos**.

### Campos de primer nivel

| Campo | Tipo | Valores / Notas |
|---|---|---|
| `id` | string | Generado en servidor (`c` + uuid corto) |
| `nombre` | string | Razón social del cliente |
| `comercial` | string | Nombre comercial / contacto |
| `representante` | string | Representante legal |
| `rfc` | string | Validado con algoritmo SAT |
| `domicilio` | string | |
| `telefono` | string | |
| `correo` | string | |
| `tipoCredito` | string | Hoy solo `"credito"` |
| `monto` | number | Monto de la línea |
| `divisa` | string | `MXN` \| `USD` |
| `dias` | string | Plazo: `15` `20` `30` `45` `60` `90` |
| `interesMoratorio` | number | Default `3` (%) |
| `statusOperativo` | string | `ACTIVO` \| `INACTIVO` |
| `atradius` | string | Seguro de crédito: `✔` `X` `NA` `SOLICITADO` `RECHAZADO` `RETIRADO` \| vacío |
| `montoAprobado` | string | Monto aprobado por Atradius |
| `expedienteDrive` | bool | ¿Tiene carpeta en Drive? |
| `comentarios` | string | |
| `fechaAlta` | string | `YYYY-MM-DD` |

### Sub-objeto `docsAlta` (checklist de documentos)

`acta` · `poder` · `identificacion` · `csf` · `comprobante` · `bancaria` → todos `bool`

### Sub-objeto `contrato`

| Campo | Tipo |
|---|---|
| `enviado` | bool |
| `firmadoCorreo` | bool |
| `fisicoArchivado` | bool |
| `fechaEnvio` | string |

### Sub-objeto `pagare`

| Campo | Tipo |
|---|---|
| `aplica` | bool |
| `enviado` | bool |
| `firmado` | bool |
| `fisico` | bool |
| `monto` | number |
| `vencimiento` | string |

---

## 3. Gap analysis vs VermurOps (Firestore)

VermurOps hoy gira alrededor de **Cotizaciones / Prospectos** (proceso comercial: Ventas → Pricing). **No tiene** la capa de **alta/onboarding de cliente, condiciones de crédito, ni control de contratos/pagarés.** Justo eso es lo que aporta el sistema de Luis.

| Concepto | ¿En VermurOps hoy? | Acción |
|---|---|---|
| Datos básicos de cliente (nombre, RFC, domicilio, contacto) | Parcial (en prospecto/cotización) | **Unificar** en una entidad `Cliente` reutilizable |
| Condiciones de crédito (monto, divisa, días, moratorio) | ❌ No | **Integrar** — campo nuevo |
| Atradius (seguro de crédito + monto aprobado) | ❌ No | **Integrar** — relevante para logística internacional |
| Checklist de docs de alta (`docsAlta`) | ❌ No | **Integrar** — encaja con "Manuales y Roles" / expediente |
| Tracking de contrato (enviado/firmado/archivado) | ❌ No | **Integrar** — cierra el ciclo post-cotización |
| Tracking de pagaré | ❌ No | **Integrar** |
| `expedienteDrive` (link a carpeta) | ❌ No | **Integrar** (o migrar a Storage) |
| Validación RFC (algoritmo SAT) | ❌ No | **Portar** validador |
| Validación CLABE (dígito BANXICO + banco) | ❌ No | **Portar** validador |
| Extracción de docs con IA (KYC) | ❌ No | **Fase 2** — evaluar si replicar |

---

## 4. Recomendación de integración (orden sugerido)

**No migrar la app de Luis.** Stack incompatible (Python/JSON vs React/Firestore) y UI que de todos modos hay que rehacer. En vez de eso:

1. **Modelar la entidad `Cliente` en Firestore** tomando el esquema de arriba como base (los 3 sub-objetos `docsAlta` / `contrato` / `pagare` se mapean limpio a mapas anidados de Firestore). Esto te da la capa de onboarding + crédito que hoy te falta.

2. **Migrar los 70 clientes reales.** El `seed_clientes.json` es data de producción ya curada — vale oro como punto de partida. Se puede transformar a documentos de Firestore con un script de una sola pasada.

3. **Portar los validadores `validaciones.py`** (RFC + CLABE) a una Cloud Function o a JS en el front. Es lógica pura, sin dependencias externas, 100% reutilizable. La tabla de bancos por código CLABE viene completa.

4. **Conectar `Cliente` ↔ `Cotización`.** Hoy VermurOps arranca en la cotización; con esto cierras el flujo: prospecto → cotización → **alta de cliente con crédito** → **contrato/pagaré** → seguimiento.

5. **KYC con IA (Alta KYC) = Fase 2.** Es el módulo más complejo (Gemini/Claude visión + Tesseract OCR). Evaluar después si Vermur lo quiere dentro de VermurOps o si se queda como herramienta aparte de Luis.

---

## 5. Notas de seguridad / pendientes

- El repo **no trae** `.env` (bien — está en `.gitignore`), pero el `.env.example` confirma que el sistema maneja **API keys de Gemini/Anthropic y credenciales SMTP**. Si en algún momento Luis comparte el `.env` real, que sea por canal seguro, **nunca por aquí ni por el repo**.
- La auth del sistema de Luis es **HTTP Basic** con un solo usuario/contraseña (`KYC_USER`/`KYC_PASSWORD`). Para VermurOps ya tienes algo mejor (Firebase Auth con roles) — no replicar la Basic Auth.
- El seed tiene 70 clientes con datos reales (RFC, montos, condiciones). Tratarlo como **dato sensible de cliente** al migrar.

---

## 6. Pendientes para cerrar contigo

- [ ] ¿Confirmamos que Vermur quiere el **control de contratos/pagarés dentro de VermurOps**, o se queda en la herramienta de Luis?
- [ ] ¿La entidad `Cliente` es independiente o se cuelga del prospecto/cotización existente?
- [ ] ¿Migramos los 70 clientes ya, o primero modelamos y validamos con 2-3 de prueba?
- [ ] Definir si el módulo **Alta KYC (IA)** entra al alcance (impacta tiempo y costo del deal).
