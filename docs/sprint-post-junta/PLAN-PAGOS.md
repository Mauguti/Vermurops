# PLAN-PAGOS — pagos, cobros, flujo de efectivo y prefactura

**Tarea 62 · 5-oct-2026 · plan, sin código.**
Fuente: sesión de Administración con Julio y Gaby (2-oct-2026) y
`sprint/levantamientos/LEVANTAMIENTO-ADMINISTRACION.md`.
Se construye martes y miércoles sobre lo que apruebe Mau.

Lo que sigue está escrito contra el código que hay hoy en
`sprint/61-vistas-finanzas`, con archivo y línea. Donde el código contradice
lo que se asumió en la junta, lo digo en vez de acomodarlo.

---

## 0 · Paso 0: cómo está hoy

### 0.1 El lado del cliente tiene DOS formas incompatibles y ninguna sirve

| Qué | Dónde | Forma |
|---|---|---|
| Cobro contra factura | `CobroCliente`, `FacturasData.ts:96` | `facturaId: string` + `embarqueId: string`, los dos **obligatorios** |
| Depósito sin factura | `DepositoCliente`, `OrdenesCompraData.ts:261` | `embarqueId: string` obligatorio, **sin** `facturaId` |

De ahí tres consecuencias que se ven en pantalla:

1. **«Un cliente paga doce facturas con una transferencia» no se puede
   registrar.** Un `CobroCliente` apunta a UNA factura. Doce facturas son doce
   documentos en `cobros`, cada uno con la misma referencia copiada a mano, y
   ninguno sabe de los otros. No hay entidad «pago».
2. **Dinero sin factura solo existe si cuelga de un embarque.** `DepositoCliente`
   exige `embarqueId`. Un anticipo a cuenta del cliente, sin operación todavía,
   no tiene dónde vivir.
3. **Un cobro no puede cruzar embarques.** `CobroCliente.embarqueId` es
   obligatorio y `calcularFondeo` lo usa para liberar los pagos de ESE embarque
   (`fondeoCliente.ts:99`). Una transferencia que cubre facturas de dos
   embarques no tiene un `embarqueId` que sea cierto.

### 0.2 El lado del proveedor no tiene entidad de pago, tiene un string copiado

`Finance.tsx:137` — `registrarPagoDelGrupo(ocIds, referencia)`:

```ts
for (const id of ocIds) {
  await updateOrden(id, { comprobantePago: referencia });
  await transicionarEstado({ ...orden, comprobantePago: referencia }, 'pagada', …);
}
```

Un pago a proveedor es hoy **N escrituras independientes con la misma cadena
copiada** en `OrdenCompra.comprobantePago` (`OrdenesCompraData.ts:219`). Eso
produce exactamente lo que el levantamiento pide y no hay:

- **Pago parcial: imposible.** La orden solo salta a `pagada`, entera
  (`stateMachineOC.ts:116`). No existe «se le abonaron 20,000 de 50,000».
- **Reversa de un pago: no existe.** `pagada` es terminal
  (`stateMachineOC.ts:136`). Deshacer un pago mal aplicado es tocar N órdenes
  a mano y no queda registro de que se deshizo. El levantamiento §2.4 lo pide
  textualmente: «el sistema actual permite pago parcial y revertir un pago
  aplicado; ambas capacidades deben conservarse».
- **El pago no es un objeto que se pueda abrir.** `transferenciasDelDia`
  (`programacionPagos.ts:92`) agrupa por proveedor + fecha + moneda para
  PINTAR la tarjeta; el grupo se recalcula en cada render y no se guarda. Al
  día siguiente no hay forma de preguntar «qué cubrió la transferencia del
  martes».
- Si el loop falla a la mitad, unas órdenes quedan pagadas y otras no
  (`fallidas` solo se muestra en un toast).

### 0.3 El cobro está en la cuenta por pagar (bloque 1, confirmado)

`FichaOC.tsx:383-432` tiene el formulario **«Registrar depósito del cliente»**
dentro de la ficha de la orden de compra, y es la única pantalla que llama a
`registrarDeposito` (`useDepositosCliente.ts`). Gaby tiene razón: quien recibe
el dinero del cliente es Administración y lo hace desde cobranza, no desde la
orden de pago a un proveedor.

Dos detalles del formulario que confirman el diagnóstico:

- **La referencia es obligatoria** para guardar:
  `disabled={… || !depRef.trim()}` (`FichaOC.tsx:410`). Gaby: «la referencia
  bancaria aparece después del pago, no antes». Hoy no se puede capturar la
  entrada de dinero sin inventar una referencia.
- La moneda **no se elige**: se hereda de la orden (`moneda: oc.moneda`,
  `FichaOC.tsx:414`). Un depósito en pesos contra una orden en dólares se
  guarda como dólares.

Y el mismo `PanelPagos` exige referencia antes de marcar pagado
(`PanelPagos.tsx:195`), con el mismo problema del lado del proveedor.

### 0.4 Lo que sí está bien y hay que conservar

| Qué | Dónde | Por qué se reutiliza |
|---|---|---|
| `saldoDeFactura` deriva el saldo de los cobros vivos, por moneda | `facturacionEmbarque.ts:257` | Es el patrón correcto y ya tiene la tolerancia de un peso por redondeos de IVA |
| `cartera` / `resumenCartera` / `resumenDeCliente` | `cuentasPorCobrar.ts` | Toda la cartera ya se deriva; solo cambia de dónde salen las aplicaciones |
| `montoCobrable` rechaza el cobro en otra moneda | `cuentasPorCobrar.ts:191` | Es la regla de moneda del punto 4, ya escrita |
| `anticipos.ts` — disponible DERIVADO de las aplicaciones vivas | `anticipos.ts:30` | **Es el modelo de aplicaciones que falta, ya resuelto para el caso del anticipo.** El plan lo generaliza, no lo reinventa |
| `facturasPorProveedor` — un renglón por factura (tarea 58) | `facturasProveedor.ts:130` | La unidad de lo que se debe ya es la factura |
| `agruparParaPago` por proveedor + fecha + moneda | `calendarioPagos.ts:236` | La propuesta de agrupación de la que nace un pago |
| `BANCOS_VERMUR`, las siete cuentas con su uso (tarea 57) | `cuentasPago.ts:59` | Son las siete columnas del flujo de efectivo |
| `programarPago` con días hábiles y festivos | `calendarioPagos.ts:148` | La fecha esperada de salida del flujo de efectivo |

---

## 1 · El modelo

### 1.1 Una entidad nueva: el pago, con sus aplicaciones

El principio es el de `anticipos.ts`, subido un nivel: **el dinero que se
movió es un hecho; a qué se aplicó es una decisión reversible.** Por eso son
dos cosas en un documento y lo aplicado se DERIVA, nunca se guarda como saldo
que alguien tenga que recordar actualizar.

