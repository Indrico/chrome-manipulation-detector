# Architecture

Manipulation Detector is a Chrome Manifest V3 extension. WXT bundles three extension surfaces with Vite. The Indonesian popup and bundled guide are extension pages. The X content script runs in the top-frame isolated world, and the background service worker owns persistent writes.

## From post to annotation

1. The X adapter recognizes the For You and Following home timelines and the Top and Latest search results. On a direct status page it selects the main post by matching its timestamp permalink to the requested status ID. Platform selectors and eligibility rules live in the adapter. It extracts the visible main text and can supply one clearly associated quote as context.
2. The feed monitor batches DOM mutations and uses viewport intersection to select posts. It hashes text locally to deduplicate within a bounded tab-local cache. Cache entries contain fingerprints, evidence spans, and static explanations. Changing the quote only invalidates context-dependent decisions. Pausing or leaving the timeline clears active observers and annotations.
3. The pure detection engine normalizes text, extracts context cues, and dispatches the enabled deterministic detectors. When the local model is enabled, it can add a suggestion for a pilot category without a rule result. It scores up to ten sentences and adjacent pairs in short posts using bundled coefficients. Switching modes invalidates the three affected cached categories and preserves the revision’s session counts. Results preserve their original text spans and use qualitative confidence. The annotation presents candidate results as text in its own shadow root.

## Browser boundaries

The background validates message schemas and their senders, then serializes storage writes. The content script sends aggregate counts and explicitly selected feedback reasons. In local mode, text is processed in the content script and original excerpts are displayed on the same page. Feedback is exported only through a local download initiated in the popup.

The production manifest requests `storage` and scopes its static content script to `https://x.com/*` for navigation within X. The script gates analysis by the current route and selected tab. The standard build limits extension page network connections to `https://api.groq.com` through CSP and requests optional host permission during Groq setup.

## Online analysis with a user API key

The popup sends the key through a message available only to the extension popup. The background stores it in extension-origin IndexedDB and returns only connection preferences. After opt-in, the service worker submits one request at a time, with a batch of up to ten visible posts and a ten-second timeout. It sends the key as an authorization header and validates the structured response against the original evidence and selected categories before returning it to the content script. Each user's Groq organization supplies its own quota. When the provider returns a rate limit, the extension honors its retry interval and labels the local results while it waits.

## Online analysis pilot

The separate Cloudflare pilot build can be configured with a project endpoint. It uses the same feed queue, with dispatch at ten posts or after half a second. Visible posts spill into later batches automatically. The pilot worker reserves available daily quota before dispatch. The endpoint receives numbered-by-position text and applicable quote context. It runs one synchronous inference, validates evidence against each input, and aligns each outcome by its position in the batch.

The content script associates results with revision fingerprints and renders evidence taken from the original local text. Navigation, recycled cards, and preference changes invalidate pending rendering. Results and failed attempts are deduplicated in a bounded tab cache. The popup and affected posts show quota pauses, and eligible visible posts resume when the quota becomes available. [Worker setup and evaluation](../worker/README.md)

The prerelease review checked packaged permissions and notices, message schemas and sender checks, text rendering, storage contents, and feedback export. Browser regressions cover genuine user interactions, ignored synthetic UI actions, and local data handling on a synthetic feed. The inspected package includes Zod and the WXT runtime. Its generated license inventory excludes `picomatch`, which is affected by a [toolchain advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf). As of the prerelease review, the advisory applies through the latest published `picomatch` version, 4.0.7. The production dependency audit reported zero advisories.

See the [privacy policy](PRIVACY.md) for retention and [detection methodology](DETECTION-METHODOLOGY.md) for rule and performance limits.
