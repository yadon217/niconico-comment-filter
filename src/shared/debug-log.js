/** @param {string} location @param {string} message @param {Record<string, unknown>} data @param {string} hypothesisId */
export function agentLog(location, message, data, hypothesisId) {
  // #region agent log
  fetch("http://127.0.0.1:7511/ingest/c1735e42-463a-47c3-97f8-cc00f725b849", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "690dc9" },
    body: JSON.stringify({
      sessionId: "690dc9",
      location,
      message,
      data,
      hypothesisId,
      timestamp: Date.now(),
      runId: "pre-fix",
    }),
  }).catch(() => {});
  // #endregion
}
