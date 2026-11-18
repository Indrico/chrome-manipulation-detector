import type { DetectionResult } from "../models/detection-result";
import {
  feedbackReasons,
  type FeedbackEntry,
  type FeedbackReason,
} from "../storage/activity";
import styles from "./annotation.css?inline";

let sheet: CSSStyleSheet | undefined;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
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
): HTMLElement {
  const host = document.createElement("div");
  host.dataset.manipulationDetector = "";
  host.lang = "id";
  const root = host.attachShadow({ mode: "open" });
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(styles);
  }
  root.adoptedStyleSheets = [sheet];
  const disclosure = document.createElement("details");
  disclosure.open = open;
  disclosure.append(
    element("summary", `Kemungkinan pola retorika (${results.length})`),
  );
  for (const result of results) {
    const section = document.createElement("section");
    const evidence = document.createElement("ul");
    for (const item of result.evidence) evidence.append(element("li", item));
    const confidence =
      result.confidenceLevel === "likely"
        ? "Indikasi lebih kuat"
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
    disclosure.append(section);
  }
  const button = element("button", "Tutup anotasi");
  button.type = "button";
  button.addEventListener("click", (event) => {
    if (event.isTrusted) dismiss();
  });
  disclosure.append(
    element("p", "Teks ini saja belum cukup untuk menyimpulkan niat penulis."),
    button,
  );
  host.addEventListener("click", (event) => event.stopPropagation());
  host.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") event.stopPropagation();
  });
  root.append(disclosure);
  return host;
}
