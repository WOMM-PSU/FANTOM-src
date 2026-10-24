import { describe, expect, it } from "vitest";
import {
  generateJoinCode,
  isValidJoinCode,
  normalizeJoinCode,
} from "./joinCode";
import { JOIN_CODE_ALPHABET } from "./constants";

describe("join codes", () => {
  it("normalizes case and separators", () => {
    expect(normalizeJoinCode("  ab-cd ")).toBe("ABCD");
  });

  it("accepts only the unambiguous alphabet", () => {
    expect(isValidJoinCode("ABCD")).toBe(true);
    expect(isValidJoinCode("AB1D")).toBe(false);
    expect(isValidJoinCode("ABOD")).toBe(false);
    expect(isValidJoinCode("ABC")).toBe(false);
  });

  it("generates four characters from the allowed alphabet", () => {
    const values = [0, 1, 2, 3];
    const code = generateJoinCode(() => values.shift() ?? 0);
    expect(code).toBe("ABCD");
    expect(code).toHaveLength(4);
    for (const character of code) {
      expect(JOIN_CODE_ALPHABET).toContain(character);
    }
  });
});
