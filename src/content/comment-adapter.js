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
 */
export function commentFromListTarget(target) {
  if (!(target instanceof Element)) return null;
  const section = findCommentListSection();
  if (!section || !section.contains(target)) return null;
  const row = target.closest("[data-index], tr, li, [role='row']") ?? target.closest("div");
  if (!row || row === section) return null;
  const text = (row.innerText || "").trim();
  if (!text || text === "コメントリスト") return null;
  const userId =
    row.getAttribute("data-user-id") ||
    row.getAttribute("data-userid") ||
    row.getAttribute("data-user") ||
    "";
  return {
    text: text.split("\n").filter(Boolean).slice(-1)[0] ?? text,
    userId: userId || undefined,
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
