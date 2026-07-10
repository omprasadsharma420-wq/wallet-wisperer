import { errorResponse, handleCors, HttpError, jsonResponse, readJson } from "../_shared/cors.ts";
import { asNumber, money } from "../_shared/calculations.ts";
import { dayBoundsUtc, todayInTimeZone } from "../_shared/dates.ts";
import { generateReportWithAi } from "../_shared/openai.ts";
import { requireAuth } from "../_shared/supabase.ts";

type CloseDayRequest = {
  report_date?: string;
  timezone?: string;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { userId, userClient } = await requireAuth(req);
    const body = await readJson<CloseDayRequest>(req);

    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("default_currency, timezone")
      .eq("id", userId)
      .single();

    if (profileError) throw new HttpError(500, "Failed to load profile.", profileError);

    const timezone = body.timezone ?? profile.timezone ?? "Asia/Katmandu";
    const reportDate = body.report_date ?? todayInTimeZone(timezone);
    const { startIso, endIso } = dayBoundsUtc(reportDate, timezone);

    const { data: goal, error: goalError } = await userClient
      .from("goals")
      .select("id,name,target_amount,currency,current_saved_amount")
      .eq("is_active", true)
      .maybeSingle();

    if (goalError) throw new HttpError(500, "Failed to load active goal.", goalError);

    const { data: transactions, error: txError } = await userClient
      .from("transactions")
      .select("*")
      .gte("occurred_at", startIso)
      .lt("occurred_at", endIso);

    if (txError) throw new HttpError(500, "Failed to load transactions.", txError);

    const { data: drafts, error: draftError } = await userClient
      .from("smart_capture_drafts")
      .select("id")
      .eq("status", "draft")
      .gte("created_at", startIso)
      .lt("created_at", endIso);

    if (draftError) throw new HttpError(500, "Failed to load draft count.", draftError);

    const expenses = (transactions ?? []).filter((tx) => tx.kind === "expense" && !tx.is_skipped_opportunity);
    const protectedTransactions = (transactions ?? []).filter((tx) => tx.is_skipped_opportunity);
    const totalSpent = money(expenses.reduce((sum, tx) => sum + asNumber(tx.amount), 0));
    const flexibleSpent = money(expenses.filter((tx) => tx.necessity === "flexible").reduce((sum, tx) => sum + asNumber(tx.amount), 0));
    const neededSpent = money(expenses.filter((tx) => tx.necessity === "needed").reduce((sum, tx) => sum + asNumber(tx.amount), 0));
    const fixedSpent = money(expenses.filter((tx) => tx.necessity === "fixed").reduce((sum, tx) => sum + asNumber(tx.amount), 0));
    const protectedAmount = money(protectedTransactions.reduce((sum, tx) => sum + asNumber(tx.amount), 0));
    const goalDeltaPercent = goal?.target_amount
      ? Number(((flexibleSpent - protectedAmount) / asNumber(goal.target_amount) * 100).toFixed(4))
      : 0;

    const { data: streak } = await userClient
      .from("streaks")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const previousDate = streak?.last_active_date ? new Date(`${streak.last_active_date}T00:00:00Z`) : null;
    const currentDate = new Date(`${reportDate}T00:00:00Z`);
    const dayDiff = previousDate
      ? Math.round((currentDate.getTime() - previousDate.getTime()) / (24 * 60 * 60_000))
      : null;

    let currentCount = streak?.current_count ?? 0;
    let freezesAvailable = streak?.freezes_available ?? 1;

    if (dayDiff === 0) {
      currentCount = Math.max(1, currentCount);
    } else if (dayDiff === 1 || dayDiff === null) {
      currentCount = currentCount + 1;
    } else if (dayDiff === 2 && freezesAvailable > 0) {
      freezesAvailable -= 1;
      currentCount = currentCount + 1;
    } else {
      currentCount = 1;
    }

    const longestCount = Math.max(streak?.longest_count ?? 0, currentCount);

    const { summary, model } = await generateReportWithAi({
      goalName: goal?.name ?? null,
      currency: profile.default_currency ?? goal?.currency ?? "NPR",
      totalSpent,
      flexibleSpent,
      neededSpent,
      fixedSpent,
      protectedAmount,
      goalDeltaPercent,
      confirmedCount: transactions?.length ?? 0,
      streakCount: currentCount,
    });

    const { data: report, error: reportError } = await userClient
      .from("daily_reports")
      .upsert({
        user_id: userId,
        goal_id: goal?.id ?? null,
        report_date: reportDate,
        currency: profile.default_currency ?? goal?.currency ?? "NPR",
        total_spent: totalSpent,
        flexible_spent: flexibleSpent,
        needed_spent: neededSpent,
        fixed_spent: fixedSpent,
        protected_amount: protectedAmount,
        draft_count: drafts?.length ?? 0,
        confirmed_count: transactions?.length ?? 0,
        goal_delta_percent: goalDeltaPercent,
        insight: summary.insight,
        achievement: summary.achievement,
        mood: summary.mood,
      }, { onConflict: "user_id,report_date" })
      .select("*")
      .single();

    if (reportError) throw new HttpError(500, "Failed to save daily report.", reportError);

    const { error: streakError } = await userClient
      .from("streaks")
      .upsert({
        user_id: userId,
        current_count: currentCount,
        longest_count: longestCount,
        freezes_available: freezesAvailable,
        last_active_date: reportDate,
      }, { onConflict: "user_id" });

    if (streakError) throw new HttpError(500, "Failed to update streak.", streakError);

    await userClient.from("capture_events").insert({
      user_id: userId,
      source: "manual",
      event_name: "day_closed",
      metadata: {
        report_date: reportDate,
        report_id: report.id,
        model,
        pending_drafts: drafts?.length ?? 0,
      },
    });

    return jsonResponse({
      report,
      streak: {
        current_count: currentCount,
        longest_count: longestCount,
        freezes_available: freezesAvailable,
      },
      pending_drafts: drafts?.length ?? 0,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
