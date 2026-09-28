(() => {
  // src/shared/constants.js
  var SCHEMA_VERSION = 1;
  var MATCH_MODES = Object.freeze({
    CONTAINS: "contains",
    EXACT: "exact",
    REGEX: "regex"
  });
  var REASONS = Object.freeze({
    USER: "user",
    KEYWORD: "keyword",
    REGEX: "regex",
    LENGTH: "length",
    PRESET_REPEATED: "preset_repeated",
    PRESET_URL: "preset_url",
    PRESET_AA: "preset_aa",
    STYLE: "style"
  });
  var COMBINATORS = Object.freeze({
    OR: "or",
    AND: "and"
  });
  var MESSAGE_TYPES = Object.freeze({
    SETTINGS: "ncf-settings",
    STATS: "ncf-stats",
    STATUS: "ncf-status",
    BLOCKED: "ncf-blocked",
    COMMENT_INDEX: "ncf-comment-index",
    CONTEXT_NG: "ncf-context-ng"
  });
  var SOURCE = "niconico-comment-filter";
  var COMMENT_API_HOSTS = Object.freeze([
    "nvcomment.nicovideo.jp",
    "public.nvcomment.nicovideo.jp"
  ]);

  // src/shared/normalize.js
  function normalizeText(value) {
    const raw = value == null ? "" : String(value);
    return raw.normalize("NFKC").toLocaleLowerCase("en-US").trim();
  }

  // src/shared/comment-user-index.js
  var BODY_USER_INDEX_AMBIGUOUS = "__ambiguous__";
  function mergeCommentIndex(map, entries, maxSize = 2e4) {
    for (const { commentId, userId } of entries) {
      map.set(commentId, userId);
    }
    while (map.size > maxSize) {
      const oldest = map.keys().next().value;
      if (oldest === void 0) break;
      map.delete(oldest);
    }
  }
  function mergeBodyUserIndex(map, entries, maxSize = 2e4) {
    for (const { body, userId } of entries) {
      const key = normalizeText(body);
      if (!key) continue;
      const prev = map.get(key);
      if (prev === BODY_USER_INDEX_AMBIGUOUS) continue;
      if (prev === void 0) {
        map.set(key, userId);
      } else if (prev !== userId) {
        map.set(key, BODY_USER_INDEX_AMBIGUOUS);
      }
    }
    while (map.size > maxSize) {
      const oldest = map.keys().next().value;
      if (oldest === void 0) break;
      map.delete(oldest);
    }
  }
  function resolveUserIdFromBodyIndex(bodyMap, commentText) {
    if (!bodyMap || commentText == null) return "";
    const key = normalizeText(commentText);
    if (!key) return "";
    const userId = bodyMap.get(key);
    if (!userId || userId === BODY_USER_INDEX_AMBIGUOUS) return "";
    return userId;
  }
  function resolveUserIdForRow(row, idMap, bodyMap, commentText) {
    const fromDom = domUserIdFromRow(row);
    if (fromDom) return fromDom;
    const commentId = commentIdFromRow(row);
    if (commentId && idMap?.has(commentId)) {
      return idMap.get(commentId) ?? "";
    }
    return resolveUserIdFromBodyIndex(bodyMap, commentText);
  }
  function domUserIdFromRow(row) {
    if (!row) return "";
    return row.getAttribute("data-user-id") || row.getAttribute("data-userid") || row.getAttribute("data-user") || "";
  }
  function commentIdFromRow(row) {
    if (!row) return "";
    return row.getAttribute("data-comment-id") || row.getAttribute("data-commentid") || row.getAttribute("data-id") || row.getAttribute("data-nvcomment-id") || "";
  }

  // src/shared/debug-log.js
  function agentLog(location2, message, data, hypothesisId) {
    fetch("http://127.0.0.1:7511/ingest/c1735e42-463a-47c3-97f8-cc00f725b849", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "690dc9" },
      body: JSON.stringify({
        sessionId: "690dc9",
        location: location2,
        message,
        data,
        hypothesisId,
        timestamp: Date.now(),
        runId: "pre-fix"
      })
    }).catch(() => {
    });
  }

  // src/shared/shipped-defaults.json
  var shipped_defaults_default = {
    lengthFilter: {
      enabled: true,
      maxLength: 50
    },
    keywordRules: []
  };

  // src/shared/schema.js
  function nowIso() {
    return (/* @__PURE__ */ new Date()).toISOString();
  }
  function createId(prefix = "rule") {
    if (globalThis.crypto?.randomUUID) {
      return `${prefix}_${globalThis.crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
  function baseSettings() {
    return {
      schemaVersion: SCHEMA_VERSION,
      enabled: true,
      debugMode: false,
      lengthFilter: {
        enabled: true,
        maxLength: 50
      },
      keywordRules: [],
      regexRules: [],
      blockedUsers: [],
      allowedUsers: [],
      presets: {
        repeatedCharacters: false,
        url: false,
        asciiArt: false
      },
      styleFilter: defaultStyleFilter()
    };
  }
  function defaultStyleFilter() {
    return {
      enabled: false,
      combinator: COMBINATORS.OR,
      rules: [
        {
          id: "style_default",
          enabled: true,
          combinator: COMBINATORS.OR,
          conditions: []
        }
      ]
    };
  }
  function sanitizeCombinator(value) {
    return value === COMBINATORS.AND ? COMBINATORS.AND : COMBINATORS.OR;
  }
  var STYLE_SIZE_VALUES = /* @__PURE__ */ new Set(["big", "small", "medium"]);
  var STYLE_POSITION_VALUES = /* @__PURE__ */ new Set(["ue", "shita", "naka"]);
  var STYLE_COLOR_MODES = /* @__PURE__ */ new Set(["non_default", "default"]);
  function sanitizeStyleCondition(raw) {
    if (!raw || typeof raw !== "object") return null;
    const item = (
      /** @type {Record<string, unknown>} */
      raw
    );
    const kind = asString(item.kind);
    if (kind === "color") {
      const mode = asString(item.mode);
      if (!STYLE_COLOR_MODES.has(mode)) return null;
      return { kind: "color", mode };
    }
    if (kind === "size") {
      const value = asString(item.value);
      if (!STYLE_SIZE_VALUES.has(value)) return null;
      return { kind: "size", value };
    }
    if (kind === "position") {
      const value = asString(item.value);
      if (!STYLE_POSITION_VALUES.has(value)) return null;
      return { kind: "position", value };
    }
    return null;
  }
  function sanitizeStyleFilter(raw) {
    const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (
      /** @type {Record<string, unknown>} */
      raw
    ) : {};
    const rulesRaw = Array.isArray(input.rules) ? input.rules : [];
    const rules = rulesRaw.length ? rulesRaw.map((rule) => {
      const base = sanitizeRuleBase(rule, "style");
      const conditions = Array.isArray(rule?.conditions) ? rule.conditions.map(sanitizeStyleCondition).filter(Boolean) : [];
      return {
        ...base,
        combinator: sanitizeCombinator(rule?.combinator),
        conditions
      };
    }) : defaultStyleFilter().rules;
    return {
      enabled: asBoolean(input.enabled, false),
      combinator: sanitizeCombinator(input.combinator),
      rules
    };
  }
  function pickShippedPreset() {
    const shipped = (
      /** @type {Record<string, unknown>} */
      shipped_defaults_default
    );
    const lengthRaw = shipped.lengthFilter && typeof shipped.lengthFilter === "object" ? (
      /** @type {Record<string, unknown>} */
      shipped.lengthFilter
    ) : null;
    return {
      lengthFilter: lengthRaw ? {
        enabled: lengthRaw.enabled,
        maxLength: lengthRaw.maxLength
      } : void 0,
      keywordRules: Array.isArray(shipped.keywordRules) ? shipped.keywordRules : []
    };
  }
  function defaultSettings() {
    const preset = pickShippedPreset();
    const parsed = parseSettings({
      ...baseSettings(),
      ...preset.lengthFilter ? { lengthFilter: preset.lengthFilter } : {},
      keywordRules: preset.keywordRules
    });
    return parsed.ok ? parsed.settings : baseSettings();
  }
  function asBoolean(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
  }
  function asString(value) {
    return value == null ? "" : String(value);
  }
  function sanitizeRuleBase(rule, prefix) {
    return {
      id: asString(rule?.id) || createId(prefix),
      enabled: asBoolean(rule?.enabled, true),
      createdAt: asString(rule?.createdAt) || nowIso()
    };
  }
  function sanitizeMatchMode(mode) {
    if (mode === MATCH_MODES.EXACT || mode === MATCH_MODES.REGEX) return mode;
    return MATCH_MODES.CONTAINS;
  }
  function parseSettings(raw) {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "\u8A2D\u5B9AJSON\u304C\u30AA\u30D6\u30B8\u30A7\u30AF\u30C8\u3067\u306F\u3042\u308A\u307E\u305B\u3093" };
    }
    const input = (
      /** @type {Record<string, unknown>} */
      raw
    );
    const version = Number(input.schemaVersion ?? SCHEMA_VERSION);
    if (!Number.isFinite(version) || version > SCHEMA_VERSION) {
      return { ok: false, error: `\u672A\u5BFE\u5FDC\u306E schemaVersion: ${input.schemaVersion}` };
    }
    const lengthFilterRaw = input.lengthFilter && typeof input.lengthFilter === "object" ? (
      /** @type {Record<string, unknown>} */
      input.lengthFilter
    ) : {};
    const maxLength = Number(lengthFilterRaw.maxLength ?? 50);
    if (!Number.isFinite(maxLength) || maxLength < 1) {
      return { ok: false, error: "\u6587\u5B57\u6570\u3057\u304D\u3044\u5024\u304C\u4E0D\u6B63\u3067\u3059" };
    }
    const presetsRaw = input.presets && typeof input.presets === "object" ? (
      /** @type {Record<string, unknown>} */
      input.presets
    ) : {};
    const settings2 = baseSettings();
    settings2.enabled = asBoolean(input.enabled, true);
    settings2.debugMode = asBoolean(input.debugMode, false);
    settings2.lengthFilter = {
      enabled: asBoolean(lengthFilterRaw.enabled, true),
      maxLength: Math.floor(maxLength)
    };
    settings2.presets = {
      repeatedCharacters: asBoolean(presetsRaw.repeatedCharacters, false),
      url: asBoolean(presetsRaw.url, false),
      asciiArt: asBoolean(presetsRaw.asciiArt, false)
    };
    settings2.keywordRules = Array.isArray(input.keywordRules) ? input.keywordRules.map((rule) => {
      const base = sanitizeRuleBase(rule, "kw");
      return {
        ...base,
        value: asString(rule?.value),
        matchMode: sanitizeMatchMode(rule?.matchMode)
      };
    }) : [];
    settings2.regexRules = Array.isArray(input.regexRules) ? input.regexRules.map((rule) => {
      const base = sanitizeRuleBase(rule, "re");
      return {
        ...base,
        pattern: asString(rule?.pattern),
        memo: asString(rule?.memo)
      };
    }) : [];
    settings2.blockedUsers = Array.isArray(input.blockedUsers) ? input.blockedUsers.map((rule) => {
      const base = sanitizeRuleBase(rule, "user");
      return {
        ...base,
        userId: asString(rule?.userId ?? rule?.value)
      };
    }) : [];
    settings2.allowedUsers = Array.isArray(input.allowedUsers) ? input.allowedUsers.map((rule) => {
      const base = sanitizeRuleBase(rule, "allow");
      return {
        ...base,
        userId: asString(rule?.userId ?? rule?.value)
      };
    }) : [];
    settings2.styleFilter = sanitizeStyleFilter(input.styleFilter);
    return { ok: true, settings: settings2 };
  }

  // src/shared/filter-engine.js
  function reasonLabel(reason, rule) {
    switch (reason) {
      case REASONS.USER:
        return "NG\uFF1A\u30E6\u30FC\u30B6\u30FC";
      case REASONS.KEYWORD:
        return `NG\uFF1A\u30EF\u30FC\u30C9\u300C${rule?.value ?? ""}\u300D`;
      case REASONS.REGEX:
        return "NG\uFF1A\u6B63\u898F\u8868\u73FE";
      case REASONS.LENGTH:
        return "NG\uFF1A\u6587\u5B57\u6570\u30D5\u30A3\u30EB\u30BF\u30FC";
      case REASONS.PRESET_REPEATED:
        return "NG\uFF1A\u30D7\u30EA\u30BB\u30C3\u30C8\uFF08\u9023\u6253\uFF09";
      case REASONS.PRESET_URL:
        return "NG\uFF1A\u30D7\u30EA\u30BB\u30C3\u30C8\uFF08URL\uFF09";
      case REASONS.PRESET_AA:
        return "NG\uFF1A\u30D7\u30EA\u30BB\u30C3\u30C8\uFF08AA\uFF09";
      case REASONS.STYLE:
        return "NG\uFF1A\u30B3\u30E1\u30F3\u30C8\u7A2E\u5225";
      default:
        return "NG";
    }
  }

  // src/shared/storage.js
  var STORAGE_KEY = "settings";
  async function loadSettings() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const parsed = parseSettings(stored[STORAGE_KEY]);
      if (!parsed.ok) return defaultSettings();
      return parsed.settings;
    } catch {
      return defaultSettings();
    }
  }
  async function saveSettings(settings2) {
    const parsed = parseSettings(settings2);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: parsed.settings });
    return parsed.settings;
  }
  function subscribeSettings(listener) {
    const handler = (changes, area) => {
      if (area !== "local" || !changes[STORAGE_KEY]) return;
      const parsed = parseSettings(changes[STORAGE_KEY].newValue);
      listener(parsed.ok ? parsed.settings : defaultSettings());
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }

  // src/content/comment-adapter.js
  function findCommentListSection() {
    const heading = [...document.querySelectorAll("h1")].find(
      (el) => el.textContent.trim() === "\u30B3\u30E1\u30F3\u30C8\u30EA\u30B9\u30C8"
    );
    return heading?.closest("section") ?? null;
  }
  function commentFromListTarget(target, userIdByCommentId2, userIdByBody2) {
    if (!(target instanceof Element)) return null;
    const section = findCommentListSection();
    if (!section || !section.contains(target)) return null;
    const row = target.closest("[data-index], tr, li, [role='row']") ?? target.closest("div");
    if (!row || row === section) return null;
    const text = (row.innerText || "").trim();
    if (!text || text === "\u30B3\u30E1\u30F3\u30C8\u30EA\u30B9\u30C8") return null;
    const commentText = text.split("\n").filter(Boolean).slice(-1)[0] ?? text;
    const userId = resolveUserIdForRow(row, userIdByCommentId2, userIdByBody2, commentText) || void 0;
    const commentId = commentIdFromRow(row) || void 0;
    const normKey = normalizeText(commentText);
    const bodySlot = userIdByBody2?.get(normKey);
    const bodyLookup = bodySlot === BODY_USER_INDEX_AMBIGUOUS ? "ambiguous" : bodySlot ? "hit" : normKey ? "miss" : "empty_key";
    agentLog(
      "comment-adapter.js:commentFromListTarget",
      "resolve comment row",
      {
        lineCount: text.split("\n").filter(Boolean).length,
        commentTextLen: commentText.length,
        rowDataIndex: row.getAttribute("data-index") ?? "",
        commentIdAttr: commentId ?? "",
        idMapSize: userIdByCommentId2?.size ?? 0,
        bodyMapSize: userIdByBody2?.size ?? 0,
        bodyLookup,
        resolvedUserId: Boolean(userId)
      },
      "B"
    );
    return {
      text: commentText,
      userId,
      commentId,
      row
    };
  }
  function watchSpaNavigation(onWatchChange) {
    let last = location.pathname;
    const notify = () => {
      if (location.pathname === last) return;
      last = location.pathname;
      if (location.pathname.startsWith("/watch/")) onWatchChange();
    };
    const wrap = (method) => {
      const original = history[method];
      history[method] = function ncfHistory(...args) {
        const result = original.apply(this, args);
        queueMicrotask(notify);
        return result;
      };
    };
    wrap("pushState");
    wrap("replaceState");
    window.addEventListener("popstate", notify);
    return () => {
      window.removeEventListener("popstate", notify);
    };
  }
  function postToPage(type, extra = {}) {
    window.postMessage({ source: SOURCE, type, ...extra }, location.origin);
  }
  function onPageMessage(handler) {
    const listener = (event) => {
      if (event.source !== window) return;
      if (event.origin !== location.origin) return;
      const data = event.data;
      if (!data || data.source !== SOURCE) return;
      handler(data);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }
  function isWatchPage() {
    return location.pathname.startsWith("/watch/");
  }

  // src/content/context-menu.js
  function showToast(message) {
    const existing = document.querySelector(".ncf-toast");
    existing?.remove();
    const toast = document.createElement("div");
    toast.className = "ncf-toast";
    toast.textContent = message;
    document.documentElement.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2500);
  }
  function installContextMenu({ onNgUser, onNgWord, resolveComment }) {
    const menu = document.createElement("div");
    menu.className = "ncf-menu";
    menu.hidden = true;
    document.documentElement.appendChild(menu);
    const hide = () => {
      menu.hidden = true;
      menu.replaceChildren();
    };
    const addItem = (label, handler) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        void Promise.resolve(handler()).finally(hide);
      });
      menu.appendChild(button);
    };
    document.addEventListener(
      "contextmenu",
      (event) => {
        const section = findCommentListSection();
        if (!section || !event.target || !section.contains(event.target)) {
          hide();
          return;
        }
        const comment = resolveComment(event.target);
        if (!comment) return;
        event.preventDefault();
        menu.replaceChildren();
        if (comment.userId) {
          addItem("NG ID\u306B\u767B\u9332", async () => {
            const added = await onNgUser(comment.userId);
            if (added) showToast("NG\u30E6\u30FC\u30B6\u30FC\u306B\u8FFD\u52A0\u3057\u307E\u3057\u305F");
          });
          addItem("\u30E6\u30FC\u30B6\u30FCID\u3092\u30B3\u30D4\u30FC", async () => {
            try {
              await navigator.clipboard.writeText(comment.userId);
            } catch {
            }
          });
        } else {
          addItem("\u30E6\u30FC\u30B6\u30FCID\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093", () => {
          });
        }
        if (comment.text) {
          addItem("\u3053\u306E\u30EF\u30FC\u30C9\u3092NG\u306B\u8FFD\u52A0", () => onNgWord(comment.text));
          addItem("\u30B3\u30E1\u30F3\u30C8\u5185\u5BB9\u3092\u30B3\u30D4\u30FC", async () => {
            try {
              await navigator.clipboard.writeText(comment.text);
            } catch {
            }
          });
        }
        menu.hidden = false;
        menu.style.left = `${event.clientX}px`;
        menu.style.top = `${event.clientY}px`;
      },
      true
    );
    document.addEventListener("click", hide, true);
    window.addEventListener("blur", hide);
    return { hide };
  }

  // src/content/index.js
  var settings;
  var stats = { total: 0, byReason: {} };
  var recentBlocked = [];
  var adapterStatus = { hook: false, message: "" };
  var userIdByCommentId = /* @__PURE__ */ new Map();
  var userIdByBody = /* @__PURE__ */ new Map();
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
      banner.textContent = "\u4E00\u90E8\u30D5\u30A3\u30EB\u30BF\u30FC\u3092\u9069\u7528\u3067\u304D\u307E\u305B\u3093";
      body.prepend(banner);
    }
    if (!settings?.debugMode) return;
    const panel = document.createElement("div");
    panel.className = "ncf-debug";
    const title = document.createElement("strong");
    title.textContent = `NG\u7406\u7531\u3092\u8868\u793A\uFF08${stats.total ?? 0}\u4EF6\uFF09`;
    panel.appendChild(title);
    for (const item of recentBlocked.slice(-20).reverse()) {
      const line = document.createElement("div");
      line.className = "ncf-placeholder";
      line.textContent = reasonLabel(item.result.reason, {
        value: item.text?.slice(0, 20)
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
        { id: createId("user"), enabled: true, userId, createdAt: (/* @__PURE__ */ new Date()).toISOString() }
      ]
    });
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
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      ]
    });
  }
  function reportStats() {
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.STATS,
      stats,
      videoId: location.pathname.split("/").pop()
    });
  }
  async function boot() {
    if (!isWatchPage()) return;
    settings = await loadSettings();
    pushSettings();
    installContextMenu({
      onNgUser: ngUser,
      onNgWord: ngWord,
      resolveComment(target) {
        return commentFromListTarget(target, userIdByCommentId, userIdByBody);
      }
    });
    subscribeSettings((next) => {
      settings = next;
      pushSettings();
    });
    onPageMessage((data) => {
      if (data.type === MESSAGE_TYPES.COMMENT_INDEX && Array.isArray(data.entries)) {
        mergeCommentIndex(userIdByCommentId, data.entries);
        mergeBodyUserIndex(userIdByBody, data.entries);
        agentLog(
          "index.js:COMMENT_INDEX",
          "merged comment index",
          {
            entryCount: data.entries.length,
            idMapSize: userIdByCommentId.size,
            bodyMapSize: userIdByBody.size
          },
          "A"
        );
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
})();
