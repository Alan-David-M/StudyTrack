/**
 * StudyTrack - Administración de Materias
 * Archivo: js/materias.js
 *
 * Incluye:
 * - Protección de sesión.
 * - Perfil del usuario.
 * - Crear, editar y eliminar materias.
 * - Iconos y colores personalizados.
 * - Profesor, salón, horario y descripción.
 * - Búsqueda, orden y vistas en tarjetas/lista.
 * - Guardado en Firestore separado por usuario.
 * - Panel de detalle con tareas vinculadas.
 * - Actualización en tiempo real mediante onSnapshot.
 */

import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    onSnapshot,
    query,
    serverTimestamp,
    updateDoc,
    where
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* =========================================================
   CONFIGURACIÓN
========================================================= */

const LOGIN_URL = document.body.dataset.loginUrl?.trim() || "index.html";
const DASHBOARD_URL = document.body.dataset.dashboardUrl?.trim() || "dashboard.html";
const SUBJECTS_COLLECTION = "subjects";
const TASKS_COLLECTION = "tasks";

const DEFAULT_ICON = "fa-solid fa-book-open";
const DEFAULT_COLOR = "#2F80ED";

const state = {
    user: null,
    profile: null,
    subjects: [],
    tasks: [],
    searchTerm: "",
    sortMode: "recent",
    viewMode: localStorage.getItem("studytrack-subject-view") || "grid",
    selectedIcon: DEFAULT_ICON,
    selectedColor: DEFAULT_COLOR,
    activeSubjectId: null,
    pendingDeleteId: null,
    unsubscribeSubjects: null,
    unsubscribeTasks: null,
    sidebarCollapsed: localStorage.getItem("studytrack-sidebar-collapsed") === "true"
};

/* =========================================================
   REFERENCIAS
========================================================= */

const elements = {
    appShell: document.getElementById("appShell"),
    loadingScreen: document.getElementById("loadingScreen"),

    sidebarCollapse: document.getElementById("sidebarCollapse"),
    mobileMenuButton: document.getElementById("mobileMenuButton"),
    mobileDrawer: document.getElementById("mobileDrawer"),
    drawerBackdrop: document.getElementById("drawerBackdrop"),
    closeDrawerButton: document.getElementById("closeDrawerButton"),

    globalSearch: document.getElementById("globalSearch"),
    subjectsSearch: document.getElementById("subjectsSearch"),
    clearSearchButton: document.getElementById("clearSearchButton"),
    sortSubjects: document.getElementById("sortSubjects"),
    gridViewButton: document.getElementById("gridViewButton"),
    listViewButton: document.getElementById("listViewButton"),

    notificationButton: document.getElementById("notificationButton"),
    notificationPopover: document.getElementById("notificationPopover"),
    profileButton: document.getElementById("profileButton"),
    profilePopover: document.getElementById("profilePopover"),

    topAvatar: document.getElementById("topAvatar"),
    menuAvatar: document.getElementById("menuAvatar"),
    topUserName: document.getElementById("topUserName"),
    menuUserName: document.getElementById("menuUserName"),
    menuUserEmail: document.getElementById("menuUserEmail"),

    logoutButton: document.getElementById("logoutButton"),
    drawerLogoutButton: document.getElementById("drawerLogoutButton"),

    newSubjectButton: document.getElementById("newSubjectButton"),
    sidebarNewSubjectButton: document.getElementById("sidebarNewSubjectButton"),
    resultsNewSubjectButton: document.getElementById("resultsNewSubjectButton"),
    mobileNewSubjectButton: document.getElementById("mobileNewSubjectButton"),

    subjectsTotal: document.getElementById("subjectsTotal"),
    subjectsResultsText: document.getElementById("subjectsResultsText"),
    subjectsSectionTitle: document.getElementById("subjectsSectionTitle"),
    subjectsGrid: document.getElementById("subjectsGrid"),

    subjectModalBackdrop: document.getElementById("subjectModalBackdrop"),
    subjectModal: document.getElementById("subjectModal"),
    closeSubjectModalButton: document.getElementById("closeSubjectModalButton"),
    cancelSubjectButton: document.getElementById("cancelSubjectButton"),
    subjectForm: document.getElementById("subjectForm"),
    editingSubjectId: document.getElementById("editingSubjectId"),
    subjectModalKicker: document.getElementById("subjectModalKicker"),
    subjectModalTitle: document.getElementById("subjectModalTitle"),
    subjectModalSubtitle: document.getElementById("subjectModalSubtitle"),
    saveSubjectButton: document.getElementById("saveSubjectButton"),
    saveSubjectButtonText: document.getElementById("saveSubjectButtonText"),
    subjectFormMessage: document.getElementById("subjectFormMessage"),

    subjectName: document.getElementById("subjectName"),
    subjectTeacher: document.getElementById("subjectTeacher"),
    subjectClassroom: document.getElementById("subjectClassroom"),
    subjectSchedule: document.getElementById("subjectSchedule"),
    subjectDescription: document.getElementById("subjectDescription"),
    descriptionCounter: document.getElementById("descriptionCounter"),
    iconPicker: document.getElementById("iconPicker"),
    colorPicker: document.getElementById("colorPicker"),

    subjectPreview: document.getElementById("subjectPreview"),
    subjectPreviewIcon: document.getElementById("subjectPreviewIcon"),
    subjectPreviewName: document.getElementById("subjectPreviewName"),
    subjectPreviewTeacher: document.getElementById("subjectPreviewTeacher"),

    detailsBackdrop: document.getElementById("detailsBackdrop"),
    subjectDetailsPanel: document.getElementById("subjectDetailsPanel"),
    closeDetailsButton: document.getElementById("closeDetailsButton"),
    detailsHeader: document.getElementById("detailsHeader"),
    detailsIcon: document.getElementById("detailsIcon"),
    detailsName: document.getElementById("detailsName"),
    detailsDescription: document.getElementById("detailsDescription"),
    detailsTeacher: document.getElementById("detailsTeacher"),
    detailsClassroom: document.getElementById("detailsClassroom"),
    detailsSchedule: document.getElementById("detailsSchedule"),
    detailsTasksCount: document.getElementById("detailsTasksCount"),
    subjectTasksList: document.getElementById("subjectTasksList"),
    detailsEditButton: document.getElementById("detailsEditButton"),
    detailsDeleteButton: document.getElementById("detailsDeleteButton"),
    detailsAddTaskButton: document.getElementById("detailsAddTaskButton"),

    confirmBackdrop: document.getElementById("confirmBackdrop"),
    confirmDialog: document.getElementById("confirmDialog"),
    confirmSubjectName: document.getElementById("confirmSubjectName"),
    cancelDeleteButton: document.getElementById("cancelDeleteButton"),
    confirmDeleteButton: document.getElementById("confirmDeleteButton"),

    toastRegion: document.getElementById("toastRegion")
};

