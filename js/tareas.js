/**
 * StudyTrack - Módulo de Tareas
 * Archivo: js/tareas.js
 *
 * Incluye:
 * - Crear, editar y eliminar tareas.
 * - Estados, prioridad, fecha, hora, recordatorio y progreso.
 * - Imagen/PDF mediante Cloudinary.
 * - Compresión de imágenes antes de subirlas.
 * - Búsqueda, filtros, orden, estadísticas y sincronización en tiempo real.
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
  Timestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { uploadFileToCloudinary } from "./cloudinary.js";

/* =========================================================
   CONFIGURACIÓN
========================================================= */

const LOGIN_URL = document.body.dataset.loginUrl?.trim() || "index.html";
const DASHBOARD_URL = document.body.dataset.dashboardUrl?.trim() || "dashboard.html";
const TASKS_COLLECTION = "tasks";
const SUBJECTS_COLLECTION = "subjects";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ALLOWED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
]);

const STATUS_CONFIG = {
  pending: {
    label: "Pendiente",
    icon: "fa-regular fa-clock",
    progress: 0
  },
  in_progress: {
    label: "En progreso",
    icon: "fa-solid fa-spinner",
    progress: 50
  },
  delivered: {
    label: "Entregada",
    icon: "fa-solid fa-check",
    progress: 100
  },
  not_done: {
    label: "No realizada",
    icon: "fa-solid fa-xmark",
    progress: 0
  }
};

const PRIORITY_CONFIG = {
  high: { label: "Alta", weight: 3 },
  medium: { label: "Media", weight: 2 },
  low: { label: "Baja", weight: 1 }
};


const state = {
  user: null,
  profile: null,
  subjects: [],
  tasks: [],
  searchTerm: "",
  subjectFilter: "all",
  statusFilter: "all",
  sortMode: "due-asc",
  viewMode: localStorage.getItem("studytrack-task-view") || "grid",
  selectedPriority: "medium",
  selectedFile: null,
  removeExistingAttachment: false,
  activeTaskId: null,
  pendingDeleteId: null,
  unsubscribeSubjects: null,
  unsubscribeTasks: null,
  reminderInterval: null,
  notifiedTaskKeys: new Set(
    JSON.parse(localStorage.getItem("studytrack-notified-tasks") || "[]")
  ),
  sidebarCollapsed:
    localStorage.getItem("studytrack-sidebar-collapsed") === "true"
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
  tasksSearch: document.getElementById("tasksSearch"),
  clearTaskSearchButton: document.getElementById("clearTaskSearchButton"),
  subjectFilter: document.getElementById("subjectFilter"),
  sortTasks: document.getElementById("sortTasks"),
  taskGridViewButton: document.getElementById("taskGridViewButton"),
  taskListViewButton: document.getElementById("taskListViewButton"),

  notificationButton: document.getElementById("notificationButton"),
  notificationBadge: document.getElementById("notificationBadge"),
  notificationPopover: document.getElementById("notificationPopover"),
  taskNotificationsList: document.getElementById("taskNotificationsList"),
  notificationPermission: document.getElementById("notificationPermission"),
  enableNotificationsButton: document.getElementById("enableNotificationsButton"),

  profileButton: document.getElementById("profileButton"),
  profilePopover: document.getElementById("profilePopover"),
  topAvatar: document.getElementById("topAvatar"),
  menuAvatar: document.getElementById("menuAvatar"),
  topUserName: document.getElementById("topUserName"),
  menuUserName: document.getElementById("menuUserName"),
  menuUserEmail: document.getElementById("menuUserEmail"),
  logoutButton: document.getElementById("logoutButton"),
  drawerLogoutButton: document.getElementById("drawerLogoutButton"),

  newTaskButton: document.getElementById("newTaskButton"),
  sidebarNewTaskButton: document.getElementById("sidebarNewTaskButton"),
  resultsNewTaskButton: document.getElementById("resultsNewTaskButton"),
  mobileNewTaskButton: document.getElementById("mobileNewTaskButton"),

  heroProgressRing: document.getElementById("heroProgressRing"),
  heroProgressValue: document.getElementById("heroProgressValue"),
  heroProgressLabel: document.getElementById("heroProgressLabel"),

  totalTasksCount: document.getElementById("totalTasksCount"),
  pendingTasksCount: document.getElementById("pendingTasksCount"),
  inProgressTasksCount: document.getElementById("inProgressTasksCount"),
  deliveredTasksCount: document.getElementById("deliveredTasksCount"),
  notDoneTasksCount: document.getElementById("notDoneTasksCount"),

  tabAllCount: document.getElementById("tabAllCount"),
  tabPendingCount: document.getElementById("tabPendingCount"),
  tabProgressCount: document.getElementById("tabProgressCount"),
  tabDeliveredCount: document.getElementById("tabDeliveredCount"),
  tabNotDoneCount: document.getElementById("tabNotDoneCount"),

  tasksSectionTitle: document.getElementById("tasksSectionTitle"),
  tasksResultsText: document.getElementById("tasksResultsText"),
  tasksGrid: document.getElementById("tasksGrid"),

  taskModalBackdrop: document.getElementById("taskModalBackdrop"),
  taskModal: document.getElementById("taskModal"),
  closeTaskModalButton: document.getElementById("closeTaskModalButton"),
  cancelTaskButton: document.getElementById("cancelTaskButton"),
  taskForm: document.getElementById("taskForm"),
  editingTaskId: document.getElementById("editingTaskId"),
  taskModalKicker: document.getElementById("taskModalKicker"),
  taskModalTitle: document.getElementById("taskModalTitle"),
  taskModalSubtitle: document.getElementById("taskModalSubtitle"),
  saveTaskButton: document.getElementById("saveTaskButton"),
  saveTaskButtonText: document.getElementById("saveTaskButtonText"),
  taskFormMessage: document.getElementById("taskFormMessage"),

  taskTitle: document.getElementById("taskTitle"),
  taskSubject: document.getElementById("taskSubject"),
  taskStatus: document.getElementById("taskStatus"),
  taskDescription: document.getElementById("taskDescription"),
  taskDescriptionCounter: document.getElementById("taskDescriptionCounter"),
  taskDueDate: document.getElementById("taskDueDate"),
  taskDueTime: document.getElementById("taskDueTime"),
  priorityPicker: document.getElementById("priorityPicker"),
  taskReminder: document.getElementById("taskReminder"),
  taskManualProgress: document.getElementById("taskManualProgress"),
  taskManualProgressValue: document.getElementById("taskManualProgressValue"),

  attachmentDropzone: document.getElementById("attachmentDropzone"),
  taskAttachment: document.getElementById("taskAttachment"),
  attachmentPreview: document.getElementById("attachmentPreview"),
  attachmentPreviewIcon: document.getElementById("attachmentPreviewIcon"),
  attachmentPreviewName: document.getElementById("attachmentPreviewName"),
  attachmentPreviewMeta: document.getElementById("attachmentPreviewMeta"),
  attachmentUploadProgress: document.getElementById("attachmentUploadProgress"),
  attachmentUploadProgressBar:
    document.getElementById("attachmentUploadProgressBar"),
  removeAttachmentButton: document.getElementById("removeAttachmentButton"),
  storageWarning: document.getElementById("storageWarning"),

  taskDetailsBackdrop: document.getElementById("taskDetailsBackdrop"),
  taskDetailsPanel: document.getElementById("taskDetailsPanel"),
  closeTaskDetailsButton: document.getElementById("closeTaskDetailsButton"),
  taskDetailsHeader: document.getElementById("taskDetailsHeader"),
  taskDetailsStatus: document.getElementById("taskDetailsStatus"),
  taskDetailsTitle: document.getElementById("taskDetailsTitle"),
  taskDetailsSubject: document.getElementById("taskDetailsSubject"),
  taskDetailsDue: document.getElementById("taskDetailsDue"),
  taskDetailsPriority: document.getElementById("taskDetailsPriority"),
  taskDetailsReminder: document.getElementById("taskDetailsReminder"),
  taskDetailsDescription: document.getElementById("taskDetailsDescription"),
  taskDetailsProgressValue: document.getElementById("taskDetailsProgressValue"),
  taskDetailsProgressBar: document.getElementById("taskDetailsProgressBar"),
  taskDetailsAttachmentSection:
    document.getElementById("taskDetailsAttachmentSection"),
  taskDetailsAttachment: document.getElementById("taskDetailsAttachment"),
  taskDetailsAttachmentName:
    document.getElementById("taskDetailsAttachmentName"),
  taskDetailsAttachmentMeta:
    document.getElementById("taskDetailsAttachmentMeta"),
  taskDetailsEditButton: document.getElementById("taskDetailsEditButton"),
  taskDetailsDeleteButton: document.getElementById("taskDetailsDeleteButton"),

  taskConfirmBackdrop: document.getElementById("taskConfirmBackdrop"),
  taskConfirmDialog: document.getElementById("taskConfirmDialog"),
  confirmTaskName: document.getElementById("confirmTaskName"),
  cancelTaskDeleteButton: document.getElementById("cancelTaskDeleteButton"),
  confirmTaskDeleteButton: document.getElementById("confirmTaskDeleteButton"),

  toastRegion: document.getElementById("toastRegion")
};

