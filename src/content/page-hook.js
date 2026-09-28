import { COMMENT_API_HOSTS, MESSAGE_TYPES, SOURCE } from "../shared/constants.js";
import { collectCommentIndexEntries } from "../shared/comment-user-index.js";
import { createFilterEngine, emptyStats, addStat, filterNvCommentPayload } from "../shared/filter-engine.js";
import { defaultSettings } from "../shared/schema.js";

let settings = defaultSettings();
let engine = createFilterEngine(settings);
let stats = emptyStats();
let adapterStatus = { hook: true, message: "" };

function filteredJsonResponse(sourceResponse, nextPayload) {
  const body = JSON.stringify(nextPayload);
  const headers = new Headers();
  headers.set("content-type", "application/json; charset=utf-8");
  const cacheControl = sourceResponse.headers.get("cache-control");
  if (cacheControl) headers.set("cache-control", cacheControl);
  return new Response(body, {
    status: sourceResponse.status,
    statusText: sourceResponse.statusText,
    headers,
  });
}

function isCommentApi(url) {
  try {
    const parsed = new URL(url, location.href);
    return COMMENT_API_HOSTS.includes(parsed.host) && parsed.pathname.startsWith("/v1/");
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

function patchXhrJsonResponse(xhr, payload) {
  const next = applyFilteredPayload(payload);
  const filtered = JSON.stringify(next);
  Object.defineProperty(xhr, "responseText", {
    configurable: true,
    get() {
      return filtered;
    },
  });
  Object.defineProperty(xhr, "response", {
    configurable: true,
    get() {
      return filtered;
    },
  });
}

function applyFilteredPayload(payload) {
  const indexEntries = collectCommentIndexEntries(payload);
  if (indexEntries.length) {
    postToIsolated(MESSAGE_TYPES.COMMENT_INDEX, { entries: indexEntries });
  }
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
    return filteredJsonResponse(response, next);
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
  this.__ncfXhrHook = isCommentApi(url);
  if (this.__ncfXhrHook) {
    const xhr = this;
    xhr.addEventListener(
      "readystatechange",
      function ncfReadyState() {
        if (xhr.readyState !== 4 || xhr.__ncfResponsePatched) return;
        if (!engine.enabled) return;
        try {
          xhr.__ncfResponsePatched = true;
          const payload = JSON.parse(xhr.responseText);
          patchXhrJsonResponse(xhr, payload);
        } catch {
          // leave original response
        }
      },
      true,
    );
  }
  return originalOpen.call(this, method, url, ...rest);
};
XMLHttpRequest.prototype.send = function ncfSend(body) {
  return originalSend.call(this, body);
};

postToIsolated(MESSAGE_TYPES.STATUS, { status: adapterStatus });
