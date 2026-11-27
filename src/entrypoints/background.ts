import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { platformForOrigin } from "../adapters/platform";
import { createOnlineService } from "../online/background";
import { onlineOrigin, onlinePermission } from "../online/config";
import { writeGroqKey } from "../online/credentials";
import {
  groqConnectionSchema,
  onlineMessageSchema,
  onlineStatusKey,
  type GroqConnectionMessage,
} from "../online/protocol";
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
    if (!onlineOrigin) await writeGroqKey();
    await browser.storage.session.remove(onlineStatusKey);
    // Chrome can reject removal of a host permission granted by policy.
    await browser.permissions.remove(onlinePermission).catch(() => false);
    return defaultSettings();
  }

  const values = await storage.get(settingsKey);
  const settings = readSettings(values[settingsKey]);
  if (message.type === "settings:get") {
    if (
      !onlineOrigin &&
      settings.online &&
      settings.onlineProvider !== "groq"
    ) {
      const updated = { ...settings, online: false };
      await storage.set({ [settingsKey]: updated });
      await browser.storage.session.remove(onlineStatusKey);
      return updated;
    }
    if (
      settings.online === undefined &&
      onlineOrigin &&
      (await browser.permissions.contains(onlinePermission))
    ) {
      const updated = { ...settings, online: true };
      await storage.set({ [settingsKey]: updated });
      return updated;
    }
    return settings;
  }

  const updated = applySettingsPatch(settings, message.patch);
  if (!onlineOrigin && message.patch.online !== undefined)
    throw new Error("Use the Groq connection controls");
  if (
    message.patch.threadsOnline === true &&
    (onlineOrigin ||
      !settings.online ||
      settings.onlineProvider !== "groq" ||
      !(await browser.permissions.contains(onlinePermission)))
  )
    throw new Error("A Groq connection is required for Threads");
  if (
    message.patch.online === true &&
    (!onlineOrigin || !(await browser.permissions.contains(onlinePermission)))
  )
    throw new Error("Online permission is required");
  await storage.set({ [settingsKey]: updated });
  if (onlineOrigin && message.patch.online === false) {
    await browser.permissions.remove(onlinePermission);
    await browser.storage.session.remove(onlineStatusKey);
  }
  return updated;
}

async function processGroqConnection(message: GroqConnectionMessage) {
  const storage = browser.storage.local;
  const current = readSettings((await storage.get(settingsKey))[settingsKey]);
  if (message.type === "groq:connect") {
    if (current.online && current.onlineProvider === "groq")
      throw new Error("Disconnect the existing key first");
    if (!(await browser.permissions.contains(onlinePermission)))
      throw new Error("Groq permission is required");
    await browser.storage.session.remove(onlineStatusKey);
    await writeGroqKey(message.key);
    const settings = {
      ...current,
      online: true,
      onlineProvider: "groq",
    } as const;
    await storage.set({ [settingsKey]: settings });
    return settings;
  }

  const settings = { ...current, online: false, threadsOnline: false };
  delete settings.onlineProvider;
  await storage.set({ [settingsKey]: settings });
  await writeGroqKey();
  await browser.storage.session.remove(onlineStatusKey);
  await browser.permissions.remove(onlinePermission).catch(() => false);
  return settings;
}

function senderPlatform(url: string | undefined, frameId: number | undefined) {
  if (!url || frameId !== 0) return;
  try {
    // Chrome may supply the original document URL after a same-document navigation.
    return platformForOrigin(new URL(url).origin);
  } catch {
    return;
  }
}

export default defineBackground(() => {
  let pending = Promise.resolve();
  const online = createOnlineService();
  const popupUrl = browser.runtime.getURL("/popup.html");

  browser.permissions.onAdded.addListener(({ origins }) => {
    if (
      !onlineOrigin ||
      !onlinePermission.origins.some((origin) => origins?.includes(origin))
    )
      return;
    pending = pending
      .then(async () => {
        await processSettings({
          type: "settings:patch",
          patch: { online: true },
        });
      })
      .catch(() => {});
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[settingsKey]) return;
    const before = readSettings(changes[settingsKey].oldValue);
    const after = readSettings(changes[settingsKey].newValue);
    if (
      !after.enabled ||
      !after.online ||
      JSON.stringify(before.categories) !== JSON.stringify(after.categories)
    )
      online.cancel();
    else if (before.threadsOnline && !after.threadsOnline)
      online.cancel("threads");
  });
  browser.permissions.onRemoved.addListener(() => online.cancel());

  browser.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse) => {
      if (sender.id !== browser.runtime.id) return false;

      let respond: () => Promise<unknown>;
      const platform = senderPlatform(sender.url, sender.frameId);
      const settingsRequest = settingsMessageSchema.safeParse(message);
      if (
        platform &&
        settingsRequest.success &&
        settingsRequest.data.type === "settings:get"
      ) {
        respond = async () => ({
          ok: true,
          settings: await processSettings(settingsRequest.data),
        });
      } else if (sender.url === popupUrl) {
        const connection = groqConnectionSchema.safeParse(message);
        if (clearFeedbackMessageSchema.safeParse(message).success) {
          respond = async () => {
            await browser.storage.local.remove(feedbackKey);
            return true;
          };
        } else if (!onlineOrigin && connection.success) {
          respond = async () => {
            online.cancel();
            return {
              ok: true,
              settings: await processGroqConnection(connection.data),
            };
          };
        } else {
          if (!settingsRequest.success) return false;
          respond = async () => {
            if (settingsRequest.data.type === "settings:reset") online.cancel();
            return {
              ok: true,
              settings: await processSettings(settingsRequest.data),
            };
          };
        }
      } else {
        if (!platform) return false;
        if (
          message &&
          typeof message === "object" &&
          "type" in message &&
          message.type === "online:analyze"
        ) {
          const request = onlineMessageSchema.safeParse(message);
          if (!request.success) return false;
          void online
            .analyze(request.data.batch, platform)
            .then(sendResponse, () => sendResponse({ deferred: true }));
          return true;
        }
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
