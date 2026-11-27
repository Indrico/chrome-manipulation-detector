import type { PatternId } from "../models/pattern";
import {
  onlineBatchDelayMs,
  onlineBatchSize,
  type OnlineBatch,
  type OnlinePost,
  type OnlineReply,
  type OnlineStatus,
} from "./protocol";

type BatchResult = Extract<
  OnlineReply,
  { results: unknown }
>["results"][number];
type QueueResult = BatchResult | { status: OnlineStatus } | undefined;
type Entry = {
  post: OnlinePost;
  eligible: () => boolean;
  complete: (value: QueueResult) => void;
  result: Promise<QueueResult>;
};

export function createOnlineQueue(
  send: (batch: OnlineBatch) => Promise<OnlineReply>,
  onResume: () => void,
) {
  const pending = new Map<string, Entry>();
  let active = new Map<string, Entry>();
  let categories: readonly PatternId[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstQueuedAt = 0;
  let paused: OnlineStatus | undefined;
  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;

  function settlePending(value: QueueResult) {
    clearTimeout(timer);
    for (const entry of pending.values()) entry.complete(value);
    pending.clear();
  }

  function clear() {
    generation++;
    settlePending(undefined);
    clearTimeout(resumeTimer);
    paused = undefined;
  }

  function pause(status: OnlineStatus) {
    paused = status;
    settlePending({ status });
    clearTimeout(resumeTimer);
    if (status.reason === "credential") return;
    resumeTimer = setTimeout(
      () => {
        paused = undefined;
        onResume();
      },
      Math.max(0, status.retryAt - Date.now()),
    );
  }

  function prune() {
    for (const [key, entry] of pending) {
      if (entry.eligible()) continue;
      pending.delete(key);
      entry.complete(undefined);
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (!pending.size || active.size) return;
    const elapsed = Date.now() - firstQueuedAt;
    timer = setTimeout(
      () => void flush(),
      pending.size >= onlineBatchSize
        ? 0
        : Math.max(0, onlineBatchDelayMs - elapsed),
    );
  }

  async function flush() {
    prune();
    if (!pending.size) return;
    active = new Map([...pending].slice(0, onlineBatchSize));
    for (const key of active.keys()) pending.delete(key);
    let entries = [...active.values()];
    const started = generation;
    const enabled = [...categories];
    const submit = () =>
      send({ categories: enabled, posts: entries.map(({ post }) => post) });
    try {
      let reply = await submit();
      // Another tab can hold the browser-wide request slot. No HTTP request was made for a deferred reply.
      for (
        let attempts = 0;
        "deferred" in reply && attempts < 20 && started === generation;
        attempts++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (started !== generation) break;
        entries = entries.filter((entry) => {
          if (entry.eligible()) return true;
          entry.complete(undefined);
          return false;
        });
        if (!entries.length) break;
        reply = await submit();
      }
      if ("status" in reply) {
        if (started === generation) pause(reply.status);
        entries.forEach(({ complete }) =>
          complete(reply.status.reason === "unavailable" ? null : reply),
        );
      } else if ("results" in reply) {
        const { results, remainingStatus } = reply;
        if (remainingStatus && started === generation) pause(remainingStatus);
        entries.forEach(({ complete }, index) =>
          complete(
            index < results.length
              ? (results[index] ?? null)
              : remainingStatus
                ? { status: remainingStatus }
                : null,
          ),
        );
      } else {
        entries.forEach(({ complete }) => complete(undefined));
        if (entries.length && started === generation) {
          clearTimeout(resumeTimer);
          resumeTimer = setTimeout(onResume, onlineBatchDelayMs);
        }
      }
    } catch {
      entries.forEach(({ complete }) => complete(null));
    } finally {
      active.clear();
      schedule();
    }
  }

  return {
    clear,
    add(
      key: string,
      post: OnlinePost,
      enabled: readonly PatternId[],
      eligible: () => boolean,
    ) {
      if (paused) return Promise.resolve({ status: paused });
      const joining = pending.get(key) ?? active.get(key);
      if (joining) {
        const previous = joining.eligible;
        joining.eligible = () => eligible() || previous();
        return joining.result;
      }
      prune();
      if (!pending.size) firstQueuedAt = Date.now();
      categories = enabled;
      const { promise, resolve } = Promise.withResolvers<QueueResult>();
      pending.set(key, { post, eligible, complete: resolve, result: promise });
      schedule();
      return promise;
    },
  };
}
