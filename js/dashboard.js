/**
 * StudyTrack - Dashboard principal
 * Archivo: js/dashboard.js
 *
 * Funciones:
 * - Protege el Dashboard: sin sesión, regresa al login.
 * - Obtiene el perfil del usuario desde Firestore.
 * - Muestra nombre, correo, iniciales y saludo dinámico.
 * - Lee materias y tareas cuando existan esas colecciones.
 * - Calcula pendientes, próximas entregas y progreso.
 * - Permite cerrar sesión.
 * - Controla menú lateral, drawer móvil, búsqueda y popovers.
 */

import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* =========================================================
   CONFIGURACIÓN
========================================================= */

const LOGIN_URL = document.body.dataset.loginUrl?.trim() || "index.html";
const SUBJECT_COLLECTION_CANDIDATES = ["subjects", "materias"];
const TASK_COLLECTION_CANDIDATES = ["tasks", "tareas"];
const USER_ID_FIELDS = ["userId", "uid", "ownerId"];

const state = {
    user: null,
    profile: null,
    subjects: [],
    tasks: [],
    sidebarCollapsed: localStorage.getItem("studytrack-sidebar-collapsed") === "true"
};

/* =========================================================
   ELEMENTOS
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

    notificationButton: document.getElementById("notificationButton"),
    notificationPopover: document.getElementById("notificationPopover"),
    notificationBadge: document.getElementById("notificationBadge"),

    profileButton: document.getElementById("profileButton"),
    profilePopover: document.getElementById("profilePopover"),

    logoutButton: document.getElementById("logoutButton"),
    drawerLogoutButton: document.getElementById("drawerLogoutButton"),

    topAvatar: document.getElementById("topAvatar"),
    menuAvatar: document.getElementById("menuAvatar"),
    topUserName: document.getElementById("topUserName"),
    menuUserName: document.getElementById("menuUserName"),
    menuUserEmail: document.getElementById("menuUserEmail"),

    currentDate: document.getElementById("currentDate"),
    welcomeTitle: document.getElementById("welcomeTitle"),
    welcomeSubtitle: document.getElementById("welcomeSubtitle"),

    subjectCount: document.getElementById("subjectCount"),
    pendingTaskCount: document.getElementById("pendingTaskCount"),
    upcomingCount: document.getElementById("upcomingCount"),
    weeklyProgressValue: document.getElementById("weeklyProgressValue"),
    ringProgressValue: document.getElementById("ringProgressValue"),
    progressRing: document.getElementById("progressRing"),

    pendingTaskHint: document.getElementById("pendingTaskHint"),
    progressHint: document.getElementById("progressHint"),
    progressMessageTitle: document.getElementById("progressMessageTitle"),
    progressMessageText: document.getElementById("progressMessageText"),

    agendaList: document.getElementById("agendaList"),
    deliveryList: document.getElementById("deliveryList"),
    subjectProgressList: document.getElementById("subjectProgressList"),
    activityList: document.getElementById("activityList"),

    streakDays: document.getElementById("streakDays"),
    streakDescription: document.getElementById("streakDescription"),
    sidebarStreakText: document.getElementById("sidebarStreakText"),
    weekStreak: document.getElementById("weekStreak"),

    toastRegion: document.getElementById("toastRegion")
};

/* =========================================================
   INICIO
========================================================= */

document.addEventListener("DOMContentLoaded", initializeDashboard);

function initializeDashboard() {
    configureSidebar();
    configureMobileDrawer();
    configurePopovers();
    configureSearch();
    configureComingSoonButtons();
    configureLogout();
    setCurrentDate();
    observeAuthentication();
}

