# Contributing

Use Node.js 22.13+ on the Node 22 line, or Node.js 24+, and install from the lockfile with `npm ci`. Follow the [README](../README.md) to load the development build.

## Changes and tests

- Keep selectors and DOM extraction in the platform adapter. Keep detector rules independent of Chrome and the DOM.
- Add synthetic fixtures when changing a rule. Include neutral and ambiguous examples and explain why the expected result is justified. Add contextual pairs for rules that require the original claim.
- Use original synthetic text in fixtures. For a proposed third-party dataset, document its provenance, permission, and separate license. The project's MIT license covers original project code.
- Run `npm test`, `npm run evaluate`, `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run build`, and `npm run test:e2e`. Install Playwright's bundled Chromium with `npx playwright install chromium` before the first browser run.

## Chrome packaging

Run `npm run package:chrome` to create the Chrome MV3 ZIP under `.output/`. Extract it and point `MD_EXTENSION_PATH` at the extracted directory to run browser checks against the packaged files. Compare the ZIP's SHA-256 checksum with the release checksum when installing a release build.
