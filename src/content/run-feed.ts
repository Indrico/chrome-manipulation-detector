import { browser } from "wxt/browser";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import type { PlatformId } from "../adapters/platform";
import type { PlatformAdapter } from "../adapters/platform-adapter";
import {
  platformRequestSchema,
  type FeedbackEntry,
  type SessionTotals,
} from "../storage/activity";
import {
  readSettings,
  settingsKey,
  settingsResponseSchema,
  type Settings,
} from "../storage/settings";
import { createFeedMonitor } from "./feed-monitor";
import { onlineOrigin } from "../online/config";
import { onlineReplySchema, type OnlineBatch } from "../online/protocol";

async function analyzeOnline(batch: OnlineBatch) {
  return onlineReplySchema.parse(
    await browser.runtime.sendMessage({ type: "online:analyze", batch }),
  );
}

async function reportTotals(delta: SessionTotals) {
  try {
    await browser.runtime.sendMessage({ type: "totals:add", ...delta });
  } catch {
    // A closed extension context cannot accept another count.
  }
}

async function saveFeedback(entry: FeedbackEntry): Promise<boolean> {
  try {
    const response: unknown = await browser.runtime.sendMessage({
      type: "feedback:add",
      entry,
    });
    return response === true;
  } catch {
    return false;
  }
}

export async function runFeed(
  ctx: ContentScriptContext,
  platform: PlatformId,
  adapter: PlatformAdapter,
) {
  const onlineAllowed = platform === "x" || !onlineOrigin;
  const applySettings = (settings: Settings) =>
    monitor.setSettings({
      ...settings,
      online:
        onlineAllowed &&
        settings.online === true &&
        (platform === "x" || settings.threadsOnline === true),
    });
  const monitor = createFeedMonitor(
    adapter,
    (delta) => void reportTotals(delta),
    saveFeedback,
    onlineAllowed ? analyzeOnline : undefined,
    !onlineOrigin,
  );
  let receivedChange = false;
  const onStorage: Parameters<
    typeof browser.storage.onChanged.addListener
  >[0] = (changes, area) => {
    const change = changes[settingsKey];
    if (area !== "local" || !change) return;
    receivedChange = true;
    applySettings(readSettings(change.newValue));
  };
  const onMessage: Parameters<
    typeof browser.runtime.onMessage.addListener
  >[0] = (message: unknown, sender, reply) => {
    if (
      sender.id !== browser.runtime.id ||
      sender.url !== browser.runtime.getURL("/popup.html") ||
      !platformRequestSchema.safeParse(message).success
    )
      return false;
    reply({ platform, status: monitor.status() });
    return false;
  };
  browser.storage.onChanged.addListener(onStorage);
  browser.runtime.onMessage.addListener(onMessage);
  ctx.addEventListener(window, "wxt:locationchange", monitor.routeChanged);
  ctx.addEventListener(window, "pagehide", monitor.suspend);
  ctx.addEventListener(window, "pageshow", monitor.resume);
  ctx.addEventListener(document, "visibilitychange", () => {
    if (!document.hidden) monitor.resume();
  });
  ctx.onInvalidated(() => {
    monitor.suspend();
    browser.storage.onChanged.removeListener(onStorage);
    browser.runtime.onMessage.removeListener(onMessage);
  });
  try {
    const response = settingsResponseSchema.safeParse(
      await browser.runtime
        .sendMessage({ type: "settings:get" })
        .catch(() => undefined),
    );
    if (response.data?.ok) {
      if (ctx.isValid && !receivedChange) applySettings(response.data.settings);
      return;
    }
    const data = await browser.storage.local.get(settingsKey);
    if (ctx.isValid && !receivedChange)
      monitor.setSettings({
        ...readSettings(data[settingsKey]),
        online: false,
      });
  } catch {
    // Wait for a storage change rather than scanning with unknown settings.
  }
}