/* =========================================================
   AUTENTICACIÓN Y PERFIL
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
            await loadDashboardData(user.uid);
            renderDashboard();
        } catch (error) {
            console.error("No se pudo cargar por completo el Dashboard:", error);
            state.profile = createFallbackProfile(user);
            renderUserIdentity();
            renderDashboard();
            showToast(
                "Dashboard cargado con información básica",
                "No pudimos consultar todos tus datos en Firestore. Revisa la consola si el problema continúa."
            );
        } finally {
            hideLoadingScreen();
        }
    });
}

async function loadUserProfile(user) {
    const profileReference = doc(db, "users", user.uid);
    const profileSnapshot = await getDoc(profileReference);

    if (profileSnapshot.exists()) {
        return {
            ...createFallbackProfile(user),
            ...profileSnapshot.data()
        };
    }

    return createFallbackProfile(user);
}

function createFallbackProfile(user) {
    return {
        uid: user.uid,
        name: user.displayName || getNameFromEmail(user.email),
        username: "",
        email: user.email || "",
        role: "student",
        streak: 0
    };
}

function renderUserIdentity() {
    const fullName = normalizeDisplayName(
        state.profile?.name ||
        state.user?.displayName ||
        getNameFromEmail(state.user?.email)
    );

    const firstName = fullName.split(" ")[0] || "Estudiante";
    const email = state.profile?.email || state.user?.email || "";
    const initials = createInitials(fullName);

    elements.topUserName.textContent = fullName;
    elements.menuUserName.textContent = fullName;
    elements.menuUserEmail.textContent = email || "Sin correo disponible";
    elements.topAvatar.textContent = initials;
    elements.menuAvatar.textContent = initials;

    const greeting = getGreeting();
    elements.welcomeTitle.textContent = `${greeting}, ${firstName}! ${getGreetingEmoji()}`;
}

async function handleLogout() {
    setLogoutButtonsDisabled(true);

    try {
        await signOut(auth);
        window.location.replace(LOGIN_URL);
    } catch (error) {
        console.error("No se pudo cerrar la sesión:", error);
        showToast(
            "No se pudo cerrar sesión",
            "Revisa tu conexión e inténtalo nuevamente."
        );
        setLogoutButtonsDisabled(false);
    }
}

function setLogoutButtonsDisabled(disabled) {
    [elements.logoutButton, elements.drawerLogoutButton].forEach((button) => {
        if (button) {
            button.disabled = disabled;
        }
    });
}

/* =========================================================
   CARGA DE DATOS
========================================================= */

async function loadDashboardData(uid) {
    const [subjects, tasks] = await Promise.all([
        loadOwnedDocuments(SUBJECT_COLLECTION_CANDIDATES, uid),
        loadOwnedDocuments(TASK_COLLECTION_CANDIDATES, uid)
    ]);

    state.subjects = subjects;
    state.tasks = tasks;
}

/**
 * Busca documentos del usuario incluso si en fases futuras decidimos
 * usar nombres de colección o campos distintos. En cuanto encuentra
 * una colección con resultados, la utiliza.
 */
async function loadOwnedDocuments(collectionCandidates, uid) {
    for (const collectionName of collectionCandidates) {
        for (const ownerField of USER_ID_FIELDS) {
            try {
                const reference = collection(db, collectionName);
                const ownedQuery = query(reference, where(ownerField, "==", uid));
                const snapshot = await getDocs(ownedQuery);

                if (!snapshot.empty) {
                    return snapshot.docs.map((item) => ({
                        id: item.id,
                        collectionName,
                        ...item.data()
                    }));
                }
            } catch (error) {
                // Es normal que una colección aún no exista en esta fase.
                console.debug(
                    `StudyTrack todavía no encontró datos en ${collectionName}.${ownerField}`,
                    error?.code || error
                );
            }
        }
    }

    return [];
}

