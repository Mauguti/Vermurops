# Despliegue de las reglas por rol — martes 13-oct, después de las capacitaciones

Alcance: **solo lo que mueve dinero.** `pagos/`, `cobros/`, `depositosCliente/`
y `ordenesCompra/`. Todo lo demás sigue con `esDelEquipo()`.

---

## 0 · Los claims, ANTES del deploy — sin esto el deploy no protege nada

La convivencia deja pasar a toda cuenta **sin** claim con los permisos de hoy.
Así nadie se queda fuera… y así tampoco nadie queda protegido. **Una cuenta
sin rol es una cuenta sin cerco**, aunque las reglas estén publicadas.

### 0.1 Ver qué falta

```bash
cd /Users/mauriciogutierrezmunoz/antigravity/Vermur-Logistics && npx tsx scripts/auditarClaims.ts
```

Solo lectura. Lista las cuentas de Auth con su rol y marca con ❌ las que no
tienen. Al final dice **«N de 7 con rol asignado»** y si se puede desplegar.

### 0.2 Asignar el rol que falte

**Configuración → Usuarios**, con la cuenta de admin. Va por
`gestionarUsuarios`, que pone el claim y además revoca los tokens — por eso no
se hace a mano con la consola.

### 0.3 Que cada quien cierre sesión y vuelva a entrar

**Este paso es el que se olvida.** El claim viaja **en el token**, y el que la
persona ya tiene en su navegador no lo trae. Hasta que no renueve sesión, su
token sigue sin rol y su cuenta sigue en la vía de convivencia, aunque la
pantalla de Usuarios ya muestre el rol.

Mensaje para el grupo:

> Ya quedaron los roles. **Cierren sesión y vuelvan a entrar** antes del
> martes; si no, la plataforma los sigue tratando como antes.

### 0.4 Volver a correr la auditoría

```bash
cd /Users/mauriciogutierrezmunoz/antigravity/Vermur-Logistics && npx tsx scripts/auditarClaims.ts
```

**Repetir 0.2 → 0.4 hasta que diga «7 de 7» y «✅ Los claims están listos».**
Con un solo ❌, el deploy se puede hacer —no rompe nada— pero esa persona
conserva todos los permisos de hoy. No es un deploy a medias: es un deploy que
a esa cuenta no le aplica.

> ⚠️ **Un rol inválido es peor que ninguno.** Si una cuenta trae un claim que
> las reglas no reconocen (un dedazo, un rol que ya no existe), NO cae en la
> convivencia: queda sin permisos de dinero. La auditoría lo marca con ⚠️
> aparte de los ❌.

---

## 1 · El deploy

```bash
cd /Users/mauriciogutierrezmunoz/antigravity/Vermur-Logistics && npx firebase deploy --only firestore:rules
```

Tiene que decir **`uploading rules firestore.rules...`**. Si dice
`skipping upload`, no subió nada (§3).

**No hay deploy de hosting.** La app no cambió: estas reglas endurecen lo que
ya hace. Si algo falla, falla con el aviso rojo de escritura rechazada que ya
existe.

---

## 2 · Qué probar en producción, en 10 minutos

Con **una orden de prueba** («PRUEBA ROLES»), no con una real: este bloque
mueve estados de órdenes de compra.

| # | Quién | Qué | Resultado esperado | Min |
|---|---|---|---|---|
| 1 | **Administración** (Julio) | Cuentas por cobrar → registrar una entrada de dinero | **Guarda** | 2 |
| 2 | **Administración** | Programación de pagos → registrar el pago de la orden de prueba | **Guarda**, la orden queda pagada | 2 |
| 3 | **Administración** | Ficha de esa orden → quitar «No pagar» (márcalo primero) | **Guarda** | 1 |
| 4 | **Operaciones** (Ángel) | Ficha de la orden → marcar «No pagar» con motivo | **Guarda** | 1 |
| 5 | **Operaciones** | Ficha de la orden → marcar prefactura con motivo | **Guarda** | 1 |
| 6 | **Operaciones** | Intentar **quitar** «No pagar» | El botón **no aparece**. Si lo forzara, la escritura se rechaza | 1 |
| 7 | **Ventas** (Itzel) | Finanzas → Pagos | **Ve la lista** (leer no se restringió) y no tiene botones de registrar | 1 |
| 8 | **Todos** | Consola del navegador | **Limpia.** Un `permission-denied` ahí es el síntoma a reportar | 1 |

**Lo que NO cambia y conviene decirle al equipo:** nadie pierde acceso a
ninguna pantalla, y **leer no se restringió** — la cartera, los tableros y la
pestaña Pagos se siguen viendo igual desde cualquier rol. Lo único que se
cerró es **quién escribe** dinero.

