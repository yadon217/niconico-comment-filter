import { evaluateStyleFilter } from "./comment-style.js";
import { MATCH_MODES, REASONS } from "./constants.js";
import { traitsFromNvCommands } from "./nvcomment-commands.js";
import { codePointLength, normalizeText } from "./normalize.js";
import { compileRegex } from "./schema.js";

const URL_RE = /https?:\/\/[^\s]+/i;
const REPEATED_RE = /^(.)\1{19,}$/u;

/**
 * @typedef {object} Comment
 * @property {string} text
 * @property {string} [userId]
 * @property {number} [timestamp]
 * @property {import("./nvcomment-commands.js").CommentStyleTraits} [style]
 */

/**
 * @typedef {object} FilterResult
 * @property {boolean} blocked
 * @property {string} [reason]
 * @property {string} [ruleId]
 */

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

/**
 * Build reusable indexes. Call again only when settings change.
 * @param {object} settings
 */
export function createFilterEngine(settings) {
  const enabled = settings?.enabled !== false;
  const allowedUsers = new Set(
    (settings?.allowedUsers ?? [])
      .filter((item) => item.enabled !== false && item.userId)
      .map((item) => item.userId),
  );
  const blockedUsers = new Map(
    (settings?.blockedUsers ?? [])
      .filter((item) => item.enabled !== false && item.userId)
      .map((item) => [item.userId, item.id]),
  );
  const keywordRules = (settings?.keywordRules ?? [])
    .map(compileKeywordRule)
    .filter((rule) => rule && !rule.invalid);
  const regexRules = (settings?.regexRules ?? [])
    .map((rule) => {
      if (!rule?.enabled || !rule.pattern) return null;
      const compiled = compileRegex(rule.pattern);
      if (!compiled.ok) return null;
      return { ...rule, regex: compiled.regex };
    })
    .filter(Boolean);
  const lengthFilter = settings?.lengthFilter ?? { enabled: false, maxLength: 50 };
  const presets = settings?.presets ?? {};
  const styleFilter = settings?.styleFilter ?? { enabled: false, rules: [] };

  /**
   * @param {Comment} comment
   * @returns {FilterResult}
   */
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
        // ignore
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

/**
 * Filter nvcomment threads JSON in place-copy.
 * @param {object} payload
 * @param {{ evaluate: (comment: Comment) => FilterResult }} engine
 */
export function filterNvCommentPayload(payload, engine) {
  const threads = payload?.data?.threads;
  if (!Array.isArray(threads)) {
    return { payload, blocked: [], debugSummary: { totalIn: 0, totalKept: 0 } };
  }
  const blocked = [];
  const byReason = {};
  let totalIn = 0;
  let totalKept = 0;
  const countMismatch = [];
  const styleBlockedNotColored = [];
  const nextThreads = threads.map((thread) => {
    const comments = Array.isArray(thread.comments) ? thread.comments : [];
    const kept = [];
    for (const comment of comments) {
      totalIn += 1;
      const style = traitsFromNvCommands(comment?.commands);
      const result = engine.evaluate({
        text: comment?.body ?? "",
        userId: comment?.userId ? String(comment.userId) : undefined,
        style,
      });
      if (result.blocked) {
        const reason = result.reason ?? "unknown";
        byReason[reason] = (byReason[reason] ?? 0) + 1;
        if (reason === REASONS.STYLE && !style.hasNonDefaultColor) {
          styleBlockedNotColored.push({
            commands: Array.isArray(comment?.commands) ? comment.commands.slice(0, 8) : [],
            style,
          });
        }
        blocked.push({
          id: comment?.id != null ? String(comment.id) : "",
          text: comment?.body ?? "",
          userId: comment?.userId ? String(comment.userId) : "",
          result,
        });
      } else {
        totalKept += 1;
        kept.push(comment);
      }
    }
    const declared = thread?.commentCount;
    if (typeof declared === "number" && declared !== kept.length) {
      countMismatch.push({
        fork: thread?.fork,
        declared,
        kept: kept.length,
        removed: comments.length - kept.length,
      });
    }
    return { ...thread, comments: kept };
  });
  const debugSummary = {
    totalIn,
    totalKept,
    byReason,
    countMismatch: countMismatch.slice(0, 5),
    styleBlockedNotColoredSample: styleBlockedNotColored.slice(0, 8),
    styleBlockedNotColoredCount: styleBlockedNotColored.length,
  };
  // #region agent log
  if (totalIn > 0 && Object.keys(byReason).length > 0) {
    fetch("http://127.0.0.1:7511/ingest/c1735e42-463a-47c3-97f8-cc00f725b849", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "2771b2" },
      body: JSON.stringify({
        sessionId: "2771b2",
        runId: "pre-fix",
        hypothesisId: "H4-H5",
        location: "filter-engine.js:filterNvCommentPayload",
        message: "block reason breakdown",
        data: debugSummary,
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion
  return {
    payload: {
      ...payload,
      data: {
        ...payload.data,
        threads: nextThreads,
      },
    },
    blocked,
    debugSummary,
  };
}

export function emptyStats() {
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
      [REASONS.STYLE]: 0,
    },
  };
}

export function addStat(stats, reason) {
  stats.total += 1;
  if (reason && stats.byReason[reason] != null) {
    stats.byReason[reason] += 1;
  }
}

export function reasonLabel(reason, rule) {
  switch (reason) {
    case REASONS.USER:
      return "NG：ユーザー";
    case REASONS.KEYWORD:
      return `NG：ワード「${rule?.value ?? ""}」`;
    case REASONS.REGEX:
      return "NG：正規表現";
    case REASONS.LENGTH:
      return "NG：文字数フィルター";
    case REASONS.PRESET_REPEATED:
      return "NG：プリセット（連打）";
    case REASONS.PRESET_URL:
      return "NG：プリセット（URL）";
    case REASONS.PRESET_AA:
      return "NG：プリセット（AA）";
    case REASONS.STYLE:
      return "NG：コメント種別";
    default:
      return "NG";
  }
}
