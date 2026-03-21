let currentUser = null;
let registerEmail = null;
let pendingEmail = null;
let profilePhoneIti = null;
let tgPhoneIti = null;
let verifyResendCooldownTimer = null;
let verifyResendCooldownLeft = 0;
const VERIFY_RESEND_COOLDOWN_SEC = 60;
const COTEL_LANG_MANUAL_KEY = "cotel_language_manual";
const COTEL_LANG_AUTO_KEY = "cotel_language_auto";
const COTEL_USER_PREFS_KEY = "cotel_user_prefs";

const COUNTRY_LIST = [
  { code: "AM", name_en: "Armenia", name_ru: "Армения" },
  { code: "AU", name_en: "Australia", name_ru: "Австралия" },
  { code: "AT", name_en: "Austria", name_ru: "Австрия" },
  { code: "AZ", name_en: "Azerbaijan", name_ru: "Азербайджан" },
  { code: "BE", name_en: "Belgium", name_ru: "Бельгия" },
  { code: "BG", name_en: "Bulgaria", name_ru: "Болгария" },
  { code: "CA", name_en: "Canada", name_ru: "Канада" },
  { code: "CN", name_en: "China", name_ru: "Китай" },
  { code: "HR", name_en: "Croatia", name_ru: "Хорватия" },
  { code: "CY", name_en: "Cyprus", name_ru: "Кипр" },
  { code: "CZ", name_en: "Czech Republic", name_ru: "Чехия" },
  { code: "DK", name_en: "Denmark", name_ru: "Дания" },
  { code: "EE", name_en: "Estonia", name_ru: "Эстония" },
  { code: "FI", name_en: "Finland", name_ru: "Финляндия" },
  { code: "FR", name_en: "France", name_ru: "Франция" },
  { code: "GE", name_en: "Georgia", name_ru: "Грузия" },
  { code: "DE", name_en: "Germany", name_ru: "Германия" },
  { code: "GR", name_en: "Greece", name_ru: "Греция" },
  { code: "HU", name_en: "Hungary", name_ru: "Венгрия" },
  { code: "IN", name_en: "India", name_ru: "Индия" },
  { code: "IE", name_en: "Ireland", name_ru: "Ирландия" },
  { code: "IL", name_en: "Israel", name_ru: "Израиль" },
  { code: "IT", name_en: "Italy", name_ru: "Италия" },
  { code: "JP", name_en: "Japan", name_ru: "Япония" },
  { code: "KZ", name_en: "Kazakhstan", name_ru: "Казахстан" },
  { code: "KG", name_en: "Kyrgyzstan", name_ru: "Кыргызстан" },
  { code: "LV", name_en: "Latvia", name_ru: "Латвия" },
  { code: "LT", name_en: "Lithuania", name_ru: "Литва" },
  { code: "LU", name_en: "Luxembourg", name_ru: "Люксембург" },
  { code: "MD", name_en: "Moldova", name_ru: "Молдова" },
  { code: "ME", name_en: "Montenegro", name_ru: "Черногория" },
  { code: "NL", name_en: "Netherlands", name_ru: "Нидерланды" },
  { code: "NO", name_en: "Norway", name_ru: "Норвегия" },
  { code: "PL", name_en: "Poland", name_ru: "Польша" },
  { code: "PT", name_en: "Portugal", name_ru: "Португалия" },
  { code: "RO", name_en: "Romania", name_ru: "Румыния" },
  { code: "RS", name_en: "Serbia", name_ru: "Сербия" },
  { code: "SG", name_en: "Singapore", name_ru: "Сингапур" },
  { code: "SK", name_en: "Slovakia", name_ru: "Словакия" },
  { code: "SI", name_en: "Slovenia", name_ru: "Словения" },
  { code: "ES", name_en: "Spain", name_ru: "Испания" },
  { code: "SE", name_en: "Sweden", name_ru: "Швеция" },
  { code: "CH", name_en: "Switzerland", name_ru: "Швейцария" },
  { code: "TJ", name_en: "Tajikistan", name_ru: "Таджикистан" },
  { code: "TH", name_en: "Thailand", name_ru: "Таиланд" },
  { code: "TR", name_en: "Turkey", name_ru: "Турция" },
  { code: "TM", name_en: "Turkmenistan", name_ru: "Туркменистан" },
  { code: "UA", name_en: "Ukraine", name_ru: "Украина" },
  { code: "AE", name_en: "United Arab Emirates", name_ru: "ОАЭ" },
  { code: "GB", name_en: "United Kingdom", name_ru: "Великобритания" },
  { code: "US", name_en: "United States", name_ru: "США" },
  { code: "UZ", name_en: "Uzbekistan", name_ru: "Узбекистан" },
  { code: "RU", name_en: "Russia", name_ru: "Россия" }
];

