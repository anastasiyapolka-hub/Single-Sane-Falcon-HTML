let currentUser = null;
let registerEmail = null;
let pendingEmail = null;

const COTEL_LANG_MANUAL_KEY = "cotel_language_manual";
const COTEL_LANG_AUTO_KEY = "cotel_language_auto";
const COTEL_USER_PREFS_KEY = "cotel_user_prefs";

const COUNTRY_LIST = [
  { code: "AM", name: "Armenia" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "AZ", name: "Azerbaijan" },
  { code: "BE", name: "Belgium" },
  { code: "BG", name: "Bulgaria" },
  { code: "CA", name: "Canada" },
  { code: "CN", name: "China" },
  { code: "HR", name: "Croatia" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DK", name: "Denmark" },
  { code: "EE", name: "Estonia" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GE", name: "Georgia" },
  { code: "DE", name: "Germany" },
  { code: "GR", name: "Greece" },
  { code: "HU", name: "Hungary" },
  { code: "IN", name: "India" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "KG", name: "Kyrgyzstan" },
  { code: "LV", name: "Latvia" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MD", name: "Moldova" },
  { code: "ME", name: "Montenegro" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "RS", name: "Serbia" },
  { code: "SG", name: "Singapore" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "TJ", name: "Tajikistan" },
  { code: "TH", name: "Thailand" },
  { code: "TR", name: "Turkey" },
  { code: "TM", name: "Turkmenistan" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "UZ", name: "Uzbekistan" },
  { code: "RU", name: "Russia" }
];

function normalizeLanguage(value) {
  return String(value || "").toLowerCase().startsWith("ru") ? "ru" : "en";
}

function detectBrowserLanguage() {
  const languages = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language || "en"];

  const hasRussian = languages.some((lang) =>
    String(lang || "").toLowerCase().startsWith("ru")
  );

  return hasRussian ? "ru" : "en";
}

function applyLanguageToDocument(lang) {
  document.documentElement.lang = normalizeLanguage(lang);
}

function getStoredUserPrefsMap() {
  try {
    return JSON.parse(localStorage.getItem(COTEL_USER_PREFS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveStoredUserPrefsMap(map) {
  localStorage.setItem(COTEL_USER_PREFS_KEY, JSON.stringify(map));
}

function loadUserLocalPrefs(email) {
  if (!email) return {};
  const map = getStoredUserPrefsMap();
  return map[email] || {};
}

function saveUserLocalPrefs(email, patch) {
  if (!email) return;
  const map = getStoredUserPrefsMap();
  map[email] = {
    ...(map[email] || {}),
    ...patch
  };
  saveStoredUserPrefsMap(map);
}

function getEffectiveLanguage(user = null) {
  const userLang = normalizeLanguage(user?.language);
  const manualLang = localStorage.getItem(COTEL_LANG_MANUAL_KEY);
  const autoLang = localStorage.getItem(COTEL_LANG_AUTO_KEY);

  if (user?.language) return userLang;
  if (manualLang) return normalizeLanguage(manualLang);
  if (autoLang) return normalizeLanguage(autoLang);

  const detected = detectBrowserLanguage();
  localStorage.setItem(COTEL_LANG_AUTO_KEY, detected);
  return detected;
}

function initLanguagePreference() {
  const lang = getEffectiveLanguage();
  applyLanguageToDocument(lang);
}

function setManualLanguage(lang) {
  const normalized = normalizeLanguage(lang);
  localStorage.setItem(COTEL_LANG_MANUAL_KEY, normalized);
  applyLanguageToDocument(normalized);

  if (currentUser?.email) {
    saveUserLocalPrefs(currentUser.email, {
      language: normalized,
      language_source: "manual"
    });
  }

  if (currentUser) {
    currentUser.language = normalized;
    currentUser.language_source = "manual";
  }
}

function buildCountryOptions() {
  const list = byId("country-options");
  if (!list) return;

  list.innerHTML = COUNTRY_LIST
    .map((country) => `<option value="${country.name}"></option>`)
    .join("");
}

function findCountryByName(name) {
  const normalized = String(name || "").trim().toLowerCase();
  return COUNTRY_LIST.find(
    (country) => country.name.toLowerCase() === normalized
  ) || null;
}

function syncRegisterCountryCode() {
  const countryInput = byId("register-country");
  const countryCodeInput = byId("register-country-code");
  if (!countryInput || !countryCodeInput) return;

  const match = findCountryByName(countryInput.value);
  countryCodeInput.value = match ? match.code : "";
}

function bindCountryField() {
  const countryInput = byId("register-country");
  if (!countryInput) return;

  countryInput.addEventListener("input", syncRegisterCountryCode);
  countryInput.addEventListener("change", syncRegisterCountryCode);
}

function byId(id) {
  return document.getElementById(id);
}

function openAuthModal() {
  byId("auth-modal")?.classList.remove("hidden");
  switchAuthView("start");
  resetAuthForms();
}

function closeAuthModal() {
  byId("auth-modal")?.classList.add("hidden");
}

function switchAuthView(view) {
  ["auth-view-start", "auth-view-login", "auth-view-register", "auth-view-verify"].forEach((id) => {
    byId(id)?.classList.add("hidden");
  });

  byId(`auth-view-${view}`)?.classList.remove("hidden");
}

function resetAuthForms() {
  [
  "auth-email-check",
  "login-email",
  "login-password",
  "register-email",
  "register-country",
  "register-country-code",
  "register-password",
  "register-password2",
  "verify-code"
]
  .forEach((id) => {
      const el = byId(id);
      if (el) el.value = "";
    });

  byId("verify-dev-hint")?.classList.add("hidden");
  byId("verify-dev-hint").textContent = "";
  pendingEmail = null;
  registerEmail = null;

  clearLoginError();
}

async function bootstrapAuth() {
  try {
    const user = await apiFetch("/auth/me");
    setUser(user);
  } catch {
    setGuest();
  }
}

function setGuest() {
  currentUser = null;
  byId("auth-open-btn")?.classList.remove("hidden");
  byId("user-profile")?.classList.add("hidden");
  byId("user-dropdown")?.classList.add("hidden");
}

function setUser(user) {
  const localPrefs = loadUserLocalPrefs(user?.email || "");
  const resolvedLanguage =
    user?.language ||
    localPrefs.language ||
    getEffectiveLanguage(user);

  currentUser = {
    ...user,
    ...localPrefs,
    language: normalizeLanguage(resolvedLanguage)
  };

  byId("auth-open-btn")?.classList.add("hidden");
  byId("user-profile")?.classList.remove("hidden");
  byId("user-dropdown")?.classList.add("hidden");

  byId("user-email").textContent = currentUser.email || "";
  byId("user-plan").textContent = currentUser.plan || "free";

  applyLanguageToDocument(currentUser.language);
  setAvatar(currentUser.email || "");

  saveUserLocalPrefs(currentUser.email || "", {
    country_name: currentUser.country_name || currentUser.country || "",
    country_code: currentUser.country_code || "",
    language: currentUser.language,
    language_source: currentUser.language_source || "auto"
  });
}

function setAvatar(email) {
  const hash = String(email).split("").reduce((a, b) => a + b.charCodeAt(0), 0);
  const index = (hash % 4) + 1;
  byId("user-avatar-img").src = `/images/cats/cat-${index}.jpg`;
}

function toggleUserDropdown() {
  byId("user-dropdown")?.classList.toggle("hidden");
}

function closeUserDropdown() {
  byId("user-dropdown")?.classList.add("hidden");
}

function clearLoginError() {
  const passwordInput = byId("login-password");
  const errorEl = byId("login-password-error");

  if (passwordInput) {
    passwordInput.classList.remove("auth-input-error");
  }

  if (errorEl) {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
  }
}

function showLoginError(message) {
  const passwordInput = byId("login-password");
  const errorEl = byId("login-password-error");

  if (passwordInput) {
    passwordInput.classList.add("auth-input-error");
    passwordInput.focus();
    passwordInput.select?.();
  }

  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  }
}

async function handleCheckEmail() {
  const email = byId("auth-email-check").value.trim().toLowerCase();
  if (!email) {
    alert("Введите почту.");
    return;
  }

  try {
    const result = await apiFetch("/auth/check-email", {
      method: "POST",
      body: JSON.stringify({ email })
    });

    pendingEmail = email;

    if (result.exists) {
      byId("login-email").value = email;
      switchAuthView("login");
    } else {
      byId("register-email").value = email;
      switchAuthView("register");
    }
  } catch (err) {
    alert("Не удалось проверить email.");
  }
}

async function handleLogin() {
  const email = byId("login-email").value.trim().toLowerCase();
  const password = byId("login-password").value;

  clearLoginError();

  if (!email || !password) {
    showLoginError("Введите пароль.");
    return;
  }

  try {
    const user = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    setUser(user);

    if (typeof window.cotelRefreshTelegramState === "function") {
      await window.cotelRefreshTelegramState();
    }

    closeAuthModal();
  } catch (err) {
    const detail = err?.detail?.detail || err?.detail || "";

    if (detail === "EMAIL_NOT_VERIFIED") {
      registerEmail = email;
      switchAuthView("verify");
      return;
    }

    if (
      detail === "INVALID_CREDENTIALS" ||
      detail === "INVALID_PASSWORD" ||
      detail === "LOGIN_FAILED" ||
      detail === "UNAUTHORIZED"
    ) {
      showLoginError("Неверный пароль");
      return;
    }

    showLoginError("Не удалось войти");
  }
}

async function handleRegister() {
  const email = byId("register-email").value.trim().toLowerCase();
  const countryName = byId("register-country")?.value.trim() || "";
  const countryMatch = findCountryByName(countryName);
  const password = byId("register-password").value;
  const password2 = byId("register-password2").value;

  if (!email || !countryName || !password || !password2) {
    alert("Заполните все поля.");
    return;
  }

  if (!countryMatch) {
    alert("Выберите страну из списка.");
    return;
  }

  if (password !== password2) {
    alert("Пароли не совпадают.");
    return;
  }

  registerEmail = email;

  saveUserLocalPrefs(email, {
    country_name: countryMatch.name,
    country_code: countryMatch.code,
    language: getEffectiveLanguage(),
    language_source: "auto"
  });

  try {
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
      const hint = byId("verify-dev-hint");
      hint.textContent = `DEV-код для теста: ${res.dev_code}`;
      hint.classList.remove("hidden");
    }
  } catch (err) {
    const detail = err?.detail?.detail || err?.detail || "";
    if (detail === "PASSWORD_TOO_SHORT") {
      alert("Пароль слишком короткий.");
      return;
    }
    if (detail === "PASSWORD_TOO_WEAK") {
      alert("Пароль слишком слабый.");
      return;
    }
    if (detail === "EMAIL_ALREADY_EXISTS") {
      byId("login-email").value = email;
      switchAuthView("login");
      return;
    }
    alert("Ошибка регистрации.");
  }
}

async function handleVerify() {
  const code = byId("verify-code").value.trim();

  if (!registerEmail) {
    alert("Не найден email для подтверждения.");
    switchAuthView("start");
    return;
  }

  if (!code) {
    alert("Введите код.");
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

    if (typeof window.cotelRefreshTelegramState === "function") {
      await window.cotelRefreshTelegramState();
    }

    closeAuthModal();
  } catch (err) {
    alert("Неверный или просроченный код.");
  }
}

async function handleLogout() {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } catch (_) {}

  setGuest();
  closeUserDropdown();
}

function bindAuthUi() {
  byId("auth-open-btn")?.addEventListener("click", openAuthModal);
  byId("auth-modal-close")?.addEventListener("click", closeAuthModal);

  byId("auth-continue-submit")?.addEventListener("click", handleCheckEmail);
  byId("login-submit")?.addEventListener("click", handleLogin);
  byId("login-password")?.addEventListener("input", clearLoginError);
  byId("register-submit")?.addEventListener("click", handleRegister);
  byId("verify-submit")?.addEventListener("click", handleVerify);

  byId("show-register")?.addEventListener("click", () => {
    byId("register-email").value = pendingEmail || "";
    switchAuthView("register");
  });

  byId("show-login")?.addEventListener("click", () => {
    byId("login-email").value = pendingEmail || "";
    switchAuthView("login");
  });

  byId("verify-back")?.addEventListener("click", () => {
    byId("register-email").value = registerEmail || "";
    switchAuthView("register");
  });

  byId("logout-btn")?.addEventListener("click", handleLogout);

  byId("user-profile-trigger")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!currentUser) return;
    toggleUserDropdown();
  });

  byId("profile-btn")?.addEventListener("click", () => {
    closeUserDropdown();
    openProfileModal();
  });

  byId("help-btn")?.addEventListener("click", () => {
    closeUserDropdown();
    alert("Справку подключим следующим этапом.");
  });

  byId("change-plan-btn")?.addEventListener("click", () => {
   closeUserDropdown();
   window.location.href = "/pricing.html";
  });

  byId("change-password-btn")?.addEventListener("click", () => {
    alert("Смену пароля подключим позже.");
  });

  byId("profile-language")?.addEventListener("change", handleProfileLanguageChange);
  
  byId("auth-modal")?.addEventListener("click", (e) => {
    const content = document.querySelector(".auth-modal-content");
    if (content && !content.contains(e.target)) {
      closeAuthModal();
    }
  });

  byId("profile-modal-close")?.addEventListener("click", closeProfileModal);

  byId("profile-modal")?.addEventListener("click", (e) => {
    const content = document.querySelector(".profile-modal-content");
    if (content && !content.contains(e.target)) {
      closeProfileModal();
    }
  });

  document.addEventListener("click", (e) => {
    const profile = byId("user-profile");
    if (profile && !profile.contains(e.target)) {
      closeUserDropdown();
    }
  });
}

