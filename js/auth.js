let currentUser = null;
let currentPlanUsage = null;
let profileInitialState = null;
let profileIsDirty = false;
let registerEmail = null;
let pendingEmail = null;
let profilePhoneIti = null;
let tgPhoneIti = null;
let verifyResendCooldownTimer = null;
let verifyResendCooldownLeft = 0;
let resetEmail = null;
let resetResendCooldownTimer = null;
let resetResendCooldownLeft = 0;
const RESET_RESEND_COOLDOWN_SEC = 60;
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

const TIMEZONE_OPTIONS = [

  { value: "Europe/London", label: "London — UTC+0" },
  { value: "Europe/Berlin", label: "Berlin — UTC+1" },
  { value: "Europe/Athens", label: "Athens — UTC+2" },
  { value: "Europe/Moscow", label: "Moscow — UTC+3" },
  { value: "Asia/Tbilisi", label: "Tbilisi — UTC+4" },
  { value: "Asia/Karachi", label: "Karachi — UTC+5" },
  { value: "Asia/Almaty", label: "Almaty — UTC+6" },
  { value: "Asia/Tokyo", label: "Tokyo — UTC+9" },
  { value: "America/New_York", label: "New York — UTC-5" },
  { value: "America/Los_Angeles", label: "Los Angeles — UTC-8" },
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

function detectBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function normalizeTimezone(value) {
  const raw = String(value || "").trim();
  const exists = TIMEZONE_OPTIONS.some((tz) => tz.value === raw);
  return exists ? raw : "UTC";
}

function buildTimezoneOptions(selectId, selectedValue = "UTC") {
  const select = byId(selectId);
  if (!select) return;

  const normalized = normalizeTimezone(selectedValue);

  select.innerHTML = TIMEZONE_OPTIONS.map(
    (tz) => `<option value="${tz.value}" ${tz.value === normalized ? "selected" : ""}>${tz.label}</option>`
  ).join("");
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

function applyTelegramPhoneFromCurrentUser() {
  const tgPhoneInput = byId("tgPhoneInput");
  if (!tgPhoneInput) return;

  const phone = (currentUser?.phone || "").trim();

  if (tgPhoneIti) {
    if (phone) {
      tgPhoneIti.setNumber(phone);
    } else {
      tgPhoneIti.setNumber("");
      tgPhoneInput.value = "";
    }
    return;
  }

  tgPhoneInput.value = phone;
}

window.applyTelegramPhoneFromCurrentUser = applyTelegramPhoneFromCurrentUser;

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

  resetEmail = null;
  stopResetResendCooldown();

  if (byId("reset-request-email")) byId("reset-request-email").value = "";
  if (byId("reset-confirm-email")) byId("reset-confirm-email").value = "";
  if (byId("reset-code")) byId("reset-code").value = "";
  if (byId("reset-new-password")) byId("reset-new-password").value = "";
  if (byId("reset-new-password2")) byId("reset-new-password2").value = "";
}

function closeAuthModal() {
  byId("auth-modal")?.classList.add("hidden");
}

function switchAuthView(view) {
  [
    "auth-view-start",
    "auth-view-login",
    "auth-view-register",
    "auth-view-verify",
    "auth-view-reset-request",
    "auth-view-reset-confirm"
  ].forEach((id) => {
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
  applyTelegramPhoneFromCurrentUser();

    window.dispatchEvent(
    new CustomEvent("cotel-auth-changed", {
      detail: { user: null }
    })
  );
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
  applyTelegramPhoneFromCurrentUser();

  saveUserLocalPrefs(currentUser.email || "", {
    country_code: currentUser.country_code || "",
    language: currentUser.language,
    language_source: currentUser.language_source || "auto"
  });

    window.dispatchEvent(
    new CustomEvent("cotel-auth-changed", {
      detail: { user: currentUser }
    })
  );
  
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

    resetEmail = null;
    stopResetResendCooldown();

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
  const timezone = normalizeTimezone(byId("register-timezone")?.value || detectBrowserTimezone());
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
    timezone,
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
        timezone,
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

    resetEmail = null;
    stopResetResendCooldown();

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

function updateResetResendButton() {
  const btn = byId("reset-resend");
  if (!btn) return;

  if (resetResendCooldownLeft > 0) {
    btn.disabled = true;
    btn.textContent = `Отправить код ещё раз (${resetResendCooldownLeft} сек.)`;
  } else {
    btn.disabled = false;
    btn.textContent = "Отправить код ещё раз";
  }
}

function stopResetResendCooldown() {
  if (resetResendCooldownTimer) {
    clearInterval(resetResendCooldownTimer);
    resetResendCooldownTimer = null;
  }
  resetResendCooldownLeft = 0;
  updateResetResendButton();
}

function startResetResendCooldown(seconds = RESET_RESEND_COOLDOWN_SEC) {
  if (resetResendCooldownTimer) {
    clearInterval(resetResendCooldownTimer);
    resetResendCooldownTimer = null;
  }

  resetResendCooldownLeft = Math.max(0, Number(seconds) || 0);
  updateResetResendButton();

  if (resetResendCooldownLeft <= 0) return;

  resetResendCooldownTimer = setInterval(() => {
    resetResendCooldownLeft -= 1;

    if (resetResendCooldownLeft <= 0) {
      stopResetResendCooldown();
      return;
    }

    updateResetResendButton();
  }, 1000);
}

async function handlePasswordResetRequest() {
  const email = byId("reset-request-email")?.value.trim().toLowerCase() || "";

  if (!email) {
    alert("Введите email.");
    return;
  }

  try {
    await apiFetch("/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email })
    });

    resetEmail = email;

    const confirmEmail = byId("reset-confirm-email");
    if (confirmEmail) confirmEmail.value = email;

    switchAuthView("reset-confirm");
    startResetResendCooldown();
    alert("Если аккаунт с такой почтой существует, код отправлен.");
  } catch (err) {
    const detail = err?.detail?.detail || err?.detail || "";

    if (typeof detail === "object" && detail?.code === "RESET_RESEND_COOLDOWN") {
      const retryAfter = Number(detail.retry_after_sec || RESET_RESEND_COOLDOWN_SEC);
      startResetResendCooldown(retryAfter);
      alert(`Повторная отправка будет доступна через ${retryAfter} сек.`);
      return;
    }

    alert("Не удалось отправить код.");
  }
}

async function handlePasswordResetConfirm() {
  const email = byId("reset-confirm-email")?.value.trim().toLowerCase() || resetEmail || "";
  const code = byId("reset-code")?.value.trim() || "";
  const newPassword = byId("reset-new-password")?.value || "";
  const newPassword2 = byId("reset-new-password2")?.value || "";

  if (!email) {
    alert("Не найден email.");
    return;
  }

  if (!code) {
    alert("Введите код из письма.");
    return;
  }

  if (!newPassword || !newPassword2) {
    alert("Введите новый пароль и подтверждение.");
    return;
  }

  try {
    const user = await apiFetch("/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({
        email,
        code,
        new_password: newPassword,
        new_password_confirm: newPassword2
      })
    });

    setUser(user);

    if (typeof window.cotelRefreshTelegramState === "function") {
      await window.cotelRefreshTelegramState();
    }

    stopResetResendCooldown();
    closeAuthModal();
  } catch (err) {
    const detail = err?.detail?.detail || err?.detail || "";

    if (detail === "PASSWORD_MISMATCH") {
      alert("Пароли не совпадают.");
      return;
    }

    if (detail === "PASSWORD_TOO_SHORT") {
      alert("Пароль слишком короткий.");
      return;
    }

    if (detail === "PASSWORD_TOO_WEAK") {
      alert("Пароль слишком слабый.");
      return;
    }

    if (detail === "CODE_EXPIRED") {
      alert("Код истёк.");
      return;
    }

    if (detail === "CODE_ALREADY_USED") {
      alert("Этот код уже использован.");
      return;
    }

    if (detail === "TOO_MANY_ATTEMPTS") {
      alert("Слишком много неверных попыток. Запросите новый код.");
      return;
    }

    if (
      detail === "CODE_INVALID" ||
      detail === "CODE_NOT_FOUND" ||
      detail === "CODE_REQUIRED"
    ) {
      alert("Неверный или просроченный код.");
      return;
    }

    alert("Не удалось сбросить пароль.");
  }
}

