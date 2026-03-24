import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signOut,
  updatePassword,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  firebaseAuth,
  firebaseConfig,
  firebaseDb,
  hasValidFirebaseConfig,
} from "./firebase-config.js";

if (window.location.protocol === "file:") {
  alert("Esta aplicación requiere ejecutarse en un servidor local (ej: Live Server o http://localhost).");
}

const WORKDAY_START_HOUR = 9;
const WORKDAY_END_HOUR = 19;
const SLOT_MINUTES = 30;
const OCCUPIED_STATUSES = ["activo", "bloqueado"];
const TIME_SLOTS = buildTimeSlots(WORKDAY_START_HOUR, WORKDAY_END_HOUR, SLOT_MINUTES);
let adminDashboardReady = false;
const PRIMARY_ADMIN_EMAIL = "admin@tudominio.com";
const SECONDARY_ADMIN_APP_NAME = "nails-admin-user-manager";

const page = document.body.dataset.page || "client";
window.nailsAppointmentsRuntimeReady = true;

if (!hasValidFirebaseConfig) {
  showFirebaseWarning();
  if (page === "admin") {
    initAdmin(null, null);
  } else {
    initClient(null);
  }
} else {
  if (page === "admin") {
    initAdmin(firebaseDb, firebaseAuth);
  } else {
    initClient(firebaseDb);
  }
}

function buildTimeSlots(startHour, endHour, stepMinutes) {
  const slots = [];
  for (let hour = startHour; hour < endHour; hour += 1) {
    for (let minute = 0; minute < 60; minute += stepMinutes) {
      const hh = String(hour).padStart(2, "0");
      const mm = String(minute).padStart(2, "0");
      slots.push(`${hh}:${mm}`);
    }
  }
  return slots;
}

function showFirebaseWarning() {
  const warning = document.getElementById("firebaseWarning");
  if (warning) {
    warning.hidden = false;
  }

  const bookingFeedback = document.getElementById("bookingFeedback");
  if (bookingFeedback) {
    setFeedback(bookingFeedback, "Configuración pendiente de Firebase en firebase-config.js.", "error");
  }
}

function createSlotId(date, time) {
  return `${date}_${time.replace(":", "-")}`;
}

function setFeedback(element, text, type = "success") {
  if (!element) {
    return;
  }
  element.textContent = text;
  element.classList.remove("is-error", "is-success");
  element.classList.add(type === "error" ? "is-error" : "is-success");
}

function clearFeedback(element) {
  if (!element) {
    return;
  }
  element.textContent = "";
  element.classList.remove("is-error", "is-success");
}

function getBookingModalElements() {
  return {
    modal: document.getElementById("bookingConfirmModal"),
    closeBtn: document.getElementById("bookingModalCloseBtn"),
    whatsappBtn: document.getElementById("bookingModalWhatsapp"),
    name: document.getElementById("bookingModalName"),
    service: document.getElementById("bookingModalService"),
    date: document.getElementById("bookingModalDate"),
    time: document.getElementById("bookingModalTime"),
  };
}

function formatBookingDateForModal(dateValue) {
  if (!dateValue) {
    return "-";
  }

  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateValue;
  }

  return parsed.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function cerrarModalTurno() {
  const { modal } = getBookingModalElements();
  if (!modal) {
    return;
  }

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  window.setTimeout(() => {
    modal.hidden = true;
  }, 280);
  document.body.classList.remove("booking-modal-open");
}

