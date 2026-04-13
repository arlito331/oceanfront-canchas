import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDdcqtmAllOV7iv0r5V3YJdcEqD4a_mfUw",
  authDomain: "of-canchas.firebaseapp.com",
  projectId: "of-canchas",
  storageBucket: "of-canchas.firebasestorage.app",
  messagingSenderId: "856514470352",
  appId: "1:856514470352:web:f4ebb5ced67acc887219d5",
  measurementId: "G-YKY6BXCHGG"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
