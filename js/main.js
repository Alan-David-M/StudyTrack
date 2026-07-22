/**
 * StudyTrack - Control de autenticación
 * Archivo: js/main.js
 *
 * Funciones incluidas:
 * - Inicio de sesión con correo y contraseña.
 * - Creación de cuentas.
 * - Persistencia de sesión mediante "Recordarme".
 * - Recuperación de contraseña.
 * - Mostrar y ocultar contraseñas.
 * - Mensajes de estado y traducción de errores de Firebase.
 * - Registro básico del perfil en Cloud Firestore.
 * - Preparación para redirigir al Dashboard.
 */

import { auth, db } from "./firebase.js";

import {
    browserLocalPersistence,
    browserSessionPersistence,
    createUserWithEmailAndPassword,
    deleteUser,
    onAuthStateChanged,
    sendPasswordResetEmail,
    setPersistence,
    signInWithEmailAndPassword,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    doc,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* =========================================================
   CONFIGURACIÓN
========================================================= */

const DASHBOARD_URL = document.body.dataset.dashboardUrl?.trim() || "";
const MIN_PASSWORD_LENGTH = 6;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,24}$/;

/* =========================================================
   REFERENCIAS DEL DOM
========================================================= */

const elements = {
    authTitle: document.getElementById("authTitle"),
    authSubtitle: document.getElementById("authSubtitle"),
    authMessage: document.getElementById("authMessage"),

    loginForm: document.getElementById("loginForm"),
    email: document.getElementById("email"),
    password: document.getElementById("password"),
    remember: document.getElementById("remember"),
    loginButton: document.getElementById("loginButton"),
    forgotPassword: document.getElementById("forgotPassword"),
    registerLink: document.getElementById("registerLink"),

    registerForm: document.getElementById("registerForm"),
    registerName: document.getElementById("registerName"),
    registerUsername: document.getElementById("registerUsername"),
    registerEmail: document.getElementById("registerEmail"),
    registerPassword: document.getElementById("registerPassword"),
    registerConfirmPassword: document.getElementById("registerConfirmPassword"),
    registerButton: document.getElementById("registerButton"),
    backToLogin: document.getElementById("backToLogin"),

    togglePassword: document.getElementById("togglePassword"),
    toggleRegisterPassword: document.getElementById("toggleRegisterPassword"),
    toggleConfirmPassword: document.getElementById("toggleConfirmPassword"),

    socialButtons: document.querySelectorAll("[data-provider]")
};

/* =========================================================
   INICIALIZACIÓN
========================================================= */

document.addEventListener("DOMContentLoaded", initializeApp);

function initializeApp() {
    validateRequiredElements();
    configurePasswordToggles();
    configureNavigation();
    configureForms();
    configureSocialButtons();
    observeAuthenticationState();
}

/**
 * Detecta rápidamente si el HTML no coincide con este archivo.
 * Esto evita errores difíciles de identificar en la consola.
 */
function validateRequiredElements() {
    const requiredElements = [
        "authTitle",
        "authSubtitle",
        "authMessage",
        "loginForm",
        "email",
        "password",
        "remember",
        "loginButton",
        "forgotPassword",
        "registerLink",
        "registerForm",
        "registerName",
        "registerUsername",
        "registerEmail",
        "registerPassword",
        "registerConfirmPassword",
        "registerButton",
        "backToLogin"
    ];

    const missingElements = requiredElements.filter((key) => !elements[key]);

    if (missingElements.length > 0) {
        throw new Error(
            `StudyTrack no encontró estos elementos del HTML: ${missingElements.join(", ")}`
        );
    }
}

/* =========================================================
   NAVEGACIÓN ENTRE FORMULARIOS
========================================================= */

function configureNavigation() {
    elements.registerLink.addEventListener("click", (event) => {
        event.preventDefault();
        showRegisterForm();
    });

    elements.backToLogin.addEventListener("click", (event) => {
        event.preventDefault();
        showLoginForm();
    });

    elements.forgotPassword.addEventListener("click", handlePasswordReset);
}

function showRegisterForm() {
    clearMessage();

    elements.loginForm.hidden = true;
    elements.registerForm.hidden = false;

    elements.authTitle.textContent = "Crea tu cuenta";
    elements.authSubtitle.textContent = "Comienza a organizar tu vida académica";
    document.title = "StudyTrack | Crear cuenta";

    elements.registerName.focus();
}

