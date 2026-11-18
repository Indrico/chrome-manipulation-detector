import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { storage, test } from "../support/extension-fixture";
import {
  adHominemText,
  annotation,
  appendPosts,
  benignText,
  doubleMatchText,
  openTimeline,
} from "../support/x-timeline";

test("annotates visible home posts and keeps interaction and feedback local", async ({
  extensionContext,
  popup,
}) => {
  const feed = await openTimeline(extensionContext);
  await appendPosts(feed, [
    { id: "1", text: doubleMatchText },
    { id: "2", text: benignText },
  ]);
  const cell = feed.locator('[data-mock-id="1"]');
  const badge = cell.locator(annotation);
  const disclosure = badge.locator("summary");
  await expect(disclosure).toHaveText("Kemungkinan pola retorika (2)");
  await expect(
    badge.getByRole("heading", { name: "Dilema palsu" }),
  ).toBeHidden();
  await disclosure.focus();
  await disclosure.press("Enter");
  await expect(
    badge.getByRole("heading", { name: "Dilema palsu" }),
  ).toBeVisible();
  await expect(
    badge.getByRole("heading", { name: "Tekanan rasa bersalah" }),
  ).toBeVisible();
  await expect(badge.locator("blockquote").first()).toHaveText(doubleMatchText);
  await expect(cell.locator('[data-testid="tweetText"]')).toHaveText(
    doubleMatchText,
  );
  await expect(cell.locator("article")).not.toHaveAttribute("data-clicks");
  await cell.getByRole("button", { name: "Like" }).click();
  await expect(cell.locator("article")).toHaveAttribute("data-likes", "1");
  await expect(cell.locator("article")).toHaveAttribute("data-clicks", "1");
  await expect(popup.locator("#posts")).toHaveText("2");
  await expect(popup.locator("#patterns")).toHaveText("2");
  await popup.reload();
  await expect(popup.locator("#platform")).toHaveText("Deteksi aktif");

  const feedback = badge
    .locator("section")
    .filter({ has: feed.getByRole("heading", { name: "Dilema palsu" }) });
  await feedback.getByRole("combobox").selectOption("false_positive");
  await feedback.getByRole("button", { name: "Simpan" }).click();
  await expect(feedback.getByRole("status")).toHaveText(
    "Umpan balik disimpan di perangkat.",
  );
  const expected = [
    { patternId: "false-dilemma", reason: "false_positive", count: 1 },
  ];
  expect(await storage(popup, "local")).toEqual({ feedback: expected });
  expect(await storage(popup, "session")).toEqual({
    sessionTotals: { posts: 2, patterns: 2 },
  });

  await popup.getByText("Umpan balik lokal", { exact: true }).click();
  const [download] = await Promise.all([
    popup.waitForEvent("download"),
    popup.getByRole("button", { name: "Ekspor JSON" }).click(),
  ]);
  expect(JSON.parse(await readFile(await download.path(), "utf8"))).toEqual(
    expected,
  );
  await popup.getByRole("button", { name: "Hapus umpan balik" }).click();
  await expect(popup.getByRole("status")).toHaveText(
    "Umpan balik lokal dihapus.",
  );
  expect(await storage(popup, "local")).toEqual({});

  await feed.bringToFront();
  await badge.getByRole("button", { name: "Tutup anotasi" }).click();
  await expect(badge).toHaveCount(0);
  await expect(cell.locator('a[href="/fixture/status/1"]')).toBeFocused();
  await expect(cell.locator("article")).toBeVisible();
  await cell.evaluate((node) => {
    const body = node.querySelector('[data-testid="tweetText"] span')!;
    body.replaceChildren(document.createTextNode(body.textContent ?? ""));
  });
  await expect(popup.locator("#patterns")).toHaveText("2");
  await expect(badge).toHaveCount(0);
});

test("waits for the viewport and skips replies, quote text, collapsed text, and unrelated cells", async ({
  extensionContext,
  popup,
}) => {
  const feed = await openTimeline(extensionContext);
  await appendPosts(feed, [
    { id: "10", text: adHominemText },
    { id: "11", text: adHominemText, kind: "reply" },
    { id: "12", text: adHominemText, kind: "plain-reply" },
    { id: "13", text: adHominemText, kind: "quoted" },
    { id: "14", text: adHominemText, kind: "truncated" },
    { id: "15", text: adHominemText, kind: "hidden" },
    { id: "16", text: adHominemText, kind: "ambiguous" },
    { id: "17", text: adHominemText },
  ]);
  await appendPosts(feed, [{ id: "99", text: adHominemText }], "aside");
  await expect(
    feed.locator('[data-mock-id="10"]').locator(annotation),
  ).toBeVisible();
  await expect(popup.locator("#posts")).toHaveText("2");
  await expect(feed.locator(annotation)).toHaveCount(1);

  const collapsed = feed.locator('[data-mock-id="14"]');
  await collapsed.getByRole("button", { name: "Show more" }).click();
  await expect(collapsed.locator(annotation)).toBeVisible();
  await expect(popup.locator("#posts")).toHaveText("3");

  const later = feed.locator('[data-mock-id="17"]');
  await later.scrollIntoViewIfNeeded();
  await expect(later.locator(annotation)).toBeVisible();
  await expect(popup.locator("#posts")).toHaveText("4");
  await expect(popup.locator("#patterns")).toHaveText("3");
  await expect(feed.locator("aside").locator(annotation)).toHaveCount(0);
});

