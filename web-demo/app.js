import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_URL = "https://lzbtttgggoxumbcjqqsu.supabase.co";
const DEFAULT_PUBLIC_KEY = "sb_publishable_v5pAWpqrnyLyEMlNeaZPAg_4xah6LqS";

const state = {
  supabase: null,
  session: null,
  profile: null,
  goal: null,
  drafts: [],
  report: null,
  streak: null,
  incomeSources: [],
  recurringExpenses: [],
  lastConfirmations: [],
  pendingCount: 0,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  alert: $("#alert"),
  sessionLabel: $("#sessionLabel"),
  viewTitle: $("#viewTitle"),
  sidePending: $("#sidePending"),
  nightlyLine: $("#nightlyLine"),
  rivalLine: $("#rivalLine"),
  reviewLine: $("#reviewLine"),
  nudgeBar: $("#nudgeBar"),
  nudgeCopy: $("#nudgeCopy"),
  draftList: $("#draftList"),
  confirmationPanel: $("#confirmationPanel"),
  goalStatus: $("#goalStatus"),
  goalPreview: $("#goalPreview"),
  incomeList: $("#incomeList"),
  recurringList: $("#recurringList"),
  metricSpent: $("#metricSpent"),
  metricFlexible: $("#metricFlexible"),
  metricProtected: $("#metricProtected"),
  metricStreak: $("#metricStreak"),
  reportInsight: $("#reportInsight"),
  reportAchievement: $("#reportAchievement"),
  goalRing: $("#goalRing"),
  reviewRing: $("#reviewRing"),
  protectedRing: $("#protectedRing"),
  spentRing: $("#spentRing"),
  reportProtectedRing: $("#reportProtectedRing"),
  streakRing: $("#streakRing"),
};

function showAlert(message, tone = "info") {
  els.alert.textContent = message;
  els.alert.dataset.tone = tone;
  els.alert.classList.remove("hidden");
  window.clearTimeout(showAlert.timer);
  showAlert.timer = window.setTimeout(() => els.alert.classList.add("hidden"), 6000);
}

function configFromStorage() {
  return {
    url: localStorage.getItem("ww_supabase_url") || DEFAULT_URL,
    anon: localStorage.getItem("ww_supabase_anon") || DEFAULT_PUBLIC_KEY,
  };
}

function saveConfig() {
  localStorage.setItem("ww_supabase_url", $("#supabaseUrl").value.trim());
  localStorage.setItem("ww_supabase_anon", $("#anonKey").value.trim());
  initClient();
  showAlert("Connection saved.");
}

function initClient() {
  const config = configFromStorage();
  $("#supabaseUrl").value = config.url;
  $("#anonKey").value = config.anon;
  state.supabase = config.url && config.anon ? createClient(config.url, config.anon) : null;
}

