const body = document.body;
const menuButton = document.querySelector(".menu-toggle");
const navLinks = document.querySelectorAll(".nav-links a");
const revealElements = document.querySelectorAll(".reveal");

if (menuButton) {
  menuButton.addEventListener("click", () => {
    const expanded = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!expanded));
    body.classList.toggle("nav-open");
  });
}

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    body.classList.remove("nav-open");
    if (menuButton) {
      menuButton.setAttribute("aria-expanded", "false");
    }
  });
});

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  revealElements.forEach((element) => observer.observe(element));
} else {
  revealElements.forEach((element) => element.classList.add("visible"));
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

function formatDateForModal(value) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function closeBookingModal() {
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

function openBookingModal(data) {
  const { modal, closeBtn, whatsappBtn, name, service, date, time } = getBookingModalElements();
  if (!modal || !closeBtn || !whatsappBtn || !name || !service || !date || !time) {
    console.error("Modal de confirmacion no encontrado en el DOM.");
    return;
  }

  name.textContent = data.nombre || "-";
  service.textContent = data.servicio || "-";
  date.textContent = formatDateForModal(data.fecha || "");
  time.textContent = data.hora || "-";

  const whatsappMessage = `Hola! Confirmé mi turno\n\n*Datos del turno:*\n\n*Nombre:* ${data.nombre || "-"}\n*Servicio:* ${data.servicio || "-"}\n*Fecha:* ${data.fecha || "-"}\n*Hora:* ${data.hora || "-"}\n\nGracias!`;
  whatsappBtn.href = `https://wa.me/2657603395?text=${encodeURIComponent(whatsappMessage)}`;

  if (modal.dataset.bound !== "1") {
    closeBtn.addEventListener("click", closeBookingModal);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeBookingModal();
      }
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal.classList.contains("is-open")) {
        closeBookingModal();
      }
    });
    modal.dataset.bound = "1";
  }

  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("booking-modal-open");
  window.requestAnimationFrame(() => {
    modal.classList.add("is-open");
  });
}

function initBookingSimulationFlow() {
  const form = document.getElementById("bookingForm");
  const nameInput = document.getElementById("clientName");
  const serviceSelect = document.getElementById("serviceSelect");
  const dateInput = document.getElementById("bookingDate");
  const timeSelect = document.getElementById("bookingTime");
  const feedback = document.getElementById("bookingFeedback");

  if (!form || !dateInput || !timeSelect) {
    return;
  }

  const setTodayMin = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    dateInput.min = `${yyyy}-${mm}-${dd}`;
  };

  const buildSlots = () => {
    const slots = [];
    for (let hour = 9; hour < 19; hour += 1) {
      slots.push(`${String(hour).padStart(2, "0")}:00`);
      slots.push(`${String(hour).padStart(2, "0")}:30`);
    }
    return slots;
  };

  const renderEmpty = () => {
    timeSelect.innerHTML = "";
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Primero elegi una fecha";
    timeSelect.appendChild(option);
  };

  const renderSlots = (dateValue) => {
    if (!dateValue) {
      renderEmpty();
      return;
    }

    const slots = buildSlots();
    timeSelect.innerHTML = "";

    const first = document.createElement("option");
    first.value = "";
    first.textContent = "Selecciona un horario";
    timeSelect.appendChild(first);

    slots.forEach((slot) => {
      const option = document.createElement("option");
      option.value = slot;
      option.textContent = slot;
      timeSelect.appendChild(option);
    });
  };

  const onDateChange = () => {
    const value = (dateInput.value || "").trim();
    console.log("Fecha seleccionada:", value);
    renderSlots(value);
  };

  setTodayMin();
  dateInput.addEventListener("change", onDateChange);
  dateInput.addEventListener("input", onDateChange);
  dateInput.addEventListener("blur", onDateChange);
  onDateChange();

  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }

      const bookingData = {
        nombre: (nameInput?.value || "").trim() || "Cliente",
        servicio: serviceSelect?.value || "-",
        fecha: (dateInput.value || "").trim() || "-",
        hora: (timeSelect.value || "").trim() || "-",
      };

      openBookingModal(bookingData);

      if (feedback) {
        feedback.textContent = "Turno confirmado en modo simulacion.";
        feedback.classList.remove("is-error");
        feedback.classList.add("is-success");
      }
    },
    true
  );
}

initBookingSimulationFlow();
