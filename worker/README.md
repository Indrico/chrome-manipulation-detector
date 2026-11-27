# Online analysis pilot

The extension runs locally by default. The standard build offers online analysis using the user's Groq API key. A separate configured pilot uses a project Worker and a Workers AI binding. Pilot users opt in through the popup and share the project's Cloudflare quota.

## Verify locally

Run `npm run test:e2e:online` to build an isolated Chromium fixture and test the actual extension-to-Worker protocol against a simulated inference provider. The harness uses loopback port 18766. The built manifest still uses optional host permission. Playwright loads a separate copy with that loopback permission already granted because the native Chrome permission dialog is outside the test page.

Run `npm run evaluate:online -- --local` for the local rule baseline on the 40 synthetic held-out posts. To compare GLM-4.7-Flash, SEA-LION v4, and Gemma 4 on the same examples, set `CLOUDFLARE_ACCOUNT_ID` and a `CLOUDFLARE_API_TOKEN` scoped to Workers AI on the operator's account and run `npm run evaluate:online`. Use `--model=<model-id>` after `--` to benchmark a single model. Each model gets four batches. The report includes precision, recall, invalid or failed results, p95 batch duration, and token counts if the provider returns them. The REST benchmark measures provider response time from the machine running it. The five-second p95 target for dispatch-to-annotation needs a separate browser timing on the configured pilot. Use the Workers AI dashboard to check actual Neurons. [Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)

Gemma 4 is the current pilot default. On one run of the synthetic holdout, it found all nine labeled positive patterns, produced ten extra flags, and returned one invalid post result. All four batches returned within ten seconds. The batch p95 was 8.8 seconds on that run. These are synthetic results for an experimental mode.

## Configure a pilot

1. Run the model comparison on Cloudflare Workers Free. Choose the faster model among those with reliable responses and acceptable precision and recall on the synthetic holdout. Keep the online build internal until the model, feed permissions, and privacy notice are ready for real X content.
2. Set the chosen model in `LLM_MODEL` in `worker/wrangler.jsonc`. Use Wrangler 4.168.0 and run `npx wrangler@4.168.0 deploy --dry-run --config worker/wrangler.jsonc`. Use `npx wrangler@4.168.0 deploy --config worker/wrangler.jsonc` from the project Cloudflare account for the pilot. Keep the account on Workers Free to stop inference when the shared allowance is exhausted.
3. Set `MD_ONLINE_ORIGIN` to the exact HTTPS origin of the Worker when building or packaging the extension. The build enables only that optional host permission and sets the network CSP to the same origin. Omit this variable for the standard build with optional personal Groq keys. In the pilot build, enable **Analisis online otomatis** from the popup after reading the disclosure.

The Worker accepts only `POST /v1/analyze` with a bounded batch. Empty matches indicate a successfully analyzed post. A null result indicates missing or invalid model output. The public endpoint applies a short Cloudflare limit by connection IP. Browser-side counts cap each installation at 30 posts daily, with up to ten posts grouped in one request. Server-side model changes do not require an extension update. Request logging and caching are disabled for this route.
