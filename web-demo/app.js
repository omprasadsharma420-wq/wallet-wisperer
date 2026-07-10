import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_URL = "https://lzbtttgggoxumbcjqqsu.supabase.co";
const DEFAULT_PUBLIC_KEY = "sb_publishable_v5pAWpqrnyLyEMlNeaZPAg_4xah6LqS";
const CATEGORY_STORAGE_KEY = "ww_category_targets";

const CATEGORY_GROUPS = [
  {
    name: "Bills",
    categories: [
      { id: "rent-mortgage", label: "Rent/Mortgage", icon: "RM", amount: 18000 },
      { id: "phone-internet", label: "Phone & Internet", icon: "PI", amount: 2500 },
      { id: "utilities", label: "Utilities", icon: "UT", amount: 3500 },
    ],
  },
  {
    name: "Needs",
    categories: [
      { id: "groceries", label: "Groceries", icon: "GR", amount: 12000 },
      { id: "transportation", label: "Transportation", icon: "TR", amount: 4500 },
      { id: "medical-expenses", label: "Medical expenses", icon: "ME", amount: 2500 },
      { id: "emergency-fund", label: "Emergency fund", icon: "EF", amount: 5000 },
    ],
  },
  {
    name: "Wants",
    categories: [
      { id: "dining-out", label: "Dining out", icon: "DO", amount: 3500 },
      { id: "entertainment", label: "Entertainment", icon: "EN", amount: 2500 },
      { id: "vacation", label: "Vacation", icon: "VA", amount: 7000 },
    ],
  },
];

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
  categoryBudgets: [],
  selectedCategoryId: "phone-internet",
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
  locationLine: $("#locationLine"),
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
  captureRings: $("#captureRings"),
  statsRings: $("#statsRings"),
  ringCenterValue: $("#ringCenterValue"),
  statsCenterValue: $("#statsCenterValue"),
  budgetValue: $("#budgetValue"),
  expenseValue: $("#expenseValue"),
  remainingValue: $("#remainingValue"),
  budgetMonth: $("#budgetMonth"),
  incomeTotalValue: $("#incomeTotalValue"),
  assignedLine: $("#assignedLine"),
  categoryGroups: $("#categoryGroups"),
  targetTitle: $("#targetTitle"),
  targetGroup: $("#targetGroup"),
  targetIcon: $("#targetIcon"),
  targetAmountValue: $("#targetAmountValue"),
  targetHint: $("#targetHint"),
  targetSlider: $("#targetSlider"),
  targetSpentValue: $("#targetSpentValue"),
  targetRemainingValue: $("#targetRemainingValue"),
  targetProgressBar: $("#targetProgressBar"),
  statsCategoryList: $("#statsCategoryList"),
  statsBudgetStatus: $("#statsBudgetStatus"),
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

function defaultCategoryBudgets() {
  return CATEGORY_GROUPS.map((group) => ({
    name: group.name,
    categories: group.categories.map((category) => ({ ...category })),
  }));
}

function loadCategoryBudgets() {
  const defaults = defaultCategoryBudgets();
  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem(CATEGORY_STORAGE_KEY) || "[]");
  } catch (_error) {
    saved = [];
  }

  const savedById = new Map(
    saved
      .flatMap((group) => group.categories || [])
      .map((category) => [category.id, Number(category.amount)]),
  );

  return defaults.map((group) => ({
    ...group,
    categories: group.categories.map((category) => ({
      ...category,
      amount: savedById.has(category.id) ? Number(savedById.get(category.id)) : category.amount,
    })),
  }));
}

function saveCategoryBudgets() {
  localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(state.categoryBudgets));
}

function allCategories() {
  return state.categoryBudgets.flatMap((group) => group.categories.map((category) => ({ ...category, group: group.name })));
}

function findCategory(id = state.selectedCategoryId) {
  return allCategories().find((category) => category.id === id) || allCategories()[0];
}

function updateCategoryAmount(id, amount) {
  for (const group of state.categoryBudgets) {
    const category = group.categories.find((item) => item.id === id);
    if (category) {
      category.amount = Math.max(0, Number(amount) || 0);
      state.selectedCategoryId = id;
      saveCategoryBudgets();
      renderBudgetPlan();
      renderFinanceRings();
      return;
    }
  }
}

function categoryBudgetTotal() {
  return allCategories().reduce((total, category) => total + Number(category.amount || 0), 0);
}

function monthlyIncomeTotal() {
  const multipliers = {
    weekly: 4,
    biweekly: 2,
    monthly: 1,
    yearly: 1 / 12,
  };

  return state.incomeSources.reduce((total, item) => {
    const multiplier = multipliers[item.cadence] || 1;
    return total + Number(item.amount || 0) * multiplier;
  }, 0);
}