async function handleResendPasswordResetCode() {
  const email =
    byId("reset-confirm-email")?.value.trim().toLowerCase() ||
    resetEmail ||
    "";

  if (!email) {
    alert("Не найден email для повторной отправки кода.");
    switchAuthView("start");
    return;
  }

  try {
    await apiFetch("/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email })
    });

    resetEmail = email;
    startResetResendCooldown();
    alert("Новый код отправлен на почту.");
  } catch (err) {
    const detail = err?.detail?.detail || err?.detail || "";

    if (typeof detail === "object" && detail?.code === "RESET_RESEND_COOLDOWN") {
      const retryAfter = Number(detail.retry_after_sec || RESET_RESEND_COOLDOWN_SEC);
      startResetResendCooldown(retryAfter);
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
  byId("quick-logout-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    handleLogout();
  });

  byId("user-profile-trigger")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!currentUser) return;
    toggleUserDropdown();
  });

    byId("forgot-password-btn")?.addEventListener("click", () => {
    const email = byId("login-email")?.value.trim().toLowerCase() || pendingEmail || "";
    if (byId("reset-request-email")) {
      byId("reset-request-email").value = email;
    }
    switchAuthView("reset-request");
  });

  byId("reset-request-submit")?.addEventListener("click", handlePasswordResetRequest);

  byId("reset-request-back")?.addEventListener("click", () => {
    byId("login-email").value = pendingEmail || byId("reset-request-email")?.value || "";
    switchAuthView("login");
  });

  byId("reset-confirm-submit")?.addEventListener("click", handlePasswordResetConfirm);
  byId("reset-resend")?.addEventListener("click", handleResendPasswordResetCode);

  byId("reset-confirm-back")?.addEventListener("click", () => {
    if (byId("reset-request-email")) {
      byId("reset-request-email").value =
        byId("reset-confirm-email")?.value.trim() || resetEmail || "";
    }
    switchAuthView("reset-request");
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
    alert("Смену пароля подключим следующим этапом.");
  });

  byId("delete-profile-btn")?.addEventListener("click", () => {
    alert("Удаление профиля подключим следующим этапом.");
  });

  document.querySelectorAll(".profile-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchProfileTab(btn.dataset.profileTab);
    });
  });

  byId("profile-language")?.addEventListener("change", handleProfileLanguageChange);
  byId("save-profile-btn")?.addEventListener("click", handleSaveProfile);
  byId("auth-modal")?.addEventListener("click", (e) => {
    const content = document.querySelector(".auth-modal-content");

    // блокируем всплытие кликов внутри модалки
    if (content && content.contains(e.target)) {
      e.stopPropagation();
    }

    // ничего НЕ делаем при клике вне — модалка не закрывается
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

function formatSubscriptionFrequency(minutes) {
  const value = Number(minutes || 0);

  if (!value) return "—";
  if (value < 60) return `не чаще 1 раза в ${value} мин`;
  if (value % 60 === 0) {
    const hours = value / 60;
    return hours === 1
      ? "не чаще 1 раза в 1 час"
      : `не чаще 1 раза в ${hours} ч`;
  }

  return `не чаще 1 раза в ${value} мин`;
}

function setPlanUsageSnapshot(snapshot) {
  currentPlanUsage = snapshot || null;
  window.currentPlanUsage = currentPlanUsage;
}

async function fetchPlanUsageSnapshot() {
  try {
    const snapshot = await apiFetch("/account/plan-usage", { method: "GET" });
    setPlanUsageSnapshot(snapshot);
    return snapshot;
  } catch (err) {
    console.warn("Plan usage load failed", err);
    return null;
  }
}

function applyUsageFromPayload(payload) {
  if (payload && payload.usage) {
    setPlanUsageSnapshot(payload.usage.plan ? payload.usage : payload);
    renderProfileLimits();

    if (typeof window.cotelRefreshLimitBoundControls === "function") {
      window.cotelRefreshLimitBoundControls();
    }
  }
}

window.cotelApplyUsageFromPayload = applyUsageFromPayload;
window.cotelRefreshPlanUsageSnapshot = fetchPlanUsageSnapshot;

function renderProfileLimits() {
  const plan = currentPlanUsage?.plan || null;
  const usage = currentPlanUsage?.usage || null;

  if (!plan || !usage) return;

  const setText = (id, value) => {
    const el = byId(id);
    if (el) el.textContent = String(value ?? "—");
  };

  setText("profile-limit-daily-used", usage.daily_used ?? 0);
  setText("profile-limit-daily-total", plan.daily_qa_limit ?? 0);

  setText("profile-limit-monthly-used", usage.monthly_used ?? 0);
  setText("profile-limit-monthly-total", plan.monthly_qa_limit ?? 0);

  setText("profile-limit-subs-used", usage.active_subscriptions ?? 0);
  setText("profile-limit-subs-total", plan.max_active_subscriptions ?? 0);

  setText("profile-limit-history-days", plan.qa_history_days ?? 0);

  const frequencyEl = byId("profile-limit-frequency-text");
  if (frequencyEl) {
    frequencyEl.textContent = formatSubscriptionFrequency(plan.min_subscription_interval_minutes);
  }

  const chatHistoryEl = byId("profile-limit-chat-history");
  if (chatHistoryEl) {
    chatHistoryEl.textContent = plan.has_chat_history ? "доступна" : "недоступна";
  }

  const trialCard = byId("profile-trial-card");
  if (trialCard) {
    trialCard.style.display = "none";
  }

  let subsNote = byId("profile-limit-subs-note");
  const subsUsedEl = byId("profile-limit-subs-used");
  const subsCard = subsUsedEl?.closest(".profile-limit-card");

  if (!subsNote && subsCard) {
    subsNote = document.createElement("div");
    subsNote.id = "profile-limit-subs-note";
    subsNote.className = "profile-limit-card-note";
    subsCard.appendChild(subsNote);
  }

  if (subsNote) {
    const planCode = String(plan.code || "").toLowerCase();

    if (planCode === "free" && usage.free_trial_expired) {
      subsNote.textContent = "Действие пробных подписок завершено.";
      subsNote.style.display = "block";
    } else {
      subsNote.textContent = "";
      subsNote.style.display = "none";
    }
  }
}

function switchProfileTab(tabName) {
  document.querySelectorAll(".profile-tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.profileTab === tabName);
  });

  document.querySelectorAll(".profile-tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.profilePanel === tabName);
  });
}

