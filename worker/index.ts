import { z } from "zod";
import {
  alignModelResults,
  completionContent,
  modelMessages,
  outputSchema,
} from "../src/online/model";
import { onlineBatchSchema, onlinePath } from "../src/online/protocol";

export const models = [
  "@cf/zai-org/glm-4.7-flash",
  "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
  "@cf/google/gemma-4-26b-a4b-it",
] as const;
type Model = (typeof models)[number];
type InferenceInput = {
  messages: { role: "system" | "user"; content: string }[];
  max_tokens: number;
  temperature: number;
  response_format?: { type: "json_object" };
  chat_template_kwargs?: { enable_thinking: false };
};
type Env = {
  AI: { run(model: Model, input: InferenceInput): Promise<unknown> };
  RATE_LIMITER: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
  LLM_MODEL: Model;
};

const legacyCompletionSchema = z.object({
  response: z.union([outputSchema, z.string()]),
});
const maxBodyBytes = 80_000;

function json(value: unknown, status = 200, retryAfter?: number) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (retryAfter) headers.set("Retry-After", String(retryAfter));
  return Response.json(value, { status, headers });
}

async function readBatch(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return;
  let size = 0;
  let body = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > maxBodyBytes) {
        void reader.cancel().catch(() => {});
        return;
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    return onlineBatchSchema.safeParse(JSON.parse(body + decoder.decode()))
      .data;
  } catch {
    return;
  } finally {
    reader.releaseLock();
  }
}

export async function handleOnlineRequest(request: Request, env: Env) {
  if (new URL(request.url).pathname !== onlinePath)
    return json({ error: "not_found" }, 404);
  if (request.method !== "POST") return json({ error: "method" }, 405);
  if (request.headers.get("Content-Type")?.split(";")[0] !== "application/json")
    return json({ error: "content_type" }, 415);
  if (!models.includes(env.LLM_MODEL))
    return json({ error: "unavailable" }, 503);
  try {
    const { success } = await env.RATE_LIMITER.limit({
      key: request.headers.get("CF-Connecting-IP") ?? "unknown",
    });
    if (!success) return json({ error: "rate_limit" }, 429, 60);
    const batch = await readBatch(request);
    if (!batch) return json({ error: "batch" }, 400);
    const raw = await env.AI.run(env.LLM_MODEL, {
      messages: modelMessages(batch),
      temperature: 0.1,
      max_tokens: 3_000,
      ...(env.LLM_MODEL !== models[1] && {
        response_format: { type: "json_object" },
        chat_template_kwargs: { enable_thinking: false },
      }),
    });
    const response =
      completionContent(raw) ?? legacyCompletionSchema.parse(raw).response;
    return json(alignModelResults(batch, response));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/\b3036\b|daily free allocation/i.test(message)) {
      const secondsUntilTomorrow = Math.ceil(
        (86_400_000 - (Date.now() % 86_400_000)) / 1_000,
      );
      return json({ error: "quota" }, 429, secondsUntilTomorrow);
    }
    if (/\b429\b|rate.limit/i.test(message))
      return json({ error: "rate_limit" }, 429, 60);
    return json({ error: "unavailable" }, 503);
  }
}

export default { fetch: handleOnlineRequest };
