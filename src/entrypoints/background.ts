import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { xOrigin } from "../adapters/x/selectors";
import {
  clearFeedbackMessageSchema,
  contentMessageSchema,
  feedbackKey,
  feedbackSchema,
  readTotals,
  totalsKey,
} from "../storage/activity";
import {
  applySettingsPatch,
  defaultSettings,
  readSettings,
  settingsKey,
  settingsMessageSchema,
  type SettingsMessage,
} from "../storage/settings";

async function processSettings(message: SettingsMessage) {
  const storage = browser.storage.local;
  if (message.type === "settings:reset") {
    await storage.remove(settingsKey);
    return defaultSettings();
  }

  const values = await storage.get(settingsKey);
  const settings = readSettings(values[settingsKey]);
  if (message.type === "settings:get") {
    return settings;
  }

  const updated = applySettingsPatch(settings, message.patch);
  await storage.set({ [settingsKey]: updated });
  return updated;
}

function isXSender(
  url: string | undefined,
  frameId: number | undefined,
): boolean {
  if (!url || frameId !== 0) return false;
  try {
    // Chrome may supply the original document URL after a same-document navigation.
    return new URL(url).origin === xOrigin;
  } catch {
    return false;
  }
}

export default defineBackground(() => {
  let pending = Promise.resolve();
  const popupUrl = browser.runtime.getURL("/popup.html");

  browser.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse) => {
      if (sender.id !== browser.runtime.id) return false;

      let respond: () => Promise<unknown>;
      if (sender.url === popupUrl) {
        if (clearFeedbackMessageSchema.safeParse(message).success) {
          respond = async () => {
            await browser.storage.local.remove(feedbackKey);
            return true;
          };
        } else {
          const request = settingsMessageSchema.safeParse(message);
          if (!request.success) return false;
          respond = async () => ({
            ok: true,
            settings: await processSettings(request.data),
          });
        }
      } else {
        if (!isXSender(sender.url, sender.frameId)) return false;
        const request = contentMessageSchema.safeParse(message);
        if (!request.success) return false;
        respond = async () => {
          if (request.data.type === "totals:add") {
            const stored = await browser.storage.session.get(totalsKey);
            const current = readTotals(stored[totalsKey]);
            await browser.storage.session.set({
              [totalsKey]: {
                posts: current.posts + request.data.posts,
                patterns: current.patterns + request.data.patterns,
              },
            });
          } else {
            const stored = await browser.storage.local.get(feedbackKey);
            const entries =
              feedbackSchema.safeParse(stored[feedbackKey]).data ?? [];
            const { entry } = request.data;
            const existing = entries.find(
              ({ patternId, reason }) =>
                patternId === entry.patternId && reason === entry.reason,
            );
            if (existing) existing.count++;
            else entries.push({ ...entry, count: 1 });
            await browser.storage.local.set({ [feedbackKey]: entries });
          }
          return true;
        };
      }

      const previous = pending;
      pending = (async () => {
        try {
          await previous;
          sendResponse(await respond());
        } catch {
          sendResponse({ ok: false });
        }
      })();
      return true;
    },
  );
});
