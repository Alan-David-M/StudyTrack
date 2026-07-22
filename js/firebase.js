// ==========================================
// STUDYTRACK
// Archivo: js/firebase.js
// Descripción: Configuración de Firebase
// ==========================================

// Importar Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
    getAuth
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


// ==========================================
// CONFIGURACIÓN DEL PROYECTO
// ==========================================

const firebaseConfig = {

    apiKey: "AIzaSyDfmadkvfnonCEXcUpIFxdmtTYVEkpPtcI",

    authDomain: "studytrack-58043.firebaseapp.com",

    projectId: "studytrack-58043",

    storageBucket: "studytrack-58043.firebasestorage.app",

    messagingSenderId: "410696716807",

    appId: "1:410696716807:web:c13c0a0acd6d8b3c1350a2"

};


// ==========================================
// INICIALIZAR FIREBASE
// ==========================================

const app = initializeApp(firebaseConfig);


// ==========================================
// SERVICIOS
// ==========================================

const auth = getAuth(app);

const db = getFirestore(app);


// ==========================================
// EXPORTAR
// ==========================================

export {

    auth,

    db

};
