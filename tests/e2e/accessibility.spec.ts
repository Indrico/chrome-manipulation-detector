import { expect, type Locator } from "@playwright/test";
import { test } from "../support/extension-fixture";
import {
  adHominemText,
  annotation,
  appendPosts,
  openTimeline,
} from "../support/x-timeline";

async function contrast(locator: Locator, background: Locator) {
  const foregroundColor = await locator.evaluate(
    (node) => getComputedStyle(node).color,
  );
  const backgroundColor = await background.evaluate(
    (node) => getComputedStyle(node).backgroundColor,
  );
  function luminance(color: string) {
    const channels = color
      .match(/\d+/g)!
      .slice(0, 3)
      .map((channel) => {
        const value = Number(channel) / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
    const [red = 0, green = 0, blue = 0] = channels;
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  }
  const first = luminance(foregroundColor);
  const second = luminance(backgroundColor);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("keeps the popup and annotation readable with doubled zoom in both color schemes", async ({
  extensionContext,
  popup,
}) => {
  await popup.setViewportSize({ width: 336, height: 600 });
  await popup.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  const first = popup.getByRole("checkbox", { name: "Aktifkan deteksi" });
  await expect(first).toBeEnabled();
  await popup.keyboard.press("Tab");
  await expect(first).toBeFocused();
  expect(
    await first.evaluate((node) => getComputedStyle(node).outlineStyle),
  ).toBe("solid");

  const page = await openTimeline(extensionContext);
  await page.setViewportSize({ width: 640, height: 720 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await appendPosts(page, [{ id: "4001", text: adHominemText }]);
  const badge = page.locator(annotation);
  const summary = badge.locator("summary");
  await summary.press("Enter");
  await expect(badge.locator("blockquote")).toBeVisible();
  await expect(summary).toBeFocused();

  for (const colorScheme of ["light", "dark"] as const) {
    await popup.emulateMedia({ colorScheme });
    await page.emulateMedia({ colorScheme });
    const root = popup.locator("html");
    for (const item of ["header p", ".session-totals dt", "footer a"]) {
      expect(
        await contrast(popup.locator(item).first(), root),
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      await contrast(badge.locator("blockquote"), badge),
    ).toBeGreaterThanOrEqual(4.5);
    for (const surface of [popup.locator("main"), badge]) {
      expect(
        await surface.evaluate(
          (node) => node.getBoundingClientRect().right <= innerWidth,
        ),
      ).toBe(true);
    }
    await expect(summary).toBeFocused();
  }
});
