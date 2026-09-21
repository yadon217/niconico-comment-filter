/**
 * Light normalization for keyword matching.
 * Does not convert kana or infer readings.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeText(value) {
  const raw = value == null ? "" : String(value);
  return raw.normalize("NFKC").toLocaleLowerCase("en-US").trim();
}

/**
 * User-visible character count (Unicode code points).
 * @param {unknown} value
 * @returns {number}
 */
export function codePointLength(value) {
  const raw = value == null ? "" : String(value);
  return Array.from(raw).length;
}
