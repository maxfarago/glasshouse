import Anthropic from "@anthropic-ai/sdk";
import { modelOutputSchema, stripForInfer, type ModelOutput } from "@glasshouse/schema";
import { assemblePortrait } from "./assemble.ts";
import type { InferEvent, InferInput, Inference } from "./types.ts";

export const DEFAULT_MODEL = "claude-sonnet-4-6";
const THINKING_BUDGET = 8192;
const MAX_TOKENS = 24000;

const SUBMIT_TOOL: Anthropic.Messages.Tool = {
  name: "submit_portrait",
  description: "emit the portrait. every claim type belongs in claims or declined, not both.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["claims", "declined", "thin_signal_note"],
    properties: {
      claims: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["claim_type", "confidence", "statement", "evidence", "reasoning", "falsifier"],
          properties: {
            claim_type: { type: "string" },
            confidence: { type: "string", enum: ["HUNCH", "PLAUSIBLE", "LIKELY", "CONFIDENT"] },
            statement: { type: "string" },
            evidence: { type: "array", items: { type: "string" } },
            reasoning: { type: "string" },
            falsifier: { type: "string" },
          },
        },
      },
      declined: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["claim_type", "reason"],
          properties: {
            claim_type: { type: "string" },
            reason: { type: "string" },
          },
        },
      },
      thin_signal_note: { type: ["string", "null"] },
    },
  },
};

export type AnthropicInferenceOpts = {
  system: string;
  model?: string;
  apiKey?: string;
};

function userMessage(input: InferInput): string {
  return [
    `prompt_version: ${input.prompt_version}`,
    `pass_index: ${input.pass_index}`,
    `tiers_available: ${JSON.stringify(input.tiers_available)}`,
    `behavior_sparse: ${input.behavior_sparse}`,
    `sampling: ${input.sampling}`,
    "",
    "signal set (raw + derived):",
    JSON.stringify(stripForInfer(input.signals), null, 2),
  ].join("\n");
}

const CONFIDENCE = new Set(["HUNCH", "PLAUSIBLE", "LIKELY", "CONFIDENT"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function sanitizeOutput(raw: unknown): unknown {
  const rec = asRecord(raw);
  if (!rec) return raw;
  if (Array.isArray(rec.claims)) {
    rec.claims = rec.claims.filter((c) => {
      const claim = asRecord(c);
      if (!claim) return false;
      return (
        typeof claim.claim_type === "string" &&
        claim.claim_type.length > 0 &&
        typeof claim.confidence === "string" &&
        CONFIDENCE.has(claim.confidence) &&
        typeof claim.statement === "string" &&
        claim.statement.trim().length > 0
      );
    });
  }
  if (Array.isArray(rec.declined)) {
    rec.declined = rec.declined.filter((d) => {
      const row = asRecord(d);
      return (
        row &&
        typeof row.claim_type === "string" &&
        row.claim_type.length > 0 &&
        typeof row.reason === "string" &&
        row.reason.trim().length > 0
      );
    });
  }
  return rec;
}

function parseOutput(message: Anthropic.Messages.Message): ModelOutput {
  const tool = message.content.find((b) => b.type === "tool_use" && b.name === "submit_portrait");
  if (tool && tool.type === "tool_use") {
    return modelOutputSchema.parse(sanitizeOutput(tool.input));
  }
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("model returned neither submit_portrait nor json");
  return modelOutputSchema.parse(sanitizeOutput(JSON.parse(match[0])));
}

function isTransientNetwork(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 6 && cur; i++) {
    if (typeof cur === "object" && cur !== null && "code" in cur && cur.code === "ECONNRESET") return true;
    if (cur instanceof Error) {
      if (cur.message === "terminated" || /ECONNRESET|ETIMEDOUT|UND_ERR_SOCKET|fetch failed/i.test(cur.message)) {
        return true;
      }
      cur = (cur as Error & { cause?: unknown }).cause;
      continue;
    }
    break;
  }
  return false;
}

function createClient(apiKey: string | undefined): Anthropic {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({
    apiKey: key,
    defaultHeaders: {
      "anthropic-beta": "interleaved-thinking-2025-05-14",
    },
  });
}

export function createAnthropicInference(opts: AnthropicInferenceOpts): Inference {
  const model = opts.model ?? process.env.GH_MODEL ?? DEFAULT_MODEL;
  const client = createClient(opts.apiKey);

  const params = (input: InferInput): Anthropic.Messages.MessageCreateParams => ({
    model,
    max_tokens: MAX_TOKENS,
    thinking: { type: "enabled", budget_tokens: THINKING_BUDGET },
    system: opts.system,
    tools: [SUBMIT_TOOL],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: userMessage(input) }],
  });

  async function* stream(input: InferInput): AsyncIterable<InferEvent> {
    const running = client.messages.stream(params(input));
    for await (const event of running) {
      if (event.type === "content_block_delta" && event.delta.type === "thinking_delta") {
        yield { type: "thinking", text: event.delta.thinking };
      }
    }
    const message = await running.finalMessage();
    yield { type: "portrait", output: parseOutput(message) };
  }

  return {
    model_id: model,
    async infer(input) {
      let last: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          let output: ModelOutput | null = null;
          for await (const event of stream(input)) {
            if (event.type === "portrait") output = event.output;
          }
          if (!output) throw new Error("stream ended without a portrait");
          return assemblePortrait(input, output, model);
        } catch (err) {
          last = err;
          if (!isTransientNetwork(err) || attempt === 2) throw err;
          console.error(`[infer] transient disconnect; retry ${attempt + 1}/2`);
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        }
      }
      throw last;
    },
    stream,
  };
}
