import { defaultSettings, parseSettings } from "./schema.js";

const STORAGE_KEY = "settings";

export async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const parsed = parseSettings(stored[STORAGE_KEY]);
    if (!parsed.ok) return defaultSettings();
    return parsed.settings;
  } catch {
    return defaultSettings();
  }
}

export async function saveSettings(settings) {
  const parsed = parseSettings(settings);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: parsed.settings });
  return parsed.settings;
}

export function subscribeSettings(listener) {
  const handler = (changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY]) return;
    const parsed = parseSettings(changes[STORAGE_KEY].newValue);
    listener(parsed.ok ? parsed.settings : defaultSettings());
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

export async function replaceSettingsFromJson(jsonText) {
  let raw;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error("JSONの構文が不正です");
  }
  const parsed = parseSettings(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  return saveSettings(parsed.settings);
}
