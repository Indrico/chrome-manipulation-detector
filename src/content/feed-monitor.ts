import type {
  LocatedPost,
  PlatformAdapter,
} from "../adapters/platform-adapter";
import { analyzePost } from "../core/detection-engine";
import { contextualPatterns, supportedPatternIds } from "../data/patterns";
import type { DetectionResult } from "../models/detection-result";
import type { PatternId } from "../models/pattern";
import type {
  FeedbackEntry,
  PlatformStatus,
  SessionTotals,
} from "../storage/activity";
import { enabledPatterns, type Settings } from "../storage/settings";
import { createAnnotation } from "../ui/annotation";

type CachedMatch = Omit<DetectionResult, "matchedText">;
type CachedRevision = {
  results: Map<PatternId, CachedMatch | null>;
  countedPatterns: Set<PatternId>;
  contextFingerprint?: string;
};
type TrackedPost = {
  post: LocatedPost;
  intersecting: boolean;
  complete: boolean;
  running: boolean;
  generation: number;
  annotationOpen: boolean;
  annotation?: HTMLElement;
};

const maxCachedRevisions = 500;
const maxPostLength = 10_000;
const maxCardsPerFrame = 8;
const frameBudgetMs = 4;

function remember<K, V>(cache: Map<K, V>, key: K, value: V) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > maxCachedRevisions) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
}

function isVisible(body: HTMLElement): boolean {
  if (body.closest('[hidden], [aria-hidden="true"]')) return false;
  if (
    body.checkVisibility &&
    !body.checkVisibility({ opacityProperty: true, visibilityProperty: true })
  )
    return false;
  const { top, bottom, left, right, width, height } =
    body.getBoundingClientRect();
  return (
    width > 0 &&
    height > 0 &&
    bottom > 0 &&
    right > 0 &&
    top < innerHeight &&
    left < innerWidth
  );
}

