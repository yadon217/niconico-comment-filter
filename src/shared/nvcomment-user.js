/**
 * @param {unknown} comment nvcomment comment object
 * @returns {string}
 */
export function nvCommentUserId(comment) {
  if (!comment || typeof comment !== "object") return "";
  const raw = /** @type {Record<string, unknown>} */ (comment);
  if (raw.userId != null && raw.userId !== "") return String(raw.userId);
  if (raw.user_id != null && raw.user_id !== "") return String(raw.user_id);
  const owner = raw.owner;
  if (owner && typeof owner === "object") {
    const o = /** @type {Record<string, unknown>} */ (owner);
    if (o.userId != null && o.userId !== "") return String(o.userId);
    if (o.id != null && o.id !== "") return String(o.id);
  }
  const user = raw.user;
  if (user && typeof user === "object") {
    const u = /** @type {Record<string, unknown>} */ (user);
    if (u.id != null && u.id !== "") return String(u.id);
  }
  return "";
}

/**
 * @param {unknown} payload
 * @param {string} targetUserId
 */
export function countNvCommentUserIdInPayload(payload, targetUserId) {
  if (!targetUserId) return 0;
  const threads = payload?.data?.threads;
  if (!Array.isArray(threads)) return 0;
  let count = 0;
  for (const thread of threads) {
    const comments = Array.isArray(thread?.comments) ? thread.comments : [];
    for (const comment of comments) {
      if (nvCommentUserId(comment) === targetUserId) count += 1;
    }
  }
  return count;
}