**Colección nueva: `pagos/{id}`.** Un documento por movimiento real de dinero:
una transferencia que salió, una entrada que llegó.

```ts
// src/lib/pagos.ts  (modelo + reglas; sin React ni Firestore)

export type LadoPago = 'cliente' | 'proveedor';

/** A qué se aplicó una parte de un pago. */
export interface AplicacionPago {
  /** Qué se está liquidando. */
  destinoTipo: 'factura' | 'orden';
  /** FK → facturas/{id} (cliente) u ordenesCompra/{id} (proveedor). */
  destinoId: string;
  /** Folio legible, congelado: «F-2026-0145», «OC-2026-0088». */
  destinoNumero: string;
  /** Lo que se aplica a ESTE destino. Puede ser parcial. */
  monto: number;
  /** Igual a pago.moneda. Se repite para que la línea se lea sola. */
  moneda: Moneda;
  /** Quién y cuándo la aplicó. Una aplicación se quita, no se edita. */
  aplicadaPor: { uid: string; nombre: string; fecha: string };
}

export interface Pago {
  id: string;
  /** «PAG-2026-0001». Folio atómico con folioService, como la OC. */
  folio: string;

  lado: LadoPago;

  // ── El tercero. Uno solo por pago: un pago no cubre a dos proveedores ─────
  terceroTipo: 'cliente' | 'proveedor';
  /** FK → clientes/ o proveedores/. */
  terceroId: string | null;
  terceroNombre: string;

  // ── El movimiento ─────────────────────────────────────────────────────────
  monto: number;
  moneda: Moneda;
  /** YYYY-MM-DD. La fecha en que el dinero se movió, no la de captura. */
  fecha: string;
  /** Cuenta de Vermur: BancoVermur de cuentasPago.ts. */
  banco: string | null;
  /** Puede llegar DESPUÉS del pago (bloque 1). Nunca obligatoria. */
  referencia: string | null;
  /** Comprobante en Storage: pagos/{id}/. */
  comprobante: ArchivoPago | null;

  // ── Las aplicaciones ──────────────────────────────────────────────────────
  aplicaciones: AplicacionPago[];
  /**
   * Índice denormalizado = aplicaciones.map(a => a.destinoId).
   * Existe solo para poder consultar «pagos que tocan esta factura» sin bajar
   * la colección: Firestore no sabe buscar dentro de un array de objetos.
   * Se escribe en la MISMA transacción que `aplicaciones`.
   */
  destinoIds: string[];

  // ── Contexto heredado, informativo ────────────────────────────────────────
  /** Embarques que tocan sus aplicaciones. DERIVADO al guardar; ver 1.4. */
  embarqueIds: string[];

  // ── De dónde vino, para leer lo viejo sin migrarlo (ver §2) ───────────────
  origen?: 'app' | 'legacy_cobro' | 'legacy_deposito';

  registradoPor: { uid: string; nombre: string };
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}
```

**Lo aplicado y lo disponible se derivan**, como el anticipo:

```ts
aplicado(pago)      = Σ aplicaciones[].monto                  // misma moneda por construcción
sinAplicar(pago)    = pago.monto − aplicado(pago)             // el «a cuenta»
aplicadoA(destinoId, pagos) = Σ de las aplicaciones vivas a ese destino
```

### 1.2 Por qué las aplicaciones van DENTRO del pago y no en su propia colección

- **Atomicidad.** Un pago y su reparto son una sola decisión: si se escriben
  aparte, una escritura a medias deja dinero aplicado a facturas sin pago, o
  un pago que no liquida nada. Es la misma razón por la que la foto y el
  resumen de una versión de cotización van en una transacción (§4.11).
- **El array está acotado.** Gaby dijo «doce facturas con una transferencia».
  Doce objetos de seis campos no es un documento grande. Lo que NO se embebe
  es la lista de pagos dentro de la factura: eso sí crece sin tope y es el
  error que §4.11 evitó con las versiones.
- **La consulta que no se puede hacer** —«dame los pagos de esta factura»— se
  resuelve con `destinoIds` y `array-contains`. Hoy no hace falta: las dos
  pantallas de Finanzas ya bajan `facturas` y `cobros` completas con
  `onSnapshot` (`useFacturas.ts:35`) y derivan en memoria.

### 1.3 Qué se reutiliza y qué se reemplaza

| Lo que existe | Qué pasa |
|---|---|
| `CobroCliente` (`cobros/`) | **Se congela, no se borra.** Deja de escribirse; se sigue leyendo. Un `CobroCliente` ES un pago con una sola aplicación (ver §2.1) |
| `DepositoCliente` (`depositosCliente/`) | **Se congela, no se borra.** Un depósito ES un pago con CERO aplicaciones |
| `registrarCobro` (`useFacturas.ts`) | Pasa a ser una envoltura que crea un `Pago` con una aplicación. La firma pública no cambia, así que `PanelFacturasEmbarque` y la pestaña Facturas del embarque siguen funcionando sin tocarlas |
| `registrarDeposito` (`useDepositosCliente.ts`) | Pasa a crear un `Pago` sin aplicaciones. Su call site se MUEVE de la ficha de la OC a Cuentas por cobrar (bloque 1) |
| `saldoDeFactura` | **Intacta.** Recibe una lista de `{monto, moneda, activo}`; se le pasan las aplicaciones en vez de los cobros |
| `OrdenCompra.comprobantePago: string` | **Se conserva y se sigue leyendo.** Cuando hay pago, la ficha muestra el pago; cuando solo hay la cadena vieja, muestra la cadena. Mismo patrón que `facturaAsociada` frente a `facturaDatos` |
| `anticiposCruzados` / `montoDisponible` | **Intactos.** Son un caso aparte: dinero que ya salió de Vermur y se descuenta de otra orden. Un anticipo no es un pago aplicado a dos facturas, es un pago aplicado a una orden cuyo saldo luego se cruza. Reescribirlo con `AplicacionPago` rompería `anticipos.ts` y sus 20 tests sin que nadie lo haya pedido |
| `estado` de la OC | **Se deriva del pago cuando hay pago**: `pagada` cuando lo aplicado cubre el monto; parcial cuando hay algo aplicado y falta (ver 1.5) |

### 1.4 Los campos nuevos en lo que ya existe (modelo que hay que aprobar)

Todos opcionales y aditivos. Nada se migra.

```ts
// OrdenCompra
esPrefactura?: boolean;            // bloque 4. Ausente = no es prefactura
motivoPrefactura?: string | null;  // «la naviera cobra antes de facturar»

// FacturaCliente
// (nada nuevo: su saldo ya se deriva)
```

Y un índice denormalizado, con la misma justificación que ya está escrita en
`useFacturas.ts:139` para `estado` («los paneles filtran por él y filtrar en
Firestore exige el campo… si los dos discrepan, gana el cálculo»):

