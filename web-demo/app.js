import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_URL = "https://lzbtttgggoxumbcjqqsu.supabase.co";
const DEFAULT_PUBLIC_KEY = "sb_publishable_v5pAWpqrnyLyEMlNeaZPAg_4xah6LqS";
const CATEGORY_STORAGE_KEY = "ww_category_targets";
const AUTOFILE_STORAGE_KEY = "ww_autofile_bills";
const PLACEHOLDER_EXAMPLES = ["250 momo", "rent 4000", "skipped coffee 150", "paste your bank SMS here"];

const CURRENCIES = [
  { code: "NPR", name: "Nepalese Rupee" },
  { code: "USD", name: "US Dollar" },
  { code: "INR", name: "Indian Rupee" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "AED", name: "UAE Dirham" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "CNY", name: "Chinese Yuan" },
];

const FALLBACK_TIMEZONES = [
  "Asia/Kathmandu", "Asia/Kolkata", "Asia/Dhaka", "Asia/Dubai", "Asia/Singapore",
  "Asia/Tokyo", "Asia/Shanghai", "Asia/Hong_Kong", "Australia/Sydney",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Moscow",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Sao_Paulo", "Africa/Cairo", "Africa/Johannesburg", "Pacific/Auckland",
  "UTC",
];

function timezoneList() {
  try {
    if (typeof Intl.supportedValuesOf === "function") return Intl.supportedValuesOf("timeZone");
  } catch (_error) {
    // fall through to the curated list
  }
  return FALLBACK_TIMEZONES;
}

const SLIDER_RAW_MAX = 1000;
const SLIDER_AMOUNT_MAX = 1_000_000_000;

function amountToRaw(amount) {
  const value = Math.max(0, Number(amount) || 0);
  if (value <= 0) return 0;
  const raw = (Math.log10(Math.min(value, SLIDER_AMOUNT_MAX)) / Math.log10(SLIDER_AMOUNT_MAX)) * SLIDER_RAW_MAX;
  return Math.max(0, Math.min(SLIDER_RAW_MAX, Math.round(raw)));
}

function rawToAmount(raw) {
  const value = Math.max(0, Math.min(SLIDER_RAW_MAX, Number(raw) || 0));
  if (value <= 0) return 0;
  const amount = Math.pow(10, (value / SLIDER_RAW_MAX) * Math.log10(SLIDER_AMOUNT_MAX));
  const step = amount < 1000 ? 10 : amount < 100_000 ? 100 : 1000;
  return Math.round(amount / step) * step;
}

function sliderFillPercent(amount) {
  return `${((amountToRaw(amount) / SLIDER_RAW_MAX) * 100).toFixed(1)}%`;
}

