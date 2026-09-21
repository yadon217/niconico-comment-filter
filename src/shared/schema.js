import { MATCH_MODES, SCHEMA_VERSION } from "./constants.js";

function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix = "rule") {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultSettings() {
  return {
    schemaVersion: SCHEMA_VERSION,
    enabled: true,
    debugMode: false,
    lengthFilter: {
      enabled: true,
      maxLength: 50,
    },
    keywordRules: [],
    regexRules: [],
    blockedUsers: [],
    allowedUsers: [],
    presets: {
      repeatedCharacters: false,
      url: false,
      asciiArt: false,
    },
  };
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
    createdAt: asString(rule?.createdAt) || nowIso(),
  };
}

function sanitizeMatchMode(mode) {
  if (mode === MATCH_MODES.EXACT || mode === MATCH_MODES.REGEX) return mode;
  return MATCH_MODES.CONTAINS;
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, settings: object } | { ok: false, error: string }}
 */
export function parseSettings(raw) {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "設定JSONがオブジェクトではありません" };
  }

  const input = /** @type {Record<string, unknown>} */ (raw);
  const version = Number(input.schemaVersion ?? SCHEMA_VERSION);
  if (!Number.isFinite(version) || version > SCHEMA_VERSION) {
    return { ok: false, error: `未対応の schemaVersion: ${input.schemaVersion}` };
  }

  const lengthFilterRaw =
    input.lengthFilter && typeof input.lengthFilter === "object"
      ? /** @type {Record<string, unknown>} */ (input.lengthFilter)
      : {};
  const maxLength = Number(lengthFilterRaw.maxLength ?? 50);
  if (!Number.isFinite(maxLength) || maxLength < 1) {
    return { ok: false, error: "文字数しきい値が不正です" };
  }

  const presetsRaw =
    input.presets && typeof input.presets === "object"
      ? /** @type {Record<string, unknown>} */ (input.presets)
      : {};

  const settings = defaultSettings();
  settings.enabled = asBoolean(input.enabled, true);
  settings.debugMode = asBoolean(input.debugMode, false);
  settings.lengthFilter = {
    enabled: asBoolean(lengthFilterRaw.enabled, true),
    maxLength: Math.floor(maxLength),
  };
  settings.presets = {
    repeatedCharacters: asBoolean(presetsRaw.repeatedCharacters, false),
    url: asBoolean(presetsRaw.url, false),
    asciiArt: asBoolean(presetsRaw.asciiArt, false),
  };

  settings.keywordRules = Array.isArray(input.keywordRules)
    ? input.keywordRules.map((rule) => {
        const base = sanitizeRuleBase(rule, "kw");
        return {
          ...base,
          value: asString(rule?.value),
          matchMode: sanitizeMatchMode(rule?.matchMode),
        };
      })
    : [];

  settings.regexRules = Array.isArray(input.regexRules)
    ? input.regexRules.map((rule) => {
        const base = sanitizeRuleBase(rule, "re");
        return {
          ...base,
          pattern: asString(rule?.pattern),
          memo: asString(rule?.memo),
        };
      })
    : [];

  settings.blockedUsers = Array.isArray(input.blockedUsers)
    ? input.blockedUsers.map((rule) => {
        const base = sanitizeRuleBase(rule, "user");
        return {
          ...base,
          userId: asString(rule?.userId ?? rule?.value),
        };
      })
    : [];

  settings.allowedUsers = Array.isArray(input.allowedUsers)
    ? input.allowedUsers.map((rule) => {
        const base = sanitizeRuleBase(rule, "allow");
        return {
          ...base,
          userId: asString(rule?.userId ?? rule?.value),
        };
      })
    : [];

  return { ok: true, settings };
}

/**
 * Compile regex at save time. Invalid patterns are rejected.
 * @param {string} pattern
 * @returns {{ ok: true, regex: RegExp } | { ok: false, error: string }}
 */
export function compileRegex(pattern) {
  const source = asString(pattern);
  if (!source) return { ok: false, error: "正規表現が空です" };
  try {
    return { ok: true, regex: new RegExp(source) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "不正な正規表現です",
    };
  }
}

export function validateRegexRule(pattern) {
  return compileRegex(pattern);
}

export function serializeSettings(settings) {
  const parsed = parseSettings(settings);
  if (!parsed.ok) throw new Error(parsed.error);
  return JSON.stringify(parsed.settings, null, 2);
}
