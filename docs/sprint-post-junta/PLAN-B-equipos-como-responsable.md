# Plan B — Equipos como responsable

Análisis, sin código.

## 1. Qué hay hoy

**Tres campos, uno por área, con un CORREO cada uno**
([ClientesData.ts:142](../../src/components/clientes/ClientesData.ts)):

```ts
responsableVentas?: string | null;      // un correo
responsablePricing?: string | null;
responsableOperativo?: string | null;
```

No hay directorio de usuarios: los nombres salen de `usuariosPorRol`, que los
deriva del mapa de correos de `AuthContext`. El embarque **hereda** el
operativo al nacer, y de ahí sale «Solo los míos» en Embarques
(`filtrosEmbarques.ts`).

Quien los consume: `Shipments.tsx`, `FichaEmbarque.tsx`, `EmbarquesList.tsx`,
`embarqueColumns.tsx`, `generacionEmbarque.ts`, `FichaCliente.tsx`.

## 2. Cómo conviven persona y equipo en el mismo campo

**La respuesta corta: con un prefijo en el mismo `string`, y un resolvedor que
lo expande a correos.**

```
responsableVentas: 'itzel.laurean@vermur.com'   ← una persona, como hoy
responsableVentas: 'equipo:ventas-norte'        ← un equipo
```

Por qué así y no con un campo nuevo:

- **No hay migración.** Los 817 clientes siguen con su correo y se leen igual.
  Es el mismo patrón preaprobado de este sprint: campo viejo que se sigue
  entendiendo.
- **Un solo campo evita el estado imposible.** Con `responsableVentas` y
  `equipoVentas` separados, alguien acabaría poniendo los dos y no habría
  regla que diga cuál gana. Con uno, la pregunta no existe.
- **El prefijo es explícito.** Un correo lleva `@`; un equipo lleva `equipo:`.
  No hay forma de confundirlos ni de que un id de equipo parezca un correo.

La pieza central es una función pura, `miembrosDe(responsable, equipos)`, que
devuelve **siempre una lista de correos**:

```
'itzel@vermur.com'      → ['itzel@vermur.com']
'equipo:ventas-norte'   → ['itzel@vermur.com', 'ana@vermur.com']
null / equipo inexistente → []
```

**Todo lo que hoy compara `responsable === miCorreo` pasa a
`miembrosDe(responsable).includes(miCorreo)`.** Es un cambio mecánico en seis
archivos, con la regla en un solo lugar. Y el caso de una persona sigue
funcionando sin que el resto del código sepa que existen equipos.

La colección `equipos/{id}` sería `{ nombre, area, miembros: string[], activo }`.

## 3. Qué se rompe en las vistas por rol

| Qué | Dónde | Cómo queda |
|---|---|---|
| «Solo los míos» en Embarques | `filtrosEmbarques.ts` | Compara un correo contra `embarque.responsableOperativo`. Pasa a `miembrosDe(...).includes(...)`. **Se rompe si no se toca**: un embarque de equipo no sería de nadie |
| Herencia al nacer el embarque | `generacionEmbarque.ts` | Hoy copia el correo del cliente. Si el cliente tiene equipo, el embarque hereda el equipo. Pero **hay que decidir**: ¿se queda como equipo, o se asigna a una persona al abrirlo? Ver §5 |
| Columna «Responsable» | `embarqueColumns.tsx` | Hoy pinta un nombre derivado del correo. Con equipo, pinta el nombre del equipo. Cosmético |
| Selector de responsable | `FichaCliente.tsx`, `FichaEmbarque.tsx` | Hoy es un select de `usuariosPorRol(rol)`. Pasa a un select con dos grupos: equipos arriba, personas abajo |
| Vistas guardadas | `VistaUsuario.filtros` | Guardan el filtro «solo los míos» como booleano, no como correo. **No se rompen** |
| Bandeja Pricing | `BandejaPricing.tsx` | Tiene «Solo mías / Sin asignar / Todas». Mismo cambio de comparación |
| Visibilidad de contactos | `FichaCliente.tsx` | Es lo que más cambia, y lo trato aparte abajo |