function showLoginForm() {
    clearMessage();

    elements.registerForm.hidden = true;
    elements.loginForm.hidden = false;

    elements.authTitle.textContent = "¡Bienvenido de nuevo!";
    elements.authSubtitle.textContent = "Inicia sesión para continuar";
    document.title = "StudyTrack | Iniciar sesión";

    elements.email.focus();
}

/* =========================================================
   FORMULARIOS
========================================================= */

function configureForms() {
    elements.loginForm.addEventListener("submit", handleLogin);
    elements.registerForm.addEventListener("submit", handleRegistration);
}

/**
 * Inicia sesión con Firebase Authentication.
 */
async function handleLogin(event) {
    event.preventDefault();
    clearMessage();

    const email = normalizeEmail(elements.email.value);
    const password = elements.password.value;
    const rememberSession = elements.remember.checked;

    const validationError = validateLoginData({ email, password });

    if (validationError) {
        showMessage(validationError, "error");
        return;
    }

    setButtonLoading(elements.loginButton, true, "Iniciando sesión...");

    try {
        const persistence = rememberSession
            ? browserLocalPersistence
            : browserSessionPersistence;

        await setPersistence(auth, persistence);
        const credential = await signInWithEmailAndPassword(auth, email, password);

        showMessage(
            `Sesión iniciada correctamente${credential.user.displayName ? `, ${credential.user.displayName}` : ""}.`,
            "success"
        );

        elements.loginForm.reset();
        redirectToDashboard();
    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        showMessage(getFirebaseErrorMessage(error), "error");
    } finally {
        setButtonLoading(elements.loginButton, false);
    }
}

/**
 * Crea una cuenta y guarda un perfil básico en Firestore.
 */
async function handleRegistration(event) {
    event.preventDefault();
    clearMessage();

    const formData = {
        name: normalizeSpaces(elements.registerName.value),
        username: elements.registerUsername.value.trim(),
        email: normalizeEmail(elements.registerEmail.value),
        password: elements.registerPassword.value,
        confirmPassword: elements.registerConfirmPassword.value
    };

    const validationError = validateRegistrationData(formData);

    if (validationError) {
        showMessage(validationError, "error");
        return;
    }

    setButtonLoading(elements.registerButton, true, "Creando cuenta...");

    let createdUser = null;

    try {
        // La sesión se conservará después del registro.
        await setPersistence(auth, browserLocalPersistence);

        const credential = await createUserWithEmailAndPassword(
            auth,
            formData.email,
            formData.password
        );

        createdUser = credential.user;

        await updateProfile(createdUser, {
            displayName: formData.name
        });

        await reserveUsernameAndSaveProfile({
            uid: createdUser.uid,
            name: formData.name,
            username: formData.username,
            email: formData.email
        });

        showMessage("Tu cuenta fue creada correctamente. ¡Bienvenido a StudyTrack!", "success");
        elements.registerForm.reset();

        redirectToDashboard();
    } catch (error) {
        console.error("Error al crear la cuenta:", error);

        // Evita dejar una cuenta incompleta si Firestore rechaza el perfil
        // o si el nombre de usuario ya estaba ocupado.
        if (createdUser) {
            try {
                await deleteUser(createdUser);
            } catch (rollbackError) {
                console.error("No se pudo revertir la cuenta incompleta:", rollbackError);
            }
        }

        showMessage(getFirebaseErrorMessage(error), "error");
    } finally {
        setButtonLoading(elements.registerButton, false);
    }
}

/**
 * Reserva el nombre de usuario y guarda el perfil en una sola transacción.
 * Así se evita que dos cuentas usen el mismo nombre de usuario.
 * No se almacena la contraseña; Firebase Authentication la administra.
 */
