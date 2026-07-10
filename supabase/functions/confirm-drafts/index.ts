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
};

type ConfirmDraftsRequest = {
  confirm_ids?: string[];
  ignore_ids?: string[];
  edits?: Record<string, ConfirmEdit>;
};

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

    if (confirmIds.length > 0) {
      const { data: drafts, error: draftError } = await userClient
        .from("smart_capture_drafts")
        .select("*")
        .in("id", confirmIds)
        .eq("status", "draft");

      if (draftError) throw new HttpError(500, "Failed to load drafts.", draftError);

      const transactions = (drafts ?? []).map((draft) => {
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
      },
    });

    return jsonResponse({
      confirmed_transactions: confirmedTransactions,
      ignored_ids: ignoreIds,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
