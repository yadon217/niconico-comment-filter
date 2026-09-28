import { describe, expect, it } from "vitest";
import { evaluateStyleFilter } from "../src/shared/comment-style.js";
import { COMBINATORS } from "../src/shared/constants.js";

const traits = {
  colored: { hasNonDefaultColor: true, size: "medium", position: "naka" },
  bigFlow: { hasNonDefaultColor: false, size: "big", position: "naka" },
  topPlain: { hasNonDefaultColor: false, size: "medium", position: "ue" },
};

describe("evaluateStyleFilter", () => {
  it("is off when disabled", () => {
    const result = evaluateStyleFilter(traits.colored, {
      enabled: false,
      combinator: COMBINATORS.OR,
      rules: [
        {
          id: "r1",
          enabled: true,
          combinator: COMBINATORS.OR,
          conditions: [{ kind: "color", mode: "non_default" }],
        },
      ],
    });
    expect(result.blocked).toBe(false);
  });

  it("blocks on OR within a rule", () => {
    const result = evaluateStyleFilter(traits.topPlain, {
      enabled: true,
      combinator: COMBINATORS.OR,
      rules: [
        {
          id: "r1",
          enabled: true,
          combinator: COMBINATORS.OR,
          conditions: [
            { kind: "color", mode: "non_default" },
            { kind: "position", value: "ue" },
          ],
        },
      ],
    });
    expect(result.blocked).toBe(true);
  });

  it("blocks on AND only when all conditions match", () => {
    const filter = {
      enabled: true,
      combinator: COMBINATORS.OR,
      rules: [
        {
          id: "r1",
          enabled: true,
          combinator: COMBINATORS.AND,
          conditions: [
            { kind: "color", mode: "non_default" },
            { kind: "size", value: "big" },
          ],
        },
      ],
    };
    expect(evaluateStyleFilter(traits.colored, filter).blocked).toBe(false);
    expect(
      evaluateStyleFilter(
        { hasNonDefaultColor: true, size: "big", position: "naka" },
        filter,
      ).blocked,
    ).toBe(true);
  });
});
