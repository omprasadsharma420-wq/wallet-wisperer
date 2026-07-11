import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RUNTIME_CONFIG = globalThis.WALLET_WHISPERER_CONFIG || {};
const DEFAULT_URL = RUNTIME_CONFIG.supabaseUrl || "https://lzbtttgggoxumbcjqqsu.supabase.co";
const DEFAULT_PUBLIC_KEY = RUNTIME_CONFIG.supabaseAnonKey || "sb_publishable_v5pAWpqrnyLyEMlNeaZPAg_4xah6LqS";
const CATEGORY_STORAGE_KEY = "ww_category_targets";
const AUTOFILE_STORAGE_KEY = "ww_autofile_bills";
const CLOSE_DAY_STORAGE_PREFIX = "ww_close_day_";
const GUEST_MODE_STORAGE_KEY = "ww_guest_mode";
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
  closeStage: "invite",
  closeIndex: 0,
  closeDecisions: {},
  closeLastAction: null,
  goalPromptShown: false,
  closeReportInsight: "",
  captureAttachment: null,
  selectedPaymentMethod: null,
  guestMode: localStorage.getItem(GUEST_MODE_STORAGE_KEY) === "true",
  goalPhotoFile: null,
  goalPhotoUrl: null,
  stats: {
    range: "30d",
    loaded: false,
    loading: false,
    dirty: false,
    streak: null,
    dailyReports: [],
    transactions: [],
    charts: {},
  },
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
  closeDayStage: $("#closeDayStage"),
  goalStatus: $("#goalStatus"),
  goalPreview: $("#goalPreview"),
  incomeList: $("#incomeList"),
  recurringList: $("#recurringList"),
  captureRings: $("#captureRings"),
  ringCenterValue: $("#ringCenterValue"),
  ringCenterLabel: $("#ringCenterLabel"),
  ringCenterHint: $("#ringCenterHint"),
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
    url: DEFAULT_URL,
    anon: DEFAULT_PUBLIC_KEY,
  };
}

function initClient() {
  const config = configFromStorage();
  state.supabase = config.url && config.anon ? createClient(config.url, config.anon) : null;
}

function requireClient() {
  if (!state.supabase) throw new Error("App configuration is missing. Please check the deployment settings.");
  return state.supabase;
}

function requireSession() {
  if (state.session?.user?.id) return state.session;
  openAuthModal("Sign in to save and sync your finance data.");
  throw new Error("Sign in to save and sync your finance data.");
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

function weakFinanceLabel(value) {
  return !value || /^(unknown|uncategorized|transaction|payment|expense)$/i.test(String(value).trim());
}

function deterministicDraftHint(draft) {
  const text = `${draft?.raw_text || ""} ${draft?.raw_subject || ""}`.toLowerCase();
  const rules = [
    { pattern: /\b(rent|mortgage|apartment|landlord)\b/i, merchant: "rent", category: "Rent/Mortgage", necessity: "fixed" },
    { pattern: /\b(internet|wifi|phone|electricity|electric|water|utility|utilities|bill)\b/i, merchant: "utilities", category: "Utilities", necessity: "fixed" },
    { pattern: /\b(subscription|netflix|spotify|prime|gym|plan|software|saas)\b/i, merchant: "subscription", category: "Subscriptions", necessity: "fixed" },
    { pattern: /\b(momo|coffee|cafe|snack|restaurant|pizza|burger|tea|lunch|dinner|grocery|groceries|food)\b/i, merchant: "food", category: "Food/Groceries", necessity: "flexible" },
    { pattern: /\b(bus|taxi|ride|uber|pathao|indrive|fuel|petrol|transport)\b/i, merchant: "transport", category: "Transport", necessity: "needed" },
    { pattern: /\b(medicine|doctor|hospital|clinic|pharmacy|health)\b/i, merchant: "health", category: "Health", necessity: "needed" },
    { pattern: /\b(course|book|tuition|school|college|education)\b/i, merchant: "education", category: "Education", necessity: "needed" },
  ];
  return rules.find((rule) => rule.pattern.test(text)) || null;
}

function correctedDraftMerchant(draft) {
  const hint = deterministicDraftHint(draft);
  return weakFinanceLabel(draft?.parsed_merchant) && hint ? hint.merchant : draft?.parsed_merchant;
}

function correctedDraftCategory(draft) {
  const hint = deterministicDraftHint(draft);
  return weakFinanceLabel(draft?.parsed_category) && hint ? hint.category : draft?.parsed_category;
}

function correctedDraftNecessity(draft) {
  const hint = deterministicDraftHint(draft);
  return (draft?.parsed_necessity === "unknown" || !draft?.parsed_necessity) && hint ? hint.necessity : draft?.parsed_necessity;
}

function displayLocation() {
  const timezone = state.profile?.timezone || detectedTimezone();
  const place = timezone.split("/").pop().replaceAll("_", " ").replace("Katmandu", "Kathmandu");
  const localDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: timezone }).format(new Date());
  return `${place} local day, ${localDate}`;
}

async function invoke(name, body = {}) {
  requireSession();
  const { data, error } = await requireClient().functions.invoke(name, { body });
  if (error) throw error;
  return data;
}

async function loadSession() {
  if (!state.supabase) {
    renderSession();
    renderFinanceRings();
    openAuthModal("App configuration is missing. Deployment needs Supabase public config.");
    return;
  }

  const { data } = await state.supabase.auth.getSession();
  state.session = data.session;
  renderSession();

  if (state.session) await runStartupSync({ silent: true });
  else {
    renderFinanceRings();
    if (!state.guestMode) openAuthModal();
  }
}

function renderSession() {
  const email = state.session?.user?.email;
  els.sessionLabel.textContent = email ? email.replace(/(.{18}).+(@.*)/, "$1...$2") : state.guestMode ? "Guest" : "Sign in";
  els.sessionPill?.classList.toggle("connected", Boolean(email));
  els.sessionPill?.classList.toggle("guest", !email && state.guestMode);
  $("#signOutBtn").classList.toggle("hidden", !email);
}

function openAuthModal(message = "Save, sync, and close your day across devices.") {
  const prompt = $("#authPrompt");
  if (prompt) prompt.textContent = message;
  $("#authModal")?.classList.remove("hidden");
  if (window.lucide) window.lucide.createIcons();
}

function closeAuthModal() {
  $("#authModal")?.classList.add("hidden");
}

function setAuthLoading(loading) {
  ["signInBtn", "signUpBtn", "googleSignInBtn", "resetPasswordBtn", "continueGuestBtn"].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.disabled = loading;
  });
}

async function signIn() {
  const email = $("#email").value.trim();
  const password = $("#password").value;
  if (!email || !password) throw new Error("Email and password are required.");
  setAuthLoading(true);
  try {
    const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    state.session = data.session;
    state.guestMode = false;
    localStorage.removeItem(GUEST_MODE_STORAGE_KEY);
    renderSession();
    closeAuthModal();
    await runStartupSync({ silent: false });
    showAlert("Signed in.");
  } finally {
    setAuthLoading(false);
  }
}

async function signUp() {
  const email = $("#email").value.trim();
  const password = $("#password").value;
  const displayName = $("#authName")?.value.trim() || email.split("@")[0];
  if (!email || !password) throw new Error("Email and password are required.");
  setAuthLoading(true);
  try {
    const { data, error } = await requireClient().auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: displayName },
      },
    });
    if (error) throw error;
    state.session = data.session;
    state.guestMode = false;
    localStorage.removeItem(GUEST_MODE_STORAGE_KEY);
    renderSession();
    showAlert(data.session ? "Account created." : "Check your email to verify your account, then sign in.");
    if (data.session) {
      closeAuthModal();
      await runStartupSync({ silent: false });
    }
  } finally {
    setAuthLoading(false);
  }
}

async function signInWithGoogle() {
  setAuthLoading(true);
  try {
    const { error } = await requireClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  } finally {
    setAuthLoading(false);
  }
}