function currentExpenseTotal() {
  const reportSpent = Number(state.report?.total_spent || 0);
  if (reportSpent > 0) return reportSpent;

  return state.lastConfirmations
    .filter((transaction) => transaction.kind !== "income" && !transaction.is_skipped_opportunity)
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
}

function categorySpent(category) {
  const key = normalizeText(category?.label || "");
  if (!key) return 0;

  return state.lastConfirmations
    .filter((transaction) => transaction.kind !== "income" && !transaction.is_skipped_opportunity)
    .filter((transaction) => {
      const categoryText = normalizeText(transaction.category || "");
      const merchantText = normalizeText(transaction.merchant || "");
      return (categoryText && (categoryText.includes(key) || key.includes(categoryText))) || (merchantText && merchantText.includes(key));
    })
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
}

function normalizeText(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function categorySliderMax(category) {
  const base = Number(category?.amount || 0);
  return Math.max(10000, Math.ceil(Math.max(base * 2, 50000) / 500) * 500);
}

function displayLocation() {
  const timezone = state.profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Katmandu";
  const place = timezone.split("/").pop().replaceAll("_", " ").replace("Katmandu", "Kathmandu");
  const localDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: timezone }).format(new Date());
  return `${place} local day, ${localDate}`;
}

async function invoke(name, body = {}) {
  const { data, error } = await requireClient().functions.invoke(name, { body });
  if (error) throw error;
  return data;
}

