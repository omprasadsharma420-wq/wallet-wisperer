import {
  clampConfidence,
  Necessity,
  normalizeCurrency,
  ParsedTransaction,
  PaymentMethod,
  TransactionKind,
} from "./models.ts";

const categoryRules: Array<{ category: string; necessity: Necessity; pattern: RegExp }> = [
  { category: "Food/Groceries", necessity: "flexible", pattern: /\b(momo|coffee|cafe|snack|restaurant|pizza|burger|tea|lunch|dinner|grocery|groceries|food)\b/i },
  { category: "Transport", necessity: "needed", pattern: /\b(bus|taxi|ride|uber|pathao|indrive|fuel|petrol|transport)\b/i },
  { category: "Rent/Mortgage", necessity: "fixed", pattern: /\b(rent|mortgage|apartment|landlord)\b/i },
  { category: "Utilities", necessity: "fixed", pattern: /\b(electricity|electric|water|internet|wifi|phone|utility|utilities|bill)\b/i },
  { category: "Subscriptions", necessity: "fixed", pattern: /\b(subscription|netflix|spotify|prime|gym|plan|software|saas)\b/i },
  { category: "Shopping", necessity: "flexible", pattern: /\b(shop|shopping|shirt|clothes|daraz|amazon|market)\b/i },
  { category: "Health", necessity: "needed", pattern: /\b(medicine|doctor|hospital|clinic|pharmacy)\b/i },
  { category: "Education", necessity: "needed", pattern: /\b(course|book|tuition|school|college)\b/i },
  { category: "Income", necessity: "unknown", pattern: /\b(received|credited|salary|freelance|paid to you|deposit)\b/i },
];

function weakLabel(value: string | null | undefined): boolean {
  return !value || /^(unknown|uncategorized|transaction|payment|expense)$/i.test(value.trim());
}

function keywordMerchant(rawText: string, fallback: string): string {
  const lowered = rawText.toLowerCase();
  const keywords = [
    "rent", "mortgage", "internet", "wifi", "phone", "electricity", "water",
    "netflix", "spotify", "subscription", "momo", "coffee", "groceries",
    "grocery", "taxi", "bus", "fuel", "medicine", "pharmacy",
  ];
  return keywords.find((keyword) => lowered.includes(keyword)) || fallback;
}

export function applyDeterministicCorrections(
  rawText: string,
  parsed: ParsedTransaction,
  defaultCurrency = "NPR",
): ParsedTransaction {
  const text = rawText.trim();
  const incomeLike = /\b(received|credited|salary|income|deposit|freelance|refund|paid to you)\b/i.test(text);
  const matchedRule = incomeLike ? categoryRules.find((rule) => rule.category === "Income") : categoryRules.find((rule) => rule.pattern.test(text));
  if (!matchedRule) return parsed;

  const corrected: ParsedTransaction = { ...parsed };
  corrected.currency = normalizeCurrency(corrected.currency, defaultCurrency);

  if (incomeLike) {
    corrected.transaction_type = "income";
    corrected.category = "Income";
    corrected.necessity = "unknown";
  } else {
    corrected.transaction_type = corrected.transaction_type === "transfer" ? "transfer" : "expense";
    corrected.category = matchedRule.category;
    corrected.necessity = corrected.transaction_type === "expense" ? matchedRule.necessity : "unknown";
  }

  if (weakLabel(corrected.merchant)) {
    corrected.merchant = keywordMerchant(text, corrected.category);
  }

  corrected.confidence = clampConfidence(Math.max(Number(corrected.confidence || 0), 0.9));
  corrected.needs_review = true;
  corrected.notes = corrected.notes
    ? `${corrected.notes} Category checked against Wallet Whisperer rules.`
    : "Category checked against Wallet Whisperer rules. Please review before confirming.";

  return corrected;
}

export function parseTransactionHeuristically(rawText: string, defaultCurrency = "NPR"): ParsedTransaction {
  const text = rawText.trim();
  const amountMatch = text.match(/(?:NPR|NRS|Rs\.?|\$|USD|INR)?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s*(?:NPR|NRS|Rs\.?|\$|USD|INR)?/i);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : null;
  const currency = normalizeCurrency(text.match(/NPR|NRS|Rs\.?|\$|USD|INR/i)?.[0], defaultCurrency);
  const lowered = text.toLowerCase();

  let transactionType: TransactionKind = "expense";
  if (/\b(received|credited|salary|income|deposit|freelance|refund)\b/i.test(text)) {
    transactionType = "income";
  } else if (/\b(transfer|moved)\b/i.test(text)) {
    transactionType = "transfer";
  }

  let paymentMethod: PaymentMethod = "unknown";
  if (/\b(cash)\b/i.test(text)) paymentMethod = "cash";
  if (/\b(card|visa|mastercard|debit|credit)\b/i.test(text)) paymentMethod = "card";
  if (/\b(wallet|esewa|khalti|fonepay|gpay|google pay|apple pay)\b/i.test(text)) paymentMethod = "wallet";
  if (/\b(bank|account|upi|transfer)\b/i.test(text)) paymentMethod = "bank_transfer";

  const matchedRule = categoryRules.find((rule) => rule.pattern.test(text));
  const category = transactionType === "income" ? "Income" : matchedRule?.category ?? "Uncategorized";
  const necessity = transactionType === "expense" ? matchedRule?.necessity ?? "unknown" : "unknown";

  const words = text
    .replace(amountMatch?.[0] ?? "", "")
    .replace(/\b(paid|spent|sent|at|to|for|via|using|received|credited|from|npr|rs|usd|inr)\b/gi, "")
    .replace(/[^\w\s.-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const merchant = words.slice(0, 4).join(" ") || category;

  const confidence = clampConfidence(
    (amount ? 0.45 : 0.1) +
      (matchedRule ? 0.2 : 0) +
      (paymentMethod !== "unknown" ? 0.15 : 0) +
      (merchant ? 0.1 : 0),
  );

  return applyDeterministicCorrections(text, {
    amount,
    currency,
    merchant,
    category,
    transaction_type: transactionType,
    necessity,
    payment_method: paymentMethod,
    occurred_at: null,
    confidence,
    needs_review: confidence < 0.9 || !amount,
    notes: lowered.length > 160
      ? "Parsed from a longer message; please confirm merchant/category."
      : "Parsed locally without OpenAI because no API key was available or fallback was requested.",
  }, defaultCurrency);
}