function normalizeLanguage(value) {
  return String(value || "").toLowerCase().startsWith("ru") ? "ru" : "en";
}

function getCountryLabel(country, lang = "en") {
  if (!country) return "";
  return normalizeLanguage(lang) === "ru"
    ? country.name_ru
    : country.name_en;
}

function getCurrentUiLanguage() {
  if (currentUser?.language) return normalizeLanguage(currentUser.language);

  const manualLang = localStorage.getItem(COTEL_LANG_MANUAL_KEY);
  if (manualLang) return normalizeLanguage(manualLang);

  const autoLang = localStorage.getItem(COTEL_LANG_AUTO_KEY);
  if (autoLang) return normalizeLanguage(autoLang);

  return detectBrowserLanguage();
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

async function setManualLanguage(lang) {
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

  if (currentUser?.id) {
    try {
      const updatedUser = await apiFetch("/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          language: normalized,
          language_source: "manual"
        })
      });

      currentUser = {
        ...currentUser,
        ...updatedUser
      };
    } catch (err) {
      console.warn("Language preference save failed", err);
    }
  }
}

function buildCountryOptions() {
  const list = byId("country-options");
  if (!list) return;

  const lang = getCurrentUiLanguage();

  list.innerHTML = COUNTRY_LIST
    .map((country) => `<option value="${getCountryLabel(country, lang)}"></option>`)
    .join("");
}

