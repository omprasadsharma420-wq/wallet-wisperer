import { errorResponse, handleCors, jsonResponse, readJson } from "../_shared/cors.ts";
import { generateReportWithAi } from "../_shared/openai.ts";
import { requireAuth } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    await requireAuth(req);
    const body = await readJson<{
      goalName?: string | null;
      currency?: string;
      totalSpent?: number;
      flexibleSpent?: number;
      neededSpent?: number;
      fixedSpent?: number;
      protectedAmount?: number;
      goalDeltaPercent?: number;
      confirmedCount?: number;
      streakCount?: number;
    }>(req);

    const { summary, model } = await generateReportWithAi({
      goalName: body.goalName ?? null,
      currency: body.currency ?? "NPR",
      totalSpent: body.totalSpent ?? 0,
      flexibleSpent: body.flexibleSpent ?? 0,
      neededSpent: body.neededSpent ?? 0,
      fixedSpent: body.fixedSpent ?? 0,
      protectedAmount: body.protectedAmount ?? 0,
      goalDeltaPercent: body.goalDeltaPercent ?? 0,
      confirmedCount: body.confirmedCount ?? 0,
      streakCount: body.streakCount ?? 0,
    });

    return jsonResponse({ summary, model });
  } catch (error) {
    return errorResponse(error);
  }
});
