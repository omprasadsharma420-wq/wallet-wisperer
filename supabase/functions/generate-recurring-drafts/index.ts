import { errorResponse, handleCors, HttpError, jsonResponse, readJson } from "../_shared/cors.ts";
import { todayInTimeZone } from "../_shared/dates.ts";
import { requireAuth } from "../_shared/supabase.ts";

type GenerateRecurringRequest = {
  due_date?: string;
  timezone?: string;
};

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function addMonths(date: string, months: number, dueDay?: number | null): string {
  const value = new Date(`${date}T00:00:00Z`);
  const targetDay = dueDay ?? value.getUTCDate();
  value.setUTCMonth(value.getUTCMonth() + months, 1);
  const lastDay = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  value.setUTCDate(Math.min(targetDay, lastDay));
  return value.toISOString().slice(0, 10);
}

function nextDueDate(current: string, cadence: string, dueDay?: number | null): string {
  switch (cadence.toLowerCase()) {
    case "daily":
      return addDays(current, 1);
    case "weekly":
      return addDays(current, 7);
    case "biweekly":
      return addDays(current, 14);
    case "yearly":
    case "annual":
      return addMonths(current, 12, dueDay);
    case "monthly":
    default:
      return addMonths(current, 1, dueDay);
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { userId, userClient } = await requireAuth(req);
    const body = await readJson<GenerateRecurringRequest>(req);

    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("default_currency, timezone")
      .eq("id", userId)
      .single();

    if (profileError) throw new HttpError(500, "Failed to load profile.", profileError);

    const timezone = body.timezone ?? profile.timezone ?? "Asia/Katmandu";
    const dueDate = body.due_date ?? todayInTimeZone(timezone);

    const { data: recurring, error: recurringError } = await userClient
      .from("recurring_expenses")
      .select("*")
      .eq("is_active", true)
      .lte("next_due_date", dueDate);

    if (recurringError) throw new HttpError(500, "Failed to load recurring expenses.", recurringError);

    const dueItems = recurring ?? [];
    if (dueItems.length === 0) {
      return jsonResponse({
        due_date: dueDate,
        created_count: 0,
        skipped_existing_count: 0,
        drafts: [],
      });
    }

    const references = dueItems.map((item) => `recurring:${item.id}:${dueDate}`);
    const { data: existing, error: existingError } = await userClient
      .from("smart_capture_drafts")
      .select("source_reference")
      .in("source_reference", references);

    if (existingError) throw new HttpError(500, "Failed to check existing recurring drafts.", existingError);

    const existingRefs = new Set((existing ?? []).map((item) => item.source_reference));
    const draftsToInsert = dueItems
      .filter((item) => !existingRefs.has(`recurring:${item.id}:${dueDate}`))
      .map((item) => ({
        user_id: userId,
        source: "recurring",
        raw_text: `Recurring expense: ${item.label} ${item.currency ?? profile.default_currency} ${item.amount}`,
        raw_subject: `${item.label} due`,
        source_reference: `recurring:${item.id}:${dueDate}`,
        parsed_amount: item.amount,
        parsed_currency: item.currency ?? profile.default_currency ?? "NPR",
        parsed_merchant: item.label,
        parsed_category: item.category ?? "Bills",
        parsed_kind: "expense",
        parsed_necessity: "fixed",
        parsed_payment_method: item.payment_method ?? "unknown",
        parsed_occurred_at: `${dueDate}T12:00:00.000Z`,
        confidence: 1,
        needs_review: true,
        ai_notes: "Created from a recurring fixed expense. Confirm once it has actually been paid.",
        model: "recurring-rule-v1",
      }));

    let drafts: unknown[] = [];
    if (draftsToInsert.length > 0) {
      const { data: inserted, error: insertError } = await userClient
        .from("smart_capture_drafts")
        .insert(draftsToInsert)
        .select("*");

      if (insertError) throw new HttpError(500, "Failed to create recurring drafts.", insertError);
      drafts = inserted ?? [];
    }

    for (const item of dueItems) {
      const nextDate = nextDueDate(dueDate, item.cadence ?? "monthly", item.due_day);
      const { error: updateError } = await userClient
        .from("recurring_expenses")
        .update({ next_due_date: nextDate })
        .eq("id", item.id);

      if (updateError) throw new HttpError(500, `Failed to update recurring expense ${item.id}.`, updateError);
    }

    await userClient.from("capture_events").insert({
      user_id: userId,
      source: "recurring",
      event_name: "recurring_drafts_generated",
      metadata: {
        due_date: dueDate,
        created_count: draftsToInsert.length,
        skipped_existing_count: existingRefs.size,
      },
    });

    return jsonResponse({
      due_date: dueDate,
      created_count: draftsToInsert.length,
      skipped_existing_count: existingRefs.size,
      drafts,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
