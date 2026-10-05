/**
 * useCorreoPrueba.ts — dispara el correo de prueba de la tarea 64.
 *
 * Llama a la Function `enviarCorreo` con el token de la sesión, igual que
 * `useActualizarTipoCambio`. La URL sale de `urlFuncion`, así que contra
 * emuladores pega al emulador de Functions y no a producción.
 */

import { useCallback, useState } from 'react';
import { auth } from '../firebase';
import { urlFuncion } from '../lib/urlFunciones';
import type { RespuestaCorreo } from '../lib/correoSaliente';

export function useCorreoPrueba() {
  const [enviando, setEnviando] = useState(false);
  const [respuesta, setRespuesta] = useState<RespuestaCorreo | null>(null);

  const enviar = useCallback(async (destino: string) => {
    setEnviando(true);
    setRespuesta(null);

    try {
      const usuario = auth.currentUser;
      if (!usuario) throw new Error('No hay sesión abierta.');

      const token = await usuario.getIdToken();
      const resp = await fetch(urlFuncion('enviarCorreo'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ destino }),
      });

      // Un 500 de la plataforma puede no traer JSON. Se dice que la Function
      // no contestó, en vez de tronar con «Unexpected token <».
      let datos: RespuestaCorreo;
      try {
        datos = await resp.json() as RespuestaCorreo;
      } catch {
        datos = {
          ok: false,
          error: `La Function contestó ${resp.status} sin un cuerpo legible. El detalle está en su log.`,
        };
      }
      setRespuesta(datos);
      return datos;
    } catch (err) {
      const datos: RespuestaCorreo = {
        ok: false,
        error: `No se pudo contactar a la Function: ${(err as Error).message}`,
      };
      setRespuesta(datos);
      return datos;
    } finally {
      setEnviando(false);
    }
  }, []);

  const limpiar = useCallback(() => setRespuesta(null), []);

  return { enviar, enviando, respuesta, limpiar };
}