/* =========================================================
   INICIO
========================================================= */

document.addEventListener("DOMContentLoaded", initializeSubjectsPage);

function initializeSubjectsPage() {
    configureSidebar();
    configureDrawer();
    configurePopovers();
    configureSearchAndSort();
    configureViewSwitcher();
    configureSubjectModal();
    configureDetailsPanel();
    configureDeleteDialog();
    configureComingSoonButtons();
    configureLogout();
    applyViewMode();
    observeAuthentication();
}

/* =========================================================
   AUTENTICACIÓN
========================================================= */

function observeAuthentication() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.replace(LOGIN_URL);
            return;
        }

        state.user = user;

        try {
            state.profile = await loadUserProfile(user);
            renderUserIdentity();
            subscribeToSubjects(user.uid);
            subscribeToTasks(user.uid);
            openNewModalFromUrl();
        } catch (error) {
            console.error("No se pudo iniciar Materias:", error);
            showToast(
                "No pudimos cargar tus materias",
                "Revisa tu conexión y las reglas de Firestore."
            );
            hideLoadingScreen();
        }
    });
}

async function loadUserProfile(user) {
    const snapshot = await getDoc(doc(db, "users", user.uid));

    if (snapshot.exists()) {
        return {
            name: user.displayName || getNameFromEmail(user.email),
            email: user.email || "",
            ...snapshot.data()
        };
    }

    return {
        uid: user.uid,
        name: user.displayName || getNameFromEmail(user.email),
        email: user.email || ""
    };
}

function renderUserIdentity() {
    const fullName = normalizeSpaces(
        state.profile?.name ||
        state.user?.displayName ||
        getNameFromEmail(state.user?.email)
    ) || "Estudiante";

    const initials = createInitials(fullName);
    const email = state.profile?.email || state.user?.email || "";

    elements.topUserName.textContent = fullName;
    elements.menuUserName.textContent = fullName;
    elements.menuUserEmail.textContent = email || "Sin correo disponible";
    elements.topAvatar.textContent = initials;
    elements.menuAvatar.textContent = initials;
}

async function handleLogout() {
    setLogoutDisabled(true);

    try {
        cleanupSubscriptions();
        await signOut(auth);
        window.location.replace(LOGIN_URL);
    } catch (error) {
        console.error("No se pudo cerrar sesión:", error);
        showToast("No se pudo cerrar sesión", "Inténtalo nuevamente.");
        setLogoutDisabled(false);
    }
}

function setLogoutDisabled(disabled) {
    [elements.logoutButton, elements.drawerLogoutButton].forEach((button) => {
        if (button) {
            button.disabled = disabled;
        }
    });
}

function cleanupSubscriptions() {
    state.unsubscribeSubjects?.();
    state.unsubscribeTasks?.();
    state.unsubscribeSubjects = null;
    state.unsubscribeTasks = null;
}

/* =========================================================
   FIRESTORE EN TIEMPO REAL
========================================================= */

function subscribeToSubjects(uid) {
    state.unsubscribeSubjects?.();

    const subjectsQuery = query(
        collection(db, SUBJECTS_COLLECTION),
        where("userId", "==", uid)
    );

    state.unsubscribeSubjects = onSnapshot(
        subjectsQuery,
        (snapshot) => {
            state.subjects = snapshot.docs.map((subjectDocument) => ({
                id: subjectDocument.id,
                ...subjectDocument.data()
            }));

            renderSubjects();
            refreshActiveDetails();
            hideLoadingScreen();
        },
        (error) => {
            console.error("Error al leer materias:", error);
            elements.subjectsGrid.setAttribute("aria-busy", "false");
            elements.subjectsGrid.innerHTML = createErrorState(
                "No pudimos cargar tus materias",
                "Verifica las reglas de seguridad de Firestore."
            );
            hideLoadingScreen();
        }
    );
}

function subscribeToTasks(uid) {
    state.unsubscribeTasks?.();

    const tasksQuery = query(
        collection(db, TASKS_COLLECTION),
        where("userId", "==", uid)
    );

    state.unsubscribeTasks = onSnapshot(
        tasksQuery,
        (snapshot) => {
            state.tasks = snapshot.docs.map((taskDocument) => ({
                id: taskDocument.id,
                ...taskDocument.data()
            }));

            renderSubjects();
            refreshActiveDetails();
        },
        (error) => {
            // La colección Tasks puede estar vacía o pendiente de la siguiente fase.
            console.debug("Las tareas todavía no están disponibles:", error?.code || error);
            state.tasks = [];
            renderSubjects();
            refreshActiveDetails();
        }
    );
}