async function loadSession() {
  if (!state.supabase) {
    renderSession();
    renderFinanceRings();
    return;
  }

  const { data } = await state.supabase.auth.getSession();
  state.session = data.session;
  renderSession();

  if (state.session) await runStartupSync({ silent: true });
  else renderFinanceRings();
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
    els.goalPreview.innerHTML = "<p class=\"draft-meta\">Create one goal in Expense and Income.</p>";
    els.rivalLine.textContent = "Create a Rival goal to make flexible spending visible.";
    renderFinanceRings();
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
  renderFinanceRings();
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
  renderBudgetPlan();
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

function renderBudgetPlan() {
  if (!els.categoryGroups) return;
  const code = currency(state.profile?.default_currency || state.goal?.currency || "NPR");
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(new Date());
  const incomeTotal = monthlyIncomeTotal();
  const assignedTotal = categoryBudgetTotal();
  const selected = findCategory();

  els.budgetMonth.textContent = monthLabel;
  els.incomeTotalValue.textContent = money(incomeTotal, code);
  els.assignedLine.textContent = `${money(assignedTotal, code)} assigned`;

  els.categoryGroups.innerHTML = state.categoryBudgets.map((group) => `
    <section class="category-group">
      <div class="category-group-title">${escapeHtml(group.name)}</div>
      ${group.categories.map((category) => `
        <article class="category-row ${category.id === state.selectedCategoryId ? "active" : ""}" data-category-row="${escapeAttr(category.id)}" tabindex="0">
          <div class="category-name">
            <span class="category-icon">${escapeHtml(category.icon)}</span>
            <div>
              <strong>${escapeHtml(category.label)}</strong>
              <small>${escapeHtml(group.name)}</small>
            </div>
          </div>
          <span class="category-amount">${money(category.amount, code)}</span>
          <input data-category-slider="${escapeAttr(category.id)}" type="range" min="0" max="${categorySliderMax(category)}" step="500" value="${Number(category.amount || 0)}" aria-label="${escapeAttr(category.label)} target">
        </article>
      `).join("")}
    </section>
  `).join("");

  renderTargetPanel(selected, code);
  renderStatsBreakdown(code);
}

function renderTargetPanel(category, code) {
  if (!category || !els.targetSlider) return;
  const spent = categorySpent(category);
  const amount = Number(category.amount || 0);
  const remaining = Math.max(amount - spent, 0);
  const progress = amount ? pct((spent / amount) * 100) : 0;

  els.targetTitle.textContent = category.label;
  els.targetGroup.textContent = category.group;
  els.targetIcon.textContent = category.icon;
  els.targetAmountValue.textContent = money(amount, code);
  els.targetHint.textContent = `${category.group} target`;
  els.targetSlider.max = String(categorySliderMax(category));
  els.targetSlider.value = String(amount);
  els.targetSpentValue.textContent = money(spent, code);
  els.targetRemainingValue.textContent = money(remaining, code);
  els.targetProgressBar.style.width = `${progress}%`;
}

function renderStatsBreakdown(code = currency(state.profile?.default_currency || state.goal?.currency || "NPR")) {
  if (!els.statsCategoryList) return;
  const budget = categoryBudgetTotal();
  const expense = currentExpenseTotal();
  const remaining = Math.max(budget - expense, 0);

  els.statsBudgetStatus.textContent = `${money(remaining, code)} left`;
  els.statsCategoryList.innerHTML = allCategories().map((category) => {
    const spent = categorySpent(category);
    const progress = category.amount ? pct((spent / Number(category.amount)) * 100) : 0;
    return `
      <div class="stats-category-row">
        <strong>${escapeHtml(category.label)}</strong>
        <span>${money(spent, code)} / ${money(category.amount, code)}</span>
        <div class="progress"><span style="width:${progress}%"></span></div>
      </div>
    `;
  }).join("");
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
  switchView("stats");
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
  const code = currency(report?.currency || state.profile?.default_currency || state.goal?.currency || "NPR");
  els.metricSpent.textContent = report ? money(report.total_spent, code) : "-";
  els.metricFlexible.textContent = report ? money(report.flexible_spent, code) : "-";
  els.metricProtected.textContent = report ? money(report.protected_amount, code) : "-";
  els.metricStreak.textContent = state.streak ? `${state.streak.current_count} ${state.streak.current_count === 1 ? "day" : "days"}` : "-";
  if (report) {
    els.reportInsight.textContent = report.insight;
    els.reportAchievement.textContent = report.achievement;
  } else {
    els.reportInsight.textContent = "Your report will appear after you close the day.";
    els.reportAchievement.textContent = "";
  }
  renderFinanceRings();
}

function renderFinanceRings() {
  const code = currency(state.report?.currency || state.profile?.default_currency || state.goal?.currency || "NPR");
  const budget = categoryBudgetTotal();
  const expense = currentExpenseTotal();
  const remaining = Math.max(budget - expense, 0);
  const expensePercent = budget ? pct((expense / budget) * 100) : 0;
  const remainingPercent = budget ? pct((remaining / budget) * 100) : 0;
  const budgetPercent = budget ? 100 : 0;

  if (els.locationLine) els.locationLine.textContent = displayLocation();
  setAppleRing(els.captureRings, { budget: budgetPercent, expense: expensePercent, remaining: remainingPercent });
  setAppleRing(els.statsRings, { budget: budgetPercent, expense: expensePercent, remaining: remainingPercent });

  if (els.ringCenterValue) els.ringCenterValue.textContent = money(budget, code);
  if (els.statsCenterValue) els.statsCenterValue.textContent = money(remaining, code);
  if (els.budgetValue) els.budgetValue.textContent = money(budget, code);
  if (els.expenseValue) els.expenseValue.textContent = money(expense, code);
  if (els.remainingValue) els.remainingValue.textContent = money(remaining, code);

  renderStatsBreakdown(code);
}

function setAppleRing(element, values) {
  if (!element) return;
  element.style.setProperty("--budget-ring-value", `${pct(values.budget)}%`);
  element.style.setProperty("--expense-ring-value", `${pct(values.expense)}%`);
  element.style.setProperty("--remaining-ring-value", `${pct(values.remaining)}%`);
}

function renderAll() {
  renderSession();
  renderBudgetPlan();
  renderGoal();
  renderIncomeSources();
  renderRecurringExpenses();
  renderDrafts();
  renderConfirmations();
  renderReport();
  renderNudge();
  renderFinanceRings();
}

function switchView(view) {
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  $$(".view").forEach((item) => item.classList.toggle("active", item.id === `view-${view}`));
  const titles = {
    capture: "Smart Capture",
    money: "Expense and Income",
    review: "Nightly Review",
    stats: "Stats",
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
  els.categoryGroups.addEventListener("click", (event) => {
    const row = event.target.closest("[data-category-row]");
    if (!row) return;
    state.selectedCategoryId = row.dataset.categoryRow;
    renderBudgetPlan();
  });
  els.categoryGroups.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("[data-category-row]");
    if (!row) return;
    event.preventDefault();
    state.selectedCategoryId = row.dataset.categoryRow;
    renderBudgetPlan();
  });
  els.categoryGroups.addEventListener("input", (event) => {
    const id = event.target?.dataset?.categorySlider;
    if (id) updateCategoryAmount(id, event.target.value);
  });
  els.targetSlider.addEventListener("input", (event) => {
    updateCategoryAmount(state.selectedCategoryId, event.target.value);
  });
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
state.categoryBudgets = loadCategoryBudgets();
bindEvents();
renderAll();
loadSession().catch((error) => showAlert(error.message || "Could not load session.", "error"));
window.addEventListener("load", () => {
  if (window.lucide) window.lucide.createIcons();
});
