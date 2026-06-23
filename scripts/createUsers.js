import admin from "firebase-admin";
import { readFileSync } from "fs";
const serviceAccount = JSON.parse(readFileSync(new URL("../serviceAccountKey.json", import.meta.url)));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const usuarios = [
  {
    email: "admin@vermur.com",
    password: "123456",
    displayName: "Admin Vermur"
  },
  {
    email: "ventas@vermur.com",
    password: "123456",
    displayName: "Ana Ramírez"
  },
  {
    email: "pricing@vermur.com",
    password: "123456",
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
