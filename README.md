# Manipulation Detector

A privacy-first Chrome extension for learning to recognize rhetorical patterns in social media posts. The project prioritizes Indonesian and code-switched Indonesian–English. Its explanations focus on wording and evidence. Wording alone cannot establish an author's intent.

## Current status

Phases 1–3 cover the extension shell, three detectors (Ad Hominem, False Dilemma, and Guilt Tripping), and integration with the **For You** and **Following** home timelines on `x.com`. Open `https://x.com/home` to see inline explanations as eligible posts enter the viewport. The popup controls detection, annotation visibility, categories, and local feedback.

The adapter recognizes English and Indonesian timeline labels and depends on the rendered X layout. It skips replies it can identify, quoted post text, collapsed posts, and cards with ambiguous structure. Browser tests use a mock X feed. Compatibility with the current signed-in X layout remains unverified.

The popup counts each analyzed post revision once per tab document while it is in the bounded cache. A revision with two detected patterns adds one to the post total and two to the pattern total. Both totals reset with the browser session.

## Install and develop

Use Node.js 22.13+ on the Node 22 line, or Node.js 24+, with npm.

```sh
npm ci
npm run build
```

Open `chrome://extensions`, turn on Developer mode, and choose **Load unpacked**. Select `.output/chrome-mv3`, then open **Manipulation Detector** from the toolbar. Run `npm run dev` for WXT's development workflow.

If the extension is already loaded, reload it in `chrome://extensions`, then refresh the X tab.

## Checks

```sh
npx playwright install chromium
npm test
npm run lint
npm run format:check
npm run typecheck
npm run build
npm run test:e2e
npm run evaluate
```

On Windows PowerShell, use `npm.cmd` and `npx.cmd` if script execution policy blocks their PowerShell shims. The Playwright checks load the production extension in bundled Chromium.

## Detection, privacy, and license

See the [detection methodology and synthetic evaluation](docs/DETECTION-METHODOLOGY.md), [privacy policy](docs/PRIVACY.md), and [MIT license](LICENSE). The license covers original project code. Third-party datasets, if introduced, will carry their own terms.