```ts
// FacturaCliente
aplicado?: number;   // Σ aplicado vivo. ÍNDICE, no verdad. Gana saldoDeFactura
// OrdenCompra
pagado?: number;     // idem
```

> **Lo que `embarqueIds` resuelve.** `CobroCliente.embarqueId` es un solo
> string obligatorio, y de ahí sale el fondeo. En el pago, los embarques se
> DERIVAN de las facturas que se aplicaron, así que una transferencia que cubre
> dos embarques fondea los dos, cada uno por lo que le toca. Es la primera vez
> que ese caso se puede representar.

### 1.5 Estados, derivados

```
Factura (ya existe):  emitida → cobrada_parcial → cobrada        (saldoDeFactura)
Orden de compra:      … → autorizada → pagada                    (hoy, entera)
Orden, con pagos:     autorizada → pagada_parcial → pagada
```

`pagada_parcial` es un estado NUEVO de la máquina de la OC, y es el punto más
delicado del plan: `stateMachineOC.ts` tiene 54 tests y `pagada` es terminal.
Propuesta, por eso, en dos movimientos:

1. **El estado no se agrega todavía.** `pagada` sigue exigiendo que lo aplicado
   cubra el monto (la validación pasa de «¿hay comprobantePago?» a «¿lo
   aplicado cubre el saldo, o hay comprobante viejo?»), y lo parcial se ve como
   un **avance** en la orden («pagado MXN 20,000 de 50,000»), no como un
   estado. Cero cambios en la máquina, cero riesgo en lo publicado.
2. El estado entra después, si Julio lo pide para filtrar. Anotado como
   pregunta.

**Reversa de un pago.** Un pago no se borra: se **anula** (`activo: false`),
y lo aplicado desaparece solo porque se deriva de las aplicaciones vivas —
exactamente lo que ya hace `disponibleDeAnticipo` (`anticipos.ts:30`). Quitar
UNA aplicación sin anular el pago también se puede: el dinero vuelve a estar
«sin aplicar». Eso cierra el punto de dolor «corregir un pago mal aplicado es
engorroso: hay que eliminar, anular y volver a subir».

Si la OC estaba `pagada` y su pago se anula, **la orden NO regresa sola a
`autorizada`**: la máquina no tiene esa transición y agregarla en silencio
movería órdenes sin que nadie lo decida. Se marca con un aviso en la bandeja
—«marcada pagada y sin pago vivo»— y lo resuelve una persona. Un aviso visible
es mejor que una transición automática que nadie pidió.

---

## 2 · Los datos que ya existen, leídos sin migrar

**No puedo contar los documentos de producción**: el sprint no toca datos de
producción (límite 2 del contrato). Lo que sé es que las cuatro colecciones
existen con su regla publicada: `facturas`, `cobros` (`firestore.rules:216` y
`:223`), `depositosCliente` (`:204`) y `ordenesCompra` (`:192`). Los conteos
los da el script del §2.3, que escribo y corre Mau.

### 2.1 La lectura unificada: una sola función, dos fuentes

```ts
// src/lib/pagos.ts
/** Un cobro viejo leído como pago: un pago con una sola aplicación. */
export function pagoDesdeCobro(c: CobroCliente): Pago
/** Un depósito viejo leído como pago: un pago sin aplicaciones. */
export function pagoDesdeDeposito(d: DepositoCliente): Pago
/** Todos los pagos del lado cliente, nuevos y viejos, en una lista. */
export function pagosDeCliente(
  pagos: Pago[], cobros: CobroCliente[], depositos: DepositoCliente[],
): Pago[]
```

**No hay riesgo de doble conteo, y es por construcción:** un movimiento de
dinero vive en `pagos` **o** en `cobros`/`depositosCliente`, nunca en los dos.
Lo nuevo solo se escribe en `pagos`; lo viejo solo se lee. Esa es toda la
regla, y es la razón para no migrar: una migración sí introduciría el riesgo.

Los adaptadores rellenan lo que al dato viejo le falta:

| Campo del pago | De un `CobroCliente` | De un `DepositoCliente` |
|---|---|---|
| `folio` | `COB-…` (su propio id) | `DEP-…` |
| `terceroId` / `terceroNombre` | `clienteId` / `clienteNombre` | igual |
| `banco` | `banco` (string libre; se resuelve con `resolverBancoVermur`) | **no existe** → `null` |
| `referencia` | `referencia` | `referencia` |
| `aplicaciones` | una, a `facturaId` por el monto completo | **ninguna** |
| `embarqueIds` | `[embarqueId]` | `[embarqueId]` |
| `origen` | `'legacy_cobro'` | `'legacy_deposito'` |

`DepositoCliente` no tiene banco: en el flujo de efectivo, los depósitos
viejos entran a una columna **«sin cuenta identificada»** en vez de repartirse
por azar. Un depósito en la cuenta equivocada descuadra la conciliación de
Julio, que es justo lo que la pantalla viene a arreglar.

### 2.2 Los call sites que hay que rehacer (la lista completa)

Esto es el inventario, no una estimación. Todo lo que hoy lee `cobros` tiene
que pasar a leer la lista unificada:

| Archivo | Línea | Qué hace |
|---|---|---|
| `hooks/useFacturas.ts` | 46 | El listener de `cobros`. Suma el de `pagos` |
| `lib/facturacionEmbarque.ts` | 257 | `saldoDeFactura` — **no cambia**, cambia quien la llama |
| `lib/cuentasPorCobrar.ts` | 63, 115, 184 | `evaluarFactura`, `resumenCartera`, `resumenDeCliente` |
| `lib/fondeoCliente.ts` | 108 | `calcularFondeo` recibe cobros; pasa a recibir pagos |
| `lib/cierresEmbarque.ts` | 114 | El cierre de pago mira el saldo de cada factura |
| `components/Finance.tsx` | 71, 74, 116, 219, 324 | Cartera, fondeo de la OC abierta, panel por cobrar |
| `components/facturas/PanelCuentasPorCobrar.tsx` | 83, 84 | Cartera y resumen |
| `components/facturas/PanelFacturasEmbarque.tsx` | 258 | Los cobros de cada factura del embarque |
| `components/shipments/FichaEmbarque.tsx` | 127, 146, 1554 | Pestaña Facturas del embarque |
| `components/clientes/FichaCliente.tsx` | 122 | El resumen de cartera en Crédito |

Son diez. **Por eso el primer paso publicable (P1) es solo la lectura
unificada, sin un cambio de pantalla**: si algo se rompe, se rompe con el
comportamiento idéntico al de hoy y se ve en el recorrido e2e, no mezclado con
una pantalla nueva.

### 2.3 Script de auditoría (se escribe, lo corre Mau)

`scripts/auditarPagos.ts`, **solo lectura**, sin llave en el repo:

