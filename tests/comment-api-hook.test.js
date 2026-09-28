import { describe, expect, it } from "vitest";
import { COMMENT_API_HOSTS } from "../src/shared/constants.js";

/** Mirrors src/content/page-hook.js isCommentApi (contract for watch comments). */
function isCommentApi(url) {
  try {
    const parsed = new URL(url, "https://www.nicovideo.jp");
    return COMMENT_API_HOSTS.includes(parsed.host) && parsed.pathname.startsWith("/v1/");
  } catch {
    return false;
  }
}

describe("comment API hook path", () => {
  it("matches nvcomment thread POST used by the watch page", () => {
    expect(isCommentApi("https://public.nvcomment.nicovideo.jp/v1/threads")).toBe(true);
    expect(isCommentApi("https://nvcomment.nicovideo.jp/v1/threads")).toBe(true);
  });

  it("does not match unrelated endpoints", () => {
    expect(isCommentApi("https://public.nvcomment.nicovideo.jp/v1/threads/123/comments")).toBe(
      true,
    );
    expect(isCommentApi("https://nvapi.nicovideo.jp/v1/comment/keys/thread")).toBe(false);
  });
});
