/**
 * Tests for expandHome — the small helper that turns "~/.mdp/..."
 * into an absolute path against os.homedir(). Lives in account-login.js
 * and is re-exported via module.exports.
 *
 * Uses the vitest globals (describe/it/expect) — no vitest import here,
 * so this file works under CJS via the sidecar's vitest.config.js
 * `globals: true` setting.
 */
const path = require("path");
const os = require("os");
const { expandHome } = require("./account-login");

describe("expandHome", () => {
  it("expands a leading ~/ to os.homedir()", () => {
    const out = expandHome("~/.mdp/facebook/profiles/alice");
    expect(out).toBe(path.join(os.homedir(), ".mdp/facebook/profiles/alice"));
  });

  it("expands a leading ~\\ (Windows-style) to os.homedir()", () => {
    const out = expandHome("~\\mdp\\facebook\\profiles\\alice");
    expect(out).toBe(path.join(os.homedir(), "mdp", "facebook", "profiles", "alice"));
  });

  it("expands a lone ~ to os.homedir()", () => {
    expect(expandHome("~")).toBe(os.homedir());
  });

  it("passes an absolute path through unchanged", () => {
    const abs = path.join(os.homedir(), "elsewhere");
    expect(expandHome(abs)).toBe(abs);
  });

  it("passes a relative path through unchanged", () => {
    expect(expandHome("relative/path")).toBe("relative/path");
  });

  it("returns the input unchanged when empty/null-ish", () => {
    expect(expandHome("")).toBe("");
    expect(expandHome(null)).toBe(null);
    expect(expandHome(undefined)).toBe(undefined);
  });
});
