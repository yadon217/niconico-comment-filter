import { COMMENT_API_HOSTS, MESSAGE_TYPES, SOURCE } from "../shared/constants.js";
import { createFilterEngine, emptyStats, addStat, filterNvCommentPayload } from "../shared/filter-engine.js";
import { defaultSettings } from "../shared/schema.js";

let settings = defaultSettings();
let engine = createFilterEngine(settings);
let stats = emptyStats();
let adapterStatus = { hook: true, message: "" };

function isCommentApi(url) {
  try {
    const parsed = new URL(url, location.href);
    return COMMENT_API_HOSTS.includes(parsed.host) && parsed.pathname.includes("/v1/threads");
  } catch {
    return false;
  }
}

function postToIsolated(type, extra) {
  window.postMessage(
    {
      source: SOURCE,
      type,
      ...extra,
    },
    location.origin,
  );
}

function applyFilteredPayload(payload, meta = {}) {
  const t0 = performance.now();
  const { payload: next, blocked, debugSummary } = filterNvCommentPayload(payload, engine);
  const ms = Math.round(performance.now() - t0);
  // #region agent log
  fetch("http://127.0.0.1:7511/ingest/c1735e42-463a-47c3-97f8-cc00f725b849", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "2771b2" },
    body: JSON.stringify({
      sessionId: "2771b2",
      runId: meta.runId ?? "pre-fix",
      hypothesisId: "H1-H3",
      location: "page-hook.js:applyFilteredPayload",
      message: "threads payload filtered",
      data: {
        via: meta.via ?? "unknown",
        urlPath: meta.urlPath ?? "",
        ms,
        engineEnabled: engine.enabled,
        styleFilter: settings?.styleFilter
          ? {
              enabled: settings.styleFilter.enabled,
              ruleCount: settings.styleFilter.rules?.length ?? 0,
              conditions: settings.styleFilter.rules?.[0]?.conditions ?? [],
            }
          : null,
        ...debugSummary,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  for (const item of blocked) {
    addStat(stats, item.result.reason);
  }
  if (blocked.length) {
    postToIsolated(MESSAGE_TYPES.BLOCKED, { blocked, stats });
  } else {
    postToIsolated(MESSAGE_TYPES.STATS, { stats });
  }
  return next;
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.origin !== location.origin) return;
  const data = event.data;
  if (!data || data.source !== SOURCE) return;
  if (data.type === MESSAGE_TYPES.SETTINGS && data.settings) {
    settings = data.settings;
    engine = createFilterEngine(settings);
    // #region agent log
    fetch("http://127.0.0.1:7511/ingest/c1735e42-463a-47c3-97f8-cc00f725b849", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "2771b2" },
      body: JSON.stringify({
        sessionId: "2771b2",
        runId: "pre-fix",
        hypothesisId: "H5",
        location: "page-hook.js:SETTINGS",
        message: "settings applied in page hook",
        data: {
          enabled: settings.enabled,
          lengthFilter: settings.lengthFilter,
          styleFilter: settings.styleFilter,
          keywordCount: settings.keywordRules?.length ?? 0,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    stats = emptyStats();
    postToIsolated(MESSAGE_TYPES.STATS, { stats });
    postToIsolated(MESSAGE_TYPES.STATUS, { status: adapterStatus });
  }
});

const originalFetch = window.fetch.bind(window);
window.fetch = async function ncfFetch(input, init) {
  const response = await originalFetch(input, init);
  const url = typeof input === "string" ? input : input?.url;
  if (!isCommentApi(url) || !engine.enabled) return response;
  try {
    const payload = await response.clone().json();
    let urlPath = "";
    try {
      urlPath = new URL(url, location.href).pathname;
    } catch {
      urlPath = String(url).slice(0, 120);
    }
    const next = applyFilteredPayload(payload, { via: "fetch", urlPath });
    const bodyText = JSON.stringify(next);
    // #region agent log
    const origLen = response.headers.get("content-length");
    fetch("http://127.0.0.1:7511/ingest/c1735e42-463a-47c3-97f8-cc00f725b849", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "2771b2" },
      body: JSON.stringify({
        sessionId: "2771b2",
        runId: "pre-fix",
        hypothesisId: "H2",
        location: "page-hook.js:fetch",
        message: "fetch response rewritten",
        data: {
          urlPath,
          bodyBytes: bodyText.length,
          origContentLength: origLen ? Number(origLen) : null,
          lengthMismatch:
            origLen != null && Number.isFinite(Number(origLen)) && Number(origLen) !== bodyText.length,
          hadContentEncoding: response.headers.has("content-encoding"),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return new Response(bodyText, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    adapterStatus = {
      hook: true,
      message: "コメントAPIの一部を処理できませんでした",
    };
    postToIsolated(MESSAGE_TYPES.STATUS, { status: adapterStatus });
    return response;
  }
};

const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function ncfOpen(method, url, ...rest) {
  this.__ncfUrl = url;
  return originalOpen.call(this, method, url, ...rest);
};
XMLHttpRequest.prototype.send = function ncfSend(body) {
  if (isCommentApi(this.__ncfUrl) && engine.enabled) {
    this.addEventListener("load", () => {
      try {
        const payload = JSON.parse(this.responseText);
        const next = applyFilteredPayload(payload, {
          via: "xhr",
          urlPath: String(this.__ncfUrl ?? "").slice(0, 120),
        });
        Object.defineProperty(this, "responseText", { value: JSON.stringify(next) });
        Object.defineProperty(this, "response", { value: JSON.stringify(next) });
      } catch {
        // leave original response
      }
    });
  }
  return originalSend.call(this, body);
};

postToIsolated(MESSAGE_TYPES.STATUS, { status: adapterStatus });
