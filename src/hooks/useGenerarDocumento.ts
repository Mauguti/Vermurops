/**
 * useGenerarDocumento.ts — hook para llamar a la Cloud Function generarDocumento.
 *
 * La Function lee el embarque, renderiza la plantilla, convierte a PDF con n8n,
 * guarda en Storage y registra en `documentosGenerados` con `arrayUnion`. El
 * hook solo hace la llamada HTTP, valida la respuesta y devuelve el registro.
 */

import { useState } from 'react';
import { getAuth } from 'firebase/auth';
import { urlFuncion } from '../lib/urlFunciones';
import type { DocumentoGenerado, TipoDocEmbarque } from '../lib/documentosOperativos';

const URL_FUNCION = () => urlFuncion('generarDocumento');

function mensajeSinCuerpo(status: number): string {
  if (status === 401 || status === 403) return 'Tu sesión no tiene permiso para generar documentos.';
  if (status === 502 || status === 503 || status === 504) {
    return 'El generador de documentos no está disponible. Vuelve a intentarlo en unos minutos.';
  }
  return `El generador respondió con error ${status}.`;
}

export function useGenerarDocumento() {
  const [generando, setGenerando] = useState(false);

  const generar = async (
    embarqueId: string,
    tipo: TipoDocEmbarque,
    parametros?: Record<string, unknown>,
  ): Promise<DocumentoGenerado> => {
    setGenerando(true);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      if (!token) throw new Error('No hay sesión activa.');

      const res = await fetch(URL_FUNCION(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tipo, embarqueId, parametros }),
      });

      if (!res.ok) {
        const cuerpo = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(cuerpo?.error ?? mensajeSinCuerpo(res.status));
      }

      const data = await res.json() as { ok: boolean; documento: DocumentoGenerado };
      if (!data.ok || !data.documento) {
        throw new Error('La respuesta del generador no contiene el documento.');
      }

      return data.documento;
    } finally {
      setGenerando(false);
    }
  };

  return { generando, generar };
}
