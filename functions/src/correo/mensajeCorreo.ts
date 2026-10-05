/**
 * mensajeCorreo.ts — cómo se arma un correo saliente, y qué significa que falle.
 *
 * Lógica PURA: sin nodemailer, sin red, sin secretos. Es lo que se puede probar
 * sin credenciales, que es justo lo que pide la tarea 64 — las de Vermur
 * todavía no existen.
 *
 * ── Vermur usa Exchange de Microsoft 365, no Gmail ──────────────────────────
 * El correo saliente es uno de NOTIFICACIONES del sistema: avisos entre áreas,
 * la cotización al cliente, el estado de cuenta. Por eso el remitente es el
 * buzón autenticado y no el usuario que aprieta el botón: Microsoft 365 rechaza
 * (5.7.60 SendAsDenied) un `From` que no sea el buzón de la sesión SMTP o uno
 * sobre el que ese buzón tenga «Enviar como». Dejar que cada quien ponga su
 * correo en el `From` produciría un rechazo distinto por persona.
 *
 * ── Por qué el diagnóstico vive aquí y no en el `catch` ─────────────────────
 * «No se pudo enviar el correo» manda a revisar lo que sea. Las tres causas
 * reales piden acciones de personas distintas:
 *
 *   configuración → falta el secreto; lo pone Mau con `functions:secrets:set`
 *   conexión      → la red o el host; se revisa el nombre del servidor
 *   autenticación → la credencial, o SMTP AUTH apagado en el buzón; lo
 *                   enciende el administrador de Exchange, no nosotros
 *   envío         → el mensaje o el destinatario; se corrige en la pantalla
 *
 * El caso de Microsoft 365 que más va a aparecer es el tercero: el envío por
 * SMTP con usuario y contraseña viene APAGADO por omisión en los tenants
 * nuevos, y el error (535 5.7.139) se lee como «contraseña mala» cuando en
 * realidad la contraseña está bien. Por eso se detecta aparte y con nombre.
 */

// ── Tipos ───────────────────────────────────────────────────────────────────

/** Lo que pide quien quiere mandar un correo. */
export interface CorreoPorEnviar {
  /** Uno o varios destinatarios. Acepta lista o una cadena separada por , ; */
  para: string | string[];
  cc?: string | string[];
  cco?: string | string[];
  asunto: string;
  html?: string;
  texto?: string;
  /** A dónde contesta quien lo recibe. Sí puede ser el correo de una persona. */
  responderA?: string;
}

/** Lo que entiende el transporte (nodemailer). En inglés porque es su API. */
export interface MensajeArmado {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

/** Remitente efectivo: el buzón autenticado, con nombre para mostrar. */
export interface RemitenteCorreo {
  /** El buzón de la sesión SMTP. */
  usuario: string;
  /** Nombre visible. Opcional: sin él va el correo solo. */
  nombre?: string;
}

export type EtapaFalla = 'configuracion' | 'conexion' | 'autenticacion' | 'envio' | 'desconocida';

export interface DiagnosticoCorreo {
  etapa: EtapaFalla;
  /** Una línea para la pantalla. */
  mensaje: string;
  /** Qué hacer, cuando se sabe. */
  sugerencia?: string;
  /** Cierto cuando Exchange dice que SMTP AUTH está apagado para el buzón. */
  smtpAuthApagado?: boolean;
}

export class ErrorCorreo extends Error {
  constructor(readonly diagnostico: DiagnosticoCorreo) {
    super(diagnostico.mensaje);
    this.name = 'ErrorCorreo';
  }
}

// ── Destinatarios ───────────────────────────────────────────────────────────

/**
 * Validación deliberadamente laxa: algo@algo.algo.
 *
 * Una expresión «completa» de RFC 5322 rechaza direcciones válidas raras y de
 * todos modos no garantiza que el buzón exista. Quien decide de verdad es
 * Exchange, y su rechazo llega como etapa «envío» con la dirección adentro.
 */
const FORMA_CORREO = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/;

export function esCorreoValido(direccion: string): boolean {
  return FORMA_CORREO.test(direccion.trim());
}

/**
 * Una lista limpia de direcciones a partir de lo que llegue.
 *
 * Acepta lista o cadena porque los dos van a existir: un formulario manda una
 * cadena que alguien pegó («julio@…, gaby@…»), y otra Function manda la lista
 * que ya tiene. Recorta, baja a minúsculas y quita repetidos: el mismo correo
 * dos veces en el `to` llega dos veces.
 */
export function normalizarDestinatarios(valor: string | string[] | undefined): string[] {
  if (valor == null) return [];
  const crudos = Array.isArray(valor) ? valor : valor.split(/[,;\n]/);
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const crudo of crudos) {
    const dir = String(crudo).trim().toLowerCase();
    if (!dir || vistos.has(dir)) continue;
    vistos.add(dir);
    salida.push(dir);
  }
  return salida;
}

