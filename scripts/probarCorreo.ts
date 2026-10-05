/**
 * probarCorreo.ts
 *
 * Pasa el correo de prueba por la Function `enviarCorreo` a través del
 * emulador, SIN credenciales de Vermur: el transporte está en modo `captura`,
 * así que el mensaje se arma completo y no sale a internet.
 *
 * Es la verificación del punto 2 de la tarea 64 — probar el armado sin
 * credenciales reales— y la única forma de ver el mensaje completo: lo que la
 * Function devuelve en `capturado` es exactamente lo que le pasaría a Exchange.
 *
 * Prerrequisito: CON_FUNCTIONS=1 ./scripts/dev-emuladores.sh corriendo.
 *
 * Uso: npx tsx scripts/probarCorreo.ts [destino]
 *
 * También comprueba lo que NO debe poder: una cuenta sin `correo.probar`
 * —ventas@— tiene que recibir 403. Una Function pública en la red que no
 * verifique el rol en el código es un relay abierto para quien tenga sesión.
 */

const AUTH_URL = 'http://127.0.0.1:9099';
const FUNCTION_URL = 'http://127.0.0.1:5001/vermur-logistics-app/us-central1/enviarCorreo';
const API_KEY = 'fake-api-key'; // el emulador acepta cualquiera

async function token(email: string): Promise<string> {
  const res = await fetch(
    `${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: '123456', returnSecureToken: true }),
    },
  );
  if (!res.ok) throw new Error(`Auth falló para ${email}: ${res.status} ${await res.text()}`);
  const datos = await res.json() as { idToken: string };
  return datos.idToken;
}

async function pedir(email: string, destino: string) {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${await token(email)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ destino }),
  });
  return { status: res.status, cuerpo: await res.json() as Record<string, unknown> };
}

async function main() {
  const destino = process.argv[2] ?? 'gabriela.huerta@vermur.com';

  console.log('── admin@vermur.com (tiene correo.probar) ──────────────────');
  const ok = await pedir('admin@vermur.com', destino);
  console.log(`HTTP ${ok.status}`);
  console.log(JSON.stringify(ok.cuerpo, null, 2));

  console.log('\n── ventas@vermur.com (NO tiene correo.probar) ──────────────');
  const negado = await pedir('ventas@vermur.com', destino);
  console.log(`HTTP ${negado.status} — ${JSON.stringify(negado.cuerpo)}`);

  console.log('\n── sin token ───────────────────────────────────────────────');
  const sinSesion = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destino }),
  });
  console.log(`HTTP ${sinSesion.status} — ${await sinSesion.text()}`);

  console.log('\n── destino mal escrito ─────────────────────────────────────');
  const malo = await pedir('admin@vermur.com', 'esto-no-es-correo');
  console.log(`HTTP ${malo.status} — ${JSON.stringify(malo.cuerpo)}`);

  const fallos: string[] = [];
  if (ok.status !== 200) fallos.push(`admin debió recibir 200 y recibió ${ok.status}`);
  if (ok.cuerpo.modo !== 'captura') fallos.push(`el modo debió ser «captura» y fue «${ok.cuerpo.modo}»`);
  if (!ok.cuerpo.capturado) fallos.push('no vino el mensaje capturado');
  if (negado.status !== 403) fallos.push(`ventas debió recibir 403 y recibió ${negado.status}`);
  if (sinSesion.status !== 401) fallos.push(`sin token debió ser 401 y fue ${sinSesion.status}`);
  if (malo.status !== 400) fallos.push(`un destino inválido debió ser 400 y fue ${malo.status}`);

  console.log('');
  if (fallos.length > 0) {
    fallos.forEach(f => console.error(`✗ ${f}`));
    process.exit(1);
  }
  console.log('✓ los cuatro casos se comportaron como se espera');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