function requireClient() {
  if (!state.supabase) throw new Error("Save Supabase URL and public key first.");
  return state.supabase;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currency(value = "NPR") {
  return (value || "NPR").trim().toUpperCase();
}

function money(amount, code = "NPR") {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return "-";
  return `${currency(code)} ${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function pct(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

async function invoke(name, body = {}) {
  const { data, error } = await requireClient().functions.invoke(name, { body });
  if (error) throw error;
  return data;
}

async function loadSession() {
  if (!state.supabase) {
    renderSession();
    renderRings();
    return;
  }

  const { data } = await state.supabase.auth.getSession();
  state.session = data.session;
  renderSession();

  if (state.session) await runStartupSync({ silent: true });
  else renderRings();
}

function renderSession() {
  const email = state.session?.user?.email;
  els.sessionLabel.textContent = email ? `Signed in as ${email}` : "Not connected";
  $("#signOutBtn").classList.toggle("hidden", !email);
}

async function signIn() {
  const email = $("#email").value.trim();
  const password = $("#password").value;
  const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  state.session = data.session;
  renderSession();
  await runStartupSync({ silent: false });
  showAlert("Signed in.");
}

async function signUp() {
  const email = $("#email").value.trim();
  const password = $("#password").value;
  const { data, error } = await requireClient().auth.signUp({
    email,
    password,
    options: { data: { display_name: email.split("@")[0] } },
  });
  if (error) throw error;
  state.session = data.session;
  renderSession();
  showAlert(data.session ? "Account created." : "Check email confirmation, then sign in.");
  if (data.session) await runStartupSync({ silent: false });
}

async function signOut() {
  if (!state.supabase) return;
  await state.supabase.auth.signOut();
  Object.assign(state, {
    session: null,
    profile: null,
    goal: null,
    drafts: [],
    report: null,
    streak: null,
    incomeSources: [],
    recurringExpenses: [],
    lastConfirmations: [],
    pendingCount: 0,
  });
  renderAll();
}

async function runStartupSync({ silent }) {
  await Promise.all([loadProfile(), loadGoal(), loadIncomeSources(), loadRecurringExpenses()]);
  const recurring = await generateRecurringDrafts({ silent: true });
  await nightlyReview(false);
  if (!silent && recurring.created_count > 0) showAlert(`${recurring.created_count} fixed card${recurring.created_count === 1 ? "" : "s"} created.`);
}

async function loadProfile() {
  const { data, error } = await requireClient().from("profiles").select("*").maybeSingle();
  if (error) throw error;
  state.profile = data;
}

async function loadGoal() {
  const { data, error } = await requireClient()
    .from("goals")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  state.goal = data;
  renderGoal();
}

async function loadIncomeSources() {
  const { data, error } = await requireClient()
    .from("income_sources")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  state.incomeSources = data || [];
  renderIncomeSources();
}

async function loadRecurringExpenses() {
  const { data, error } = await requireClient()
    .from("recurring_expenses")
    .select("*")
    .eq("is_active", true)
    .order("next_due_date", { ascending: true });
  if (error) throw error;
  state.recurringExpenses = data || [];
  renderRecurringExpenses();
}

async function saveGoal() {
  const userId = state.session?.user?.id;
  if (!userId) throw new Error("Sign in first.");

  const name = $("#goalName").value.trim();
  const amount = Number($("#goalAmount").value);
  const code = currency($("#goalCurrency").value || state.profile?.default_currency || "NPR");
  if (!name || !amount) throw new Error("Goal name and target amount are required.");

  if (state.goal?.id) {
    const { error } = await requireClient().from("goals").update({ name, target_amount: amount, currency: code }).eq("id", state.goal.id);
    if (error) throw error;
  } else {
    const { error } = await requireClient().from("goals").insert({
      user_id: userId,
      name,
      target_amount: amount,
      currency: code,
      current_saved_amount: 0,
      is_active: true,
    });
    if (error) throw error;
  }

  await loadGoal();
  showAlert("Goal saved.");
}

async function saveIncomeSource() {
  const userId = state.session?.user?.id;
  if (!userId) throw new Error("Sign in first.");
  const label = $("#incomeLabel").value.trim();
  const amount = Number($("#incomeAmount").value);
  if (!label || amount < 0) throw new Error("Income label and amount are required.");

  const { error } = await requireClient().from("income_sources").insert({
    user_id: userId,
    label,
    amount,
    currency: currency($("#incomeCurrency").value || state.profile?.default_currency || "NPR"),
    cadence: $("#incomeCadence").value,
    is_active: true,
  });
  if (error) throw error;
  $("#incomeLabel").value = "";
  $("#incomeAmount").value = "";
  await loadIncomeSources();
  showAlert("Income source added.");
}

async function saveRecurringExpense() {
  const userId = state.session?.user?.id;
  if (!userId) throw new Error("Sign in first.");
  const label = $("#recurringLabel").value.trim();
  const amount = Number($("#recurringAmount").value);
  if (!label || !amount || amount <= 0) throw new Error("Fixed expense label and amount are required.");

  const dueDayRaw = $("#recurringDueDay").value;
  const { error } = await requireClient().from("recurring_expenses").insert({
    user_id: userId,
    label,
    amount,
    currency: currency($("#recurringCurrency").value || state.profile?.default_currency || "NPR"),
    category: $("#recurringCategory").value.trim() || "Bills",
    payment_method: $("#recurringMethod").value,
    cadence: $("#recurringCadence").value,
    due_day: dueDayRaw ? Number(dueDayRaw) : null,
    next_due_date: $("#recurringNextDue").value || today(),
    is_active: true,
  });
  if (error) throw error;
  $("#recurringLabel").value = "";
  $("#recurringAmount").value = "";
  await loadRecurringExpenses();
  showAlert("Fixed expense added.");
}

function renderGoal() {
  const goal = state.goal;
  if (!goal) {
    els.goalStatus.textContent = "No active goal";
    els.goalPreview.innerHTML = "<p class=\"draft-meta\">Create one goal in Setup.</p>";
    els.rivalLine.textContent = "Create a Rival goal to make flexible spending visible.";
    renderRings();
    return;
  }

  $("#goalName").value = goal.name || "";
  $("#goalAmount").value = goal.target_amount || "";
  $("#goalCurrency").value = goal.currency || "NPR";

  const percent = goal.target_amount ? pct((Number(goal.current_saved_amount || 0) / Number(goal.target_amount)) * 100) : 0;
  els.goalStatus.textContent = `${percent.toFixed(1)}% funded`;
  els.rivalLine.textContent = `Flexible spending is measured against ${goal.name}.`;
  els.goalPreview.innerHTML = `
    <div class="goal-row"><strong>${escapeHtml(goal.name)}</strong><span>${money(goal.target_amount, goal.currency)}</span></div>
    <div class="progress"><span style="width:${percent}%"></span></div>
    <div class="draft-meta">${money(goal.current_saved_amount || 0, goal.currency)} already set aside</div>
  `;
  renderRings();
}

function renderIncomeSources() {
  if (!els.incomeList) return;
  els.incomeList.innerHTML = state.incomeSources.length
    ? state.incomeSources.map((item) => `
      <div class="mini-row">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${money(item.amount, item.currency)} ${escapeHtml(item.cadence)}</span>
      </div>
    `).join("")
    : "<p class=\"draft-meta\">No income sources yet.</p>";
}

function renderRecurringExpenses() {
  if (!els.recurringList) return;
  els.recurringList.innerHTML = state.recurringExpenses.length
    ? state.recurringExpenses.map((item) => `
      <div class="mini-row">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${money(item.amount, item.currency)} due ${escapeHtml(item.next_due_date || "soon")}</span>
      </div>
    `).join("")
    : "<p class=\"draft-meta\">No fixed expenses yet.</p>";
}

async function createDraft(source, rawText, subject = null) {
  if (!rawText.trim()) throw new Error("Add transaction text first.");
  const data = await invoke("create-draft", {
    source,
    raw_text: rawText,
    raw_subject: subject,
    default_currency: state.profile?.default_currency || state.goal?.currency || "NPR",
  });
  showAlert(`Draft created via ${data.draft?.model || "parser"}.`);
  await nightlyReview(false);
  switchView("review");
  return data;
}

async function parsePreview() {
  const rawText = $("#captureInput").value;
  if (!rawText.trim()) throw new Error("Add transaction text first.");
  const data = await invoke("parse-transaction", {
    raw_text: rawText,
    default_currency: state.profile?.default_currency || "NPR",
  });
  showAlert(`Parsed ${money(data.parsed.amount, data.parsed.currency)} as ${data.parsed.category || "Uncategorized"}.`);
}

async function nightlyReview(queueNotification) {
  const data = await invoke("nightly-review", {
    review_date: today(),
    timezone: state.profile?.timezone || "Asia/Katmandu",
    queue_notification: queueNotification,
  });
  state.drafts = data.drafts || [];
  state.pendingCount = data.pending_count || 0;
  els.nightlyLine.textContent = data.notification?.full_text || "Close today.";
  els.reviewLine.textContent = data.notification?.full_text || "Review tonight.";
  els.sidePending.textContent = String(state.pendingCount);
  if (data.goal) state.goal = data.goal;
  renderGoal();
  renderNudge(data.notification);
  renderDrafts();
}

async function generateRecurringDrafts({ silent = false } = {}) {
  const data = await invoke("generate-recurring-drafts", {
    due_date: today(),
    timezone: state.profile?.timezone || "Asia/Katmandu",
  });
  if (!silent) {
    showAlert(`${data.created_count || 0} fixed card${data.created_count === 1 ? "" : "s"} created.`);
    await nightlyReview(false);
  }
  return data;
}

function draftEditValue(id, field) {
  const element = document.querySelector(`[data-draft="${id}"][data-field="${field}"]`);
  if (!element) return undefined;
  if (field === "amount") return Number(element.value);
  if (field === "is_skipped_opportunity") return element.checked;
  return element.value;
}

function selectedDraftIds() {
  return $$(".draft-select:checked").map((item) => item.value);
}

async function confirmSelected() {
  const ids = selectedDraftIds();
  if (ids.length === 0) throw new Error("Select at least one draft.");
  const edits = {};
  for (const id of ids) {
    edits[id] = {
      amount: draftEditValue(id, "amount"),
      currency: currency(draftEditValue(id, "currency") || state.profile?.default_currency || "NPR"),
      merchant: draftEditValue(id, "merchant"),
      category: draftEditValue(id, "category"),
      kind: draftEditValue(id, "kind"),
      necessity: draftEditValue(id, "necessity"),
      payment_method: draftEditValue(id, "payment_method"),
      is_skipped_opportunity: draftEditValue(id, "is_skipped_opportunity"),
    };
  }

  const data = await invoke("confirm-drafts", { confirm_ids: ids, edits });
  state.lastConfirmations = data.confirmed_transactions || [];
  renderConfirmations();
  showAlert(`${ids.length} draft${ids.length === 1 ? "" : "s"} confirmed.`);
  await nightlyReview(false);
}

async function ignoreSelected() {
  const ids = selectedDraftIds();
  if (ids.length === 0) throw new Error("Select at least one draft.");
  await invoke("confirm-drafts", { ignore_ids: ids });
  state.lastConfirmations = [];
  renderConfirmations();
  showAlert(`${ids.length} draft${ids.length === 1 ? "" : "s"} ignored.`);
  await nightlyReview(false);
}

async function closeDay() {
  const data = await invoke("close-day", {
    report_date: today(),
    timezone: state.profile?.timezone || "Asia/Katmandu",
  });
  state.report = data.report;
  state.streak = data.streak;
  renderReport();
  switchView("report");
  showAlert("Day closed.");
}

function renderNudge(notification) {
  if (!state.session || state.pendingCount === 0) {
    els.nudgeBar.classList.add("hidden");
    return;
  }
  els.nudgeCopy.textContent = notification?.full_text || `${state.pendingCount} possible transactions found today. Review tonight?`;
  els.nudgeBar.classList.remove("hidden");
}

function renderDrafts() {
  if (!state.drafts.length) {
    els.draftList.innerHTML = "<section class=\"panel empty-panel\"><p class=\"draft-meta\">No pending drafts for today.</p></section>";
    return;
  }

  els.draftList.innerHTML = state.drafts.map((draft) => {
    const amount = draft.parsed_amount ?? "";
    const code = draft.parsed_currency || state.profile?.default_currency || "NPR";
    const title = draft.parsed_merchant || draft.parsed_category || "Possible transaction";
    const confidence = Math.round(Number(draft.confidence || 0) * 100);
    return `
      <article class="draft-card" data-card="${draft.id}">
        <div class="draft-main">
          <input class="draft-select" type="checkbox" value="${draft.id}" aria-label="Select draft">
          <div class="draft-title">
            <strong>${escapeHtml(title)}</strong>
            <span>${money(amount, code)} &middot; ${escapeHtml(draft.source)} &middot; ${confidence}% confidence &middot; ${escapeHtml(draft.model || "parser")}</span>
          </div>
          <label class="skip-toggle"><input data-draft="${draft.id}" data-field="is_skipped_opportunity" type="checkbox"> <span>Skipped</span></label>
        </div>
        <div class="tradeoff" data-tradeoff="${draft.id}">
          ${rivalTradeoffHtml({
            amount,
            currency: code,
            kind: draft.parsed_kind,
            necessity: draft.parsed_necessity,
            skipped: false,
          })}
        </div>
        <div class="draft-edit">
          <input data-draft="${draft.id}" data-field="amount" value="${escapeAttr(amount)}" type="number" min="0.01" step="0.01" aria-label="Amount">
          <input data-draft="${draft.id}" data-field="currency" value="${escapeAttr(code)}" maxlength="3" aria-label="Currency">
          <input data-draft="${draft.id}" data-field="merchant" value="${escapeAttr(draft.parsed_merchant || "")}" aria-label="Merchant">
          <input data-draft="${draft.id}" data-field="category" value="${escapeAttr(draft.parsed_category || "Uncategorized")}" aria-label="Category">
          <select data-draft="${draft.id}" data-field="kind" aria-label="Kind">
            ${option("expense", draft.parsed_kind)}
            ${option("income", draft.parsed_kind)}
            ${option("transfer", draft.parsed_kind)}
          </select>
          <select data-draft="${draft.id}" data-field="necessity" aria-label="Necessity">
            ${option("flexible", draft.parsed_necessity)}
            ${option("needed", draft.parsed_necessity)}
            ${option("fixed", draft.parsed_necessity)}
            ${option("unknown", draft.parsed_necessity)}
          </select>
          <select data-draft="${draft.id}" data-field="payment_method" aria-label="Payment method">
            ${option("wallet", draft.parsed_payment_method)}
            ${option("card", draft.parsed_payment_method)}
            ${option("cash", draft.parsed_payment_method)}
            ${option("bank_transfer", draft.parsed_payment_method)}
            ${option("unknown", draft.parsed_payment_method)}
          </select>
        </div>
        <p class="draft-meta">${escapeHtml(draft.ai_notes || draft.raw_text || "")}</p>
      </article>
    `;
  }).join("");
}

function updateDraftTradeoff(id) {
  const target = document.querySelector(`[data-tradeoff="${id}"]`);
  if (!target) return;
  target.innerHTML = rivalTradeoffHtml({
    amount: draftEditValue(id, "amount"),
    currency: draftEditValue(id, "currency"),
    kind: draftEditValue(id, "kind"),
    necessity: draftEditValue(id, "necessity"),
    skipped: Boolean(draftEditValue(id, "is_skipped_opportunity")),
  });
}

function rivalTradeoffHtml({ amount, currency: code, kind, necessity, skipped }) {
  const numericAmount = Number(amount);
  const goal = state.goal;
  if (!goal || !numericAmount || kind !== "expense") {
    return `<span class="tradeoff-label">Rival</span><strong>No Rival tradeoff</strong><small>Income, transfers, and uncaptured goals stay neutral.</small>`;
  }

  const percent = goal.target_amount ? (numericAmount / Number(goal.target_amount)) * 100 : 0;
  if (skipped) {
    return `<span class="tradeoff-label">Protected</span><strong>${money(numericAmount, code)} kept for ${escapeHtml(goal.name)}</strong><small>${percent.toFixed(2)}% of the Rival stayed untouched.</small>`;
  }

  if (necessity !== "flexible") {
    return `<span class="tradeoff-label">Rival</span><strong>No Rival tradeoff</strong><small>Fixed and needed costs do not compete with ${escapeHtml(goal.name)}.</small>`;
  }

  return `<span class="tradeoff-label">Rival</span><strong>${money(numericAmount, code)} = ${percent.toFixed(2)}% of ${escapeHtml(goal.name)}</strong><small>Shown before confirmation, while the choice is still editable.</small>`;
}

function renderConfirmations() {
  if (!state.lastConfirmations.length) {
    els.confirmationPanel.classList.add("hidden");
    els.confirmationPanel.innerHTML = "";
    return;
  }

  els.confirmationPanel.classList.remove("hidden");
  els.confirmationPanel.innerHTML = `
    <div class="section-head">
      <h3>Confirmed</h3>
      <span class="pill">${state.lastConfirmations.length} saved</span>
    </div>
    <div class="confirmed-list">
      ${state.lastConfirmations.map((tx) => {
        const showRival = tx.goal_percent !== null && tx.goal_percent !== undefined;
        const title = tx.merchant || tx.category || "Transaction";
        return `
          <div class="confirmed-row">
            <strong>${escapeHtml(title)}</strong>
            <span>${money(tx.amount, tx.currency)} ${showRival ? `&middot; ${Number(tx.goal_percent).toFixed(2)}% of ${escapeHtml(state.goal?.name || "Rival")}` : "&middot; no Rival tradeoff"}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderReport() {
  const report = state.report;
  if (!report) return;
  els.metricSpent.textContent = money(report.total_spent, report.currency);
  els.metricFlexible.textContent = money(report.flexible_spent, report.currency);
  els.metricProtected.textContent = money(report.protected_amount, report.currency);
  els.metricStreak.textContent = state.streak ? `${state.streak.current_count} ${state.streak.current_count === 1 ? "day" : "days"}` : "-";
  els.reportInsight.textContent = report.insight;
  els.reportAchievement.textContent = report.achievement;
  renderRings();
}

function renderRings() {
  const goalPercent = state.goal?.target_amount ? pct((Number(state.goal.current_saved_amount || 0) / Number(state.goal.target_amount)) * 100) : 0;
  const reviewPercent = state.pendingCount === 0 ? 100 : pct(Math.max(0, 100 - state.pendingCount * 20));
  const protectedAmount = Number(state.report?.protected_amount || 0);
  const flexibleAmount = Number(state.report?.flexible_spent || 0);
  const protectedPercent = protectedAmount + flexibleAmount > 0 ? pct((protectedAmount / (protectedAmount + flexibleAmount)) * 100) : 0;
  const spentAmount = Number(state.report?.total_spent || 0);
  const neededAmount = Number(state.report?.needed_spent || 0) + Number(state.report?.fixed_spent || 0);
  const spendPercent = spentAmount > 0 ? pct((neededAmount / spentAmount) * 100) : 0;
  const streakPercent = pct(((state.streak?.current_count || 0) / 7) * 100);

  renderRing(els.goalRing, { label: "Rival", value: `${goalPercent.toFixed(0)}%`, sub: state.goal?.name || "No goal", percent: goalPercent, tone: "teal" });
  renderRing(els.reviewRing, { label: "Review", value: String(state.pendingCount), sub: "pending", percent: reviewPercent, tone: "indigo" });
  renderRing(els.protectedRing, { label: "Protected", value: money(protectedAmount, state.report?.currency || state.goal?.currency || "NPR"), sub: "today", percent: protectedPercent, tone: "amber" });
  renderRing(els.spentRing, { label: "Needed", value: `${spendPercent.toFixed(0)}%`, sub: "of spending", percent: spendPercent, tone: "teal" });
  renderRing(els.reportProtectedRing, { label: "Protected", value: money(protectedAmount, state.report?.currency || "NPR"), sub: "toward Rival", percent: protectedPercent, tone: "amber" });
  renderRing(els.streakRing, { label: "Streak", value: `${state.streak?.current_count || 0}`, sub: "days", percent: streakPercent, tone: "indigo" });
}

function renderRing(element, { label, value, sub, percent, tone }) {
  if (!element) return;
  element.style.setProperty("--ring-value", `${pct(percent)}%`);
  element.dataset.tone = tone;
  element.innerHTML = `
    <div class="ring-visual"><span>${escapeHtml(value)}</span></div>
    <div class="ring-copy">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(sub)}</span>
    </div>
  `;
}

function renderAll() {
  renderSession();
  renderGoal();
  renderIncomeSources();
  renderRecurringExpenses();
  renderDrafts();
  renderConfirmations();
  renderReport();
  renderNudge();
  renderRings();
}

function switchView(view) {
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  $$(".view").forEach((item) => item.classList.toggle("active", item.id === `view-${view}`));
  const titles = {
    capture: "Smart Capture",
    review: "Nightly Review",
    report: "Daily Report",
    settings: "Setup",
  };
  els.viewTitle.textContent = titles[view] || "Wallet Whisperer";
}

function option(value, selected) {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

async function guard(action) {
  try {
    await action();
    if (window.lucide) window.lucide.createIcons();
  } catch (error) {
    showAlert(error.message || "Something went wrong.", "error");
  }
}

function bindEvents() {
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $("#saveConfigBtn").addEventListener("click", () => guard(saveConfig));
  $("#signInBtn").addEventListener("click", () => guard(signIn));
  $("#signUpBtn").addEventListener("click", () => guard(signUp));
  $("#signOutBtn").addEventListener("click", () => guard(signOut));
  $("#saveGoalBtn").addEventListener("click", () => guard(saveGoal));
  $("#saveIncomeBtn").addEventListener("click", () => guard(saveIncomeSource));
  $("#saveRecurringBtn").addEventListener("click", () => guard(saveRecurringExpense));
  $("#parseBtn").addEventListener("click", () => guard(parsePreview));
  $("#createDraftBtn").addEventListener("click", () => guard(() => createDraft("manual", $("#captureInput").value)));
  $("#emailDraftBtn").addEventListener("click", () => guard(() => createDraft("forwarded_email", $("#emailInput").value, $("#emailSubject").value)));
  $("#nightlyBtn").addEventListener("click", () => guard(() => nightlyReview(true)));
  $("#nudgeReviewBtn").addEventListener("click", () => switchView("review"));
  $("#loadReviewBtn").addEventListener("click", () => guard(() => nightlyReview(false)));
  $("#recurringBtn").addEventListener("click", () => guard(() => generateRecurringDrafts({ silent: false })));
  $("#confirmSelectedBtn").addEventListener("click", () => guard(confirmSelected));
  $("#ignoreSelectedBtn").addEventListener("click", () => guard(ignoreSelected));
  $("#closeDayBtn").addEventListener("click", () => guard(closeDay));
  $("#refreshBtn").addEventListener("click", () => guard(async () => {
    if (state.session) {
      await runStartupSync({ silent: true });
      showAlert("Refreshed.");
    }
  }));
  els.draftList.addEventListener("input", (event) => {
    const id = event.target?.dataset?.draft;
    if (id) updateDraftTradeoff(id);
  });
  els.draftList.addEventListener("change", (event) => {
    const id = event.target?.dataset?.draft;
    if (id) updateDraftTradeoff(id);
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.session) guard(() => runStartupSync({ silent: true }));
  });
}

initClient();
bindEvents();
renderRings();
loadSession().catch((error) => showAlert(error.message || "Could not load session.", "error"));
window.addEventListener("load", () => {
  if (window.lucide) window.lucide.createIcons();
});
