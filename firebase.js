import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";

const firebaseConfig = {
  apiKey: "AIzaSyAmBo8FlMfXobAtCsBarVOX4FBpK66waMU",
  authDomain: "graca-454ff.firebaseapp.com",
  projectId: "graca-454ff",
  storageBucket: "graca-454ff.firebasestorage.app",
  messagingSenderId: "905480035252",
  appId: "1:905480035252:web:6410e8eeaa55bf3c2cf0e1",
  measurementId: "G-LDS9HQ6QD7"
};

// Firebase web configuration identifies the public client app; private service credentials
// must stay on trusted server code.
const app = initializeApp(firebaseConfig);

export default app;