function trimDecimal(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function compactAmount(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${trimDecimal(n / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `${trimDecimal(n / 1_000_000)}M`;
  if (abs >= 10_000) return `${trimDecimal(n / 1_000)}k`;
  return Math.round(n).toLocaleString();
}

function compactMoney(amount, code = "NPR") {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return "-";
  return `${currency(code)} ${compactAmount(amount)}`;
}

const CATEGORY_GROUPS = [
  {
    name: "Bills",
    categories: [
      { id: "rent-mortgage", label: "Rent/Mortgage", icon: "RM", amount: 0 },
      { id: "phone-internet", label: "Phone & Internet", icon: "PI", amount: 0 },
      { id: "utilities", label: "Utilities", icon: "UT", amount: 0 },
    ],
  },
  {
    name: "Needs",
    categories: [
      { id: "groceries", label: "Groceries", icon: "GR", amount: 0 },
      { id: "transportation", label: "Transportation", icon: "TR", amount: 0 },
      { id: "medical-expenses", label: "Medical expenses", icon: "ME", amount: 0 },
      { id: "emergency-fund", label: "Emergency fund", icon: "EF", amount: 0 },
    ],
  },
  {
    name: "Wants",
    categories: [
      { id: "dining-out", label: "Dining out", icon: "DO", amount: 0 },
      { id: "entertainment", label: "Entertainment", icon: "EN", amount: 0 },
      { id: "vacation", label: "Vacation", icon: "VA", amount: 0 },
    ],
  },
];

const EXPENSE_GROUPS = [
  {
    id: "essentials",
    name: "Essentials",
    accent: "mint",
    category: "Essentials",
    subhead: "The things you can't skip.",
    empty: "",
    rows: [
      { slug: "rent-mortgage", label: "Rent/Mortgage", icon: "RM", aliases: /\b(rent|mortgage|house|apartment)\b/i },
      { slug: "food-groceries", label: "Food/Groceries", icon: "FG", aliases: /\b(food|grocery|groceries|rice|vegetable|meal)\b/i },
      { slug: "utilities", label: "Utilities", icon: "UT", aliases: /\b(utility|utilities|electric|water|internet|wifi|bill)\b/i },
      { slug: "transport", label: "Transport", icon: "TR", aliases: /\b(transport|bus|taxi|fuel|petrol|ride)\b/i },
      { slug: "clothing", label: "Clothing", icon: "CL", aliases: /\b(clothing|clothes|shirt|shoes|uniform)\b/i },
    ],
  },
  {
    id: "subscriptions",
    name: "Subscriptions",
    accent: "teal",
    category: "Subscriptions",
    subhead: "The quiet monthly drains.",
    empty: "No subscriptions yet. They're easy to forget, that's the point.",
    rows: [],
  },
  {
    id: "flexible",
    name: "Flexible",
    accent: "info",
    category: "Flexible",
    subhead: "Where your Rival lives.",
    note: "Spending here shows its impact on your goal.",
    empty: "Add custom categories for the spending you want to watch gently.",
    rows: [],
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
  pendingExpenseAmounts: {},
  captureAttachment: null,
  selectedPaymentMethod: null,
  goalPhotoFile: null,
  goalPhotoUrl: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  alert: $("#alert"),
  sessionLabel: $("#sessionLabel"),
  sessionPill: $("#sessionPill"),
  viewTitle: $("#viewTitle"),
  reviewBadge: $("#reviewBadge"),
  nightlyLine: $("#nightlyLine"),
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
  ringCenterLabel: $("#ringCenterLabel"),
  ringCenterHint: $("#ringCenterHint"),
  statsCenterValue: $("#statsCenterValue"),
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
  attachName: $("#attachName"),
  attachClearBtn: $("#attachClearBtn"),
  profileSavedNote: $("#profileSavedNote"),
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

function currencyOptionsHtml(selected = "NPR") {
  const code = currency(selected);
  const known = CURRENCIES.some((item) => item.code === code);
  const list = known ? CURRENCIES : [{ code, name: code }, ...CURRENCIES];
  return list.map((item) => `<option value="${item.code}" ${item.code === code ? "selected" : ""}>${item.code} - ${item.name}</option>`).join("");
}

function populateCurrencySelect(id, selected) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = currencyOptionsHtml(selected);
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
  return defaultCategoryBudgets();
}

function saveCategoryBudgets() {
  localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(state.categoryBudgets));
}

function categoryIdFromLabel(label) {
  const normalized = normalizeText(label);
  const known = allCategories().find((category) => normalized.includes(normalizeText(category.label)) || normalizeText(category.label).includes(normalized));
  if (known) return known.id;
  if (/\b(rent|mortgage)\b/.test(normalized)) return "rent-mortgage";
  if (/\b(phone|internet|wifi)\b/.test(normalized)) return "phone-internet";
  if (/\b(electric|water|utility|utilities)\b/.test(normalized)) return "utilities";
  if (/\b(grocery|groceries|food)\b/.test(normalized)) return "groceries";
  if (/\b(bus|taxi|fuel|transport)\b/.test(normalized)) return "transportation";
  if (/\b(medical|doctor|pharmacy|health)\b/.test(normalized)) return "medical-expenses";
  if (/\b(emergency)\b/.test(normalized)) return "emergency-fund";
  if (/\b(dining|restaurant|coffee|momo)\b/.test(normalized)) return "dining-out";
  if (/\b(entertainment|movie|game)\b/.test(normalized)) return "entertainment";
  if (/\b(vacation|trip|travel)\b/.test(normalized)) return "vacation";
  return "utilities";
}

function syncCategoryBudgetsFromRecurring() {
  state.categoryBudgets = defaultCategoryBudgets();
  for (const item of state.recurringExpenses) {
    const categoryId = categoryIdFromLabel(`${item.category || ""} ${item.label || ""}`);
    for (const group of state.categoryBudgets) {
      const category = group.categories.find((entry) => entry.id === categoryId);
      if (category) category.amount += Number(item.amount || 0);
    }
  }
  const firstFunded = allCategories().find((category) => Number(category.amount) > 0);
  state.selectedCategoryId = firstFunded?.id || "rent-mortgage";
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
      syncCategoryRowDisplay(category, group.name);
      renderFinanceRings();
      return;
    }
  }
}

// Updates the live UI without touching #categoryGroups' innerHTML: rebuilding it
// mid-drag would destroy the exact <input type="range"> the browser has pointer
// capture on, which is what made the slider only respond to discrete clicks.
function syncCategoryRowDisplay(category, groupName) {
  const code = currency(state.profile?.default_currency || state.goal?.currency || "NPR");
  const row = document.querySelector(`[data-category-row="${category.id}"]`);
  if (row) {
    const amountEl = row.querySelector(".category-amount");
    if (amountEl) amountEl.textContent = compactMoney(category.amount, code);
    const sliderEl = row.querySelector(`[data-category-slider="${category.id}"]`);
    if (sliderEl && document.activeElement !== sliderEl) {
      sliderEl.value = String(amountToRaw(category.amount));
      sliderEl.style.setProperty("--fill", sliderFillPercent(category.amount));
    }
    $$(".category-row").forEach((el) => el.classList.toggle("active", el.dataset.categoryRow === category.id));
  }
  renderTargetPanel({ ...category, group: groupName }, code);
}

function categoryBudgetTotal() {
  return committedTotal();
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

function monthlyMultiplier(cadence = "monthly") {
  return {
    weekly: 4,
    biweekly: 2,
    monthly: 1,
    yearly: 1 / 12,
    daily: 30,
  }[cadence] || 1;
}

function monthlyExpenseAmount(item) {
  return Number(item?.amount || 0) * monthlyMultiplier(item?.cadence || "monthly");
}

function committedTotal() {
  return Object.values(expenseGroupTotals()).reduce((total, amount) => total + Number(amount || 0), 0);
}

function groupSpec(groupId) {
  return EXPENSE_GROUPS.find((group) => group.id === groupId) || EXPENSE_GROUPS[0];
}

function classifyRecurringExpense(item) {
  const text = `${item?.category || ""} ${item?.label || ""}`;
  const normalized = normalizeText(text);
  if (/\b(subscription|subscriptions|netflix|spotify|gym|prime|plan|software|saas)\b/.test(normalized)) return "subscriptions";
  if (/\b(flexible|wants|rival|dining|entertainment|vacation|shopping)\b/.test(normalized)) return "flexible";
  return "essentials";
}

function canonicalEssentialFor(item) {
  const spec = groupSpec("essentials");
  const text = `${item?.category || ""} ${item?.label || ""}`;
  return spec.rows.find((row) => row.aliases.test(text)) || null;
}

function expenseRowKey(row) {
  return row.id ? `recurring:${row.id}` : `new:${row.groupId}:${row.slug}`;
}

function buildExpenseGroups() {
  const byGroup = new Map(EXPENSE_GROUPS.map((group) => [group.id, []]));
  const essentials = groupSpec("essentials");
  const essentialRows = new Map(essentials.rows.map((row) => [row.slug, {
    ...row,
    id: null,
    groupId: "essentials",
    category: essentials.category,
    amount: 0,
    currency: state.profile?.default_currency || "NPR",
    cadence: "monthly",
    payment_method: "unknown",
    next_due_date: today(),
  }]));

  for (const item of state.recurringExpenses) {
    const groupId = classifyRecurringExpense(item);
    if (groupId === "essentials") {
      const canonical = canonicalEssentialFor(item);
      if (canonical) {
        essentialRows.set(canonical.slug, {
          ...canonical,
          ...item,
          slug: canonical.slug,
          label: canonical.label,
          groupId,
          category: "Essentials",
          amount: monthlyExpenseAmount(item),
        });
        continue;
      }
    }

    byGroup.get(groupId)?.push({
      id: item.id,
      slug: item.id,
      groupId,
      label: item.label,
      icon: (item.label || "?").slice(0, 1).toUpperCase(),
      amount: monthlyExpenseAmount(item),
      currency: item.currency,
      category: item.category,
      payment_method: item.payment_method,
      next_due_date: item.next_due_date,
      cadence: item.cadence,
    });
  }

  byGroup.set("essentials", Array.from(essentialRows.values()));
  return EXPENSE_GROUPS.map((group) => ({
    ...group,
    rows: (byGroup.get(group.id) || []).map((row) => {
      const key = expenseRowKey(row);
      return state.pendingExpenseAmounts[key] === undefined ? row : { ...row, amount: state.pendingExpenseAmounts[key] };
    }),
  }));
}

function expenseGroupTotals() {
  return buildExpenseGroups().reduce((totals, group) => {
    totals[group.id] = group.rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return totals;
  }, {});
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

function displayLocation() {
  const timezone = state.profile?.timezone || detectedTimezone();
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
  els.sessionLabel.textContent = email ? email.replace(/(.{18}).+(@.*)/, "$1...$2") : "Demo mode";
  els.sessionPill?.classList.toggle("connected", Boolean(email));
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
  refreshCurrencyDefaults();
  if (els.profileSavedNote) els.profileSavedNote.classList.toggle("hidden", !data?.timezone && !data?.default_currency);
}

function detectedTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch (_error) {
    return "UTC";
  }
}

function timezoneOptionsHtml(selected) {
  const zone = selected || detectedTimezone();
  const list = timezoneList();
  const known = list.includes(zone);
  const options = known ? list : [zone, ...list];
  return options.map((tz) => `<option value="${tz}" ${tz === zone ? "selected" : ""}>${tz.replaceAll("_", " ")}</option>`).join("");
}

function refreshCurrencyDefaults() {
  const code = state.profile?.default_currency || "NPR";
  const zone = state.profile?.timezone || detectedTimezone();
  populateCurrencySelect("profileCurrency", code);
  populateCurrencySelect("incomeCurrency", code);
  populateCurrencySelect("recurringCurrency", code);
  const timezoneEl = $("#profileTimezone");
  if (timezoneEl) timezoneEl.innerHTML = timezoneOptionsHtml(zone);
}

async function saveProfileCurrency() {
  const userId = state.session?.user?.id;
  if (!userId) throw new Error("Sign in first.");
  const code = currency($("#profileCurrency").value || "NPR");
  const timezone = $("#profileTimezone").value || detectedTimezone();
  const { error } = await requireClient().from("profiles").update({ default_currency: code, timezone }).eq("id", userId);
  if (error) throw error;
  await loadProfile();
  renderFinanceRings();
  renderBudgetPlan();
  if (els.profileSavedNote) els.profileSavedNote.classList.remove("hidden");
  closeMoneySettingsModal();
  showAlert("Currency and location verified.");
}

async function loadGoal() {
  const { data, error } = await requireClient()
    .from("goals")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  state.goal = data;
  await loadGoalPhotoUrl();
  renderGoal();
}

async function loadGoalPhotoUrl() {
  state.goalPhotoUrl = null;
  if (!state.goal?.photo_path || !state.supabase) return;
  const { data } = await state.supabase.storage
    .from("goal-photos")
    .createSignedUrl(state.goal.photo_path, 3600);
  state.goalPhotoUrl = data?.signedUrl || null;
}

async function uploadGoalPhoto(file) {
  const userId = state.session?.user?.id;
  if (!userId || !file) return null;
  const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/${Date.now()}.${extension}`;
  const { error } = await requireClient().storage
    .from("goal-photos")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
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
  state.pendingExpenseAmounts = {};
  renderRecurringExpenses();
}

async function saveGoal() {
  const userId = state.session?.user?.id;
  if (!userId) throw new Error("Sign in first.");

  const name = ($("#modalGoalName")?.value || $("#goalName")?.value || "").trim();
  const amount = Number($("#modalGoalAmount")?.value || $("#goalAmount")?.value || 0);
  const code = currency($("#modalGoalCurrency")?.value || $("#goalCurrency")?.value || state.profile?.default_currency || "NPR");
  if (!name || !amount) throw new Error("Goal name and target amount are required.");
  const photoPath = state.goalPhotoFile ? await uploadGoalPhoto(state.goalPhotoFile) : ($("#goalPhotoPath")?.value || state.goal?.photo_path || null);

  if (state.goal?.id) {
    const { error } = await requireClient().from("goals").update({ name, target_amount: amount, currency: code, photo_path: photoPath }).eq("id", state.goal.id);
    if (error) throw error;
  } else {
    const { error } = await requireClient().from("goals").insert({
      user_id: userId,
      name,
      target_amount: amount,
      currency: code,
      photo_path: photoPath,
      current_saved_amount: 0,
      is_active: true,
    });
    if (error) throw error;
  }

  await loadGoal();
  closeGoalModal();
  state.goalPhotoFile = null;
  showAlert("Goal saved.");
}

async function saveIncomeSource() {
  const userId = state.session?.user?.id;
  if (!userId) throw new Error("Sign in first.");
  const editingId = $("#incomeModal")?.dataset.editingId || "";
  const label = $("#incomeLabel").value.trim();
  const amount = Number($("#incomeAmount").value);
  if (!label || amount < 0) throw new Error("Income label and amount are required.");

  const payload = {
    label,
    amount,
    currency: currency($("#incomeCurrency").value || state.profile?.default_currency || "NPR"),
    cadence: $("#incomeCadence").value,
    is_active: true,
  };

  const { error } = editingId
    ? await requireClient().from("income_sources").update(payload).eq("id", editingId)
    : await requireClient().from("income_sources").insert({ user_id: userId, ...payload });
  if (error) throw error;
  $("#incomeLabel").value = "";
  $("#incomeAmount").value = "";
  closeIncomeModal();
  await loadIncomeSources();
  showAlert("Income source added.");
}

async function saveRecurringExpense() {
  const userId = state.session?.user?.id;
  if (!userId) throw new Error("Sign in first.");
  const groupId = $("#expenseGroupInput").value || "subscriptions";
  const group = groupSpec(groupId);
  const editingId = $("#expenseModal")?.dataset.editingId || "";
  const label = $("#recurringLabel").value.trim();
  const amount = Number($("#recurringAmount").value);
  if (!label || !amount || amount <= 0) throw new Error("Name and monthly amount are required.");

  const payload = {
    label,
    amount,
    currency: currency($("#recurringCurrency").value || state.profile?.default_currency || "NPR"),
    category: group.category,
    payment_method: $("#recurringMethod").value,
    cadence: "monthly",
    due_day: new Date().getDate(),
    next_due_date: today(),
    is_active: true,
  };

  const { error } = editingId
    ? await requireClient().from("recurring_expenses").update(payload).eq("id", editingId)
    : await requireClient().from("recurring_expenses").insert({ user_id: userId, ...payload });
  if (error) throw error;
  $("#recurringLabel").value = "";
  $("#recurringAmount").value = "";
  closeExpenseModal();
  await loadRecurringExpenses();
  showAlert("Monthly item saved.");
}

async function saveExpenseAmount(rowKey, amount) {
  const userId = state.session?.user?.id;
  if (!userId) throw new Error("Sign in first.");
  const normalizedAmount = Math.max(0, Number(amount) || 0);
  const groups = buildExpenseGroups();
  const row = groups.flatMap((group) => group.rows).find((item) => expenseRowKey(item) === rowKey);
  if (!row) return;

  if (row.id) {
    const { error } = await requireClient()
      .from("recurring_expenses")
      .update({ amount: normalizedAmount, cadence: "monthly", category: groupSpec(row.groupId).category })
      .eq("id", row.id);
    if (error) throw error;
  } else {
    if (normalizedAmount <= 0) return;
    const group = groupSpec(row.groupId);
    const { error } = await requireClient().from("recurring_expenses").insert({
      user_id: userId,
      label: row.label,
      amount: normalizedAmount,
      currency: currency(state.profile?.default_currency || "NPR"),
      category: group.category,
      payment_method: "unknown",
      cadence: "monthly",
      due_day: new Date().getDate(),
      next_due_date: today(),
      is_active: true,
    });
    if (error) throw error;
  }

  await loadRecurringExpenses();
}

async function deleteRecurringExpense(id) {
  if (!id) return;
  const { error } = await requireClient().from("recurring_expenses").update({ is_active: false }).eq("id", id);
  if (error) throw error;
  await loadRecurringExpenses();
  showAlert("Monthly item removed.");
}

async function deleteIncomeSource(id) {
  if (!id) return;
  const { error } = await requireClient().from("income_sources").update({ is_active: false }).eq("id", id);
  if (error) throw error;
  await loadIncomeSources();
  showAlert("Income source removed.");
}

function renderGoal() {
  const goal = state.goal;
  if (!goal) {
    els.goalStatus.textContent = "No active goal";
    els.goalPreview.innerHTML = `
      <div class="goal-empty-card">
        <strong>Choose one thing worth protecting.</strong>
        <p class="draft-meta">Give it a name, a number, and a photo. Flexible spending will show its impact here.</p>
        <button id="openGoalModalInline" type="button"><i data-lucide="target"></i><span>Create Rival goal</span></button>
      </div>
    `;
    $("#openGoalModalInline")?.addEventListener("click", openGoalModal);
    if (window.lucide) window.lucide.createIcons();
    renderFinanceRings();
    return;
  }

  if ($("#goalName")) $("#goalName").value = goal.name || "";
  if ($("#goalAmount")) $("#goalAmount").value = goal.target_amount || "";
  populateCurrencySelect("goalCurrency", goal.currency || "NPR");
  populateCurrencySelect("modalGoalCurrency", goal.currency || state.profile?.default_currency || "NPR");

  const percent = goal.target_amount ? pct((Number(goal.current_saved_amount || 0) / Number(goal.target_amount)) * 100) : 0;
  els.goalStatus.textContent = `${percent.toFixed(1)}% funded`;
  const photo = state.goalPhotoUrl
    ? `<img class="goal-photo" src="${escapeAttr(state.goalPhotoUrl)}" alt="">`
    : `<div class="goal-photo">${escapeHtml((goal.name || "G").slice(0, 1).toUpperCase())}</div>`;
  els.goalPreview.innerHTML = `
    <div class="goal-card">
      ${photo}
      <div class="goal-preview">
        <div class="goal-row"><strong>${escapeHtml(goal.name)}</strong><span>${percent.toFixed(1)}%</span></div>
        <div class="progress"><span style="width:${percent}%"></span></div>
        <div class="draft-meta">${money(goal.current_saved_amount || 0, goal.currency)} protected</div>
      </div>
    </div>
  `;
  renderFinanceRings();
}

function openGoalModal() {
  populateCurrencySelect("modalGoalCurrency", state.profile?.default_currency || state.goal?.currency || "NPR");
  $("#modalGoalName").value = state.goal?.name || "";
  $("#modalGoalAmount").value = state.goal?.target_amount || "";
  $("#modalGoalPhotoName").classList.toggle("hidden", !state.goalPhotoFile);
  $("#goalModal").classList.remove("hidden");
}

function closeGoalModal() {
  $("#goalModal")?.classList.add("hidden");
}

function openMoneySettingsModal() {
  refreshCurrencyDefaults();
  $("#moneySettingsModal").classList.remove("hidden");
}

function closeMoneySettingsModal() {
  $("#moneySettingsModal")?.classList.add("hidden");
}

function openExpenseModal(groupId = "subscriptions", row = null) {
  const group = groupSpec(groupId);
  $("#expenseModal").dataset.editingId = row?.id || "";
  $("#expenseGroupInput").value = group.id;
  $("#expenseModalTitle").textContent = row?.id ? `Edit ${row.label}` : `Add to ${group.name}`;
  $("#recurringLabel").value = row?.id ? row.label || "" : "";
  $("#recurringAmount").value = row?.id ? Number(row.amount || 0) : "";
  $("#recurringMethod").value = row?.payment_method || "unknown";
  populateCurrencySelect("recurringCurrency", row?.currency || state.profile?.default_currency || "NPR");
  $("#expenseModal").classList.remove("hidden");
}

function closeExpenseModal() {
  $("#expenseModal")?.classList.add("hidden");
  if ($("#expenseModal")) $("#expenseModal").dataset.editingId = "";
}

function openIncomeModal(item = null) {
  $("#incomeModal").dataset.editingId = item?.id || "";
  $("#incomeModalTitle").textContent = item?.id ? `Edit ${item.label}` : "Add income source";
  $("#incomeLabel").value = item?.label || "";
  $("#incomeAmount").value = item?.amount ?? "";
  $("#incomeCadence").value = item?.cadence || "monthly";
  populateCurrencySelect("incomeCurrency", item?.currency || state.profile?.default_currency || "NPR");
  $("#incomeModal").classList.remove("hidden");
}

function closeIncomeModal() {
  $("#incomeModal")?.classList.add("hidden");
  if ($("#incomeModal")) $("#incomeModal").dataset.editingId = "";
}

function findExpenseRowByKey(key) {
  return buildExpenseGroups().flatMap((group) => group.rows).find((row) => expenseRowKey(row) === key);
}

function updateExpenseRowLive(key, amount) {
  const rowEl = document.querySelector(`[data-expense-row="${CSS.escape(key)}"]`);
  if (!rowEl) return;
  const row = findExpenseRowByKey(key);
  const code = currency(row?.currency || state.profile?.default_currency || "NPR");
  const numeric = Math.max(0, Number(amount) || 0);
  state.pendingExpenseAmounts[key] = numeric;
  const amountEl = rowEl.querySelector(".expense-row-amount");
  const slider = rowEl.querySelector(`[data-expense-slider="${CSS.escape(key)}"]`);
  const input = rowEl.querySelector(`[data-expense-amount="${CSS.escape(key)}"]`);
  if (amountEl) amountEl.textContent = compactMoney(numeric, code);
  if (slider && document.activeElement !== slider) {
    slider.value = String(amountToRaw(numeric));
    slider.style.setProperty("--fill", sliderFillPercent(numeric));
  }
  if (input && document.activeElement !== input) input.value = String(Math.round(numeric));
  renderCommittedMeter(code);
}

function renderIncomeSources() {
  if (!els.incomeList) return;
  els.incomeList.innerHTML = state.incomeSources.length
    ? state.incomeSources.map((item) => `
      <article class="income-card">
        <div>
          <strong>${escapeHtml(item.label)}</strong>
          <span>${money(item.amount, item.currency)} ${escapeHtml(item.cadence)}</span>
        </div>
        <div class="row-actions">
          <button class="ghost icon-button" type="button" data-income-edit="${escapeAttr(item.id)}" aria-label="Edit ${escapeAttr(item.label)}"><i data-lucide="pencil"></i></button>
          <button class="secondary icon-button" type="button" data-income-delete="${escapeAttr(item.id)}" aria-label="Delete ${escapeAttr(item.label)}"><i data-lucide="trash-2"></i></button>
        </div>
      </article>
    `).join("")
    : "<section class=\"empty-panel\"><p class=\"draft-meta\">Add your first income source: salary, freelance, anything that comes in.</p></section>";
  renderBudgetPlan();
  if (window.lucide) window.lucide.createIcons();
}

function renderRecurringExpenses() {
  syncCategoryBudgetsFromRecurring();
  renderBudgetPlan();
}

function renderBudgetPlan() {
  if (!els.categoryGroups) return;
  const code = currency(state.profile?.default_currency || state.goal?.currency || "NPR");
  const incomeTotal = monthlyIncomeTotal();

  if (els.incomeTotalValue) els.incomeTotalValue.textContent = compactMoney(incomeTotal, code);
  renderCommittedMeter(code);

  els.categoryGroups.innerHTML = buildExpenseGroups().map((group) => {
    const total = group.rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const visibleRows = group.rows.filter((row) => group.id === "essentials" || row.id);
    return `
      <section class="expense-group-card ${group.accent}">
        <header class="expense-group-head">
          <div>
            <h3>${escapeHtml(group.name)}</h3>
            <p>${escapeHtml(group.subhead)}</p>
            ${group.note ? `<small>${escapeHtml(group.note)}</small>` : ""}
          </div>
          <strong>${compactMoney(total, code)}</strong>
        </header>
        <div class="expense-row-list">
          ${visibleRows.length ? visibleRows.map((row) => expenseRowHtml(row, code)).join("") : `<p class="draft-meta">${escapeHtml(group.empty)}</p>`}
        </div>
        <button class="ghost add-expense-btn" type="button" data-add-expense="${escapeAttr(group.id)}"><i data-lucide="plus"></i><span>Add</span></button>
      </section>
    `;
  }).join("");

  renderStatsBreakdown(code);
  if (window.lucide) window.lucide.createIcons();
}

function expenseRowHtml(row, code) {
  const key = expenseRowKey(row);
  const expanded = state.selectedCategoryId === key;
  return `
    <article class="expense-row ${expanded ? "expanded" : ""}" data-expense-row="${escapeAttr(key)}">
      <button class="expense-row-summary" type="button" data-expense-toggle="${escapeAttr(key)}" aria-expanded="${expanded}">
        <span class="category-icon">${escapeHtml(row.icon || "?")}</span>
        <span class="expense-row-name">${escapeHtml(row.label)}</span>
        <strong class="expense-row-amount">${compactMoney(row.amount, row.currency || code)}</strong>
      </button>
      <div class="expense-row-editor">
        <label class="slider-label">
          Monthly amount
          <input data-expense-slider="${escapeAttr(key)}" type="range" min="0" max="${SLIDER_RAW_MAX}" step="1" value="${amountToRaw(row.amount)}" style="--fill:${sliderFillPercent(row.amount)}" aria-label="${escapeAttr(row.label)} monthly amount">
        </label>
        <label>Amount<input data-expense-amount="${escapeAttr(key)}" type="number" min="0" step="1" value="${Number(row.amount || 0)}" aria-label="${escapeAttr(row.label)} amount"></label>
        <button class="secondary" type="button" data-expense-delete="${escapeAttr(row.id || "")}" ${row.id ? "" : "disabled"}><i data-lucide="trash-2"></i><span>Delete</span></button>
      </div>
    </article>
  `;
}

function renderCommittedMeter(code = currency(state.profile?.default_currency || "NPR")) {
  const incomeTotal = monthlyIncomeTotal();
  const committed = committedTotal();
  const totals = expenseGroupTotals();
  const safeIncome = Math.max(incomeTotal, 0);
  const percent = safeIncome ? Math.round((committed / safeIncome) * 100) : 0;
  const capped = safeIncome ? Math.min(100, (committed / safeIncome) * 100) : 0;
  const essentials = safeIncome ? Math.min(capped, (totals.essentials / safeIncome) * 100) : 0;
  const subscriptions = safeIncome ? Math.min(Math.max(capped - essentials, 0), (totals.subscriptions / safeIncome) * 100) : 0;
  const flexible = Math.max(capped - essentials - subscriptions, 0);

  $("#moneySettingsText").textContent = `${code} · ${(state.profile?.timezone || detectedTimezone()).replaceAll("_", " ")}`;
  $("#commitmentFill").style.setProperty("--essentials", `${essentials}%`);
  $("#commitmentFill").style.setProperty("--subscriptions", `${subscriptions}%`);
  $("#commitmentFill").style.setProperty("--flexible", `${flexible}%`);
  $("#commitmentText").textContent = `${money(committed, code)} of ${money(incomeTotal, code)} committed`;
  $("#commitmentHero").classList.toggle("over", safeIncome > 0 && committed > safeIncome);
  $("#commitmentOverflow").classList.toggle("hidden", !(safeIncome > 0 && committed > safeIncome));
  $("#addIncomeInlineBtn").classList.toggle("hidden", safeIncome > 0);
  $("#commitmentSubline").textContent = safeIncome <= 0
    ? "Add an income source to see how your month is shaped."
    : committed > safeIncome
      ? "Your commitments run a little past your income."
      : `${percent}% of your income has a job. The rest is yours to spend or protect.`;
}

function renderStatsBreakdown(code = currency(state.profile?.default_currency || state.goal?.currency || "NPR")) {
  if (!els.statsCategoryList) return;
  const expense = currentExpenseTotal();

  els.statsBudgetStatus.textContent = `${compactMoney(expense, code)} flexible so far`;
  els.statsCategoryList.innerHTML = allCategories().map((category) => {
    const spent = categorySpent(category);
    const progress = category.amount ? pct((spent / Number(category.amount)) * 100) : 0;
    return `
      <div class="stats-category-row">
        <strong>${escapeHtml(category.label)}</strong>
        <span>${compactMoney(category.amount, code)} monthly</span>
        <div class="progress"><span style="width:${progress}%"></span></div>
      </div>
    `;
  }).join("");
}

async function createDraft(source, rawText, subject = null, sourceReference = null) {
  if (!rawText.trim()) throw new Error("Couldn't quite catch that. Try adding an amount, like '250 momo'.");
  const data = await invoke("create-draft", {
    source,
    raw_text: rawText,
    raw_subject: subject,
    source_reference: sourceReference,
    default_currency: state.profile?.default_currency || state.goal?.currency || "NPR",
    payment_method: state.selectedPaymentMethod,
  });
  showAlert("Nice, saved for tonight's review.");
  await nightlyReview(false);
  pulseRing();
  return data;
}

function setCaptureAttachment(file) {
  state.captureAttachment = file || null;
  if (els.attachName) {
    els.attachName.textContent = file ? file.name : "";
    els.attachName.classList.toggle("hidden", !file);
  }
  if (els.attachClearBtn) els.attachClearBtn.classList.toggle("hidden", !file);
}

async function uploadCaptureAttachment(file) {
  const userId = state.session?.user?.id;
  if (!userId) throw new Error("Sign in first.");
  const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/${Date.now()}.${extension}`;
  const { error } = await requireClient().storage
    .from("receipt-uploads")
    .upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}

async function quickLogDraft() {
  const rawTextInput = $("#captureInput").value.trim();
  const file = state.captureAttachment;
  if (!rawTextInput && !file) throw new Error("Couldn't quite catch that. Try adding an amount, like '250 momo'.");

  const sourceReference = file ? await uploadCaptureAttachment(file) : null;
  const rawText = rawTextInput || `Attached ${file.name}. Needs review, no description given.`;

  const data = await createDraft(file ? "screenshot" : "manual", rawText, null, sourceReference);
  $("#captureInput").value = "";
  $("#captureAttachment").value = "";
  setCaptureAttachment(null);
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
    timezone: state.profile?.timezone || detectedTimezone(),
    queue_notification: queueNotification,
  });
  state.drafts = data.drafts || [];
  state.pendingCount = data.pending_count || 0;
  els.nightlyLine.textContent = data.notification?.full_text || "No captured transactions yet.";
  els.reviewLine.textContent = data.notification?.full_text || "Nothing to review yet, log something today and it'll wait for you here.";
  if (els.reviewBadge) {
    els.reviewBadge.textContent = String(state.pendingCount);
    els.reviewBadge.classList.toggle("hidden", state.pendingCount === 0);
  }
  if (data.goal) state.goal = data.goal;
  renderGoal();
  renderNudge(data.notification);
  renderDrafts();
}

