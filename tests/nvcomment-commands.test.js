import { describe, expect, it } from "vitest";
import { traitsFromNvCommands } from "../src/shared/nvcomment-commands.js";

describe("traitsFromNvCommands", () => {
  it("defaults to white flow medium", () => {
    expect(traitsFromNvCommands([])).toEqual({
      hasNonDefaultColor: false,
      size: "medium",
      position: "naka",
    });
  });

  it("detects color size and position", () => {
    expect(traitsFromNvCommands(["red", "big", "ue"])).toEqual({
      hasNonDefaultColor: true,
      size: "big",
      position: "ue",
    });
  });

  it("treats legacy numeric and hex as non-default color", () => {
    expect(traitsFromNvCommands(["184"]).hasNonDefaultColor).toBe(true);
    expect(traitsFromNvCommands(["#ff0000"]).hasNonDefaultColor).toBe(true);
  });

  it("treats explicit white as default color", () => {
    expect(traitsFromNvCommands(["white", "big"]).hasNonDefaultColor).toBe(false);
    expect(traitsFromNvCommands(["white2"]).hasNonDefaultColor).toBe(true);
  });

  it("ignores font tokens", () => {
    expect(traitsFromNvCommands(["gothic", "mincho", "shita"])).toMatchObject({
      position: "shita",
      hasNonDefaultColor: false,
    });
  });
});
