import { describe, expect, it } from "vitest";
import { MATCH_MODES, REASONS } from "../src/shared/constants.js";
import { createFilterEngine, filterNvCommentPayload } from "../src/shared/filter-engine.js";
import { codePointLength, normalizeText } from "../src/shared/normalize.js";
import { compileRegex, defaultSettings, parseSettings } from "../src/shared/schema.js";

function settings(overrides) {
  return { ...defaultSettings(), ...overrides };
}

describe("normalize", () => {
  it("ignores latin case", () => {
    expect(normalizeText("AbC")).toBe("abc");
  });

  it("normalizes fullwidth/halfwidth", () => {
    expect(normalizeText("ＡＢＣ")).toBe("abc");
    expect(normalizeText("１")).toBe("1");
  });
});

describe("filter engine", () => {
  it("blocks keyword contains match", () => {
    const engine = createFilterEngine(
      settings({
        keywordRules: [
          { id: "kw1", enabled: true, value: "ネタバレ", matchMode: MATCH_MODES.CONTAINS },
        ],
      }),
    );
    expect(engine.evaluate({ text: "これはネタバレです" })).toMatchObject({
      blocked: true,
      reason: REASONS.KEYWORD,
      ruleId: "kw1",
    });
  });

  it("does not block extra characters on exact match", () => {
    const engine = createFilterEngine(
      settings({
        keywordRules: [
          { id: "kw1", enabled: true, value: "hello", matchMode: MATCH_MODES.EXACT },
        ],
      }),
    );
    expect(engine.evaluate({ text: "hello world" }).blocked).toBe(false);
    expect(engine.evaluate({ text: "hello" }).blocked).toBe(true);
  });

  it("treats latin case as the same", () => {
    const engine = createFilterEngine(
      settings({
        keywordRules: [
          { id: "kw1", enabled: true, value: "NGWORD", matchMode: MATCH_MODES.CONTAINS },
        ],
      }),
    );
    expect(engine.evaluate({ text: "ngword here" }).blocked).toBe(true);
  });

  it("matches after fullwidth/halfwidth normalize", () => {
    const engine = createFilterEngine(
      settings({
        keywordRules: [
          { id: "kw1", enabled: true, value: "ABC", matchMode: MATCH_MODES.CONTAINS },
        ],
      }),
    );
    expect(engine.evaluate({ text: "look ＡＢＣ" }).blocked).toBe(true);
  });

  it("blocks NG users", () => {
    const engine = createFilterEngine(
      settings({
        blockedUsers: [{ id: "u1", enabled: true, userId: "user-a" }],
      }),
    );
    expect(engine.evaluate({ text: "hi", userId: "user-a" })).toMatchObject({
      blocked: true,
      reason: REASONS.USER,
    });
  });

  it("whitelist beats NG user", () => {
    const engine = createFilterEngine(
      settings({
        blockedUsers: [{ id: "u1", enabled: true, userId: "user-a" }],
        allowedUsers: [{ id: "a1", enabled: true, userId: "user-a" }],
        keywordRules: [
          { id: "kw1", enabled: true, value: "spam", matchMode: MATCH_MODES.CONTAINS },
        ],
        lengthFilter: { enabled: true, maxLength: 5 },
      }),
    );
    expect(
      engine.evaluate({ text: "spam ".repeat(20), userId: "user-a" }).blocked,
    ).toBe(false);
  });

  it("shows comments below the length threshold", () => {
    const engine = createFilterEngine(
      settings({ lengthFilter: { enabled: true, maxLength: 5 } }),
    );
    expect(engine.evaluate({ text: "abcd" }).blocked).toBe(false);
  });

  it("hides comments at or above the length threshold using code points", () => {
    const engine = createFilterEngine(
      settings({ lengthFilter: { enabled: true, maxLength: 3 } }),
    );
    expect(engine.evaluate({ text: "あい" }).blocked).toBe(false);
    expect(engine.evaluate({ text: "あい😊" }).blocked).toBe(true);
    expect(codePointLength("あい😊")).toBe(3);
  });

  it("blocks regex matches", () => {
    const engine = createFilterEngine(
      settings({
        regexRules: [{ id: "re1", enabled: true, pattern: "^(.)\\1{19,}$" }],
      }),
    );
    expect(engine.evaluate({ text: "あ".repeat(20) }).blocked).toBe(true);
    expect(engine.evaluate({ text: "あ".repeat(3) }).blocked).toBe(false);
  });

  it("does not stop the whole engine on a bad regex at runtime", () => {
    const engine = createFilterEngine(
      settings({
        regexRules: [
          { id: "bad", enabled: true, pattern: "(" },
          { id: "ok", enabled: true, pattern: "blockme" },
        ],
      }),
    );
    expect(engine.evaluate({ text: "blockme" })).toMatchObject({
      blocked: true,
      ruleId: "ok",
    });
  });

  it("does not apply disabled presets", () => {
    const engine = createFilterEngine(
      settings({
        presets: { repeatedCharacters: false, url: false, asciiArt: false },
      }),
    );
    expect(engine.evaluate({ text: "http://example.com" }).blocked).toBe(false);
    expect(engine.evaluate({ text: "w".repeat(30) }).blocked).toBe(false);
  });

  it("applies url preset when enabled", () => {
    const engine = createFilterEngine(
      settings({ presets: { url: true } }),
    );
    expect(engine.evaluate({ text: "see https://example.com" }).reason).toBe(
      REASONS.PRESET_URL,
    );
  });

  it("passes all comments when globally disabled", () => {
    const engine = createFilterEngine(
      settings({
        enabled: false,
        keywordRules: [
          { id: "kw1", enabled: true, value: "x", matchMode: MATCH_MODES.CONTAINS },
        ],
      }),
    );
    expect(engine.evaluate({ text: "x" }).blocked).toBe(false);
  });
});

describe("schema", () => {
  it("rejects invalid regex at save time", () => {
    const result = compileRegex("(");
    expect(result.ok).toBe(false);
  });

  it("rejects a broken import payload without applying it", () => {
    const result = parseSettings("not-an-object");
    expect(result.ok).toBe(false);
  });

  it("fills defaults for a partial object", () => {
    const result = parseSettings({ enabled: false });
    expect(result.ok).toBe(true);
    expect(result.settings.schemaVersion).toBe(1);
    expect(result.settings.lengthFilter.maxLength).toBe(50);
  });

  it("applies shipped preset in defaultSettings for new installs", () => {
    const result = defaultSettings();
    expect(result.lengthFilter.enabled).toBe(true);
    expect(result.lengthFilter.maxLength).toBe(50);
    expect(Array.isArray(result.keywordRules)).toBe(true);
  });
});

describe("nvcomment payload", () => {
  it("removes blocked comments and keeps the rest", () => {
    const engine = createFilterEngine(
      settings({
        keywordRules: [
          { id: "kw1", enabled: true, value: "ng", matchMode: MATCH_MODES.CONTAINS },
        ],
      }),
    );
    const { payload, blocked } = filterNvCommentPayload(
      {
        data: {
          threads: [
            {
              comments: [
                { id: "1", body: "hello", userId: "a" },
                { id: "2", body: "ng word", userId: "b" },
              ],
            },
          ],
        },
      },
      engine,
    );
    expect(payload.data.threads[0].comments).toHaveLength(1);
    expect(payload.data.threads[0].comments[0].id).toBe("1");
    expect(blocked).toHaveLength(1);
    expect(blocked[0].result.reason).toBe(REASONS.KEYWORD);
  });
});