/* =========================================================
   INICIO
========================================================= */

document.addEventListener("DOMContentLoaded", initializeTasksPage);

function initializeTasksPage() {
  configureSidebar();
  configureDrawer();
  configurePopovers();
  configureSearchFiltersAndSort();
  configureViewSwitcher();
  configureTaskModal();
  configureTaskDetails();
  configureDeleteDialog();
  configureNotifications();
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
      openNewTaskFromUrl();
    } catch (error) {
      console.error("No se pudo iniciar el módulo Tareas:", error);
      showToast(
        "No pudimos cargar tus tareas",
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
  const fullName =
    normalizeSpaces(
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
    if (button) button.disabled = disabled;
  });
}

function cleanupSubscriptions() {
  state.unsubscribeSubjects?.();
  state.unsubscribeTasks?.();
  state.unsubscribeSubjects = null;
  state.unsubscribeTasks = null;

  if (state.reminderInterval) {
    window.clearInterval(state.reminderInterval);
    state.reminderInterval = null;
  }
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

      populateSubjectControls();
      renderTasks();
      refreshActiveTaskDetails();
    },
    (error) => {
      console.error("No se pudieron leer las materias:", error);
      state.subjects = [];
      populateSubjectControls();
      renderTasks();
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
      state.tasks = snapshot.docs.map((taskDocument) =>
        normalizeTask({
          id: taskDocument.id,
          ...taskDocument.data()
        })
      );

      renderTasks();
      renderNotifications();
      refreshActiveTaskDetails();
      checkDueReminders();
      hideLoadingScreen();
    },
    (error) => {
      console.error("No se pudieron leer las tareas:", error);
      elements.tasksGrid.setAttribute("aria-busy", "false");
      elements.tasksGrid.innerHTML = createErrorState(
        "No pudimos cargar tus tareas",
        "Agrega las reglas de seguridad para la colección tasks."
      );
      hideLoadingScreen();
    }
  );
}

/* =========================================================
   CREAR Y EDITAR
========================================================= */

function configureTaskModal() {
  [
    elements.newTaskButton,
    elements.sidebarNewTaskButton,
    elements.resultsNewTaskButton,
    elements.mobileNewTaskButton
  ].forEach((button) => {
    button?.addEventListener("click", () => openTaskModal());
  });

  elements.closeTaskModalButton.addEventListener("click", closeTaskModal);
  elements.cancelTaskButton.addEventListener("click", closeTaskModal);
  elements.taskModalBackdrop.addEventListener("click", closeTaskModal);
  elements.taskForm.addEventListener("submit", saveTask);

  elements.taskDescription.addEventListener("input", () => {
    elements.taskDescriptionCounter.textContent =
      String(elements.taskDescription.value.length);
  });

  elements.taskStatus.addEventListener("change", syncProgressWithStatus);

  elements.taskManualProgress.addEventListener("input", () => {
    elements.taskManualProgressValue.textContent =
      elements.taskManualProgress.value;
  });

  elements.priorityPicker
    .querySelectorAll("[data-priority]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        selectPriority(button.dataset.priority);
      });
    });

  elements.taskAttachment.addEventListener("change", () => {
    const [file] = elements.taskAttachment.files;
    handleSelectedFile(file || null);
  });

  elements.removeAttachmentButton.addEventListener(
    "click",
    removeSelectedAttachment
  );

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.attachmentDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.attachmentDropzone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    elements.attachmentDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.attachmentDropzone.classList.remove("is-dragging");
    });
  });

  elements.attachmentDropzone.addEventListener("drop", (event) => {
    const [file] = event.dataTransfer.files;
    handleSelectedFile(file || null);
  });
}

function openTaskModal(taskId = "", subjectIdFromUrl = "") {
  clearTaskFormMessage();
  closeTaskCardMenus();

  const task = taskId
    ? state.tasks.find((item) => item.id === taskId)
    : null;

  elements.taskForm.reset();
  elements.editingTaskId.value = task?.id || "";
  elements.taskDescriptionCounter.textContent =
    String(task?.description?.length || 0);

  state.selectedFile = null;
  state.removeExistingAttachment = false;
  resetAttachmentProgress();

  if (task) {
    elements.taskModalKicker.textContent = "Editar tarea";
    elements.taskModalTitle.textContent = "Actualiza la tarea";
    elements.taskModalSubtitle.textContent =
      "Los cambios se sincronizarán automáticamente.";
    elements.saveTaskButtonText.textContent = "Guardar cambios";

    elements.taskTitle.value = task.title;
    elements.taskSubject.value = task.subjectId || "";
    elements.taskStatus.value = task.status;
    elements.taskDescription.value = task.description || "";
    elements.taskDueDate.value = task.dueAt
      ? formatInputDate(task.dueAt)
      : "";
    elements.taskDueTime.value = task.dueAt
      ? formatInputTime(task.dueAt, task.hasExplicitTime)
      : "";
    elements.taskReminder.value =
      task.reminderMinutes === null ||
      task.reminderMinutes === undefined
        ? ""
        : String(task.reminderMinutes);
    elements.taskManualProgress.value = String(task.progress);
    elements.taskManualProgressValue.textContent = String(task.progress);

    selectPriority(task.priority);

    if (task.attachment?.url) {
      renderAttachmentPreview(task.attachment, true);
    } else {
      hideAttachmentPreview();
    }
  } else {
    elements.taskModalKicker.textContent = "Nueva tarea";
    elements.taskModalTitle.textContent = "Crea una tarea";
    elements.taskModalSubtitle.textContent =
      "Define la entrega, su prioridad y cómo deseas recordarla.";
    elements.saveTaskButtonText.textContent = "Crear tarea";

    selectPriority("medium");
    elements.taskStatus.value = "pending";
    elements.taskManualProgress.value = "0";
    elements.taskManualProgressValue.textContent = "0";
    elements.taskDueDate.min = formatInputDate(new Date());

    const requestedSubjectId =
      subjectIdFromUrl ||
      new URL(window.location.href).searchParams.get("subjectId") ||
      "";

    if (
      requestedSubjectId &&
      state.subjects.some((subject) => subject.id === requestedSubjectId)
    ) {
      elements.taskSubject.value = requestedSubjectId;
    }

    hideAttachmentPreview();
  }

  elements.storageWarning.hidden = true;
  elements.taskModalBackdrop.hidden = false;
  elements.taskModal.hidden = false;
  document.body.style.overflow = "hidden";

  window.setTimeout(() => {
    elements.taskTitle.focus();
  }, 80);
}

function closeTaskModal(force = false) {
  if (elements.saveTaskButton.disabled && !force) return;

  elements.taskModalBackdrop.hidden = true;
  elements.taskModal.hidden = true;
  document.body.style.removeProperty("overflow");
  clearTaskFormMessage();

  state.selectedFile = null;
  state.removeExistingAttachment = false;
  elements.taskAttachment.value = "";

  const url = new URL(window.location.href);

  if (url.searchParams.has("action") || url.searchParams.has("subjectId")) {
    url.searchParams.delete("action");
    url.searchParams.delete("subjectId");
    window.history.replaceState({}, "", url);
  }
}

function openNewTaskFromUrl() {
  const url = new URL(window.location.href);

  if (url.searchParams.get("action") === "new") {
    window.setTimeout(() => {
      openTaskModal("", url.searchParams.get("subjectId") || "");
    }, 220);
  }
}

