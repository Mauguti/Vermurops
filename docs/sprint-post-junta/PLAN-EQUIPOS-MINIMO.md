# Plan — Equipos: la parte mínima para Operaciones

Análisis, sin código. Extiende el Plan B (`PLAN-B-equipos-como-responsable.md`)
con el recorte mínimo que desbloquea lo que Operaciones necesita hoy.

---

## 0. El problema concreto

Operaciones está replicando en VermurOps cotizaciones y embarques que ya existen
en Magaya. Los clientes que replican son de dos tipos:

- **Clientes de oficina**: llegan directo a Pricing; no tienen vendedor asignado.
- **Agentes de carga** (`esTambienCliente`): también entran por Pricing.

Hoy el sistema les estorba en tres puntos. Los tres están en el código, no en
el negocio.

---

## 1. Qué les estorba exactamente — diagnóstico en el código

### 1.1 Operaciones no ve el módulo de CRM

**`src/auth/users.ts:69`** — `ALLOWED_VIEWS_BY_ROLE`:

```
operaciones: ['dashboard', 'shipments', 'clients', 'puertos', 'exchange', 'finance', 'settings']
```

`'quotes'` no está. Operaciones no puede ver ninguna cotización, ni la bandeja,
ni el Kanban. La decisión del cliente (27-ago) fue «Operaciones no debe crear
cotizaciones», pero la implementación quitó el módulo COMPLETO en vez de solo
el permiso de crear. Un comentario lo dice:

> *`// 'quotes' se QUITA (cliente, 27-ago-2026): «Operaciones no debe crear
> cotizaciones». Se retira el módulo completo, no solo el permiso.`*

**Consecuencia:** Operaciones no puede consultar el estado de una cotización ni
copiar datos para replicar un embarque. Abre Magaya en otra ventana.

### 1.2 Los clientes sin vendedor no tienen dueño visible

**`src/components/Quotes.tsx:306-311`** — El filtro de Ventas:

```ts
const permittedQuotes = kanbanQuotes.filter(q => {
  if (rolActivo === 'ventas') {
    return visibleParaVentas(q.vendedorId, user);
  }
  return true;  // Los demás roles ven todo
});
```

Para Ventas funciona: solo ve lo suyo y los huérfanos. Para Pricing NO hay
filtro personalizado — ve todo. **Pero el campo `pricingId` en la bandeja**
(`BandejaPricing.tsx:294-296`) filtra por persona:

```ts
if (filtro === 'mias') return arr.filter(q => q.pricingId === user?.nombre);
if (filtro === 'sin_asignar') return arr.filter(q => !q.pricingId);
```

Un cliente de oficina que llega directo a Pricing no tiene vendedor, pero SÍ
necesita tener responsable Pricing. Hoy `pricingId` se pone SOLO al crear:

**`Quotes.tsx:684`**:
```ts
pricingId: puedeCrear ? (user?.uid ?? user?.nombre ?? null) : null,
```

Esto asigna al individuo que crea. Funciona para la persona, pero no hay
concepto de «equipo Pricing» como responsable colectivo. Una cotización de un
cliente de oficina que nadie creó en la plataforma (está en Magaya) no tiene
`pricingId` y cae en «Sin asignar» — que es correcto, pero no en «Del equipo».

### 1.3 `EQUIPO_PRICING` es un catálogo inventado

**`src/components/quotes/QuotesData.ts:652-656`**:

```ts
export const EQUIPO_PRICING = [
  { id: 'ana.reyes', nombre: 'Ana Reyes' },
  { id: 'roberto.diaz', nombre: 'Roberto Díaz' },
  { id: 'lucia.mendez', nombre: 'Lucía Méndez' },
];
```

Ana Reyes, Roberto Díaz y Lucía Méndez no existen. Son datos mock del
checkpoint inicial. Lo usan `FichaCotizacion.tsx:2209`, `BandejaPricing.tsx` y
`KanbanCotizaciones.tsx`. Cuando alguien elige «Ana Reyes» como Pricing, queda
un nombre que no corresponde a ningún usuario.

