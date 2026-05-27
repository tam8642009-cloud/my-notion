import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC89jwM_QvHgpw8e4yycYFr7q0itA5gtRs",
  authDomain: "my-notion-5d03b.firebaseapp.com",
  projectId: "my-notion-5d03b",
  storageBucket: "my-notion-5d03b.firebasestorage.app",
  messagingSenderId: "254545509233",
  appId: "1:254545509233:web:26a2f55de55e54f09454d0"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
