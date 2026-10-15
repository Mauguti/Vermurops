/**
 * Aislamiento entre specs (tarea 109).
 *
 * Los specs comparten UNA base: cada uno deja sus cotizaciones en
 * `solicitado_pricing`, y `createdAt` de una cotización llega con resolución de
 * MINUTO («2026-10-12 14:03»). Elegir «la más reciente» entre las de la etapa
 * empata con lo que otro spec dejó hace unos segundos, y el desempate cae en el
 * orden de Firestore: el spec seguía con una cotización AJENA y fallaba
 * esperando una fila que no era suya (capturas-03, 107).
 *
 * Regla: lo que un spec crea se identifica por DIFERENCIA — los ids que había
 * ANTES de crear, restados de los que hay DESPUÉS — nunca por «la última».
 */

const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';

/** Ids de los documentos que hay ahora en la colección. */
export async function idsDe(email: string, col: string): Promise<Set<string>> {
  const r = await fetch(`${AUTH}/accounts:signInWithPassword?key=emulador`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: process.env.PASSWORD_CUENTAS_PRUEBA ?? '', returnSecureToken: true }),
  });
  const { idToken } = await r.json() as { idToken: string };
  const ids = new Set<string>();
  let pagina = '';
  do {
    const u = await fetch(`${FS}/${col}?pageSize=300&mask.fieldPaths=etapa${pagina}`, { headers: { Authorization: `Bearer ${idToken}` } });
    const d = await u.json() as { documents?: { name: string }[]; nextPageToken?: string };
    for (const doc of d.documents ?? []) ids.add(doc.name.split('/').pop()!);
    pagina = d.nextPageToken ? `&pageToken=${encodeURIComponent(d.nextPageToken)}` : '';
  } while (pagina);
  return ids;
}

/** Solo los documentos que NO estaban en la foto de antes. */
export function soloNuevos<T extends { __id?: unknown }>(docs: T[], antes: Set<string>): T[] {
  return docs.filter(d => !antes.has(String(d.__id)));
}

/**
 * Borra de la base los documentos que un spec SEMBRÓ, al terminar.
 *
 * Los emuladores no se reinician entre specs ni entre vueltas de REPETIR: una
 * tarifa sembrada por un spec sigue ahí cuando otro abre el mismo concepto y
 * «Usar» toma la primera que ve (la 100 aplicó la TAR-98-REG de la 98 en la
 * segunda vuelta). Sembrar es prestado: se devuelve.
 */
export async function borrarSembrados(col: string, ids: string[]): Promise<void> {
  for (const id of ids) {
    await fetch(`${FS}/${col}/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  }
}

/** Borra las tarifas cuyo texto de vigencia es el que un spec escribió a mano por la pantalla. */
export async function borrarTarifasPorVigencia(vigenciaTexto: string): Promise<void> {
  const r = await fetch(`${FS}/tarifas?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  const d = await r.json() as { documents?: { name: string; fields?: Record<string, { stringValue?: string }> }[] };
  const ids = (d.documents ?? [])
    .filter(doc => doc.fields?.vigenciaTexto?.stringValue === vigenciaTexto)
    .map(doc => doc.name.split('/').pop()!);
  await borrarSembrados('tarifas', ids);
}
