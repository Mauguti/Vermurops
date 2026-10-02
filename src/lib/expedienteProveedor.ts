/**
 * expedienteProveedor.ts
 *
 * Configuración y lógica del expediente del proveedor (tarea 54).
 *
 * La lista de documentos por tipo (nacional / extranjero) vive aquí,
 * en un solo lugar fácil de cambiar, porque Julio todavía puede ajustarla.
 *
 * Reusa DocsAlta del cliente: los mismos booleanos, distinto checklist.
 * Sin React, sin Firestore.
 */

import type { DocsAlta } from '../components/clientes/ClientesData';

// ─── Qué documentos aplican por tipo de proveedor ───────────────────────────

export interface DocExpedienteConfig {
  /** Clave en DocsAlta. */
  campo: keyof DocsAlta;
  /** Etiqueta visible. */
  etiqueta: string;
}

/**
 * Documentos para un proveedor nacional (México).
 *
 * Fuente: minuta de Administración §2.8 — CSF, comprobante de domicilio,
 * estado de cuenta bancario y actas constitutivas cuando hay línea de crédito.
 * Las actas se piden siempre porque Julio las quiere tener.
 */
export const DOCS_PROVEEDOR_NACIONAL: DocExpedienteConfig[] = [
  { campo: 'csf', etiqueta: 'Constancia de Situación Fiscal' },
  { campo: 'comprobante', etiqueta: 'Comprobante de domicilio' },
  { campo: 'bancaria', etiqueta: 'Estado de cuenta bancario' },
  { campo: 'acta', etiqueta: 'Acta constitutiva' },
];

/**
 * Documentos para un proveedor extranjero.
 *
 * La Constancia de Situación Fiscal del SAT no aplica; en su lugar,
 * el documento fiscal de su país. Se mapea al mismo campo (csf) para
 * no crear un campo nuevo.
 */
export const DOCS_PROVEEDOR_EXTRANJERO: DocExpedienteConfig[] = [
  { campo: 'csf', etiqueta: 'Documento fiscal de su país' },
  { campo: 'comprobante', etiqueta: 'Comprobante de domicilio' },
  { campo: 'bancaria', etiqueta: 'Estado de cuenta bancario' },
  { campo: 'acta', etiqueta: 'Acta constitutiva o equivalente' },
];

/** Default para el docsAlta del proveedor (nada marcado). */
export const DOCS_ALTA_PROVEEDOR_DEFAULT: DocsAlta = {
  acta: false,
  poder: false,
  identificacion: false,
  csf: false,
  comprobante: false,
  bancaria: false,
};

// ─── ¿Es extranjero? ───────────────────────────────────────────────────────

/**
 * Un proveedor es extranjero si su país no es México.
 * Heurística: si no tiene dato de país, se asume nacional.
 */
export function esProveedorExtranjero(proveedor: { direccion?: { pais?: string | null } | null }): boolean {
  const pais = proveedor.direccion?.pais?.trim().toUpperCase();
  if (!pais) return false;
  // "MX", "MEX", "MEXICO", "MÉXICO" → nacional
  return !['MX', 'MEX', 'MEXICO', 'MÉXICO'].includes(pais);
}

/** Devuelve la lista de documentos que aplica para este proveedor. */
export function docsParaProveedor(proveedor: { direccion?: { pais?: string | null } | null }): DocExpedienteConfig[] {
  return esProveedorExtranjero(proveedor) ? DOCS_PROVEEDOR_EXTRANJERO : DOCS_PROVEEDOR_NACIONAL;
}

// ─── Cuántos documentos faltan ──────────────────────────────────────────────

export interface ResumenExpedienteProveedor {
  total: number;
  cargados: number;
  faltantes: string[];
}

/** Cuenta cuántos documentos del checklist están marcados. */
export function resumenExpediente(
  docsAlta: DocsAlta | undefined,
  docs: DocExpedienteConfig[],
): ResumenExpedienteProveedor {
  const da = docsAlta ?? DOCS_ALTA_PROVEEDOR_DEFAULT;
  const faltantes: string[] = [];
  let cargados = 0;
  for (const d of docs) {
    if (da[d.campo]) {
      cargados++;
    } else {
      faltantes.push(d.etiqueta);
    }
  }
  return { total: docs.length, cargados, faltantes };
}
