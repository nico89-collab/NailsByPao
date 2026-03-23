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

function createVirtualAssistant() {
  const whatsappUrl = "https://wa.me/2657603395?text=Hola%20quiero%20mas%20informacion";

  const faqMap = [
    {
      keywords: ["precio", "precios", "cuanto", "costo"],
      answer:
        "Tenemos servicios desde $15.000. Si queres, te paso el precio exacto segun el servicio que elijas.",
    },
    {
      keywords: ["turno", "reserva", "reservar", "agenda"],
      answer:
        "Podes reservar ahora mismo por WhatsApp y te confirmamos disponibilidad al instante.",
    },
    {
      keywords: ["horario", "horarios", "abren", "atienden"],
      answer:
        "Atendemos con turno previo. Escribinos por WhatsApp y te enviamos los horarios disponibles de la semana.",
    },
    {
      keywords: ["direccion", "ubicacion", "donde", "local"],
      answer:
        "Te compartimos la ubicacion exacta por WhatsApp junto con indicaciones para llegar facil.",
    },
    {
      keywords: ["servicio", "servicios", "kapping", "soft gel", "semipermanente"],
      answer:
        "Trabajamos soft gel, kapping y semipermanente. Decime cual te interesa y te asesoro.",
    },
  ];

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <button class="assistant-toggle" aria-label="Abrir asistente virtual" title="Asistente virtual">AI</button>
    <section class="assistant-panel" aria-label="Asistente virtual Nails By Pao">
      <header class="assistant-head">
        <strong>Asistente Virtual</strong>
        <small>Nails By Pao</small>
      </header>
      <div class="assistant-body" role="log" aria-live="polite"></div>
      <div class="assistant-quick">
        <button type="button" data-question="Quiero reservar un turno">Reservar turno</button>
        <button type="button" data-question="Que servicios tienen?">Ver servicios</button>
        <button type="button" data-question="Cuales son los precios?">Consultar precios</button>
      </div>
      <form class="assistant-form">
        <input type="text" placeholder="Escribi tu consulta..." aria-label="Mensaje para asistente" required />
        <button type="submit">Enviar</button>
      </form>
    </section>
  `;

  document.body.appendChild(wrapper);

  const panel = wrapper.querySelector(".assistant-panel");
  const toggle = wrapper.querySelector(".assistant-toggle");
  const bodyLog = wrapper.querySelector(".assistant-body");
  const form = wrapper.querySelector(".assistant-form");
  const input = wrapper.querySelector(".assistant-form input");
  const quickButtons = wrapper.querySelectorAll(".assistant-quick button");

  const appendMessage = (text, author) => {
    const message = document.createElement("p");
    message.className = `assistant-msg ${author}`;
    message.textContent = text;
    bodyLog.appendChild(message);
    bodyLog.scrollTop = bodyLog.scrollHeight;
  };

  const replyTo = (question) => {
    const normalized = question.toLowerCase();
    const found = faqMap.find((item) => item.keywords.some((keyword) => normalized.includes(keyword)));

    if (found) {
      appendMessage(found.answer, "bot");
    } else {
      appendMessage(
        "Puedo ayudarte con reservas, precios, servicios y horarios. Si preferis, te derivo a WhatsApp para una respuesta personalizada.",
        "bot"
      );
    }

    if (
      normalized.includes("reserv") ||
      normalized.includes("turno") ||
      normalized.includes("whatsapp") ||
      normalized.includes("contacto")
    ) {
      setTimeout(() => {
        appendMessage("Hace clic aca para continuar por WhatsApp: " + whatsappUrl, "bot");
      }, 300);
    }
  };

  appendMessage("Hola, soy tu asistente virtual. Te ayudo a reservar y elegir servicio.", "bot");

  toggle.addEventListener("click", () => {
    const isOpen = panel.classList.contains("open");
    panel.classList.toggle("open", !isOpen);
    toggle.setAttribute("aria-expanded", String(!isOpen));
    if (!isOpen) {
      input.focus();
    }
  });

  quickButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const question = button.dataset.question || "";
      appendMessage(question, "user");
      replyTo(question);
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) {
      return;
    }

    appendMessage(question, "user");
    replyTo(question);
    input.value = "";
  });
}

createVirtualAssistant();
