import { describe, expect, it } from "vitest";
import {
  encodePlayerMarker,
  parsePlayerMarker,
} from "./marker";

describe("player markers", () => {
  it("round-trips a normalized join code and marker id", () => {
    const encoded = encodePlayerMarker(" ab-cd ", "a1b2c3d4e5f6");
    expect(encoded).toBe("FANTOM1:ABCD:a1b2c3d4e5f6");
    expect(parsePlayerMarker(encoded)).toEqual({
      joinCode: "ABCD",
      markerId: "a1b2c3d4e5f6",
    });
  });

  it("rejects foreign, malformed, and incomplete payloads", () => {
    expect(parsePlayerMarker("OTHER:ABCD:a1b2c3d4e5f6")).toBeNull();
    expect(parsePlayerMarker("FANTOM1:ABCD")).toBeNull();
    expect(parsePlayerMarker("FANTOM1:ABC:a1b2c3d4e5f6")).toBeNull();
    expect(parsePlayerMarker("FANTOM1:ABCD:bad id!")).toBeNull();
    expect(parsePlayerMarker("FANTOM1:ABCD:a1b2c3d4e5f6:extra")).toBeNull();
  });

  it("will not encode invalid values", () => {
    expect(() => encodePlayerMarker("ABC", "a1b2c3d4e5f6")).toThrow();
    expect(() => encodePlayerMarker("ABCD", "short")).toThrow();
  });
});
