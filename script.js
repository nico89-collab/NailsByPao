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
  const whatsappUrl =
    "https://wa.me/2657603395?text=Hola%20Nails%20By%20Pao%2C%20quiero%20reservar%20un%20turno";
  const bookingText = "Reservar por WhatsApp";

  const services = {
    "soft gel": {
      name: "Soft Gel",
      price: "Desde $23.000",
      duration: "2 a 3 semanas",
      ideal:
        "ideal si queres largo, forma definida y un look mas llamativo.",
      maintenance:
        "mantenimiento recomendado cada 15 a 21 dias para que se vean prolijas.",
      care:
        "evita usar las unas como herramienta y aplica aceite de cuticulas a diario.",
    },
    kapping: {
      name: "Kapping",
      price: "Desde $18.500",
      duration: "2 a 3 semanas",
      ideal:
        "ideal para reforzar la una natural sin alargarla.",
      maintenance:
        "retoque sugerido cada 15 a 21 dias segun crecimiento.",
      care:
        "hidrata cuticulas y usa guantes para limpieza con productos fuertes.",
    },
    semipermanente: {
      name: "Semipermanente",
      price: "Desde $15.000",
      duration: "2 a 3 semanas",
      ideal:
        "ideal si buscas color, brillo y algo practico para el dia a dia.",
      maintenance:
        "renovacion cada 14 a 21 dias para mantener brillo y prolijidad.",
      care:
        "no levantes el esmalte; para retirar, siempre conviene hacerlo profesionalmente.",
    },
  };

  const userProfile = {
    wantsNatural: false,
    wantsLong: false,
    needsStrength: false,
    wantsLowMaintenance: false,
    wantsBold: false,
  };

  const convoState = {
    hasBookingIntent: false,
    nudgeTimeoutId: null,
  };

  const storageKey = "nailsByPaoAssistantStats";
  const readStats = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        return {
          totalMessages: 0,
          totalConversations: 0,
          intents: {},
          services: {},
          lastIntent: "",
          updatedAt: "",
        };
      }
      const parsed = JSON.parse(raw);
      return {
        totalMessages: parsed.totalMessages || 0,
        totalConversations: parsed.totalConversations || 0,
        intents: parsed.intents || {},
        services: parsed.services || {},
        lastIntent: parsed.lastIntent || "",
        updatedAt: parsed.updatedAt || "",
      };
    } catch {
      return {
        totalMessages: 0,
        totalConversations: 0,
        intents: {},
        services: {},
        lastIntent: "",
        updatedAt: "",
      };
    }
  };

  const writeStats = (stats) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(stats));
    } catch {
      // Ignore storage errors in private mode or blocked storage.
    }
  };

  const trackIntent = (intent, normalizedQuestion) => {
    const stats = readStats();
    stats.totalMessages += 1;
    stats.intents[intent] = (stats.intents[intent] || 0) + 1;
    stats.lastIntent = intent;
    stats.updatedAt = new Date().toISOString();

    const mentionedService = detectServiceMention(normalizedQuestion);
    if (mentionedService) {
      stats.services[mentionedService] = (stats.services[mentionedService] || 0) + 1;
    }

    writeStats(stats);
  };

  const registerConversationStart = () => {
    const key = "nailsByPaoAssistantSessionStarted";
    if (sessionStorage.getItem(key) === "1") {
      return;
    }

    const stats = readStats();
    stats.totalConversations += 1;
    stats.updatedAt = new Date().toISOString();
    writeStats(stats);
    sessionStorage.setItem(key, "1");
  };

  const getCurrentPageService = () => {
    const path = window.location.pathname.toLowerCase();
    if (path.includes("soft-gel")) {
      return "soft gel";
    }
    if (path.includes("kapping")) {
      return "kapping";
    }
    if (path.includes("semipermanente")) {
      return "semipermanente";
    }
    return "";
  };

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <button class="assistant-toggle" aria-label="Abrir asistente virtual" title="Asistente virtual">AI</button>
    <section class="assistant-panel" aria-label="Asistente virtual Nails By Pao">
      <header class="assistant-head">
        <strong>Asistente Experta</strong>
        <small>Nails By Pao</small>
      </header>
      <div class="assistant-body" role="log" aria-live="polite"></div>
      <div class="assistant-quick">
        <button type="button" data-question="Que me conviene segun lo que busco?">Que me conviene</button>
        <button type="button" data-question="Cuales son los precios de cada servicio?">Precios</button>
        <button type="button" data-question="Quiero reservar un turno">Reservar turno</button>
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

  const appendMessage = (text, author) => {
    const message = document.createElement("p");
    message.className = `assistant-msg ${author}`;
    message.textContent = text;
    bodyLog.appendChild(message);
    bodyLog.scrollTop = bodyLog.scrollHeight;
  };

  const appendBookingCta = (customText) => {
    const row = document.createElement("p");
    row.className = "assistant-msg bot";
    row.innerHTML = `${customText || "Si queres, te reservo ahora mismo:"} <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer">${bookingText}</a>`;
    bodyLog.appendChild(row);
    bodyLog.scrollTop = bodyLog.scrollHeight;
  };

  const clearNudgeTimer = () => {
    if (convoState.nudgeTimeoutId) {
      window.clearTimeout(convoState.nudgeTimeoutId);
      convoState.nudgeTimeoutId = null;
    }
  };

  const scheduleBookingNudge = () => {
    clearNudgeTimer();
    if (convoState.hasBookingIntent) {
      return;
    }

    convoState.nudgeTimeoutId = window.setTimeout(() => {
      if (convoState.hasBookingIntent) {
        return;
      }
      appendMessage(
        "Si queres, te ayudo a cerrar tu turno ahora y te confirmamos disponibilidad al instante.",
        "bot"
      );
      appendBookingCta();
      setQuickReplies(["Reservar turno", "Consultar precios", "Que me conviene?"]);
    }, 45000);
  };

  const setQuickReplies = (items) => {
    const quickContainer = wrapper.querySelector(".assistant-quick");
    quickContainer.innerHTML = "";

    items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.question = item;
      button.textContent = item;
      quickContainer.appendChild(button);
    });
  };

  const normalize = (text) =>
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const includesAny = (text, words) => words.some((word) => text.includes(word));

  const detectServiceMention = (message) => {
    if (message.includes("soft gel")) {
      return "soft gel";
    }
    if (message.includes("kapping")) {
      return "kapping";
    }
    if (message.includes("semipermanente") || message.includes("semi")) {
      return "semipermanente";
    }
    return "";
  };

  const detectIntent = (message) => {
    if (includesAny(message, ["hola", "buenas", "buen dia", "buenas tardes"])) {
      return "greeting";
    }

    if (includesAny(message, ["precio", "precios", "cuanto", "costo", "vale"])) {
      return "price";
    }

    if (
      includesAny(message, [
        "diferencia",
        "diferencias",
        "cual es la diferencia",
        "que cambia",
      ])
    ) {
      return "difference";
    }

    if (
      includesAny(message, [
        "que me conviene",
        "cual me conviene",
        "recomendas",
        "recomiendas",
        "no se cual",
        "cual elijo",
      ])
    ) {
      return "recommendation";
    }

    if (includesAny(message, ["duracion", "cuanto dura", "dura", "tiempo"])) {
      return "duration";
    }

    if (
      includesAny(message, [
        "cuidado",
        "cuidados",
        "mantenimiento",
        "despues",
        "retiro",
        "retirar",
      ])
    ) {
      return "care";
    }

    if (
      includesAny(message, [
        "turno",
        "reserva",
        "reservar",
        "agenda",
        "quiero ir",
        "disponibilidad",
      ])
    ) {
      return "booking";
    }

    if (includesAny(message, ["soft gel", "kapping", "semipermanente", "servicio", "servicios"])) {
      return "services";
    }

    if (includesAny(message, ["horario", "horarios", "abren", "atienden"])) {
      return "hours";
    }

    if (includesAny(message, ["direccion", "ubicacion", "donde", "local"])) {
      return "location";
    }

    return "fallback";
  };

  const updateProfile = (message) => {
    if (includesAny(message, ["natural", "discreto", "suave", "sin alargar"])) {
      userProfile.wantsNatural = true;
    }
    if (includesAny(message, ["largo", "largas", "alargar", "extension"])) {
      userProfile.wantsLong = true;
    }
    if (includesAny(message, ["debil", "quiebran", "rompen", "refuerzo"])) {
      userProfile.needsStrength = true;
    }
    if (includesAny(message, ["poco mantenimiento", "practico", "rapido", "simple"])) {
      userProfile.wantsLowMaintenance = true;
    }
    if (includesAny(message, ["llamativo", "diseño", "diseno", "impactante"])) {
      userProfile.wantsBold = true;
    }
  };

  const buildRecommendation = () => {
    if (userProfile.wantsLong || userProfile.wantsBold) {
      return "Por lo que me contas, te conviene Soft Gel: te da largo y una terminacion mas definida y elegante.";
    }
    if (userProfile.needsStrength || userProfile.wantsNatural) {
      return "Para vos recomiendo Kapping: refuerza la una natural y se ve super prolijo sin agregar largo.";
    }
    if (userProfile.wantsLowMaintenance) {
      return "Te conviene Semipermanente: es practico, brillante y perfecto para el dia a dia.";
    }
    return "Para recomendarte con precision, contame esto: buscas algo natural o mas llamativo? y queres alargar o mantener tu largo natural?";
  };

  const answerByIntent = (intent, normalizedQuestion) => {
    if (intent === "greeting") {
      appendMessage(
        "Hola, soy la asistente de Nails By Pao. Te ayudo a elegir servicio y reservar tu turno en minutos.",
        "bot"
      );
      setQuickReplies([
        "Que servicio me recomendas?",
        "Cuales son los precios?",
        "Quiero reservar",
      ]);
      return;
    }

    if (intent === "services") {
      const selectedService = detectServiceMention(normalizedQuestion);

      if (selectedService) {
        const current = services[selectedService];
        appendMessage(
          `${current.name}: ${current.price}. Duracion aprox ${current.duration}. Es ${current.ideal}`,
          "bot"
        );
        appendMessage(
          `Mantenimiento: ${current.maintenance} Cuidado: ${current.care}`,
          "bot"
        );
        appendBookingCta("Si queres, te reservo este servicio:");
        setQuickReplies(["Reservar turno", "Ver otro servicio", "Que me conviene?"]);
        return;
      }

      appendMessage(
        "Trabajamos Soft Gel, Kapping y Semipermanente. Si queres, te explico cual te conviene segun tu estilo de vida.",
        "bot"
      );
      setQuickReplies([
        "Diferencias entre servicios",
        "Que me conviene?",
        "Ver precios",
      ]);
      return;
    }

    if (intent === "difference") {
      appendMessage(
        "Resumen rapido: Soft Gel alarga y define; Kapping refuerza tu una natural; Semipermanente aporta color y brillo sin estructura extra.",
        "bot"
      );
      appendMessage("Si me contas como queres que se vean tus unas, te digo la mejor opcion para vos.", "bot");
      setQuickReplies([
        "Busco algo natural",
        "Quiero mas largo",
        "Prefiero algo practico",
      ]);
      return;
    }

    if (intent === "price") {
      appendMessage(
        `Precios actuales: ${services["soft gel"].name} ${services["soft gel"].price}, ${services.kapping.name} ${services.kapping.price}, ${services.semipermanente.name} ${services.semipermanente.price}.`,
        "bot"
      );
      appendBookingCta("Si ya elegiste, te ayudo a reservar ahora mismo:");
      setQuickReplies(["Quiero reservar", "Que me conviene?", "Cuanto duran?"]);
      return;
    }

    if (intent === "duration") {
      appendMessage(
        `Duracion estimada: ${services["soft gel"].name} ${services["soft gel"].duration}, ${services.kapping.name} ${services.kapping.duration}, ${services.semipermanente.name} ${services.semipermanente.duration}.`,
        "bot"
      );
      appendMessage("Con buen cuidado, se mantienen impecables hasta el proximo retoque.", "bot");
      setQuickReplies(["Cuidados recomendados", "Reservar turno", "Que me conviene?"]);
      return;
    }

    if (intent === "care") {
      appendMessage(
        "Tip clave: hidrata cuticulas todos los dias, usa guantes para limpieza y evita retirar el producto en casa.",
        "bot"
      );
      appendMessage(
        "Si queres, te recomiendo un servicio segun cuanto mantenimiento queres hacer.",
        "bot"
      );
      setQuickReplies(["Quiero poco mantenimiento", "Que me conviene?", "Reservar turno"]);
      return;
    }

    if (intent === "booking") {
      convoState.hasBookingIntent = true;
      appendMessage(
        "Perfecto. Para reservar, escribinos por WhatsApp y te pasamos horarios disponibles para esta semana.",
        "bot"
      );
      appendBookingCta();
      setQuickReplies(["Consultar precios", "Ver diferencias", "Hablar por WhatsApp"]);
      return;
    }

    if (intent === "hours") {
      appendMessage(
        "Trabajamos con turno previo. Por WhatsApp te compartimos disponibilidad actualizada y te confirmamos en el momento.",
        "bot"
      );
      appendBookingCta();
      setQuickReplies(["Reservar turno", "Consultar precios", "Que me conviene?"]);
      return;
    }

    if (intent === "location") {
      appendMessage(
        "Te paso ubicacion e indicaciones por WhatsApp para que llegues sin complicaciones.",
        "bot"
      );
      appendBookingCta();
      setQuickReplies(["Reservar turno", "Consultar servicios", "Ver precios"]);
      return;
    }

    if (intent === "recommendation") {
      const recommendation = buildRecommendation();
      appendMessage(recommendation, "bot");
      if (!recommendation.startsWith("Para recomendarte")) {
        appendBookingCta("Si te gusta esa opcion, avanzamos con tu turno ahora:");
      }
      setQuickReplies([
        "Busco algo natural",
        "Quiero mas largo",
        "Reservar turno",
      ]);
      return;
    }

    appendMessage(
      "Te ayudo con servicios, diferencias, precios, duracion, cuidados y reservas. Contame que resultado queres lograr y te recomiendo lo mejor para vos.",
      "bot"
    );
    setQuickReplies(["Que me conviene?", "Ver precios", "Reservar turno"]);
  };

  const replyTo = (question) => {
    const normalized = normalize(question);
    updateProfile(normalized);
    const intent = detectIntent(normalized);
    trackIntent(intent, normalized);

    if (intent === "booking") {
      convoState.hasBookingIntent = true;
    }

    window.setTimeout(() => {
      answerByIntent(intent, normalized);
      scheduleBookingNudge();
    }, 140);
  };

  const currentPageService = getCurrentPageService();
  registerConversationStart();

  window.nailsAssistantStats = {
    get: () => readStats(),
    reset: () => {
      localStorage.removeItem(storageKey);
      sessionStorage.removeItem("nailsByPaoAssistantSessionStarted");
    },
  };

  appendMessage(
    "Hola, soy la asistente experta de Nails By Pao. Te recomiendo el servicio ideal y te ayudo a reservar en un toque.",
    "bot"
  );

  if (currentPageService) {
    const current = services[currentPageService];
    appendMessage(
      `Veo que estas en ${current.name}. ${current.price}, duracion ${current.duration}. Queres que avancemos con tu reserva?`,
      "bot"
    );
    setQuickReplies(["Reservar turno", "Ver diferencias", "Consultar precios"]);
  } else {
    appendMessage("Te interesa algo natural, con mas largo o de bajo mantenimiento?", "bot");
  }

  scheduleBookingNudge();

  toggle.addEventListener("click", () => {
    const isOpen = panel.classList.contains("open");
    panel.classList.toggle("open", !isOpen);
    toggle.setAttribute("aria-expanded", String(!isOpen));
    if (!isOpen) {
      input.focus();
    }
  });

  wrapper.querySelector(".assistant-quick").addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    const question = target.dataset.question || "";
    appendMessage(question, "user");
    replyTo(question);
  });

  bodyLog.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLAnchorElement && target.href.includes("wa.me/2657603395")) {
      convoState.hasBookingIntent = true;
      clearNudgeTimer();
    }
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