/* =========================================================
   CREAR Y EDITAR
========================================================= */

function configureSubjectModal() {
    [
        elements.newSubjectButton,
        elements.sidebarNewSubjectButton,
        elements.resultsNewSubjectButton,
        elements.mobileNewSubjectButton
    ].forEach((button) => {
        button?.addEventListener("click", () => openSubjectModal());
    });

    elements.closeSubjectModalButton.addEventListener("click", closeSubjectModal);
    elements.cancelSubjectButton.addEventListener("click", closeSubjectModal);
    elements.subjectModalBackdrop.addEventListener("click", closeSubjectModal);
    elements.subjectForm.addEventListener("submit", saveSubject);

    elements.subjectName.addEventListener("input", updatePreview);
    elements.subjectTeacher.addEventListener("input", updatePreview);
    elements.subjectDescription.addEventListener("input", () => {
        elements.descriptionCounter.textContent = String(
            elements.subjectDescription.value.length
        );
    });

    elements.iconPicker.querySelectorAll("[data-icon]").forEach((button) => {
        button.addEventListener("click", () => {
            selectIcon(button.dataset.icon);
        });
    });

    elements.colorPicker.querySelectorAll("[data-color]").forEach((button) => {
        button.addEventListener("click", () => {
            selectColor(button.dataset.color);
        });
    });
}

function openSubjectModal(subjectId = "") {
    clearFormMessage();
    closeCardMenus();

    const subject = subjectId
        ? state.subjects.find((item) => item.id === subjectId)
        : null;

    elements.subjectForm.reset();
    elements.editingSubjectId.value = subject?.id || "";
    elements.descriptionCounter.textContent = String(
        subject?.description?.length || 0
    );

    if (subject) {
        elements.subjectModalKicker.textContent = "Editar materia";
        elements.subjectModalTitle.textContent = "Actualiza la materia";
        elements.subjectModalSubtitle.textContent =
            "Los cambios se reflejarán automáticamente en tu cuenta.";
        elements.saveSubjectButtonText.textContent = "Guardar cambios";

        elements.subjectName.value = subject.name || "";
        elements.subjectTeacher.value = subject.teacher || "";
        elements.subjectClassroom.value = subject.classroom || "";
        elements.subjectSchedule.value = subject.schedule || "";
        elements.subjectDescription.value = subject.description || "";

        selectIcon(subject.icon || DEFAULT_ICON);
        selectColor(subject.color || DEFAULT_COLOR);
    } else {
        elements.subjectModalKicker.textContent = "Nueva materia";
        elements.subjectModalTitle.textContent = "Crea una materia";
        elements.subjectModalSubtitle.textContent =
            "Personaliza sus datos para reconocerla fácilmente.";
        elements.saveSubjectButtonText.textContent = "Crear materia";

        selectIcon(DEFAULT_ICON);
        selectColor(DEFAULT_COLOR);
    }

    updatePreview();

    elements.subjectModalBackdrop.hidden = false;
    elements.subjectModal.hidden = false;
    document.body.style.overflow = "hidden";

    window.setTimeout(() => {
        elements.subjectName.focus();
    }, 80);
}

function closeSubjectModal(force = false) {
    if (elements.saveSubjectButton.disabled && !force) {
        return;
    }

    elements.subjectModalBackdrop.hidden = true;
    elements.subjectModal.hidden = true;
    document.body.style.removeProperty("overflow");
    clearFormMessage();

    const url = new URL(window.location.href);

    if (url.searchParams.get("action") === "new") {
        url.searchParams.delete("action");
        window.history.replaceState({}, "", url);
    }
}

function openNewModalFromUrl() {
    const url = new URL(window.location.href);

    if (url.searchParams.get("action") === "new") {
        window.setTimeout(() => openSubjectModal(), 180);
    }
}

