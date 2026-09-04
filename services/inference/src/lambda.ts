import { assemblePortrait } from "./assemble.ts";
import { createAnthropicInference } from "./anthropic.ts";
import { loadPrompt } from "./prompt.ts";
import { anthropicKey } from "./secret.ts";
import { deleteSession, putSession } from "./sessions.ts";
import type { InferInput } from "./types.ts";
import { validatePortrait } from "@glasshouse/schema";

type LambdaEvent = {
  body?: string | null;
  isBase64Encoded?: boolean;
  rawPath?: string;
  requestContext?: { http?: { method?: string; path?: string } };
};

type ResponseStream = {
  write(chunk: string): void;
  end(): void;
};

declare const awslambda: {
  streamifyResponse: (
    fn: (event: LambdaEvent, responseStream: ResponseStream) => Promise<void>,
  ) => unknown;
  HttpResponseStream: {
    from: (
      stream: ResponseStream,
      metadata: { statusCode: number; headers: Record<string, string> },
    ) => ResponseStream;
  };
};

function sse(stream: ResponseStream, event: string, data: unknown): void {
  stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function json(stream: ResponseStream, status: number, data: unknown): ResponseStream {
  return awslambda.HttpResponseStream.from(stream, {
    statusCode: status,
    headers: { "content-type": "application/json", "cache-control": "no-cache" },
  });
}

function bodyText(event: LambdaEvent): string {
  const raw = event.body ?? "";
  return event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
}

function routeOf(event: LambdaEvent): { method: string; path: string } {
  const path = event.rawPath ?? event.requestContext?.http?.path ?? "/api/infer";
  const method = event.requestContext?.http?.method ?? "POST";
  return { method, path };
}

async function infer(input: InferInput, stream: ResponseStream): Promise<void> {
  const promptVersion = input.prompt_version || "p1";
  const repoRoot = process.env.LAMBDA_TASK_ROOT ?? process.cwd();
  const system = await loadPrompt(promptVersion, repoRoot);
  const apiKey = await anthropicKey();
  const inference = createAnthropicInference({ system, apiKey });
  if (!inference.stream) throw new Error("anthropic inference missing stream()");
  for await (const ev of inference.stream(input)) {
    if (ev.type === "thinking") sse(stream, "thinking", { text: ev.text });
    if (ev.type === "portrait") {
      const portrait = assemblePortrait(input, ev.output, inference.model_id);
      const { portrait: clean, drops } = validatePortrait(portrait);
      sse(stream, "pass_complete", { portrait: clean, drops });
    }
  }
}

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  const { method, path } = routeOf(event);
  try {
    if (method === "POST" && (path === "/api/session" || path.endsWith("/api/session"))) {
      const payload = JSON.parse(bodyText(event)) as { sid: string; signals: InferInput["signals"] };
      await putSession(payload.sid, payload.signals);
      const out = json(responseStream, 204, {});
      out.end();
      return;
    }
    if (method === "POST" && (path === "/api/session/delete" || path.endsWith("/api/session/delete"))) {
      const payload = JSON.parse(bodyText(event)) as { sid: string };
      await deleteSession(payload.sid);
      const out = json(responseStream, 204, {});
      out.end();
      return;
    }
    const stream = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      },
    });
    try {
      const parsed = JSON.parse(bodyText(event)) as InferInput;
      await infer(parsed, stream);
    } catch (err) {
      const message = err instanceof Error ? err.message : "inference failed";
      sse(stream, "error", { message });
    } finally {
      stream.end();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "handler failed";
    const out = json(responseStream, 500, { message });
    out.write(JSON.stringify({ message }));
    out.end();
  }
});
