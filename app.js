import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const ENABLE_ADMIN_AUTH = false;
const LOCAL_ADMIN_CREDENTIALS_KEY = "nailsAdminCredentials";
const LOCAL_ADMIN_SESSION_KEY = "nailsAdminSession";
const LOCAL_APPOINTMENTS_KEY = "nailsLocalAppointments";
const DEFAULT_LOCAL_ADMIN = { username: "admin", password: "admin" };
const WORKDAY_START_HOUR = 9;
const WORKDAY_END_HOUR = 19;
const SLOT_MINUTES = 30;
const OCCUPIED_STATUSES = ["activo", "bloqueado"];
const TIME_SLOTS = buildTimeSlots(WORKDAY_START_HOUR, WORKDAY_END_HOUR, SLOT_MINUTES);
let adminDashboardReady = false;

// Reemplaza con tu config real de Firebase.
const firebaseConfig = {
  apiKey: "REEMPLAZAR_API_KEY",
  authDomain: "REEMPLAZAR_AUTH_DOMAIN",
  projectId: "REEMPLAZAR_PROJECT_ID",
  storageBucket: "REEMPLAZAR_STORAGE_BUCKET",
  messagingSenderId: "REEMPLAZAR_MESSAGING_SENDER_ID",
  appId: "REEMPLAZAR_APP_ID",
};

const page = document.body.dataset.page || "client";
window.nailsAppointmentsRuntimeReady = true;
const hasValidFirebaseConfig = !Object.values(firebaseConfig).some((value) =>
  String(value).includes("REEMPLAZAR_")
);

if (!hasValidFirebaseConfig) {
  showFirebaseWarning();
  if (page === "admin") {
    initAdmin(null, null);
  } else {
    initClient(null);
  }
} else {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);

  if (page === "admin") {
    initAdmin(db, auth);
  } else {
    initClient(db);
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
    setFeedback(bookingFeedback, "Configuración pendiente de Firebase en app.js.", "error");
  }
}

function getLocalAdminCredentials() {
  try {
    const raw = localStorage.getItem(LOCAL_ADMIN_CREDENTIALS_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_ADMIN_CREDENTIALS_KEY, JSON.stringify(DEFAULT_LOCAL_ADMIN));
      return DEFAULT_LOCAL_ADMIN;
    }

    const parsed = JSON.parse(raw);
    if (!parsed.username || !parsed.password) {
      localStorage.setItem(LOCAL_ADMIN_CREDENTIALS_KEY, JSON.stringify(DEFAULT_LOCAL_ADMIN));
      return DEFAULT_LOCAL_ADMIN;
    }

    return { username: parsed.username, password: parsed.password };
  } catch {
    localStorage.setItem(LOCAL_ADMIN_CREDENTIALS_KEY, JSON.stringify(DEFAULT_LOCAL_ADMIN));
    return DEFAULT_LOCAL_ADMIN;
  }
}

function saveLocalAdminCredentials(credentials) {
  localStorage.setItem(LOCAL_ADMIN_CREDENTIALS_KEY, JSON.stringify(credentials));
}

function isLocalAdminLoggedIn() {
  return sessionStorage.getItem(LOCAL_ADMIN_SESSION_KEY) === "1";
}

function setLocalAdminLoggedIn(isLogged) {
  if (isLogged) {
    sessionStorage.setItem(LOCAL_ADMIN_SESSION_KEY, "1");
  } else {
    sessionStorage.removeItem(LOCAL_ADMIN_SESSION_KEY);
  }
}

