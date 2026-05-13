/*
 * CoTel admin panel — MVP.
 *
 * Calls backend /admin/* endpoints. All API calls go through `apiFetch`
 * from js/api.js so they share session-cookie + Bearer fallback behavior
 * with the rest of the app.
 *
 * Privacy guardrails come from the backend; the frontend only displays
 * what the server sends. We never request or render password hashes,
 * Telegram ciphertext, subscription prompts, or chat content.
 */

(function () {
  "use strict";

  const PAGE_SIZE = 50;

  const state = {
    users: { offset: 0, total: 0 },
    usage: { offset: 0, total: 0, userId: null, eventType: null },
    subs: { offset: 0, total: 0 },
  };

  // ---------- helpers ----------

  function toast(msg, isError = false) {
    const el = document.getElementById("adminToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("is-error", !!isError);
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 4000);
  }

  function fmtDt(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    // Compact: 2026-05-12 14:32
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fmtBool(v) {
    return v === true ? "✓" : v === false ? "—" : "?";
  }

  function fmtNum(v) {
    if (v === null || v === undefined) return "—";
    if (typeof v === "number") {
      if (Number.isInteger(v)) return v.toLocaleString();
      return v.toFixed(4);
    }
    return String(v);
  }

  function fmtCost(v) {
    if (v === null || v === undefined) return "—";
    const n = Number(v);
    if (Number.isNaN(n)) return "—";
    if (n === 0) return "$0";
    if (n < 0.001) return "<$0.001";
    return `$${n.toFixed(4)}`;
  }

  function clearTbody(tbl) {
    const tb = tbl.querySelector("tbody");
    if (tb) tb.innerHTML = "";
    return tb;
  }

  function tdText(text, className) {
    const td = document.createElement("td");
    td.textContent = text === null || text === undefined ? "—" : String(text);
    if (className) td.className = className;
    return td;
  }

  function tdHtml(html, className) {
    const td = document.createElement("td");
    td.innerHTML = html;
    if (className) td.className = className;
    return td;
  }

  function tdMetaJson(meta) {
    const td = document.createElement("td");
    td.className = "meta-cell";
    const det = document.createElement("details");
    const sum = document.createElement("summary");
    sum.textContent = "raw";
    det.appendChild(sum);
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(meta || {}, null, 2);
    det.appendChild(pre);
    td.appendChild(det);
    return td;
  }

  function setPagerInfo(elId, offset, total) {
    const el = document.getElementById(elId);
    if (!el) return;
    const from = total === 0 ? 0 : offset + 1;
    const to = Math.min(offset + PAGE_SIZE, total);
    el.textContent = `${from}–${to} / ${total}`;
  }

  // ---------- tab switching ----------

  function switchTab(name) {
    document.querySelectorAll(".admin-tab").forEach((t) => {
      t.classList.toggle("is-active", t.dataset.tab === name);
    });
    document.querySelectorAll(".admin-pane").forEach((p) => {
      p.classList.toggle("is-active", p.dataset.pane === name);
    });

    if (name === "users") loadUsers();
    else if (name === "usage") loadUsage();
    else if (name === "subs") loadSubs();
    else if (name === "sessions") loadSessions();
    else if (name === "pricing") loadPricing();
  }

  // ---------- USERS ----------

  async function loadUsers() {
    const tbl = document.getElementById("usersTable");
    const tb = clearTbody(tbl);
    if (!tb) return;
    tb.innerHTML = `<tr><td colspan="13" class="muted">Loading…</td></tr>`;

    try {
      const res = await apiFetch(`/admin/users?limit=${PAGE_SIZE}&offset=${state.users.offset}`);
      state.users.total = res.total || 0;
      document.getElementById("usersCount").textContent = `${state.users.total} users`;
      setPagerInfo("usersPagerInfo", state.users.offset, state.users.total);

      tb.innerHTML = "";
      for (const u of res.items || []) {
        const tr = document.createElement("tr");
        tr.dataset.userId = u.id;
        tr.appendChild(tdText(u.id, "num"));
        tr.appendChild(tdText(u.email));
        tr.appendChild(tdText(u.plan));
        tr.appendChild(tdText(`${u.language || "?"} / ${u.timezone || "?"}`));
        tr.appendChild(tdText(fmtDt(u.created_at)));
        tr.appendChild(tdText(fmtDt(u.last_login_at)));
        tr.appendChild(tdText(
          `${u.web_sessions_active_count}/${fmtBool(u.telegram_session_active)}/${fmtBool(u.bot_linked)}`
        ));
        tr.appendChild(tdText(`${u.qa_today} / ${u.qa_month}`, "num"));
        tr.appendChild(tdText(
          `${u.qa_total_success} / ${u.qa_total_failed} / ${u.qa_total_rejected}`,
          "num"
        ));
        tr.appendChild(tdText(
          `${u.active_subscriptions_count} / ${u.total_subscriptions_count}`,
          "num"
        ));
        tr.appendChild(tdText(fmtDt(u.last_qa_at)));
        tr.appendChild(tdText(fmtDt(u.last_subscription_run_at)));
        tr.appendChild(tdText(
          `${fmtCost(u.estimated_cost_usd_month)} / ${fmtCost(u.estimated_cost_usd_total)}`,
          "num"
        ));
        tr.addEventListener("click", () => openUserDrawer(u.id));
        tb.appendChild(tr);
      }

      if (!res.items || res.items.length === 0) {
        tb.innerHTML = `<tr><td colspan="13" class="muted">No users.</td></tr>`;
      }
    } catch (err) {
      handleAdminError(err, "Failed to load users");
      tb.innerHTML = `<tr><td colspan="13" class="bad">Load failed.</td></tr>`;
    }
  }

  // ---------- USER DRAWER ----------

  async function openUserDrawer(userId) {
    const drawer = document.getElementById("userDrawer");
    const body = document.getElementById("userDrawerBody");
    const title = document.getElementById("userDrawerTitle");
    drawer.hidden = false;
    title.textContent = `User #${userId}`;
    body.innerHTML = `<p class="muted">Loading…</p>`;

    try {
      const d = await apiFetch(`/admin/users/${userId}`);
      title.textContent = d.profile?.email
        ? `User #${userId} — ${d.profile.email}`
        : `User #${userId}`;

      const html = [];

      // Profile
      html.push(`<h3>Profile</h3><dl class="kv">`);
      for (const [k, v] of Object.entries(d.profile || {})) {
        html.push(`<dt>${escapeHtml(k)}</dt><dd>${formatVal(v)}</dd>`);
      }
      html.push(`</dl>`);

      // Usage summary
      html.push(`<h3>Usage summary</h3><dl class="kv">`);
      for (const [k, v] of Object.entries(d.usage_summary || {})) {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          html.push(`<dt>${escapeHtml(k)}</dt><dd><pre style="margin:0;font-size:11px;">${escapeHtml(JSON.stringify(v))}</pre></dd>`);
        } else {
          html.push(`<dt>${escapeHtml(k)}</dt><dd>${formatVal(v)}</dd>`);
        }
      }
      html.push(`</dl>`);

      // Telegram
      const tg = d.telegram || {};
      html.push(`<h3>Web sessions (${(tg.web_sessions || []).length})</h3>`);
      html.push(renderMiniTable(tg.web_sessions, [
        "created_at", "expires_at", "revoked_at", "last_seen_at",
        "ip_masked", "user_agent", "is_active",
      ]));

      html.push(`<h3>Telegram sessions (${(tg.telegram_sessions || []).length})</h3>`);
      html.push(renderMiniTable(tg.telegram_sessions, [
        "is_active", "created_at", "updated_at", "last_used_at", "revoked_at",
      ]));

      html.push(`<h3>Bot links (${(tg.bot_links || []).length})</h3>`);
      html.push(renderMiniTable(tg.bot_links, [
        "telegram_chat_id_masked", "started_at", "is_blocked", "created_at", "updated_at",
      ]));

      // Subscriptions
      html.push(`<h3>Subscriptions (${(d.subscriptions || []).length})</h3>`);
      html.push(renderMiniTable(d.subscriptions, [
        "id", "name", "subscription_type", "source_mode", "frequency_minutes",
        "is_active", "status", "is_trial",
        "match_events_count", "digest_events_count",
        "notify_queued_count", "notify_sent_count", "notify_failed_count",
        "last_checked_at", "last_success_at", "next_run_at",
        "chat_ref_display", "last_error",
      ]));

      // Recent usage events
      html.push(`<h3>Recent usage events (${(d.recent_usage_events || []).length})</h3>`);
      html.push(renderMiniTable(d.recent_usage_events, [
        "created_at", "event_type", "status", "source_mode", "ai_model",
        "input_tokens", "output_tokens", "estimated_cost_usd",
        "duration_ms_total", "error_code",
      ]));

      body.innerHTML = html.join("");
    } catch (err) {
      handleAdminError(err, "Failed to load user");
      body.innerHTML = `<p class="bad">Load failed.</p>`;
    }
  }

  function renderMiniTable(rows, cols) {
    if (!rows || rows.length === 0) {
      return `<p class="muted" style="font-size:12px;">— empty —</p>`;
    }
    const head = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
    const body = rows.map((r) => {
      return `<tr>${cols.map((c) => `<td>${formatVal(r[c])}</td>`).join("")}</tr>`;
    }).join("");
    return `<div class="admin-table-wrap" style="margin-bottom:8px;">
      <table class="admin-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </div>`;
  }

  // ---------- USAGE EVENTS ----------

  async function loadUsage() {
    const tbl = document.getElementById("usageTable");
    const tb = clearTbody(tbl);
    if (!tb) return;
    tb.innerHTML = `<tr><td colspan="14" class="muted">Loading…</td></tr>`;

    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(state.usage.offset),
    });
    if (state.usage.userId) params.append("user_id", String(state.usage.userId));
    if (state.usage.eventType) params.append("event_type", state.usage.eventType);

    try {
      const res = await apiFetch(`/admin/usage-events?${params.toString()}`);
      state.usage.total = res.total || 0;
      document.getElementById("usageCount").textContent = `${state.usage.total} events`;
      setPagerInfo("usagePagerInfo", state.usage.offset, state.usage.total);

      tb.innerHTML = "";
      for (const ev of res.items || []) {
        const tr = document.createElement("tr");
        tr.appendChild(tdText(fmtDt(ev.created_at)));
        tr.appendChild(tdText(ev.user_id, "num"));
        tr.appendChild(tdText(ev.event_type));
        tr.appendChild(tdText(ev.status));
        tr.appendChild(tdText(ev.source_mode));
        tr.appendChild(tdText(ev.subscription_id, "num"));
        tr.appendChild(tdText(ev.ai_model));
        tr.appendChild(tdText(
          ev.days !== null && ev.days !== undefined ? `${ev.days}d` :
          (ev.frequency_minutes ? `${ev.frequency_minutes}m` : "—")
        ));
        tr.appendChild(tdText(
          `${ev.messages_fetched_count ?? "—"} / ${ev.messages_sent_to_llm_count ?? "—"}`,
          "num"
        ));
        tr.appendChild(tdText(
          `${ev.input_tokens ?? "—"} / ${ev.output_tokens ?? "—"}`,
          "num"
        ));
        tr.appendChild(tdText(fmtCost(ev.estimated_cost_usd), "num"));
        tr.appendChild(tdText(
          ev.duration_ms_total !== null && ev.duration_ms_total !== undefined
            ? `${ev.duration_ms_total}`
            : "—",
          "num"
        ));
        const errCell = tdText(ev.error_code || "—");
        if (ev.error_code) errCell.classList.add("bad");
        tr.appendChild(errCell);
        tr.appendChild(tdMetaJson(ev.meta_json));
        tb.appendChild(tr);
      }

      if (!res.items || res.items.length === 0) {
        tb.innerHTML = `<tr><td colspan="14" class="muted">No events match the filter.</td></tr>`;
      }
    } catch (err) {
      handleAdminError(err, "Failed to load usage events");
      tb.innerHTML = `<tr><td colspan="14" class="bad">Load failed.</td></tr>`;
    }
  }

  // ---------- SUBSCRIPTIONS ----------

  async function loadSubs() {
    const tbl = document.getElementById("subsTable");
    const tb = clearTbody(tbl);
    if (!tb) return;
    tb.innerHTML = `<tr><td colspan="18" class="muted">Loading…</td></tr>`;

    try {
      const res = await apiFetch(`/admin/subscriptions?limit=${PAGE_SIZE}&offset=${state.subs.offset}`);
      state.subs.total = res.total || 0;
      document.getElementById("subsCount").textContent = `${state.subs.total} subscriptions`;
      setPagerInfo("subsPagerInfo", state.subs.offset, state.subs.total);

      tb.innerHTML = "";
      for (const s of res.items || []) {
        const tr = document.createElement("tr");
        tr.appendChild(tdText(s.id, "num"));
        tr.appendChild(tdText(s.owner_email || `#${s.owner_user_id}`));
        tr.appendChild(tdText(s.name));
        tr.appendChild(tdText(s.subscription_type));
        tr.appendChild(tdText(s.source_mode));
        tr.appendChild(tdText(s.frequency_minutes, "num"));
        tr.appendChild(tdText(s.ai_model));
        tr.appendChild(tdText(fmtBool(s.is_active)));
        const stCell = tdText(s.status);
        if (s.status && s.status !== "ok" && s.status !== "active") stCell.classList.add("bad");
        tr.appendChild(stCell);
        tr.appendChild(tdText(fmtBool(s.is_trial)));
        tr.appendChild(tdText(fmtDt(s.created_at)));
        tr.appendChild(tdText(fmtDt(s.last_checked_at)));
        tr.appendChild(tdText(fmtDt(s.last_success_at)));
        tr.appendChild(tdText(fmtDt(s.next_run_at)));
        tr.appendChild(tdText(`${s.match_events_count} / ${s.digest_events_count}`, "num"));
        tr.appendChild(tdText(
          `${s.notify_queued_count} / ${s.notify_sent_count} / ${s.notify_failed_count}`,
          "num"
        ));
        tr.appendChild(tdText(
          `${fmtCost(s.last_run_estimated_cost_usd)} / ${fmtCost(s.total_estimated_cost_usd)}`,
          "num"
        ));
        const errCell = tdText(s.last_error || "—");
        if (s.last_error) errCell.classList.add("bad");
        tr.appendChild(errCell);
        tb.appendChild(tr);
      }

      if (!res.items || res.items.length === 0) {
        tb.innerHTML = `<tr><td colspan="18" class="muted">No subscriptions.</td></tr>`;
      }
    } catch (err) {
      handleAdminError(err, "Failed to load subscriptions");
      tb.innerHTML = `<tr><td colspan="18" class="bad">Load failed.</td></tr>`;
    }
  }

  // ---------- SESSIONS ----------

  async function loadSessions() {
    const webTbl = document.getElementById("webSessionsTable");
    const tgTbl = document.getElementById("tgSessionsTable");
    const botTbl = document.getElementById("botLinksTable");

    clearTbody(webTbl).innerHTML = `<tr><td colspan="8" class="muted">Loading…</td></tr>`;
    clearTbody(tgTbl).innerHTML = `<tr><td colspan="6" class="muted">Loading…</td></tr>`;
    clearTbody(botTbl).innerHTML = `<tr><td colspan="7" class="muted">Loading…</td></tr>`;

    try {
      const res = await apiFetch(`/admin/sessions?limit=100&offset=0`);

      // Web
      const tbWeb = clearTbody(webTbl);
      for (const s of res.web_sessions || []) {
        const tr = document.createElement("tr");
        tr.appendChild(tdText(s.email || `#${s.user_id}`));
        tr.appendChild(tdText(fmtDt(s.created_at)));
        tr.appendChild(tdText(fmtDt(s.expires_at)));
        tr.appendChild(tdText(fmtDt(s.revoked_at)));
        tr.appendChild(tdText(fmtDt(s.last_seen_at)));
        tr.appendChild(tdText(s.user_agent));
        tr.appendChild(tdText(s.ip_masked));
        tr.appendChild(tdText(fmtBool(s.is_active), s.is_active ? "ok" : "muted"));
        tbWeb.appendChild(tr);
      }
      if (!(res.web_sessions || []).length)
        tbWeb.innerHTML = `<tr><td colspan="8" class="muted">No web sessions.</td></tr>`;

      // Telegram
      const tbTg = clearTbody(tgTbl);
      for (const s of res.telegram_sessions || []) {
        const tr = document.createElement("tr");
        tr.appendChild(tdText(s.email || `#${s.user_id}`));
        tr.appendChild(tdText(fmtBool(s.is_active), s.is_active ? "ok" : "muted"));
        tr.appendChild(tdText(fmtDt(s.created_at)));
        tr.appendChild(tdText(fmtDt(s.updated_at)));
        tr.appendChild(tdText(fmtDt(s.last_used_at)));
        tr.appendChild(tdText(fmtDt(s.revoked_at)));
        tbTg.appendChild(tr);
      }
      if (!(res.telegram_sessions || []).length)
        tbTg.innerHTML = `<tr><td colspan="6" class="muted">No Telegram sessions.</td></tr>`;

      // Bot links
      const tbBot = clearTbody(botTbl);
      for (const b of res.bot_links || []) {
        const tr = document.createElement("tr");
        tr.appendChild(tdText(b.email || `#${b.owner_user_id}`));
        tr.appendChild(tdText(b.telegram_user_id, "num"));
        tr.appendChild(tdText(b.telegram_chat_id_masked));
        tr.appendChild(tdText(fmtDt(b.started_at)));
        tr.appendChild(tdText(fmtBool(b.is_blocked), b.is_blocked ? "bad" : "muted"));
        tr.appendChild(tdText(fmtDt(b.created_at)));
        tr.appendChild(tdText(fmtDt(b.updated_at)));
        tbBot.appendChild(tr);
      }
      if (!(res.bot_links || []).length)
        tbBot.innerHTML = `<tr><td colspan="7" class="muted">No bot links.</td></tr>`;
    } catch (err) {
      handleAdminError(err, "Failed to load sessions");
    }
  }

  // ---------- PRICING ----------

  // Editing context. null = "add new model", or {id, ai_model, ...} when editing.
  let pricingEditing = null;

  async function loadPricing() {
    const tbl = document.getElementById("pricingTable");
    const tb = clearTbody(tbl);
    if (!tb) return;
    tb.innerHTML = `<tr><td colspan="10" class="muted">Loading…</td></tr>`;

    try {
      const res = await apiFetch("/admin/pricing");
      const items = res.items || [];
      document.getElementById("pricingCount").textContent = `${items.length} rows`;

      tb.innerHTML = "";
      for (const r of items) {
        const tr = document.createElement("tr");
        if (!r.is_active) tr.classList.add("admin-pricing-inactive");
        tr.appendChild(tdText(r.id, "num"));
        tr.appendChild(tdText(r.ai_model));
        tr.appendChild(tdText(fmtCost(r.input_price_per_1m_usd), "num"));
        tr.appendChild(tdText(fmtCost(r.output_price_per_1m_usd), "num"));
        tr.appendChild(tdText(r.currency));
        tr.appendChild(tdText(fmtBool(r.is_active), r.is_active ? "ok" : "muted"));
        tr.appendChild(tdText(r.note || "—"));
        tr.appendChild(tdText(r.updated_by_email || (r.updated_by_user_id ? `#${r.updated_by_user_id}` : "—")));
        tr.appendChild(tdText(fmtDt(r.updated_at)));
        const editCell = document.createElement("td");
        const btn = document.createElement("button");
        btn.className = "admin-btn";
        btn.textContent = "Edit";
        btn.addEventListener("click", (e) => { e.stopPropagation(); openPricingModal(r); });
        editCell.appendChild(btn);
        tr.appendChild(editCell);
        tb.appendChild(tr);
      }

      if (!items.length) {
        tb.innerHTML = `<tr><td colspan="10" class="muted">Нет строк в llm_pricing. Добавь первую через «+ Добавить модель».</td></tr>`;
      }
    } catch (err) {
      handleAdminError(err, "Failed to load pricing");
      tb.innerHTML = `<tr><td colspan="10" class="bad">Load failed.</td></tr>`;
    }
  }

  function openPricingModal(row) {
    pricingEditing = row || null;
    const modal = document.getElementById("pricingModal");
    const title = document.getElementById("pricingModalTitle");
    const submit = document.getElementById("pricingSubmitBtn");
    const aiInput = document.getElementById("pricingFieldAiModel");

    if (row) {
      title.textContent = `Изменить: ${row.ai_model}`;
      submit.textContent = "Сохранить";
      aiInput.value = row.ai_model;
      aiInput.readOnly = true; // ai_model is the unique key — don't allow renaming via this path
      document.getElementById("pricingFieldInputPrice").value = row.input_price_per_1m_usd ?? "";
      document.getElementById("pricingFieldOutputPrice").value = row.output_price_per_1m_usd ?? "";
      document.getElementById("pricingFieldCurrency").value = row.currency || "USD";
      document.getElementById("pricingFieldIsActive").checked = !!row.is_active;
      document.getElementById("pricingFieldNote").value = row.note || "";
    } else {
      title.textContent = "Добавить модель";
      submit.textContent = "Создать";
      aiInput.value = "";
      aiInput.readOnly = false;
      document.getElementById("pricingFieldInputPrice").value = "";
      document.getElementById("pricingFieldOutputPrice").value = "";
      document.getElementById("pricingFieldCurrency").value = "USD";
      document.getElementById("pricingFieldIsActive").checked = true;
      document.getElementById("pricingFieldNote").value = "";
    }
    modal.hidden = false;
  }

  function closePricingModal() {
    document.getElementById("pricingModal").hidden = true;
    pricingEditing = null;
  }

  async function submitPricingForm(e) {
    e.preventDefault();
    const submit = document.getElementById("pricingSubmitBtn");
    submit.disabled = true;

    const body = {
      ai_model: document.getElementById("pricingFieldAiModel").value.trim(),
      input_price_per_1m_usd: Number(document.getElementById("pricingFieldInputPrice").value),
      output_price_per_1m_usd: Number(document.getElementById("pricingFieldOutputPrice").value),
      currency: (document.getElementById("pricingFieldCurrency").value || "USD").trim().toUpperCase(),
      is_active: !!document.getElementById("pricingFieldIsActive").checked,
      note: document.getElementById("pricingFieldNote").value.trim() || null,
    };

    try {
      if (pricingEditing && pricingEditing.id) {
        // PUT — server ignores ai_model on update; we send only mutable fields
        const patch = {
          input_price_per_1m_usd: body.input_price_per_1m_usd,
          output_price_per_1m_usd: body.output_price_per_1m_usd,
          currency: body.currency,
          is_active: body.is_active,
          note: body.note ?? "",
        };
        await apiFetch(`/admin/pricing/${pricingEditing.id}`, {
          method: "PUT",
          body: JSON.stringify(patch),
        });
        toast("Прайс обновлён. Кэш сброшен.");
      } else {
        await apiFetch("/admin/pricing", {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast("Прайс добавлен. Кэш сброшен.");
      }
      closePricingModal();
      await loadPricing();
    } catch (err) {
      if (err && err.status === 409) {
        toast("Эта модель уже есть. Используй Edit.", true);
      } else {
        handleAdminError(err, "Failed to save pricing");
      }
    } finally {
      submit.disabled = false;
    }
  }

  // ---------- error handling ----------

  function handleAdminError(err, fallback) {
    if (err && err.status === 401) {
      toast("Not authenticated. Please log in.", true);
      setTimeout(() => { window.location.href = "/new-analysis.html"; }, 1500);
      return;
    }
    if (err && err.status === 403) {
      toast("Admin access required (ADMIN_EMAILS).", true);
      setTimeout(() => { window.location.href = "/new-analysis.html"; }, 2000);
      return;
    }
    console.error(err);
    toast(fallback || "Request failed.", true);
  }

  // ---------- value formatters for drawer KV ----------

  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatVal(v) {
    if (v === null || v === undefined) return `<span class="muted">—</span>`;
    if (typeof v === "boolean") return v ? "✓" : "—";
    if (typeof v === "number") return String(v);
    if (typeof v === "string") {
      if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDt(v);
      return escapeHtml(v);
    }
    if (Array.isArray(v)) return escapeHtml(JSON.stringify(v));
    return escapeHtml(JSON.stringify(v));
  }

  // ---------- bootstrap ----------

  document.addEventListener("DOMContentLoaded", async () => {
    // Verify admin access first; otherwise we just bounce.
    try {
      const w = await apiFetch("/admin/whoami");
      if (!w || !w.is_admin) {
        toast("Admin access required.", true);
        setTimeout(() => { window.location.href = "/new-analysis.html"; }, 1500);
        return;
      }
      const lbl = document.getElementById("adminEmailLabel");
      if (lbl) lbl.textContent = w.email || "";
    } catch (err) {
      handleAdminError(err, "Failed to verify admin access");
      return;
    }

    // Tab bar
    document.querySelectorAll(".admin-tab").forEach((t) => {
      t.addEventListener("click", () => switchTab(t.dataset.tab));
    });

    // Pagers / reload buttons
    document.querySelector('[data-action="users-reload"]')?.addEventListener("click", () => loadUsers());
    document.querySelector('[data-action="users-prev"]')?.addEventListener("click", () => {
      state.users.offset = Math.max(0, state.users.offset - PAGE_SIZE);
      loadUsers();
    });
    document.querySelector('[data-action="users-next"]')?.addEventListener("click", () => {
      if (state.users.offset + PAGE_SIZE < state.users.total) {
        state.users.offset += PAGE_SIZE;
        loadUsers();
      }
    });

    document.querySelector('[data-action="usage-apply"]')?.addEventListener("click", () => {
      const uid = document.getElementById("usageFilterUserId").value.trim();
      state.usage.userId = uid ? Number(uid) : null;
      state.usage.eventType = document.getElementById("usageFilterEventType").value || null;
      state.usage.offset = 0;
      loadUsage();
    });
    document.querySelector('[data-action="usage-prev"]')?.addEventListener("click", () => {
      state.usage.offset = Math.max(0, state.usage.offset - PAGE_SIZE);
      loadUsage();
    });
    document.querySelector('[data-action="usage-next"]')?.addEventListener("click", () => {
      if (state.usage.offset + PAGE_SIZE < state.usage.total) {
        state.usage.offset += PAGE_SIZE;
        loadUsage();
      }
    });

    document.querySelector('[data-action="subs-reload"]')?.addEventListener("click", () => loadSubs());
    document.querySelector('[data-action="subs-prev"]')?.addEventListener("click", () => {
      state.subs.offset = Math.max(0, state.subs.offset - PAGE_SIZE);
      loadSubs();
    });
    document.querySelector('[data-action="subs-next"]')?.addEventListener("click", () => {
      if (state.subs.offset + PAGE_SIZE < state.subs.total) {
        state.subs.offset += PAGE_SIZE;
        loadSubs();
      }
    });

    document.querySelector('[data-action="sessions-reload"]')?.addEventListener("click", () => loadSessions());

    // Pricing
    document.querySelector('[data-action="pricing-reload"]')?.addEventListener("click", () => loadPricing());
    document.querySelector('[data-action="pricing-add"]')?.addEventListener("click", () => openPricingModal(null));
    document.querySelectorAll('[data-action="pricing-cancel"]').forEach((el) => {
      el.addEventListener("click", () => closePricingModal());
    });
    document.getElementById("pricingForm")?.addEventListener("submit", submitPricingForm);

    // Drawer close
    document.getElementById("userDrawerClose")?.addEventListener("click", () => {
      document.getElementById("userDrawer").hidden = true;
    });

    // Initial load
    switchTab("users");
  });
})();
