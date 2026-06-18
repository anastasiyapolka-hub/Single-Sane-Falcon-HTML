/* ============================================================================
 * CoTel — онбординг-тур (product tour).
 *
 * Два тура поверх общего визуального языка поповеров:
 *   • "quick" — «Быстрый старт»: короткий тур по ключевым шагам (как и был).
 *   • "full"  — «Подробное обучение»: проводит по всем основным кнопкам
 *     страницы анализа и профиля.
 *
 * Без сторонних библиотек, без расширения БД — состояние в localStorage.
 *
 * Состояние:  localStorage["cotel:onboarding:v1"] = "later" | "skipped" | "done"
 *   нет ключа → новый пользователь, показываем приглашение один раз
 *   later     → отказался в приглашении, сам больше не всплывает
 *   skipped   → прервал тур, сам больше не всплывает
 *   done      → прошёл до конца
 * Приглашение всегда предлагает «Быстрый старт» — никто не хочет сразу
 * погружаться в подробное обучение.
 *
 * Запуск:
 *   - автоматически: приглашение (quick) через INVITE_DELAY_MS после загрузки,
 *     если ключа ещё нет и нет открытых модалок / экрана логина;
 *   - вручную: window.startOnboardingTour("quick" | "full") — кнопки в настройках
 *     профиля; игнорирует localStorage.
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

  // --- временный показ скрытых блоков (reveal/restore) -----------------------
  // Некоторые блоки скрыты до наступления условия (статус Telegram, «Недавние»,
  // форма подписки, выпадающее меню). На время шага показываем их, при переходе
  // на другой шаг — возвращаем как было.

  let revealed = [];

  function revealOne(el) {
    if (!el || el.__tourRevealed) return;
    el.__tourRevealed = true;
    revealed.push({
      el,
      display: el.style.display,
      hadHidden: el.classList.contains("hidden"),
    });
    if (el.classList.contains("hidden")) el.classList.remove("hidden");
    if (getComputedStyle(el).display === "none") el.style.display = "";
  }

  function applyReveals(step) {
    if (!step || !step.reveal) return;
    step.reveal.forEach((sel) => revealOne(q(sel)));
  }

  function restoreReveals() {
    revealed.forEach(({ el, display, hadHidden }) => {
      el.style.display = display;
      if (hadHidden) el.classList.add("hidden");
      delete el.__tourRevealed;
    });
    revealed = [];
  }

  // anchor может быть строкой или массивом селекторов — берём первый видимый
  // (а если видимого нет — первый существующий).
  function resolveAnchor(step) {
    if (!step) return null;
    const sels = Array.isArray(step.anchor) ? step.anchor : [step.anchor];
    for (const sel of sels) {
      const el = q(sel);
      if (el && isVisible(el)) return el;
    }
    for (const sel of sels) {
      const el = q(sel);
      if (el) return el;
    }
    return null;
  }

  // --- профиль ---------------------------------------------------------------

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

  // --- меню пользователя (Профиль / Справка / Обратная связь) ----------------
  // Меню #user-dropdown лежит в сайдбаре с overflow:hidden, а штатное открытие
  // (клик по триггеру) зависит от состояния приложения и ставит низкий z-index
  // (под оверлеем тура) — из-за этого пункты могли «не находиться» и шаги
  // пропускались. Поэтому тур открывает меню сам: переносит в body, позиционирует
  // над триггером фиксированно и поднимает над оверлеем тура. При уходе с
  // menu-шагов возвращает меню на место.

  let userMenuOpenedByTour = false;
  let menuOrigParent = null;
  let menuOrigNext = null;
  const MENU_INLINE_PROPS = ["position", "left", "right", "top", "bottom", "width", "z-index"];

  function forceOpenMenu() {
    const dd = document.getElementById("user-dropdown");
    const trigger = document.getElementById("user-profile-trigger");
    if (!dd || !trigger) return;
    if (!menuOrigParent) { menuOrigParent = dd.parentElement; menuOrigNext = dd.nextSibling; }

    const r = trigger.getBoundingClientRect();
    const w = 200;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const bottom = window.innerHeight - r.top + 8; // открываем вверх над триггером
    dd.style.setProperty("position", "fixed", "important");
    dd.style.setProperty("left", left + "px", "important");
    dd.style.setProperty("right", "auto", "important");
    dd.style.setProperty("top", "auto", "important");
    dd.style.setProperty("bottom", bottom + "px", "important");
    dd.style.setProperty("width", w + "px", "important");
    // Выше spotlight-оверлея (2147483200), но ниже карточки тура (2147483600).
    dd.style.setProperty("z-index", "2147483500", "important");
    if (dd.parentElement !== document.body) document.body.appendChild(dd);
    dd.classList.remove("hidden");
    userMenuOpenedByTour = true;
  }

  function forceCloseMenu() {
    const dd = document.getElementById("user-dropdown");
    if (dd) {
      dd.classList.add("hidden");
      MENU_INLINE_PROPS.forEach((p) => dd.style.removeProperty(p));
      if (menuOrigParent && dd.parentElement !== menuOrigParent) {
        if (menuOrigNext && menuOrigNext.parentElement === menuOrigParent) {
          menuOrigParent.insertBefore(dd, menuOrigNext);
        } else {
          menuOrigParent.appendChild(dd);
        }
      }
    }
    userMenuOpenedByTour = false;
  }

  // --- определение шагов -----------------------------------------------------
  // Хелпер: собирает шаг из ключа локали (<key>_title / <key>_body) + фолбэков.
  function S(key, titleFb, bodyFb, extra) {
    return Object.assign({
      titleKey: "new-analysis:onboarding." + key + "_title",
      titleFb: titleFb,
      bodyKey: "new-analysis:onboarding." + key + "_body",
      bodyFb: bodyFb,
    }, extra || {});
  }

  const TG_NOTE = {
    noteKey: "new-analysis:onboarding.s_tg_note",
    noteFb: "Мы не храним вашу историю сообщений и паролей, и обрабатываем данные только по вашему запросу.",
  };
  const isTgConnected = () => isVisible(document.getElementById("tgStateConnected"));

  // ---- «Быстрый старт» (короткий тур) ----
  const QUICK_STEPS = [
    S("s_tg", "Сначала — доступ к чатам",
      "Подключите свой Telegram (по QR или номеру) — или используйте служебный аккаунт CoTel для публичных каналов, без подключения личного.",
      Object.assign({ anchor: "#dataSourceSection", skipIf: isTgConnected }, TG_NOTE)),
    S("s_chat", "Вставьте чат, канал или группу",
      "Ссылка вида t.me/…, @username или выбор из списка ваших чатов. Это источник данных, который CoTel прочитает. В поле работает быстрый поиск при вводе по строке.",
      { anchor: "#activeChatInput" }),
    S("s_period", "За какой период времени читать",
      "Выберите период — минуты, часы или дни — и укажите количество. Чем больше период, тем больше сообщений CoTel прочитает (и тем дороже запрос в токенах).",
      { anchor: ".sidebar-inline-setting-row--period", before: ensureSettingsExpanded }),
    S("s_depth", "Выберите уровень сложности анализа",
      "Лёгкий — для большинства задач (быстро и экономно). Сбалансированный и Глубокий — для сложной аналитики. Какую AI-модель использовать, CoTel решает сам. Нажмите ⓘ, чтобы увидеть примерную стоимость каждого уровня.",
      { anchor: "#queryDepthSelector", before: ensureSettingsExpanded }),
    S("s_group", "Несколько чатов сразу",
      "Включите, чтобы задать один вопрос сразу нескольким чатам и получить сводный ответ. Количество чатов для группового запроса зависит от тарифа.",
      { anchor: "#queryGroupModeRow", before: ensureSettingsExpanded }),
    S("s_media", "Только нужные медиа",
      "Нужны лишь сообщения с видео, фото, аудио, документами или ссылками? Включите медиафильтр и выберите типы. Дополнительно можно указать текст запроса для более тонкой настройки — например, ограничить размер файла, длительность или наличие подписи.",
      { anchor: "#queryMediaFilterRow", before: ensureSettingsExpanded }),
    S("s_query", "Задайте вопрос своими словами",
      "Например: «о чём говорили за неделю», «найди вакансии Python, удалёнка», «собери ссылки на статьи». При поиске с медиафильтром поле можно оставлять пустым.",
      { anchor: "#queryInput" }),
    S("s_run", "Готово — запускаем",
      "Нажмите, чтобы получить структурированный ответ. Сколько токенов списалось — покажем под результатом, с расшифровкой.",
      { anchor: "#analyzeBtn" }),
    S("s_subs", "Слежение в фоне",
      "Подписки сами проверяют выбранные чаты по расписанию и присылают уведомление в Telegram, когда появляется важное. Удобно для мониторинга новостей, объявлений, вакансий, упоминаний, тематических дайджестов.",
      { anchor: "#addSubscriptionBtn" }),
    S("s_tokens", "Токены — внутренняя валюта",
      "Ими оплачиваются запросы и подписки. Здесь, в профиле, виден ваш баланс, текущий тариф и когда обновится месячный лимит. По кнопке «Докупить токены» можно приобрести дополнительный пакет токенов в рамках вашего тарифа.",
      { anchor: ".profile-tokens-card", inProfile: true, tab: "limits" }),
    S("s_history", "История запросов и обучение",
      "На вкладке «История запросов» видно, что и когда вы анализировали и сколько токенов ушло. А запустить это обучение заново можно в любой момент из настроек профиля.",
      { anchor: '[data-profile-tab="history"]', inProfile: true, tab: "history" }),
  ];

  // ---- «Подробное обучение» (полный тур) ----
  const SUB_FORM = { reveal: ["#subscriptionCreateBlock"] };
  const FULL_STEPS = [
    // Источник данных (если личный Telegram уже подключён — пропускаем).
    S("s_tg", "Сначала — доступ к чатам",
      "Подключите свой Telegram (по QR или номеру) — или используйте служебный аккаунт CoTel для публичных каналов, без подключения личного.",
      Object.assign({ anchor: "#dataSourceSection", skipIf: isTgConnected }, TG_NOTE)),
    // Статус авторизации Telegram (блок скрыт до подключения — показываем).
    S("f_tgstatus", "Авторизация в Telegram",
      "При подключении личного аккаунта Telegram здесь горит зелёный индикатор и отображается ваш никнейм. В любой момент вы можете завершить сеанс — кнопкой «Завершить сеанс».",
      { anchor: "#telegramStatusSection", reveal: ["#telegramStatusSection"] }),
    S("s_chat", "Вставьте чат, канал или группу",
      "Ссылка вида t.me/…, @username или выбор из списка ваших чатов. Это источник данных, который CoTel прочитает. В поле работает быстрый поиск при вводе по строке.",
      { anchor: "#activeChatInput" }),
    // Период + единица измерения — один объединённый шаг (подсвечиваем оба поля).
    S("s_period", "За какой период времени читать",
      "Выберите период — минуты, часы или дни — и укажите количество. Чем больше период, тем больше сообщений CoTel прочитает (и тем дороже запрос в токенах).",
      { anchor: ".sidebar-inline-setting-row--period", before: ensureSettingsExpanded }),
    S("s_depth", "Выберите уровень сложности анализа",
      "Лёгкий — для большинства задач (быстро и экономно). Сбалансированный и Глубокий — для сложной аналитики. Какую AI-модель использовать, CoTel решает сам. Нажмите ⓘ, чтобы увидеть примерную стоимость каждого уровня.",
      { anchor: "#queryDepthSelector", before: ensureSettingsExpanded }),
    S("s_group", "Несколько чатов сразу",
      "Включите, чтобы задать один вопрос сразу нескольким чатам и получить сводный ответ. Количество чатов для группового запроса зависит от тарифа.",
      { anchor: "#queryGroupModeRow", before: ensureSettingsExpanded }),
    S("s_media", "Только нужные медиа",
      "Нужны лишь сообщения с видео, фото, аудио, документами или ссылками? Включите медиафильтр и выберите типы. Дополнительно можно указать текст запроса для более тонкой настройки — например, ограничить размер файла, длительность или наличие подписи.",
      { anchor: "#queryMediaFilterRow", before: ensureSettingsExpanded }),
    // «Недавние» (блок истории чатов — скрыт, пока нет истории).
    S("f_recent", "Недавние чаты",
      "Здесь отображаются последние чаты, к которым вы выполняли запросы, — чтобы быстро к ним вернуться.",
      { anchor: "#chatHistoryBlock", reveal: ["#chatHistoryBlock"] }),
    // Мои чаты и каналы — дерево чатов из Telegram (блок скрыт, пока нет данных).
    S("f_mychats", "Мои чаты и каналы",
      "Здесь отображается дерево ваших чатов из Telegram (при подключении личного аккаунта) с учётом папок, созданных в Telegram. Значок ⟳ нужен для ручного обновления структуры чатов и папок, если в Telegram что-то изменилось.",
      { anchor: "#availableChatsBlock", reveal: ["#availableChatsBlock"] }),
    S("s_query", "Задайте вопрос своими словами",
      "Например: «о чём говорили за неделю», «найди вакансии Python, удалёнка», «собери ссылки на статьи». При поиске с медиафильтром поле можно оставлять пустым.",
      { anchor: "#queryInput" }),
    S("s_run", "Готово — запускаем",
      "Нажмите, чтобы получить структурированный ответ. Сколько токенов списалось — покажем под результатом, с расшифровкой.",
      { anchor: "#analyzeBtn" }),
    S("s_subs", "Слежение в фоне",
      "Подписки сами проверяют выбранные чаты по расписанию и присылают уведомление в Telegram, когда появляется важное. Удобно для мониторинга новостей, объявлений, вакансий, упоминаний, тематических дайджестов.",
      { anchor: "#addSubscriptionBtn" }),
    // Режимы работы (личный / служебный аккаунт).
    S("f_subs_modes", "Личный и служебный аккаунт",
      "Вы можете работать как под личным аккаунтом Telegram, так и под служебным. Подписка создаётся и выполняется под тем аккаунтом, с которого вы её создали, и отображается в соответствующем режиме.",
      { anchor: [".subscriptions-group-title", "#mySubscriptionsSection > summary"] }),
    // Подписки из другого режима — карточка появляется, только если такие есть.
    S("f_subs_other", "Подписки из другого режима",
      "Если вы переключаетесь между режимами работы с Telegram (например, личный аккаунт ↔ служебный) и есть подписки, созданные в другом режиме, — они показываются здесь. Значок ⇄ переносит подписку в другой режим — если хотите, чтобы она выполнялась под другим аккаунтом.",
      { anchor: ".subscriptions-group--other",
        skipIf: () => !document.querySelector(".subscriptions-group--other") }),
    // Форма создания подписки + проход по полям (форма скрыта — показываем).
    S("f_sub_create", "Создание подписки",
      "Нажмите «+», чтобы создать новую подписку. Дальше пройдёмся по полям формы — те же поля используются и при редактировании существующей подписки.",
      { anchor: ["#subscriptionCreateBlock h3", "#subNameInput"], reveal: ["#subscriptionCreateBlock"] }),
    S("f_sub_name", "Название подписки",
      "Понятное имя, по которому вы узнаете подписку в списке.",
      Object.assign({ anchor: "#subNameInput" }, SUB_FORM)),
    S("f_sub_type", "Тип подписки",
      "«События» — присылает конкретные сообщения по вашему запросу. «Саммари» — готовит резюме/дайджест чата за период.",
      Object.assign({ anchor: "#subTypeSelect" }, SUB_FORM)),
    S("f_sub_chat", "Чат / канал",
      "Выберите чат из списка или вставьте ссылку. Это источник, который подписка будет отслеживать. В поле работает быстрый поиск при вводе по строке.",
      Object.assign({ anchor: "#subChatInput" }, SUB_FORM)),
    S("f_sub_group", "Групповая подписка",
      "Включите, чтобы одна подписка следила сразу за несколькими чатами. Доступность зависит от тарифа и режима.",
      { anchor: "#subGroupModeRow", reveal: ["#subscriptionCreateBlock", "#subGroupModeRow"] }),
    S("f_sub_period", "Период чтения",
      "Как часто подписка проверяет чат — от раза в 10 минут до раза в день. Минимальная частота зависит от тарифа.",
      Object.assign({ anchor: "#subPeriodSelect" }, SUB_FORM)),
    S("f_sub_media", "Медиафильтр подписки",
      "Отслеживать только сообщения с выбранными типами медиа: видео, фото, аудио, документы, ссылки.",
      Object.assign({ anchor: "#subMediaFilterField" }, SUB_FORM)),
    S("f_sub_prompt", "Текст запроса",
      "Опишите, какую информацию собирать и когда уведомлять. Можно ключевыми словами или более сложным запросом.",
      Object.assign({ anchor: "#subPromptInput" }, SUB_FORM)),
    S("f_sub_actions", "Создать или отменить",
      "Создаём подписку или отменяем изменения. Позже подписку можно отредактировать — поля те же, что и здесь.",
      { anchor: [".subscription-actions", "#createSubscriptionBtn"], reveal: ["#subscriptionCreateBlock"] }),
    // Управление панелью.
    S("f_panel_collapse", "Свернуть рабочую панель",
      "Эта иконка сворачивает рабочую панель — удобно для чтения результатов. Нажмите ещё раз, чтобы развернуть.",
      { anchor: "#sidebarToggle" }),
    S("f_block_collapse", "Свернуть любой блок",
      "Любой блок можно свернуть, нажав на его заголовок с иконкой. Так панель занимает меньше места.",
      { anchor: ["#myChatsSection > summary", "#myChatsSection"] }),
    // Блок пользователя и меню.
    S("f_user_area", "Аккаунт, тариф и выход",
      "Здесь — ваш email, текущий тариф и кнопка выхода. При выходе, если включена «Повышенная безопасность», завершается и ваша Telegram-сессия.",
      { anchor: "#user-profile" }),
    S("f_menu_profile", "Меню: Профиль",
      "Профиль открывает всю информацию об аккаунте: личные данные, настройки, историю запросов и лимиты. Отсюда же можно сменить тариф и докупить токены.",
      { anchor: "#profile-btn", menu: true }),
    S("f_menu_help", "Меню: Справка",
      "В «Справке» — все инструкции и документация по сервису.",
      { anchor: "#help-btn", menu: true }),
    S("f_menu_feedback", "Меню: Обратная связь",
      "Ждём ваши предложения, сообщения об ошибках и любую обратную связь. Можно выбрать категорию и прикрепить файлы.",
      { anchor: "#feedback-btn", menu: true }),
    // Профиль.
    S("s_tokens", "Токены — внутренняя валюта",
      "Ими оплачиваются запросы и подписки. Здесь, в профиле, виден ваш баланс, текущий тариф и когда обновится месячный лимит. По кнопке «Докупить токены» можно приобрести дополнительный пакет токенов в рамках вашего тарифа.",
      { anchor: ".profile-tokens-card", inProfile: true, tab: "limits" }),
    S("f_prof_limits", "Возможности тарифа",
      "Это ваши возможности на текущем тарифе: число активных подписок, глубина анализа истории, минимальная частота, групповой анализ и докупка токенов.",
      { anchor: ".profile-limits-grid", inProfile: true, tab: "limits" }),
    S("f_prof_levels", "Подробнее об уровне анализа",
      "Здесь можно почитать, как работает уровень (глубина) анализа и как CoTel подбирает AI-модель под разные запросы.",
      { anchor: "#profile-levels-guide-link", inProfile: true, tab: "limits" }),
    S("f_prof_history", "История запросов",
      "Сводка по всем вашим запросам: когда, сколько токенов, групповой или нет. Историю по подпискам можно посмотреть на соседней вкладке.",
      { anchor: ['[data-profile-panel="history"] .profile-history-modes', '[data-profile-tab="history"]'],
        inProfile: true, tab: "history" }),
    S("f_prof_personal", "Личные данные",
      "Указанные при регистрации данные. Телефон и часовой пояс можно менять: телефон подставляется при авторизации в Telegram, а часовой пояс влияет на время в уведомлениях подписок.",
      { anchor: ['[data-profile-panel="personal"] .profile-grid', "#profile-phone"], inProfile: true, tab: "personal" }),
    S("f_prof_lang", "Язык интерфейса",
      "Доступны русский и английский. При смене язык интерфейса переключится сразу.",
      { anchor: "#profile-language", inProfile: true, tab: "settings" }),
    S("f_prof_secure", "Повышенная безопасность",
      "Если включить, при выходе из CoTel сервис также завершит вашу активную Telegram-сессию.",
      { anchor: ['label[for="ultra-secure-logout"]', "#ultra-secure-logout"], inProfile: true, tab: "settings" }),
    S("f_prof_relaunch", "Готово!",
      "Вы прошли подробное обучение. Запустить его (или быстрый старт) заново можно в любой момент здесь, в настройках профиля.",
      { anchor: [".profile-onboarding-btns", "#onboarding-relaunch-full-btn"], inProfile: true, tab: "settings" }),
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
      const el = step && resolveAnchor(step);
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

    // Снять показ блоков предыдущего шага.
    restoreReveals();

    idx = i;
    const step = activeSteps[idx];

    // Меню пользователя: открыть для menu-шагов, закрыть при уходе с них
    // (до открытия профиля, чтобы они не накладывались).
    if (step.menu) {
      try { forceOpenMenu(); await wait(80); } catch (_) { /* ignore */ }
    } else if (userMenuOpenedByTour) {
      try { forceCloseMenu(); } catch (_) { /* ignore */ }
    }

    try { await ensureProfileState(step); } catch (_) { /* ignore */ }
    if (typeof step.before === "function") {
      try { await step.before(); } catch (_) { /* ignore */ }
    }
    // Временно показать скрытые блоки, нужные шагу (статус TG, форма и т.п.).
    applyReveals(step);

    let el = resolveAnchor(step);
    if (el && isVisible(el)) {
      // Мгновенный переход без плавной прокрутки (по требованию — без «скольжения»).
      el.scrollIntoView({ block: "center", inline: "nearest" });
      await wait(40);
    }
    el = resolveAnchor(step);

    // Якорь ещё не виден — даём подготовке (открытие профиля/меню, reveal,
    // рендер) чуть больше времени и пробуем ещё раз, прежде чем пропускать шаг.
    if (!el || !isVisible(el)) {
      await wait(240);
      el = resolveAnchor(step);
    }

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
    restoreReveals();
    if (userMenuOpenedByTour) forceCloseMenu();
    destroyLayer();
    if (isProfileOpen() && profileOpenedByTour && typeof window.closeProfileModal === "function") {
      window.closeProfileModal(true);
    }
    profileOpenedByTour = false;
    if (state) setState(state);
  }

  function startTour(mode) {
    if (cardEl) return; // уже идёт
    const steps = mode === "full" ? FULL_STEPS : QUICK_STEPS;
    activeSteps = steps.filter((s) => (typeof s.skipIf === "function" ? !s.skipIf() : true));
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
      startTour("quick");
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

  // Принудительный запуск (кнопки «Быстрый старт» / «Подробное обучение»).
  // mode: "quick" (по умолчанию) | "full". Игнорирует localStorage.
  window.startOnboardingTour = function (mode) {
    const m = mode === "full" ? "full" : "quick";
    hideInvite();
    if (isProfileOpen() && typeof window.closeProfileModal === "function") {
      window.closeProfileModal(true);
      setTimeout(() => startTour(m), 280);
    } else {
      startTour(m);
    }
  };

  function wireRelaunchButtons() {
    const quickBtn = document.getElementById("onboarding-relaunch-btn");
    if (quickBtn && !quickBtn._wired) {
      quickBtn._wired = true;
      quickBtn.addEventListener("click", (e) => {
        e.preventDefault();
        window.startOnboardingTour("quick");
      });
    }
    const fullBtn = document.getElementById("onboarding-relaunch-full-btn");
    if (fullBtn && !fullBtn._wired) {
      fullBtn._wired = true;
      fullBtn.addEventListener("click", (e) => {
        e.preventDefault();
        window.startOnboardingTour("full");
      });
    }
  }

  function init() {
    wireRelaunchButtons();
    scheduleInvite();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
