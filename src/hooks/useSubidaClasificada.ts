/**
 * useSubidaClasificada.ts — Tarea 63
 *
 * Sube UN archivo a Storage y lo manda al clasificador de n8n. Nada más: no
 * escribe en Firestore. Quien guarda es el contexto, después de que la persona
 * confirme el lote (§4.10: n8n propone, la app decide y escribe).
 *
 * Es la parte común de los tres lugares donde vive el botón «Subir
 * documentos»: el expediente del cliente, el del proveedor y la orden de
 * compra. Lo que cambia entre ellos son tres cosas y las tres son parámetros:
 * el flujo (`X-Vermur-Flujo`), la capacidad que se exige y la carpeta de
 * Storage.
 *
 * ── La clasificación es de mejor esfuerzo ──────────────────────────────────
 * Si el clasificador no contesta, el archivo YA está en Storage y no se
 * pierde: el resultado vuelve con `avisoClasificador` y sin tipo, y la
 * persona lo elige a mano. Tirar el archivo porque la IA no contestó sería
 * castigar al usuario por una falla de infraestructura — y en un lote de 15
 * documentos, uno así tiraría los 15.
 */

import { useState } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { storage } from '../firebase';
import { urlFuncion } from '../lib/urlFunciones';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import type { Capacidad } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { validarArchivo } from '../lib/documentoTarifario';
import { validarClasificacion } from '../lib/clasificacionDocumentos';

/** Lo que el contexto necesita para armar el renglón del lote. */
export interface ResultadoSubida {
  storagePath: string;
  url: string;
  nombreOriginal: string;
  /** El tipo que dijo el agente, literal. Vacío si no contestó. */
  tipoCrudo: string;
  /** El nombre que propuso el agente; cae al del archivo. */
  nombrePropuesto: string;
  confianza?: 'alta' | 'media' | 'baja';
  avisos: string[];
  observaciones?: string;
  datos?: Record<string, unknown>;
  /** D-2 · Lo que el agente leyó del documento fiscal, para ofrecer adopción. */
  rfc?: string;
  razonSocial?: string;
  /** Por qué no hubo clasificación. El archivo sí quedó subido. */
  avisoClasificador?: string;
}

export interface OpcionesSubida {
  /** Valor de `X-Vermur-Flujo`: elige el webhook y la capacidad en el server. */
  flujo: string;
  /** Capacidad que se exige en el cliente (el servidor la vuelve a exigir). */
  capacidad: Capacidad;
  /** Carpeta de Storage, sin barra final. */
  storageBasePath: string;
  /** Campos extra del multipart que el flujo espera (nombre del cliente, RFC…). */
  campos?: Record<string, string>;
}

export function useSubidaClasificada() {
  const { user } = useAuth();
  const [procesando, setProcesando] = useState(0);

  /**
   * Sube y clasifica. Lanza solo si el archivo no es válido o la subida a
   * Storage falló: ahí no hay nada que mostrar en el lote.
   */
  const subirYClasificar = async (
    file: File,
    opts: OpcionesSubida,
  ): Promise<ResultadoSubida> => {
    exigir(user?.rol as UserRole | undefined, opts.capacidad);

    const v = validarArchivo(file.name, file.type, file.size);
    if (!v.valido) throw new Error(v.motivo);

    setProcesando(n => n + 1);
    try {
      // Un solo segmento de archivo, como exige la regla de Storage. El
      // timestamp evita colisiones: subir dos veces el mismo nombre no pisa
      // el anterior — la evidencia de un documento no se edita.
      const limpio = file.name.replace(/[^\w.\-]/g, '_');
      const storagePath = `${opts.storageBasePath}/${Date.now()}-${limpio}`;
      const refStorage = ref(storage, storagePath);
      await uploadBytes(refStorage, file, { contentType: file.type || undefined });
      const url = await getDownloadURL(refStorage);

      const base: ResultadoSubida = {
        storagePath,
        url,
        nombreOriginal: file.name,
        tipoCrudo: '',
        nombrePropuesto: file.name,
        avisos: [],
      };

      try {
        const token = await getAuth().currentUser?.getIdToken();
        if (!token) throw new Error('No hay sesión activa.');

        const form = new FormData();
        form.append('archivo', file, file.name);
        for (const [k, valor] of Object.entries(opts.campos ?? {})) {
          form.append(k, valor);
        }

        const res = await fetch(urlFuncion('clasificarDocumento'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'X-Vermur-Flujo': opts.flujo },
          body: form,
        });

        const cuerpo = await res.json().catch(() => null);
        if (!res.ok) {
          const msg = (cuerpo as { error?: string })?.error
            ?? `El clasificador respondió con error ${res.status}.`;
          return { ...base, avisoClasificador: msg };
        }

        const resultado = validarClasificacion(cuerpo);
        if (!resultado.valida || !resultado.datos) {
          return {
            ...base,
            avisoClasificador: resultado.motivo ?? 'El clasificador devolvió una respuesta ilegible.',
          };
        }

        const d = resultado.datos;
        return {
          ...base,
          tipoCrudo: d.tipo,
          nombrePropuesto: d.nombrePropuesto || file.name,
          confianza: d.confianza,
          avisos: d.avisos,
          observaciones: d.observaciones || undefined,
          datos: d.datos,
          rfc: d.rfc || undefined,
          razonSocial: d.razonSocial || undefined,
        };
      } catch (err) {
        // El archivo ya está en Storage: se devuelve sin tipo, con el motivo.
        return {
          ...base,
          avisoClasificador: err instanceof Error ? err.message : 'No se pudo clasificar el documento.',
        };
      }
    } finally {
      setProcesando(n => n - 1);
    }
  };

  return { procesando: procesando > 0, subirYClasificar };
}
