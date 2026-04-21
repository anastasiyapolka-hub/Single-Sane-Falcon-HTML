/**
 * CoTel i18n layer (wrapper around i18next)
 *
 * This module does NOT redefine language detection — that logic lives in
 * auth.js (getEffectiveLanguage, normalizeLanguage, etc). We simply mirror
 * the current language into i18next and expose helpers for the DOM and JS.
 *
 * Public API (on window.cotelI18n):
 *   - init(options)              -> initializes i18next once, returns a Promise
 *   - t(key, params)             -> returns the translated string
 *   - changeLanguage(lang)       -> switches language and re-applies to DOM
 *   - applyTranslations(root)    -> walks `root` (or document) and fills
 *                                   data-i18n / data-i18n-placeholder /
 *                                   data-i18n-title / data-i18n-aria-label
 *   - getLanguage()              -> current i18next language
 *   - ready                      -> Promise that resolves on first init
 *
 * Usage on a page:
 *   window.cotelI18n.init({ namespaces: ['common', 'new-analysis'] });
 *
 * auth.js also calls window.cotelI18n.changeLanguage(lang) whenever the
 * effective language changes (browser detect, manual switch, user loaded).
 */

(function () {
  "use strict";

  // If i18next failed to load from CDN, we still want the page to work.
  // We expose a no-op stub so callers don't crash.
  if (typeof i18next === "undefined") {
    console.warn("[i18n] i18next is not loaded. UI translations disabled.");
    window.cotelI18n = {
      init: function () { return Promise.resolve(); },
      t: function (key) { return key; },
      changeLanguage: function () { return Promise.resolve(); },
      applyTranslations: function () {},
      getLanguage: function () { return "en"; },
      ready: Promise.resolve()
    };
    return;
  }

  const DEFAULT_NAMESPACES = ["common"];
  const SUPPORTED_LANGUAGES = ["en", "ru"];
  const FALLBACK_LANGUAGE = "en";

  // DOM attributes the loader understands.
  const DOM_BINDINGS = [
    { attr: "data-i18n",             target: "text" },
    { attr: "data-i18n-html",        target: "html" },
    { attr: "data-i18n-placeholder", target: "placeholder" },
    { attr: "data-i18n-title",       target: "title" },
    { attr: "data-i18n-aria-label",  target: "aria-label" },
    { attr: "data-i18n-alt",         target: "alt" },
    { attr: "data-i18n-value",       target: "value" }
  ];

  let initialized = false;
  let initPromise = null;

  function normalize(lang) {
    const s = String(lang || "").toLowerCase();
    if (s.startsWith("ru")) return "ru";
    return "en";
  }

  function resolveStartupLanguage() {
    // Prefer the existing project logic if available.
    try {
      if (typeof getEffectiveLanguage === "function") {
        return normalize(getEffectiveLanguage());
      }
    } catch (err) {
      // Fall through.
    }
    // Fallback for pages that don't load auth.js (e.g. pricing.html):
    // read the same localStorage keys auth.js uses so the manual
    // language choice is still respected.
    try {
      if (typeof localStorage !== "undefined") {
        const manual = localStorage.getItem("cotel_language_manual");
        if (manual) return normalize(manual);
        const auto = localStorage.getItem("cotel_language_auto");
        if (auto) return normalize(auto);
        // auth.js also persists a full user_prefs blob with `language`.
        const rawPrefs = localStorage.getItem("cotel_user_prefs");
        if (rawPrefs) {
          try {
            const prefs = JSON.parse(rawPrefs);
            if (prefs && prefs.language) return normalize(prefs.language);
          } catch (_) { /* ignore bad JSON */ }
        }
      }
    } catch (_) { /* ignore storage errors */ }
    const nav = (navigator.language || "").toLowerCase();
    return nav.startsWith("ru") ? "ru" : "en";
  }

  function init(options) {
    const opts = options || {};
    const extraNamespaces = Array.from(
      new Set(DEFAULT_NAMESPACES.concat(opts.namespaces || []))
    );

    // Subsequent init() calls: just load any new namespaces.
    if (initialized) {
      return initPromise.then(function () {
        return i18next.loadNamespaces(extraNamespaces);
      }).then(function () {
        applyTranslations(document);
        return i18next;
      });
    }

    initialized = true;
    const startupLang = resolveStartupLanguage();

    const config = {
      lng: startupLang,
      fallbackLng: FALLBACK_LANGUAGE,
      supportedLngs: SUPPORTED_LANGUAGES,
      ns: extraNamespaces,
      defaultNS: "common",
      load: "languageOnly",
      backend: {
        loadPath: "/locales/{{lng}}/{{ns}}.json"
      },
      interpolation: {
        escapeValue: false
      },
      saveMissing: true,
      missingKeyHandler: function (lngs, ns, key) {
        // Surfaces missing keys in the browser console during development.
        // Safe in production: it does not send anything to the server.
        // Suppress warnings for namespaces that haven't finished loading —
        // those are race conditions (code runs before async JSON arrives),
        // not real missing keys. The tI18n() wrapper handles them via
        // fallback strings, so the UI is unaffected.
        try {
          if (i18next && typeof i18next.hasLoadedNamespace === "function") {
            const lang = Array.isArray(lngs) ? lngs[0] : lngs;
            if (!i18next.hasLoadedNamespace(ns, { lng: lang })) return;
          }
        } catch (_) { /* fall through */ }
        console.warn("[i18n] Missing key:", ns + ":" + key, "lngs=", lngs);
      }
    };

    let chain = i18next;
    if (typeof i18nextHttpBackend !== "undefined") {
      chain = chain.use(i18nextHttpBackend);
    }

    initPromise = chain.init(config).then(function () {
      applyTranslations(document);
      i18next.on("languageChanged", function () {
        applyTranslations(document);
      });
      return i18next;
    }).catch(function (err) {
      console.error("[i18n] Init failed:", err);
    });

    return initPromise;
  }

  function t(key, params) {
    if (!i18next.isInitialized) return key;
    return i18next.t(key, params);
  }

  function changeLanguage(lang) {
    const normalized = normalize(lang);
    if (!i18next.isInitialized) {
      // If init hasn't happened yet, queue the language so it's picked up.
      if (initPromise) {
        return initPromise.then(function () {
          return i18next.changeLanguage(normalized);
        });
      }
      return Promise.resolve();
    }
    if (i18next.language === normalized) return Promise.resolve();
    return i18next.changeLanguage(normalized);
  }

  function getLanguage() {
    if (!i18next.isInitialized) return resolveStartupLanguage();
    return normalize(i18next.language);
  }

  function applyTranslations(root) {
    const scope = root || document;
    if (!i18next.isInitialized) return;

    DOM_BINDINGS.forEach(function (binding) {
      const selector = "[" + binding.attr + "]";
      const nodes = scope.querySelectorAll
        ? scope.querySelectorAll(selector)
        : [];

      nodes.forEach(function (node) {
        const key = node.getAttribute(binding.attr);
        if (!key) return;

        // Read optional JSON params from data-i18n-params
        let params = undefined;
        const rawParams = node.getAttribute("data-i18n-params");
        if (rawParams) {
          try { params = JSON.parse(rawParams); } catch (_) { /* ignore */ }
        }

        // Check if the namespace for this key is loaded. If not, skip —
        // this preserves existing fallback text on the page until the
        // namespace arrives (e.g. async loadNamespaces call).
        const nsSep = key.indexOf(":");
        if (nsSep > -1) {
          const ns = key.slice(0, nsSep);
          if (!i18next.hasLoadedNamespace(ns)) return;
        }

        const value = i18next.t(key, params);

        // If i18next couldn't resolve the key (returns key unchanged),
        // skip to preserve the original fallback text rendered in HTML.
        if (value === key) return;

        switch (binding.target) {
          case "text":
            node.textContent = value;
            break;
          case "html":
            node.innerHTML = value;
            break;
          case "placeholder":
            node.setAttribute("placeholder", value);
            break;
          case "title":
            node.setAttribute("title", value);
            break;
          case "aria-label":
            node.setAttribute("aria-label", value);
            break;
          case "alt":
            node.setAttribute("alt", value);
            break;
          case "value":
            node.setAttribute("value", value);
            if ("value" in node) node.value = value;
            break;
          default:
            break;
        }
      });
    });
  }

  // Auto-init with the default namespace so generic pages work without
  // explicitly calling init(). Pages that need extra namespaces can still
  // call init({ namespaces: [...] }) — the call is idempotent.
  const autoInitPromise = init({ namespaces: DEFAULT_NAMESPACES });

  window.cotelI18n = {
    init: init,
    t: t,
    changeLanguage: changeLanguage,
    applyTranslations: applyTranslations,
    getLanguage: getLanguage,
    ready: autoInitPromise
  };
})();
