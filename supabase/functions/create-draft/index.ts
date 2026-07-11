import { errorResponse, handleCors, HttpError, jsonResponse, readJson } from "../_shared/cors.ts";
import { normalizeCurrency, transactionSources, TransactionSource } from "../_shared/models.ts";
import { parseTransactionWithAi } from "../_shared/openai.ts";
import { requireAuth } from "../_shared/supabase.ts";

type CreateDraftRequest = {
  source: TransactionSource;
  raw_text: string;
  raw_subject?: string;
  source_reference?: string;
  default_currency?: string;
  payment_method?: "cash" | "card" | "wallet" | "bank_transfer" | "unknown" | null;
  force_heuristic?: boolean;
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

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { userId, userClient } = await requireAuth(req);
    const body = await readJson<CreateDraftRequest>(req);

    if (!transactionSources.includes(body.source)) {
      throw new HttpError(400, "Invalid source.");
    }

    if (!body.raw_text?.trim()) {
      throw new HttpError(400, "raw_text is required.");
    }

    const { parsed, model } = await parseTransactionWithAi(
      body.raw_text,
      body.default_currency ?? "NPR",
      body.force_heuristic ?? false,
    );

    const parsedPaymentMethod = body.payment_method ?? parsed.payment_method;
    let suggestedRecurring = false;
    if (parsed.transaction_type === "expense" && parsed.necessity === "fixed") {
      const { data: recurringRows, error: recurringError } = await userClient
        .from("recurring_expenses")
        .select("label,category")
        .eq("is_active", true);

      if (recurringError) throw new HttpError(500, "Failed to check recurring expenses.", recurringError);

      const candidate = `${parsed.merchant ?? ""} ${parsed.category ?? ""}`;
      suggestedRecurring = !(recurringRows ?? []).some((row) => fuzzyMatches(candidate, `${row.label ?? ""} ${row.category ?? ""}`));
    }

    const { data, error } = await userClient
      .from("smart_capture_drafts")
      .insert({
        user_id: userId,
        source: body.source,
        raw_text: body.raw_text,
        raw_subject: body.raw_subject ?? null,
        source_reference: body.source_reference ?? null,
        parsed_amount: parsed.amount,
        parsed_currency: parsed.amount ? normalizeCurrency(parsed.currency, body.default_currency ?? "NPR") : parsed.currency,
        parsed_merchant: parsed.merchant,
        parsed_category: parsed.category,
        parsed_kind: parsed.transaction_type,
        parsed_necessity: parsed.necessity,
        parsed_payment_method: parsedPaymentMethod,
        parsed_occurred_at: parsed.occurred_at,
        suggested_recurring: suggestedRecurring,
        confidence: parsed.confidence,
        needs_review: parsed.needs_review,
        ai_notes: parsed.notes,
        model,
      })
      .select("*")
      .single();

    if (error) throw new HttpError(500, "Failed to create draft.", error);

    await userClient.from("capture_events").insert({
      user_id: userId,
      source: body.source,
      draft_id: data.id,
      event_name: "draft_created",
      metadata: { model, confidence: parsed.confidence },
    });

    return jsonResponse({ draft: data });
  } catch (error) {
    return errorResponse(error);
  }
});
