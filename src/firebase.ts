import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getStorage } from "firebase/storage"
import { getFirestore } from "firebase/firestore"

const firebaseConfig = {
  apiKey: "AIzaSyBwCaYbvual7aVbfVUqwdu_gFUmqJg-Dc0",
  authDomain: "vermur-logistics-app.firebaseapp.com",
  projectId: "vermur-logistics-app",
  storageBucket: "vermur-logistics-app.firebasestorage.app",
  messagingSenderId: "968475941446",
  appId: "1:968475941446:web:8c7537ab1384d5a15fc847"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const storage = getStorage(app)
export const db = getFirestore(app)
export default app