async function saveTask(event) {
  event.preventDefault();
  clearTaskFormMessage();

  const formData = readTaskForm();
  const validationMessage = validateTask(formData);

  if (validationMessage) {
    showTaskFormMessage(validationMessage);
    return;
  }

  setTaskSaveLoading(true);

  const editingId = elements.editingTaskId.value.trim();
  let taskId = editingId;
  let createdNewDocument = false;

  try {
    const basePayload = {
      title: formData.title,
      subjectId: formData.subjectId,
      subjectName: formData.subjectName,
      description: formData.description,
      dueAt: Timestamp.fromDate(formData.dueAt),
      hasExplicitTime: formData.hasExplicitTime,
      priority: formData.priority,
      status: formData.status,
      progress: formData.progress,
      reminderMinutes: formData.reminderMinutes,
      updatedAt: serverTimestamp()
    };

    if (editingId) {
      await updateDoc(doc(db, TASKS_COLLECTION, editingId), basePayload);
    } else {
      const taskReference = await addDoc(
        collection(db, TASKS_COLLECTION),
        {
          ...basePayload,
          userId: state.user.uid,
          attachment: null,
          createdAt: serverTimestamp()
        }
      );

      taskId = taskReference.id;
      createdNewDocument = true;
    }

    const existingTask = editingId
      ? state.tasks.find((task) => task.id === editingId)
      : null;

    let attachment = existingTask?.attachment || null;

    if (state.selectedFile) {
      try {
        attachment = await uploadTaskAttachment(
          state.selectedFile,
          taskId
        );
      } catch (uploadError) {
        console.error(
          "No se pudo subir el adjunto a Cloudinary:",
          uploadError
        );

        elements.storageWarning.hidden = false;

        showToast(
          createdNewDocument
            ? "Tarea guardada sin archivo"
            : "Cambios guardados sin archivo nuevo",
          getFirebaseErrorMessage(uploadError)
        );
      }
    } else if (
      state.removeExistingAttachment &&
      attachment
    ) {
      /*
       * Desde GitHub Pages no colocamos el API Secret de Cloudinary.
       * Por seguridad se elimina la referencia de Firestore, pero el
       * archivo físico debe limpiarse manualmente desde Cloudinary.
       */
      attachment = null;
    }

    await updateDoc(doc(db, TASKS_COLLECTION, taskId), {
      attachment,
      updatedAt: serverTimestamp()
    });

    showToast(
      editingId ? "Tarea actualizada" : "Tarea creada",
      `${formData.title} se guardó correctamente.`
    );

    closeTaskModal(true);
  } catch (error) {
    console.error("No se pudo guardar la tarea:", error);
    showTaskFormMessage(getFirebaseErrorMessage(error));
  } finally {
    setTaskSaveLoading(false);
  }
}

function readTaskForm() {
  const subjectId = elements.taskSubject.value;
  const subject = state.subjects.find((item) => item.id === subjectId);
  const status = normalizeStatus(elements.taskStatus.value);
  const dueTimeValue = elements.taskDueTime.value;
  const dueAt = combineDateAndTime(
    elements.taskDueDate.value,
    dueTimeValue
  );

  const requestedProgress =
    Number(elements.taskManualProgress.value) || 0;

  return {
    title: normalizeSpaces(elements.taskTitle.value),
    subjectId,
    subjectName: subject?.name || "",
    description: elements.taskDescription.value.trim(),
    dueAt,
    hasExplicitTime: Boolean(dueTimeValue),
    priority: normalizePriority(state.selectedPriority),
    status,
    progress:
      status === "delivered"
        ? 100
        : Math.max(0, Math.min(100, requestedProgress)),
    reminderMinutes:
      elements.taskReminder.value === ""
        ? null
        : Number(elements.taskReminder.value)
  };
}

function validateTask(data) {
  if (!data.title) return "Escribe el título de la tarea.";
  if (data.title.length < 2) {
    return "El título debe tener al menos 2 caracteres.";
  }
  if (!data.subjectId) {
    return "Selecciona la materia a la que pertenece la tarea.";
  }
  if (!data.dueAt || Number.isNaN(data.dueAt.getTime())) {
    return "Selecciona una fecha de entrega válida.";
  }

  if (state.selectedFile) {
    const fileError = validateAttachmentFile(state.selectedFile);
    if (fileError) return fileError;
  }

  return "";
}

function syncProgressWithStatus() {
  const status = normalizeStatus(elements.taskStatus.value);

  if (status === "delivered") {
    elements.taskManualProgress.value = "100";
  } else if (
    status === "pending" &&
    Number(elements.taskManualProgress.value) === 100
  ) {
    elements.taskManualProgress.value = "0";
  } else if (
    status === "in_progress" &&
    Number(elements.taskManualProgress.value) === 0
  ) {
    elements.taskManualProgress.value = "50";
  }

  elements.taskManualProgressValue.textContent =
    elements.taskManualProgress.value;
}

function selectPriority(priority) {
  state.selectedPriority = normalizePriority(priority);

  elements.priorityPicker
    .querySelectorAll("[data-priority]")
    .forEach((button) => {
      const active =
        button.dataset.priority === state.selectedPriority;

      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
}

function setTaskSaveLoading(loading) {
  elements.saveTaskButton.disabled = loading;
  elements.closeTaskModalButton.disabled = loading;
  elements.cancelTaskButton.disabled = loading;

  if (loading) {
    elements.saveTaskButton.dataset.originalHtml =
      elements.saveTaskButton.innerHTML;

    elements.saveTaskButton.innerHTML = `
      <span>Guardando...</span>
      <i class="fa-solid fa-spinner fa-spin"></i>
    `;
    return;
  }

  if (elements.saveTaskButton.dataset.originalHtml) {
    elements.saveTaskButton.innerHTML =
      elements.saveTaskButton.dataset.originalHtml;

    delete elements.saveTaskButton.dataset.originalHtml;
  }
}

/* =========================================================
   ADJUNTOS
========================================================= */

async function handleSelectedFile(file) {
  if (!file) {
    state.selectedFile = null;
    hideAttachmentPreview();
    return;
  }

  const validationMessage = validateAttachmentFile(file);

  if (validationMessage) {
    showTaskFormMessage(validationMessage);
    elements.taskAttachment.value = "";
    return;
  }

  clearTaskFormMessage();

  try {
    const preparedFile = file.type.startsWith("image/")
      ? await compressImage(file)
      : file;

    state.selectedFile = preparedFile;
    state.removeExistingAttachment = false;

    renderAttachmentPreview(
      {
        name: preparedFile.name,
        type: preparedFile.type,
        size: preparedFile.size
      },
      false
    );
  } catch (error) {
    console.error("No se pudo preparar el archivo:", error);
    showTaskFormMessage(
      "No pudimos procesar el archivo seleccionado."
    );
  }
}

function validateAttachmentFile(file) {
  if (!ALLOWED_FILE_TYPES.has(file.type)) {
    return "El archivo debe ser JPG, PNG, WEBP o PDF.";
  }

  if (file.size > MAX_FILE_BYTES) {
    return "El archivo supera el límite de 10 MB.";
  }

  return "";
}

async function compressImage(file) {
  if (!file.type.startsWith("image/")) return file;

  const bitmap = await createImageBitmap(file);
  const maxDimension = 1600;
  const scale = Math.min(
    1,
    maxDimension / Math.max(bitmap.width, bitmap.height)
  );
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const outputType =
    file.type === "image/png" ? "image/webp" : "image/jpeg";
  const extension = outputType === "image/webp" ? "webp" : "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "");

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(new Error("No se pudo crear la imagen")),
      outputType,
      0.82
    );
  });

  if (blob.size >= file.size) return file;

  return new File(
    [blob],
    `${baseName}-comprimida.${extension}`,
    {
      type: outputType,
      lastModified: Date.now()
    }
  );
}

async function uploadTaskAttachment(file, taskId) {
  elements.attachmentUploadProgress.hidden = false;
  elements.attachmentUploadProgressBar.style.width = "0%";

  const attachment = await uploadFileToCloudinary({
    file,
    userId: state.user.uid,
    taskId,
    onProgress(progress) {
      elements.attachmentUploadProgressBar.style.width =
        `${progress}%`;
    }
  });

  return {
    ...attachment,
    name: file.name,
    type: file.type,
    size: attachment.size || file.size
  };
}