test("handles infinite inserts, node reuse, feed replacements and SPA navigation", async ({
  extensionContext,
  popup,
}) => {
  const feed = await openTimeline(extensionContext, "/fixture/status/21");
  await appendPosts(feed, [{ id: "21", text: adHominemText }]);
  await expect(popup.locator("#posts")).toHaveText("0");
  await feed.evaluate(() => history.pushState({}, "", "/home"));
  const first = feed.locator('[data-mock-id="21"]');
  await expect(first.locator(annotation)).toBeVisible();
  await expect(popup.locator("#posts")).toHaveText("1");
  await first.locator(annotation).evaluate((node) => node.remove());
  await expect(first.locator(annotation)).toBeVisible();
  await expect(popup.locator("#posts")).toHaveText("1");

  await first.evaluate((cell) => {
    const duplicate = cell.cloneNode(true) as HTMLElement;
    duplicate.dataset.mockId = "duplicate";
    duplicate.querySelector("[data-manipulation-detector]")?.remove();
    cell.after(duplicate);
  });
  await expect(
    feed.locator('[data-mock-id="duplicate"]').locator(annotation),
  ).toBeVisible();
  await expect(popup.locator("#posts")).toHaveText("1");
  await first.evaluate((cell, text) => {
    cell.querySelector("a")!.href = "/fixture/status/22";
    cell.querySelector(
      '[data-testid="tweetText"] span',
    )!.firstChild!.nodeValue = text;
  }, benignText);
  await expect(first.locator(annotation)).toHaveCount(0);
  await expect(popup.locator("#posts")).toHaveText("2");
  await first.evaluate((cell, text) => {
    cell.querySelector(
      '[data-testid="tweetText"] span',
    )!.firstChild!.nodeValue = text;
  }, adHominemText);
  await expect(first.locator(annotation)).toBeVisible();
  await expect(popup.locator("#posts")).toHaveText("3");

  await feed.evaluate(() => {
    const root = document.querySelector("section")!;
    const replacement = root.cloneNode(true) as HTMLElement;
    replacement.querySelector("#timeline")!.replaceChildren();
    root.replaceWith(replacement);
    const selected = [...document.querySelectorAll('[role="tab"]')];
    selected.forEach((tab) =>
      tab.setAttribute(
        "aria-selected",
        String(tab.textContent?.trim() === "Following"),
      ),
    );
  });
  await appendPosts(feed, [{ id: "23", text: adHominemText }]);
  const following = feed.locator('[data-mock-id="23"]');
  await expect(following.locator(annotation)).toBeVisible();
  await expect(popup.locator("#posts")).toHaveText("4");
  await feed.evaluate(() => {
    document
      .querySelectorAll('[role="tab"]')
      .forEach((tab) =>
        tab.setAttribute(
          "aria-selected",
          String(tab.textContent?.trim() === "Custom list"),
        ),
      );
  });
  await expect(following.locator(annotation)).toHaveCount(0);
  await feed.evaluate(() => {
    document
      .querySelectorAll('[role="tab"]')
      .forEach((tab) =>
        tab.setAttribute(
          "aria-selected",
          String(tab.textContent?.trim() === "Following"),
        ),
      );
  });
  await expect(following.locator(annotation)).toBeVisible();
  await expect(popup.locator("#posts")).toHaveText("4");
  await feed.evaluate(() => history.pushState({}, "", "/explore"));
  await expect(following.locator(annotation)).toHaveCount(0);
});

test("applies visibility, category and master settings without recounting cached revisions", async ({
  extensionContext,
  popup,
}) => {
  const feed = await openTimeline(extensionContext);
  await appendPosts(feed, [{ id: "35", text: doubleMatchText }]);
  const badge = feed.locator('[data-mock-id="35"]').locator(annotation);
  await expect(badge).toBeVisible();
  const visible = popup.getByRole("checkbox", { name: "Tampilkan anotasi" });
  const enabled = popup.getByRole("checkbox", { name: "Aktifkan deteksi" });
  const dilemma = popup.getByRole("checkbox", { name: "Dilema palsu" });
  await visible.uncheck();
  await expect(badge).toHaveCount(0);
  await feed.bringToFront();
  await appendPosts(feed, [{ id: "36", text: adHominemText }]);
  await expect(popup.locator("#posts")).toHaveText("2");
  await expect(feed.locator(annotation)).toHaveCount(0);

  await dilemma.uncheck();
  await visible.check();
  await feed.bringToFront();
  await expect(badge.locator("summary")).toHaveText(
    "Kemungkinan pola retorika (1)",
  );
  await badge.locator("summary").click();
  await expect(
    badge.getByRole("heading", { name: "Tekanan rasa bersalah" }),
  ).toBeVisible();
  await expect(popup.locator("#patterns")).toHaveText("3");

  await enabled.uncheck();
  await expect(feed.locator(annotation)).toHaveCount(0);
  await feed.bringToFront();
  await popup.reload();
  await expect(popup.locator("#platform")).toHaveText("Deteksi dijeda");
  await appendPosts(feed, [{ id: "37", text: adHominemText }]);
  await expect(popup.locator("#posts")).toHaveText("2");
  await enabled.check();
  await feed.bringToFront();
  await expect(
    feed.locator('[data-mock-id="37"]').locator(annotation),
  ).toBeVisible();
  await expect(popup.locator("#posts")).toHaveText("3");
  await expect(popup.locator("#patterns")).toHaveText("4");
});