**Consecuencia:** El selector de Pricing asigna fantasmas. El filtro «Mías» de
la Bandeja compara contra `user?.nombre`, que es el displayName real (p.ej.
«Nohema Sosa»), y nunca empatará con «Ana Reyes».

### 1.4 La solicitud de un cliente de oficina no puede nacer en Pricing

La máquina de estados YA lo permite (`stateMachine.ts:77-80`):

```ts
// 1b · 'pricing' incluido: los clientes de oficina y los agentes de
// carga no tienen vendedor asignado por definición, así que su
// solicitud nace y avanza sin pasar por Ventas.
roles: ['ventas', 'pricing', 'admin'],
```

Pricing puede avanzar `solicitud_cliente → solicitado_pricing`. Y Pricing
puede CREAR cotizaciones en cualquier etapa (`puedeCrearCotizacion` con
`cotizacion.crear`). **Lo que falta no es la máquina sino la señal:** nada en
el modelo dice «este cliente es de oficina», así que la app no puede
preseleccionar el flujo.

### 1.5 El embarque hereda el operativo del cliente — pero solo si existe

**`generacionEmbarque.ts:88,142`**:

```ts
responsableOperativo: d.responsableOperativo ?? null,
```

Si el cliente no tiene `responsableOperativo`, el embarque nace sin dueño.
`filtrosEmbarques.ts:91` lo trata como «sin asignar»:

```ts
if (responsable === SIN_ASIGNAR ? suyo !== '' : suyo !== responsable) return false;
```

Para clientes de oficina que llegan de Magaya, `responsableOperativo` está
vacío. Operaciones ve estos embarques solo con «Sin asignar» o «Todos», no
con «Solo los míos».

---

## 2. Lo mínimo que desbloquea — tres cambios

### Cambio A: Operaciones ve CRM en solo lectura

**Qué:** Agregar `'quotes'` a `ALLOWED_VIEWS_BY_ROLE.operaciones`.

**Qué NO:** Operaciones no tiene `cotizacion.crear` ni `cotizacion.solicitar`
ni `kanban.ver`. Agregar la vista no le da botones de crear ni de mover
cotizaciones. La franja (`ProximosPasos.tsx`) le dirá «le toca a Pricing» o
«le toca a Ventas» porque la máquina de estados no le da transiciones.

**Riesgo:** Bajo. Es agregar un string a un array. No toca el modelo ni los
datos.

**Qué valida Mau:**
Entrar como `operaciones@vermur.com`, ver el módulo CRM en el menú, poder
abrir cotizaciones, y NO ver botones de crear, enviar ni mover.

### Cambio B: `EQUIPO_PRICING` real, no mock

**Qué:** Reemplazar el array inventado por `usuariosPorRol('pricing')`, que ya
existe en `AuthContext.tsx:81-90` y lee del mapa de correos real.

```ts
// Antes (QuotesData.ts:652):
export const EQUIPO_PRICING = [
  { id: 'ana.reyes', nombre: 'Ana Reyes' },       // no existen
  ...
];

// Después:
// Se usa directamente usuariosPorRol('pricing') en los componentes
// que hoy importan EQUIPO_PRICING.
```

**Tres consumidores** que pasan de `EQUIPO_PRICING` a `usuariosPorRol('pricing')`:
- `FichaCotizacion.tsx:2209` — selector de «Responsable Pricing»
- `BandejaPricing.tsx` — el filtro y la asignación
- `KanbanCotizaciones.tsx` — el selector en la tarjeta

Lo mismo con `VENDEDORES` (otro catálogo mock en `QuotesData.ts:646-650`):
reemplazar por `usuariosPorRol('ventas')`.

**Riesgo:** Medio. Hay que verificar que el formato de `usuariosPorRol` encaje
donde hoy se usa `{ id, nombre }`. La función devuelve `{ email, nombre }` —
el `id` pasa a ser el correo, que es lo que corresponde.

