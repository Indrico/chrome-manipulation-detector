# Manipulation Detector

A privacy-first Chrome extension for learning to recognize rhetorical patterns in social media posts. The project prioritizes Indonesian and code-switched Indonesian–English. Its explanations focus on wording and evidence. Wording alone cannot establish an author's intent.

## Current status

The Chrome prerelease includes all eight detection categories and integration with the **For You** and **Following** home timelines on `x.com`. Open `https://x.com/home` to see inline explanations as eligible posts enter the viewport. The popup controls detection, annotation visibility, categories, and local feedback.

The adapter recognizes English and Indonesian timeline labels and depends on the rendered X layout. It skips known replies, collapsed posts, and cards with ambiguous structure. Whataboutism and Strawman can compare the main post with a clearly associated, rendered quote card. Browser tests use a mock X feed. Compatibility with the current signed-in X layout remains unverified.

The popup counts each analyzed post revision and each of its detected categories once per tab document while the revision is in the bounded cache. Changes to a quote can update the annotation without recounting the main post. Both totals reset with the browser session.

## Install

1. Download the Chrome ZIP and its SHA-256 checksum from [GitHub Releases](https://github.com/Indrico/chrome-manipulation-detector/releases). Verify the ZIP against the checksum, then extract it.
2. Open `chrome://extensions`, turn on Developer mode, and choose **Load unpacked**. Select the extracted directory that contains `manifest.json`.
3. Open **Manipulation Detector** from the toolbar and refresh the X tab.

## Develop

Use Node.js 22.13+ on the Node 22 line, or Node.js 24+, with npm.

```sh
npm ci
npm run build
```

For a local build, use `.output/chrome-mv3` as the directory to load. Run `npm run dev` for WXT's development workflow and `npm run package:chrome` for a production ZIP.

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

See the [architecture](docs/ARCHITECTURE.md) and [contribution guide](docs/CONTRIBUTING.md) for code boundaries and release checks.