async function resetPassword() {
  const email = $("#email").value.trim();
  if (!email) throw new Error("Add your email first.");
  setAuthLoading(true);
  try {
    const { error } = await requireClient().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw error;
    showAlert("Password reset email sent.");
  } finally {
    setAuthLoading(false);
  }
}

function continueAsGuest() {
  state.guestMode = true;
  localStorage.setItem(GUEST_MODE_STORAGE_KEY, "true");
  closeAuthModal();
  renderSession();
  showAlert("Guest mode is local-only. Sign in before saving or syncing finance data.");
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
    closeStage: "invite",
    closeIndex: 0,
    closeDecisions: {},
    closeLastAction: null,
    goalPhotoFile: null,
    goalPhotoUrl: null,
    stats: {
      range: "30d",
      loaded: false,
      loading: false,
      dirty: false,
      streak: null,
      dailyReports: [],
      transactions: [],
      charts: {},
    },
  });
  state.guestMode = false;
  localStorage.removeItem(GUEST_MODE_STORAGE_KEY);
  renderAll();
  openAuthModal("Signed out. Sign in again or continue as guest.");
}

async function runStartupSync({ silent }) {
  await Promise.all([
    loadProfile(),
    loadGoal(),
    loadIncomeSources(),
    loadRecurringExpenses(),
    loadRecentTransactions(),
    loadTodayReport(),
    loadStreak(),
  ]);
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
  const userId = requireSession().user.id;
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

async function loadRecentTransactions() {
  const since = addDaysDate(new Date(), -30).toISOString();
  const { data, error } = await requireClient()
    .from("transactions")
    .select("*")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  state.lastConfirmations = data || [];
  renderConfirmations();
}

async function loadTodayReport() {
  const { data, error } = await requireClient()
    .from("daily_reports")
    .select("*")
    .eq("report_date", today())
    .maybeSingle();
  if (error) throw error;
  state.report = data || null;
}

async function loadStreak() {
  const { data, error } = await requireClient().from("streaks").select("*").maybeSingle();
  if (error) throw error;
  state.streak = data || null;
}

async function refreshBackendSnapshot({ includeRecurring = false, includeReview = false } = {}) {
  const tasks = [loadGoal(), loadRecentTransactions(), loadTodayReport(), loadStreak()];
  if (includeRecurring) tasks.push(loadRecurringExpenses());
  await Promise.all(tasks);
  if (includeReview) await nightlyReview(false);
  state.stats.dirty = true;
  renderFinanceRings();
  renderBudgetPlan();
  renderNudge();
}

async function saveGoal() {
  const userId = requireSession().user.id;

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
  const userId = requireSession().user.id;
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
  const userId = requireSession().user.id;
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
  const userId = requireSession().user.id;
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
  const userId = requireSession().user.id;
  const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/${Date.now()}.${extension}`;
  const { error } = await requireClient().storage
    .from("receipt-uploads")
    .upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}

async function quickLogDraft() {
  const inputEl = $("#captureInput");
  const rawTextInput = inputEl.value.trim();
  const file = state.captureAttachment;
  if (!rawTextInput && !file) throw new Error("Couldn't quite catch that. Try adding an amount, like '250 momo'.");

  const rawText = rawTextInput || `Attached ${file.name}. Needs review, no description given.`;

  // Clear and celebrate the instant the user clicks — the save happening on the
  // network (create-draft can call OpenAI to parse the text, then nightly-review
  // refreshes the count) used to run BEFORE any of this, so the typed text just
  // sat there for a second or two looking stuck. Roll it back if the save fails.
  inputEl.value = "";
  $("#captureAttachment").value = "";
  setCaptureAttachment(null);
  inputEl.focus();
  showCaptureCelebration((state.pendingCount || 0) + 1);

  try {
    const sourceReference = file ? await uploadCaptureAttachment(file) : null;
    return await createDraft(file ? "screenshot" : "manual", rawText, null, sourceReference);
  } catch (error) {
    hideCaptureCelebration();
    inputEl.value = rawTextInput;
    if (file) setCaptureAttachment(file);
    throw error;
  }
}

// Escalating, never-shaming praise for the running count of clues waiting
// in tonight's Close-the-Day queue. Mirrors Duolingo's combo-feedback
// psychology (immediate reward, rising warmth) using the product's own
// honest number instead of an invented XP score.
function pickCaptureCelebration(count) {
  const n = Math.max(1, count);
  if (n === 1) return { icon: "sparkles", title: "Nice catch.", sub: "1 clue saved for tonight." };
  if (n === 2) return { icon: "sparkles", title: "Two in a row.", sub: `${n} clues saved for tonight.` };
  if (n <= 4) return { icon: "flame", title: "You're on it.", sub: `${n} clues saved for tonight.` };
  if (n <= 6) return { icon: "flame", title: "Look at you go.", sub: `${n} clues saved — tonight's review is going to be good.` };
  return { icon: "trophy", title: "You're on fire today.", sub: `${n} clues saved for tonight.` };
}

let captureCelebrationTimer = null;
function showCaptureCelebration(count) {
  const el = document.getElementById("captureCelebration");
  if (!el) return;
  const { icon, title, sub } = pickCaptureCelebration(count);
  const iconEl = document.getElementById("captureCelebrationIcon");
  const titleEl = document.getElementById("captureCelebrationTitle");
  const subEl = document.getElementById("captureCelebrationSub");
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = sub;
  if (iconEl) {
    iconEl.innerHTML = `<i data-lucide="${icon}"></i>`;
    iconEl.classList.toggle("streak", icon !== "sparkles");
    if (window.lucide) window.lucide.createIcons();
  }

  window.clearTimeout(captureCelebrationTimer);
  el.classList.remove("hidden", "hide");
  void el.offsetWidth; // restart the entrance animation if it's already mid-flight
  el.classList.add("show");

  captureCelebrationTimer = window.setTimeout(() => {
    el.classList.remove("show");
    el.classList.add("hide");
    window.setTimeout(() => el.classList.add("hidden"), 260);
  }, 2400);
}

// Used to cancel an optimistic celebration if the save it was celebrating
// turns out to have failed on the network.
function hideCaptureCelebration() {
  const el = document.getElementById("captureCelebration");
  if (!el) return;
  window.clearTimeout(captureCelebrationTimer);
  el.classList.remove("show", "hide");
  el.classList.add("hidden");
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
  const previousPendingCount = state.pendingCount || 0;
  state.drafts = data.drafts || [];
  state.pendingCount = data.pending_count || 0;
  els.nightlyLine.textContent = data.notification?.full_text || "No captured transactions yet.";
  if (els.reviewLine) els.reviewLine.textContent = data.notification?.full_text || "Nothing to review yet, log something today and it'll wait for you here.";
  if (els.reviewBadge) {
    els.reviewBadge.textContent = String(state.pendingCount);
    els.reviewBadge.classList.toggle("hidden", state.pendingCount === 0);
    if (state.pendingCount > previousPendingCount) bumpReviewBadge();
  }
  if (data.goal) state.goal = data.goal;
  renderGoal();
  renderNudge(data.notification);
  renderDrafts();
}

function bumpReviewBadge() {
  const badge = els.reviewBadge;
  if (!badge) return;
  badge.classList.remove("bump");
  window.requestAnimationFrame(() => {
    badge.classList.add("bump");
    window.setTimeout(() => badge.classList.remove("bump"), 500);
  });
}

function closeDayStorageKey() {
  return `${CLOSE_DAY_STORAGE_PREFIX}${today()}`;
}

function saveCloseProgress() {
  localStorage.setItem(closeDayStorageKey(), JSON.stringify({
    stage: state.closeStage,
    index: state.closeIndex,
    decisions: state.closeDecisions,
  }));
}

function restoreCloseProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(closeDayStorageKey()) || "{}");
    state.closeStage = saved.stage || "invite";
    state.closeIndex = Number(saved.index || 0);
    state.closeDecisions = saved.decisions || {};
  } catch (_error) {
    state.closeStage = "invite";
    state.closeIndex = 0;
    state.closeDecisions = {};
  }
  state.closeIndex = Math.min(Math.max(0, state.closeIndex), Math.max(0, state.drafts.length - 1));
}