/** Las que no tienen forma de correo, para decir cuál falla y no «hay un error». */
export function destinatariosInvalidos(direcciones: string[]): string[] {
  return direcciones.filter(d => !esCorreoValido(d));
}

// ── Remitente ───────────────────────────────────────────────────────────────

/**
 * «VermurOps <notificaciones@vermur.com>» o, sin nombre, la dirección sola.
 *
 * Las comillas del nombre no son adorno: un nombre con coma («Vermur, S.A. de
 * C.V.») sin comillas parte el encabezado en dos direcciones.
 */
export function remitenteDe(remitente: RemitenteCorreo): string {
  const usuario = remitente.usuario.trim();
  const nombre = remitente.nombre?.trim();
  if (!nombre) return usuario;
  return `"${nombre.replace(/"/g, '')}" <${usuario}>`;
}

// ── Cuerpo ──────────────────────────────────────────────────────────────────

/**
 * Texto plano a partir del HTML, para el cuerpo alterno.
 *
 * No es un conversor de HTML: resuelve el caso de un correo de notificación
 * armado por nosotros (párrafos, saltos, una tabla simple). Sirve para que un
 * cliente de correo que no pinta HTML —o un filtro que castiga al correo que
 * solo trae HTML— vea algo legible.
 */
export function textoDesdeHtml(html: string): string {
  return html
    .replace(/<\s*(style|script)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|tr|h[1-6]|li)\s*>/gi, '\n')
    .replace(/<\s*\/\s*(td|th)\s*>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Armado ──────────────────────────────────────────────────────────────────

/**
 * El mensaje listo para el transporte, o `ErrorCorreo` con la causa.
 *
 * Valida ANTES de abrir la conexión: un asunto vacío o un destinatario mal
 * escrito no merecen una sesión SMTP, y el error de Exchange llegaría mucho
 * más tarde y mucho más oscuro.
 */
export function armarMensaje(correo: CorreoPorEnviar, remitente: RemitenteCorreo): MensajeArmado {
  if (!remitente.usuario?.trim()) {
    throw new ErrorCorreo({
      etapa: 'configuracion',
      mensaje: 'No hay buzón remitente configurado.',
      sugerencia: 'Falta el secreto CORREO_SMTP_USUARIO.',
    });
  }

  const to = normalizarDestinatarios(correo.para);
  const cc = normalizarDestinatarios(correo.cc);
  const bcc = normalizarDestinatarios(correo.cco);

  if (to.length === 0) {
    throw new ErrorCorreo({
      etapa: 'envio',
      mensaje: 'El correo no tiene destinatarios.',
    });
  }

  const malas = destinatariosInvalidos([...to, ...cc, ...bcc]);
  if (malas.length > 0) {
    throw new ErrorCorreo({
      etapa: 'envio',
      mensaje: `Estas direcciones no tienen forma de correo: ${malas.join(', ')}.`,
    });
  }

  const asunto = correo.asunto?.trim() ?? '';
  if (!asunto) {
    throw new ErrorCorreo({
      etapa: 'envio',
      mensaje: 'El correo no tiene asunto.',
    });
  }

  const html = correo.html?.trim() || undefined;
  // Un correo que solo trae HTML cae más seguido en correo no deseado, así que
  // el texto plano se deriva cuando no lo mandaron. Si no hay ninguno de los
  // dos, el mensaje no tiene cuerpo y eso es un error de quien lo pidió.
  const texto = correo.texto?.trim() || (html ? textoDesdeHtml(html) : '');
  if (!texto) {
    throw new ErrorCorreo({
      etapa: 'envio',
      mensaje: 'El correo no tiene cuerpo.',
    });
  }

  const responderA = correo.responderA?.trim().toLowerCase();
  if (responderA && !esCorreoValido(responderA)) {
    throw new ErrorCorreo({
      etapa: 'envio',
      mensaje: `La dirección de respuesta «${responderA}» no tiene forma de correo.`,
    });
  }

  return {
    from: remitenteDe(remitente),
    to,
    ...(cc.length > 0 ? { cc } : {}),
    ...(bcc.length > 0 ? { bcc } : {}),
    subject: asunto,
    text: texto,
    ...(html ? { html } : {}),
    ...(responderA ? { replyTo: responderA } : {}),
  };
}

// ── Diagnóstico ─────────────────────────────────────────────────────────────

/**
 * Lo que Exchange contesta cuando SMTP AUTH está apagado para el buzón.
 *
 * Es el caso que más va a aparecer la primera vez, y el que se confunde con
 * «la contraseña está mal»: la credencial puede ser perfecta y el envío
 * rechazarse igual. Lo enciende el administrador de Exchange para ESE buzón
 * (Microsoft 365 admin center → Usuarios → correo → administrar aplicaciones
 * de correo electrónico → SMTP autenticado), no se arregla del lado de la app.
 */
const PISTAS_SMTP_AUTH_APAGADO = [
  'smtpclientauthentication is disabled',
  '5.7.139',
];

const PISTAS_AUTENTICACION = [
  'authentication unsuccessful',
  'authentication failed',
  'invalid credentials',
  'username and password not accepted',
  '5.7.57',
  '5.7.3',
  '535',
];

const CODIGOS_CONEXION = ['ECONNECTION', 'ESOCKET', 'ETIMEDOUT', 'ECONNREFUSED', 'EDNS', 'ENOTFOUND', 'EAI_AGAIN', 'ETLS'];

/** Error de nodemailer, visto de lejos: lo que nos sirve de él. */
export interface FallaCruda {
  code?: string;
  responseCode?: number;
  response?: string;
  message?: string;
}

/**
 * De un error de nodemailer a una causa con nombre.
 *
 * El orden importa: SMTP AUTH apagado se busca PRIMERO, porque viene dentro de
 * un error de autenticación y si se clasificara solo como «credencial mala»,
 * alguien se pasaría la tarde cambiando la contraseña de un buzón que no tiene
 * ningún problema de contraseña.
 */
export function diagnosticoDeFalla(falla: FallaCruda): DiagnosticoCorreo {
  const texto = `${falla.response ?? ''} ${falla.message ?? ''}`.toLowerCase();
  const codigo = (falla.code ?? '').toUpperCase();

  if (PISTAS_SMTP_AUTH_APAGADO.some(p => texto.includes(p))) {
    return {
      etapa: 'autenticacion',
      smtpAuthApagado: true,
      mensaje: 'Exchange rechazó la sesión: el envío por SMTP está apagado para este buzón.',
      sugerencia: 'No es la contraseña. El administrador de Microsoft 365 tiene que encender «SMTP autenticado» para ese buzón.',
    };
  }

  if (codigo === 'EAUTH' || PISTAS_AUTENTICACION.some(p => texto.includes(p))) {
    return {
      etapa: 'autenticacion',
      mensaje: 'Exchange no aceptó el usuario y la contraseña.',
      sugerencia: 'Revisar los secretos CORREO_SMTP_USUARIO y CORREO_SMTP_PASSWORD. Con autenticación multifactor hace falta una contraseña de aplicación.',
    };
  }

  if (CODIGOS_CONEXION.includes(codigo)) {
    return {
      etapa: 'conexion',
      mensaje: 'No se pudo abrir la conexión con el servidor de correo.',
      sugerencia: 'Revisar el host y el puerto (smtp.office365.com:587) y que la salida al 587 no esté bloqueada.',
    };
  }

  if (codigo === 'EENVELOPE' || codigo === 'EMESSAGE' || texto.includes('sendasdenied') || texto.includes('5.7.60')) {
    const sendAs = texto.includes('sendasdenied') || texto.includes('5.7.60');
    return {
      etapa: 'envio',
      mensaje: sendAs
        ? 'Exchange autenticó la sesión pero no deja enviar con ese remitente.'
        : 'Exchange aceptó la sesión y rechazó el mensaje.',
      sugerencia: sendAs
        ? 'El remitente tiene que ser el buzón de la credencial, o darle permiso «Enviar como».'
        : 'Revisar los destinatarios y el tamaño del mensaje.',
    };
  }

  return {
    etapa: 'desconocida',
    mensaje: falla.message?.trim() || 'El envío falló sin un motivo reconocible.',
    sugerencia: 'La respuesta completa del servidor queda en el log de la Function.',
  };
}

// ── El correo de prueba ─────────────────────────────────────────────────────

/**
 * El contenido de «Enviar correo de prueba».
 *
 * Dice de dónde salió y a qué hora, para que quien lo recibe sepa que no es un
 * aviso del negocio. Lleva el correo de quien apretó el botón en «responder a»:
 * si algo rebota, rebota con la persona que estaba probando.
 */
export function correoDePrueba(destino: string, solicitante: string, ahora: Date): CorreoPorEnviar {
  const sello = ahora.toISOString();
  return {
    para: destino,
    asunto: `VermurOps · correo de prueba (${sello.slice(0, 16).replace('T', ' ')} UTC)`,
    responderA: esCorreoValido(solicitante) ? solicitante : undefined,
    html: [
      '<p>Este es un <strong>correo de prueba</strong> de VermurOps.</p>',
      '<p>Si lo estás leyendo, el correo saliente por Exchange quedó configurado:',
      'la plataforma pudo autenticarse en el servidor y entregar el mensaje.</p>',
      `<p>Lo pidió <strong>${solicitante}</strong> desde Configuración &rarr; Integraciones.</p>`,
      `<p>Sello: ${sello}</p>`,
      '<p>No hay que contestar nada.</p>',
    ].join('\n'),
  };
}