- cuántos `cobros`, `depositosCliente` y `facturas` hay, y de qué fechas;
- facturas con cobros en otra moneda (el `avisoMoneda` de
  `saldoDeFactura:292` ya detecta el caso: cuántas hay de verdad);
- facturas **sobrecobradas** (saldo negativo), que con N cobros sueltos nadie
  ha podido ver;
- cobros cuyo `facturaId` no existe (huérfanos);
- depósitos cuyo `embarqueId` no existe;
- órdenes `pagada` **sin** `comprobantePago` (la validación es de hoy; las
  anteriores pudieron pasar sin él);
- el mismo `comprobantePago` repetido en N órdenes: esos son los pagos
  consolidados reales, y el conteo dice cuánto gana el modelo nuevo.

**Ninguna migración.** Si el script encuentra algo que el modelo nuevo no lee
bien, se arregla el lector, no el dato.

---

## 3 · Saldos de las cuentas: de dónde sale el dinero que hay

La pregunta de Gaby es «¿tengo dinero para pagarlo?». Hay tres maneras de
contestarla y solo una es honesta hoy.

| Opción | Qué cuesta | Qué falla |
|---|---|---|
| **A · Captura manual diaria** del saldo de cada cuenta | Siete números al día | Depende de que alguien los capture; a las 11 de la mañana ya es viejo |
| **B · Saldo inicial + movimientos registrados** | Nada que capturar | **Miente en silencio.** Solo conoce lo que pasó por la plataforma: comisiones, domiciliados (BBVA los tiene por definición, `cuentasPago.ts:76`), traspasos entre cuentas y pagos hechos a mano por fuera no existen. El número se ve exacto y está mal |
| **C · Estado de cuenta del banco** | Integración o importación por banco; siete bancos | No existe hoy ni está en la cola |

**Recomendación: A como ancla, B como proyección, y la diferencia a la vista.**

```
saldoProyectado(cuenta, hoy) = saldoDeclarado.monto
                             + Σ entradas registradas después de su fecha
                             − Σ salidas registradas después de su fecha
```

Y cuando Julio captura el saldo real de hoy, la pantalla enseña las dos cosas
juntas:

```
BBVA   declarado ayer 1,240,000 + entradas 310,000 − salidas 95,000
       esperado hoy   1,455,000
       real hoy       1,402,310      ⚠ diferencia −52,690
```

**Esa diferencia ES la auditoría que pide la tarea.** No es un error del
sistema: es la medida de lo que se movió y no se registró. Es el mismo
principio que `costoCapturado` (§4.9): un cero declarado no es un campo vacío,
y un saldo declarado no es un saldo inventado. La plataforma nunca afirma un
saldo bancario; afirma lo que registró y lo compara contra lo que Julio vio.

**Colección nueva: `saldosCuenta/{YYYY-MM-DD}_{banco}`.**

```ts
export interface SaldoCuenta {
  id: string;             // «2026-10-05_bbva»
  banco: BancoVermur;     // una de las siete de cuentasPago.ts
  fecha: string;          // YYYY-MM-DD
  moneda: Moneda;         // la de la cuenta (monex_usd y partnerpay son USD)
  monto: number;
  /** Cómo se supo: lo tecleó alguien o salió de un estado de cuenta. */
  fuente: 'capturado' | 'estado_cuenta';
  declaradoPor: { uid: string; nombre: string };
  nota?: string | null;
  createdAt: string;
}
```

**Append-only**, como `tiposCambio`: un saldo declarado es evidencia de lo que
se vio ese día. Se corrige declarando otro, no pisando el anterior. Un día sin
captura no se interpola: la pantalla dice «declarado el 3-oct, hace 2 días».

> Las siete cuentas son las de `BANCOS_VERMUR` (`cuentasPago.ts:59`). Cinco en
> MXN, dos en USD. **Nunca se suman en un total** (§4.3): el encabezado lleva
> un total MXN y un total USD, y nada más.

### 3.1 Qué entra y qué sale esta semana

Todo derivado, nada guardado (`lib/flujoEfectivo.ts`):

**Entra** — facturas de la cartera (`cuentasPorCobrar.cartera`) con vencimiento
dentro de la ventana y saldo > 0, por cuenta esperada (BBVA, que es la de
entrada, `BANCO_COBRO_DEFAULT`) y por moneda.

**Sale** — órdenes autorizadas con fecha de pago en la ventana, lo que de
verdad se transfiere (`montoATransferir`, descontando anticipos), al banco de
`sugerirBancoVermur` cuando la orden no trae `bancoSalida`. Las marcadas «No
pagar» van aparte, en su propio renglón: están detenidas a propósito y meterlas
en el total diría que ese dinero se va esta semana.

**Lo que NO se proyecta:** nada que la plataforma no sepa. Nómina, renta,
impuestos propios de Vermur, comisiones bancarias. La pantalla lo dice en una
línea —«esto cubre pagos a proveedores y cobros a clientes; no incluye gastos
fijos de la empresa»— porque un flujo de efectivo que parece completo y no lo
es es peor que uno que declara su alcance.

---

## 4 · Moneda

**La regla, igual en los dos lados: un pago solo se aplica a destinos de SU
moneda.** Ya está escrita en dos lugares y los dos dicen lo mismo:
`montoCobrable` (`cuentasPorCobrar.ts:193`) y `aplicarAnticipo`
(`anticipos.ts:99`). La pantalla de «Aplicar pago» **filtra** la lista de
pendientes por moneda: lo que no se puede aplicar no se ofrece.

### Un pago en USD contra una factura en MXN

Pasa de verdad —un cliente en dólares, un cargo nacional en pesos— y hay dos
salidas:

**(a) No se aplica.** El pago entra en la moneda que llegó al banco, y la
factura en pesos se liquida con una entrada en pesos. El cambio de divisa es
una operación del banco, no una aplicación: si Vermur recibió dólares y los
convirtió, en la cuenta en pesos hay un depósito en pesos, y ESE es el que
liquida. Lo que queda sin aplicar se ve como «a cuenta» del cliente.

**(b) Se aplica con el tipo de cambio declarado.** La aplicación guardaría qué
salió del pago y qué entró a la factura:

```ts
// reservado, NO se construye en v1
conversion?: { montoDestino: number; tipoCambio: number; fuente: string };
```

**Recomendación: (a) en la versión 1**, con la forma de (b) reservada en el
tipo para que agregarla sea aditivo. Dos razones: el dinero que de verdad entró
al banco está en una sola moneda, y es lo que Julio concilia; y §4.3 solo
tolera un total convertido cuando la conversión está declarada y a la vista —
dentro de una aplicación, ese tipo de cambio quedaría escondido en un renglón
y es exactamente lo que la regla prohíbe.

