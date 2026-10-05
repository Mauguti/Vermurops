/**
 * correoSaliente.ts — qué se le dice a la pantalla cuando el correo de prueba
 * sale o no sale.
 *
 * Lógica PURA: sin React, sin fetch. El envío lo hace la Function
 * `enviarCorreo` (tarea 64); aquí vive la traducción de su respuesta a lo que
 * se pinta.
 *
 * ── Por qué no alcanza «no se pudo enviar el correo» ───────────────────────
 * Las causas piden acciones de personas distintas, y el punto 3 de la tarea lo
 * pide explícito: «que diga claro si falló la autenticación, la conexión o el
 * envío». Un mensaje genérico manda a Mau a revisar las cuatro cosas.
 *
 * El caso que más va a aparecer la primera vez es el de Microsoft 365: el
 * envío por SMTP con usuario y contraseña viene APAGADO por omisión y lo tiene
 * que encender el administrador de Exchange para ese buzón. Se lee como
 * «contraseña mala» y no lo es, así que tiene su propio aviso.
 */

/** Etapas que reconoce la Function. Espejo de `EtapaFalla` en functions/. */
export type EtapaCorreo = 'configuracion' | 'conexion' | 'autenticacion' | 'envio' | 'desconocida';

export interface DiagnosticoCorreo {
  etapa?: EtapaCorreo;
  mensaje?: string;
  sugerencia?: string;
  smtpAuthApagado?: boolean;
}

/** Lo que contesta `enviarCorreo`. Todo opcional: una respuesta rara no truena. */
export interface RespuestaCorreo {
  ok?: boolean;
  modo?: 'smtp' | 'captura';
  mensaje?: string;
  destino?: string;
  mensajeId?: string;
  rechazados?: string[];
  diagnostico?: DiagnosticoCorreo;
  /** El 401/403 del proxy viene así, sin `diagnostico`. */
  error?: string;
}

export type TonoCorreo = 'exito' | 'aviso' | 'error';

export interface ResumenCorreo {
  tono: TonoCorreo;
  /** Una línea para el encabezado del resultado. */
  titulo: string;
  /** El detalle, cuando aporta algo distinto al título. */
  detalle?: string;
  /** Qué hacer. */
  sugerencia?: string;
}

/** Cómo se llama cada etapa en pantalla. */
export const ETIQUETA_ETAPA: Record<EtapaCorreo, string> = {
  configuracion: 'Falta configuración',
  conexion: 'Falló la conexión',
  autenticacion: 'Falló la autenticación',
  envio: 'Falló el envío',
  desconocida: 'Falló por un motivo no identificado',
};

/**
 * De la respuesta de la Function al bloque que se pinta.
 *
 * El modo `captura` es `aviso` y no `exito` a propósito: el mensaje se armó
 * bien y **no salió a ningún lado**. Pintarlo en verde haría creer que el
 * correo llegó, que es exactamente la confusión que esta pantalla existe para
 * evitar.
 */
export function resumenDeRespuesta(respuesta: RespuestaCorreo | null | undefined): ResumenCorreo {
  if (!respuesta) {
    return { tono: 'error', titulo: 'No hubo respuesta del servidor.' };
  }

  if (respuesta.ok && respuesta.modo === 'captura') {
    return {
      tono: 'aviso',
      titulo: 'Correo armado, no enviado.',
      detalle: 'Estás contra emuladores: el mensaje se construyó completo y se capturó sin salir a internet.',
      sugerencia: 'Para probar el envío real hace falta producción con los dos secretos puestos.',
    };
  }

  if (respuesta.ok) {
    const rechazados = respuesta.rechazados ?? [];
    if (rechazados.length > 0) {
      return {
        tono: 'aviso',
        titulo: 'Exchange aceptó el mensaje y rechazó destinatarios.',
        detalle: `Rechazados: ${rechazados.join(', ')}.`,
      };
    }
    return {
      tono: 'exito',
      titulo: respuesta.destino
        ? `Correo enviado a ${respuesta.destino}.`
        : 'Correo enviado.',
      detalle: respuesta.mensajeId ? `Id del mensaje: ${respuesta.mensajeId}` : undefined,
      sugerencia: 'Si no aparece en unos minutos, revisar la carpeta de correo no deseado.',
    };
  }

  // Sin diagnóstico: es el rechazo de la propia Function (sesión o permiso).
  const d = respuesta.diagnostico;
  if (!d?.etapa) {
    return {
      tono: 'error',
      titulo: respuesta.error ?? respuesta.mensaje ?? 'El envío falló.',
    };
  }

  return {
    tono: 'error',
    titulo: ETIQUETA_ETAPA[d.etapa] ?? ETIQUETA_ETAPA.desconocida,
    detalle: d.mensaje ?? respuesta.mensaje,
    sugerencia: d.sugerencia,
  };
}

/**
 * ¿Hay que enseñar el aviso grande de SMTP AUTH?
 *
 * Es el único caso donde la acción no es nuestra: la enciende el
 * administrador de Microsoft 365 y nadie más.
 */
export function pideEncenderSmtpAuth(respuesta: RespuestaCorreo | null | undefined): boolean {
  return respuesta?.diagnostico?.smtpAuthApagado === true;
}