async function generateRecurringDrafts({ silent = false } = {}) {
  const data = await invoke("generate-recurring-drafts", {
    due_date: today(),
    timezone: state.profile?.timezone || detectedTimezone(),
  });
  if (!silent) {
    showAlert(`${data.created_count || 0} fixed card${data.created_count === 1 ? "" : "s"} created.`);
    await nightlyReview(false);
  }
  return data;
}

function draftEditValue(id, field) {
  const element = field === "create_recurring"
    ? document.querySelector(`[data-draft="${id}"][data-field="${field}"]:checked`)
    : document.querySelector(`[data-draft="${id}"][data-field="${field}"]`);
  if (!element) return undefined;
  if (field === "amount") return Number(element.value);
  if (field === "is_skipped_opportunity") return element.checked;
  if (field === "create_recurring") return element.value === "true";
  return element.value;
}

function selectedDraftIds() {
  return $$(".draft-select:checked").map((item) => item.value);
}

function isAutoFileBillsEnabled() {
  return localStorage.getItem(AUTOFILE_STORAGE_KEY) !== "false";
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
      create_recurring: Boolean(draftEditValue(id, "create_recurring")),
    };
  }

  const data = await invoke("confirm-drafts", { confirm_ids: ids, edits });
  state.lastConfirmations = data.confirmed_transactions || [];
  renderConfirmations();
  showAlert(data.recurring_count > 0 ? "Rent will be waiting for you next month." : `${ids.length} draft${ids.length === 1 ? "" : "s"} confirmed.`);
  if (data.recurring_count > 0) await loadRecurringExpenses();
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
    timezone: state.profile?.timezone || detectedTimezone(),
  });
  state.report = data.report;
  state.streak = data.streak;
  renderReport();
  switchView("stats");
  showAlert(`Day closed. See you tomorrow.${state.streak?.current_count ? ` ${state.streak.current_count}-day streak.` : ""}`);
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
  if (els.reviewBadge) {
    els.reviewBadge.textContent = String(state.pendingCount || state.drafts.length);
    els.reviewBadge.classList.toggle("hidden", (state.pendingCount || state.drafts.length) === 0);
  }
  if (!state.drafts.length) {
    els.draftList.innerHTML = "<section class=\"panel empty-panel\"><p class=\"draft-meta\">Nothing to review yet, log something today and it'll wait for you here.</p></section>";
    return;
  }

  els.draftList.innerHTML = state.drafts.map((draft) => {
    const amount = draft.parsed_amount ?? "";
    const code = draft.parsed_currency || state.profile?.default_currency || "NPR";
    const title = draft.parsed_merchant || draft.parsed_category || "Possible transaction";
    const confidence = Math.round(Number(draft.confidence || 0) * 100);
    const showRecurringSuggestion = Boolean(draft.suggested_recurring && isAutoFileBillsEnabled());
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
        ${draft.source === "screenshot" && draft.source_reference ? `<div class="receipt-slot" data-receipt="${draft.id}"></div>` : ""}
        ${showRecurringSuggestion ? `
          <div class="bill-suggestion">
            <span class="bill-tag">Bill?</span>
            <label class="recurring-choice"><input data-draft="${draft.id}" data-field="create_recurring" type="radio" name="recurring-${draft.id}" value="false" checked><span>Just this once</span></label>
            <label class="recurring-choice"><input data-draft="${draft.id}" data-field="create_recurring" type="radio" name="recurring-${draft.id}" value="true"><span>Track monthly</span></label>
          </div>
        ` : ""}
        <div class="draft-edit">
          <input data-draft="${draft.id}" data-field="amount" value="${escapeAttr(amount)}" type="number" min="0.01" step="0.01" aria-label="Amount">
          <select data-draft="${draft.id}" data-field="currency" aria-label="Currency">${currencyOptionsHtml(code)}</select>
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
  attachReceiptThumbnails();
}

async function attachReceiptThumbnails() {
  if (!state.supabase) return;
  const candidates = state.drafts.filter((draft) => draft.source === "screenshot" && draft.source_reference);
  await Promise.all(candidates.map(async (draft) => {
    const slot = document.querySelector(`[data-receipt="${draft.id}"]`);
    if (!slot) return;
    const { data } = await state.supabase.storage
      .from("receipt-uploads")
      .createSignedUrl(draft.source_reference, 3600);
    if (!data?.signedUrl) return;
    slot.innerHTML = `<a href="${escapeAttr(data.signedUrl)}" target="_blank" rel="noopener" class="receipt-link"><i data-lucide="paperclip"></i><span>Attached photo</span></a>`;
    if (window.lucide) window.lucide.createIcons();
  }));
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
  const confirmedCount = state.lastConfirmations.length;
  const pendingCount = state.pendingCount || state.drafts.length;
  const closedToday = Boolean(state.report?.report_date === today() || state.report?.date === today());
  const closePercent = closedToday ? 100 : confirmedCount + pendingCount > 0 ? pct((confirmedCount / (confirmedCount + pendingCount)) * 100) : 0;
  const goalPercentValue = state.goal?.target_amount ? pct((Number(state.goal.current_saved_amount || 0) / Number(state.goal.target_amount)) * 100) : 0;
  const pacePercent = state.lastConfirmations.length >= 7 ? pct((currentExpenseTotal() / Math.max(1, categoryBudgetTotal())) * 100) : 0;

  if (els.locationLine) els.locationLine.textContent = displayLocation();
  setAppleRing(els.captureRings, { budget: closePercent, expense: goalPercentValue, remaining: pacePercent });
  setAppleRing(els.statsRings, { budget: closePercent, expense: goalPercentValue, remaining: pacePercent });

  if (els.ringCenterLabel && els.ringCenterValue && els.ringCenterHint) {
    if (pendingCount > 0) {
      els.ringCenterLabel.textContent = String(pendingCount);
      els.ringCenterValue.textContent = "drafts waiting";
      els.ringCenterHint.textContent = "tap to review tonight";
    } else if (closedToday) {
      els.ringCenterLabel.textContent = "Day closed";
      els.ringCenterValue.textContent = "check";
      els.ringCenterHint.textContent = state.streak?.current_count ? `${state.streak.current_count}-day streak` : "see you tomorrow";
    } else if (state.session && state.goal) {
      els.ringCenterLabel.textContent = state.goal.name || "Goal";
      els.ringCenterValue.textContent = `${goalPercentValue.toFixed(0)}% protected`;
      els.ringCenterHint.textContent = "toward it";
    } else {
      els.ringCenterLabel.textContent = "Ready";
      els.ringCenterValue.textContent = "when you are";
      els.ringCenterHint.textContent = "log today's first spend";
    }
  }
  if (els.statsCenterValue) els.statsCenterValue.textContent = closedToday ? "closed" : "today";

  renderStatsBreakdown();
}

function setAppleRing(element, values) {
  if (!element) return;
  element.style.setProperty("--budget-ring-value", `${pct(values.budget)}%`);
  element.style.setProperty("--expense-ring-value", `${pct(values.expense)}%`);
  element.style.setProperty("--remaining-ring-value", `${pct(values.remaining)}%`);
}

function pulseRing() {
  if (!els.captureRings) return;
  els.captureRings.classList.remove("pulse");
  window.requestAnimationFrame(() => {
    els.captureRings.classList.add("pulse");
    window.setTimeout(() => els.captureRings?.classList.remove("pulse"), 700);
  });
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
    money: "",
    review: "Nightly Review",
    stats: "Stats",
  };
  els.viewTitle.textContent = titles[view] ?? "Wallet Whisperer";
}

