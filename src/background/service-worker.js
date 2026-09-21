import { MESSAGE_TYPES } from "../shared/constants.js";
import { defaultSettings } from "../shared/schema.js";
import { loadSettings, saveSettings } from "../shared/storage.js";

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get("settings");
  if (!stored.settings) {
    await saveSettings(defaultSettings());
  } else {
    await loadSettings();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.STATS) {
    const tabId = sender.tab?.id;
    if (tabId != null) {
      chrome.storage.session.set({
        [`stats:${tabId}`]: {
          stats: message.stats ?? { total: 0, byReason: {} },
          videoId: message.videoId ?? "",
        },
      });
    }
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