**Lo que sí se hace en v1:** cuando un cliente tiene dinero sin aplicar en USD
y facturas abiertas solo en MXN, la pantalla lo DICE («tiene USD 3,000 sin
aplicar y no hay facturas en dólares»), en vez de dejar la lista vacía sin
explicación. Y el aviso de `saldoDeFactura` —«N cobros en otra moneda no
cuentan para el saldo»— se conserva, porque esos cobros ya existen en
producción.

**Lo que NO se toca:** un pago no puede mezclar monedas. Dos monedas son dos
pagos, igual que son dos transferencias (§4.24).

---

## 5 · Prefactura

> «Las navieras cobran antes de facturar. Hoy en Magaya cargan una
> provisional, se paga, y cuando llega la factura real la quitan, cargan la
> buena y reaplican.»

### 5.1 No es un estado nuevo: es una marca, y lo demás se deriva

No existe nada de prefactura en el código hoy (lo busqué: cero coincidencias
en `src/lib` y en `components/ordenesCompra`). Lo que hay es un AVISO: «Sin
factura» en `programacionPagos.ts:70`, que no frena nada.

**Lo único que se guarda** son los dos campos del §1.4: `esPrefactura` y
`motivoPrefactura`. Todo lo demás sale de lo que ya existe:

```ts
// lib/prefactura.ts
tieneFactura(oc)      = identificarFactura(oc).fuente !== 'sin_factura'   // facturasProveedor.ts:97
esPrefactura(oc)      = oc.esPrefactura === true
pendienteDeFactura(oc)= esPrefactura(oc) && oc.estado === 'pagada' && !tieneFactura(oc)
diasSinFactura(oc,hoy)= días desde oc.pagadaPor.fecha
```

| Situación | Qué se ve |
|---|---|
| Marcada prefactura, sin pagar | Badge «Prefactura» en la bandeja y en la ficha |
| Marcada prefactura, pagada, sin factura | **«Factura pendiente · 12 días»**, en el filtro y en el conteo del encabezado |
| Marcada prefactura, pagada, con factura | Badge «Factura recibida», y el cotejo de montos (5.3) |
| Sin marcar, pagada, sin factura | El aviso «Sin factura» de hoy. **No es una prefactura**: es una orden a la que le falta su factura, y eso es otra cosa |

Esa última fila es la razón de que la marca se guarde en vez de derivarse de
«pagada y sin factura»: **declarar que una orden se paga antes de facturar es
una decisión de Operaciones, no una conclusión del sistema.** Sin la marca, el
recordatorio le llegaría a toda orden pagada a la que todavía no le subieron
el PDF, y a los dos días nadie lo lee.

### 5.2 Lo que cambia en la máquina de estados: nada

La transición a `pagada` solo exige comprobante (`stateMachineOC.ts:120`), no
factura. Una prefactura ya se puede programar y pagar hoy. **No hay que abrir
nada**, y eso es bueno: el bloque 4 no toca los 54 tests de la máquina.

Lo que sí se agrega es un freno **de salida**, no de entrada: un embarque con
prefacturas pendientes no debería poder dar su **cierre administrativo**
(`cierresEmbarque.ts`), porque cerrar administrativamente una operación a la
que le falta un comprobante fiscal del proveedor es justo lo que el contador
reclama después. Anotado como pregunta para Julio: ¿freno o aviso?

### 5.3 Cuando llega la factura real y no coincide

El «la quitan, cargan la buena y reaplican» de Magaya existe porque allá la
provisional ES un documento. Aquí la orden es una, la factura real se carga
sobre ella (`CargarFacturaOC.tsx` ya lo hace, tarea 55) y lo que se deriva es
la diferencia:

```
diferencia = factura real − lo pagado        (misma moneda, §4.3)
```

| Caso | Qué se hace | Con qué |
|---|---|---|
| Coincide (± 1) | Badge «Factura recibida y cuadrada» | El cotejo de `facturaDatos.cotejo`, que ya existe |
| La factura es MAYOR | Queda un saldo por pagar: nueva orden por la diferencia, ligada a la primera | Flujo normal de OC |
| La factura es MENOR | Se pagó de más → **el excedente se vuelve un anticipo del proveedor** | `anticipos.ts`, sin tocar nada |

La tercera fila es el hallazgo bueno de este bloque: **un sobrepago ya tiene su
mecanismo.** `AnticipoRef` + `montoDisponible` + `anticiposAplicables`
(`anticipos.ts:52`) hacen exactamente eso —dinero entregado al proveedor que se
descuenta de su próxima factura— con 20 tests encima. Una prefactura pagada de
más no necesita modelo nuevo: necesita quedar marcada `esAnticipo` por su
excedente.

### 5.4 El recordatorio: a quién, cuándo y por dónde

**Honestamente: el envío no se puede construir todavía.** Hay dos deudas en
medio, las dos anotadas en CLAUDE.md §6:

- **No hay correo saliente.** Es la tarea 64 de esta misma cola, y queda
  esperando credenciales de Exchange.
- **Las notificaciones por ROL no llegan a nadie.** `agregarNotificacion` solo
  persiste las que traen `destinatarioId`; una dirigida a «Administración» vive
  en la memoria del navegador que la creó.

Así que el recordatorio se construye en dos tiempos:

| Fase | Qué | Depende de |
|---|---|---|
| **1 (esta semana)** | Contador en el encabezado de Cuentas por pagar («3 prefacturas sin factura, la más vieja de 24 días») + filtro + badge en el renglón. Se ve al entrar, sin que nadie mande nada | Nada |
| **2 (después)** | Correo al proveedor con copia a Administración, a los 7 y a los 15 días del pago | Tarea 64 |

Fase 1 contesta la pregunta «a quién»: **a quien ya abre la pantalla cada
mañana.** Un recordatorio que vive donde el trabajo ocurre no necesita envío.
Para la fase 2, mi recomendación de destinatario es el **contacto de tipo
«factura» del proveedor** —que es justo el tipo que la tarea 60 acaba de
agregar del lado del cliente (`contactos.ts`) y que al proveedor le falta—, con
copia a quien gestionó la orden.

---

## 6 · Permisos

La minuta §5 y el código no dicen lo mismo en dos renglones, y uno de ellos
importa.

| Acción (minuta §5) | Minuta | Código hoy | Veredicto |
|---|---|---|---|
| Facturar al cliente | Operaciones | `factura.generar`: operaciones **y** administración | El código es más amplio, y está bien: §4.1 del cliente da «Generar factura» a las dos áreas. **La minuta es la que se queda corta** |
| Cobranza y estados de cuenta | **Administración** | `registrarCobro` exige `factura.generar` → **Operaciones también puede cobrar** | ⚠️ **Contradicción real.** Hoy Operaciones registra cobros y la minuta dice que la cobranza es de Administración |
| Programar y ejecutar pagos | Administración | `ordenCompra.autorizar`: administración y admin | Coincide |
| Marcar / liberar «no pagar» | Admin **y** Operaciones | `puedeMarcarNoPagar` en `FichaOC.tsx`: solo administración y admin | ⚠️ Operaciones no puede marcar «no pagar», y la minuta dice que sí (y es coherente: Operaciones es quien sabe que el cliente no ha fondeado) |

