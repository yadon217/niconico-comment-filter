import { COMBINATORS, MATCH_MODES, SCHEMA_VERSION } from "./constants.js";
import shippedDefaults from "./shipped-defaults.json" with { type: "json" };

function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix = "rule") {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function baseSettings() {
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
    styleFilter: defaultStyleFilter(),
  };
}

export function defaultStyleFilter() {
  return {
    enabled: false,
    combinator: COMBINATORS.OR,
    rules: [
      {
        id: "style_default",
        enabled: true,
        combinator: COMBINATORS.OR,
        conditions: [],
      },
    ],
  };
}

function sanitizeCombinator(value) {
  return value === COMBINATORS.AND ? COMBINATORS.AND : COMBINATORS.OR;
}

const STYLE_SIZE_VALUES = new Set(["big", "small", "medium"]);
const STYLE_POSITION_VALUES = new Set(["ue", "shita", "naka"]);
const STYLE_COLOR_MODES = new Set(["non_default", "default"]);

function sanitizeStyleCondition(raw) {
  if (!raw || typeof raw !== "object") return null;
  const item = /** @type {Record<string, unknown>} */ (raw);
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
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? /** @type {Record<string, unknown>} */ (raw)
      : {};
  const rulesRaw = Array.isArray(input.rules) ? input.rules : [];
  const rules = rulesRaw.length
    ? rulesRaw.map((rule) => {
        const base = sanitizeRuleBase(rule, "style");
        const conditions = Array.isArray(rule?.conditions)
          ? rule.conditions.map(sanitizeStyleCondition).filter(Boolean)
          : [];
        return {
          ...base,
          combinator: sanitizeCombinator(rule?.combinator),
          conditions,
        };
      })
    : defaultStyleFilter().rules;

  return {
    enabled: asBoolean(input.enabled, false),
    combinator: sanitizeCombinator(input.combinator),
    rules,
  };
}

function pickShippedPreset() {
  const shipped = /** @type {Record<string, unknown>} */ (shippedDefaults);
  const lengthRaw =
    shipped.lengthFilter && typeof shipped.lengthFilter === "object"
      ? /** @type {Record<string, unknown>} */ (shipped.lengthFilter)
      : null;
  return {
    lengthFilter: lengthRaw
      ? {
          enabled: lengthRaw.enabled,
          maxLength: lengthRaw.maxLength,
        }
      : undefined,
    keywordRules: Array.isArray(shipped.keywordRules) ? shipped.keywordRules : [],
  };
}

/** 新規インストール時（storage 空）の初期値。Store 同梱プリセットを含む。 */
export function defaultSettings() {
  const preset = pickShippedPreset();
  const parsed = parseSettings({
    ...baseSettings(),
    ...(preset.lengthFilter ? { lengthFilter: preset.lengthFilter } : {}),
    keywordRules: preset.keywordRules,
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

  const settings = baseSettings();
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

  settings.styleFilter = sanitizeStyleFilter(input.styleFilter);

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
