import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const state = {
  supabase: null,
  session: null,
  profile: null,
  goal: null,
  goalPhotoUrl: null,
  drafts: [],
  report: null,
  incomeSources: [],
  recurringExpenses: [],
  nudge: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  alert: $("#alert"),
  nudge: $("#nudge"),
  nudgeTitle: $("#nudgeTitle"),
  nudgeBody: $("#nudgeBody"),
  sessionLabel: $("#sessionLabel"),
  viewTitle: $("#viewTitle"),
  sidePending: $("#sidePending"),
  nightlyLine: $("#nightlyLine"),
  reviewLine: $("#reviewLine"),
  draftList: $("#draftList"),
  confirmSummary: $("#confirmSummary"),
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

function timezone() {
  return state.profile?.timezone || "Asia/Katmandu";
}

function defaultCurrency() {
  return currency(state.profile?.default_currency || state.goal?.currency || "NPR");
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

  if (state.session) await bootstrapAfterAuth();
}

async function bootstrapAfterAuth() {
  await loadProfile();
  await Promise.all([loadGoal(), loadIncomeSources(), loadRecurringExpenses()]);
  try {
    await invoke("generate-recurring-drafts", { due_date: today(), timezone: timezone() });
  } catch (_error) {
    showAlert("Fixed expense cards could not refresh. Try the Fixed Cards button.", "info");
  }
  await nightlyReview(false);
  await checkNudge();
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
  await bootstrapAfterAuth();
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
  if (data.session) await bootstrapAfterAuth();
}

async function signOut() {
  if (!state.supabase) return;
  await state.supabase.auth.signOut();
  state.session = null;
  state.profile = null;
  state.goal = null;
  state.goalPhotoUrl = null;
  state.drafts = [];
  state.incomeSources = [];
  state.recurringExpenses = [];
  els.nudge.classList.add("hidden");
  renderAll();
}

async function loadProfile() {
  const supabase = requireClient();
  const { data, error } = await supabase.from("profiles").select("*").maybeSingle();
  if (error) throw error;
  state.profile = data;
  $("#profileCurrency").value = data?.default_currency || "NPR";
  $("#profileInboundEmail").value = data?.inbound_from_email || "";
}

async function saveProfile() {
  const supabase = requireClient();
  const userId = state.session?.user?.id;
  if (!userId) throw new Error("Sign in first.");

  const updates = {
    default_currency: currency($("#profileCurrency").value || "NPR"),
    inbound_from_email: $("#profileInboundEmail").value.trim().toLowerCase() || null,
  };

  const { error } = await supabase.from("profiles").update(updates).eq("id", userId);
  if (error) {
    if (String(error.message || "").includes("inbound_from_email")) {
      const { error: retryError } = await supabase
        .from("profiles")
        .update({ default_currency: updates.default_currency })
        .eq("id", userId);
      if (retryError) throw retryError;
      showAlert("Currency saved. Forwarding email needs the latest database migration deployed.", "error");
      await loadProfile();
      return;
    }
    throw error;
  }
  showAlert("Profile saved.");
  await loadProfile();
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
  await loadGoalPhoto();
  renderGoal();
}

async function loadGoalPhoto() {
  state.goalPhotoUrl = null;
  if (!state.goal?.photo_path || !state.supabase) return;
  const { data } = await state.supabase.storage
    .from("goal-photos")
    .createSignedUrl(state.goal.photo_path, 3600);
  state.goalPhotoUrl = data?.signedUrl || null;
}

async function saveGoal() {
  const supabase = requireClient();
  const userId = state.session?.user?.id;
  if (!userId) throw new Error("Sign in first.");

  const name = $("#goalName").value.trim();
  const amount = Number($("#goalAmount").value);
  const code = currency($("#goalCurrency").value || defaultCurrency());
  if (!name || !amount) throw new Error("Goal name and target amount are required.");

  let photoPath = state.goal?.photo_path || null;
  const photoFile = $("#goalPhoto").files?.[0];
  if (photoFile) {
    const extension = (photoFile.name.split(".").pop() || "jpg").toLowerCase();
    photoPath = `${userId}/rival.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("goal-photos")
      .upload(photoPath, photoFile, { upsert: true, contentType: photoFile.type });
    if (uploadError) throw uploadError;
  }

  const values = { name, target_amount: amount, currency: code, photo_path: photoPath };

  if (state.goal?.id) {
    const { error } = await supabase.from("goals").update(values).eq("id", state.goal.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("goals").insert({
      user_id: userId,
      ...values,
      current_saved_amount: 0,
      is_active: true,
    });
    if (error) throw error;
  }

  $("#goalPhoto").value = "";
  showAlert("Goal saved.");
  await loadGoal();
  renderDrafts();
}

function renderGoal() {
  const goal = state.goal;
  if (!goal) {
    els.goalStatus.textContent = "No active goal";
    els.goalPreview.innerHTML = "<p class=\"draft-meta\">Name your Rival in Setup: a photo, a name, a target amount.</p>";
    return;
  }

  $("#goalName").value = goal.name || "";
  $("#goalAmount").value = goal.target_amount || "";
  $("#goalCurrency").value = goal.currency || "NPR";

  const percent = goal.target_amount ? Math.min(100, (Number(goal.current_saved_amount || 0) / Number(goal.target_amount)) * 100) : 0;
  els.goalStatus.textContent = `${percent.toFixed(1)}% funded`;
  const photo = state.goalPhotoUrl
    ? `<img class="goal-photo" src="${escapeAttr(state.goalPhotoUrl)}" alt="${escapeAttr(goal.name)}">`
    : `<div class="goal-photo goal-photo-empty"><i data-lucide="image"></i></div>`;
  els.goalPreview.innerHTML = `
    <div class="goal-card">
      ${photo}
      <div class="goal-copy">
        <div class="goal-row"><strong>${escapeHtml(goal.name)}</strong><span>${money(goal.target_amount, goal.currency)}</span></div>
        <div class="progress"><span style="width:${percent}%"></span></div>
        <div class="draft-meta">${money(goal.current_saved_amount || 0, goal.currency)} already set aside</div>
      </div>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
}

async function checkNudge() {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("notification_queue")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return;

  state.nudge = data?.[0] || null;
  if (!state.nudge) {
    els.nudge.classList.add("hidden");
    return;
  }

  els.nudgeTitle.textContent = state.nudge.title;
  els.nudgeBody.textContent = state.nudge.body;
  els.nudge.classList.remove("hidden");
  if (window.lucide) window.lucide.createIcons();
}

async function dismissNudge(openReview) {
  if (state.nudge) {
    await state.supabase
      .from("notification_queue")
      .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
      .eq("id", state.nudge.id);
    state.nudge = null;
  }
  els.nudge.classList.add("hidden");
  if (openReview) switchView("review");
}

async function createDraft(source, rawText, subject = null) {
  if (!rawText.trim()) throw new Error("Add transaction text first.");
  const data = await invoke("create-draft", {
    source,
    raw_text: rawText,
    raw_subject: subject,
    default_currency: defaultCurrency(),
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
    default_currency: defaultCurrency(),
  });
  showAlert(`Parsed ${money(data.parsed.amount, data.parsed.currency)} as ${data.parsed.category || "Uncategorized"}.`);
}

async function nightlyReview(queueNotification) {
  const data = await invoke("nightly-review", {
    review_date: today(),
    timezone: timezone(),
    queue_notification: queueNotification,
  });
  state.drafts = data.drafts || [];
  els.nightlyLine.textContent = data.notification?.full_text || "Close today.";
  els.reviewLine.textContent = data.notification?.full_text || "Review tonight.";
  els.sidePending.textContent = String(data.pending_count || 0);
  if (data.goal) {
    state.goal = data.goal;
    await loadGoalPhoto();
    renderGoal();
  }
  renderDrafts();
  if (queueNotification) await checkNudge();
}

async function generateRecurringDrafts() {
  const data = await invoke("generate-recurring-drafts", {
    due_date: today(),
    timezone: timezone(),
  });
  showAlert(`${data.created_count || 0} fixed cards created.`);
  await nightlyReview(false);
}

function draftEditValue(id, field) {
  const element = document.querySelector(`[data-draft="${id}"][data-field="${field}"]`);
  if (!element) return undefined;
  if (field === "amount") return Number(element.value);
  if (field === "is_skipped_opportunity") return element.checked;
  if (field === "currency") return currency(element.value);
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
      currency: draftEditValue(id, "currency"),
      merchant: draftEditValue(id, "merchant"),
      category: draftEditValue(id, "category"),
      necessity: draftEditValue(id, "necessity"),
      payment_method: draftEditValue(id, "payment_method"),
      is_skipped_opportunity: draftEditValue(id, "is_skipped_opportunity"),
    };
  }

  const data = await invoke("confirm-drafts", { confirm_ids: ids, edits });
  renderConfirmSummary(data.confirmed_transactions || []);
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
    timezone: timezone(),
  });
  state.report = data.report;
  renderReport(data.streak);
  showAlert("Day closed.");
}