async function reserveUsernameAndSaveProfile({ uid, name, username, email }) {
    const usernameLower = username.toLowerCase();
    const usernameReference = doc(db, "usernames", usernameLower);
    const userReference = doc(db, "users", uid);

    await runTransaction(db, async (transaction) => {
        const usernameSnapshot = await transaction.get(usernameReference);

        if (usernameSnapshot.exists()) {
            const usernameError = new Error("El nombre de usuario ya está ocupado.");
            usernameError.code = "auth/username-already-in-use";
            throw usernameError;
        }

        transaction.set(usernameReference, {
            uid,
            createdAt: serverTimestamp()
        });

        transaction.set(userReference, {
            uid,
            name,
            username,
            usernameLower,
            email,
            role: "student",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
    });
}

/* =========================================================
   RECUPERACIÓN DE CONTRASEÑA
========================================================= */

async function handlePasswordReset(event) {
    event.preventDefault();
    clearMessage();

    const email = normalizeEmail(elements.email.value);

    if (!email) {
        showMessage(
            "Escribe tu correo electrónico en el campo de inicio de sesión y vuelve a intentarlo.",
            "info"
        );
        elements.email.focus();
        return;
    }

    if (!isValidEmail(email)) {
        showMessage("Escribe un correo electrónico válido.", "error");
        elements.email.focus();
        return;
    }

    try {
        await sendPasswordResetEmail(auth, email);

        showMessage(
            "Te enviamos un correo para restablecer tu contraseña. Revisa también la carpeta de spam.",
            "success"
        );
    } catch (error) {
        console.error("Error al enviar recuperación:", error);
        showMessage(getFirebaseErrorMessage(error), "error");
    }
}

/* =========================================================
   ESTADO DE AUTENTICACIÓN
========================================================= */

function observeAuthenticationState() {
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            return;
        }

        // Si ya existe el Dashboard, la ruta se configura en el atributo
        // data-dashboard-url del <body> en index.html.
        if (DASHBOARD_URL) {
            window.location.replace(DASHBOARD_URL);
            return;
        }

        // Mientras todavía no exista el Dashboard, evitamos una página 404.
        showMessage(
            `Hay una sesión activa${user.displayName ? ` de ${user.displayName}` : ""}. El Dashboard se conectará en la siguiente fase.`,
            "info"
        );
    });
}

function redirectToDashboard() {
    if (!DASHBOARD_URL) {
        return;
    }

    window.setTimeout(() => {
        window.location.assign(DASHBOARD_URL);
    }, 700);
}

/* =========================================================
   MOSTRAR Y OCULTAR CONTRASEÑAS
========================================================= */

function configurePasswordToggles() {
    createPasswordToggle(elements.togglePassword, elements.password);
    createPasswordToggle(elements.toggleRegisterPassword, elements.registerPassword);
    createPasswordToggle(elements.toggleConfirmPassword, elements.registerConfirmPassword);
}

function createPasswordToggle(button, input) {
    if (!button || !input) {
        return;
    }

    button.addEventListener("click", () => {
        const isCurrentlyHidden = input.type === "password";

        input.type = isCurrentlyHidden ? "text" : "password";
        button.setAttribute("aria-pressed", String(isCurrentlyHidden));
        button.setAttribute(
            "aria-label",
            isCurrentlyHidden ? "Ocultar contraseña" : "Mostrar contraseña"
        );

        const icon = button.querySelector("i");

        if (icon) {
            icon.classList.toggle("fa-eye", !isCurrentlyHidden);
            icon.classList.toggle("fa-eye-slash", isCurrentlyHidden);
        }

        input.focus();
    });
}

/* =========================================================
   BOTONES SOCIALES
========================================================= */

function configureSocialButtons() {
    elements.socialButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const provider = button.dataset.provider || "social";
            const providerName = formatProviderName(provider);

            showMessage(
                `El acceso con ${providerName} todavía no está habilitado en Firebase. Por ahora usa correo y contraseña.`,
                "info"
            );
        });
    });
}

function formatProviderName(provider) {
    const names = {
        google: "Google",
        microsoft: "Microsoft",
        apple: "Apple"
    };

    return names[provider] || provider;
}

/* =========================================================
   VALIDACIONES
========================================================= */

function validateLoginData({ email, password }) {
    if (!email || !password) {
        return "Completa tu correo electrónico y contraseña.";
    }

    if (!isValidEmail(email)) {
        return "Escribe un correo electrónico válido.";
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
        return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    }

    return "";
}

