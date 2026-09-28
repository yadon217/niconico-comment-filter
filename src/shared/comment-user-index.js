import { normalizeText } from "./normalize.js";

/** @typedef {{ commentId: string, userId: string, body: string }} CommentIndexEntry */

export const BODY_USER_INDEX_AMBIGUOUS = "__ambiguous__";

/**
 * @param {unknown} payload nvcomment threads JSON
 * @returns {CommentIndexEntry[]}
 */
export function collectCommentIndexEntries(payload) {
  const entries = [];
  const threads = payload?.data?.threads;
  if (!Array.isArray(threads)) return entries;
  for (const thread of threads) {
    const comments = Array.isArray(thread.comments) ? thread.comments : [];
    for (const comment of comments) {
      if (comment?.id == null || comment?.userId == null) continue;
      const commentId = String(comment.id);
      const userId = String(comment.userId);
      if (!commentId || !userId) continue;
      entries.push({
        commentId,
        userId,
        body: comment?.body == null ? "" : String(comment.body),
      });
    }
  }
  return entries;
}

/**
 * @param {Map<string, string>} map
 * @param {CommentIndexEntry[]} entries
 * @param {number} maxSize
 */
export function mergeCommentIndex(map, entries, maxSize = 20_000) {
  for (const { commentId, userId } of entries) {
    map.set(commentId, userId);
  }
  while (map.size > maxSize) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

/**
 * @param {Map<string, string>} map normalized body -> userId or BODY_USER_INDEX_AMBIGUOUS
 * @param {CommentIndexEntry[]} entries
 * @param {number} maxSize
 */
export function mergeBodyUserIndex(map, entries, maxSize = 20_000) {
  for (const { body, userId } of entries) {
    const key = normalizeText(body);
    if (!key) continue;
    const prev = map.get(key);
    if (prev === BODY_USER_INDEX_AMBIGUOUS) continue;
    if (prev === undefined) {
      map.set(key, userId);
    } else if (prev !== userId) {
      map.set(key, BODY_USER_INDEX_AMBIGUOUS);
    }
  }
  while (map.size > maxSize) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

/**
 * @param {Map<string, string> | undefined} bodyMap
 * @param {string | undefined} commentText
 */
export function resolveUserIdFromBodyIndex(bodyMap, commentText) {
  if (!bodyMap || commentText == null) return "";
  const key = normalizeText(commentText);
  if (!key) return "";
  const userId = bodyMap.get(key);
  if (!userId || userId === BODY_USER_INDEX_AMBIGUOUS) return "";
  return userId;
}

/**
 * @param {Element | { getAttribute: (name: string) => string | null }} row
 * @param {Map<string, string> | undefined} idMap commentId -> userId
 * @param {Map<string, string> | undefined} bodyMap normalized body -> userId
 * @param {string | undefined} commentText
 */
export function resolveUserIdForRow(row, idMap, bodyMap, commentText) {
  const fromDom = domUserIdFromRow(row);
  if (fromDom) return fromDom;
  const commentId = commentIdFromRow(row);
  if (commentId && idMap?.has(commentId)) {
    return idMap.get(commentId) ?? "";
  }
  return resolveUserIdFromBodyIndex(bodyMap, commentText);
}

/**
 * @param {Element | null | undefined} row
 */
export function domUserIdFromRow(row) {
  if (!row) return "";
  return (
    row.getAttribute("data-user-id") ||
    row.getAttribute("data-userid") ||
    row.getAttribute("data-user") ||
    ""
  );
}

/**
 * @param {Element | null | undefined} row
 */
export function commentIdFromRow(row) {
  if (!row) return "";
  return (
    row.getAttribute("data-comment-id") ||
    row.getAttribute("data-commentid") ||
    row.getAttribute("data-id") ||
    row.getAttribute("data-nvcomment-id") ||
    ""
  );
}
