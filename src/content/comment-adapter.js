import { resolveUserIdForRow, commentIdFromRow, BODY_USER_INDEX_AMBIGUOUS } from "../shared/comment-user-index.js";
import { agentLog } from "../shared/debug-log.js";
import { normalizeText } from "../shared/normalize.js";
import { MESSAGE_TYPES, SOURCE } from "../shared/constants.js";

export function findCommentListSection() {
  const heading = [...document.querySelectorAll("h1")].find(
    (el) => el.textContent.trim() === "コメントリスト",
  );
  return heading?.closest("section") ?? null;
}

export function findListScroller(section) {
  return section?.querySelector("[class*='custom-scrollbar']") ?? null;
}

/**
 * Best-effort row extraction. Selectors stay in the adapter.
 * @param {Element} target
 * @param {Map<string, string> | undefined} userIdByCommentId
 */
export function commentFromListTarget(target, userIdByCommentId, userIdByBody, userIdByListIndex) {
  if (!(target instanceof Element)) return null;
  const section = findCommentListSection();
  if (!section || !section.contains(target)) return null;
  const row = target.closest("[data-index], tr, li, [role='row']") ?? target.closest("div");
  if (!row || row === section) return null;
  const text = (row.innerText || "").trim();
  if (!text || text === "コメントリスト") return null;
  const commentText = text.split("\n").filter(Boolean).slice(-1)[0] ?? text;
  const userId =
    resolveUserIdForRow(row, userIdByCommentId, userIdByBody, commentText, userIdByListIndex) ||
    undefined;
  const commentId = commentIdFromRow(row) || undefined;
  const normKey = normalizeText(commentText);
  const bodySlot = userIdByBody?.get(normKey);
  const bodyLookup =
    bodySlot === BODY_USER_INDEX_AMBIGUOUS
      ? "ambiguous"
      : bodySlot
        ? "hit"
        : normKey
          ? "miss"
          : "empty_key";
  const rowListIndex = row.getAttribute("data-index") ?? "";
  const listIndexLookup =
    rowListIndex && userIdByListIndex?.has(rowListIndex)
      ? "hit"
      : rowListIndex
        ? "miss"
        : "empty";
  agentLog(
    "comment-adapter.js:commentFromListTarget",
    "resolve comment row",
    {
      lineCount: text.split("\n").filter(Boolean).length,
      commentTextLen: commentText.length,
      rowDataIndex: rowListIndex,
      commentIdAttr: commentId ?? "",
      idMapSize: userIdByCommentId?.size ?? 0,
      bodyMapSize: userIdByBody?.size ?? 0,
      listIndexMapSize: userIdByListIndex?.size ?? 0,
      bodyLookup,
      listIndexLookup,
      resolvedUserId: Boolean(userId),
    },
    "C",
  );
  return {
    text: commentText,
    userId,
    commentId,
    row,
  };
}

export function watchSpaNavigation(onWatchChange) {
  let last = location.pathname;
  const notify = () => {
    if (location.pathname === last) return;
    last = location.pathname;
    if (location.pathname.startsWith("/watch/")) onWatchChange();
  };
  const wrap = (method) => {
    const original = history[method];
    history[method] = function ncfHistory(...args) {
      const result = original.apply(this, args);
      queueMicrotask(notify);
      return result;
    };
  };
  wrap("pushState");
  wrap("replaceState");
  window.addEventListener("popstate", notify);
  return () => {
    window.removeEventListener("popstate", notify);
  };
}

export function postToPage(type, extra = {}) {
  window.postMessage({ source: SOURCE, type, ...extra }, location.origin);
}

export function onPageMessage(handler) {
  const listener = (event) => {
    if (event.source !== window) return;
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== SOURCE) return;
    handler(data);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

export function isWatchPage() {
  return location.pathname.startsWith("/watch/");
}
