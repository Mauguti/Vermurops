# La regla de Firestore para `pagos/` (tarea 68 · P2)

**Esto se publica ANTES del hosting de la rama `sprint/68-escribir-pagos`.**
Sin ella, registrar un cobro o un depósito falla con `permission-denied` y la
cobranza de Administración no guarda nada. El fallo es visible —un aviso rojo
que dice qué pasó— pero es un fallo: el dinero no queda registrado.

El sprint nocturno no edita `firestore.rules` (límite 4 de `sprint/SPRINT.md`),
así que el bloque viene aquí, escrito completo y listo para pegar.

## Dónde va

En `firestore.rules`, **justo después del bloque de `cobros/{id}`** (hoy la
última llave de ese grupo), para que las tres colecciones del lado del dinero
del cliente queden juntas y se lean en orden: facturas → cobros (legado) →
pagos.

## El bloque

```
    // ── Pagos (PLAN-PAGOS §1.1 · tarea 68 / P2) ──────────────────────────
    // Un documento por movimiento real de dinero —una transferencia que
    // salió, una entrada que llegó— con sus aplicaciones dentro.
    //
    // Sustituye la ESCRITURA de `cobros/` y `depositosCliente/`, que quedan
    // de solo lectura: lo que ya está ahí no se migra y se sigue leyendo.
    //
    // Eliminar está prohibido, por lo mismo que en las otras tres: un
    // movimiento de dinero existió. Un pago mal aplicado se anula con
    // activo=false y lo aplicado desaparece solo, porque se DERIVA de las
    // aplicaciones vivas.
    //
    // ⚠️ Nace con esDelEquipo(), como todo lo demás: cualquiera del equipo
    // puede escribir un pago desde la consola de Firebase. Con dinero de
    // verdad en esta colección, la deuda de §6 —las reglas no distinguen
    // roles— sube de prioridad. Lo correcto es exigir la capacidad
    // `cobro.registrar` / `ordenCompra.autorizar`, y eso necesita el rol en
    // el token (plan de la tarea 53).
    match /pagos/{id} {
      allow read:   if esDelEquipo();
      allow create: if esDelEquipo();
      allow update: if esDelEquipo();
      allow delete: if false;
    }
```

## Cómo se publica

Desde el **checkout principal** y con `--only`, nunca `firebase deploy` a
secas (§3 de CLAUDE.md):

```bash
cd /Users/mauriciogutierrezmunoz/antigravity/Vermur-Logistics && \
  npx firebase deploy --only firestore:rules
```

**«skipping upload» se lee como FALLO.** Lo que confirma que sí subió es:

```
i  firestore: uploading rules firestore.rules...
```

Si en su lugar dice `latest version of firestore.rules already up to date,
skipping upload…`, el comando corrió contra otro checkout o contra otra rama
y no subió nada, aunque termine en ✔ verde.

## El contador

No hace falta ninguna regla nueva: el folio `PAG-2026-0001` vive en
`contadores/pagos`, y `contadores/{id}` ya tiene lectura y escritura
publicadas. Es la misma razón por la que el interruptor de embarque
automático se puso ahí (§4.31).

## Cómo verificar que quedó

1. Publicar la regla (arriba).
2. `npm run test:reglas` — las 13 pruebas contra las reglas de PRODUCCIÓN
   siguen en verde (el bloque nuevo no cambia ninguna de las existentes).
3. `./scripts/e2e.sh` — el recorrido completo. El paso 6 (Administración
   deposita, autoriza, paga, factura y cobra) es el que toca `pagos/`:
   mientras la regla no esté, ese paso falla con el aviso
   «Firestore rechazó la escritura en «pagos»».
4. En el navegador: Finanzas → Cuentas por cobrar → registrar un cobro. Debe
   aparecer el toast de éxito y el saldo de la factura bajar.

## Lo que NO entra aquí

`saldosCuenta/` (P8, flujo de efectivo) necesitará su propio bloque. No se
adelanta: una colección con regla publicada y sin código que la escriba es
superficie abierta sin nadie que la use.