### Lo que propongo

**Una capacidad nueva, no tres:**

```ts
| 'cobro.registrar'   // Registrar y aplicar la entrada de dinero del cliente
```

- `cobro.registrar` → **administracion, admin**. Reemplaza a `factura.generar`
  en `registrarCobro`, `anularCobro` y en el registro de entradas de dinero.
- Aplicar pagos a proveedor, y la reversa → **`ordenCompra.autorizar`**, que ya
  es de Administración. No invento `pago.aplicar`: es la misma persona haciendo
  el mismo acto, y una capacidad de más es una capacidad que nadie sabe quién
  tiene.
- Marcar prefactura → **`ordenCompra.gestionar`** (Operaciones), que es quien
  habla con la naviera. Pagarla sigue siendo de Administración.
- Capturar el saldo de una cuenta y ver el flujo de efectivo →
  **`ordenCompra.autorizar`**. Es la caja de Vermur: ni Ventas ni Pricing ni
  Operaciones tienen por qué ver cuánto hay en los bancos.

**Cuidado, esto QUITA algo que hoy funciona:** con `cobro.registrar`,
**Operaciones deja de poder registrar cobros**, y hoy puede. Es lo que dice la
minuta, pero es una capacidad en uso y el equipo ya está en producción
(§1 de CLAUDE.md). **No lo cambio sin el sí de Mau** — va como pregunta M3.

Y una recomendación aparte: darle `ordenCompra.gestionar`... ya la tiene
Operaciones. Para «marcar no pagar» basta con cambiar la condición de
`FichaOC.tsx` de `rol === 'administracion' || 'admin'` a
`puede(rol, 'ordenCompra.gestionar') || puede(rol, 'ordenCompra.autorizar')`,
dejando **liberar** solo a Administración: marcar es avisar, liberar es
decidir que el dinero está. Esa asimetría es textual de la minuta.

---

## 7 · Las pantallas

### 7.1 Aplicar pago · lado cliente

Se abre desde una factura de Cuentas por cobrar («Aplicar pago», que reemplaza
a «Registrar cobro») o desde un pago sin aplicar en la sección Pagos.

```
┌─ Aplicar pago · GRUPO FIBREMEX ─────────────────────────────────── MXN ─┐
│                                                                         │
│  EL DINERO QUE ENTRÓ                                                    │
│  Monto  [  120,000.00 ]  Moneda [MXN ▾]   Fecha [2026-10-05]            │
│  Cuenta [BBVA ▾]  ← recibir pagos de clientes y domiciliados            │
│  Referencia [            ]  (puede llegar después)                      │
│  Comprobante  [ Subir ]                                                 │
│                                                                         │
│  A QUÉ SE APLICA            Pendientes de GRUPO FIBREMEX en MXN         │
│  ┌──┬──────────────┬──────────┬───────────┬──────────┬──────────────┐  │
│  │✓ │ Factura      │ Vence    │ Saldo     │ Se aplica│ Queda        │  │
│  ├──┼──────────────┼──────────┼───────────┼──────────┼──────────────┤  │
│  │✓ │ F-2026-0145  │ 12-sep ⚠ │ 45,000.00 │ 45,000.00│         0.00 │  │
│  │✓ │ F-2026-0151  │ 28-sep ⚠ │ 60,000.00 │ 60,000.00│         0.00 │  │
│  │✓ │ F-2026-0163  │ 10-oct   │ 38,000.00 │ 15,000.00│    23,000.00 │  │
│  │  │ F-2026-0170  │ 22-oct   │ 12,400.00 │        — │              │  │
│  └──┴──────────────┴──────────┴───────────┴──────────┴──────────────┘  │
│  [ Aplicar lo más vencido primero ]                                     │
│                                                                         │
│  Aplicado 120,000.00 · Sin aplicar 0.00                    ✓ cuadra     │
│                                      [ Cancelar ]  [ Registrar pago ]   │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Solo facturas del mismo cliente y la misma moneda** (§4). El encabezado lo
  dice en vez de dejarlo implícito.
- Lo más vencido arriba, que es el orden de `cartera`.
- «Aplicar lo más vencido primero» reparte el monto en cascada. Es una
  propuesta editable, no un automático: igual que la comparativa preselecciona
  la más barata y se puede cambiar (§4.9).
- **Sobra dinero → se registra igual**, con el excedente «sin aplicar» a cuenta
  del cliente. Eso es el depósito del bloque 1, y es la razón de que no haya
  dos formularios distintos.
- **Falta dinero → no se puede aplicar más de lo que entró.** El botón lo dice:
  «estás aplicando 130,000 de un pago de 120,000».
- `montoCobrable` sigue validando cada renglón.

### 7.2 Aplicar pago · lado proveedor

Mismo formulario, espejo, abierto desde una tarjeta de Programación de pagos o
desde una factura de proveedor de Cuentas por pagar.

```
┌─ Registrar pago · IDAMEX ──────────────────────────────────────── MXN ─┐
│  Sale de [Santander gastos ▾]  ← pagos a proveedores y gastos          │
│  Monto [ 68,400.00 ]  Fecha [2026-10-05]  Referencia [          ]      │
│  Comprobante [ Subir ]                                                  │
│                                                                         │
│  QUÉ CUBRE              Facturas pendientes de IDAMEX en MXN           │
│  ✓ F-IDA-1201   OC-2026-0088 · OC-2026-0091      48,400.00  48,400.00  │
│  ✓ F-IDA-1208   OC-2026-0104                     20,000.00  20,000.00  │
│    (sin factura) OC-2026-0110                     5,200.00         —   │
│                                     Aplicado 68,400.00 · cuadra ✓      │
│  [ Copiar detalle para el proveedor ]   [ Registrar pago ]              │
└─────────────────────────────────────────────────────────────────────────┘
```

- Los renglones son las **facturas** de `facturasPorProveedor` (tarea 58), no
  las órdenes: la unidad de lo que se debe es la factura. Las órdenes se ven
  dentro de cada una.
- «Copiar detalle» es `textoComprobante` (`programacionPagos.ts:133`), que ya
  existe, hasta que haya correo (tarea 64).
- **Esto cierra el pendiente anotado en §4.24:** una factura repartida en
  órdenes con fechas de pago distintas producía dos transferencias. Con el pago
  como entidad, la fecha la decide quien paga y la factura se cubre de una vez.

### 7.3 Pagos (pestaña nueva en Finanzas)

```
Finanzas · Programación de pagos │ Pagos │ Flujo de efectivo │ Cuentas por
          cobrar │ Cuentas por pagar │ Estados de cuenta

