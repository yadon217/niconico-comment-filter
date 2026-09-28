import { describe, expect, it } from "vitest";
import {
  BODY_USER_INDEX_AMBIGUOUS,
  collectCommentIndexEntries,
  mergeBodyUserIndex,
  mergeCommentIndex,
  resolveUserIdForRow,
  resolveUserIdFromBodyIndex,
} from "../src/shared/comment-user-index.js";

describe("comment-user-index", () => {
  it("collects commentId, userId, and body from nvcomment payload", () => {
    const entries = collectCommentIndexEntries({
      data: {
        threads: [
          {
            comments: [
              { id: "c1", body: "hello", userId: "u1" },
              { id: "c2", body: "b" },
              { id: 3, body: "c", userId: "u3" },
            ],
          },
        ],
      },
    });
    expect(entries).toEqual([
      { commentId: "c1", userId: "u1", body: "hello", listIndex: "0" },
      { commentId: "3", userId: "u3", body: "c", listIndex: "2" },
    ]);
  });

  it("merges index entries and trims to max size", () => {
    const map = new Map([["old", "x"]]);
    mergeCommentIndex(
      map,
      [
        { commentId: "a", userId: "1", body: "a", listIndex: "0" },
        { commentId: "b", userId: "2", body: "b", listIndex: "1" },
      ],
      2,
    );
    expect(map.size).toBe(2);
    expect(map.get("b")).toBe("2");
  });

  it("resolves userId from DOM, commentId index, or body index", () => {
    const rowDom = {
      getAttribute(name) {
        if (name === "data-user-id") return "dom-id";
        return null;
      },
    };
    expect(resolveUserIdForRow(rowDom, new Map(), new Map(), undefined, new Map())).toBe("dom-id");

    const rowIndex = {
      getAttribute(name) {
        if (name === "data-comment-id") return "cid-9";
        return null;
      },
    };
    const idMap = new Map([["cid-9", "from-api"]]);
    expect(resolveUserIdForRow(rowIndex, idMap, new Map(), undefined, new Map())).toBe(
      "from-api",
    );

    const rowPlain = { getAttribute: () => null };
    const bodyMap = new Map([["hello", "user-body"]]);
    expect(resolveUserIdForRow(rowPlain, new Map(), bodyMap, "hello", new Map())).toBe(
      "user-body",
    );

    const rowList = {
      getAttribute(name) {
        if (name === "data-index") return "2";
        return null;
      },
    };
    const listMap = new Map([["2", "user-at-2"]]);
    expect(resolveUserIdForRow(rowList, new Map(), new Map(), "w", listMap)).toBe("user-at-2");
  });

  it("marks ambiguous body keys and refuses to resolve them", () => {
    const bodyMap = new Map();
    mergeBodyUserIndex(bodyMap, [
      { commentId: "1", userId: "a", body: "same", listIndex: "0" },
      { commentId: "2", userId: "b", body: "same", listIndex: "1" },
    ]);
    expect(bodyMap.get("same")).toBe(BODY_USER_INDEX_AMBIGUOUS);
    expect(resolveUserIdFromBodyIndex(bodyMap, "same")).toBe("");
  });
});