function renderDashboard() {
    const metrics = calculateMetrics(state.subjects, state.tasks);

    animateNumber(elements.subjectCount, metrics.subjectCount);
    animateNumber(elements.pendingTaskCount, metrics.pendingTasks.length);
    animateNumber(elements.upcomingCount, metrics.upcomingTasks.length);
    animateNumber(elements.weeklyProgressValue, metrics.progress);
    animateNumber(elements.ringProgressValue, metrics.progress);

    elements.progressRing.style.setProperty("--progress", metrics.progress);
    elements.progressRing.setAttribute(
        "aria-label",
        `Progreso semanal de ${metrics.progress} por ciento`
    );

    elements.pendingTaskHint.textContent = metrics.pendingTasks.length
        ? `Distribuidas en ${metrics.pendingSubjectCount} ${
            metrics.pendingSubjectCount === 1 ? "materia" : "materias"
        }`
        : "Sin tareas pendientes";

    updateProgressMessages(metrics);
    renderAgenda(metrics.agendaTasks);
    renderDeliveries(metrics.upcomingTasks.slice(0, 4));
    renderSubjectProgress(metrics.subjectProgress);
    renderRecentActivity(metrics.completedTasks);
    renderStreak(metrics);

    elements.welcomeSubtitle.textContent = createWelcomeSubtitle(metrics);
}

function calculateMetrics(subjects, tasks) {
    const normalizedTasks = tasks.map(normalizeTask);

    // En el Dashboard consideramos activas las tareas pendientes o en progreso.
    // Las entregadas cuentan como completadas y las no realizadas quedan fuera
    // de pendientes, agenda y próximas entregas.
    const pendingTasks = normalizedTasks.filter((task) =>
        ["pending", "in_progress"].includes(task.status)
    );

    const completedTasks = normalizedTasks.filter(
        (task) => task.status === "delivered"
    );

    const now = new Date();
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(now.getDate() + 7);
    sevenDaysFromNow.setHours(23, 59, 59, 999);

    const upcomingTasks = pendingTasks
        .filter(
            (task) =>
                task.dueDate &&
                task.dueDate >= startOfToday() &&
                task.dueDate <= sevenDaysFromNow
        )
        .sort(sortByDueDate);

    const agendaTasks = pendingTasks
        .filter((task) => task.dueDate)
        .sort(sortByDueDate)
        .slice(0, 5);

    // Usa el mismo avance que la página Tareas para que ambos módulos
    // muestren exactamente el mismo porcentaje.
    const progress = normalizedTasks.length
        ? Math.round(
            normalizedTasks.reduce(
                (sum, task) => sum + task.progress,
                0
            ) / normalizedTasks.length
        )
        : 0;

    const pendingSubjectNames = new Set(
        pendingTasks
            .map((task) => task.subjectName || task.subjectId)
            .filter(Boolean)
    );

    return {
        subjectCount: subjects.length,
        pendingTasks,
        completedTasks,
        upcomingTasks,
        agendaTasks,
        progress,
        pendingSubjectCount: pendingSubjectNames.size,
        subjectProgress: calculateSubjectProgress(subjects, normalizedTasks),
        streak: calculateStreak(completedTasks)
    };
}

function normalizeTask(rawTask) {
    const rawStatus = String(
        rawTask.status ||
        rawTask.state ||
        ""
    ).toLowerCase();

    const statusAliases = {
        pending: "pending",
        pendiente: "pending",
        in_progress: "in_progress",
        "en progreso": "in_progress",
        progress: "in_progress",
        delivered: "delivered",
        entregada: "delivered",
        entregado: "delivered",
        completed: "delivered",
        complete: "delivered",
        done: "delivered",
        hecha: "delivered",
        terminada: "delivered",
        not_done: "not_done",
        "no realizada": "not_done",
        missed: "not_done"
    };

    const status = statusAliases[rawStatus] || "pending";

    const rawProgress = Number(rawTask.progress);
    const defaultProgress =
        status === "delivered"
            ? 100
            : status === "in_progress"
                ? 50
                : 0;

    const progress = Number.isFinite(rawProgress)
        ? Math.max(0, Math.min(100, rawProgress))
        : defaultProgress;

    return {
        ...rawTask,
        title:
            rawTask.title ||
            rawTask.name ||
            rawTask.nombre ||
            "Tarea sin título",
        subjectId:
            rawTask.subjectId ||
            rawTask.materiaId ||
            "",
        subjectName:
            rawTask.subjectName ||
            rawTask.materia ||
            rawTask.subject ||
            "Sin materia",
        description:
            rawTask.description ||
            rawTask.descripcion ||
            "",
        priority: String(
            rawTask.priority ||
            rawTask.prioridad ||
            "medium"
        ).toLowerCase(),
        dueDate: convertToDate(
            rawTask.dueAt ||
            rawTask.dueDate ||
            rawTask.deadline ||
            rawTask.fechaLimite ||
            rawTask.fecha
        ),
        status,
        progress,
        completed: status === "delivered",
        completedAt: convertToDate(
            rawTask.completedAt ||
            rawTask.finishedAt ||
            rawTask.fechaCompletada ||
            (status === "delivered" ? rawTask.updatedAt : null)
        )
    };
}