function initCookieBanner() {
  const banner = byId("cookie-banner");
  const btn = byId("cookie-accept-btn");
  if (!banner || !btn) return;

  const accepted = localStorage.getItem("cotel_cookie_banner_accepted");
  if (!accepted) {
    banner.classList.remove("hidden");
  }

  btn.addEventListener("click", () => {
    localStorage.setItem("cotel_cookie_banner_accepted", "1");
    banner.classList.add("hidden");
  });
}

function openProfileModal() {
  if (!currentUser) return;

  const email = currentUser.email || "—";
  const plan = String(currentUser.plan || "free").toLowerCase();
  const avatarSrc = byId("user-avatar-img")?.src || "/images/cats/cat-1.jpg";
  const countryValue =
    currentUser.country_name ||
    currentUser.country ||
    "—";
  const languageValue = normalizeLanguage(
    currentUser.language || getEffectiveLanguage(currentUser)
  );

  byId("profile-email-header").textContent = email;
  byId("profile-avatar-img").src = avatarSrc;
  byId("profile-country").textContent = countryValue;

  const languageSelect = byId("profile-language");
  if (languageSelect) {
    languageSelect.value = languageValue;
  }

  const switcher = byId("profile-plan-switcher");
  if (switcher) {
    switcher.setAttribute("data-plan", plan);

    switcher.querySelectorAll(".plan-chip").forEach((el) => {
      el.classList.remove("active");
    });

    if (plan === "basic") {
      switcher.querySelector(".plan-basic")?.classList.add("active");
    } else if (plan === "pro") {
      switcher.querySelector(".plan-pro")?.classList.add("active");
    } else {
      switcher.querySelector(".plan-free")?.classList.add("active");
    }
  }

  byId("profile-modal")?.classList.remove("hidden");
}

function closeProfileModal() {
  byId("profile-modal")?.classList.add("hidden");
}

function handleProfileLanguageChange() {
  const select = byId("profile-language");
  if (!select) return;

  setManualLanguage(select.value);
}

function bindProfilePhoneMask() {
  const input = byId("profile-phone");
  if (!input) return;

  input.addEventListener("input", function () {
    let value = input.value.replace(/\D/g, "");

    if (!value.startsWith("7")) {
      value = "7" + value;
    }

    value = value.substring(0, 11);

    let formatted = "+7";

    if (value.length > 1) formatted += " " + value.substring(1, 4);
    if (value.length > 4) formatted += " " + value.substring(4, 7);
    if (value.length > 7) formatted += " " + value.substring(7, 9);
    if (value.length > 9) formatted += " " + value.substring(9, 11);

    input.value = formatted;
  });

  input.addEventListener("keydown", (e) => {
    if (
      input.selectionStart < 2 &&
      (e.key === "Backspace" || e.key === "Delete")
    ) {
      e.preventDefault();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initLanguagePreference();
  buildCountryOptions();
  bindCountryField();
  bindAuthUi();

  bootstrapAuth();
  initCookieBanner();
  bindProfilePhoneMask();
});