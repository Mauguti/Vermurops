/**
 * useDocumentosEmbarque.ts (D-3)
 *
 * Subir un documento del embarque, clasificarlo con IA, y devolver la
 * propuesta para la pantalla de revisión. No escribe en el embarque: eso lo
 * hace la ficha con lo que el usuario confirmó.
 *
 * Mismo patrón que useExpedienteCliente: el archivo queda en Storage como
 * evidencia y su contenido va al clasificador. n8n propone; la app decide.
 */

import { useState } from 'react';
import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { validarArchivo } from '../lib/documentoTarifario';
import { validarClasificacion } from '../lib/clasificacionDocumentos';
import { contenedoresDelEmbarque, type SubidaClasificada } from '../lib/documentosEmbarque';
import type { EmbarqueCompleto } from '../components/shipments/EmbarquesData';

/** La función enrutada (D-0). El flujo va en el header X-Vermur-Flujo. */
const URL_CLASIFICADOR =
  'https://us-central1-vermur-logistics-app.cloudfunctions.net/clasificarDocumento';

export function useDocumentosEmbarque() {
  const { user } = useAuth();
  const [procesando, setProcesando] = useState(false);

  const subirYClasificar = async (
    file: File,
    embarque: EmbarqueCompleto,
    tipoEsperado: string | null,
  ): Promise<SubidaClasificada> => {
    // La misma capacidad que exige la Function del lado del servidor.
    exigir(user?.rol as UserRole | undefined, 'embarque.generar');

    const v = validarArchivo(file.name, file.type, file.size);
    if (!v.valido) throw new Error(v.motivo);

    setProcesando(true);
    try {
      // Un solo segmento, como exige la regla embarques/{id}/docs/{archivo}.
      // El timestamp evita pisar: la evidencia de un documento no se edita.
      const limpio = file.name.replace(/[^\w.\-]/g, '_');
      const storagePath = `embarques/${embarque.id}/docs/${Date.now()}-${limpio}`;

      const refStorage = ref(storage, storagePath);
      await uploadBytes(refStorage, file, { contentType: file.type || undefined });
      const url = await getDownloadURL(refStorage);

      const token = await getAuth().currentUser?.getIdToken();
      if (!token) throw new Error('No hay sesión activa.');

      /*
       * El contexto que n8n usa para cotejar: folio, cliente, modalidad y los
       * contenedores del embarque. Los contenedores van como JSON en un solo
       * campo (multipart no tiene arrays).
       */
      const form = new FormData();
      form.append('archivo', file, file.name);
      form.append('embarqueFolio', embarque.folio);
      form.append('clienteNombre', embarque.entidades?.clienteCobrar ?? '');
      form.append('modalidad', embarque.modalidad);
      form.append('contenedores', JSON.stringify(contenedoresDelEmbarque(embarque)));
      if (tipoEsperado) form.append('tipoEsperado', tipoEsperado);

      const res = await fetch(URL_CLASIFICADOR, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Vermur-Flujo': 'documento-embarque',
        },
        body: form,
      });

      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (cuerpo as { error?: string })?.error
          ?? `El clasificador respondió con error ${res.status}.`;
        throw new Error(msg);
      }

      const validada = validarClasificacion(cuerpo);
      if (!validada.valida || !validada.datos) {
        throw new Error(validada.motivo ?? 'El clasificador devolvió una respuesta ilegible.');
      }

      return { storagePath, url, nombreOriginal: file.name, clasificacion: validada.datos };
    } finally {
      setProcesando(false);
    }
  };

  return { procesando, subirYClasificar, autor: user?.email ?? user?.nombre ?? '' };
}
