import { COMBINATORS, MATCH_MODES } from "../shared/constants.js";
import { createId, defaultStyleFilter, serializeSettings, validateRegexRule } from "../shared/schema.js";
import { loadSettings, replaceSettingsFromJson, saveSettings } from "../shared/storage.js";

const els = {
  enabled: document.getElementById("enabled"),
  debug: document.getElementById("debug"),
  lengthEnabled: document.getElementById("lengthEnabled"),
  maxLength: document.getElementById("maxLength"),
  keywordRows: document.getElementById("keyword-rows"),
  keywordError: document.getElementById("keyword-error"),
  userRows: document.getElementById("user-rows"),
  userError: document.getElementById("user-error"),
  importError: document.getElementById("import-error"),
  styleEnabled: document.getElementById("style-enabled"),
  styleColor: document.getElementById("style-color"),
  styleBig: document.getElementById("style-big"),
  styleSmall: document.getElementById("style-small"),
  styleUe: document.getElementById("style-ue"),
  styleShita: document.getElementById("style-shita"),
  styleNaka: document.getElementById("style-naka"),
  styleRuleCombinator: document.getElementById("style-rule-combinator"),
};

const STYLE_CHECKBOX_CONDITIONS = [
  { el: "styleColor", condition: { kind: "color", mode: "non_default" } },
  { el: "styleBig", condition: { kind: "size", value: "big" } },
  { el: "styleSmall", condition: { kind: "size", value: "small" } },
  { el: "styleUe", condition: { kind: "position", value: "ue" } },
  { el: "styleShita", condition: { kind: "position", value: "shita" } },
  { el: "styleNaka", condition: { kind: "position", value: "naka" } },
];

function conditionKey(condition) {
  return `${condition.kind}:${condition.mode ?? condition.value ?? ""}`;
}

function primaryStyleRule() {
  const rules = settings.styleFilter?.rules ?? defaultStyleFilter().rules;
  return rules[0] ?? defaultStyleFilter().rules[0];
}

function conditionsFromCheckboxes() {
  return STYLE_CHECKBOX_CONDITIONS.filter(({ el }) => els[el].checked).map(
    ({ condition }) => condition,
  );
}

function applyStyleCheckboxesFromRule(rule) {
  const active = new Set((rule?.conditions ?? []).map((c) => conditionKey(c)));
  for (const { el, condition } of STYLE_CHECKBOX_CONDITIONS) {
    els[el].checked = active.has(conditionKey(condition));
  }
}

function buildStyleFilterFromUi() {
  const base = settings.styleFilter ?? defaultStyleFilter();
  const rule = {
    ...primaryStyleRule(),
    combinator: els.styleRuleCombinator.value === COMBINATORS.AND
      ? COMBINATORS.AND
      : COMBINATORS.OR,
    conditions: conditionsFromCheckboxes(),
  };
  return {
    ...base,
    enabled: els.styleEnabled.checked,
    combinator: base.combinator ?? COMBINATORS.OR,
    rules: [rule, ...(base.rules ?? []).slice(1)],
  };
}

async function persistStyleFromUi() {
  await persist({
    ...settings,
    styleFilter: buildStyleFilterFromUi(),
  });
}

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

function renderBlockedUsers() {
  els.userRows.replaceChildren();
  for (const rule of settings.blockedUsers) {
    const tr = document.createElement("tr");
    const enabledTd = document.createElement("td");
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = rule.enabled;
    enabled.addEventListener("change", () =>
      toggleList("blockedUsers", rule.id, enabled.checked),
    );
    enabledTd.appendChild(enabled);
    const valueTd = document.createElement("td");
    valueTd.textContent = rule.userId;
    const opTd = document.createElement("td");
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "削除";
    del.addEventListener("click", () => removeFromList("blockedUsers", rule.id));
    opTd.appendChild(del);
    tr.append(enabledTd, valueTd, opTd);
    els.userRows.appendChild(tr);
  }
}

function render() {
  els.enabled.checked = settings.enabled;
  els.debug.checked = settings.debugMode;
  els.lengthEnabled.checked = settings.lengthFilter.enabled;
  els.maxLength.value = String(settings.lengthFilter.maxLength);
  const style = settings.styleFilter ?? defaultStyleFilter();
  els.styleEnabled.checked = style.enabled;
  const styleRule = primaryStyleRule();
  applyStyleCheckboxesFromRule(styleRule);
  els.styleRuleCombinator.value =
    styleRule.combinator === COMBINATORS.AND ? COMBINATORS.AND : COMBINATORS.OR;
  renderKeywords();
  renderBlockedUsers();
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

  els.styleEnabled.addEventListener("change", () => persistStyleFromUi());
  els.styleRuleCombinator.addEventListener("change", () => persistStyleFromUi());
  for (const { el } of STYLE_CHECKBOX_CONDITIONS) {
    els[el].addEventListener("change", () => persistStyleFromUi());
  }

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
    const userId = document.getElementById("user-id").value.trim();
    if (!userId) {
      showError(els.userError, "ユーザー ID を入力してください");
      return;
    }
    if (settings.blockedUsers.some((item) => item.userId === userId)) {
      showError(els.userError, "同じユーザー ID が既に登録されています");
      return;
    }
    showError(els.userError, "");
    document.getElementById("user-id").value = "";
    await persist({
      ...settings,
      blockedUsers: [
        ...settings.blockedUsers,
        {
          id: createId("user"),
          enabled: true,
          userId,
          createdAt: new Date().toISOString(),
        },
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