function renderAttachmentPreview(attachment, existing) {
  const isPdf = attachment.type === "application/pdf";

  elements.attachmentPreview.hidden = false;
  elements.attachmentPreviewName.textContent =
    attachment.name || "Archivo adjunto";

  elements.attachmentPreviewMeta.textContent =
    `${isPdf ? "PDF" : "Imagen"} · ` +
    `${formatFileSize(attachment.size || 0)}` +
    `${existing ? " · Guardado" : ""}`;

  elements.attachmentPreviewIcon.innerHTML = `
    <i class="${
      isPdf
        ? "fa-regular fa-file-pdf"
        : "fa-regular fa-file-image"
    }"></i>
  `;
}

function hideAttachmentPreview() {
  elements.attachmentPreview.hidden = true;
  resetAttachmentProgress();
}

function removeSelectedAttachment() {
  const editingId = elements.editingTaskId.value;
  const existingTask =
    state.tasks.find((task) => task.id === editingId);

  if (existingTask?.attachment) {
    state.removeExistingAttachment = true;
  }

  state.selectedFile = null;
  elements.taskAttachment.value = "";
  hideAttachmentPreview();
}

function resetAttachmentProgress() {
  elements.attachmentUploadProgress.hidden = true;
  elements.attachmentUploadProgressBar.style.width = "0%";
}

/* =========================================================
   ELIMINAR
========================================================= */

function configureDeleteDialog() {
  elements.cancelTaskDeleteButton.addEventListener(
    "click",
    closeDeleteDialog
  );

  elements.taskConfirmBackdrop.addEventListener(
    "click",
    closeDeleteDialog
  );

  elements.confirmTaskDeleteButton.addEventListener(
    "click",
    deleteSelectedTask
  );
}

function openDeleteDialog(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;

  state.pendingDeleteId = taskId;
  elements.confirmTaskName.textContent = task.title;
  elements.taskConfirmBackdrop.hidden = false;
  elements.taskConfirmDialog.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeDeleteDialog(force = false) {
  if (
    elements.confirmTaskDeleteButton.disabled &&
    !force
  ) {
    return;
  }

  state.pendingDeleteId = null;
  elements.taskConfirmBackdrop.hidden = true;
  elements.taskConfirmDialog.hidden = true;

  if (
    elements.taskDetailsPanel.getAttribute("aria-hidden") === "true" &&
    elements.taskModal.hidden
  ) {
    document.body.style.removeProperty("overflow");
  }
}

async function deleteSelectedTask() {
  const taskId = state.pendingDeleteId;
  const task = state.tasks.find((item) => item.id === taskId);

  if (!taskId || !task) {
    closeDeleteDialog();
    return;
  }

  setDeleteLoading(true);

  try {
    /*
     * Se elimina la tarea de Firestore.
     * El archivo de Cloudinary no se borra desde el navegador porque
     * hacerlo requeriría exponer el API Secret en GitHub Pages.
     */
    await deleteDoc(doc(db, TASKS_COLLECTION, taskId));

    if (state.activeTaskId === taskId) {
      closeTaskDetails();
    }

    showToast(
      "Tarea eliminada",
      `${task.title} se eliminó correctamente.`
    );

    closeDeleteDialog(true);
  } catch (error) {
    console.error("No se pudo eliminar la tarea:", error);
    showToast(
      "No se pudo eliminar",
      getFirebaseErrorMessage(error)
    );
  } finally {
    setDeleteLoading(false);
  }
}

function setDeleteLoading(loading) {
  elements.confirmTaskDeleteButton.disabled = loading;
  elements.cancelTaskDeleteButton.disabled = loading;

  if (loading) {
    elements.confirmTaskDeleteButton.dataset.originalHtml =
      elements.confirmTaskDeleteButton.innerHTML;

    elements.confirmTaskDeleteButton.innerHTML = `
      <span>Eliminando...</span>
      <i class="fa-solid fa-spinner fa-spin"></i>
    `;
    return;
  }

  if (elements.confirmTaskDeleteButton.dataset.originalHtml) {
    elements.confirmTaskDeleteButton.innerHTML =
      elements.confirmTaskDeleteButton.dataset.originalHtml;

    delete elements.confirmTaskDeleteButton.dataset.originalHtml;
  }
}

/* =========================================================
   RENDER Y ESTADÍSTICAS
========================================================= */

function renderTasks() {
  const metrics = calculateTaskMetrics();
  const visibleTasks = getVisibleTasks();

  renderTaskMetrics(metrics);
  elements.tasksGrid.setAttribute("aria-busy", "false");

  if (!state.tasks.length) {
    elements.tasksSectionTitle.textContent =
      "Empieza tu planificación";
    elements.tasksResultsText.textContent =
      "Todavía no has creado tareas.";
    elements.tasksGrid.innerHTML = createTasksEmptyState();
    reconnectEmptyNewTaskButton();
    return;
  }

  if (!visibleTasks.length) {
    elements.tasksSectionTitle.textContent = "Sin coincidencias";
    elements.tasksResultsText.textContent =
      "No encontramos tareas con los filtros actuales.";
    elements.tasksGrid.innerHTML = createFilteredEmptyState();
    reconnectResetFiltersButton();
    return;
  }

  elements.tasksSectionTitle.textContent =
    state.statusFilter === "all"
      ? "Todas tus tareas"
      : STATUS_CONFIG[state.statusFilter].label;

  elements.tasksResultsText.textContent =
    `${visibleTasks.length} ` +
    `${
      visibleTasks.length === 1
        ? "tarea visible"
        : "tareas visibles"
    } de ${state.tasks.length}.`;

  elements.tasksGrid.innerHTML =
    visibleTasks.map(createTaskCard).join("");

  connectTaskCards();
}

function calculateTaskMetrics() {
  const total = state.tasks.length;
  const pending =
    state.tasks.filter((task) => task.status === "pending").length;
  const inProgress =
    state.tasks.filter((task) => task.status === "in_progress").length;
  const delivered =
    state.tasks.filter((task) => task.status === "delivered").length;
  const notDone =
    state.tasks.filter((task) => task.status === "not_done").length;

  const progress = total
    ? Math.round(
        state.tasks.reduce(
          (sum, task) => sum + task.progress,
          0
        ) / total
      )
    : 0;

  return {
    total,
    pending,
    inProgress,
    delivered,
    notDone,
    progress
  };
}

function renderTaskMetrics(metrics) {
  animateNumber(elements.totalTasksCount, metrics.total);
  animateNumber(elements.pendingTasksCount, metrics.pending);
  animateNumber(
    elements.inProgressTasksCount,
    metrics.inProgress
  );
  animateNumber(
    elements.deliveredTasksCount,
    metrics.delivered
  );
  animateNumber(
    elements.notDoneTasksCount,
    metrics.notDone
  );

  animateNumber(elements.tabAllCount, metrics.total);
  animateNumber(elements.tabPendingCount, metrics.pending);
  animateNumber(elements.tabProgressCount, metrics.inProgress);
  animateNumber(elements.tabDeliveredCount, metrics.delivered);
  animateNumber(elements.tabNotDoneCount, metrics.notDone);

  animateNumber(elements.heroProgressValue, metrics.progress);
  elements.heroProgressRing.style.setProperty(
    "--progress",
    metrics.progress
  );

  elements.heroProgressRing.setAttribute(
    "aria-label",
    `Progreso total de ${metrics.progress} por ciento`
  );

  if (!metrics.total) {
    elements.heroProgressLabel.textContent =
      "Comienza con tu primera tarea";
  } else if (metrics.progress === 100) {
    elements.heroProgressLabel.textContent = "¡Todo completado!";
  } else if (metrics.progress >= 70) {
    elements.heroProgressLabel.textContent = "Vas excelente";
  } else if (metrics.progress >= 35) {
    elements.heroProgressLabel.textContent =
      "Tu avance ya se nota";
  } else {
    elements.heroProgressLabel.textContent =
      "Un paso a la vez";
  }
}

function getVisibleTasks() {
  const search = state.searchTerm.toLowerCase();

  return state.tasks
    .filter((task) => {
      const matchesSearch =
        !search ||
        [task.title, task.subjectName, task.description].some(
          (value) =>
            String(value || "")
              .toLowerCase()
              .includes(search)
        );

      const matchesSubject =
        state.subjectFilter === "all" ||
        task.subjectId === state.subjectFilter;

      const matchesStatus =
        state.statusFilter === "all" ||
        task.status === state.statusFilter;

      return matchesSearch && matchesSubject && matchesStatus;
    })
    .sort(sortTaskItems);
}

function sortTaskItems(a, b) {
  switch (state.sortMode) {
    case "recent":
      return getTimestamp(b.createdAt) -
        getTimestamp(a.createdAt);

    case "priority":
      return PRIORITY_CONFIG[b.priority].weight -
        PRIORITY_CONFIG[a.priority].weight;

    case "name-asc":
      return a.title.localeCompare(
        b.title,
        "es",
        { sensitivity: "base" }
      );

    case "due-asc":
    default:
      return (a.dueAt?.getTime() || Infinity) -
        (b.dueAt?.getTime() || Infinity);
  }
}

function createTaskCard(task) {
  const subject = getSubject(task.subjectId);
  const color = subject?.color || "#2F80ED";
  const icon =
    subject?.icon || "fa-solid fa-book-open";
  const status = STATUS_CONFIG[task.status];
  const priority = PRIORITY_CONFIG[task.priority];
  const overdue = isTaskOverdue(task);

  const dueLabel = task.dueAt
    ? formatTaskDue(task.dueAt, task.hasExplicitTime)
    : "Sin fecha";

  const reminderLabel =
    formatReminder(task.reminderMinutes);

  const description =
    task.description || "Sin descripción.";

  return `
    <article
      class="task-card ${overdue ? "is-overdue" : ""}"
      data-task-id="${escapeHtml(task.id)}"
      style="--subject-color:${escapeHtml(color)}"
      tabindex="0"
      aria-label="Abrir ${escapeHtml(task.title)}"
    >
      <div class="task-card-accent"></div>

      <header class="task-card-header">
        <span class="task-card-subject">
          <i class="${escapeHtml(icon)}"></i>
          <span>${escapeHtml(
            task.subjectName ||
            subject?.name ||
            "Sin materia"
          )}</span>
        </span>

        <div class="task-card-menu-wrapper">
          <button
            class="task-card-menu-button"
            type="button"
            aria-label="Opciones"
            aria-expanded="false"
          >
            <i class="fa-solid fa-ellipsis"></i>
          </button>

          <div class="task-card-menu" hidden>
            <button type="button" data-action="open">
              <i class="fa-regular fa-eye"></i> Abrir
            </button>
            <button type="button" data-action="edit">
              <i class="fa-regular fa-pen-to-square"></i> Editar
            </button>
            <button type="button" data-action="delete">
              <i class="fa-regular fa-trash-can"></i> Eliminar
            </button>
          </div>
        </div>
      </header>

      <div class="task-card-body">
        <div class="task-card-status-row">
          <span class="task-status-pill status-${escapeHtml(task.status)}">
            <i class="${escapeHtml(status.icon)}"></i>
            ${escapeHtml(status.label)}
          </span>

          <span class="task-priority-pill priority-${escapeHtml(task.priority)}">
            ${escapeHtml(priority.label)}
          </span>
        </div>

        <h3>${escapeHtml(task.title)}</h3>
        <p class="task-card-description">
          ${escapeHtml(description)}
        </p>

        <div class="task-card-meta">
          <div class="task-card-meta-item ${overdue ? "overdue" : ""}">
            <i class="fa-regular fa-calendar"></i>
            <span>${escapeHtml(
              overdue
                ? `Venció: ${dueLabel}`
                : dueLabel
            )}</span>
          </div>

          <div class="task-card-meta-item">
            <i class="fa-regular fa-bell"></i>
            <span>${escapeHtml(reminderLabel)}</span>
          </div>
        </div>

        <div class="task-card-progress-row">
          <div class="task-card-progress-copy">
            <span>Avance</span>
            <strong>${task.progress}%</strong>
          </div>

          <div class="task-card-progress-track">
            <span style="width:${task.progress}%"></span>
          </div>
        </div>
      </div>

      <footer class="task-card-footer">
        <span class="task-attachment-indicator">
          <i class="${
            task.attachment?.url
              ? "fa-solid fa-paperclip"
              : "fa-regular fa-file"
          }"></i>
          ${
            task.attachment?.url
              ? "Con archivo"
              : "Sin archivo"
          }
        </span>

        <button
          class="task-open-button"
          type="button"
          data-action="open"
        >
          Abrir <i class="fa-solid fa-arrow-right"></i>
        </button>
      </footer>
    </article>
  `;
}

function connectTaskCards() {
  elements.tasksGrid
    .querySelectorAll(".task-card")
    .forEach((card) => {
      const taskId = card.dataset.taskId;
      const menuButton =
        card.querySelector(".task-card-menu-button");
      const menu =
        card.querySelector(".task-card-menu");

      card.addEventListener("click", (event) => {
        if (!event.target.closest("button")) {
          openTaskDetails(taskId);
        }
      });

      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openTaskDetails(taskId);
        }
      });

      menuButton.addEventListener("click", (event) => {
        event.stopPropagation();
        const willOpen = menu.hidden;
        closeTaskCardMenus();
        menu.hidden = !willOpen;
        menuButton.setAttribute(
          "aria-expanded",
          String(willOpen)
        );
      });

      card.querySelectorAll("[data-action]")
        .forEach((button) => {
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            closeTaskCardMenus();

            if (button.dataset.action === "open") {
              openTaskDetails(taskId);
            }

            if (button.dataset.action === "edit") {
              openTaskModal(taskId);
            }

            if (button.dataset.action === "delete") {
              openDeleteDialog(taskId);
            }
          });
        });
    });
}