**Consecuencia:** El filtro «Mías» de la Bandeja empezará a funcionar porque
`user?.nombre` ahora corresponde a la misma fuente. Antes comparaba contra un
catálogo de personas que no existen.

**Nota:** Esto cambia cuando se construya Usuarios y roles (tarea 21), que
reemplaza `usuariosPorRol` por una lectura de `usuarios/{uid}`. Pero el
contrato no cambia: la función sigue devolviendo un array de `{ email, nombre }`
por rol.

### Cambio C: «Cliente de oficina» como atributo del cliente

**Modelo aprobado en Plan B §5.3:** un booleano en el cliente.

```ts
// Aditivo, opcional, leído con fallback a false.
clienteDeOficina?: boolean;
```

**Qué hace:**
1. En Altas → ficha del cliente, un toggle «Cliente de oficina» (solo
   Administración y admin lo editan, por `puedeEditarEnLista`).
2. Cuando alguien crea una solicitud para un cliente marcado así, la app
   preselecciona el flujo sin vendedor: no pide vendedor, y al crear la
   cotización pone `pricingId` con el `responsablePricing` del cliente (si
   existe) o lo deja sin asignar.
3. En la bandeja de Pricing, un badge «Oficina» en las cotizaciones de
   clientes de oficina, para distinguirlas de las de Ventas.

**Qué NO:**
- No cambia la máquina de estados (ya permite el flujo).
- No requiere migración: los clientes existentes se asumen como no-oficina.
- No toca las reglas de Firestore (sigue en `allow write: if esDelEquipo()`).

**Riesgo:** Bajo. Un campo booleano nuevo, leído con fallback.

**Pregunta para Mau:** ¿Los agentes de carga (`esTambienCliente: true`) se
consideran clientes de oficina por definición, o hay agentes de carga que SÍ
tienen vendedor? Si es lo primero, se puede derivar en vez de capturar:
`clienteDeOficina = esTambienCliente || marcadoManualmente`.

---

## 3. Lo que NO entra en el mínimo

| Tema | Por qué no entra | Cuándo entra |
|---|---|---|
| Colección `equipos/{id}` | Hoy hay una persona de Pricing (Nohema). El equipo como entidad sirve cuando haya más de una. | Usuarios y roles (tarea 21) o cuando Pricing crezca |
| `miembrosDe()` y el prefijo `equipo:` | Sin la colección, no hay qué expandir. | Junto con `equipos/{id}` |
| «Tomar» y «Soltar» | Necesitan el concepto de equipo como propietario. Con una sola persona, tomar es redundante. | Después de `equipos/{id}` |
| Visibilidad por equipo | Requiere rol en el token y reglas por rol. Es seguridad aparente sin eso (Plan B §4). | Después de Usuarios y roles |
| Filtro «Sin asignar» → «Del equipo» | Sin equipo no hay «del equipo». «Sin asignar» cubre el caso hoy. | Junto con «Tomar» |
| Notificaciones a un equipo | Las notificaciones por rol no llegan a nadie (deuda §6). | Después de Usuarios y roles |

---

## 4. Convivencia con Usuarios y roles (tarea 21)

La tarea 21 construye `usuarios/{uid}` y custom claims. Los tres cambios de
este plan están diseñados para SER REEMPLAZADOS por eso, no para competir:

| Este plan (mínimo) | Usuarios y roles (tarea 21) |
|---|---|
| `EQUIPO_PRICING` → `usuariosPorRol('pricing')` del mapa de correos | → lectura de `usuarios/{uid}` con `rol === 'pricing'` |
| `clienteDeOficina` como booleano | Sin cambio: el atributo es del cliente, no del usuario |
| Operaciones ve CRM en solo lectura | Sin cambio: la vista se queda, los permisos se refinan con claims |
| `responsableOperativo` como correo | → Se puede enriquecer con `uid`, pero el correo sigue funcionando |

**La clave:** nada de lo que se construye aquí contradice lo que viene. Los
cambios A y B se mejoran con GU; el C es ortogonal.