function abrirModalTurno(data) {
  const { modal, closeBtn, whatsappBtn, name, service, date, time } = getBookingModalElements();
  if (!modal || !closeBtn || !whatsappBtn || !name || !service || !date || !time) {
    console.error("Modal de confirmación no disponible en el DOM.");
    return;
  }

  name.textContent = data?.nombre || "-";
  service.textContent = data?.servicio || "-";
  date.textContent = formatBookingDateForModal(data?.fecha || "");
  time.textContent = data?.hora || "-";

  const whatsappText = `Hola, reservé un turno. Nombre: ${data?.nombre || "-"}. Servicio: ${data?.servicio || "-"}. Fecha: ${data?.fecha || "-"}. Hora: ${data?.hora || "-"}.`;
  whatsappBtn.href = `https://wa.me/2657603395?text=${encodeURIComponent(whatsappText)}`;

  if (modal.dataset.eventsBound !== "1") {
    closeBtn.addEventListener("click", cerrarModalTurno);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        cerrarModalTurno();
      }
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal.classList.contains("is-open")) {
        cerrarModalTurno();
      }
    });
    modal.dataset.eventsBound = "1";
  }

  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("booking-modal-open");
  window.requestAnimationFrame(() => {
    modal.classList.add("is-open");
  });
}

function setMinToday(input) {
  if (!input) {
    return;
  }
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  input.min = `${yyyy}-${mm}-${dd}`;
}

async function getOccupiedTimesByDate(db, date) {
  if (!date) {
    return new Set();
  }

  const ref = collection(db, "appointments");
  const q = query(ref, where("date", "==", date));
  const snap = await getDocs(q);
  const occupied = new Set();

  snap.forEach((item) => {
    const data = item.data();
    if (OCCUPIED_STATUSES.includes(data.status)) {
      occupied.add(data.time);
    }
  });

  return occupied;
}