export function createFeedMonitor(
  adapter: PlatformAdapter,
  reportTotals: (delta: SessionTotals) => void,
  saveFeedback: (entry: FeedbackEntry) => Promise<boolean>,
) {
  const tracked = new Map<HTMLElement, TrackedPost>();
  const byBody = new WeakMap<Element, TrackedPost>();
  const byAnnotation = new WeakMap<Node, TrackedPost>();
  const pending = new Set<HTMLElement>();
  const revisions = new Map<string, CachedRevision>();
  const dismissed = new Map<string, true>();
  const encoder = new TextEncoder();
  let settings: Settings | undefined;
  let activePatterns: readonly PatternId[] = [];
  let feed: HTMLElement | null = null;
  let feedPath: string | undefined;
  let watchRoot = false;
  let refreshRoot = false;
  let suspended = false;
  let frame = 0;
  let delta: SessionTotals = { posts: 0, patterns: 0 };

  const rootObserver = new MutationObserver((mutations) => {
    if (
      !feed?.isConnected ||
      mutations.some(
        ({ target, type }) => type === "attributes" || !feed?.contains(target),
      )
    ) {
      refreshRoot = true;
      schedule();
    }
  });
  const feedObserver = new MutationObserver((mutations) => {
    const changed = new Set<HTMLElement>();
    for (const mutation of mutations) {
      if (
        mutation.target instanceof HTMLElement &&
        tracked.has(mutation.target)
      )
        changed.add(mutation.target);
      for (const card of adapter.changedCards(mutation)) changed.add(card);
      for (const node of mutation.removedNodes) {
        const owner = byAnnotation.get(node);
        if (owner) changed.add(owner.post.card);
      }
      for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
        for (const card of adapter.findCards(node)) changed.add(card);
      }
    }
    for (const card of changed) {
      const state = tracked.get(card);
      if (state) invalidate(state);
      pending.add(card);
    }
    if (changed.size) schedule();
  });
  const viewport = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const state = byBody.get(entry.target);
      if (!state) continue;
      state.intersecting = entry.isIntersecting;
      if (state.intersecting && !state.complete) pending.add(state.post.card);
    }
    if (pending.size) schedule();
  });

  function schedule() {
    if (!frame && !suspended && !document.hidden)
      frame = requestAnimationFrame(processFrame);
  }

  function flushTotals() {
    if (!delta.posts && !delta.patterns) return;
    const complete = delta;
    delta = { posts: 0, patterns: 0 };
    reportTotals(complete);
  }

  function removeAnnotation(state: TrackedPost) {
    if (!state.annotation) return;
    state.annotationOpen =
      state.annotation.shadowRoot?.querySelector("details")?.open ?? false;
    if (document.activeElement === state.annotation) {
      state.post.focusTarget.focus({ preventScroll: true });
    }
    byAnnotation.delete(state.annotation);
    state.annotation.remove();
    delete state.annotation;
  }

  function invalidate(state: TrackedPost) {
    state.generation++;
    state.complete = false;
    removeAnnotation(state);
  }

  function untrack(state: TrackedPost) {
    invalidate(state);
    viewport.unobserve(state.post.body);
    byBody.delete(state.post.body);
    tracked.delete(state.post.card);
  }

  function setFeed(next: HTMLElement | null) {
    const nextPath = next ? location.pathname : undefined;
    if (next === feed && nextPath === feedPath) return;
    feedObserver.disconnect();
    for (const state of tracked.values()) untrack(state);
    pending.clear();
    feed = next;
    feedPath = nextPath;
    if (!feed) return;
    feedObserver.observe(feed, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true,
      attributes: true,
      attributeFilter: [
        "aria-hidden",
        "hidden",
        "data-testid",
        "href",
        "role",
        "style",
        "class",
      ],
    });
    for (const card of adapter.findCards(feed)) pending.add(card);
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    rootObserver.disconnect();
    watchRoot = false;
    setFeed(null);
    flushTotals();
  }

  function processFrame() {
    frame = 0;
    flushTotals();
    if (suspended || !activePatterns.length || !adapter.supports(location)) {
      stop();
      return;
    }
    if (!watchRoot) {
      rootObserver.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["aria-selected"],
      });
      watchRoot = true;
    }
    if (refreshRoot || !feed?.isConnected) {
      refreshRoot = false;
      setFeed(adapter.findFeed(document));
    }
    const started = performance.now();
    let processed = 0;
    for (const card of pending) {
      pending.delete(card);
      reconcile(card);
      if (
        ++processed >= maxCardsPerFrame ||
        performance.now() - started >= frameBudgetMs
      )
        break;
    }
    if (pending.size) schedule();
  }

  function reconcile(card: HTMLElement) {
    const post = feed && card.isConnected && adapter.locatePost(card, feed);
    const state = tracked.get(card);
    if (!post || state?.post.body !== post.body || state.post.id !== post.id) {
      if (state) untrack(state);
      if (!post) return;
      const next = {
        post,
        complete: false,
        intersecting: false,
        running: false,
        generation: 0,
        annotationOpen: false,
      };
      tracked.set(card, next);
      byBody.set(post.body, next);
      viewport.observe(post.body);
      return;
    }
    state.post = post;
    if (state.intersecting && !state.complete && !state.running)
      void analyzeVisible(state);
  }

  function canAnalyze(state: TrackedPost) {
    return (
      !suspended &&
      !document.hidden &&
      state.intersecting &&
      activePatterns.length > 0 &&
      adapter.supports(location) &&
      feedPath === location.pathname &&
      !!feed?.contains(state.post.card) &&
      isVisible(state.post.body)
    );
  }

  async function fingerprint(text: string) {
    const hash = await crypto.subtle.digest("SHA-256", encoder.encode(text));
    return [...new Uint8Array(hash)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  async function analyzeVisible(state: TrackedPost) {
    if (!canAnalyze(state)) return;
    const input = adapter.readPost(
      state.post,
      activePatterns.some((id) => contextualPatterns.includes(id)),
    );
    const { text } = input;
    const context = input.context?.filter(
      (item) => item.text.length <= maxPostLength,
    );
    if (!text || text.length > maxPostLength) {
      state.complete = true;
      return;
    }
    const generation = state.generation;
    state.running = true;
    let bodyFingerprint: string;
    let contextFingerprint: string | undefined;
    try {
      [bodyFingerprint, contextFingerprint] = await Promise.all([
        fingerprint(text),
        context?.length ? fingerprint(JSON.stringify(context)) : undefined,
      ]);
    } catch {
      return;
    } finally {
      state.running = false;
      if (
        state.generation !== generation &&
        tracked.get(state.post.card) === state
      ) {
        pending.add(state.post.card);
        schedule();
      }
    }
    if (state.generation !== generation || !canAnalyze(state)) return;
    const key = `${state.post.id}:${bodyFingerprint}`;
    let cached = revisions.get(key);
    if (!cached) {
      cached = { results: new Map(), countedPatterns: new Set() };
      delta.posts++;
    }
    const { results, countedPatterns } = cached;
    if (cached.contextFingerprint !== contextFingerprint) {
      for (const id of contextualPatterns) results.delete(id);
      cached.contextFingerprint = contextFingerprint;
    }
    const missing = activePatterns.filter((id) => !results.has(id));
    for (const id of missing) results.set(id, null);
    for (const result of analyzePost({ text, context }, missing)) {
      if (result.confidenceLevel === "insufficient_context") continue;
      const {
        patternId,
        patternName,
        confidenceLevel,
        span,
        explanation,
        evidence,
        limitations,
      } = result;
      results.set(patternId, {
        patternId,
        patternName,
        confidenceLevel,
        span,
        explanation,
        evidence,
        limitations,
      });
      if (!countedPatterns.has(patternId)) {
        countedPatterns.add(patternId);
        delta.patterns++;
      }
    }
    remember(revisions, key, cached);
    state.complete = true;
    if (delta.posts || delta.patterns) schedule();

    if (!settings?.showAnnotations || dismissed.has(state.post.id)) return;
    const matches: DetectionResult[] = [];
    for (const id of activePatterns) {
      const result = results.get(id);
      if (result)
        matches.push({
          ...result,
          matchedText: text.slice(result.span.start, result.span.end),
        });
    }
    if (!matches.length) return;
    const annotation = createAnnotation(
      matches,
      state.annotationOpen,
      () => {
        const id = state.post.id;
        remember(dismissed, id, true);
        state.post.focusTarget.focus({ preventScroll: true });
        for (const other of tracked.values()) {
          if (other.post.id === id) removeAnnotation(other);
        }
      },
      saveFeedback,
    );
    state.post.card.after(annotation);
    state.annotation = annotation;
    byAnnotation.set(annotation, state);
  }

  return {
    setSettings(next: Settings) {
      const nextPatterns = enabledPatterns(next, supportedPatternIds);
      const changed =
        next.showAnnotations !== settings?.showAnnotations ||
        nextPatterns.join() !== activePatterns.join();
      settings = next;
      activePatterns = nextPatterns;
      if (!activePatterns.length) {
        stop();
        return;
      }
      if (changed) {
        for (const state of tracked.values()) {
          invalidate(state);
          pending.add(state.post.card);
        }
      }
      refreshRoot = true;
      schedule();
    },
    routeChanged() {
      refreshRoot = true;
      schedule();
    },
    resume() {
      suspended = false;
      refreshRoot = true;
      for (const state of tracked.values()) {
        if (state.intersecting && !state.complete) pending.add(state.post.card);
      }
      schedule();
    },
    suspend() {
      suspended = true;
      stop();
    },
    status(): PlatformStatus {
      if (!adapter.supports(location)) return "unsupported";
      if (settings && !activePatterns.length) return "paused";
      return settings &&
        feed?.isConnected &&
        feedPath === location.pathname &&
        tracked.size > 0
        ? "active"
        : "waiting";
    },
  };
}
