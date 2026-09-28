import { MESSAGE_TYPES, SOURCE } from "../shared/constants.js";
import { defaultSettings, parseSettings } from "../shared/schema.js";

function postSettings(raw) {
  const parsed = parseSettings(raw);
  window.postMessage(
    {
      source: SOURCE,
      type: MESSAGE_TYPES.SETTINGS,
      settings: parsed.ok ? parsed.settings : defaultSettings(),
    },
    location.origin,
  );
}

chrome.storage.local.get("settings", (stored) => {
  postSettings(stored.settings);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.settings) return;
  postSettings(changes.settings.newValue);
});
