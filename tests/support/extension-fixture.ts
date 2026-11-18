import { test as base, type BrowserContext, type Page } from "@playwright/test";
import { resolve } from "node:path";
import type { browser } from "wxt/browser";

declare const chrome: typeof browser;

export const extensionDirectory = resolve(".output/chrome-mv3");

export const test = base.extend<{
  extensionContext: BrowserContext;
  extensionId: string;
  popup: Page;
}>({
  extensionContext: async ({ playwright }, use) => {
    const context = await playwright.chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [
        `--disable-extensions-except=${extensionDirectory}`,
        `--load-extension=${extensionDirectory}`,
      ],
    });
    try {
      await use(context);
    } finally {
      await context.close();
    }
  },
  extensionId: async ({ extensionContext }, use) => {
    const worker =
      extensionContext.serviceWorkers()[0] ??
      (await extensionContext.waitForEvent("serviceworker"));
    await use(new URL(worker.url()).hostname);
  },
  popup: async ({ extensionContext, extensionId }, use) => {
    const popup = await extensionContext.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await use(popup);
  },
});

export async function storage(page: Page, area: "local" | "session") {
  return await page.evaluate(
    async (name) => chrome.storage[name].get(null),
    area,
  );
}
