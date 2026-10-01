# Flujos de n8n

Los flujos VIVEN en n8n.vermur.mx; aquí se versiona su JSON para que un
cambio quede en git y se pueda volver a importar. Importar: n8n → Workflows
→ Import from File. Después de importar, **activar** el flujo (toggle arriba
a la derecha): la URL de producción `/webhook/...` solo responde activo.

| Archivo | Webhook | Qué hace |
|---|---|---|
| `generar-pdf-cotizacion.n8n.json` | `POST /webhook/generar-pdf-cotizacion` | Recibe el payload de `lib/pdfCotizacion.ts`, arma el HTML, Gotenberg lo convierte y devuelve `application/pdf`. Si algo falla, responde JSON `{ ok: false, error }` con 502. |
| `generar-documento.n8n.json` | `POST /webhook/generar-documento` | Convertidor HTML→PDF para TODOS los documentos operativos. Recibe `{ html, nombreArchivo, tipo, pagina? }`, Gotenberg lo convierte con `preferCssPageSize` y `printBackground`, y devuelve `application/pdf`. Error: JSON 502. |

Las plantillas HTML NO viven en n8n: las llena una Cloud Function desde el
repo y n8n solo convierte. Un payload de prueba, en `pruebas/`.

## El token: credencial de n8n, no variable de entorno

Los dos webhooks usan la **autenticación propia de n8n**: `Header Auth` con
la credencial **«X-Vermur-Token»** (nombre de cabecera `X-Vermur-Token`,
valor = el secreto de Firebase). n8n la guarda cifrada y rechaza por su
cuenta con **403** cuando falta o no coincide.

**Al importar cualquiera de los dos JSON hay que elegir la credencial a
mano**: el JSON la refiere solo por NOMBRE, sin `id` y sin valor, para que el
secreto no viva en git. n8n la deja marcada en rojo hasta que se selecciona.

Crearla una vez, si no existe:

1. n8n → **Credentials** → **New** → tipo **Header Auth**.
2. Nombre de la credencial: `X-Vermur-Token` (igual que la cabecera, para
   no tener dos nombres que recordar).
3. *Name*: `X-Vermur-Token` · *Value*: el secreto.
   Para cotejarlo: `npx firebase functions:secrets:access VERMUR_N8N_TOKEN`.
4. En cada webhook: *Authentication* → **Header Auth** → elegir
   «X-Vermur-Token».

### Por qué se dejó de validar con `process.env` (1-oct-2026)

Los flujos traían un nodo Code «Valida token» que comparaba la cabecera
contra `process.env.VERMUR_N8N_TOKEN`, y un «Rechaza sin token» que
contestaba 401.

**n8n nunca vio esa variable**, así que el flujo respondía **401 a todo**,
también con el token correcto —comprobado con curl y un token de 64
caracteres—. n8n bloquea el acceso a las variables de entorno desde los nodos
Code salvo que se habilite explícitamente, y en esta instancia no estaban
cargadas. Un flujo que rechaza siempre es peor que uno abierto: parece
seguridad y es un bloqueo.

La autenticación propia de n8n no depende del entorno del nodo: la credencial
vive cifrada en n8n y la aplica el webhook antes de ejecutar nada.

El proxy (`functions/src/comun/proxyN8n.ts`) trata **401 y 403 igual**, como
«n8n rechazó el token» — ver `comun/mensajesN8n.ts` y sus tests.

**Rollback:** volver a importar la versión anterior del JSON desde git:

```bash
git show HEAD~1:docs/n8n/generar-documento.n8n.json > /tmp/anterior.json
git show HEAD~1:docs/n8n/generar-pdf-cotizacion.n8n.json > /tmp/anterior-pdf.json
```

e importarlos en n8n. Vuelven los nodos «Valida token» y «Rechaza sin
token» — y con ellos el 401 permanente, así que solo tiene sentido si además
se le cargan las variables de entorno a n8n.

## generar-pdf-cotizacion — historia

**24-sep-2026.** El PDF salía «roto»: siempre 7,883 bytes, una sola línea
ilegible, una sola fuente serif. Causa: el nodo «HTML a archivo» (Convert to
File · Move Base64 String to File) espera BASE64 en la propiedad y recibía el
HTML en texto plano; decodificaba 14 bytes de basura y Gotenberg pintaba eso.
Se reprodujo con Gotenberg local: el HTML «decodificado como base64» da un
PDF de exactamente 7,883 bytes; el HTML correcto, 42 KB con Liberation Sans
y Mono. Arreglo: el binario se arma en el Code «Arma el HTML» con
`this.helpers.prepareBinaryData(Buffer.from(html, 'utf8'), 'index.html',
'text/html')`; los nodos «HTML a archivo» y «Renombra a index.html» se
retiran. La propiedad binaria se llama `archivo` (sin punto) y el nombre de
archivo es `index.html`, que Gotenberg exige.

**Rama de error.** Antes, si Gotenberg fallaba, el webhook nunca respondía y
la Cloud Function esperaba hasta el timeout. Ahora «Arma el HTML»,
«Gotenberg convierte» y «Prepara respuesta» tienen salida de error
(`onError: continueErrorOutput`) hacia «Arma el error» → «Devuelve el error»
(JSON, 502). «Prepara respuesta» además verifica que el binario empiece con
`%PDF-`.

**Seguridad (29-sep-2026).** El nodo «Valida token» (Code, con
`onError: continueErrorOutput`) lee `headers['x-vermur-token']` y lo compara
contra `process.env.VERMUR_N8N_TOKEN`. Sin token o con token incorrecto
responde 401 JSON `{ ok: false, error: 'No autorizado.' }` vía «Rechaza sin
token» (Respond to Webhook). Si la variable no existe en n8n, el nodo falla
con un mensaje claro. El proxy (`proxyN8n.ts:156`) ya manda el header a todos
los flujos, así que la app sigue funcionando igual; solo se cierra el acceso
directo al webhook.

**Configuración requerida en n8n:** variable de entorno `VERMUR_N8N_TOKEN` con
el mismo valor que está en Firebase Secret Manager. Si n8n corre en Docker,
se pone en `docker-compose.yml` o en el `.env` de n8n. Verificar que el valor
coincida con `firebase functions:secrets:access VERMUR_N8N_TOKEN`.

**Rollback:** importar la versión anterior del JSON desde git
(`git show HEAD~1:docs/n8n/generar-pdf-cotizacion.n8n.json`), que no trae el
nodo de validación. O desactivar el flujo nuevo y reactivar el anterior desde
el historial de versiones de n8n.