function switchMoneyTab(tab) {
  $$(".money-tab").forEach((button) => {
    const active = button.dataset.moneyTab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $$(".money-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `money-${tab}`));
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
    const message = error.message || "";
    const friendly = /fetch|network|failed|functions|auth|jwt|supabase/i.test(message)
      ? "Can't reach your data right now. Your text is safe here, try again in a moment."
      : message || "Something needs attention. Please check the highlighted fields and try again.";
    showAlert(friendly, "error");
  }
}

function setupCaptureInteractions() {
  const input = $("#captureInput");
  let placeholderIndex = 0;
  let placeholderPaused = false;
  window.setInterval(() => {
    if (!input || placeholderPaused || input.value) return;
    placeholderIndex = (placeholderIndex + 1) % PLACEHOLDER_EXAMPLES.length;
    input.placeholder = PLACEHOLDER_EXAMPLES[placeholderIndex];
  }, 4000);
  input?.addEventListener("focus", () => { placeholderPaused = true; });
  input?.addEventListener("blur", () => { placeholderPaused = false; });

  const autoFile = $("#autoFileBills");
  if (autoFile) {
    autoFile.checked = isAutoFileBillsEnabled();
    autoFile.addEventListener("change", () => {
      localStorage.setItem(AUTOFILE_STORAGE_KEY, String(autoFile.checked));
      renderDrafts();
    });
  }

  $$(".method-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const method = chip.dataset.paymentMethod;
      state.selectedPaymentMethod = state.selectedPaymentMethod === method ? null : method;
      $$(".method-chip").forEach((item) => item.classList.toggle("selected", item.dataset.paymentMethod === state.selectedPaymentMethod));
    });
  });

  if (new URLSearchParams(window.location.search).get("debug") === "1") {
    $("#parseBtn")?.classList.remove("hidden");
  }
}