function captureProfileFormState() {
  const language = byId("profile-language")?.value || "en";
  const timezone = normalizeTimezone(byId("profile-timezone")?.value || "UTC");
  const ultraSecureLogout = !!byId("ultra-secure-logout")?.checked;

  let phone = "";
  const phoneInput = byId("profile-phone");
  if (phoneInput) {
    phone = getNormalizedPhoneFromInstance(profilePhoneIti, phoneInput) || "";
  }

  return {
    language,
    timezone,
    ultraSecureLogout,
    phone,
  };
}

function updateProfileDirtyState() {
  const modal = byId("profile-modal");
  if (!modal || !profileInitialState) return;

  const currentState = captureProfileFormState();

  profileIsDirty =
    currentState.language !== profileInitialState.language ||
    currentState.timezone !== profileInitialState.timezone ||
    currentState.ultraSecureLogout !== profileInitialState.ultraSecureLogout ||
    currentState.phone !== profileInitialState.phone;

  modal.classList.toggle("profile-dirty", profileIsDirty);
}

function resetProfileDirtyState() {
  profileInitialState = captureProfileFormState();
  profileIsDirty = false;
  byId("profile-modal")?.classList.remove("profile-dirty");
}

function bindProfileDirtyWatchers() {
  byId("profile-language")?.addEventListener("change", updateProfileDirtyState);
  byId("profile-timezone")?.addEventListener("change", updateProfileDirtyState);
  byId("ultra-secure-logout")?.addEventListener("change", updateProfileDirtyState);

  const phoneInput = byId("profile-phone");
  if (phoneInput) {
    phoneInput.addEventListener("input", updateProfileDirtyState);
    phoneInput.addEventListener("change", updateProfileDirtyState);
    phoneInput.addEventListener("blur", updateProfileDirtyState);
  }
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

async function openProfileModal() {
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

  const ultraSecureLogoutEl = byId("ultra-secure-logout");
  if (ultraSecureLogoutEl) {
    ultraSecureLogoutEl.checked = !!currentUser?.logout_revokes_telegram;
  }

  byId("profile-email-header").textContent = email;
  byId("profile-email-static").textContent = email;
  byId("profile-avatar-img").src = avatarSrc;
  byId("profile-country").textContent = countryValue;

  buildTimezoneOptions(
    "profile-timezone",
    currentUser?.timezone || detectBrowserTimezone()
  );

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

  await fetchPlanUsageSnapshot();
  renderProfileLimits();
  switchProfileTab("limits");

  byId("profile-modal")?.classList.remove("hidden");

    requestAnimationFrame(() => {
    initProfilePhoneInput();

    if (profilePhoneIti) {
      if (currentUser?.phone) {
        profilePhoneIti.setNumber(currentUser.phone);
      } else {
        profilePhoneIti.setCountry(getDefaultPhoneCountryIso2());
      }
    }

    bindProfileDirtyWatchers();
    resetProfileDirtyState();
  });
}


async function handleSaveProfile() {
  if (!currentUser) return;
  if (!profileIsDirty) return;

  const language = normalizeLanguage(byId("profile-language")?.value || "en");
  const timezone = normalizeTimezone(byId("profile-timezone")?.value || "UTC");
  const logoutRevokesTelegram = !!byId("ultra-secure-logout")?.checked;

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
        timezone,
        logout_revokes_telegram: logoutRevokesTelegram,
        phone: phone || null
      })
    });

    setUser(updatedUser);

    resetProfileDirtyState();

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

    if (detail === "TIMEZONE_INVALID") {
      alert("Выбран некорректный часовой пояс.");
      return;
    }

    alert("Не удалось сохранить изменения профиля.");
  }
}

function closeProfileModal(force = false) {
  if (!force && profileIsDirty) {
    const shouldSave = window.confirm("Сохранить внесённые изменения?");
    if (shouldSave) {
      handleSaveProfile();
      return;
    }
  }

  byId("profile-modal")?.classList.add("hidden");
  profileIsDirty = false;
  profileInitialState = null;
  byId("profile-modal")?.classList.remove("profile-dirty");
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
  buildTimezoneOptions("register-timezone", detectBrowserTimezone());
  buildTimezoneOptions("profile-timezone", currentUser?.timezone || detectBrowserTimezone());
  bindCountryField();
  bindAuthUi();
  bindPasswordToggles();

  initTelegramPhoneInput();
  applyTelegramPhoneFromCurrentUser();
  bootstrapAuth();
  initCookieBanner();
  
});