async function saveSubject(event) {
    event.preventDefault();
    clearFormMessage();

    const data = readSubjectForm();
    const validationMessage = validateSubject(data);

    if (validationMessage) {
        showFormMessage(validationMessage);
        return;
    }

    setSaveLoading(true);

    try {
        const editingId = elements.editingSubjectId.value.trim();

        if (editingId) {
            await updateDoc(doc(db, SUBJECTS_COLLECTION, editingId), {
                ...data,
                updatedAt: serverTimestamp()
            });

            showToast(
                "Materia actualizada",
                `${data.name} se actualizó correctamente.`
            );
        } else {
            await addDoc(collection(db, SUBJECTS_COLLECTION), {
                ...data,
                userId: state.user.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            showToast(
                "Materia creada",
                `${data.name} ya está disponible en tu cuenta.`
            );
        }

        closeSubjectModal(true);
    } catch (error) {
        console.error("No se pudo guardar la materia:", error);
        showFormMessage(getFirestoreErrorMessage(error));
    } finally {
        setSaveLoading(false);
    }
}

function readSubjectForm() {
    return {
        name: normalizeSpaces(elements.subjectName.value),
        teacher: normalizeSpaces(elements.subjectTeacher.value),
        classroom: normalizeSpaces(elements.subjectClassroom.value),
        schedule: normalizeSpaces(elements.subjectSchedule.value),
        description: elements.subjectDescription.value.trim(),
        icon: state.selectedIcon,
        color: state.selectedColor
    };
}

function validateSubject(data) {
    if (!data.name) {
        return "Escribe el nombre de la materia.";
    }

    if (data.name.length < 2) {
        return "El nombre de la materia debe tener al menos 2 caracteres.";
    }

    if (data.name.length > 60) {
        return "El nombre de la materia no puede superar 60 caracteres.";
    }

    return "";
}

function selectIcon(icon) {
    state.selectedIcon = icon || DEFAULT_ICON;

    elements.iconPicker.querySelectorAll("[data-icon]").forEach((button) => {
        const active = button.dataset.icon === state.selectedIcon;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });

    updatePreview();
}

function selectColor(color) {
    state.selectedColor = isValidHexColor(color) ? color : DEFAULT_COLOR;

    elements.colorPicker.querySelectorAll("[data-color]").forEach((button) => {
        const active = button.dataset.color.toUpperCase() === state.selectedColor.toUpperCase();
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });

    document.documentElement.style.setProperty("--preview-color", state.selectedColor);
    updatePreview();
}

function updatePreview() {
    const name = normalizeSpaces(elements.subjectName.value) || "Nueva materia";
    const teacher = normalizeSpaces(elements.subjectTeacher.value) || "Profesor por definir";

    elements.subjectPreview.style.setProperty("--preview-color", state.selectedColor);
    elements.subjectPreviewName.textContent = name;
    elements.subjectPreviewTeacher.textContent = teacher;
    elements.subjectPreviewIcon.innerHTML = `<i class="${escapeHtml(state.selectedIcon)}"></i>`;
}

function setSaveLoading(loading) {
    elements.saveSubjectButton.disabled = loading;
    elements.closeSubjectModalButton.disabled = loading;
    elements.cancelSubjectButton.disabled = loading;

    if (loading) {
        elements.saveSubjectButton.dataset.originalHtml =
            elements.saveSubjectButton.innerHTML;
        elements.saveSubjectButton.innerHTML = `
            <span>Guardando...</span>
            <i class="fa-solid fa-spinner fa-spin"></i>
        `;
        return;
    }

    if (elements.saveSubjectButton.dataset.originalHtml) {
        elements.saveSubjectButton.innerHTML =
            elements.saveSubjectButton.dataset.originalHtml;
        delete elements.saveSubjectButton.dataset.originalHtml;
    }
}

/* =========================================================
   ELIMINAR
========================================================= */

function configureDeleteDialog() {
    elements.cancelDeleteButton.addEventListener("click", closeDeleteDialog);
    elements.confirmBackdrop.addEventListener("click", closeDeleteDialog);
    elements.confirmDeleteButton.addEventListener("click", deleteSelectedSubject);
}

function openDeleteDialog(subjectId) {
    const subject = state.subjects.find((item) => item.id === subjectId);

    if (!subject) {
        return;
    }

    state.pendingDeleteId = subjectId;
    elements.confirmSubjectName.textContent = subject.name || "Materia";
    elements.confirmBackdrop.hidden = false;
    elements.confirmDialog.hidden = false;
    document.body.style.overflow = "hidden";
}

function closeDeleteDialog(force = false) {
    if (elements.confirmDeleteButton.disabled && !force) {
        return;
    }

    state.pendingDeleteId = null;
    elements.confirmBackdrop.hidden = true;
    elements.confirmDialog.hidden = true;

    if (elements.subjectDetailsPanel.getAttribute("aria-hidden") === "true") {
        document.body.style.removeProperty("overflow");
    }
}

async function deleteSelectedSubject() {
    const subjectId = state.pendingDeleteId;
    const subject = state.subjects.find((item) => item.id === subjectId);

    if (!subjectId || !subject) {
        closeDeleteDialog();
        return;
    }

    setDeleteLoading(true);

    try {
        await deleteDoc(doc(db, SUBJECTS_COLLECTION, subjectId));

        if (state.activeSubjectId === subjectId) {
            closeDetailsPanel();
        }

        showToast(
            "Materia eliminada",
            `${subject.name} se eliminó de tu cuenta.`
        );

        closeDeleteDialog(true);
    } catch (error) {
        console.error("No se pudo eliminar la materia:", error);
        showToast(
            "No se pudo eliminar",
            getFirestoreErrorMessage(error)
        );
    } finally {
        setDeleteLoading(false);
    }
}

function setDeleteLoading(loading) {
    elements.confirmDeleteButton.disabled = loading;
    elements.cancelDeleteButton.disabled = loading;

    if (loading) {
        elements.confirmDeleteButton.dataset.originalHtml =
            elements.confirmDeleteButton.innerHTML;
        elements.confirmDeleteButton.innerHTML = `
            <span>Eliminando...</span>
            <i class="fa-solid fa-spinner fa-spin"></i>
        `;
        return;
    }

    if (elements.confirmDeleteButton.dataset.originalHtml) {
        elements.confirmDeleteButton.innerHTML =
            elements.confirmDeleteButton.dataset.originalHtml;
        delete elements.confirmDeleteButton.dataset.originalHtml;
    }
}

/* =========================================================
   RENDER DE MATERIAS
========================================================= */

function renderSubjects() {
    const filteredSubjects = getVisibleSubjects();
    const total = state.subjects.length;

    elements.subjectsTotal.textContent = String(total);
    elements.subjectsGrid.setAttribute("aria-busy", "false");

    if (!total) {
        elements.subjectsSectionTitle.textContent = "Empieza tu organización";
        elements.subjectsResultsText.textContent = "Todavía no has creado materias.";
        elements.subjectsGrid.innerHTML = createEmptyState();
        reconnectNewSubjectButton();
        return;
    }

    if (!filteredSubjects.length) {
        elements.subjectsSectionTitle.textContent = "Sin coincidencias";
        elements.subjectsResultsText.textContent =
            `No encontramos materias para “${state.searchTerm}”.`;
        elements.subjectsGrid.innerHTML = createSearchEmptyState();
        reconnectClearSearchButton();
        return;
    }

    elements.subjectsSectionTitle.textContent = state.searchTerm
        ? "Resultados de búsqueda"
        : "Todas tus materias";

    elements.subjectsResultsText.textContent =
        `${filteredSubjects.length} ${
            filteredSubjects.length === 1 ? "materia visible" : "materias visibles"
        } de ${total}.`;

    elements.subjectsGrid.innerHTML = filteredSubjects
        .map(createSubjectCard)
        .join("");

    connectSubjectCards();
}

function getVisibleSubjects() {
    const search = state.searchTerm.toLowerCase();

    const filtered = state.subjects.filter((subject) => {
        if (!search) {
            return true;
        }

        return [
            subject.name,
            subject.teacher,
            subject.classroom,
            subject.schedule,
            subject.description
        ].some((value) => String(value || "").toLowerCase().includes(search));
    });

    return filtered.sort(sortSubjects);
}

function sortSubjects(a, b) {
    switch (state.sortMode) {
        case "oldest":
            return getTimestamp(a.createdAt) - getTimestamp(b.createdAt);

        case "name-asc":
            return compareText(a.name, b.name);

        case "name-desc":
            return compareText(b.name, a.name);

        case "teacher-asc":
            return compareText(a.teacher || "zzzz", b.teacher || "zzzz");

        case "recent":
        default:
            return getTimestamp(b.createdAt) - getTimestamp(a.createdAt);
    }
}

function createSubjectCard(subject) {
    const color = isValidHexColor(subject.color) ? subject.color : DEFAULT_COLOR;
    const icon = subject.icon || DEFAULT_ICON;
    const taskCount = getTasksForSubject(subject.id).length;
    const teacher = subject.teacher || "Profesor por definir";
    const classroom = subject.classroom || "Salón por definir";
    const schedule = subject.schedule || "Horario por definir";
    const description = subject.description || "Agrega una descripción para esta materia.";

    return `
        <article
            class="subject-card"
            data-subject-id="${escapeHtml(subject.id)}"
            style="--subject-color:${escapeHtml(color)}"
            tabindex="0"
            aria-label="Abrir ${escapeHtml(subject.name || "materia")}"
        >
            <div class="subject-card-accent"></div>

            <div class="subject-card-top">
                <span class="subject-card-icon">
                    <i class="${escapeHtml(icon)}"></i>
                </span>

                <div class="subject-card-menu-wrapper">
                    <button
                        class="subject-card-menu-button"
                        type="button"
                        aria-label="Opciones de ${escapeHtml(subject.name || "materia")}"
                        aria-expanded="false"
                    >
                        <i class="fa-solid fa-ellipsis"></i>
                    </button>

                    <div class="subject-card-menu" hidden>
                        <button type="button" data-action="open">
                            <i class="fa-regular fa-eye"></i>
                            Abrir
                        </button>
                        <button type="button" data-action="edit">
                            <i class="fa-regular fa-pen-to-square"></i>
                            Editar
                        </button>
                        <button type="button" data-action="delete">
                            <i class="fa-regular fa-trash-can"></i>
                            Eliminar
                        </button>
                    </div>
                </div>
            </div>

            <div class="subject-card-main">
                <h3 title="${escapeHtml(subject.name || "Materia")}">
                    ${escapeHtml(subject.name || "Materia")}
                </h3>

                <p class="subject-card-teacher">
                    <i class="fa-solid fa-chalkboard-user"></i>
                    <span>${escapeHtml(teacher)}</span>
                </p>

                <p class="subject-card-description">
                    ${escapeHtml(description)}
                </p>

                <div class="subject-meta-list">
                    <div class="subject-meta-item">
                        <i class="fa-solid fa-door-open"></i>
                        <span>${escapeHtml(classroom)}</span>
                    </div>
                    <div class="subject-meta-item">
                        <i class="fa-regular fa-clock"></i>
                        <span>${escapeHtml(schedule)}</span>
                    </div>
                </div>
            </div>

            <footer class="subject-card-footer">
                <span class="subject-task-count">
                    <i class="fa-regular fa-clipboard"></i>
                    ${taskCount} ${taskCount === 1 ? "tarea" : "tareas"}
                </span>
                <button class="subject-open-button" type="button" data-action="open">
                    Abrir
                    <i class="fa-solid fa-arrow-right"></i>
                </button>
            </footer>
        </article>
    `;
}

function connectSubjectCards() {
    elements.subjectsGrid.querySelectorAll(".subject-card").forEach((card) => {
        const subjectId = card.dataset.subjectId;
        const menuButton = card.querySelector(".subject-card-menu-button");
        const menu = card.querySelector(".subject-card-menu");

        card.addEventListener("click", (event) => {
            if (event.target.closest("button")) {
                return;
            }

            openDetailsPanel(subjectId);
        });

        card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openDetailsPanel(subjectId);
            }
        });

        menuButton.addEventListener("click", (event) => {
            event.stopPropagation();
            const willOpen = menu.hidden;
            closeCardMenus();
            menu.hidden = !willOpen;
            menuButton.setAttribute("aria-expanded", String(willOpen));
        });

        card.querySelectorAll("[data-action]").forEach((button) => {
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                closeCardMenus();

                const action = button.dataset.action;

                if (action === "open") {
                    openDetailsPanel(subjectId);
                }

                if (action === "edit") {
                    openSubjectModal(subjectId);
                }

                if (action === "delete") {
                    openDeleteDialog(subjectId);
                }
            });
        });
    });
}