---

## 3 · Cómo regresar

El `firestore.rules` de hoy está guardado tal cual, verificado byte a byte
contra lo que corre en producción:

```
docs/sprint-post-junta/firestore.rules.antes-de-roles
```

Para volver atrás, dos comandos:

```bash
cd /Users/mauriciogutierrezmunoz/antigravity/Vermur-Logistics && cp docs/sprint-post-junta/firestore.rules.antes-de-roles firestore.rules
```
```bash
cd /Users/mauriciogutierrezmunoz/antigravity/Vermur-Logistics && npx firebase deploy --only firestore:rules
```

Vuelve a leer `uploading rules`. **La reversión tarda lo mismo que el deploy
—segundos— y no toca datos ni hosting.** No hay nada que migrar de vuelta: las
reglas no escriben.

Si prefieres revertirlo por git, el commit del bloque es el único que toca
`firestore.rules`; `git revert` de ese commit deja el archivo igual que la
copia de arriba.

---

## 4 · La decisión que lleva dentro, para que la tomes a sabiendas

**Una cuenta del equipo SIN claim de rol conserva los permisos de hoy, o sea
todos.** Es lo que hace publicable el martes sin esperar a que los seis roles
estén asignados, y es la razón de que nadie se quede fuera.

El precio es que el cerco no está cerrado hasta que **los seis** tengan rol.
Mientras falte uno, esa cuenta puede registrar un pago desde la consola de
Firebase igual que hoy.

Cerrarlo del todo es quitar `!tieneRolAsignado()` de `rolEntre` en
`firestore.rules`. Cuando lo hagas, **el bloque «convivencia» de
`tests/reglas/porRol.test.ts` debe caer** — esos 9 tests son el contrato de la
vía de escape, así que su caída es la señal de que ya no existe, no una
regresión.

---

## 5 · El martes 20: quitar la convivencia

Con los 7 roles puestos y una semana de operación encima, la vía de escape
deja de hacer falta y pasa a ser el agujero: cualquier cuenta a la que se le
caiga el claim —una invitación nueva sin rol, un `revokeRefreshTokens` a medias—
recupera todos los permisos sin que nadie se entere.

**Propuesta: martes 20-oct.** Una semana de margen para que cualquier
problema del 13 aparezca con la red puesta.

Qué se hace, en `firestore.rules`:

```
function rolEntre(roles) {
  return esDelEquipo()
    && (!tieneRolAsignado() || request.auth.token.rol in roles);   ← quitar esta mitad
}
```

queda:

```
function rolEntre(roles) {
  return esDelEquipo() && request.auth.token.rol in roles;
}
```

**Al hacerlo, el bloque «convivencia» de `tests/reglas/porRol.test.ts` DEBE
caer** — son 9 tests y son el contrato de la vía de escape. Su caída es la
señal de que ya no existe, no una regresión: se reescriben al revés (una
cuenta sin rol ya no escribe) en el mismo cambio.

Antes de ese deploy, correr `auditarClaims.ts` otra vez: después del 20, una
cuenta sin rol **se queda sin poder registrar dinero**, y eso sí se nota en
media hora.

---

## 6 · Lo que este paso NO hace

- **No restringe lecturas.** El plan (§2.1) propone que Ventas y Pricing no
  vean `ordenesCompra`, `cobros` ni `depositosCliente`. No entró: cerrar
  lecturas puede vaciar una pantalla sin decir por qué, y el alcance de hoy
  era «lo que mueve dinero», que es escribir.
- **No toca Storage.** El plan §4 propone reglas por carpeta; queda para otro
  paso.
- **No toca las otras 20 colecciones** de la matriz del plan: cotizaciones,
  clientes, proveedores, tarifas, embarques y el resto siguen con
  `esDelEquipo()`.
- **No borra la lista de correos.** `esDelEquipo()` sigue siendo el piso y se
  evalúa ANTES del rol: un claim `rol: 'admin'` con un correo de fuera no
  entra. Hay tests para eso.

---

## 7 · Evidencia

- **119 tests de reglas** (`npm run test:reglas`), de los cuales 50 son los
  nuevos por rol.
- **Verificados por mutación**, siete veces: abrir `autorizaDinero` a todo el
  equipo tumba 17; abrir `gestionaOrdenes`, 6; quitar la guarda de «pagada», 4;
  la de quitar «No pagar», 1; la de prefactura, 4; volver la convivencia
  permanente, 21; y dejar que el claim reemplace a la lista de correos, 2.
- **`npm run e2e:completo`** contra las reglas nuevas, con las cinco cuentas
  del emulador llevando su claim de rol.