function closeTaskCardMenus() {
  document
    .querySelectorAll(".task-card-menu")
    .forEach((menu) => {
      menu.hidden = true;
    });

  document
    .querySelectorAll(".task-card-menu-button")
    .forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });
}

function createTasksEmptyState() {
  const hasSubjects = state.subjects.length > 0;

  return `
    <div class="tasks-empty-state">
      <div>
        <span class="tasks-empty-icon">
          <i class="fa-solid fa-list-check"></i>
        </span>

        <h3>${
          hasSubjects
            ? "Tu primera tarea empieza aquí"
            : "Primero crea una materia"
        }</h3>

        <p>
          ${
            hasSubjects
              ? "Registra una entrega, selecciona su prioridad y configura un recordatorio."
              : "Las tareas deben estar vinculadas a una materia para mantener todo organizado."
          }
        </p>

        ${
          hasSubjects
            ? `<button
                 class="primary-action"
                 id="emptyNewTaskButton"
                 type="button"
               >
                 <i class="fa-solid fa-plus"></i>
                 Crear mi primera tarea
               </button>`
            : `<a
                 class="primary-action"
                 href="materias.html?action=new"
               >
                 <i class="fa-solid fa-book-medical"></i>
                 Crear una materia
               </a>`
        }
      </div>
    </div>
  `;
}

function createFilteredEmptyState() {
  return `
    <div class="tasks-empty-state">
      <div>
        <span class="tasks-empty-icon">
          <i class="fa-solid fa-filter-circle-xmark"></i>
        </span>

        <h3>No encontramos resultados</h3>
        <p>Cambia la búsqueda, materia o estado seleccionado.</p>

        <button
          class="secondary-action"
          id="resetTaskFiltersButton"
          type="button"
        >
          <i class="fa-solid fa-rotate-left"></i>
          Restablecer filtros
        </button>
      </div>
    </div>
  `;
}

function createErrorState(title, message) {
  return `
    <div class="tasks-empty-state">
      <div>
        <span class="tasks-empty-icon">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </span>

        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>

        <a
          class="primary-action"
          href="${escapeHtml(DASHBOARD_URL)}"
        >
          Volver al Dashboard
        </a>
      </div>
    </div>
  `;
}

function reconnectEmptyNewTaskButton() {
  document
    .getElementById("emptyNewTaskButton")
    ?.addEventListener(
      "click",
      () => openTaskModal()
    );
}

function reconnectResetFiltersButton() {
  document
    .getElementById("resetTaskFiltersButton")
    ?.addEventListener(
      "click",
      resetTaskFilters
    );
}

/* =========================================================
   DETALLE
========================================================= */

function configureTaskDetails() {
  elements.closeTaskDetailsButton.addEventListener(
    "click",
    closeTaskDetails
  );

  elements.taskDetailsBackdrop.addEventListener(
    "click",
    closeTaskDetails
  );

  elements.taskDetailsEditButton.addEventListener(
    "click",
    () => {
      const taskId = state.activeTaskId;
      closeTaskDetails();

      if (taskId) openTaskModal(taskId);
    }
  );

  elements.taskDetailsDeleteButton.addEventListener(
    "click",
    () => {
      if (state.activeTaskId) {
        openDeleteDialog(state.activeTaskId);
      }
    }
  );

  document
    .querySelectorAll("[data-quick-status]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        quickUpdateStatus(
          button.dataset.quickStatus
        );
      });
    });
}

