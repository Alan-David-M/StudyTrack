/**
 * StudyTrack - Registro de cuentas
 * Archivo: js/register.js
 *
 * Funciones incluidas:
 * - Creación de cuenta con correo y contraseña.
 * - Validación de nombre, usuario, correo y contraseñas.
 * - Reserva de nombres de usuario únicos en Cloud Firestore.
 * - Creación del perfil básico del estudiante.
 * - Mostrar y ocultar contraseñas.
 * - Indicador visual de fortaleza de contraseña.
 * - Traducción de errores comunes de Firebase al español.
 */

import { auth, db } from "./firebase.js";

import {
    browserLocalPersistence,
    createUserWithEmailAndPassword,
    deleteUser,
    onAuthStateChanged,
    setPersistence,
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
    authMessage: document.getElementById("authMessage"),
    registerForm: document.getElementById("registerForm"),
    registerName: document.getElementById("registerName"),
    registerUsername: document.getElementById("registerUsername"),
    registerEmail: document.getElementById("registerEmail"),
    registerPassword: document.getElementById("registerPassword"),
    registerConfirmPassword: document.getElementById("registerConfirmPassword"),
    acceptTerms: document.getElementById("acceptTerms"),
    registerButton: document.getElementById("registerButton"),
    toggleRegisterPassword: document.getElementById("toggleRegisterPassword"),
    toggleConfirmPassword: document.getElementById("toggleConfirmPassword"),
    passwordStrengthBar: document.getElementById("passwordStrengthBar"),
    passwordStrengthText: document.getElementById("passwordStrengthText"),
    termsLink: document.getElementById("termsLink")
};

/* =========================================================
   INICIALIZACIÓN
========================================================= */

document.addEventListener("DOMContentLoaded", initializeRegisterPage);

function initializeRegisterPage() {
    validateRequiredElements();
    configurePasswordToggles();
    configurePasswordStrength();
    configureTermsLink();
    elements.registerForm.addEventListener("submit", handleRegistration);
    observeAuthenticationState();
}

function validateRequiredElements() {
    const requiredElements = [
        "authMessage",
        "registerForm",
        "registerName",
        "registerUsername",
        "registerEmail",
        "registerPassword",
        "registerConfirmPassword",
        "acceptTerms",
        "registerButton",
        "passwordStrengthBar",
        "passwordStrengthText"
    ];

    const missingElements = requiredElements.filter((key) => !elements[key]);

    if (missingElements.length > 0) {
        throw new Error(
            `StudyTrack no encontró estos elementos de register.html: ${missingElements.join(", ")}`
        );
    }
}

/* =========================================================
   CREACIÓN DE CUENTA
========================================================= */

