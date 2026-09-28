import { MESSAGE_TYPES, SOURCE } from "./constants.js";

/** @param {string} location @param {string} message @param {Record<string, unknown>} data @param {string} hypothesisId */
export function agentLog(location, message, data, hypothesisId) {
  const payload = {
    sessionId: "690dc9",
    location,
    message,
    data,
    hypothesisId,
    timestamp: Date.now(),
    runId: "post-fix",
  };
  // #region agent log
  if (typeof chrome !== "undefined" && chrome.runtime?.id) {
    fetch("http://127.0.0.1:7511/ingest/c1735e42-463a-47c3-97f8-cc00f725b849", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "690dc9" },
      body: JSON.stringify(payload),
    }).catch(() => {});
    return;
  }
  if (typeof window !== "undefined" && typeof location !== "undefined") {
    window.postMessage(
      {
        source: SOURCE,
        type: MESSAGE_TYPES.DEBUG_LOG,
        ...payload,
      },
      location.origin,
    );
  }
  // #endregion
}
