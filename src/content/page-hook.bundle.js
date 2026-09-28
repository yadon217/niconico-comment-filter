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
  function codePointLength(value) {
    const raw = value == null ? "" : String(value);
    return Array.from(raw).length;
  }

  // src/shared/nvcomment-user.js
  function nvCommentUserId(comment) {
    if (!comment || typeof comment !== "object") return "";
    const raw = (
      /** @type {Record<string, unknown>} */
      comment
    );
    if (raw.userId != null && raw.userId !== "") return String(raw.userId);
    if (raw.user_id != null && raw.user_id !== "") return String(raw.user_id);
    const owner = raw.owner;
    if (owner && typeof owner === "object") {
      const o = (
        /** @type {Record<string, unknown>} */
        owner
      );
      if (o.userId != null && o.userId !== "") return String(o.userId);
      if (o.id != null && o.id !== "") return String(o.id);
    }
    const user = raw.user;
    if (user && typeof user === "object") {
      const u = (
        /** @type {Record<string, unknown>} */
        user
      );
      if (u.id != null && u.id !== "") return String(u.id);
    }
    return "";
  }
  function countNvCommentUserIdInPayload(payload, targetUserId) {
    if (!targetUserId) return 0;
    const threads = payload?.data?.threads;
    if (!Array.isArray(threads)) return 0;
    let count = 0;
    for (const thread of threads) {
      const comments = Array.isArray(thread?.comments) ? thread.comments : [];
      for (const comment of comments) {
        if (nvCommentUserId(comment) === targetUserId) count += 1;
      }
    }
    return count;
  }

  // src/shared/comment-user-index.js
  function pickListThread(threads) {
    if (!threads.length) return null;
    let best = threads[0];
    let bestLen = Array.isArray(best?.comments) ? best.comments.length : 0;
    for (const thread of threads) {
      const len = Array.isArray(thread?.comments) ? thread.comments.length : 0;
      if (len > bestLen) {
        best = thread;
        bestLen = len;
      }
    }
    return best;
  }
  function collectCommentIndexEntries(payload) {
    const entries = [];
    const threads = payload?.data?.threads;
    if (!Array.isArray(threads)) return entries;
    const listThread = pickListThread(threads);
    const listComments = Array.isArray(listThread?.comments) ? listThread.comments : [];
    const listIndexByCommentId = /* @__PURE__ */ new Map();
    let listIndexCounter = 0;
    for (const comment of listComments) {
      const listIndex = String(listIndexCounter++);
      const uid = nvCommentUserId(comment);
      if (comment?.id == null || !uid) continue;
      listIndexByCommentId.set(String(comment.id), listIndex);
    }
    for (const thread of threads) {
      const comments = Array.isArray(thread.comments) ? thread.comments : [];
      for (const comment of comments) {
        const userId = nvCommentUserId(comment);
        if (comment?.id == null || !userId) continue;
        const commentId = String(comment.id);
        entries.push({
          commentId,
          userId,
          body: comment?.body == null ? "" : String(comment.body),
          listIndex: listIndexByCommentId.get(commentId) ?? ""
        });
      }
    }
    return entries;
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
        runId: "post-fix"
      })
    }).catch(() => {
    });
  }

  // src/shared/comment-style.js
  function conditionMatches(traits, condition) {
    if (!condition?.kind) return false;
    if (condition.kind === "color") {
      if (condition.mode === "non_default") return traits.hasNonDefaultColor;
      if (condition.mode === "default") return !traits.hasNonDefaultColor;
      return false;
    }
    if (condition.kind === "size") {
      const value = condition.value ?? "medium";
      return traits.size === value;
    }
    if (condition.kind === "position") {
      const value = condition.value ?? "naka";
      return traits.position === value;
    }
    return false;
  }
  function ruleMatches(traits, rule) {
    if (rule?.enabled === false) return false;
    const conditions = Array.isArray(rule?.conditions) ? rule.conditions : [];
    if (!conditions.length) return false;
    const combinator = rule.combinator === "and" ? "and" : "or";
    if (combinator === "and") {
      return conditions.every((c) => conditionMatches(traits, c));
    }
    return conditions.some((c) => conditionMatches(traits, c));
  }
  function evaluateStyleFilter(traits, styleFilter) {
    if (styleFilter?.enabled !== true) return { blocked: false };
    const rules = (styleFilter.rules ?? []).filter((r) => r && r.enabled !== false);
    if (!rules.length) return { blocked: false };
    const combinator = styleFilter.combinator === "and" ? "and" : "or";
    if (combinator === "and") {
      const allMatch = rules.every((rule) => ruleMatches(traits, rule));
      if (!allMatch) return { blocked: false };
      return { blocked: true, ruleId: rules[0]?.id ?? "style" };
    }
    for (const rule of rules) {
      if (ruleMatches(traits, rule)) {
        return { blocked: true, ruleId: rule.id ?? "style" };
      }
    }
    return { blocked: false };
  }

  // src/shared/nvcomment-commands.js
  var SIZE_TOKENS = /* @__PURE__ */ new Set(["big", "small", "medium"]);
  var POSITION_TOKENS = /* @__PURE__ */ new Set(["ue", "shita", "naka"]);
  var DEFAULT_COLOR_TOKENS = /* @__PURE__ */ new Set(["white"]);
  var NAMED_COLOR_TOKENS = /* @__PURE__ */ new Set([
    "white",
    "red",
    "pink",
    "orange",
    "yellow",
    "green",
    "cyan",
    "blue",
    "purple",
    "black",
    "white2",
    "red2",
    "pink2",
    "orange2",
    "yellow2",
    "green2",
    "cyan2",
    "blue2",
    "purple2",
    "black2",
    "niconicowhite",
    "truered",
    "madyellow",
    "passionorange",
    "elementalgreen",
    "marineblue",
    "nobleviolet"
  ]);
  var HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
  var LEGACY_COLOR_RE = /^\d+$/;
  function isIgnoredToken(token) {
    const lower = token.toLowerCase();
    if (SIZE_TOKENS.has(lower) || POSITION_TOKENS.has(lower)) return false;
    if (NAMED_COLOR_TOKENS.has(lower)) return false;
    if (HEX_COLOR_RE.test(token) || LEGACY_COLOR_RE.test(token)) return false;
    return true;
  }
  function isNonDefaultColorToken(token) {
    const lower = token.toLowerCase();
    if (HEX_COLOR_RE.test(token) || LEGACY_COLOR_RE.test(token)) return true;
    if (!NAMED_COLOR_TOKENS.has(lower)) return false;
    return !DEFAULT_COLOR_TOKENS.has(lower);
  }
  function traitsFromNvCommands(commands) {
    let size = "medium";
    let position = "naka";
    let hasNonDefaultColor = false;
    const list = Array.isArray(commands) ? commands : [];
    for (const raw of list) {
      if (raw == null) continue;
      const token = String(raw).trim();
      if (!token) continue;
      const lower = token.toLowerCase();
      if (SIZE_TOKENS.has(lower)) {
        size = lower;
        continue;
      }
      if (POSITION_TOKENS.has(lower)) {
        position = lower;
        continue;
      }
      if (isIgnoredToken(token)) continue;
      if (isNonDefaultColorToken(token)) {
        hasNonDefaultColor = true;
      }
    }
    return { hasNonDefaultColor, size, position };
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
    const styleFilter = settings2?.styleFilter ?? { enabled: false, rules: [] };
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
      const traits = comment?.style ?? traitsFromNvCommands([]);
      const styleResult = evaluateStyleFilter(traits, styleFilter);
      if (styleResult.blocked) {
        return blocked(REASONS.STYLE, styleResult.ruleId ?? "style");
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
        const uid = nvCommentUserId(comment);
        const result = engine2.evaluate({
          text: comment?.body ?? "",
          userId: uid || void 0,
          style: traitsFromNvCommands(comment?.commands)
        });
        if (result.blocked) {
          blocked2.push({
            id: comment?.id != null ? String(comment.id) : "",
            text: comment?.body ?? "",
            userId: uid,
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
        [REASONS.PRESET_AA]: 0,
        [REASONS.STYLE]: 0
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
  var loggedCommentShape = false;
  function firstCommentSample(payload) {
    const threads = payload?.data?.threads;
    if (!Array.isArray(threads)) return null;
    for (const thread of threads) {
      const comments = Array.isArray(thread?.comments) ? thread.comments : [];
      if (comments[0]) return comments[0];
    }
    return null;
  }
  function threadSummary(payload) {
    const threads = payload?.data?.threads;
    if (!Array.isArray(threads)) return [];
    return threads.map((thread, index) => ({
      index,
      commentCount: Array.isArray(thread?.comments) ? thread.comments.length : 0,
      threadId: thread?.id != null ? String(thread.id) : ""
    }));
  }
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
    if (!loggedCommentShape) {
      const first = firstCommentSample(payload);
      if (first && typeof first === "object") {
        loggedCommentShape = true;
        agentLog(
          "page-hook.js:applyFilteredPayload",
          "sample comment keys",
          {
            keys: Object.keys(first),
            nvUserIdLen: nvCommentUserId(first).length
          },
          "H"
        );
      }
    }
    const indexEntries = collectCommentIndexEntries(payload);
    if (indexEntries.length) {
      agentLog(
        "page-hook.js:applyFilteredPayload",
        "post COMMENT_INDEX",
        {
          entryCount: indexEntries.length,
          threads: threadSummary(payload),
          blockedUserRuleCount: (settings?.blockedUsers ?? []).filter(
            (item) => item.enabled !== false && item.userId
          ).length
        },
        "A"
      );
      postToIsolated(MESSAGE_TYPES.COMMENT_INDEX, { entries: indexEntries });
    }
    const { payload: next, blocked: blocked2 } = filterNvCommentPayload(payload, engine);
    const blockedUserRuleCount = (settings?.blockedUsers ?? []).filter(
      (item) => item.enabled !== false && item.userId
    ).length;
    if (blockedUserRuleCount > 0) {
      const userBlocks = blocked2.filter((item) => item.result.reason === REASONS.USER).length;
      const blockedId = (settings.blockedUsers ?? []).find(
        (item) => item.enabled !== false && item.userId
      )?.userId;
      agentLog(
        "page-hook.js:applyFilteredPayload",
        "user filter stats",
        {
          userBlocks,
          totalBlocked: blocked2.length,
          blockedUserRuleCount,
          engineEnabled: engine.enabled,
          payloadMatchCount: blockedId ? countNvCommentUserIdInPayload(payload, blockedId) : 0
        },
        "F"
      );
    }
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
      agentLog(
        "page-hook.js:SETTINGS",
        "engine rebuilt",
        {
          enabled: settings.enabled,
          blockedUserRuleCount: (settings.blockedUsers ?? []).filter(
            (item) => item.enabled !== false && item.userId
          ).length
        },
        "F"
      );
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
