/**
 * CoTel — light/dark theme toggle.
 *
 * Markup (injected next to the language switcher in .navigation):
 *   <div class="theme-toggle">
 *     <button id="themeToggleBtn" class="theme-toggle__button" ...>
 *       <svg class="theme-toggle__icon theme-toggle__icon--moon">...</svg>
 *       <svg class="theme-toggle__icon theme-toggle__icon--sun">...</svg>
 *     </button>
 *   </div>
 *
 * Theme state lives in <html data-theme="dark|light">. To avoid a flash of the
 * wrong theme (FOUC), the initial value is applied by a tiny inline <head>
 * script BEFORE stylesheets paint — see new-analysis.html. This file only adds
 * the toggle behavior and keeps the button's a11y state in sync.
 *
 * Resolution order: explicit user choice (localStorage) → OS preference.
 * Idempotent: loading twice is safe.
 */
(function () {
  "use strict";

  if (window.__cotelThemeToggleBound) return;
  window.__cotelThemeToggleBound = true;

  var STORAGE_KEY = "cotel_theme"; // "dark" | "light"

  // Без явного выбора пользователя тема определяется по времени суток:
  // с 21:00 до 07:00 — тёмная, иначе светлая (как в большинстве приложений).
  function timeBasedDark() {
    try {
      var h = new Date().getHours();
      return h >= 21 || h < 7;
    } catch (_) { return false; }
  }

  function storedTheme() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
  }

  function resolveTheme() {
    var s = storedTheme();
    if (s === "dark" || s === "light") return s;
    return timeBasedDark() ? "dark" : "light";
  }

  function applyTheme(theme) {
    var dark = theme === "dark";
    if (dark) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.setAttribute("data-theme", "light");
    }
    syncButton(dark);
  }

  function syncButton(dark) {
    var btn = document.getElementById("themeToggleBtn");
    if (!btn) return;
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
    // Label/title describe the ACTION (what a click does).
    var key = dark ? "common:theme_toggle.to_light" : "common:theme_toggle.to_dark";
    var fallback = dark ? "Switch to light theme" : "Switch to dark theme";
    var label = fallback;
    try {
      if (window.i18next && typeof window.i18next.t === "function") {
        var t = window.i18next.t(key);
        if (t && t !== key) label = t;
      }
    } catch (_) { /* keep fallback */ }
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
  }

  function setTheme(theme) {
    applyTheme(theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) { /* ignore */ }
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark" : "light";
  }

  function bind() {
    // Make sure DOM reflects resolved theme (inline head script may not have run
    // on pages that include this file without the pre-paint snippet).
    applyTheme(currentTheme() === "dark" || resolveTheme() === "dark" ? currentTheme() : resolveTheme());

    var btn = document.getElementById("themeToggleBtn");
    if (!btn) return;

    syncButton(currentTheme() === "dark");

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      setTheme(currentTheme() === "dark" ? "light" : "dark");
    });

    // Re-label on language change.
    try {
      if (typeof i18next !== "undefined" && typeof i18next.on === "function") {
        i18next.on("languageChanged", function () {
          syncButton(currentTheme() === "dark");
        });
      }
    } catch (_) { /* ignore */ }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