function openTaskDetails(taskId) {
  const task = state.tasks.find(
    (item) => item.id === taskId
  );

  if (!task) return;

  state.activeTaskId = taskId;
  renderTaskDetails(task);

  elements.taskDetailsBackdrop.hidden = false;
  elements.taskDetailsPanel.classList.add("is-open");
  elements.taskDetailsPanel.setAttribute(
    "aria-hidden",
    "false"
  );
  document.body.style.overflow = "hidden";
}

function closeTaskDetails() {
  state.activeTaskId = null;
  elements.taskDetailsPanel.classList.remove("is-open");
  elements.taskDetailsPanel.setAttribute(
    "aria-hidden",
    "true"
  );

  window.setTimeout(() => {
    elements.taskDetailsBackdrop.hidden = true;
  }, 260);

  if (
    elements.taskConfirmDialog.hidden &&
    elements.taskModal.hidden
  ) {
    document.body.style.removeProperty("overflow");
  }
}

function refreshActiveTaskDetails() {
  if (!state.activeTaskId) return;

  const task = state.tasks.find(
    (item) => item.id === state.activeTaskId
  );

  if (!task) {
    closeTaskDetails();
    return;
  }

  renderTaskDetails(task);
}

function renderTaskDetails(task) {
  const subject = getSubject(task.subjectId);
  const color = subject?.color || "#2F80ED";

  elements.taskDetailsHeader.style.setProperty(
    "--details-color",
    color
  );

  elements.taskDetailsPanel.style.setProperty(
    "--details-color",
    color
  );

  elements.taskDetailsStatus.textContent =
    STATUS_CONFIG[task.status].label;
  elements.taskDetailsTitle.textContent = task.title;
  elements.taskDetailsSubject.textContent =
    task.subjectName || subject?.name || "Sin materia";
  elements.taskDetailsDue.textContent =
    task.dueAt
      ? formatTaskDue(
          task.dueAt,
          task.hasExplicitTime
        )
      : "Sin fecha";
  elements.taskDetailsPriority.textContent =
    PRIORITY_CONFIG[task.priority].label;
  elements.taskDetailsReminder.textContent =
    formatReminder(task.reminderMinutes);
  elements.taskDetailsDescription.textContent =
    task.description || "Sin descripción.";
  elements.taskDetailsProgressValue.textContent =
    String(task.progress);
  elements.taskDetailsProgressBar.style.width =
    `${task.progress}%`;

  if (task.attachment?.url) {
    elements.taskDetailsAttachmentSection.hidden = false;
    elements.taskDetailsAttachment.href =
      task.attachment.url;
    elements.taskDetailsAttachmentName.textContent =
      task.attachment.name || "Archivo adjunto";
    elements.taskDetailsAttachmentMeta.textContent =
      `${
        task.attachment.type === "application/pdf"
          ? "PDF"
          : "Imagen"
      } · ${formatFileSize(task.attachment.size || 0)}`;
  } else {
    elements.taskDetailsAttachmentSection.hidden = true;
    elements.taskDetailsAttachment.removeAttribute("href");
  }
}

async function quickUpdateStatus(status) {
  const task = state.tasks.find(
    (item) => item.id === state.activeTaskId
  );

  if (!task) return;

  const normalizedStatus = normalizeStatus(status);

  const progress =
    normalizedStatus === "delivered"
      ? 100
      : normalizedStatus === "in_progress" &&
        task.progress === 0
        ? 50
        : normalizedStatus === "pending" &&
          task.progress === 100
          ? 0
          : task.progress;

  try {
    await updateDoc(
      doc(db, TASKS_COLLECTION, task.id),
      {
        status: normalizedStatus,
        progress,
        updatedAt: serverTimestamp()
      }
    );

    showToast(
      "Estado actualizado",
      `La tarea ahora está ` +
      `${STATUS_CONFIG[normalizedStatus].label.toLowerCase()}.`
    );
  } catch (error) {
    console.error(
      "No se pudo cambiar el estado:",
      error
    );

    showToast(
      "No se pudo actualizar",
      getFirebaseErrorMessage(error)
    );
  }
}

/* =========================================================
   FILTROS Y VISTA
========================================================= */

function configureSearchFiltersAndSort() {
  elements.tasksSearch.addEventListener(
    "input",
    () => setSearchTerm(elements.tasksSearch.value)
  );

  elements.globalSearch.addEventListener(
    "input",
    () => setSearchTerm(elements.globalSearch.value)
  );

  elements.clearTaskSearchButton.addEventListener(
    "click",
    clearSearch
  );

  elements.subjectFilter.addEventListener(
    "change",
    () => {
      state.subjectFilter =
        elements.subjectFilter.value;
      renderTasks();
    }
  );

  elements.sortTasks.addEventListener(
    "change",
    () => {
      state.sortMode = elements.sortTasks.value;
      renderTasks();
    }
  );

  document
    .querySelectorAll("[data-status-filter]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        state.statusFilter =
          button.dataset.statusFilter;

        document
          .querySelectorAll("[data-status-filter]")
          .forEach((tab) => {
            const active = tab === button;
            tab.classList.toggle("active", active);
            tab.setAttribute(
              "aria-selected",
              String(active)
            );
          });

        renderTasks();
      });
    });

  document.addEventListener("keydown", (event) => {
    const isShortcut =
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "k";

    if (isShortcut) {
      event.preventDefault();
      elements.tasksSearch.focus();
    }

    if (event.key === "Escape") {
      closeTaskCardMenus();

      if (!elements.taskConfirmDialog.hidden) {
        closeDeleteDialog();
        return;
      }

      if (!elements.taskModal.hidden) {
        closeTaskModal();
        return;
      }

      if (
        elements.taskDetailsPanel
          .getAttribute("aria-hidden") === "false"
      ) {
        closeTaskDetails();
        return;
      }

      closeDrawer();
      closeAllPopovers();
    }
  });

  document.addEventListener("click", (event) => {
    if (
      !event.target.closest(
        ".task-card-menu-wrapper"
      )
    ) {
      closeTaskCardMenus();
    }
  });
}

function populateSubjectControls() {
  const currentFilter = state.subjectFilter;
  const currentFormSubject =
    elements.taskSubject.value;

  const sortedSubjects = [...state.subjects]
    .sort((a, b) =>
      String(a.name || "").localeCompare(
        String(b.name || ""),
        "es",
        { sensitivity: "base" }
      )
    );

  elements.subjectFilter.innerHTML = `
    <option value="all">Todas las materias</option>
    ${sortedSubjects
      .map(
        (subject) =>
          `<option value="${escapeHtml(subject.id)}">` +
          `${escapeHtml(subject.name || "Materia")}` +
          `</option>`
      )
      .join("")}
  `;

  elements.taskSubject.innerHTML = `
    <option value="">Selecciona una materia</option>
    ${sortedSubjects
      .map(
        (subject) =>
          `<option value="${escapeHtml(subject.id)}">` +
          `${escapeHtml(subject.name || "Materia")}` +
          `</option>`
      )
      .join("")}
  `;

  if (
    sortedSubjects.some(
      (subject) => subject.id === currentFilter
    )
  ) {
    elements.subjectFilter.value = currentFilter;
  } else {
    state.subjectFilter = "all";
  }

  if (
    sortedSubjects.some(
      (subject) => subject.id === currentFormSubject
    )
  ) {
    elements.taskSubject.value =
      currentFormSubject;
  }
}

function setSearchTerm(value) {
  state.searchTerm = normalizeSpaces(value);

  if (elements.tasksSearch.value !== value) {
    elements.tasksSearch.value = value;
  }

  if (elements.globalSearch.value !== value) {
    elements.globalSearch.value = value;
  }

  elements.clearTaskSearchButton.hidden =
    !state.searchTerm;

  renderTasks();
}

function clearSearch() {
  state.searchTerm = "";
  elements.tasksSearch.value = "";
  elements.globalSearch.value = "";
  elements.clearTaskSearchButton.hidden = true;
  renderTasks();
  elements.tasksSearch.focus();
}