function toggleAdminVisibility(isLogged) {
  const dashboard = document.getElementById("adminDashboard");
  const section = document.getElementById("appointmentsSection");
  const loginCard = document.getElementById("adminLogin");
  const changeCard = document.getElementById("adminPasswordCard");

  if (dashboard) {
    dashboard.hidden = !isLogged;
  }
  if (section) {
    section.hidden = !isLogged;
  }
  if (loginCard) {
    loginCard.hidden = isLogged;
  }
  if (changeCard) {
    changeCard.hidden = !isLogged;
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

function showBookingConfirmedDialog() {
  window.alert("Turno confirmado. Te esperamos en Nails By Pao.");
}

function getLocalAppointments() {
  try {
    const raw = localStorage.getItem(LOCAL_APPOINTMENTS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setLocalAppointments(items) {
  try {
    localStorage.setItem(LOCAL_APPOINTMENTS_KEY, JSON.stringify(items));
  } catch {
    // noop
  }
}

function upsertLocalAppointment(appointment) {
  const list = getLocalAppointments();
  const index = list.findIndex((item) => item.id === appointment.id);
  if (index === -1) {
    list.push(appointment);
  } else {
    list[index] = { ...list[index], ...appointment };
  }
  setLocalAppointments(list);
}

function getLocalOccupiedTimesByDate(date) {
  const occupied = new Set();
  getLocalAppointments().forEach((item) => {
    if (item.date === date && OCCUPIED_STATUSES.includes(item.status)) {
      occupied.add(item.time);
    }
  });
  return occupied;
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

  if (!db) {
    return getLocalOccupiedTimesByDate(date);
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
    return;
  }

  const nameInput = document.getElementById("clientName");
  const serviceSelect = document.getElementById("serviceSelect");
  const dateInput = document.getElementById("bookingDate");
  const timeSelect = document.getElementById("bookingTime");
  const feedback = document.getElementById("bookingFeedback");

  if (!dateInput || !timeSelect || !feedback || !nameInput || !serviceSelect) {
    return;
  }

  setMinToday(dateInput);

  const updateTimesBySelectedDate = async () => {
    clearFeedback(feedback);
    const selectedDate = dateInput.value.trim();
    await renderTimeOptions(db, selectedDate, timeSelect);
  };

  dateInput.addEventListener("change", updateTimesBySelectedDate);
  dateInput.addEventListener("input", updateTimesBySelectedDate);
  dateInput.addEventListener("blur", updateTimesBySelectedDate);

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

    const slotId = createSlotId(date, time);

    if (!db) {
      const occupied = getLocalOccupiedTimesByDate(date);
      if (occupied.has(time)) {
        setFeedback(feedback, "Ese horario ya no está disponible. Elegí otro.", "error");
        await renderTimeOptions(db, date, timeSelect);
        return;
      }

      upsertLocalAppointment({
        id: slotId,
        name,
        service,
        date,
        time,
        status: "activo",
        blocked: false,
        source: "web-local",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      setFeedback(feedback, "Turno confirmado con éxito.", "success");
      showBookingConfirmedDialog();
      form.reset();
      renderEmptyTimes(timeSelect);
      return;
    }

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
      showBookingConfirmedDialog();

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
}

function renderEmptyTimes(select) {
  select.innerHTML = "";
  const option = document.createElement("option");
  option.value = "";
  option.textContent = "Primero elegí una fecha";
  select.appendChild(option);
}

async function renderTimeOptions(db, date, select) {
  select.innerHTML = "";

  if (!date) {
    renderEmptyTimes(select);
    return;
  }

  let occupied = new Set();
  try {
    occupied = await getOccupiedTimesByDate(db, date);
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

  if (!ENABLE_ADMIN_AUTH) {
    dashboard.hidden = false;
    section.hidden = false;
    await setupAdminDashboard(db);
    return;
  }

  const loginCard = document.getElementById("adminLogin");

  if (loginCard) {
    loginCard.hidden = false;
  }

  setupAdminLogin(auth);

  onAuthStateChanged(auth, async (user) => {
    const isLogged = Boolean(user);
    dashboard.hidden = !isLogged;
    section.hidden = !isLogged;
    if (loginCard) {
      loginCard.hidden = isLogged;
    }

    if (isLogged) {
      await setupAdminDashboard(db);
    }
  });
}

function setupLocalAdminAuth(db) {
  const form = document.getElementById("adminLoginForm");
  const feedback = document.getElementById("adminLoginFeedback");
  const usernameInput = document.getElementById("adminUsername");
  const passwordInput = document.getElementById("adminPassword");
  const logoutBtn = document.getElementById("adminLogoutBtn");
  const passwordForm = document.getElementById("adminPasswordForm");
  const passwordFeedback = document.getElementById("passwordFeedback");

  const openDashboard = async () => {
    toggleAdminVisibility(true);
    await setupAdminDashboard(db);
  };

  // Siempre solicitar credenciales al abrir admin.html.
  setLocalAdminLoggedIn(false);
  toggleAdminVisibility(false);

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFeedback(feedback);

      const username = usernameInput?.value.trim() || "";
      const password = passwordInput?.value || "";
      const saved = getLocalAdminCredentials();

      if (!username || !password) {
        setFeedback(feedback, "Ingresá usuario y contraseña.", "error");
        return;
      }

      if (username !== saved.username || password !== saved.password) {
        setFeedback(feedback, "Credenciales incorrectas.", "error");
        return;
      }

      setLocalAdminLoggedIn(true);
      setFeedback(feedback, "Ingreso exitoso.", "success");
      await openDashboard();
      form.reset();
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      setLocalAdminLoggedIn(false);
      toggleAdminVisibility(false);
      clearFeedback(feedback);
      clearFeedback(passwordFeedback);
    });
  }

  if (passwordForm) {
    passwordForm.addEventListener("submit", (event) => {
      event.preventDefault();
      clearFeedback(passwordFeedback);

      const currentPassword = document.getElementById("currentPassword")?.value || "";
      const newPassword = document.getElementById("newPassword")?.value || "";
      const confirmPassword = document.getElementById("confirmPassword")?.value || "";
      const saved = getLocalAdminCredentials();

      if (!currentPassword || !newPassword || !confirmPassword) {
        setFeedback(passwordFeedback, "Completá todos los campos.", "error");
        return;
      }

      if (currentPassword !== saved.password) {
        setFeedback(passwordFeedback, "La contraseña actual no coincide.", "error");
        return;
      }

      if (newPassword.length < 4) {
        setFeedback(passwordFeedback, "La nueva contraseña debe tener al menos 4 caracteres.", "error");
        return;
      }

      if (newPassword !== confirmPassword) {
        setFeedback(passwordFeedback, "Las contraseñas nuevas no coinciden.", "error");
        return;
      }

      saveLocalAdminCredentials({ username: saved.username, password: newPassword });
      setFeedback(passwordFeedback, "Contraseña actualizada correctamente.", "success");
      passwordForm.reset();
    });
  }
}

function setupAdminLogin(auth) {
  const form = document.getElementById("adminLoginForm");
  const feedback = document.getElementById("adminLoginFeedback");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFeedback(feedback);

    const email = document.getElementById("adminEmail")?.value.trim();
    const password = document.getElementById("adminPassword")?.value;

    if (!email || !password) {
      setFeedback(feedback, "Completá email y contraseña.", "error");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      setFeedback(feedback, "Ingreso exitoso.", "success");
    } catch {
      setFeedback(feedback, "No se pudo iniciar sesión.", "error");
    }
  });
}

async function setupAdminDashboard(db) {
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

  const load = async () => {
    const allAppointments = db ? await fetchAppointments(db, "") : fetchLocalAppointments("");
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
      if (!db) {
        const list = getLocalAppointments();
        const index = list.findIndex((item) => item.id === id);
        if (index === -1) {
          return;
        }

        if (action === "delete") {
          list.splice(index, 1);
        } else if (action === "cancel") {
          list[index].status = "cancelado";
          list[index].updatedAt = Date.now();
        } else if (action === "complete") {
          list[index].status = "completado";
          list[index].updatedAt = Date.now();
        } else if (action === "activate") {
          list[index].status = "activo";
          list[index].updatedAt = Date.now();
        }

        setLocalAppointments(list);
      } else if (action === "delete") {
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

    if (!db) {
      const occupied = getLocalOccupiedTimesByDate(date);
      if (occupied.has(time)) {
        setFeedback(blockFeedback, "Ese horario ya está ocupado o bloqueado.", "error");
        return;
      }

      upsertLocalAppointment({
        id: slotId,
        name: "Bloqueado",
        service: "Bloqueo manual",
        date,
        time,
        status: "bloqueado",
        blocked: true,
        source: "admin-local",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      setFeedback(blockFeedback, "Horario bloqueado correctamente.", "success");
      blockForm.reset();
      await load();
      return;
    }

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

function fetchLocalAppointments(dateFilter) {
  const data = getLocalAppointments();
  const filtered = dateFilter ? data.filter((item) => item.date === dateFilter) : data;

  filtered.sort((a, b) => {
    const byDate = (a.date || "").localeCompare(b.date || "");
    if (byDate !== 0) {
      return byDate;
    }
    return (a.time || "").localeCompare(b.time || "");
  });

  return filtered;
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

    row.innerHTML = `
      <td>${appointment.name || "-"}</td>
      <td>${appointment.service || "-"}</td>
      <td>${appointment.date || "-"}</td>
      <td>${appointment.time || "-"}</td>
      <td><span class="status-pill status-${appointment.status || "activo"}">${appointment.status || "activo"}</span></td>
      <td class="action-cell">
        ${
          !isBlocked
            ? `<button type="button" data-action="complete" data-id="${appointment.id}">Completar</button>
               <button type="button" data-action="cancel" data-id="${appointment.id}">Cancelar</button>`
            : `<button type="button" data-action="activate" data-id="${appointment.id}">Liberar</button>`
        }
        <button type="button" data-action="delete" data-id="${appointment.id}">Eliminar</button>
      </td>
    `;

    tbody.appendChild(row);
  });
}

function renderStats(container, appointments) {
  if (!container) {
    return;
  }

  const active = appointments.filter((item) => item.status === "activo").length;
  const blocked = appointments.filter((item) => item.status === "bloqueado").length;
  const completed = appointments.filter((item) => item.status === "completado").length;
  const canceled = appointments.filter((item) => item.status === "cancelado").length;

  container.innerHTML = `
    <span>Total: ${appointments.length}</span>
    <span>Activos: ${active}</span>
    <span>Bloqueados: ${blocked}</span>
    <span>Completados: ${completed}</span>
    <span>Cancelados: ${canceled}</span>
  `;
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
    if (!ENABLE_ADMIN_AUTH) {
      return;
    }
    const auth = getAuth();
    await signOut(auth);
  },
};
