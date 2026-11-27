import { expect } from "@playwright/test";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import type { browser } from "wxt/browser";
import type { SettingsMessage } from "../../src/storage/settings";
import { extensionDirectory, test } from "../support/extension-fixture";

declare const chrome: typeof browser;

test("production manifest restricts site access and bundles local assets and notices", async () => {
  const manifest = JSON.parse(
    await readFile(resolve(extensionDirectory, "manifest.json"), "utf8"),
  );

  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions).toEqual(["storage"]);
  expect(manifest.action.default_popup).toBe("popup.html");
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.optional_host_permissions).toEqual([
    "https://api.groq.com/*",
  ]);
  expect(manifest.externally_connectable).toBeUndefined();
  expect(manifest.content_security_policy.extension_pages).toContain(
    "connect-src https://api.groq.com; form-action 'none'",
  );
  expect(
    await readFile(resolve(extensionDirectory, "LICENSE"), "utf8"),
  ).toContain("Manipulation Detector contributors");
  expect(
    await readFile(resolve(extensionDirectory, "notices/wxt-LICENSE"), "utf8"),
  ).toContain("Copyright (c) 2023 Aaron");
  expect(
    await readFile(resolve(extensionDirectory, "notices/x.md"), "utf8"),
  ).toContain("zod");
  expect(manifest.content_scripts).toEqual([
    expect.objectContaining({
      matches: ["https://x.com/*"],
      all_frames: false,
      world: "ISOLATED",
    }),
  ]);
});

test("popup settings persist, merge, and reset", async ({
  extensionContext,
  extensionId,
}) => {
  const url = `chrome-extension://${extensionId}/popup.html`;
  const firstPopup = await extensionContext.newPage();
  await firstPopup.goto(url);
  await expect(
    firstPopup.getByText(
      "Buka beranda, hasil Top/Latest, atau detail unggahan X",
    ),
  ).toBeVisible();
  const firstToggle = firstPopup.getByRole("checkbox", {
    name: "Aktifkan deteksi",
  });
  await expect(firstToggle).toBeChecked();
  await firstToggle.uncheck();
  await expect(firstPopup.getByRole("status")).toHaveText(
    "Pengaturan tersimpan.",
  );
  await firstPopup.close();

  const secondPopup = await extensionContext.newPage();
  await secondPopup.goto(url);
  const enabled = secondPopup.getByRole("checkbox", {
    name: "Aktifkan deteksi",
  });
  const annotations = secondPopup.getByRole("checkbox", {
    name: "Tampilkan anotasi",
  });
  await expect(enabled).toBeEnabled();
  await expect(enabled).not.toBeChecked();

  const patches: SettingsMessage[] = [
    { type: "settings:patch", patch: { enabled: true } },
    { type: "settings:patch", patch: { showAnnotations: false } },
  ];
  const responses = await secondPopup.evaluate(
    async (messages) =>
      Promise.all(
        messages.map((message) => chrome.runtime.sendMessage(message)),
      ),
    patches,
  );
  expect(responses).toEqual([
    expect.objectContaining({ ok: true }),
    expect.objectContaining({ ok: true }),
  ]);
  await secondPopup.reload();
  await expect(enabled).toBeChecked();
  await expect(annotations).not.toBeChecked();

  await secondPopup
    .getByRole("button", { name: "Atur ulang pengaturan" })
    .click();
  await expect(secondPopup.getByRole("status")).toHaveText(
    "Pengaturan dikembalikan ke nilai awal.",
  );
  await expect(enabled).toBeChecked();
  await expect(annotations).toBeChecked();
  expect(
    await secondPopup.evaluate(async () => chrome.storage.local.get(null)),
  ).toEqual({});
});

test("popup opens bundled guide and privacy links", async ({
  extensionContext,
  extensionId,
}) => {
  const popup = await extensionContext.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  for (const { link, heading, hash } of [
    { link: "Panduan", heading: "Panduan Manipulation Detector", hash: "" },
    {
      link: "Kebijakan privasi",
      heading: "Kebijakan privasi",
      hash: "#privasi",
    },
  ]) {
    const [page] = await Promise.all([
      extensionContext.waitForEvent("page"),
      popup.getByRole("link", { name: link, exact: true }).click(),
    ]);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    expect(page.url()).toBe(
      `chrome-extension://${extensionId}/panduan.html${hash}`,
    );
    await page.close();
  }
});

test("category controls persist independently and reset to enabled", async ({
  extensionContext,
  extensionId,
}) => {
  const page = await extensionContext.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const categories = page.getByRole("group", { name: "Pola deteksi" });
  await expect(categories.getByRole("checkbox")).toHaveCount(8);
  const adHominem = categories.getByRole("checkbox", { name: "Ad Hominem" });
  const falseDilemma = categories.getByRole("checkbox", {
    name: "Dilema palsu",
  });
  const guiltTripping = categories.getByRole("checkbox", {
    name: "Tekanan rasa bersalah",
  });
  const strawman = categories.getByRole("checkbox", { name: "Strawman" });

  await expect(adHominem).toBeChecked();
  await adHominem.focus();
  await adHominem.press("Space");
  await expect(page.getByRole("status")).toHaveText("Pengaturan tersimpan.");
  await expect(adHominem).toBeFocused();
  await falseDilemma.uncheck();
  await expect(falseDilemma).toBeEnabled();
  await expect(strawman).toBeChecked();
  await strawman.uncheck();
  await expect(strawman).toBeEnabled();
  await page.reload();
  await expect(guiltTripping).toBeChecked();
  await expect(adHominem).not.toBeChecked();
  await expect(falseDilemma).not.toBeChecked();
  await expect(strawman).not.toBeChecked();

  await page.getByRole("button", { name: "Atur ulang pengaturan" }).click();
  await expect(adHominem).toBeChecked();
  await expect(falseDilemma).toBeChecked();
  await expect(guiltTripping).toBeChecked();
  await expect(strawman).toBeChecked();
});
