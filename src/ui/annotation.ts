import type { DetectionResult } from "../models/detection-result";
import {
  feedbackReasons,
  type FeedbackEntry,
  type FeedbackReason,
} from "../storage/activity";
import styles from "./annotation.css?inline";

let sheet: CSSStyleSheet | undefined;

function annotationHost() {
  const host = document.createElement("div");
  host.dataset.manipulationDetector = "";
  host.lang = "id";
  const root = host.attachShadow({ mode: "open" });
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(styles);
  }
  root.adoptedStyleSheets = [sheet];
  return root;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

const analysisLabels = {
  loading: "Sedang dianalisis…",
  clear: "Tidak ada pola terdeteksi",
  local_clear: "Analisis lokal · Tidak ada pola terdeteksi",
  failed: "Analisis gagal",
  waiting: "Belum dianalisis",
  daily_limit: "Kuota harian habis",
  quota: "Menunggu kuota online",
  unavailable: "Menunggu layanan online",
  permission: "Izin online diperlukan",
  credential: "Periksa API key Groq",
  invalid_output: "Hasil online gagal divalidasi",
  partial: "Sebagian hasil tidak tersedia",
} as const;
export type AnalysisStatus = keyof typeof analysisLabels;

export function createAnalysisStatus(status: AnalysisStatus) {
  const root = annotationHost();
  const host = root.host as HTMLElement;
  host.dataset.analysisStatus = status;
  const label = element("span", analysisLabels[status]);
  label.className = "analysis-label";
  if (status === "loading" || status === "clear" || status === "local_clear") {
    const icon = element("span", status === "loading" ? "" : "✓");
    icon.className = "analysis-icon";
    icon.setAttribute("aria-hidden", "true");
    label.prepend(icon);
  }
  root.append(label);
  return host;
}

function feedbackForm(
  patternId: DetectionResult["patternId"],
  save: (entry: FeedbackEntry) => Promise<boolean>,
) {
  const form = document.createElement("form");
  const label = element("label", "Umpan balik ");
  const select = document.createElement("select");
  const placeholder = element("option", "Pilih alasan");
  placeholder.value = "";
  placeholder.disabled = true;
  placeholder.selected = true;
  select.required = true;
  select.append(placeholder);
  for (const [reason, title] of Object.entries(feedbackReasons)) {
    const option = element("option", title);
    option.value = reason;
    select.append(option);
  }
  label.append(select);
  const button = element("button", "Simpan");
  button.type = "button";
  const status = element("p", "");
  status.setAttribute("role", "status");
  form.append(label, button, status);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    if (
      !event.isTrusted ||
      button.ariaDisabled === "true" ||
      !select.reportValidity() ||
      !Object.hasOwn(feedbackReasons, select.value)
    )
      return;
    button.ariaDisabled = "true";
    void (async () => {
      const saved = await save({
        patternId,
        reason: select.value as FeedbackReason,
      });
      status.textContent = saved
        ? "Umpan balik disimpan di perangkat."
        : "Umpan balik gagal disimpan.";
      button.removeAttribute("aria-disabled");
    })();
  });
  return form;
}

export function createAnnotation(
  results: readonly DetectionResult[],
  open: boolean,
  dismiss: () => void,
  save: (entry: FeedbackEntry) => Promise<boolean>,
  localFallback = false,
): HTMLElement {
  const root = annotationHost();
  const host = root.host as HTMLElement;
  const disclosure = document.createElement("details");
  disclosure.open = open;
  const flagged = results.filter(
    ({ confidenceLevel }) => confidenceLevel !== "insufficient_context",
  );
  const trigger = element(
    "summary",
    (localFallback ? "Analisis lokal · " : "") +
      (flagged.length
        ? `Indikasi ${flagged.map(({ patternName }) => patternName).join(", ")}`
        : "Konteks tidak cukup"),
  );
  trigger.addEventListener("click", (event) => {
    // The page can cancel native summary activation during event capture.
    event.preventDefault();
    if (event.isTrusted) disclosure.open = !disclosure.open;
  });
  const content = document.createElement("div");
  content.className = "annotation-content";
  for (const result of results) {
    const section = document.createElement("section");
    const evidence = document.createElement("ul");
    for (const item of result.evidence) evidence.append(element("li", item));
    const confidence =
      result.confidenceLevel === "likely"
        ? "Indikasi lebih kuat"
        : result.confidenceLevel === "insufficient_context"
          ? "Konteks tidak cukup"
          : "Indikasi awal";
    section.append(
      element("h3", result.patternName),
      element("p", confidence),
      element("blockquote", result.matchedText),
      element("p", result.explanation),
      evidence,
    );
    for (const limitation of result.limitations ?? [])
      section.append(element("p", limitation));
    section.append(feedbackForm(result.patternId, save));
    content.append(section);
  }
  const button = element("button", "Tutup anotasi");
  button.type = "button";
  button.addEventListener("click", (event) => {
    if (event.isTrusted) dismiss();
  });
  content.append(
    element("p", "Teks ini saja belum cukup untuk menyimpulkan niat penulis."),
    button,
  );
  disclosure.append(trigger, content);
  host.addEventListener("click", (event) => event.stopPropagation());
  host.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") event.stopPropagation();
  });
  root.append(disclosure);
  return host;
}
