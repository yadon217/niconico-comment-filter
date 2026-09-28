(function injectPageHook() {
  const src = chrome.runtime.getURL("src/content/page-hook.bundle.js");
  if (document.documentElement.dataset.ncfPageHookInjected === "1") return;
  document.documentElement.dataset.ncfPageHookInjected = "1";

  const script = document.createElement("script");
  script.src = src;
  script.async = false;
  (document.head || document.documentElement).appendChild(script);
})();
