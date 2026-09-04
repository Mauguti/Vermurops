/**
 * useExpedienteCliente.ts (D-2)
 *
 * El expediente KYC del cliente: subir el documento, clasificarlo con IA, y
 * guardar SOLO lo que el usuario confirmó en la pantalla de revisión.
 *
 * Mismo patrón que useDocumentosTarifario: una sola subida, dos usos — el
 * archivo queda en Storage como evidencia y su contenido va al clasificador.
 * n8n interpreta y propone; la app valida y escribe.
 */

import { useState } from 'react';
import { db, storage } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { validarArchivo } from '../lib/documentoTarifario';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { conAviso } from '../lib/erroresEscritura';
import { derivarDocsAlta, type DocExpediente, type TipoDocExpediente } from '../lib/clasificacionDocumentos';
import type { ClienteVermur, DocsAlta } from '../components/clientes/ClientesData';

/**
 * La función enrutada (D-0). El flujo va en el header X-Vermur-Flujo; la
 * Function exige la capacidad de ESTE flujo (cliente.alta) del lado servidor.
 */
const URL_CLASIFICADOR =
  'https://us-central1-vermur-logistics-app.cloudfunctions.net/clasificarDocumento';

export interface ArchivoSubido {
  storagePath: string;
  url: string;
  nombreOriginal: string;
  /** Respuesta CRUDA del clasificador; se valida con validarClasificacion. */
  clasificacion: unknown;
}

export function useExpedienteCliente() {
  const { user } = useAuth();
  const [procesando, setProcesando] = useState(false);

  /**
   * Sube el archivo a Storage y lo manda al clasificador. No escribe nada en
   * el cliente: eso pasa en guardarDocumento, después de la revisión.
   */
  const subirYClasificar = async (
    file: File,
    cliente: Pick<ClienteVermur, 'id' | 'nombre' | 'rfc'>,
    tipoEsperado: TipoDocExpediente | null,
  ): Promise<ArchivoSubido> => {
    exigir(user?.rol as UserRole | undefined, 'cliente.alta');

    const v = validarArchivo(file.name, file.type, file.size);
    if (!v.valido) throw new Error(v.motivo);

    setProcesando(true);
    try {
      // Un solo segmento de archivo, como exige la regla de Storage. El
      // timestamp evita colisiones: re-subir un tipo NO pisa el archivo
      // anterior — la referencia de la ficha cambia, el historial queda.
      const limpio = file.name.replace(/[^\w.\-]/g, '_');
      const storagePath = `expedientes/${cliente.id}/${Date.now()}-${limpio}`;

      const refStorage = ref(storage, storagePath);
      await uploadBytes(refStorage, file, { contentType: file.type || undefined });
      const url = await getDownloadURL(refStorage);

      const token = await getAuth().currentUser?.getIdToken();
      if (!token) throw new Error('No hay sesión activa.');

      const form = new FormData();
      form.append('archivo', file, file.name);
      form.append('clienteNombre', cliente.nombre);
      form.append('clienteRfc', cliente.rfc ?? '');
      if (tipoEsperado) form.append('tipoEsperado', tipoEsperado);

      const res = await fetch(URL_CLASIFICADOR, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Vermur-Flujo': 'expediente',
        },
        body: form,
      });

      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (cuerpo as { error?: string })?.error
          ?? `El clasificador respondió con error ${res.status}.`;
        throw new Error(msg);
      }

      return { storagePath, url, nombreOriginal: file.name, clasificacion: cuerpo };
    } finally {
      setProcesando(false);
    }
  };

  /**
   * Guarda lo confirmado en la revisión: la referencia del documento bajo su
   * tipo, el booleano de docsAlta encendido, y los campos de la ficha que el
   * usuario adoptó explícitamente (puede ser ninguno).
   */
  const guardarDocumento = async (
    cliente: ClienteVermur,
    tipo: TipoDocExpediente,
    documento: DocExpediente,
    camposAdoptados: Partial<Pick<ClienteVermur, 'rfc' | 'representante' | 'domicilio' | 'codigoPostal'>>,
  ): Promise<{ expediente: NonNullable<ClienteVermur['expediente']>; docsAlta: DocsAlta }> => {
    exigir(user?.rol as UserRole | undefined, 'cliente.alta');

    const conAutor = { ...documento, subidoPor: user?.email ?? user?.uid ?? '' };
    const expediente = { ...(cliente.expediente ?? {}), [tipo]: conAutor };
    const docsAlta = derivarDocsAlta(
      cliente.docsAlta ?? { acta: false, poder: false, identificacion: false, csf: false, comprobante: false, bancaria: false },
      expediente,
    );

    await conAviso('el documento del expediente', () =>
      updateDoc(doc(db, 'clientes', cliente.id), sanitizarParaFirestore({
        expediente,
        docsAlta,
        ...camposAdoptados,
        updatedAt: new Date().toISOString(),
      }) as Record<string, unknown>));

    return { expediente, docsAlta };
  };

  return { procesando, subirYClasificar, guardarDocumento };
}
