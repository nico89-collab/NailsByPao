const LOGIN_STORAGE_KEY = "nailsAdminLoggedIn";
const LEGACY_LOGIN_STORAGE_KEY = "isLogged";
const SESSION_LOGIN_KEY = "nailsAdminSession";
const ADMIN_USER = "admin";
const ADMIN_PASS = "1234";
const URL_LOGIN_TOKEN_KEY = "fromLogin";
const URL_LOGIN_TOKEN_VALUE = "1";

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body?.dataset?.page || "";

  if (page === "admin") {
    protectAdminPage();
    bindLogoutButtons();
    return;
  }

  if (page === "login") {
    initLoginPage();
  }
});

function isLoggedIn() {
  try {
    return (
      localStorage.getItem(LOGIN_STORAGE_KEY) === "true" ||
      localStorage.getItem(LEGACY_LOGIN_STORAGE_KEY) === "true" ||
      sessionStorage.getItem(SESSION_LOGIN_KEY) === "true"
    );
  } catch {
    return false;
  }
}

function setLoggedIn(value) {
  let persisted = true;

  try {
    if (value) {
      localStorage.setItem(LOGIN_STORAGE_KEY, "true");
      localStorage.setItem(LEGACY_LOGIN_STORAGE_KEY, "true");
    } else {
      localStorage.removeItem(LOGIN_STORAGE_KEY);
      localStorage.removeItem(LEGACY_LOGIN_STORAGE_KEY);
    }
  } catch {
    persisted = false;
  }

  try {
    if (value) {
      sessionStorage.setItem(SESSION_LOGIN_KEY, "true");
    } else {
      sessionStorage.removeItem(SESSION_LOGIN_KEY);
    }
  } catch {
    // No interrumpe el login si sessionStorage no esta disponible.
  }

  return persisted;
}

function hasUrlLoginToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get(URL_LOGIN_TOKEN_KEY) === URL_LOGIN_TOKEN_VALUE;
}

function consumeUrlLoginToken() {
  const url = new URL(window.location.href);
  url.searchParams.delete(URL_LOGIN_TOKEN_KEY);
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}

function protectAdminPage() {
  const isTokenLogin = hasUrlLoginToken();
  if (!isLoggedIn() && !isTokenLogin) {
    window.location.replace("login.html");
    return;
  }

  if (isTokenLogin) {
    console.log("[LOGIN] Acceso temporal por token URL detectado");
    setLoggedIn(true);
    consumeUrlLoginToken();
  }

  const adminMain = document.getElementById("adminMain");
  if (adminMain) {
    adminMain.hidden = false;
  }
}

function bindLogoutButtons() {
  const logoutButtons = document.querySelectorAll("#adminLogoutBtn");
  logoutButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setLoggedIn(false);
      window.location.replace("login.html");
    });
  });
}

function initLoginPage() {
  const form = document.getElementById("loginForm");
  const userInput = document.getElementById("usuario") || document.getElementById("loginUser");
  const passInput = document.getElementById("password") || document.getElementById("loginPass");
  const feedback = document.getElementById("loginFeedback");
  const toggleBtn = document.getElementById("togglePassword");

  if (!form || !userInput || !passInput || !feedback || !toggleBtn) {
    console.log("[LOGIN] Error: faltan elementos del formulario");
    return;
  }

  // Blindaje: evita cualquier submit nativo aunque otro script interfiera.
  form.setAttribute("novalidate", "novalidate");
  form.removeAttribute("action");

  let isSubmitting = false;

  toggleBtn.addEventListener("click", () => {
    const isPassword = passInput.type === "password";
    passInput.type = isPassword ? "text" : "password";
    toggleBtn.textContent = isPassword ? "Ocultar" : "Mostrar";
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (isSubmitting) {
      console.log("[LOGIN] Submit duplicado bloqueado");
      return;
    }

    feedback.textContent = "";
    feedback.classList.remove("is-error", "is-success");

    const user = userInput.value.trim();
    const pass = passInput.value;

    console.log("[LOGIN] Submit recibido", { user, hasPassword: Boolean(pass) });

    if (!user || !pass) {
      feedback.textContent = "Completá usuario y contraseña.";
      feedback.classList.add("is-error");
      console.log("[LOGIN] Error: campos incompletos");
      isSubmitting = false;
      return;
    }

    if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
      feedback.textContent = "Usuario o contraseña incorrectos";
      feedback.classList.add("is-error");
      console.log("[LOGIN] Error: credenciales invalidas");
      isSubmitting = false;
      return;
    }

    isSubmitting = true;
    const persisted = setLoggedIn(true);
    feedback.textContent = "Ingreso correcto. Redirigiendo...";
    feedback.classList.add("is-success");
    console.log("[LOGIN] Credenciales validas. Redirigiendo a admin.html", { persisted });

    window.setTimeout(() => {
      window.location.href = persisted
        ? "admin.html"
        : `admin.html?${URL_LOGIN_TOKEN_KEY}=${URL_LOGIN_TOKEN_VALUE}`;
    }, 220);
  };

  // Captura temprana para impedir refresh incluso si hay listeners externos.
  form.addEventListener("submit", handleSubmit, true);
}