---

## 5. Pasos publicables

### Paso 1 — Operaciones ve CRM (15 min)

- Agregar `'quotes'` a `ALLOWED_VIEWS_BY_ROLE.operaciones` en `users.ts`.
- Verificar que `Quotes.tsx:76` sigue poniendo `defaultView = 'kanban'` para
  operaciones (ya lo hace).
- Verificar que los botones de crear/mover NO aparecen:
  `puedeSolicitar` = false, `puedeCrear` = false, `puedeVerKanban` = false.
- Test en `permisos.test.ts`: «operaciones ve CRM pero no crea cotizaciones».
- Captura: entrar como operaciones, ver la lista de cotizaciones.

**Punto de regreso:** quitar `'quotes'` del array.

**Qué despliega:** hosting.

### Paso 2 — Equipos reales en los selectores (45 min)

- Borrar `EQUIPO_PRICING` y `VENDEDORES` de `QuotesData.ts`.
- En `FichaCotizacion.tsx`, `BandejaPricing.tsx` y `KanbanCotizaciones.tsx`:
  importar `usuariosPorRol` y usarlo en lugar de los arrays mock.
- Ajustar el formato: `usuariosPorRol` devuelve `{ email, nombre }`;
  los selectores usan `.nombre` para mostrar y `.email` (o `.nombre`) como
  valor. `pricingId` pasa a guardar el NOMBRE real (como ya lo hace
  `Quotes.tsx:684`: `user?.nombre`).
- Test: el filtro «Mías» empata cuando `pricingId === user.nombre`.

**Decisión de interfaz:** el valor de `pricingId` sigue siendo el nombre,
no el correo, porque es lo que se muestra en las tarjetas. Cuando GU exista,
pasa a uid + nombre de pantalla.

**Punto de regreso:** restaurar los arrays mock.

**Qué despliega:** hosting.

### Paso 3 — Cliente de oficina (1–2 h)

- Campo `clienteDeOficina?: boolean` en `ClienteVermur`.
- Toggle en la ficha del cliente, solo para admin/administracion.
- Columna en la tabla de clientes (tarea 09).
- Al crear cotización (`Quotes.tsx:handleCreateQuote`): si el cliente
  seleccionado tiene `clienteDeOficina`, omitir `vendedorId` y poner
  `pricingId` con el `responsablePricing` del cliente.
- Badge «Oficina» en la bandeja de Pricing.
- Test: solicitud de un cliente de oficina nace con `pricingId` y sin
  `vendedorId`.

**Punto de regreso:** ignorar el campo; `false` es el default.

**Qué despliega:** hosting.

---

## 6. Lo que NO sabemos y hay que preguntar

### Para Mau

1. **¿Los agentes de carga son siempre clientes de oficina?** Si sí,
   `clienteDeOficina` se puede derivar de `esTambienCliente` para los
   existentes. Recomendación: sí para los importados de Magaya; para los
   nuevos se marca explícitamente.

2. **¿Operaciones debería ver la Bandeja de Pricing o solo la lista/Kanban?**
   La Bandeja requiere `cotizacion.crear`; darles eso les permitiría crear
   cotizaciones, que es lo que el cliente prohibió. Recomendación: solo la
   vista de lista, que ya tiene filtros y vistas guardadas. El Kanban
   requiere `kanban.ver`, que es de Ventas; tampoco corresponde.

3. **¿Nohema es la única de Pricing o hay más personas que deberían aparecer
   en el selector?** El mapa real en `AuthContext.tsx` tiene solo a Nohema.
   Si hay más, hay que agregarlas al mapa (o esperar a GU).

4. **¿El paso 3 (cliente de oficina) se publica junto con el 2, o esperamos
   a tener la sesión con Pricing?** Recomendación: publicar 1 y 2 juntos;
   el 3 después de confirmar la pregunta sobre agentes de carga.

### Para Vermur

Ninguna. Este plan es interno y las decisiones de negocio ya están tomadas
en el Plan B.
