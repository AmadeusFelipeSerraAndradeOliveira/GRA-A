import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { connectAuthEmulator, getAuth } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { connectFirestoreEmulator, getFirestore } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAmBo8FlMfXobAtCsBarVOX4FBpK66waMU",
  authDomain: "graca-454ff.firebaseapp.com",
  projectId: "graca-454ff",
  storageBucket: "graca-454ff.firebasestorage.app",
  messagingSenderId: "905480035252",
  appId: "1:905480035252:web:6410e8eeaa55bf3c2cf0e1",
  measurementId: "G-LDS9HQ6QD7"
};

const app = initializeApp(firebaseConfig);

// A emulação é um opt-in local explícito para testes. O site publicado e
// qualquer navegação sem ?emulator=1 continuam usando o Firebase normal.
const useLocalEmulators = ['localhost', '127.0.0.1'].includes(location.hostname)
  && new URLSearchParams(location.search).get('emulator') === '1';
if (useLocalEmulators) {
  connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(getFirestore(app), '127.0.0.1', 8080);
}

export default app;
