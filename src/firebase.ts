import { initializeApp } from "firebase/app"
import { getAuth, connectAuthEmulator } from "firebase/auth"
import { getStorage, connectStorageEmulator } from "firebase/storage"
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore"

const firebaseConfig = {
  apiKey: "AIzaSyBwCaYbvual7aVbfVUqwdu_gFUmqJg-Dc0",
  authDomain: "vermur-logistics-app.firebaseapp.com",
  projectId: "vermur-logistics-app",
  storageBucket: "vermur-logistics-app.firebasestorage.app",
  messagingSenderId: "968475941446",
  appId: "1:968475941446:web:8c7537ab1384d5a15fc847",
  measurementId: "G-D75750X233"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
// Los correos de Auth (restablecer contraseña) y la página que los atiende
// salen en español. Sin esto, Firebase manda el correo en inglés.
auth.languageCode = 'es'
export const storage = getStorage(app)
export const db = getFirestore(app)

/**
 * ── Emuladores, por OPT-IN explícito ────────────────────────────────────────
 *
 * `VITE_USAR_EMULADORES=1` conecta Auth, Firestore y Storage a los emuladores
 * locales. Es la primera salida de la deuda crítica de §6: «localhost escribe
 * en producción».
 *
 * Es opt-in y NO `import.meta.env.DEV` a propósito: el flujo diario de
 * validación de Mau corre `npm run dev` contra producción a sabiendas.
 * Condicionar por DEV cambiaría ese flujo en silencio; una variable explícita
 * no sorprende a nadie.
 *
 * Quien la activa: la operación nocturna (noche.sh) y cualquier prueba
 * automatizada. El banner de la esquina lo pinta EmuladorBadge para que nunca
 * quede la duda de contra qué base estás viendo datos.
 */
export const USANDO_EMULADORES = import.meta.env.VITE_USAR_EMULADORES === '1'

if (USANDO_EMULADORES) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
  // Consola, no solo UI: los logs de Playwright también lo registran.
  console.info('[firebase] Conectado a EMULADORES locales. Producción intacta.')
}

export default app