Pagos          [Todos ▾] [Cliente|Proveedor] [Cuenta ▾] [Moneda ▾] [Mes ▾]
───────────────────────────────────────────────────────────────────────────
PAG-2026-0042  05-oct  →  IDAMEX              MXN  68,400.00  2 facturas
PAG-2026-0041  05-oct  ←  GRUPO FIBREMEX      MXN 120,000.00  3 facturas
PAG-2026-0040  03-oct  ←  CEMEX               USD   8,000.00  sin aplicar ⚠
───────────────────────────────────────────────────────────────────────────
Entradas del mes  MXN 1,240,000 · USD 32,000      (nunca un total mezclado)
Salidas del mes   MXN   980,400 · USD 21,500
```

La ficha de un pago: el movimiento arriba, sus aplicaciones en una tabla con
enlace a cada factura u orden, el comprobante, y «Quitar aplicación» /
«Anular pago» para quien tenga la capacidad. Es `SpreadsheetTable` con vistas
guardables, como quedaron las dos pantallas de la tarea 61.

### 7.4 Flujo de efectivo

```
Flujo de efectivo                        Semana del 5 al 11 de octubre  [▾]

CUÁNTO HAY                                       declarado  esperado  dif.
  Santander gastos   MXN   840,200  ·  3-oct      840,200   902,100   —
  Santander impuest. MXN   120,000  ·  5-oct      120,000   120,000   ✓
  BBVA               MXN 1,402,310  ·  5-oct    1,455,000 1,402,310  −52,690 ⚠
  Banorte            MXN    98,400  ·  5-oct       98,400    98,400   ✓
  Monex pesos        MXN    15,000  ·  1-oct ⚠ hace 4 días
  Monex dólares      USD    42,800  ·  5-oct       42,800    42,800   ✓
  PartnerPay         USD     3,120  ·  5-oct        3,120     3,120   ✓
                              Total MXN 2,475,910  ·  USD 45,920
                                                   [ Capturar saldos de hoy ]

QUÉ ENTRA (12 facturas)        QUÉ SALE (9 órdenes · 6 facturas de proveedor)
  lun 5   MXN   45,000           lun 5   MXN  68,400   IDAMEX
  mié 7   MXN  138,000           mié 7   MXN  120,000  Oñate (viernes ⚠)
  jue 8   USD    8,000           jue 8   USD   12,000  Hapag-Lloyd
  ───────────────────────        ───────────────────────
  MXN 183,000 · USD 8,000        MXN 188,400 · USD 12,000
                          Detenidas «No pagar»: MXN 54,000 (2) — aparte

⚠ BBVA: 52,690 menos de lo esperado. Hay movimientos sin registrar.
  [ Ver qué se esperaba ]
