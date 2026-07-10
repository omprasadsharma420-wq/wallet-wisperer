import { errorResponse, handleCors, jsonResponse, readJson } from "../_shared/cors.ts";
import { parseTransactionWithAi } from "../_shared/openai.ts";
import { requireAuth } from "../_shared/supabase.ts";

type ParseRequest = {
  raw_text: string;
  default_currency?: string;
  force_heuristic?: boolean;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    await requireAuth(req);
    const body = await readJson<ParseRequest>(req);

    if (!body.raw_text?.trim()) {
      return jsonResponse({ error: "raw_text is required." }, 400);
    }

    const { parsed, model } = await parseTransactionWithAi(
      body.raw_text,
      body.default_currency ?? "NPR",
      body.force_heuristic ?? false,
    );

    return jsonResponse({ parsed, model });
  } catch (error) {
    return errorResponse(error);
  }
});
