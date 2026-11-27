import { browser } from "wxt/browser";
import type { PlatformId } from "../../adapters/platform";
import { patternNames, supportedPatternIds } from "../../data/patterns";
import { onlineOrigin, onlinePermission } from "../../online/config";
import {
  groqKeySchema,
  onlineStatusKey,
  onlineStatusSchema,
  type GroqConnectionMessage,
  type OnlineStatus,
} from "../../online/protocol";
import {
  feedbackKey,
  feedbackSchema,
  platformRequest,
  platformResponseSchema,
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
const localModel = document.querySelector<HTMLInputElement>("#local-model")!;
const online = document.querySelector<HTMLInputElement>("#online")!;
const onlineOptions =
  document.querySelector<HTMLDivElement>("#online-options")!;
const groqOptions = document.querySelector<HTMLDivElement>("#groq-options")!;
const groqForm = document.querySelector<HTMLFormElement>("#groq-form")!;
const groqKey = document.querySelector<HTMLInputElement>("#groq-key")!;
const disconnect =
  document.querySelector<HTMLButtonElement>("#groq-disconnect")!;
const onlineState =
  document.querySelector<HTMLParagraphElement>("#online-state")!;
const categories = document.querySelector<HTMLFieldSetElement>("#categories")!;
const reset = document.querySelector<HTMLButtonElement>("#reset")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const platform = document.querySelector<HTMLElement>("#platform")!;
const platformName = document.querySelector<HTMLElement>("#platform-name")!;
const threadsOptions =
  document.querySelector<HTMLDivElement>("#threads-options")!;
const threadsOnline =
  document.querySelector<HTMLInputElement>("#threads-online")!;
const posts = document.querySelector<HTMLElement>("#posts")!;
const patterns = document.querySelector<HTMLElement>("#patterns")!;
const exportFeedback =
  document.querySelector<HTMLButtonElement>("#export-feedback")!;
const clearFeedback =
  document.querySelector<HTMLButtonElement>("#clear-feedback")!;
const feedbackDisclosure =
  document.querySelector<HTMLElement>(".feedback summary")!;

let settings: Settings | undefined;
let feedback: FeedbackRecord[] = [];
let totalsChanged = false;
let feedbackChanged = false;
let onlineStatus: OnlineStatus | undefined;
let onlineStatusChanged = false;
let onlineStatusTimer: number | undefined;
let activePlatform: PlatformId | undefined;
let platformRequestId = 0;
onlineOptions.hidden = !onlineOrigin;
groqOptions.hidden = !!onlineOrigin;

const onlineLabels: Record<OnlineStatus["reason"], string> = {
  daily_limit: "Batas analisis harian tercapai.",
  quota: onlineOrigin
    ? "Kuota layanan sedang membatasi analisis."
    : "Kuota Groq tercapai. Deteksi lokal aktif sementara.",
  unavailable: onlineOrigin
    ? "Layanan analisis online sedang tidak tersedia."
    : "Groq sedang tidak tersedia. Deteksi lokal aktif sementara.",
  partial: onlineOrigin
    ? "Sebagian unggahan dalam batch terakhir gagal dianalisis."
    : "Sebagian hasil Groq tidak tersedia. Deteksi lokal dipakai untuk unggahan tersebut.",
  permission: onlineOrigin
    ? "Izin layanan dicabut. Aktifkan ulang mode online untuk memberi izin."
    : "Izin Groq dicabut. Putuskan lalu hubungkan kembali.",
  credential:
    "Groq menolak API key atau akses model. Putuskan Groq lalu masukkan key yang bisa digunakan.",
  invalid_output:
    "Hasil batch Groq gagal divalidasi. Deteksi lokal dipakai untuk batch itu.",
};

function renderOnlineStatus() {
  window.clearTimeout(onlineStatusTimer);
  onlineState.hidden = !settings?.online;
  if (!settings?.online) return;
  if (
    activePlatform === "threads" &&
    (onlineOrigin || !settings.threadsOnline)
  ) {
    onlineState.textContent = "Analisis lokal aktif di Threads.";
    return;
  }
  if (
    !settings.enabled ||
    supportedPatternIds.every((id) => settings?.categories[id] === false)
  ) {
    onlineState.textContent = "Mode online dijeda.";
    return;
  }
  const remaining = (onlineStatus?.retryAt ?? 0) - Date.now();
  onlineState.textContent =
    onlineStatus &&
    (remaining > 0 ||
      onlineStatus.reason === "permission" ||
      onlineStatus.reason === "credential" ||
      onlineStatus.reason === "invalid_output" ||
      onlineStatus.reason === "partial")
      ? onlineLabels[onlineStatus.reason]
      : "Mode online aktif untuk unggahan yang terlihat.";
  if (remaining > 0)
    onlineStatusTimer = window.setTimeout(renderOnlineStatus, remaining);
}
const platformLabels: Readonly<Record<PlatformStatus, string>> = {
  active: "Deteksi aktif",
  waiting: "Menunggu unggahan di halaman X",
  paused: "Deteksi dijeda",
  unsupported:
    "Buka beranda, pencarian, atau detail unggahan di X atau Threads",
};

async function refreshPlatform() {
  const requestId = ++platformRequestId;
  let result: PlatformStatus = "unsupported";
  let source: PlatformId | undefined;
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
      const state = platformResponseSchema.safeParse(reply).data;
      source = state?.platform;
      result = state?.status ?? result;
    }
  } catch {
    // Tabs outside the supported site have no content script.
  }
  if (requestId !== platformRequestId) return;
  activePlatform = source;
  platformName.hidden = !source;
  platformName.textContent = source === "threads" ? "Threads · " : "X · ";
  renderOnlineStatus();
  // The current settings also cover the interval before the tab receives a change.
  platform.textContent =
    source === "threads" && result === "waiting"
      ? "Menunggu unggahan di halaman Threads"
      : platformLabels[
          result === "active" &&
          settings &&
          (!settings.enabled ||
            supportedPatternIds.every(
              (id) => settings?.categories[id] === false,
            ))
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
  if (
    !feedback.length &&
    (document.activeElement === clearFeedback ||
      document.activeElement === exportFeedback)
  ) {
    feedbackDisclosure.focus({ preventScroll: true });
  }
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
  localModel.checked = settings.localModel === true;
  localModel.disabled = !!onlineOrigin && settings.online === true;
  online.checked = settings.online === true;
  groqForm.hidden = settings.online === true;
  disconnect.hidden = settings.online !== true;
  threadsOptions.hidden =
    !!onlineOrigin || settings.onlineProvider !== "groq" || !settings.online;
  threadsOnline.checked = settings.threadsOnline === true;
  renderOnlineStatus();
  for (const { patternId, control } of categoryControls) {
    control.checked = settings.categories[patternId] !== false;
  }
}

