let currentUser = null;
let registerEmail = null;

function $(id) {
  return document.getElementById(id);
}

function openAuthModal(view = "login") {
  $("auth-modal")?.classList.remove("hidden");
  switchAuthView(view);
}

function closeAuthModal() {
  $("auth-modal")?.classList.add("hidden");
}

function switchAuthView(view) {
  $("auth-view-login")?.classList.add("hidden");
  $("auth-view-register")?.classList.add("hidden");
  $("auth-view-verify")?.classList.add("hidden");

  if (view === "login") $("auth-view-login")?.classList.remove("hidden");
  if (view === "register") $("auth-view-register")?.classList.remove("hidden");
  if (view === "verify") $("auth-view-verify")?.classList.remove("hidden");
}

async function bootstrapAuth() {
  try {
    const user = await apiFetch("/auth/me");
    setUser(user);
  } catch (e) {
    setGuest();
  }
}

function setGuest() {
  currentUser = null;
  $("auth-open-btn")?.classList.remove("hidden");
  $("user-profile")?.classList.add("hidden");
  $("user-dropdown")?.classList.add("hidden");
}

function setUser(user) {
  currentUser = user;

  $("auth-open-btn")?.classList.add("hidden");
  $("user-profile")?.classList.remove("hidden");

  $("user-email").textContent = user.email || "";
  $("user-plan").textContent = user.plan || "free";

  setAvatar(user.email || "");
}

function setAvatar(email) {
  const safeEmail = String(email || "");
  const hash = safeEmail.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const index = (hash % 4) + 1;

  $("user-avatar-img").src = `images/cats/cat-${index}.jpg`;
}

function toggleUserDropdown() {
  $("user-dropdown")?.classList.toggle("hidden");
}

function closeUserDropdown() {
  $("user-dropdown")?.classList.add("hidden");
}

async function handleLogin() {
  const email = $("login-email").value.trim();
  const password = $("login-password").value;

  if (!email || !password) {
    alert("Введите email и пароль.");
    return;
  }

  try {
    const user = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    setUser(user);
    closeAuthModal();
  } catch (err) {
    const detail = err?.detail?.detail || err?.detail || "Ошибка входа";
    alert(typeof detail === "string" ? detail : "Ошибка входа");
  }
}

async function handleRegister() {
  const email = $("register-email").value.trim();
  const password = $("register-password").value;
  const password2 = $("register-password2").value;

  if (!email || !password || !password2) {
    alert("Заполните все поля.");
    return;
  }

  if (password !== password2) {
    alert("Пароли не совпадают.");
    return;
  }

  try {
    registerEmail = email;

    const res = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        password_confirm: password2
      })
    });

    switchAuthView("verify");

    if (res.dev_code) {
      alert(`DEV code: ${res.dev_code}`);
    }
  } catch (err) {
    const detail = err?.detail?.detail || err?.detail || "Ошибка регистрации";
    alert(typeof detail === "string" ? detail : "Ошибка регистрации");
  }
}

async function handleVerify() {
  const code = $("verify-code").value.trim();

  if (!registerEmail) {
    alert("Не найден email для подтверждения. Зарегистрируйтесь заново.");
    switchAuthView("register");
    return;
  }

  if (!code) {
    alert("Введите код подтверждения.");
    return;
  }

  try {
    const user = await apiFetch("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({
        email: registerEmail,
        code
      })
    });

    setUser(user);
    closeAuthModal();
  } catch (err) {
    const detail = err?.detail?.detail || err?.detail || "Ошибка подтверждения";
    alert(typeof detail === "string" ? detail : "Ошибка подтверждения");
  }
}

async function handleLogout() {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } catch (_) {
    // даже если сервер ответил ошибкой, на фронте всё равно сбросим состояние
  }

  setGuest();
  closeUserDropdown();
}

function bindAuthUi() {
  $("auth-open-btn")?.addEventListener("click", () => openAuthModal("login"));
  $("auth-modal-close")?.addEventListener("click", closeAuthModal);
  $("show-register")?.addEventListener("click", () => switchAuthView("register"));
  $("show-login")?.addEventListener("click", () => switchAuthView("login"));
  $("verify-back")?.addEventListener("click", () => switchAuthView("register"));

  $("login-submit")?.addEventListener("click", handleLogin);
  $("register-submit")?.addEventListener("click", handleRegister);
  $("verify-submit")?.addEventListener("click", handleVerify);
  $("logout-btn")?.addEventListener("click", handleLogout);

  $("user-profile-trigger")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!currentUser) return;
    toggleUserDropdown();
  });

  $("profile-btn")?.addEventListener("click", () => {
    closeUserDropdown();
    alert("Профиль пока сделаем следующим этапом.");
  });

  $("auth-modal")?.addEventListener("click", (e) => {
    const content = document.querySelector(".auth-modal-content");
    if (!content) return;

    const clickedInside = content.contains(e.target);
    if (!clickedInside) {
      closeAuthModal();
    }
  });

  document.addEventListener("click", (e) => {
    const profile = $("user-profile");
    if (!profile) return;
    if (!profile.contains(e.target)) {
      closeUserDropdown();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindAuthUi();
  bootstrapAuth();
});