function resetTaskFilters() {
  state.searchTerm = "";
  state.subjectFilter = "all";
  state.statusFilter = "all";
  state.sortMode = "due-asc";

  elements.tasksSearch.value = "";
  elements.globalSearch.value = "";
  elements.clearTaskSearchButton.hidden = true;
  elements.subjectFilter.value = "all";
  elements.sortTasks.value = "due-asc";

  document
    .querySelectorAll("[data-status-filter]")
    .forEach((tab) => {
      const active =
        tab.dataset.statusFilter === "all";
      tab.classList.toggle("active", active);
      tab.setAttribute(
        "aria-selected",
        String(active)
      );
    });

  renderTasks();
}

function configureViewSwitcher() {
  elements.taskGridViewButton.addEventListener(
    "click",
    () => setViewMode("grid")
  );

  elements.taskListViewButton.addEventListener(
    "click",
    () => setViewMode("list")
  );
}

function setViewMode(mode) {
  state.viewMode = mode === "list"
    ? "list"
    : "grid";

  localStorage.setItem(
    "studytrack-task-view",
    state.viewMode
  );

  applyViewMode();
}

function applyViewMode() {
  const listMode = state.viewMode === "list";

  elements.tasksGrid.classList.toggle(
    "list-view",
    listMode
  );

  elements.taskGridViewButton.classList.toggle(
    "active",
    !listMode
  );

  elements.taskListViewButton.classList.toggle(
    "active",
    listMode
  );

  elements.taskGridViewButton.setAttribute(
    "aria-pressed",
    String(!listMode)
  );

  elements.taskListViewButton.setAttribute(
    "aria-pressed",
    String(listMode)
  );
}

/* =========================================================
   NOTIFICACIONES Y RECORDATORIOS
========================================================= */

function configureNotifications() {
  updateNotificationPermissionUI();

  elements.enableNotificationsButton.addEventListener(
    "click",
    async () => {
      if (!("Notification" in window)) {
        showToast(
          "Notificaciones no disponibles",
          "Este navegador no admite avisos del sistema."
        );
        return;
      }

      const permission =
        await Notification.requestPermission();

      updateNotificationPermissionUI();

      showToast(
        permission === "granted"
          ? "Notificaciones activadas"
          : "Permiso no concedido",
        permission === "granted"
          ? "Te avisaremos mientras StudyTrack esté abierto."
          : "Puedes cambiar el permiso desde la configuración del navegador."
      );
    }
  );

  state.reminderInterval =
    window.setInterval(
      checkDueReminders,
      60_000
    );
}

function updateNotificationPermissionUI() {
  const supported = "Notification" in window;
  const granted =
    supported &&
    Notification.permission === "granted";

  elements.notificationPermission.hidden =
    granted;

  if (!supported) {
    elements.notificationPermission.hidden = false;
    elements.enableNotificationsButton.disabled = true;
    elements.enableNotificationsButton.textContent =
      "No disponible";
  }
}

function renderNotifications() {
  const reminders = getUpcomingReminderTasks();

  elements.notificationBadge.hidden =
    reminders.length === 0;

  elements.notificationBadge.textContent =
    String(reminders.length);

  if (!reminders.length) {
    elements.taskNotificationsList.innerHTML = `
      <div class="popover-empty">
        <span>
          <i class="fa-regular fa-bell-slash"></i>
        </span>
        <strong>Todo está tranquilo</strong>
        <p>No tienes recordatorios próximos.</p>
      </div>
    `;
    return;
  }

  elements.taskNotificationsList.innerHTML =
    reminders
      .map(
        (task) => `
          <article class="task-notification-item">
            <span>
              <i class="fa-regular fa-bell"></i>
            </span>
            <div>
              <strong>${escapeHtml(task.title)}</strong>
              <small>${escapeHtml(
                formatReminderMoment(task)
              )}</small>
            </div>
          </article>
        `
      )
      .join("");
}

function getUpcomingReminderTasks() {
  const now = Date.now();
  const next48Hours =
    now + 48 * 60 * 60 * 1000;

  return state.tasks
    .filter((task) => {
      if (
        task.status === "delivered" ||
        task.status === "not_done" ||
        !task.dueAt ||
        task.reminderMinutes === null
      ) {
        return false;
      }

      const reminderAt =
        task.dueAt.getTime() -
        task.reminderMinutes * 60 * 1000;

      return (
        reminderAt <= next48Hours &&
        task.dueAt.getTime() >= now
      );
    })
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, 8);
}

function checkDueReminders() {
  const now = Date.now();

  state.tasks.forEach((task) => {
    if (
      task.status === "delivered" ||
      task.status === "not_done" ||
      !task.dueAt ||
      task.reminderMinutes === null
    ) {
      return;
    }

    const reminderAt =
      task.dueAt.getTime() -
      task.reminderMinutes * 60 * 1000;

    const reminderKey =
      `${task.id}:${reminderAt}`;

    const isDue =
      reminderAt <= now &&
      now - reminderAt <= 10 * 60 * 1000;

    if (
      !isDue ||
      state.notifiedTaskKeys.has(reminderKey)
    ) {
      return;
    }

    state.notifiedTaskKeys.add(reminderKey);
    persistNotifiedTaskKeys();

    showToast(
      "Recordatorio de tarea",
      `${task.title} · ` +
      `${formatTaskDue(
        task.dueAt,
        task.hasExplicitTime
      )}`
    );

    if (
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      new Notification(
        "StudyTrack · Recordatorio",
        {
          body:
            `${task.title} — ` +
            `${task.subjectName}`,
          icon:
            "assets/images/logo-studytrack.png",
          tag: reminderKey
        }
      );
    }
  });
}

function persistNotifiedTaskKeys() {
  const values =
    Array.from(state.notifiedTaskKeys)
      .slice(-150);

  localStorage.setItem(
    "studytrack-notified-tasks",
    JSON.stringify(values)
  );
}

/* =========================================================
   NAVEGACIÓN Y POPOVERS
========================================================= */

function configureSidebar() {
  if (state.sidebarCollapsed) {
    elements.appShell.classList.add(
      "sidebar-is-collapsed"
    );
    elements.sidebarCollapse?.setAttribute(
      "aria-expanded",
      "false"
    );
  }

  elements.sidebarCollapse?.addEventListener(
    "click",
    () => {
      state.sidebarCollapsed =
        !state.sidebarCollapsed;

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
    }
  );
}

function configureDrawer() {
  elements.mobileMenuButton?.addEventListener(
    "click",
    openDrawer
  );

  elements.closeDrawerButton?.addEventListener(
    "click",
    closeDrawer
  );

  elements.drawerBackdrop?.addEventListener(
    "click",
    closeDrawer
  );
}

function openDrawer() {
  elements.drawerBackdrop.hidden = false;
  elements.mobileDrawer.classList.add("is-open");
  elements.mobileDrawer.setAttribute(
    "aria-hidden",
    "false"
  );
  elements.mobileMenuButton?.setAttribute(
    "aria-expanded",
    "true"
  );
  document.body.style.overflow = "hidden";
}

function closeDrawer() {
  elements.mobileDrawer.classList.remove("is-open");
  elements.mobileDrawer.setAttribute(
    "aria-hidden",
    "true"
  );
  elements.mobileMenuButton?.setAttribute(
    "aria-expanded",
    "false"
  );
  elements.drawerBackdrop.hidden = true;

  if (
    elements.taskModal.hidden &&
    elements.taskConfirmDialog.hidden &&
    elements.taskDetailsPanel
      .getAttribute("aria-hidden") === "true"
  ) {
    document.body.style.removeProperty("overflow");
  }
}

function configurePopovers() {
  elements.notificationButton?.addEventListener(
    "click",
    (event) => {
      event.stopPropagation();

      togglePopover(
        elements.notificationButton,
        elements.notificationPopover,
        elements.profileButton,
        elements.profilePopover
      );
    }
  );

  elements.profileButton?.addEventListener(
    "click",
    (event) => {
      event.stopPropagation();

      togglePopover(
        elements.profileButton,
        elements.profilePopover,
        elements.notificationButton,
        elements.notificationPopover
      );
    }
  );

  document
    .querySelectorAll("[data-close-popover]")
    .forEach((button) => {
      button.addEventListener(
        "click",
        closeAllPopovers
      );
    });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".popover-wrapper")) {
      closeAllPopovers();
    }
  });
}

