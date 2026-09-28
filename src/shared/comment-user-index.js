import { normalizeText } from "./normalize.js";
import { nvCommentUserId } from "./nvcomment-user.js";

/** @typedef {{ commentId: string, userId: string, body: string, listIndex: string }} CommentIndexEntry */

export const BODY_USER_INDEX_AMBIGUOUS = "__ambiguous__";

/**
 * Thread whose comments match the on-page comment list (largest comment array).
 * @param {unknown[]} threads
 */
export function pickListThread(threads) {
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

/**
 * @param {unknown} payload nvcomment threads JSON
 * @returns {CommentIndexEntry[]}
 */
export function collectCommentIndexEntries(payload) {
  const entries = [];
  const threads = payload?.data?.threads;
  if (!Array.isArray(threads)) return entries;
  const listThread = pickListThread(threads);
  const listComments = Array.isArray(listThread?.comments) ? listThread.comments : [];
  const listIndexByCommentId = new Map();
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
        listIndex: listIndexByCommentId.get(commentId) ?? "",
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

export function mergeListIndexMap(map, entries, maxSize = 20_000) {
  for (const { listIndex, userId } of entries) {
    if (listIndex && userId) map.set(listIndex, userId);
  }
  while (map.size > maxSize) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

/**
 * Build data-index → userId maps for API ascending vs reversed list order.
 * @param {CommentIndexEntry[]} entries
 */
export function buildListIndexBodyMaps(entries) {
  /** @type {Map<string, { userId: string, body: string }>} */
  const byListIndex = new Map();
  for (const entry of entries) {
    if (!entry.listIndex || !entry.userId) continue;
    byListIndex.set(entry.listIndex, { userId: entry.userId, body: entry.body });
  }
  const maxIdx = [...byListIndex.keys()].reduce(
    (max, key) => Math.max(max, Number(key) || 0),
    -1,
  );
  /** @type {Map<string, { userId: string, bodyNorm: string }>} */
  const asc = new Map();
  /** @type {Map<string, { userId: string, bodyNorm: string }>} */
  const desc = new Map();
  for (let i = 0; i <= maxIdx; i += 1) {
    const key = String(i);
    const ascEntry = byListIndex.get(key);
    if (ascEntry) {
      asc.set(key, { userId: ascEntry.userId, bodyNorm: normalizeText(ascEntry.body) });
    }
    const revEntry = byListIndex.get(String(maxIdx - i));
    if (revEntry) {
      desc.set(key, { userId: revEntry.userId, bodyNorm: normalizeText(revEntry.body) });
    }
  }
  return { asc, desc };
}

/**
 * @param {Element | null | undefined} row
 */
export function listIndexFromRow(row) {
  if (!row) return "";
  const raw = row.getAttribute("data-index");
  return raw == null ? "" : String(raw);
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
 * @param {Map<string, string> | undefined} listIndexMap data-index -> userId
 * @param {Map<string, { userId: string, bodyNorm: string }> | undefined} listIndexAscMap
 * @param {Map<string, { userId: string, bodyNorm: string }> | undefined} listIndexDescMap
 */
export function resolveUserIdForRow(
  row,
  idMap,
  bodyMap,
  commentText,
  listIndexMap,
  listIndexAscMap,
  listIndexDescMap,
) {
  const fromDom = domUserIdFromRow(row);
  if (fromDom) return fromDom;
  const commentId = commentIdFromRow(row);
  if (commentId && idMap?.has(commentId)) {
    return idMap.get(commentId) ?? "";
  }
  const listIndex = listIndexFromRow(row);
  if (listIndex) {
    const textNorm = normalizeText(commentText ?? "");
    const ascEntry = listIndexAscMap?.get(listIndex);
    const descEntry = listIndexDescMap?.get(listIndex);
    if (textNorm) {
      const ascOk = ascEntry?.bodyNorm === textNorm;
      const descOk = descEntry?.bodyNorm === textNorm;
      if (ascOk && descOk && ascEntry.userId === descEntry.userId) return ascEntry.userId;
      if (ascOk && !descOk) return ascEntry.userId;
      if (descOk && !ascOk) return descEntry.userId;
    }
    if (listIndexMap?.has(listIndex)) {
      return listIndexMap.get(listIndex) ?? "";
    }
  }
  return resolveUserIdFromBodyIndex(bodyMap, commentText);
}

/**
 * @param {Element | null | undefined} row
 */
export function domUserIdFromRow(row) {
  if (!row) return "";
  const fromAttr =
    row.getAttribute("data-user-id") ||
    row.getAttribute("data-userid") ||
    row.getAttribute("data-user") ||
    "";
  if (fromAttr) return fromAttr;
  if (typeof row.querySelector === "function") {
    const link = row.querySelector('a[href*="/user/"]');
    const href = link?.getAttribute("href") ?? "";
    const match = href.match(/\/user\/([^/?#]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return "";
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
