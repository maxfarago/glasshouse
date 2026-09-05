import Anthropic from "@anthropic-ai/sdk";
import { modelOutputSchema, stripWithheld, type ModelOutput } from "@glasshouse/schema";
import { assemblePortrait } from "./assemble.ts";
import type { InferEvent, InferInput, Inference } from "./types.ts";

export const DEFAULT_MODEL = "claude-sonnet-4-6";
const THINKING_BUDGET = 2048;
const MAX_TOKENS = 16000;

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
    JSON.stringify(stripWithheld(input.signals), null, 2),
  ].join("\n");
}

function parseOutput(message: Anthropic.Messages.Message): ModelOutput {
  const tool = message.content.find((b) => b.type === "tool_use" && b.name === "submit_portrait");
  if (tool && tool.type === "tool_use") {
    return modelOutputSchema.parse(tool.input);
  }
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("model returned neither submit_portrait nor json");
  return modelOutputSchema.parse(JSON.parse(match[0]));
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
      let output: ModelOutput | null = null;
      for await (const event of stream(input)) {
        if (event.type === "portrait") output = event.output;
      }
      if (!output) throw new Error("stream ended without a portrait");
      return assemblePortrait(input, output, model);
    },
    stream,
  };
}
