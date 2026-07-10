import { errorResponse, handleCors, HttpError, jsonResponse, readJson } from "../_shared/cors.ts";
import { normalizeCurrency } from "../_shared/models.ts";
import { parseTransactionWithAi } from "../_shared/openai.ts";
import { requireAuth } from "../_shared/supabase.ts";

type InboundEmailRequest = {
  from?: string;
  subject?: string;
  text: string;
  source_reference?: string;
  default_currency?: string;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { userId, userClient } = await requireAuth(req);
    const body = await readJson<InboundEmailRequest>(req);

    if (!body.text?.trim()) {
      throw new HttpError(400, "text is required.");
    }

    const { parsed, model } = await parseTransactionWithAi(
      `${body.subject ? `Subject: ${body.subject}\n` : ""}${body.text}`,
      body.default_currency ?? "NPR",
    );

    const { data, error } = await userClient
      .from("smart_capture_drafts")
      .insert({
        user_id: userId,
        source: "forwarded_email",
        raw_text: body.text,
        raw_subject: body.subject ?? null,
        source_reference: body.source_reference ?? body.from ?? null,
        parsed_amount: parsed.amount,
        parsed_currency: parsed.amount ? normalizeCurrency(parsed.currency, body.default_currency ?? "NPR") : parsed.currency,
        parsed_merchant: parsed.merchant,
        parsed_category: parsed.category,
        parsed_kind: parsed.transaction_type,
        parsed_necessity: parsed.necessity,
        parsed_payment_method: parsed.payment_method,
        parsed_occurred_at: parsed.occurred_at,
        confidence: parsed.confidence,
        needs_review: true,
        ai_notes: parsed.notes,
        model,
      })
      .select("*")
      .single();

    if (error) throw new HttpError(500, "Failed to create inbound email draft.", error);

    await userClient.from("capture_events").insert({
      user_id: userId,
      source: "forwarded_email",
      draft_id: data.id,
      event_name: "inbound_email_draft_created",
      metadata: {
        from: body.from ?? null,
        subject: body.subject ?? null,
        model,
      },
    });

    return jsonResponse({
      draft: data,
      notification_copy: "Possible transaction found. Review tonight?",
      delivery: "authenticated_import",
    });
  } catch (error) {
    return errorResponse(error);
  }
});
