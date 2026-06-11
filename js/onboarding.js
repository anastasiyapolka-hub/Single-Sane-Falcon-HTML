/* ============================================================================
 * CoTel — онбординг-тур (product tour).
 *
 * Лёгкий guided tour поверх существующего визуального языка поповеров
 * (.cotel-popover). Без сторонних библиотек, без расширения БД — состояние
 * хранится в localStorage.
 *
 * Состояние:  localStorage["cotel:onboarding:v1"] = "later" | "skipped" | "done"
 *   нет ключа → новый пользователь, показываем приглашение один раз
 *   later     → отказался в приглашении, сам больше не всплывает
 *   skipped   → прервал тур, сам больше не всплывает
 *   done      → прошёл до конца
 * Версия v1 в ключе — задел: для обновлённого тура заведём v2.
 *
 * Запуск:
 *   - автоматически: приглашение через INVITE_DELAY_MS после загрузки, если
 *     ключа ещё нет и нет открытых модалок / экрана логина;
 *   - вручную: window.startOnboardingTour() (кнопка «Пройти обучение заново»
 *     в настройках профиля) — игнорирует localStorage.
 * ========================================================================== */

(function () {
  "use strict";

  const STORAGE_KEY = "cotel:onboarding:v1";
  // Мини-задержка перед приглашением (по согласованию — 1–2 минуты).
  const INVITE_DELAY_MS = 90000;

  // --- мелкие утилиты -------------------------------------------------------

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (sel) => (sel ? document.querySelector(sel) : null);

  function isVisible(el) {
    if (!el) return false;
    if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // Безопасный перевод: i18next через window.tI18n(key, defaultValue), с фолбэком.
  function t(key, fallback) {
    try {
      if (typeof window.tI18n === "function") {
        const v = window.tI18n(key, fallback);
        if (v && v !== key) return v;
      }
    } catch (_) { /* ignore */ }
    return fallback;
  }

  function getState() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
  }
  function setState(v) {
    try { localStorage.setItem(STORAGE_KEY, v); } catch (_) { /* ignore */ }
  }

  // --- хелперы под особенности интерфейса CoTel -----------------------------

  // Период / глубина / групповой / медиа лежат внутри сворачиваемого блока
  // «Настройки запроса» (#querySettingsInlineBody, по умолчанию hidden).
  async function ensureSettingsExpanded() {
    const body = document.getElementById("querySettingsInlineBody");
    const toggle = document.getElementById("querySettingsInlineToggle");
    if (body && body.classList.contains("hidden") && toggle) {
      toggle.click();
      await wait(280);
    }
  }

  let profileOpenedByTour = false;

  function isProfileOpen() {
    const m = document.getElementById("profile-modal");
    return !!m && !m.classList.contains("hidden");
  }

  // Привести профиль к нужному состоянию для шага (открыть/закрыть, вкладка).
  async function ensureProfileState(step) {
    if (step && step.inProfile) {
      if (!isProfileOpen() && typeof window.openProfileModal === "function") {
        await window.openProfileModal();
        profileOpenedByTour = true;
        await wait(300);
      }
      if (step.tab && typeof window.switchProfileTab === "function") {
        window.switchProfileTab(step.tab);
        await wait(260);
      }
    } else if (isProfileOpen() && profileOpenedByTour) {
      if (typeof window.closeProfileModal === "function") {
        window.closeProfileModal(true);
      }
      profileOpenedByTour = false;
      await wait(220);
    }
  }

  // --- определение шагов -----------------------------------------------------
  // anchor — CSS-селектор; before — асинхронная подготовка; skipIf — пропуск.

  const STEPS = [
    {
      anchor: "#dataSourceSection",
      titleKey: "new-analysis:onboarding.s_tg_title",
      titleFb: "Сначала — доступ к чатам",
      bodyKey: "new-analysis:onboarding.s_tg_body",
      bodyFb: "Подключите свой Telegram (по QR или номеру) — или используйте служебный аккаунт CoTel для публичных каналов, без подключения личного. Без этого у сервиса нет доступа к истории сообщений для анализа.",
      noteKey: "new-analysis:onboarding.s_tg_note",
      noteFb: "Мы не храним вашу историю сообщений и обрабатываем данные только по вашему запросу.",
      skipIf: () => isVisible(document.getElementById("tgStateConnected")),
    },
    {
      anchor: "#activeChatInput",
      titleKey: "new-analysis:onboarding.s_chat_title",
      titleFb: "Вставьте чат, канал или группу",
      bodyKey: "new-analysis:onboarding.s_chat_body",
      bodyFb: "Ссылка вида t.me/…, @username или выбор из списка ваших чатов. Это источник данных, который CoTel прочитает. В поле работает быстрый поиск при вводе по строке.",
    },
    {
      anchor: "#queryDaysInput",
      before: ensureSettingsExpanded,
      titleKey: "new-analysis:onboarding.s_period_title",
      titleFb: "За какой срок читать",
      bodyKey: "new-analysis:onboarding.s_period_body",
      bodyFb: "Выберите период: минуты, часы или дни. Чем больше период — тем больше сообщений CoTel прочитает (и тем дороже запрос в токенах).",
    },
    {
      anchor: "#queryDepthSelector",
      before: ensureSettingsExpanded,
      titleKey: "new-analysis:onboarding.s_depth_title",
      titleFb: "Выберите глубину, а не модель",
      bodyKey: "new-analysis:onboarding.s_depth_body",
      bodyFb: "Лёгкий — для большинства задач (быстро и экономно). Сбалансированный и Глубокий — для сложной аналитики. Какую AI-модель использовать, CoTel решает сам. Нажмите ⓘ, чтобы увидеть примерную стоимость каждого уровня.",
    },
    {
      anchor: "#queryGroupModeRow",
      before: ensureSettingsExpanded,
      titleKey: "new-analysis:onboarding.s_group_title",
      titleFb: "Несколько чатов сразу",
      bodyKey: "new-analysis:onboarding.s_group_body",
      bodyFb: "Включите, чтобы задать один вопрос сразу нескольким чатам и получить сводный ответ. Количество чатов зависит от тарифа.",
    },
    {
      anchor: "#queryMediaFilterRow",
      before: ensureSettingsExpanded,
      titleKey: "new-analysis:onboarding.s_media_title",
      titleFb: "Только нужные медиа",
      bodyKey: "new-analysis:onboarding.s_media_body",
      bodyFb: "Нужны лишь сообщения с видео, фото, аудио, документами или ссылками? Включите медиафильтр и выберите типы.",
    },
    {
      anchor: "#queryInput",
      titleKey: "new-analysis:onboarding.s_query_title",
      titleFb: "Задайте вопрос своими словами",
      bodyKey: "new-analysis:onboarding.s_query_body",
      bodyFb: "Например: «о чём говорили за неделю», «найди вакансии Python, удалёнка», «собери ссылки на статьи». При поиске с медиафильтром поле можно оставлять пустым.",
    },
    {
      anchor: "#analyzeBtn",
      titleKey: "new-analysis:onboarding.s_run_title",
      titleFb: "Готово — запускаем",
      bodyKey: "new-analysis:onboarding.s_run_body",
      bodyFb: "Нажмите, чтобы получить структурированный ответ. Сколько токенов списалось — покажем под результатом, с расшифровкой.",
    },
    {
      anchor: "#addSubscriptionBtn",
      titleKey: "new-analysis:onboarding.s_subs_title",
      titleFb: "Слежение в фоне",
      bodyKey: "new-analysis:onboarding.s_subs_body",
      bodyFb: "Подписки сами проверяют выбранные чаты по расписанию и присылают уведомление в Telegram, когда появляется важное. Удобно для мониторинга новостей, вакансий, упоминаний.",
    },
    {
      anchor: ".profile-tokens-card",
      inProfile: true,
      tab: "limits",
      titleKey: "new-analysis:onboarding.s_tokens_title",
      titleFb: "Токены — внутренняя валюта",
      bodyKey: "new-analysis:onboarding.s_tokens_body",
      bodyFb: "Ими оплачиваются запросы и подписки. Здесь, в профиле, виден ваш баланс, текущий тариф и когда обновится месячный лимит.",
    },
    {
      anchor: '[data-profile-tab="history"]',
      inProfile: true,
      tab: "history",
      titleKey: "new-analysis:onboarding.s_history_title",
      titleFb: "История запросов и обучение",
      bodyKey: "new-analysis:onboarding.s_history_body",
      bodyFb: "На вкладке «История запросов» видно, что и когда вы анализировали и сколько токенов ушло. А запустить это обучение заново можно в любой момент из настроек профиля.",
    },
  ];

  // --- DOM-слой тура ---------------------------------------------------------

  let blockerEl = null;
  let spotlightEl = null;
  let cardEl = null;
  let activeSteps = [];
  let idx = 0;
  let repositionRaf = 0;

  function buildLayer() {
    blockerEl = document.createElement("div");
    blockerEl.className = "tour-blocker";

    spotlightEl = document.createElement("div");
    spotlightEl.className = "tour-spotlight";

    cardEl = document.createElement("div");
    cardEl.className = "tour-card";
    cardEl.setAttribute("role", "dialog");
    cardEl.setAttribute("aria-modal", "true");

    document.body.appendChild(blockerEl);
    document.body.appendChild(spotlightEl);
    document.body.appendChild(cardEl);

    window.addEventListener("resize", scheduleReposition);
    window.addEventListener("scroll", scheduleReposition, true);
    document.addEventListener("keydown", onKeydown, true);
  }

  function destroyLayer() {
    window.removeEventListener("resize", scheduleReposition);
    window.removeEventListener("scroll", scheduleReposition, true);
    document.removeEventListener("keydown", onKeydown, true);
    [blockerEl, spotlightEl, cardEl].forEach((el) => el && el.remove());
    blockerEl = spotlightEl = cardEl = null;
  }

  function onKeydown(e) {
    if (e.key === "Escape") { e.preventDefault(); endTour("skipped"); }
  }

  function scheduleReposition() {
    if (repositionRaf) return;
    repositionRaf = requestAnimationFrame(() => {
      repositionRaf = 0;
      const step = activeSteps[idx];
      const el = step && q(step.anchor);
      if (el && isVisible(el)) positionFor(el);
    });
  }

  // Разместить spotlight вокруг элемента и карточку рядом.
  function positionFor(anchorEl) {
    const pad = 6;
    const r = anchorEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Вырез.
    spotlightEl.style.top = Math.max(0, r.top - pad) + "px";
    spotlightEl.style.left = Math.max(0, r.left - pad) + "px";
    spotlightEl.style.width = Math.min(vw, r.width + pad * 2) + "px";
    spotlightEl.style.height = Math.min(vh, r.height + pad * 2) + "px";

    // Карточка.
    const cw = cardEl.offsetWidth || 300;
    const ch = cardEl.offsetHeight || 160;
    const gap = 14;
    let left, top;

    const isMobile = vw <= 640;
    if (isMobile) {
      // На узких экранах — фиксируем снизу по центру.
      left = Math.max(12, (vw - cw) / 2);
      top = vh - ch - 16;
    } else if (r.right + gap + cw <= vw - 8) {
      left = r.right + gap;
      top = r.top + r.height / 2 - ch / 2;
    } else if (r.left - gap - cw >= 8) {
      left = r.left - gap - cw;
      top = r.top + r.height / 2 - ch / 2;
    } else if (r.bottom + gap + ch <= vh - 8) {
      top = r.bottom + gap;
      left = r.left + r.width / 2 - cw / 2;
    } else {
      top = r.top - gap - ch;
      left = r.left + r.width / 2 - cw / 2;
    }

    left = Math.max(8, Math.min(left, vw - cw - 8));
    top = Math.max(8, Math.min(top, vh - ch - 8));
    cardEl.style.left = Math.round(left) + "px";
    cardEl.style.top = Math.round(top) + "px";
  }

  function renderCard(step) {
    const total = activeSteps.length;
    const isLast = idx === total - 1;
    const isFirst = idx === 0;

    const title = t(step.titleKey, step.titleFb);
    const body = t(step.bodyKey, step.bodyFb);
    const note = step.noteKey ? t(step.noteKey, step.noteFb) : null;

    const counterTmpl = t("new-analysis:onboarding.step_counter", "Шаг {n} из {total}");
    const counter = counterTmpl
      .replace("{n}", String(idx + 1))
      .replace("{total}", String(total));

    const backLbl = t("new-analysis:onboarding.back", "Назад");
    const nextLbl = isLast
      ? t("new-analysis:onboarding.finish", "Готово")
      : t("new-analysis:onboarding.next", "Далее");
    const closeLbl = t("new-analysis:onboarding.close", "Завершить обучение");

    const backHtml = '<span class="tour-card__arrow">←</span> ' + escapeHtml(backLbl);
    const nextHtml = isLast
      ? escapeHtml(nextLbl)
      : escapeHtml(nextLbl) + ' <span class="tour-card__arrow">→</span>';

    cardEl.innerHTML =
      '<button type="button" class="tour-card__close" aria-label="' + escapeHtml(closeLbl) +
        '" title="' + escapeHtml(closeLbl) + '">✕</button>' +
      '<div class="tour-card__title">' + escapeHtml(title) + "</div>" +
      '<div class="tour-card__body">' + escapeHtml(body) + "</div>" +
      (note ? '<div class="tour-card__note">⚠️ ' + escapeHtml(note) + "</div>" : "") +
      '<div class="tour-card__footer">' +
        '<span class="tour-card__counter">' + escapeHtml(counter) + "</span>" +
        '<div class="tour-card__btns">' +
          '<button type="button" class="tour-card__back"' + (isFirst ? " disabled" : "") + ">" + backHtml + "</button>" +
          '<button type="button" class="tour-card__next">' + nextHtml + "</button>" +
        "</div>" +
      "</div>";

    cardEl.querySelector(".tour-card__close").addEventListener("click", () => endTour("skipped"));
    cardEl.querySelector(".tour-card__next").addEventListener("click", () => {
      if (isLast) endTour("done"); else go(idx + 1);
    });
    const backBtn = cardEl.querySelector(".tour-card__back");
    if (backBtn && !isFirst) backBtn.addEventListener("click", () => go(idx - 1));
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Перейти к шагу i (с подготовкой и пропуском недоступных).
  async function go(i, dir) {
    const direction = dir || (i >= idx ? 1 : -1);
    if (i < 0) { i = 0; }
    if (i >= activeSteps.length) { endTour("done"); return; }
    idx = i;
    const step = activeSteps[idx];

    try { await ensureProfileState(step); } catch (_) { /* ignore */ }
    if (typeof step.before === "function") {
      try { await step.before(); } catch (_) { /* ignore */ }
    }

    let el = q(step.anchor);
    if (el && isVisible(el)) {
      // Мгновенный переход без плавной прокрутки (по требованию — без «скольжения»).
      el.scrollIntoView({ block: "center", inline: "nearest" });
      await wait(40);
    }
    el = q(step.anchor);

    // Недоступный/скрытый якорь — пропускаем в текущем направлении.
    if (!el || !isVisible(el)) {
      const nextIdx = idx + direction;
      if (nextIdx < 0 || nextIdx >= activeSteps.length) { endTour("done"); return; }
      await go(nextIdx, direction);
      return;
    }

    renderCard(step);
    positionFor(el);
  }

  // --- запуск / завершение ---------------------------------------------------

  function endTour(state) {
    destroyLayer();
    if (isProfileOpen() && profileOpenedByTour && typeof window.closeProfileModal === "function") {
      window.closeProfileModal(true);
    }
    profileOpenedByTour = false;
    if (state) setState(state);
  }

  function startTour() {
    if (cardEl) return; // уже идёт
    activeSteps = STEPS.filter((s) => (typeof s.skipIf === "function" ? !s.skipIf() : true));
    if (!activeSteps.length) return;
    idx = 0;
    buildLayer();
    go(0, 1);
  }

  // --- приглашение -----------------------------------------------------------

  let inviteEl = null;

  function showInvite() {
    if (inviteEl) return;
    const title = t("new-analysis:onboarding.invite_title", "Добро пожаловать в CoTel 🐱");
    const body = t(
      "new-analysis:onboarding.invite_body",
      "CoTel читает ваши чаты, каналы и группы в Telegram и присылает только то, что важно. Желаете пройти короткое обучение для быстрого старта?"
    );
    const startLbl = t("new-analysis:onboarding.invite_start", "Начать обучение");
    const laterLbl = t("new-analysis:onboarding.invite_later", "Не сейчас");

    inviteEl = document.createElement("div");
    inviteEl.className = "tour-invite";
    inviteEl.innerHTML =
      '<div class="tour-invite__backdrop"></div>' +
      '<div class="tour-invite__card" role="dialog" aria-modal="true">' +
        '<button type="button" class="tour-invite__close" aria-label="Закрыть">✕</button>' +
        '<div class="tour-invite__title">' + escapeHtml(title) + "</div>" +
        '<div class="tour-invite__body">' + escapeHtml(body) + "</div>" +
        '<div class="tour-invite__btns">' +
          '<button type="button" class="tour-invite__later">' + escapeHtml(laterLbl) + "</button>" +
          '<button type="button" class="tour-invite__start">' + escapeHtml(startLbl) + "</button>" +
        "</div>" +
      "</div>";
    document.body.appendChild(inviteEl);

    const dismiss = () => { setState("later"); hideInvite(); };
    inviteEl.querySelector(".tour-invite__later").addEventListener("click", dismiss);
    inviteEl.querySelector(".tour-invite__close").addEventListener("click", dismiss);
    inviteEl.querySelector(".tour-invite__backdrop").addEventListener("click", dismiss);
    inviteEl.querySelector(".tour-invite__start").addEventListener("click", () => {
      hideInvite();
      startTour();
    });
  }

  function hideInvite() {
    if (inviteEl) { inviteEl.remove(); inviteEl = null; }
  }

  // Можно ли сейчас показать приглашение (не мешаем модалкам / логину).
  function canShowInvite() {
    if (getState()) return false;
    if (document.visibilityState !== "visible") return false;
    // Любая открытая auth-модалка (логин, профиль, методичка и т.п.).
    if (document.querySelector(".auth-modal:not(.hidden)")) return false;
    // Экран логина открыт → пользователь не авторизован.
    const authModal = document.getElementById("auth-modal");
    if (authModal && !authModal.classList.contains("hidden")) return false;
    // Идёт другой оверлей-модал (подключение бота).
    const botModal = document.getElementById("botConnectModal");
    if (botModal && botModal.style.display && botModal.style.display !== "none") return false;
    return true;
  }

  function scheduleInvite() {
    if (getState()) return;
    setTimeout(function tryShow() {
      if (getState() || inviteEl || cardEl) return;
      if (canShowInvite()) { showInvite(); return; }
      // Заблокировано модалкой — перепроверим чуть позже (несколько попыток).
      let tries = 0;
      const iv = setInterval(() => {
        if (getState() || inviteEl || cardEl) { clearInterval(iv); return; }
        if (canShowInvite()) { clearInterval(iv); showInvite(); return; }
        if (++tries >= 6) clearInterval(iv); // ~1.5 мин попыток
      }, 15000);
    }, INVITE_DELAY_MS);
  }

  // --- внешний API + проводка ------------------------------------------------

  // Принудительный запуск (кнопка «Пройти обучение заново») — мимо localStorage.
  window.startOnboardingTour = function () {
    hideInvite();
    if (isProfileOpen() && typeof window.closeProfileModal === "function") {
      window.closeProfileModal(true);
      setTimeout(startTour, 280);
    } else {
      startTour();
    }
  };

  function wireRelaunchButton() {
    const btn = document.getElementById("onboarding-relaunch-btn");
    if (btn && !btn._wired) {
      btn._wired = true;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        window.startOnboardingTour();
      });
    }
  }

  function init() {
    wireRelaunchButton();
    scheduleInvite();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