async function initClient(db) {
  const form = document.getElementById("bookingForm");
  if (!form) {
    console.error("Elemento no encontrado: #bookingForm");
    return;
  }

  const nameInput = document.getElementById("clientName");
  const serviceSelect = document.getElementById("serviceSelect");
  const dateInput = document.getElementById("bookingDate");
  const timeSelect = document.getElementById("bookingTime");
  const feedback = document.getElementById("bookingFeedback");

  if (!dateInput || !timeSelect || !feedback || !nameInput || !serviceSelect) {
    if (!nameInput) {
      console.error("Elemento no encontrado: #clientName");
    }
    if (!serviceSelect) {
      console.error("Elemento no encontrado: #serviceSelect");
    }
    if (!dateInput) {
      console.error("Elemento no encontrado: #bookingDate");
    }
    if (!timeSelect) {
      console.error("Elemento no encontrado: #bookingTime");
    }
    if (!feedback) {
      console.error("Elemento no encontrado: #bookingFeedback");
    }
    return;
  }

  setMinToday(dateInput);

  const updateTimesBySelectedDate = async () => {
    clearFeedback(feedback);
    const selectedDate = dateInput.value.trim();
    console.log("Fecha seleccionada:", selectedDate);
    await renderTimeOptions(db, selectedDate, timeSelect);
  };

  dateInput.addEventListener("change", updateTimesBySelectedDate);
  dateInput.addEventListener("input", updateTimesBySelectedDate);
  dateInput.addEventListener("blur", updateTimesBySelectedDate);
  window.nailsHoursListenerBound = true;
  console.log("Listeners de fecha activos en #bookingDate");

  if (dateInput.value) {
    await updateTimesBySelectedDate();
  } else {
    renderEmptyTimes(timeSelect);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFeedback(feedback);

    const name = nameInput.value.trim();
    const service = serviceSelect.value;
    const date = dateInput.value;
    const time = timeSelect.value;

    if (!name || !service || !date || !time) {
      setFeedback(feedback, "Completá todos los campos para reservar tu turno.", "error");
      return;
    }

    if (!db) {
      setFeedback(feedback, "No se puede confirmar el turno: falta conexión/configuración de Firebase.", "error");
      console.warn("Firebase/Firestore no disponible al intentar reservar.");
      return;
    }

    const slotId = createSlotId(date, time);

    const slotRef = doc(db, "appointments", slotId);

    try {
      await runTransaction(db, async (transaction) => {
        const current = await transaction.get(slotRef);

        if (current.exists()) {
          const data = current.data();
          if (OCCUPIED_STATUSES.includes(data.status)) {
            throw new Error("occupied-slot");
          }
        }

        transaction.set(slotRef, {
          id: slotId,
          name,
          service,
          date,
          time,
          status: "activo",
          blocked: false,
          source: "web",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      setFeedback(
        feedback,
        "Turno reservado con éxito. Si querés, podés confirmar por WhatsApp para una respuesta más rápida.",
        "success"
      );
      abrirModalTurno({
        nombre: name,
        servicio: service,
        fecha: date,
        hora: time,
      });

      form.reset();
      renderEmptyTimes(timeSelect);
    } catch (error) {
      if (error.message === "occupied-slot") {
        setFeedback(feedback, "Ese horario ya no está disponible. Elegí otro.", "error");
        await renderTimeOptions(db, date, timeSelect);
        return;
      }

      setFeedback(feedback, "No se pudo completar la reserva. Intentá nuevamente.", "error");
    }
  });

  window.nailsBookingSubmitBound = true;
}

function renderEmptyTimes(select) {
  if (!select) {
    console.error("Elemento no encontrado para renderEmptyTimes");
    return;
  }

  select.innerHTML = "";
  const option = document.createElement("option");
  option.value = "";
  option.textContent = "Primero elegí una fecha";
  select.appendChild(option);
}

async function renderTimeOptions(db, date, select) {
  if (!select) {
    console.error("Elemento no encontrado para renderTimeOptions");
    return;
  }

  select.innerHTML = "";

  if (!date) {
    renderEmptyTimes(select);
    return;
  }

  let occupied = new Set();
  try {
    if (!db) {
      console.warn("Firebase/Firestore no disponible para consultar disponibilidad de horarios.");
      occupied = new Set();
    } else {
      occupied = await getOccupiedTimesByDate(db, date);
    }
  } catch {
    occupied = new Set();
  }

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Seleccioná un horario";
  select.appendChild(defaultOption);

  TIME_SLOTS.forEach((time) => {
    const option = document.createElement("option");
    option.value = time;
    option.textContent = occupied.has(time) ? `${time} (ocupado)` : time;
    option.disabled = occupied.has(time);
    select.appendChild(option);
  });

  const availableCount = TIME_SLOTS.filter((time) => !occupied.has(time)).length;
  if (availableCount === 0) {
    const noSlotsOption = document.createElement("option");
    noSlotsOption.value = "";
    noSlotsOption.textContent = "No hay horarios disponibles";
    noSlotsOption.disabled = true;
    select.appendChild(noSlotsOption);
  }
}

async function initAdmin(db, auth) {
  const dashboard = document.getElementById("adminDashboard");
  const section = document.getElementById("appointmentsSection");

  if (!dashboard || !section) {
    return;
  }

  if (!auth || !db) {
    window.location.href = "login.html?config=1";
    return;
  }

  if (!auth.currentUser) {
    window.location.href = "login.html?unauthorized=1";
    return;
  }

  dashboard.hidden = false;
  section.hidden = false;
  await setupAdminDashboard(db, auth);

  onAuthStateChanged(auth, async (user) => {
    const isLogged = Boolean(user);
    dashboard.hidden = !isLogged;
    section.hidden = !isLogged;

    if (!isLogged) {
      window.location.href = "login.html?unauthorized=1";
      return;
    }
  });
}

async function setupAdminDashboard(db, auth) {
  if (adminDashboardReady) {
    return;
  }
  adminDashboardReady = true;

  const filterDate = document.getElementById("adminFilterDate");
  const refreshBtn = document.getElementById("refreshAppointments");
  const clearBtn = document.getElementById("clearFilter");
  const tableBody = document.getElementById("appointmentsBody");
  const stats = document.getElementById("adminStats");
  const blockForm = document.getElementById("blockSlotForm");
  const blockDate = document.getElementById("blockDate");
  const blockTime = document.getElementById("blockTime");
  const blockFeedback = document.getElementById("blockFeedback");
  const calendarGrid = document.getElementById("adminCalendar");
  const calendarTitle = document.getElementById("calendarTitle");
  const calendarPrev = document.getElementById("calendarPrev");
  const calendarNext = document.getElementById("calendarNext");

  if (!tableBody || !filterDate || !refreshBtn || !clearBtn || !blockForm || !blockDate || !blockTime) {
    return;
  }

  let currentMonth = new Date();
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);

  setMinToday(filterDate);
  setMinToday(blockDate);
  mountTimeSelect(blockTime);
  await setupUserManagementPanel(db, auth);

  const load = async () => {
    const allAppointments = await fetchAppointments(db, "");
    const listedAppointments = filterDate.value
      ? allAppointments.filter((item) => item.date === filterDate.value)
      : allAppointments;

    renderAppointments(tableBody, listedAppointments);
    renderStats(stats, allAppointments);
    renderAdminCalendar(
      calendarGrid,
      calendarTitle,
      allAppointments,
      currentMonth,
      async (clickedDate) => {
        // Si se hace clic en el día ya filtrado, limpiar filtro
        if (filterDate.value === clickedDate) {
          filterDate.value = "";
        } else {
          filterDate.value = clickedDate;
        }
        await load();
      },
      filterDate.value || null
    );
  };

  await load();

  refreshBtn.addEventListener("click", load);

  clearBtn.addEventListener("click", async () => {
    filterDate.value = "";
    await load();
  });

  filterDate.addEventListener("change", load);

  if (calendarPrev) {
    calendarPrev.addEventListener("click", async () => {
      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
      await load();
    });
  }

  if (calendarNext) {
    calendarNext.addEventListener("click", async () => {
      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
      await load();
    });
  }

  tableBody.addEventListener("click", async (event) => {
    const button = event.target;
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const id = button.dataset.id;
    const action = button.dataset.action;
    if (!id || !action) {
      return;
    }

    try {
      if (action === "delete") {
        await deleteDoc(doc(db, "appointments", id));
      } else if (action === "cancel") {
        await updateDoc(doc(db, "appointments", id), {
          status: "cancelado",
          updatedAt: serverTimestamp(),
        });
      } else if (action === "complete") {
        await updateDoc(doc(db, "appointments", id), {
          status: "completado",
          updatedAt: serverTimestamp(),
        });
      } else if (action === "activate") {
        await updateDoc(doc(db, "appointments", id), {
          status: "activo",
          updatedAt: serverTimestamp(),
        });
      }

      await load();
    } catch {
      // noop
    }
  });

  blockForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFeedback(blockFeedback);

    const date = blockDate.value;
    const time = blockTime.value;

    if (!date || !time) {
      setFeedback(blockFeedback, "Elegí fecha y hora para bloquear.", "error");
      return;
    }

    const slotId = createSlotId(date, time);

    const slotRef = doc(db, "appointments", slotId);

    try {
      await runTransaction(db, async (transaction) => {
        const current = await transaction.get(slotRef);
        if (current.exists()) {
          const data = current.data();
          if (OCCUPIED_STATUSES.includes(data.status)) {
            throw new Error("occupied-slot");
          }
        }

        transaction.set(slotRef, {
          id: slotId,
          name: "Bloqueado",
          service: "Bloqueo manual",
          date,
          time,
          status: "bloqueado",
          blocked: true,
          source: "admin",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      setFeedback(blockFeedback, "Horario bloqueado correctamente.", "success");
      blockForm.reset();
      await load();
    } catch (error) {
      if (error.message === "occupied-slot") {
        setFeedback(blockFeedback, "Ese horario ya está ocupado o bloqueado.", "error");
        return;
      }
      setFeedback(blockFeedback, "No se pudo bloquear el horario.", "error");
    }
  });
}

function mapAuthError(code) {
  if (!code) {
    return "Ocurrió un error inesperado.";
  }

  const errors = {
    "auth/email-already-in-use": "Ese email ya está registrado.",
    "auth/invalid-email": "El email no es válido.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/requires-recent-login": "Por seguridad, cerrá sesión e iniciá nuevamente para realizar esta acción.",
    "auth/user-not-found": "No se encontró un usuario con ese email.",
  };

  return errors[code] || "No se pudo completar la operación.";
}

function formatFirestoreDate(value) {
  if (!value) {
    return "-";
  }

  if (typeof value === "number") {
    return new Date(value).toLocaleString("es-AR");
  }

  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleString("es-AR");
  }

  return "-";
}

async function isSuperAdmin(db, user) {
  if (!db || !user) {
    return false;
  }

  if (user.email && user.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
    return true;
  }

  try {
    const adminDoc = await getDoc(doc(db, "adminUsers", user.uid));
    if (adminDoc.exists() && adminDoc.data()?.role === "admin") {
      return true;
    }
  } catch {
    // noop
  }

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists() && userDoc.data()?.role === "admin") {
      return true;
    }
  } catch {
    // noop
  }

  return false;
}

async function setupUserManagementPanel(db, auth) {
  const card = document.getElementById("userManagementCard");
  const accessNote = document.getElementById("userAccessNote");
  const feedback = document.getElementById("userFeedback");
  const loader = document.getElementById("userLoader");
  const tableBody = document.getElementById("usersTableBody");
  const createForm = document.getElementById("createUserForm");
  const resetForm = document.getElementById("resetPasswordForm");
  const changeForm = document.getElementById("changePasswordForm");

  if (!card || !tableBody || !createForm || !resetForm || !changeForm || !feedback || !loader || !accessNote) {
    return;
  }

  if (!db || !auth?.currentUser) {
    card.hidden = true;
    return;
  }

  const canManageUsers = await isSuperAdmin(db, auth.currentUser);
  if (!canManageUsers) {
    card.hidden = true;
    return;
  }

  card.hidden = false;
  accessNote.textContent = `Sesión: ${auth.currentUser.email || "admin"} (admin)`;

  const setLoading = (isLoading) => {
    loader.hidden = !isLoading;
  };

  const renderUsers = async () => {
    setLoading(true);
    tableBody.innerHTML = "";

    try {
      const snap = await getDocs(query(collection(db, "users")));
      const users = [];

      snap.forEach((item) => {
        const data = item.data() || {};
        users.push({
          uid: item.id,
          email: data.email || "(sin email)",
          role: data.role || "staff",
          createdAt: data.createdAt || null,
        });
      });

      users.sort((a, b) => a.email.localeCompare(b.email));

      if (users.length === 0) {
        const row = document.createElement("tr");
        row.innerHTML = '<td colspan="5">Todavía no hay usuarios registrados en la colección users.</td>';
        tableBody.appendChild(row);
        return;
      }

      users.forEach((userItem) => {
        const row = document.createElement("tr");

        const emailCell = document.createElement("td");
        emailCell.textContent = userItem.email;

        const roleCell = document.createElement("td");
        roleCell.textContent = userItem.role;

        const createdCell = document.createElement("td");
        createdCell.textContent = formatFirestoreDate(userItem.createdAt);

        const resetCell = document.createElement("td");
        const resetBtn = document.createElement("button");
        resetBtn.type = "button";
        resetBtn.className = "btn btn-secondary user-reset-btn";
        resetBtn.dataset.email = userItem.email;
        resetBtn.textContent = "Resetear";
        resetCell.appendChild(resetBtn);

        const deleteCell = document.createElement("td");
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn btn-secondary user-delete-btn";
        deleteBtn.dataset.uid = userItem.uid;
        deleteBtn.textContent = "Eliminar";
        deleteCell.appendChild(deleteBtn);

        row.append(emailCell, roleCell, createdCell, resetCell, deleteCell);
        tableBody.appendChild(row);
      });
    } catch {
      setFeedback(feedback, "No se pudo cargar la lista de usuarios.", "error");
    } finally {
      setLoading(false);
    }
  };

  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFeedback(feedback);

    const email = document.getElementById("newUserEmail")?.value.trim().toLowerCase() || "";
    const password = document.getElementById("newUserPassword")?.value || "";

    if (!email || !password) {
      setFeedback(feedback, "Completá email y contraseña para crear el usuario.", "error");
      return;
    }

    if (password.length < 6) {
      setFeedback(feedback, "La contraseña debe tener al menos 6 caracteres.", "error");
      return;
    }

    setLoading(true);

    try {
      const secondaryApp = getApps().find((item) => item.name === SECONDARY_ADMIN_APP_NAME)
        || initializeApp(firebaseConfig, SECONDARY_ADMIN_APP_NAME);
      const secondaryAuth = getAuth(secondaryApp);

      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);

      await setDoc(doc(db, "users", userCredential.user.uid), {
        uid: userCredential.user.uid,
        email,
        role: "staff",
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser.uid,
      });

      await signOut(secondaryAuth);
      setFeedback(feedback, "Usuario creado correctamente.", "success");
      createForm.reset();
      await renderUsers();
    } catch (error) {
      setFeedback(feedback, mapAuthError(error?.code), "error");
    } finally {
      setLoading(false);
    }
  });

  resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFeedback(feedback);

    const email = document.getElementById("resetEmail")?.value.trim().toLowerCase() || "";
    if (!email) {
      setFeedback(feedback, "Ingresá un email para resetear la contraseña.", "error");
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setFeedback(feedback, "Email de reseteo enviado correctamente.", "success");
      resetForm.reset();
    } catch (error) {
      setFeedback(feedback, mapAuthError(error?.code), "error");
    } finally {
      setLoading(false);
    }
  });

  changeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFeedback(feedback);

    const password = document.getElementById("myNewPassword")?.value || "";
    const confirm = document.getElementById("myConfirmPassword")?.value || "";

    if (!password || !confirm) {
      setFeedback(feedback, "Completá ambos campos para cambiar tu contraseña.", "error");
      return;
    }

    if (password.length < 6) {
      setFeedback(feedback, "La nueva contraseña debe tener al menos 6 caracteres.", "error");
      return;
    }

    if (password !== confirm) {
      setFeedback(feedback, "Las contraseñas no coinciden.", "error");
      return;
    }

    setLoading(true);
    try {
      await updatePassword(auth.currentUser, password);
      setFeedback(feedback, "Contraseña actualizada correctamente.", "success");
      changeForm.reset();
    } catch (error) {
      setFeedback(feedback, mapAuthError(error?.code), "error");
    } finally {
      setLoading(false);
    }
  });

  tableBody.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    if (target.classList.contains("user-reset-btn")) {
      const email = target.dataset.email || "";
      if (!email) {
        return;
      }

      setLoading(true);
      clearFeedback(feedback);

      try {
        await sendPasswordResetEmail(auth, email);
        setFeedback(feedback, `Email de reseteo enviado a ${email}.`, "success");
      } catch (error) {
        setFeedback(feedback, mapAuthError(error?.code), "error");
      } finally {
        setLoading(false);
      }

      return;
    }

    if (target.classList.contains("user-delete-btn")) {
      const uid = target.dataset.uid || "";
      if (!uid) {
        return;
      }

      const ok = window.confirm(
        "¿Querés eliminar este usuario? En cliente web solo se elimina del listado local de usuarios, no de Firebase Auth."
      );

      if (!ok) {
        return;
      }

      setLoading(true);
      clearFeedback(feedback);

      try {
        await deleteDoc(doc(db, "users", uid));
        setFeedback(
          feedback,
          "Usuario eliminado de la colección users. Para borrar la cuenta en Auth necesitás Cloud Function + Admin SDK.",
          "success"
        );
        await renderUsers();
      } catch {
        setFeedback(feedback, "No se pudo eliminar el usuario.", "error");
      } finally {
        setLoading(false);
      }
    }
  });

  await renderUsers();
}