Cubre pagos a proveedores y cobros a clientes. No incluye gastos fijos
de la empresa (nómina, renta, impuestos propios).
```

Lo que Julio manda hoy por captura de WhatsApp es esta pantalla. El botón
«Capturar saldos de hoy» abre los siete campos de una vez, no siete
formularios.

---

## 8 · Pasos publicables, en orden

Cada uno es una rama, se verifica solo y se puede publicar sin el siguiente.
El punto de regreso de todos es `git revert` de su merge: nada migra datos, y
**lo viejo sigue escrito donde estaba** hasta el paso 2.

| # | Qué | Toca | Riesgo | Punto de regreso |
|---|---|---|---|---|
| **P1** | `lib/pagos.ts`: modelo, adaptadores de lo viejo, derivaciones y tests. Los diez call sites del §2.2 pasan a la lista unificada. **Cero cambios de pantalla** | Hosting | **Medio-alto**: diez call sites. Es el único paso que puede romper lo que funciona | Revert. Lo nuevo no se escribe todavía |
| **P2** | Regla de `pagos/` + `registrarCobro` y `registrarDeposito` crean `Pago`. Lo viejo queda de solo lectura | Hosting + **reglas Firestore** | Bajo | Revert + las reglas viejas. Los `Pago` escritos se siguen leyendo |
| **P3** | **Bloque 1**: «Registrar entrada de dinero» en Cuentas por cobrar; el panel de la ficha de la OC pasa a lectura con enlace. Referencia opcional | Hosting | Bajo | Revert: el formulario vuelve a la OC |
| **P4** | **Bloque 2 lado cliente**: Aplicar pago con varias facturas y parcialidades (7.1) | Hosting | Medio | Revert |
| **P5** | Pestaña **Pagos** (7.3) con la ficha del pago, quitar aplicación y anular | Hosting | Bajo | Revert |
| **P6** | **Bloque 2 lado proveedor** (7.2); `registrarPagoDelGrupo` pasa a crear un pago | Hosting | Medio | Revert: el loop de N escrituras vuelve |
| **P7** | **Bloque 4 · Prefactura**: checkbox, derivaciones, badge, filtro y contador | Hosting | Bajo | Revert. Los dos campos quedan escritos y se ignoran |
| **P8** | **Bloque 3 · Flujo de efectivo**: `saldosCuenta/`, captura de los siete saldos, auditoría esperado vs real, semana que entra y sale | Hosting + **reglas Firestore** | Medio | Revert + reglas. Los saldos declarados quedan y no estorban |

**Martes:** P1, P2, P3 y P4 — el bloque 1 completo y el lado cliente del
bloque 2, que es lo que Gaby pidió primero.
**Miércoles:** P5, P6, P7 y P8.

Si el martes se atrasa, el corte natural es después de **P3**: el bloque 1
queda resuelto y publicable solo, y es la queja más concreta de la junta.

**Lo que NO entra en estos ocho pasos** (y hay que decirlo antes de empezar):

- `pagada_parcial` como estado de la máquina de la OC (§1.5). Pregunta J4.
- El correo del recordatorio de prefactura (§5.4). Depende de la tarea 64.
- Importar estados de cuenta bancarios (§3, opción C).
- Las reglas de Firestore por rol: `pagos/` y `saldosCuenta/` nacerán con
  `esDelEquipo()`, como todo lo demás. Es la deuda de CLAUDE.md §6 y el plan
  de la tarea 53 — **cualquiera del equipo podrá escribir un pago desde la
  consola.** Con dinero de verdad en esa colección, la deuda sube de prioridad.
- Las reglas de excepción por proveedor del levantamiento §2.2 (Oñate paga los
  viernes, Aseguranza Peninsular consolida el mes). `calendarioPagos.regimenDe`
  las detecta **por el nombre del proveedor** y el propio código ya lo marca
  como decisión frágil («un cambio de razón social la rompe»,
  `calendarioPagos.ts:109`). En el flujo de efectivo eso se vuelve visible: una
  fecha mal puesta mueve dinero de semana. Fuera de esta tarea; pregunta J9.

---

## 9 · Preguntas

### Para Mau

| # | Pregunta | Mi recomendación |
|---|---|---|
| **M1** | ¿Se aprueba la colección `pagos/` con las aplicaciones embebidas, en vez de reescribir `CobroCliente`? | **Sí.** Lo viejo no se migra ni se toca, y el riesgo se concentra en P1, que no cambia ninguna pantalla |
| **M2** | ¿Se aprueban los campos nuevos? `OrdenCompra.esPrefactura`, `motivoPrefactura`, y los índices `FacturaCliente.aplicado` / `OrdenCompra.pagado` | **Sí**, los cuatro opcionales. Los dos índices con el precedente que ya está escrito en `useFacturas.ts:139`: índice para filtrar, el cálculo manda |
| **M3** | **¿Operaciones deja de poder registrar cobros?** Hoy puede (`factura.generar`); la minuta §5 dice que la cobranza es de Administración | **Sí, con aviso al equipo.** Es una capacidad en uso en producción y quitarla en silencio rompe el trabajo de alguien el lunes. Si prefieres no arriesgarlo, `cobro.registrar` se da también a Operaciones y se anota la divergencia |
| **M4** | ¿Operaciones puede MARCAR «no pagar» (hoy no puede, la minuta dice que sí) y solo Administración LIBERARLO? | **Sí.** Operaciones es quien sabe que el cliente no fondeó; es la asimetría textual de la minuta |
| **M5** | `pagos/` y `saldosCuenta/` nacen con `esDelEquipo()`. ¿Se adelanta el plan de reglas por rol (tarea 53) ahora que habrá pagos en Firestore? | **Sí, es el momento.** Un pago escrito desde la consola de Firebase es dinero que nadie autorizó. Hoy ya pasa con las órdenes, pero el pago lo hace más evidente |
| **M6** | ¿Los ocho pasos se publican de corrido o se para a validar en P3? | **Parar en P3.** Es el bloque 1 completo, es la queja más concreta, y valida la lectura unificada con datos reales antes de montar tres pantallas encima |

### Para Julio (y Gaby)

| # | Pregunta | Mi recomendación |
|---|---|---|
| **J1** | **El saldo de las siete cuentas: ¿lo capturas tú cada mañana, o lo bajas del portal?** Es lo único que la plataforma no puede saber sola | Captura diaria de los siete, con la auditoría de esperado contra real al lado. Es un minuto y convierte el descuadre en información |
| **J2** | «El cobro se liga solo a la orden de pago que corresponda»: ¿el depósito del cliente se amarra a UNA orden en concreto, o sigue fondeando el embarque completo por moneda, como hoy? | **Como hoy, por embarque y moneda**, con la posibilidad de amarrarlo a una orden cuando es un depósito de impuestos. Amarrar todo obligaría a capturar el destino antes de saberlo |
| **J3** | Un pago en dólares contra una factura en pesos: ¿pasa? ¿Y cómo lo registras hoy en Magaya? | No se aplica directo: el dinero entra en la moneda que llegó al banco (§4) |
| **J4** | ¿Necesitas FILTRAR por «pagada parcial», o te basta con ver el avance dentro de la orden? | Ver el avance. El estado nuevo toca una máquina con 54 tests y se agrega después si hace falta |
| **J5** | Prefactura pagada y la factura real llega por MENOS: ¿el excedente queda como anticipo del proveedor para su próxima factura, o se le pide devolución? | **Anticipo.** El mecanismo ya existe y está probado (`anticipos.ts`) |
| **J6** | Un embarque con una prefactura pagada y sin factura: ¿se FRENA el cierre administrativo o solo se avisa? | **Freno.** Cerrar sin el comprobante fiscal del proveedor es lo que el contador reclama después |
| **J7** | El recordatorio de la factura faltante: ¿a los cuántos días, y al proveedor o a ustedes? | 7 y 15 días, al contacto de tipo «factura» del proveedor con copia a quien gestionó la orden. **El proveedor no tiene contactos con tipo todavía** (el cliente sí, tarea 60): mientras, solo el aviso interno |
| **J8** | ¿El flujo de efectivo debe incluir los gastos fijos de Vermur (nómina, renta, impuestos propios)? Hoy no están en la plataforma | Empezar sin ellos y decirlo en pantalla. Si los necesitas, son un tipo de salida recurrente y es otra tarea |
| **J9** | Oñate paga los viernes y Aseguranza Peninsular consolida el mes. Hoy la plataforma los reconoce **por el nombre del proveedor**. ¿Hay más proveedores con regla especial? | Pasarlo a un campo del proveedor. Mientras siga en el nombre, cambiarle el nombre a Oñate le cambia la fecha de pago |
| **J10** | Lo que ya está en producción: ¿hay cobros o depósitos capturados mal que haya que ignorar en el arranque? El script del §2.3 los lista sin tocarlos | Correr el script antes de P1 y decidir con la lista en la mano |

---

## 10 · Hallazgos del camino (anotados, sin tocar)

1. **La moneda del depósito se hereda de la orden** (`FichaOC.tsx:414`): un
   depósito en pesos contra una orden en dólares se guarda en dólares, y el
   fondeo de §4.3 lo cuenta en la moneda equivocada. P3 lo arregla al mover el
   formulario; mientras, el dato puede estar mal en producción y el script del
   §2.3 lo detecta.
2. **`DepositoCliente` no tiene banco.** Un depósito no se puede conciliar
   contra una cuenta. El campo entra con el pago nuevo; los viejos quedan en
   «sin cuenta identificada».
3. **`registrarPagoDelGrupo` no es atómico** (`Finance.tsx:139`): si falla a la
   mitad, unas órdenes quedan pagadas y otras no, y el aviso es un toast que se
   va. P6 lo resuelve con un pago, una escritura.
4. **`FondeoContext`** (`OrdenesCompraData.ts:286`) tiene dos escalares,
   `totalFondeo` y `totalOCsPendientes`, sin moneda — justo lo que §4.3
   prohíbe. No se usa: la máquina recibe `FondeoEmbarque`, que sí es por
   moneda. Es un tipo muerto; candidato a borrar.
5. **Una factura sobrecobrada hoy es invisible.** `saldoDeFactura` da un saldo
   negativo y nada lo señala: ni la cartera ni el panel del embarque. Con N
   cobros sueltos nadie lo ha podido ver. El script del §2.3 cuenta cuántas hay.
6. **El mes de `resumenCartera`** (`cuentasPorCobrar.ts:114`) se saca con
   `hoy.slice(0,7)` sobre `fechaCobro`. Correcto, pero cuando el pago tenga su
   propia fecha hay que mirar la del pago, no la de la aplicación. Queda
   anotado para P4.
