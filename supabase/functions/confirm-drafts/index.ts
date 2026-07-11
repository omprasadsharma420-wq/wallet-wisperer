import { errorResponse, handleCors, HttpError, jsonResponse, readJson } from "../_shared/cors.ts";
import { goalPercent } from "../_shared/calculations.ts";
import { requireAuth } from "../_shared/supabase.ts";

type ConfirmEdit = {
  amount?: number;
  currency?: string;
  merchant?: string | null;
  category?: string;
  kind?: "expense" | "income" | "transfer";
  necessity?: "flexible" | "needed" | "fixed" | "unknown";
  payment_method?: "cash" | "card" | "wallet" | "bank_transfer" | "unknown";
  occurred_at?: string;
  note?: string | null;
  is_skipped_opportunity?: boolean;
  create_recurring?: boolean;
};

type ConfirmDraftsRequest = {
  confirm_ids?: string[];
  ignore_ids?: string[];
  edits?: Record<string, ConfirmEdit>;
};

type TransactionInsert = {
  user_id: string;
  draft_id: string;
  goal_id: string | null;
  kind: "expense" | "income" | "transfer";
  amount: number;
  currency: string;
  merchant: string | null;
  category: string;
  necessity: "flexible" | "needed" | "fixed" | "unknown";
  payment_method: "cash" | "card" | "wallet" | "bank_transfer" | "unknown";
  occurred_at: string;
  note: string | null;
  is_skipped_opportunity: boolean;
  goal_percent: number | null;
};

function normalizeLabel(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function fuzzyMatches(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = normalizeLabel(left);
  const b = normalizeLabel(right);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const aTokens = new Set(a.split(" ").filter((token) => token.length > 2));
  const bTokens = b.split(" ").filter((token) => token.length > 2);
  if (aTokens.size === 0 || bTokens.length === 0) return false;
  const overlap = bTokens.filter((token) => aTokens.has(token)).length;
  return overlap / Math.max(aTokens.size, bTokens.length) >= 0.6;
}

function sameDayNextMonth(isoValue: string): string {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  const day = date.getUTCDate();
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { userId, userClient } = await requireAuth(req);
    const body = await readJson<ConfirmDraftsRequest>(req);
    const confirmIds = body.confirm_ids ?? [];
    const ignoreIds = body.ignore_ids ?? [];

    if (confirmIds.length === 0 && ignoreIds.length === 0) {
      throw new HttpError(400, "Provide confirm_ids or ignore_ids.");
    }

    const { data: goal, error: goalError } = await userClient
      .from("goals")
      .select("id,name,target_amount,currency")
      .eq("is_active", true)
      .maybeSingle();

    if (goalError) throw new HttpError(500, "Failed to load active goal.", goalError);

    let confirmedTransactions: unknown[] = [];
    let recurringCount = 0;

    if (confirmIds.length > 0) {
      const { data: drafts, error: draftError } = await userClient
        .from("smart_capture_drafts")
        .select("*")
        .in("id", confirmIds)
        .eq("status", "draft");

      if (draftError) throw new HttpError(500, "Failed to load drafts.", draftError);

      const transactions: TransactionInsert[] = (drafts ?? []).map((draft) => {
        const edit = body.edits?.[draft.id] ?? {};
        const amount = Number(edit.amount ?? draft.parsed_amount);

        if (!amount || amount <= 0) {
          throw new HttpError(400, `Draft ${draft.id} needs a positive amount before confirmation.`);
        }

        const kind = edit.kind ?? draft.parsed_kind ?? "expense";
        const necessity = edit.necessity ?? draft.parsed_necessity ?? "unknown";
        const isSkippedOpportunity = edit.is_skipped_opportunity ?? false;
        const shouldCalculateGoal = kind === "expense" && (necessity === "flexible" || isSkippedOpportunity);

        return {
          user_id: userId,
          draft_id: draft.id,
          goal_id: shouldCalculateGoal ? goal?.id ?? null : null,
          kind,
          amount,
          currency: edit.currency ?? draft.parsed_currency ?? goal?.currency ?? "NPR",
          merchant: edit.merchant ?? draft.parsed_merchant ?? null,
          category: edit.category ?? draft.parsed_category ?? "Uncategorized",
          necessity,
          payment_method: edit.payment_method ?? draft.parsed_payment_method ?? "unknown",
          occurred_at: edit.occurred_at ?? draft.parsed_occurred_at ?? new Date().toISOString(),
          note: edit.note ?? null,
          is_skipped_opportunity: isSkippedOpportunity,
          goal_percent: shouldCalculateGoal ? goalPercent(amount, goal) : null,
        };
      });

      if (transactions.length > 0) {
        const { data, error } = await userClient
          .from("transactions")
          .insert(transactions)
          .select("*");

        if (error) throw new HttpError(500, "Failed to confirm transactions.", error);
        confirmedTransactions = data ?? [];
      }

      const recurringCandidates = transactions.filter((transaction) => {
        const edit = body.edits?.[transaction.draft_id] ?? {};
        return Boolean(edit.create_recurring) && transaction.kind === "expense" && transaction.amount > 0;
      });

      if (recurringCandidates.length > 0) {
        const { data: existingRows, error: existingError } = await userClient
          .from("recurring_expenses")
          .select("*")
          .eq("is_active", true);

        if (existingError) throw new HttpError(500, "Failed to load recurring expenses.", existingError);

        for (const transaction of recurringCandidates) {
          const label = transaction.merchant || transaction.category || "Monthly bill";
          const existing = (existingRows ?? []).find((row) => fuzzyMatches(`${label} ${transaction.category}`, `${row.label ?? ""} ${row.category ?? ""}`));
          const nextDueDate = sameDayNextMonth(transaction.occurred_at);
          const payload = {
            label,
            amount: transaction.amount,
            currency: transaction.currency,
            category: transaction.category || "Bills",
            payment_method: transaction.payment_method,
            cadence: "monthly",
            due_day: new Date(transaction.occurred_at).getUTCDate(),
            next_due_date: nextDueDate,
          };

          if (existing?.id) {
            const { error: updateRecurringError } = await userClient
              .from("recurring_expenses")
              .update(payload)
              .eq("id", existing.id);
            if (updateRecurringError) throw new HttpError(500, "Failed to update recurring expense.", updateRecurringError);
          } else {
            const { error: insertRecurringError } = await userClient
              .from("recurring_expenses")
              .insert({ user_id: userId, ...payload, is_active: true });
            if (insertRecurringError) throw new HttpError(500, "Failed to create recurring expense.", insertRecurringError);
          }
          recurringCount += 1;
        }
      }

      const { error: updateError } = await userClient
        .from("smart_capture_drafts")
        .update({ status: "confirmed", needs_review: false })
        .in("id", confirmIds);

      if (updateError) throw new HttpError(500, "Failed to update confirmed draft statuses.", updateError);
    }

    if (ignoreIds.length > 0) {
      const { error: ignoreError } = await userClient
        .from("smart_capture_drafts")
        .update({ status: "ignored", needs_review: false })
        .in("id", ignoreIds);

      if (ignoreError) throw new HttpError(500, "Failed to ignore drafts.", ignoreError);
    }

    await userClient.from("capture_events").insert({
      user_id: userId,
      source: "manual",
      event_name: "drafts_reviewed",
      metadata: {
        confirmed_count: confirmIds.length,
        ignored_count: ignoreIds.length,
        recurring_count: recurringCount,
      },
    });

    return jsonResponse({
      confirmed_transactions: confirmedTransactions,
      ignored_ids: ignoreIds,
      recurring_count: recurringCount,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