function mountTimeSelect(select) {
  select.innerHTML = "";
  const first = document.createElement("option");
  first.value = "";
  first.textContent = "Seleccioná hora";
  select.appendChild(first);

  TIME_SLOTS.forEach((time) => {
    const option = document.createElement("option");
    option.value = time;
    option.textContent = time;
    select.appendChild(option);
  });
}

async function fetchAppointments(db, dateFilter) {
  const ref = collection(db, "appointments");
  const q = dateFilter ? query(ref, where("date", "==", dateFilter)) : query(ref);
  const snap = await getDocs(q);

  const data = [];
  snap.forEach((item) => {
    data.push(item.data());
  });

  data.sort((a, b) => {
    const byDate = (a.date || "").localeCompare(b.date || "");
    if (byDate !== 0) {
      return byDate;
    }
    return (a.time || "").localeCompare(b.time || "");
  });

  return data;
}

function renderAppointments(tbody, appointments) {
  tbody.innerHTML = "";

  if (appointments.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="6">No hay turnos para mostrar.</td>';
    tbody.appendChild(row);
    return;
  }

  appointments.forEach((appointment) => {
    const row = document.createElement("tr");
    const isBlocked = appointment.status === "bloqueado";

    const status = normalizeStatus(appointment.status);
    const id = String(appointment.id || "");

    const nameCell = document.createElement("td");
    nameCell.textContent = appointment.name || "-";

    const serviceCell = document.createElement("td");
    serviceCell.textContent = appointment.service || "-";

    const dateCell = document.createElement("td");
    dateCell.textContent = appointment.date || "-";

    const timeCell = document.createElement("td");
    timeCell.textContent = appointment.time || "-";

    const statusCell = document.createElement("td");
    const statusPill = document.createElement("span");
    statusPill.className = `status-pill status-${status}`;
    statusPill.textContent = status;
    statusCell.appendChild(statusPill);

    const actionsCell = document.createElement("td");
    actionsCell.className = "action-cell";

    const appendActionButton = (action, label) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.action = action;
      button.dataset.id = id;
      button.textContent = label;
      actionsCell.appendChild(button);
    };

    if (!isBlocked) {
      appendActionButton("complete", "Completar");
      appendActionButton("cancel", "Cancelar");
    } else {
      appendActionButton("activate", "Liberar");
    }
    appendActionButton("delete", "Eliminar");

    row.append(nameCell, serviceCell, dateCell, timeCell, statusCell, actionsCell);

    tbody.appendChild(row);
  });
}

