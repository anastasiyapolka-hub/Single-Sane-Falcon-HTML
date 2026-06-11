/**
 * Сохранённые запросы (пресеты).
 *
 * Одна точка входа — иконка-закладка в шапке «Настройки запроса». По клику
 * открывается поповер: список сохранённых пресетов (клик → применить настройки
 * в форму) + кнопка «Сохранить текущий запрос» (инлайн-ввод названия).
 *
 * Зависимости (глобальные, объявлены в других скриптах страницы):
 *   - apiFetch(path, opts)                — js/api.js
 *   - extractBackendErrorMessage(err)     — js/api.js
 *   - window.cotelQueryForm.getState()    — js/dashboard.js
 *   - window.cotelQueryForm.applyState()  — js/dashboard.js
 *   - window.cotelI18n.t (опционально)    — js/i18n.js
 */
(function () {
  "use strict";

  function tI18n(key, fallback) {
    try {
      if (window.cotelI18n && typeof window.cotelI18n.t === "function") {
        const v = window.cotelI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (_) {}
    return fallback;
  }

  function errMsg(err, fallback) {
    try {
      if (typeof extractBackendErrorMessage === "function") {
        return extractBackendErrorMessage(err, { fallback });
      }
    } catch (_) {}
    return fallback;
  }

  document.addEventListener("DOMContentLoaded", function () {
    const btn = document.getElementById("savedQueriesBtn");
    if (!btn) return;

    // --- Поповер строим один раз, прячем/показываем ---
    const pop = document.createElement("div");
    pop.id = "savedQueriesPopover";
    pop.className = "saved-queries-popover hidden";
    pop.setAttribute("role", "dialog");
    pop.innerHTML = `
      <div class="sq-pop-header">${tI18n("new-analysis:saved_queries.title", "Сохранённые запросы")}</div>
      <div class="sq-pop-list" id="sqList"></div>
      <div class="sq-pop-footer">
        <button type="button" class="sq-save-toggle" id="sqSaveToggle">
          + ${tI18n("new-analysis:saved_queries.save_current", "Сохранить текущий запрос")}
        </button>
        <div class="sq-save-form hidden" id="sqSaveForm">
          <input type="text" class="sq-save-name" id="sqSaveName" maxlength="255"
                 placeholder="${tI18n("new-analysis:saved_queries.name_placeholder", "Название запроса")}" />
          <div class="sq-save-actions">
            <button type="button" class="sq-btn sq-btn--primary" id="sqSaveConfirm">${tI18n("new-analysis:saved_queries.save", "Сохранить")}</button>
            <button type="button" class="sq-btn" id="sqSaveCancel">${tI18n("new-analysis:saved_queries.cancel", "Отмена")}</button>
          </div>
          <div class="sq-save-error hidden" id="sqSaveError"></div>
        </div>
      </div>
    `;
    document.body.appendChild(pop);

    const listEl = pop.querySelector("#sqList");
    const saveToggle = pop.querySelector("#sqSaveToggle");
    const saveForm = pop.querySelector("#sqSaveForm");
    const saveName = pop.querySelector("#sqSaveName");
    const saveConfirm = pop.querySelector("#sqSaveConfirm");
    const saveCancel = pop.querySelector("#sqSaveCancel");
    const saveError = pop.querySelector("#sqSaveError");

    let isOpen = false;

    function positionPopover() {
      const r = btn.getBoundingClientRect();
      // Поповер выравниваем по правому краю кнопки, под ней.
      const top = r.bottom + window.scrollY + 6;
      pop.style.top = top + "px";
      // right-align: вычисляем left так, чтобы правый край совпал с кнопкой.
      const desiredRight = r.right + window.scrollX;
      pop.style.left = Math.max(8, desiredRight - pop.offsetWidth) + "px";
    }

    function showError(msg) {
      saveError.textContent = msg;
      saveError.classList.remove("hidden");
    }
    function hideError() {
      saveError.textContent = "";
      saveError.classList.add("hidden");
    }

    function resetSaveForm() {
      saveForm.classList.add("hidden");
      saveToggle.classList.remove("hidden");
      saveName.value = "";
      hideError();
    }

    function renderList(items) {
      listEl.innerHTML = "";
      if (!Array.isArray(items) || items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "sq-empty";
        empty.textContent = tI18n("new-analysis:saved_queries.empty", "Пока нет сохранённых запросов.");
        listEl.appendChild(empty);
        return;
      }
      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "sq-item";

        const nameBtn = document.createElement("button");
        nameBtn.type = "button";
        nameBtn.className = "sq-item-name";
        nameBtn.textContent = item.name;
        nameBtn.title = tI18n("new-analysis:saved_queries.apply_hint", "Применить настройки этого запроса");
        nameBtn.addEventListener("click", () => applyPreset(item));

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "sq-item-del";
        delBtn.setAttribute("aria-label", tI18n("new-analysis:saved_queries.delete", "Удалить"));
        delBtn.title = tI18n("new-analysis:saved_queries.delete", "Удалить");
        delBtn.textContent = "×";
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          deletePreset(item, row);
        });

        row.appendChild(nameBtn);
        row.appendChild(delBtn);
        listEl.appendChild(row);
      });
    }

    async function loadList() {
      listEl.innerHTML = `<div class="sq-loading">${tI18n("new-analysis:saved_queries.loading", "Загрузка…")}</div>`;
      try {
        const data = await apiFetch("/saved-queries");
        renderList(data);
      } catch (err) {
        listEl.innerHTML = "";
        const e = document.createElement("div");
        e.className = "sq-empty sq-empty--error";
        e.textContent = errMsg(err, tI18n("new-analysis:saved_queries.load_error", "Не удалось загрузить запросы."));
        listEl.appendChild(e);
      }
    }

    function applyPreset(item) {
      try {
        if (window.cotelQueryForm && typeof window.cotelQueryForm.applyState === "function") {
          window.cotelQueryForm.applyState(item.params_json || {});
        }
      } catch (_) {}
      // Фоном отмечаем как «недавно использованный» — не блокируем UX.
      apiFetch(`/saved-queries/${item.id}/touch`, { method: "POST" }).catch(() => {});
      closePopover();
    }

    async function deletePreset(item, rowEl) {
      const confirmMsg = tI18n("new-analysis:saved_queries.delete_confirm", "Удалить сохранённый запрос «{name}»?")
        .replace("{name}", item.name);
      if (!window.confirm(confirmMsg)) return;
      try {
        await apiFetch(`/saved-queries/${item.id}`, { method: "DELETE" });
        rowEl.remove();
        if (!listEl.querySelector(".sq-item")) renderList([]);
      } catch (err) {
        alert(errMsg(err, tI18n("new-analysis:saved_queries.delete_error", "Не удалось удалить запрос.")));
      }
    }

    async function saveCurrent() {
      hideError();
      const name = (saveName.value || "").trim();
      if (!name) {
        showError(tI18n("new-analysis:saved_queries.name_required", "Введите название."));
        return;
      }
      let params = {};
      try {
        if (window.cotelQueryForm && typeof window.cotelQueryForm.getState === "function") {
          params = window.cotelQueryForm.getState();
        }
      } catch (_) {}

      saveConfirm.disabled = true;
      try {
        await apiFetch("/saved-queries", {
          method: "POST",
          body: JSON.stringify({ name, params_json: params }),
        });
        resetSaveForm();
        await loadList();
      } catch (err) {
        showError(errMsg(err, tI18n("new-analysis:saved_queries.save_error", "Не удалось сохранить запрос.")));
      } finally {
        saveConfirm.disabled = false;
      }
    }

    function openPopover() {
      isOpen = true;
      pop.classList.remove("hidden");
      resetSaveForm();
      positionPopover();
      loadList();
      // позиция после рендера (ширина известна)
      requestAnimationFrame(positionPopover);
      btn.setAttribute("aria-expanded", "true");
    }
    function closePopover() {
      isOpen = false;
      pop.classList.add("hidden");
      btn.setAttribute("aria-expanded", "false");
    }
    function togglePopover() {
      if (isOpen) closePopover();
      else openPopover();
    }

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePopover();
    });

    saveToggle.addEventListener("click", () => {
      saveToggle.classList.add("hidden");
      saveForm.classList.remove("hidden");
      saveName.focus();
    });
    saveCancel.addEventListener("click", resetSaveForm);
    saveConfirm.addEventListener("click", saveCurrent);
    saveName.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); saveCurrent(); }
      if (e.key === "Escape") { e.preventDefault(); resetSaveForm(); }
    });

    // Клик вне поповера — закрыть.
    document.addEventListener("click", (e) => {
      if (!isOpen) return;
      if (pop.contains(e.target) || btn.contains(e.target)) return;
      closePopover();
    });
    document.addEventListener("keydown", (e) => {
      if (isOpen && e.key === "Escape") closePopover();
    });
    window.addEventListener("resize", () => { if (isOpen) positionPopover(); });
  });
})();