async function request(
  message: SettingsMessage | GroqConnectionMessage,
  successMessage = "",
) {
  const focused = document.activeElement;
  preferences.disabled = true;

  try {
    const response = settingsResponseSchema.safeParse(
      await browser.runtime.sendMessage(message),
    );
    if (!response.success || !response.data.ok) {
      status.textContent = "Pengaturan tidak dapat dimuat atau disimpan.";
      return false;
    }
    settings = response.data.settings;
    status.textContent = successMessage;
    return true;
  } catch {
    status.textContent =
      "Pengaturan tidak dapat dimuat atau disimpan. Coba buka kembali popup.";
    return false;
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
localModel.addEventListener("change", () =>
  request(
    { type: "settings:patch", patch: { localModel: localModel.checked } },
    "Pengaturan tersimpan.",
  ),
);
threadsOnline.addEventListener("change", () =>
  request(
    { type: "settings:patch", patch: { threadsOnline: threadsOnline.checked } },
    "Pengaturan Threads tersimpan.",
  ),
);
online.addEventListener("change", () => {
  if (!onlineOrigin) return;
  if (!online.checked) {
    void request(
      { type: "settings:patch", patch: { online: false } },
      "Mode lokal aktif.",
    );
    return;
  }
  void (async () => {
    preferences.disabled = true;
    try {
      if (await browser.permissions.request(onlinePermission)) {
        await request(
          { type: "settings:patch", patch: { online: true } },
          "Mode online aktif.",
        );
      } else {
        status.textContent = "Izin analisis online belum diberikan.";
      }
    } catch {
      status.textContent = "Izin analisis online tidak dapat diminta.";
    } finally {
      render();
      preferences.disabled = settings === undefined;
    }
  })();
});
groqKey.addEventListener("input", () =>
  groqKey.removeAttribute("aria-invalid"),
);
groqForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (onlineOrigin || preferences.disabled) return;
  const parsed = groqKeySchema.safeParse(groqKey.value.trim());
  if (!parsed.success) {
    groqKey.setAttribute("aria-invalid", "true");
    groqKey.focus();
    status.textContent = "Masukkan API key dari dasbor Groq.";
    return;
  }
  void (async () => {
    preferences.disabled = true;
    try {
      if (!(await browser.permissions.request(onlinePermission))) {
        status.textContent = "Izin untuk terhubung ke Groq belum diberikan.";
        return;
      }
      const connected = await request(
        { type: "groq:connect", key: parsed.data },
        "API key Groq disimpan.",
      );
      if (connected) {
        groqForm.reset();
        disconnect.focus();
      }
    } catch {
      status.textContent = "Izin untuk terhubung ke Groq tidak dapat diminta.";
    } finally {
      preferences.disabled = settings === undefined;
    }
  })();
});
disconnect.addEventListener("click", () => {
  void (async () => {
    if (await request({ type: "groq:disconnect" }, "API key Groq dihapus.")) {
      groqKey.focus();
    }
  })();
});
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
  if (area === "session" && changes[onlineStatusKey]) {
    onlineStatusChanged = true;
    onlineStatus = onlineStatusSchema.safeParse(
      changes[onlineStatusKey].newValue,
    ).data;
    renderOnlineStatus();
  }
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
void (async () => {
  try {
    const values = await browser.storage.session.get(onlineStatusKey);
    if (onlineStatusChanged) return;
    onlineStatus = onlineStatusSchema.safeParse(values[onlineStatusKey]).data;
    renderOnlineStatus();
  } catch {
    // The popup will show updates if session storage becomes available.
  }
})();
void request({ type: "settings:get" });
