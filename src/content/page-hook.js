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

function applyFilteredPayload(payload) {
  const { payload: next, blocked } = filterNvCommentPayload(payload, engine);
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
    const next = applyFilteredPayload(payload);
    return new Response(JSON.stringify(next), {
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
        const next = applyFilteredPayload(payload);
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
