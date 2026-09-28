import { describe, expect, it } from "vitest";
import {
  collectCommentIndexEntries,
  mergeCommentIndex,
  resolveUserIdForRow,
} from "../src/shared/comment-user-index.js";

describe("comment-user-index", () => {
  it("collects commentId and userId from nvcomment payload", () => {
    const entries = collectCommentIndexEntries({
      data: {
        threads: [
          {
            comments: [
              { id: "c1", body: "a", userId: "u1" },
              { id: "c2", body: "b" },
              { id: 3, body: "c", userId: "u3" },
            ],
          },
        ],
      },
    });
    expect(entries).toEqual([
      { commentId: "c1", userId: "u1" },
      { commentId: "3", userId: "u3" },
    ]);
  });

  it("merges index entries and trims to max size", () => {
    const map = new Map([["old", "x"]]);
    mergeCommentIndex(
      map,
      [
        { commentId: "a", userId: "1" },
        { commentId: "b", userId: "2" },
      ],
      2,
    );
    expect(map.size).toBe(2);
    expect(map.get("b")).toBe("2");
  });

  it("resolves userId from DOM or index map", () => {
    const rowDom = {
      getAttribute(name) {
        if (name === "data-user-id") return "dom-id";
        return null;
      },
    };
    expect(resolveUserIdForRow(rowDom, new Map())).toBe("dom-id");

    const rowIndex = {
      getAttribute(name) {
        if (name === "data-comment-id") return "cid-9";
        return null;
      },
    };
    const index = new Map([["cid-9", "from-api"]]);
    expect(resolveUserIdForRow(rowIndex, index)).toBe("from-api");
  });
});
