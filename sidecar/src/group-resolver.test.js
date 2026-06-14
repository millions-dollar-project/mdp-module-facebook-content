const { parseGroupUrl, resolveGroupMeta } = require("./group-resolver");

describe("parseGroupUrl", () => {
  it("extracts the numeric ID from a canonical www URL", () => {
    expect(parseGroupUrl("https://www.facebook.com/groups/1234567890")).toEqual({
      groupId: "1234567890",
      canonicalUrl: "https://www.facebook.com/groups/1234567890/",
    });
  });

  it("accepts a trailing slash", () => {
    expect(parseGroupUrl("https://www.facebook.com/groups/1234567890/")).toEqual({
      groupId: "1234567890",
      canonicalUrl: "https://www.facebook.com/groups/1234567890/",
    });
  });

  it("accepts a permalink subpath", () => {
    const r = parseGroupUrl("https://www.facebook.com/groups/9876543210/permalink/555/");
    expect(r).not.toBeNull();
    expect(r.groupId).toBe("9876543210");
  });

  it("accepts the mobile m.facebook.com host", () => {
    const r = parseGroupUrl("https://m.facebook.com/groups/12345");
    expect(r?.groupId).toBe("12345");
  });

  it("accepts a bare host (no www)", () => {
    const r = parseGroupUrl("https://facebook.com/groups/12345/");
    expect(r?.groupId).toBe("12345");
  });

  it("trims surrounding whitespace", () => {
    const r = parseGroupUrl("   https://www.facebook.com/groups/12345   ");
    expect(r?.groupId).toBe("12345");
  });

  it("rejects a non-numeric slug (e.g. /groups/garagesale/)", () => {
    expect(parseGroupUrl("https://www.facebook.com/groups/garagesale/")).toBeNull();
  });

  it("rejects a numeric ID that is too short (<5 digits)", () => {
    expect(parseGroupUrl("https://www.facebook.com/groups/1234")).toBeNull();
  });

  it("rejects URLs that aren't a Facebook group URL", () => {
    expect(parseGroupUrl("https://www.facebook.com/somepage")).toBeNull();
    expect(parseGroupUrl("https://www.facebook.com/")).toBeNull();
    expect(parseGroupUrl("https://example.com/groups/12345")).toBeNull();
    expect(parseGroupUrl("not a url at all")).toBeNull();
  });

  it("rejects empty / null / non-string input", () => {
    expect(parseGroupUrl("")).toBeNull();
    expect(parseGroupUrl("   ")).toBeNull();
    expect(parseGroupUrl(null)).toBeNull();
    expect(parseGroupUrl(undefined)).toBeNull();
    expect(parseGroupUrl(12345)).toBeNull();
  });
});

describe("resolveGroupMeta", () => {
  it("returns an error envelope for unparseable input", async () => {
    const out = await resolveGroupMeta("https://example.com/groups/12345");
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/URL không đúng định dạng/);
    expect(out.groupId).toBeUndefined();
  });

  it("returns the numeric ID even when the page fetch fails", async () => {
    // We can't actually launch Chromium in CI without playwright
    // browsers installed, so fetchGroupNameFromPage will return null
    // and resolveGroupMeta should still hand back a valid ID.
    const out = await resolveGroupMeta("https://www.facebook.com/groups/1234567890");
    expect(out.ok).toBe(true);
    expect(out.groupId).toBe("1234567890");
    expect(out.canonicalUrl).toBe("https://www.facebook.com/groups/1234567890/");
    // name is best-effort — null when the browser isn't available
    expect(out.name === null || typeof out.name === "string").toBe(true);
  });
});
