/**
 * Parse nvcomment `commands` tokens into site-agnostic style traits.
 * @typedef {"medium"|"big"|"small"} CommentSize
 * @typedef {"naka"|"ue"|"shita"} CommentPosition
 * @typedef {{ hasNonDefaultColor: boolean, size: CommentSize, position: CommentPosition }} CommentStyleTraits
 */

const SIZE_TOKENS = new Set(["big", "small", "medium"]);
const POSITION_TOKENS = new Set(["ue", "shita", "naka"]);

/** Default white only; premium / named colors count as non-default. */
const DEFAULT_COLOR_TOKENS = new Set(["white"]);

const NAMED_COLOR_TOKENS = new Set([
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
  "nobleviolet",
]);

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const LEGACY_COLOR_RE = /^\d+$/;

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

/**
 * @param {unknown} commands
 * @returns {CommentStyleTraits}
 */
export function traitsFromNvCommands(commands) {
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
