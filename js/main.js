/**
 * StudyTrack - Inicio de sesión
 * Archivo: js/main.js
 *
 * Funciones incluidas:
 * - Inicio de sesión con correo y contraseña.
 * - Persistencia de sesión mediante "Recordarme".
 * - Recuperación de contraseña.
 * - Mostrar y ocultar la contraseña.
 * - Mensajes de estado y errores de Firebase en español.
 * - Botones sociales preparados para una fase posterior.
 * - Redirección al Dashboard cuando su ruta esté configurada.
 *
 * IMPORTANTE:
 * El registro ya no se controla aquí. La página register.html utilizará
 * su propio archivo: js/register.js.
 */

import { auth } from "./firebase.js";

import {
    browserLocalPersistence,
    browserSessionPersistence,
    onAuthStateChanged,
    sendPasswordResetEmail,
    setPersistence,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

/* =========================================================
   CONFIGURACIÓN
========================================================= */

const DASHBOARD_URL = document.body.dataset.dashboardUrl?.trim() || "";
const MIN_PASSWORD_LENGTH = 6;

/* =========================================================
   REFERENCIAS DEL DOM
========================================================= */

const elements = {
    authMessage: document.getElementById("authMessage"),
    loginForm: document.getElementById("loginForm"),
    email: document.getElementById("email"),
    password: document.getElementById("password"),
    remember: document.getElementById("remember"),
    loginButton: document.getElementById("loginButton"),
    forgotPassword: document.getElementById("forgotPassword"),
    registerLink: document.getElementById("registerLink"),
    togglePassword: document.getElementById("togglePassword"),
    socialButtons: document.querySelectorAll("[data-provider]")
};

/* =========================================================
   INICIALIZACIÓN
========================================================= */

document.addEventListener("DOMContentLoaded", initializeLogin);

function initializeLogin() {
    if (!validateRequiredElements()) {
        return;
    }

    configurePasswordToggle();
    configureLoginForm();
    configurePasswordReset();
    configureSocialButtons();
    observeAuthenticationState();
}

/**
 * Comprueba que index.html tenga todos los elementos necesarios.
 * Devuelve false para detener la ejecución cuando falta alguno.
 */
function validateRequiredElements() {
    const requiredElements = [
        "authMessage",
        "loginForm",
        "email",
        "password",
        "remember",
        "loginButton",
        "forgotPassword",
        "registerLink"
    ];

    const missingElements = requiredElements.filter((key) => !elements[key]);

    if (missingElements.length === 0) {
        return true;
    }

    console.error(
        `StudyTrack no encontró estos elementos en index.html: ${missingElements.join(", ")}`
    );

    return false;
}

/* =========================================================
   INICIO DE SESIÓN
========================================================= */

function configureLoginForm() {
    elements.loginForm.addEventListener("submit", handleLogin);
}

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

        const credential = await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        showMessage(
            `Sesión iniciada correctamente${
                credential.user.displayName
                    ? `, ${credential.user.displayName}`
                    : ""
            }.`,
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

/* =========================================================
   RECUPERACIÓN DE CONTRASEÑA
========================================================= */

function configurePasswordReset() {
    elements.forgotPassword.addEventListener("click", handlePasswordReset);
}

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
        console.error("Error al enviar la recuperación:", error);
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

        if (DASHBOARD_URL) {
            window.location.replace(DASHBOARD_URL);
            return;
        }

        showMessage(
            `Hay una sesión activa${
                user.displayName ? ` de ${user.displayName}` : ""
            }. El Dashboard se conectará en la siguiente fase.`,
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
   MOSTRAR Y OCULTAR CONTRASEÑA
========================================================= */

function configurePasswordToggle() {
    createPasswordToggle(elements.togglePassword, elements.password);
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

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeEmail(email) {
    return email.trim().toLowerCase();
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
        "auth/invalid-credential": "El correo o la contraseña son incorrectos.",
        "auth/user-disabled": "Esta cuenta fue deshabilitada.",
        "auth/user-not-found": "No encontramos una cuenta con ese correo.",
        "auth/wrong-password": "La contraseña es incorrecta.",
        "auth/too-many-requests": "Se realizaron demasiados intentos. Espera unos minutos y vuelve a intentarlo.",
        "auth/network-request-failed": "No se pudo conectar con Firebase. Revisa tu conexión a internet.",
        "auth/operation-not-allowed": "El acceso por correo y contraseña no está habilitado en Firebase Authentication."
    };

    return messages[code] || "Ocurrió un error inesperado. Inténtalo nuevamente.";
}
