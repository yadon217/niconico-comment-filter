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
      { commentId: "c1", userId: "u1", body: "hello" },
      { commentId: "3", userId: "u3", body: "c" },
    ]);
  });

  it("merges index entries and trims to max size", () => {
    const map = new Map([["old", "x"]]);
    mergeCommentIndex(
      map,
      [
        { commentId: "a", userId: "1", body: "a" },
        { commentId: "b", userId: "2", body: "b" },
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
    expect(resolveUserIdForRow(rowDom, new Map(), new Map())).toBe("dom-id");

    const rowIndex = {
      getAttribute(name) {
        if (name === "data-comment-id") return "cid-9";
        return null;
      },
    };
    const idMap = new Map([["cid-9", "from-api"]]);
    expect(resolveUserIdForRow(rowIndex, idMap, new Map())).toBe("from-api");

    const rowPlain = { getAttribute: () => null };
    const bodyMap = new Map([["hello", "user-body"]]);
    expect(resolveUserIdForRow(rowPlain, new Map(), bodyMap, "hello")).toBe("user-body");
  });

  it("marks ambiguous body keys and refuses to resolve them", () => {
    const bodyMap = new Map();
    mergeBodyUserIndex(bodyMap, [
      { commentId: "1", userId: "a", body: "same" },
      { commentId: "2", userId: "b", body: "same" },
    ]);
    expect(bodyMap.get("same")).toBe(BODY_USER_INDEX_AMBIGUOUS);
    expect(resolveUserIdFromBodyIndex(bodyMap, "same")).toBe("");
  });
});