function rivalLine(draft) {
  const goal = state.goal;
  const amount = Number(draftEditValue(draft.id, "amount") ?? draft.parsed_amount);
  const code = currency(draftEditValue(draft.id, "currency") ?? draft.parsed_currency ?? defaultCurrency());
  const necessity = draftEditValue(draft.id, "necessity") ?? draft.parsed_necessity;
  const skipped = draftEditValue(draft.id, "is_skipped_opportunity") ?? false;
  const kind = draft.parsed_kind || "expense";

  if (kind !== "expense") return "";
  if (!goal || !goal.target_amount) {
    return `<p class="rival-line rival-muted">Set up your Rival to see what this trades against.</p>`;
  }

  const counts = necessity === "flexible" || skipped;
  if (!counts) {
    const label = necessity === "fixed" ? "Fixed cost" : "Needed";
    return `<p class="rival-line rival-muted">${label}. This never counts against ${escapeHtml(goal.name)}.</p>`;
  }

  if (!amount || amount <= 0) return "";
  if (code !== currency(goal.currency)) {
    return `<p class="rival-line rival-muted">Different currency than ${escapeHtml(goal.name)} (${currency(goal.currency)}).</p>`;
  }

  const percent = (amount / Number(goal.target_amount)) * 100;
  const shown = percent >= 10 ? percent.toFixed(0) : percent.toFixed(1);
  if (skipped) {
    return `<p class="rival-line rival-protected"><span>${money(amount, code)} protected</span> = ${shown}% of ${escapeHtml(goal.name)}</p>`;
  }
  return `<p class="rival-line"><span>${money(amount, code)}</span> = ${shown}% of ${escapeHtml(goal.name)}</p>`;
}

