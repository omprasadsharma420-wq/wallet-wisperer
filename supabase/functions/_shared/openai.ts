import { HttpError } from "./cors.ts";
import { ParsedTransaction, parsedTransactionSchema, ReportSummary, reportSummarySchema } from "./models.ts";
import { applyDeterministicCorrections, parseTransactionHeuristically } from "./heuristic-parser.ts";

type StructuredCallOptions = {
  schemaName: string;
  schema: unknown;
  system: string;
  user: string;
  model?: string;
};

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;

  const parts: string[] = [];
  for (const item of payload?.output ?? []) {
    if (item?.type === "message") {
      for (const content of item.content ?? []) {
        if (typeof content?.text === "string") parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

export async function callOpenAIStructured<T>(options: StructuredCallOptions): Promise<{ value: T; model: string }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const model = options.model ?? Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1-mini";

  if (!apiKey) {
    throw new HttpError(503, "OpenAI API key is not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
      text: {
        format: {
          type: "json_schema",
          name: options.schemaName,
          schema: options.schema,
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new HttpError(response.status, "OpenAI request failed.", errorText.slice(0, 1200));
  }

  const payload = await response.json();
  const outputText = extractOutputText(payload);

  if (!outputText) {
    throw new HttpError(502, "OpenAI returned no structured output.", payload);
  }

  try {
    return {
      value: JSON.parse(outputText) as T,
      model,
    };
  } catch (_error) {
    throw new HttpError(502, "OpenAI structured output was not valid JSON.", outputText);
  }
}

export async function parseTransactionWithAi(
  rawText: string,
  defaultCurrency = "NPR",
  forceHeuristic = false,
): Promise<{ parsed: ParsedTransaction; model: string }> {
  if (forceHeuristic || !Deno.env.get("OPENAI_API_KEY")) {
    return {
      parsed: parseTransactionHeuristically(rawText, defaultCurrency),
      model: "heuristic-v1",
    };
  }

  try {
    const result = await callOpenAIStructured<ParsedTransaction>({
      schemaName: "wallet_whisperer_transaction",
      schema: parsedTransactionSchema,
      system: [
        "You parse transaction clues for Wallet Whisperer.",
        "Return only structured data.",
        "Never assume a transaction is final; mark needs_review true when uncertain.",
        "Classify fixed essentials like rent, utilities, subscriptions as fixed.",
        "Classify transport, medicine, education as needed when context suggests necessity.",
        "Classify snacks, coffee, restaurants, casual shopping, entertainment as flexible.",
        "Use a gentle finance-tracking lens, not a moral judgment.",
      ].join(" "),
      user: `Default currency: ${defaultCurrency}\nTransaction clue:\n${rawText}`,
    });

    return {
      parsed: applyDeterministicCorrections(rawText, result.value, defaultCurrency),
      model: result.model,
    };
  } catch (error) {
    console.error("OpenAI parser failed; using heuristic fallback.", error);
    return {
      parsed: {
        ...parseTransactionHeuristically(rawText, defaultCurrency),
        notes: "OpenAI parsing failed, so Wallet Whisperer used local fallback parsing. Please review.",
        needs_review: true,
      },
      model: "heuristic-fallback-v1",
    };
  }
}

export async function generateReportWithAi(input: {
  goalName: string | null;
  currency: string;
  totalSpent: number;
  flexibleSpent: number;
  neededSpent: number;
  fixedSpent: number;
  protectedAmount: number;
  goalDeltaPercent: number;
  confirmedCount: number;
  streakCount: number;
}): Promise<{ summary: ReportSummary; model: string }> {
  const fallback: ReportSummary = {
    insight: input.goalName
      ? `Today you saw where ${input.currency} ${input.flexibleSpent.toFixed(0)} of flexible spending touched ${input.goalName}.`
      : `Today you confirmed ${input.confirmedCount} money moments without turning it into a chore.`,
    achievement: input.protectedAmount > 0
      ? `You protected ${input.currency} ${input.protectedAmount.toFixed(0)} today.`
      : `${input.streakCount} day logging streak kept alive.`,
    mood: input.flexibleSpent > input.neededSpent ? "caution" : "encouraging",
  };

  if (!Deno.env.get("OPENAI_API_KEY")) {
    return { summary: fallback, model: "heuristic-report-v1" };
  }

  try {
    const result = await callOpenAIStructured<ReportSummary>({
      schemaName: "wallet_whisperer_daily_report",
      schema: reportSummarySchema,
      system: [
        "You write Wallet Whisperer daily report copy.",
        "Tone: calm, adult, non-shaming, specific.",
        "Never say the user failed. Never scold. Never use emojis.",
        "Keep each sentence short enough for a mobile card.",
        "Reward honest logging and protected spending.",
      ].join(" "),
      user: JSON.stringify(input),
    });

    return { summary: result.value, model: result.model };
  } catch (error) {
    console.error("OpenAI report failed; using fallback.", error);
    return { summary: fallback, model: "heuristic-report-fallback-v1" };
  }
}
