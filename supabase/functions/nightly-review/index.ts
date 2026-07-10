import { errorResponse, handleCors, HttpError, jsonResponse, readJson } from "../_shared/cors.ts";
import { dayBoundsUtc, todayInTimeZone } from "../_shared/dates.ts";
import { requireAuth } from "../_shared/supabase.ts";

type NightlyReviewRequest = {
  review_date?: string;
  timezone?: string;
  queue_notification?: boolean;
};

function buildNotificationCopy(pendingCount: number): { title: string; body: string } {
  if (pendingCount === 0) {
    return {
      title: "Close today",
      body: "No captured transactions yet. Add anything you remember in 30 seconds.",
    };
  }

  if (pendingCount === 1) {
    return {
      title: "1 possible transaction found",
      body: "Review tonight?",
    };
  }

  return {
    title: `${pendingCount} possible transactions found today`,
    body: "Review tonight?",
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { userId, userClient } = await requireAuth(req);
    const body = await readJson<NightlyReviewRequest>(req);

    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("default_currency, timezone, close_day_time")
      .eq("id", userId)
      .single();

    if (profileError) throw new HttpError(500, "Failed to load profile.", profileError);

    const timezone = body.timezone ?? profile.timezone ?? "Asia/Katmandu";
    const reviewDate = body.review_date ?? todayInTimeZone(timezone);
    const { startIso, endIso } = dayBoundsUtc(reviewDate, timezone);

    const { data: drafts, error: draftError } = await userClient
      .from("smart_capture_drafts")
      .select("*")
      .eq("status", "draft")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: true });

    if (draftError) throw new HttpError(500, "Failed to load pending drafts.", draftError);

    const { data: goal, error: goalError } = await userClient
      .from("goals")
      .select("id,name,target_amount,currency,current_saved_amount,photo_path")
      .eq("is_active", true)
      .maybeSingle();

    if (goalError) throw new HttpError(500, "Failed to load active goal.", goalError);

    const pendingCount = drafts?.length ?? 0;
    const notification = buildNotificationCopy(pendingCount);

    let notificationId: string | null = null;
    if (body.queue_notification) {
      const { data: queued, error: queueError } = await userClient
        .from("notification_queue")
        .insert({
          user_id: userId,
          kind: "nightly_review",
          title: notification.title,
          body: notification.body,
          scheduled_for: new Date().toISOString(),
          metadata: {
            review_date: reviewDate,
            pending_count: pendingCount,
          },
        })
        .select("id")
        .single();

      if (queueError) throw new HttpError(500, "Failed to queue nightly notification.", queueError);
      notificationId = queued.id;
    }

    await userClient.from("capture_events").insert({
      user_id: userId,
      source: "manual",
      event_name: "nightly_review_loaded",
      metadata: {
        review_date: reviewDate,
        pending_count: pendingCount,
        notification_id: notificationId,
      },
    });

    return jsonResponse({
      review_date: reviewDate,
      timezone,
      close_day_time: profile.close_day_time,
      pending_count: pendingCount,
      notification: {
        ...notification,
        full_text: `${notification.title}. ${notification.body}`,
        id: notificationId,
      },
      goal,
      drafts: drafts ?? [],
    });
  } catch (error) {
    return errorResponse(error);
  }
});
