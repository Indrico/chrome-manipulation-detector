# Manipulation Detector

A privacy-first Chrome extension for learning to recognize rhetorical patterns in social media posts. The project prioritizes Indonesian and code-switched Indonesian–English. Its explanations focus on wording and evidence. Wording alone cannot establish an author's intent.

## Current status

The current source includes all eight detection categories and supports X and Threads. On X, it covers the **For You** and **Following** home timelines, **Top** and **Latest** search results, and the main post on a direct status page. On `www.threads.com`, it covers **For you** and **Following**, keyword search results containing posts, and the main post on its detail page. Inline explanations appear as eligible posts enter the viewport. The popup controls detection, annotation visibility, categories, and local feedback.

The adapters depend on each site's rendered layout. They skip known replies in feeds, surrounding posts on detail pages, collapsed posts, and cards with ambiguous structure. Whataboutism and Strawman can compare the main post with a clearly associated, rendered quote card. Threads analysis targets an identifiable main column. Browser regression tests use synthetic X and Threads feeds.

The popup counts each analyzed post revision and each of its detected categories once per tab document while the revision is in the bounded cache. Changes to a quote can update the annotation without recounting the main post. Both totals reset with the browser session.

Enable **Model lokal (eksperimental)** in the popup to try additional on-device suggestions for Ad Hominem, False Dilemma, and Guilt Tripping. The setting is off by default. See the [pilot model evaluation](docs/DETECTION-METHODOLOGY.md#experimental-local-model) for results and limits.

To enable online analysis on X, create an [API key in your Groq account](https://console.groq.com/keys), paste it into **API key Groq** in the popup, and choose **Simpan dan aktifkan**. To use the same key on Threads, enable **Analisis online di Threads**. The standard build sends batches of up to ten visible posts directly to Groq and uses the quota of your Groq organization. The extension shows **Analisis lokal** when the online service cannot complete an analysis. Choose **Putuskan Groq** to remove the key from Chrome. See the [privacy policy](docs/PRIVACY.md).

## Install

1. Download the Chrome ZIP and its SHA-256 checksum from [GitHub Releases](https://github.com/Indrico/chrome-manipulation-detector/releases). Verify the ZIP against the checksum, then extract it.
2. Open `chrome://extensions`, turn on Developer mode, and choose **Load unpacked**. Select the extracted directory that contains `manifest.json`.
3. Open **Manipulation Detector** from the toolbar and refresh the X or Threads tab.

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
npm run test:e2e:online
npm run test:e2e:online -- --groq
npm run evaluate
```

On Windows PowerShell, use `npm.cmd` and `npx.cmd` if script execution policy blocks their PowerShell shims. The Playwright checks load the production extension in bundled Chromium.

## Detection, privacy, and license

See the [detection methodology and synthetic evaluation](docs/DETECTION-METHODOLOGY.md), [privacy policy](docs/PRIVACY.md), and [MIT license](LICENSE). The license covers original project code. The [pilot dataset](datasets/manipulation-pilot/README.md) documents third-party sources and their terms.

See the [architecture](docs/ARCHITECTURE.md) and [contribution guide](docs/CONTRIBUTING.md) for code boundaries and release checks.