async function enterCloseDay() {
  if (state.session) {
    await generateRecurringDrafts({ silent: true });
    await nightlyReview(false);
  }
  restoreCloseProgress();
  renderCloseDayStage();
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
  await refreshBackendSnapshot({ includeRecurring: data.recurring_count > 0, includeReview: true });
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

function renderNudge(notification) {
  if (!state.session || state.pendingCount === 0) {
    els.nudgeBar.classList.add("hidden");
    return;
  }
  els.nudgeCopy.textContent = notification?.full_text || `${state.pendingCount} possible transactions found today. Review tonight?`;
  els.nudgeBar.classList.remove("hidden");
}

function closeDayTally() {
  return Object.values(state.closeDecisions).reduce((totals, decision) => {
    const amount = Number(decision.transaction?.amount || decision.amount || 0);
    if (decision.tag === "skipped") totals.protected += amount;
    else if (decision.tag === "spent" || decision.tag === "needed" || decision.tag === "fixed") totals.spent += amount;
    return totals;
  }, { spent: 0, protected: 0 });
}

function draftTitle(draft) {
  return correctedDraftMerchant(draft) || correctedDraftCategory(draft) || "Possible transaction";
}

function draftSourceLabel(draft) {
  if (correctedDraftNecessity(draft) === "fixed" || draft?.source === "recurring") return "auto-filed bill";
  if (draft?.source === "screenshot") return "receipt";
  if (draft?.source === "manual") return "typed";
  return draft?.source || "captured";
}

function progressDots() {
  return state.drafts.map((draft, index) => {
    const done = Boolean(state.closeDecisions[draft.id]);
    const active = index === state.closeIndex;
    return `<i class="${done ? "done" : ""} ${active ? "active" : ""}"></i>`;
  }).join("");
}

function renderCloseDayStage() {
  if (!els.closeDayStage) return;
  const reviewCount = state.pendingCount ?? state.drafts.length;
  if (els.reviewBadge) {
    els.reviewBadge.textContent = String(reviewCount);
    els.reviewBadge.classList.toggle("hidden", reviewCount === 0);
  }

  if (state.closeStage === "report" && state.report) {
    renderCloseReportStage();
    return;
  }

  if (state.closeStage === "cards" && state.drafts.length) {
    renderCloseCardStage();
    return;
  }

  renderCloseInviteStage();
}

function renderCloseInviteStage() {
  const count = state.drafts.length;
  const streak = state.streak?.current_count ? `${state.streak.current_count}-day streak` : "Start a streak tonight";
  els.closeDayStage.innerHTML = `
    <section class="ritual-card invite-card">
      <span class="ritual-mark"><i data-lucide="${count ? "sparkles" : "moon"}"></i></span>
      <h3>${count ? `${count} ${count === 1 ? "thing" : "things"} happened today.` : "Quiet day."}</h3>
      <p>${count ? "Take 30 seconds to close it out." : "Nothing captured. Log anything you spent, or close out clean."}</p>
      ${count ? "" : `
        <div class="quiet-composer">
          <textarea id="closeQuickInput" placeholder="250 momo"></textarea>
          <button id="closeQuickSaveBtn" class="secondary" type="button"><i data-lucide="plus"></i><span>Add it</span></button>
        </div>
      `}
      <button id="startCloseDayBtn" type="button"><i data-lucide="${count ? "play" : "check"}"></i><span>${count ? "Close today" : "Close out clean"}</span></button>
      <small class="streak-line"><i data-lucide="flame"></i><span>${escapeHtml(streak)}</span></small>
    </section>
  `;
  if (window.lucide) window.lucide.createIcons();
}

function renderCloseCardStage() {
  const draft = state.drafts[state.closeIndex] || state.drafts[0];
  if (!draft) {
    state.closeStage = "invite";
    renderCloseInviteStage();
    return;
  }
  const decision = state.closeDecisions[draft.id];
  const code = draft.parsed_currency || state.profile?.default_currency || "NPR";
  const amount = Number(decision?.amount ?? draft.parsed_amount ?? 0);
  const category = decision?.category ?? correctedDraftCategory(draft) ?? "Uncategorized";
  const isFixed = correctedDraftNecessity(draft) === "fixed" || draft.source === "recurring";
  const tally = closeDayTally();
  els.closeDayStage.innerHTML = `
    <section class="close-flow">
      <div class="close-progress" aria-label="Close the Day progress">${progressDots()}</div>
      <div class="session-summary"><span>Spent ${money(tally.spent, code)}</span><span>Protected ${money(tally.protected, code)}</span></div>
      <article class="ritual-card review-card ${isFixed ? "bill-card" : ""}">
        ${isFixed ? "<span class=\"bill-tag\">Bill</span>" : ""}
        <span class="source-tag">${escapeHtml(draftSourceLabel(draft))}</span>
        <h3>${escapeHtml(draftTitle(draft))}</h3>
        <strong class="card-amount">${money(amount, code)}</strong>
        <div class="inline-edit">
          <label>Amount<input id="cardAmountInput" type="number" min="0" step="0.01" value="${escapeAttr(amount || "")}"></label>
          <label>Category<select id="cardCategoryInput">
            ${["Rent/Mortgage", "Food/Groceries", "Transport", "Utilities", "Bills", "Groceries", "Subscriptions", "Flexible", "Shopping", "Health", "Education", "Uncategorized"].map((item) => option(item, category)).join("")}
          </select></label>
        </div>
        ${decision ? closeDecisionRevealHtml(decision, draft, code) : isFixed ? fixedDecisionButtonsHtml(draft) : decisionButtonsHtml(draft)}
        ${state.closeLastAction?.draftId === draft.id ? "<button id=\"undoCloseActionBtn\" class=\"ghost undo-btn\" type=\"button\"><i data-lucide=\"undo-2\"></i><span>Undo last tap</span></button>" : ""}
      </article>
    </section>
  `;
  if (window.lucide) window.lucide.createIcons();
}

function decisionButtonsHtml(draft) {
  if (draft.suggested_recurring && isAutoFileBillsEnabled()) {
    return `
      <div class="decision-stack">
        <p class="draft-meta">Add '${escapeHtml(draftTitle(draft))}' as a monthly bill?</p>
        <button class="decision-btn" data-close-action="needed" data-create-recurring="true" type="button"><i data-lucide="repeat"></i><span>Track monthly</span></button>
        <button class="decision-btn secondary" data-close-action="needed" data-create-recurring="false" type="button"><i data-lucide="dot"></i><span>Just this once</span></button>
      </div>
    `;
  }
  return `
    <div class="decision-stack">
      <button class="decision-btn" data-close-action="spent" type="button"><i data-lucide="receipt"></i><span>Spent</span></button>
      <button class="decision-btn secondary" data-close-action="needed" type="button"><i data-lucide="shield-check"></i><span>Needed</span></button>
      <button class="decision-btn mint" data-close-action="skipped" type="button"><i data-lucide="piggy-bank"></i><span>Skipped</span></button>
    </div>
  `;
}

function fixedDecisionButtonsHtml(draft) {
  const shouldTrackMonthly = Boolean((draft?.suggested_recurring || correctedDraftNecessity(draft) === "fixed") && isAutoFileBillsEnabled());
  return `
    <div class="decision-stack">
      <button class="decision-btn" data-close-action="fixed" data-create-recurring="${shouldTrackMonthly}" type="button"><i data-lucide="check"></i><span>Confirm</span></button>
    </div>
  `;
}

function closeDecisionRevealHtml(decision, draft, code) {
  const title = draftTitle(draft);
  if (decision.tag === "skipped") {
    const percent = state.goal?.target_amount ? pct((Number(state.goal.current_saved_amount || 0) + Number(decision.amount || 0)) / Number(state.goal.target_amount) * 100) : 0;
    return `
      <div class="decision-reveal protected-reveal">
        <strong>${money(decision.amount, code)} protected.</strong>
        <div class="progress goal-pulse"><span style="width:${percent}%"></span></div>
      </div>
      ${nextCloseButtonHtml()}
    `;
  }
  if (decision.tag === "spent" && decision.transaction?.goal_percent !== null && decision.transaction?.goal_percent !== undefined) {
    return `
      <div class="decision-reveal rival-reveal">
        ${goalThumbHtml()}
        <strong>That's ${Number(decision.transaction.goal_percent).toFixed(1)}% of ${escapeHtml(state.goal?.name || "your goal")}.</strong>
      </div>
      ${nextCloseButtonHtml()}
    `;
  }
  if (decision.tag === "spent" && !state.goal && !state.goalPromptShown) {
    state.goalPromptShown = true;
    return `
      <div class="decision-reveal">
        <button id="openGoalFromCloseBtn" class="ghost" type="button">Set a goal and you'll see what each spend costs you.</button>
      </div>
      ${nextCloseButtonHtml()}
    `;
  }
  return `
    <div class="decision-reveal quiet-reveal">
      <strong>${decision.tag === "fixed" ? `${escapeHtml(title)} confirmed.` : "Logged without goal pressure."}</strong>
    </div>
    ${nextCloseButtonHtml()}
  `;
}

function goalThumbHtml() {
  if (state.goalPhotoUrl) return `<img class="goal-thumb" src="${escapeAttr(state.goalPhotoUrl)}" alt="">`;
  return `<span class="goal-thumb">${escapeHtml((state.goal?.name || "G").slice(0, 1).toUpperCase())}</span>`;
}

function nextCloseButtonHtml() {
  const last = state.closeIndex >= state.drafts.length - 1;
  return `<button id="nextCloseCardBtn" type="button"><span>${last ? "Finish the day" : "Next"}</span><i data-lucide="arrow-right"></i></button>`;
}

async function handleCloseDecision(tag, createRecurring = false) {
  const draft = state.drafts[state.closeIndex];
  if (!draft || state.closeDecisions[draft.id]) return;
  const amount = Number($("#cardAmountInput")?.value || draft.parsed_amount || 0);
  const category = $("#cardCategoryInput")?.value || correctedDraftCategory(draft) || "Uncategorized";
  if (!amount || amount <= 0) throw new Error("Add a positive amount before closing this card.");

  const necessity = tag === "needed" ? "needed" : tag === "fixed" ? "fixed" : "flexible";
  const shouldCreateRecurring = Boolean(createRecurring || (tag === "fixed" && (draft.suggested_recurring || correctedDraftNecessity(draft) === "fixed") && isAutoFileBillsEnabled()));
  const edits = {
    [draft.id]: {
      amount,
      currency: currency(draft.parsed_currency || state.profile?.default_currency || "NPR"),
      merchant: correctedDraftMerchant(draft) || correctedDraftCategory(draft) || "Transaction",
      category,
      kind: draft.parsed_kind || "expense",
      necessity,
      payment_method: draft.parsed_payment_method || "unknown",
      is_skipped_opportunity: tag === "skipped",
      create_recurring: shouldCreateRecurring,
    },
  };

  const data = await invoke("confirm-drafts", { confirm_ids: [draft.id], edits });
  const transaction = data.confirmed_transactions?.[0] || null;
  state.lastConfirmations = [...state.lastConfirmations, ...(transaction ? [transaction] : [])];
  state.closeDecisions[draft.id] = {
    tag,
    amount,
    category,
    transaction,
    recurring_count: data.recurring_count || 0,
  };
  state.closeLastAction = { draftId: draft.id, transactionId: transaction?.id || null };
  state.pendingCount = Math.max(0, state.pendingCount - 1);
  await refreshBackendSnapshot({ includeRecurring: shouldCreateRecurring || data.recurring_count > 0 });
  saveCloseProgress();
  renderCloseDayStage();
}

async function undoCloseAction() {
  const action = state.closeLastAction;
  if (!action?.draftId) return;
  const decision = state.closeDecisions[action.draftId];
  if (action.transactionId) {
    const { error: deleteError } = await requireClient().from("transactions").delete().eq("id", action.transactionId);
    if (deleteError) throw deleteError;
  }
  const { error: draftError } = await requireClient()
    .from("smart_capture_drafts")
    .update({ status: "draft", needs_review: true })
    .eq("id", action.draftId);
  if (draftError) throw draftError;
  delete state.closeDecisions[action.draftId];
  state.closeLastAction = null;
  state.lastConfirmations = state.lastConfirmations.filter((tx) => tx.id !== action.transactionId);
  state.pendingCount += 1;
  if (decision?.recurring_count > 0) await loadRecurringExpenses();
  saveCloseProgress();
  showAlert("Undone. You can choose again.");
  await nightlyReview(false);
  renderCloseDayStage();
}

async function nextCloseCard() {
  if (state.closeIndex < state.drafts.length - 1) {
    state.closeIndex += 1;
    saveCloseProgress();
    renderCloseDayStage();
    return;
  }
  await finishCloseDay();
}

async function finishCloseDay() {
  const data = await invoke("close-day", {
    report_date: today(),
    timezone: state.profile?.timezone || detectedTimezone(),
  });
  state.report = data.report;
  state.streak = data.streak;
  await refreshBackendSnapshot({ includeRecurring: true, includeReview: true });
  state.report = data.report;
  state.streak = data.streak;
  state.closeStage = "report";
  state.closeReportInsight = pickCloseInsight(data.report, data.streak);
  localStorage.removeItem(closeDayStorageKey());
  renderReport();
  renderCloseDayStage();
}

function pickCloseInsight(report, streak) {
  const code = currency(report?.currency || state.profile?.default_currency || state.goal?.currency || "NPR");
  const candidates = [];
  if (state.goal && Number(report?.goal_delta_percent || 0) !== 0) candidates.push({ weight: 3, text: `Today was ${Math.abs(Number(report.goal_delta_percent)).toFixed(1)}% of ${state.goal.name}.` });
  if (Number(report?.protected_amount || 0) > 0) candidates.push({ weight: 4, text: `You protected ${money(report.protected_amount, code)} today.` });
  if (streak?.current_count) candidates.push({ weight: 3, text: `${streak.current_count} days of honest logging.` });
  if (state.lastConfirmations.length >= 7) candidates.push({ weight: 1, text: "A pattern is starting to show. Keep closing the day to make it clearer." });
  candidates.push({ weight: 2, text: report?.insight || "You made today visible." });
  const expanded = candidates.flatMap((item) => Array.from({ length: item.weight }, () => item.text));
  return expanded[Math.floor(Math.random() * expanded.length)] || "You made today visible.";
}

function renderCloseReportStage() {
  const report = state.report;
  const code = currency(report?.currency || state.profile?.default_currency || state.goal?.currency || "NPR");
  const spent = Number(report?.total_spent || 0);
  const protectedAmount = Number(report?.protected_amount || 0);
  const totalLoggedAmount = Number(report?.total_logged_amount ?? (spent + protectedAmount));
  const totalLogMessage = report?.total_log_message || `This is your total amount from the logs you have made today: ${code} ${Math.round(totalLoggedAmount).toLocaleString()}.`;
  const streakCount = state.streak?.current_count || 1;
  const goalPercent = state.goal?.target_amount ? pct((Number(state.goal.current_saved_amount || 0) + protectedAmount) / Number(state.goal.target_amount) * 100) : 0;
  els.closeDayStage.innerHTML = `
    <section class="ritual-card report-card">
      <span class="ritual-mark success"><i data-lucide="check"></i></span>
      <h3>You closed today.</h3>
      <p class="streak-count">${streakCount}-day streak</p>
      <div class="report-figures">
        <div><span>Spent</span><strong>${money(spent, code)}</strong></div>
        <div class="protected-figure"><span>Protected</span><strong>${money(protectedAmount, code)}</strong></div>
      </div>
      ${state.goal ? `
        <div class="goal-movement">
          <span>${escapeHtml(state.goal.name)} is ${Math.abs(Number(report?.goal_delta_percent || 0)).toFixed(1)}% closer.</span>
          <div class="progress goal-pulse"><span style="width:${goalPercent}%"></span></div>
        </div>
      ` : ""}
      <p class="insight-line">${escapeHtml(totalLogMessage)}</p>
      ${state.streak?.freezes_available === 0 ? "<small class=\"draft-meta\">We kept your streak. Everyone misses a day.</small>" : ""}
      <button id="seeTomorrowBtn" type="button"><span>See you tomorrow.</span><i data-lucide="sunrise"></i></button>
    </section>
  `;
  if (window.lucide) window.lucide.createIcons();
}

function renderDrafts() {
  renderCloseDayStage();
  if (!els.draftList) return;
  if (els.reviewBadge) {
    const reviewCount = state.pendingCount ?? state.drafts.length;
    els.reviewBadge.textContent = String(reviewCount);
    els.reviewBadge.classList.toggle("hidden", reviewCount === 0);
  }
  if (!state.drafts.length) {
    els.draftList.innerHTML = "<section class=\"panel empty-panel\"><p class=\"draft-meta\">Nothing to review yet, log something today and it'll wait for you here.</p></section>";
    return;
  }

  els.draftList.innerHTML = state.drafts.map((draft) => {
    const amount = draft.parsed_amount ?? "";
    const code = draft.parsed_currency || state.profile?.default_currency || "NPR";
    const title = correctedDraftMerchant(draft) || correctedDraftCategory(draft) || "Possible transaction";
    const confidence = Math.round(Number(draft.confidence || 0) * 100);
    const showRecurringSuggestion = Boolean((draft.suggested_recurring || correctedDraftNecessity(draft) === "fixed") && isAutoFileBillsEnabled());
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
            necessity: correctedDraftNecessity(draft),
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
          <input data-draft="${draft.id}" data-field="merchant" value="${escapeAttr(correctedDraftMerchant(draft) || "")}" aria-label="Merchant">
          <input data-draft="${draft.id}" data-field="category" value="${escapeAttr(correctedDraftCategory(draft) || "Uncategorized")}" aria-label="Category">
          <select data-draft="${draft.id}" data-field="kind" aria-label="Kind">
            ${option("expense", draft.parsed_kind)}
            ${option("income", draft.parsed_kind)}
            ${option("transfer", draft.parsed_kind)}
          </select>
          <select data-draft="${draft.id}" data-field="necessity" aria-label="Necessity">
            ${option("flexible", correctedDraftNecessity(draft))}
            ${option("needed", correctedDraftNecessity(draft))}
            ${option("fixed", correctedDraftNecessity(draft))}
            ${option("unknown", correctedDraftNecessity(draft))}
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
  if (!els.confirmationPanel) return;
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
  // The old Stats-tab report widgets were removed in the Tab 4 rebuild.
  // Closing a day now shows its report inside Tab 3 (renderCloseReportStage).
  // Here we just refresh the Capture ring and mark the Stats tab for a reload.
  renderFinanceRings();
  state.stats.dirty = true;
  if (isStatsActive()) enterStats();
}

function renderFinanceRings() {
  const confirmedCount = state.lastConfirmations.length;
  const pendingCount = state.pendingCount ?? state.drafts.length;
  const closedToday = Boolean(state.report?.report_date === today() || state.report?.date === today());
  const closePercent = closedToday ? 100 : confirmedCount + pendingCount > 0 ? pct((confirmedCount / (confirmedCount + pendingCount)) * 100) : 0;
  const goalPercentValue = state.goal?.target_amount ? pct((Number(state.goal.current_saved_amount || 0) / Number(state.goal.target_amount)) * 100) : 0;
  const pacePercent = state.lastConfirmations.length >= 7 ? pct((currentExpenseTotal() / Math.max(1, categoryBudgetTotal())) * 100) : 0;

  if (els.locationLine) els.locationLine.textContent = displayLocation();
  setAppleRing(els.captureRings, { budget: closePercent, expense: goalPercentValue, remaining: pacePercent });

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

/* ============================================================
   STATS TAB (Tab 4) — analytics
   Classic encodings, modern execution. All data comes from the
   backend (daily_reports / streaks / transactions / goals) via the
   user-scoped RLS client. The client only aggregates for charts and
   computes the user's own median — it never recomputes streaks or
   goal percentages, so Stats can never disagree with Tab 3.
   ============================================================ */

function statsCurrency() {
  return currency(state.profile?.default_currency || state.goal?.currency || "NPR");
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isStatsActive() {
  return document.getElementById("view-stats")?.classList.contains("active") || false;
}

function statMedian(values) {
  const nums = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (!nums.length) return 0;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function statZone() {
  return state.profile?.timezone || detectedTimezone();
}

// YYYY-MM-DD for a Date in the user's timezone (en-CA formats as ISO date).
function dateKeyInZone(date, tz = statZone()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function dowInZone(date, tz = statZone()) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(date);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[name] ?? 0;
}

function addDaysDate(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function statTodayKey() {
  return dateKeyInZone(new Date());
}

function statRangeStartKey(range = state.stats.range) {
  const today = new Date();
  if (range === "7d") return dateKeyInZone(addDaysDate(today, -6));
  if (range === "month") return `${statTodayKey().slice(0, 7)}-01`;
  return dateKeyInZone(addDaysDate(today, -29)); // 30d default
}

function prettyDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(date);
}

async function loadStatsData() {
  const client = state.supabase;
  if (!client || !state.session) {
    state.stats.loaded = false;
    return;
  }
  state.stats.loading = true;
  try {
    const reportsSince = dateKeyInZone(addDaysDate(new Date(), -110)); // 14 weeks + buffer
    const txSince = addDaysDate(new Date(), -62).toISOString(); // widest chart range + buffer
    const [streakRes, reportsRes, txRes] = await Promise.all([
      client.from("streaks").select("*").maybeSingle(),
      client.from("daily_reports").select("*").gte("report_date", reportsSince).order("report_date", { ascending: true }),
      client
        .from("transactions")
        .select("amount,currency,category,necessity,occurred_at,is_skipped_opportunity,goal_percent,kind")
        .eq("kind", "expense")
        .gte("occurred_at", txSince)
        .order("occurred_at", { ascending: true }),
    ]);
    if (streakRes.error) throw streakRes.error;
    if (reportsRes.error) throw reportsRes.error;
    if (txRes.error) throw txRes.error;
    state.stats.streak = streakRes.data || state.streak || null;
    state.stats.dailyReports = reportsRes.data || [];
    state.stats.transactions = txRes.data || [];
    state.stats.loaded = true;
    state.stats.dirty = false;
  } finally {
    state.stats.loading = false;
  }
}

async function enterStats() {
  if (!isStatsActive()) return;
  try {
    if (state.supabase && state.session && (!state.stats.loaded || state.stats.dirty)) {
      await loadStatsData();
    }
  } catch (error) {
    showAlert(error.message || "Could not load stats.", "error");
  }
  renderStats();
}

function setStatsRange(range) {
  state.stats.range = range;
  $$("#statsRange .stat-range-btn").forEach((btn) => {
    const active = btn.dataset.range === range;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  // Only Sections 2 and 3 respond to the range control.
  renderStatComposition();
  renderStatTrend();
}

function destroyStatChart(key) {
  if (state.stats.charts[key]) {
    state.stats.charts[key].destroy();
    delete state.stats.charts[key];
  }
}

function renderStats() {
  renderStatHero();
  renderStatComposition();
  renderStatTrend();
  renderStatHeatmap();
}

/* --- Section 1: Am I protecting anything? --- */
function renderStatHero() {
  const code = statsCurrency();
  const monthPrefix = statTodayKey().slice(0, 7);
  const monthReports = state.stats.dailyReports.filter((r) => (r.report_date || "").startsWith(monthPrefix));
  const protectedMonth = monthReports.reduce((sum, r) => sum + Number(r.protected_amount || 0), 0);
  const spentMonth = monthReports.reduce((sum, r) => sum + Number(r.total_spent || 0), 0);
  const flexMonth = monthReports.reduce((sum, r) => sum + Number(r.flexible_spent || 0), 0);
  const daysClosed = monthReports.length;
  const goalMovement = Math.max(0, Math.round(monthReports.reduce((sum, r) => sum + Number(r.goal_delta_percent || 0), 0)));

  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  setText("statProtected", money(protectedMonth, code));
  setText("statSpentMonth", spentMonth > 0 ? money(spentMonth, code) : money(0, code));
  setText("statFlexMonth", money(flexMonth, code));
  setText("statDaysClosed", String(daysClosed));

  const goal = state.goal;
  const goalRow = document.getElementById("statGoalRow");
  if (goal && goalRow) {
    goalRow.classList.remove("hidden");
    const goalPct = goal.target_amount ? pct((Number(goal.current_saved_amount || 0) / Number(goal.target_amount)) * 100) : 0;
    const bar = document.getElementById("statGoalBar");
    const thumb = document.getElementById("statGoalThumb");
    setText("statGoalPct", `${Math.round(goalPct)}%`);
    if (thumb) {
      if (state.goalPhotoUrl) {
        thumb.style.backgroundImage = `url("${state.goalPhotoUrl}")`;
        thumb.textContent = "";
      } else {
        thumb.style.backgroundImage = "none";
        thumb.textContent = (goal.name || "G").trim().charAt(0).toUpperCase();
      }
    }
    if (bar) {
      bar.style.width = "0%";
      window.requestAnimationFrame(() => { bar.style.width = `${goalPct}%`; });
    }
  } else if (goalRow) {
    goalRow.classList.add("hidden");
  }

  const sentence = document.getElementById("statProtectedSentence");
  if (sentence) {
    if (!goal) {
      sentence.innerHTML = `Set a goal and every protected rupee starts adding up to something. <button id="statSetGoalBtn" class="link-btn" type="button">Set a goal</button>`;
    } else if (protectedMonth <= 0) {
      sentence.textContent = "Nothing protected yet — skip one thing tonight and it starts here.";
    } else if (goalMovement > 0) {
      sentence.textContent = `${goal.name} is ${goalMovement}% closer than at the start of the month.`;
    } else {
      sentence.textContent = `Every rupee you protect is nudging ${goal.name} closer.`;
    }
  }
}

/* --- Section 2: Where does it actually go? --- */
function renderStatComposition() {
  const code = statsCurrency();
  const startKey = statRangeStartKey();
  const rangeTx = state.stats.transactions.filter((t) => dateKeyInZone(new Date(t.occurred_at)) >= startKey);

  const buckets = { fixed: 0, needed: 0, flexible: 0 };
  const flexByCat = new Map();
  const currencies = new Set();
  for (const t of rangeTx) {
    const amount = Number(t.amount || 0);
    if (t.currency) currencies.add(currency(t.currency));
    if (t.necessity === "fixed") buckets.fixed += amount;
    else if (t.necessity === "needed") buckets.needed += amount;
    else if (t.necessity === "flexible") {
      buckets.flexible += amount;
      const cat = t.category || "Other";
      flexByCat.set(cat, (flexByCat.get(cat) || 0) + amount);
    }
  }
  const total = buckets.fixed + buckets.needed + buckets.flexible;

  const body = document.getElementById("statCompositionBody");
  const flexWrap = document.getElementById("statFlexBarsWrap");
  const empty = document.getElementById("statCompositionEmpty");
  const sentence = document.getElementById("statCompositionSentence");
  const note = document.getElementById("statCurrencyNote");

  const mixedCurrency = currencies.size > 1 || (currencies.size === 1 && !currencies.has(code));
  if (note) note.classList.toggle("hidden", !mixedCurrency);

  if (total <= 0) {
    destroyStatChart("doughnut");
    destroyStatChart("flex");
    if (body) body.classList.add("hidden");
    if (flexWrap) flexWrap.classList.add("hidden");
    if (empty) empty.classList.remove("hidden");
    if (sentence) sentence.textContent = "Close a few days and your money starts telling you things.";
    return;
  }
  if (body) body.classList.remove("hidden");
  if (empty) empty.classList.add("hidden");

  if (sentence) {
    const committedPct = Math.round(((buckets.fixed + buckets.needed) / total) * 100);
    if (buckets.flexible <= 0) {
      sentence.textContent = "All of your spending this range is committed — no flexible spend yet.";
    } else {
      sentence.textContent = `${committedPct}% of your spending is fixed and needed. The ${money(buckets.flexible, code)} in flexible is where your goal lives.`;
    }
  }

  const totalEl = document.getElementById("statDoughnutTotal");
  if (totalEl) totalEl.textContent = compactMoney(total, code);

  const rm = prefersReducedMotion();
  const colors = { fixed: cssVar("--teal-600"), needed: cssVar("--teal-500"), flexible: cssVar("--mint-400") };

  destroyStatChart("doughnut");
  const doughnutCanvas = document.getElementById("statDoughnut");
  if (doughnutCanvas && window.Chart) {
    state.stats.charts.doughnut = new window.Chart(doughnutCanvas, {
      type: "doughnut",
      data: {
        labels: ["Fixed", "Needed", "Flexible"],
        datasets: [{ data: [buckets.fixed, buckets.needed, buckets.flexible], backgroundColor: [colors.fixed, colors.needed, colors.flexible], borderWidth: 0, hoverOffset: 6 }],
      },
      options: {
        cutout: "68%",
        responsive: true,
        maintainAspectRatio: false,
        animation: rm ? false : { duration: 550, easing: "easeOutQuart" },
        transitions: { active: { animation: { duration: 0 } } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => ` ${c.label}: ${money(c.parsed, code)} (${Math.round((c.parsed / total) * 100)}%)` } },
        },
      },
    });
  }

  // Custom HTML legend — label + amount + percentage in text, never colour alone.
  const legend = document.getElementById("statDoughnutLegend");
  if (legend) {
    const rows = [
      { label: "Fixed", value: buckets.fixed, color: colors.fixed },
      { label: "Needed", value: buckets.needed, color: colors.needed },
      { label: "Flexible", value: buckets.flexible, color: colors.flexible },
    ];
    legend.innerHTML = rows
      .map((row) => `<li><span class="stat-legend-dot" style="background:${row.color}"></span><span class="stat-legend-label">${row.label}</span><span class="stat-legend-amt num">${money(row.value, code)}</span><span class="stat-legend-pct num">${Math.round((row.value / total) * 100)}%</span></li>`)
      .join("");
  }

  // Flexible-only bar chart (the spending the user actually has agency over).
  const flexRows = [...flexByCat.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  destroyStatChart("flex");
  if (flexRows.length && flexWrap) {
    flexWrap.classList.remove("hidden");
    const flexCanvasWrap = document.getElementById("statFlexBarsCanvas");
    if (flexCanvasWrap) flexCanvasWrap.style.height = `${flexRows.length * 34 + 16}px`;
    const flexCanvas = document.getElementById("statFlexBars");
    if (flexCanvas && window.Chart) {
      state.stats.charts.flex = new window.Chart(flexCanvas, {
        type: "bar",
        data: { labels: flexRows.map((r) => r.label), datasets: [{ data: flexRows.map((r) => r.value), backgroundColor: cssVar("--mint-400"), borderRadius: 5, borderSkipped: false, barThickness: 18 }] },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          animation: rm ? false : { duration: 550, easing: "easeOutQuart" },
          transitions: { active: { animation: { duration: 0 } } },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${money(c.parsed.x, code)}` } } },
          scales: {
            x: { beginAtZero: true, grid: { color: cssVar("--border-subtle"), drawBorder: false }, ticks: { color: cssVar("--text-muted"), font: { size: 12 }, callback: (v) => compactAmount(v) } },
            y: { grid: { display: false, drawBorder: false }, ticks: { color: cssVar("--text-secondary"), font: { size: 12 } } },
          },
        },
      });
    }
  } else if (flexWrap) {
    flexWrap.classList.add("hidden");
  }
}

/* --- Section 3: Am I getting better? --- */
function renderStatTrend() {
  const code = statsCurrency();
  const reports = state.stats.dailyReports;
  const body = document.getElementById("statTrendBody");
  const empty = document.getElementById("statTrendEmpty");
  const sentence = document.getElementById("statTrendSentence");

  // Needs a week of history overall before a pattern is meaningful.
  if (reports.length < 7) {
    destroyStatChart("trend");
    if (body) body.classList.add("hidden");
    if (empty) empty.classList.remove("hidden");
    if (sentence) sentence.textContent = "Give it a week — your pattern will show up here.";
    return;
  }
  if (body) body.classList.remove("hidden");
  if (empty) empty.classList.add("hidden");

  const reportByDate = new Map(reports.map((r) => [r.report_date, r]));
  const startKey = statRangeStartKey();
  const todayKey = statTodayKey();

  // Build one entry per calendar day in the range.
  const days = [];
  let cursor = new Date(`${startKey}T00:00:00Z`);
  const end = new Date(`${todayKey}T00:00:00Z`);
  while (dateKeyInZone(cursor, "UTC") <= dateKeyInZone(end, "UTC")) {
    const key = dateKeyInZone(cursor, "UTC");
    const report = reportByDate.get(key);
    days.push({ key, closed: Boolean(report), value: report ? Number(report.flexible_spent || 0) : null });
    cursor = addDaysDate(cursor, 1);
  }

  const closedValues = days.filter((d) => d.closed).map((d) => d.value);
  const median = statMedian(closedValues);

  // Sentence: compare the last 7 closed days against the user's own usual (median).
  if (sentence) {
    const recent = days.filter((d) => d.closed).slice(-7).map((d) => d.value);
    const recentAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    if (median > 0 && recent.length) {
      const diff = Math.round(((recentAvg - median) / median) * 100);
      if (diff <= -1) sentence.textContent = `Your flexible spending is trending down — ${Math.abs(diff)}% below your usual this week.`;
      else if (diff >= 1) sentence.textContent = `Your flexible spending is running ${diff}% above your usual this week.`;
      else sentence.textContent = "Your flexible spending is right around your usual this week.";
    } else {
      sentence.textContent = "Your flexible spending pattern is taking shape.";
    }
  }

  const mint = cssVar("--mint-400");
  const grey = "rgba(94, 115, 112, 0.4)"; // --text-muted @ 40%
  const greyBorder = cssVar("--text-secondary");
  const info = cssVar("--info");
  const rm = prefersReducedMotion();

  const colors = days.map((d) => (d.value > 0 ? (d.value <= median ? mint : grey) : "rgba(0,0,0,0)"));
  const borderColors = days.map((d) => (d.value > 0 && d.value > median ? greyBorder : "rgba(0,0,0,0)"));
  const borderWidths = days.map((d) => (d.value > 0 && d.value > median ? 1.5 : 0));

  const step = state.stats.range === "7d" ? 1 : 5;

  // Draws the "Your usual" median line, mint ticks for zero-spend closed days,
  // and faint dotted baselines for days that were never closed.
  const overlay = {
    id: "trendOverlay",
    afterDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.x || !scales.y) return;
      const x = scales.x;
      const y = scales.y;
      const barW = ((chartArea.right - chartArea.left) / days.length) * 0.55;
      ctx.save();
      days.forEach((d, i) => {
        const cx = x.getPixelForValue(i);
        if (d.closed && d.value === 0) {
          ctx.fillStyle = mint;
          ctx.fillRect(cx - barW / 2, chartArea.bottom - 3, barW, 3);
        } else if (!d.closed) {
          ctx.strokeStyle = "rgba(94, 115, 112, 0.35)";
          ctx.lineWidth = 2;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(cx - barW / 2, chartArea.bottom - 1);
          ctx.lineTo(cx + barW / 2, chartArea.bottom - 1);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
      if (median > 0) {
        const yPos = y.getPixelForValue(median);
        ctx.strokeStyle = info;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(chartArea.left, yPos);
        ctx.lineTo(chartArea.right, yPos);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = info;
        ctx.font = "600 11px -apple-system, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText("Your usual", chartArea.left + 4, yPos - 3);
      }
      ctx.restore();
    },
  };

  destroyStatChart("trend");
  const canvas = document.getElementById("statTrend");
  if (canvas && window.Chart) {
    state.stats.charts.trend = new window.Chart(canvas, {
      type: "bar",
      data: {
        labels: days.map((d) => d.key),
        datasets: [{ data: days.map((d) => d.value), backgroundColor: colors, borderColor: borderColors, borderWidth: { top: 0, right: 0, bottom: 0, left: 0 }, borderRadius: 3, maxBarThickness: 30 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: rm ? false : { duration: 550, easing: "easeOutQuart" },
        transitions: { active: { animation: { duration: 0 } } },
        layout: { padding: { top: 18 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: (item) => item.raw != null,
            callbacks: {
              title: (items) => prettyDate(items[0].label),
              label: (c) => (c.parsed.y === 0 ? " No-spend day — nice" : ` ${money(c.parsed.y, code)} flexible`),
            },
          },
        },
        scales: {
          x: { grid: { display: false, drawBorder: false }, ticks: { color: cssVar("--text-muted"), font: { size: 11 }, maxRotation: 0, autoSkip: false, callback: (val, index) => (index % step === 0 ? prettyDate(days[index].key).replace(/^[A-Za-z]+, /, "") : "") } },
          y: { beginAtZero: true, grid: { color: cssVar("--border-subtle"), drawBorder: false }, ticks: { color: cssVar("--text-muted"), font: { size: 12 }, callback: (v) => compactAmount(v) } },
        },
      },
      plugins: [overlay],
    });
    // Per-bar top borders for above-usual days (non-colour signal).
    const ds = state.stats.charts.trend.data.datasets[0];
    ds.borderColor = borderColors;
    ds.borderWidth = borderWidths.map((w) => ({ top: w, right: 0, bottom: 0, left: 0 }));
    ds.borderSkipped = false;
    state.stats.charts.trend.update(rm ? "none" : undefined);
  }
}

/* --- Section 4: Am I showing up? --- */
function renderStatHeatmap() {
  const code = statsCurrency();
  const reports = state.stats.dailyReports;
  const reportByDate = new Map(reports.map((r) => [r.report_date, r]));
  const streakCount = Number(state.stats.streak?.current_count || 0);

  // Median protected across closed days that actually protected something.
  const medProtected = statMedian(reports.map((r) => Number(r.protected_amount || 0)).filter((v) => v > 0));

  const tz = statZone();
  const today = new Date();
  const todayKey = dateKeyInZone(today, tz);
  const rawStart = addDaysDate(today, -(14 * 7 - 1)); // 98 days inclusive
  const startDow = dowInZone(rawStart, tz);
  let gridStart = addDaysDate(rawStart, -startDow); // back to Sunday

  const weeks = [];
  let cursor = gridStart;
  for (let w = 0; w < 15; w += 1) {
    const col = [];
    for (let d = 0; d < 7; d += 1) {
      const key = dateKeyInZone(cursor, tz);
      const isFuture = key > todayKey;
      col.push({ key, isFuture, date: new Date(cursor) });
      cursor = addDaysDate(cursor, 1);
    }
    weeks.push(col);
    if (dateKeyInZone(cursor, tz) > todayKey) break;
  }

  // Display-only grace inference: an isolated missed day bracketed by closed
  // days reads as a kept/frozen day. This never touches the streak number
  // (that stays the backend value), it only annotates the gap.
  const isKeptGap = (key) => {
    if (reportByDate.has(key) || key > todayKey) return false;
    const [y, m, dd] = key.split("-").map(Number);
    const base = new Date(Date.UTC(y, m - 1, dd));
    const prev = dateKeyInZone(addDaysDate(base, -1), "UTC");
    const next = dateKeyInZone(addDaysDate(base, 1), "UTC");
    return reportByDate.has(prev) && reportByDate.has(next);
  };

  const cellClassAndTip = (cell) => {
    if (cell.isFuture) return { cls: "heat-cell future", tip: "" };
    const report = reportByDate.get(cell.key);
    const label = prettyDate(cell.key);
    if (!report) {
      if (isKeptGap(cell.key)) return { cls: "heat-cell freeze", tip: `${label} — Streak kept — everyone misses a day.` };
      return { cls: "heat-cell none", tip: `${label} — not closed` };
    }
    const protectedAmt = Number(report.protected_amount || 0);
    if (protectedAmt <= 0) return { cls: "heat-cell l1", tip: `${label} — closed, nothing protected` };
    if (medProtected > 0 && protectedAmt > medProtected) return { cls: "heat-cell l3", tip: `${label} — closed, ${money(protectedAmt, code)} protected (a strong day)` };
    return { cls: "heat-cell l2", tip: `${label} — closed, ${money(protectedAmt, code)} protected` };
  };

  const weekdayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let lastMonth = -1;
  const monthCells = weeks
    .map((col) => {
      const firstReal = col.find((c) => !c.isFuture) || col[0];
      const month = Number(firstReal.key.split("-")[1]) - 1;
      const dayNum = Number(firstReal.key.split("-")[2]);
      if (month !== lastMonth && dayNum <= 14) {
        lastMonth = month;
        return `<span class="heat-month">${monthNames[month]}</span>`;
      }
      return `<span class="heat-month"></span>`;
    })
    .join("");

  const rm = prefersReducedMotion();
  let cellIndex = 0;
  const cellsHtml = weeks
    .map((col) => col.map((cell) => {
      const { cls, tip } = cellClassAndTip(cell);
      const delay = rm ? 0 : Math.min(cellIndex * 4, 480);
      cellIndex += 1;
      const tipAttr = tip ? ` title="${escapeAttr(tip)}" aria-label="${escapeAttr(tip)}"` : ' aria-hidden="true"';
      return `<div class="${cls}" style="animation-delay:${delay}ms"${tipAttr}></div>`;
    }).join(""))
    .join("");

  const heatmap = document.getElementById("statHeatmap");
  if (heatmap) {
    const cols = weeks.length;
    heatmap.innerHTML = `
      <div class="heat-weekdays">${weekdayLabels.map((l) => `<span>${l}</span>`).join("")}</div>
      <div class="heat-body">
        <div class="heat-months" style="grid-template-columns:repeat(${cols}, var(--heat-cell))">${monthCells}</div>
        <div class="heat-cells" style="grid-template-columns:repeat(${cols}, var(--heat-cell))">${cellsHtml}</div>
      </div>`;
  }

  const last14 = [];
  for (let i = 0; i < 14; i += 1) last14.push(dateKeyInZone(addDaysDate(today, -i), tz));
  const closedIn14 = last14.filter((k) => reportByDate.has(k)).length;
  const heatSentence = document.getElementById("statHeatSentence");
  if (heatSentence) {
    if (reports.length === 0) heatSentence.textContent = "Close your first day and your streak starts here.";
    else heatSentence.textContent = `You've closed ${closedIn14} of the last 14 days.${streakCount > 0 ? ` Currently on a ${streakCount}-day streak.` : ""}`;
  }

  const streakLine = document.getElementById("statStreakLine");
  if (streakLine) {
    streakLine.innerHTML = streakCount > 0
      ? `<strong class="num">${streakCount}</strong>-day streak`
      : "Close a day to start a streak.";
  }
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
    review: "Close the Day",
    stats: "Stats",
  };
  els.viewTitle.textContent = titles[view] ?? "Wallet Whisperer";
  if (view === "review") guard(enterCloseDay);
  if (view === "stats") enterStats();
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
    if (/sign in|password|email|credential|oauth|provider|verification|verify/i.test(message)) {
      showAlert(message, "error");
      return;
    }
    const friendly = /fetch|network|failed|functions|jwt|supabase/i.test(message)
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
    if (!state.session) openAuthModal();
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
  $("#signInBtn").addEventListener("click", () => guard(signIn));
  $("#signUpBtn").addEventListener("click", () => guard(signUp));
  $("#googleSignInBtn").addEventListener("click", () => guard(signInWithGoogle));
  $("#resetPasswordBtn").addEventListener("click", () => guard(resetPassword));
  $("#continueGuestBtn").addEventListener("click", continueAsGuest);
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
  $("#statsRange")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-range]");
    if (!btn || btn.dataset.range === state.stats.range) return;
    setStatsRange(btn.dataset.range);
  });
  $("#statProtectedSentence")?.addEventListener("click", (event) => {
    if (event.target.closest("#statSetGoalBtn")) openGoalModal();
  });
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
      const id = deleteButton.dataset.expenseDelete;
      const item = state.recurringExpenses.find((entry) => entry.id === id);
      if (window.confirm(`Remove ${item?.label || "this monthly item"}? You can add it back anytime.`)) {
        guard(() => deleteRecurringExpense(id));
      }
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
    if (deleteButton) {
      const id = deleteButton.dataset.incomeDelete;
      const item = state.incomeSources.find((entry) => entry.id === id);
      if (window.confirm(`Remove ${item?.label || "this income source"}? You can add it back anytime.`)) {
        guard(() => deleteIncomeSource(id));
      }
    }
  });
  els.closeDayStage?.addEventListener("click", (event) => {
    const start = event.target.closest("#startCloseDayBtn");
    if (start) {
      if (state.drafts.length) {
        state.closeStage = "cards";
        state.closeIndex = 0;
        saveCloseProgress();
        renderCloseDayStage();
      } else {
        guard(finishCloseDay);
      }
      return;
    }
    const quickSave = event.target.closest("#closeQuickSaveBtn");
    if (quickSave) {
      guard(async () => {
        const text = $("#closeQuickInput").value.trim();
        if (!text) throw new Error("Add a money clue first.");
        await createDraft("manual", text);
        await enterCloseDay();
        state.closeStage = "cards";
        state.closeIndex = Math.max(0, state.drafts.length - 1);
        saveCloseProgress();
        renderCloseDayStage();
      });
      return;
    }
    const decision = event.target.closest("[data-close-action]");
    if (decision) {
      guard(() => handleCloseDecision(decision.dataset.closeAction, decision.dataset.createRecurring === "true"));
      return;
    }
    if (event.target.closest("#nextCloseCardBtn")) {
      guard(nextCloseCard);
      return;
    }
    if (event.target.closest("#undoCloseActionBtn")) {
      guard(undoCloseAction);
      return;
    }
    if (event.target.closest("#openGoalFromCloseBtn")) {
      openGoalModal();
      return;
    }
    if (event.target.closest("#seeTomorrowBtn")) {
      switchView("capture");
    }
  });
  els.draftList?.addEventListener("input", (event) => {
    const id = event.target?.dataset?.draft;
    if (id) updateDraftTradeoff(id);
  });
  els.draftList?.addEventListener("change", (event) => {
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