function closeCardMenus() {
    document.querySelectorAll(".subject-card-menu").forEach((menu) => {
        menu.hidden = true;
    });

    document.querySelectorAll(".subject-card-menu-button").forEach((button) => {
        button.setAttribute("aria-expanded", "false");
    });
}

function createEmptyState() {
    return `
        <div class="subjects-empty-state">
            <div>
                <span class="subjects-empty-icon">
                    <i class="fa-solid fa-book-open-reader"></i>
                </span>
                <h3>Tu primera materia empieza aquí</h3>
                <p>
                    Crea una materia, elige su color e icono y comienza a organizar
                    todas tus tareas desde un solo lugar.
                </p>
                <button class="primary-action" type="button" id="emptyNewSubjectButton">
                    <i class="fa-solid fa-plus"></i>
                    Crear mi primera materia
                </button>
            </div>
        </div>
    `;
}

function createSearchEmptyState() {
    return `
        <div class="subjects-empty-state">
            <div>
                <span class="subjects-empty-icon">
                    <i class="fa-solid fa-magnifying-glass"></i>
                </span>
                <h3>No encontramos resultados</h3>
                <p>
                    Prueba con otro nombre, profesor o salón.
                </p>
                <button class="secondary-action" type="button" id="emptyClearSearchButton">
                    <i class="fa-solid fa-xmark"></i>
                    Limpiar búsqueda
                </button>
            </div>
        </div>
    `;
}

