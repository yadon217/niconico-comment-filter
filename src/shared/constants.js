export const SCHEMA_VERSION = 1;

export const MATCH_MODES = Object.freeze({
  CONTAINS: "contains",
  EXACT: "exact",
  REGEX: "regex",
});

export const REASONS = Object.freeze({
  USER: "user",
  KEYWORD: "keyword",
  REGEX: "regex",
  LENGTH: "length",
  PRESET_REPEATED: "preset_repeated",
  PRESET_URL: "preset_url",
  PRESET_AA: "preset_aa",
});

export const MESSAGE_TYPES = Object.freeze({
  SETTINGS: "ncf-settings",
  STATS: "ncf-stats",
  STATUS: "ncf-status",
  BLOCKED: "ncf-blocked",
  CONTEXT_NG: "ncf-context-ng",
});

export const SOURCE = "niconico-comment-filter";

export const COMMENT_API_HOSTS = Object.freeze([
  "nvcomment.nicovideo.jp",
  "public.nvcomment.nicovideo.jp",
]);

export const WATCH_ORIGIN = "https://www.nicovideo.jp";
