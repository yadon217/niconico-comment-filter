import { COMMENT_API_HOSTS, MESSAGE_TYPES, REASONS, SOURCE } from "../shared/constants.js";
import { collectCommentIndexEntries } from "../shared/comment-user-index.js";
import { countNvCommentUserIdInPayload, nvCommentUserId } from "../shared/nvcomment-user.js";
import { agentLog } from "../shared/debug-log.js";
import { createFilterEngine, emptyStats, addStat, filterNvCommentPayload } from "../shared/filter-engine.js";
import { defaultSettings } from "../shared/schema.js";

let settings = defaultSettings();
let engine = createFilterEngine(settings);
let stats = emptyStats();
let adapterStatus = { hook: true, message: "" };
let loggedCommentShape = false;

function firstCommentSample(payload) {
  const threads = payload?.data?.threads;
  if (!Array.isArray(threads)) return null;
  for (const thread of threads) {
    const comments = Array.isArray(thread?.comments) ? thread.comments : [];
    if (comments[0]) return comments[0];
  }
  return null;
}

function threadSummary(payload) {
  const threads = payload?.data?.threads;
  if (!Array.isArray(threads)) return [];
  return threads.map((thread, index) => ({
    index,
    commentCount: Array.isArray(thread?.comments) ? thread.comments.length : 0,
    threadId: thread?.id != null ? String(thread.id) : "",
  }));
}

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

function countPayloadComments(payload) {
  const threads = payload?.data?.threads;
  if (!Array.isArray(threads)) return 0;
  return threads.reduce(
    (sum, thread) => sum + (Array.isArray(thread?.comments) ? thread.comments.length : 0),
    0,
  );
}

function patchXhrJsonResponse(xhr, payload) {
  const next = applyFilteredPayload(payload, "xhr");
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

function applyFilteredPayload(payload, transport = "unknown") {
  if (!loggedCommentShape) {
    const first = firstCommentSample(payload);
    if (first && typeof first === "object") {
      loggedCommentShape = true;
      agentLog(
        "page-hook.js:applyFilteredPayload",
        "sample comment keys",
        {
          keys: Object.keys(first),
          nvUserIdLen: nvCommentUserId(first).length,
        },
        "H",
      );
    }
  }
  const indexEntries = collectCommentIndexEntries(payload);
  if (indexEntries.length) {
    agentLog(
      "page-hook.js:applyFilteredPayload",
      "post COMMENT_INDEX",
      {
        entryCount: indexEntries.length,
        threads: threadSummary(payload),
        blockedUserRuleCount: (settings?.blockedUsers ?? []).filter(
          (item) => item.enabled !== false && item.userId,
        ).length,
      },
      "A",
    );
    postToIsolated(MESSAGE_TYPES.COMMENT_INDEX, { entries: indexEntries });
  }
  const inputCommentCount = countPayloadComments(payload);
  const { payload: next, blocked } = filterNvCommentPayload(payload, engine);
  const outputCommentCount = countPayloadComments(next);
  const blockedUserRuleCount = (settings?.blockedUsers ?? []).filter(
    (item) => item.enabled !== false && item.userId,
  ).length;
  if (blockedUserRuleCount > 0) {
    const userBlocks = blocked.filter((item) => item.result.reason === REASONS.USER).length;
    const blockedId = (settings.blockedUsers ?? []).find(
      (item) => item.enabled !== false && item.userId,
    )?.userId;
    agentLog(
      "page-hook.js:applyFilteredPayload",
      "user filter stats",
      {
        transport,
        userBlocks,
        totalBlocked: blocked.length,
        blockedUserRuleCount,
        engineEnabled: engine.enabled,
        payloadMatchCount: blockedId ? countNvCommentUserIdInPayload(payload, blockedId) : 0,
        inputCommentCount,
        outputCommentCount,
      },
      "F",
    );
  }
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
    agentLog(
      "page-hook.js:SETTINGS",
      "engine rebuilt",
      {
        enabled: settings.enabled,
        blockedUserRuleCount: (settings.blockedUsers ?? []).filter(
          (item) => item.enabled !== false && item.userId,
        ).length,
      },
      "F",
    );
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
    const next = applyFilteredPayload(payload, "fetch");
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
          agentLog(
            "page-hook.js:xhr",
            "patched response at readystatechange capture",
            { commentCountBefore: countPayloadComments(payload) },
            "J",
          );
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
