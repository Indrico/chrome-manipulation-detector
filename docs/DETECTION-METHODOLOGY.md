# Detection methodology

Manipulation Detector looks for relationships between parts of a message. A flag requires a specific relation, such as a personal insult used to dismiss an argument or time pressure used to discourage verification.

## Pipeline

1. Accept a post's text and optional source-tagged context. Preserve the original text offsets through sentence segmentation.
2. Normalize Unicode, case, and spacing. Map whole slang tokens such as `lu`, `nggak`, and `krn` to forms used by the rules. Use Indonesian and English lexical cues to identify possible code-switching. The language hint never excludes either rule vocabulary.
3. Mask balanced quotations and look for explicit reporting, teaching, and satire cues. Keep related post text separate from the author's own text.
4. Check linked clauses or adjacent sentences for the enabled categories. Each detector provides an explanation and evidence for the relationship. The pipeline selects the strongest result per category, breaking ties by the earliest original text span.
5. Validate the result and return the original excerpt. Its span uses UTF-16 offsets with an exclusive end.

| Pattern             | Examples of linked evidence                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ad Hominem          | A directed personal insult follows disagreement, or the text gives the insult as the reason to dismiss an argument.                                                     |
| False Dilemma       | The text equates lack of support with a stigmatized alternative, or explicitly presents only two options and stigmatizes one of them.                                   |
| Guilt Tripping      | Past support or sacrifice is used to shame someone for refusing, or moral concern is presented as conditional on taking a specific action.                              |
| Appeal to Authority | An expert's statement is presented as a reason to stop checking evidence.                                                                                               |
| Loaded Questions    | An interrogative asks when, how often, or why the addressee still performs an alleged act. Explicit qualifications and admissions suppress the flag.                    |
| False Urgency       | An immediate imperative is paired with a block on verification or an irreversible-loss threat. The detector cannot establish whether a deadline or consequence is real. |
| Whataboutism        | A recognizable criticism is paired with a response that rejects or challenges its discussion and pivots to another actor's actions.                                     |
| Strawman            | A proposal that limits the same subject to a particular time or place is recast as a permanent or universal ban and then attacked.                                      |

`possible` describes wording consistent with a pattern. `likely` requires a more direct relationship in the text. For a candidate Strawman or Whataboutism with missing or ambiguous source material, the engine returns `insufficient_context` with its limitation. The extension omits that result from annotations and session pattern totals.

On X the content script can compare the author text with one clearly associated quote rendered in the same card. It skips hidden, collapsed, or ambiguous quotes. Result spans refer to the author text. Quote changes invalidate cached context-dependent results. The tab counts a primary text revision and each matched category once while the revision remains cached.

## Synthetic evaluation

The [Phase 2](../tests/fixtures/phase-2.json) and [Phase 4](../tests/fixtures/phase-4.json) datasets contain 160 original synthetic posts. Each category has four examples in each of five groups: positive, negative, ambiguous, educational, and context-dependent. The reserved split contains one from each group per category. The metrics treat `possible` and `likely` as flags. Ambiguous cases are evaluated separately.

| Pattern             | Development true positives | Development true negatives | Reserved true positives | Reserved true negatives |
| ------------------- | -------------------------: | -------------------------: | ----------------------: | ----------------------: |
| Ad Hominem          |                          4 |                         92 |                       2 |                      30 |
| False Dilemma       |                          4 |                         92 |                       1 |                      31 |
| Guilt Tripping      |                          5 |                         91 |                       1 |                      31 |
| Appeal to Authority |                          4 |                         92 |                       1 |                      31 |
| Loaded Questions    |                          4 |                         92 |                       1 |                      31 |
| False Urgency       |                          5 |                         91 |                       1 |                      31 |
| Whataboutism        |                          4 |                         92 |                       1 |                      31 |
| Strawman            |                          4 |                         92 |                       1 |                      31 |

Each category had zero false positives and false negatives in both splits, giving precision and recall of 1.0 and both error rates of 0.0 on this dataset. The 32 ambiguous posts produced no flags. The reserved split has only nine positive category labels across all eight categories. Both splits were authored for this project, so the scores measure fixture coverage. Performance on live feeds remains unmeasured.

Run `npm run evaluate` to reproduce the counts and measure engine time.

## Mock X browser baseline

After building the extension, run `npm run test:e2e -- tests/e2e/x-performance.spec.ts`. This benchmark uses 20 visible insertions for latency and three 25-card batches for the scroll and heap workload.

An initial Phase 3 run in Chromium 159 on Windows with an Intel Core i7-9750H measured a median of 11.7 ms and a p95 of 13.0 ms from insertion to annotation in the DOM. Post-workload renderer JavaScript heap, sampled after garbage collection, was 2.64 MiB with detection paused and 3.38 MiB with detection enabled. The heap includes the fixture page and other JavaScript in the renderer. These results describe one run on the mock feed.

A Phase 4 run using the same fixture and hardware measured 11.7 ms median and 12.3 ms p95. Post-workload renderer heap was 2.64 MiB with detection paused and 3.50 MiB with detection enabled.

For the Phase 5 prerelease, the same workload ran three times in Chromium 159 on Windows with an Intel Core i7-9750H. Each run measured 20 annotation insertions.

| Run | Median latency | p95 latency | Renderer heap paused | Renderer heap enabled |
| --- | -------------: | ----------: | -------------------: | --------------------: |
| 1   |        11.8 ms |     12.2 ms |             2.64 MiB |              3.70 MiB |
| 2   |        11.7 ms |     11.9 ms |             2.64 MiB |              3.51 MiB |
| 3   |        11.7 ms |     12.2 ms |             2.64 MiB |              3.50 MiB |

A separate regression recycles the same DOM cards through 600 distinct posts. It checks recent-revision deduplication, eviction from the 500-entry cache, and annotation cleanup when detection is paused or the route changes.

## Limitations

- The rules recognize selected clause structures. Implicit premises, unmarked sarcasm, creative spelling, and indirect forms of attack or pressure can escape detection.
- Explicit framing cues can suppress a genuine match. Quotation and sentence boundaries are approximate in informal posts.
- Context-dependent rules cover selected comparison structures. A loose paraphrase or implicit pivot can escape detection.
- The engine draws on visible wording. It has no independent knowledge of the facts, missing discussion, or an author's intent.
