import { expect, type Page } from "@playwright/test";
import { storage, test } from "../support/extension-fixture";
import {
  adHominemText,
  annotation,
  appendPosts,
  benignText,
  openTimeline,
} from "../support/x-timeline";

async function selectSearchTab(page: Page, name: string, path: string) {
  await page.evaluate(
    ({ name, path }) => {
      history.pushState({}, "", path);
      for (const tab of document.querySelectorAll('[role="tab"]')) {
        tab.setAttribute(
          "aria-selected",
          String(tab.textContent?.trim() === name),
        );
      }
    },
    { name, path },
  );
}

for (const path of ["/home", "/search?q=fixture&f=live"]) {
  test(`handles semantic X cards on ${path}`, async ({
    extensionContext,
    popup,
  }) => {
    const page = await openTimeline(extensionContext, path);
    await page.locator("main").evaluate(
      (main, { text, search }) => {
        main.removeAttribute("data-testid");
        const selected = main.querySelector(
          '[role="tab"][aria-selected="true"]',
        )!;
        if (search) {
          const tab = document.createElement("a");
          tab.href = "/search?q=fixture&f=live";
          tab.setAttribute("role", "tab");
          tab.setAttribute("aria-selected", "true");
          tab.setAttribute("aria-current", "page");
          tab.textContent = "Filter Terbaru";
          selected.replaceWith(tab);
        } else {
          selected.textContent = "For \n you";
        }
        const list = document.createElement("ol");
        if (!search) list.setAttribute("role", "feed");
        for (const [index, id] of ["7401", "7402", "7403"].entries()) {
          const cell = document.createElement("li");
          cell.dataset.index = String(index);
          const article = document.createElement("article");
          if (index === 1) {
            const reply = document.createElement("span");
            reply.textContent = "Membalas pengguna lain";
            article.append(reply);
          }
          const body = document.createElement("div");
          body.dir = "auto";
          body.lang = "in";
          body.textContent = text;
          const timestamp = document.createElement("a");
          timestamp.dataset.baseUiTooltipTrigger = "";
          timestamp.href = `/fixture/status/${id}`;
          timestamp.textContent = "1m";
          article.append(body, timestamp);
          if (search) {
            const link = document.createElement("div");
            link.dataset.navigationStop = "";
            link.setAttribute("role", "link");
            link.append(article);
            cell.append(link);
          } else {
            cell.append(article);
          }
          list.append(cell);
        }
        // The third card is inside a widget rather than the main feed.
        const sidebar = document.createElement("aside");
        sidebar.append(list.lastElementChild!);
        list.append(sidebar);
        const section = main.querySelector("section")!;
        if (search) {
          const searchFeed = document.createElement("div");
          searchFeed.id = "urt:search:fixture:default";
          searchFeed.append(list);
          section.replaceChildren(searchFeed);
        } else {
          section.replaceWith(list);
        }
      },
      { text: adHominemText, search: path.startsWith("/search") },
    );

    await expect(
      page.locator('li[data-index="0"]').locator(annotation),
    ).toBeVisible();
    await expect(page.locator(annotation)).toHaveCount(1);
    await expect(popup.locator("#posts")).toHaveText("1");
  });
}

test("analyzes visible Top and Latest search posts while preserving session counts and privacy", async ({
  extensionContext,
  popup,
}) => {
  const page = await openTimeline(
    extensionContext,
    "/search/?q=kata-rahasia-fixture&src=typed_query",
  );
  await page.getByRole("searchbox", { name: "Search" }).fill(adHominemText);
  await appendPosts(page, [
    { id: "7101", text: adHominemText },
    { id: "7102", text: benignText },
    { id: "7103", text: adHominemText, kind: "reply" },
  ]);
  await appendPosts(page, [{ id: "7104", text: adHominemText }], "aside");
  const topBadge = page.locator('[data-mock-id="7101"]').locator(annotation);
  await expect(topBadge).toBeVisible();
  await expect(popup.locator("#posts")).toHaveText("2");
  await expect(page.locator(annotation)).toHaveCount(1);
  await popup.reload();
  await expect(popup.locator("#platform")).toHaveText("Deteksi aktif");

  await selectSearchTab(
    page,
    "Terbaru",
    "/search?q=kata-rahasia-fixture&f=live",
  );
  await page.locator("#timeline").evaluate((node) => node.replaceChildren());
  await appendPosts(page, [
    { id: "7101", text: adHominemText },
    { id: "7105", text: adHominemText },
  ]);
  await expect(
    page.locator('[data-mock-id="7105"]').locator(annotation),
  ).toBeVisible();
  await expect(popup.locator("#posts")).toHaveText("3");
  await expect(popup.locator("#patterns")).toHaveText("2");
  expect(await storage(popup, "local")).toEqual({});
  expect(await storage(popup, "session")).toEqual({
    sessionTotals: { posts: 3, patterns: 2 },
  });

  await page.evaluate(() =>
    history.pushState({}, "", "/search?q=kata-rahasia-fixture&f=user"),
  );
  await expect(page.locator(annotation)).toHaveCount(0);
  await selectSearchTab(
    page,
    "People",
    "/search?q=kata-rahasia-fixture&f=user",
  );
  await appendPosts(page, [{ id: "7106", text: adHominemText }]);
  await popup.reload();
  await expect(popup.locator("#platform")).toHaveText(
    "Buka beranda, hasil Top/Latest, atau detail unggahan X",
  );
  await expect(popup.locator("#posts")).toHaveText("3");
});

test("switches between home and search in one tab and ignores unsupported selected tabs", async ({
  extensionContext,
  popup,
}) => {
  const page = await openTimeline(extensionContext);
  await appendPosts(page, [{ id: "7201", text: adHominemText }]);
  const badge = page.locator(annotation);
  await expect(badge).toHaveCount(1);
  await expect(popup.locator("#posts")).toHaveText("1");

  await page.evaluate(() => {
    history.pushState({}, "", "/search?q=fixture");
    document.querySelector('[role="tab"][aria-selected="true"]')!.textContent =
      "Populer";
  });
  await appendPosts(page, [{ id: "7202", text: adHominemText }]);
  await expect(badge).toHaveCount(2);
  await expect(popup.locator("#posts")).toHaveText("2");

  await page.evaluate(() => {
    document.querySelector('[role="tab"][aria-selected="true"]')!.textContent =
      "Media";
  });
  await expect(badge).toHaveCount(0);
  await page.evaluate(() => {
    history.pushState({}, "", "/home");
    document.querySelector('[role="tab"][aria-selected="true"]')!.textContent =
      "For you";
  });
  await expect(badge).toHaveCount(2);
  await expect(popup.locator("#posts")).toHaveText("2");
});
