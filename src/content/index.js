import { MESSAGE_TYPES } from "../shared/constants.js";
import { reasonLabel } from "../shared/filter-engine.js";
import { createId, parseSettings } from "../shared/schema.js";
import { loadSettings, saveSettings, subscribeSettings } from "../shared/storage.js";
import {
  findCommentListSection,
  isWatchPage,
  onPageMessage,
  postToPage,
  watchSpaNavigation,
} from "./comment-adapter.js";
import { installContextMenu } from "./context-menu.js";

let settings;
let stats = { total: 0, byReason: {} };
let recentBlocked = [];
let adapterStatus = { hook: false, message: "" };

function pushSettings() {
  postToPage(MESSAGE_TYPES.SETTINGS, { settings });
  renderDebug();
}

async function setSettings(next) {
  settings = await saveSettings(next);
  pushSettings();
}

function renderDebug() {
  const existing = document.querySelector(".ncf-debug, .ncf-banner");
  existing?.remove();
  const section = findCommentListSection();
  if (!section) return;
  const body = section.children[1] ?? section;

  if (adapterStatus.message) {
    const banner = document.createElement("div");
    banner.className = "ncf-banner";
    banner.textContent = "一部フィルターを適用できません";
    body.prepend(banner);
  }

  if (!settings?.debugMode) return;
  const panel = document.createElement("div");
  panel.className = "ncf-debug";
  const title = document.createElement("strong");
  title.textContent = `NG理由を表示（${stats.total ?? 0}件）`;
  panel.appendChild(title);
  for (const item of recentBlocked.slice(-20).reverse()) {
    const line = document.createElement("div");
    line.className = "ncf-placeholder";
    line.textContent = reasonLabel(item.result.reason, {
      value: item.text?.slice(0, 20),
    });
    panel.appendChild(line);
  }
  body.prepend(panel);
}

async function ngUser(userId) {
  if (!userId) return;
  if (settings.blockedUsers.some((item) => item.userId === userId)) return;
  await setSettings({
    ...settings,
    blockedUsers: [
      ...settings.blockedUsers,
      { id: createId("user"), enabled: true, userId, createdAt: new Date().toISOString() },
    ],
  });
}

async function ngWord(value) {
  const text = String(value || "").trim();
  if (!text) return;
  await setSettings({
    ...settings,
    keywordRules: [
      ...settings.keywordRules,
      {
        id: createId("kw"),
        enabled: true,
        value: text.slice(0, 80),
        matchMode: "contains",
        createdAt: new Date().toISOString(),
      },
    ],
  });
}

function reportStats() {
  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.STATS,
    stats,
    videoId: location.pathname.split("/").pop(),
  });
}

async function boot() {
  if (!isWatchPage()) return;
  settings = await loadSettings();
  pushSettings();
  installContextMenu({ onNgUser: ngUser, onNgWord: ngWord });
  subscribeSettings((next) => {
    settings = next;
    pushSettings();
  });
  onPageMessage((data) => {
    if (data.type === MESSAGE_TYPES.STATS && data.stats) {
      stats = data.stats;
      reportStats();
      renderDebug();
    }
    if (data.type === MESSAGE_TYPES.BLOCKED) {
      if (data.stats) stats = data.stats;
      if (Array.isArray(data.blocked)) {
        recentBlocked = [...recentBlocked, ...data.blocked].slice(-100);
      }
      reportStats();
      renderDebug();
    }
    if (data.type === MESSAGE_TYPES.STATUS && data.status) {
      adapterStatus = data.status;
      renderDebug();
    }
  });
  watchSpaNavigation(() => {
    stats = { total: 0, byReason: {} };
    recentBlocked = [];
    pushSettings();
    reportStats();
  });
  const observer = new MutationObserver(() => {
    if (settings?.debugMode && !document.querySelector(".ncf-debug")) renderDebug();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === MESSAGE_TYPES.SETTINGS) {
      const parsed = parseSettings(message.settings);
      if (parsed.ok) {
        settings = parsed.settings;
        pushSettings();
      }
    }
  });
}

boot().catch((error) => {
  console.warn("[niconico-comment-filter]", error);
});
