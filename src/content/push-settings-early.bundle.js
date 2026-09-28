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
    CONTEXT_NG: "ncf-context-ng",
    DEBUG_LOG: "ncf-debug-log"
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
    const settings = baseSettings();
    settings.enabled = asBoolean(input.enabled, true);
    settings.debugMode = asBoolean(input.debugMode, false);
    settings.lengthFilter = {
      enabled: asBoolean(lengthFilterRaw.enabled, true),
      maxLength: Math.floor(maxLength)
    };
    settings.presets = {
      repeatedCharacters: asBoolean(presetsRaw.repeatedCharacters, false),
      url: asBoolean(presetsRaw.url, false),
      asciiArt: asBoolean(presetsRaw.asciiArt, false)
    };
    settings.keywordRules = Array.isArray(input.keywordRules) ? input.keywordRules.map((rule) => {
      const base = sanitizeRuleBase(rule, "kw");
      return {
        ...base,
        value: asString(rule?.value),
        matchMode: sanitizeMatchMode(rule?.matchMode)
      };
    }) : [];
    settings.regexRules = Array.isArray(input.regexRules) ? input.regexRules.map((rule) => {
      const base = sanitizeRuleBase(rule, "re");
      return {
        ...base,
        pattern: asString(rule?.pattern),
        memo: asString(rule?.memo)
      };
    }) : [];
    settings.blockedUsers = Array.isArray(input.blockedUsers) ? input.blockedUsers.map((rule) => {
      const base = sanitizeRuleBase(rule, "user");
      return {
        ...base,
        userId: asString(rule?.userId ?? rule?.value)
      };
    }) : [];
    settings.allowedUsers = Array.isArray(input.allowedUsers) ? input.allowedUsers.map((rule) => {
      const base = sanitizeRuleBase(rule, "allow");
      return {
        ...base,
        userId: asString(rule?.userId ?? rule?.value)
      };
    }) : [];
    settings.styleFilter = sanitizeStyleFilter(input.styleFilter);
    return { ok: true, settings };
  }

  // src/content/push-settings-early.js
  function postSettings(raw) {
    const parsed = parseSettings(raw);
    window.postMessage(
      {
        source: SOURCE,
        type: MESSAGE_TYPES.SETTINGS,
        settings: parsed.ok ? parsed.settings : defaultSettings()
      },
      location.origin
    );
  }
  chrome.storage.local.get("settings", (stored) => {
    postSettings(stored.settings);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.settings) return;
    postSettings(changes.settings.newValue);
  });
})();