function findCountryByName(name) {
  const normalized = String(name || "").trim().toLowerCase();

  return COUNTRY_LIST.find((country) =>
    country.name_en.toLowerCase() === normalized ||
    country.name_ru.toLowerCase() === normalized
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

function normalizeCountryIso2(code) {
  const normalized = String(code || "").trim().toLowerCase();
  if (!normalized) return "ru";

  const exists = COUNTRY_LIST.some(
    (country) => country.code.toLowerCase() === normalized
  );

  return exists ? normalized : "ru";
}

function getDefaultPhoneCountryIso2() {
  return normalizeCountryIso2(currentUser?.country_code || "ru");
}

function buildTelegramPhoneOptions(countryIso2) {
  return {
    initialCountry: countryIso2,
    nationalMode: true,
    separateDialCode: true,
    strictMode: true,
    formatAsYouType: true,
    formatOnDisplay: true,
    autoPlaceholder: "aggressive",
    countrySearch: true,
    fixDropdownWidth: true,
    dropdownContainer: document.body,
    loadUtils: () =>
      import("https://cdn.jsdelivr.net/npm/intl-tel-input@26.8.1/build/js/utils.js"),
  };
}

function buildProfilePhoneOptions(countryIso2) {
  return {
    initialCountry: countryIso2,
    nationalMode: true,
    separateDialCode: true,
    strictMode: true,
    formatAsYouType: true,
    formatOnDisplay: true,
    autoPlaceholder: "aggressive",
    countrySearch: true,
    fixDropdownWidth: true,
    dropdownContainer: document.body,
    loadUtils: () =>
      import("https://cdn.jsdelivr.net/npm/intl-tel-input@26.8.1/build/js/utils.js"),
  };
}

function getNormalizedPhoneFromInstance(instance, inputEl) {
  if (!inputEl) return "";

  const rawValue = (inputEl.value || "").trim();
  if (!rawValue) return "";

  if (instance) {
    const e164 = instance.getNumber();
    if (e164) return e164;
  }

  return rawValue;
}

function initProfilePhoneInput(forceCountry = null) {
  const input = byId("profile-phone");
  if (!input || !window.intlTelInput) return;

  const defaultCountry = normalizeCountryIso2(forceCountry || getDefaultPhoneCountryIso2());

  if (profilePhoneIti) {
    profilePhoneIti.destroy();
    profilePhoneIti = null;
  }

    profilePhoneIti = window.intlTelInput(
    input,
    buildProfilePhoneOptions(defaultCountry)
    );
}

function initTelegramPhoneInput(forceCountry = null) {
  const input = byId("tgPhoneInput");
  if (!input || !window.intlTelInput) return;

  const defaultCountry = normalizeCountryIso2(forceCountry || getDefaultPhoneCountryIso2());

  if (tgPhoneIti) {
    tgPhoneIti.destroy();
    tgPhoneIti = null;
  }

    tgPhoneIti = window.intlTelInput(
    input,
    buildTelegramPhoneOptions(defaultCountry)
    );
}

function initIntlPhoneInputs(forceCountry = null) {
  initProfilePhoneInput(forceCountry);
  initTelegramPhoneInput(forceCountry);
}

function applyPhoneCountryFromCurrentUser() {
  const countryIso2 = getDefaultPhoneCountryIso2();

  if (profilePhoneIti) {
    profilePhoneIti.setCountry(countryIso2);
  }

  if (tgPhoneIti) {
    tgPhoneIti.setCountry(countryIso2);
  }
}

window.getTelegramPhoneE164 = function () {
  return getNormalizedPhoneFromInstance(tgPhoneIti, byId("tgPhoneInput"));
};

window.getProfilePhoneE164 = function () {
  return getNormalizedPhoneFromInstance(profilePhoneIti, byId("profile-phone"));
};

function byId(id) {
  return document.getElementById(id);
}

function togglePasswordVisibility(button) {
  const targetId = button?.getAttribute("data-target");
  if (!targetId) return;

  const input = byId(targetId);
  if (!input) return;

  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";

  button.classList.toggle("is-active", isPassword);
  button.setAttribute(
    "aria-label",
    isPassword ? "Скрыть пароль" : "Показать пароль"
  );
  button.setAttribute(
    "title",
    isPassword ? "Скрыть пароль" : "Показать пароль"
  );
  button.textContent = isPassword ? "🙈" : "👁";

  input.focus();
  const len = input.value.length;
  try {
    input.setSelectionRange(len, len);
  } catch (_) {}
}

function bindPasswordToggles() {
  document.querySelectorAll(".password-toggle-btn").forEach((button) => {
    button.addEventListener("click", () => togglePasswordVisibility(button));
  });
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
  stopVerifyResendCooldown();
}

function setVerifyResendButtonState() {
  const btn = byId("verify-resend");
  if (!btn) return;

  if (verifyResendCooldownLeft > 0) {
    const minutes = Math.floor(verifyResendCooldownLeft / 60);
    const seconds = verifyResendCooldownLeft % 60;
    btn.disabled = true;
    btn.textContent = `Отправить код повторно через ${minutes}:${String(seconds).padStart(2, "0")}`;
  } else {
    btn.disabled = false;
    btn.textContent = "Отправить код повторно";
  }
}

function stopVerifyResendCooldown() {
  if (verifyResendCooldownTimer) {
    clearInterval(verifyResendCooldownTimer);
    verifyResendCooldownTimer = null;
  }
  verifyResendCooldownLeft = 0;
  setVerifyResendButtonState();
}

function startVerifyResendCooldown(seconds = VERIFY_RESEND_COOLDOWN_SEC) {
  if (verifyResendCooldownTimer) {
    clearInterval(verifyResendCooldownTimer);
    verifyResendCooldownTimer = null;
  }

  verifyResendCooldownLeft = Math.max(0, Number(seconds) || 0);
  setVerifyResendButtonState();

  if (verifyResendCooldownLeft <= 0) {
    return;
  }

  verifyResendCooldownTimer = setInterval(() => {
    verifyResendCooldownLeft -= 1;

    if (verifyResendCooldownLeft <= 0) {
      stopVerifyResendCooldown();
      return;
    }

    setVerifyResendButtonState();
  }, 1000);
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

  document.body.classList.add("user-not-auth");
  applyPhoneCountryFromCurrentUser();
}

function setUser(user) {

  document.body.classList.remove("user-not-auth");
  const localPrefs = loadUserLocalPrefs(user?.email || "");
  const resolvedLanguage =
    user?.language ||
    localPrefs.language ||
    getEffectiveLanguage(user);

  currentUser = {
    ...localPrefs,
    ...user,
    language: normalizeLanguage(resolvedLanguage),
    language_source: user?.language_source || localPrefs.language_source || "auto",
    country_code: user?.country_code || localPrefs.country_code || null
  };

  byId("auth-open-btn")?.classList.add("hidden");
  byId("user-profile")?.classList.remove("hidden");
  byId("user-dropdown")?.classList.add("hidden");

  byId("user-email").textContent = currentUser.email || "";
  byId("user-plan").textContent = currentUser.plan || "free";

  applyLanguageToDocument(currentUser.language);
  setAvatar(currentUser.email || "");
  applyPhoneCountryFromCurrentUser();
  
  const tgPhoneInput = byId("tgPhoneInput");
  if (tgPhoneIti && tgPhoneInput && currentUser?.phone) {
    tgPhoneIti.setNumber(currentUser.phone);
  }
  
  saveUserLocalPrefs(currentUser.email || "", {
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

  const autoLanguage = getEffectiveLanguage();

  saveUserLocalPrefs(email, {
    country_code: countryMatch.code,
    language: autoLanguage,
    language_source: "auto"
  });

  try {
    const res = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        password_confirm: password2,
        country_code: countryMatch.code,
        language: autoLanguage,
        language_source: "auto"
      })
    });

    switchAuthView("verify");
    startVerifyResendCooldown();

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

async function handleResendVerifyCode() {
  if (!registerEmail) {
    alert("Не найден email для повторной отправки кода.");
    switchAuthView("start");
    return;
  }

  try {
    const res = await apiFetch("/auth/resend-verification-code", {
      method: "POST",
      body: JSON.stringify({
        email: registerEmail
      })
    });

    alert("Новый код отправлен на почту.");
    startVerifyResendCooldown();

  } catch (err) {
    const detail = err?.detail?.detail || err?.detail || "";

    if (detail === "EMAIL_ALREADY_VERIFIED") {
      alert("Почта уже подтверждена.");
      return;
    }

    if (typeof detail === "object" && detail?.code === "RESEND_COOLDOWN") {
      const retryAfter = Number(detail.retry_after_sec || VERIFY_RESEND_COOLDOWN_SEC);
      startVerifyResendCooldown(retryAfter);
      alert(`Повторная отправка будет доступна через ${retryAfter} сек.`);
      return;
    }

    alert("Не удалось отправить код повторно.");
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
  byId("verify-resend")?.addEventListener("click", handleResendVerifyCode);
  
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
  byId("save-profile-btn")?.addEventListener("click", handleSaveProfile);

  byId("auth-modal")?.addEventListener("click", (e) => {
    const content = document.querySelector(".auth-modal-content");
    if (content && !content.contains(e.target)) {
      closeAuthModal();
    }
  });

  byId("profile-modal-close")?.addEventListener("click", closeProfileModal);

  byId("profile-modal")?.addEventListener("click", (e) => {
    const content = document.querySelector(".profile-modal-content");
    const insideIntlDropdown =
      e.target instanceof Element &&
      !!e.target.closest(".iti, .iti__country-container, .iti__country-list");

    if (insideIntlDropdown) {
      return;
    }

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
  const countryObj = COUNTRY_LIST.find(
    (country) => country.code === (currentUser.country_code || "")
  );

  const countryValue = countryObj
    ? getCountryLabel(countryObj, getCurrentUiLanguage())
    : (currentUser.country_name || currentUser.country || "—");
    
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

  const profilePhoneInput = byId("profile-phone");
  if (profilePhoneInput) {
    if (profilePhoneIti && currentUser?.phone) {
      profilePhoneIti.setNumber(currentUser.phone);
    } else {
      profilePhoneInput.value = currentUser?.phone || "";
    }
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

  if (profilePhoneIti && currentUser?.phone) {
    profilePhoneIti.setNumber(currentUser.phone);
  }

  byId("profile-modal")?.classList.remove("hidden");
  applyPhoneCountryFromCurrentUser();
}

async function handleSaveProfile() {
  if (!currentUser) return;

  const language = normalizeLanguage(byId("profile-language")?.value || "en");
  const phone =
    typeof window.getProfilePhoneE164 === "function"
      ? window.getProfilePhoneE164()
      : (byId("profile-phone")?.value || "").trim();

  try {
    const updatedUser = await apiFetch("/auth/preferences", {
      method: "PATCH",
      body: JSON.stringify({
        language,
        language_source: "manual",
        phone: phone || null
      })
    });

    setUser(updatedUser);

    const tgPhoneInput = document.getElementById("tgPhoneInput");
    if (
      updatedUser?.phone &&
      typeof tgPhoneIti !== "undefined" &&
      tgPhoneIti &&
      tgPhoneInput
    ) {
      tgPhoneIti.setNumber(updatedUser.phone);
    }

    closeProfileModal();
  } catch (err) {
    const detail = err?.detail?.detail || err?.detail || "";

    if (detail === "PHONE_ALREADY_USED") {
      alert("Этот номер телефона уже используется в другом аккаунте.");
      return;
    }

    if (detail === "PHONE_INVALID") {
      alert("Телефон введён в неверном формате.");
      return;
    }

    alert("Не удалось сохранить изменения профиля.");
  }
}

function closeProfileModal() {
  byId("profile-modal")?.classList.add("hidden");
}

async function handleProfileLanguageChange() {
  const select = byId("profile-language");
  if (!select) return;

  await setManualLanguage(select.value);
  buildCountryOptions();

  if (currentUser?.country_code) {
    const countryObj = COUNTRY_LIST.find(
      (country) => country.code === currentUser.country_code
    );
    if (countryObj) {
      byId("profile-country").textContent = getCountryLabel(
        countryObj,
        getCurrentUiLanguage()
      );
    }
  }
}



document.addEventListener("DOMContentLoaded", () => {
  initLanguagePreference();
  buildCountryOptions();
  bindCountryField();
  bindAuthUi();
  bindPasswordToggles();

  initIntlPhoneInputs();
  bootstrapAuth();
  initCookieBanner();
  
});