## 4. La visibilidad de contactos

Mau lo mencionó como consecuencia, y es la parte con más riesgo, porque **hoy
no existe ninguna restricción de visibilidad por responsable**: las reglas de
Firestore dejan leer todo a cualquier miembro del equipo (§6 y el parche del
Bloque 9), y la aplicación no filtra clientes por responsable en ninguna
pantalla.

Así que «los miembros ven lo de su equipo» **no es un ajuste: es una capa
nueva**, y tiene la misma trampa que el portal del cliente:

> Con las reglas de hoy, esconder un cliente en la interfaz no lo esconde. Un
> vendedor con la sesión abierta lee la cartera completa desde la consola del
> navegador.

**Por eso esto depende de Usuarios y roles**, que no está construido. Sin el
rol y el equipo en el token, las reglas no pueden evaluar pertenencia, y la
visibilidad por equipo sería seguridad aparente — exactamente lo que §6 ya
documenta como el agujero abierto.

## 5. Decisiones que hacen falta antes de construir

1. **El embarque nace con el equipo y se toma con un botón explícito.**
   **RESUELTO (25-sep-2026)**, y corrigiendo mi recomendación: propuse que la
   primera persona que lo tocara se lo quedara, y Mau lo rechazó. Va un botón
   **«Tomar»**.

   Tenía razón: «tocar» no es una acción, es un efecto secundario de abrir
   una ficha. Quedarse con un embarque por haberlo mirado produce dos cosas
   malas —alguien se queda con lo que solo estaba revisando, y nadie sabe si
   el dueño lo es porque decidió serlo—. Un botón es una decisión con fecha y
   autor; abrir una ficha no.

   Consecuencias: hace falta también **«Soltar»** (devolverlo al equipo), y la
   lista necesita distinguir tres estados —del equipo sin tomar, tomado por
   mí, tomado por otro— porque «Solo los míos» con un equipo detrás ya no es
   un sí/no.
2. **¿Un cliente puede tener equipo en un área y persona en otra?** Con el
   diseño de arriba, sí y sin esfuerzo. *Recomiendo permitirlo: es justo el
   caso de los clientes de oficina, que Pricing atiende en equipo mientras
   Ventas no tiene a nadie.*
3. **«Solo los clientes nuevos van al carrusel»** — hay que definir qué es
   nuevo: sin embarques, sin cotización ganada, o marcado a mano. *Recomiendo:
   sin cotización ganada, que es un dato que ya existe y no hay que capturar.*
4. **«Una solicitud de cliente de oficina va directo a Pricing sin pasar por
   Ventas»** — esto ya quedó parcialmente resuelto en el **bloque 1b** de este
   sprint: Pricing puede avanzar la solicitud sin esperar a Ventas. Lo que
   falta es que la solicitud **nazca** asignada a Pricing según el tipo de
   cliente, y eso necesita distinguir «cliente de oficina» en el modelo, que
   hoy no existe.

## 6. Orden propuesto

Este plan **no se puede cerrar completo sin Usuarios y roles**. Lo que sí se
puede hacer antes, y ya sirve:

1. **`equipos/{id}` y `miembrosDe`** — la función pura con tests, y el
   selector con dos grupos. Un equipo empieza a poder asignarse, y «Solo los
   míos» empieza a incluir a sus miembros. **Publicable solo.**
2. **Herencia y reasignación en el embarque** — con la decisión 1 tomada.
3. **«Cliente de oficina» como atributo del cliente**, y la solicitud que nace
   en Pricing. **Publicable solo.**
4. **Visibilidad por equipo** — *después* de Usuarios y roles, junto con las
   reglas por rol. Antes de eso sería seguridad aparente.

Los pasos 1 a 3 no tocan seguridad y se pueden publicar en cualquier orden. El
4 es el que hay que esperar.