function createErrorState(title, message) {
    return `
        <div class="subjects-empty-state">
            <div>
                <span class="subjects-empty-icon">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                </span>
                <h3>${escapeHtml(title)}</h3>
                <p>${escapeHtml(message)}</p>
                <a class="primary-action" href="${escapeHtml(DASHBOARD_URL)}">
                    Volver al Dashboard
                </a>
            </div>
        </div>
    `;
}

function reconnectNewSubjectButton() {
    document.getElementById("emptyNewSubjectButton")
        ?.addEventListener("click", () => openSubjectModal());
}

function reconnectClearSearchButton() {
    document.getElementById("emptyClearSearchButton")
        ?.addEventListener("click", clearSearch);
}

/* =========================================================
   DETALLE Y TAREAS
========================================================= */

function configureDetailsPanel() {
    elements.closeDetailsButton.addEventListener("click", closeDetailsPanel);
    elements.detailsBackdrop.addEventListener("click", closeDetailsPanel);

    elements.detailsEditButton.addEventListener("click", () => {
        const subjectId = state.activeSubjectId;
        closeDetailsPanel();

        if (subjectId) {
            openSubjectModal(subjectId);
        }
    });

    elements.detailsDeleteButton.addEventListener("click", () => {
        if (state.activeSubjectId) {
            openDeleteDialog(state.activeSubjectId);
        }
    });

    elements.detailsAddTaskButton?.addEventListener("click", () => {
        if (!state.activeSubjectId) {
            return;
        }

        window.location.assign(
            `tareas.html?action=new&subjectId=${encodeURIComponent(state.activeSubjectId)}`
        );
    });
}

function openDetailsPanel(subjectId) {
    const subject = state.subjects.find((item) => item.id === subjectId);

    if (!subject) {
        return;
    }

    state.activeSubjectId = subjectId;
    renderDetails(subject);

    elements.detailsBackdrop.hidden = false;
    elements.subjectDetailsPanel.classList.add("is-open");
    elements.subjectDetailsPanel.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}

function closeDetailsPanel() {
    state.activeSubjectId = null;
    elements.subjectDetailsPanel.classList.remove("is-open");
    elements.subjectDetailsPanel.setAttribute("aria-hidden", "true");

    window.setTimeout(() => {
        elements.detailsBackdrop.hidden = true;
    }, 260);

    if (elements.confirmDialog.hidden && elements.subjectModal.hidden) {
        document.body.style.removeProperty("overflow");
    }
}

function refreshActiveDetails() {
    if (!state.activeSubjectId) {
        return;
    }

    const subject = state.subjects.find(
        (item) => item.id === state.activeSubjectId
    );

    if (!subject) {
        closeDetailsPanel();
        return;
    }

    renderDetails(subject);
}

function renderDetails(subject) {
    const color = isValidHexColor(subject.color) ? subject.color : DEFAULT_COLOR;
    const icon = subject.icon || DEFAULT_ICON;
    const tasks = getTasksForSubject(subject.id);

    elements.detailsHeader.style.setProperty("--details-color", color);
    elements.subjectDetailsPanel.style.setProperty("--details-color", color);
    elements.detailsIcon.innerHTML = `<i class="${escapeHtml(icon)}"></i>`;
    elements.detailsName.textContent = subject.name || "Materia";
    elements.detailsDescription.textContent =
        subject.description || "Sin descripción.";
    elements.detailsTeacher.textContent =
        subject.teacher || "Sin especificar";
    elements.detailsClassroom.textContent =
        subject.classroom || "Sin especificar";
    elements.detailsSchedule.textContent =
        subject.schedule || "Sin especificar";
    elements.detailsTasksCount.textContent =
        `${tasks.length} ${tasks.length === 1 ? "tarea registrada" : "tareas registradas"}`;

    renderSubjectTasks(tasks);
}

function getTasksForSubject(subjectId) {
    return state.tasks.filter((task) => {
        return (
            task.subjectId === subjectId ||
            task.materiaId === subjectId
        );
    });
}

