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
    PRESET_AA: "preset_aa"
  });
  var MESSAGE_TYPES = Object.freeze({
    SETTINGS: "ncf-settings",
    STATS: "ncf-stats",
    STATUS: "ncf-status",
    BLOCKED: "ncf-blocked",
    CONTEXT_NG: "ncf-context-ng"
  });
  var SOURCE = "niconico-comment-filter";
  var COMMENT_API_HOSTS = Object.freeze([
    "nvcomment.nicovideo.jp",
    "public.nvcomment.nicovideo.jp"
  ]);

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
      }
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
    return { ok: true, settings: settings2 };
  }
  function compileRegex(pattern) {
    const source = asString(pattern);
    if (!source) return { ok: false, error: "\u6B63\u898F\u8868\u73FE\u304C\u7A7A\u3067\u3059" };
    try {
      return { ok: true, regex: new RegExp(source) };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "\u4E0D\u6B63\u306A\u6B63\u898F\u8868\u73FE\u3067\u3059"
      };
    }
  }

  // src/shared/normalize.js
  function normalizeText(value) {
    const raw = value == null ? "" : String(value);
    return raw.normalize("NFKC").toLocaleLowerCase("en-US").trim();
  }
  function codePointLength(value) {
    const raw = value == null ? "" : String(value);
    return Array.from(raw).length;
  }

  // src/shared/filter-engine.js
  var URL_RE = /https?:\/\/[^\s]+/i;
  var REPEATED_RE = /^(.)\1{19,}$/u;
  function emptyResult() {
    return { blocked: false };
  }
  function blocked(reason, ruleId) {
    return { blocked: true, reason, ruleId };
  }
  function compileKeywordRule(rule) {
    if (!rule?.enabled || !rule.value) return null;
    if (rule.matchMode === MATCH_MODES.REGEX) {
      const compiled = compileRegex(rule.value);
      if (!compiled.ok) return { invalid: true };
      return { ...rule, regex: compiled.regex };
    }
    return { ...rule, normalized: normalizeText(rule.value) };
  }
  function createFilterEngine(settings2) {
    const enabled = settings2?.enabled !== false;
    const allowedUsers = new Set(
      (settings2?.allowedUsers ?? []).filter((item) => item.enabled !== false && item.userId).map((item) => item.userId)
    );
    const blockedUsers = new Map(
      (settings2?.blockedUsers ?? []).filter((item) => item.enabled !== false && item.userId).map((item) => [item.userId, item.id])
    );
    const keywordRules = (settings2?.keywordRules ?? []).map(compileKeywordRule).filter((rule) => rule && !rule.invalid);
    const regexRules = (settings2?.regexRules ?? []).map((rule) => {
      if (!rule?.enabled || !rule.pattern) return null;
      const compiled = compileRegex(rule.pattern);
      if (!compiled.ok) return null;
      return { ...rule, regex: compiled.regex };
    }).filter(Boolean);
    const lengthFilter = settings2?.lengthFilter ?? { enabled: false, maxLength: 50 };
    const presets = settings2?.presets ?? {};
    function evaluate(comment) {
      if (!enabled) return emptyResult();
      const text = comment?.text == null ? "" : String(comment.text);
      const userId = comment?.userId ? String(comment.userId) : "";
      if (userId && allowedUsers.has(userId)) return emptyResult();
      if (userId && blockedUsers.has(userId)) {
        return blocked(REASONS.USER, blockedUsers.get(userId));
      }
      const normalized = normalizeText(text);
      for (const rule of keywordRules) {
        if (rule.matchMode === MATCH_MODES.REGEX) {
          try {
            rule.regex.lastIndex = 0;
            if (rule.regex.test(text)) return blocked(REASONS.KEYWORD, rule.id);
          } catch {
            continue;
          }
          continue;
        }
        if (!rule.normalized) continue;
        if (rule.matchMode === MATCH_MODES.EXACT) {
          if (normalized === rule.normalized) return blocked(REASONS.KEYWORD, rule.id);
        } else if (normalized.includes(rule.normalized)) {
          return blocked(REASONS.KEYWORD, rule.id);
        }
      }
      for (const rule of regexRules) {
        try {
          rule.regex.lastIndex = 0;
          if (rule.regex.test(text)) return blocked(REASONS.REGEX, rule.id);
        } catch {
          continue;
        }
      }
      if (lengthFilter.enabled) {
        const maxLength = Number(lengthFilter.maxLength);
        if (Number.isFinite(maxLength) && codePointLength(text) >= maxLength) {
          return blocked(REASONS.LENGTH, "length");
        }
      }
      if (presets.repeatedCharacters) {
        try {
          REPEATED_RE.lastIndex = 0;
          if (REPEATED_RE.test(text)) {
            return blocked(REASONS.PRESET_REPEATED, "preset_repeated");
          }
        } catch {
        }
      }
      if (presets.url && URL_RE.test(text)) {
        return blocked(REASONS.PRESET_URL, "preset_url");
      }
      if (presets.asciiArt && looksLikeAsciiArt(text)) {
        return blocked(REASONS.PRESET_AA, "preset_aa");
      }
      return emptyResult();
    }
    return { evaluate, enabled };
  }
  function looksLikeAsciiArt(text) {
    const lines = String(text).split(/\r?\n/);
    if (lines.length >= 4) return true;
    const special = (text.match(/[^\p{L}\p{N}\s]/gu) ?? []).length;
    return special >= 12 && special / Math.max(codePointLength(text), 1) >= 0.45;
  }
  function filterNvCommentPayload(payload, engine2) {
    const threads = payload?.data?.threads;
    if (!Array.isArray(threads)) {
      return { payload, blocked: [] };
    }
    const blocked2 = [];
    const nextThreads = threads.map((thread) => {
      const comments = Array.isArray(thread.comments) ? thread.comments : [];
      const kept = [];
      for (const comment of comments) {
        const result = engine2.evaluate({
          text: comment?.body ?? "",
          userId: comment?.userId ? String(comment.userId) : void 0
        });
        if (result.blocked) {
          blocked2.push({
            id: comment?.id != null ? String(comment.id) : "",
            text: comment?.body ?? "",
            userId: comment?.userId ? String(comment.userId) : "",
            result
          });
        } else {
          kept.push(comment);
        }
      }
      return { ...thread, comments: kept };
    });
    return {
      payload: {
        ...payload,
        data: {
          ...payload.data,
          threads: nextThreads
        }
      },
      blocked: blocked2
    };
  }
  function emptyStats() {
    return {
      total: 0,
      byReason: {
        [REASONS.USER]: 0,
        [REASONS.KEYWORD]: 0,
        [REASONS.REGEX]: 0,
        [REASONS.LENGTH]: 0,
        [REASONS.PRESET_REPEATED]: 0,
        [REASONS.PRESET_URL]: 0,
        [REASONS.PRESET_AA]: 0
      }
    };
  }
  function addStat(stats2, reason) {
    stats2.total += 1;
    if (reason && stats2.byReason[reason] != null) {
      stats2.byReason[reason] += 1;
    }
  }

  // src/content/page-hook.js
  var settings = defaultSettings();
  var engine = createFilterEngine(settings);
  var stats = emptyStats();
  var adapterStatus = { hook: true, message: "" };
  function isCommentApi(url) {
    try {
      const parsed = new URL(url, location.href);
      return COMMENT_API_HOSTS.includes(parsed.host) && parsed.pathname.includes("/v1/threads");
    } catch {
      return false;
    }
  }
  function postToIsolated(type, extra) {
    window.postMessage(
      {
        source: SOURCE,
        type,
        ...extra
      },
      location.origin
    );
  }
  function applyFilteredPayload(payload) {
    const { payload: next, blocked: blocked2 } = filterNvCommentPayload(payload, engine);
    for (const item of blocked2) {
      addStat(stats, item.result.reason);
    }
    if (blocked2.length) {
      postToIsolated(MESSAGE_TYPES.BLOCKED, { blocked: blocked2, stats });
    } else {
      postToIsolated(MESSAGE_TYPES.STATS, { stats });
    }
    return next;
  }
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== SOURCE) return;
    if (data.type === MESSAGE_TYPES.SETTINGS && data.settings) {
      settings = data.settings;
      engine = createFilterEngine(settings);
      stats = emptyStats();
      postToIsolated(MESSAGE_TYPES.STATS, { stats });
      postToIsolated(MESSAGE_TYPES.STATUS, { status: adapterStatus });
    }
  });
  var originalFetch = window.fetch.bind(window);
  window.fetch = async function ncfFetch(input, init) {
    const response = await originalFetch(input, init);
    const url = typeof input === "string" ? input : input?.url;
    if (!isCommentApi(url) || !engine.enabled) return response;
    try {
      const payload = await response.clone().json();
      const next = applyFilteredPayload(payload);
      return new Response(JSON.stringify(next), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch (error) {
      adapterStatus = {
        hook: true,
        message: "\u30B3\u30E1\u30F3\u30C8API\u306E\u4E00\u90E8\u3092\u51E6\u7406\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F"
      };
      postToIsolated(MESSAGE_TYPES.STATUS, { status: adapterStatus });
      return response;
    }
  };
  var originalOpen = XMLHttpRequest.prototype.open;
  var originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function ncfOpen(method, url, ...rest) {
    this.__ncfUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function ncfSend(body) {
    if (isCommentApi(this.__ncfUrl) && engine.enabled) {
      this.addEventListener("load", () => {
        try {
          const payload = JSON.parse(this.responseText);
          const next = applyFilteredPayload(payload);
          Object.defineProperty(this, "responseText", { value: JSON.stringify(next) });
          Object.defineProperty(this, "response", { value: JSON.stringify(next) });
        } catch {
        }
      });
    }
    return originalSend.call(this, body);
  };
  postToIsolated(MESSAGE_TYPES.STATUS, { status: adapterStatus });
})();
