/**
 * preferencias.ts — deja las preferencias de pantalla en su valor de fábrica.
 *
 * «Por factura» (Cuentas por cobrar) y «Por orden» (Cuentas por pagar) se
 * guardan por USUARIO en `preferenciasUsuario/{uid}`, y los emuladores
 * conservan eso entre specs: un test que cambia de vista contaminaba a los
 * que corrían después (tarea 84). Cada spec que abre esas pantallas llama a
 * `fijarPreferencias()` en su `beforeAll` y declara la que necesita.
 *
 * También borra las VISTAS GUARDADAS (`vistasUsuario`): una vista con
 * filtros que un spec guardó como predeterminada esconde las filas del
 * siguiente (tarea 90: capturas-61 dejaba fuera la factura de 67 y 69).
 *
 * Escribe por REST contra el emulador de Firestore (nunca producción: las
 * URLs son 127.0.0.1) con el token de propietario del emulador.
 */
const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const CUENTAS = [
  'ventas@vermur.com', 'pricing@vermur.com', 'operaciones@vermur.com',
  'administracion@vermur.com', 'admin@vermur.com',
];

export interface PreferenciasE2E {
  vistaCuentasPorCobrar: 'cliente' | 'factura';
  vistaCuentasPorPagar: 'proveedor' | 'orden';
}

const DEFAULTS: PreferenciasE2E = { vistaCuentasPorCobrar: 'cliente', vistaCuentasPorPagar: 'proveedor' };

async function uidDe(email: string): Promise<string | null> {
  const r = await fetch(AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: '123456', returnSecureToken: true }),
  });
  if (!r.ok) return null;
  return ((await r.json()) as { localId?: string }).localId ?? null;
}

async function borrarVistasGuardadas(): Promise<void> {
  const r = await fetch(`${FS}/vistasUsuario?pageSize=500`, { headers: { Authorization: 'Bearer owner' } });
  if (!r.ok) return;
  const d = await r.json() as { documents?: { name: string }[] };
  await Promise.all((d.documents ?? []).map(doc =>
    fetch(`http://127.0.0.1:8080/v1/${doc.name}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } })));
}

/** Fija las preferencias de los cinco usuarios; lo no indicado vuelve al default. */
export async function fijarPreferencias(quiero: Partial<PreferenciasE2E> = {}): Promise<void> {
  await borrarVistasGuardadas();
  const p = { ...DEFAULTS, ...quiero };
  await Promise.all(CUENTAS.map(async email => {
    const uid = await uidDe(email);
    if (!uid) return;
    const campos = Object.keys(p).map(k => `updateMask.fieldPaths=${k}`).join('&');
    const r = await fetch(`${FS}/preferenciasUsuario/${uid}?${campos}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ fields: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { stringValue: v }])) }),
    });
    if (!r.ok) throw new Error(`no se pudo fijar la preferencia de ${email}: ${r.status}`);
  }));
}