function calculateSubjectProgress(subjects, tasks) {
    const subjectsFromTasks = tasks
        .map((task) => ({
            id: task.subjectId || task.subjectName,
            name: task.subjectName
        }))
        .filter((subject) => subject.id);

    const combinedSubjects = [
        ...subjects.map((subject) => ({
            id: subject.id,
            name: subject.name || subject.title || subject.nombre || "Materia"
        })),
        ...subjectsFromTasks
    ];

    const uniqueSubjects = Array.from(
        new Map(combinedSubjects.map((subject) => [subject.id, subject])).values()
    );

    return uniqueSubjects
        .map((subject) => {
            const subjectTasks = tasks.filter(
                (task) =>
                    task.subjectId === subject.id ||
                    task.subjectName === subject.name
            );

            const progress = subjectTasks.length
                ? Math.round(
                    subjectTasks.reduce(
                        (sum, task) => sum + task.progress,
                        0
                    ) / subjectTasks.length
                )
                : 0;

            return {
                ...subject,
                progress,
                taskCount: subjectTasks.length
            };
        })
        .slice(0, 5);
}

function calculateStreak(completedTasks) {
    const explicitStreak = Number(state.profile?.streak || state.profile?.studyStreak);

    if (Number.isFinite(explicitStreak) && explicitStreak > 0) {
        return explicitStreak;
    }

    const completionDays = new Set(
        completedTasks
            .map((task) => task.completedAt)
            .filter(Boolean)
            .map((date) => date.toISOString().slice(0, 10))
    );

    let streak = 0;
    const cursor = startOfToday();

    while (completionDays.has(cursor.toISOString().slice(0, 10))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
}

/* =========================================================
   RENDER DE LISTAS
========================================================= */

function renderAgenda(tasks) {
    if (!tasks.length) {
        elements.agendaList.innerHTML = `
            <div class="empty-state compact-empty">
                <span class="empty-icon"><i class="fa-regular fa-calendar-plus"></i></span>
                <div>
                    <strong>Tu agenda está libre</strong>
                    <p>Las tareas con fecha aparecerán aquí.</p>
                </div>
                <a class="panel-link" href="tareas.html?action=new">Agregar tarea</a>
            </div>
        `;
        reconnectComingSoonButtons(elements.agendaList);
        return;
    }

    elements.agendaList.innerHTML = tasks.map((task) => `
        <article class="agenda-item">
            <time class="agenda-time" datetime="${escapeHtml(task.dueDate.toISOString())}">
                ${escapeHtml(formatAgendaDate(task.dueDate))}
            </time>
            <div class="agenda-copy">
                <strong>${escapeHtml(task.title)}</strong>
                <span>${escapeHtml(task.subjectName)}${task.description ? ` · ${escapeHtml(task.description)}` : ""}</span>
            </div>
            <span class="priority-pill ${getPriorityClass(task.priority)}">
                ${escapeHtml(formatPriority(task.priority))}
            </span>
        </article>
    `).join("");
}

function renderDeliveries(tasks) {
    if (!tasks.length) {
        elements.deliveryList.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon"><i class="fa-solid fa-check-double"></i></span>
                <strong>No tienes entregas próximas</strong>
                <p>Cuando agregues tareas, sus fechas aparecerán aquí.</p>
            </div>
        `;
        return;
    }

    elements.deliveryList.innerHTML = tasks.map((task, index) => `
        <article class="delivery-item">
            <span class="delivery-icon">
                <i class="${index % 2 === 0 ? "fa-solid fa-book-open" : "fa-solid fa-flask"}"></i>
            </span>
            <div class="delivery-copy">
                <strong>${escapeHtml(task.title)}</strong>
                <span>${escapeHtml(task.subjectName)}</span>
            </div>
            <time class="delivery-date" datetime="${escapeHtml(task.dueDate.toISOString())}">
                <strong>${escapeHtml(formatShortDate(task.dueDate))}</strong>
                <span>${escapeHtml(formatWeekday(task.dueDate))}</span>
            </time>
        </article>
    `).join("");
}

function renderSubjectProgress(subjectProgress) {
    if (!subjectProgress.length) {
        elements.subjectProgressList.innerHTML = `
            <div class="subject-progress-placeholder">
                <i class="fa-solid fa-chart-simple"></i>
                <span>El progreso por materia aparecerá aquí.</span>
            </div>
        `;
        return;
    }

    elements.subjectProgressList.innerHTML = subjectProgress.map((subject) => `
        <div class="subject-progress-row">
            <strong>${escapeHtml(subject.name)}</strong>
            <div class="subject-progress-track" aria-hidden="true">
                <span style="width: ${subject.progress}%"></span>
            </div>
            <span>${subject.progress}%</span>
        </div>
    `).join("");
}

function renderRecentActivity(completedTasks) {
    const recentTasks = [...completedTasks]
        .sort((a, b) => {
            const aTime = a.completedAt?.getTime() || 0;
            const bTime = b.completedAt?.getTime() || 0;
            return bTime - aTime;
        })
        .slice(0, 4);

    if (!recentTasks.length) {
        elements.activityList.innerHTML = `
            <div class="empty-state horizontal-empty">
                <span class="empty-icon"><i class="fa-solid fa-seedling"></i></span>
                <div>
                    <strong>Aquí comenzará tu historial</strong>
                    <p>Completa tareas y organiza materias para ver tu actividad.</p>
                </div>
            </div>
        `;
        return;
    }

    elements.activityList.innerHTML = recentTasks.map((task) => `
        <article class="activity-item">
            <span class="activity-icon"><i class="fa-solid fa-check"></i></span>
            <div class="activity-copy">
                <strong>Completaste “${escapeHtml(task.title)}”</strong>
                <span>${escapeHtml(task.subjectName)} · ${escapeHtml(formatRelativeDate(task.completedAt))}</span>
            </div>
        </article>
    `).join("");
}

function renderStreak(metrics) {
    const streak = metrics.streak;

    elements.streakDays.textContent = String(streak);
    elements.streakDescription.textContent = streak
        ? `Mantén el ritmo: tu racha actual es de ${streak} ${streak === 1 ? "día" : "días"}.`
        : "Completa una tarea hoy para comenzar tu racha.";

    elements.sidebarStreakText.textContent = streak
        ? `Llevas ${streak} ${streak === 1 ? "día" : "días"} de racha de estudio.`
        : "Comienza tu primera racha de estudio.";

    const weekday = new Date().getDay();
    const mondayBasedToday = weekday === 0 ? 6 : weekday - 1;
    const circles = elements.weekStreak.querySelectorAll("i");

    circles.forEach((circle, index) => {
        const shouldMark = streak > 0 && index <= mondayBasedToday && index > mondayBasedToday - streak;
        circle.classList.toggle("completed", shouldMark);
    });
}

function updateProgressMessages(metrics) {
    const progress = metrics.progress;

    if (!state.tasks.length) {
        elements.progressHint.textContent = "Comienza agregando tareas";
        elements.progressMessageTitle.textContent = "Todo gran avance empieza en cero";
        elements.progressMessageText.textContent =
            "Agrega tu primera tarea para comenzar a medir tu progreso.";
        return;
    }

    if (progress === 100) {
        elements.progressHint.textContent = "¡Semana completada!";
        elements.progressMessageTitle.textContent = "¡Excelente trabajo!";
        elements.progressMessageText.textContent =
            "Completaste todas las tareas registradas.";
        return;
    }

    if (progress >= 70) {
        elements.progressHint.textContent = "Muy buen progreso";
        elements.progressMessageTitle.textContent = "Estás muy cerca";
        elements.progressMessageText.textContent =
            "Mantén el ritmo para cerrar la semana con todo.";
        return;
    }

    if (progress >= 35) {
        elements.progressHint.textContent = "Vas por buen camino";
        elements.progressMessageTitle.textContent = "Tu progreso ya se nota";
        elements.progressMessageText.textContent =
            "Elige una tarea pendiente y avanza un paso más.";
        return;
    }

    elements.progressHint.textContent = "Un paso a la vez";
    elements.progressMessageTitle.textContent = "Este es un buen momento para empezar";
    elements.progressMessageText.textContent =
        "Completa una tarea pequeña para ganar impulso.";
}

function createWelcomeSubtitle(metrics) {
    const pending = metrics.pendingTasks.length;
    const upcoming = metrics.upcomingTasks.length;

    if (!state.subjects.length && !state.tasks.length) {
        return "Tu espacio está listo. Agrega una materia o una tarea para comenzar.";
    }

    if (!pending) {
        return "No tienes tareas pendientes. Disfruta tu avance y prepara tu siguiente meta.";
    }

    return `Tienes ${pending} ${pending === 1 ? "tarea pendiente" : "tareas pendientes"}${
        upcoming
            ? ` y ${upcoming} ${upcoming === 1 ? "entrega próxima" : "entregas próximas"} esta semana`
            : ""
    }.`;
}

/* =========================================================
   INTERFAZ
========================================================= */

function configureSidebar() {
    if (state.sidebarCollapsed) {
        elements.appShell.classList.add("sidebar-is-collapsed");
        elements.sidebarCollapse?.setAttribute("aria-expanded", "false");
    }

    elements.sidebarCollapse?.addEventListener("click", () => {
        state.sidebarCollapsed = !state.sidebarCollapsed;
        elements.appShell.classList.toggle("sidebar-is-collapsed", state.sidebarCollapsed);
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

function configureMobileDrawer() {
    elements.mobileMenuButton?.addEventListener("click", openDrawer);
    elements.closeDrawerButton?.addEventListener("click", closeDrawer);
    elements.drawerBackdrop?.addEventListener("click", closeDrawer);

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeDrawer();
            closeAllPopovers();
        }
    });
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
    document.body.style.removeProperty("overflow");
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
    if (!button || !popover) {
        return;
    }

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

function configureSearch() {
    document.addEventListener("keydown", (event) => {
        const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";

        if (isShortcut) {
            event.preventDefault();
            elements.globalSearch?.focus();
        }
    });

    elements.globalSearch?.addEventListener("input", () => {
        const value = elements.globalSearch.value.trim();

        if (value.length >= 3) {
            showToast(
                "Búsqueda preparada",
                "La búsqueda real se activará cuando construyamos Materias y Tareas."
            );
        }
    });
}

function configureComingSoonButtons() {
    reconnectComingSoonButtons(document);
}

function reconnectComingSoonButtons(scope) {
    scope.querySelectorAll("[data-coming-soon]").forEach((element) => {
        if (element.dataset.listenerAttached === "true") {
            return;
        }

        element.dataset.listenerAttached = "true";
        element.addEventListener("click", (event) => {
            event.preventDefault();
            const feature = element.dataset.comingSoon || "Esta función";
            closeDrawer();
            closeAllPopovers();
            showToast(
                `${feature} llegará en la siguiente fase`,
                "El Dashboard ya está preparado para conectar esta sección."
            );
        });
    });
}

function configureLogout() {
    elements.logoutButton?.addEventListener("click", handleLogout);
    elements.drawerLogoutButton?.addEventListener("click", handleLogout);
}

function showToast(title, message) {
    const toast = document.createElement("article");
    toast.className = "toast";
    toast.innerHTML = `
        <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
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
    window.setTimeout(() => {
        elements.loadingScreen.classList.add("is-hidden");
        window.setTimeout(() => {
            elements.loadingScreen.remove();
        }, 300);
    }, 220);
}

/* =========================================================
   UTILIDADES
========================================================= */

function setCurrentDate() {
    const now = new Date();

    elements.currentDate.textContent = new Intl.DateTimeFormat("es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long"
    }).format(now);
}

function getGreeting() {
    const hour = new Date().getHours();

    if (hour < 6) {
        return "Buenas noches";
    }

    if (hour < 12) {
        return "¡Buenos días";
    }

    if (hour < 19) {
        return "¡Buenas tardes";
    }

    return "¡Buenas noches";
}

function getGreetingEmoji() {
    const hour = new Date().getHours();

    if (hour < 6 || hour >= 19) {
        return "🌙";
    }

    if (hour < 12) {
        return "👋";
    }

    return "✨";
}

function getNameFromEmail(email = "") {
    const localPart = email.split("@")[0] || "Estudiante";

    return localPart
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeDisplayName(value = "") {
    const cleanValue = String(value).trim().replace(/\s+/g, " ");

    return cleanValue || "Estudiante";
}

function createInitials(name) {
    const parts = normalizeDisplayName(name).split(" ").filter(Boolean);

    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function convertToDate(value) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value.toDate === "function") {
        const date = value.toDate();
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
}

function sortByDueDate(a, b) {
    return (a.dueDate?.getTime() || Infinity) - (b.dueDate?.getTime() || Infinity);
}

function formatAgendaDate(date) {
    const today = startOfToday();
    const taskDate = new Date(date);
    taskDate.setHours(0, 0, 0, 0);

    const difference = Math.round((taskDate - today) / 86400000);

    if (difference === 0) {
        return `Hoy\n${formatTime(date)}`;
    }

    if (difference === 1) {
        return `Mañana\n${formatTime(date)}`;
    }

    return `${new Intl.DateTimeFormat("es-MX", {
        weekday: "short"
    }).format(date)} ${date.getDate()}\n${formatTime(date)}`;
}

function formatTime(date) {
    const hasMeaningfulTime = date.getHours() !== 0 || date.getMinutes() !== 0;

    if (!hasMeaningfulTime) {
        return "Todo el día";
    }

    return new Intl.DateTimeFormat("es-MX", {
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}

function formatShortDate(date) {
    return new Intl.DateTimeFormat("es-MX", {
        day: "numeric",
        month: "short"
    }).format(date);
}

function formatWeekday(date) {
    return new Intl.DateTimeFormat("es-MX", {
        weekday: "long"
    }).format(date);
}

function formatRelativeDate(date) {
    if (!date) {
        return "Recientemente";
    }

    const difference = Date.now() - date.getTime();
    const days = Math.floor(difference / 86400000);

    if (days <= 0) {
        return "Hoy";
    }

    if (days === 1) {
        return "Ayer";
    }

    return `Hace ${days} días`;
}

function getPriorityClass(priority) {
    if (["alta", "high", "urgente"].includes(priority)) {
        return "priority-high";
    }

    if (["baja", "low"].includes(priority)) {
        return "priority-low";
    }

    return "priority-medium";
}

function formatPriority(priority) {
    if (["alta", "high", "urgente"].includes(priority)) {
        return "Alta";
    }

    if (["baja", "low"].includes(priority)) {
        return "Baja";
    }

    return "Media";
}

function animateNumber(element, target) {
    if (!element) {
        return;
    }

    const finalValue = Number(target) || 0;
    const duration = 480;
    const startTime = performance.now();

    function update(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = String(Math.round(finalValue * eased));

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
