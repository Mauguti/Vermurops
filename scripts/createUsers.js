import admin from "firebase-admin";
import { readFileSync } from "fs";
const serviceAccount = JSON.parse(readFileSync(new URL("../serviceAccountKey.json", import.meta.url)));

const CLAVE = process.env.PASSWORD_CUENTAS_PRUEBA
if (!CLAVE) { console.error("Define PASSWORD_CUENTAS_PRUEBA: la contraseña ya no vive en el repo."); process.exit(1) }
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const usuarios = [
  {
    email: "admin@vermur.com",
    password: CLAVE,
    displayName: "Admin Vermur"
  },
  {
    email: "ventas@vermur.com",
    password: CLAVE,
    displayName: "Ana Ramírez"
  },
  {
    email: "pricing@vermur.com",
    password: CLAVE,
    displayName: "Carlos Medina"
  }
]

async function crearUsuarios() {
  for (const usuario of usuarios) {
    try {
      const user = await admin.auth().createUser(usuario)
      console.log(`✅ Creado: ${usuario.email} → UID: ${user.uid}`)
    } catch (error) {
      if (error.code === "auth/email-already-exists") {
        console.log(`⚠️  Ya existe: ${usuario.email}`)
      } else {
        console.error(`❌ Error con ${usuario.email}:`, error.message)
      }
    }
  }
  process.exit(0)
}

crearUsuarios()
