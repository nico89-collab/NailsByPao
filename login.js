import { hasValidFirebaseConfig, firebaseAuth as auth } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

if (window.location.protocol === "file:") {
  alert("Esta aplicación requiere ejecutarse en un servidor local (ej: Live Server o http://localhost).");
}

const PAGE_LOGIN = "login";
const PAGE_ADMIN = "admin";

document.addEventListener("DOMContentLoaded", () => {
  window.nailsLoginRuntimeReady = true;

  const page = document.body?.dataset?.page || "";

  if (page === PAGE_LOGIN) {
    initLoginPage();
    return;
  }

  if (page === PAGE_ADMIN) {
    protectAdminPage();
  }
});

function getLoginFeedback() {
  return document.getElementById("loginFeedback");
}

function setFeedback(element, text, type = "error") {
  if (!element) {
    return;
  }

  element.textContent = text;
  element.classList.remove("is-error", "is-success");
  element.classList.add(type === "success" ? "is-success" : "is-error");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function mapFirebaseLoginError(error) {
  const code = error?.code || "";
  const message = error?.message || "Error desconocido de Firebase Auth.";

  const mapped = {
    "auth/invalid-email": "El email no es válido.",
    "auth/user-not-found": "No existe una cuenta con ese email.",
    "auth/wrong-password": "La contraseña es incorrecta.",
    "auth/invalid-credential": "Credenciales inválidas. Revisá email y contraseña.",
    "auth/too-many-requests": "Demasiados intentos. Probá de nuevo en unos minutos.",
    "auth/network-request-failed": "Error de red. Verificá tu conexión a internet.",
  };

  const friendly = mapped[code] || "No se pudo iniciar sesión con Firebase.";
  return `${friendly} (${code || "sin-código"}) ${message}`;
}

function messageFromQuery() {
  const params = new URLSearchParams(window.location.search);

  if (params.get("unauthorized") === "1") {
    return { text: "No autorizado. Iniciá sesión para ingresar al panel.", type: "error" };
  }

  if (params.get("config") === "1") {
    return { text: "Firebase no está configurado. Completá firebaseConfig para habilitar el acceso.", type: "error" };
  }

  if (params.get("loggedout") === "1") {
    return { text: "Sesión cerrada correctamente.", type: "success" };
  }

  return null;
}

function initLoginPage() {
  const form = document.getElementById("loginForm");
  const identityInput = document.getElementById("loginIdentity");
  const passInput = document.getElementById("password");
  const feedback = getLoginFeedback();
  const toggleBtn = document.getElementById("togglePassword");
  const submitBtn = form?.querySelector('button[type="submit"]');

  if (!form || !identityInput || !passInput || !feedback || !toggleBtn) {
    return;
  }

  form.setAttribute("novalidate", "novalidate");
  form.removeAttribute("action");

  const queryMessage = messageFromQuery();
  if (queryMessage) {
    setFeedback(feedback, queryMessage.text, queryMessage.type);
  }

  if (!hasValidFirebaseConfig) {
    setFeedback(feedback, "Firebase no está configurado (firebaseConfig con valores REEMPLAZAR_).", "error");
  } else if (!auth) {
    setFeedback(feedback, "Firebase Auth no está disponible. Revisá la configuración.", "error");
  }

  if (auth) {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        window.location.replace("admin.html");
      }
    });
  }

  toggleBtn.addEventListener("click", () => {
    const isPassword = passInput.type === "password";
    passInput.type = isPassword ? "text" : "password";
    toggleBtn.textContent = isPassword ? "Ocultar" : "Mostrar";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const setSubmitting = (isSubmitting) => {
      if (!submitBtn) {
        return;
      }
      submitBtn.disabled = isSubmitting;
      submitBtn.textContent = isSubmitting ? "Ingresando..." : "Ingresar";
    };

    setSubmitting(true);

    const identity = identityInput.value.trim();
    const password = passInput.value;

    if (!identity || !password) {
      setFeedback(feedback, "Completá email y contraseña.", "error");
      setSubmitting(false);
      return;
    }

    if (!isValidEmail(identity)) {
      setFeedback(feedback, "Ingresá un email válido.", "error");
      setSubmitting(false);
      return;
    }

    if (!auth) {
      setFeedback(feedback, "Firebase Auth no está disponible. Configurá firebaseConfig.", "error");
      setSubmitting(false);
      return;
    }

    setFeedback(feedback, "Validando acceso...", "success");

    try {
      await signInWithEmailAndPassword(auth, identity.toLowerCase(), password);
      setFeedback(feedback, "Ingreso correcto. Redirigiendo...", "success");
      window.setTimeout(() => {
        window.location.replace("admin.html");
      }, 180);
    } catch (error) {
      setFeedback(feedback, mapFirebaseLoginError(error), "error");
      setSubmitting(false);
    }
  });
}

function protectAdminPage() {
  const adminMain = document.getElementById("adminMain");

  if (!auth || !hasValidFirebaseConfig) {
    window.location.replace("login.html?config=1");
    return;
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace("login.html?unauthorized=1");
      return;
    }

    if (adminMain) {
      adminMain.hidden = false;
    }

    bindLogoutButtons();
  });
}

function bindLogoutButtons() {
  const logoutButtons = document.querySelectorAll("#adminLogoutBtn");
  logoutButtons.forEach((button) => {
    if (button.dataset.bound === "1") {
      return;
    }

    button.dataset.bound = "1";
    button.addEventListener("click", async () => {
      try {
        if (auth) {
          await signOut(auth);
        }
      } catch {
        // noop
      } finally {
        window.location.replace("login.html?loggedout=1");
      }
    });
  });
}
