import { REASONS } from "../shared/constants.js";
import { loadSettings, saveSettings } from "../shared/storage.js";

const labels = {
  [REASONS.KEYWORD]: "ワード",
  [REASONS.USER]: "ユーザー",
  [REASONS.REGEX]: "正規表現",
  [REASONS.LENGTH]: "文字数",
  [REASONS.PRESET_REPEATED]: "連打",
  [REASONS.PRESET_URL]: "URL",
  [REASONS.PRESET_AA]: "AA",
  [REASONS.STYLE]: "種別",
};

const enabledEl = document.getElementById("enabled");
const debugEl = document.getElementById("debug");
const totalEl = document.getElementById("total");
const breakdownEl = document.getElementById("breakdown");
const pageNoteEl = document.getElementById("page-note");
const statusEl = document.getElementById("status");

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function renderStats(stats) {
  const total = stats?.total ?? 0;
  totalEl.textContent = `${total}件`;
  breakdownEl.replaceChildren();
  for (const [reason, label] of Object.entries(labels)) {
    const count = stats?.byReason?.[reason] ?? 0;
    const li = document.createElement("li");
    li.textContent = `${label} ${count}`;
    breakdownEl.appendChild(li);
  }
}

async function init() {
  const settings = await loadSettings();
  enabledEl.checked = settings.enabled;
  debugEl.checked = settings.debugMode;

  const tab = await activeTab();
  const onWatch = Boolean(tab?.url?.startsWith("https://www.nicovideo.jp/watch/"));
  pageNoteEl.hidden = onWatch;
  if (tab?.id != null) {
    const stored = await chrome.storage.session.get(`stats:${tab.id}`);
    renderStats(stored[`stats:${tab.id}`]?.stats);
  }

  const persist = async (patch) => {
    const current = await loadSettings();
    await saveSettings({ ...current, ...patch });
  };

  enabledEl.addEventListener("change", async () => {
    await persist({ enabled: enabledEl.checked });
    const current = await activeTab();
    if (current?.id && current.url?.includes("/watch/")) {
      chrome.tabs.reload(current.id);
    }
  });
  debugEl.addEventListener("change", () => persist({ debugMode: debugEl.checked }));
  document.getElementById("options").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

init().catch((error) => {
  statusEl.hidden = false;
  statusEl.textContent = String(error.message || error);
});
