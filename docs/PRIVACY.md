# Privacy policy

Manipulation Detector is an educational Chrome extension. It runs content scripts on `x.com` and `www.threads.com` to follow navigation within each site. By default, analysis runs locally on eligible visible posts in supported home feeds, search results, and the main post on a direct detail page. Search terms stay out of detection input and storage. When a context-dependent category is enabled, the extension can read an eligible quote rendered in the same card. It never fetches linked posts for context. The extension does not request sign-in or send analytics.

Chrome local extension storage holds preferences and optional feedback counts grouped by detection category and predefined reason. Chrome session storage holds the total number of post revisions analyzed and patterns detected. Post text, quote text, excerpts, post IDs, URLs, author details, and browsing history stay out of extension storage. The tab keeps a bounded in-memory cache of post IDs, text and context fingerprints, and evidence offsets to avoid repeated work. Displayed excerpts come from the main post.

To delete saved preferences, choose **Atur ulang pengaturan** in the popup. Under **Umpan balik lokal**, choose **Hapus umpan balik** to clear feedback or **Ekspor JSON** to download the counts manually. The extension never uploads the export. Chrome clears local extension storage when you remove the extension.

Submitting feedback requires an interaction with the annotation control. Production extension pages restrict network connections, and the content script reads eligible text from the rendered page.

## Optional online analysis with Groq

Choosing **Simpan dan aktifkan** after entering an API key asks Chrome for permission to connect to Groq and enables online analysis on X. Threads requires separate consent via **Analisis online di Threads**, which is off by default and uses the same key. The extension sends requests directly to Groq and applies the rate limits of the user's Groq organization. The API key stays in the extension's local IndexedDB and is sent to Groq in the authorization header. The key is excluded from Chrome sync, feedback exports, and content script messages. It is stored locally without added encryption. **Putuskan Groq** and **Atur ulang pengaturan** remove the stored key and optional connection permission. You can revoke a key from your Groq account.

Online requests include eligible visible post text, available visible quote text needed for the selected categories, and the category IDs. The extension masks account handles, email addresses, and links in the text before transmission. Post IDs, page addresses, search terms, author metadata, account cookies, and feedback are excluded. Text can still identify people through its wording. The extension keeps posts marked as restricted by recognized page indicators on the device. Groq's data handling is described in its [data policy](https://console.groq.com/docs/your-data).

## Separate Cloudflare pilot builds

In a configured pilot build, **Analisis online otomatis** asks for consent and permission to connect to one project endpoint. Once granted, online analysis starts automatically on eligible X pages. An explicit choice to turn the mode off is respected. The mode sends a batch of eligible visible post text, available visible quote text needed for enabled categories, and the category selections. Account handles, email addresses, and links in the text are masked before transmission. Post IDs, page addresses, search terms, author metadata, account cookies, and feedback do not accompany requests. Text may still identify people through its wording. The pilot skips content marked as restricted by recognized X page indicators.

The project Worker uses the connection IP to apply a short rate limit. Request text and model results are processed in memory, with application request logging and caching disabled. Cloudflare processes text using Workers AI. Its standard inference policy describes retention exceptions and operational metadata. [Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/)

The browser stores the date and numbers of posts and batches sent to enforce the daily limit. A temporary service status stays in session storage. Turn off the online mode or reset preferences to stop sending text and remove the optional connection permission. The daily usage count expires as a limit at the next UTC day and Chrome removes it when the extension is uninstalled.
