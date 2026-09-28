(function injectPageHook() {
  // #region agent log
  fetch("http://127.0.0.1:7511/ingest/c1735e42-463a-47c3-97f8-cc00f725b849", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "ef0df1" },
    body: JSON.stringify({
      sessionId: "ef0df1",
      runId: "post-fix",
      hypothesisId: "H1-H2",
      location: "inject-page-hook.js:entry",
      message: "injector ran",
      data: {
        manifestVersion: chrome.runtime.getManifest?.()?.version,
        href: location.href,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const src = chrome.runtime.getURL("src/content/page-hook.bundle.js");
  if (document.documentElement.dataset.ncfPageHookInjected === "1") return;
  document.documentElement.dataset.ncfPageHookInjected = "1";

  const script = document.createElement("script");
  script.src = src;
  script.async = false;
  (document.head || document.documentElement).appendChild(script);
})();
