import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { xMatches } from "../adapters/x/selectors";
import { xAdapter } from "../adapters/x/x-adapter";
import {
  platformRequestSchema,
  type FeedbackEntry,
  type SessionTotals,
} from "../storage/activity";
import {
  readSettings,
  settingsKey,
  settingsResponseSchema,
} from "../storage/settings";
import { createFeedMonitor } from "../content/feed-monitor";
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

export default defineContentScript({
  matches: xMatches,
  allFrames: false,
  world: "ISOLATED",
  runAt: "document_idle",
  async main(ctx) {
    const monitor = createFeedMonitor(
      xAdapter,
      (delta) => void reportTotals(delta),
      saveFeedback,
      analyzeOnline,
      !onlineOrigin,
    );
    let receivedChange = false;
    const onStorage: Parameters<
      typeof browser.storage.onChanged.addListener
    >[0] = (changes, area) => {
      const change = changes[settingsKey];
      if (area !== "local" || !change) return;
      receivedChange = true;
      monitor.setSettings(readSettings(change.newValue));
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
      reply(monitor.status());
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
        if (ctx.isValid && !receivedChange)
          monitor.setSettings(response.data.settings);
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
  },
});
