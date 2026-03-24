import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

if (window.location.protocol === "file:") {
  alert("Esta aplicación requiere ejecutarse en un servidor local (ej: Live Server o http://localhost).");
}

const PAGE_LOGIN = "login";
const PAGE_ADMIN = "admin";

// ===== DEV LOGIN (FALLBACK) =====
// Desactivar en producción.
const ENABLE_DEV_LOGIN = true;
const DEV_ADMIN_USER = "nicolas";
const DEV_ADMIN_PASS = "BlackFriday98";
const DEV_ADMIN_SESSION_KEY = "nailsDevAdminSession";
const LOGIN_DEBUG = true;

// Reemplaza con tu config real de Firebase.
const firebaseConfig = {
  apiKey: "REEMPLAZAR_API_KEY",
  authDomain: "REEMPLAZAR_AUTH_DOMAIN",
  projectId: "REEMPLAZAR_PROJECT_ID",
  storageBucket: "REEMPLAZAR_STORAGE_BUCKET",
  messagingSenderId: "REEMPLAZAR_MESSAGING_SENDER_ID",
  appId: "REEMPLAZAR_APP_ID",
};

const hasValidFirebaseConfig = !Object.values(firebaseConfig).some((value) =>
  String(value).includes("REEMPLAZAR_")
);

let auth = null;
let authInitError = null;

if (hasValidFirebaseConfig) {
  try {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
  } catch (error) {
    authInitError = error;
    auth = null;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.nailsLoginRuntimeReady = true;

  const page = document.body?.dataset?.page || "";

  if (LOGIN_DEBUG) {
    console.info("[LOGIN] DOM listo", {
      page,
      hasValidFirebaseConfig,
      authReady: Boolean(auth),
      authInitError: authInitError ? String(authInitError?.message || authInitError) : "none",
    });
  }

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

  if (LOGIN_DEBUG) {
    if (type === "error") {
      console.error("[LOGIN]", text);
    } else {
      console.info("[LOGIN]", text);
    }
  }
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

  if (params.get("dev") === "1") {
    return { text: "Modo administrador (dev) activo.", type: "success" };
  }

  return null;
}

function isDevAdminSessionActive() {
  if (!ENABLE_DEV_LOGIN) {
    return false;
  }

  try {
    return sessionStorage.getItem(DEV_ADMIN_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function setDevAdminSession(value) {
  try {
    if (value) {
      sessionStorage.setItem(DEV_ADMIN_SESSION_KEY, "1");
    } else {
      sessionStorage.removeItem(DEV_ADMIN_SESSION_KEY);
    }
  } catch {
    // noop
  }
}

function validateDevCredentials(identity, password) {
  if (!ENABLE_DEV_LOGIN) {
    return false;
  }

  return identity.trim().toLowerCase() === DEV_ADMIN_USER && password === DEV_ADMIN_PASS;
}

function showDevBanner() {
  if (!isDevAdminSessionActive()) {
    return;
  }

  const existing = document.getElementById("devAdminBanner");
  if (existing) {
    return;
  }

  const adminMain = document.getElementById("adminMain");
  if (!adminMain) {
    return;
  }

  const banner = document.createElement("p");
  banner.id = "devAdminBanner";
  banner.className = "booking-feedback is-success";
  banner.textContent = "Modo administrador (dev) activo.";
  adminMain.prepend(banner);
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

  // Blindaje contra submit nativo del navegador.
  form.setAttribute("novalidate", "novalidate");
  form.removeAttribute("action");

  const queryMessage = messageFromQuery();
  if (queryMessage) {
    setFeedback(feedback, queryMessage.text, queryMessage.type);
  }

  if (!hasValidFirebaseConfig) {
    setFeedback(
      feedback,
      "Firebase no está configurado (firebaseConfig con valores REEMPLAZAR_).",
      "error"
    );
  } else if (!auth) {
    setFeedback(
      feedback,
      `Firebase Auth no pudo inicializarse: ${authInitError?.message || "sin detalle"}`,
      "error"
    );
  }

  if (auth) {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        if (LOGIN_DEBUG) {
          console.info("[LOGIN] Sesión Firebase activa, redirigiendo a admin.", {
            uid: user.uid,
            email: user.email,
          });
        }
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
      setFeedback(feedback, "Completá usuario/email y contraseña.", "error");
      setSubmitting(false);
      return;
    }

    setFeedback(feedback, "Validando acceso...", "success");

    // 1) Método principal: Firebase Auth
    if (auth) {
      try {
        if (!isValidEmail(identity)) {
          throw { code: "auth/invalid-email", message: "El login principal requiere un email válido." };
        }

        await signInWithEmailAndPassword(auth, identity.toLowerCase(), password);
        setDevAdminSession(false);
        setFeedback(feedback, "Ingreso correcto. Redirigiendo...", "success");
        window.setTimeout(() => {
          window.location.replace("admin.html");
        }, 180);
        return;
      } catch (error) {
        setFeedback(feedback, mapFirebaseLoginError(error), "error");
        // Continúa con fallback dev si está habilitado.
      }
    }

    // 2) Fallback opcional: modo desarrollo
    if (validateDevCredentials(identity, password)) {
      setDevAdminSession(true);
      setFeedback(feedback, "Modo administrador (dev) activo. Redirigiendo...", "success");
      window.setTimeout(() => {
        window.location.replace("admin.html?dev=1");
      }, 180);
      return;
    }

    setFeedback(feedback, "Credenciales incorrectas.", "error");
    setSubmitting(false);
  });
}

function protectAdminPage() {
  const adminMain = document.getElementById("adminMain");
  const devSession = isDevAdminSessionActive();

  if (devSession) {
    if (adminMain) {
      adminMain.hidden = false;
    }
    showDevBanner();
    bindLogoutButtons();
    return;
  }

  if (!auth) {
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

    setDevAdminSession(false);
    bindLogoutButtons();
  });
}

function bindLogoutButtons() {
  const logoutButtons = document.querySelectorAll("#adminLogoutBtn");
  logoutButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        if (auth) {
          await signOut(auth);
        }
      } catch {
        // noop
      } finally {
        setDevAdminSession(false);
        window.location.replace("login.html?loggedout=1");
      }
    });
  });
}