function togglePopover(
  button,
  popover,
  otherButton,
  otherPopover
) {
  const willOpen = popover.hidden;

  if (
    otherPopover &&
    !otherPopover.hidden
  ) {
    otherPopover.hidden = true;
    otherButton?.setAttribute(
      "aria-expanded",
      "false"
    );
  }

  popover.hidden = !willOpen;
  button.setAttribute(
    "aria-expanded",
    String(willOpen)
  );
}

function closeAllPopovers() {
  [
    [
      elements.notificationButton,
      elements.notificationPopover
    ],
    [
      elements.profileButton,
      elements.profilePopover
    ]
  ].forEach(([button, popover]) => {
    if (popover) popover.hidden = true;
    button?.setAttribute(
      "aria-expanded",
      "false"
    );
  });
}

function configureComingSoonButtons() {
  document
    .querySelectorAll("[data-coming-soon]")
    .forEach((element) => {
      element.addEventListener("click", (event) => {
        event.preventDefault();
        closeDrawer();
        closeAllPopovers();

        showToast(
          `${element.dataset.comingSoon || "Esta función"} llegará pronto`,
          "La conectaremos en una siguiente fase de StudyTrack."
        );
      });
    });
}

function configureLogout() {
  elements.logoutButton?.addEventListener(
    "click",
    handleLogout
  );

  elements.drawerLogoutButton?.addEventListener(
    "click",
    handleLogout
  );
}

/* =========================================================
   UTILIDADES
========================================================= */

function normalizeTask(rawTask) {
  const status = normalizeStatus(rawTask.status);

  const dueAt = convertToDate(
    rawTask.dueAt ||
    rawTask.deadline ||
    rawTask.fechaLimite ||
    rawTask.fecha
  );

  const rawProgress =
    Number(rawTask.progress);

  const progress = Number.isFinite(rawProgress)
    ? Math.max(0, Math.min(100, rawProgress))
    : STATUS_CONFIG[status].progress;

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
    status,
    priority:
      normalizePriority(
        rawTask.priority ||
        rawTask.prioridad
      ),
    progress:
      status === "delivered"
        ? 100
        : progress,
    reminderMinutes:
      rawTask.reminderMinutes === null ||
      rawTask.reminderMinutes === undefined ||
      rawTask.reminderMinutes === ""
        ? null
        : Number(rawTask.reminderMinutes),
    dueAt,
    hasExplicitTime:
      rawTask.hasExplicitTime !== false,
    attachment:
      rawTask.attachment || null
  };
}

function normalizeStatus(status) {
  const normalized =
    String(status || "").toLowerCase();

  const aliases = {
    pendiente: "pending",
    pending: "pending",
    "en progreso": "in_progress",
    in_progress: "in_progress",
    progress: "in_progress",
    entregada: "delivered",
    entregado: "delivered",
    delivered: "delivered",
    completed: "delivered",
    done: "delivered",
    "no realizada": "not_done",
    not_done: "not_done",
    missed: "not_done"
  };

  return aliases[normalized] || "pending";
}

function normalizePriority(priority) {
  const normalized =
    String(priority || "").toLowerCase();

  if (["alta", "high"].includes(normalized)) {
    return "high";
  }

  if (["baja", "low"].includes(normalized)) {
    return "low";
  }

  return "medium";
}

function getSubject(subjectId) {
  return state.subjects.find(
    (subject) => subject.id === subjectId
  ) || null;
}

function isTaskOverdue(task) {
  return (
    task.dueAt &&
    task.dueAt.getTime() < Date.now() &&
    !["delivered", "not_done"]
      .includes(task.status)
  );
}

function combineDateAndTime(
  dateValue,
  timeValue
) {
  if (!dateValue) return null;

  const [year, month, day] =
    dateValue.split("-").map(Number);

  const [hours, minutes] =
    (timeValue || "23:59")
      .split(":")
      .map(Number);

  return new Date(
    year,
    month - 1,
    day,
    hours,
    minutes,
    0,
    0
  );
}

function convertToDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value;
  }

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function formatTaskDue(
  date,
  hasExplicitTime = true
) {
  return new Intl.DateTimeFormat(
    "es-MX",
    {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(hasExplicitTime
        ? {
            hour: "2-digit",
            minute: "2-digit"
          }
        : {})
    }
  ).format(date);
}

function formatInputDate(date) {
  const year = date.getFullYear();
  const month =
    String(date.getMonth() + 1)
      .padStart(2, "0");
  const day =
    String(date.getDate())
      .padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatInputTime(
  date,
  hasExplicitTime
) {
  if (!hasExplicitTime) return "";

  const hours =
    String(date.getHours())
      .padStart(2, "0");

  const minutes =
    String(date.getMinutes())
      .padStart(2, "0");

  return `${hours}:${minutes}`;
}

function formatReminder(minutes) {
  if (
    minutes === null ||
    minutes === undefined
  ) {
    return "Sin recordatorio";
  }

  const labels = {
    0: "A la hora de entrega",
    15: "15 minutos antes",
    30: "30 minutos antes",
    60: "1 hora antes",
    1440: "1 día antes"
  };

  return labels[minutes] ||
    `${minutes} minutos antes`;
}

function formatReminderMoment(task) {
  if (!task.dueAt) return "Sin fecha";

  return (
    `${formatReminder(task.reminderMinutes)} · ` +
    `${formatTaskDue(
      task.dueAt,
      task.hasExplicitTime
    )}`
  );
}

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";

  if (bytes < 1024 * 1024) {
    return `${Math.max(
      1,
      Math.round(bytes / 1024)
    )} KB`;
  }

  return `${
    (bytes / (1024 * 1024))
      .toFixed(1)
  } MB`;
}

function sanitizeFileName(name) {
  return String(name || "archivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
}

function getTimestamp(value) {
  if (!value) return 0;

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  const date = convertToDate(value);
  return date?.getTime() || 0;
}

function normalizeSpaces(value = "") {
  return String(value)
    .trim()
    .replace(/\s+/g, " ");
}

function getNameFromEmail(email = "") {
  const localPart =
    email.split("@")[0] || "Estudiante";

  return localPart
    .replace(/[._-]+/g, " ")
    .replace(
      /\b\w/g,
      (letter) => letter.toUpperCase()
    );
}

function createInitials(name) {
  const parts =
    normalizeSpaces(name)
      .split(" ")
      .filter(Boolean);

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    `${parts[0][0]}` +
    `${parts[parts.length - 1][0]}`
  ).toUpperCase();
}

function animateNumber(element, target) {
  if (!element) return;

  const finalValue = Number(target) || 0;
  const duration = 420;
  const startTime = performance.now();

  function update(now) {
    const progress = Math.min(
      (now - startTime) / duration,
      1
    );

    const eased =
      1 - Math.pow(1 - progress, 3);

    element.textContent =
      String(
        Math.round(finalValue * eased)
      );

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

function showTaskFormMessage(message) {
  elements.taskFormMessage.textContent =
    message;
  elements.taskFormMessage.hidden = false;
}

function clearTaskFormMessage() {
  elements.taskFormMessage.hidden = true;
  elements.taskFormMessage.textContent = "";
}

function showToast(title, message) {
  const toast =
    document.createElement("article");

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
  }, 4300);
}

function hideLoadingScreen() {
  if (!elements.loadingScreen) return;

  window.setTimeout(() => {
    elements.loadingScreen.classList.add(
      "is-hidden"
    );

    window.setTimeout(() => {
      elements.loadingScreen?.remove();
    }, 300);
  }, 180);
}

function getFirebaseErrorMessage(error) {
  const messages = {
    "permission-denied":
      "Firestore rechazó la operación. Agrega permisos para la colección tasks.",
    "firestore/permission-denied":
      "Firestore rechazó la operación. Agrega permisos para la colección tasks.",
    "cloudinary/invalid-file":
      "Selecciona una imagen o PDF válido.",
    "cloudinary/upload-failed":
      "Cloudinary rechazó el archivo. Revisa el preset, los formatos permitidos y la entrega de PDF.",
    "cloudinary/invalid-response":
      "Cloudinary respondió sin una URL válida.",
    "cloudinary/network-error":
      "No se pudo conectar con Cloudinary. Revisa tu conexión.",
    "cloudinary/upload-timeout":
      "Cloudinary tardó demasiado en responder. Inténtalo nuevamente.",
    "cloudinary/upload-cancelled":
      "La carga del archivo fue cancelada.",
    unavailable:
      "Firebase no está disponible temporalmente."
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

window.addEventListener(
  "beforeunload",
  cleanupSubscriptions
);
