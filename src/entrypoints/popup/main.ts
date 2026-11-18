import { browser } from "wxt/browser";
import { patternNames, supportedPatternIds } from "../../data/patterns";
import {
  feedbackKey,
  feedbackSchema,
  platformRequest,
  platformStatusSchema,
  readTotals,
  totalsKey,
  type FeedbackRecord,
  type PlatformStatus,
} from "../../storage/activity";
import {
  settingsKey,
  settingsResponseSchema,
  type Settings,
  type SettingsMessage,
} from "../../storage/settings";

const preferences =
  document.querySelector<HTMLFieldSetElement>("#preferences")!;
const enabled = document.querySelector<HTMLInputElement>("#enabled")!;
const annotations = document.querySelector<HTMLInputElement>("#annotations")!;
const categories = document.querySelector<HTMLFieldSetElement>("#categories")!;
const reset = document.querySelector<HTMLButtonElement>("#reset")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const platform = document.querySelector<HTMLElement>("#platform")!;
const posts = document.querySelector<HTMLElement>("#posts")!;
const patterns = document.querySelector<HTMLElement>("#patterns")!;
const exportFeedback =
  document.querySelector<HTMLButtonElement>("#export-feedback")!;
const clearFeedback =
  document.querySelector<HTMLButtonElement>("#clear-feedback")!;

let settings: Settings | undefined;
let feedback: FeedbackRecord[] = [];
let totalsChanged = false;
let feedbackChanged = false;
const platformLabels: Readonly<Record<PlatformStatus, string>> = {
  active: "Linimasa aktif",
  waiting: "Menunggu linimasa For You atau Following",
  paused: "Deteksi dijeda",
  unsupported: "Buka linimasa For You atau Following",
};

async function refreshPlatform() {
  let result: PlatformStatus = "unsupported";
  try {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id !== undefined) {
      const reply: unknown = await browser.tabs.sendMessage(
        tab.id,
        platformRequest,
        { frameId: 0 },
      );
      result = platformStatusSchema.safeParse(reply).data ?? result;
    }
  } catch {
    // Tabs outside the supported site have no content script.
  }
  // The current settings also cover the interval before the tab receives a change.
  platform.textContent =
    platformLabels[
      result === "active" &&
      settings &&
      (!settings.enabled ||
        supportedPatternIds.every((id) => settings?.categories[id] === false))
        ? "paused"
        : result
    ];
}

function renderTotals(value: unknown) {
  const totals = readTotals(value);
  posts.textContent = totals.posts.toLocaleString("id-ID");
  patterns.textContent = totals.patterns.toLocaleString("id-ID");
}

function renderFeedback(value: unknown) {
  feedback = feedbackSchema.safeParse(value).data ?? [];
  exportFeedback.disabled = clearFeedback.disabled = !feedback.length;
}

async function loadActivity() {
  const values = await Promise.allSettled([
    browser.storage.session.get(totalsKey),
    browser.storage.local.get(feedbackKey),
  ]);
  const [totals, reports] = values;
  if (!totalsChanged && totals.status === "fulfilled")
    renderTotals(totals.value[totalsKey]);
  if (!feedbackChanged && reports.status === "fulfilled")
    renderFeedback(reports.value[feedbackKey]);
}

const categoryControls = supportedPatternIds.map((patternId) => {
  const control = document.createElement("input");
  control.type = "checkbox";
  const label = document.createElement("label");
  label.append(control, patternNames[patternId]);
  categories.append(label);

  control.addEventListener("change", () =>
    request(
      {
        type: "settings:patch",
        patch: { categories: { [patternId]: control.checked } },
      },
      "Pengaturan tersimpan.",
    ),
  );
  return { patternId, control };
});

function render() {
  if (!settings) return;
  enabled.checked = settings.enabled;
  annotations.checked = settings.showAnnotations;
  for (const { patternId, control } of categoryControls) {
    control.checked = settings.categories[patternId] !== false;
  }
}

async function request(message: SettingsMessage, successMessage = "") {
  const focused = document.activeElement;
  preferences.disabled = true;

  try {
    const response = settingsResponseSchema.safeParse(
      await browser.runtime.sendMessage(message),
    );
    if (!response.success || !response.data.ok) {
      status.textContent = "Pengaturan tidak dapat dimuat atau disimpan.";
      return;
    }
    settings = response.data.settings;
    status.textContent = successMessage;
  } catch {
    status.textContent =
      "Pengaturan tidak dapat dimuat atau disimpan. Coba buka kembali popup.";
  } finally {
    render();
    void refreshPlatform();
    preferences.disabled = settings === undefined;
    if (
      settings &&
      focused instanceof HTMLElement &&
      preferences.contains(focused) &&
      document.activeElement === document.body
    ) {
      focused.focus();
    }
  }
}

enabled.addEventListener("change", () =>
  request(
    { type: "settings:patch", patch: { enabled: enabled.checked } },
    "Pengaturan tersimpan.",
  ),
);
annotations.addEventListener("change", () =>
  request(
    { type: "settings:patch", patch: { showAnnotations: annotations.checked } },
    "Pengaturan tersimpan.",
  ),
);
reset.addEventListener("click", () =>
  request({ type: "settings:reset" }, "Pengaturan dikembalikan ke nilai awal."),
);

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes[totalsKey]) {
    totalsChanged = true;
    renderTotals(changes[totalsKey].newValue);
  }
  if (area === "local" && changes[feedbackKey]) {
    feedbackChanged = true;
    renderFeedback(changes[feedbackKey].newValue);
  }
  if (area === "local" && changes[settingsKey]) void refreshPlatform();
});

exportFeedback.addEventListener("click", () => {
  const link = document.createElement("a");
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(feedback, null, 2)], { type: "application/json" }),
  );
  link.href = url;
  link.download = "manipulation-detector-feedback.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});

clearFeedback.addEventListener("click", () => {
  void (async () => {
    try {
      const cleared: unknown = await browser.runtime.sendMessage({
        type: "feedback:clear",
      });
      status.textContent =
        cleared === true
          ? "Umpan balik lokal dihapus."
          : "Umpan balik gagal dihapus.";
    } catch {
      status.textContent = "Umpan balik gagal dihapus.";
    }
  })();
});

void loadActivity();
void request({ type: "settings:get" });