function renderSubjectTasks(tasks) {
    if (!tasks.length) {
        elements.subjectTasksList.innerHTML = `
            <div class="details-empty-state">
                <span><i class="fa-regular fa-clipboard"></i></span>
                <strong>Aún no hay tareas</strong>
                <p>Cuando agregues tareas a esta materia aparecerán aquí.</p>
            </div>
        `;
        return;
    }

    const normalizedTasks = tasks
        .map(normalizeTask)
        .sort((a, b) => {
            const aTime = a.dueDate?.getTime() || Infinity;
            const bTime = b.dueDate?.getTime() || Infinity;
            return aTime - bTime;
        });

    elements.subjectTasksList.innerHTML = normalizedTasks.map((task) => `
        <article class="subject-task-item ${task.completed ? "completed" : ""}">
            <span class="subject-task-status">
                <i class="fa-solid ${task.completed ? "fa-check" : "fa-list-check"}"></i>
            </span>
            <div class="subject-task-copy">
                <strong>${escapeHtml(task.title)}</strong>
                <span>${task.completed ? "Completada" : "Pendiente"}</span>
            </div>
            <time class="subject-task-due">
                ${escapeHtml(task.dueDate ? formatShortDate(task.dueDate) : "Sin fecha")}
            </time>
        </article>
    `).join("");
}

function normalizeTask(task) {
    const status = String(task.status || task.state || "").toLowerCase();

    return {
        ...task,
        title: task.title || task.name || task.nombre || "Tarea sin título",
        completed:
            task.completed === true ||
            task.done === true ||
            ["completed", "complete", "done", "hecha", "terminada"].includes(status),
        dueDate: convertToDate(
            task.dueDate ||
            task.deadline ||
            task.fechaLimite ||
            task.fecha
        )
    };
}

/* =========================================================
   BÚSQUEDA, ORDEN Y VISTA
========================================================= */

function configureSearchAndSort() {
    elements.subjectsSearch.addEventListener("input", () => {
        setSearchTerm(elements.subjectsSearch.value);
    });

    elements.globalSearch.addEventListener("input", () => {
        setSearchTerm(elements.globalSearch.value);
    });

    elements.clearSearchButton.addEventListener("click", clearSearch);

    elements.sortSubjects.addEventListener("change", () => {
        state.sortMode = elements.sortSubjects.value;
        renderSubjects();
    });

    document.addEventListener("keydown", (event) => {
        const isShortcut =
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "k";

        if (isShortcut) {
            event.preventDefault();
            elements.subjectsSearch.focus();
        }

        if (event.key === "Escape") {
            closeCardMenus();

            if (!elements.confirmDialog.hidden) {
                closeDeleteDialog();
                return;
            }

            if (!elements.subjectModal.hidden) {
                closeSubjectModal();
                return;
            }

            if (elements.subjectDetailsPanel.getAttribute("aria-hidden") === "false") {
                closeDetailsPanel();
                return;
            }

            closeDrawer();
            closeAllPopovers();
        }
    });

    document.addEventListener("click", (event) => {
        if (!event.target.closest(".subject-card-menu-wrapper")) {
            closeCardMenus();
        }
    });
}

function setSearchTerm(value) {
    state.searchTerm = normalizeSpaces(value);

    if (elements.subjectsSearch.value !== value) {
        elements.subjectsSearch.value = value;
    }

    if (elements.globalSearch.value !== value) {
        elements.globalSearch.value = value;
    }

    elements.clearSearchButton.hidden = !state.searchTerm;
    renderSubjects();
}

function clearSearch() {
    state.searchTerm = "";
    elements.subjectsSearch.value = "";
    elements.globalSearch.value = "";
    elements.clearSearchButton.hidden = true;
    renderSubjects();
    elements.subjectsSearch.focus();
}

function configureViewSwitcher() {
    elements.gridViewButton.addEventListener("click", () => setViewMode("grid"));
    elements.listViewButton.addEventListener("click", () => setViewMode("list"));
}

function setViewMode(mode) {
    state.viewMode = mode === "list" ? "list" : "grid";
    localStorage.setItem("studytrack-subject-view", state.viewMode);
    applyViewMode();
}

function applyViewMode() {
    const listMode = state.viewMode === "list";

    elements.subjectsGrid.classList.toggle("list-view", listMode);
    elements.gridViewButton.classList.toggle("active", !listMode);
    elements.listViewButton.classList.toggle("active", listMode);
    elements.gridViewButton.setAttribute("aria-pressed", String(!listMode));
    elements.listViewButton.setAttribute("aria-pressed", String(listMode));
}

/* =========================================================
   NAVEGACIÓN Y POPUP
========================================================= */

function configureSidebar() {
    if (state.sidebarCollapsed) {
        elements.appShell.classList.add("sidebar-is-collapsed");
        elements.sidebarCollapse?.setAttribute("aria-expanded", "false");
    }

    elements.sidebarCollapse?.addEventListener("click", () => {
        state.sidebarCollapsed = !state.sidebarCollapsed;
        elements.appShell.classList.toggle(
            "sidebar-is-collapsed",
            state.sidebarCollapsed
        );
        elements.sidebarCollapse.setAttribute(
            "aria-expanded",
            String(!state.sidebarCollapsed)
        );
        localStorage.setItem(
            "studytrack-sidebar-collapsed",
            String(state.sidebarCollapsed)
        );
    });
}

function configureDrawer() {
    elements.mobileMenuButton?.addEventListener("click", openDrawer);
    elements.closeDrawerButton?.addEventListener("click", closeDrawer);
    elements.drawerBackdrop?.addEventListener("click", closeDrawer);
}

