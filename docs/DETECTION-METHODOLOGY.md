# Detection methodology

Manipulation Detector looks for relationships between parts of a message. It requires evidence that a personal attack dismisses an argument, a forced choice shuts out alternatives, or an appeal to obligation pressures someone to act. An isolated insult, a genuine choice between two available options, and an expression of disappointment can all appear in a post without producing a result.

## Pipeline

1. Accept a post's text and optional source-tagged context. Preserve the original text offsets through sentence segmentation.
2. Normalize Unicode, case, and spacing. Map whole slang tokens such as `lu`, `nggak`, and `krn` to forms used by the rules. Use Indonesian and English lexical cues to identify possible code-switching. The language hint never excludes either rule vocabulary.
3. Mask balanced quotations and look for explicit reporting, teaching, and satire cues. Keep related post text separate from the author's own text.
4. Check linked clauses or adjacent sentences for the enabled categories. Each detector provides an explanation and evidence for the relationship. The pipeline selects the strongest result per category, breaking ties by the earliest original text span.
5. Validate the result and return the original excerpt. Its span uses UTF-16 offsets with an exclusive end.

| Pattern        | Examples of linked evidence                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Ad Hominem     | A directed personal insult follows disagreement, or the text gives the insult as the reason to dismiss an argument.                        |
| False Dilemma  | The text equates lack of support with a stigmatized alternative, or explicitly presents only two options and stigmatizes one of them.      |
| Guilt Tripping | Past support or sacrifice is used to shame someone for refusing, or moral concern is presented as conditional on taking a specific action. |

`possible` describes wording consistent with a pattern. `likely` requires a more direct relationship in the text. The result schema supports `insufficient_context` and requires a limitation for that level. Phase 2 rules abstain when their required evidence is missing. Strawman and Whataboutism will use the source-tagged context when those detectors are added.

## Synthetic evaluation

The [evaluation corpus](../tests/fixtures/phase-2.json) contains 60 original synthetic posts. Each category has four examples in each of five groups: positive, negative, ambiguous, educational, and context-dependent. The reserved split contains one from each group per category. Labels cover all three categories for each example. The metrics treat `possible` and `likely` as flags and report the ambiguous cases outside the binary evaluation.

| Split       | Pattern        | True positives | True negatives | False positives | False negatives |
| ----------- | -------------- | -------------: | -------------: | --------------: | --------------: |
| Development | Ad Hominem     |              4 |             32 |               0 |               0 |
| Development | False Dilemma  |              4 |             32 |               0 |               0 |
| Development | Guilt Tripping |              5 |             31 |               0 |               0 |
| Reserved    | Ad Hominem     |              2 |             10 |               0 |               0 |
| Reserved    | False Dilemma  |              1 |             11 |               0 |               0 |
| Reserved    | Guilt Tripping |              1 |             11 |               0 |               0 |

On these fixtures each row had precision and recall of 1.0, with false-positive and false-negative rates of 0.0. There were no flags across 12 ambiguous posts. The reserved split has only four positive category labels. Both splits were authored for this project, so their results describe fixture coverage and offer little evidence about performance on live feeds.

Run `npm run evaluate` to reproduce the counts and measure the engine. One Windows run on Node.js 22.23.2 and an Intel Core i7-9750H recorded a median of 0.0295 ms and a p95 of 0.0876 ms over 3,000 warmed evaluations.

## Mock X browser baseline

After building the extension, run `npm run test:e2e -- tests/e2e/x-performance.spec.ts`. This benchmark uses 20 visible insertions for latency and three 25-card batches for the scroll and heap workload.

An initial run in Chromium 159 on Windows with an Intel Core i7-9750H measured a median of 11.7 ms and a p95 of 13.0 ms from insertion to annotation in the DOM. Post-workload renderer JavaScript heap, sampled after garbage collection, was 2.64 MiB with detection paused and 3.38 MiB with detection enabled. The heap includes the fixture page and other JavaScript in the renderer. These results describe one run on the mock feed.

## Limitations

- The rules recognize selected clause structures. Implicit premises, unmarked sarcasm, creative spelling, and indirect forms of attack or pressure can escape detection.
- Explicit framing cues can suppress a genuine match. Quotation and sentence boundaries are approximate in informal posts.
- The engine draws on visible wording. It has no independent knowledge of the facts, missing discussion, or an author's intent.
