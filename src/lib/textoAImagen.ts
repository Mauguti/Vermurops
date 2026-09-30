/**
 * textoAImagen.ts
 *
 * Convierte texto pegado (un correo con tarifas) en una imagen PNG legible.
 *
 * ¿Por qué? El flujo de n8n trata todo como imagen. Un .txt falla con
 * «Could not process image». Mientras no se corrija el flujo, la app
 * renderiza el texto como PNG y eso sí lo lee bien.
 *
 * Sin React, sin Firestore, sin red. Solo canvas del navegador.
 */

const ANCHO = 900;
const PADDING = 32;
const FONT_SIZE = 14;
const LINE_HEIGHT = 20;
const FONT = `${FONT_SIZE}px "Courier New", Courier, monospace`;

/**
 * Divide el texto en líneas que quepan en el ancho disponible.
 *
 * Respeta los saltos de línea del original y hace word-wrap donde no cabe.
 * Exportada para tests.
 */
export function dividirEnLineas(
  texto: string,
  ctx: CanvasRenderingContext2D,
  maxWidth: number,
): string[] {
  const lineas: string[] = [];

  for (const parrafo of texto.split('\n')) {
    if (!parrafo.trim()) {
      lineas.push('');
      continue;
    }

    // Intentar la línea completa primero (caso común: líneas cortas)
    if (ctx.measureText(parrafo).width <= maxWidth) {
      lineas.push(parrafo);
      continue;
    }

    const palabras = parrafo.split(/(\s+)/); // conserva los espacios
    let actual = '';
    for (const palabra of palabras) {
      const prueba = actual + palabra;
      if (ctx.measureText(prueba).width > maxWidth && actual) {
        lineas.push(actual);
        actual = palabra.trimStart();
      } else {
        actual = prueba;
      }
    }
    if (actual) lineas.push(actual);
  }

  return lineas;
}

/**
 * Renderiza el texto como una imagen PNG.
 *
 * Devuelve un File listo para subir al extractor, con nombre
 * `correo-YYYY-MM-DD.png` y tipo `image/png`.
 *
 * El fondo es blanco, el texto negro, monoespaciado, con padding generoso
 * para que el OCR lo lea bien. Un texto muy largo produce una imagen alta
 * (no se pagina: es un solo archivo para el extractor).
 */
export async function textoAImagen(texto: string): Promise<File> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = FONT;

  const maxWidth = ANCHO - PADDING * 2;
  const lineas = dividirEnLineas(texto, ctx, maxWidth);

  const alto = Math.max(200, lineas.length * LINE_HEIGHT + PADDING * 2);

  canvas.width = ANCHO;
  canvas.height = alto;

  // Fondo blanco
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ANCHO, alto);

  // Texto negro
  ctx.fillStyle = '#1a1a1a';
  ctx.font = FONT;
  ctx.textBaseline = 'top';

  lineas.forEach((linea, i) => {
    ctx.fillText(linea, PADDING, PADDING + i * LINE_HEIGHT);
  });

  return new Promise<File>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('No se pudo generar la imagen del texto.'));
          return;
        }
        resolve(new File(
          [blob],
          `correo-${new Date().toISOString().slice(0, 10)}.png`,
          { type: 'image/png' },
        ));
      },
      'image/png',
    );
  });
}
