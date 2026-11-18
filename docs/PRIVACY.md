# Privacy policy

Manipulation Detector is an educational Chrome extension. It runs a content script on `x.com` so it can follow navigation within X. Analysis runs locally on eligible visible text in the For You and Following home timelines. The extension does not request sign-in, send analytics, or use a remote analysis service.

Chrome local extension storage holds preferences and optional feedback counts grouped by detection category and predefined reason. Chrome session storage holds the total number of post revisions analyzed and patterns detected. Post text, excerpts, post IDs, URLs, author details, and browsing history stay out of extension storage. The tab keeps a bounded in-memory cache of post IDs, text fingerprints, and evidence offsets to avoid repeated work. Displayed excerpts come from rendered post text.

To delete saved preferences, choose **Atur ulang pengaturan** in the popup. Under **Umpan balik lokal**, choose **Hapus umpan balik** to clear feedback or **Ekspor JSON** to download the counts manually. The extension never uploads the export. Chrome clears local extension storage when you remove the extension.