function normalizeStatus(value) {
  const status = String(value || "activo").toLowerCase();
  const allowed = new Set(["activo", "bloqueado", "completado", "cancelado"]);
  return allowed.has(status) ? status : "activo";
}

function renderStats(container, appointments) {
  if (!container) {
    return;
  }

  const active = appointments.filter((item) => item.status === "activo").length;
  const blocked = appointments.filter((item) => item.status === "bloqueado").length;
  const completed = appointments.filter((item) => item.status === "completado").length;
  const canceled = appointments.filter((item) => item.status === "cancelado").length;

  container.textContent = "";

  const values = [
    `Total: ${appointments.length}`,
    `Activos: ${active}`,
    `Bloqueados: ${blocked}`,
    `Completados: ${completed}`,
    `Cancelados: ${canceled}`,
  ];

  values.forEach((item) => {
    const stat = document.createElement("span");
    stat.textContent = item;
    container.appendChild(stat);
  });
}

function renderAdminCalendar(grid, title, appointments, monthDate, onSelectDate, selectedDate) {
  if (!grid || !title) {
    return;
  }

  const TOTAL_SLOTS = TIME_SLOTS.length; // 20 slots por día

  const monthNames = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const weekNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  title.textContent = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDay.getDay() + 6) % 7;

  // Contar turnos activos y bloqueos por fecha
  const byDate = appointments.reduce((acc, item) => {
    const key = item.date || "";
    if (!key) {
      return acc;
    }

    if (!acc[key]) {
      acc[key] = { turns: 0, blocked: 0 };
    }

    if (item.status === "bloqueado") {
      acc[key].blocked += 1;
    } else if (OCCUPIED_STATUSES.includes(item.status)) {
      acc[key].turns += 1;
    }

    return acc;
  }, {});

  // Animación de entrada al cambiar mes
  grid.classList.remove("cal-animating");
  // Forzar reflow para reiniciar la animación
  void grid.offsetWidth;
  grid.innerHTML = "";
  grid.classList.add("cal-animating");

  weekNames.forEach((label) => {
    const head = document.createElement("div");
    head.className = "calendar-weekday";
    head.textContent = label;
    head.setAttribute("aria-hidden", "true");
    grid.appendChild(head);
  });

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;

  for (let i = 0; i < startOffset; i += 1) {
    const empty = document.createElement("div");
    empty.className = "calendar-day empty";
    empty.setAttribute("aria-hidden", "true");
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const info = byDate[key] || { turns: 0, blocked: 0 };
    const occupied = info.turns + info.blocked;
    const freeSlots = Math.max(0, TOTAL_SLOTS - occupied);
    const isFull = occupied >= TOTAL_SLOTS;

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "calendar-day is-clickable";
    cell.dataset.date = key;

    // Lógica de colores por disponibilidad
    if (isFull) {
      // Rojo intenso: completamente ocupado
      cell.classList.add("day-full");
    } else if (info.blocked > 0 && info.turns === 0) {
      // Rojo: solo bloqueos manuales
      cell.classList.add("has-bloqueos");
    } else if (info.turns > 0 && info.blocked === 0) {
      // Verde: hay turnos y aún quedan slots libres
      cell.classList.add("has-turnos");
    } else if (info.turns > 0 && info.blocked > 0) {
      // Gradiente: mezcla de turnos y bloqueos, pero no lleno
      cell.classList.add("has-turnos", "has-bloqueos");
    }

    if (key === todayKey) {
      cell.classList.add("today");
    }

    if (selectedDate && key === selectedDate) {
      cell.classList.add("cal-selected");
    }

    // Texto informativo bajo el número
    let metaText;
    if (isFull) {
      metaText = "Completo";
    } else if (occupied === 0) {
      metaText = `${freeSlots} libres`;
    } else {
      metaText = `${freeSlots} libre${freeSlots !== 1 ? "s" : ""}`;
    }

    // Construir tooltip detallado
    const tooltipParts = [];
    if (info.turns > 0) {
      tooltipParts.push(`${info.turns} turno${info.turns !== 1 ? "s" : ""}`);
    }
    if (info.blocked > 0) {
      tooltipParts.push(`${info.blocked} bloqueo${info.blocked !== 1 ? "s" : ""}`);
    }
    if (freeSlots > 0) {
      tooltipParts.push(`${freeSlots} slot${freeSlots !== 1 ? "s" : ""} libre${freeSlots !== 1 ? "s" : ""}`);
    }
    const tooltipText = tooltipParts.length > 0 ? tooltipParts.join(" · ") : "Sin actividad";

    cell.innerHTML = `<span class="day-number">${day}</span><span class="day-meta">${metaText}</span>`;
    cell.setAttribute("data-tooltip", tooltipText);
    cell.setAttribute("aria-label", `${key}: ${tooltipText}`);

    cell.addEventListener("click", async () => {
      if (typeof onSelectDate === "function") {
        await onSelectDate(key);
      }
    });

    grid.appendChild(cell);
  }
}

window.nailsAppointments = {
  logoutAdmin: async () => {
    if (firebaseAuth) {
      await signOut(firebaseAuth);
    }
  },
};