function renderDrafts() {
  if (!state.drafts.length) {
    els.draftList.innerHTML = "<section class=\"panel empty-state\"><i data-lucide=\"inbox\"></i><p>Nothing waiting. Log something from Capture, or enjoy the quiet.</p></section>";
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  els.draftList.innerHTML = state.drafts.map((draft) => {
    const amount = draft.parsed_amount ?? "";
    const code = draft.parsed_currency || defaultCurrency();
    const title = draft.parsed_merchant || draft.parsed_category || "Possible transaction";
    const confidence = Math.round(Number(draft.confidence || 0) * 100);
    return `
      <article class="draft-card" data-card="${draft.id}">
        <div class="draft-main">
          <input class="draft-select" type="checkbox" value="${draft.id}">
          <div class="draft-title">
            <strong>${escapeHtml(title)}</strong>
            <span>${money(amount, code)} &middot; ${escapeHtml(draft.source)} &middot; ${confidence}% confidence</span>
          </div>
          <label class="skip-toggle"><input data-draft="${draft.id}" data-field="is_skipped_opportunity" type="checkbox"> Skipped it</label>
        </div>
        <div class="rival-slot" data-rival="${draft.id}">${rivalLineInitial(draft)}</div>
        <div class="draft-edit">
          <input data-draft="${draft.id}" data-field="amount" value="${escapeAttr(amount)}" type="number" min="0.01" step="0.01" aria-label="Amount">
          <input data-draft="${draft.id}" data-field="currency" value="${escapeAttr(code)}" maxlength="3" aria-label="Currency">
          <input data-draft="${draft.id}" data-field="merchant" value="${escapeAttr(draft.parsed_merchant || "")}" aria-label="Merchant" placeholder="Merchant">
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
  if (window.lucide) window.lucide.createIcons();
}

function option(value, selected) {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`;
}

function rivalLineInitial(draft) {
  const goal = state.goal;
  const amount = Number(draft.parsed_amount);
  const code = currency(draft.parsed_currency || defaultCurrency());
  const necessity = draft.parsed_necessity;
  const kind = draft.parsed_kind || "expense";

  if (kind !== "expense") return "";
  if (!goal || !goal.target_amount) {
    return `<p class="rival-line rival-muted">Set up your Rival to see what this trades against.</p>`;
  }
  if (necessity === "fixed" || necessity === "needed") {
    const label = necessity === "fixed" ? "Fixed cost" : "Needed";
    return `<p class="rival-line rival-muted">${label}. This never counts against ${escapeHtml(goal.name)}.</p>`;
  }
  if (!amount || amount <= 0) return "";
  if (code !== currency(goal.currency)) {
    return `<p class="rival-line rival-muted">Different currency than ${escapeHtml(goal.name)} (${currency(goal.currency)}).</p>`;
  }
  const percent = (amount / Number(goal.target_amount)) * 100;
  const shown = percent >= 10 ? percent.toFixed(0) : percent.toFixed(1);
  return `<p class="rival-line"><span>${money(amount, code)}</span> = ${shown}% of ${escapeHtml(goal.name)}</p>`;
}

function refreshRivalLine(draftId) {
  const draft = state.drafts.find((item) => item.id === draftId);
  const slot = document.querySelector(`[data-rival="${draftId}"]`);
  if (!draft || !slot) return;
  slot.innerHTML = rivalLine(draft);
}

function renderConfirmSummary(transactions) {
  if (!transactions.length) {
    els.confirmSummary.classList.add("hidden");
    return;
  }

  const goalName = state.goal?.name;
  const rows = transactions.map((tx) => {
    let note;
    if (tx.goal_percent !== null && tx.goal_percent !== undefined && goalName) {
      const percent = Number(tx.goal_percent);
      const shown = percent >= 10 ? percent.toFixed(0) : percent.toFixed(1);
      note = tx.is_skipped_opportunity
        ? `protected ${shown}% of ${escapeHtml(goalName)}`
        : `${shown}% of ${escapeHtml(goalName)}`;
    } else {
      note = tx.kind !== "expense" ? "income" : "outside the Rival math";
    }
    return `
      <div class="summary-row${tx.is_skipped_opportunity ? " protected" : ""}">
        <span>${escapeHtml(tx.merchant || tx.category)}</span>
        <span>${money(tx.amount, tx.currency)}</span>
        <span>${note}</span>
      </div>
    `;
  }).join("");

  els.confirmSummary.innerHTML = `
    <div class="section-head">
      <h3>Confirmed tonight</h3>
      <span class="pill">${transactions.length} logged</span>
    </div>
    ${rows}
  `;
  els.confirmSummary.classList.remove("hidden");
}

async function loadIncomeSources() {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("income_sources")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  state.incomeSources = data || [];
  renderIncomeSources();
}

async function addIncomeSource() {
  const supabase = requireClient();
  const userId = state.session?.user?.id;
  if (!userId) throw new Error("Sign in first.");

  const label = $("#incomeLabel").value.trim();
  const amount = Number($("#incomeAmount").value);
  if (!label) throw new Error("Give the income source a name.");

  const { error } = await supabase.from("income_sources").insert({
    user_id: userId,
    label,
    amount: amount || 0,
    currency: currency($("#incomeCurrency").value || defaultCurrency()),
    cadence: $("#incomeCadence").value,
  });
  if (error) throw error;

  $("#incomeLabel").value = "";
  $("#incomeAmount").value = "";
  showAlert("Income source added.");
  await loadIncomeSources();
}

async function removeIncomeSource(id) {
  const supabase = requireClient();
  const { error } = await supabase.from("income_sources").update({ is_active: false }).eq("id", id);
  if (error) throw error;
  await loadIncomeSources();
}

function renderIncomeSources() {
  if (!state.incomeSources.length) {
    els.incomeList.innerHTML = "<p class=\"draft-meta\">No income sources yet. Add as many as you have.</p>";
    return;
  }
  els.incomeList.innerHTML = state.incomeSources.map((item) => `
    <div class="entry-row">
      <strong>${escapeHtml(item.label)}</strong>
      <span>${money(item.amount, item.currency)} / ${escapeHtml(item.cadence)}</span>
      <button class="ghost small" data-remove-income="${item.id}">Remove</button>
    </div>
  `).join("");
}

async function loadRecurringExpenses() {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("recurring_expenses")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  state.recurringExpenses = data || [];
  renderRecurringExpenses();
}

async function addRecurringExpense() {
  const supabase = requireClient();
  const userId = state.session?.user?.id;
  if (!userId) throw new Error("Sign in first.");

  const label = $("#recurringLabel").value.trim();
  const amount = Number($("#recurringAmount").value);
  if (!label || !amount) throw new Error("Fixed expenses need a name and amount.");

  const dueDay = Number($("#recurringDueDay").value) || null;
  const { error } = await supabase.from("recurring_expenses").insert({
    user_id: userId,
    label,
    amount,
    currency: currency($("#recurringCurrency").value || defaultCurrency()),
    due_day: dueDay,
    cadence: "monthly",
    next_due_date: today(),
  });
  if (error) throw error;

  $("#recurringLabel").value = "";
  $("#recurringAmount").value = "";
  $("#recurringDueDay").value = "";
  showAlert("Fixed expense added. Its card appears in tonight's review.");
  await loadRecurringExpenses();
}

async function removeRecurringExpense(id) {
  const supabase = requireClient();
  const { error } = await supabase.from("recurring_expenses").update({ is_active: false }).eq("id", id);
  if (error) throw error;
  await loadRecurringExpenses();
}

function renderRecurringExpenses() {
  if (!state.recurringExpenses.length) {
    els.recurringList.innerHTML = "<p class=\"draft-meta\">No fixed expenses yet. Rent, subscriptions, EMI, anything on repeat.</p>";
    return;
  }
  els.recurringList.innerHTML = state.recurringExpenses.map((item) => `
    <div class="entry-row">
      <strong>${escapeHtml(item.label)}</strong>
      <span>${money(item.amount, item.currency)}${item.due_day ? ` &middot; day ${item.due_day}` : ""}</span>
      <button class="ghost small" data-remove-recurring="${item.id}">Remove</button>
    </div>
  `).join("");
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
  renderIncomeSources();
  renderRecurringExpenses();
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
  $("#saveProfileBtn").addEventListener("click", () => guard(saveProfile));
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
  $("#addIncomeBtn").addEventListener("click", () => guard(addIncomeSource));
  $("#addRecurringBtn").addEventListener("click", () => guard(addRecurringExpense));
  $("#nudgeDismissBtn").addEventListener("click", () => guard(() => dismissNudge(false)));
  $("#nudgeReviewBtn").addEventListener("click", () => guard(() => dismissNudge(true)));
  $("#refreshBtn").addEventListener("click", () => guard(async () => {
    if (state.session) {
      await Promise.all([loadProfile(), loadGoal(), nightlyReview(false), loadIncomeSources(), loadRecurringExpenses()]);
      await checkNudge();
      showAlert("Refreshed.");
    }
  }));

  els.draftList.addEventListener("input", (event) => {
    const draftId = event.target.dataset?.draft;
    if (draftId) refreshRivalLine(draftId);
  });
  els.draftList.addEventListener("change", (event) => {
    const draftId = event.target.dataset?.draft;
    if (draftId) refreshRivalLine(draftId);
  });

  els.incomeList.addEventListener("click", (event) => {
    const id = event.target.dataset?.removeIncome;
    if (id) guard(() => removeIncomeSource(id));
  });
  els.recurringList.addEventListener("click", (event) => {
    const id = event.target.dataset?.removeRecurring;
    if (id) guard(() => removeRecurringExpense(id));
  });
}

window.__ww = { state, renderDrafts, renderGoal, renderConfirmSummary, renderReport, switchView };

initClient();
bindEvents();
loadSession().catch((error) => showAlert(error.message || "Could not load session.", "error"));
window.addEventListener("load", () => {
  if (window.lucide) window.lucide.createIcons();
});
