import { describe, expect, it } from "vitest";
import { normalizeDisplayName } from "./sanitize";
import { MAX_DISPLAY_NAME_LENGTH } from "./constants";

describe("normalizeDisplayName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeDisplayName("  Nova   Prime  ")).toBe("Nova Prime");
  });

  it("removes control and bidi characters", () => {
    expect(normalizeDisplayName("Nova\u0000Prime")).toBe("Nova Prime");
    expect(normalizeDisplayName("Nova\u202EPrime")).toBe("Nova Prime");
  });

  it("truncates by code points without splitting emoji", () => {
    const name = normalizeDisplayName("🚀".repeat(30));
    expect(Array.from(name)).toHaveLength(MAX_DISPLAY_NAME_LENGTH);
    expect(name).toBe("🚀".repeat(MAX_DISPLAY_NAME_LENGTH));
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeDisplayName("   \u0000  ")).toBe("");
  });
});