function openDrawer() {
    elements.drawerBackdrop.hidden = false;
    elements.mobileDrawer.classList.add("is-open");
    elements.mobileDrawer.setAttribute("aria-hidden", "false");
    elements.mobileMenuButton?.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
}

function closeDrawer() {
    elements.mobileDrawer.classList.remove("is-open");
    elements.mobileDrawer.setAttribute("aria-hidden", "true");
    elements.mobileMenuButton?.setAttribute("aria-expanded", "false");
    elements.drawerBackdrop.hidden = true;

    if (
        elements.subjectModal.hidden &&
        elements.confirmDialog.hidden &&
        elements.subjectDetailsPanel.getAttribute("aria-hidden") === "true"
    ) {
        document.body.style.removeProperty("overflow");
    }
}

function configurePopovers() {
    elements.notificationButton?.addEventListener("click", (event) => {
        event.stopPropagation();
        togglePopover(
            elements.notificationButton,
            elements.notificationPopover,
            elements.profileButton,
            elements.profilePopover
        );
    });

    elements.profileButton?.addEventListener("click", (event) => {
        event.stopPropagation();
        togglePopover(
            elements.profileButton,
            elements.profilePopover,
            elements.notificationButton,
            elements.notificationPopover
        );
    });

    document.querySelectorAll("[data-close-popover]").forEach((button) => {
        button.addEventListener("click", closeAllPopovers);
    });

    document.addEventListener("click", (event) => {
        if (!event.target.closest(".popover-wrapper")) {
            closeAllPopovers();
        }
    });
}

function togglePopover(button, popover, otherButton, otherPopover) {
    const willOpen = popover.hidden;

    if (otherPopover && !otherPopover.hidden) {
        otherPopover.hidden = true;
        otherButton?.setAttribute("aria-expanded", "false");
    }

    popover.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));
}

function closeAllPopovers() {
    [
        [elements.notificationButton, elements.notificationPopover],
        [elements.profileButton, elements.profilePopover]
    ].forEach(([button, popover]) => {
        if (popover) {
            popover.hidden = true;
        }

        button?.setAttribute("aria-expanded", "false");
    });
}

function configureComingSoonButtons() {
    document.querySelectorAll("[data-coming-soon]").forEach((element) => {
        element.addEventListener("click", (event) => {
            event.preventDefault();
            closeDrawer();
            closeAllPopovers();

            showToast(
                `${element.dataset.comingSoon || "Esta función"} llegará pronto`,
                "La conectaremos en la siguiente fase de StudyTrack."
            );
        });
    });
}

function configureLogout() {
    elements.logoutButton?.addEventListener("click", handleLogout);
    elements.drawerLogoutButton?.addEventListener("click", handleLogout);
}

/* =========================================================
   MENSAJES Y UTILIDADES
========================================================= */

function showFormMessage(message) {
    elements.subjectFormMessage.textContent = message;
    elements.subjectFormMessage.hidden = false;
}

function clearFormMessage() {
    elements.subjectFormMessage.hidden = true;
    elements.subjectFormMessage.textContent = "";
}

function showToast(title, message) {
    const toast = document.createElement("article");
    toast.className = "toast";
    toast.innerHTML = `
        <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
        <div>
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(message)}</span>
        </div>
    `;

    elements.toastRegion.appendChild(toast);

    window.setTimeout(() => {
        toast.remove();
    }, 4200);
}

function hideLoadingScreen() {
    if (!elements.loadingScreen) {
        return;
    }

    window.setTimeout(() => {
        elements.loadingScreen.classList.add("is-hidden");

        window.setTimeout(() => {
            elements.loadingScreen?.remove();
        }, 300);
    }, 180);
}

function getTasksCountForAllSubjects() {
    return new Map(
        state.subjects.map((subject) => [
            subject.id,
            getTasksForSubject(subject.id).length
        ])
    );
}

function getTimestamp(value) {
    if (!value) {
        return 0;
    }

    if (typeof value.toMillis === "function") {
        return value.toMillis();
    }

    const date = convertToDate(value);
    return date?.getTime() || 0;
}

function compareText(a, b) {
    return String(a || "").localeCompare(String(b || ""), "es", {
        sensitivity: "base"
    });
}

function convertToDate(value) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value.toDate === "function") {
        return value.toDate();
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatShortDate(date) {
    return new Intl.DateTimeFormat("es-MX", {
        day: "numeric",
        month: "short"
    }).format(date);
}

function normalizeSpaces(value = "") {
    return String(value).trim().replace(/\s+/g, " ");
}

function getNameFromEmail(email = "") {
    const localPart = email.split("@")[0] || "Estudiante";

    return localPart
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function createInitials(name) {
    const parts = normalizeSpaces(name).split(" ").filter(Boolean);

    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function isValidHexColor(color) {
    return /^#[0-9a-fA-F]{6}$/.test(String(color || ""));
}

function getFirestoreErrorMessage(error) {
    const messages = {
        "permission-denied":
            "Firestore rechazó la operación. Revisa las reglas de seguridad.",
        "firestore/permission-denied":
            "Firestore rechazó la operación. Revisa las reglas de seguridad.",
        "unavailable":
            "Firebase no está disponible temporalmente. Inténtalo de nuevo.",
        "firestore/unavailable":
            "Firebase no está disponible temporalmente. Inténtalo de nuevo."
    };

    return messages[error?.code] ||
        "Ocurrió un error inesperado. Inténtalo nuevamente.";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

window.addEventListener("beforeunload", cleanupSubscriptions);
