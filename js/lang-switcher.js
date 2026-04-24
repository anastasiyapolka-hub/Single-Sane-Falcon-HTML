/**
 * CoTel — header language switcher.
 *
 * Attaches behavior to the markup injected by navigation:
 *   <div class="lang-switcher">
 *     <button id="langSwitcherBtn" ...>
 *       <img class="lang-switcher__globe" ... />
 *     </button>
 *     <ul id="langSwitcherMenu" class="lang-switcher__menu" hidden>
 *       <li><button class="lang-switcher__item" data-lang="en">English</button></li>
 *       <li><button class="lang-switcher__item" data-lang="ru">Русский</button></li>
 *     </ul>
 *   </div>
 *
 * Behavior:
 *   - click on button → toggle dropdown
 *   - click on item   → apply language
 *   - click outside / Escape → close dropdown
 *   - highlight the active language with aria-current="true"
 *
 * Language switch path (preferred → fallback):
 *   1. window.setManualLanguage(lang)
 *      - defined in auth.js, handles localStorage + i18next + PATCH /auth/preferences
 *        (the last step only fires for logged-in users; guests get just localStorage + i18next)
 *   2. window.cotelI18n.changeLanguage(lang) + localStorage write
 *      - used on pages that don't load auth.js (e.g. index.html landing page)
 *
 * This file is idempotent — loading it twice is safe (guarded by `__cotelLangSwitcherBound`).
 */
(function () {
  "use strict";

  if (window.__cotelLangSwitcherBound) return;
  window.__cotelLangSwitcherBound = true;

  const MANUAL_KEY = "cotel_language_manual";

  function normalize(lang) {
    const s = String(lang || "").toLowerCase();
    return s.startsWith("ru") ? "ru" : "en";
  }

  function getActiveLang() {
    // Ask i18next first — it's the authoritative UI language.
    try {
      if (window.cotelI18n && typeof window.cotelI18n.getLanguage === "function") {
        return normalize(window.cotelI18n.getLanguage());
      }
    } catch (_) { /* fall through */ }
    try {
      const manual = localStorage.getItem(MANUAL_KEY);
      if (manual) return normalize(manual);
    } catch (_) { /* ignore */ }
    return "en";
  }

  async function applyLanguage(lang) {
    const normalized = normalize(lang);

    // Preferred: auth.js setManualLanguage — handles localStorage, i18next,
    // and (if the user is logged in) PATCH /auth/preferences.
    if (typeof window.setManualLanguage === "function") {
      try {
        await window.setManualLanguage(normalized);
        return;
      } catch (err) {
        console.warn("[lang-switcher] setManualLanguage failed; falling back", err);
      }
    }

    // Fallback (pages without auth.js): persist manual choice + switch i18next.
    try { localStorage.setItem(MANUAL_KEY, normalized); } catch (_) { /* ignore */ }
    try { document.documentElement.lang = normalized; } catch (_) { /* ignore */ }
    if (window.cotelI18n && typeof window.cotelI18n.changeLanguage === "function") {
      try { await window.cotelI18n.changeLanguage(normalized); } catch (_) { /* ignore */ }
    }
  }

  function refreshActiveMark(menu) {
    const active = getActiveLang();
    const items = menu.querySelectorAll(".lang-switcher__item[data-lang]");
    items.forEach(function (item) {
      if (item.getAttribute("data-lang") === active) {
        item.setAttribute("aria-current", "true");
      } else {
        item.removeAttribute("aria-current");
      }
    });
  }

  function bind() {
    const btn = document.getElementById("langSwitcherBtn");
    const menu = document.getElementById("langSwitcherMenu");
    if (!btn || !menu) return;

    refreshActiveMark(menu);

    function openMenu() {
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      refreshActiveMark(menu);
    }

    function closeMenu() {
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    }

    function toggleMenu() {
      if (menu.hidden) openMenu();
      else closeMenu();
    }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleMenu();
    });

    menu.addEventListener("click", function (e) {
      const target = e.target.closest(".lang-switcher__item[data-lang]");
      if (!target) return;
      e.stopPropagation();
      const lang = target.getAttribute("data-lang");
      applyLanguage(lang).finally(function () {
        refreshActiveMark(menu);
        closeMenu();
        btn.focus();
      });
    });

    // Close on outside click.
    document.addEventListener("click", function (e) {
      if (menu.hidden) return;
      if (e.target === btn || btn.contains(e.target)) return;
      if (e.target === menu || menu.contains(e.target)) return;
      closeMenu();
    });

    // Close on Escape.
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !menu.hidden) {
        closeMenu();
        btn.focus();
      }
    });

    // If the language changes elsewhere (e.g. profile modal), update the mark.
    if (typeof i18next !== "undefined" && typeof i18next.on === "function") {
      i18next.on("languageChanged", function () {
        refreshActiveMark(menu);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
