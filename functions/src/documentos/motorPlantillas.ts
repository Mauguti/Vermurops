/**
 * motorPlantillas.ts — motor mínimo de plantillas HTML.
 *
 * Sin librerías pesadas: marcadores `{{campo}}` con escape de HTML, formato
 * de fechas y montos en un solo lugar. Las plantillas son archivos HTML del
 * repo que la Cloud Function lee con `fs.readFileSync`.
 *
 * ── Convenciones ──────────────────────────────────────────────────────────
 * - `{{campo}}`       → valor escapado (HTML entities)
 * - `{{!campo}}`      → valor sin escapar (para HTML inyectado, ej. tablas)
 * - Campos ausentes   → cadena vacía (nunca "undefined")
 * - Punto anidado     → `{{empresa.razonSocial}}` busca datos.empresa.razonSocial
 */

/** Escapa HTML entities para prevenir XSS. */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Resuelve un campo anidado con punto: 'empresa.rfc' → datos.empresa.rfc */
function resolver(datos: Record<string, unknown>, ruta: string): unknown {
  const partes = ruta.split('.');
  let actual: unknown = datos;
  for (const parte of partes) {
    if (actual == null || typeof actual !== 'object') return undefined;
    actual = (actual as Record<string, unknown>)[parte];
  }
  return actual;
}

/** Convierte cualquier valor a string para la plantilla. */
function aTexto(valor: unknown): string {
  if (valor == null) return '';
  if (typeof valor === 'number') return String(valor);
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  return String(valor);
}

/**
 * Rellena una plantilla HTML con los datos proporcionados.
 *
 * @param plantilla — el HTML con marcadores `{{campo}}` o `{{!campo}}`
 * @param datos — objeto plano o anidado con los valores
 * @returns el HTML con los marcadores reemplazados
 */
export function renderizar(plantilla: string, datos: Record<string, unknown>): string {
  // Primero los sin escapar ({{!campo}}), luego los escapados ({{campo}})
  return plantilla
    .replace(/\{\{!(\s*[\w.]+\s*)\}\}/g, (_match, campo: string) => {
      return aTexto(resolver(datos, campo.trim()));
    })
    .replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (_match, campo: string) => {
      return escaparHtml(aTexto(resolver(datos, campo.trim())));
    });
}

/** Formatea una fecha ISO a formato legible: "1 de octubre de 2026". */
export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '';
  const fecha = new Date(iso);
  if (isNaN(fecha.getTime())) return iso;
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  return `${fecha.getDate()} de ${meses[fecha.getMonth()]} de ${fecha.getFullYear()}`;
}

/** Formatea una fecha ISO a formato corto: "01/10/2026". */
export function formatearFechaCorta(iso: string | null | undefined): string {
  if (!iso) return '';
  const fecha = new Date(iso);
  if (isNaN(fecha.getTime())) return iso;
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${fecha.getFullYear()}`;
}

/** Formatea un monto con separador de miles y dos decimales. */
export function formatearMonto(valor: number | null | undefined, moneda?: string): string {
  if (valor == null) return '';
  const formateado = valor.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (moneda) return `${moneda} $${formateado}`;
  return `$${formateado}`;
}
