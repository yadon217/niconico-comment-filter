import { MESSAGE_TYPES } from "../shared/constants.js";
import { mergeBodyUserIndex, mergeCommentIndex, mergeListIndexMap, resolveUserIdForRow } from "../shared/comment-user-index.js";
import { countNvCommentUserIdInPayload } from "../shared/nvcomment-user.js";
import { agentLog } from "../shared/debug-log.js";
import { reasonLabel } from "../shared/filter-engine.js";
import { createId, parseSettings } from "../shared/schema.js";
import { loadSettings, saveSettings, subscribeSettings } from "../shared/storage.js";
import {
  commentFromListTarget,
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
const userIdByCommentId = new Map();
const userIdByBody = new Map();
const userIdByListIndex = new Map();

function pushSettings() {
  postToPage(MESSAGE_TYPES.SETTINGS, { settings });
  renderDebug();
  syncCommentListVisibility();
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
  if (!userId) return false;
  if (settings.blockedUsers.some((item) => item.userId === userId)) return false;
  await setSettings({
    ...settings,
    blockedUsers: [
      ...settings.blockedUsers,
      { id: createId("user"), enabled: true, userId, createdAt: new Date().toISOString() },
    ],
  });
  agentLog(
    "index.js:ngUser",
    "blocked user added",
    {
      userIdLen: userId.length,
      ruleCount: settings.blockedUsers.length + 1,
      indexOccurrences: [...userIdByCommentId.values()].filter((id) => id === userId).length,
    },
    "F",
  );
  syncCommentListVisibility();
  agentLog("index.js:ngUser", "reload watch tab for canvas filter", {}, "I");
  location.reload();
  return true;
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

function blockedUserIdSet() {
  return new Set(
    (settings?.blockedUsers ?? [])
      .filter((item) => item.enabled !== false && item.userId)
      .map((item) => item.userId),
  );
}

function syncCommentListVisibility() {
  const section = findCommentListSection();
  const blocked = blockedUserIdSet();
  if (!section || !settings?.enabled || !blocked.size) {
    section?.querySelectorAll(".ncf-row-hidden").forEach((el) => {
      el.classList.remove("ncf-row-hidden");
    });
    return;
  }
  let hidden = 0;
  let resolved = 0;
  for (const row of section.querySelectorAll("[data-index]")) {
    if (!(row instanceof Element)) continue;
    const text = (row.innerText || "").trim();
    const commentText = text.split("\n").filter(Boolean).slice(-1)[0] ?? text;
    const userId = resolveUserIdForRow(
      row,
      userIdByCommentId,
      userIdByBody,
      commentText,
      userIdByListIndex,
    );
    if (userId) resolved += 1;
    const shouldHide = Boolean(userId && blocked.has(userId));
    row.classList.toggle("ncf-row-hidden", shouldHide);
    if (shouldHide) hidden += 1;
  }
  agentLog(
    "index.js:syncCommentListVisibility",
    "list rows hidden for blocked users",
    { hidden, resolved, blockedRuleCount: blocked.size },
    "G",
  );
}

async function boot() {
  if (!isWatchPage()) return;
  settings = await loadSettings();
  pushSettings();
  installContextMenu({
    onNgUser: ngUser,
    onNgWord: ngWord,
    resolveComment(target) {
      return commentFromListTarget(target, userIdByCommentId, userIdByBody, userIdByListIndex);
    },
  });
  subscribeSettings((next) => {
    settings = next;
    pushSettings();
  });
  onPageMessage((data) => {
    if (data.type === MESSAGE_TYPES.COMMENT_INDEX && Array.isArray(data.entries)) {
      mergeCommentIndex(userIdByCommentId, data.entries);
      mergeBodyUserIndex(userIdByBody, data.entries);
      mergeListIndexMap(userIdByListIndex, data.entries);
      agentLog(
        "index.js:COMMENT_INDEX",
        "merged comment index",
        {
          entryCount: data.entries.length,
          idMapSize: userIdByCommentId.size,
          bodyMapSize: userIdByBody.size,
          listIndexMapSize: userIdByListIndex.size,
        },
        "A",
      );
      syncCommentListVisibility();
    }
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
    userIdByCommentId.clear();
    userIdByBody.clear();
    userIdByListIndex.clear();
    pushSettings();
    reportStats();
  });
  const observer = new MutationObserver(() => {
    syncCommentListVisibility();
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