async function handleRegistration(event) {
    event.preventDefault();
    clearMessage();

    const formData = {
        name: normalizeSpaces(elements.registerName.value),
        username: elements.registerUsername.value.trim(),
        email: normalizeEmail(elements.registerEmail.value),
        password: elements.registerPassword.value,
        confirmPassword: elements.registerConfirmPassword.value,
        acceptedTerms: elements.acceptTerms.checked
    };

    const validationError = validateRegistrationData(formData);

    if (validationError) {
        showMessage(validationError.message, "error");
        focusField(validationError.field);
        return;
    }

    setButtonLoading(elements.registerButton, true, "Creando cuenta...");

    let createdUser = null;

    try {
        // La sesión se conserva en el dispositivo después del registro.
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

        elements.registerForm.reset();
        updatePasswordStrength("");

        showMessage(
            DASHBOARD_URL
                ? "Tu cuenta fue creada correctamente. Abriendo StudyTrack..."
                : "Tu cuenta fue creada correctamente. El Dashboard se conectará en la siguiente fase.",
            "success"
        );

        redirectToDashboard();
    } catch (error) {
        console.error("Error al crear la cuenta:", error);

        // Si Firestore falla después de crear la cuenta en Authentication,
        // intentamos eliminarla para no dejar un registro incompleto.
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
 * Reserva el nombre de usuario y guarda el perfil en una transacción.
 * La contraseña nunca se guarda en Firestore: Firebase Authentication
 * se encarga de protegerla.
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
   VALIDACIONES
========================================================= */

function validateRegistrationData({
    name,
    username,
    email,
    password,
    confirmPassword,
    acceptedTerms
}) {
    if (!name) {
        return createValidationError("Escribe tu nombre completo.", "registerName");
    }

    if (name.length < 2) {
        return createValidationError("Escribe un nombre válido.", "registerName");
    }

    if (!username) {
        return createValidationError("Elige un nombre de usuario.", "registerUsername");
    }

    if (!USERNAME_PATTERN.test(username)) {
        return createValidationError(
            "El usuario debe tener entre 3 y 24 caracteres y solo puede incluir letras, números, punto, guion o guion bajo.",
            "registerUsername"
        );
    }

    if (!email) {
        return createValidationError("Escribe tu correo electrónico.", "registerEmail");
    }

    if (!isValidEmail(email)) {
        return createValidationError("Escribe un correo electrónico válido.", "registerEmail");
    }

    if (!password) {
        return createValidationError("Crea una contraseña.", "registerPassword");
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
        return createValidationError(
            `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
            "registerPassword"
        );
    }

    if (!confirmPassword) {
        return createValidationError(
            "Confirma tu contraseña.",
            "registerConfirmPassword"
        );
    }

    if (password !== confirmPassword) {
        return createValidationError(
            "Las contraseñas no coinciden.",
            "registerConfirmPassword"
        );
    }

    if (!acceptedTerms) {
        return createValidationError(
            "Debes aceptar los términos de uso y el aviso de privacidad.",
            "acceptTerms"
        );
    }

    return null;
}

function createValidationError(message, field) {
    return { message, field };
}

function focusField(fieldName) {
    const field = elements[fieldName];

    if (field && typeof field.focus === "function") {
        field.focus();
    }
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
   FORTALEZA DE CONTRASEÑA
========================================================= */

function configurePasswordStrength() {
    elements.registerPassword.addEventListener("input", (event) => {
        updatePasswordStrength(event.target.value);
    });
}

function updatePasswordStrength(password) {
    const level = calculatePasswordStrength(password);
    const labels = {
        empty: "Usa una combinación difícil de adivinar.",
        weak: "Contraseña débil.",
        medium: "Contraseña aceptable.",
        strong: "Contraseña fuerte."
    };

    if (level === "empty") {
        delete elements.passwordStrengthBar.dataset.level;
    } else {
        elements.passwordStrengthBar.dataset.level = level;
    }

    elements.passwordStrengthText.textContent = labels[level];
}

function calculatePasswordStrength(password) {
    if (!password) {
        return "empty";
    }

    let score = 0;

    if (password.length >= 6) score += 1;
    if (password.length >= 10) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^a-zA-Z0-9]/.test(password)) score += 1;

    if (score <= 2) return "weak";
    if (score <= 4) return "medium";
    return "strong";
}

/* =========================================================
   MOSTRAR Y OCULTAR CONTRASEÑAS
========================================================= */

function configurePasswordToggles() {
    createPasswordToggle(
        elements.toggleRegisterPassword,
        elements.registerPassword
    );

    createPasswordToggle(
        elements.toggleConfirmPassword,
        elements.registerConfirmPassword
    );
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
   TÉRMINOS Y PRIVACIDAD
========================================================= */

function configureTermsLink() {
    if (!elements.termsLink) {
        return;
    }

    elements.termsLink.addEventListener("click", (event) => {
        event.preventDefault();
        showMessage(
            "La página de términos y privacidad se agregará antes de publicar la versión final de StudyTrack.",
            "info"
        );
    });
}

/* =========================================================
   ESTADO DE AUTENTICACIÓN Y REDIRECCIÓN
========================================================= */

function observeAuthenticationState() {
    onAuthStateChanged(auth, (user) => {
        if (!user || !DASHBOARD_URL) {
            return;
        }

        window.location.replace(DASHBOARD_URL);
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
   MENSAJES Y ESTADOS DE CARGA
========================================================= */

function showMessage(message, type = "info") {
    const allowedTypes = new Set(["success", "error", "info"]);
    const selectedType = allowedTypes.has(type) ? type : "info";

    elements.authMessage.textContent = message;
    elements.authMessage.hidden = false;
    elements.authMessage.className = `auth-message auth-message--${selectedType}`;
}

function clearMessage() {
    elements.authMessage.hidden = true;
    elements.authMessage.textContent = "";
    elements.authMessage.className = "auth-message";
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
        "auth/missing-password": "Crea una contraseña.",
        "auth/weak-password": "La contraseña es demasiado débil. Usa al menos 6 caracteres.",
        "auth/email-already-in-use": "Ya existe una cuenta registrada con este correo.",
        "auth/username-already-in-use": "Ese nombre de usuario ya está ocupado. Elige otro.",
        "auth/too-many-requests": "Se realizaron demasiados intentos. Espera unos minutos y vuelve a intentarlo.",
        "auth/network-request-failed": "No se pudo conectar con Firebase. Revisa tu conexión a internet.",
        "auth/operation-not-allowed": "El registro con correo y contraseña no está habilitado en Firebase Authentication.",
        "permission-denied": "Firestore rechazó la operación. Revisa las reglas de seguridad de la base de datos.",
        "firestore/permission-denied": "Firestore rechazó la operación. Revisa las reglas de seguridad de la base de datos."
    };

    return messages[code] || "Ocurrió un error inesperado al crear la cuenta. Inténtalo nuevamente.";
}
