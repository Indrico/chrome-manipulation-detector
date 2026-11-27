import { browser } from "wxt/browser";
import { z } from "zod";
import { supportedPatternIds } from "../data/patterns";
import {
  enabledPatterns,
  readSettings,
  settingsKey,
} from "../storage/settings";
import { onlineOrigin, onlinePermission } from "./config";
import { readGroqKey } from "./credentials";
import { isGroqGenerationError, readGroqResults, requestGroq } from "./groq";
import {
  onlineDailyPosts,
  onlinePath,
  onlineResultsSchema,
  onlineStatusKey,
  onlineStatusSchema,
  onlineTimeoutMs,
  onlineUsageKey,
  type OnlineBatch,
  type OnlineReply,
  type OnlineStatus,
} from "./protocol";

const dayMs = 86_400_000;
const usageSchema = z.strictObject({
  day: z.int(),
  posts: z.int().nonnegative(),
  batches: z.int().nonnegative(),
});

export function createOnlineService() {
  let request: AbortController | undefined;

  async function pause(
    reason: OnlineStatus["reason"],
    retryAt: number,
  ): Promise<OnlineReply> {
    if (request?.signal.aborted) return { deferred: true };
    const status = { reason, retryAt };
    await browser.storage.session.set({ [onlineStatusKey]: status });
    return { status };
  }

  async function invalidGroqOutput(batch: OnlineBatch): Promise<OnlineReply> {
    const status = await pause("invalid_output", 0);
    return "deferred" in status
      ? status
      : { results: batch.posts.map(() => null) };
  }

  return {
    cancel() {
      request?.abort();
    },
    async analyze(batch: OnlineBatch): Promise<OnlineReply> {
      if (request) return { deferred: true };
      const controller = new AbortController();
      request = controller;
      try {
        const [local, session, granted] = await Promise.all([
          browser.storage.local.get(
            onlineOrigin ? [settingsKey, onlineUsageKey] : settingsKey,
          ),
          browser.storage.session.get(onlineStatusKey),
          browser.permissions.contains(onlinePermission),
        ]);
        const settings = readSettings(local[settingsKey]);
        const categories = enabledPatterns(settings, supportedPatternIds);
        if (
          !settings.online ||
          (!onlineOrigin && settings.onlineProvider !== "groq") ||
          categories.join() !== batch.categories.join() ||
          controller.signal.aborted
        )
          return { deferred: true };
        const now = Date.now();
        if (!granted) return await pause("permission", now + 30_000);
        const existing = onlineStatusSchema.safeParse(
          session[onlineStatusKey],
        ).data;
        if (
          existing &&
          existing.reason !== "permission" &&
          existing.reason !== "daily_limit" &&
          (existing.reason === "credential" || existing.retryAt > now)
        )
          return { status: existing };

        let requestedPosts = batch.posts;
        const day = Math.floor(now / dayMs);
        const resetAt = (day + 1) * dayMs;
        let response: Response;
        if (onlineOrigin) {
          const stored = usageSchema.safeParse(local[onlineUsageKey]).data;
          const usage =
            stored?.day === day ? stored : { day, posts: 0, batches: 0 };
          const remaining = onlineDailyPosts - usage.posts;
          if (remaining <= 0) return await pause("daily_limit", resetAt);
          requestedPosts = batch.posts.slice(0, remaining);
          await browser.storage.local.set({
            [onlineUsageKey]: {
              day,
              posts: usage.posts + requestedPosts.length,
              batches: usage.batches + 1,
            },
          });
          response = await fetch(`${onlineOrigin}${onlinePath}`, {
            method: "POST",
            credentials: "omit",
            redirect: "error",
            cache: "no-store",
            referrerPolicy: "no-referrer",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...batch, posts: requestedPosts }),
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(onlineTimeoutMs),
            ]),
          });
        } else {
          const key = await readGroqKey();
          if (!key) return await pause("credential", 0);
          response = await requestGroq(batch, key, controller.signal);
          if (response.status === 401 || response.status === 403)
            return await pause("credential", 0);
        }
        if (response.status === 429) {
          const retrySeconds =
            Number(response.headers.get("Retry-After")) || 60;
          return await pause(
            "quota",
            Date.now() + Math.min(Math.max(retrySeconds, 1), 86_400) * 1_000,
          );
        }
        if (
          !onlineOrigin &&
          response.status === 400 &&
          (await isGroqGenerationError(response))
        )
          return await invalidGroqOutput(batch);
        if (!response.ok)
          return await pause("unavailable", Date.now() + 30_000);
        const reply = onlineResultsSchema.safeParse(
          onlineOrigin
            ? await response.json()
            : await readGroqResults(batch, response),
        ).data;
        if (
          reply?.results.length !== requestedPosts.length ||
          reply.results.every((result) => result === null)
        )
          return onlineOrigin
            ? await pause("unavailable", Date.now() + 30_000)
            : await invalidGroqOutput(batch);
        if (controller.signal.aborted) return { deferred: true };
        if (requestedPosts.length < batch.posts.length) {
          const paused = await pause("daily_limit", resetAt);
          return "status" in paused
            ? { ...reply, remainingStatus: paused.status }
            : paused;
        }
        if (reply.results.some((result) => result === null)) {
          await pause("partial", 0);
        } else {
          await browser.storage.session.remove(onlineStatusKey);
        }
        return reply;
      } catch {
        if (controller.signal.aborted) return { deferred: true };
        return await pause("unavailable", Date.now() + 30_000);
      } finally {
        request = undefined;
      }
    },
  };
}
