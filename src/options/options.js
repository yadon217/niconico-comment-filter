import { MATCH_MODES } from "../shared/constants.js";
import { createId, serializeSettings, validateRegexRule } from "../shared/schema.js";
import { loadSettings, replaceSettingsFromJson, saveSettings } from "../shared/storage.js";

const els = {
  enabled: document.getElementById("enabled"),
  debug: document.getElementById("debug"),
  lengthEnabled: document.getElementById("lengthEnabled"),
  maxLength: document.getElementById("maxLength"),
  keywordRows: document.getElementById("keyword-rows"),
  keywordError: document.getElementById("keyword-error"),
  userRows: document.getElementById("user-rows"),
  allowRows: document.getElementById("allow-rows"),
  regexRows: document.getElementById("regex-rows"),
  regexError: document.getElementById("regex-error"),
  presetRepeat: document.getElementById("preset-repeat"),
  presetUrl: document.getElementById("preset-url"),
  presetAa: document.getElementById("preset-aa"),
  importError: document.getElementById("import-error"),
};

let settings;

function showError(node, message) {
  node.hidden = !message;
  node.textContent = message || "";
}

async function persist(next = settings) {
  settings = await saveSettings(next);
  render();
}

function toggleList(listName, id, enabled) {
  return persist({
    ...settings,
    [listName]: settings[listName].map((item) =>
      item.id === id ? { ...item, enabled } : item,
    ),
  });
}

function removeFromList(listName, id) {
  return persist({
    ...settings,
    [listName]: settings[listName].filter((item) => item.id !== id),
  });
}

function renderUserList(container, listName) {
  container.replaceChildren();
  for (const item of settings[listName]) {
    const row = document.createElement("div");
    row.className = "rule";
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = item.enabled;
    enabled.addEventListener("change", () => toggleList(listName, item.id, enabled.checked));
    const label = document.createElement("span");
    label.textContent = item.userId;
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "削除";
    del.addEventListener("click", () => removeFromList(listName, item.id));
    row.append(enabled, label, del);
    container.appendChild(row);
  }
}

function renderKeywords() {
  els.keywordRows.replaceChildren();
  for (const rule of settings.keywordRules) {
    const tr = document.createElement("tr");
    const enabledTd = document.createElement("td");
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = rule.enabled;
    enabled.addEventListener("change", () =>
      toggleList("keywordRules", rule.id, enabled.checked),
    );
    enabledTd.appendChild(enabled);
    const valueTd = document.createElement("td");
    valueTd.textContent = rule.value;
    const modeTd = document.createElement("td");
    modeTd.textContent = rule.matchMode;
    const opTd = document.createElement("td");
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "削除";
    del.addEventListener("click", () => removeFromList("keywordRules", rule.id));
    opTd.appendChild(del);
    tr.append(enabledTd, valueTd, modeTd, opTd);
    els.keywordRows.appendChild(tr);
  }
}

function renderRegex() {
  els.regexRows.replaceChildren();
  for (const rule of settings.regexRules) {
    const row = document.createElement("div");
    row.className = "rule";
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = rule.enabled;
    enabled.addEventListener("change", () =>
      toggleList("regexRules", rule.id, enabled.checked),
    );
    const pattern = document.createElement("code");
    pattern.textContent = rule.pattern;
    const memo = document.createElement("span");
    memo.textContent = rule.memo || "";
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "削除";
    del.addEventListener("click", () => removeFromList("regexRules", rule.id));
    row.append(enabled, pattern, memo, del);
    els.regexRows.appendChild(row);
  }
}

function render() {
  els.enabled.checked = settings.enabled;
  els.debug.checked = settings.debugMode;
  els.lengthEnabled.checked = settings.lengthFilter.enabled;
  els.maxLength.value = String(settings.lengthFilter.maxLength);
  els.presetRepeat.checked = settings.presets.repeatedCharacters;
  els.presetUrl.checked = settings.presets.url;
  els.presetAa.checked = settings.presets.asciiArt;
  renderKeywords();
  renderUserList(els.userRows, "blockedUsers");
  renderUserList(els.allowRows, "allowedUsers");
  renderRegex();
}