function validateRegistrationData({
    name,
    username,
    email,
    password,
    confirmPassword
}) {
    if (!name || !username || !email || !password || !confirmPassword) {
        return "Completa todos los campos para crear tu cuenta.";
    }

    if (name.length < 2) {
        return "Escribe un nombre válido.";
    }

    if (!USERNAME_PATTERN.test(username)) {
        return "El usuario debe tener entre 3 y 24 caracteres y solo puede incluir letras, números, punto, guion o guion bajo.";
    }

    if (!isValidEmail(email)) {
        return "Escribe un correo electrónico válido.";
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
        return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    }

    if (password !== confirmPassword) {
        return "Las contraseñas no coinciden.";
    }

    return "";
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeEmail(email) {
    return email.trim().toLowerCase();
}

function normalizeSpaces(value) {
    return value.trim().replace(/\s+/g, " ");
}

/* =========================================================
   MENSAJES Y ESTADOS DE CARGA
========================================================= */

function showMessage(message, type = "info") {
    const styles = {
        success: {
            background: "rgba(22, 163, 74, 0.12)",
            border: "1px solid rgba(22, 163, 74, 0.30)",
            color: "#166534"
        },
        error: {
            background: "rgba(220, 38, 38, 0.10)",
            border: "1px solid rgba(220, 38, 38, 0.28)",
            color: "#991b1b"
        },
        info: {
            background: "rgba(37, 99, 235, 0.10)",
            border: "1px solid rgba(37, 99, 235, 0.25)",
            color: "#1e40af"
        }
    };

    const selectedStyle = styles[type] || styles.info;

    elements.authMessage.textContent = message;
    elements.authMessage.hidden = false;
    elements.authMessage.style.marginBottom = "18px";
    elements.authMessage.style.padding = "12px 14px";
    elements.authMessage.style.borderRadius = "12px";
    elements.authMessage.style.fontSize = "0.9rem";
    elements.authMessage.style.lineHeight = "1.5";
    elements.authMessage.style.fontWeight = "500";
    elements.authMessage.style.background = selectedStyle.background;
    elements.authMessage.style.border = selectedStyle.border;
    elements.authMessage.style.color = selectedStyle.color;
}

function clearMessage() {
    elements.authMessage.hidden = true;
    elements.authMessage.textContent = "";
    elements.authMessage.removeAttribute("style");
}

/**
 * Cambia temporalmente el contenido y estado de un botón.
 */
function setButtonLoading(button, isLoading, loadingText = "Procesando...") {
    if (!button) {
        return;
    }

    if (isLoading) {
        button.dataset.originalHtml = button.innerHTML;
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        button.innerHTML = `
            <span>${escapeHtml(loadingText)}</span>
            <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
        `;
        return;
    }

    button.disabled = false;
    button.removeAttribute("aria-busy");

    if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
    }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/* =========================================================
   ERRORES DE FIREBASE EN ESPAÑOL
========================================================= */

function getFirebaseErrorMessage(error) {
    const code = error?.code || "";

    const messages = {
        "auth/invalid-email": "El correo electrónico no tiene un formato válido.",
        "auth/missing-email": "Escribe tu correo electrónico.",
        "auth/missing-password": "Escribe tu contraseña.",
        "auth/weak-password": "La contraseña es demasiado débil. Usa al menos 6 caracteres.",
        "auth/email-already-in-use": "Ya existe una cuenta registrada con este correo.",
        "auth/username-already-in-use": "Ese nombre de usuario ya está ocupado. Elige otro.",
        "auth/invalid-credential": "El correo o la contraseña son incorrectos.",
        "auth/user-disabled": "Esta cuenta fue deshabilitada.",
        "auth/user-not-found": "No encontramos una cuenta con ese correo.",
        "auth/wrong-password": "La contraseña es incorrecta.",
        "auth/too-many-requests": "Se realizaron demasiados intentos. Espera unos minutos y vuelve a intentarlo.",
        "auth/network-request-failed": "No se pudo conectar con Firebase. Revisa tu conexión a internet.",
        "auth/operation-not-allowed": "El acceso por correo y contraseña no está habilitado en Firebase Authentication.",
        "auth/popup-closed-by-user": "La ventana de acceso se cerró antes de completar el proceso.",
        "permission-denied": "Firestore rechazó la operación. Revisa las reglas de seguridad de la base de datos.",
        "firestore/permission-denied": "Firestore rechazó la operación. Revisa las reglas de seguridad de la base de datos."
    };

    return messages[code] || "Ocurrió un error inesperado. Inténtalo nuevamente.";
}