function bindEvents() {
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $$(".money-tab").forEach((button) => button.addEventListener("click", () => switchMoneyTab(button.dataset.moneyTab)));
  $("#sessionPill").addEventListener("click", () => {
    if (!state.session) switchView("money");
  });
  $("#captureRings").addEventListener("click", () => {
    if (state.pendingCount > 0) switchView("review");
  });
  $("#captureRings").addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && state.pendingCount > 0) {
      event.preventDefault();
      switchView("review");
    }
  });
  $("#saveConfigBtn").addEventListener("click", () => guard(saveConfig));
  $("#signInBtn").addEventListener("click", () => guard(signIn));
  $("#signUpBtn").addEventListener("click", () => guard(signUp));
  $("#signOutBtn").addEventListener("click", () => guard(signOut));
  $("#saveGoalBtn")?.addEventListener("click", () => guard(saveGoal));
  $("#modalSaveGoalBtn").addEventListener("click", () => guard(saveGoal));
  $("#closeGoalModalBtn").addEventListener("click", closeGoalModal);
  $("#modalGoalPhotoBtn").addEventListener("click", () => $("#modalGoalPhoto").click());
  $("#modalGoalPhoto").addEventListener("change", (event) => {
    state.goalPhotoFile = event.target.files?.[0] || null;
    $("#modalGoalPhotoName").textContent = state.goalPhotoFile?.name || "";
    $("#modalGoalPhotoName").classList.toggle("hidden", !state.goalPhotoFile);
  });
  $("#moneySettingsPill").addEventListener("click", openMoneySettingsModal);
  $("#closeMoneySettingsBtn").addEventListener("click", closeMoneySettingsModal);
  $("#addIncomeBtn").addEventListener("click", () => openIncomeModal());
  $("#addIncomeInlineBtn").addEventListener("click", () => openIncomeModal());
  $("#closeIncomeModalBtn").addEventListener("click", closeIncomeModal);
  $("#closeExpenseModalBtn").addEventListener("click", closeExpenseModal);
  $("#saveProfileBtn").addEventListener("click", () => guard(saveProfileCurrency));
  $("#saveIncomeBtn").addEventListener("click", () => guard(saveIncomeSource));
  $("#saveRecurringBtn").addEventListener("click", () => guard(saveRecurringExpense));
  $("#parseBtn").addEventListener("click", () => guard(parsePreview));
  $("#createDraftBtn").addEventListener("click", () => guard(quickLogDraft));
  $("#attachBtn").addEventListener("click", () => $("#captureAttachment").click());
  $("#captureAttachment").addEventListener("change", (event) => setCaptureAttachment(event.target.files?.[0] || null));
  $("#attachClearBtn").addEventListener("click", () => {
    $("#captureAttachment").value = "";
    setCaptureAttachment(null);
  });
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
    const addButton = event.target.closest("[data-add-expense]");
    if (addButton) {
      openExpenseModal(addButton.dataset.addExpense);
      return;
    }

    const deleteButton = event.target.closest("[data-expense-delete]");
    if (deleteButton && deleteButton.dataset.expenseDelete) {
      guard(() => deleteRecurringExpense(deleteButton.dataset.expenseDelete));
      return;
    }

    const toggle = event.target.closest("[data-expense-toggle]");
    if (!toggle) return;
    state.selectedCategoryId = state.selectedCategoryId === toggle.dataset.expenseToggle ? "" : toggle.dataset.expenseToggle;
    renderBudgetPlan();
  });
  els.categoryGroups.addEventListener("input", (event) => {
    const sliderKey = event.target?.dataset?.expenseSlider;
    const amountKey = event.target?.dataset?.expenseAmount;
    if (sliderKey) {
      const amount = rawToAmount(event.target.value);
      event.target.style.setProperty("--fill", sliderFillPercent(amount));
      updateExpenseRowLive(sliderKey, amount);
    }
    if (amountKey) {
      updateExpenseRowLive(amountKey, Number(event.target.value));
    }
  });
  els.categoryGroups.addEventListener("change", (event) => {
    const sliderKey = event.target?.dataset?.expenseSlider;
    const amountKey = event.target?.dataset?.expenseAmount;
    const key = sliderKey || amountKey;
    if (!key) return;
    const amount = sliderKey ? rawToAmount(event.target.value) : Number(event.target.value);
    guard(() => saveExpenseAmount(key, amount));
  });
  els.incomeList.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-income-edit]");
    if (editButton) {
      const item = state.incomeSources.find((entry) => entry.id === editButton.dataset.incomeEdit);
      openIncomeModal(item);
      return;
    }
    const deleteButton = event.target.closest("[data-income-delete]");
    if (deleteButton) guard(() => deleteIncomeSource(deleteButton.dataset.incomeDelete));
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
refreshCurrencyDefaults();
populateCurrencySelect("goalCurrency", "NPR");
populateCurrencySelect("modalGoalCurrency", "NPR");
setupCaptureInteractions();
bindEvents();
renderAll();
loadSession().catch((error) => showAlert(error.message || "Could not load session.", "error"));
window.addEventListener("load", () => {
  if (window.lucide) window.lucide.createIcons();
});
