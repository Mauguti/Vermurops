# Flujos de n8n

Los flujos VIVEN en n8n.vermur.mx; aquí se versiona su JSON para que un
cambio quede en git y se pueda volver a importar. Importar: n8n → Workflows
→ Import from File. Después de importar, **activar** el flujo (toggle arriba
a la derecha): la URL de producción `/webhook/...` solo responde activo.

| Archivo | Webhook | Qué hace |
|---|---|---|
| `generar-pdf-cotizacion.n8n.json` | `POST /webhook/generar-pdf-cotizacion` | Recibe el payload de `lib/pdfCotizacion.ts`, arma el HTML, Gotenberg lo convierte y devuelve `application/pdf`. Si algo falla, responde JSON `{ ok: false, error }` con 502. |

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

**Pendiente de seguridad.** El flujo NO valida `X-Vermur-Token`: cualquiera
que conozca la URL genera PDFs a costa de Vermur. Los otros flujos sí lo
validan; falta agregar el mismo nodo aquí (decisión de Mau: cómo se compara
el token en n8n).
