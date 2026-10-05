/**
 * configuracionSmtp.ts — dónde y cómo se conecta el correo saliente.
 *
 * Lógica PURA: recibe un mapa de variables de entorno y devuelve la
 * configuración. Así los valores por omisión se prueban sin levantar nada.
 *
 * ── Por qué variables de entorno y no `defineString` ───────────────────────
 * El repo ya usa `defineString` para las URLs de n8n, y eso tuvo un costo
 * documentado en CLAUDE.md §3: **cada `defineString` nuevo detiene el deploy
 * de Functions preguntando** por su valor, con el default entre paréntesis.
 * Las tareas 40 y 51 agregaron uno cada una y dejaron el despliegue sin poder
 * correr desatendido.
 *
 * Host, puerto y nombre del remitente no son secretos y casi nunca van a
 * cambiar: `smtp.office365.com:587` es lo mismo para todos los tenants de
 * Microsoft 365. Leerlos de `process.env` con default en el código da la misma
 * capacidad de configurarlos —`functions/.env.vermur-logistics-app`, el mismo
 * archivo donde quedaron los dos parámetros anteriores— sin agregar tres
 * preguntas más al deploy.
 *
 * El usuario y la contraseña SÍ son `defineSecret`: son credenciales y viven
 * en Secret Manager, nunca en `.env` ni en el código (tarea 64, punto 1).
 *
 * Para revertir a `defineString`: son tres claves, y el call site es
 * `enviarCorreo.ts`.
 */

/** Lo que el transporte necesita saber, sin la credencial. */
export interface ConfiguracionSmtp {
  host: string;
  puerto: number;
  /** `true` solo para el 465 (TLS desde el primer byte). El 587 es STARTTLS. */
  seguro: boolean;
  /** Exige STARTTLS antes de autenticar: sin esto la contraseña podría salir en claro. */
  exigirTls: boolean;
  /** Nombre visible del remitente. El buzón sale del secreto, no de aquí. */
  nombreRemitente: string;
  /** Segundos de espera antes de darse por vencido. */
  timeoutMs: number;
}

export const HOST_POR_OMISION = 'smtp.office365.com';
export const PUERTO_POR_OMISION = 587;
export const NOMBRE_REMITENTE_POR_OMISION = 'VermurOps';

/** Único puerto donde TLS arranca implícito; cualquier otro usa STARTTLS. */
const PUERTO_TLS_IMPLICITO = 465;

export type EntornoCorreo = Record<string, string | undefined>;

function texto(entorno: EntornoCorreo, clave: string, omision: string): string {
  const valor = entorno[clave]?.trim();
  return valor ? valor : omision;
}

/**
 * La configuración efectiva.
 *
 * Un puerto que no es un número se ignora en vez de propagarse como `NaN`: un
 * `NaN` llegaría hasta el socket y fallaría como «conexión», mandando a revisar
 * la red cuando el problema es un valor mal escrito en el `.env`.
 */
export function configuracionSmtp(entorno: EntornoCorreo): ConfiguracionSmtp {
  const puertoCrudo = Number(entorno.CORREO_SMTP_PUERTO);
  const puerto = Number.isInteger(puertoCrudo) && puertoCrudo > 0 && puertoCrudo < 65536
    ? puertoCrudo
    : PUERTO_POR_OMISION;

  return {
    host: texto(entorno, 'CORREO_SMTP_HOST', HOST_POR_OMISION),
    puerto,
    seguro: puerto === PUERTO_TLS_IMPLICITO,
    // STARTTLS obligatorio en todo puerto que no sea el 465: Microsoft 365 no
    // acepta texto en claro, y si algún día aceptara, no queremos usarlo.
    exigirTls: puerto !== PUERTO_TLS_IMPLICITO,
    nombreRemitente: texto(entorno, 'CORREO_REMITENTE_NOMBRE', NOMBRE_REMITENTE_POR_OMISION),
    timeoutMs: 20_000,
  };
}

// ── Modo de envío ───────────────────────────────────────────────────────────

/**
 * `captura` arma el mensaje y lo devuelve SIN enviarlo. Es lo que hace posible
 * probar el armado en el emulador, donde no hay credenciales de Vermur.
 */
export type ModoEnvio = 'smtp' | 'captura';

export interface EntradaModo {
  /** `FUNCTIONS_EMULATOR === 'true'`. Nunca cierto en producción. */
  enEmulador: boolean;
  /** ¿Llegaron usuario y contraseña? */
  hayCredenciales: boolean;
  /** `CORREO_MODO`, para forzar `captura` en el emulador aun con credenciales. */
  modoPedido?: string;
}

/**
 * Qué transporte usar.
 *
 * **Producción siempre es `smtp`.** Sin credenciales no cae a `captura`: eso
 * sería un envío que se ve exitoso y nunca sale, que es la trampa de §3 («un
 * guardado que falla en silencio es peor que uno que no guarda»). Sin
 * credenciales en producción, el llamador recibe un error de configuración.
 *
 * En el emulador, `captura` es el default y `CORREO_MODO=smtp` permite probar
 * contra un servidor real a propósito.
 */
export function modoDeEnvio(entrada: EntradaModo): ModoEnvio {
  if (!entrada.enEmulador) return 'smtp';
  const pedido = entrada.modoPedido?.trim().toLowerCase();
  if (pedido === 'smtp') return 'smtp';
  if (pedido === 'captura') return 'captura';
  return entrada.hayCredenciales ? 'smtp' : 'captura';
}
