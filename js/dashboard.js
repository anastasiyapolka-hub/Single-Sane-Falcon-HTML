  document.addEventListener("DOMContentLoaded", function () {
    (function () {
      //const BACKEND_URL = "https://cotel-backend.onrender.com/analyze"; - убрали после добавления куки
      const SUBS_API_BASE = "https://cotel-backend.onrender.com";
      const uploadBtn = document.getElementById("uploadBtn");
      const fileInput = document.getElementById("chatFile");
      const queryInput = document.getElementById("queryInput");
      
      const analyzeBtn = document.getElementById("analyzeBtn");
      const loader = document.querySelector(".dashboard-loader");
      const resultDiv = document.getElementById("analysisResult");
      const lottieLoaderContainer = document.getElementById("dashboardLottieLoader");
      const dashboardStatusText = document.getElementById("dashboardStatusText");
      let dashboardLottieInstance = null;
      let loaderStatusTimer = null;
      let loaderSequence = [];
      let loaderSequenceIndex = 0;
      let loaderShownAt = 0;
      let loaderMinResolve = null;
      let loaderMinPromise = null;


      const adminPanelBtn = document.getElementById("adminPanelBtn");

      // --- ЭЛЕМЕНТЫ ДЛЯ ВЫБОРА ИСТОЧНИКА ДАННЫХ ---
      const dataSourceFileRadio = document.getElementById("dataSourceFile");
      const dataSourceAccountRadio = document.getElementById("dataSourceAccount");
      const dataSourcePublicRadio = document.getElementById("dataSourcePublic");
      const dataSourceBotRadio = document.getElementById("dataSourceBot");

      const tgAuthBlock = document.getElementById("tgAuthBlock");
      const tgStatePhone = document.getElementById("tgStatePhone");
      const tgStateCode = document.getElementById("tgStateCode");
      const tgStateConnected = document.getElementById("tgStateConnected");
      const tgStatePassword = document.getElementById("tgStatePassword");
      const tgPasswordInput = document.getElementById("tgPasswordInput");
      const tgConfirmPasswordBtn = document.getElementById("tgConfirmPasswordBtn");

      const tgQrStartBtn = document.getElementById("tgQrStartBtn");
      const tgQrRestartBtn = document.getElementById("tgQrRestartBtn");
      const tgQrArea = document.getElementById("tgQrArea");
      const tgQrCanvas = document.getElementById("tgQrCanvas");
      const tgQrStatus = document.getElementById("tgQrStatus");

      let tgQrPollTimer = null;
      let tgQrObj = null; // instance of QRCode
      let editingSubscriptionId = null;

      let isTelegramConnected = false;

      function getTelegramDisplayName(data) {
        const me = data?.me;
        const defaultName = tI18n("new-analysis:telegram_auth_dynamic.default_user_name", "Пользователь");
        if (!me) return defaultName;

        const username = me.username || null;
        if (username) {
          return username.startsWith("@") ? username : `@${username}`;
        }

        const firstName = me.first_name || "";
        const lastName = me.last_name || "";
        const fullName = `${firstName} ${lastName}`.trim();

        if (fullName) return fullName;
        if (firstName) return firstName;

        return defaultName;
      }

      function pemToArrayBuffer(pem) {
        const base64 = pem
          .replace("-----BEGIN PUBLIC KEY-----", "")
          .replace("-----END PUBLIC KEY-----", "")
          .replace(/\s+/g, "");

        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);

        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }

        return bytes.buffer;
      }

      async function importRsaPublicKey(publicKeyPem) {
        return await window.crypto.subtle.importKey(
          "spki",
          pemToArrayBuffer(publicKeyPem),
          {
            name: "RSA-OAEP",
            hash: "SHA-256",
          },
          false,
          ["encrypt"]
        );
      }

      async function encryptTelegramPassword(password, publicKeyPem) {
        const key = await importRsaPublicKey(publicKeyPem);
        const encoded = new TextEncoder().encode(password);

        const ciphertext = await window.crypto.subtle.encrypt(
          {
            name: "RSA-OAEP",
          },
          key,
          encoded
        );

        const bytes = new Uint8Array(ciphertext);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i += 1) {
          binary += String.fromCharCode(bytes[i]);
        }

        return btoa(binary);
      }

      const tgPhoneInput = document.getElementById("tgPhoneInput");
      const tgSendCodeBtn = document.getElementById("tgSendCodeBtn");
      const tgCodeInput = document.getElementById("tgCodeInput");
      const tgConfirmCodeBtn = document.getElementById("tgConfirmCodeBtn");
      const tgCancelCodeBtn = document.getElementById("tgCancelCodeBtn");
      const tgStatusMessage = document.getElementById("tgStatusMessage");
      const tgConnectedUser = document.getElementById("tgConnectedUser");
      const tgLogoutBtn = document.getElementById("tgLogoutBtn");
      const tgLogoutBtnStatus = document.getElementById("tgLogoutBtnStatus");

      const telegramStatusSection = document.getElementById("telegramStatusSection");
      const tgStatusDot = document.getElementById("tgStatusDot");
      const tgStatusText = document.getElementById("tgStatusText");
      const tgStatusUsername = document.getElementById("tgStatusUsername");

      // поля для "Мой аккаунт Telegram"
      const activeChatInput = document.getElementById("activeChatInput");
      const queryDaysInput = document.getElementById("queryDaysInput");
      const queryAiModelRow = document.getElementById("queryAiModelRow");
      const queryAiModelSelect = document.getElementById("queryAiModelSelect");
      const queryDepthSelector = document.getElementById("queryDepthSelector");
      const queryDepthInfoBtn = document.getElementById("queryDepthInfoBtn");

      // === Глубина анализа (заменяет старый выбор модели) ===
      // light / balanced / deep — пользователь выбирает только это,
      // конкретную модель определяет роутер на бэке (classifier → routing).
      const DEPTH_VALUES = ["light", "balanced", "deep"];
      let _selectedDepth = "light";

      function getSelectedDepth() {
        return DEPTH_VALUES.includes(_selectedDepth) ? _selectedDepth : "light";
      }

      function setSelectedDepth(depth) {
        const d = DEPTH_VALUES.includes(depth) ? depth : "light";
        _selectedDepth = d;
        if (queryDepthSelector) {
          queryDepthSelector.querySelectorAll(".depth-btn").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.depth === d);
            btn.setAttribute("aria-checked", btn.dataset.depth === d ? "true" : "false");
          });
        }
      }

      // === Переиспользуемый поповер (база для будущих onboarding-подсказок) ===
      // Лёгкая белая карточка со стрелкой, появляется рядом с якорем, не блокирует
      // интерфейс. Закрывается крестиком, кликом вне или ESC.
      let _cotelPopoverEl = null;
      let _cotelPopoverAnchor = null;

      function _cotelPopoverOutside(e) {
        if (!_cotelPopoverEl) return;
        if (
          _cotelPopoverEl.contains(e.target) ||
          (_cotelPopoverAnchor && _cotelPopoverAnchor.contains(e.target))
        ) {
          return;
        }
        hideCotelPopover();
      }

      function _cotelPopoverEsc(e) {
        if (e.key === "Escape") hideCotelPopover();
      }

      function hideCotelPopover() {
        if (!_cotelPopoverEl) return;
        _cotelPopoverEl.remove();
        _cotelPopoverEl = null;
        _cotelPopoverAnchor = null;
        document.removeEventListener("click", _cotelPopoverOutside, true);
        document.removeEventListener("keydown", _cotelPopoverEsc, true);
        window.removeEventListener("resize", hideCotelPopover);
        window.removeEventListener("scroll", hideCotelPopover, true);
      }

      function _positionCotelPopover(anchorEl, pop) {
        const r = anchorEl.getBoundingClientRect();
        const gap = 10;
        let left = r.right + gap;
        pop.classList.add("cotel-popover--right");
        if (left + pop.offsetWidth > window.innerWidth - 8) {
          left = r.left - gap - pop.offsetWidth;
          pop.classList.remove("cotel-popover--right");
          pop.classList.add("cotel-popover--left");
        }
        let top = r.top + r.height / 2 - pop.offsetHeight / 2;
        top = Math.max(8, Math.min(top, window.innerHeight - pop.offsetHeight - 8));
        pop.style.left = Math.round(left) + "px";
        pop.style.top = Math.round(top) + "px";
        const arrow = pop.querySelector(".cotel-popover-arrow");
        if (arrow) {
          arrow.style.top = Math.round(r.top + r.height / 2 - top) + "px";
        }
      }

      function showCotelPopover(anchorEl, htmlContent) {
        hideCotelPopover();
        const pop = document.createElement("div");
        pop.className = "cotel-popover";
        pop.setAttribute("role", "dialog");
        pop.innerHTML =
          '<button type="button" class="cotel-popover-close" aria-label="Закрыть">✕</button>' +
          '<div class="cotel-popover-body">' + htmlContent + "</div>" +
          '<span class="cotel-popover-arrow"></span>';
        document.body.appendChild(pop);
        pop
          .querySelector(".cotel-popover-close")
          .addEventListener("click", (e) => {
            e.stopPropagation();
            hideCotelPopover();
          });
        _cotelPopoverEl = pop;
        _cotelPopoverAnchor = anchorEl;
        _positionCotelPopover(anchorEl, pop);
        // Откладываем подписку на клик вне, чтобы открывающий клик не закрыл сразу.
        setTimeout(() => {
          document.addEventListener("click", _cotelPopoverOutside, true);
          document.addEventListener("keydown", _cotelPopoverEsc, true);
        }, 0);
        window.addEventListener("resize", hideCotelPopover);
        window.addEventListener("scroll", hideCotelPopover, true);
      }

      function toggleCotelPopover(anchorEl, htmlContent) {
        if (_cotelPopoverEl && _cotelPopoverAnchor === anchorEl) {
          hideCotelPopover();
          return;
        }
        showCotelPopover(anchorEl, htmlContent);
      }

      function initDepthSelector() {
        if (!queryDepthSelector || queryDepthSelector._wired) return;
        queryDepthSelector._wired = true;
        queryDepthSelector.querySelectorAll(".depth-btn").forEach((btn) => {
          btn.addEventListener("click", () => setSelectedDepth(btn.dataset.depth));
        });
        if (queryDepthInfoBtn) {
          const buildDepthInfoHtml = () => {
            const lightLbl = tI18n("new-analysis:chat_requests.depth_light", "Лёгкий");
            const balancedLbl = tI18n("new-analysis:chat_requests.depth_balanced", "Сбалансированный");
            const deepLbl = tI18n("new-analysis:chat_requests.depth_deep", "Глубокий");
            const lightTxt = tI18n("new-analysis:chat_requests.depth_estimate_light", "~30-150 токенов");
            const balancedTxt = tI18n("new-analysis:chat_requests.depth_estimate_balanced", "~80-300 токенов");
            const deepTxt = tI18n("new-analysis:chat_requests.depth_estimate_deep", "~200-800 токенов");
            const note = tI18n(
              "new-analysis:chat_requests.depth_estimate_note",
              "Точное списание зависит от активности чата и считается после выполнения."
            );
            return (
              '<div class="cotel-popover-row"><b>' + lightLbl + "</b> — " + lightTxt + "</div>" +
              '<div class="cotel-popover-row"><b>' + balancedLbl + "</b> — " + balancedTxt + "</div>" +
              '<div class="cotel-popover-row"><b>' + deepLbl + "</b> — " + deepTxt + "</div>" +
              '<div class="cotel-popover-note">' + note + "</div>"
            );
          };
          // Клик — мгновенно открыть/закрыть.
          queryDepthInfoBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleCotelPopover(queryDepthInfoBtn, buildDepthInfoHtml());
          });
          // Наведение и удержание 3 секунды — тоже открыть.
          let _depthHoverTimer = null;
          queryDepthInfoBtn.addEventListener("mouseenter", () => {
            _depthHoverTimer = setTimeout(() => {
              showCotelPopover(queryDepthInfoBtn, buildDepthInfoHtml());
            }, 3000);
          });
          queryDepthInfoBtn.addEventListener("mouseleave", () => {
            if (_depthHoverTimer) {
              clearTimeout(_depthHoverTimer);
              _depthHoverTimer = null;
            }
          });
        }
      }
      initDepthSelector();

      // ----- Group analysis mode (multi-chat) -----
      const queryGroupModeToggle = document.getElementById("queryGroupModeToggle");
      const groupSelectionCounter = document.getElementById("groupSelectionCounter");
      const groupSelectionCount = document.getElementById("groupSelectionCount");
      const groupSelectedChatsList = document.getElementById("groupSelectedChatsList");
      const groupClearAllBtn = document.getElementById("groupClearAllBtn");
      const groupCounterCollapseBtn = document.getElementById("groupCounterCollapseBtn");
      const groupCounterCollapseChevron = document.getElementById("groupCounterCollapseChevron");

      // Selected chat link strings, preserves insertion order.
      const selectedGroupChats = new Set();
      // Models with 1M+ context — get a "рекомендовано" badge in group mode.
      const RECOMMENDED_GROUP_MODELS = new Set([
        "openai:gpt-4.1",
        "openai:o3",
        "google:gemini-2.5-flash",
        "google:gemini-2.5-pro",
        "google:gemini-3.5-flash",
      ]);

      const chatHistoryBlock = document.getElementById("chatHistoryBlock");
      const chatHistoryToggle = document.getElementById("chatHistoryToggle");
      const chatHistoryToggleIcon = document.getElementById("chatHistoryToggleIcon");
      const chatHistoryBody = document.getElementById("chatHistoryBody");
      const chatHistoryList = document.getElementById("chatHistoryList");

      const availableChatsBlock = document.getElementById("availableChatsBlock");
      const availableChatsToggle = document.getElementById("availableChatsToggle");
      const availableChatsToggleIcon = document.getElementById("availableChatsToggleIcon");
      const availableChatsBody = document.getElementById("availableChatsBody");

      const querySettingsInlineBlock = document.getElementById("querySettingsInlineBlock");
      const querySettingsInlineToggle = document.getElementById("querySettingsInlineToggle");
      const querySettingsInlineToggleIcon = document.getElementById("querySettingsInlineToggleIcon");
      const querySettingsInlineBody = document.getElementById("querySettingsInlineBody");

      // --- Подписки ---
      const addSubscriptionBtn = document.getElementById("addSubscriptionBtn");
      const subscriptionCreateBlock = document.getElementById("subscriptionCreateBlock");
      const subscriptionFormTitle = subscriptionCreateBlock?.querySelector("h3");
      const subNameInput = document.getElementById("subNameInput");
      const subChatInput = document.getElementById("subChatInput");
      const subChatsList = document.getElementById("subChatsList");
      const subPeriodSelect = document.getElementById("subPeriodSelect");
      const subTypeSelect = document.getElementById("subTypeSelect");
      const subPromptInput = document.getElementById("subPromptInput");
      const subAiModelRow = document.getElementById("subAiModelRow");
      const subAiModelSelect = document.getElementById("subAiModelSelect");
      const createSubscriptionBtn = document.getElementById("createSubscriptionBtn");
      const cancelSubscriptionBtn = document.getElementById("cancelSubscriptionBtn");
      const subCreateStatus = document.getElementById("subCreateStatus");
      const subscriptionsList = document.getElementById("subscriptionsList");

      // Modal
      const botConnectModal = document.getElementById("botConnectModal");
      const modalCloseBtn = document.getElementById("modalCloseBtn");
      const modalOpenBotBtn = document.getElementById("modalOpenBotBtn");
      const modalOpenBotWebLink = document.getElementById("modalOpenBotWebLink");

      
      // элементы для сворачиваемой левой панели
      const sidebar = document.querySelector(".dashboard-sidebar");
      const sidebarToggle = document.getElementById("sidebarToggle");
      const myChatsList = document.getElementById("myChatsList");
      const sidebarScrollArea = document.querySelector(".sidebar-scroll-area");
      const sidebarResizer = document.getElementById("sidebarResizer");


      const DATA_SOURCE_STORAGE_KEY = "cotel_data_source_mode";
      let authBootstrapReady = false;
      let dashboardBootstrapReady = false;

      function finishPageBootstrapIfReady() {
        if (authBootstrapReady && dashboardBootstrapReady) {
          document.documentElement.classList.remove("cotel-preboot");
        }
      }

      async function isBotConnected() {
        try {
          const data = await apiFetch("/tg/bot/link/status", {
            method: "GET"
          });
          return !!data?.connected;
        } catch {
          return false;
        }
      }

      let cachedChats = []; // [{id,title,type,username}]
      let cachedFolders = []; // [{id,title,emoticon,chat_ids:[...]}]

      // Запоминаем свёрнутость папок между перезагрузками страницы.
      // Ключ: cotel.folderCollapsed.<folder_id> → "1" если свёрнута.
      // "orphans" — синтетическая папка "Без папки".
      function isFolderCollapsed(folderId) {
        try {
          return localStorage.getItem("cotel.folderCollapsed." + folderId) === "1";
        } catch { return false; }
      }
      function setFolderCollapsed(folderId, collapsed) {
        try {
          if (collapsed) {
            localStorage.setItem("cotel.folderCollapsed." + folderId, "1");
          } else {
            localStorage.removeItem("cotel.folderCollapsed." + folderId);
          }
        } catch { /* localStorage недоступен — мирно игнорируем */ }
      }
      let cachedChatHistory = [];
      let isChatHistoryExpanded = true;
      let isAvailableChatsExpanded = true;
      let isQuerySettingsInlineExpanded = false;

      let pageBootstrapStarted = false;

      async function initializeDashboardPage() {
        if (pageBootstrapStarted) return;
        pageBootstrapStarted = true;

        try {
          restoreSelectedDataSourceMode();

          await bootstrapTelegramState();
          await loadChatHistory();

          // После того как telegram state и history уже известны —
          // один раз рисуем UI в финальной конфигурации
          updateDataSourceUI();
          renderChatsList(cachedChats);
          renderSubChatsList(getCurrentSubscriptionChatCandidates());

          if (typeof window.cotelRefreshPlanUsageSnapshot === "function") {
            await window.cotelRefreshPlanUsageSnapshot();
          }

          await refreshSubscriptions();
          refreshLimitBoundControls();
               
        } finally {
          authBootstrapReady = true;
          dashboardBootstrapReady = true;
          finishPageBootstrapIfReady();
        }
      }

      window.addEventListener("cotel-auth-changed", async () => {
        if (!pageBootstrapStarted) return;

        if (typeof window.cotelRefreshPlanUsageSnapshot === "function") {
          await window.cotelRefreshPlanUsageSnapshot();
        }

        await loadChatHistory();
        renderSubChatsList(getCurrentSubscriptionChatCandidates());
        await refreshSubscriptions();
        refreshLimitBoundControls();
      });

      initializeDashboardPage();

      activeChatInput?.addEventListener("input", filterChatsByInput);

      chatHistoryToggle?.addEventListener("click", () => {
        setChatHistoryExpanded(!isChatHistoryExpanded);
      });

      availableChatsToggle?.addEventListener("click", () => {
        setAvailableChatsExpanded(!isAvailableChatsExpanded);
      });

      // Кнопка "Обновить структуру папок и чатов" — ручной триггер
      // перечитывания /tg/chats. Помимо клика сюда, refresh случается
      // на загрузке страницы (bootstrapTelegramState) и сразу после
      // успешной авторизации Telegram (loadTelegramChats в QR/code/
      // password флоу). Поллинга нет.
      const refreshChatsBtn = document.getElementById("refreshChatsBtn");
      refreshChatsBtn?.addEventListener("click", async (e) => {
        e.stopPropagation(); // чтобы клик не схлопнул блок чатов
        if (refreshChatsBtn.classList.contains("is-loading")) return;
        refreshChatsBtn.classList.add("is-loading");
        try {
          await loadTelegramChats();
        } finally {
          refreshChatsBtn.classList.remove("is-loading");
        }
      });

      querySettingsInlineToggle?.addEventListener("click", () => {
        setQuerySettingsInlineExpanded(!isQuerySettingsInlineExpanded);
      });

      queryInput?.addEventListener("input", autoResizeQueryInput);
      autoResizeQueryInput();

      subTypeSelect?.addEventListener("change", () => {
        const t = (subTypeSelect.value || "events").trim();
        setPeriodOptionsForType(t);
        applySubscriptionTypeMediaFilterVisibility(t);
      });

      // ---- Subscription form: media filter (Этап B2) ----
      // Те же контракты, что и в Q&A: enabled + categories[] + video_subtype + audio_subtype.
      const subMediaFilterToggle = document.getElementById("subMediaFilterToggle");
      const subMediaFilterField = document.getElementById("subMediaFilterField");
      const subMediaFilterCategories = document.getElementById("subMediaFilterCategories");

      function applySubscriptionTypeMediaFilterVisibility(subType) {
        if (!subMediaFilterField) return;
        // Только для events: digest и любые будущие типы не получают
        // фильтр (по спеке). Скрытие через inline style — параллельно к
        // CSS-классу, чтобы работало и при программной смене значения.
        subMediaFilterField.style.display = (subType === "events") ? "" : "none";
        if (subType !== "events" && subMediaFilterToggle) {
          subMediaFilterToggle.checked = false;
          refreshSubMediaFilterCategoriesVisibility();
        }
      }

      function refreshSubMediaFilterCategoriesVisibility() {
        if (!subMediaFilterCategories || !subMediaFilterToggle) return;
        subMediaFilterCategories.style.display =
          subMediaFilterToggle.checked ? "" : "none";
      }

      function refreshSubMediaFilterSubtypeStates() {
        if (!subMediaFilterField) return;
        const stateByCat = {};
        subMediaFilterField.querySelectorAll(".sub-mf-cat").forEach((c) => {
          stateByCat[c.value] = c.checked;
        });
        subMediaFilterField.querySelectorAll(".sub-mf-subtype").forEach((sel) => {
          sel.disabled = !stateByCat[sel.dataset.cat];
        });
      }

      function getSubscriptionMediaFilterPayload() {
        // Не вызываем, если фильтр в принципе скрыт (не events).
        if (!subMediaFilterField || subMediaFilterField.style.display === "none") return null;
        if (!subMediaFilterToggle || !subMediaFilterToggle.checked) return null;
        const categories = [];
        subMediaFilterField.querySelectorAll(".sub-mf-cat").forEach((c) => {
          if (c.checked) categories.push(c.value);
        });
        const videoSel = subMediaFilterField.querySelector('.sub-mf-subtype[data-cat="video"]');
        const audioSel = subMediaFilterField.querySelector('.sub-mf-subtype[data-cat="audio"]');
        return {
          enabled: true,
          categories: categories,
          video_subtype: (videoSel && videoSel.value) || "video_files",
          audio_subtype: (audioSel && audioSel.value) || "audio_files",
        };
      }

      function applySubscriptionMediaFilterFromSub(mf) {
        // Восстановить состояние формы из объекта media_filter в БД.
        if (!subMediaFilterField) return;
        const enabled = !!(mf && mf.enabled !== false && (Array.isArray(mf.categories) || mf.enabled));
        if (subMediaFilterToggle) subMediaFilterToggle.checked = enabled;
        subMediaFilterField.querySelectorAll(".sub-mf-cat").forEach((c) => {
          c.checked = enabled && Array.isArray(mf.categories) && mf.categories.includes(c.value);
        });
        const videoSel = subMediaFilterField.querySelector('.sub-mf-subtype[data-cat="video"]');
        const audioSel = subMediaFilterField.querySelector('.sub-mf-subtype[data-cat="audio"]');
        if (videoSel) videoSel.value = (mf && mf.video_subtype) || "video_files";
        if (audioSel) audioSel.value = (mf && mf.audio_subtype) || "audio_files";
        refreshSubMediaFilterCategoriesVisibility();
        refreshSubMediaFilterSubtypeStates();
      }

      function resetSubscriptionMediaFilter() {
        if (subMediaFilterToggle) subMediaFilterToggle.checked = false;
        subMediaFilterField?.querySelectorAll(".sub-mf-cat").forEach((c) => { c.checked = false; });
        const videoSel = subMediaFilterField?.querySelector('.sub-mf-subtype[data-cat="video"]');
        const audioSel = subMediaFilterField?.querySelector('.sub-mf-subtype[data-cat="audio"]');
        if (videoSel) videoSel.value = "video_files";
        if (audioSel) audioSel.value = "audio_files";
        refreshSubMediaFilterCategoriesVisibility();
        refreshSubMediaFilterSubtypeStates();
      }

      subMediaFilterToggle?.addEventListener("change", refreshSubMediaFilterCategoriesVisibility);
      subMediaFilterField?.querySelectorAll(".sub-mf-cat").forEach((c) => {
        c.addEventListener("change", refreshSubMediaFilterSubtypeStates);
      });
      refreshSubMediaFilterCategoriesVisibility();
      refreshSubMediaFilterSubtypeStates();
      // Стартовая видимость — по текущему значению типа подписки.
      applySubscriptionTypeMediaFilterVisibility((subTypeSelect?.value || "events").trim());

      // Экспонируем геттер payload'а для submit-обработчика.
      window.cotelSubMediaFilter = {
        getPayload: getSubscriptionMediaFilterPayload,
        applyFromSub: applySubscriptionMediaFilterFromSub,
        reset: resetSubscriptionMediaFilter,
      };

      queryDaysInput?.addEventListener("change", clampQueryDaysByPlan);
      queryDaysInput?.addEventListener("blur", clampQueryDaysByPlan);

      // ---- Group: "Снять всё" button ----
      groupClearAllBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        clearAllSelectedChats();
      });

      // ---- Group: collapse/expand the selected-chats list ----
      groupCounterCollapseBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        if (!groupSelectionCounter) return;
        const willCollapse = !groupSelectionCounter.classList.contains("group-selection-counter--collapsed");
        groupSelectionCounter.classList.toggle("group-selection-counter--collapsed", willCollapse);
        if (groupCounterCollapseChevron) {
          groupCounterCollapseChevron.textContent = willCollapse ? "▸" : "▾";
        }
        groupCounterCollapseBtn.setAttribute("aria-expanded", willCollapse ? "false" : "true");
      });

      // ---- Group mode toggle ----
      queryGroupModeToggle?.addEventListener("change", () => {
        const on = isGroupModeOn();
        // Reset selection whenever the toggle changes. This matches user
        // expectation: turning the mode off discards selection, turning
        // it on starts fresh.
        selectedGroupChats.clear();
        updateGroupCounter();
        // Re-render chat list AND history list so chats/folders/history
        // items get (or lose) their checkboxes.
        if (typeof renderChatsList === "function" && typeof cachedChats !== "undefined") {
          renderChatsList(cachedChats);
        }
        if (typeof renderChatHistory === "function" && typeof cachedChatHistory !== "undefined") {
          renderChatHistory(cachedChatHistory);
        }
        // Hide the single-chat input in group mode; restore in single mode.
        if (activeChatInput) {
          activeChatInput.style.display = on ? "none" : "";
          if (on) activeChatInput.value = "";
        }
        // In group mode the AI model selector may show "рекомендовано"
        // badges — rebuild it.
        if (typeof refreshAiModelControls === "function") {
          refreshAiModelControls();
        }
      });

      // ---- Media filter (Этап 7) ----
      // Чекбокс «Медиафильтр» под «Групповой запрос», сворачиваемый
      // блок с 5 категориями и опциональными подтипами для Видео/Аудио.
      const queryMediaFilterToggle = document.getElementById("queryMediaFilterToggle");
      const mediaFilterBlock = document.getElementById("mediaFilterBlock");
      const mediaFilterCollapseBtn = document.getElementById("mediaFilterCollapseBtn");
      const mediaFilterCollapseChevron = document.getElementById("mediaFilterCollapseChevron");

      function isMediaFilterOn() {
        return !!(queryMediaFilterToggle && queryMediaFilterToggle.checked);
      }

      // Подтипы активны только если соответствующая категория отмечена.
      // Это снимает дилемму «что значит выбранный подтип у выключенной категории».
      function refreshMediaFilterSubtypeStates() {
        if (!mediaFilterBlock) return;
        const cats = mediaFilterBlock.querySelectorAll(".media-filter-cat");
        const stateByCat = {};
        cats.forEach((c) => { stateByCat[c.value] = c.checked; });
        mediaFilterBlock.querySelectorAll(".media-filter-subtype").forEach((sel) => {
          const cat = sel.dataset.cat;
          sel.disabled = !stateByCat[cat];
        });
      }

      // Возвращает объект media_filter для payload'а или null если фильтр выключен.
      // Контракт совпадает с backend/media_filter/types.py MediaFilterRequest.
      function getMediaFilterPayload() {
        if (!isMediaFilterOn()) return null;
        const categories = [];
        mediaFilterBlock?.querySelectorAll(".media-filter-cat").forEach((c) => {
          if (c.checked) categories.push(c.value);
        });
        const videoSel = mediaFilterBlock?.querySelector('.media-filter-subtype[data-cat="video"]');
        const audioSel = mediaFilterBlock?.querySelector('.media-filter-subtype[data-cat="audio"]');
        return {
          enabled: true,
          categories: categories,
          video_subtype: (videoSel && videoSel.value) || "video_files",
          audio_subtype: (audioSel && audioSel.value) || "audio_files",
        };
      }

      queryMediaFilterToggle?.addEventListener("change", () => {
        const on = isMediaFilterOn();
        if (mediaFilterBlock) {
          mediaFilterBlock.classList.toggle("hidden", !on);
          if (on) {
            mediaFilterBlock.classList.remove("media-filter-block--collapsed");
            if (mediaFilterCollapseChevron) mediaFilterCollapseChevron.textContent = "▾";
            mediaFilterCollapseBtn?.setAttribute("aria-expanded", "true");
          }
        }
      });

      mediaFilterCollapseBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        if (!mediaFilterBlock) return;
        const willCollapse = !mediaFilterBlock.classList.contains("media-filter-block--collapsed");
        mediaFilterBlock.classList.toggle("media-filter-block--collapsed", willCollapse);
        if (mediaFilterCollapseChevron) {
          mediaFilterCollapseChevron.textContent = willCollapse ? "▸" : "▾";
        }
        mediaFilterCollapseBtn.setAttribute("aria-expanded", willCollapse ? "false" : "true");
      });

      // Включение/выключение dropdown'ов подтипа при изменении чекбокса
      // категории. Также — рендерим начальное состояние сразу при загрузке.
      mediaFilterBlock?.querySelectorAll(".media-filter-cat").forEach((c) => {
        c.addEventListener("change", refreshMediaFilterSubtypeStates);
      });
      refreshMediaFilterSubtypeStates();

      // Экспонируем для places-of-use ниже (apiFetch payload-сборка в submit).
      window.cotelMediaFilter = {
        isOn: isMediaFilterOn,
        getPayload: getMediaFilterPayload,
      };

      window.cotelRefreshLimitBoundControls = refreshLimitBoundControls;

      adminPanelBtn?.addEventListener("click", () => {
        window.location.href = "/admin-service-accounts.html";
      });

      const adminCotelBtn = document.getElementById("adminCotelBtn");
      adminCotelBtn?.addEventListener("click", () => {
        window.location.href = "/admin.html";
      });

      // Reveal the admin buttons block only for users in ADMIN_EMAILS.
      // The /admin/whoami endpoint is non-throwing for non-admins.
      (async () => {
        const adminBlock = document.getElementById("adminButtonsBlock");
        if (!adminBlock) return;
        try {
          const res = await apiFetch("/admin/whoami");
          if (res && res.is_admin) {
            adminBlock.style.display = "";
          }
        } catch (_e) {
          // 401 / network — keep buttons hidden. Safe default.
        }
      })();

      function setSelectedDataSourceMode(mode) {
        if (mode === "file" && dataSourceFileRadio) dataSourceFileRadio.checked = true;
        else if (mode === "public" && dataSourcePublicRadio) dataSourcePublicRadio.checked = true;
        else if (mode === "bot" && dataSourceBotRadio) dataSourceBotRadio.checked = true;
        else if (dataSourceAccountRadio) dataSourceAccountRadio.checked = true;
      }

      function getSelectedDataSourceMode() {
        const checked = document.querySelector('input[name="dataSource"]:checked');
        return checked?.value || "account";
      }

      function restoreSelectedDataSourceMode() {
        const saved = localStorage.getItem(DATA_SOURCE_STORAGE_KEY);
        setSelectedDataSourceMode(saved || "account");
      }

      function persistSelectedDataSourceMode() {
        localStorage.setItem(DATA_SOURCE_STORAGE_KEY, getSelectedDataSourceMode());
      }

      function getCurrentHistorySourceMode() {
        if (dataSourcePublicRadio?.checked) return "service";
        if (dataSourceAccountRadio?.checked) return "personal";
        return null;
      }

      function getCurrentSubscriptionSourceMode() {
        if (dataSourcePublicRadio?.checked) return "service";
        return "personal";
      }

      function getOppositeSubscriptionSourceMode() {
        return getCurrentSubscriptionSourceMode() === "service" ? "personal" : "service";
      }
      function getCurrentSubscriptionChatCandidates() {
        const mode = getCurrentSubscriptionSourceMode();

        if (mode === "service") {
          const untitled = tI18n("new-analysis:subscription_dynamic.untitled", "Без названия");
          return (cachedChatHistory || []).map((item) => ({
            id: item.chat_id || item.id,
            title: item.chat_title || item.chat_ref || untitled,
            username: item.chat_username || null,
            chat_ref: item.chat_ref || "",
          }));
        }

        return Array.isArray(cachedChats) ? cachedChats : [];
      }

      function escapeHtml(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
      }

      function normalizeSubscriptionUiError(err) {
        const detail = err?.detail;

        if (Array.isArray(detail)) {
          return detail
            .map((item) => {
              const loc = Array.isArray(item?.loc) ? item.loc.join(".") : "";
              const msg = item?.msg || tI18n("new-analysis:subscription_dynamic.validation_error", "Ошибка валидации");
              return loc ? `${loc}: ${msg}` : msg;
            })
            .join("; ");
        }

        if (detail && typeof detail === "object") {
          if (typeof detail.message === "string" && detail.message.trim()) {
            return detail.message;
          }
          if (typeof detail.detail === "string" && detail.detail.trim()) {
            return detail.detail;
          }
          try {
            return JSON.stringify(detail);
          } catch {
            return tI18n("new-analysis:subscription_dynamic.operation_failed", "Не удалось выполнить операцию с подпиской.");
          }
        }

        const raw =
          err?.detail?.message ||
          err?.detail?.detail ||
          (typeof err?.detail === "string" ? err.detail : "") ||
          err?.message ||
          String(err || "");

        const msg = String(raw || "");

        if (msg.includes("CHAT_PRIVATE_OR_NO_ACCESS")) {
          return tI18n("new-analysis:chat_errors.private_no_access", "Этот чат недоступен для чтения под служебным аккаунтом. Подключите личный Telegram или выберите публичный чат.");
        }

        if (msg.includes("PUBLIC_CHAT_NOT_FOUND")) {
          return tI18n("new-analysis:chat_errors.public_not_found", "Чат или канал не найден. Проверьте ссылку, username или chat id.");
        }

        if (msg.includes("INVITE_LINK_INVALID_OR_EXPIRED")) {
          return tI18n("new-analysis:chat_errors.invite_invalid", "Ссылка-приглашение недействительна или истекла.");
        }

        if (msg.includes("JOIN_REQUEST_SENT")) {
          return tI18n("new-analysis:chat_errors.join_request_sent", "Для этого чата отправлена заявка на вступление. Он станет доступен только после одобрения.");
        }

        if (msg.includes("SERVICE_ACCOUNT_CHANNEL_LIMIT")) {
          return tI18n("new-analysis:chat_errors.service_account_channel_limit", "Служебные аккаунты временно достигли лимита Telegram на вступление в каналы. Попробуйте позже.");
        }

        if (msg.includes("FLOOD_WAIT")) {
          return tI18n("new-analysis:chat_errors.flood_wait", "Telegram временно ограничил доступ для служебного аккаунта. Попробуйте позже.");
        }

        if (msg.includes("TELEGRAM_NOT_AUTHORIZED")) {
          return tI18n("new-analysis:chat_errors.telegram_not_authorized", "Сначала подключите ваш личный Telegram-аккаунт.");
        }

        if (msg.includes("CHAT_RESOLVE_FAILED")) {
          return tI18n("new-analysis:chat_errors.resolve_failed", "Не удалось открыть чат. Проверьте ссылку, username или доступ к нему.");
        }

        return msg || tI18n("new-analysis:subscription_dynamic.operation_failed", "Не удалось выполнить операцию с подпиской.");
      }
            
      async function apiGetChatHistory(sourceMode, limit = 30) {
        const params = new URLSearchParams({
          source_mode: sourceMode,
          limit: String(limit),
        });

        return await apiFetch(`/chat-history?${params.toString()}`, {
          method: "GET",
        });
      }

      async function apiDeleteChatHistoryItem(historyId) {
        return await apiFetch(`/chat-history/${encodeURIComponent(historyId)}`, {
          method: "DELETE",
        });
      }

      function setChatHistoryExpanded(expanded) {
        isChatHistoryExpanded = !!expanded;

        if (chatHistoryBody) {
          chatHistoryBody.classList.toggle("hidden", !isChatHistoryExpanded);
        }

        if (chatHistoryToggle) {
          chatHistoryToggle.setAttribute("aria-expanded", isChatHistoryExpanded ? "true" : "false");
        }

        if (chatHistoryToggleIcon) {
          chatHistoryToggleIcon.textContent = isChatHistoryExpanded ? "▾" : "▸";
        }
      }

      function setAvailableChatsExpanded(expanded) {
        isAvailableChatsExpanded = !!expanded;

        if (availableChatsBody) {
          availableChatsBody.classList.toggle("hidden", !isAvailableChatsExpanded);
        }

        if (availableChatsToggle) {
          availableChatsToggle.setAttribute("aria-expanded", isAvailableChatsExpanded ? "true" : "false");
        }

        if (availableChatsToggleIcon) {
          availableChatsToggleIcon.textContent = isAvailableChatsExpanded ? "▾" : "▸";
        }
      }

      function setQuerySettingsInlineExpanded(expanded) {
        isQuerySettingsInlineExpanded = !!expanded;

        if (querySettingsInlineBody) {
          querySettingsInlineBody.classList.toggle("hidden", !isQuerySettingsInlineExpanded);
        }

        if (querySettingsInlineToggle) {
          querySettingsInlineToggle.setAttribute(
            "aria-expanded",
            isQuerySettingsInlineExpanded ? "true" : "false"
          );
        }

        if (querySettingsInlineToggleIcon) {
          querySettingsInlineToggleIcon.textContent = isQuerySettingsInlineExpanded ? "▾" : "▸";
        }
      }

      function renderChatHistory(items) {
        cachedChatHistory = Array.isArray(items) ? items : [];

        if (!chatHistoryBlock || !chatHistoryList) return;

        if (!cachedChatHistory.length) {
          chatHistoryBlock.classList.add("hidden");
          chatHistoryList.innerHTML = "";
          return;
        }

        chatHistoryBlock.classList.remove("hidden");

        chatHistoryList.innerHTML = cachedChatHistory.map((item) => {
          const title = escapeHtml(item.chat_title || item.chat_ref || tI18n("new-analysis:subscription_dynamic.untitled", "Без названия"));
          const chatRef = escapeHtml(item.chat_ref || "");
          const id = Number(item.id);
          const removeTitle = escapeHtml(tI18n("new-analysis:chat_history.delete_title", "Удалить из истории"));
          const removeAria = escapeHtml(tI18n("new-analysis:chat_history.delete_aria", "Удалить из истории"));

          return `
            <div class="sidebar-history-item" data-history-id="${id}" data-chat-ref="${chatRef}">
              <button
                type="button"
                class="sidebar-chat-item sidebar-history-link"
                data-chat-ref="${chatRef}"
              >
                ${title}
              </button>
              <button
                type="button"
                class="sidebar-history-remove"
                title="${removeTitle}"
                aria-label="${removeAria}"
                data-history-id="${id}"
              >
                ✕
              </button>
            </div>
          `;
        }).join("");

        chatHistoryList.querySelectorAll(".sidebar-history-link").forEach((btn) => {
          btn.addEventListener("click", () => {
            const chatRef = btn.getAttribute("data-chat-ref") || "";
            // In group mode, clicking the history row toggles selection
            // (same UX as the main chat tree). Otherwise — old behavior:
            // fill the active-chat input.
            if (typeof isGroupModeOn === "function" && isGroupModeOn()) {
              const itemEl = btn.closest(".sidebar-history-item");
              const cb = itemEl ? itemEl.querySelector(".group-history-checkbox") : null;
              toggleChatInGroup(chatRef, btn, cb);
              if (itemEl) {
                itemEl.classList.toggle("sidebar-history-item--selected", selectedGroupChats.has(chatRef));
              }
              return;
            }
            if (activeChatInput) {
              activeChatInput.value = chatRef;
              activeChatInput.dispatchEvent(new Event("input", { bubbles: true }));
            }
          });
        });

        // Group mode: inject a checkbox into each history item so the user
        // can pick chats here too. Layout matches «Мои чаты»:
        // [title] [checkbox] [✕] — checkbox is inserted BEFORE the remove
        // button so it ends up at the right edge next to ×.
        // State syncs with the main tree via selectedGroupChats + refreshGroupVisualState().
        if (typeof isGroupModeOn === "function" && isGroupModeOn()) {
          chatHistoryList.querySelectorAll(".sidebar-history-item").forEach((itemEl) => {
            itemEl.classList.add("sidebar-history-item--group");
            const chatRef = itemEl.getAttribute("data-chat-ref") || "";
            if (selectedGroupChats.has(chatRef)) {
              itemEl.classList.add("sidebar-history-item--selected");
            }
            // Avoid double-inserting on re-renders.
            if (itemEl.querySelector(".group-history-checkbox")) return;
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.className = "group-history-checkbox";
            cb.checked = selectedGroupChats.has(chatRef);
            cb.addEventListener("click", (e) => {
              e.stopPropagation();
              toggleChatInGroup(chatRef, itemEl, cb);
              itemEl.classList.toggle("sidebar-history-item--selected", selectedGroupChats.has(chatRef));
            });
            // Insert the checkbox just before the remove (✕) button so
            // the order reads as [title] [checkbox] [✕].
            const removeBtn = itemEl.querySelector(".sidebar-history-remove");
            if (removeBtn) {
              itemEl.insertBefore(cb, removeBtn);
            } else {
              itemEl.appendChild(cb);
            }
          });
        }

        chatHistoryList.querySelectorAll(".sidebar-history-remove").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const historyId = btn.getAttribute("data-history-id");
            if (!historyId) return;

            try {
              await apiDeleteChatHistoryItem(historyId);
              await loadChatHistory();
            } catch (err) {
              const fallback = tI18n("new-analysis:chat_history.delete_error", "Не удалось удалить запись из истории.");
              alert(extractBackendErrorMessage(err) || fallback);
            }
          });
        });

        setChatHistoryExpanded(isChatHistoryExpanded);
      }

      async function loadChatHistory() {
        const sourceMode = getCurrentHistorySourceMode();

        if (!sourceMode) {
          renderChatHistory([]);
          return;
        }

        try {
          const data = await apiGetChatHistory(sourceMode, 30);
          renderChatHistory(Array.isArray(data?.items) ? data.items : []);
        } catch (err) {
          if (err?.status === 401) {
            renderChatHistory([]);
            return;
          }
          console.warn("Chat history load failed:", err);
          renderChatHistory([]);
        }
      }

      function autoResizeQueryInput() {
        if (!queryInput) return;
        queryInput.style.height = "auto";
        queryInput.style.height = Math.min(queryInput.scrollHeight, 220) + "px";
      }

      function updateDataSourceUI() {
        const checked = document.querySelector('input[name="dataSource"]:checked');
        const mode = checked ? checked.value : "account";

        if (uploadBtn) {
          uploadBtn.style.display = mode === "file" ? "inline-flex" : "none";
        }

        if (tgAuthBlock) {
          tgAuthBlock.style.display =
            mode === "account" && !isTelegramConnected ? "block" : "none";
        }

        if (telegramStatusSection) {
          telegramStatusSection.style.display = mode === "account" ? "block" : "none";
        }

        // Мини-иконка Telegram-авторизации: показывается только когда
        // выбран "Мой аккаунт Telegram" (mode === "account").
        const tgMiniIconBtn = document.getElementById("tgMiniIconBtn");
        if (tgMiniIconBtn) {
          tgMiniIconBtn.style.display = mode === "account" ? "inline-flex" : "none";
        }
      }


      function setTgState(state) {
        if (tgStatePhone) {
          tgStatePhone.style.display = state === "phone" ? "block" : "none";
        }
        if (tgStateCode) {
          tgStateCode.style.display = state === "code" ? "block" : "none";
        }
        if (tgStatePassword) {
          tgStatePassword.style.display = state === "password" ? "block" : "none";
        }
        if (tgStateConnected) {
          tgStateConnected.style.display = state === "connected" ? "block" : "none";
        }
      }

      function setTelegramConnectionStatus(isConnected, username = null) {
        const miniDot = document.getElementById("tgMiniStatusDot");
        const logoutBtn = document.getElementById("tgLogoutBtnStatus");

        isTelegramConnected = !!isConnected;

        if (miniDot) {
          miniDot.className =
            "tg-status-dot " + (isTelegramConnected ? "tg-status-on" : "tg-status-off");
        }

        if (!telegramStatusSection || !tgStatusDot || !tgStatusText || !tgStatusUsername) {
          updateDataSourceUI();
          return;
        }

        telegramStatusSection.style.display = "block";

        // Строка "Аккаунт: —" больше не показывается — username/статус
        // сжаты в одну строку рядом с цветной точкой.
        const accountLine = document.getElementById("tgStatusAccountLine");
        if (accountLine) accountLine.style.display = "none";

        if (isTelegramConnected) {
          const displayName = username || tI18n("new-analysis:telegram_auth_dynamic.default_user_name", "Пользователь");
          const handle = displayName.startsWith("@") ? displayName : "@" + displayName;

          tgStatusDot.classList.remove("tg-status-off");
          tgStatusDot.classList.add("tg-status-on");
          // Зелёная точка + @username одной строкой
          tgStatusText.textContent = handle;
          tgStatusUsername.textContent = displayName;

          if (tgConnectedUser) {
            tgConnectedUser.textContent = displayName;
          }

          if (logoutBtn) {
            logoutBtn.style.display = "block";
          }
        } else {
          tgStatusDot.classList.remove("tg-status-on");
          tgStatusDot.classList.add("tg-status-off");
          tgStatusText.textContent = tI18n("new-analysis:telegram_status.not_connected", "Не подключено");
          tgStatusUsername.textContent = "—";

          if (tgConnectedUser) {
            tgConnectedUser.textContent = "@username";
          }

          if (logoutBtn) {
            logoutBtn.style.display = "none";
          }
        }

        updateDataSourceUI();
      }

      function renderQr(url) {
        const box = document.getElementById("tgQrCanvas");
        if (!box) return;

        // чистим
        box.innerHTML = "";

        // вычисляем размер: ширина контейнера минус паддинги
        const available = box.clientWidth - 20; // 20 — если padding 10+10
        const size = Math.max(160, Math.min(available, 220)); // коридор 160–220

        new QRCode(box, {
          text: url,
          width: size,
          height: size,
          correctLevel: QRCode.CorrectLevel.M
        });
      }


      function stopQrPolling() {
        if (tgQrPollTimer) {
          clearInterval(tgQrPollTimer);
          tgQrPollTimer = null;
        }
      }

      async function pollQrStatus() {
        try {
          const data = await apiFetch("/tg/qr/status");

          if (data.status === "waiting") {
            tgQrStatus.textContent = tI18n("new-analysis:telegram_auth_dynamic.qr_waiting", "Ожидаем подтверждение в Telegram…");
            return;
          }

          if (data.status === "expired") {
            tgQrStatus.textContent = tI18n("new-analysis:telegram_auth_dynamic.qr_expired", "QR-код истёк. Обновите QR.");
            tgQrRestartBtn.style.display = "inline-flex";
            stopQrPolling();
            return;
          }

          if (data.status === "password_needed") {
            tgQrStatus.textContent = tI18n("new-analysis:telegram_auth_dynamic.qr_password_required", "Telegram запросил 2FA-пароль. Введите пароль ниже.");
            setTgState("password");
            if (tgQrArea) tgQrArea.style.display = "none";
            stopQrPolling();
            return;
          }

          if (data.status === "authorized") {
            const displayName = getTelegramDisplayName(data);

            tgQrStatus.textContent = tI18n("new-analysis:telegram_auth_dynamic.connected_ok", "Успешно подключено.");
            setTgState("connected");
            setTelegramConnectionStatus(true, displayName);

            stopQrPolling();
            await loadTelegramChats();
            await refreshSubscriptions();
            return;
          }

          if (data.status === "no_qr") {
            tgQrStatus.textContent = "";
            stopQrPolling();
            return;
          }

          if (data.status === "error") {
            tgQrStatus.textContent = tI18n("new-analysis:telegram_auth_dynamic.error_prefix", "Ошибка:") + " " + (data.detail || "unknown");
            stopQrPolling();
            return;
          }
        } catch (e) {
          tgQrStatus.textContent = tI18n("new-analysis:telegram_auth_dynamic.polling_network_error", "Ошибка сети при polling:") + " " + (e?.message || "unknown");
        }
      }

      async function startQrLogin() {
        tgStatusMessage.textContent = "";
        if (tgQrStatus) tgQrStatus.textContent = tI18n("new-analysis:telegram_auth_dynamic.qr_generating", "Генерируем QR-код…");
        // Прячем стартовую кнопку "Получить QR-код" и подсказку под ней —
        // они становятся не нужны после генерации QR.
        if (tgQrStartBtn) tgQrStartBtn.style.display = "none";
        const tgQrInitialHint = document.getElementById("tgQrInitialHint");
        if (tgQrInitialHint) tgQrInitialHint.style.display = "none";
        if (tgQrArea) tgQrArea.style.display = "block";
        if (tgQrRestartBtn) tgQrRestartBtn.style.display = "none";

        stopQrPolling();

        try {
          const data = await apiFetch("/tg/qr/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });

          if (!data?.url) {
            tgQrStatus.textContent = tI18n("new-analysis:telegram_auth_dynamic.qr_start_failed", "Ошибка старта QR: backend не вернул url");
            return;
          }

          renderQr(data.url);
          tgQrStatus.textContent = tI18n("new-analysis:telegram_auth_dynamic.qr_waiting", "Ожидаем подтверждение в Telegram…");

          tgQrPollTimer = setInterval(pollQrStatus, 1500);
        } catch (e) {
          const msg = e?.detail?.detail || e?.detail || e?.message || "unknown";
          tgQrStatus.textContent = tI18n("new-analysis:telegram_auth_dynamic.network_error_prefix", "Ошибка сети:") + " " + msg;
        }
      }

      
      
    async function bootstrapTelegramState() {
      try {
        const data = await apiFetch("/tg/chats", { method: "GET" });

        const chats = Array.isArray(data?.chats) ? data.chats : [];
        const folders = Array.isArray(data?.folders) ? data.folders : [];
        const displayName = getTelegramDisplayName(data);

        cachedChats = chats;
        cachedFolders = folders;

        setTgState("connected");
        setTelegramConnectionStatus(true, displayName);

        // Сразу перерисовываем дерево чатов после успешной загрузки, не
        // полагаясь только на initializeDashboardPage. Иначе при повторных
        // вызовах bootstrap (refresh состояния, cotel-auth-changed) блок
        // «Мои чаты и каналы» мог оставаться скрытым.
        if (typeof renderChatsList === "function") renderChatsList(cachedChats);
        if (typeof renderSubChatsList === "function") {
          renderSubChatsList(getCurrentSubscriptionChatCandidates());
        }
      } catch (e) {
        // Транзиентная ошибка (сетевой сбой, 401 во время обновления токена
        // при перезагрузке страницы) НЕ должна стирать уже загруженные чаты —
        // иначе дерево «Мои чаты» мигает и пропадает на обновлении. Чистим
        // кэш только если чатов ещё не было.
        const hadChats = Array.isArray(cachedChats) && cachedChats.length > 0;
        if (!hadChats) {
          cachedChats = [];
          cachedFolders = [];
          setTgState("phone");
          setTelegramConnectionStatus(false, null);
        } else {
          console.warn("bootstrapTelegramState: сохраняю кэш чатов после ошибки", e);
        }
      }
    }
     

      window.cotelRefreshTelegramState = async function () {
        await bootstrapTelegramState();
      };

      // начальное  состояние
      setTgState("phone");

      function initDashboardLottie() {
        if (!lottieLoaderContainer) return;
        if (dashboardLottieInstance) return;
        if (typeof lottie === "undefined") return;

        dashboardLottieInstance = lottie.loadAnimation({
          container: lottieLoaderContainer,
          renderer: "svg",
          loop: true,
          autoplay: true,
          path: "/assets/lottie/cat-loader.json"
        });
      }

      const LOADER_STATUS_GROUPS_FALLBACK = {
        start: [
          "Ищем нужный чат…",
          "Подключаемся к данным…",
          "Открываем диалог…",
          "Запускаем анализ…",
          "Проверяем доступ к данным…",
          "Настраиваемся на диалог…",
          "Кот готовится к работе…",
          "Открываем канал связи…"
        ],
        collect: [
          "Собираем сообщения…",
          "Собираем историю…",
          "Аккуратно собираем историю…",
          "Перебираем диалог по кусочкам…",
          "Кот уже листает сообщения…",
          "Подгружаем сообщения…",
          "Просматриваем диалог сверху вниз…",
          "Кот пробегается по переписке…",
          "Достаём нужные кусочки из истории…",
          "Сканируем сообщения в поисках смысла…"
        ],
        process: [
          "Раскладываем сообщения по полочкам…",
          "Отбрасываем лишнее…",
          "Выбираем важные фрагменты…",
          "Выделяем ключевые фрагменты…",
          "Складываем мысли в аккуратные стопки…",
          "Приводим данные в порядок…",
          "Сортируем мысли по смыслу…",
          "Чистим шум из диалога…",
          "Собираем структуру ответа…",
          "Выравниваем контекст…"
        ],
        analyze: [
          "Умный анализ в процессе…",
          "Думаем…",
          "Думаем, серьёзно думаем…",
          "Нюхаем, где тут самое важное…",
          "Формируем смысл…",
          "Уточняем контекст…",
          "Сверяем детали…",
          "Собираем мысли вместе…",
          "Ждём, пока ИИ посчитает результаты…"
        ],
        finish: [
          "Почти всё готово…",
          "Почти поймали суть…",
          "Готовим ответ…",
          "Формируем ответ…",
          "Строим ответ по кирпичикам…",
          "Добавляем последние штрихи…",
          "Завершаем обработку…",
          "Упаковываем ответ по конвертикам…"
        ],
        trailing: [
          "Думаем…",
          "Почти всё готово…",
          "Формируем ответ…",
          "Собираем мысли вместе…",
          "Уточняем контекст…",
          "Сверяем детали…",
          "Готовим ответ…",
          "Почти поймали суть…"
        ]
      };

      function getLoaderGroup(name) {
        const fallback = LOADER_STATUS_GROUPS_FALLBACK[name] || [];
        const translated = tI18n("new-analysis:loader_groups." + name, fallback, { returnObjects: true });
        return Array.isArray(translated) && translated.length ? translated : fallback;
      }

      const LOADER_STATUS_GROUPS = new Proxy({}, {
        get(_, name) {
          return getLoaderGroup(name);
        }
      });

      const STATUS_STEP_DURATION_MS = 2000;
      const MIN_STATUS_COUNT = 2;
      const MIN_LOADER_VISIBLE_MS = MIN_STATUS_COUNT * STATUS_STEP_DURATION_MS;

      function randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }

      function shuffleArray(arr) {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      }

      function pickOne(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
      }

      function pickSome(arr, count) {
        return shuffleArray(arr).slice(0, count);
      }

      function buildLoaderSequence() {
        const sequence = [];

        sequence.push(pickOne(LOADER_STATUS_GROUPS.start));

        pickSome(LOADER_STATUS_GROUPS.collect, randomInt(1, 2)).forEach((s) => sequence.push(s));
        pickSome(LOADER_STATUS_GROUPS.process, randomInt(1, 2)).forEach((s) => sequence.push(s));
        pickSome(LOADER_STATUS_GROUPS.analyze, randomInt(1, 2)).forEach((s) => sequence.push(s));

        sequence.push(pickOne(LOADER_STATUS_GROUPS.finish));

        return sequence;
      }

      function renderLoaderStatus(text) {
        if (!dashboardStatusText) return;

        dashboardStatusText.classList.remove("is-visible");
        void dashboardStatusText.offsetWidth;
        dashboardStatusText.textContent = text;
        dashboardStatusText.classList.add("is-visible");
      }

      function stopLoaderStatuses() {
        if (loaderStatusTimer) {
          clearTimeout(loaderStatusTimer);
          loaderStatusTimer = null;
        }
      }

      function startLoaderStatuses() {
        stopLoaderStatuses();

        loaderSequence = buildLoaderSequence();
        loaderSequenceIndex = 0;

        const tick = () => {
          if (!dashboardStatusText) return;

          let nextText = "";

          if (loaderSequenceIndex < loaderSequence.length) {
            nextText = loaderSequence[loaderSequenceIndex];
          } else {
            nextText = pickOne(LOADER_STATUS_GROUPS.trailing);
          }

          renderLoaderStatus(nextText);
          loaderSequenceIndex += 1;
          loaderStatusTimer = setTimeout(tick, STATUS_STEP_DURATION_MS);
        };

        tick();
      }

      function resetLoaderState() {
        stopLoaderStatuses();

        loaderSequence = [];
        loaderSequenceIndex = 0;
        loaderShownAt = 0;

        if (dashboardStatusText) {
          dashboardStatusText.textContent = "";
          dashboardStatusText.classList.remove("is-visible");
        }

        loaderMinResolve = null;
        loaderMinPromise = null;
      }

      function showLoader(show) {
        if (!loader) return;

        if (show) {
          initDashboardLottie();

          loaderShownAt = Date.now();
          loaderMinPromise = new Promise((resolve) => {
            loaderMinResolve = resolve;
          });

          loader.style.display = "flex";
          startLoaderStatuses();

          setTimeout(() => {
            if (typeof loaderMinResolve === "function") {
              loaderMinResolve();
            }
          }, MIN_LOADER_VISIBLE_MS);
        } else {
          loader.style.display = "none";
          resetLoaderState();
        }
      }

      // по умолчанию прячем котика
      showLoader(false);

      // восстановить выбранный режим из localStorage до первой отрисовки
      restoreSelectedDataSourceMode();
      updateDataSourceUI();

      // слушаем переключение источника данных
      async function handleDataSourceChange() {
        persistSelectedDataSourceMode();
        updateDataSourceUI();
        await loadChatHistory();
        renderSubChatsList(getCurrentSubscriptionChatCandidates());
        await refreshSubscriptions();
      }

      dataSourceFileRadio?.addEventListener("change", handleDataSourceChange);
      dataSourceAccountRadio?.addEventListener("change", handleDataSourceChange);
      dataSourcePublicRadio?.addEventListener("change", handleDataSourceChange);
      dataSourceBotRadio?.addEventListener("change", handleDataSourceChange);

      tgQrStartBtn?.addEventListener("click", startQrLogin);
      tgQrRestartBtn?.addEventListener("click", startQrLogin);

      // --- Сворачивание / разворачивание левой панели ---
      if (sidebar && sidebarToggle) {
        sidebarToggle.addEventListener("click", () => {
          const isCollapsed = sidebar.classList.toggle("collapsed");
          sidebarToggle.setAttribute(
            "title",
            isCollapsed
              ? tI18n("new-analysis:sidebar.expand_title", "Развернуть панель")
              : tI18n("new-analysis:sidebar.toggle_title", "Свернуть панель")
          );
          // 👇 ВАЖНО: синхронизируем состояние для CSS (логотип, отступы и т.д.)
          document.body.classList.toggle("sidebar-collapsed", isCollapsed);

        });
      }

      // --- Мини-иконки в свернутой панели ---
      const miniIconButtons = document.querySelectorAll(".sidebar-mini-icon-btn");
      miniIconButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const targetId = btn.getAttribute("data-target");

          // Разворачиваем панель
          if (sidebar) {
            sidebar.classList.remove("collapsed");
          }
          // ВАЖНО: синхронизируем body-класс, иначе CSS-переменная --sidebar-w
          // остаётся равной --sidebar-collapsed-width (56px), и фиксированный
          // хедер навигации продолжает позиционироваться так, будто сайдбар
          // свёрнут — это вызывает наложение хедера на сайдбар.
          document.body.classList.remove("sidebar-collapsed");
          if (sidebarToggle) {
            sidebarToggle.setAttribute("title", tI18n("new-analysis:sidebar.toggle_title", "Свернуть панель"));
          }

          // Открываем нужный блок <details>
          if (targetId) {
            const detailsEl = document.getElementById(targetId);
            if (detailsEl && detailsEl.tagName.toLowerCase() === "details") {
              detailsEl.open = true;
              detailsEl.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
            }
          }
        });
      });

      // --- Resizable sidebar (drag to resize) ---
      (function initSidebarResize() {
        if (!sidebar || !sidebarResizer) return;

        const MIN_W = 280;
        const MAX_W = 520;

        // восстановить ширину из localStorage
        const saved = localStorage.getItem("cotel_sidebar_width");
        if (saved) {
          const w = Math.max(MIN_W, Math.min(MAX_W, parseInt(saved, 10)));
          document.documentElement.style.setProperty("--sidebar-width", `${w}px`);
        }

        let isDragging = false;

        function onMouseMove(e) {
          if (!isDragging) return;

          // если панель свернута — не даём ресайзить
          if (sidebar.classList.contains("collapsed")) return;

          const rect = sidebar.getBoundingClientRect();
          const newW = Math.max(MIN_W, Math.min(MAX_W, e.clientX - rect.left));

          document.documentElement.style.setProperty("--sidebar-width", `${newW}px`);
          localStorage.setItem("cotel_sidebar_width", String(newW));
        }

        function stopDrag() {
          isDragging = false;
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", stopDrag);
        }

        sidebarResizer.addEventListener("mousedown", (e) => {
          // если панель свернута — сначала развернуть (по UX проще)
          if (sidebar.classList.contains("collapsed")) {
            sidebar.classList.remove("collapsed");
            document.body.classList.remove("sidebar-collapsed");
            if (sidebarToggle) sidebarToggle.setAttribute("title", tI18n("new-analysis:sidebar.toggle_title", "Свернуть панель"));
          }

          isDragging = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
          window.addEventListener("mousemove", onMouseMove);
          window.addEventListener("mouseup", stopDrag);
          e.preventDefault();
        });
      })();

      // --- ПОВЕДЕНИЕ БЛОКА АВТОРИЗАЦИИ TELEGRAM ---
      tgSendCodeBtn?.addEventListener("click", async () => {
        const phone =
          typeof window.getTelegramPhoneE164 === "function"
            ? window.getTelegramPhoneE164()
            : (tgPhoneInput?.value || "").trim();
        if (!phone) {
          tgStatusMessage.textContent = tI18n("new-analysis:telegram_auth_dynamic.phone_required", "Введите номер телефона.");
          return;
        }

        tgStatusMessage.textContent = tI18n("new-analysis:telegram_auth_dynamic.sending_code", "Отправляем код…");

        try {
          await apiFetch("/tg/send_code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone }),
          });

          tgStatusMessage.textContent = tI18n("new-analysis:telegram_auth_dynamic.code_sent", "Код отправлен. Проверьте Telegram.");
          setTgState("code");
        } catch (err) {
          const fallback = tI18n("new-analysis:telegram_auth_dynamic.code_send_failed", "Не удалось отправить код.");
          const msg = extractBackendErrorMessage(err) || fallback;
          tgStatusMessage.textContent = tI18n("new-analysis:telegram_auth_dynamic.error_prefix", "Ошибка:") + " " + msg;
        }
      });

      tgConfirmCodeBtn?.addEventListener("click", async () => {
        const phone =
          typeof window.getTelegramPhoneE164 === "function"
            ? window.getTelegramPhoneE164()
            : (tgPhoneInput?.value || "").trim();
        const code = (tgCodeInput?.value || "").trim();

        if (!code) {
          tgStatusMessage.textContent = tI18n("new-analysis:telegram_auth_dynamic.code_required", "Введите код из Telegram.");
          return;
        }

        tgStatusMessage.textContent = tI18n("new-analysis:telegram_auth_dynamic.verifying_code", "Проверяем код…");

        try {
          const data = await apiFetch("/tg/confirm_code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone, code }),
          });

          const displayName = getTelegramDisplayName(data);

          tgStatusMessage.textContent = tI18n("new-analysis:telegram_auth_dynamic.connected_ok", "Успешно подключено.");
          setTgState("connected");
          setTelegramConnectionStatus(true, displayName);
          await loadTelegramChats();
          await refreshSubscriptions();
        } catch (err) {
          const code = extractBackendErrorCode(err);

          if (code === "SESSION_PASSWORD_NEEDED" || code === "PASSWORD_NEEDED") {
            tgStatusMessage.textContent = tI18n("new-analysis:telegram_auth_dynamic.password_required_state", "Требуется пароль Telegram (2FA).");
            setTgState("password");
            return;
          }

          const fallback = tI18n("new-analysis:telegram_auth_dynamic.code_invalid", "Код неверен.");
          const msg = extractBackendErrorMessage(err) || fallback;
          tgStatusMessage.textContent = tI18n("new-analysis:telegram_auth_dynamic.error_prefix", "Ошибка:") + " " + msg;
        }
      });

      tgConfirmPasswordBtn?.addEventListener("click", async () => {
        const password = (tgPasswordInput?.value || "").trim();

        if (!password) {
          tgStatusMessage.textContent = tI18n("new-analysis:telegram_auth_dynamic.password_input_required", "Введите пароль Telegram.");
          return;
        }

        if (!window.crypto?.subtle) {
          tgStatusMessage.textContent = tI18n("new-analysis:telegram_auth_dynamic.password_crypto_unsupported", "Браузер не поддерживает защищённое шифрование пароля.");
          return;
        }

        tgStatusMessage.textContent = tI18n("new-analysis:telegram_auth_dynamic.password_preparing", "Подготавливаем защищённую отправку пароля…");

        try {
          const enc = await apiFetch("/tg/password_encryption/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });

          const contextId = enc?.context_id;
          const publicKeyPem = enc?.public_key_pem;

          if (!contextId || !publicKeyPem) {
            throw new Error("ENCRYPTION_CONTEXT_INVALID");
          }

          const passwordCiphertext = await encryptTelegramPassword(password, publicKeyPem);

          tgStatusMessage.textContent = tI18n("new-analysis:telegram_auth_dynamic.password_confirming", "Подтверждаем пароль…");

          const data = await apiFetch("/tg/confirm_password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              encryption_context_id: contextId,
              password_ciphertext: passwordCiphertext,
            }),
          });

          if (tgPasswordInput) tgPasswordInput.value = "";

          const displayName = getTelegramDisplayName(data);

          tgStatusMessage.textContent = tI18n("new-analysis:telegram_auth_dynamic.connected_ok", "Успешно подключено.");
          setTgState("connected");
          setTelegramConnectionStatus(true, displayName);
          await loadTelegramChats();
          await refreshSubscriptions();
        } catch (err) {
          const fallback = tI18n("new-analysis:telegram_auth_dynamic.password_confirm_failed", "Не удалось подтвердить пароль.");
          const msg = extractBackendErrorMessage(err) || fallback;
          tgStatusMessage.textContent = tI18n("new-analysis:telegram_auth_dynamic.error_prefix", "Ошибка:") + " " + msg;
        }
      });

      tgCancelCodeBtn?.addEventListener("click", () => {
        if (tgPhoneInput) tgPhoneInput.value = "";
        if (tgCodeInput) tgCodeInput.value = "";
        if (tgStatusMessage) tgStatusMessage.textContent = "";
        setTgState("phone");
        setTelegramConnectionStatus(false, null);
      });

      [tgLogoutBtn, tgLogoutBtnStatus].forEach((btn) => {
        btn?.addEventListener("click", async () => {
          tgStatusMessage.textContent = tI18n("new-analysis:telegram_auth_dynamic.ending_session", "Завершаем сессию…");

          try {
            await apiFetch("/tg/logout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            });

            if (tgPhoneInput) tgPhoneInput.value = "";
            if (tgCodeInput) tgCodeInput.value = "";
            if (tgPasswordInput) tgPasswordInput.value = "";

            cachedChats = [];
            renderChatsList([]);
            renderSubChatsList([]);

            setTgState("phone");
            setTelegramConnectionStatus(false, null);

            if (typeof window.applyTelegramPhoneFromCurrentUser === "function") {
              window.applyTelegramPhoneFromCurrentUser();
            }

            tgStatusMessage.textContent = tI18n("new-analysis:telegram_auth_dynamic.session_ended", "Сессия завершена.");
            await loadChatHistory();

          } catch (err) {
            const fallback = tI18n("new-analysis:telegram_auth_dynamic.session_end_failed", "Не удалось завершить сессию.");
            const msg = extractBackendErrorMessage(err) || fallback;
            tgStatusMessage.textContent = tI18n("new-analysis:telegram_auth_dynamic.error_prefix", "Ошибка:") + " " + msg;
          }
        });
      });


      // клик по кнопке с иконкой → открываем выбор файла
      if (uploadBtn && fileInput) {
        uploadBtn.addEventListener("click", () => {
          fileInput.value = "";
          fileInput.click();
        });

        fileInput.addEventListener("change", () => {
          if (!fileInput.files[0]) return;
          if (resultDiv) {
            resultDiv.textContent = tI18n("new-analysis:telegram_auth_dynamic.file_selected", `Выбран файл: ${fileInput.files[0].name}`, { name: fileInput.files[0].name });
          }
        });
      }


      async function loadTelegramChats() {
        try {
          const data = await apiFetch("/tg/chats", {
            method: "GET",
          });

          cachedChats = Array.isArray(data?.chats) ? data.chats : [];
          cachedFolders = Array.isArray(data?.folders) ? data.folders : [];
          renderChatsList(cachedChats);
          renderSubChatsList(cachedChats);
        } catch (e) {
          cachedChats = [];
          cachedFolders = [];
          renderChatsList([]);
          renderSubChatsList([]);
        }
      }

      // Хелпер: ссылка для chat-item (для подстановки в поле выбранного чата).
      function chatLinkValue(c) {
        return c.username ? `@${c.username}` : String(c.id || "");
      }

      // ===== Group analysis: helpers =====

      function isGroupModeOn() {
        return !!(queryGroupModeToggle && queryGroupModeToggle.checked);
      }

      function getGroupChatsLimitForPlan() {
        const code = String(getPlanInfo()?.code || "free").toLowerCase();
        if (code === "free") return 3;
        if (code === "basic") return 10;
        return 20; // pro and any future paid tier
      }

      function getSelectedGroupCount() {
        return selectedGroupChats.size;
      }

      function updateGroupCounter() {
        if (!groupSelectionCounter || !groupSelectionCount) return;
        const n = getSelectedGroupCount();
        groupSelectionCount.textContent = String(n);
        if (isGroupModeOn() && n > 0) {
          groupSelectionCounter.classList.remove("hidden");
        } else {
          groupSelectionCounter.classList.add("hidden");
          // Reset collapsed state so it doesn't carry over to the next selection.
          groupSelectionCounter.classList.remove("group-selection-counter--collapsed");
          if (groupCounterCollapseChevron) groupCounterCollapseChevron.textContent = "▾";
          if (groupCounterCollapseBtn) groupCounterCollapseBtn.setAttribute("aria-expanded", "true");
        }
        // Show collapse button only when there's more than one selected chat —
        // for a single chat there's nothing to collapse.
        if (groupCounterCollapseBtn) {
          groupCounterCollapseBtn.style.visibility = (n > 1) ? "visible" : "hidden";
        }
        renderSelectedChatsList();
      }

      function clearGroupSelection() {
        selectedGroupChats.clear();
        updateGroupCounter();
      }

      // Lookup the human-readable title for a chat link by walking the
      // cached chat list. Fallback to the link itself so the user always
      // sees SOMETHING in the removable-pill, even if the chat is gone.
      function getChatTitleByLink(link) {
        if (typeof cachedChats === "undefined" || !Array.isArray(cachedChats)) return link;
        const found = cachedChats.find((c) => chatLinkValue(c) === link);
        return (found && (found.title || found.username)) || link;
      }

      // Re-render the list of selected chats inside #groupSelectedChatsList.
      // Each row shows the chat title + a ✕ button that removes it from the
      // selection AND unchecks the corresponding row in the chat tree.
      function renderSelectedChatsList() {
        if (!groupSelectedChatsList) return;
        groupSelectedChatsList.innerHTML = "";
        if (!selectedGroupChats.size) return;
        // Preserve insertion order — Set iterates in insertion order.
        selectedGroupChats.forEach((link) => {
          const row = document.createElement("div");
          row.className = "group-selected-chat";

          const titleEl = document.createElement("span");
          titleEl.className = "group-selected-chat__title";
          const title = getChatTitleByLink(link);
          titleEl.textContent = title;
          titleEl.title = title; // tooltip for long names
          row.appendChild(titleEl);

          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "group-selected-chat__remove";
          removeBtn.setAttribute(
            "aria-label",
            tI18n("new-analysis:chat_requests.group_remove_one", "Убрать из группы")
          );
          removeBtn.title = tI18n("new-analysis:chat_requests.group_remove_one", "Убрать из группы");
          removeBtn.textContent = "✕";
          removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            removeChatFromGroup(link);
          });
          row.appendChild(removeBtn);

          groupSelectedChatsList.appendChild(row);
        });
      }

      // Remove a single chat from the group selection, then sync visual
      // state of the chat tree (uncheck both the chat row and its parent
      // folder header checkbox, if any).
      function removeChatFromGroup(link) {
        if (!selectedGroupChats.has(link)) return;
        selectedGroupChats.delete(link);
        if (typeof refreshGroupVisualState === "function") {
          refreshGroupVisualState();
        }
        updateGroupCounter();
      }

      // Clear-all action exposed by the «Снять всё» button. Same as
      // clearGroupSelection() but also syncs the tree visuals.
      function clearAllSelectedChats() {
        if (!selectedGroupChats.size) return;
        selectedGroupChats.clear();
        if (typeof refreshGroupVisualState === "function") {
          refreshGroupVisualState();
        }
        updateGroupCounter();
      }

      function toggleChatInGroup(link, chatItemEl, checkboxEl) {
        const limit = getGroupChatsLimitForPlan();
        if (selectedGroupChats.has(link)) {
          selectedGroupChats.delete(link);
          if (chatItemEl) chatItemEl.classList.remove("sidebar-chat-item--selected");
          if (checkboxEl) checkboxEl.checked = false;
        } else {
          if (selectedGroupChats.size >= limit) {
            // Undo the visual check the browser may have applied.
            if (checkboxEl) checkboxEl.checked = false;
            alert(
              tI18n("new-analysis:chat_requests.group_limit_reached", "Можно выбрать не более {{n}} чатов.")
                .replace("{{n}}", String(limit))
            );
            return;
          }
          selectedGroupChats.add(link);
          if (chatItemEl) chatItemEl.classList.add("sidebar-chat-item--selected");
          if (checkboxEl) checkboxEl.checked = true;
        }
        updateGroupCounter();
      }

      // Folder-level toggle: select up to (limit - alreadySelected) chats from
      // the folder. If folder has more chats than free slots, fill up to the
      // limit and warn. If folder is fully selected → uncheck all its chats.
      function toggleFolderInGroup(folderChats, folderCheckboxEl) {
        if (!Array.isArray(folderChats) || !folderChats.length) return;
        const folderLinks = folderChats.map((c) => chatLinkValue(c)).filter(Boolean);
        const allSelected = folderLinks.every((l) => selectedGroupChats.has(l));

        if (allSelected) {
          // Deselect all chats in this folder.
          folderLinks.forEach((l) => selectedGroupChats.delete(l));
          if (folderCheckboxEl) folderCheckboxEl.checked = false;
          // Re-render visual state of items in the DOM.
          refreshGroupVisualState();
          updateGroupCounter();
          return;
        }

        // Select as many as possible up to the plan limit.
        const limit = getGroupChatsLimitForPlan();
        const slotsLeft = Math.max(0, limit - selectedGroupChats.size);
        if (slotsLeft === 0) {
          if (folderCheckboxEl) folderCheckboxEl.checked = false;
          alert(
            tI18n("new-analysis:chat_requests.group_limit_reached", "Можно выбрать не более {{n}} чатов.")
              .replace("{{n}}", String(limit))
          );
          return;
        }
        let added = 0;
        for (const l of folderLinks) {
          if (selectedGroupChats.has(l)) continue;
          if (added >= slotsLeft) break;
          selectedGroupChats.add(l);
          added++;
        }
        const stillUnselected = folderLinks.length - folderLinks.filter((l) => selectedGroupChats.has(l)).length;
        if (stillUnselected > 0) {
          // Truncated due to limit — let the user know which limit was hit.
          alert(
            tI18n("new-analysis:chat_requests.group_limit_folder_truncated",
                  "Ограничение по групповому запросу: выбрано {{n}} чатов из {{total}}.")
              .replace("{{n}}", String(added))
              .replace("{{total}}", String(folderLinks.length))
          );
        }
        if (folderCheckboxEl) {
          folderCheckboxEl.checked = folderLinks.every((l) => selectedGroupChats.has(l));
        }
        refreshGroupVisualState();
        updateGroupCounter();
      }

      // After programmatic selection changes (e.g. folder toggle, ✕ in the
      // selected-list, "Снять всё"), update the visual state across the chat
      // tree AND the chat-history list so checkboxes stay in sync everywhere
      // a chat can appear.
      function refreshGroupVisualState() {
        // 1) Main chat tree items
        if (myChatsList) {
          const items = myChatsList.querySelectorAll(".sidebar-chat-item");
          items.forEach((el) => {
            const link = el.getAttribute("data-link") || "";
            const isSel = selectedGroupChats.has(link);
            el.classList.toggle("sidebar-chat-item--selected", isSel);
            const cb = el.querySelector(".group-chat-checkbox");
            if (cb) cb.checked = isSel;
          });
          // Sync folder-level checkboxes (checked iff all inner chats are).
          const folderHeaders = myChatsList.querySelectorAll(".sidebar-folder");
          folderHeaders.forEach((folderEl) => {
            const folderCb = folderEl.querySelector(".group-folder-checkbox");
            if (!folderCb) return;
            const inner = folderEl.querySelectorAll(".sidebar-chat-item");
            if (!inner.length) {
              folderCb.checked = false;
              return;
            }
            let allSel = true;
            inner.forEach((it) => {
              const l = it.getAttribute("data-link") || "";
              if (!selectedGroupChats.has(l)) allSel = false;
            });
            folderCb.checked = allSel;
          });
        }
        // 2) Chat-history list (group mode also exposes checkboxes here).
        if (typeof chatHistoryList !== "undefined" && chatHistoryList) {
          const hist = chatHistoryList.querySelectorAll(".sidebar-history-item");
          hist.forEach((el) => {
            const link = el.getAttribute("data-chat-ref") || "";
            const isSel = selectedGroupChats.has(link);
            el.classList.toggle("sidebar-history-item--selected", isSel);
            const cb = el.querySelector(".group-history-checkbox");
            if (cb) cb.checked = isSel;
          });
        }
      }

      // Создаёт DOM-ноду для одного чата в сайдбаре.
      function createChatItemEl(chat, mode = "qa") {
        const el = document.createElement("div");
        el.className = "sidebar-chat-item";
        const link = chatLinkValue(chat);
        const title = chat.title || tI18n("new-analysis:subscription_dynamic.untitled", "Без названия");
        el.setAttribute("data-link", link);
        // No `title` attribute — the chat name is already visible in the row,
        // a tooltip with the same text on hover is just noise.

        // Use a span for title so we can append the checkbox separately
        // in group mode without colliding with textContent.
        const titleSpan = document.createElement("span");
        titleSpan.textContent = title; // textContent — никаких XSS на title из Telegram
        el.appendChild(titleSpan);

        // В режиме подписки группового мультивыбора нет — это всегда один чат.
        // Просто кликабельный элемент, по клику заполняем subChatInput.
        if (mode === "subscription") {
          el.addEventListener("click", () => {
            const input = document.getElementById("subChatInput");
            if (input) input.value = link;
          });
          return el;
        }

        if (isGroupModeOn()) {
          el.classList.add("sidebar-chat-item--group");
          if (selectedGroupChats.has(link)) {
            el.classList.add("sidebar-chat-item--selected");
          }
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.className = "group-chat-checkbox";
          checkbox.checked = selectedGroupChats.has(link);
          checkbox.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleChatInGroup(link, el, checkbox);
          });
          el.appendChild(checkbox);

          // Clicking the row also toggles the checkbox in group mode.
          el.addEventListener("click", (e) => {
            // If the user clicked the checkbox directly, the handler
            // above already fired — don't double-toggle.
            if (e.target === checkbox) return;
            toggleChatInGroup(link, el, checkbox);
          });
        } else {
          el.addEventListener("click", () => {
            if (activeChatInput) activeChatInput.value = link;
          });
        }
        return el;
      }

      // Создаёт DOM-ноду для папки со списком чатов внутри.
      // chats — массив объектов чата (а не id), уже отфильтрованных
      // от пропавших/архивных. isOrphans=true для синтетической секции
      // "Без папки".
      function createFolderEl({ id, title, emoticon, chats, isOrphans = false, mode = "qa" }) {
        const folderEl = document.createElement("div");
        folderEl.className = "sidebar-folder";
        if (isOrphans) folderEl.classList.add("sidebar-folder--orphans");

        // Папки в подписке/Q&A используют один и тот же localStorage-ключ,
        // чтобы свёрнутое/развёрнутое состояние было сквозным. Если позже
        // решим разделить — добавим суффикс по mode.
        const collapsed = isFolderCollapsed(id);
        if (collapsed) folderEl.classList.add("sidebar-folder--collapsed");

        const toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.className = "sidebar-folder__toggle";
        toggleBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");

        const chevron = document.createElement("span");
        chevron.className = "sidebar-folder__chevron";
        chevron.textContent = collapsed ? "▸" : "▾";
        toggleBtn.appendChild(chevron);

        if (emoticon) {
          const emo = document.createElement("span");
          emo.className = "sidebar-folder__emoji";
          emo.textContent = emoticon;
          toggleBtn.appendChild(emo);
        }

        const titleEl = document.createElement("span");
        titleEl.className = "sidebar-folder__title";
        titleEl.textContent = title;
        toggleBtn.appendChild(titleEl);

        const countEl = document.createElement("span");
        countEl.className = "sidebar-folder__count";
        countEl.textContent = String(chats.length);
        toggleBtn.appendChild(countEl);

        toggleBtn.addEventListener("click", () => {
          const nowCollapsed = !folderEl.classList.contains("sidebar-folder--collapsed");
          folderEl.classList.toggle("sidebar-folder--collapsed", nowCollapsed);
          chevron.textContent = nowCollapsed ? "▸" : "▾";
          toggleBtn.setAttribute("aria-expanded", nowCollapsed ? "false" : "true");
          setFolderCollapsed(id, nowCollapsed);
        });

        // В подписке группового чекбокса на папку не существует — там
        // выбирается всегда ровно один чат. Поэтому ветка группы пропускается.
        if (mode !== "subscription" && isGroupModeOn()) {
          const headerRow = document.createElement("div");
          headerRow.style.display = "flex";
          headerRow.style.alignItems = "center";
          headerRow.appendChild(toggleBtn);

          const folderCb = document.createElement("input");
          folderCb.type = "checkbox";
          folderCb.className = "group-folder-checkbox";
          // Pre-check if all inner chats are already in the selection set.
          const folderLinks = chats.map((c) => chatLinkValue(c)).filter(Boolean);
          folderCb.checked = folderLinks.length > 0 && folderLinks.every((l) => selectedGroupChats.has(l));
          folderCb.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFolderInGroup(chats, folderCb);
          });
          headerRow.appendChild(folderCb);

          folderEl.appendChild(headerRow);
        } else {
          folderEl.appendChild(toggleBtn);
        }

        const itemsEl = document.createElement("div");
        itemsEl.className = "sidebar-folder__items";
        chats.forEach((chat) => itemsEl.appendChild(createChatItemEl(chat, mode)));
        folderEl.appendChild(itemsEl);

        return folderEl;
      }

      function renderChatsList(list) {
        if (!myChatsList) return;

        const items = Array.isArray(list) ? list : [];

        if (!items.length) {
          myChatsList.innerHTML = "";
          if (availableChatsBlock) availableChatsBlock.classList.add("hidden");
          return;
        }

        if (availableChatsBlock) availableChatsBlock.classList.remove("hidden");

        // Если это отфильтрованный (поиском) подсписок чатов, или
        // у пользователя вообще нет папок — рендерим плоско.
        // Сравниваем по ссылке: filterChatsByInput передаёт отфильтрованный
        // массив, в этом случае iter !== cachedChats и нужна плоская выдача.
        const usingFullList = items === cachedChats;
        const folders = Array.isArray(cachedFolders) ? cachedFolders : [];

        myChatsList.innerHTML = "";

        if (!usingFullList || !folders.length) {
          // Плоский рендер
          items.forEach((c) => myChatsList.appendChild(createChatItemEl(c)));
          setAvailableChatsExpanded(isAvailableChatsExpanded);
          return;
        }

        // Иерархический рендер. Карта id → чат.
        const chatsById = new Map();
        cachedChats.forEach((c) => {
          if (c && c.id != null) chatsById.set(c.id, c);
        });

        // Множество id, попавших хотя бы в одну папку — для секции "Без папки".
        const inAnyFolder = new Set();

        folders.forEach((f) => {
          const chatsInFolder = (f.chat_ids || [])
            .map((id) => chatsById.get(id))
            .filter(Boolean);
          if (!chatsInFolder.length) return; // пустую папку не показываем
          chatsInFolder.forEach((c) => inAnyFolder.add(c.id));
          myChatsList.appendChild(createFolderEl({
            id: f.id,
            title: f.title,
            emoticon: f.emoticon,
            chats: chatsInFolder,
            isOrphans: false,
          }));
        });

        // "Без папки" — всё, что не попало ни в одну пользовательскую папку.
        const orphans = cachedChats.filter((c) => !inAnyFolder.has(c.id));
        if (orphans.length) {
          myChatsList.appendChild(createFolderEl({
            id: "orphans",
            title: tI18n("new-analysis:chat_requests.folder_orphans_title", "Без папки"),
            emoticon: null,
            chats: orphans,
            isOrphans: true,
          }));
        }

        setAvailableChatsExpanded(isAvailableChatsExpanded);
      }

      function renderSubChatsList(list) {
        if (!subChatsList) return;

        const items = Array.isArray(list) ? list : [];

        subChatsList.innerHTML = "";

        if (!items.length) return;

        // Дерево с папками доступно только в personal-режиме и только
        // когда отображается полный список (без поискового сужения).
        // В service-режиме чаты приходят из истории — там понятия папки
        // у нас нет, остаётся плоский рендер.
        const isPersonal = getCurrentSubscriptionSourceMode() === "personal";
        const usingFullList = isPersonal && items === cachedChats;
        const folders = Array.isArray(cachedFolders) ? cachedFolders : [];

        if (!usingFullList || !folders.length) {
          items.forEach((c) => subChatsList.appendChild(createChatItemEl(c, "subscription")));
          return;
        }

        // Иерархический рендер — точная копия логики renderChatsList,
        // только с mode="subscription" и без группового мультивыбора.
        const chatsById = new Map();
        cachedChats.forEach((c) => {
          if (c && c.id != null) chatsById.set(c.id, c);
        });

        const inAnyFolder = new Set();

        folders.forEach((f) => {
          const chatsInFolder = (f.chat_ids || [])
            .map((id) => chatsById.get(id))
            .filter(Boolean);
          if (!chatsInFolder.length) return;
          chatsInFolder.forEach((c) => inAnyFolder.add(c.id));
          subChatsList.appendChild(createFolderEl({
            id: f.id,
            title: f.title,
            emoticon: f.emoticon,
            chats: chatsInFolder,
            isOrphans: false,
            mode: "subscription",
          }));
        });

        const orphans = cachedChats.filter((c) => !inAnyFolder.has(c.id));
        if (orphans.length) {
          subChatsList.appendChild(createFolderEl({
            id: "orphans",
            title: tI18n("new-analysis:chat_requests.folder_orphans_title", "Без папки"),
            emoticon: null,
            chats: orphans,
            isOrphans: true,
            mode: "subscription",
          }));
        }
      }

      function filterChatsByInput() {
        const q = (activeChatInput?.value || "").trim().toLowerCase();
        if (!q) {
          renderChatsList(cachedChats);
          return;
        }
      
        // фильтрация по title (и по username тоже, чтобы удобно)
        const filtered = cachedChats.filter((c) => {
          const t = (c.title || "").toLowerCase();
          const u = (c.username || "").toLowerCase();
          return t.includes(q) || u.includes(q.replace("@", ""));
        });
      
        renderChatsList(filtered);
      }

      async function openModal() {
        if (!botConnectModal) return;

        // Заранее показываем модалку — кнопка/ссылка станут активны после получения кода
        botConnectModal.style.display = "flex";

        if (modalOpenBotBtn) {
          modalOpenBotBtn.setAttribute("href", "#");
          modalOpenBotBtn.setAttribute("aria-disabled", "true");
        }
        if (modalOpenBotWebLink) {
          modalOpenBotWebLink.setAttribute("href", "#");
          modalOpenBotWebLink.setAttribute("aria-disabled", "true");
          modalOpenBotWebLink.textContent = "…";
        }

        try {
          const data = await apiFetch("/tg/bot/link/start", { method: "POST" });
          const code = data?.code || "";
          const webLink = data?.deeplink || "";

          // username бота: предпочитаем поле bot_username, иначе парсим из deeplink
          let botUsername = (data?.bot_username || "").trim();
          if (!botUsername && webLink) {
            const m = String(webLink).match(/t\.me\/([^/?#]+)/i);
            if (m && m[1]) botUsername = m[1];
          }

          if (!code || !webLink || !botUsername) {
            console.error("bot link start: bad response", data);
            if (modalOpenBotWebLink) modalOpenBotWebLink.textContent = "Не удалось получить код, попробуйте ещё раз";
            return;
          }

          // Нативная схема — открывает установленное приложение Telegram под текущим аккаунтом
          const tgScheme = `tg://resolve?domain=${botUsername}&start=${encodeURIComponent(code)}`;

          if (modalOpenBotBtn) {
            modalOpenBotBtn.setAttribute("href", tgScheme);
            modalOpenBotBtn.removeAttribute("aria-disabled");
          }
          if (modalOpenBotWebLink) {
            modalOpenBotWebLink.setAttribute("href", webLink);
            modalOpenBotWebLink.textContent = webLink;
            modalOpenBotWebLink.removeAttribute("aria-disabled");
          }
        } catch (e) {
          console.error("bot link start failed", e);
          if (modalOpenBotWebLink) modalOpenBotWebLink.textContent = "Не удалось получить код, попробуйте ещё раз";
        }
      }

      function closeModal() {
        if (botConnectModal) botConnectModal.style.display = "none";
      }

      modalCloseBtn?.addEventListener("click", closeModal);
      botConnectModal?.addEventListener("click", (e) => {
        if (e.target === botConnectModal) closeModal();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && botConnectModal && botConnectModal.style.display !== "none") {
          closeModal();
        }
      });

      subChatInput?.addEventListener("input", () => {
        const q = (subChatInput.value || "").trim().toLowerCase();
        const source = getCurrentSubscriptionChatCandidates();

        if (!q) {
          renderSubChatsList(source);
          return;
        }

        const filtered = source.filter((c) => {
          const t = (c.title || "").toLowerCase();
          const u = (c.username || "").toLowerCase();
          const r = (c.chat_ref || "").toLowerCase();
          return t.includes(q) || u.includes(q.replace("@", "")) || r.includes(q);
        });

        renderSubChatsList(filtered);
      });

      function periodToMinutes(v) {
        // UI values in <select>: 10m/30m/1h/3h/6h/1d
        const map = {
          "10m": 10,
          "30m": 30,
          "1h": 60,
          "3h": 180,
          "6h": 360,
          "12h": 720,
          "1d": 1440
        };
        return map[v] ?? 60;
      }

      function minutesToHuman(m) {
          const n = Number(m);
          if (n === 10) return tI18n("new-analysis:subscription_frequency.human_10m", "1 раз в 10 минут");
          if (n === 30) return tI18n("new-analysis:subscription_frequency.human_30m", "1 раз в 30 минут");
          if (n === 60) return tI18n("new-analysis:subscription_frequency.human_1h", "1 раз в час");
          if (n === 180) return tI18n("new-analysis:subscription_frequency.human_3h", "1 раз в 3 часа");
          if (n === 360) return tI18n("new-analysis:subscription_frequency.human_6h", "1 раз в 6 часов");
          if (n === 720) return tI18n("new-analysis:subscription_frequency.human_12h_half_day", "1 раз в 12 часов (полдня)");
          if (n === 1440) return tI18n("new-analysis:subscription_frequency.human_1d", "1 раз в день");
          return tI18n("new-analysis:subscription_dynamic.n_minutes_short", `${n} мин`, { n });
      }

      function frequencyMinutesToPeriodValue(minutes, type) {
        const m = Number(minutes);

        if (type === "digest") {
          if (m === 360) return "6h";
          if (m === 720) return "12h";
          if (m === 1440) return "1d";
          return "6h";
        }

        if (m === 30) return "30m";
        if (m === 60) return "1h";
        if (m === 180) return "3h";
        if (m === 360) return "6h";
        return "1h";
      }

     async function apiGetSubscriptions(sourceMode) {
      try {
        const params = new URLSearchParams();
        if (sourceMode) params.set("source_mode", sourceMode);

        const suffix = params.toString() ? `?${params.toString()}` : "";
        const data = await apiFetch(`/subscriptions${suffix}`, {
          method: "GET"
        });

        return Array.isArray(data) ? data : [];
      } catch (e) {
        const msg = e?.detail?.detail || e?.detail?.message || e?.detail || e?.message || "SUBSCRIPTIONS_LOAD_FAILED";
        throw new Error(msg);
      }
    }

      async function apiCreateSubscription(payload) {
        return await apiFetch("/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(payload)
        });
      }

      async function apiDeleteSubscription(subscriptionId) {
        return await apiFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
          method: "DELETE"
        });
      }

      async function apiSwitchSubscriptionMode(subscriptionId, targetSourceMode) {
        try {
          return await apiFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}/switch-mode`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              target_source_mode: targetSourceMode
            })
          });
        } catch (e) {
          const msg =
            e?.detail?.message ||
            e?.detail?.detail ||
            e?.detail ||
            e?.message ||
            "SUBSCRIPTION_SWITCH_MODE_FAILED";
          throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
        }
      }

      function renderSubscriptions(currentList, otherList) {
        if (!subscriptionsList) return;

        const currentSubs = Array.isArray(currentList) ? currentList : [];
        const otherSubs = Array.isArray(otherList) ? otherList : [];

        if (!currentSubs.length && !otherSubs.length) {
          subscriptionsList.innerHTML = "";
          return;
        }

        function escapeSubName(value) {
          return String(value || tI18n("new-analysis:subscription_dynamic.default_name", "Подписка"))
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        }

        function getStatusDotClass(s) {
          const status = String(s.status || (s.is_active ? "active" : "paused")).toLowerCase();
          let dotClass = "subscription-status-dot";

          if (status === "paused") dotClass += " is-paused";
          if (status === "error") dotClass += " is-error";
          if (status === "trial_expired") dotClass += " is-error";

          return dotClass;
        }

  function getSubscriptionStatusTitle(s) {
    const status = String(s.status || (s.is_active ? "active" : "paused")).toLowerCase();

    if (status === "trial_expired") {
      return tI18n("new-analysis:subscription_status.trial_expired", "Пробный период подписки завершён");
    }
    if (status === "paused") {
      return tI18n("new-analysis:subscription_status.paused", "Подписка на паузе");
    }
    if (status === "error") {
      return tI18n("new-analysis:subscription_status.error", "Ошибка подписки");
    }
    return tI18n("new-analysis:subscription_status.active", "Подписка активна");
  }

  function renderCurrentCard(s) {
    const safeName = escapeSubName(s.name);
    const planCode = String(getPlanInfo()?.code || "").toLowerCase();
    const canDelete = planCode !== "free";

    const ariaLabel = escapeHtml(tI18n("new-analysis:subscription_actions.aria_label", "Действия подписки"));
    const titlePause = escapeHtml(tI18n("new-analysis:subscription_actions.pause", "Приостановить"));
    const titlePlay = escapeHtml(tI18n("new-analysis:subscription_actions.resume", "Включить"));
    const titleEdit = escapeHtml(tI18n("new-analysis:subscription_actions.edit", "Редактировать"));
    const titleDelete = escapeHtml(tI18n("new-analysis:subscription_actions.delete", "Удалить"));

    return `
      <div class="subscription-item" data-sub-id="${s.id || ""}" title="${safeName}">
        <span class="${getStatusDotClass(s)}" title="${getSubscriptionStatusTitle(s)}"></span>
        <span class="subscription-name">${safeName}</span>

        <div class="subscription-actions-mini" aria-label="${ariaLabel}">
          <button class="subscription-action-btn sub-btn-pause" type="button" title="${titlePause}">⏸</button>
          <button class="subscription-action-btn sub-btn-play" type="button" title="${titlePlay}">▶</button>
          <button class="subscription-action-btn sub-btn-edit" type="button" title="${titleEdit}">✎</button>
          ${canDelete ? `<button class="subscription-action-btn sub-btn-del" type="button" title="${titleDelete}">✕</button>` : ``}
        </div>
      </div>
    `;
  }

    function renderOtherCard(s) {
    const safeName = escapeSubName(s.name);
    const planCode = String(getPlanInfo()?.code || "").toLowerCase();
    const canDelete = planCode !== "free";

    const ariaLabel = escapeHtml(tI18n("new-analysis:subscription_actions.aria_label_other", "Действия подписки из другого режима"));
    const titleActivate = escapeHtml(tI18n("new-analysis:subscription_actions.activate_current", "Активировать в текущем режиме"));
    const titleDelete = escapeHtml(tI18n("new-analysis:subscription_actions.delete", "Удалить"));

    return `
      <div class="subscription-item subscription-item--inactive" data-sub-id="${s.id || ""}" title="${safeName}">
        <span class="${getStatusDotClass(s)}" title="${getSubscriptionStatusTitle(s)}"></span>
        <span class="subscription-name">${safeName}</span>

        <div class="subscription-actions-mini" aria-label="${ariaLabel}">
          <button
            class="subscription-action-btn sub-btn-switch"
            type="button"
            title="${titleActivate}"
          >⇄</button>
          ${canDelete ? `
          <button
            class="subscription-action-btn sub-btn-del-other"
            type="button"
            title="${titleDelete}"
          >✕</button>` : ``}
        </div>
      </div>
    `;
  }

  let html = "";

  if (currentSubs.length) {
    html += `
      <div class="subscriptions-group">
        <div class="subscriptions-group-title">${escapeHtml(tI18n("new-analysis:subscription_groups.current_title", "Активные в этом режиме"))}</div>
        <div class="subscriptions-group-list">
          ${currentSubs.map(renderCurrentCard).join("")}
        </div>
      </div>
    `;
  }

  if (otherSubs.length) {
    html += `
      <div class="subscriptions-group subscriptions-group--other">
        <div class="subscriptions-group-title">${escapeHtml(tI18n("new-analysis:subscription_groups.other_title", "Из другого режима"))}</div>
        <div class="subscriptions-group-note">
          ${escapeHtml(tI18n("new-analysis:subscription_groups.other_note", "Эти подписки созданы в другом режиме и пока не активны здесь."))}
        </div>
        <div class="subscriptions-group-list">
          ${otherSubs.map(renderOtherCard).join("")}
        </div>
      </div>
    `;
  }

  subscriptionsList.innerHTML = html;

  // ===== текущий режим =====

  subscriptionsList.querySelectorAll(".sub-btn-del").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const item = btn.closest(".subscription-item");
      const subId = item?.getAttribute("data-sub-id");
      if (!subId) return;

      const ok = confirm(tI18n("new-analysis:subscription_actions.delete_confirm", "Удалить подписку?"));
      if (!ok) return;

      try {
        await apiDeleteSubscription(subId);
        await refreshSubscriptions();

        if (typeof window.cotelRefreshPlanUsageSnapshot === "function") {
          await window.cotelRefreshPlanUsageSnapshot();
        }
        refreshLimitBoundControls();
      } catch (err) {
        alert(tI18n("new-analysis:subscription_actions.delete_error_prefix", "Ошибка удаления:") + " " + normalizePlanErrorMessage(err));
      }
    });
  });

  subscriptionsList.querySelectorAll(".sub-btn-pause").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.closest(".subscription-item")?.dataset.subId;
      if (!id) return;
      await updateSubscriptionActive(id, false);
    });
  });

  subscriptionsList.querySelectorAll(".sub-btn-play").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.closest(".subscription-item")?.dataset.subId;
      if (!id) return;
      await updateSubscriptionActive(id, true);
    });
  });

  subscriptionsList.querySelectorAll(".sub-btn-edit").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.closest(".subscription-item")?.dataset.subId;
      if (!id) return;
      await openEditSubscription(id);
    });
  });

  // ===== другой режим =====

  subscriptionsList.querySelectorAll(".sub-btn-del-other").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const item = btn.closest(".subscription-item");
      const subId = item?.getAttribute("data-sub-id");
      if (!subId) return;

      const ok = confirm(tI18n("new-analysis:subscription_actions.delete_confirm", "Удалить подписку?"));
      if (!ok) return;

      try {
        await apiDeleteSubscription(subId);
        await refreshSubscriptions();

        if (typeof window.cotelRefreshPlanUsageSnapshot === "function") {
          await window.cotelRefreshPlanUsageSnapshot();
        }
        refreshLimitBoundControls();
      } catch (err) {
        alert(tI18n("new-analysis:subscription_actions.delete_error_prefix", "Ошибка удаления:") + " " + normalizePlanErrorMessage(err));
      }
    });
  });

  subscriptionsList.querySelectorAll(".sub-btn-switch").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const item = btn.closest(".subscription-item");
      const subId = item?.getAttribute("data-sub-id");
      if (!subId) return;

      const targetMode = getCurrentSubscriptionSourceMode();

      try {
        await apiSwitchSubscriptionMode(subId, targetMode);
        await refreshSubscriptions();
        await loadChatHistory();
      } catch (err) {
        alert(tI18n("new-analysis:subscription_actions.activate_error_prefix", "Ошибка активации подписки:") + " " + normalizeSubscriptionUiError(err));
      }
    });
  });
}

  async function refreshSubscriptions() {
    try {
      if (typeof window.cotelRefreshPlanUsageSnapshot === "function") {
        await window.cotelRefreshPlanUsageSnapshot();
      }

      const currentMode = getCurrentSubscriptionSourceMode();
      const otherMode = getOppositeSubscriptionSourceMode();

      const [currentSubs, otherSubs] = await Promise.all([
        apiGetSubscriptions(currentMode),
        apiGetSubscriptions(otherMode)
      ]);

      renderSubscriptions(currentSubs, otherSubs);
    } catch (e) {
      console.warn("Subscriptions load failed:", e.message);
    }
  }

      function renderRunSubscriptionsToWorkArea(data) {
        const out = document.getElementById("analysisResult");
        if (!out) return;

        const esc = (s) => String(s ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");

        let html = "";
        html += `<h2>${esc(tI18n("new-analysis:run_subscriptions.heading", "Запуск подписок"))}</h2>`;
        html += `<div class="run-summary">
          <div><b>${esc(tI18n("new-analysis:run_subscriptions.status_label", "Статус:"))}</b> ${esc(data.status)}</div>
          <div><b>${esc(tI18n("new-analysis:run_subscriptions.processed_label", "Обработано подписок:"))}</b> ${esc(data.processed_subscriptions)}</div>
          <div><b>${esc(tI18n("new-analysis:run_subscriptions.checked_messages_label", "Проверено сообщений:"))}</b> ${esc(data.checked_messages)}</div>
          <div><b>${esc(tI18n("new-analysis:run_subscriptions.matches_found_label", "Найдено совпадений:"))}</b> ${esc(data.found_matches)}</div>
          <div><b>${esc(tI18n("new-analysis:run_subscriptions.time_label", "Время:"))}</b> ${esc(data.elapsed_seconds)} ${esc(tI18n("new-analysis:run_subscriptions.seconds_short", "сек."))}</div>
        </div>`;

        const results = data.results || [];
        for (const r of results) {
          html += `<hr/>`;
          html += `<h3>${esc(r.name || ("Subscription #" + r.subscription_id))}</h3>`;
          html += `<div class="run-sub-meta">
            <div><b>${esc(tI18n("new-analysis:run_subscriptions.id_label", "ID:"))}</b> ${esc(r.subscription_id)}</div>
            <div><b>${esc(tI18n("new-analysis:run_subscriptions.chat_label", "Чат:"))}</b> ${esc(r.chat_ref)}</div>
            <div><b>${esc(tI18n("new-analysis:run_subscriptions.status_label", "Статус:"))}</b> ${esc(r.status)}</div>
            <div><b>${esc(tI18n("new-analysis:run_subscriptions.checked_label", "Проверено:"))}</b> ${esc(r.checked)}</div>
            <div><b>${esc(tI18n("new-analysis:run_subscriptions.matches_written_label", "Записано MatchEvents:"))}</b> ${esc(r.matches_written)}</div>
            ${r.error ? `<div class="error"><b>${esc(tI18n("new-analysis:run_subscriptions.error_label", "Ошибка:"))}</b> ${esc(r.error)}</div>` : ""}
          </div>`;

          // LLM JSON
          html += `<details class="llm-block" ${r.llm_json ? "open" : ""}>
            <summary><b>${esc(tI18n("new-analysis:run_subscriptions.llm_response", "Ответ LLM (JSON)"))}</b></summary>
            <pre>${esc(JSON.stringify(r.llm_json, null, 2))}</pre>
          </details>`;

          // Match Events rows
          const evs = r.match_events || [];
          html += `<details class="match-block" ${evs.length ? "open" : ""}>
            <summary><b>${esc(tI18n("new-analysis:run_subscriptions.match_events_header", "MatchEvents"))}</b> (${evs.length})</summary>`;

          if (!evs.length) {
            html += `<div class="muted">${esc(tI18n("new-analysis:run_subscriptions.no_matches_note", "Нет строк match_events (совпадений не найдено или запись не произошла)."))}</div>`;
          } else {
            for (const ev of evs) {
              html += `<div class="match-row">
                <div class="match-title"><b>MatchEvent #${esc(ev.id)}</b></div>
                <div class="match-fields">
                  <div><b>subscription_id:</b> ${esc(ev.subscription_id)}</div>
                  <div><b>message_id:</b> ${esc(ev.message_id)}</div>
                  <div><b>message_ts:</b> ${esc(ev.message_ts)}</div>
                  <div><b>author_id:</b> ${esc(ev.author_id)}</div>
                  <div><b>author_display:</b> ${esc(ev.author_display)}</div>
                  <div><b>excerpt:</b> ${esc(ev.excerpt)}</div>
                  <div><b>reason:</b> ${esc(ev.reason)}</div>
                  <div><b>notify_status:</b> ${esc(ev.notify_status)}</div>
                  <div><b>created_at:</b> ${esc(ev.created_at)}</div>
                </div>

                <details class="payload-block">
                  <summary><b>${esc(tI18n("new-analysis:run_subscriptions.llm_payload_header", "llm_payload (JSONB)"))}</b></summary>
                  <pre>${esc(JSON.stringify(ev.llm_payload, null, 2))}</pre>
                </details>
              </div>`;
            }
          }

          html += `</details>`;
        }

        out.innerHTML = html;
      }

      function setSubscriptionFormMode(isEdit) {
        if (subscriptionFormTitle) {
          subscriptionFormTitle.textContent = isEdit
            ? tI18n("new-analysis:subscription_form_dynamic.title_edit", "Редактирование подписки")
            : tI18n("new-analysis:subscription_form.title_create", "Создание новой подписки");
        }

        if (createSubscriptionBtn) {
          createSubscriptionBtn.textContent = isEdit
            ? tI18n("new-analysis:subscription_form_dynamic.save_btn", "Сохранить изменения")
            : tI18n("new-analysis:subscription_form.create_btn", "Создать подписку");
        }
      }

      function scrollSubscriptionFormIntoView() {
        if (!subscriptionCreateBlock || !sidebarScrollArea) return;

        requestAnimationFrame(() => {
          const blockTop = subscriptionCreateBlock.offsetTop;
          const blockBottom = blockTop + subscriptionCreateBlock.offsetHeight;
          const visibleTop = sidebarScrollArea.scrollTop;
          const visibleBottom = visibleTop + sidebarScrollArea.clientHeight;

          if (blockBottom > visibleBottom) {
            sidebarScrollArea.scrollTo({
              top: blockBottom - sidebarScrollArea.clientHeight + 16,
              behavior: "smooth",
            });
          } else if (blockTop < visibleTop) {
            sidebarScrollArea.scrollTo({
              top: Math.max(0, blockTop - 12),
              behavior: "smooth",
            });
          }
        });
      }

      function showSubscriptionForm(show) {
        if (!subscriptionCreateBlock) return;
        subscriptionCreateBlock.style.display = show ? "block" : "none";
        if (subCreateStatus) subCreateStatus.textContent = "";
      }

      function resetSubscriptionForm() {
        if (subNameInput) subNameInput.value = "";
        if (subChatInput) subChatInput.value = "";
        if (subTypeSelect) subTypeSelect.value = "events";
        setPeriodOptionsForType("events");

        if (subAiModelSelect) {
          buildAiModelSelect(subAiModelSelect, getDefaultAiModelForUi());
        }

        if (subPromptInput) {
          subPromptInput.value = "";
          autoResizeTextarea(subPromptInput);
        }

        // Сброс медиа-фильтра — выключаем чекбокс, снимаем категории,
        // подтипы возвращаем к дефолтам, плюс показываем блок (events).
        if (typeof window.cotelSubMediaFilter?.reset === "function") {
          window.cotelSubMediaFilter.reset();
        }
        if (typeof applySubscriptionTypeMediaFilterVisibility === "function") {
          applySubscriptionTypeMediaFilterVisibility("events");
        }
        setSubscriptionFormMode(false);
      }


      function autoResizeTextarea(el) {
        if (!el) return;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 420) + "px";
      }

      function getCurrentPlanSnapshot() {
        return window.currentPlanUsage || null;
      }

      function getPlanInfo() {
        return getCurrentPlanSnapshot()?.plan || null;
      }

      function getUsageInfo() {
        return getCurrentPlanSnapshot()?.usage || null;
      }

      function getCurrentUserForAiUi() {
        if (typeof window.cotelGetCurrentUser === "function") {
          return window.cotelGetCurrentUser();
        }
        return null;
      }

      function normalizeAiModelUi(value) {
        const raw = String(value || "").trim().toLowerCase();
        const allowed = new Set([
          // OpenAI
          "openai:gpt-4.1-mini",
          "openai:gpt-5.4-mini",
          "openai:gpt-4.1",
          "openai:o3",
          "openai:o4-mini",
          // Anthropic
          "anthropic:claude-haiku-4-5",
          "anthropic:claude-sonnet-4-6",
          // Google
          "google:gemini-3.1-flash-lite",
          "google:gemini-2.5-flash",
          "google:gemini-3.5-flash",
          "google:gemini-2.5-pro",
        ]);
        return allowed.has(raw) ? raw : "openai:gpt-4.1-mini";
      }

      function getAllAiModelOptions() {
        // Full catalog of supported models with their labels.
        // Used (a) by getAiModelOptionsByPlan as the source of options
        // for paid plans, and (b) by buildAiModelSelect to look up a
        // friendly label when re-injecting an off-plan model the user
        // had already selected (defensive against plan-info race).
        // Order: light → balanced → deep within each provider,
        // providers grouped OpenAI → Anthropic → Google. Keep this
        // order stable so the dropdown ranking matches what users see
        // in pricing/admin.
        return [
          { value: "openai:gpt-4.1-mini", label: tI18n("common:ai_models.openai_gpt_4_1_mini", "OpenAI GPT-4.1 mini — быстрый и универсальный анализ") },
          { value: "openai:gpt-5.4-mini", label: tI18n("common:ai_models.openai_gpt_5_4_mini", "OpenAI GPT-5.4 mini — сбалансированный анализ") },
          { value: "openai:gpt-4.1",      label: tI18n("common:ai_models.openai_gpt_4_1",      "OpenAI GPT-4.1 — для длинного контекста и глубокого анализа") },
          { value: "openai:o4-mini",      label: tI18n("common:ai_models.openai_o4_mini",      "OpenAI o4-mini — дешёвый reasoning, 200K контекст") },
          { value: "openai:o3",           label: tI18n("common:ai_models.openai_o3",           "OpenAI o3 — глубокий reasoning, 200K контекст") },
          { value: "anthropic:claude-haiku-4-5",  label: tI18n("common:ai_models.claude_haiku_4_5",  "Claude Haiku 4.5 — быстрый и дешёвый анализ") },
          { value: "anthropic:claude-sonnet-4-6", label: tI18n("common:ai_models.claude_sonnet_4_6", "Claude Sonnet 4.6 — более глубокий анализ длинных обсуждений") },
          { value: "google:gemini-3.1-flash-lite", label: tI18n("common:ai_models.google_gemini_3_1_flash_lite", "Google Gemini 3.1 Flash Lite — самая дешёвая, для простых запросов") },
          { value: "google:gemini-2.5-flash",      label: tI18n("common:ai_models.google_gemini_2_5_flash",      "Google Gemini 2.5 Flash — баланс цены и качества, длинный контекст") },
          { value: "google:gemini-2.5-pro",        label: tI18n("common:ai_models.google_gemini_2_5_pro",        "Google Gemini 2.5 Pro — глубокий анализ, 1M контекст, дешевле Sonnet") },
          { value: "google:gemini-3.5-flash",      label: tI18n("common:ai_models.google_gemini_3_5_flash",      "Google Gemini 3.5 Flash — премиум интеллект, для сложного анализа") },
        ];
      }

      function getAiModelOptionsByPlan() {
        const planCode = String(getPlanInfo()?.code || "free").toLowerCase();
        const all = getAllAiModelOptions();

        // Free plan: only the default OpenAI mini.
        if (planCode === "free") {
          return all.filter((it) => it.value === "openai:gpt-4.1-mini");
        }

        // Paid plans: full list.
        return all;
      }

      function buildAiModelSelect(selectEl, selectedValue) {
        if (!selectEl) return;

        const options = getAiModelOptionsByPlan();
        const normalized = normalizeAiModelUi(selectedValue);

        // Defensive injection: if the user previously selected a model
        // that normalizeAiModelUi recognizes (a globally valid slug) but
        // the current plan-filtered options happen to drop it, push it
        // into the visible options anyway. This guards against the race
        // where plan-usage info arrives stale/partial in an API response
        // and the refresh would otherwise silently reset the dropdown to
        // GPT-4.1 mini. Symptom this fixes: Sonnet / Gemini Flash Lite
        // snapping back to GPT-4.1 mini after every /analyze call, but
        // only intermittently — exactly matching the user-visible bug.
        const rawInput = String(selectedValue || "").trim().toLowerCase();
        const userPickedValidButPlanFilteredOut =
          rawInput
          && rawInput === normalized
          && !options.some((it) => it.value === normalized);
        if (userPickedValidButPlanFilteredOut) {
          const masterMatch = getAllAiModelOptions().find(
            (it) => it.value === normalized
          );
          if (masterMatch) {
            options.push(masterMatch);
          }
        }

        // In group mode, decorate long-context models with a «рекомендовано»
        // suffix in the label so the user knows which ones handle 20-chat
        // requests well. We only add it to the label string for clarity in
        // the native <select> — option.value remains the plain slug.
        const groupOn = typeof isGroupModeOn === "function" && isGroupModeOn();
        const recommendedSuffix = " " + tI18n(
          "new-analysis:chat_requests.recommended_for_group",
          "(рекомендовано для группового запроса)"
        );

        selectEl.innerHTML = options
          .map((item) => {
            let label = item.label;
            if (groupOn && typeof RECOMMENDED_GROUP_MODELS !== "undefined"
                && RECOMMENDED_GROUP_MODELS.has(item.value)) {
              label = label + recommendedSuffix;
            }
            return `<option value="${item.value}" ${item.value === normalized ? "selected" : ""}>${label}</option>`;
          })
          .join("");

        // Last-resort fallback: only reset to first option if the user's
        // value isn't even globally valid. With the injection above this
        // path is only hit for genuinely-unknown slugs (e.g. a removed
        // model coming back from old chat history).
        if (!options.some((item) => item.value === normalized) && options[0]) {
          selectEl.value = options[0].value;
        }
      }

      function getDefaultAiModelForUi() {
        const user = getCurrentUserForAiUi();
        return normalizeAiModelUi(user?.default_ai_model || "openai:gpt-4.1-mini");
      }

      function refreshAiModelControls() {
        const planCode = String(getPlanInfo()?.code || "free").toLowerCase();
        const defaultAiModel = getDefaultAiModelForUi();

        if (queryAiModelRow) {
          // Выбор модели для запросов к чатам заменён селектором глубины
          // (light/balanced/deep). Скрываем для всех; оставляем в DOM —
          // возможно вернём под админские права. Удалять не нужно.
          queryAiModelRow.style.display = "none";
        }
        if (subAiModelRow) {
          // Селектор модели AI скрыт всегда (Этап B1). Раньше показывался
          // для платных тарифов, теперь — никогда. Оставлен в DOM, потому
          // что submit-обработчик читает subAiModelSelect.value.
          subAiModelRow.style.display = "none";
        }

        // PRESERVE the user's current selection across refreshes.
        // Background: after every API request `renderResult` →
        // `cotelApplyUsageFromPayload` → `cotelRefreshLimitBoundControls`
        // → here, which used to reset the select back to the profile
        // default. That meant a user who picked, say, Sonnet for their
        // query would see the select snap back to GPT-4.1 mini the moment
        // the answer rendered. Preserve current value when it's still a
        // valid option; only fall back to default if the select is empty
        // or holds a stale (now-removed) slug.
        const currentQueryVal = queryAiModelSelect?.value || "";
        const currentSubVal = subAiModelSelect?.value || "";
        buildAiModelSelect(queryAiModelSelect, currentQueryVal || defaultAiModel);
        buildAiModelSelect(subAiModelSelect, currentSubVal || defaultAiModel);
      }

      function updateChatHistoryAvailability() {
        const plan = getPlanInfo();
        const hasHistory = !!plan?.has_chat_history;

        if (chatHistoryBlock) {
          chatHistoryBlock.style.display = hasHistory ? "" : "none";
        }
      }

      function formatFrequencyLabel(minutes) {
        const value = Number(minutes || 0);
        if (!value) return "—";
        if (value < 60) return tI18n("new-analysis:subscription_frequency.per_minutes", `1 раз в ${value} минут`, { value });
        if (value % 60 === 0) {
          const hours = value / 60;
          return hours === 1
            ? tI18n("new-analysis:subscription_frequency.per_hour_one", "1 раз в 1 час")
            : tI18n("new-analysis:subscription_frequency.per_hours_other", `1 раз в ${hours} часа`, { hours });
        }
        return tI18n("new-analysis:subscription_frequency.per_minutes", `1 раз в ${value} минут`, { value });
      }

      // Границы периода по единицам измерения. Должны совпадать с
      // PERIOD_BOUNDS в backend/plan_limits.py — серверная валидация
      // авторитетна, фронт делает то же самое только ради UX.
      // Дни не имеют статичного потолка — он берётся из тарифа.
      const PERIOD_UI_BOUNDS = {
        minutes: { min: 5,  max: 180,  defaultValue: 30 },
        hours:   { min: 1,  max: 72,   defaultValue: 1  },
        days:    { min: 1,  max: null, defaultValue: 1  },
      };

      function getQueryPeriodUnit() {
        const sel = document.getElementById("queryPeriodUnitSelect");
        const v = (sel?.value || "days").toLowerCase();
        return PERIOD_UI_BOUNDS[v] ? v : "days";
      }

      // Универсальная валидация поля периода для текущей выбранной
      // единицы. Заменила clampQueryDaysByPlan: теперь работает для
      // минут, часов и дней. Для дней потолок берёт из тарифа, для
      // минут/часов — из PERIOD_UI_BOUNDS.
      function applyPeriodBounds() {
        if (!queryDaysInput) return;
        const unit = getQueryPeriodUnit();
        const bounds = PERIOD_UI_BOUNDS[unit] || PERIOD_UI_BOUNDS.days;

        let max = bounds.max;
        if (unit === "days") {
          const plan = getPlanInfo();
          const planMax = plan ? Number(plan.qa_history_days || 1) : 365;
          max = planMax > 0 ? planMax : 365;
        }

        queryDaysInput.min = String(bounds.min);
        if (max != null) {
          queryDaysInput.max = String(max);
        } else {
          queryDaysInput.removeAttribute("max");
        }

        let current = parseInt(queryDaysInput.value || "0", 10);
        if (!Number.isFinite(current) || current <= 0) {
          current = bounds.defaultValue;
        }
        if (current < bounds.min) current = bounds.min;
        if (max != null && current > max) current = max;
        queryDaysInput.value = String(current);
      }

      // Сохраняем имя clampQueryDaysByPlan для уже навешанных слушателей —
      // делаем его псевдонимом нового хелпера.
      function clampQueryDaysByPlan() {
        applyPeriodBounds();
      }

      // При смене единицы — пересчитываем границы и подставляем дефолт,
      // подходящий под новую единицу (5 минут / 1 час / 1 день),
      // чтобы пользователь не оказался с числом 60 в "днях".
      document.getElementById("queryPeriodUnitSelect")?.addEventListener("change", (e) => {
        const newUnit = (e.target.value || "days").toLowerCase();
        const bounds = PERIOD_UI_BOUNDS[newUnit] || PERIOD_UI_BOUNDS.days;
        if (queryDaysInput) {
          queryDaysInput.value = String(bounds.defaultValue);
        }
        applyPeriodBounds();
      });

      function getAvailablePeriodOptionsByPlan(subscriptionType) {
        const plan = getPlanInfo();
        const minMinutes = Number(plan?.min_subscription_interval_minutes || 60);

        const allByType = {
          events: [
            { v: "30m", t: tI18n("new-analysis:subscription_form.period_30m", "1 раз в 30 минут"), m: 30 },
            { v: "1h",  t: tI18n("new-analysis:subscription_frequency.per_hour_one", "1 раз в 1 час"), m: 60 },
            { v: "3h",  t: tI18n("new-analysis:subscription_form.period_3h", "1 раз в 3 часа"), m: 180 },
            { v: "6h",  t: tI18n("new-analysis:subscription_form.period_6h", "1 раз в 6 часов"), m: 360 },
          ],
          digest: [
            { v: "6h",  t: tI18n("new-analysis:subscription_form.period_6h", "1 раз в 6 часов"), m: 360 },
            { v: "12h", t: tI18n("new-analysis:subscription_form.period_12h", "1 раз в 12 часов (полдня)"), m: 720 },
            { v: "1d",  t: tI18n("new-analysis:subscription_form.period_1d", "1 раз в день"), m: 1440 },
          ],
        };

        const source = allByType[subscriptionType] || allByType.events;
        return source.filter((item) => item.m >= minMinutes);
      }

      function setPeriodOptionsForType(type) {
        if (!subPeriodSelect) return;

        const list = getAvailablePeriodOptionsByPlan(type);
        // Запоминаем текущее значение ДО ребилда, чтобы сохранить выбор
        // пользователя/предзаполнение из edit-формы. Иначе при любом
        // вызове refreshLimitBoundControls() (например, после
        // subPeriodSelect.value = "1h" в openSubscriptionEdit) значение
        // обнулялось до первой опции списка — это была причина бага
        // «открыл подписку с frequency=60, увидел 30m в форме».
        const previousVal = subPeriodSelect.value;

        subPeriodSelect.innerHTML = list
          .map((o) => `<option value="${o.v}">${o.t}</option>`)
          .join("");

        if (previousVal && list.some((o) => o.v === previousVal)) {
          subPeriodSelect.value = previousVal;
        } else {
          subPeriodSelect.value = list[0]?.v || "";
        }
      }

      function refreshLimitBoundControls() {
        clampQueryDaysByPlan();

        const type = (subTypeSelect?.value || "events").trim();
        setPeriodOptionsForType(type);
        refreshAiModelControls();
        updateSubscriptionsUiAvailability();
        updateChatHistoryAvailability();
      }

      function canAddSubscriptionByPlan() {
        const plan = getPlanInfo();
        const usage = getUsageInfo();

        if (!plan || !usage) return true;

        const planCode = String(plan.code || "").toLowerCase();

        // Для Free правило жёстче:
        // можно создать не больше общего числа trial-подписок по тарифу,
        // даже если часть из них стоит на паузе.
        if (planCode === "free" && isFreeTrialExhausted()) {
          return false;
        }

        const active = Number(usage.active_subscriptions || 0);
        const max = Number(plan.max_active_subscriptions || 0);

        if (!Number.isFinite(max) || max <= 0) return false;
        return active < max;
      }

      function isFreeTrialExhausted() {
        const plan = getPlanInfo();
        const usage = getUsageInfo();

        if (!plan || String(plan.code || "").toLowerCase() !== "free") return false;

        const used = Number(usage.trial_subscriptions_total || 0);
        const total = Number(plan.trial_subscription_limit || 0);

        return total > 0 && used >= total;
      }

      function getSubscriptionsLimitUiMessage() {
        const plan = getPlanInfo();
        const usage = getUsageInfo();

        if (!plan || !usage) return "";

        const planCode = String(plan.code || "").toLowerCase();
        const active = Number(usage.active_subscriptions || 0);
        const max = Number(plan.max_active_subscriptions || 0);

        if (planCode === "free" && isFreeTrialExhausted()) {
          if (usage.free_trial_expired) {
            return tI18n("new-analysis:plan_limits.free_trial_expired_note", "Действие пробных подписок завершено. Обновите тариф, чтобы продолжить пользоваться подписками.");
          }

          return tI18n("new-analysis:plan_limits.free_trial_limit_note", "Лимит пробных подписок исчерпан. Обновите тариф, чтобы создавать новые подписки.");
        }

        if (active >= max && max > 0) {
          return tI18n("new-analysis:plan_limits.active_limit_note", "Достигнут лимит активных подписок по вашему тарифу. Приостановите одну из текущих подписок или обновите тариф.");
        }

        return "";
      }

      function updateSubscriptionsUiAvailability() {
        const canAdd = canAddSubscriptionByPlan();
        const message = getSubscriptionsLimitUiMessage();

        if (addSubscriptionBtn) {
          addSubscriptionBtn.style.display = canAdd ? "" : "none";
        }

        if (!subscriptionsList) return;

        let note = document.getElementById("subscriptionsLimitNote");
        if (!note && subscriptionsList.parentElement) {
          note = document.createElement("p");
          note.id = "subscriptionsLimitNote";
          note.className = "tg-status";
          subscriptionsList.parentElement.insertBefore(note, subscriptionsList);
        }

        if (note) {
          note.textContent = message;
          note.style.display = message ? "block" : "none";
        }

        if (!canAdd && subscriptionCreateBlock) {
          subscriptionCreateBlock.style.display = "none";
        }
      }

      // Shallow accessor preserved for branching logic that key off the code
      // (e.g. PLAN_HISTORY_LIMIT_EXCEEDED triggers a pricing redirect).
      function extractBackendErrorCode(err) {
        if (!err || !err.detail) return "";
        // Structured detail: { code, ... }
        if (typeof err.detail === "object") {
          if (typeof err.detail.code === "string") return err.detail.code;
          // FastAPI double-wrap: { detail: { code } }
          if (err.detail.detail && typeof err.detail.detail === "object" &&
              typeof err.detail.detail.code === "string") {
            return err.detail.detail.code;
          }
          // Plain-string inner detail (auth.py style)
          if (typeof err.detail.detail === "string" &&
              /^[A-Z][A-Z0-9_]+$/.test(err.detail.detail.split(":")[0])) {
            return err.detail.detail.split(":")[0];
          }
        }
        // Top-level plain-string detail
        if (typeof err.detail === "string" &&
            /^[A-Z][A-Z0-9_]+$/.test(err.detail.split(":")[0])) {
          return err.detail.split(":")[0];
        }
        return "";
      }

      // Delegate the actual message rendering to the shared helper in api.js,
      // which knows how to resolve error codes via the errors:backend.*
      // dictionary, interpolate flat params, and fall back sensibly.
      function extractBackendErrorMessage(err) {
        const fallback = tI18n("new-analysis:subscription_dynamic.unknown_error", "Неизвестная ошибка");
        if (typeof window.extractBackendErrorMessage === "function") {
          return window.extractBackendErrorMessage(err, { fallback });
        }
        return fallback;
      }

      // Plan-specific errors are fully covered by the errors:backend.* dict
      // (including interpolation of plan_limit_days etc.), so a single call
      // to the shared extractor does the right thing for all plan codes.
      // Kept as a named function so existing call sites don't need to change.
      function normalizePlanErrorMessage(err) {
        return extractBackendErrorMessage(err);
      }

      async function openEditSubscription(id) {
        try {
          const sub = await apiFetch(`/subscriptions/${id}`);

          editingSubscriptionId = id;

          if (sub.source_mode === "service" && dataSourcePublicRadio) {
            dataSourcePublicRadio.checked = true;
          }
          if (sub.source_mode === "personal" && dataSourceAccountRadio) {
            dataSourceAccountRadio.checked = true;
          }
          persistSelectedDataSourceMode();
          updateDataSourceUI();
          await loadChatHistory();
          renderSubChatsList(getCurrentSubscriptionChatCandidates());

          // заполняем форму
          subNameInput.value = sub.name || "";
          subChatInput.value = sub.chat_ref || "";
          subPromptInput.value = sub.prompt || "";
          autoResizeTextarea(subPromptInput);

          // тип подписки
          const subType = (sub.subscription_type || "events").trim().toLowerCase();
          if (subTypeSelect) {
            subTypeSelect.value = subType;
          }
          setPeriodOptionsForType(subType);
          // Видимость медиа-фильтра — по типу
          if (typeof applySubscriptionTypeMediaFilterVisibility === "function") {
            applySubscriptionTypeMediaFilterVisibility(subType);
          }
          // Восстановить состояние медиафильтра из БД (если был)
          if (typeof window.cotelSubMediaFilter?.applyFromSub === "function") {
            window.cotelSubMediaFilter.applyFromSub(sub.media_filter || null);
          }

          // period
          subPeriodSelect.value = frequencyMinutesToPeriodValue(sub.frequency_minutes, subType);
          buildAiModelSelect(
            subAiModelSelect,
            sub.ai_model || getDefaultAiModelForUi()
          );
          setSubscriptionFormMode(true);
          showSubscriptionForm(true);
          scrollSubscriptionFormIntoView();

        } catch (e) {
          alert(tI18n("new-analysis:subscription_dynamic.load_error", "Ошибка загрузки подписки"));
        }
      }

      subPromptInput?.addEventListener("input", () => autoResizeTextarea(subPromptInput));
      
      addSubscriptionBtn?.addEventListener("click", async () => {
        try {
          if (!canAddSubscriptionByPlan()) {
            subCreateStatus.textContent = getSubscriptionsLimitUiMessage();
            return;
          }
          const connected = await isBotConnected();

          if (!connected) {
            openModal();
            return;
          }

          showSubscriptionForm(true);
          resetSubscriptionForm();
          setPeriodOptionsForType((subTypeSelect?.value || "events").trim());
          buildAiModelSelect(subAiModelSelect, getDefaultAiModelForUi());
          renderSubChatsList(getCurrentSubscriptionChatCandidates());
          scrollSubscriptionFormIntoView();
        } catch (e) {
          openModal();
        }
      });

      cancelSubscriptionBtn?.addEventListener("click", () => {
        showSubscriptionForm(false);
        resetSubscriptionForm();
      });

     createSubscriptionBtn?.addEventListener("click", async () => {
      if (!subCreateStatus) return;

      const name = (subNameInput?.value || "").trim();
      const chat_ref = (subChatInput?.value || "").trim();
      const periodVal = (subPeriodSelect?.value || "1h").trim();
      const prompt = (subPromptInput?.value || "").trim();
      const subTypeSelect = document.getElementById("subTypeSelect");
      const subscriptionType = (subTypeSelect?.value || "events");

      // Этап B2: медиа-фильтр (только для events).
      const subMfPayload = (typeof window.cotelSubMediaFilter?.getPayload === "function")
        ? window.cotelSubMediaFilter.getPayload()
        : null;

      if (!name) { subCreateStatus.textContent = tI18n("new-analysis:subscription_form_dynamic.name_required", "Введите имя подписки."); return; }
      if (!chat_ref) { subCreateStatus.textContent = tI18n("new-analysis:subscription_form_dynamic.chat_required", "Выберите чат/канал или вставьте ссылку."); return; }
      // Текст запроса обязателен ТОЛЬКО если медиафильтр не активен.
      // Если медиафильтр включён — пустой prompt валиден (можно ловить
      // просто по типу медиа без семантического уточнения).
      if (!prompt && !subMfPayload) {
        subCreateStatus.textContent = tI18n(
          "new-analysis:subscription_form_dynamic.prompt_or_media_required",
          "Введите текст запроса или включите медиафильтр."
        );
        return;
      }

      const frequency_minutes = periodToMinutes(periodVal);

      // Текст статуса зависит от режима: создание или редактирование
      const isEdit = Boolean(editingSubscriptionId);
      subCreateStatus.textContent = isEdit
        ? tI18n("new-analysis:subscription_form_dynamic.saving", "Сохранение изменений…")
        : tI18n("new-analysis:subscription_form_dynamic.creating", "Создание подписки…");

      const payload = {
        name,
        source_mode: getCurrentSubscriptionSourceMode(),
        chat_ref,
        frequency_minutes,
        prompt,
        ai_model: normalizeAiModelUi(
          subAiModelSelect?.value || getDefaultAiModelForUi()
        ),
        is_active: true,
        subscription_type: subscriptionType
      };
      if (subMfPayload) payload.media_filter = subMfPayload;

      try {
        let responseData = null;

        if (isEdit) {
          responseData = await apiFetch(`/subscriptions/${editingSubscriptionId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(payload)
          });
          subCreateStatus.textContent = tI18n("new-analysis:subscription_form_dynamic.saved", "Изменения сохранены.");
        } else {
          responseData = await apiCreateSubscription(payload);
          subCreateStatus.textContent = tI18n("new-analysis:subscription_form_dynamic.created", "Подписка создана.");
        }

        if (typeof window.cotelRefreshPlanUsageSnapshot === "function") {
          await window.cotelRefreshPlanUsageSnapshot();
        }
        refreshLimitBoundControls();

        await refreshSubscriptions();
        await loadChatHistory();
        showSubscriptionForm(false);
        resetSubscriptionForm();
        editingSubscriptionId = null;
        createSubscriptionBtn.textContent = tI18n("new-analysis:subscription_form.create_btn", "Создать подписку");

      } catch (e) {
        const msg = normalizePlanErrorMessage(e);
        if (String(msg).includes("422")) {
          subCreateStatus.textContent = tI18n("new-analysis:subscription_form_dynamic.validation_hint", "Проверь поля формы (ошибка валидации).");
        } else {
          subCreateStatus.textContent = tI18n("new-analysis:telegram_auth_dynamic.error_prefix", "Ошибка:") + " " + msg;
        }
      }
    });


      async function apiRunSubscriptions() {
        try {
          return await apiFetch("/subscriptions/run", {
            method: "POST"
          });
        } catch (e) {
          const msg = e?.detail?.detail || e?.detail || e?.message || "RUN_FAILED";
          throw new Error(msg);
        }
      }

      function escapeHtml(s) {
        return String(s ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
      }

      async function updateSubscriptionActive(id, isActive) {
        try {
          await apiFetch(`/subscriptions/${id}/toggle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: isActive })
          });

          await refreshSubscriptions();

          if (typeof window.cotelRefreshPlanUsageSnapshot === "function") {
            await window.cotelRefreshPlanUsageSnapshot();
          }
          refreshLimitBoundControls();
        } catch (e) {
          alert(normalizePlanErrorMessage(e));
        }
      }


      // ===== Запуск подписок (кнопка) =====
      const runSubscriptionsBtn = document.getElementById("runSubscriptionsBtn");

      async function runSubscriptions() {
        try {
          if (runSubscriptionsBtn) {
            runSubscriptionsBtn.disabled = true;
            runSubscriptionsBtn.textContent = tI18n("new-analysis:run_subscriptions_dynamic.starting", "Запускаю...");
          }

          const data = await apiFetch("/subscriptions/run", {
            method: "POST"
          });

          if (typeof renderRunSubscriptionsToWorkArea === "function") {
            renderRunSubscriptionsToWorkArea(data);
          } else {
            alert(data?.ui_message || tI18n("new-analysis:run_subscriptions_dynamic.done", "Готово."));
          }
        } catch (e) {
          const msg = e?.detail?.detail || e?.detail || e?.message || String(e);
          alert(tI18n("new-analysis:run_subscriptions_dynamic.run_error_prefix", "Ошибка запуска подписок:") + " " + msg);
        } finally {
          if (runSubscriptionsBtn) {
            runSubscriptionsBtn.disabled = false;
            runSubscriptionsBtn.textContent = tI18n("new-analysis:subscriptions.run_btn", "Запустить подписки");
          }
        }
      }

// if (runSubscriptionsBtn) {
//   runSubscriptionsBtn.addEventListener("click", runSubscriptions);
// } else {
//   console.warn("Кнопка runSubscriptionsBtn не найдена в DOM. Проверь id в HTML.");
// }

const API_BASE = "https://cotel-backend.onrender.com"; // если у тебя уже есть - оставь одну

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderKeyValueBlock(obj) {
  const keys = Object.keys(obj || {});
  if (!keys.length) return "<div>—</div>";
  return `
    <div style="margin-left:10px">
      ${keys.map(k => `<div><b>${escapeHtml(k)}</b>: ${escapeHtml(obj[k])}</div>`).join("")}
    </div>
  `;
}

function renderMatchEventsTable(matchEvents) {
  if (!Array.isArray(matchEvents) || matchEvents.length === 0) {
    return `<div style="opacity:.8">${escapeHtml(tI18n("new-analysis:run_subscriptions_dynamic.run_response.no_match_events_note", "Совпадений нет (в БД не записалось новых строк)"))}</div>`;
  }

  return matchEvents.map(ev => {
    // вывод всех колонок
    return `
      <div style="padding:8px 0; border-top:1px solid rgba(0,0,0,.08)">
        <div><b>${escapeHtml(tI18n("new-analysis:run_subscriptions_dynamic.run_response.match_event_label", "MatchEvent"))}</b> (id=${escapeHtml(ev.id)})</div>
        ${renderKeyValueBlock(ev)}
      </div>
    `;
  }).join("");
}

function renderRunResponse(data) {
  const titleLabel = escapeHtml(tI18n("new-analysis:run_subscriptions_dynamic.run_response.title", "Запуск подписок:"));
  const processedLabel = escapeHtml(tI18n("new-analysis:run_subscriptions_dynamic.run_response.processed", "Подписок обработано:"));
  const checkedLabel = escapeHtml(tI18n("new-analysis:run_subscriptions_dynamic.run_response.checked", "Проверено сообщений:"));
  const matchesLabel = escapeHtml(tI18n("new-analysis:run_subscriptions_dynamic.run_response.matches", "Найдено совпадений (записано в БД):"));
  const timeLabel = escapeHtml(tI18n("new-analysis:run_subscriptions_dynamic.run_response.time", "Время:"));
  const secondsShort = escapeHtml(tI18n("new-analysis:run_subscriptions_dynamic.run_response.seconds_short", "сек."));

  const header = `
    <div style="padding:10px 0">
      <div><b>${titleLabel}</b> ${escapeHtml(data.status)}</div>
      <div><b>${processedLabel}</b> ${escapeHtml(data.processed_subscriptions)}</div>
      <div><b>${checkedLabel}</b> ${escapeHtml(data.checked_messages)}</div>
      <div><b>${matchesLabel}</b> ${escapeHtml(data.found_matches)}</div>
      <div><b>${timeLabel}</b> ${escapeHtml(data.elapsed_seconds)} ${secondsShort}</div>
    </div>
  `;

  const llmFoundLabel = escapeHtml(tI18n("new-analysis:run_subscriptions_dynamic.run_response.llm_found", "LLM found:"));
  const confidenceLabel = escapeHtml(tI18n("new-analysis:run_subscriptions_dynamic.run_response.confidence", "confidence:"));
  const summaryReasonLabel = escapeHtml(tI18n("new-analysis:run_subscriptions_dynamic.run_response.summary_reason", "summary_reason:"));
  const errorPrefix = escapeHtml(tI18n("new-analysis:run_subscriptions_dynamic.run_response.error_prefix", "Error:"));
  const matchEventsSection = escapeHtml(tI18n("new-analysis:run_subscriptions_dynamic.run_response.match_events_section", "MatchEvents (новые строки этого запуска):"));
  const untitled = tI18n("new-analysis:subscription_dynamic.untitled", "Без названия");

  const perSub = (data.results || []).map(sub => {
    const title = `<div style="margin-top:16px"><b>${escapeHtml(sub.name || untitled)}</b></div>`;
    const meta = `
      <div style="opacity:.9">
        id=${escapeHtml(sub.subscription_id)} · chat=${escapeHtml(sub.chat_ref)} · status=${escapeHtml(sub.status)}
        · checked=${escapeHtml(sub.checked)} · matches_written=${escapeHtml(sub.matches_written)}
        · llm_matches=${escapeHtml(sub.llm_matches_count)}
      </div>
    `;

    const llmInfo = `
      <div style="margin:6px 0; padding:8px; background:rgba(0,0,0,.04); border-radius:8px">
        <div><b>${llmFoundLabel}</b> ${escapeHtml(sub.llm_found)}</div>
        <div><b>${confidenceLabel}</b> ${escapeHtml(sub.llm_confidence)}</div>
        <div><b>${summaryReasonLabel}</b> ${escapeHtml(sub.llm_summary_reason)}</div>
      </div>
    `;

    const error = sub.error ? `<div style="color:#b00020"><b>${errorPrefix}</b> ${escapeHtml(sub.error)}</div>` : "";

    const matchesBlock = `
      <div style="margin-top:6px">
        <div style="font-weight:600">${matchEventsSection}</div>
        ${renderMatchEventsTable(sub.match_events)}
      </div>
    `;

    return `${title}${meta}${error}${llmInfo}${matchesBlock}`;
  }).join("");

  const debugHeader = escapeHtml(tI18n("new-analysis:run_subscriptions_dynamic.run_response.debug_header", "DEBUG: все строки таблицы match_events (limit 200)"));
  const allEvents = `
    <div style="margin-top:18px; padding-top:12px; border-top:2px solid rgba(0,0,0,.12)">
      <div style="font-weight:700">${debugHeader}</div>
      ${renderMatchEventsTable(data.debug_all_match_events)}
    </div>
  `;

  return header + perSub + allEvents;
}

const analysisResult = document.getElementById("analysisResult");

if (runSubscriptionsBtn) {
  runSubscriptionsBtn.addEventListener("click", async () => {
    try {
      runSubscriptionsBtn.disabled = true;
      runSubscriptionsBtn.textContent = tI18n("new-analysis:run_subscriptions_dynamic.running", "Запуск…");

      const data = await apiFetch("/subscriptions/run", { method: "POST" });
      analysisResult.innerHTML = renderRunResponse(data);
    } catch (e) {
      const msg = e?.detail?.detail || e?.detail || e?.message || String(e);
      const errLabel = escapeHtml(tI18n("new-analysis:run_subscriptions_dynamic.error_label_bold", "Ошибка:"));
      analysisResult.innerHTML = `<div style="color:#b00020"><b>${errLabel}</b> ${escapeHtml(msg)}</div>`;
    } finally {
      runSubscriptionsBtn.disabled = false;
      runSubscriptionsBtn.textContent = tI18n("new-analysis:subscriptions.run_btn", "Запустить подписки");
    }
  });
}


      //document.getElementById("runSubscriptionsBtn")?.addEventListener("click", onRunSubscriptionsClick);

      // Превращает строку с токенами [msg:42] в массив DOM-нод:
      // обычный текст → текстовые ноды, токены → <a class="msg-link">.
      // Если для message_id ссылки нет (приватный чат) — токен
      // полностью убирается из вывода. Никакого innerHTML — всё через
      // createElement / appendChild, поэтому XSS-сейф даже если LLM
      // вернёт что-то странное в тексте.
      function appendTextWithMsgLinks(parentEl, text, messageLinks) {
        if (!text) return;
        // Захватываем опциональный предшествующий пробел в группу 1.
        // Если для message_id ссылки нет, "съедаем" и токен, и этот
        // пробел — чтобы в выдаче не оставалось "@bob : \"quote\"".
        // Если ссылка есть, пробел сохраняем перед иконкой.
        const re = /(\s?)\[msg:(\d+)\]/g;
        const tooltipLabel = tI18n("new-analysis:msg_link.open_in_telegram", "Открыть в Telegram");
        const ariaLabel = tooltipLabel;
        const links = messageLinks || {};

        let lastIndex = 0;
        let match;
        while ((match = re.exec(text)) !== null) {
          const leadingSpace = match[1] || "";
          const id = match[2];
          const url = links[id] || links[Number(id)] || null;

          // Текст до совпадения (без захваченного предшествующего пробела)
          if (match.index > lastIndex) {
            parentEl.appendChild(
              document.createTextNode(text.slice(lastIndex, match.index))
            );
          }

          // Если ссылка есть — сохраняем пробел и добавляем иконку.
          // Если нет — пробел и токен полностью исчезают из вывода.
          if (url && leadingSpace) {
            parentEl.appendChild(document.createTextNode(leadingSpace));
          }

          if (url) {
            const a = document.createElement("a");
            a.className = "msg-link";
            a.href = url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.title = tooltipLabel;
            a.setAttribute("aria-label", ariaLabel);

            // Маленькая SVG-иконка "стрелка наружу" — индикатор внешней ссылки.
            // Цвет берём через currentColor, чтобы CSS .msg-link управлял
            // как обычным цветом, так и hover-состоянием.
            const svgNS = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(svgNS, "svg");
            svg.setAttribute("viewBox", "0 0 16 16");
            svg.setAttribute("fill", "none");
            svg.setAttribute("stroke", "currentColor");
            svg.setAttribute("stroke-width", "2");
            svg.setAttribute("stroke-linecap", "round");
            svg.setAttribute("stroke-linejoin", "round");
            svg.classList.add("msg-link__icon");
            svg.setAttribute("aria-hidden", "true");

            // "↗" — диагональная стрелка из квадрата
            const path1 = document.createElementNS(svgNS, "path");
            path1.setAttribute("d", "M6 3h7v7");
            const path2 = document.createElementNS(svgNS, "path");
            path2.setAttribute("d", "M13 3 6.5 9.5");
            const path3 = document.createElementNS(svgNS, "path");
            path3.setAttribute("d", "M11 9v4H3V5h4");
            svg.appendChild(path1);
            svg.appendChild(path2);
            svg.appendChild(path3);

            a.appendChild(svg);
            parentEl.appendChild(a);
          }
          // если url нет — просто пропускаем токен (без визуального шума)

          lastIndex = match.index + match[0].length;
        }

        // Хвост после последнего токена
        if (lastIndex < text.length) {
          parentEl.appendChild(
            document.createTextNode(text.slice(lastIndex))
          );
        }
      }

      // Parse a group-analysis markdown summary into ordered sections.
      // Expected structure (RU or EN):
      //   ## Chat: <name>      / ## Чат: <name>
      //   ...body...
      //   ## Summary           / ## Общий вывод
      //   ...overall...
      // Returns: { intro: str, chats: [{name, body}], summary: str|null }
      function parseGroupSummary(text) {
        const out = { intro: "", chats: [], summary: null };
        if (!text || typeof text !== "string") return out;

        // Match BOTH the chat-section header (## Chat: X / ## Чат: X) and the
        // overall summary header (## Summary / ## Общий вывод). Using a single
        // pass with named-ish groups by checking the matched text.
        const headerRe = /^##\s*(?:Chat|Чат)\s*:\s*(.+?)\s*$|^##\s*(?:Summary|Общий\s*вывод)\s*$/gmi;
        const matches = [];
        let m;
        while ((m = headerRe.exec(text)) !== null) {
          matches.push({ index: m.index, full: m[0], chatName: m[1] || null });
        }
        if (!matches.length) {
          out.intro = text.trim();
          return out;
        }
        // Anything before the first header is "intro" (usually empty in
        // well-behaved group responses, but be defensive).
        out.intro = text.slice(0, matches[0].index).trim();

        for (let i = 0; i < matches.length; i++) {
          const cur = matches[i];
          const nextStart = (i + 1 < matches.length) ? matches[i + 1].index : text.length;
          const headerEnd = cur.index + cur.full.length;
          const body = text.slice(headerEnd, nextStart).trim();
          if (cur.chatName) {
            out.chats.push({ name: cur.chatName, body });
          } else {
            // Summary block
            out.summary = body;
          }
        }
        return out;
      }

      function renderGroupResult(payload, userQuery) {
        // Optional user question at the top, same style as single-chat.
        if (userQuery && userQuery.trim()) {
          const queryEl = document.createElement("div");
          queryEl.style.fontStyle = "italic";
          queryEl.style.marginBottom = "8px";
          queryEl.textContent = userQuery.trim();
          resultDiv.appendChild(queryEl);

          const dividerEl = document.createElement("div");
          dividerEl.style.borderBottom = "1px solid #d1d5db";
          dividerEl.style.marginBottom = "16px";
          resultDiv.appendChild(dividerEl);
        }

        const fullText = String(payload?.summary || "");
        const parsed = parseGroupSummary(fullText);
        const results = Array.isArray(payload?.results) ? payload.results : [];

        // Build a name → results-row map for permalink lookup.
        // The LLM uses the chat name verbatim from the «...» marker;
        // results[i].chat_name is the same string (we pass it through).
        const rowByName = new Map();
        results.forEach((r) => {
          if (r && r.chat_name) rowByName.set(String(r.chat_name), r);
        });

        // Show overall summary on top (collapsed by default? — keep open).
        if (parsed.summary) {
          const sumBox = document.createElement("div");
          sumBox.className = "group-result-summary";
          const sumTitle = document.createElement("div");
          sumTitle.className = "group-result-summary__title";
          sumTitle.textContent = tI18n(
            "new-analysis:chat_requests.group_summary_title",
            "Общий вывод"
          );
          sumBox.appendChild(sumTitle);
          const sumBody = document.createElement("pre");
          sumBody.style.margin = "0";
          sumBody.style.whiteSpace = "pre-wrap";
          sumBody.style.wordWrap = "break-word";
          // Summary has no specific per-chat permalink scope — render plain.
          sumBody.textContent = parsed.summary;
          sumBox.appendChild(sumBody);
          resultDiv.appendChild(sumBox);
        }

        // Per-chat collapsible sections (default expanded).
        parsed.chats.forEach((chatSec) => {
          const section = document.createElement("div");
          section.className = "group-result-section";

          const header = document.createElement("div");
          header.className = "group-result-section__header";

          const chevron = document.createElement("span");
          chevron.className = "group-result-section__chevron";
          chevron.textContent = "▾";
          header.appendChild(chevron);

          const titleEl = document.createElement("span");
          titleEl.textContent = chatSec.name;
          header.appendChild(titleEl);

          // Show a small status hint if this chat failed/was empty.
          const row = rowByName.get(chatSec.name);
          if (row && row.status && row.status !== "ok") {
            const statusBadge = document.createElement("span");
            statusBadge.style.fontSize = "11px";
            statusBadge.style.marginLeft = "8px";
            statusBadge.style.color = row.status === "fetch_failed" ? "#a33" : "#888";
            statusBadge.textContent = row.status === "fetch_failed"
              ? tI18n("new-analysis:chat_requests.group_status_failed", "не удалось загрузить")
              : tI18n("new-analysis:chat_requests.group_status_empty", "пусто");
            header.appendChild(statusBadge);
          }

          section.appendChild(header);

          const body = document.createElement("div");
          body.className = "group-result-section__body";
          const bodyPre = document.createElement("pre");
          bodyPre.style.margin = "0";
          bodyPre.style.whiteSpace = "pre-wrap";
          bodyPre.style.wordWrap = "break-word";

          const links = (row && row.message_links) || null;
          if (links) {
            appendTextWithMsgLinks(bodyPre, chatSec.body, links);
          } else {
            bodyPre.textContent = chatSec.body;
          }
          body.appendChild(bodyPre);
          section.appendChild(body);

          header.addEventListener("click", () => {
            const collapsed = section.classList.toggle("group-result-section--collapsed");
            chevron.textContent = collapsed ? "▸" : "▾";
          });

          resultDiv.appendChild(section);
        });

        // List chats that the LLM didn't cover but were requested and
        // failed at the fetch stage — useful so the user sees what was
        // skipped even though no LLM section exists for them.
        const failedOrEmpty = results.filter((r) =>
          r && (r.status === "fetch_failed" || r.status === "empty")
        ).filter((r) => !parsed.chats.some((s) => s.name === r.chat_name));
        if (failedOrEmpty.length) {
          const skippedBox = document.createElement("div");
          skippedBox.style.marginTop = "12px";
          skippedBox.style.fontSize = "12px";
          skippedBox.style.color = "#666";
          const lines = failedOrEmpty.map((r) => {
            const label = r.chat_name || r.chat_link;
            const reason = r.status === "fetch_failed"
              ? tI18n("new-analysis:chat_requests.group_status_failed", "не удалось загрузить")
              : tI18n("new-analysis:chat_requests.group_status_empty", "пусто");
            return `• ${label} — ${reason}`;
          });
          skippedBox.textContent = tI18n(
            "new-analysis:chat_requests.group_skipped_prefix",
            "Не вошли в анализ:"
          ) + "\n" + lines.join("\n");
          resultDiv.appendChild(skippedBox);
        }

        appendChargeBreakdown(resultDiv, payload);
      }

      // --- Block 4: «Списано: N токенов» + раскрывающаяся «Расшифровка ▾» ---
      // Поля приходят в payload напрямую из backend (_build_qa_response /
      // _build_group_response): tokens_charged, used_model, was_fallback,
      // category, tier, detected_category, detected_confidence.
      function categoryLabel(slug) {
        if (!slug) return null;
        return tI18n("new-analysis:chat_requests.category_" + slug, slug);
      }

      function tierLabel(tier) {
        const map = {
          light: "new-analysis:chat_requests.depth_light",
          balanced: "new-analysis:chat_requests.depth_balanced",
          deep: "new-analysis:chat_requests.depth_deep",
        };
        if (tier && map[tier]) return tI18n(map[tier], tier);
        return tier || null;
      }

      // ---------------------------------------------------------------------
      // Media filter response renderer (Этап 8)
      // ---------------------------------------------------------------------
      // Рендерит структуру MediaFilterAnswer от backend/media_filter/formatter.py:
      //   { is_group, total_count, headline, sections | chat_blocks }
      // Карточки группируются по типу медиа в фикс-порядке.
      // ---------------------------------------------------------------------

      function mfKindLabel(kind) {
        const map = {
          "video_file":  "Видеофайлы",
          "video_round": "Видеокружки",
          "photo":       "Фото",
          "audio_file":  "Аудиофайлы",
          "voice":       "Голосовые сообщения",
          "document":    "Документы",
          "url":         "Ссылки",
        };
        return map[kind] || kind;
      }

      function mfChatErrorLabel(code) {
        const map = {
          "PRIVATE":         "Чат приватный, нет доступа",
          "ADMIN_REQUIRED":  "Требуются права администратора",
          "NOT_FOUND":       "Чат не найден",
          "FLOOD_WAIT":      "Слишком много запросов к Telegram — попробуйте позже",
          "RESOLVE_FAILED":  "Не удалось определить чат",
          "NOT_AUTHORIZED":  "Telegram не подключен",
          "FETCH_FAILED":    "Ошибка загрузки сообщений из Telegram",
        };
        return map[code] || ("Ошибка: " + code);
      }

      function mfFormatDate(iso) {
        try {
          const d = new Date(iso);
          if (isNaN(d.getTime())) return iso;
          const pad = (n) => String(n).padStart(2, "0");
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } catch (_e) {
          return iso;
        }
      }

      function mfFormatSize(bytes) {
        if (!bytes || bytes <= 0) return "";
        const units = ["Б", "КБ", "МБ", "ГБ"];
        let i = 0, v = bytes;
        while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
        return (v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)) + " " + units[i];
      }

      function mfHumanDuration(seconds) {
        if (!seconds || seconds <= 0) return "";
        if (seconds < 60) return seconds + " сек";
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        if (m < 60) return m + ":" + String(s).padStart(2, "0");
        const h = Math.floor(m / 60);
        return h + " ч " + (m % 60) + " мин";
      }

      function mfCardDetails(card) {
        const parts = [];
        switch (card.kind) {
          case "video_file":
            if (card.duration_sec) parts.push(mfHumanDuration(card.duration_sec));
            if (card.file_size) parts.push(mfFormatSize(card.file_size));
            break;
          case "video_round":
            if (card.duration_sec) parts.push(mfHumanDuration(card.duration_sec));
            break;
          case "photo":
            if (card.file_size) parts.push(mfFormatSize(card.file_size));
            break;
          case "audio_file":
            if (card.duration_sec) parts.push(mfHumanDuration(card.duration_sec));
            if (card.file_size) parts.push(mfFormatSize(card.file_size));
            if (card.performer || card.title) {
              parts.push([card.performer, card.title].filter(Boolean).join(" — "));
            }
            break;
          case "voice":
            if (card.duration_sec) parts.push(mfHumanDuration(card.duration_sec));
            break;
          case "document":
            if (card.file_name) parts.push(card.file_name);
            if (card.file_size) parts.push(mfFormatSize(card.file_size));
            if (card.mime_type) parts.push(card.mime_type);
            break;
          case "url":
            // URL cards рендерят список ссылок отдельным блоком, тут пусто.
            break;
        }
        return parts.join(" · ");
      }

      function mfRenderCard(card) {
        const el = document.createElement("div");
        el.className = "mf-card";

        // 1. Meta-строка: дата, автор
        const meta = document.createElement("div");
        meta.className = "mf-card__meta";
        meta.textContent = mfFormatDate(card.date_iso)
          + (card.sender_label ? " · " + card.sender_label : "");
        el.appendChild(meta);

        // 2. Спец-детали по типу
        const detailsStr = mfCardDetails(card);
        if (detailsStr) {
          const details = document.createElement("div");
          details.className = "mf-card__details";
          details.textContent = detailsStr;
          el.appendChild(details);
        }

        // 3. Подпись/текст
        if (card.caption) {
          const cap = document.createElement("div");
          cap.className = "mf-card__caption";
          cap.textContent = card.caption;
          el.appendChild(cap);
        }

        // 4. URL-список для kind="url"
        if (card.kind === "url" && Array.isArray(card.extracted_urls) && card.extracted_urls.length) {
          const urls = document.createElement("div");
          urls.className = "mf-card__urls";
          card.extracted_urls.forEach((u, idx) => {
            if (idx > 0) urls.appendChild(document.createTextNode("\n"));
            const a = document.createElement("a");
            a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer";
            a.textContent = u;
            urls.appendChild(a);
          });
          el.appendChild(urls);
        }

        // 5. Бейджи + ссылка на сообщение
        const footer = document.createElement("div");
        footer.className = "mf-card__footer";

        if (card.is_forwarded && card.forward_label) {
          const fwd = document.createElement("span");
          fwd.className = "mf-badge mf-badge--fwd";
          fwd.textContent = "↪ " + card.forward_label;
          footer.appendChild(fwd);
        }

        if (card.ttl_period_sec) {
          const ttl = document.createElement("span");
          ttl.className = "mf-badge mf-badge--ttl";
          ttl.textContent = "⏱ исчезающее (" + mfHumanDuration(card.ttl_period_sec) + ")";
          ttl.title = "Самоудаляющееся сообщение. Ссылка может протухнуть.";
          footer.appendChild(ttl);
        }

        if (card.has_spoiler) {
          const sp = document.createElement("span");
          sp.className = "mf-badge mf-badge--spoiler";
          sp.textContent = "⚫ спойлер";
          footer.appendChild(sp);
        }

        if (card.permalink) {
          const link = document.createElement("a");
          link.href = card.permalink;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.className = "mf-card__open";
          link.textContent = "↗ открыть в Telegram";
          footer.appendChild(link);
        }

        if (footer.children.length > 0) el.appendChild(footer);
        return el;
      }

      function mfRenderSection(section) {
        const el = document.createElement("div");
        el.className = "mf-section";
        const head = document.createElement("div");
        head.className = "mf-section__header";
        head.textContent = `${mfKindLabel(section.kind)} (${section.count})`;
        el.appendChild(head);
        (section.cards || []).forEach((c) => el.appendChild(mfRenderCard(c)));
        return el;
      }

      function mfRenderChatBlock(block) {
        const el = document.createElement("div");
        el.className = "mf-chat-block";
        const head = document.createElement("div");
        head.className = "mf-chat-block__header";
        head.textContent = `${block.chat_title || block.chat_link}`
          + (block.total_count ? ` (${block.total_count})` : "");
        el.appendChild(head);
        if (block.error_code) {
          const err = document.createElement("div");
          err.className = "mf-chat-block__error";
          err.textContent = mfChatErrorLabel(block.error_code);
          el.appendChild(err);
          return el;
        }
        if (!block.sections || block.sections.length === 0) {
          const empty = document.createElement("div");
          empty.className = "mf-chat-block__empty";
          empty.textContent = "Нет совпадений по выбранным фильтрам.";
          el.appendChild(empty);
          return el;
        }
        (block.sections || []).forEach((s) => el.appendChild(mfRenderSection(s)));
        return el;
      }

      function renderMediaFilterAnswer(answer, userQuery) {
        if (!answer || !resultDiv) return;

        // Пользовательский вопрос курсивом + разделитель — как в обычном
        // ответе, чтобы UI остался единым по композиции.
        if (userQuery && userQuery.trim()) {
          const queryEl = document.createElement("div");
          queryEl.style.fontStyle = "italic";
          queryEl.style.marginBottom = "8px";
          queryEl.textContent = userQuery.trim();
          resultDiv.appendChild(queryEl);
          const divider = document.createElement("div");
          divider.style.borderBottom = "1px solid #d1d5db";
          divider.style.marginBottom = "16px";
          resultDiv.appendChild(divider);
        }

        if (answer.headline) {
          const h = document.createElement("div");
          h.className = "mf-headline";
          h.textContent = answer.headline;
          resultDiv.appendChild(h);
        }

        if (answer.is_group) {
          (answer.chat_blocks || []).forEach((b) => resultDiv.appendChild(mfRenderChatBlock(b)));
        } else {
          (answer.sections || []).forEach((s) => resultDiv.appendChild(mfRenderSection(s)));
        }
      }

      function appendChargeBreakdown(container, payload) {
        if (!container || !payload) return;
        const charged = payload.tokens_charged;
        // Не показываем расшифровку, если списания не было (0/undefined) —
        // например, файловый режим или пустой результат.
        if (charged === null || charged === undefined || charged <= 0) return;

        const chargedEl = document.createElement("div");
        chargedEl.className = "result-charged";
        const amountSpan = document.createElement("span");
        amountSpan.className = "result-charged-amount";
        amountSpan.textContent = tI18n(
          "new-analysis:chat_requests.charged_label",
          "Списано: {{n}} токенов",
          { n: charged }
        );
        chargedEl.appendChild(amountSpan);
        container.appendChild(chargedEl);

        // Собираем строки расшифровки только из присутствующих полей.
        const rows = [];
        const modelLabel = payload.used_model;
        if (modelLabel) {
          rows.push([
            tI18n("new-analysis:chat_requests.breakdown_model", "Модель"),
            modelLabel,
          ]);
        }
        const tier = tierLabel(payload.tier);
        if (tier) {
          rows.push([
            tI18n("new-analysis:chat_requests.breakdown_tier", "Глубина"),
            tier,
          ]);
        }
        const cat = categoryLabel(payload.category);
        if (cat) {
          rows.push([
            tI18n("new-analysis:chat_requests.breakdown_category", "Категория запроса"),
            cat,
          ]);
        }
        const detected = categoryLabel(payload.detected_category);
        if (detected) {
          let detVal = detected;
          if (payload.detected_confidence !== null && payload.detected_confidence !== undefined) {
            const pct = Math.round(Number(payload.detected_confidence) * 100);
            if (!Number.isNaN(pct)) detVal += " (" + pct + "%)";
          }
          rows.push([
            tI18n("new-analysis:chat_requests.breakdown_detected_category", "Определено AI"),
            detVal,
          ]);
        }
        if (payload.was_fallback) {
          rows.push([
            tI18n("new-analysis:chat_requests.breakdown_fallback", "Использована резервная модель"),
            tI18n("new-analysis:chat_requests.breakdown_fallback_yes", "да"),
          ]);
        }

        if (!rows.length) return;

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "result-breakdown-toggle";
        toggle.setAttribute("aria-expanded", "false");
        const toggleText = document.createElement("span");
        toggleText.textContent = tI18n(
          "new-analysis:chat_requests.breakdown_toggle",
          "Расшифровка"
        );
        toggle.appendChild(toggleText);
        const chevron = document.createElement("span");
        chevron.className = "chevron";
        chevron.textContent = "▾";
        toggle.appendChild(chevron);
        container.appendChild(toggle);

        const details = document.createElement("div");
        details.className = "result-breakdown";
        details.style.display = "none";
        rows.forEach(([label, value]) => {
          const row = document.createElement("div");
          row.className = "result-breakdown-row";
          const l = document.createElement("span");
          l.className = "label";
          l.textContent = label;
          const v = document.createElement("span");
          v.className = "value";
          v.textContent = value;
          row.appendChild(l);
          row.appendChild(v);
          details.appendChild(row);
        });
        const note = document.createElement("div");
        note.className = "result-breakdown-note";
        note.textContent = tI18n(
          "new-analysis:chat_requests.breakdown_auto_note",
          "Модель выбрана автоматически"
        );
        details.appendChild(note);
        container.appendChild(details);

        toggle.addEventListener("click", () => {
          const open = details.style.display !== "none";
          details.style.display = open ? "none" : "block";
          toggle.setAttribute("aria-expanded", open ? "false" : "true");
        });
      }

      function renderResult(payload, rawText, userQuery) {
        if (typeof window.cotelApplyUsageFromPayload === "function") {
          window.cotelApplyUsageFromPayload(payload);
        }

        if (!resultDiv) return;

        // Очищаем элемент
        resultDiv.innerHTML = "";
        resultDiv.className = "dashboard-results-text";

        // --- Media filter response ---
        // Detect by presence of `media_filter` field (see backend formatter).
        // Routed BEFORE group-mode check: media filter может прийти и в
        // одиночном, и в групповом запросе — структура своя.
        if (payload && payload.media_filter) {
          renderMediaFilterAnswer(payload.media_filter, userQuery);
          appendChargeBreakdown(resultDiv, payload);
          return;
        }

        // --- Group-mode response (multi-chat) ---
        // Backend returns `group_size: int` and `results: array`. Render
        // collapsible per-chat sections instead of a flat blob.
        const isGroupPayload = payload && (payload.group_size > 0)
          && Array.isArray(payload.results);
        if (isGroupPayload) {
          renderGroupResult(payload, userQuery);
          return;
        }

        // Если есть вопрос, добавляем его курсивом с разделителем
        if (userQuery && userQuery.trim()) {
          const queryEl = document.createElement("div");
          queryEl.style.fontStyle = "italic";
          queryEl.style.marginBottom = "8px";
          queryEl.textContent = userQuery.trim();
          resultDiv.appendChild(queryEl);

          const dividerEl = document.createElement("div");
          dividerEl.style.borderBottom = "1px solid #d1d5db";
          dividerEl.style.marginBottom = "16px";
          resultDiv.appendChild(dividerEl);
        }

        // Добавляем основной текст
        let text = "";
        if (payload?.summary) {
          text += payload.summary + "\n\n";
        }
        if (payload?.message) {
          text += payload.message;
        }

        const contentEl = document.createElement("pre");
        contentEl.style.margin = "0";
        contentEl.style.whiteSpace = "pre-wrap";
        contentEl.style.wordWrap = "break-word";

        const fullText = text || rawText || tI18n("new-analysis:dashboard_dynamic.no_data", "Нет данных");
        const messageLinks = payload?.message_links || null;

        if (messageLinks) {
          // Безопасно собираем DOM с кликабельными иконками-ссылками
          appendTextWithMsgLinks(contentEl, fullText, messageLinks);
        } else {
          // Файловый режим / fallback — message_links не приходит,
          // просто рендерим как обычный текст (без токенов в выдаче).
          contentEl.textContent = fullText;
        }
        resultDiv.appendChild(contentEl);

        if (payload?.chat_name) {
          const bar = document.getElementById("chatTitleBar");
          const title = document.getElementById("chatTitleText");
          if (bar && title) {
            title.textContent = payload.chat_name;
            bar.style.display = "block";
          }
        }

        appendChargeBreakdown(resultDiv, payload);
      }

      const dispatchBotBtn = document.getElementById("dispatchBotBtn");

      async function dispatchBot() {
        try {
          const data = await apiFetch("/tg/bot/dispatch", { method: "POST" });
          const successPrefix = tI18n("new-analysis:dispatch_bot.success_prefix", "Бот отправил уведомления.");
          const sentStats = tI18n("new-analysis:dispatch_bot.sent_stats", "Sent={{sent}}, Failed={{failed}}", { sent: data.sent, failed: data.failed });
          const timeStats = tI18n("new-analysis:dispatch_bot.time_stats", "Время={{seconds}} сек.", { seconds: data.elapsed_seconds });
          alert(`${successPrefix}\n${sentStats}\n${timeStats}`);
        } catch (e) {
          const msg = e?.detail?.detail || e?.detail || e?.message || String(e);
          alert(tI18n("new-analysis:dispatch_bot.error_prefix", "Ошибка dispatch:") + " " + msg);
        }
      }

      if (dispatchBotBtn) {
        dispatchBotBtn.addEventListener("click", dispatchBot);
      }

      // кнопка Play
      if (analyzeBtn) {
        analyzeBtn.addEventListener("click", async () => {

          const isServiceAccount = dataSourcePublicRadio?.checked;
          const query = (queryInput?.value || "").trim();
          const isTelegramJson = dataSourceFileRadio?.checked;
          const isTelegramAccount = dataSourceAccountRadio?.checked;

          showLoader(true);
          if (resultDiv) resultDiv.textContent = "";

          try {
            // 1️⃣ ВЕТКА: TELEGRAM JSON
            if (isTelegramJson) {
              const file = fileInput?.files[0];

              if (!file) {
                alert(tI18n("new-analysis:dashboard_dynamic.import_json_first", "Сначала импортируйте JSON-файл экспорта Telegram."));
                showLoader(false);
                return;
              }

              const formData = new FormData();
              formData.append("file", file);

              const params = {
                query: query || null,
                result_type: "summary",
              };
              formData.append("params", JSON.stringify(params));

              
              const data = await apiFetch("/analyze", {
                method: "POST",
                body: formData,
              });

              if (loaderMinPromise) {
                await loaderMinPromise;
              }

              renderResult(data, JSON.stringify(data, null, 2), query);
              if (queryInput) queryInput.value = "";
              await loadChatHistory();
              return;
            }

            // 2️⃣ ВЕТКА: МОЙ TELEGRAM АККАУНТ
            if (isTelegramAccount) {
              const periodValue = parseInt(queryDaysInput?.value || "1", 10);
              const periodUnit = getQueryPeriodUnit();
              // days — для обратной совместимости со старыми бэкендами;
              // новый контракт period_value+period_unit приоритетный.
              const days = periodUnit === "days" ? periodValue : 1;
              const depth = getSelectedDepth();

              // --- Group mode: multi-chat request ---
              if (typeof isGroupModeOn === "function" && isGroupModeOn()) {
                const links = Array.from(selectedGroupChats);
                if (links.length === 0) {
                  alert(tI18n(
                    "new-analysis:chat_requests.group_select_at_least_one",
                    "Выберите хотя бы один чат для группового анализа."
                  ));
                  showLoader(false);
                  return;
                }

                const payload = {
                  chat_links: links,
                  days: days,
                  period_value: periodValue,
                  period_unit: periodUnit,
                  user_query: query || null,
                  depth: depth,
                };

                // Этап 8: добавляем media_filter, если пользователь его включил.
                const mfPayload = (typeof window.cotelMediaFilter?.getPayload === "function")
                  ? window.cotelMediaFilter.getPayload()
                  : null;
                if (mfPayload) payload.media_filter = mfPayload;

                const data = await apiFetch("/tg/analyze_chats_group", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });

                if (loaderMinPromise) {
                  await loaderMinPromise;
                }

                renderResult(data, JSON.stringify(data, null, 2), query);
                if (queryInput) queryInput.value = "";
                await loadChatHistory();
                return;
              }

              // --- Single-chat (existing) ---
              const chatLink = (activeChatInput?.value || "").trim();

              if (!chatLink) {
                alert(tI18n("new-analysis:dashboard_dynamic.enter_chat_link", "Введите ссылку на чат или канал Telegram."));
                showLoader(false);
                return;
              }

              const payload = {
                chat_link: chatLink,
                days: days,
                period_value: periodValue,
                period_unit: periodUnit,
                user_query: query || null,
                depth: depth,
              };

              // Этап 8: media_filter (опц., если включён в UI)
              const mfPayloadSingle = (typeof window.cotelMediaFilter?.getPayload === "function")
                ? window.cotelMediaFilter.getPayload()
                : null;
              if (mfPayloadSingle) payload.media_filter = mfPayloadSingle;

              const data = await apiFetch("/tg/analyze_chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });

              if (loaderMinPromise) {
                await loaderMinPromise;
              }

              renderResult(data, JSON.stringify(data, null, 2), query);
              if (queryInput) queryInput.value = "";
              await loadChatHistory();
              return;
            }

            // ВЕТКА: CЛУЖЕБНЫЙ АККАУНТ
            if (isServiceAccount) {
              const chatLink = (activeChatInput?.value || "").trim();
              const periodValue = parseInt(queryDaysInput?.value || "1", 10);
              const periodUnit = getQueryPeriodUnit();
              const days = periodUnit === "days" ? periodValue : 1;

              if (!chatLink) {
                alert(tI18n("new-analysis:dashboard_dynamic.enter_public_link", "Введите публичный username или ссылку на публичный чат/канал Telegram."));
                showLoader(false);
                return;
              }

              const payload = {
                chat_link: chatLink,
                days: days,
                period_value: periodValue,
                period_unit: periodUnit,
                user_query: query || "",
                depth: getSelectedDepth(),
              };

              const data = await apiFetch("/tg/service/analyze_chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });

              if (loaderMinPromise) {
                await loaderMinPromise;
              }

              renderResult(data, JSON.stringify(data, null, 2), query);
              if (queryInput) queryInput.value = "";
              await loadChatHistory();
              return;

            }

            // 3️⃣ НИЧЕГО НЕ ВЫБРАНО
            alert(tI18n("new-analysis:dashboard_dynamic.select_data_source", "Выберите источник данных."));
        } catch (err) {
          const msg = normalizePlanErrorMessage(err);

          if (resultDiv) {
            resultDiv.textContent = tI18n("new-analysis:dashboard_dynamic.request_error_prefix", "Ошибка запроса:") + " " + msg;
          }
        } finally {
          showLoader(false);
        }
        });
      }

      // Обработчик Enter и Shift+Enter для queryInput
      if (queryInput) {
        queryInput.addEventListener("keydown", async (event) => {
          // Enter без модификаторов = отправить
          if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            analyzeBtn?.click();
          }
          // Shift+Enter или Ctrl+Enter = новая строка
          else if (event.key === "Enter" && (event.shiftKey || event.ctrlKey || event.metaKey)) {
            // Позволяем браузеру добавить новую строку (по умолчанию)
            // На Mac: Cmd+Enter добавит новую строку
            // На Windows/Linux: Ctrl+Enter добавит новую строку
            // Shift+Enter добавит новую строку везде
          }
        });

        // Auto-grow textarea
        queryInput.addEventListener("input", () => {
          queryInput.style.height = "auto";
          queryInput.style.height = Math.min(queryInput.scrollHeight, 150) + "px";
        });
      }
    })();
  });