function addRuleForm(formId, handler) {
  document.getElementById(formId).addEventListener("submit", async (event) => {
    event.preventDefault();
    await handler();
  });
}

async function init() {
  settings = await loadSettings();
  render();

  els.enabled.addEventListener("change", () => persist({ ...settings, enabled: els.enabled.checked }));
  els.debug.addEventListener("change", () => persist({ ...settings, debugMode: els.debug.checked }));
  els.lengthEnabled.addEventListener("change", () =>
    persist({
      ...settings,
      lengthFilter: { ...settings.lengthFilter, enabled: els.lengthEnabled.checked },
    }),
  );
  els.maxLength.addEventListener("change", () => {
    const maxLength = Math.max(1, Number(els.maxLength.value) || 50);
    return persist({
      ...settings,
      lengthFilter: { ...settings.lengthFilter, maxLength },
    });
  });
  els.presetRepeat.addEventListener("change", () =>
    persist({
      ...settings,
      presets: { ...settings.presets, repeatedCharacters: els.presetRepeat.checked },
    }),
  );
  els.presetUrl.addEventListener("change", () =>
    persist({ ...settings, presets: { ...settings.presets, url: els.presetUrl.checked } }),
  );
  els.presetAa.addEventListener("change", () =>
    persist({ ...settings, presets: { ...settings.presets, asciiArt: els.presetAa.checked } }),
  );

  addRuleForm("keyword-form", async () => {
    const value = document.getElementById("keyword-value").value.trim();
    const matchMode = document.getElementById("keyword-mode").value;
    if (matchMode === MATCH_MODES.REGEX) {
      const result = validateRegexRule(value);
      if (!result.ok) {
        showError(els.keywordError, result.error);
        return;
      }
    }
    showError(els.keywordError, "");
    document.getElementById("keyword-value").value = "";
    await persist({
      ...settings,
      keywordRules: [
        ...settings.keywordRules,
        { id: createId("kw"), enabled: true, value, matchMode, createdAt: new Date().toISOString() },
      ],
    });
  });

  addRuleForm("user-form", async () => {
    const userId = document.getElementById("user-value").value.trim();
    document.getElementById("user-value").value = "";
    await persist({
      ...settings,
      blockedUsers: [
        ...settings.blockedUsers,
        { id: createId("user"), enabled: true, userId, createdAt: new Date().toISOString() },
      ],
    });
  });

  addRuleForm("allow-form", async () => {
    const userId = document.getElementById("allow-value").value.trim();
    document.getElementById("allow-value").value = "";
    await persist({
      ...settings,
      allowedUsers: [
        ...settings.allowedUsers,
        { id: createId("allow"), enabled: true, userId, createdAt: new Date().toISOString() },
      ],
    });
  });

  addRuleForm("regex-form", async () => {
    const pattern = document.getElementById("regex-value").value.trim();
    const memo = document.getElementById("regex-memo").value.trim();
    const result = validateRegexRule(pattern);
    if (!result.ok) {
      showError(els.regexError, result.error);
      return;
    }
    showError(els.regexError, "");
    document.getElementById("regex-value").value = "";
    document.getElementById("regex-memo").value = "";
    await persist({
      ...settings,
      regexRules: [
        ...settings.regexRules,
        { id: createId("re"), enabled: true, pattern, memo, createdAt: new Date().toISOString() },
      ],
    });
  });

  document.getElementById("export").addEventListener("click", () => {
    const blob = new Blob([serializeSettings(settings)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "niconico-comment-filter.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("import").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      settings = await replaceSettingsFromJson(text);
      showError(els.importError, "");
      render();
    } catch (error) {
      showError(els.importError, error instanceof Error ? error.message : "インポートに失敗しました");
    } finally {
      event.target.value = "";
    }
  });
}

init();
