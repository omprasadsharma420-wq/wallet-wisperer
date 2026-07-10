export const transactionKinds = ["expense", "income", "transfer"] as const;
export const transactionSources = ["manual", "paste", "forwarded_email", "screenshot", "notification", "recurring", "demo_seed"] as const;
export const necessityValues = ["flexible", "needed", "fixed", "unknown"] as const;
export const paymentMethods = ["cash", "card", "wallet", "bank_transfer", "unknown"] as const;

export type TransactionKind = typeof transactionKinds[number];
export type TransactionSource = typeof transactionSources[number];
export type Necessity = typeof necessityValues[number];
export type PaymentMethod = typeof paymentMethods[number];

export type ParsedTransaction = {
  amount: number | null;
  currency: string | null;
  merchant: string | null;
  category: string | null;
  transaction_type: TransactionKind;
  necessity: Necessity;
  payment_method: PaymentMethod;
  occurred_at: string | null;
  confidence: number;
  needs_review: boolean;
  notes: string | null;
};

export type ReportSummary = {
  insight: string;
  achievement: string;
  mood: "encouraging" | "neutral" | "caution";
};

export const parsedTransactionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    amount: { type: ["number", "null"], description: "Numeric amount without currency symbols." },
    currency: { type: ["string", "null"], description: "ISO 4217 currency code such as NPR, USD, INR." },
    merchant: { type: ["string", "null"], description: "Merchant, counterparty, or plain-language label." },
    category: { type: ["string", "null"], description: "Short category such as Food, Transport, Income, Bills." },
    transaction_type: { type: "string", enum: transactionKinds },
    necessity: { type: "string", enum: necessityValues },
    payment_method: { type: "string", enum: paymentMethods },
    occurred_at: { type: ["string", "null"], description: "ISO timestamp if present or inferable; otherwise null." },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    needs_review: { type: "boolean" },
    notes: { type: ["string", "null"], description: "Short reason for uncertainty or classification." },
  },
  required: [
    "amount",
    "currency",
    "merchant",
    "category",
    "transaction_type",
    "necessity",
    "payment_method",
    "occurred_at",
    "confidence",
    "needs_review",
    "notes",
  ],
} as const;

export const reportSummarySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    insight: {
      type: "string",
      description: "One gentle, non-shaming sentence about today's spending pattern and the user's goal.",
    },
    achievement: {
      type: "string",
      description: "One short variable reward or streak/protected-money callout.",
    },
    mood: {
      type: "string",
      enum: ["encouraging", "neutral", "caution"],
    },
  },
  required: ["insight", "achievement", "mood"],
} as const;

export function normalizeCurrency(value: string | null | undefined, fallback = "NPR"): string {
  const raw = (value ?? fallback).trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(raw)) return raw;
  if (/RS\.?|NRS|NPR/i.test(value ?? "")) return "NPR";
  if (/\$|USD/i.test(value ?? "")) return "USD";
  if (/INR/i.test(value ?? "")) return "INR";
  return fallback;
}

export function clampConfidence(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0.35;
  return Math.max(0, Math.min(1, value));
}
