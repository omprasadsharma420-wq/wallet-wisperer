import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const state = {
  supabase: null,
  session: null,
  profile: null,
  goal: null,
  drafts: [],
  report: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  alert: $("#alert"),
  sessionLabel: $("#sessionLabel"),
  viewTitle: $("#viewTitle"),
  sidePending: $("#sidePending"),
  nightlyLine: $("#nightlyLine"),
  reviewLine: $("#reviewLine"),
  draftList: $("#draftList"),
  goalStatus: $("#goalStatus"),
  goalPreview: $("#goalPreview"),
  metricSpent: $("#metricSpent"),
  metricFlexible: $("#metricFlexible"),
  metricProtected: $("#metricProtected"),
  metricStreak: $("#metricStreak"),
  reportInsight: $("#reportInsight"),
  reportAchievement: $("#reportAchievement"),
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
    url: localStorage.getItem("ww_supabase_url") || "",
    anon: localStorage.getItem("ww_supabase_anon") || "",
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

  if (!config.url || !config.anon) {
    state.supabase = null;
    return;
  }

  state.supabase = createClient(config.url, config.anon);
}

function requireClient() {
  if (!state.supabase) throw new Error("Save Supabase URL and anon key first.");
  return state.supabase;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currency(value = "NPR") {
  return (value || "NPR").toUpperCase();
}

function money(amount, code = "NPR") {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return "-";
  return `${currency(code)} ${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

async function invoke(name, body = {}) {
  const supabase = requireClient();
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  return data;
}

async function loadSession() {
  if (!state.supabase) {
    renderSession();
    return;
  }

  const { data } = await state.supabase.auth.getSession();
  state.session = data.session;
  renderSession();

  if (state.session) {
    await Promise.all([loadProfile(), loadGoal()]);
    await nightlyReview(false);
  }
}

function renderSession() {
  const email = state.session?.user?.email;
  els.sessionLabel.textContent = email ? `Signed in as ${email}` : "Not connected";
  $("#signOutBtn").classList.toggle("hidden", !email);
}

async function signIn() {
  const supabase = requireClient();
  const email = $("#email").value.trim();
  const password = $("#password").value;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  state.session = data.session;
  renderSession();
  showAlert("Signed in.");
  await Promise.all([loadProfile(), loadGoal()]);
  await nightlyReview(false);
}

async function signUp() {
  const supabase = requireClient();
  const email = $("#email").value.trim();
  const password = $("#password").value;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: email.split("@")[0] } },
  });
  if (error) throw error;
  state.session = data.session;
  renderSession();
  showAlert(data.session ? "Account created." : "Check email confirmation, then sign in.");
  if (data.session) await Promise.all([loadProfile(), loadGoal()]);
}

async function signOut() {
  if (!state.supabase) return;
  await state.supabase.auth.signOut();
  state.session = null;
  state.profile = null;
  state.goal = null;
  state.drafts = [];
  renderAll();
}

async function loadProfile() {
  const supabase = requireClient();
  const { data, error } = await supabase.from("profiles").select("*").maybeSingle();
  if (error) throw error;
  state.profile = data;
}

async function loadGoal() {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  state.goal = data;
  renderGoal();
}

async function saveGoal() {
  const supabase = requireClient();
  const userId = state.session?.user?.id;
  if (!userId) throw new Error("Sign in first.");

  const name = $("#goalName").value.trim();
  const amount = Number($("#goalAmount").value);
  const code = currency($("#goalCurrency").value || state.profile?.default_currency || "NPR");
  if (!name || !amount) throw new Error("Goal name and target amount are required.");

  if (state.goal?.id) {
    const { error } = await supabase.from("goals").update({
      name,
      target_amount: amount,
      currency: code,
    }).eq("id", state.goal.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("goals").insert({
      user_id: userId,
      name,
      target_amount: amount,
      currency: code,
      current_saved_amount: 0,
      is_active: true,
    });
    if (error) throw error;
  }

  showAlert("Goal saved.");
  await loadGoal();
}

function renderGoal() {
  const goal = state.goal;
  if (!goal) {
    els.goalStatus.textContent = "No active goal";
    els.goalPreview.innerHTML = "<p class=\"draft-meta\">Create one goal in Setup.</p>";
    return;
  }

  $("#goalName").value = goal.name || "";
  $("#goalAmount").value = goal.target_amount || "";
  $("#goalCurrency").value = goal.currency || "NPR";

  const percent = goal.target_amount ? Math.min(100, (Number(goal.current_saved_amount || 0) / Number(goal.target_amount)) * 100) : 0;
  els.goalStatus.textContent = `${percent.toFixed(1)}% funded`;
  els.goalPreview.innerHTML = `
    <div class="goal-row"><strong>${escapeHtml(goal.name)}</strong><span>${money(goal.target_amount, goal.currency)}</span></div>
    <div class="progress"><span style="width:${percent}%"></span></div>
    <div class="draft-meta">${money(goal.current_saved_amount || 0, goal.currency)} already set aside</div>
  `;
}

async function createDraft(source, rawText, subject = null) {
  if (!rawText.trim()) throw new Error("Add transaction text first.");
  const data = await invoke("create-draft", {
    source,
    raw_text: rawText,
    raw_subject: subject,
    default_currency: state.profile?.default_currency || state.goal?.currency || "NPR",
  });
  showAlert("Draft created.");
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
  els.nightlyLine.textContent = data.notification?.full_text || "Close today.";
  els.reviewLine.textContent = data.notification?.full_text || "Review tonight.";
  els.sidePending.textContent = String(data.pending_count || 0);
  if (data.goal) {
    state.goal = data.goal;
    renderGoal();
  }
  renderDrafts();
}

async function generateRecurringDrafts() {
  const data = await invoke("generate-recurring-drafts", {
    due_date: today(),
    timezone: state.profile?.timezone || "Asia/Katmandu",
  });
  showAlert(`${data.created_count || 0} fixed cards created.`);
  await nightlyReview(false);
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
      merchant: draftEditValue(id, "merchant"),
      category: draftEditValue(id, "category"),
      necessity: draftEditValue(id, "necessity"),
      payment_method: draftEditValue(id, "payment_method"),
      is_skipped_opportunity: draftEditValue(id, "is_skipped_opportunity"),
    };
  }

  await invoke("confirm-drafts", { confirm_ids: ids, edits });
  showAlert(`${ids.length} draft${ids.length === 1 ? "" : "s"} confirmed.`);
  await nightlyReview(false);
}

async function ignoreSelected() {
  const ids = selectedDraftIds();
  if (ids.length === 0) throw new Error("Select at least one draft.");
  await invoke("confirm-drafts", { ignore_ids: ids });
  showAlert(`${ids.length} draft${ids.length === 1 ? "" : "s"} ignored.`);
  await nightlyReview(false);
}

async function closeDay() {
  const data = await invoke("close-day", {
    report_date: today(),
    timezone: state.profile?.timezone || "Asia/Katmandu",
  });
  state.report = data.report;
  renderReport(data.streak);
  showAlert("Day closed.");
}

function renderDrafts() {
  if (!state.drafts.length) {
    els.draftList.innerHTML = "<section class=\"panel\"><p class=\"draft-meta\">No pending drafts for today.</p></section>";
    return;
  }

  els.draftList.innerHTML = state.drafts.map((draft) => {
    const amount = draft.parsed_amount ?? "";
    const code = draft.parsed_currency || state.profile?.default_currency || "NPR";
    const title = draft.parsed_merchant || draft.parsed_category || "Possible transaction";
    const confidence = Math.round(Number(draft.confidence || 0) * 100);
    return `
      <article class="draft-card">
        <div class="draft-main">
          <input class="draft-select" type="checkbox" value="${draft.id}">
          <div class="draft-title">
            <strong>${escapeHtml(title)}</strong>
            <span>${money(amount, code)} &middot; ${escapeHtml(draft.source)} &middot; ${confidence}% confidence</span>
          </div>
          <label class="draft-meta"><input data-draft="${draft.id}" data-field="is_skipped_opportunity" type="checkbox"> Skipped</label>
        </div>
        <div class="draft-edit">
          <input data-draft="${draft.id}" data-field="amount" value="${escapeAttr(amount)}" type="number" min="0.01" step="0.01" aria-label="Amount">
          <input data-draft="${draft.id}" data-field="merchant" value="${escapeAttr(draft.parsed_merchant || "")}" aria-label="Merchant">
          <input data-draft="${draft.id}" data-field="category" value="${escapeAttr(draft.parsed_category || "Uncategorized")}" aria-label="Category">
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

function option(value, selected) {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`;
}

function renderReport(streak = null) {
  const report = state.report;
  if (!report) return;
  els.metricSpent.textContent = money(report.total_spent, report.currency);
  els.metricFlexible.textContent = money(report.flexible_spent, report.currency);
  els.metricProtected.textContent = money(report.protected_amount, report.currency);
  els.metricStreak.textContent = streak ? `${streak.current_count} days` : "-";
  els.reportInsight.textContent = report.insight;
  els.reportAchievement.textContent = report.achievement;
}

function renderAll() {
  renderSession();
  renderGoal();
  renderDrafts();
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
  $("#parseBtn").addEventListener("click", () => guard(parsePreview));
  $("#createDraftBtn").addEventListener("click", () => guard(() => createDraft("manual", $("#captureInput").value)));
  $("#emailDraftBtn").addEventListener("click", () => guard(() => createDraft("forwarded_email", $("#emailInput").value, $("#emailSubject").value)));
  $("#nightlyBtn").addEventListener("click", () => guard(() => nightlyReview(true)));
  $("#loadReviewBtn").addEventListener("click", () => guard(() => nightlyReview(false)));
  $("#recurringBtn").addEventListener("click", () => guard(generateRecurringDrafts));
  $("#confirmSelectedBtn").addEventListener("click", () => guard(confirmSelected));
  $("#ignoreSelectedBtn").addEventListener("click", () => guard(ignoreSelected));
  $("#closeDayBtn").addEventListener("click", () => guard(closeDay));
  $("#refreshBtn").addEventListener("click", () => guard(async () => {
    if (state.session) {
      await Promise.all([loadProfile(), loadGoal(), nightlyReview(false)]);
      showAlert("Refreshed.");
    }
  }));
}

initClient();
bindEvents();
loadSession().catch((error) => showAlert(error.message || "Could not load session.", "error"));
window.addEventListener("load", () => {
  if (window.lucide) window.lucide.createIcons();
});
