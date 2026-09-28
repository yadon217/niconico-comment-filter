/** @typedef {{ commentId: string, userId: string }} CommentIndexEntry */

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
      entries.push({ commentId, userId });
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

/**
 * @param {Element} row
 * @param {Map<string, string> | undefined} indexMap
 */
export function resolveUserIdForRow(row, indexMap) {
  const fromDom = domUserIdFromRow(row);
  if (fromDom) return fromDom;
  const commentId = commentIdFromRow(row);
  if (commentId && indexMap?.has(commentId)) {
    return indexMap.get(commentId) ?? "";
  }
  return "";
}
